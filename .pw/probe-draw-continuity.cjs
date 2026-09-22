// 探针：卡片抽卡的「一镜到底」在竖屏 / 横屏下是否连续
// 逐帧采样 Cam.cur（x/y/z/rx/ry/s）+ 阶段 + 关键元素矩形，找帧间瞬移（Δ 与 Δt 同时看）
// 用法: node probe-draw-continuity.cjs [port]
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = Number(process.argv[2] || 8811);
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const errors = [];
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 25000 });
  await p.waitForTimeout(250);
  return p;
}
async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local'); await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}
function installSampler(p) {
  return p.evaluate(() => {
    window.__s = []; window.__on = false;
    window.__go = () => {
      window.__s = []; window.__on = true;
      const rect = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
      const tick = () => {
        if (!window.__on) return;
        window.__s.push({
          t: Math.round(performance.now()),
          x: Cam.cur.x, y: Cam.cur.y, z: Cam.cur.z, rx: Cam.cur.rx, ry: Cam.cur.ry, s: Cam.cur.s,
          tx: (Cam.el.style.transform.match(/-?\d+(\.\d+)?/g) || []).join(',').slice(0, 60),
          stage: (typeof S !== 'undefined' && S.turn && S.turn.stage) || '?',
          seq: (typeof S !== 'undefined' && S.turn && S.turn.seq) || 0,
          ui: LAND.ui, force: LAND.force,
          vw: window.innerWidth, vh: window.innerHeight,
          deck: rect('deck'), cs: rect('card-section'),
          csHidden: document.getElementById('card-section').hidden,
          busy: Cam.busy, tok: Cam.token,
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__stop = () => { window.__on = false; return window.__s; };
  });
}
function analyze(label, s) {
  console.log(`\n──── ${label} ────`);
  console.log(`  采样 ${s.length} 帧，跨度 ${(s[s.length - 1].t - s[0].t)}ms，帧间隔中位 ${median(s.slice(1).map((v, i) => v.t - s[i].t))}ms`);
  let rows = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i], dt = b.t - a.t;
    rows.push({ i, dt, dz: Math.abs(b.z - a.z), dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y),
      ds: Math.abs(b.s - a.s), drx: Math.abs(b.rx - a.rx),
      stage: a.stage + (a.stage !== b.stage ? '→' + b.stage : ''),
      ui: a.ui + (a.ui !== b.ui ? '→' + b.ui : ''), vh: a.vh + (a.vh !== b.vh ? '→' + b.vh : ''),
      from: `${a.z.toFixed(1)}/${a.x.toFixed(1)}/${a.s.toFixed(3)}`, to: `${b.z.toFixed(1)}/${b.x.toFixed(1)}/${b.s.toFixed(3)}` });
  }
  // 正常帧（间隔 ≤ 40ms）里的最大位移
  const normal = rows.filter(r => r.dt <= 40);
  const byZ = normal.slice().sort((a, b) => b.dz - a.dz);
  console.log(`  正常帧（≤40ms）中最大单帧 Δz=${byZ[0].dz.toFixed(2)} Δx=${Math.max(...normal.map(r => r.dx)).toFixed(2)} Δy=${Math.max(...normal.map(r => r.dy)).toFixed(2)} Δs=${Math.max(...normal.map(r => r.ds)).toFixed(4)}`);
  const JUMP_Z = 8, JUMP_X = 12, JUMP_S = 0.02;
  const jumps = rows.filter(r => (r.dz > JUMP_Z || r.dx > JUMP_X || r.ds > JUMP_S) && r.dt > 40);
  console.log(`  瞬移候选（Δz>${JUMP_Z} 或 Δx>${JUMP_X} 或 Δs>${JUMP_S}，且帧间隔>40ms）: ${jumps.length} 处`);
  for (const j of jumps.slice(0, 12)) {
    console.log(`    t+${j.dt}ms  Δz=${j.dz.toFixed(1)} Δx=${j.dx.toFixed(1)} Δs=${j.ds.toFixed(3)}  ${j.from} → ${j.to}  [${j.stage}] ui=${j.ui} vh=${j.vh}`);
  }
  // 阶段切换时相机处在哪
  console.log('  阶段切换时的机位:');
  for (let i = 1; i < s.length; i++) {
    if (s[i].stage !== s[i - 1].stage || s[i].ui !== s[i - 1].ui || s[i].vh !== s[i - 1].vh) {
      const b = s[i];
      console.log(`    ${s[i - 1].stage}→${b.stage} @t+${b.t - s[0].t}ms  z=${b.z.toFixed(2)} x=${b.x.toFixed(2)} y=${b.y.toFixed(2)} s=${b.s.toFixed(3)}  ui=${b.ui} vh=${b.vh} deck=${JSON.stringify(b.deck)} cs=${JSON.stringify(b.cs)} csHidden=${b.csHidden}`);
    }
  }
  console.log('  关键帧（z 轨迹，每 12 帧取一）:');
  console.log('    ' + s.filter((_, i) => i % 12 === 0).map(v => `${v.t - s[0].t}ms:${v.z.toFixed(1)}`).join('  '));
  return { rows, jumps, maxDz: byZ[0].dz };
}
function median(a) { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; }

async function scenario(browser, label, vp, rotateAt, forceLand) {
  console.log(`\n############ ${label} ############`);
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx, label + '-A');
  await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, label + '-B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await A.waitForTimeout(700);
  if (forceLand) { await A.click('#btn-land'); await A.waitForTimeout(900); }
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForSelector('#choice-section:not([hidden])', { timeout: 25000 });

  const whoA = await A.evaluate(() => typeof S !== 'undefined' && S.turn && S.turn.chooserId === myId);
  const whoB = await B.evaluate(() => typeof S !== 'undefined' && S.turn && S.turn.chooserId === myId);
  const chooser = whoA ? A : whoB ? B : null;
  if (!chooser) { console.log('  无抽卡人，跳过'); await ctx.close(); return null; }
  console.log(`  抽卡人 = ${whoA ? 'A' : 'B'}  landui=${await chooser.evaluate(() => LAND.ui)} force=${await chooser.evaluate(() => LAND.force)}`);

  await installSampler(chooser);
  await chooser.evaluate(() => window.__go());
  await chooser.click('#card-truth');
  if (rotateAt) {
    await chooser.waitForTimeout(rotateAt);
    console.log(`  ↻ 第 ${rotateAt}ms 转到横屏 ${vp.width > vp.height ? '(转竖屏)' : '(转横屏)'}`);
    await chooser.setViewportSize({ width: vp.height, height: vp.width });
  }
  await chooser.waitForTimeout(6200);
  const s = await chooser.evaluate(() => window.__stop());
  const r = analyze(label, s);
  // 稳态：牌堆 / 中央卡 / 座位 的矩形 + Cam.focus 会算出什么机位（不施加）
  const tg = await chooser.evaluate(() => {
    const b = Cam.baseOf(Cam.curScreen);
    const mx = LAND.ui ? 16 : 46, my = LAND.ui ? 12 : 34;
    const vw = LAND.force ? window.innerHeight : window.innerWidth;
    const vh = LAND.force ? window.innerWidth : window.innerHeight;
    const of = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const vis = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const c = landPick(vis.x, vis.y);                    // 屏幕坐标 → 镜头坐标系
      const nx = (c.x - vw / 2) / vw, ny = (c.y - vh / 2) / vh;
      const raw = [-nx * 190, -ny * 150];
      return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        vis: [Math.round(vis.x), Math.round(vis.y)], local: [Math.round(c.x), Math.round(c.y)],
        want: [Math.round(raw[0]), Math.round(raw[1])],
        got: [Math.round(Math.max(-mx, Math.min(mx, raw[0]))), Math.round(Math.max(-my, Math.min(my, raw[1])))] };
    };
    const seatRing = document.querySelector('#game-players-grid .player-card.active .avatar-ring') || document.querySelector('#game-players-grid .player-card .avatar-ring');
    return { base: { ...b }, clamp: [mx, my], lv: [vw, vh], deck: of(document.getElementById('deck')),
      card: of(document.getElementById('card-section')), seat: of(seatRing), cur: { ...Cam.cur }, ui: LAND.ui, force: LAND.force };
  });
  console.log('  稳态 base=' + JSON.stringify(tg.base) + ' clamp=' + JSON.stringify(tg.clamp) + ` 逻辑视口=${JSON.stringify(tg.lv)} ui=${tg.ui} force=${tg.force}`);
  console.log('  Cam.cur=' + JSON.stringify({ x: +tg.cur.x.toFixed(1), y: +tg.cur.y.toFixed(1), z: +tg.cur.z.toFixed(1), s: +tg.cur.s.toFixed(3) }));
  for (const k of ['deck', 'card', 'seat']) {
    if (!tg[k]) { console.log(`  ${k}: (无)`); continue; }
    console.log(`  ${k}: 屏幕=${JSON.stringify(tg[k].rect)} 中心屏幕=${JSON.stringify(tg[k].vis)} 中心镜头系=${JSON.stringify(tg[k].local)}`
      + ` → 目标 x/y=${JSON.stringify(tg[k].want)} 夹紧后=${JSON.stringify(tg[k].got)} z=${(tg.base.z - 20).toFixed(1)}`);
  }
  await chooser.screenshot({ path: `shots/dc-${label}.png`, fullPage: false });
  await ctx.close();
  return r;
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  await scenario(browser, 'portrait', { width: 390, height: 844 });
  await scenario(browser, 'landscape', { width: 844, height: 390 });
  await scenario(browser, 'forced-land', { width: 390, height: 844 }, 0, true);
  await scenario(browser, 'portrait-rotate', { width: 390, height: 844 }, 700);
  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n零 JS 报错 ✅');
  await browser.close();
  server.close();
})();
