// 视觉确认：高对比 emoji 头像在曲面脸贴片上的渲染（斜视角也要贴头）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8865;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  const q = await ctx.newPage();
  await q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await q.fill('#input-name', '小雨');
  await q.click('details.adv summary');
  await q.click('#chk-local');
  await q.click('#input-room');
  await q.fill('#input-room', room);
  await q.click('.avatar-option >> nth=0');
  await q.click('#btn-join');
  await p.waitForFunction(() => S.players.length >= 2, null, { timeout: 15000 });
  // 换成高对比 emoji 头像
  await p.evaluate(() => mutate(n => { n.players[0].avatar = '🦊'; }));
  await p.evaluate(() => mutate(n => { n.players[1].avatar = '🐸'; }));
  await p.waitForTimeout(900);
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: 'shots/face-vivid.png' });
  await browser.close();
  server.close();
})().catch(e => { console.error('fatal:', e); process.exit(1); });
