// probe-tingting-mobile.cjs — 婷婷 persona 补充取证：手机竖屏 390×844 各阶段 + 横屏 landforce
// 产出: .pw/shots/tt-*.png + 控制台输出「屏幕下沿空间争夺」测量数据
// 红线：只新建本脚本与截图，不改 index.html、不改既有脚本。
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8833;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[tt +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
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
  p.on('pageerror', e => log(`❗[${tag}] pageerror: ${e.message}`));
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

const ROOM = 'tt' + (Date.now() % 10000);
// P1..P5 桌面端，P6=圆圆 手机竖屏 390×844（婷婷本人）
const seats = [
  { tag: 'P1', name: '阿凯', vp: { width: 1280, height: 800 } },
  { tag: 'P2', name: '小雨', vp: { width: 1280, height: 800 } },
  { tag: 'P3', name: '阿豪', vp: { width: 1280, height: 800 } },
  { tag: 'P4', name: '婷婷', vp: { width: 1280, height: 800 } },
  { tag: 'P5', name: '大飞', vp: { width: 1280, height: 800 } },
  { tag: 'P6', name: '圆圆', vp: { width: 390, height: 844 } },
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
const p6 = pages[5].p;
for (const o of pages) {
  await o.p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
}
await pages[0].p.click('#btn-start');
await pages[0].p.waitForSelector('#screen-game.active', { timeout: 20000 });
log('game started');
await sleep(2800);

// ---- 测量：屏幕下沿空间争夺 ----
async function measure(p, tag) {
  const m = await p.evaluate(() => {
    const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width), hidden: !el.offsetParent && getComputedStyle(el).display === 'none' }; };
    const overlap = (a, b) => (!a || !b || a.hidden || b.hidden) ? null : Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const me = r('.player-card.me');
    const ring = r('.players-grid.ring3d');
    const truth = r('#card-truth');
    const dare = r('#card-dare');
    const tools = r('#game-tools');
    const card = r('#card-section');
    const toasts = [...document.querySelectorAll('.toast')].map(el => { const b = el.getBoundingClientRect(); return { txt: el.textContent.slice(0, 14), top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
    return {
      vw: innerWidth, vh: innerHeight,
      ring, me, truth, dare, tools, card, toasts,
      ov_me_truth: overlap(me, truth), ov_me_dare: overlap(me, dare),
      ov_tools_card: overlap(tools, card),
      ov_toast_tools: toasts.length && tools ? toasts.filter(t => t.top < tools.bottom && t.bottom > tools.top).map(t => t.txt) : [],
    };
  });
  console.log(`[measure ${tag}]`, JSON.stringify(m));
  return m;
}

// 找当前持麦人（#card-truth 不带 disabled 的页面）
async function findDrawer() {
  for (const o of pages) {
    if (await o.p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) return o;
  }
  return null;
}

let capturedMyTurn = false;
let capturedDrawing = false;
let capturedRevealed = false;

for (let turn = 1; turn <= 8 && !(capturedMyTurn && capturedDrawing && capturedRevealed); turn++) {
  let drawer = await findDrawer();
  if (!drawer) { await sleep(800); drawer = await findDrawer(); }
  if (!drawer) { log(`turn${turn}: 没找到持麦人，跳过`); break; }
  log(`turn${turn}: 持麦人 = ${drawer.tag}`);

  if (drawer.tag === 'P6' && !capturedMyTurn) {
    // 我（圆圆/婷婷）的选卡回合：竖屏截图 + 测量
    await p6.screenshot({ path: path.join(SHOTS, 'tt-mobile-myturn-choosing.png') });
    log('📸 tt-mobile-myturn-choosing.png');
    await measure(p6, 'mobile-myturn-portrait');
    capturedMyTurn = true;

    // 切横屏（landforce）再看同一局面
    try {
      await p6.click('#btn-land', { force: true });
      await sleep(1200);
      const mode = await p6.evaluate(() => ({ landforce: document.body.classList.contains('landforce'), landui: document.body.classList.contains('landui') }));
      log('横屏模式:', JSON.stringify(mode));
      await p6.screenshot({ path: path.join(SHOTS, 'tt-mobile-land-myturn.png') });
      log('📸 tt-mobile-land-myturn.png');
      await measure(p6, 'mobile-myturn-landforce');
      // 切回竖屏
      await p6.click('#btn-land', { force: true }).catch(() => {});
      await sleep(900);
    } catch (e) { log('横屏切换失败:', e.message); }
  }

  // 抽卡瞬间（谁抽都截一张手机画面）
  if (!capturedDrawing) {
    await drawer.p.click('#card-truth', { force: true });
    await sleep(900);
    await p6.screenshot({ path: path.join(SHOTS, drawer.tag === 'P6' ? 'tt-mobile-drawing-me.png' : 'tt-mobile-drawing-others.png') });
    log(`📸 tt-mobile-drawing-${drawer.tag === 'P6' ? 'me' : 'others'}.png (drawer=${drawer.tag})`);
    await measure(p6, 'mobile-drawing');
    capturedDrawing = true;
  } else {
    await drawer.p.click('#card-truth', { force: true });
    await sleep(600);
  }

  // 揭晓
  await drawer.p.waitForSelector('#card-section:not([hidden])', { timeout: 15000 }).catch(() => {});
  await sleep(2600);
  if (!capturedRevealed) {
    await p6.screenshot({ path: path.join(SHOTS, 'tt-mobile-revealed.png') });
    log('📸 tt-mobile-revealed.png');
    await measure(p6, 'mobile-revealed');
    capturedRevealed = true;
  }

  // 完成挑战 → 下一轮
  for (const o of pages) {
    const canAccept = await o.p.evaluate(() => { const b = document.getElementById('btn-accept'); return b && !b.hidden && b.offsetParent; });
    if (canAccept) { await o.p.click('#btn-accept', { force: true }).catch(() => {}); log(`accept by ${o.tag}`); break; }
  }
  await sleep(2600);
}

console.log('captured:', JSON.stringify({ capturedMyTurn, capturedDrawing, capturedRevealed }));
await browser.close();
server.close();
log('DONE');
})();