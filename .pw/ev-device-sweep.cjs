#!/usr/bin/env node
/* ev-device-sweep.cjs — 全设备矩阵遮挡扫描（用户 2026-10-16：手机/PC/平板适配还是有遮挡），端口 9137。
   10 档视口（手机竖/平板横竖/PC）× 2P/3P 选卡态（主持人=持麦人视角），量化：
   ① 头圆（3D chars y1.33/1.56 + .tp 头）× 全部信息元素（含 net-chip/标题区）深≥0.12 判违规；
   ② 信息牌×信息牌 互交 ≥400px（同带互叠）。逐视口截图存证。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9137;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEASURE = () => {
  const out = { heads: [], hits: [], stacks: [] };
  const cv = document.getElementById('three-canvas');
  if (!cv || !window.__three || !__three.chars) return out;
  const cw = cv.clientWidth, chh = cv.clientHeight;
  const V = new THREE.Vector3();
  const proj = (x, y, z) => { V.set(x, y, z).project(__three.camera); return { x: (V.x + 1) / 2 * cw, y: (1 - (V.y + 1) / 2) * chh }; };
  __three.chars.forEach((ch, pid) => {
    if (!ch.visible) return;
    const c = ch.position;
    const ctr = proj(c.x, 1.33, c.z), top = proj(c.x, 1.56, c.z);
    out.heads.push({ pid, local: pid === myId, cx: ctr.x, cy: ctr.y, r: Math.max(8, Math.abs(ctr.y - top.y)) });
  });
  const tb = document.querySelector('#tp-back .tp-head');
  if (tb) { const r = tb.getBoundingClientRect(); if (r.width > 4) out.heads.push({ pid: '__me_tp__', local: true, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.max(r.width, r.height) / 2 }); }
  const SEL = '#turn-info,#pick-tip,#choice-hint,.stat-chip,.net-chip,h1,.player-card .score-tag,.player-card .combo-tag,.player-card .host-tag,.player-card .skip-badge,.player-card .player-name,.player-card .active-badge,#stage-actions,#bet-box,.tool-row,#tools-fab,#stake-row,#reveal-wait,.btn-ans';
  const els = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    let r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(pcs.overflowX)) {
        const pr = p.getBoundingClientRect();
        const x1 = Math.max(r.x, pr.x), x2 = Math.min(r.x + r.width, pr.x + pr.width);
        if (x2 - x1 < 4) { r = null; break; }
        r = { x: x1, y: r.y, width: x2 - x1, height: r.height };
        break;
      }
      p = p.parentElement;
    }
    if (!r || r.width < 2 || r.height < 2) continue;
    els.push({ el, tag: (el.id ? '#' + el.id : '') + (typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 10), x: r.x, y: r.y, w: r.width, h: r.height });
  }
  const saEl = document.getElementById('stage-actions');
  const inPanel = el => /tool-row|bet-box/.test(el.tag) || !!(saEl && saEl.contains(el.el));
  for (const e of els) {
    for (const h of out.heads) {
      const nx = Math.max(e.x, Math.min(h.cx, e.x + e.w)), ny = Math.max(e.y, Math.min(h.cy, e.y + e.h));
      const d = Math.hypot(h.cx - nx, h.cy - ny);
      if (d < h.r) {
        if (h.local && inPanel(e)) continue;   // 本地分身×底部HUD/交互面板族豁免（既定）
        out.hits.push({ head: h.pid.slice(0, 6) + (h.local ? '(me)' : ''), el: e.tag + '"' + e.txt + '"', deep: +Math.min(1, (h.r - d) / (2 * h.r)).toFixed(2) });
      }
    }
  }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;   // 父子包含（桥面板⊃卡/加倍钮）不是互叠
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const ar = x2 > x1 && y2 > y1 ? (x2 - x1) * (y2 - y1) : 0;
    if (ar > 400) out.stacks.push({ a: a.tag + '"' + a.txt + '"', b: b.tag + '"' + b.txt + '"', px: Math.round(ar) });
  }
  out.hits.sort((a, b) => b.deep - a.deep);
  out.stacks.sort((a, b) => b.px - a.px);
  return out;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
  const open = async tag => { const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {}); return p; };
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local'); await p.fill('#input-name', name);
    if (room) await p.fill('#input-room', room);
    await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  };
  const VPS = [
    { w: 390, h: 844, tag: 'phone-por' }, { w: 375, h: 667, tag: 'phone-se' }, { w: 414, h: 896, tag: 'phone-plus' }, { w: 360, h: 640, tag: 'phone-s' },
    { w: 717, h: 777, tag: 'sq-user' }, { w: 768, h: 1024, tag: 'ipad-por' }, { w: 820, h: 1180, tag: 'ipadair-por' },
    { w: 1180, h: 820, tag: 'ipad-land' }, { w: 1024, h: 768, tag: 'ipad-land-s' }, { w: 844, h: 390, tag: 'phone-land' },
    { w: 1280, h: 800, tag: 'pc' }, { w: 1920, h: 1080, tag: 'pc-fhd' },
  ];
  let fail = 0;
  const report = {};
  for (const playerN of [2, 3]) {
    const H = await open('H'); await join(H, '阿泽', '');
    const room = (await H.textContent('#share-room')).trim();
    const others = [];
    for (let i = 1; i < playerN; i++) { const q = await open('P' + i); await join(q, i === 1 ? '老白' : '默认仔', room); others.push(q); }
    await H.waitForFunction(n => typeof S !== 'undefined' && S.players.length === n, playerN, { timeout: 20000 });
    await H.evaluate(() => mutate(s => { s.players[1].score = 33; s.players[1].combo = 2; }));
    await H.click('#btn-start');
    await H.waitForSelector('#screen-game.active', { timeout: 20000 });
    await H.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    for (const p of [H, ...others]) await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    await sleep(4000);
    for (const v of VPS) {
      await H.setViewportSize({ width: v.w, height: v.h });
      await sleep(2600);
      const m1 = await H.evaluate(MEASURE);
      await sleep(900);
      const m2 = await H.evaluate(MEASURE);
      // 稳态过滤：两次采样都命中的才算（滤 resize 后相机/名牌过渡态）
      const key = h => h.head + '|' + h.el + '|' + h.deep;
      const m1keys = new Set(m1.hits.filter(h => h.deep >= 0.12).map(key));
      const bad = m2.hits.filter(h => h.deep >= 0.12 && m1keys.has(key(h)));
      const s1keys = new Set(m1.stacks.map(s => s.a + '|' + s.b));
      const stacks = m2.stacks.filter(s => s1keys.has(s.a + '|' + s.b));
      report[`${playerN}P-${v.tag}`] = m2;
      const flag = bad.length || stacks.length;
      if (bad.length) fail++;
      console.log(`${flag ? '■' : ' '} ${playerN}P ${v.tag} ${v.w}×${v.h}: 压头${bad.length} 互叠${stacks.length}`);
      bad.slice(0, 4).forEach(h => console.log(`    头[${h.head}] × ${h.el} deep=${h.deep}`));
      stacks.slice(0, 4).forEach(s => console.log(`    叠 ${s.px}px ${s.a} × ${s.b}`));
      await H.screenshot({ path: path.join(SHOTS, `sweep-${playerN}P-${v.tag}.png`) });
    }
    await H.close(); for (const q of others) await q.close();
  }
  fs.writeFileSync(path.join(SHOTS, 'device-sweep.json'), JSON.stringify(report, null, 1));
  console.log(fail ? `■ 扫描完成：${fail} 个视口有压头违规（明细见上）` : '扫描完成：全矩阵零压头');
  await browser.close(); server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
