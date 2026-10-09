#!/usr/bin/env node
/* probe-avfeat-spike.cjs — 头像特征提取 spike 截图（端口 9145）
   用法: node probe-avfeat-spike.cjs
   产出: .pw/shots/av3-spike-grid.png 全网格 + .pw/shots/av3-spike.json 检测结果 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const PORT = 9145;

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const file = p === '/' ? '/index.html' : p;
  const fp = path.join(ROOT, file);
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/.pw/av3-spike.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 60000 });
  const results = await page.evaluate('window.__results');
  fs.writeFileSync(path.join(ROOT, '.pw/shots/av3-spike.json'), JSON.stringify(results, null, 1));
  await page.screenshot({ path: path.join(ROOT, '.pw/shots/av3-spike-grid.png'), fullPage: true });
  // 摘要统计
  const persons = results.filter(r => r.f.person);
  console.log('total', results.length, 'person-detected', persons.length);
  const byStyle = {};
  results.forEach(r => { (byStyle[r.st] = byStyle[r.st] || { n: 0, person: 0, glasses: 0, beard: 0, styles: {} }); byStyle[r.st].n++; if (r.f.person) byStyle[r.st].person++; if (r.f.glasses) byStyle[r.st].glasses++; if (r.f.beard) byStyle[r.st].beard++; byStyle[r.st].styles[r.f.style] = (byStyle[r.st].styles[r.f.style] || 0) + 1; });
  Object.entries(byStyle).forEach(([s, v]) => console.log(s.padEnd(20), 'person', v.person + '/' + v.n, 'glasses', v.glasses, 'beard', v.beard, JSON.stringify(v.styles)));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
