// A/B：光球 blur 的替代方案（多段 radial-gradient）在帧率与观感上的对照
// 用法: node probe-orb.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8754;
const log = (...a) => console.log('[orb]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const frameStats = d => new Promise(res => {
  const gaps = []; const start = performance.now(); let last = start;
  const fin = () => { const g = gaps.slice(1); const avg = g.reduce((a, b) => a + b, 0) / (g.length || 1); res({ fps: +(1000 / avg).toFixed(1) }); };
  const step = t => { gaps.push(t - last); last = t; if (t - start >= d) fin(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
});

const G = (c, a) => `radial-gradient(circle, ${c} 0%, ${c.replace('COLORA', (a * .62).toFixed(3))} 34%, ${c.replace('COLORA', (a * .3).toFixed(3))} 56%, ${c.replace('COLORA', (a * .1).toFixed(3))} 74%, transparent 88%)`;
const soft = {
  one: `.orb{filter:none !important}
        .orb-1{background:radial-gradient(circle, rgba(139,92,246,.60) 0%, rgba(139,92,246,.38) 32%, rgba(139,92,246,.17) 55%, rgba(139,92,246,.05) 75%, transparent 90%) !important}
        .orb-2{background:radial-gradient(circle, rgba(244,114,182,.55) 0%, rgba(244,114,182,.34) 32%, rgba(244,114,182,.15) 55%, rgba(244,114,182,.04) 75%, transparent 90%) !important}
        .orb-3{background:radial-gradient(circle, rgba(34,211,238,.50) 0%, rgba(34,211,238,.30) 32%, rgba(34,211,238,.13) 55%, rgba(34,211,238,.04) 75%, transparent 90%) !important}`,
  two: `.orb{filter:none !important;opacity:.85 !important}
        .orb-1{background:radial-gradient(circle, rgba(139,92,246,.42) 0%, rgba(139,92,246,.27) 32%, rgba(139,92,246,.12) 55%, rgba(139,92,246,.035) 75%, transparent 90%) !important}
        .orb-2{background:radial-gradient(circle, rgba(244,114,182,.38) 0%, rgba(244,114,182,.24) 32%, rgba(244,114,182,.10) 55%, rgba(244,114,182,.03) 75%, transparent 90%) !important}
        .orb-3{background:radial-gradient(circle, rgba(34,211,238,.34) 0%, rgba(34,211,238,.21) 32%, rgba(34,211,238,.09) 55%, rgba(34,211,238,.025) 75%, transparent 90%) !important}`,
  nowill: `.orb{filter:none !important;will-change:auto !important}
        .orb-1{background:radial-gradient(circle, rgba(139,92,246,.42) 0%, rgba(139,92,246,.27) 32%, rgba(139,92,246,.12) 55%, rgba(139,92,246,.035) 75%, transparent 90%) !important}
        .orb-2{background:radial-gradient(circle, rgba(244,114,182,.38) 0%, rgba(244,114,182,.24) 32%, rgba(244,114,182,.10) 55%, rgba(244,114,182,.03) 75%, transparent 90%) !important}
        .orb-3{background:radial-gradient(circle, rgba(34,211,238,.34) 0%, rgba(34,211,238,.21) 32%, rgba(34,211,238,.09) 55%, rgba(34,211,238,.025) 75%, transparent 90%) !important}`,
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  for (const [key, css] of Object.entries(soft)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-join.active', { timeout: 60000 });
    await page.addStyleTag({ content: css });
    await sleep(1500);
    log(key.padEnd(8), JSON.stringify(await page.evaluate(frameStats, 4000)));
    await page.screenshot({ path: `shots/orb-${key}.png` });
    await ctx.close();
  }
  // 原版（带 blur）作为观感/帧率对照
  const ctx0 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const p0 = await ctx0.newPage();
  await p0.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p0.waitForSelector('#screen-join.active', { timeout: 60000 });
  await sleep(1500);
  log('BLUR原版的观感与帧率见 shots/orb-blur.png');
  await p0.screenshot({ path: 'shots/orb-blur.png' });
  await ctx0.close();
  await browser.close(); server.close();
})();
