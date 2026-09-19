// landforce 手动横屏 × three3d 窄屏：FAB 是否落在视觉右下角、可点、面板方向正常
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8877;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} · ${n}${ok ? '' : '  ↳ ' + d}`); ok ? pass++ : fail++; };
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
  await p.click('#btn-land');   // 手动横屏（landforce）
  await new Promise(r => setTimeout(r, 500));
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
await new Promise(r => setTimeout(r, 3500));
const A = pages[0];
const st = await A.evaluate(() => {
  const f = document.getElementById('tools-fab');
  if (!f) return { hasFab: false };
  const r = f.getBoundingClientRect();
  return { hasFab: true, three3d: document.body.classList.contains('three3d'),
    fab: { x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width) },
    iw: innerWidth, ih: innerHeight,
    body: (() => { const b = document.body.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() };
});
console.log(JSON.stringify(st));
check('landui: three3d 生效', st.three3d, String(st.three3d));
if (st.hasFab) {
  check('landui: FAB 在视口内', st.fab.x >= -1 && st.fab.y >= -1 && st.fab.r <= st.iw + 1 && st.fab.b <= st.ih + 1 && st.fab.w > 0, JSON.stringify(st.fab));
  const hit = await A.evaluate(() => { const f = document.getElementById('tools-fab'); const r = f.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === f || f.contains(h)); });
  check('landui: FAB 中心命中自身（旋转坐标不歪）', hit, String(hit));
  await A.evaluate(() => document.getElementById('tools-fab').click());
  await new Promise(r => setTimeout(r, 250));
  const open = await A.evaluate(() => {
    const p2 = document.getElementById('game-tools');
    const r = p2.getBoundingClientRect();
    return { panel: getComputedStyle(p2).display, x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom), iw: innerWidth, ih: innerHeight };
  });
  check('landui: 面板点开且整体在视口内', open.panel === 'flex' && open.x >= -1 && open.y >= -1 && open.r <= open.iw + 1 && open.b <= open.ih + 1, JSON.stringify(open));
  await A.screenshot({ path: `${SHOTS}/toolsfab-landui-open.png` });
} else {
  check('landui: FAB 存在', false, 'no #tools-fab');
}
await browser.close();
server.close();
console.log(`===== landui fab: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
