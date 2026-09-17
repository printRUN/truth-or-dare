// 填表页精美化：多视口截图取证
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8873;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  for (const [tag, vw, vh] of [['desktop-1100', 1100, 800], ['wide-1440', 1440, 900], ['mobile-390', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 20000 });
    await p.evaluate(() => { try { closeGuide(); } catch {} });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 8000 }).catch(() => {});
    await sleep(500);
    await p.fill('#input-name', '阿凯');
    await p.screenshot({ path: `${ROOT}/.pw/shots/join2-${tag}.png` });
    // 展开高级选项状态
    await p.evaluate(() => { const d = document.querySelector('details.join-adv'); if (d) d.open = true; });
    await sleep(300);
    await p.screenshot({ path: `${ROOT}/.pw/shots/join2-${tag}-adv.png` });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log('join2 shots done');
})();
