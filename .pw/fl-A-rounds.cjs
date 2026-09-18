// 终审探针 A v2：完整回合逻辑（双标签 / DOM 兼容路径 + 3D raycast 路径 / 连续 2 回合 / accept+skip 结算）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8831;
const VW = 1440, VH = 900;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-A]', ...a);
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
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const errs = [];
  const mk = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    return p;
  };
  const P = await mk(), Q = await mk();

  const stDump = (tag) => (pg) => pg.evaluate((t) => {
    const ca = document.getElementById('card-actions'), br = document.getElementById('btn-reroll'), sr = document.getElementById('stake-row');
    const bAcc = document.getElementById('btn-accept');
    const accR = bAcc ? bAcc.getBoundingClientRect() : null;
    return {
      tag: t,
      stage: S.turn.stage, chooser: S.turn.chooserId, me: myId, choice: S.turn.choice,
      punish: (S.turn.punishment || '').slice(0, 40), seq: S.turn.seq, stake: S.turn.stake,
      rounds: S.stats.rounds, tStat: { truth: S.stats.truth, dare: S.stats.dare, skips: S.stats.skips },
      players: S.players.map(p => ({ n: p.name, score: p.score || 0, passes: p.passes, draws: p.draws || 0, skips: p.skips || 0 })),
      three3d: document.body.classList.contains('three3d'), loperf: document.body.classList.contains('loperf'),
      chars: window.__three ? window.__three.chars.size : -1,
      punishText: document.getElementById('punishment-text').textContent,
      flipped: document.getElementById('flip-card').classList.contains('flipped'),
      cardActionsParent: ca ? (ca.parentElement.id || ca.parentElement.className) : 'none',
      cardActionsDisp: ca ? getComputedStyle(ca).display : 'none',
      rerollParent: br ? (br.parentElement.id || br.parentElement.className) : 'none',
      stakeParent: sr ? (sr.parentElement.id || sr.parentElement.className) : 'none',
      stakeHidden: sr ? sr.hidden : null,
      stageActionsHidden: !document.getElementById('stage-actions') || document.getElementById('stage-actions').style.display === 'none',
      cardSectionHidden: document.getElementById('card-section').hidden,
      choiceSectionHidden: document.getElementById('choice-section').hidden,
      turnInfo: document.getElementById('turn-info').textContent,
      btnAcceptVisible: !!accR && accR.width > 5 && accR.height > 5,
      btnAcceptRect: accR ? [accR.left, accR.top, accR.width, accR.height].map(Math.round) : null,
    };
  }, tag).then(o => { log(o.tag, JSON.stringify({ stage: o.stage, choice: o.choice, seq: o.seq, punish: o.punish.slice(0, 14) })); return o; });

  // 3D 桌面卡状态：actionCard（flipG 子）与 deck 牌堆（deck 组子）分开
  const glDump = (tag) => (pg) => pg.evaluate((t) => {
    const th = window.__three;
    if (!th) return { tag: t, no3d: true };
    th.scene.updateMatrixWorld();
    const out = { tag: t, action: null, deck: null, choice: [], cam: null, canvasRect: null, canvasBuf: null, phase: '' };
    th.scene.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
      const p = o.geometry.parameters;
      if (p.width === 0.46 && p.height === 0.012 && p.depth === 0.64) {
        const wp = o.getWorldPosition(new THREE.Vector3());
        const e = { vis: !!(o.visible && o.parent.visible), pos: [wp.x, wp.y, wp.z].map(v => +v.toFixed(3)), flipRotX: +o.parent.rotation.x.toFixed(4), parentZ: +o.parent.position.z.toFixed(2) };
        if (o.parent.position.z < 0) {
          try {
            const fm = Array.isArray(o.material) ? o.material[3] : o.material;
            const img = fm.map && fm.map.image;
            if (img && img.getContext) {
              const dd = img.getContext('2d').getImageData(0, 300, 512, 200).data;
              let lit = 0;
              for (let i = 0; i < dd.length; i += 4) { if (dd[i + 3] > 0 && (dd[i] > 60 || dd[i + 1] > 60 || dd[i + 2] > 60)) lit++; }
              e.texLit = lit; e.texVer = fm.map.version;
            } else e.texLit = 'no-img';
          } catch (err) { e.texLit = 'err:' + err.message; }
          out.action = e;
        } else out.deck = e;
      }
      if (p.width === 0.60 && p.depth === 0.84) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        out.choice.push({ x: +o.parent.position.x.toFixed(2), rotX: +o.parent.rotation.x.toFixed(3), op: +mats[0].opacity.toFixed(2) });
      }
    });
    out.choice.sort((a, b) => a.x - b.x);
    if (!out.action || !out.action.vis) out.phase = 'park';
    else if (out.action.flipRotX === 0) out.phase = out.action.pos[1] > 1.05 ? 'fly' : 'rest(waitfly/pulse/shown-pre)';
    else if (out.action.flipRotX <= -Math.PI + 0.001) out.phase = 'shown';
    else out.phase = 'flip';
    const c = th.camera.position;
    out.cam = [c.x, c.y, c.z].map(v => +v.toFixed(2));
    const cv = document.getElementById('three-canvas');
    if (cv) { const r = cv.getBoundingClientRect(); out.canvasRect = [r.left, r.top, r.width, r.height].map(Math.round); out.canvasBuf = [cv.width, cv.height]; }
    const grid = document.getElementById('game-players-grid');
    const gr = grid.getBoundingClientRect();
    out.gridRect = [gr.left, gr.top, gr.width, gr.height].map(Math.round);
    return out;
  }, tag).then(o => { log(o.tag, 'gl=' + JSON.stringify({ ph: o.phase, act: o.action, cam: o.cam })); return o; });

  // ── 开局 ──
  await P.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await P.fill('#input-name', '阿泽');
  await P.click('details.adv summary'); await P.click('#chk-local');
  await P.click('.avatar-option >> nth=0');
  await P.click('#btn-join');
  await P.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await P.textContent('#share-room')).trim();
  await Q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await Q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await Q.fill('#input-name', '小雨');
  await Q.click('details.adv summary'); await Q.click('#chk-local');
  await Q.fill('#input-room', room);
  await Q.click('.avatar-option >> nth=0');
  await Q.click('#btn-join');
  await P.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await Q.waitForTimeout(800);
  await P.screenshot({ path: path.join(SHOTS, 'fl-A-lobby-P.png') });
  await P.click('#btn-start');
  await P.waitForSelector('#screen-game.active', { timeout: 15000 });
  await Q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await P.waitForTimeout(2500);

  const cP = await stDump('P-choosing')(P), cQ = await stDump('Q-choosing')(Q);
  const gP = await glDump('P-choosing')(P), gQ = await glDump('Q-choosing')(Q);
  rec('A1-boot-3d', '开局进入牌桌', '双方 three3d=true chars=2 canvasRect=[0,0,1440,900]',
    { P: [cP.three3d, cP.chars, gP.canvasRect], Q: [cQ.three3d, cQ.chars, gQ.canvasRect] },
    cP.three3d && cQ.three3d && cP.chars === 2 && cQ.chars === 2 && gP.canvasRect.join() === '0,0,1440,900' && gQ.canvasRect.join() === '0,0,1440,900');
  rec('A1b-park', '选卡阶段 3D 状态', '行动卡不可见(park)，选卡双卡在桌 op=1', { act: gP.action, choice: gP.choice },
    (!gP.action || !gP.action.vis) && gP.choice.length === 2 && gP.choice.every(c => c.op === 1 && c.rotX === 0));
  await P.screenshot({ path: path.join(SHOTS, 'fl-A-choosing-P.png') });
  await Q.screenshot({ path: path.join(SHOTS, 'fl-A-choosing-Q.png') });

  const chooserIsP = cP.chooser === cP.me;
  const C = chooserIsP ? P : Q, O = chooserIsP ? Q : P;
  const cTag = chooserIsP ? 'P' : 'Q', oTag = chooserIsP ? 'Q' : 'P';
  log('round1 chooser=' + cTag);
  await C.evaluate(() => document.getElementById('card-dare').click());
  await C.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
  const dC1 = await stDump(cTag + '-drawing1')(C), dO1 = await stDump(oTag + '-drawing1')(O);
  rec('A3-choose-dom', 'DOM 兼容路径选大冒险', '双方 stage=drawing choice=dare seq+1 rounds=1',
    { C: [dC1.stage, dC1.choice], O: [dO1.stage, dO1.choice], seqEq: dC1.seq === dO1.seq, rounds: dC1.rounds },
    dC1.stage === 'drawing' && dO1.stage === 'drawing' && dC1.choice === 'dare' && dO1.choice === 'dare' && dC1.seq === dO1.seq && dC1.rounds === 1);
  rec('A3b-choice-ui', '选后 UI', 'choice-section 隐藏 / turn-info 起身文案 / 双卡复位 op=1',
    { hiddenC: dC1.choiceSectionHidden, info: dC1.turnInfo }, dC1.choiceSectionHidden === true && /起身去卡堆抽卡/.test(dC1.turnInfo));

  // 抽卡动画采样
  await C.waitForTimeout(300);
  const g1 = await glDump(cTag + '-t300')(C);
  await C.waitForTimeout(500);   // ~800ms：waitfly→fly 段
  const g2 = await glDump(cTag + '-t800')(C);
  await C.waitForTimeout(700);   // ~1500ms：fly 尾/pulse
  const g3 = await glDump(cTag + '-t1500')(C);
  await C.screenshot({ path: path.join(SHOTS, 'fl-A-drawing-' + cTag + '.png') });
  await O.waitForTimeout(1200);
  const gO2 = await glDump(oTag + '-drawing-view')(O);
  const dC2 = await stDump(oTag + '-drawing-view')(O);
  await O.screenshot({ path: path.join(SHOTS, 'fl-A-drawing-' + oTag + '-other.png') });
  const poses = [g1, g2, g3].map(g => g.action ? g.action.pos.join(',') : 'null');
  rec('A4-draw-anim', '抽卡动画（卡有起飞→飞行位移过程）', '3 个采样中至少 2 个位置不同且卡可见',
    { poses, vis: [g1.action && g1.action.vis, g2.action && g2.action.vis, g3.action && g3.action.vis] },
    g1.action && g1.action.vis && new Set(poses).size >= 2);
  rec('A4b-choice-cards-hidden', '抽卡中选卡双卡是否让位（发现项：3D 双卡整局留在桌上）', 'op/rotX 状态记录', g2.choice, true);
  rec('A4c-no-compress', '抽卡中画布不压缩（P0-4）', 'canvasRect 恒 [0,0,1440,900]', g2.canvasRect, g2.canvasRect.join() === '0,0,1440,900');
  rec('A4d-other-view', '非选择者视角同步', '对方 card visible + stage=drawing + 画布全屏',
    { vis: gO2.action && gO2.action.vis, stage: dC2.stage, rect: gO2.canvasRect },
    gO2.action && gO2.action.vis && dC2.stage === 'drawing' && gO2.canvasRect.join() === '0,0,1440,900');

  // 等揭晓 + 翻面
  await C.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 15000 });
  await C.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 12000 });
  await C.waitForTimeout(280);
  const g4 = await glDump(cTag + '-flip-mid')(C);
  await C.waitForTimeout(4200);   // 翻面 650ms + 推镜落幅 + 打字机（软渲帧慢留余量）
  const rC = await stDump(cTag + '-revealed')(C), rO = await stDump(oTag + '-revealed')(O);
  const gR = await glDump(cTag + '-revealed')(C), gRO = await glDump(oTag + '-revealed')(O);
  await C.screenshot({ path: path.join(SHOTS, 'fl-A-revealed-' + cTag + '.png') });
  await O.screenshot({ path: path.join(SHOTS, 'fl-A-revealed-' + oTag + '-other.png') });
  rec('A5-flip-anim', '3D 翻面动画（flip 中段角度 ∈ (−π,0)）', '0 > flipRotX > −π', g4.action && g4.action.flipRotX,
    g4.action && g4.action.flipRotX < 0 && g4.action.flipRotX > -Math.PI + 0.0001);
  rec('A6-shown', '翻面终态：题卡躺桌心', 'phase=shown，卡位于桌心(0,·,−0.64)',
    { ph: gR.phase, act: gR.action }, gR.phase === 'shown' && Math.abs(gR.action.pos[0]) < 0.05 && Math.abs(gR.action.pos[2] + 0.64) < 0.05);
  rec('A7-question-match', '题面内容与 S.turn 一致（DOM 层；3D 题面纹理另目检）', 'punishment-text === S.turn.punishment',
    { dom: rC.punishText, state: rC.punish, choice: rC.choice },
    rC.choice === 'dare' && rC.punishText === rC.punish && rC.punish.length > 3);
  rec('A7b-dual-tab', '双标签回合状态一致', 'stage/choice/seq/flipped 全等',
    { C: [rC.stage, rC.choice, rC.seq, rC.flipped], O: [rO.stage, rO.choice, rO.seq, rO.flipped] },
    rC.stage === rO.stage && rC.choice === rO.choice && rC.seq === rO.seq && rC.flipped === rO.flipped);
  rec('A7c-dual-tab-card', '双标签桌面卡同态', '对方 tab 也 shown', gRO.phase, gRO.phase === 'shown');
  rec('A8-stage-actions', '动作按钮 reparent 到 #stage-actions', '父=stage-actions 且按钮有实矩形',
    { parent: rC.cardActionsParent, rect: rC.btnAcceptRect }, rC.cardActionsParent === 'stage-actions' && rC.btnAcceptVisible);
  const nearCam = gR.cam && Math.abs(gR.cam[0] + 1.2) < 0.35 && Math.abs(gR.cam[1] - 2.82) < 0.35 && Math.abs(gR.cam[2] - 0.46) < 0.5;
  rec('A9-reveal-cam', '揭晓近景落幅（REVEAL_POS≈[−1.2,2.82,0.46]）', '相机到位', gR.cam, nearCam);
  // 揭晓暗幕发现项：gridRect 与半透明 ::after 叠在近景上（记录用）
  rec('A9b-reveal-veil', '揭晓 stage-revealed 暗幕(::after) 叠在 3D 近景上（发现项记录）', '记录 gridRect', gR.gridRect, true);

  // accept 结算
  await C.waitForFunction(() => { const b = document.getElementById('btn-accept'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, null, { timeout: 15000 });
  await C.click('#btn-accept');
  await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  await O.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  await C.waitForTimeout(1500);
  const hC = await stDump(cTag + '-handover')(C), hO = await stDump(oTag + '-handover')(O);
  const gH = await glDump(cTag + '-handover')(C);
  await C.screenshot({ path: path.join(SHOTS, 'fl-A-handover-' + cTag + '.png') });
  await O.screenshot({ path: path.join(SHOTS, 'fl-A-handover-' + oTag + '-other.png') });
  rec('A10-accept', '完成啦结算（+10）', 'choosing，完成者 +10，rounds=1，skips=0',
    { stage: hC.stage, players: hC.players, rounds: hC.rounds, tStat: hC.tStat },
    hC.stage === 'choosing' && hC.players.some(p => p.score === 10) && hC.rounds === 1 && hC.tStat.skips === 0);
  rec('A11-rotate', '交接轮转', 'chooser 换人且双方一致', { C: hC.chooser, O: hO.chooser, prev: dC1.chooser },
    hC.chooser !== dC1.chooser && hC.chooser === hO.chooser);
  rec('A12-restore', '回合结束：按钮归位+3D 卡回 park+双卡复位', 'card-actions 回 card-front；行动卡不可见；双卡 op=1 rotX=0',
    { parent: hC.cardActionsParent, saHidden: hC.stageActionsHidden, act: gH.action, choice: gH.choice },
    hC.cardActionsParent === 'card-front' && (!gH.action || !gH.action.vis) && gH.choice.every(c => c.op === 1 && c.rotX === 0));
  rec('A12b-dual-restore', '对方 tab 同步复位', 'card-actions 归位；stage-actions 无残留按钮（下一chooser 的押注条除外）',
    { parent: hO.cardActionsParent, saHidden: hO.stageActionsHidden, accVisible: hO.btnAcceptVisible },
    hO.cardActionsParent === 'card-front' && !hO.btnAcceptVisible);

  // ── 回合 2：raycast 路径 ──
  const chooser2 = hC.chooser;
  let C2 = null;
  for (const pg of [P, Q]) { if (await pg.evaluate(() => S.turn.chooserId === myId)) { C2 = pg; break; } }
  if (!C2) C2 = P;
  const C2tag = C2 === P ? 'P' : 'Q', O2 = C2 === P ? Q : P;
  log('round2 chooser=' + C2tag + ' (raycast)');
  let rayOk = false, rayChoice = null, rayDbg = null;
  for (let a = 0; a < 6 && !rayOk; a++) {
    const pt = await C2.evaluate(() => {
      if (!window.THREE || !window.__three) return null;
      const r = document.getElementById('three-canvas').getBoundingClientRect();
      const cands = [[-0.78, 0.976, -0.12], [-0.9, 0.976, -0.2], [-0.62, 0.976, -0.02], [-0.9, 0.976, 0.05], [-0.62, 0.976, -0.28], [0.78, 0.976, -0.12], [0.9, 0.976, -0.2], [0.62, 0.976, -0.02]];
      for (const c of cands) {
        const v = new THREE.Vector3(c[0], c[1], c[2]).project(window.__three.camera);
        const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest && !el.closest('.player-card,#game-tools,#stage-actions,button')) return { x: +x.toFixed(0), y: +y.toFixed(0) };
      }
      return null;
    });
    if (!pt) { rayDbg = 'no-target'; break; }
    await C2.mouse.click(pt.x, pt.y);
    await C2.waitForTimeout(600);
    const picked = await C2.evaluate(() => ({ stage: S.turn.stage, choice: S.turn.choice, ray: window.__rayDbg || null, chooser: S.turn.chooserId, me: myId }));
    log('raycast try', a, JSON.stringify(picked));
    rayDbg = picked.ray;
    if (picked.stage === 'drawing' && picked.chooser === picked.me) { rayOk = true; rayChoice = picked.choice; break; }
    if (picked.stage !== 'choosing') break;
    await C2.waitForTimeout(900);
  }
  rec('A13-raycast', '3D raycast 路径选卡（真鼠标点桌面选卡）', 'drawing + __rayDbg.hit=card', { ok: rayOk, choice: rayChoice, dbg: rayDbg }, rayOk && !!rayChoice);

  await C2.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 15000 });
  await C2.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 12000 });
  await C2.waitForTimeout(4200);
  const r2C = await stDump(C2tag + '-revealed2')(C2), r2O = await stDump(O2 === P ? 'P-revealed2' : 'Q-revealed2')(O2);
  await C2.screenshot({ path: path.join(SHOTS, 'fl-A-revealed2-' + C2tag + '.png') });
  await O2.screenshot({ path: path.join(SHOTS, 'fl-A-revealed2-' + (O2 === P ? 'P' : 'Q') + '-other.png') });
  rec('A14-round2', '回合 2 揭晓内容一致', '双方 punishText=S.turn.punishment，seq 相等',
    { C: [r2C.choice, r2C.punishText], O: [r2O.choice, r2O.punishText.slice(0, 20)], seqEq: r2C.seq === r2O.seq },
    r2C.stage === 'revealed' && r2C.punishText === r2C.punish && r2C.seq === r2O.seq && r2C.punishText.length > 3);

  await C2.click('#btn-skip');
  await C2.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  await C2.waitForTimeout(1500);
  const s2 = await stDump(C2tag + '-after-skip')(C2);
  rec('A15-skip', '跳过结算（−5）+ 连续 2 回合无卡死', 'choosing，跳过者 −5，skips=1，rounds=2，轮转继续',
    { stage: s2.stage, players: s2.players, rounds: s2.rounds, skips: s2.tStat.skips, chooser: s2.chooser },
    s2.stage === 'choosing' && s2.players.some(p => p.score === -5) && s2.rounds === 2 && s2.tStat.skips === 1 && s2.chooser !== r2C.chooser);

  // ── 回合 3：选卡恢复可点（正确 chooser 的 tab）──
  let C3 = null;
  for (const pg of [P, Q]) { if (await pg.evaluate(() => S.turn.chooserId === myId)) { C3 = pg; break; } }
  if (!C3) C3 = P;
  let round3 = false;
  for (let a = 0; a < 5 && !round3; a++) {
    const pt = await C3.evaluate(() => {
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
    if (!pt) break;
    await C3.mouse.click(pt.x, pt.y);
    await C3.waitForTimeout(600);
    const picked = await C3.evaluate(() => ({ stage: S.turn.stage, chooser: S.turn.chooserId, me: myId }));
    if (picked.stage === 'drawing' && picked.chooser === picked.me) { round3 = true; break; }
    if (picked.stage !== 'choosing') break;
    await C3.waitForTimeout(900);
  }
  rec('A16-round3', '第 3 回合选卡恢复可点', 'raycast 再入 drawing', { ok: round3 }, round3);
  await C3.screenshot({ path: path.join(SHOTS, 'fl-A-round3-drawing.png') });

  log('ERRORS:', errs.length ? errs.join(' || ').slice(0, 1500) : 'none');
  fs.writeFileSync(path.join(ROOT, '.pw', 'fl-A-result.json'), JSON.stringify({ results: R, errs }, null, 2));
  const fails = R.filter(r => !r.pass);
  log('==== SUMMARY: ' + (R.length - fails.length) + '/' + R.length + ' PASS ====');
  fails.forEach(f => log('FAIL ' + f.id + ': exp=' + f.expect + ' act=' + JSON.stringify(f.actual)));
  await browser.close();
  server.close();
  process.exit(0);
})();
