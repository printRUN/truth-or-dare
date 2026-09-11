// 诊断：桌面/平板视口下的横向溢出源（谁把文档撑宽了）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8816;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const serve = () => new Promise(res => {
  const s = http.createServer((req, r) => {
    const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
  });
  s.listen(PORT, '127.0.0.1', () => res(s));
});
const OVER = () => {
  const de = document.documentElement, W = de.clientWidth;
  const list = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const over = Math.max(r.right - W, -r.left);
    if (over > 1) list.push({ el, over: Math.round(over), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
  }
  list.sort((a, b) => b.over - a.over);
  return {
    vw: window.innerWidth, clientW: W, scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, scrollY: window.scrollY,
    top: list.slice(0, 8).map(x => ({ sel: (x.el.id ? '#' + x.el.id : '.' + String(x.el.className).split(' ')[0]), over: x.over, rect: x.rect })),
  };
};
(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [W, H, mobile] of [[1280, 800, false], [1280, 800, true], [1024, 768, true], [768, 1024, true]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const A = await ctx.newPage(), B = await ctx.newPage();
    for (const p of [A, B]) { await p.route('**fonts.googleapis.com**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' })); await p.route('**fonts.gstatic.com**', r => r.abort()); }
    const boot = async (p, name, i) => {
      await p.goto(URL, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#screen-join.active', { timeout: 30000 });
      await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
      await p.fill('#input-name', name); await p.click('.avatar-option >> nth=' + i);
      await p.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    };
    await boot(A, 'PC-A', 0); await A.click('#btn-join'); await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    const room = await A.evaluate(() => S.room);
    await boot(B, 'PC-B', 1); await B.fill('#input-room', room); await B.click('#btn-join'); await B.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length === 2, null, { timeout: 15000 });
    const tag = `${W}x${H}${mobile ? ' (mobile)' : ''}`;
    console.log(`\n════ ${tag} ════`);
    console.log(' lobby   :', JSON.stringify(await A.evaluate(OVER)).slice(0, 420));
    await A.click('#btn-start'); await A.waitForSelector('#screen-game.active', { timeout: 15000 }); await A.waitForTimeout(1300);
    console.log(' game    :', JSON.stringify(await A.evaluate(OVER)).slice(0, 420));
    const G = await A.evaluate(() => document.getElementById('choice-section').classList.contains('mine')) ? A : B;
    await G.click('#card-truth'); await G.waitForSelector('#card-section:not([hidden])', { timeout: 20000 }); await G.waitForTimeout(2700);
    console.log(' revealed:', JSON.stringify(await G.evaluate(OVER)).slice(0, 420));
    await ctx.close();
  }
  await browser.close(); server.close();
})();
