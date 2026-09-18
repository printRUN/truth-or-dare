// probe-3p-baseline.cjs — 第三人称改造前的基线取证（当前第一人称牌桌）
// 产出: .pw/shots/3p-base-*.png + 控制台输出镜头/座次变量
// 红线：只新建本脚本与截图，不改 index.html。
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8831;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[base +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
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
// 本地模式靠 BroadcastChannel：所有页必须同 context（跨 context 不可达）；视口差异用 setViewportSize
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
  try {
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  } catch (e) {
    await p.screenshot({ path: path.join(SHOTS, `3p-base-joinfail-${name}.png`) });
    const dbg = await p.evaluate(() => ({
      toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent),
      localChecked: document.getElementById('chk-local').checked,
      name: document.getElementById('input-name').value,
      room: document.getElementById('input-room').value,
      joinDisabled: document.getElementById('btn-join').disabled,
    }));
    console.log(`[joinfail ${name}]`, JSON.stringify(dbg));
    throw e;
  }
}

const ROOM = '3p' + (Date.now() % 10000);
// P1 桌面主持 1440×900；P2..P5 桌面；P6 手机竖屏 390×844
const seats = [
  { tag: 'P1', name: '阿凯', vp: { width: 1440, height: 900 } },
  { tag: 'P2', name: '小雨', vp: { width: 1280, height: 800 } },
  { tag: 'P3', name: '阿豪', vp: { width: 1280, height: 800 } },
  { tag: 'P4', name: '婷婷', vp: { width: 1280, height: 800 } },
  { tag: 'P5', name: '大飞', vp: { width: 1280, height: 800 } },
  { tag: 'P6', name: '圆圆', vp: { width: 390, height: 844, mobile: true } },
];
let roomCode = '';
for (const s of seats) {
  const o = await open(s.tag, s.vp);
  await join(o, s.name, roomCode);   // 首个玩家空房号建房，之后的人用房号加入
  if (!roomCode) roomCode = await o.p.evaluate(() => {
    const el = document.getElementById('share-room');
    const t = el ? el.textContent.trim() : '';
    return (t.match(/[A-Z0-9]{4,8}/) || [localStorage.getItem('tod:probe-room') || ''])[0] || '';
  });
  if (!roomCode) { log('⚠ 没拿到房号'); }
  log(`room = ${roomCode}`);
  pages.push(o);
  log(`${s.tag}(${s.name}) joined`);
  await sleep(250);
}
const [p1] = pages.map(o => o.p);
// 首次进房的「怎么玩」引导遮罩会挡住开始按钮：全部关掉
for (const o of pages) {
  await o.p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
}
await p1.click('#btn-start');
await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
log('game started');
await sleep(2600);   // 等入座动画+镜头推进落定

// 通用状态采集：镜头 transform、我的卡与对面卡的座次变量、卡牌位置
async function snap(p, name) {
  const info = await p.evaluate(() => {
    const w = document.getElementById('world3d');
    const me = document.querySelector('#game-players-grid .player-card.me');
    const varsOf = el => el ? ({ rx: el.style.getPropertyValue('--rx'), ry: el.style.getPropertyValue('--ry'), rs: el.style.getPropertyValue('--rs'), z: el.style.zIndex, rect: (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }) : null;
    const deck = document.querySelector('.table-deck');
    const grid = document.getElementById('game-players-grid');
    return {
      world: w ? w.style.transform : null,
      me: varsOf(me),
      gridRect: grid ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(grid.getBoundingClientRect()) : null,
      deck: deck ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(deck.getBoundingClientRect()) : null,
      first: varsOf(document.querySelector('#game-players-grid .player-card')),
      innerW: innerWidth, innerH: innerHeight,
    };
  });
  console.log(`[state ${name}]`, JSON.stringify(info));
  return info;
}

await snap(p1, 'choosing');
await p1.screenshot({ path: path.join(SHOTS, '3p-base-desktop-choosing.png') });
log('📸 3p-base-desktop-choosing.png');
// 手机主持视角拍不到（P6 不是主持），单独让 P6 截自己的牌桌
const p6 = pages[5].p;
await sleep(600);
await p6.screenshot({ path: path.join(SHOTS, '3p-base-mobile-choosing.png') });
log('📸 3p-base-mobile-choosing.png');

// 主持抽卡 → revealed（轮流模式：持麦人的选卡按钮才不带 disabled）
let drawer = null;
if (await p1.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) drawer = p1;
if (!drawer) {
  for (const o of pages.slice(1)) {
    if (await o.p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) { drawer = o.p; log(`drawer = ${o.tag}`); break; }
  }
}
if (drawer) await drawer.click('#card-truth', { force: true });
else { log('⚠ 没找到持麦人'); }
await sleep(1200);
await p1.screenshot({ path: path.join(SHOTS, '3p-base-desktop-drawing.png') });
log('📸 3p-base-desktop-drawing.png');
await p1.waitForSelector('#card-section:not([hidden])', { timeout: 15000 }).catch(() => {});
await sleep(3000);   // 翻牌仪式落定
await snap(p1, 'revealed');
await p1.screenshot({ path: path.join(SHOTS, '3p-base-desktop-revealed.png') });
log('📸 3p-base-desktop-revealed.png');
await p6.screenshot({ path: path.join(SHOTS, '3p-base-mobile-revealed.png') });
log('📸 3p-base-mobile-revealed.png');

// 全员完成 → 交接下一轮，截「别人的回合」状态
for (const o of pages) {
  const canAccept = await o.p.evaluate(() => { const b = document.getElementById('btn-accept'); return b && !b.hidden && b.offsetParent; });
  if (canAccept) { await o.p.click('#btn-accept'); log(`accept by ${o.tag}`); break; }
}
await sleep(2600);
await p1.screenshot({ path: path.join(SHOTS, '3p-base-desktop-next.png') });
log('📸 3p-base-desktop-next.png');

console.log('JS errors:', jsErrors.length ? jsErrors : 'none');
await browser.close();
server.close();
log('DONE');

})();