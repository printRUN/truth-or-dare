// probe-uno-net.cjs — UNO 联机 v1 冒烟：双标签本地链路（BroadcastChannel），host+join 对局同步
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8913;
const ROOT = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const url = (q) => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=51515&q=${encodeURIComponent(q)}`;
  const errs = [];
  const watch = (pg, tag) => pg.on('pageerror', e => errs.push(tag + ':' + e.message));

  // A. 大厅：host 建房，join 加入，名单同步
  const host = await ctx.newPage(); watch(host, 'host');
  await host.goto(url('h') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  const join = await ctx.newPage(); watch(join, 'join');
  await join.goto(url('j') + '&role=join&name=小蓝', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 10000 });
  ok(true, '大厅：双方进房，名单同步');

  // B. host 开局 → join 收到快照，手牌 7 张，HUD 出现
  await host.evaluate(() => window.__uno.net().start({}));
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 2, null, { timeout: 10000 });
  const j1 = await join.evaluate(() => ({ phase: window.__uno.state.phase, hands: window.__uno.state.players.map(p => p.hand.length), discard: window.__uno.state.discard.length }));
  ok(j1.hands.every(n => n === 7), `join 收到开局快照（手牌 ${JSON.stringify(j1.hands)}）`);
  ok(j1.discard >= 1, `首翻牌已置 ${j1.discard}`);

  // C. 对局推进：当前回合的真人自己行动（出能出的牌/摸牌过），等快照同步
  let plays = 0;
  for (let round = 0; round < 8 && plays < 3; round++) {
    for (const pg of [host, join]) {
      const mine = await pg.evaluate(() => {
        const n = window.__uno.net(); const G = window.__uno.state;
        return n.joined && n.doc.started && !G.players[G.turn].bot && G.phase === 'AWAIT_ACTION' && n.doc.players[G.turn].id === n.myId;
      });
      if (!mine) continue;
      plays++;
      const act = await pg.evaluate(() => {
        const G = window.__uno.state;
        const hand = G.players[G.turn].hand;
        for (let k = 0; k < hand.length; k++) {
          const cd = hand[k];
          if (cd.c === G.cur && /^[0-9]$/.test(cd.v)) { window.__uno.play(k); return 'play'; }
          if (cd.c === 'w' && !/W4/.test(cd.v)) { window.__uno.play(k); window.__uno.chooseColor('r'); return 'play'; }
        }
        window.__uno.draw();
        return 'draw';
      });
      await pg.waitForTimeout(1500);
      // 若停在选色/摸留弹窗，收掉
      await pg.evaluate(() => {
        const m = document.getElementById('wild-modal');
        if (m && !m.hidden) { const b = m.querySelector('.wbtn'); b && b.click(); }
        const g = document.getElementById('gen-modal');
        if (g && !g.hidden) { const keep = [...g.querySelectorAll('button')].pop(); keep && keep.click(); }
      });
      await pg.waitForTimeout(600);
    }
  }
  // C2. 状态一致性（等 transient 相位 RESOLVE/ANIMATING 结束后再取样）
  const stable = async pg => pg.waitForFunction(() => !['RESOLVE', 'ANIMATING'].includes(window.__uno.state.phase), null, { timeout: 8000 }).then(() => true).catch(() => false);
  await stable(host); await stable(join);
  const snaps = await Promise.all([host, join].map(pg => pg.evaluate(() => {
    const G = window.__uno.state; const n = window.__uno.net();
    return { phase: G.phase, turn: G.turn, dir: G.dir, cur: G.cur, handN: G.players.map(p => p.hand.length), discard: G.discard.length, seq: n.doc.seq };
  })));
  ok(snaps[0].turn === snaps[1].turn && snaps[0].phase === snaps[1].phase, `两端回合一致 turn=${snaps[0].turn} phase=${snaps[0].phase}（打了 ${plays} 手）`);
  ok(JSON.stringify(snaps[0].handN) === JSON.stringify(snaps[1].handN), `两端手牌数一致 ${JSON.stringify(snaps[0].handN)}`);
  ok(snaps[0].discard === snaps[1].discard && snaps[0].cur === snaps[1].cur, `弃牌堆/当前色一致 ${snaps[0].discard} ${snaps[0].cur}`);

  // D. 掉线灰显：拨老 lastSeen → 触发 renderNetUI → HUD pchip 真实出现 off
  await host.evaluate(() => { const n = window.__uno.net(); n.doc.players[1].lastSeen = Date.now() - 120000; n.ui(); });
  const offCount = await host.evaluate(() => document.querySelectorAll('.pchip.off').length);
  ok(offCount >= 1, `掉线灰显上屏（${offCount} 个 pchip.off）`);

  ok(errs.length === 0, `无页面异常 ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
  server.close();
  console.log(`\nprobe-uno-net: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
