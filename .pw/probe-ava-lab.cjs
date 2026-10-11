#!/usr/bin/env node
/* probe-ava-lab.cjs — 头像实验室驱动（端口 9073）：
   打开 lab-avatars.html，等 __LAB.done，落 JSON + 网格截图。
   用法：node .pw/probe-ava-lab.cjs before   → .pw/shots/ava-lab-before.png/.json
         node .pw/probe-ava-lab.cjs after    → .pw/shots/ava-lab-after.png/.json */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9073;
const tag = process.argv[2] || 'before';
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 2000 } });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/.pw/lab-avatars.html${tag === 'before' ? '' : '?v=next'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__LAB && window.__LAB.done, null, { timeout: 120000 });
  const lab = await page.evaluate(() => window.__LAB);
  const png = path.join(ROOT, '.pw', 'shots', `ava-lab-${tag}.png`);
  const json = path.join(ROOT, '.pw', 'shots', `ava-lab-${tag}.json`);
  await page.screenshot({ path: png, fullPage: true });
  fs.writeFileSync(json, JSON.stringify(lab, null, 1));
  console.log('total', lab.total, 'faces', lab.faces);
  console.log('distinct 3D looks:', lab.stats.distinct, ' collisions:', lab.stats.collide, ' hairColors:', lab.stats.colorDistinct);
  console.log('classHist:', JSON.stringify(lab.stats.classHist));
  console.log('colorHist:', JSON.stringify(lab.stats.colorHist));
  console.log('saved', png);
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
