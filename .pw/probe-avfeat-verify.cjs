#!/usr/bin/env node
/* probe-avfeat-verify.cjs — 特征提取校验表截图（端口 9149）
   用法: node probe-avfeat-verify.cjs
   产出: .pw/shots/av3-verify.png */
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const PORT = 9149;

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const fp = path.join(ROOT, p === '/' ? '/index.html' : p);
  fs.readFile(fp, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript' : 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${PORT}/.pw/av3-verify.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 120000 });
  const results = await page.evaluate('window.__results');
  fs.writeFileSync(path.join(ROOT, '.pw/shots/av3-verify.json'), JSON.stringify(results, null, 1));
  await page.screenshot({ path: path.join(ROOT, '.pw/shots/av3-verify.png'), fullPage: true });
  const persons = results.filter(r => r.f.person);
  console.log('cells', results.length, 'person', persons.length,
    'glasses', persons.filter(r => r.f.glasses).length,
    'beard', persons.filter(r => r.f.beard).length);
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
