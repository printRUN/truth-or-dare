// probe-persona3d-tingting.cjs — persona 婷婷取证：手机竖屏 390×844 为主，横屏 844×390 抽查，4 人局竖屏抽查
// 红线：只新建本脚本与截图，不改 index.html。复制改自 probe-3d-smoke.cjs。
// 用法: node probe-persona3d-tingting.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8816;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[tingting +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, name) }).then(() => log('📸', name));

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); }
    else { res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(d); }
  });
});
(async () => {
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
log(`server on ${PORT}`);

const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function newPhase(vp, tag) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  const mk = async (label) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`[${tag}/${label}] pageerror: ` + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}/${label}] console: ` + m.text()); });
    return p;
  };
  return { ctx, mk };
}

async function join(p, name, room, avatarNth) {
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

// 找出当前持麦人（能点卡的那一页）
async function findChooser(pages) {
  for (const pg of pages) {
    const mine = await pg.p.evaluate(() => typeof S !== 'undefined' && S.turn && S.turn.chooserId === myId);
    if (mine) return pg;
  }
  for (const pg of pages) {
    const ok = await pg.p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'));
    if (ok) return pg;
  }
  return pages[0];
}

// 游戏页关键数据：3D 人物数 + 我的角色占屏比 + 字号 + 按钮位置
async function metrics(p, label) {
  const m = await p.evaluate(() => {
    const vp = { w: innerWidth, h: innerHeight };
    const me = document.querySelector('#game-players-grid .player-card.me');
    const r = me ? me.getBoundingClientRect() : null;
    const pt = document.getElementById('punishment-text');
    const fs_ = pt ? getComputedStyle(pt).fontSize : '';
    const acc = document.getElementById('btn-accept');
    const ra = acc && !acc.hidden ? acc.getBoundingClientRect() : null;
    const secs = r ? {
      meRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      meAreaPct: Math.round(r.width * r.height / (vp.w * vp.h) * 1000) / 10,
    } : {};
    return {
      vp,
      chars: (window.__three && window.__three.chars) ? window.__three.chars.size : 'no __three',
      nameFont: (() => { const n = document.querySelector('#game-players-grid .player-name'); return n ? getComputedStyle(n).fontSize : '?'; })(),
      textFont: fs_,
      textRect: pt && !pt.hidden ? (t => ({ x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.width), h: Math.round(t.height) }))(pt.getBoundingClientRect()) : null,
      acceptRect: ra ? { x: Math.round(ra.x), y: Math.round(ra.y), w: Math.round(ra.width), h: Math.round(ra.height) } : null,
      ...secs,
    };
  });
  log(`metrics[${label}]: ` + JSON.stringify(m));
  return m;
}

// ---------- Phase A：竖屏 390×844 双人完整一轮 ----------
log('===== Phase A: portrait 390x844, 2 players =====');
const A = await newPhase({ width: 390, height: 844 }, 'A');
const ting = { p: await A.mk('婷婷') };   // 我（房主）
const yu = { p: await A.mk('小雨') };
await join(ting.p, '婷婷', '', 1);
await sleep(600);
await shot(ting.p, 'persona3d-tingting-lobby.png');
await join(yu.p, '小雨', await ting.p.evaluate(() => document.getElementById('share-room').textContent.trim()), 2);
await ting.p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
await sleep(1200);
await shot(ting.p, 'persona3d-tingting-lobby2p.png');

await ting.p.click('#btn-start');
await ting.p.waitForSelector('#screen-game.active', { timeout: 20000 });
await sleep(2600); // 等 3D 场景/入座动画落定
await metrics(ting.p, 'A-choose');
await shot(ting.p, 'persona3d-tingting-choose.png');

let chooser = await findChooser([ting, yu]);
log('chooser =', chooser === ting ? '婷婷(我)' : '小雨(对方)');
await chooser.p.click('#card-dare', { force: true }).catch(async () => { await chooser.p.click('#card-truth', { force: true }); });
await sleep(420);
await shot(ting.p, 'persona3d-tingting-drawing.png');       // 推镜早期
await sleep(700);
await shot(ting.p, 'persona3d-tingting-drawing2.png');      // 推镜中后段
await ting.p.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
await sleep(700);
await metrics(ting.p, 'A-revealed');
await shot(ting.p, 'persona3d-tingting-revealed.png');

await chooser.p.click('#btn-accept');
await sleep(2400); // 等交接/下一轮入座
await metrics(ting.p, 'A-handover');
await shot(ting.p, 'persona3d-tingting-handover.png');

// ---- Phase A2：第二轮，轮到婷婷自己抽卡+自己点接受 ----
chooser = await findChooser([ting, yu]);
log('A2 chooser =', chooser === ting ? '婷婷(我)' : '小雨(对方)');
if (chooser === ting) {
  await sleep(800);
  await shot(ting.p, 'persona3d-tingting-myturn.png');
  await chooser.p.click('#card-dare', { force: true }).catch(async () => { await chooser.p.click('#card-truth', { force: true }); });
  await sleep(420);
  await shot(ting.p, 'persona3d-tingting-mydrawing.png');
  await ting.p.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  await sleep(700);
  await metrics(ting.p, 'A2-myrevealed');
  await shot(ting.p, 'persona3d-tingting-myrevealed.png');
  const acc = await ting.p.evaluate(() => {
    const b = document.getElementById('btn-accept');
    const r = b.getBoundingClientRect();
    return { hidden: b.hidden, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  });
  log('A2 my accept button: ' + JSON.stringify(acc));
  await chooser.p.click('#btn-accept');
  await sleep(1600);
  await shot(ting.p, 'persona3d-tingting-myaccepted.png');
}
await A.ctx.close();

// ---------- Phase B：横屏 844×390 双人，选卡+揭晓 ----------
log('===== Phase B: landscape 844x390, 2 players =====');
const B = await newPhase({ width: 844, height: 390 }, 'B');
const tb = { p: await B.mk('婷婷') };
const ob = { p: await B.mk('小雨') };
await join(tb.p, '婷婷', '', 3);
await join(ob.p, '小雨', await tb.p.evaluate(() => document.getElementById('share-room').textContent.trim()), 4);
await tb.p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
await tb.p.click('#btn-start');
await tb.p.waitForSelector('#screen-game.active', { timeout: 20000 });
await sleep(2600);
await metrics(tb.p, 'B-choose');
await shot(tb.p, 'persona3d-tingting-land-choose.png');
chooser = await findChooser([tb, ob]);
log('B chooser =', chooser === tb ? '婷婷(我)' : '小雨(对方)');
await chooser.p.click('#card-dare', { force: true }).catch(async () => { await chooser.p.click('#card-truth', { force: true }); });
await tb.p.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
await sleep(700);
await metrics(tb.p, 'B-revealed');
await shot(tb.p, 'persona3d-tingting-land-revealed.png');
await B.ctx.close();

// ---------- Phase C：竖屏 390×844 四人局，选卡+揭晓 ----------
log('===== Phase C: portrait 390x844, 4 players =====');
const C = await newPhase({ width: 390, height: 844 }, 'C');
const tc = { p: await C.mk('婷婷') };
const c2 = { p: await C.mk('阿豪') };
const c3 = { p: await C.mk('圆圆') };
const c4 = { p: await C.mk('大飞') };
await join(tc.p, '婷婷', '', 5);
const roomC = await tc.p.evaluate(() => document.getElementById('share-room').textContent.trim());
await join(c2.p, '阿豪', roomC, 6);
await tc.p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
await join(c3.p, '圆圆', roomC, 7);
await tc.p.waitForSelector('#players-grid .player-card >> nth=2', { timeout: 25000 });
await join(c4.p, '大飞', roomC, 8);
await tc.p.waitForSelector('#players-grid .player-card >> nth=3', { timeout: 25000 });
await sleep(1000);
await shot(tc.p, 'persona3d-tingting-4p-lobby.png');
await tc.p.click('#btn-start');
await tc.p.waitForSelector('#screen-game.active', { timeout: 20000 });
await sleep(3000);
await metrics(tc.p, 'C-choose');
await shot(tc.p, 'persona3d-tingting-4p-choose.png');
chooser = await findChooser([tc, c2, c3, c4]);
log('C chooser =', chooser === tc ? '婷婷(我)' : '别人');
await chooser.p.click('#card-dare', { force: true }).catch(async () => { await chooser.p.click('#card-truth', { force: true }); });
await sleep(500);
await shot(tc.p, 'persona3d-tingting-4p-drawing.png');
await tc.p.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
await sleep(700);
await metrics(tc.p, 'C-revealed');
await shot(tc.p, 'persona3d-tingting-4p-revealed.png');
await C.ctx.close();

log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
await browser.close();
server.close();
process.exitCode = 0;
})();
