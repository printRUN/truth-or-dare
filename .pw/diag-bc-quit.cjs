// diag-bc-quit.cjs — 一次性诊断：bombcat 客人在大厅时 quitToArcade 守卫各条件实际值 + 点击时监听器是否抛错
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8978;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const BASE = `http://127.0.0.1:${PORT}`;
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  [host, guest].forEach(p => {
    p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
    p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  });
  await host.goto(`${BASE}/bombcat.html`, { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
  await host.fill('#in-name', '甲');
  await host.click('#btn-join');
  await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const room = (await host.textContent('#share-room')).trim();
  await guest.goto(`${BASE}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
  await guest.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 8000 });
  await guest.fill('#in-name', '乙');
  await guest.click('#btn-join');
  await guest.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });

  const dbg = await guest.evaluate(() => ({
    typeofLink: typeof link, linkAlive: !!(link && link.slots),
    hasS: !!S, playersShape: S && S.players ? S.players.map(p => ({ id: p.id, name: p.name })) : null,
    myId, screenNow: document.querySelector('.screen.active') && document.querySelector('.screen.active').id,
    lnkExists: !!document.getElementById('lnk-arcade'),
  }));
  console.log('GUEST-DBG:', JSON.stringify(dbg));

  // 点击时如果监听器抛错，pageerror/console 会打出来；preventDefault 防导航便于观察
  await guest.evaluate(() => document.getElementById('lnk-arcade').addEventListener('click', e => e.preventDefault(), { once: true, capture: true }));
  await guest.click('#lnk-arcade');
  await guest.waitForTimeout(800);
  const after = await guest.evaluate(() => ({ url: location.pathname, catRoom: localStorage.getItem('cat:room'), screen: (document.querySelector('.screen.active') || {}).id }));
  console.log('AFTER-CLICK:', JSON.stringify(after));
  await browser.close();
  server.close();
})().catch(e => { console.error('DIAG CRASH:', e); process.exit(2); });
