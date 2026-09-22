// 调试：远座名牌 63px 之谜——card/wrap/name 三层宽度 + --rs + minWidth 样式
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8863;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const pages = [];
  for (let i = 0; i < 6; i++) {
    const p = await ctx.newPage();
    pages.push(p);
    await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
    await p.fill('#input-name', '玩家' + (i + 1));
    await p.click('details.adv summary');
    await p.click('#chk-local');
    if (i > 0) { await p.click('#input-room'); await p.fill('#input-room', await (await pages[0].textContent('#share-room')).trim()); }
    await p.click(`.avatar-option >> nth=0`);
    await p.click('#btn-join');
    await pages[0].waitForTimeout(700);
  }
  await pages[0].waitForFunction(() => S.players.length >= 6, null, { timeout: 15000 });
  await pages[0].click('#btn-start');
  await pages[0].waitForSelector('#screen-game.active', { timeout: 15000 });
  await pages[0].waitForTimeout(3500);
  const dump = await pages[0].evaluate(() => {
    const grid = document.getElementById('game-players-grid');
    return [...grid.querySelectorAll('.player-card')].map(c => {
      const wrap = c.querySelector('.avatar-wrap');
      const name = c.querySelector('.player-name');
      const r = el => { const b = el.getBoundingClientRect(); return Math.round(b.width * 10) / 10; };
      return {
        name: (name.textContent || '').slice(0, 4), vis: getComputedStyle(c).visibility,
        rs: c.style.getPropertyValue('--rs'), mw: c.style.minWidth || '',
        card: r(c), wrap: r(wrap), name: r(name),
      };
    });
  });
  console.log(JSON.stringify(dump, null, 1));
  await browser.close();
  server.close();
})().catch(e => { console.error('fatal:', e); process.exit(1); });
