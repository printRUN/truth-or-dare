// 目视检查：省电模式开关在「怎么玩」弹窗里的排布 + 省电档下的画面
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8756;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-join.active');
  await sleep(600);
  await page.evaluate(() => openGuide());
  await sleep(500);
  await page.screenshot({ path: 'shots/guide-perf.png' });
  await page.evaluate(() => closeGuide());
  await page.fill('#input-name', 'Look');
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active');
  await sleep(1500);
  await page.evaluate(() => closeGuide());
  await page.screenshot({ path: 'shots/lobby-full.png' });
  await page.evaluate(() => setLowPerf(true, 'low'));
  await sleep(600);
  await page.screenshot({ path: 'shots/lobby-loperf.png' });
  await browser.close(); server.close();
  console.log('ok');
})();
