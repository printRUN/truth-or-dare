// probe-akai-9p.cjs — persona 阿凯取证：9 人局（8 桌面 + 1 横屏手机）座位可读性 + landui 布局
// 红线：只新建本脚本与截图，不改 index.html。复制自 probe-3p-baseline.cjs。
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
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[akai +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pages = [];
const jsErrors = [];

async function open(tag, viewport) {
  const p = await ctx.newPage();
  if (viewport) await p.setViewportSize({ width: viewport.width, height: viewport.height });
  p.on('pageerror', e => { jsErrors.push(`[${tag}] ${e.message}`); log(`❗[${tag}] pageerror: ${e.message}`); });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  return { p, c: ctx, tag };
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

const ROOM = 'ak' + (Date.now() % 10000);
// P1 主持桌面 1440×900；P2..P8 桌面 1280×800；P9 手机横屏 844×390（landui）
const seats = [
  { tag: 'P1', name: '阿凯', vp: { width: 1440, height: 900 } },
  { tag: 'P2', name: '小雨', vp: { width: 1280, height: 800 } },
  { tag: 'P3', name: '阿豪', vp: { width: 1280, height: 800 } },
  { tag: 'P4', name: '婷婷', vp: { width: 1280, height: 800 } },
  { tag: 'P5', name: '大飞', vp: { width: 1280, height: 800 } },
  { tag: 'P6', name: '圆圆', vp: { width: 1280, height: 800 } },
  { tag: 'P7', name: '老白', vp: { width: 1280, height: 800 } },
  { tag: 'P8', name: '阿珍', vp: { width: 1280, height: 800 } },
  { tag: 'P9', name: '横屏手机', vp: { width: 844, height: 390 } },
];
let roomCode = '';
for (const s of seats) {
  const o = await open(s.tag, s.vp);
  await join(o, s.name, roomCode);
  if (!roomCode) roomCode = await o.p.evaluate(() => {
    const el = document.getElementById('share-room');
    const t = el ? el.textContent.trim() : '';
    return (t.match(/[A-Z0-9]{4,8}/) || [localStorage.getItem('tod:probe-room') || ''])[0] || '';
  });
  pages.push(o);
  log(`${s.tag}(${s.name}) joined, room=${roomCode}`);
  await sleep(250);
}
const [p1, p9] = [pages[0].p, pages[8].p];
for (const o of pages) {
  await o.p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
}
await p1.click('#btn-start');
await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
log('game started');
await sleep(3000);

// 座次量化：每张玩家卡的名字/中心/宽高/scale，桌面毡面网格 rect，牌堆 rect
async function seatSnap(p, name) {
  const info = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#game-players-grid .player-card')].map(el => {
      const r = el.getBoundingClientRect();
      const nm = el.querySelector('.player-name');
      return {
        name: nm ? nm.textContent.trim() : '?',
        me: el.classList.contains('me'),
        cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        rs: el.style.getPropertyValue('--rs') || '',
        ry: el.style.getPropertyValue('--ry') || '',
      };
    });
    const grid = document.getElementById('game-players-grid');
    const deck = document.querySelector('.table-deck');
    const g = grid ? grid.getBoundingClientRect() : null;
    return {
      cards,
      grid: g ? { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.width), h: Math.round(g.height) } : null,
      deck: deck ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(deck.getBoundingClientRect()) : null,
      ringDisplay: grid ? getComputedStyle(grid).display : null,
    };
  });
  console.log(`[seats ${name}]`, JSON.stringify(info));
  return info;
}

await seatSnap(p1, '9p-choosing');
await p1.screenshot({ path: path.join(SHOTS, '3p-akai-9p-desktop-choosing.png') });
log('📸 3p-akai-9p-desktop-choosing.png');
await p9.screenshot({ path: path.join(SHOTS, '3p-akai-landui-choosing.png') });
log('📸 3p-akai-landui-choosing.png');

// 持麦人抽卡 → drawing → revealed
let drawer = null;
for (const o of pages) {
  if (await o.p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) { drawer = o.p; log(`drawer = ${o.tag}`); break; }
}
if (drawer) await drawer.click('#card-truth', { force: true });
else log('⚠ 没找到持麦人');
await sleep(1200);
await p1.screenshot({ path: path.join(SHOTS, '3p-akai-9p-desktop-drawing.png') });
log('📸 3p-akai-9p-desktop-drawing.png');
await p9.screenshot({ path: path.join(SHOTS, '3p-akai-landui-drawing.png') });
log('📸 3p-akai-landui-drawing.png');
await p1.waitForSelector('#card-section:not([hidden])', { timeout: 15000 }).catch(() => {});
await sleep(3200);
await seatSnap(p1, '9p-revealed');
await p1.screenshot({ path: path.join(SHOTS, '3p-akai-9p-desktop-revealed.png') });
log('📸 3p-akai-9p-desktop-revealed.png');
await p9.screenshot({ path: path.join(SHOTS, '3p-akai-landui-revealed.png') });
log('📸 3p-akai-landui-revealed.png');

console.log('JS errors:', jsErrors.length ? jsErrors : 'none');
await browser.close();
server.close();
log('DONE');
})();
