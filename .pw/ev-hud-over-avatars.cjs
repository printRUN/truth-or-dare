#!/usr/bin/env node
/* ev-hud-over-avatars.cjs — 「信息牌盖头」取证（用户 2026-10-11：所有游戏的人物显示不能被信息遮住，除非弹窗），端口 9079：
   ① tod three3d：3 人局 choosing/revealed 两阶段 × 3 视口（390×844 / 849×825 用户近似 / 1280×800），
      页内投影 __three.camera+chars 算每个头屏幕圆，与每张信息牌 rect 求交 → 重叠 px/占头面积比。
      .tp（自己）的头= DOM #tp-back .tp-head，同表量化。
   ② monopoly / uno / bombcat：net autotest 对局态截图（竖屏+横屏），重叠判定交视觉评审。
   断言纪律： tod 重叠数字为准；截图仅评审证据附件。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9079;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
const shot = async (p, name) => { await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); console.log('  📸', name); };

// 页内量化：头屏幕圆（3D chars 投影 + .tp-back .tp-head DOM）vs 信息牌 rect → 重叠清单
const MEASURE = () => {
  const out = { heads: [], hits: [], canvas: null };
  const cv = document.getElementById('three-canvas');
  if (!cv || !window.__three || !__three.chars) return out;
  const cw = cv.clientWidth, chh = cv.clientHeight;
  out.canvas = { x: 0, y: 0, w: cw, h: chh };
  const V = new THREE.Vector3();
  const proj = (x, y, z) => { V.set(x, y, z).project(__three.camera); return { x: (V.x + 1) / 2 * cw, y: (1 - (V.y + 1) / 2) * chh }; };
  __three.chars.forEach((ch, pid) => {
    const c = ch.position;
    const ctr = proj(c.x, 1.33, c.z), top = proj(c.x, 1.56, c.z);
    if (!out.heads.some(h => h.pid === pid)) out.heads.push({ pid, kind: '3d', cx: ctr.x, cy: ctr.y, r: Math.max(6, Math.abs(ctr.y - top.y)) });
  });
  const tb = document.querySelector('#tp-back .tp-head');
  if (tb) { const r = tb.getBoundingClientRect(); if (r.width > 4) out.heads.push({ pid: '__me_tp__', kind: 'dom', cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.max(r.width, r.height) / 2 }); }
  const SEL = '.player-card .score-tag,.player-card .combo-tag,.player-card .host-tag,.player-card .skip-badge,.player-card .off-badge,.player-card .me-tag,.player-card .player-name,.player-card .active-badge,#turn-info,#choice-hint,#pick-tip';
  const els = [...document.querySelectorAll(SEL)];
  document.querySelectorAll('.stat-chip').forEach(el => { if (el.offsetParent || el.getClientRects().length) els.push(el); });
  const clipBox = el => {   // 裁剪感知：横滚容器（stats-row overflow-x:auto）里被滚出/裁掉的芯片不可见，
    // rect 却仍报全宽——不裁剪会把不可见内容算成压头（landui 领先芯片假阳性实证）
    let r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        const x1 = Math.max(r.x, pr.x), x2 = Math.min(r.x + r.width, pr.x + pr.width);
        if (x2 - x1 < 4) return null;   // 可见部分 <4px = 视觉上不存在
        r = { x: x1, y: r.y, width: x2 - x1, height: r.height };
        break;
      }
      p = p.parentElement;
    }
    return r;
  };
  els.forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const r = clipBox(el);
    if (!r) return;
    if (r.width < 2 || r.height < 2) return;
    const box = { x: r.x, y: r.y, w: r.width, h: r.height, cls: (el.className || el.id || '').toString().slice(0, 40), txt: (el.textContent || '').trim().slice(0, 14) };
    out.heads.forEach(h => {
      const nx = Math.max(box.x, Math.min(h.cx, box.x + box.w)), ny = Math.max(box.y, Math.min(h.cy, box.y + box.h));
      const d = Math.hypot(h.cx - nx, h.cy - ny);
      if (d < h.r) {
        const cover = Math.min(1, (h.r - d) / (2 * h.r));   // 深入度近似：0=擦边 0.5=圆心被盖
        out.hits.push({ head: h.pid, el: box.cls, txt: box.txt, deep: +cover.toFixed(2), elBox: [Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)], headBox: [Math.round(h.cx - h.r), Math.round(h.cy - h.r), Math.round(h.r * 2), Math.round(h.r * 2)] });
      }
    });
  });
  out.hits.sort((a, b) => b.deep - a.deep);
  return out;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const report = {};

  /* ═══ ① tod three3d ═══ */
  console.log('── tod ──');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
    const openTab = async tag => {
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(tag + ':' + e.message));
      await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
      await sleep(250);
      return p;
    };
    const join = async (p, name, room) => {
      const adv = await p.$('details.adv');
      if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
      await p.click('#chk-local');
      await p.fill('#input-name', name);
      if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
      await p.click('.avatar-option >> nth=0');
      await p.click('#btn-join');
      await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    };
    const host = await openTab('H');
    await join(host, '阿泽', '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab('P1'); await join(t2, '老白', room);
    const t3 = await openTab('P2'); await join(t3, '默认仔', room);
    await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
    // 竖屏冷启：开局前先落到 390×844（真实手机路径——不是桌面尺寸再 resize）
    await host.setViewportSize({ width: 390, height: 844 });
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    // 徽章全开：分数/连击/主持人（host 徽章天然在）——对齐用户截图里的信息量
    await host.evaluate(() => mutate(s => { s.players[0].score = 33; s.players[1].score = 20; s.players[1].combo = 2; s.players[2].score = -5; }));
    await sleep(3600);   // 入场运镜落定 + 滑向持麦人 nudge 落定 + 名牌投影稳定
    await host.bringToFront();

    const VP = [{ w: 390, h: 844, dpr: 2, tag: 'por' }, { w: 849, h: 825, dpr: 1, tag: 'sq' }, { w: 1280, h: 800, dpr: 1, tag: 'land' }, { w: 844, h: 390, dpr: 2, tag: 'landui' }];
    for (const v of VP) {
      await host.setViewportSize({ width: v.w, height: v.h });
      await sleep(1200);   // 相机响应 + 投影落定
      const m = await host.evaluate(MEASURE);
      report[`tod_choosing_${v.tag}`] = m;
      await shot(host, `hudover-tod-choosing-${v.tag}.png`);
      if (!m.heads.length) { fail++; console.log(`  ❌ tod choosing ${v.tag}：量化空转（0 头投影——探针自身失效，不算通过）`); continue; }
      const bad = m.hits.filter(h => h.deep >= 0.12);
      ok(bad.length === 0, `tod choosing ${v.tag}（${v.w}×${v.h}）：无信息牌压头（深≥0.12 的 ${bad.length} 条 / 头 ${m.heads.length} 个）`);
      if (bad.length) bad.slice(0, 8).forEach(h => console.log(`    · [${h.head}] "${h.txt}"(${h.el}) deep=${h.deep} el@${h.elBox} head@${h.headBox}`));
      // 人物完整入画（信息不遮人轮新增红线）：头圆必须整体落在画布内（左右各留 4px）
      const oob = m.heads.filter(h => h.cx - h.r < 4 || h.cx + h.r > v.w - 4 || h.cy - h.r < 2 || h.cy + h.r > v.h - 2);
      ok(oob.length === 0, `tod choosing ${v.tag}：全部头像完整入画（出界 ${oob.length} 个）`);
      if (oob.length) oob.forEach(h => console.log(`    · 头 [${Math.round(h.cx)},${Math.round(h.cy)}) r=${Math.round(h.r)} 越界`));
    }
    // revealed 阶段（真路径：主持人翻牌）
    await host.setViewportSize({ width: 390, height: 844 });
    await sleep(900);
    const chose = await host.evaluate(() => { const b = document.querySelector('#card-truth'); if (b) { b.click(); return true; } return false; });
    await sleep(2600);
    if (chose) {
      const m2 = await host.evaluate(MEASURE);
      report.tod_revealed_por = m2;
      await shot(host, 'hudover-tod-revealed-por.png');
      if (!m2.heads.length) { fail++; console.log('  ❌ tod revealed：量化空转（探针自身失效）'); }
      else {
        const bad2 = m2.hits.filter(h => h.deep >= 0.12);
        ok(bad2.length === 0, `tod revealed por：无信息牌压头（${bad2.length} 条 / 头 ${m2.heads.length} 个）`);
        if (bad2.length) bad2.slice(0, 8).forEach(h => console.log(`    · [${h.head}] "${h.txt}"(${h.el}) deep=${h.deep}`));
      }
    }
    ok(errs.length === 0, `tod 零 pageerror（${errs.length ? errs[0] : ''}）`);
    await ctx.close();
  } catch (e) { fail++; console.log('  ❌ tod 取证失败:', e.message.slice(0, 160)); }

  /* ═══ ①b tod 2P（用户截图场景：远座头悬在顶部信息带正下方）═══ */
  console.log('── tod 2P ──');
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errs = [];
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
    const openTab = async tag => {
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(tag + ':' + e.message));
      await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
      await sleep(250);
      return p;
    };
    const join = async (p, name, room) => {
      const adv = await p.$('details.adv');
      if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
      await p.click('#chk-local');
      await p.fill('#input-name', name);
      if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
      await p.click('.avatar-option >> nth=0');
      await p.click('#btn-join');
      await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    };
    const host = await openTab('H');
    await join(host, '阿泽', '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab('P1'); await join(t2, '21炸弹2', room);
    await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 2, null, { timeout: 20000 });
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    // 对齐用户截图：远座（对方）= 主持人 + 高分 + 连击
    await host.evaluate(() => mutate(s => { const far = s.players.find(p => p.id !== s.meId && p.id !== myId) || s.players[1]; far.score = 33; far.combo = 2; }));
    await sleep(3600);
    await host.bringToFront();
    for (const [w, h, tag] of [[390, 844, 'por'], [849, 825, 'sq']]) {
      await host.setViewportSize({ width: w, height: h });
      await sleep(1200);
      const m = await host.evaluate(MEASURE);
      report[`tod2p_choosing_${tag}`] = m;
      await shot(host, `hudover-tod2p-choosing-${tag}.png`);
      if (!m.heads.length) { fail++; console.log(`  ❌ tod2p ${tag}：量化空转`); continue; }
      const bad = m.hits.filter(h => h.deep >= 0.12);
      ok(bad.length === 0, `tod2p choosing ${tag}（${w}×${h}）：无信息牌压头（${bad.length} 条 / 头 ${m.heads.length} 个）`);
      if (bad.length) bad.slice(0, 8).forEach(h => console.log(`    · [${h.head}] "${h.txt}"(${h.el}) deep=${h.deep} el@${h.elBox} head@${h.headBox}`));
      const oob = m.heads.filter(h => h.cx - h.r < 4 || h.cx + h.r > w - 4 || h.cy - h.r < 2 || h.cy + h.r > h - 2);
      ok(oob.length === 0, `tod2p choosing ${tag}：全部头像完整入画（出界 ${oob.length} 个）`);
      if (oob.length) oob.forEach(h => console.log(`    · 头 [${Math.round(h.cx)},${Math.round(h.cy)}] r=${Math.round(h.r)} 越界`));
    }
    ok(errs.length === 0, `tod2p 零 pageerror（${errs.length ? errs[0] : ''}）`);
    await ctx.close();
  } catch (e) { fail++; console.log('  ❌ tod2p 取证失败:', e.message.slice(0, 160)); }

  /* ═══ ② monopoly（net autotest 双端）═══ */
  console.log('── monopoly ──');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    const url = (room, role, tag) => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=${room}&q=${tag}&role=${role}`;
    const h = await ctx.newPage(); h.on('pageerror', e => errs.push('mono-h:' + e.message));
    await h.goto(url('77hod', 'host', 'h'), { waitUntil: 'domcontentloaded' });
    await h.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 20000 });
    const j = await ctx.newPage(); j.on('pageerror', e => errs.push('mono-j:' + e.message));
    await j.goto(url('77hod', 'join', 'j') + '&name=头像员', { waitUntil: 'domcontentloaded' });
    await j.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 20000 });
    await h.waitForFunction(() => window.__mono.net().doc.players.length === 2, null, { timeout: 12000 });
    await h.evaluate(() => window.__mono.net().start({}));
    await h.waitForFunction(() => window.__mono.net().doc.started && window.__mono.state.players.length === 2, null, { timeout: 15000 });
    await h.waitForFunction(() => window.__mono.sceneInfo().pawns >= 2, null, { timeout: 15000 });
    await h.bringToFront();
    await sleep(1800);
    for (const [w, ht, tag] of [[390, 844, 'por'], [1280, 800, 'land']]) {
      await h.setViewportSize({ width: w, height: ht });
      await sleep(1400);
      await shot(h, `hudover-mono-${tag}.png`);
    }
    ok(errs.length === 0, `monopoly 零 pageerror（${errs.length ? errs[0] : ''}）`);
    await ctx.close();
  } catch (e) { fail++; console.log('  ❌ monopoly 取证失败:', e.message.slice(0, 160)); }

  /* ═══ ③ uno（net autotest 双端）═══ */
  console.log('── uno ──');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    await ctx.addInitScript(() => { try { localStorage.setItem('uno:avatar', 'dcb:{"s":"adventurer","d":"avaprobeU","b":"e3ece7"}'); } catch (e) {} });
    const url = (role, tag) => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=77uod&q=${tag}&role=${role}`;
    const h = await ctx.newPage(); h.on('pageerror', e => errs.push('uno-h:' + e.message));
    await h.goto(url('host', 'h'), { waitUntil: 'domcontentloaded' });
    await h.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
    const j = await ctx.newPage(); j.on('pageerror', e => errs.push('uno-j:' + e.message));
    await j.goto(url('join', 'j') + '&name=头像员', { waitUntil: 'domcontentloaded' });
    await j.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
    await h.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 12000 });
    await h.evaluate(() => window.__uno.net().start({}));
    await h.waitForFunction(() => window.__uno.state.players.length === 2 && window.__uno.state.players[0].hand.length > 0, null, { timeout: 15000 });
    await h.bringToFront();
    await h.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
    await sleep(1200);
    for (const [w, ht, tag] of [[390, 844, 'por'], [1280, 800, 'land']]) {
      await h.setViewportSize({ width: w, height: ht });
      await sleep(1200);
      await h.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
      await shot(h, `hudover-uno-${tag}.png`);
    }
    ok(errs.length === 0, `uno 零 pageerror（${errs.length ? errs[0] : ''}）`);
    await ctx.close();
  } catch (e) { fail++; console.log('  ❌ uno 取证失败:', e.message.slice(0, 160)); }

  /* ═══ ④ bombcat（3 人热座局）═══ */
  console.log('── bombcat ──');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    const CAST = [{ name: '蓝猫', av: 'bc:210:11' }, { name: '橘猫', av: 'bc:28:22' }, { name: '粉猫', av: 'bc:320:33' }];
    const openTab = async (tag, i) => {
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(tag + ':' + e.message));
      await p.addInitScript(av => { try { localStorage.setItem('cat:av-pick', av); localStorage.removeItem('cat:room'); localStorage.removeItem('cat:me'); } catch (e) {} }, CAST[i].av);
      await p.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
      await sleep(250);
      return p;
    };
    const join = async (p, name, room) => {
      const adv = await p.$('details.adv');
      if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
      await p.click('#chk-local');
      await p.fill('#in-name', name);
      if (room) { await p.click('#in-room'); await p.fill('#in-room', room); }
      await p.click('#btn-join');
      await p.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    };
    const host = await openTab('H', 0);
    await join(host, CAST[0].name, '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab('P1', 1); await join(t2, CAST[1].name, room);
    const t3 = await openTab('P2', 2); await join(t3, CAST[2].name, room);
    await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 20000 });
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    await host.waitForFunction(() => !!window.__bcScene, null, { timeout: 20000 });
    await host.bringToFront();
    await sleep(1800);
    for (const [w, ht, tag] of [[390, 844, 'por'], [1280, 800, 'land']]) {
      await host.setViewportSize({ width: w, height: ht });
      await sleep(1400);
      await shot(host, `hudover-bc-${tag}.png`);
    }
    ok(errs.length === 0, `bombcat 零 pageerror（${errs.length ? errs[0] : ''}）`);
    await ctx.close();
  } catch (e) { fail++; console.log('  ❌ bombcat 取证失败:', e.message.slice(0, 160)); }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(SHOTS, 'hud-over-avatars.json'), JSON.stringify(report, null, 1));
  console.log(`\n■ 取证完成 pass=${pass} fail=${fail}（重叠明细在 .pw/shots/hud-over-avatars.json）`);
  process.exit(fail ? 1 : 0);
})();
