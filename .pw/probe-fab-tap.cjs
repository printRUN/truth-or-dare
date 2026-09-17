// 最小复现：真实 tap('#tools-fab') 在 390×844 hasTouch 语境下能否开面板
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8875;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
await new Promise(res => server.listen(PORT, res));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
const pages = [];
for (let i = 0; i < 3; i++) {
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', '玩家' + (i + 1));
  if (pages.length) await p.fill('#input-room', pages[0].room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  p.room = pages.length ? pages[0].room : (await p.textContent('#share-room')).trim();
  pages.push(p);
}
await pages.forEach(p => p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }));
await pages[0].click('#btn-start');
await pages[0].waitForSelector('#screen-game.active', { timeout: 20000 });
await new Promise(r => setTimeout(r, 3300));

const A = pages[0];
const pre = await A.evaluate(() => ({
  three3d: document.body.classList.contains('three3d'),
  narrow: matchMedia('(max-width: 767px)').matches,
  fab: (() => { const f = document.getElementById('tools-fab'); const r = f.getBoundingClientRect(); return { w: r.width, x: r.x, y: r.y, disp: getComputedStyle(f).display }; })(),
  panel: getComputedStyle(document.getElementById('game-tools')).display,
}));
console.log('PRE:', JSON.stringify(pre));
// 在 FAB 上方插桩：记录 click 是否到达
await A.evaluate(() => {
  window.__fabClicks = 0;
  document.getElementById('tools-fab').addEventListener('click', () => { window.__fabClicks++; });
  document.addEventListener('click', e => { window.__lastDocClickTarget = e.target ? (e.target.id || String(e.target.className).slice(0, 40)) : 'null'; }, true);
});
await A.tap('#tools-fab').catch(e => console.log('TAP ERR:', e.message));
await new Promise(r => setTimeout(r, 300));
const post = await A.evaluate(() => ({
  fabClicks: window.__fabClicks,
  lastDocClickTarget: window.__lastDocClickTarget,
  panel: getComputedStyle(document.getElementById('game-tools')).display,
  expanded: document.getElementById('tools-fab').getAttribute('aria-expanded'),
}));
console.log('POST-TAP:', JSON.stringify(post));
await browser.close();
server.close();
process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
