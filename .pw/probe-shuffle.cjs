// 探针：抽卡洗牌中间帧 + 卡堆扫光裁剪
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8737;
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await ctx.newPage();
  await a.goto(`http://localhost:${PORT}/index.html`);
  await a.waitForSelector('#loading-overlay', { state: 'detached' });
  await a.click('#chk-local');
  await a.fill('#input-name', 'A');
  await a.click('.avatar-option >> nth=0');
  await a.click('#btn-join');
  await a.waitForSelector('#screen-lobby.active');
  const b = await ctx.newPage();
  await b.goto(`http://localhost:${PORT}/index.html`);
  await b.click('#chk-local');
  await b.fill('#input-name', 'B');
  await b.click('.avatar-option >> nth=0');
  const room = (await a.textContent('#share-room')).trim();
  await b.fill('#input-room', room);
  await b.click('#btn-join');
  await a.waitForSelector('#players-grid .player-card >> nth=1');
  // 自由对决：保证 A 一定能抢麦点击
  await a.click('.mode-opt[data-mode="free"]');
  await a.click('#btn-start');
  await a.waitForSelector('#screen-game.active');
  await a.waitForSelector('#card-truth:not(.disabled)', { timeout: 10000 });
  // 选择卡扫光状态先拍一张（mine 态）
  await a.waitForTimeout(400);
  await a.locator('#choice-section').screenshot({ path: 'shots/sheen-choice.png' });
  const clip = { x: 0, y: 0, width: 0, height: 0 };   // 占位，click 后测
  await a.click('#card-truth');
  await a.waitForTimeout(120);           // deck 可见后测落点
  const db = await a.evaluate(() => { const r = document.getElementById('deck').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  clip.x = db.x - 80; clip.y = db.y - 80; clip.width = db.w + 160; clip.height = db.h + 160;
  await a.waitForTimeout(180);           // ≈300ms 第一拍
  await a.screenshot({ path: 'shots/shuffle-a.png', clip });
  await a.waitForTimeout(520);           // ≈820ms：第二拍交叉峰
  await a.screenshot({ path: 'shots/shuffle-b.png', clip });
  await a.waitForTimeout(600);           // 洗牌收尾，飞牌前后
  await a.screenshot({ path: 'shots/shuffle-c.png', clip });
  await a.waitForTimeout(2500);          // 等翻牌揭晓
  await a.screenshot({ path: 'shots/reveal.png' });
  await browser.close();
  server.close();
  console.log('probe done');
})();
