// 公平目视对比：等载入遮罩消失后再截「全特效」与「省电档」
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8757;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(mode, file) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (mode !== 'auto') await page.addInitScript(m => localStorage.setItem('tod:perf', m), mode);
  await page.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('#screen-join.active');
  await sleep(1200);
  await page.evaluate(() => closeGuide());
  await sleep(400);
  await page.screenshot({ path: `shots/${file}` });
  console.log(file, 'loperf=' + await page.evaluate(() => document.body.classList.contains('loperf')));
  await ctx.close();
}

let browser;
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  await shot('full', 'cmp-full.png');
  await shot('low', 'cmp-low.png');
  await browser.close(); server.close();
})();
