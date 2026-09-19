// probe-persona3d-akai.cjs — persona 阿凯（27 岁男生 / PC 1440×900 / 骗子酒馆玩家）真实走查
// 流程：大厅 → 开局选卡 → 抽卡推镜 → 揭晓 → 接受 → 交接；再加跑一局 8 人局（选卡+揭晓）。
// 记录 window.__three.chars.size 与 pageerror/console error。只新建本脚本与截图，不改 index.html。
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8815;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[akai3d +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); }
    else { res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(d); }
  });
});
await new Promise(res => server.listen(PORT, '127.0.0.1', res));
log(`server on ${PORT}`);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });   // 钉全效：8p 复验必须在 WebGL 路径上

function watch(p, tag) {
  p.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
}

async function open(tag) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);
  return p;
}

async function join(p, name, room = '', avatarIdx = 0) {
  const adv = await p.$('details.adv');
  if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
  await p.click(`.avatar-option >> nth=0`);
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

// 快照：3D 人物数 / 相机 transform / 回合文案 / 玩家卡位置
async function snap(p, label) {
  const s = await p.evaluate(() => {
    const w = document.getElementById('world3d');
    const cards = [...document.querySelectorAll('#game-players-grid .player-card')].map(el => {
      const r = el.getBoundingClientRect();
      const nm = el.querySelector('.player-name');
      return { n: nm ? nm.textContent.trim() : '?', me: el.classList.contains('me'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), rs: el.style.getPropertyValue('--rs') };
    });
    return {
      chars: (typeof window.__three !== 'undefined' && window.__three.chars) ? window.__three.chars.size : null,
      cam: w ? w.style.transform : null,
      turn: (document.getElementById('turn-info') || {}).textContent || '',
      note: (document.getElementById('drawing-note') || {}).textContent || '',
      cards,
    };
  }).catch(e => ({ err: String(e) }));
  log(`snap[${label}] ${JSON.stringify(s)}`);
  return s;
}

const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name) }).then(() => log(`📸 ${name}`));

// ============ Phase A：2 人局全流程 ============
log('=== Phase A: 2P 全流程 ===');
const p = await open('P1-阿凯');
await shot(p, 'persona3d-akai-join.png');
await join(p, '阿凯', '', 0);
log('P1 阿凯 joined lobby');
const room = (await p.textContent('#share-room')).trim().match(/[A-Z0-9]{4,8}/)[0];
log('room =', room);

const q = await open('P2-小雨');
await join(q, '小雨', room, 1);
await p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
await p.waitForTimeout(1500);
await snap(p, 'lobby');
await shot(p, 'persona3d-akai-lobby.png');

await p.click('#btn-start');
await p.waitForSelector('#screen-game.active', { timeout: 20000 });
await p.waitForTimeout(2800);   // 等相机飞入落座
await snap(p, 'choosing');
await shot(p, 'persona3d-akai-choosing.png');

// 谁是本轮抽卡人
const mine = await p.evaluate(() => S.turn.chooserId === myId);
const drawer = mine ? p : q, other = mine ? q : p;
const dTag = mine ? 'P1-阿凯' : 'P2-小雨';
log(`chooser = ${dTag}`);

await drawer.click(mine ? '#card-dare' : '#card-truth');
await sleep(900);               // 推镜进行中（动画最短 2600ms）
await snap(drawer, 'drawing');
await shot(drawer, 'persona3d-akai-drawing.png');
await sleep(700);
await shot(other, 'persona3d-akai-drawing-other.png');   // 对面视角同看推镜

await drawer.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
await drawer.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
await other.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
await drawer.waitForTimeout(800);
await snap(drawer, 'revealed');
await shot(drawer, 'persona3d-akai-revealed.png');
await shot(other, 'persona3d-akai-revealed-other.png');

await drawer.click('#btn-accept');
await sleep(600);
await shot(drawer, 'persona3d-akai-accept.png');
// 交接：另一人回合到来
await other.waitForFunction(() => document.getElementById('turn-info').textContent.includes('轮到你'), null, { timeout: 25000 });
await sleep(2000);
await snap(other, 'handover');
await shot(other, 'persona3d-akai-handover.png');
await shot(p, 'persona3d-akai-handover-wait.png');

// ============ Phase B：8 人局 ============
log('=== Phase B: 8P ===');
const names = ['阿凯', '小雨', '阿豪', '婷婷', '大飞', '圆圆', '老白', '阿珍'];
const mp = [];
let roomB = '';
for (let i = 0; i < 8; i++) {
  const tag = `M${i + 1}-${names[i]}`;
  const m = await open(tag);
  await join(m, names[i], roomB, i);
  if (i === 0) roomB = (await m.textContent('#share-room')).trim().match(/[A-Z0-9]{4,8}/)[0];
  mp.push(m);
  log(`M${i + 1}(${names[i]}) joined, room=${roomB}`);
  await sleep(300);
}

for (const m of mp) { await m.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {}); }
await mp[0].waitForSelector('#players-grid .player-card >> nth=7', { timeout: 20000 });
await mp[0].click('#btn-start');
await mp[0].waitForSelector('#screen-game.active', { timeout: 20000 });
await sleep(3500);
await snap(mp[0], '8p-choosing');
await shot(mp[0], 'persona3d-akai-8p-choosing.png');

// 8 人里找持麦人
let d8 = null;
for (const m of mp) {
  if (await m.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)') || !!document.querySelector('#card-dare:not(.disabled)'))) { d8 = m; break; }
}
if (d8) {
  await d8.click('#card-dare', { force: true }).catch(async () => { await d8.click('#card-truth', { force: true }); });
  await sleep(900);
  await shot(d8, 'persona3d-akai-8p-drawing.png');
  await d8.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await d8.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  await sleep(800);
  await snap(d8, '8p-revealed');
  await shot(d8, 'persona3d-akai-8p-revealed.png');
} else {
  log('⚠ 8P 未找到持麦人');
}
await shot(mp[3], 'persona3d-akai-8p-revealed-other.png');

log(errors.length ? 'PAGE/CONSOLE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
await browser.close();
server.close();
process.exitCode = 0;
})();
