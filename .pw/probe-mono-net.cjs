// probe-mono-net.cjs — 大富翁联机 v1 冒烟：双标签本地链路（BroadcastChannel），host+join 对局同步
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8911;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const url = (q) => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=42424&q=${encodeURIComponent(q)}`;
  const url2 = (q) => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=42426&q=${encodeURIComponent(q)}`;   // C-F 段独立房号：A 段对局的检查点与成员表不许串场
  const host = await ctx.newPage();
  const join = await ctx.newPage();
  const errs = [];
  host.on('pageerror', e => errs.push('host:' + e.message));
  join.on('pageerror', e => errs.push('join:' + e.message));

  // A. 房主建房 + 自动开局（带机器人）
  await host.goto(url('host') + '&role=host&autostart=1', { waitUntil: 'domcontentloaded' });
  // A0. 组件 UI：默认联机表单（定制器/昵称/创建/加入）+ 高级选项收起（热座）
  await host.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 8000 });
  const ui0 = await host.evaluate(() => ({
    chips: document.querySelectorAll('.pn-cz-chip').length,
    localDice: !!window.DiceBearLocal,
    firstChipLocal: (document.querySelector('.pn-cz-chip img') || {}).src || '',
    tabs: document.querySelectorAll('.pn-avtab').length,
    customSel: document.querySelector('.pn-avtab-custom').getAttribute('aria-selected'),
    formVisible: !document.querySelector('.pn-form').hidden,
    advClosed: !document.getElementById('adv-box').open,
    localBtn: document.getElementById('btn-start').textContent,
  }));
  ok(ui0.chips === 31 && ui0.formVisible, `默认落地联机表单（31 风格 chip ${ui0.chips} 个）`);
  ok(ui0.localDice && ui0.firstChipLocal.startsWith('data:image/svg'), '头像本机生成（dicebear-local.js 加载，chip 首图为 data:svg）');
  ok(ui0.tabs === 2 && ui0.customSel === 'true', '两标签表单默认落「🎨 定制」');
  ok(ui0.advClosed && ui0.localBtn.includes('本地热座'), `本地热座收进高级选项（"${ui0.localBtn}"）`);
  await host.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  const h1 = await host.evaluate(() => window.__mono.net());
  ok(h1.mode && h1.joined && h1.room === '42424', `房主建房 room=${h1.room}`);
  ok(String(h1.doc.players[0].av).startsWith('dcb:'), '入房头像为定制配方（dcb:）');
  ok(h1.doc.players.length >= 1 && h1.doc.players.length <= 2, `文档玩家 ${h1.doc.players.length} 人（autostart 注入 bot 存在时序）`);
  await host.waitForFunction(() => window.__mono.net().doc.started && window.__mono.state.players.length === 2, null, { timeout: 15000 });
  console.log('  · host 已开局（host+bot 两座）');

  // B. 加入者：中途进房（已开局 → 应被拒）
  await join.goto(url('join') + '&role=join', { waitUntil: 'domcontentloaded' });
  await join.waitForTimeout(2500);
  const j1 = await join.evaluate(() => (window.__mono && window.__mono.net) ? window.__mono.net() : null);
  ok(j1 && !j1.joined, '已开局房间拒绝中途加入');

  // C. 未开局房间：加入 → 大厅同步 → host 看到两人
  const join2 = await ctx.newPage();
  join2.on('pageerror', e => errs.push('join2:' + e.message));
  const host2 = await ctx.newPage();
  host2.on('pageerror', e => errs.push('host2:' + e.message));
  await host2.goto(url2('h2') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host2.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  await join2.goto(url2('j2') + '&role=join&name=小绿', { waitUntil: 'domcontentloaded' });
  await join2.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  await host2.waitForFunction(() => window.__mono.net().doc.players.length === 2, null, { timeout: 10000 });
  const lobbyNames = await join2.evaluate(() => window.__mono.net().doc.players.map(p => p.name));
  ok(lobbyNames.length === 2 && lobbyNames.includes('小绿'), `大厅名单同步 ${JSON.stringify(lobbyNames)}`);

  // D. host 开局 → join2 收到快照，棋盘渲染，HUD 出现
  await host2.evaluate(() => window.__mono.net().start({ roundLimit: 15 }));
  await join2.waitForFunction(() => window.__mono.state.phase !== 'BOOT' && window.__mono.state.players.length === 2, null, { timeout: 10000 });
  const j2 = await join2.evaluate(() => ({ phase: window.__mono.state.phase, players: window.__mono.state.players.length, gl: window.__mono.sceneInfo().gl, pawns: window.__mono.sceneInfo().pawns }));
  ok(j2.players === 2, `join2 收到开局快照（${j2.players} 座）`);
  ok(!j2.gl || j2.pawns === 2, `join2 棋子已摆（gl=${j2.gl}, pawns=${j2.pawns}）`);

  // E. 对局推进：两真人热座轮替（本地 skipHandoff=true），join2 的回合由 join2 自己走
  //    host 座位0：若是真人 → host 掷骰；等快照回 join2
  const waitPhase = (pg, ph, t = 20000) => pg.waitForFunction(p => window.__mono.state.phase === p, ph, { timeout: t }).catch(() => null);
  for (let round = 0; round < 4; round++) {
    for (const pg of [host2, join2]) {
      const mine = await pg.evaluate(() => {
        const n = window.__mono.net();
        const G = window.__mono.state;
        return n.joined && n.doc.started && !G.players[G.turn].bot && G.phase === 'AWAIT_ROLL' && n.doc.players[G.turn].id === n.myId;
      });
      if (mine) {
        await pg.evaluate(() => window.__mono.step());
        await waitPhase(pg, 'RESOLVE', 8000);
      }
      // 等这一座推进完（turn 变化或 OVER）
      await pg.waitForTimeout(600);
    }
    const st = await host2.evaluate(() => ({ phase: window.__mono.state.phase, turn: window.__mono.state.turn, over: window.__mono.state.phase === 'OVER' }));
    if (st.over) break;
  }
  const snaps = await Promise.all([host2, join2].map(pg => pg.evaluate(() => {
    const G = window.__mono.state;
    return { phase: G.phase, turn: G.turn, owners: G.owners.join(''), cash: G.players.map(p => p.cash) };
  })));
  ok(snaps[0].turn === snaps[1].turn && snaps[0].phase === snaps[1].phase, `两端状态一致 turn=${snaps[0].turn} phase=${snaps[0].phase}`);
  ok(JSON.stringify(snaps[0].cash) === JSON.stringify(snaps[1].cash), `两端现金一致 ${JSON.stringify(snaps[0].cash)}`);
  ok(snaps[0].owners === snaps[1].owners, '两端地产归属一致');

  // F. 掉线灰显：把 join2 lastSeen 拨老 → 主动触发 renderNetUI → HUD 玩家条真实出现 off 灰显
  await host2.evaluate(() => {
    const n = window.__mono.net();
    n.doc.players[1].lastSeen = Date.now() - 120000;
    n.ui();
  });
  const offCount = await host2.evaluate(() => document.querySelectorAll('.pchip.off').length);
  ok(offCount >= 1, `掉线灰显上屏（${offCount} 个 pchip.off）`);
  // 心跳巡检是 5s 周期：轮询等处置落地，别在下一拍前抢跑断言
  const afterGone = await host2.waitForFunction(() => {
    const n = window.__mono.net();
    return { seats: n.doc.players.length, gameSeats: window.__mono.state.players.length, done: n.doc.players.length === 2 && window.__mono.state.players.length === 2 };
  }, null, { timeout: 12000, polling: 500 }).then(h => h.jsonValue()).catch(() => ({ seats: -1, gameSeats: -1 }));
  ok(afterGone.seats === 2 && afterGone.gameSeats === 2, `开局后座位不删（房间 ${afterGone.seats} 人，棋局 ${afterGone.gameSeats} 座）`);

  ok(errs.length === 0, `无页面异常 ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
  server.close();
  console.log(`\nprobe-mono-net: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
