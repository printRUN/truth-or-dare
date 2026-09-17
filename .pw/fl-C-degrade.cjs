// 终审探针 C：降级路径（loperf 开机 / loperf 运行中 retire3D / REDUCED）+ CSS 计分对照
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8839;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-C]', ...a);
const R = [];
const rec = (id, op, expect, actual, pass) => { R.push({ id, op, expect, actual, pass }); log((pass ? 'PASS' : 'FAIL') + ' | ' + id + ' | ' + op + ' | exp=' + expect + ' | act=' + JSON.stringify(actual)); };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const BOOT = (perf) => `try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', '${perf}'); } catch {}`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];

  // ═══ C1: loperf 开机 → CSS 路径完整一局 + 计分对照 ═══
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(new Function(BOOT('low')));
    const P = await ctx.newPage(), Q = await ctx.newPage();
    P.on('pageerror', e => errs.push('C1P:' + e.message)); Q.on('pageerror', e => errs.push('C1Q:' + e.message));
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
    await P.waitForTimeout(1500);
    const boot = await P.evaluate(() => ({
      three3d: document.body.classList.contains('three3d'), loperf: document.body.classList.contains('loperf'),
      canvas: !!document.getElementById('three-canvas'), stage: S.turn.stage,
      deckVisible: (function () { const d = document.querySelector('.table-deck'); return d && d.offsetHeight > 0; })(),
      choiceVisible: (function () { const b = document.getElementById('card-truth'); const r = b.getBoundingClientRect(); return r.width > 5; })(),
    }));
    rec('C1-boot-css', 'loperf 开机走 CSS 路径', 'three3d=false loperf=true 无 WebGL 画布 DOM 牌堆/选卡可见',
      boot, !boot.three3d && boot.loperf && !boot.canvas && boot.deckVisible && boot.choiceVisible);
    await P.screenshot({ path: path.join(SHOTS, 'fl-C-css-choosing.png') });
    // 完整一局（CSS）：选→抽→揭晓→接受
    let C = await P.evaluate(() => S.turn.chooserId === myId) ? P : Q;
    const O = C === P ? Q : P;
    await C.evaluate(() => document.getElementById('card-truth').click());
    await C.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    const drawing = await C.evaluate(() => ({
      choiceSectionHidden: document.getElementById('choice-section').hidden,
      deckSectionShown: !document.getElementById('deck-section').hidden,
      info: document.getElementById('turn-info').textContent,
    }));
    await C.screenshot({ path: path.join(SHOTS, 'fl-C-css-drawing.png') });
    await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await C.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 3 && document.getElementById('punishment-text').textContent === S.turn.punishment, null, { timeout: 15000 });
    const revealed = await C.evaluate(() => ({
      cardShown: (function () { const cs = document.getElementById('card-section'); return !cs.hidden && cs.offsetHeight > 0; })(),
      punish: document.getElementById('punishment-text').textContent,
      accVisible: (function () { const b = document.getElementById('btn-accept'); const r = b.getBoundingClientRect(); return r.width > 5; })(),
    }));
    await C.screenshot({ path: path.join(SHOTS, 'fl-C-css-revealed.png') });
    rec('C1-css-round', 'CSS 路径完整一局（选→抽→揭晓）', 'deck-section→card-section 正常切换，题面=状态，按钮可见',
      { drawing, revealed }, drawing.choiceSectionHidden && drawing.deckSectionShown && revealed.cardShown && revealed.punish.length > 3 && revealed.accVisible);
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    await C.waitForTimeout(600);
    const after = await C.evaluate(() => ({
      stage: S.turn.stage, rounds: S.stats.rounds, chooser: S.turn.chooserId,
      scores: S.players.map(p => p.score || 0), turnIndex: S.turnIndex,
      chooserBefore: S.players.length,
    }));
    const beforeChooser = await O.evaluate(() => S.turn.chooserId);
    rec('C1-css-scoring', 'CSS 计分/轮转（对照基准）', 'choosing、+10、rounds=1、chooser 换人',
      { ...after, otherSee: beforeChooser }, after.stage === 'choosing' && after.scores.some(s => s === 10) && after.rounds === 1);
    await ctx.close();
  }

  // ═══ C2: full 开机 → 运行中触发 loperf → retire3D → CSS 续玩 ═══
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(new Function(BOOT('full')));
    const P = await ctx.newPage(), Q = await ctx.newPage();
    P.on('pageerror', e => errs.push('C2P:' + e.message)); Q.on('pageerror', e => errs.push('C2Q:' + e.message));
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
    let C = await P.evaluate(() => S.turn.chooserId === myId) ? P : Q;
    const O = C === P ? Q : P;
    await C.evaluate(() => document.getElementById('card-dare').click());
    await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await C.waitForTimeout(1500);
    // 运行中触发省电（等同「省电模式」按钮：setLowPerf(true,'low')）
    await C.evaluate(() => setLowPerf(true, 'low'));
    await C.waitForTimeout(2500);
    const retired = await C.evaluate(() => ({
      three3d: document.body.classList.contains('three3d'), loperf: document.body.classList.contains('loperf'),
      canvas: !!document.getElementById('three-canvas'), stageActions: !!document.getElementById('stage-actions'),
      cardActionsParent: document.getElementById('card-actions') ? document.getElementById('card-actions').parentElement.id : 'none',
      toolsParent: document.getElementById('game-tools') ? document.getElementById('game-tools').parentElement.id || document.getElementById('game-tools').parentElement.className : 'none',
      plateInline: (function () { const c = document.querySelector('#game-players-grid .player-card'); return c ? (c.style.left || c.style.top || c.style.zIndex ? 'has-inline' : 'clean') : 'none'; })(),
      cardShown: (function () { const cs = document.getElementById('card-section'); return !cs.hidden && cs.offsetHeight > 0; })(),
      punish: document.getElementById('punishment-text').textContent,
      stage: S.turn.stage,
    }));
    rec('C2-retire3d', '运行中触发 loperf → retire3D 全量还原', 'three3d 摘除、画布/动作条移除、按钮归位、名牌 inline 清空、CSS 题面卡出现',
      retired, !retired.three3d && retired.loperf && !retired.canvas && !retired.stageActions && retired.cardActionsParent === 'card-front' && retired.plateInline === 'clean' && retired.cardShown);
    await C.screenshot({ path: path.join(SHOTS, 'fl-C-retired-revealed.png') });
    // CSS 路径把这一局玩完
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    await C.waitForTimeout(800);
    // 再完整玩一局（CSS）
    let C2 = await P.evaluate(() => S.turn.chooserId === myId) ? P : Q;
    await C2.evaluate(() => document.getElementById('card-truth').click());
    await C2.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    await C2.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await C2.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await C2.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 3 && document.getElementById('punishment-text').textContent === S.turn.punishment, null, { timeout: 15000 });
    await C2.click('#btn-accept');
    await C2.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    const end2 = await C2.evaluate(() => ({ stage: S.turn.stage, rounds: S.stats.rounds, scores: S.players.map(p => p.score || 0) }));
    rec('C2-css-continue', 'retire 后 CSS 路径连续两局可玩', 'choosing、rounds=2、两个 ±10 结算',
      end2, end2.stage === 'choosing' && end2.rounds === 2 && end2.scores.filter(s => s === 10).length === 2);
    await C2.screenshot({ path: path.join(SHOTS, 'fl-C-retired-next-choosing.png') });
    await ctx.close();
  }

  // ═══ C3: REDUCED（reducedMotion:'reduce'）3D 静态但流程完整 ═══
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(new Function(BOOT('full')));
    const P = await ctx.newPage(), Q = await ctx.newPage();
    P.on('pageerror', e => errs.push('C3P:' + e.message)); Q.on('pageerror', e => errs.push('C3Q:' + e.message));
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
    await P.waitForTimeout(1500);
    const boot3 = await P.evaluate(() => ({ three3d: document.body.classList.contains('three3d'), reduced: !!REDUCED, chars: window.__three ? window.__three.chars.size : -1 }));
    rec('C3-boot', 'REDUCED 下 3D 保留（静态）', 'three3d=true REDUCED=true chars=2', boot3, boot3.three3d && boot3.reduced && boot3.chars === 2);
    await P.screenshot({ path: path.join(SHOTS, 'fl-C-reduced-choosing.png') });
    let C = await P.evaluate(() => S.turn.chooserId === myId) ? P : Q;
    const O = C === P ? Q : P;
    await C.evaluate(() => document.getElementById('card-dare').click());
    await C.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    await C.waitForTimeout(400);
    const glRed = await C.evaluate(() => {
      const th = window.__three;
      th.scene.updateMatrixWorld();
      let act = null;
      th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) { const wp = o.getWorldPosition(new THREE.Vector3()); act = { vis: o.visible, pos: [wp.x, wp.z].map(v => +v.toFixed(2)) }; } });
      return act;
    });
    rec('C3-draw-static', 'REDUCED 抽卡=牌直接出现在桌上（无飞行）', '卡即刻躺在 REST(0,−0.64)',
      glRed, glRed && glRed.vis && Math.abs(glRed.pos[0]) < 0.05 && Math.abs(glRed.pos[1] + 0.64) < 0.05);
    await C.screenshot({ path: path.join(SHOTS, 'fl-C-reduced-drawing.png') });
    await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await C.waitForTimeout(1200);
    const shown = await C.evaluate(() => {
      const th = window.__three;
      th.scene.updateMatrixWorld();
      let rx = null;
      th.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width === 0.46 && o.parent && o.parent.position.z < 0) rx = +o.parent.rotation.x.toFixed(3); });
      return { rx, punish: document.getElementById('punishment-text').textContent, punishState: S.turn.punishment };
    });
    rec('C3-reveal-shown', 'REDUCED 揭晓=牌直接翻好躺桌', 'flipRotX=−π 且题面文本就绪',
      shown, shown.rx === -Math.PI && shown.punish.length > 3);
    await C.screenshot({ path: path.join(SHOTS, 'fl-C-reduced-revealed.png') });
    await O.waitForTimeout(500);
    await O.screenshot({ path: path.join(SHOTS, 'fl-C-reduced-revealed-other.png') });
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    const end3 = await C.evaluate(() => ({ stage: S.turn.stage, rounds: S.stats.rounds, scores: S.players.map(p => p.score || 0) }));
    rec('C3-flow', 'REDUCED 一局完整可玩', 'choosing、+10、rounds=1', end3, end3.stage === 'choosing' && end3.scores.some(s => s === 10) && end3.rounds === 1);
    await ctx.close();
  }

  log('ERRORS:', errs.length ? errs.join('||').slice(0, 1000) : 'none');
  fs.writeFileSync(path.join(ROOT, '.pw', 'fl-C-result.json'), JSON.stringify({ results: R, errs }, null, 2));
  const fails = R.filter(r => !r.pass);
  log('==== SUMMARY: ' + (R.length - fails.length) + '/' + R.length + ' PASS ====');
  fails.forEach(f => log('FAIL ' + f.id + ': ' + JSON.stringify(f.actual)));
  await browser.close();
  server.close();
  process.exit(0);
})();
