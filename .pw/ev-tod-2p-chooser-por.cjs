#!/usr/bin/env node
/* ev-tod-2p-chooser-por.cjs — 复现用户真机截图：2P 竖屏选卡态、持麦人视角（桥接面板开）。
   端口 9133。量化：顶带各元素 rect 互交 + 北缘头圆 vs 信息牌 + 桌面 hintTip vs 桥面板。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9133;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  const H = await open('H'); await join(H, '阿泽', '');
  const room = (await H.textContent('#share-room')).trim();
  const P1 = await open('P1'); await join(P1, '老白', room);
  await H.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 2, null, { timeout: 20000 });
  await H.evaluate(() => mutate(s => { s.players[1].score = 33; }));
  await H.click('#btn-start');
  await H.waitForSelector('#screen-game.active', { timeout: 20000 });
  await H.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
  for (const p of [H, P1]) await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
  await sleep(4200);
  // 量化：顶带元素互交 + 头圆
  const m = await H.evaluate(() => {
    const out = { els: [], hits: [] };
    const SEL = '#turn-info,#pick-tip,#choice-hint,.stat-chip,.player-card .score-tag,.player-card .host-tag,.player-card .player-name,.player-card,#stage-actions,.choice-card';
    const els = [...document.querySelectorAll(SEL)].map(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { sel: (el.id ? '#' + el.id : '') + (typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14), r: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    }).filter(Boolean);
    out.els = els;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].r, b = els[j].r;
      const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
      const area = x2 > x1 && y2 > y1 ? (x2 - x1) * (y2 - y1) : 0;
      if (area > 40) out.hits.push({ a: els[i].sel + '"' + els[i].txt + '"', b: els[j].sel + '"' + els[j].txt + '"', px: Math.round(area) });
    }
    out.hits.sort((a, b) => b.px - a.px);
    // 3D 头圆 vs 信息牌
    if (window.__three && __three.chars) {
      const cv = document.getElementById('three-canvas');
      const cw = cv.clientWidth, chh = cv.clientHeight;
      const V = new THREE.Vector3();
      out.heads = [];
      __three.chars.forEach((ch, pid) => {
        const c = ch.position;
        V.set(c.x, 1.33, c.z).project(__three.camera);
        out.heads.push({ pid, cx: Math.round((V.x + 1) / 2 * cw), cy: Math.round((1 - (V.y + 1) / 2) * chh) });
      });
    }
    return out;
  });
  console.log('元素清单:');
  m.els.forEach(e => console.log('  ', JSON.stringify(e.r), e.sel, '"' + e.txt + '"'));
  console.log('互交(≥40px):');
  m.hits.slice(0, 12).forEach(h => console.log('  ', h.px + 'px', h.a, ' × ', h.b));
  console.log('头圆:', JSON.stringify(m.heads));
  await H.bringToFront();
  await H.screenshot({ path: path.join(SHOTS, 'tod2p-chooser-por-usercase.png') });
  console.log('📸 tod2p-chooser-por-usercase.png');
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
