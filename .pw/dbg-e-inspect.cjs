const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare'; const PORT = 8996;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }
  else { res.writeHead(404); res.end('no'); }
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 150)));
  await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#setup:not([hidden])', { timeout: 25000 });
  console.log('setup visible; has __mono:', await p.evaluate(() => !!window.__mono));
  await p.evaluate(() => document.getElementById('seat-plus').click());
  await p.evaluate(() => document.getElementById('seat-plus').click());
  console.log('seats:', await p.evaluate(() => document.querySelectorAll('#seat-add ~ * , .seat-row').length), await p.evaluate(() => { try { return document.querySelectorAll('.seat-row, [id^=seat-]').length; } catch (e) { return -1; } }));
  await p.evaluate(() => document.getElementById('btn-start').click());
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await p.evaluate(() => ({
      phase: window.__mono && window.__mono.state.phase,
      turn: window.__mono && window.__mono.state.turn,
      players: window.__mono ? window.__mono.state.players.length : 0,
      setupHidden: document.getElementById('setup').hidden,
      modal: (() => { const m = document.querySelector('.gen-modal, #gen-modal'); return m ? (m.hidden ? 'hidden' : 'SHOWN') : 'none'; })(),
      activeScreen: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
      handoff: (() => { const h = document.getElementById('handoff'); return h ? !h.hidden : 'none'; })(),
    })).catch(e => ({ err: String(e).slice(0, 80) }));
    console.log(i + 's', JSON.stringify(st));
    if (st.phase === 'AWAIT_ROLL') break;
  }
  await browser.close(); server.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
