// 探针：不带本地模式加入，看实际传输是 mqtt 还是 local 兜底
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8735;
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.fill('#input-name', 'probe');
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  console.log('link.kind =', await page.evaluate(() => link.kind), '| net =', await page.textContent('#net-text'));
  await browser.close();
  server.close();
})();
