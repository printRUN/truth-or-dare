// 诊断探针：3D 路径在各阶段是否真的在跑 + 场景被压缩/裁剪的原因
// 用法: node probe-3d-diag.cjs  → 输出 shots/3d-diag-*.png + 每阶段状态 JSON
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8819;
const VW = parseInt(process.argv[2] || '1440', 10), VH = parseInt(process.argv[3] || '900', 10);
const log = (...a) => console.log('[3d-diag]', ...a);

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  // 钉全效：headless 软渲下 perfWatch 会翻 loperf，3D 门禁必须在 WebGL 路径上测
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('P pageerror: ' + e.message));
  const q = await ctx.newPage();
  q.on('pageerror', e => errs.push('Q pageerror: ' + e.message));

  const dump = async (pg, tag) => pg.evaluate(t => {
    const o = { tag: t };
    o.three3d = document.body.classList.contains('three3d');
    o.loperf = document.body.classList.contains('loperf');
    const th = window.__three;
    o.chars = th ? th.chars.size : 'no-__three';
    o.cam = (typeof Cam !== 'undefined' && Cam.cur) ? JSON.parse(JSON.stringify(Cam.cur)) : 'no-cam';
    if (th && th.camera) { const c = th.camera.position; o.glCam = [c.x, c.y, c.z].map(v => +v.toFixed(2)); }
    o.syncLog = (window.__syncLog || []).slice(-3);
    o.syncErr = window.__syncErr || null;
    o.stage = S && S.turn ? S.turn.stage : '-';
    o.players = S && S.players ? S.players.length : 0;
    const cam = document.getElementById('cam'), cv = document.getElementById('three-canvas'), tools = document.getElementById('game-tools');
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    o.camRect = r(cam); o.canvasRect = r(cv); o.toolsRect = r(tools);
    o.canvasW = cv ? cv.width : 0; o.canvasH = cv ? cv.height : 0;
    const deck3d = document.querySelector('.table-deck');
    o.deckRect = r(deck3d);
    return o;
  }, tag).then(o => { log(JSON.stringify(o)); return o; });

  await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await q.fill('#input-name', '小雨');
  await q.click('details.adv summary');
  await q.click('#chk-local');
  await q.click('#input-room');
  await q.fill('#input-room', room);
  await q.click('.avatar-option >> nth=0');
  await q.click('#btn-join');
  await p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await q.waitForTimeout(800);
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForTimeout(2500);
  await dump(p, 'P-choosing');
  await dump(q, 'Q-choosing');
  await p.screenshot({ path: 'shots/3d-diag-choosing.png' });

  // 推进一轮：chooser 选大冒险 → drawing → revealed → accept
  const mine = await p.evaluate(() => S.turn.chooserId === myId);
  const chooser = mine ? p : q, other = mine ? q : p;
  const cTag = mine ? 'P' : 'Q', oTag = mine ? 'Q' : 'P';
  // 双路径选卡（评审指令）：① DOM 兼容路径 = evaluate 级 click（three3d 下 DOM 选卡 opacity0.001+pointer-events:none，
  // Playwright 合法性检查会误判 #cam 拦截；evaluate click 直接触发绑定 handler）；② raycast 真路径用 mouse.click 打 3D 选卡投影
  await chooser.evaluate(() => { try { document.getElementById('card-dare').click(); } catch (e) { choose('dare'); } });
  await chooser.waitForFunction(() => !document.getElementById('card-section').hidden, null, { timeout: 25000 });   // three3d：CSS 隐藏但 hidden 属性照常管理
  await chooser.waitForTimeout(900); // 抽卡推镜中段
  await dump(chooser, cTag + '-drawing-mid');
  await dump(other, oTag + '-drawing-mid');
  await chooser.screenshot({ path: 'shots/3d-diag-drawing.png' });
  await other.screenshot({ path: 'shots/3d-diag-drawing-other.png' });
  await chooser.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  await chooser.waitForFunction(() => { const th = window.__three; if (!th || !th.camera) return false; return Math.abs(th.camera.position.y - 3.37) < 0.45; }, null, { timeout: 12000 }).catch(() => {});   // 等揭晓近景推到落幅（REVEAL_POS.y≈3.37）
  await chooser.waitForTimeout(4200);   // 等揭晓近景推镜落定（软渲 2-4fps 下 revealK 需更久）
  await dump(chooser, cTag + '-revealed');
  await dump(other, oTag + '-revealed');
  await chooser.screenshot({ path: 'shots/3d-diag-revealed.png' });
  await chooser.click('#btn-accept');
  await other.waitForTimeout(1500);
  await dump(other, oTag + '-handover');
  await other.screenshot({ path: 'shots/3d-diag-handover.png' });

  // raycast 真路径：mouse 物理点击 3D 大冒险卡的投影位置（document click → 否决名单/闩锁/landPick → raycast → choose）
  // 名牌（.player-card）可能恰好压在投影点上——按否决名单语义它们该拦，所以扫描卡面候选点找一个不被名牌挡的位置
  const pt = await other.evaluate(() => {
    if (!window.THREE || !window.__three || !document.getElementById('three-canvas')) return null;
    const r = document.getElementById('three-canvas').getBoundingClientRect();
    const cands = [[0.78, 0.98, -0.12], [0.9, 0.98, -0.2], [0.62, 0.98, -0.02], [0.9, 0.98, 0.05], [0.62, 0.98, -0.28]];
    for (const c of cands) {
      const v = new THREE.Vector3(c[0], c[1], c[2]).project(window.__three.camera);
      const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest && !el.closest('.player-card')) return { x, y };
    }
    return null;
  });
  if (pt) {
    log('raycast target:', JSON.stringify(pt));
    // 相机在交接后仍在滑动（revealK 衰减 + Cam 补间），单次瞄准可能滞后——重试直到命中或超次
    let ok = false;
    for (let a = 0; a < 6 && !ok; a++) {
      const pt2 = await other.evaluate(() => {
        if (!window.THREE || !window.__three) return null;
        const r = document.getElementById('three-canvas').getBoundingClientRect();
        const cands = [[0.78, 0.98, -0.12], [0.9, 0.98, -0.2], [0.62, 0.98, -0.02], [0.9, 0.98, 0.05], [0.62, 0.98, -0.28]];
        for (const c of cands) {
          const v = new THREE.Vector3(c[0], c[1], c[2]).project(window.__three.camera);
          const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest && !el.closest('.player-card')) return { x, y };
        }
        return null;
      });
      if (!pt2) break;
      await other.mouse.click(pt2.x, pt2.y);
      await other.waitForTimeout(700);
      const picked = await other.evaluate(() => ({ choice: S.turn.choice, stage: S.turn.stage, ray: window.__rayDbg || null }));
      log('raycast try', a, '→', JSON.stringify(picked));
      if (picked.stage === 'drawing' && picked.choice === 'dare') ok = true;
      else if (picked.ray && picked.ray.hit === 'card' && picked.ray.chooseErr) { errs.push('raycast choose error: ' + picked.ray.chooseErr); break; }
    }
    if (ok) log('raycast path OK ✅');
    else { log('raycast path FAILED ❌'); errs.push('raycast: pick did not register'); }
  } else {
    errs.push('raycast: no projection target');
  }

  log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors ✅');
  await browser.close();
  server.close();
})();
