#!/usr/bin/env node
/* ev-tod-fixprobe.cjs — 审查探针：F1 钉带/F2 持麦人牌隐/F3 标签搬位的在页实测，端口 9131。
   3 人局 → land/por/sq 三档：读标签 Sprite 现位 rect → 改写到拟议坐标再读 → 牌堆/双卡投影 rect
   → DOM 关键元素 rect + pick-tip computed style（F4 根因）→ 注入 F1+F2 后截图。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9131;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = proposed => {
  const out = { classes: document.body.className, stage: '' };
  try { out.stage = S.turn.stage; } catch (e) {}
  const cv = document.getElementById('three-canvas');
  const cw = cv.clientWidth, chh = cv.clientHeight;
  const V = new THREE.Vector3();
  const projRect = (pts, tag) => {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const p of pts) { V.set(p[0], p[1], p[2]).project(__three.camera); const sx = (V.x + 1) / 2 * cw, sy = (1 - (V.y + 1) / 2) * chh; x1 = Math.min(x1, sx); x2 = Math.max(x2, sx); y1 = Math.min(y1, sy); y2 = Math.max(y2, sy); }
    return { tag, rect: [Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1)] };
  };
  // 1) 标签 Sprite：现位 / 拟议位
  const labels = [];
  __three.scene.traverse(o => { if (o.isSprite && Math.abs(o.scale.x - 0.62) < 0.02) labels.push(o); });
  labels.sort((a, b) => a.position.x - b.position.x);
  out.labelsNow = labels.map(l => ({ x: +l.position.x.toFixed(2), y: +l.position.y.toFixed(2), z: +l.position.z.toFixed(2) }));
  const feltY = labels.length ? labels[0].position.y - 0.80 : 0.97;
  out.feltY = +feltY.toFixed(3);
  if (proposed && labels.length === 2) {
    labels[0].position.set(-0.78, feltY + proposed.dy, proposed.z);
    labels[1].position.set(0.78, feltY + proposed.dy, proposed.z);
  }
  out.tipRects = __three.choiceTipRects();
  // 2) 牌堆与双卡投影
  let deck = null;
  __three.scene.traverse(o => { if (!deck && !o.isSprite && Math.abs(o.position.x - 1.12) < 0.02 && Math.abs(o.position.z - 0.60) < 0.02 && o.children && o.children.length) deck = o; });
  if (deck) {
    const b = new THREE.Box3().setFromObject(deck);
    out.deckRect = projRect([[b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z]], 'deck');
  }
  out.truthCard = projRect([[-1.08, feltY + 0.05, -0.54], [-0.48, feltY + 0.05, -0.54], [-1.08, feltY + 0.05, 0.30], [-0.48, feltY + 0.05, 0.30]], 'truthCard');
  out.dareCard = projRect([[0.48, feltY + 0.05, -0.54], [1.08, feltY + 0.05, -0.54], [0.48, feltY + 0.05, 0.30], [1.08, feltY + 0.05, 0.30]], 'dareCard');
  // 3) 头（3D chars）+ DOM 关键元素
  out.heads = [];
  __three.chars.forEach((ch, pid) => { const c = projRect([[ch.position.x, 1.33, ch.position.z]], pid).rect; out.heads.push({ pid, c }); });
  const dump = el => {
    if (!el) return null;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], pos: cs.position, top: cs.top, left: cs.left, transform: cs.transform === 'none' ? 'none' : cs.transform.slice(0, 60), width: cs.width, maxw: cs.maxWidth, z: cs.zIndex, pe: cs.pointerEvents, vis: cs.visibility, hidden: el.hidden };
  };
  out.dom = {};
  for (const id of ['pick-tip', 'choice-hint', 'choice-section', 'turn-info', 'stage-actions', 'stake-row']) out.dom[id] = dump(document.getElementById(id));
  out.dom.statsRow = dump(document.querySelector('#cam > .stats-row'));
  out.dom.plates = [...document.querySelectorAll('#game-players-grid .player-card')].map(c => { const r = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { pid: c.dataset.pid, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], vis: cs.visibility, txt: c.textContent.replace(/\s+/g, '').slice(0, 22) }; });
  return out;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
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
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => console.log('ERR', e.message));
  await p1.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await join(p1, '阿泽', '');
  const room = (await p1.textContent('#share-room')).trim();
  for (const n of ['老白', '默认仔']) { const q = await ctx.newPage(); await q.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' }); await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {}); await join(q, n, room); }
  await p1.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
  await p1.click('#btn-start');
  await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
  await p1.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
  await p1.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
  await sleep(3800);

  for (const vp of [{ w: 1280, h: 800, tag: 'land' }, { w: 390, h: 844, tag: 'por' }, { w: 849, h: 825, tag: 'sq' }]) {
    await p1.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(1600);
    const now = await p1.evaluate(PROBE, null);
    console.log(`\n══ ${vp.tag} ${vp.w}×${vp.h} ══ body=[${now.classes}] stage=${now.stage} feltY=${now.feltY}`);
    console.log('  标签现位:', JSON.stringify(now.labelsNow), '→ rect', JSON.stringify(now.tipRects.truth), JSON.stringify(now.tipRects.dare), 'hint', JSON.stringify(now.tipRects.hint));
    console.log('  牌堆rect', JSON.stringify(now.deckRect && now.deckRect.rect), ' truthCard', JSON.stringify(now.truthCard.rect), ' dareCard', JSON.stringify(now.dareCard.rect));
    console.log('  头:', JSON.stringify(now.heads));
    for (const k of ['pick-tip', 'choice-hint', 'choice-section', 'turn-info', 'stake-row', 'stage-actions']) { const d = now.dom[k]; if (d) console.log(`  #${k}`, JSON.stringify(d.rect), d.pos, 'top=' + d.top, 'tf=' + (d.transform || '').slice(0, 40), 'w=' + d.width, 'maxw=' + d.maxw, 'vis=' + d.vis, 'hidden=' + d.hidden); }
    console.log('  statsRow', JSON.stringify(now.dom.statsRow && now.dom.statsRow.rect));
    console.log('  名牌:', JSON.stringify(now.dom.plates));
    // 拟议 F3 坐标实测
    const prop = await p1.evaluate(PROBE, { dy: 0.14, z: 0.42 });
    console.log('  F3拟议(±0.78,+0.14,+0.42):', JSON.stringify(prop.tipRects.truth), JSON.stringify(prop.tipRects.dare), 'hint', JSON.stringify(prop.tipRects.hint));
    // F1+F2 注入后 DOM 复测 + 截图
    await p1.evaluate(() => {
      const st = document.createElement('style'); st.id = 'probe-fix';
      st.textContent = 'body.three3d:not(.loperf):not(.landui) #cam > #choice-section { position: absolute; top: 74px; left: 0; right: 0; margin: 0; transform: none; z-index: 40; pointer-events: none; }'
        + 'body.three3d:not(.loperf) #game-players-grid .player-card.is-chooser { visibility: hidden; }';
      document.head.appendChild(st);
      try {
        const pid = S.turn.chooserId || activePlayerId();
        document.querySelectorAll('#game-players-grid .player-card').forEach(c => c.classList.toggle('is-chooser', c.dataset.pid === pid));
      } catch (e) {}
    });
    await sleep(500);
    const fixed = await p1.evaluate(PROBE, null);
    console.log('  F1后 #choice-section', JSON.stringify(fixed.dom['choice-section'].rect), fixed.dom['choice-section'].pos, 'top=' + fixed.dom['choice-section'].top, ' #choice-hint', JSON.stringify(fixed.dom['choice-hint'].rect), 'vis=' + fixed.dom['choice-hint'].vis);
    console.log('  F2后名牌:', JSON.stringify(fixed.dom.plates.map(p => ({ pid: p.pid, vis: p.vis, rect: p.rect }))));
    await p1.screenshot({ path: path.join(ROOT, '.pw', 'shots', `fixprobe-${vp.tag}.png`) });
    // 复原标签位（下个视口重新现测）
    await p1.evaluate(() => { const st = document.getElementById('probe-fix'); if (st) st.remove(); });
    await p1.evaluate(PROBE, { dy: 0.80, z: -0.12 });
    await sleep(300);
  }
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
