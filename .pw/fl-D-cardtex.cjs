// 快速诊断：题面纹理读回（qCanvas 内容 / needsUpdate / 材质状态）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8841;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-D]', ...a);
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const P = await ctx.newPage();
  P.on('pageerror', e => console.log('PERR', e.message));
  await P.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await P.fill('#input-name', '阿泽');
  await P.click('details.adv summary'); await P.click('#chk-local');
  await P.click('.avatar-option >> nth=0'); await P.click('#btn-join');
  await P.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await P.evaluate(() => {
    mutate(s => s.players.push({ id: 'zz0', name: '小雨', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
  });
  await P.click('#btn-start');
  await P.waitForSelector('#screen-game.active', { timeout: 15000 });
  await P.waitForTimeout(2200);
  // 若 chooser 不是我，就先把轮次让出去（快速接受一轮）——不行，zz0 不会动。直接看 chooser：
  const chooser = await P.evaluate(() => ({ chooser: S.turn.chooserId, me: myId }));
  log('chooser', JSON.stringify(chooser));
  if (chooser.chooser !== chooser.me) {
    // 若轮到 zz0（假人），用 free 局重开一局保证 P 先手可控
    log('chooser is bot → 换抢麦局');
    await P.evaluate(() => switchMode('free'));
    await P.waitForTimeout(600);
  }
  await P.evaluate(() => document.getElementById('card-dare').click());
  await P.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
  await P.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
  await P.waitForTimeout(2500);
  const tex = await P.evaluate(() => {
    const th = window.__three;
    let card = null;
    th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) card = o; });
    if (!card) return 'no-card';
    const faceMat = Array.isArray(card.material) ? card.material[3] : card.material;
    const m = faceMat.map;
    const img = m && m.image;
    const out = {
      matType: faceMat.type, hasMap: !!m, texVersion: m ? m.version : -1,
      canvasSize: img ? [img.width, img.height] : null,
      flipRotX: +card.parent.rotation.x.toFixed(3), cardVisible: card.visible && card.parent.visible,
    };
    if (img && img.getContext) {
      const g = img.getContext('2d');
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let lit = 0, colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 40)) lit++;
        if (d[i + 3] > 0 && Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) > 30) colored++;
      }
      out.paintedPixels = lit;
      out.coloredPixels = colored;   // 橙色徽章等
      // 顶部 100 行取样：徽章区应有橙色
      out.sample = [];
      for (let y = 60; y < 90; y += 6) { const i = (y * img.width + 256) * 4; out.sample.push([d[i], d[i + 1], d[i + 2]]); }
    }
    return out;
  });
  console.log('TEX:', JSON.stringify(tex, null, 1));
  const clip = await P.evaluate(() => {
    const th = window.__three;
    th.scene.updateMatrixWorld();
    let card = null;
    th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) card = o; });
    if (!card) return null;
    const v = card.getWorldPosition(new THREE.Vector3()).project(th.camera);
    const r = document.getElementById('three-canvas').getBoundingClientRect();
    const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
    return { x: Math.max(50, Math.round(x - 140)), y: Math.max(50, Math.round(y - 190)), width: 280, height: 380 };
  });
  if (clip) await P.screenshot({ clip, path: path.join(SHOTS, 'fl-D-card-clip.png') });
  await P.screenshot({ path: path.join(SHOTS, 'fl-D-full.png') });
  await browser.close(); server.close();
})();
