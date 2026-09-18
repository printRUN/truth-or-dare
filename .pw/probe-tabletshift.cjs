// 诊断：平板 1024×768（isMobile）选卡底部越界，验证是不是「屏幕居中」改动带来的位移。
// 同一页面里 A/B：居中 → 关掉居中（margin:0）→ 再居中，各量一次。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = parseInt(process.argv[2] || '8820', 10);
const URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT = path.join(__dirname, 'shots', 'tabletshift.json');
const rows = [];
const emit = o => { rows.push(o); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); };

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        r.end(d);
      });
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}
async function openPage(ctx, tag) {
  const p = await ctx.newPage();
  await p.route('**fonts.googleapis.com**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**fonts.gstatic.com**', r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 30000 });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(200);
  return p;
}
async function joinBoth(A, B, tag) {
  await A.fill('#input-name', tag + 'A');
  await A.click('.avatar-option >> nth=0');
  await A.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await A.waitForFunction(() => typeof S !== 'undefined' && !!(S && S.room), null, { timeout: 15000 });
  const room = await A.evaluate(() => S.room);
  await B.fill('#input-name', tag + 'B');
  await B.click('.avatar-option >> nth=0');
  await B.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
  await B.fill('#input-room', room);
  await B.click('#btn-join');
  await A.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length === 2, null, { timeout: 15000 });
}
const SNAP = keys => {
  const round = n => +Number(n).toFixed(1);
  const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { t: round(b.top), b: round(b.bottom), l: round(b.left), r: round(b.right), w: round(b.width) }; };
  const out = { vw: innerWidth, vh: innerHeight, sy: scrollY, bsy: document.body.scrollTop, els: {} };
  for (const [k, sel] of Object.entries(keys)) out.els[k] = r(sel);
  try { out.cam = JSON.parse(JSON.stringify(Cam.cur)); } catch (e) { out.cam = 'n/a'; }
  const w = document.getElementById('world3d');
  out.worldTf = getComputedStyle(w).transform.slice(0, 90);
  out.worldBB = (b => ({ t: round(b.top), b: round(b.bottom), l: round(b.left), r: round(b.right) }))(w.getBoundingClientRect());
  out.scrollH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  return out;
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); });
  const A = await openPage(ctx, 'A'), B = await openPage(ctx, 'B');
  await joinBoth(A, B, 'TAB');
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.waitForTimeout(1400);
  const KEYS = { screen: '#screen-game', cam: '#cam', ring: '#game-players-grid', turn: '.turn-info', choice: '#choice-section', truth: '#card-truth', dare: '#card-dare', tools: '#game-tools' };
  emit({ tag: 'centered', snap: await A.evaluate(SNAP, KEYS) });
  await A.addStyleTag({ content: '.screen{margin-left:0 !important;margin-right:0 !important}', id: 'ab' });
  await A.waitForTimeout(1600);
  emit({ tag: 'left-pinned', snap: await A.evaluate(SNAP, KEYS) });
  await A.evaluate(() => { const s = document.getElementById('ab'); if (s) s.remove(); });
  await A.waitForTimeout(1600);
  emit({ tag: 'centered-again', snap: await A.evaluate(SNAP, KEYS) });
  emit({ done: true });
  await browser.close();
  server.close();
})().catch(e => { emit({ ERROR: String(e && e.message || e) }); process.exit(1); });
