const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8751;

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
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html?room=PERF01`);
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(3000);
    const st = await p.evaluate(() => ({
      visible: [...document.querySelectorAll('section,div')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 100 && r.height > 100 && getComputedStyle(e).display !== 'none'; }).map(e => e.id).filter(Boolean).slice(0, 12),
      loading: (document.getElementById('loading-text') || {}).textContent,
      joinVisible: !!document.querySelector('#join-screen:not(.hidden)'),
      net: (document.getElementById('net-text') || {}).textContent,
    }));
    console.log(i * 3 + 's', JSON.stringify(st));
    if (st.joinVisible) break;
  }
  await b.close();
  server.close();
})();
