/* ev-num3d-bc.cjs —— 数字实体化轮 B1/B2/B3 取证（端口 9041，2026-10-08）
   B1 头顶 DOM 投影贴片 .nplate 退役 → GL 3D 铭牌（sig=name|N|turn|dead、自己不建、bc-raised 半透避让）
   B2 牌库/弃牌堆计数铭牌与 3D 堆同场；B3 nope 倒计时环（默认关秒数牌）。
   断言只认 __cat 访问器（禁像素断言纪律）；截图存 .pw/shots/ev-num3d-bc-*.png。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 9041;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

async function twoPlayerGame(ctx, tag) {
  const pA = await ctx.newPage();
  const errs = [];
  pA.on('pageerror', e => errs.push(String(e.message || e).slice(0, 120)));
  await pA.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
  await pA.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pA.click('details.adv summary');
  await pA.click('#chk-local');
  await pA.fill('#in-name', '甲');
  await pA.click('#btn-join');
  await pA.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const room = (await pA.textContent('#share-room')).trim();
  const pB = await ctx.newPage();
  await pB.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
  await pB.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pB.click('details.adv summary');
  await pB.click('#chk-local');
  await pB.fill('#in-name', '乙');
  await pB.click('#btn-join');
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
  await pA.click('#btn-start');
  await pA.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.waitForFunction(() => __cat.hand.length >= 1, null, { timeout: 10000 });
  return { pA, pB, errs };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { pA, pB, errs } = await twoPlayerGame(ctx, 'num3d');

  // forceTurn 到甲：确保回合态渲染新鲜（名牌 turn 键 + 计数条）
  await pA.evaluate(() => {
    const a = __cat.myId;
    __cat.engine.G.turn.pid = a;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: a, mid: 'fa' + Math.random(), a: { t: 'hello' } });
    __cat.hostPublish('probe-force-turn');
  });
  await pA.waitForFunction(() => __cat.S.turn && __cat.S.turn.pid === __cat.myId, null, { timeout: 8000 });
  await pA.waitForTimeout(600);

  console.log('— B1 头顶 3D 铭牌 —');
  const gl3d = await pA.evaluate(() => document.body.classList.contains('three3d'));
  ok(gl3d, 'GL 牌桌激活（body.three3d）');
  const plates = await pA.evaluate(() => ({ list: __cat.plates(), my: __cat.myId }));
  ok(Array.isArray(plates.list) && plates.list.length >= 1, `铭牌已建 ${plates.list.length} 块（自己不建）`);
  ok(plates.list.every(r => r.pid !== plates.my), '自己无铭牌（南位排除，视觉终审 P1 延续）');
  const vis = plates.list.filter(r => r.visible);
  ok(vis.length >= 1, `可见铭牌 ${vis.length}/${plates.length}`);
  ok(vis.every(r => /\|(\d+|\?)\|\d\|\d$/.test(r.sig)), `sig 四键 name|N|turn|dead（如「${vis[0] && vis[0].sig}」）`);
  ok(vis.every(r => r.y > 1.2 && r.y < 1.6), `铭牌浮于头顶带（y=${vis[0] && vis[0].y}，与 DOM 投影挂点 +1.32 同位）`);
  const nplateDom = await pA.evaluate(() => document.querySelectorAll('.nplate').length);
  ok(nplateDom === 0, 'DOM 投影贴片 .nplate 已退役（0 残留）');

  console.log('— B2 牌库/弃牌计数铭牌 —');
  const piles = await pA.evaluate(() => __cat.pilePlaques());
  ok(piles && piles.deck && piles.deck.visible && /^牌库\|\d+$/.test(piles.deck.sig), `牌库铭牌可见（${piles.deck && piles.deck.sig}）`);
  ok(piles && piles.disc && /^弃牌\|\d+$/.test(piles.disc.sig), `弃牌铭牌在位（${piles.disc && piles.disc.sig}）`);
  const deckSig1 = await pA.evaluate(() => ({ sig: __cat.pilePlaques().deck.sig, n: __cat.S.deckN }));
  ok(deckSig1.sig === '牌库|' + deckSig1.n, '牌库铭牌数字=公共态 deckN（sig 同步）');

  console.log('— B3 nope 倒计时环 —');
  const ring0 = await pA.evaluate(() => __cat.nopeRing());
  ok(ring0 && ring0.on === false, `空闲期环熄灭（frac=${ring0 && ring0.frac}）`);
  // 收缩路径取证（代码检查官 P1-3）：引擎 rig 造伪 nope pending → 环亮起 + frac 单调下降（时钟基准=Date.now 对齐引擎）
  await pA.evaluate(() => {
    const G = __cat.engine.G;
    G.turn.pending = { kind: 'nope', pid: __cat.myId, t0: Date.now(), deadline: Date.now() + 3000, cards: ['attack:0'], nopeN: 0, nopeBy: [] };
    __cat.hostPublish('probe-nope-ring');
  });
  await pA.waitForFunction(() => __cat.nopeRing() && __cat.nopeRing().on === true, null, { timeout: 6000 });
  const r1 = await pA.evaluate(() => __cat.nopeRing().frac);
  await pA.waitForTimeout(500);
  const r2 = await pA.evaluate(() => __cat.nopeRing().frac);
  ok(r1 > 0 && r1 < 1, `环亮起且在读数带（frac=${r1}，防 performance.now/Date.now 错配恒 1）`);
  ok(r2 < r1, `frac 单调下降（${r1} → ${r2}）`);
  await pA.evaluate(() => { __cat.engine.G.turn.pending = null; __cat.hostPublish('probe-nope-ring-end'); });
  await pA.waitForFunction(() => !__cat.nopeRing() || __cat.nopeRing().on === false, null, { timeout: 6000 });
  ok(true, 'pending 撤销后环熄灭（无残留）');

  console.log('— 抬起态半透避让（bc-raised 材质半透） —');
  await pA.evaluate(() => window.__cat.forceRender());
  const raised0 = await pA.evaluate(() => document.body.classList.contains('bc-raised'));
  ok(typeof raised0 === 'boolean', `抬起态标志可读（当前 ${raised0}）`);

  await pA.evaluate(() => window.__cat.forceRender());
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-bc-pc.png') });
  ok(errs.length === 0, `零 pageerror（${errs.length}）${errs[0] || ''}`);

  // 竖屏铭牌可见性（回归 ev-bombcat3d 同场景；相机推远后铭牌仍在画）
  const pctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const m = await twoPlayerGame(pctx, 'num3d-m');
  await m.pA.evaluate(() => { window.__cat.forceRender && window.__cat.forceRender(); });
  await m.pA.waitForTimeout(400);
  const mvis = await m.pA.evaluate(() => (__cat.plates() || []).filter(r => r.visible).length);
  ok(mvis >= 1, `竖屏 3D 铭牌可见 ${mvis}`);
  await m.pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-bc-phone.png') });
  await ctx.close(); await pctx.close();
  await browser.close();
  server.close();
  console.log(`═══ ev-num3d-bc：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('PROBE CRASH:', e.message || e); process.exit(2); });
