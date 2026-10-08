// ev-avatars-uno.cjs — UNO 座位 3D 头像半身像取证（SPEC §1.12，端口 9063）：
// NETMODE 双端（dcb 真头像 bust）+ 热座档（fb 程序化脸）+ south 不建 + 基座 y=0.20/径向 ×1.28 几何
// 断言纪律：几何/状态断言为准（软渲禁像素断言），截图仅证据附件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9063;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const watch = (pg, tag) => pg.on('pageerror', e => errs.push(tag + ':' + e.message));

  // ── A. NETMODE 双端：对手 bust 挂真头像，自己（south）不建 ──
  await ctx.addInitScript(() => { try { localStorage.setItem('uno:avatar', 'dcb:{"s":"adventurer","d":"avaprobeU","b":"e3ece7"}'); } catch (e) {} });
  const url = q => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=73003&q=${q}`;
  const host = await ctx.newPage(); watch(host, 'host');
  await host.goto(url('h') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  const join = await ctx.newPage(); watch(join, 'join');
  await join.goto(url('j') + '&role=join&name=头像员', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 10000 });
  await host.evaluate(() => window.__uno.net().start({}));
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 2, null, { timeout: 10000 });

  await host.waitForFunction(() => { const a = window.__uno.avatars(); return a.seats.length === 1 && a.seats[0].loaded && !a.seats[0].fb && a.seats[0].hasMap; }, null, { timeout: 15000 });
  await join.waitForFunction(() => { const a = window.__uno.avatars(); return a.seats.length === 1 && a.seats[0].loaded && !a.seats[0].fb && a.seats[0].hasMap; }, null, { timeout: 15000 });

  const aH = await host.evaluate(() => ({ av: window.__uno.avatars(), south: window.__uno.state.players.length, mySeatDoc: window.__uno.net().doc.players.map(p => p.av) }));
  ok(String(aH.mySeatDoc[0]).startsWith('dcb:') && String(aH.mySeatDoc[1]).startsWith('dcb:'), `房间文档 av 广播且均为定制配方（${aH.mySeatDoc.map(a => String(a).slice(0, 9)).join(',')}）`);
  ok(aH.av.seats.length === 1, `host 端 1 座 bust（south=自己不建）`);
  ok(aH.av.seats[0].loaded && !aH.av.seats[0].fb && aH.av.seats[0].hasMap, 'host 视角对手 bust=真头像（loaded&&!fb&&hasMap）');
  ok(aH.av.seats[0].y === 0.2, `bust 基座钉桌面真实顶面 y=0.20（got ${aH.av.seats[0].y}）`);
  ok(Math.abs(Math.hypot(aH.av.seats[0].x, aH.av.seats[0].z) - 2.6 * 1.28) < 0.01, `径向 seatPos×1.28（r=${Math.hypot(aH.av.seats[0].x, aH.av.seats[0].z).toFixed(2)}≈3.33）`);
  const aJ = await join.evaluate(() => window.__uno.avatars());
  ok(aJ.seats.length === 1 && aJ.seats[0].loaded && !aJ.seats[0].fb, 'join 端对手 bust 同样真头像（自我中心：各自只建对面）');
  ok(Math.abs(aJ.seats[0].z + 3.33) < 0.01, 'join 视角 bust 落北弧对手座（seatPos 语义：对手恒北弧 z=-2.6×1.28）');
  await host.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());   // AUTOTEST+bodyLo 冻连续渲染：截图前手动渲一帧防陈旧帧（终审 P1-2）
  await host.screenshot({ path: path.join(SHOTS, 'ava-uno-net-host.png') });
  await join.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
  await join.screenshot({ path: path.join(SHOTS, 'ava-uno-net-join.png') });

  // ── B. 热座档：无 av → fb 程序化脸 bust ──
  const hs = await ctx.newPage(); watch(hs, 'hotseat');
  await hs.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&q=hs`, { waitUntil: 'domcontentloaded' });
  await hs.waitForFunction(() => { const a = window.__uno.avatars(); return a.seats.length === 1 && a.seats[0].fb && a.seats[0].hasMap && a.seats[0].loaded; }, null, { timeout: 15000 });
  const aHS = await hs.evaluate(() => window.__uno.avatars());
  ok(aHS.seats[0].fb && /^fb:\d$/.test(aHS.seats[0].key), `热座对手 bust=程序化脸（key=${aHS.seats[0].key}）`);
  await hs.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
  await hs.screenshot({ path: path.join(SHOTS, 'ava-uno-hotseat.png') });

  // ── C. 换局重建存活：forceHand 触发 updateHUD（sig 不变不重建，纹理缓存条目原样）──
  await hs.evaluate(() => window.__uno.forceHand(0, [{ c: 'r', v: '5' }, { c: 'b', v: '3' }]));
  await hs.waitForFunction(() => document.querySelectorAll('#players-bar .pchip').length === 2, null, { timeout: 8000 });
  const aHS2 = await hs.evaluate(() => window.__uno.avatars());
  ok(aHS2.seats.length === 1 && aHS2.seats[0].hasMap, 'updateHUD 幂等后 bust 仍在（sig 无变化零重建）');

  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 3).join(' | ') || 'clean'}）`);

  await browser.close();
  server.close();
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
