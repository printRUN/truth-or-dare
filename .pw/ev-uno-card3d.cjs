/* ev-uno-card3d.cjs —— 验收探针（端口 8957,2026-09-24 3D 牌面优化轮）:
   A. 牌库恒显 UNO 背面(红0 正面隐藏、背纹朝上)
   B. 弃牌堆纹理=真顶牌(开局首翻即同步,占位红3 不可见)
   C. 7 张手牌扇形:步长 ≥0.24(每张露 ≥46%)
   D. 对手牌堆有厚度(y 极差 ≥0.12),不是单片
   截图 .pw/shots/ev-uno3d-*.png */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8957;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 100)));
  await p.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__uno && window.__uno.state.phase === 'AWAIT_ACTION', null, { timeout: 20000 });
  await p.bringToFront();
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(250);

  // A/B. 牌堆纹理与可见面
  const piles = await p.evaluate(() => window.__uno.piles());
  ok(piles && piles.draw && !piles.draw.frontVisible && piles.draw.backRotY === 0, 'A 牌库显示 UNO 背面(红0 正面隐藏)');
  ok(piles && piles.pile && piles.pile.frontVisible && !piles.pile.backVisible && piles.pile.matchesTop && !piles.pile.flying, 'B 弃牌堆纹理=真顶牌(首翻即同步,正背面互斥)');

  // C. 7 张扇形步长(南位=当前玩家=测试员)
  const fan = await p.evaluate(() => {
    const G = window.__uno.state;
    const xs = window.__uno.cards().filter(c => c.owner === G.turn).map(c => c.x).sort((a, b) => a - b);
    return xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 1;
  });
  ok(fan >= 0.40, `C 7 张扇形步长 ${fan}(每张露 ≥55%)`);

  // D. 对手牌堆厚度(机器人甲,非南位)
  const thick = await p.evaluate(() => {
    const G = window.__uno.state;
    const si = (G.turn + 1) % G.players.length;
    const ys = window.__uno.cards().filter(c => c.owner === si).map(c => c.y);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : -1;
  });
  ok(thick >= 0.15, `D 对手牌堆厚度 y 极差 ${thick}`);

  await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-uno3d-default.png') });
  console.log('  📷 ev-uno3d-default.png');

  // 6 张手牌(贴近用户截图)
  await p.evaluate(() => {
    const cs = [{c:'y',v:'3'},{c:'g',v:'6'},{c:'y',v:'8'},{c:'g',v:'S'},{c:'r',v:'2'},{c:'b',v:'9'}];
    window.__uno.forceHand(0, cs);
  });
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-uno3d-fan6.png') });
  console.log('  📷 ev-uno3d-fan6.png');

  console.log(`\n验收完成: ${pass} pass, ${fail} fail`);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
