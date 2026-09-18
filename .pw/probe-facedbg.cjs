// 调试：曲面脸贴片为什么不渲染
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8864;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror:', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  const q = await ctx.newPage();
  await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await q.fill('#input-name', '小雨');
  await q.click('details.adv summary');
  await q.click('#chk-local');
  await q.click('#input-room');
  await q.fill('#input-room', room);
  await q.click('.avatar-option >> nth=0');
  await q.click('#btn-join');
  await p.waitForFunction(() => S.players.length >= 2, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const lobbyAv = await p.evaluate(() => {
    const img = document.querySelector('#players-grid .player-card .avatar');
    return { src: img ? (img.src || '').slice(0, 40) : null, tag: img ? img.tagName : null };
  });
  console.log('lobby avatar el:', JSON.stringify(lobbyAv));
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForTimeout(2500);
  const dbg = await p.evaluate(() => {
    const out = [];
    for (const [pid, ch] of window.__three.chars) {
      const f = ch.userData.face;
      const mp = f.material.map;
      out.push({
        pid: pid.slice(-4), vis: f.visible,
        geoType: f.geometry.type,
        phi: f.geometry.parameters.phiStart ? [+f.geometry.parameters.phiStart.toFixed(2), +f.geometry.parameters.phiLength.toFixed(2), +f.geometry.parameters.thetaStart.toFixed(2), +f.geometry.parameters.thetaLength.toFixed(2)] : 'circle',
        hasMap: !!mp, mapImg: mp && mp.image ? { w: mp.image.width, h: mp.image.height } : null,
        px: mp && mp.image && mp.image.width ? (function () {
          try {
            const g2 = mp.image.getContext('2d');
            const c = g2.getImageData(128, 128, 1, 1).data, e = g2.getImageData(4, 4, 1, 1).data;
            return { center: [c[0], c[1], c[2], c[3]], corner: [e[3]] };
          } catch (err) { return 'err:' + err.message; }
        })() : null,
        alphaTest: f.material.alphaTest, transparent: f.material.transparent,
        pos: [f.position.x, f.position.y, f.position.z],
        worldZ: (function () { const v = new THREE.Vector3(); f.getWorldPosition(v); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; })(),
      });
    }
    return out;
  });
  console.log(JSON.stringify(dbg, null, 1));
  await browser.close();
  server.close();
})().catch(e => { console.error('fatal:', e); process.exit(1); });
