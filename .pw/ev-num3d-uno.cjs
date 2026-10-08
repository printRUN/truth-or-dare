/* ev-num3d-uno.cjs —— 数字实体化轮 U1/U2 取证（端口 9045，2026-10-08）
   U1 座位名牌 Sprite → 有厚度 plaque（纹理 sig 拆键 name|count|south，turn 单独键只管环；
   报单警示态 UNO! 行 + 边沿 pop）；U2 牌库余量铭牌（×N 精读层）。
   断言只认 __uno.seatPlaques()/seatFx() 访问器（labels 旧形状保持=ev-uno-seats 回归锁）。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 9045;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 140)));
  await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
  await p.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&loperf=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
  await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION', null, { timeout: 25000 });

  console.log('— U1 座位铭牌 plaque 化 —');
  const gl = await p.evaluate(() => __uno.state.gl);
  ok(gl === true, 'GL 场景激活');
  const sp = await p.evaluate(() => __uno.seatPlaques());
  ok(sp && sp.count === 1, `座位铭牌已建 ${sp && sp.count} 块（2p=对手 1 块，自己不建）`);
  const fx = await p.evaluate(() => __uno.seatFx());
  ok(fx && fx.labels.length === 1, `旧 seatFx().labels 形状保持（${fx.labels.length}，ev-uno-seats 回归锁）`);
  ok(sp && sp.sig.split(':').length >= 2 && !/\d:$/.test(sp.sig.split('|')[0] || ''), `sig 已拆键（无 turn 项：${sp.sig}）`);

  console.log('— U2 牌库余量铭牌 —');
  const d1 = await p.evaluate(() => ({ sig: __uno.seatPlaques().deck.sig, n: __uno.state.deck.length }));
  ok(d1.sig === String(d1.n), `牌库铭牌 sig=余量（${d1.sig} vs ${d1.n}）`);
  await p.evaluate(() => { __uno.state.deck.pop(); updateHUD(); });   // 摸一张路径的状态侧（updateHUD→refreshSeatFx→sig 重绘）
  await p.waitForTimeout(150);
  const d2 = await p.evaluate(() => ({ sig: __uno.seatPlaques().deck.sig, n: __uno.state.deck.length }));
  ok(d2.sig === String(d2.n) && d2.n === d1.n - 1, `摸牌后铭牌跟随（${d1.sig}→${d2.sig}）`);

  console.log('— 报单警示态（UNO! 行 + 边沿） —');
  await p.evaluate(() => { __uno.forceHand(1, [cd('g', '2')]); updateHUD(); });   // 对手（bot，1 座）压到 1 张
  let warnOk = true;
  try { await p.waitForFunction(() => __uno.seatPlaques().warn >= 1, null, { timeout: 6000 }); } catch (e) { warnOk = false; }
  const sp2 = await p.evaluate(() => __uno.seatPlaques());
  ok(warnOk && sp2.warn >= 1, `报单警示铭牌就位（warn=${sp2.warn}）`);
  await p.evaluate(() => __uno.forceRender());
  await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-uno.png') });

  console.log('— 环亮度 turn 键原位更新（sig 不重建） —');
  const sigBefore = await p.evaluate(() => __uno.seatPlaques().sig);
  await p.evaluate(() => { __uno.state.turn = 1; updateHUD(); });
  await p.waitForTimeout(150);
  const turnState = await p.evaluate(() => ({ sig: __uno.seatPlaques().sig, turnSig: __uno.seatPlaques().turnSig, rings: __uno.seatFx().rings.map(r => r.op) }));
  ok(turnState.sig === sigBefore, 'turn 翻转不触发纹理 sig 重建（§5-7 拆键）');
  ok(turnState.turnSig === '1' && turnState.rings.some(o => o > 0.5), `环亮度随 turn 原位更新（${JSON.stringify(turnState.rings)}）`);
  ok(errs.length === 0, `零 pageerror（${errs.length}）${errs[0] || ''}`);

  await ctx.close();
  await browser.close();
  server.close();
  console.log(`═══ ev-num3d-uno：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('PROBE CRASH:', e.message || e); process.exit(2); });
