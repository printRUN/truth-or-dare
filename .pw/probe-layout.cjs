// 探针：游戏页是否混入了大厅元素
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8736;
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); });
  });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`http://localhost:${PORT}/index.html?game=tod`);
  await a.click('#chk-local');
  await a.fill('#input-name', 'A');
  await a.click('.avatar-option >> nth=0');
  await a.click('#btn-join');
  await a.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const b = await ctx.newPage();
  await b.goto(`http://localhost:${PORT}/index.html?game=tod`);
  await b.click('#chk-local');
  await b.fill('#input-name', 'B');
  await b.click('.avatar-option >> nth=0');
  const room = (await a.textContent('#share-room')).trim();
  await b.fill('#input-room', room);
  await b.click('#btn-join');
  await a.waitForSelector('#players-grid .player-card >> nth=1');
  await a.click('#btn-start');
  await a.waitForSelector('#screen-game.active');
  const info = await a.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { visible: !!el.offsetParent, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      lobbyActive: document.getElementById('screen-lobby').classList.contains('active'),
      lobbyDisplay: getComputedStyle(document.getElementById('screen-lobby')).display,
      gameActive: document.getElementById('screen-game').classList.contains('active'),
      start: r(document.getElementById('btn-start')),
      micLobby: r(document.getElementById('btn-mic-lobby')),
      startParentChain: (() => { let p = document.getElementById('btn-start'); const s = []; while (p) { s.push(p.id || p.className || p.tagName); p = p.parentElement; } return s; })(),
      docHeight: document.body.scrollHeight,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  server.close();
})();
