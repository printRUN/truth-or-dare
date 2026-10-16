#!/usr/bin/env node
/* ev-tod-fixprobe2.cjs — F3 变体比选（land + landui 844×390）：A=方案拟议(±0.78,+0.14,+0.42)
   B=调优(+0.20,+0.36) C=对照(+0.20,+0.30) → 输出三枚 Sprite/牌堆/双卡 rect。端口 9132。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9132;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SETPOS = v => {
  const labels = [];
  __three.scene.traverse(o => { if (o.isSprite && Math.abs(o.scale.x - 0.62) < 0.02) labels.push(o); });
  labels.sort((a, b) => a.position.x - b.position.x);
  if (labels.length !== 2) return { err: 'labels=' + labels.length };
  if (!labels[0].__base) { labels[0].__base = { y: labels[0].position.y, z: labels[0].position.z }; labels[1].__base = { y: labels[1].position.y, z: labels[1].position.z }; }   // 首见定格：原始 LOCAL 位（跨 evaluate 持久）
  const b0 = labels[0].__base, b1 = labels[1].__base;
  if (!v) { labels[0].position.set(-0.78, b0.y, b0.z); labels[1].position.set(0.78, b1.y, b1.z); }   // 复原
  else { labels[0].position.set(-0.78, b0.y - 0.80 + v.dy, v.z); labels[1].position.set(0.78, b1.y - 0.80 + v.dy, v.z); }
  return __three.choiceTipRects();
};
const GEO = () => {
  const cv = document.getElementById('three-canvas');
  const cw = cv.clientWidth, chh = cv.clientHeight;
  const V = new THREE.Vector3();
  const pr = (pts, tag) => { let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9; for (const p of pts) { V.set(p[0], p[1], p[2]).project(__three.camera); const sx = (V.x + 1) / 2 * cw, sy = (1 - (V.y + 1) / 2) * chh; x1 = Math.min(x1, sx); x2 = Math.max(x2, sx); y1 = Math.min(y1, sy); y2 = Math.max(y2, sy); } return [Math.round(x1), Math.round(y1), Math.round(x2 - x1), Math.round(y2 - y1)]; };
  let deck = null;
  __three.scene.traverse(o => { if (!deck && !o.isSprite && Math.abs(o.position.x - 1.12) < 0.02 && Math.abs(o.position.z - 0.60) < 0.02 && o.children && o.children.length) deck = o; });
  let deckRect = null, truthCard, dareCard;
  if (deck) { const b = new THREE.Box3().setFromObject(deck); deckRect = pr([[b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z]], 'deck'); }
  // 双卡面：LOCAL y 现值即为卡高基准（FELT_Y+localΔ），用任一 label 现位 y-0.80 反推 felt LOCAL
  const labels = []; __three.scene.traverse(o => { if (o.isSprite && Math.abs(o.scale.x - 0.62) < 0.02) labels.push(o); });
  labels.sort((a, b) => a.position.x - b.position.x);
  const feltL = labels.length ? (labels[0].__base ? labels[0].__base.y : labels[0].position.y) - 0.80 : 0;   // 基准 LOCAL felt（const 1.77-0.80）
  truthCard = pr([[-1.08, feltL + 0.02, -0.54], [-0.48, feltL + 0.02, -0.54], [-1.08, feltL + 0.02, 0.30], [-0.48, feltL + 0.02, 0.30]], 'tc');
  dareCard = pr([[0.48, feltL + 0.02, -0.54], [1.08, feltL + 0.02, -0.54], [0.48, feltL + 0.02, 0.30], [1.08, feltL + 0.02, 0.30]], 'dc');
  const sa = document.getElementById('stage-actions');
  return { deck: deckRect, truthCard, dareCard, stageActions: sa && sa.getBoundingClientRect ? (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(sa.getBoundingClientRect()) : null, cls: document.body.className };
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
  await sleep(3600);

  for (const vp of [{ w: 1280, h: 800, tag: 'land' }, { w: 390, h: 844, tag: 'por' }, { w: 844, h: 390, tag: 'landui' }]) {
    await p1.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(1600);
    const g = await p1.evaluate(GEO);
    console.log(`\n══ ${vp.tag} ${vp.w}×${vp.h} ══ body=[${g.cls}]`);
    console.log('  deck', JSON.stringify(g.deck), 'truthCard', JSON.stringify(g.truthCard), 'dareCard', JSON.stringify(g.dareCard), 'stageActions', JSON.stringify(g.stageActions));
    for (const [tag, v] of [['A 拟议+0.14/+0.42', { dy: 0.14, z: 0.42 }], ['B 调优+0.20/+0.36', { dy: 0.20, z: 0.36 }], ['C +0.20/+0.30', { dy: 0.20, z: 0.30 }]]) {
      const r = await p1.evaluate(SETPOS, v);
      if (r.err) { console.log(' ', tag, r.err); continue; }
      console.log(`  ${tag}: truth`, JSON.stringify(r.truth), 'dare', JSON.stringify(r.dare), 'hint', JSON.stringify(r.hint));
    }
    await p1.screenshot({ path: path.join(ROOT, '.pw', 'shots', `fixprobe2-${vp.tag}.png`) });
    await p1.evaluate(SETPOS, null);   // 复原
    await sleep(200);
  }
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
