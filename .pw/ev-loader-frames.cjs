// ev-loader-frames.cjs — 加载动画现状/验收取证（端口 9073）：tod join 门 loader / mono boot loader / uno boot loader 各拍 2 帧
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 9073;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const vp = { width: 500, height: 900 };
  const tag = process.argv[2] || 'old';
  const ctx = await browser.newContext({ viewport: vp });

  // uno boot loader：加载即现，拍 2 帧后等 detached
  {
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/uno.html?turbo=1`, { waitUntil: 'commit' });
    await sleep(500); await pg.screenshot({ path: path.join(SHOTS, `loader-uno-${tag}-1.png`) });
    await sleep(700); await pg.screenshot({ path: path.join(SHOTS, `loader-uno-${tag}-2.png`) });
    await pg.close();
  }
  // monopoly boot loader
  {
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/monopoly.html?turbo=1`, { waitUntil: 'commit' });
    await sleep(500); await pg.screenshot({ path: path.join(SHOTS, `loader-mono-${tag}-1.png`) });
    await sleep(700); await pg.screenshot({ path: path.join(SHOTS, `loader-mono-${tag}-2.png`) });
    await pg.close();
  }
  // tod join 门 loader（点创建后 waitLoaderDone 窗口；直接拦 overlay 现形窗口：进 join 屏后触发 doJoin 本地房）
  {
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await pg.evaluate(() => { const n = document.querySelector('#inp-name, input[placeholder*="名字"], .join-box input'); if (n) { n.value = '取证员'; n.dispatchEvent(new Event('input', { bubbles: true })); } const b = document.getElementById('btn-create') || document.querySelector('.btn-primary'); if (b) b.click(); });
    await sleep(350); await pg.screenshot({ path: path.join(SHOTS, `loader-tod-${tag}-1.png`) });
    await sleep(600); await pg.screenshot({ path: path.join(SHOTS, `loader-tod-${tag}-2.png`) });
    await pg.close();
  }
  await browser.close();
  server.close();
  console.log('frames saved with tag:', tag);
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
