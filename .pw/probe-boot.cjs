const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8752;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod&room=PERF01`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active');
  await p.waitForTimeout(500);
  await p.evaluate(() => closeGuide());
  console.log('room field:', JSON.stringify(await p.inputValue('#input-room')));
  await p.fill('#input-name', 'Perf');
  await p.click('#btn-join');
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(4000);
    const st = await p.evaluate(() => ({
      loading: (document.getElementById('loading-text') || {}).textContent,
      overlay: !!document.querySelector('#loading-overlay:not(.hidden)') && getComputedStyle(document.getElementById('loading-overlay')).display,
      toast: (document.getElementById('toast') || {}).textContent,
      net: (document.getElementById('net-text') || {}).textContent,
      lobby: !!document.querySelector('#screen-lobby.active'),
      join: !!document.querySelector('#screen-join.active'),
      alive: typeof link !== 'undefined' && link ? link.alive : null,
      mode: typeof link !== 'undefined' && link ? link.mode : null,
    }));
    console.log((i * 4) + 's', JSON.stringify(st));
    if (st.lobby) break;
  }
  await b.close(); server.close();
})();
