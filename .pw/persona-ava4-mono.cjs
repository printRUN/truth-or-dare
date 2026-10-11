// persona-ava4-mono.cjs — 4 人本地热座「玩家模拟」走查：3D 头像/棋子可区分性取证（端口 9081，inspect=1 真机路径）
// 不改游戏代码：真实 UI 流（高级选项展开→加座→改名→开始热座→交接卡→掷骰→买地/租金），
// __mono 仅用只读取证访问器（faces/rigSnap/pawnWorld/state）；投影/量像素为探针自挂 helper，非游戏面。
// 可复跑：node .pw/persona-ava4-mono.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9081;   // 在册端口 8731-9079/9145/9149 均避开
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const NAMES = ['阿泽', '老白', '婷婷', '小美'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = (pg, name) => pg.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  console.log(`# http://127.0.0.1:${PORT}/monopoly.html?inspect=1`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => {
    try { localStorage.clear(); localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {}
  });

  // ── A. 真实 UI 开局流：setup → 高级选项 → 4 座位全真人 → 改名 ──
  await page.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const s = document.getElementById('setup'); return s && !s.hidden; }, null, { timeout: 30000 });
  await page.click('#adv-box summary');
  await page.click('#seat-plus');
  await page.click('#seat-plus');
  const toggles = await page.$$('#seat-rows .bot-toggle');
  await toggles[1].click();   // 初始第 2 座默认挂机器人：点成真人
  const inputs = await page.$$('#seat-rows input');
  for (let i = 0; i < 4; i++) await inputs[i].fill(NAMES[i]);
  const botsOn = await page.$$eval('#seat-rows .bot-toggle.on', els => els.length);
  ok(botsOn === 0, `4 座位全真人（机器人开关亮着 ${botsOn} 个）`);
  ok((await page.$$eval('#seat-rows input', els => els.map(e => e.value))).join('/') === NAMES.join('/'), `座位名=${NAMES.join('/')}`);
  await page.bringToFront(); await sleep(300);
  await shot(page, 'persona-ava4-mono-1-setup.png');
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__mono && window.__mono.state.players.length === 4 && window.__mono.state.phase === 'HANDOFF', null, { timeout: 30000 });
  ok(true, '开局：G.players=4，进 HANDOFF');
  await sleep(2600);   // 开局落场动画收尾

  // 头像特征（v4 B1 契约翻转）：热座座位 seatAvatarRep 自动派发 dcb → 全员特征化头且两两互异（验收线4）
  await page.waitForFunction(() => window.__mono && window.__mono.faces().length === 4 && window.__mono.faces().every(f => f && !f.fb && f.loaded && f.style), null, { timeout: 25000 });   // rIC 提取队列落位再断言
  const faces = await page.evaluate(() => window.__mono.faces());
  ok(faces.length === 4 && faces.every(f => f && !f.fb && f.loaded && f.style && f.key.startsWith(faces.indexOf(f) + '|data:image/svg')),
    `全员 dcb 特征头（style=${faces.map(f => f.style).join('/')}）`);
  ok(new Set(faces.map(f => f.hair + '|' + f.style)).size === 4, `四座两两互异（${faces.map(f => f.style + '/' + f.hair).join(' vs ')}）`);

  // 投影/量像素 helper（探针自挂，只读）
  await page.evaluate(() => {
    window.__probe = () => {
      const v = new THREE.Vector3();
      const pr = (x, y, z) => { v.set(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
      const out = [];
      pawnObjs.forEach((g, i) => {
        if (!g || !g.visible) { out.push(null); return; }
        const p = g.position;
        const hc = new THREE.Vector3(p.x, p.y + 0.46, p.z);
        const d = camera.position.distanceTo(hc);
        const k = (innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360))) / d;   // px per world unit @该深度
        const c = pr(p.x, p.y + 0.46, p.z);
        const top = pr(p.x, p.y + 0.52, p.z);
        const base = pr(p.x, p.y, p.z);
        out.push({ i, d: +d.toFixed(2), headW: +(0.2 * k).toFixed(1), fullH: +Math.abs(base.y - top.y).toFixed(1), plateW: +(0.86 * k).toFixed(1), cx: Math.round(c.x), cy: Math.round(c.y) });
      });
      return { vw: innerWidth, vh: innerHeight, pawns: out, rig: window.__mono.rigSnap(), phase: window.__mono.state.phase, turn: window.__mono.state.turn };
    };
  });
  const crop = async (tag) => {
    const m = await page.evaluate(() => window.__probe());
    for (const p of m.pawns) {
      if (!p) continue;
      const S = 250, x = Math.max(0, Math.min(m.vw - S, p.cx - S / 2)), y = Math.max(0, Math.min(m.vh - S, p.cy - S / 2));
      await page.screenshot({ path: path.join(SHOTS, `persona-ava4-mono-${tag}-p${p.i}${NAMES[p.i]}.png`), clip: { x, y, width: S, height: S } });
    }
    return m;
  };

  // ── B. 交接卡（阿泽）：热座「这步是谁的」第一现场 ──
  await page.bringToFront();
  await page.waitForFunction(() => !document.getElementById('handoff').hidden, null, { timeout: 20000 });
  const handName = await page.$eval('#handoff-name', e => e.textContent);
  ok(handName.includes(NAMES[0]), `交接卡点名=${handName}`);
  await shot(page, 'persona-ava4-mono-2-handoff.png');
  await page.click('#btn-handoff-go');

  // ── C. 默认镜头全景（AWAIT_ROLL，4 子聚 GO）+ 逐子放大 + 像素测量 ──
  await page.waitForFunction(() => window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 20000 });
  await page.bringToFront(); await sleep(800);
  await shot(page, 'persona-ava4-mono-3-panorama-go.png');
  let m = await crop('4-crop-go');
  console.log('# 量测@全景(GO)：', JSON.stringify({ phase: m.phase, rig: m.rig, pawns: m.pawns }));
  const goMeas = m;

  // ── D. 真人推进回合（真点击：交接→掷骰→买地；doubles 连掷； opportunistic 抓 租金/入狱/走位 现场）──
  let turns = 0, shotsLeft = { mid: 2, rent: 1, jail: 1, spread: 1 }, spreadMeas = null;
  const rentLog = [];
  const drive = async () => {
    for (let guard = 0; guard < 400; guard++) {
      const st = await page.evaluate(() => {
        const $ = id => document.getElementById(id);
        return {
          over: window.__mono.state.phase === 'OVER',
          hand: !$('handoff').hidden,
          buy: !$('buy-modal').hidden,
          gen: !$('gen-modal').hidden,
          bar: $('action-bar').classList.contains('show'),
          who: ($('action-who') || {}).textContent || '',
          toast: $('toast').textContent || '',
          phase: window.__mono.state.phase,
        };
      });
      if (st.over) return { done: true };
      if (st.hand) {
        await page.click('#btn-handoff-go');
        continue;
      }
      if (st.buy) {
        if (!st.buyShot && shotsLeft.buy !== 0) { /* 买地弹窗第一现场 */ }
        await page.click('#btn-buy-yes');
        continue;
      }
      if (st.gen) { const b = await page.$('#gen-actions button'); if (b) { await b.click(); continue; } }
      if (st.bar && st.phase === 'AWAIT_ROLL') return st;
      if (/租金/.test(st.toast) && shotsLeft.rent > 0) {
        shotsLeft.rent--; rentLog.push(st.toast);
        await page.bringToFront();
        await shot(page, 'persona-ava4-mono-6-rent.png');
        console.log('# 抓到租金现场:', st.toast);
      }
      await page.waitForTimeout(180);
    }
    return { done: true };
  };
  while (turns < 10 && shotsLeft.spread >= 0) {
    const st = await drive();
    if (st.done || st.over) break;
    turns++;
    const who = st.who || '(?)';
    if (/狱中/.test(who) && shotsLeft.jail > 0) {
      shotsLeft.jail--;
      await page.bringToFront(); await sleep(400);
      await shot(page, 'persona-ava4-mono-7-jail.png');
      console.log('# 抓到入狱回合:', who);
    }
    await page.waitForSelector('#act-roll', { timeout: 30000 });
    await page.click('#act-roll');
    await sleep(700);   // 摇骰+起步走位
    if (shotsLeft.mid > 0) {
      shotsLeft.mid--;
      await page.bringToFront();
      await shot(page, `persona-ava4-mono-5-move-${turns}.png`);
      const mm = await page.evaluate(() => window.__probe());
      console.log('# 量测@走位推近：', JSON.stringify({ turn: mm.turn, rig: mm.rig, pawns: mm.pawns }));
    }
    // 中盘散开后：再来一组逐子放大 + 量测（此时 4 子分布各格）
    if (turns === 5 && shotsLeft.spread > 0) {
      const st2 = await drive();   // 推到下一次可行动点（全景档）
      if (st2.bar && st2.phase === 'AWAIT_ROLL') {
        shotsLeft.spread--;
        await page.bringToFront(); await sleep(600);
        await shot(page, 'persona-ava4-mono-8-panorama-mid.png');
        spreadMeas = await crop('9-crop-mid');
        console.log('# 量测@中盘全景：', JSON.stringify({ turn: spreadMeas.turn, rig: spreadMeas.rig, pawns: spreadMeas.pawns }));
        await page.waitForSelector('#act-roll', { timeout: 30000 });
        await page.click('#act-roll');
        await sleep(700);
      }
    }
    await sleep(600);
  }
  ok(turns >= 5, `真人推进 ${turns} 次掷骰（含交接卡/买地/连掷）`);

  // ── E. 收尾全景 + 2D HUD 轮次条取证 ──
  await drive();
  await page.bringToFront(); await sleep(600);
  await shot(page, 'persona-ava4-mono-10-final.png');
  const hud = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('#players-bar .pchip')].map(c => ({ t: c.textContent.trim().replace(/\s+/g, ' '), on: c.classList.contains('active') })),
    actionWho: (document.getElementById('action-who') || {}).textContent || '',
    pos: window.__mono.state.players.map(p => p.pos),
    cash: window.__mono.state.players.map(p => p.cash),
  }));
  console.log('# HUD 玩家条:', JSON.stringify(hud.chips));
  console.log('# 座位pos/cash:', JSON.stringify(hud.pos), JSON.stringify(hud.cash));

  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 3).join(' | ') || 'clean'}）`);
  console.log(`\nGO 全景量测: ${JSON.stringify(goMeas && goMeas.pawns)}`);
  if (goMeas && goMeas.pawns) {   // 验收线3：全景档行动者 100% 画内 + 四子可见 ≥3/4（vh 内且 cy≤vh-40）
    const vh = goMeas.vh || 800;
    const inF = goMeas.pawns.filter(q => q.cy > 0 && q.cy < vh - 40 && q.cx > 30 && q.cx < (goMeas.vw || 1280) - 30);
    ok(inF.length === goMeas.pawns.length, `GO 全景四子全入画（${inF.length}/${goMeas.pawns.length}，cy=${goMeas.pawns.map(q => q.cy).join(',')}）`);
  }
  if (spreadMeas) console.log(`中盘量测: ${JSON.stringify(spreadMeas.pawns)}`);
  if (rentLog.length) console.log(`租金 toast: ${rentLog.join(' | ')}`);
  await browser.close();
  server.close();
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
