// 终审探针 B2（聚焦复测）：B6 主持人换一题(host≠chooser)+题面重绘 / B7c 加倍标签时机 / A5 翻面中间态
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8837;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-B2]', ...a);
const R = [];
const rec = (id, op, expect, actual, pass) => { R.push({ id, op, expect, actual, pass }); log((pass ? 'PASS' : 'FAIL') + ' | ' + id + ' | ' + op + ' | exp=' + expect + ' | act=' + JSON.stringify(actual)); };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const errs = [];
  const mk = async (tag) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ':' + e.message)); return p; };
  const P = await mk('P'), Q = await mk('Q');
  const st = (pg) => pg.evaluate(() => ({
    stage: S.turn.stage, chooser: S.turn.chooserId, me: myId, punish: S.turn.punishment || '', seq: S.turn.seq, stake: S.turn.stake,
    punishText: document.getElementById('punishment-text').textContent,
    acceptTxt: document.getElementById('btn-accept').textContent, skipTxt: document.getElementById('btn-skip').textContent,
    isHost: isHost(), flipped: document.getElementById('flip-card').classList.contains('flipped'),
  }));
  const raycastChoose = async (pg) => {
    for (let a = 0; a < 6; a++) {
      const pt = await pg.evaluate(() => {
        const r = document.getElementById('three-canvas').getBoundingClientRect();
        const cands = [[0.78, 0.976, -0.12], [0.9, 0.976, -0.2], [0.62, 0.976, -0.02], [-0.78, 0.976, -0.12], [-0.9, 0.976, -0.2]];
        for (const c of cands) {
          const v = new THREE.Vector3(c[0], c[1], c[2]).project(window.__three.camera);
          const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest && !el.closest('.player-card,#game-tools,#stage-actions,button')) return { x: +x.toFixed(0), y: +y.toFixed(0) };
        }
        return null;
      });
      if (!pt) return false;
      await pg.mouse.click(pt.x, pt.y);
      await pg.waitForTimeout(500);
      if (await pg.evaluate(() => S.turn.stage === 'drawing' && S.turn.chooserId === myId)) return true;
      if (await pg.evaluate(() => S.turn.stage) !== 'choosing') return false;
      await pg.waitForTimeout(800);
    }
    return false;
  };
  const waitTypewriterDone = (pg) => pg.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 0 && document.getElementById('punishment-text').textContent === (S.turn.punishment || ''), null, { timeout: 20000 }).catch(() => 'timeout');

  await P.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await P.fill('#input-name', '阿泽');
  await P.click('details.adv summary'); await P.click('#chk-local');
  await P.click('.avatar-option >> nth=0'); await P.click('#btn-join');
  await P.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await P.textContent('#share-room')).trim();
  await Q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await Q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await Q.fill('#input-name', '小雨');
  await Q.click('details.adv summary'); await Q.click('#chk-local');
  await Q.fill('#input-room', room);
  await Q.click('.avatar-option >> nth=1'); await Q.click('#btn-join');
  await P.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await Q.waitForTimeout(800);
  await P.click('#btn-start');
  await P.waitForSelector('#screen-game.active', { timeout: 15000 });
  await Q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await P.waitForTimeout(2200);

  const isHostP = await P.evaluate(() => isHost());
  const H = isHostP ? P : Q, NH = isHostP ? Q : P;

  // 若 chooser==host：host 快速自结一轮，把轮转让给非 host
  if (await H.evaluate(() => S.turn.chooserId === myId)) {
    await H.evaluate(() => document.getElementById('card-truth').click());
    await H.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await H.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await waitTypewriterDone(H);
    await H.click('#btn-accept');
    await H.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  }

  // ═══ B6: 非 host 抽卡，host 揭晓期换一题 ═══
  const ok = await raycastChoose(NH);
  if (!ok) { rec('B6', '环境', '非host raycast 选卡失败', null, false); }
  else {
    await NH.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await NH.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await waitTypewriterDone(NH);
    const before = await st(NH);
    const clipGet = (pg) => pg.evaluate(() => {
      const th = window.__three;
      th.scene.updateMatrixWorld();
      let card = null;
      th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) card = o; });
      if (!card) return null;
      const v = card.getWorldPosition(new THREE.Vector3()).project(th.camera);
      const r = document.getElementById('three-canvas').getBoundingClientRect();
      const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
      return { x: Math.max(60, Math.round(x - 130)), y: Math.max(60, Math.round(y - 170)), width: 260, height: 340 };
    });
    const clip = await clipGet(NH);
    const shotA = clip ? await NH.screenshot({ clip }) : null;
    const rerollVis = await H.evaluate(() => { const b = document.getElementById('btn-reroll'); const r = b.getBoundingClientRect(); return r.width > 5 && r.height > 5; });
    await H.click('#btn-reroll');
    await waitTypewriterDone(NH);
    await NH.waitForTimeout(1500);
    const after = await st(NH);
    rec('B6-host-reroll', '主持人换一题（host≠chooser，揭晓期点 #stage-actions 内换一题）', 'punishment 变化 seq+1 stage 仍 revealed 且按钮可见',
      { rerollVis, changed: after.punish !== before.punish, seq: [before.seq, after.seq], stage: after.stage },
      rerollVis && after.punish !== before.punish && after.stage === 'revealed' && after.seq === before.seq + 1);
    const shotB = clip ? await NH.screenshot({ clip }) : null;
    if (shotA && shotB) {
      const diffRatio = await NH.evaluate(async (arg) => {
        const load = (d) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d; });
        const [ia, ib] = await Promise.all([load(arg.a), load(arg.b)]);
        const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
        const g = cv.getContext('2d');
        g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data;
        g.clearRect(0, 0, cv.width, cv.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
        let diff = 0;
        for (let i = 0; i < da.length; i += 4) { if (Math.abs(da[i] - db[i]) > 10 || Math.abs(da[i + 1] - db[i + 1]) > 10 || Math.abs(da[i + 2] - db[i + 2]) > 10) diff++; }
        return diff / (da.length / 4);
      }, { a: shotA.toString('base64'), b: shotB.toString('base64') });
      rec('B6b-reroll-texture', '换一题后 3D 题面是否重绘（>2%=重绘）', '题面应更新', { diffRatio: +diffRatio.toFixed(4), domNow: after.punishText.slice(0, 16) }, diffRatio > 0.02);
      await NH.screenshot({ path: 'shots/fl-B2-reroll-table.png' });
    }
    await NH.click('#btn-accept');
    await NH.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  }

  // ═══ B7c 复测：加倍标签（打字机完全结束后读）═══
  let C = null;
  for (const pg of [P, Q]) if (await pg.evaluate(() => S.turn.chooserId === myId)) { C = pg; break; }
  if (C) {
    await C.click('#btn-stake');
    await C.waitForTimeout(500);
    await raycastChoose(C);
    await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await waitTypewriterDone(C);
    await C.waitForTimeout(1200);   // renderGameStatic 补绘余量
    const s7 = await st(C);
    rec('B7c2-stake-labels', '加倍后（打字机完成+1.2s）按钮文案', '完成啦含 +20、跳过含 −10、typewriter 完成',
      { acc: s7.acceptTxt, skip: s7.skipTxt, tw: s7.punishText === s7.punish, stake: s7.stake },
      /\+20/.test(s7.acceptTxt) && /−10/.test(s7.skipTxt));
    // 标签在打字机完成前是什么（揭示时机窗口）
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  }

  // ═══ A5 复测：翻面中间态高频采样 ═══
  for (const pg of [P, Q]) if (await pg.evaluate(() => S.turn.chooserId === myId)) { C = pg; break; }
  if (C) {
    await C.evaluate(() => document.getElementById('card-truth').click());
    await C.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    const series = [];
    // .flipped 出现瞬间起，每 120ms 采一次 flipRotX
    await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    for (let i = 0; i < 12; i++) {
      const rx = await C.evaluate(() => {
        const th = window.__three;
        let v = null;
        th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) v = +o.parent.rotation.x.toFixed(3); });
        return v;
      });
      series.push(rx);
      await C.waitForTimeout(110);
    }
    const mid = series.filter(v => v !== null && v < 0 && v > -Math.PI + 0.001);
    rec('A5b-flip-mid', '翻面中间态（.flipped 后 1.3s 内每 110ms 采样）', '存在 ∈(−π,0) 的中间角度=有翻面动画',
      { series, midCount: mid.length }, mid.length > 0);
  }

  log('ERRORS:', errs.length ? errs.join('||').slice(0, 800) : 'none');
  fs.writeFileSync(path.join(ROOT, '.pw', 'fl-B2-result.json'), JSON.stringify({ results: R, errs }, null, 2));
  const fails = R.filter(r => !r.pass);
  log('==== SUMMARY: ' + (R.length - fails.length) + '/' + R.length + ' PASS ====');
  await browser.close();
  server.close();
  process.exit(0);
})();
