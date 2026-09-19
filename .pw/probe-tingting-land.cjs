// probe-tingting-land.cjs — 婷婷 persona 补充取证 2：真·横屏矮视口 844×390（自动 landui）
// 产出: .pw/shots/tt-land-*.png + 横屏下沿测量
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8834;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const SHOTS = path.join(ROOT, '.pw', 'shots');

const T0 = Date.now();
const log = (...a) => console.log(`[tland +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); }
    else { res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(d); }
  });
});
await new Promise(res => server.listen(PORT, res));
log(`server on ${PORT}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pages = [];

async function open(tag, viewport) {
  const p = await ctx.newPage();
  if (viewport) await p.setViewportSize({ width: viewport.width, height: viewport.height });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  return { p, tag };
}
async function join(o, name, room = '') {
  const { p } = o;
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  await p.fill('#input-room', room);
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

const ROOM = 'tl' + (Date.now() % 10000);
// P1=圆圆 手机横屏 844×390（主持）；其余桌面端
const seats = [
  { tag: 'P1', name: '圆圆', vp: { width: 844, height: 390 } },
  { tag: 'P2', name: '阿凯', vp: { width: 1280, height: 800 } },
  { tag: 'P3', name: '小雨', vp: { width: 1280, height: 800 } },
  { tag: 'P4', name: '阿豪', vp: { width: 1280, height: 800 } },
  { tag: 'P5', name: '婷婷', vp: { width: 1280, height: 800 } },
  { tag: 'P6', name: '大飞', vp: { width: 1280, height: 800 } },
];
let roomCode = '';
for (const s of seats) {
  const o = await open(s.tag, s.vp);
  await join(o, s.name, roomCode);
  if (!roomCode) roomCode = await o.p.evaluate(() => {
    const el = document.getElementById('share-room');
    const t = el ? el.textContent.trim() : '';
    return (t.match(/[A-Z0-9]{4,8}/) || [''])[0] || '';
  });
  pages.push(o);
  log(`${s.tag}(${s.name}) joined, room=${roomCode}`);
  await sleep(250);
}
const ph = pages[0].p; // 手机横屏
for (const o of pages) {
  await o.p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
}
await ph.click('#btn-start');
await ph.waitForSelector('#screen-game.active', { timeout: 20000 });
log('game started, landui =', await ph.evaluate(() => document.body.classList.contains('landui')));
await sleep(2800);

async function measure(p, tag) {
  const m = await p.evaluate(() => {
    const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width) }; };
    const ring = r('.players-grid.ring3d'), me = r('.player-card.me'), truth = r('#card-truth'), tools = r('#game-tools'), card = r('#card-section');
    return { vw: innerWidth, vh: innerHeight, ring, me, truth, tools, card };
  });
  console.log(`[measure ${tag}]`, JSON.stringify(m));
  return m;
}

async function findDrawer() {
  for (const o of pages) {
    if (await o.p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) return o;
  }
  return null;
}

let gotMyTurn = false, gotDrawing = false, gotRevealed = false;
for (let turn = 1; turn <= 8 && !(gotMyTurn && gotDrawing && gotRevealed); turn++) {
  let drawer = await findDrawer();
  if (!drawer) { await sleep(800); drawer = await findDrawer(); }
  if (!drawer) { log(`turn${turn}: 无持麦人`); break; }
  log(`turn${turn}: 持麦人 = ${drawer.tag}`);
  if (drawer.tag === 'P1' && !gotMyTurn) {
    await ph.screenshot({ path: path.join(SHOTS, 'tt-land-myturn-choosing.png') });
    log('📸 tt-land-myturn-choosing.png');
    await measure(ph, 'land-myturn');
    gotMyTurn = true;
  }
  await drawer.p.click('#card-truth', { force: true });
  await sleep(900);
  if (!gotDrawing && drawer.tag !== 'P1') {
    await ph.screenshot({ path: path.join(SHOTS, 'tt-land-drawing-others.png') });
    log('📸 tt-land-drawing-others.png');
    await measure(ph, 'land-drawing-others');
    gotDrawing = true;
  } else if (!gotDrawing) {
    await ph.screenshot({ path: path.join(SHOTS, 'tt-land-drawing-me.png') });
    await measure(ph, 'land-drawing-me');
    gotDrawing = true;
  } else { await sleep(400); }
  await drawer.p.waitForSelector('#card-section:not([hidden])', { timeout: 15000 }).catch(() => {});
  await sleep(2600);
  if (!gotRevealed) {
    await ph.screenshot({ path: path.join(SHOTS, 'tt-land-revealed.png') });
    log('📸 tt-land-revealed.png');
    await measure(ph, 'land-revealed');
    gotRevealed = true;
  }
  for (const o of pages) {
    const canAccept = await o.p.evaluate(() => { const b = document.getElementById('btn-accept'); return b && !b.hidden && b.offsetParent; });
    if (canAccept) { await o.p.click('#btn-accept', { force: true }).catch(() => {}); log(`accept by ${o.tag}`); break; }
  }
  await sleep(2600);
}
console.log('captured:', JSON.stringify({ gotMyTurn, gotDrawing, gotRevealed }));
await browser.close();
server.close();
log('DONE');
})();