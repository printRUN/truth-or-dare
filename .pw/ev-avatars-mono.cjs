// ev-avatars-mono.cjs — 大富翁头像 3D 化取证（SPEC §1.12，端口 9061）：
// NETMODE 双端（dcb 真头像）+ 热座档（程序化 fallback 脸）+ billboard yaw + 纹理跨重建存活
// 断言纪律：几何/状态断言为准（软渲禁像素断言），截图仅证据附件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9061;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = a => Math.atan2(Math.sin(a), Math.cos(a));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const watch = (pg, tag) => pg.on('pageerror', e => errs.push(tag + ':' + e.message));

  // ── A. NETMODE 双端：双方各有 dcb 定制头像（表单选择 → 房间文档 → 3D 脸贴片/名牌 全链路）──
  // 同 context 共享 localStorage：头像注入必须 page 级 addInitScript 且时序错开（host 先 join 落定，join 后写自己键值）
  const AV_HOST = 'dcb:{"s":"adventurer","d":"avaprobeA","b":"f7eeda"}';
  const AV_JOIN = 'dcb:{"s":"pixel-art","d":"avaprobeB","b":"dee9f3"}';
  const url = q => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=${q.room}&q=${q.tag}`;
  const host = await ctx.newPage(); watch(host, 'host');
  await host.addInitScript(av => { try { localStorage.setItem('mono:avatar', av); } catch (e) {} }, AV_HOST);
  await host.goto(url({ room: '73001', tag: 'host' }) + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  const join = await ctx.newPage(); watch(join, 'join');
  await join.addInitScript(av => { try { localStorage.setItem('mono:avatar', av); } catch (e) {} }, AV_JOIN);
  await join.goto(url({ room: '73001', tag: 'join' }) + '&role=join&name=头像员', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  await host.waitForFunction(() => window.__mono.net().doc.players.length === 2, null, { timeout: 10000 });

  // host 开局（双真人）；两端各自 buildPawns + syncPawnFaces
  await host.evaluate(() => window.__mono.net().start({}));
  await host.waitForFunction(() => window.__mono.net().doc.started && window.__mono.state.players.length === 2, null, { timeout: 15000 });
  await join.waitForFunction(() => window.__mono.net().doc.started && window.__mono.state.players.length === 2, null, { timeout: 15000 });
  await host.waitForFunction(() => window.__mono.faces().every(f => f && f.loaded && !f.fb && f.hasMap), null, { timeout: 15000 });
  await join.waitForFunction(() => window.__mono.faces().every(f => f && f.loaded && !f.fb && f.hasMap), null, { timeout: 15000 });

  const fH = await host.evaluate(() => window.__mono.faces());
  ok(fH.length === 2 && fH.every(f => f.loaded && !f.fb && f.hasMap), `host 端双棋子真头像到位（loaded&&!fb&&hasMap：${JSON.stringify(fH.map(f => [f.key.split('|')[0], f.loaded]))}）`);
  ok(fH.every(f => /^\d\|data:image\/svg/.test(f.key)), `faceKey=色座|解析后URI（${fH.map(f => f.key.slice(0, 16) + '…').join(',')}）`);
  const docH = await host.evaluate(() => window.__mono.net().doc.players.map(p => p.av));
  ok(docH[0] === AV_HOST && docH[1] === AV_JOIN, '房间文档携带双方 av（表单选择原样广播）');

  // billboard yaw：脸朝相机（期望值=atan2(cam−pawn) 现算，idle 环绕下它是移动目标，两帧各验一次）
  for (let t = 0; t < 2; t++) {
    await sleep(700);
    const chk = await host.evaluate(() => {
      const cam = window.__mono.camPos(), world = window.__mono.pawnWorld(), faces = window.__mono.faces();
      return faces.map((f, i) => {
        const exp = Math.atan2(cam[0] - world[i][0], cam[2] - world[i][2]);
        return { d: Math.abs(Math.atan2(Math.sin(f.yaw - exp), Math.cos(f.yaw - exp))) };
      });
    });
    chk.forEach((c, i) => ok(c.d < 0.02, `host yaw${i} 朝相机（帧${t + 1} 偏差 ${(c.d * 57.3).toFixed(2)}°<1.15°）`));
  }

  // 名牌头像独立实例重绘（'!ok'=已用 decode 图重绘；名牌重建 dispose 不杀缓存——共享纹理即死）
  await host.waitForFunction(() => window.__mono.platesAva().every(k => typeof k === 'string' && k.endsWith('!ok')), null, { timeout: 10000 });
  ok(true, 'host 端名牌头像已用真图重绘（avaKey 带 !ok）');

  // 纹理跨重建存活：buildPawns 全量重建后 faces() 仍全员有图（独占所有权守卫）
  await host.evaluate(() => window.__mono.remapPawns());
  const fR = await host.evaluate(() => window.__mono.faces());
  ok(fR.every(f => f && f.loaded && f.hasMap), 'remapPawns 重建后全员头像存活（缓存未被打爆）');

  // 截图证据（全景）：先挪两子到同屏可读格
  await host.evaluate(() => { window.__mono.forcePos(0, 12); window.__mono.forcePos(1, 14); });
  await sleep(1200);
  await host.screenshot({ path: path.join(SHOTS, 'ava-mono-net-overview.png') });
  ok(true, '截图 ava-mono-net-overview.png');

  // 观战端同步：join 端也是真头像（两端独立管线各挂一次）
  const fJ = await join.evaluate(() => window.__mono.faces());
  ok(fJ.every(f => f && f.loaded && !f.fb && f.hasMap), 'join 端双棋子真头像到位（双端独立接线）');
  await join.screenshot({ path: path.join(SHOTS, 'ava-mono-net-join.png') });

  // ── B. 热座档：无 av → 程序化 fallback 脸（确定性绘制；全桌统一有脸）──
  const hs = await ctx.newPage(); watch(hs, 'hotseat');
  await hs.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&q=hs`, { waitUntil: 'domcontentloaded' });
  await hs.waitForFunction(() => window.__mono && window.__mono.faces().length === 2 && window.__mono.faces().every(f => f && f.fb && f.hasMap && f.loaded), null, { timeout: 15000 });
  const fHS = await hs.evaluate(() => window.__mono.faces());
  ok(fHS.every(f => f.fb && /^fb:\d$/.test(f.key)), `热座双棋子程序化脸（key=${fHS.map(f => f.key).join(',')}）`);
  await hs.evaluate(() => { window.__mono.forcePos(0, 12); window.__mono.forcePos(1, 14); });
  await sleep(1200);
  await hs.screenshot({ path: path.join(SHOTS, 'ava-mono-hotseat.png') });

  // 零 pageerror
  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 3).join(' | ') || 'clean'}）`);

  await browser.close();
  server.close();
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
