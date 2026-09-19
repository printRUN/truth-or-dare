// 终审探针 B：回合状态一致性 + 按钮功能（免答/换一题/加倍/连点/同时动作/竞态）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8835;
const VW = 1440, VH = 900;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-B]', ...a);
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
  const mk = async (tag) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text().slice(0, 160)); });
    return p;
  };
  const P = await mk('P'), Q = await mk('Q');

  const st = (pg) => pg.evaluate(() => ({
    stage: S.turn.stage, chooser: S.turn.chooserId, me: myId, choice: S.turn.choice,
    punish: S.turn.punishment || '', seq: S.turn.seq, stake: S.turn.stake,
    rounds: S.stats.rounds, tStat: { truth: S.stats.truth, dare: S.stats.dare, skips: S.stats.skips },
    players: S.players.map(p => ({ n: p.name, score: p.score || 0, passes: p.passes, draws: p.draws || 0, skips: p.skips || 0 })),
    isHost: isHost(), mode: S.mode,
    punishText: document.getElementById('punishment-text').textContent,
    flipped: document.getElementById('flip-card').classList.contains('flipped'),
    acceptTxt: document.getElementById('btn-accept').textContent,
    skipTxt: document.getElementById('btn-skip').textContent,
    toast: (document.getElementById('toast') || {}).textContent || '',
    accVisible: (function () { const b = document.getElementById('btn-accept'); const r = b.getBoundingClientRect(); return r.width > 5 && r.height > 5; })(),
    rerollVisible: (function () { const b = document.getElementById('btn-reroll'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 5 && r.height > 5 && b.offsetParent !== null; })(),
    passVisible: (function () { const b = document.getElementById('btn-pass'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 5 && r.height > 5; })(),
    stakeVisible: (function () { const b = document.getElementById('btn-stake'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 5 && r.height > 5; })(),
    cardActionsParent: (document.getElementById('card-actions') || { parentElement: {} }).parentElement.id,
  }));

  const gl = (pg, tag) => pg.evaluate((t) => {
    const th = window.__three;
    if (!th) return { tag: t, no3d: true };
    th.scene.updateMatrixWorld();
    const out = { tag: t, action: null, choice: [], cam: null, plates: [] };
    th.scene.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.parameters) return;
      const p = o.geometry.parameters;
      if (p.width === 0.46 && p.height === 0.012 && p.depth === 0.64 && o.parent.position.z < 0) {
        const wp = o.getWorldPosition(new THREE.Vector3());
        out.action = { vis: !!(o.visible && o.parent.visible), flipRotX: +o.parent.rotation.x.toFixed(4), pos: [wp.x, wp.z].map(v => +v.toFixed(2)) };
      }
      if (p.width === 0.60 && p.depth === 0.84) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        out.choice.push({ x: +o.parent.position.x.toFixed(2), rotX: +o.parent.rotation.x.toFixed(3), op: +mats[0].opacity.toFixed(2), lift: +o.parent.position.y.toFixed(3) });
      }
    });
    out.choice.sort((a, b) => a.x - b.x);
    const c = th.camera.position;
    out.cam = [c.x, c.y, c.z].map(v => +v.toFixed(2));
    document.querySelectorAll('#game-players-grid .player-card').forEach(card => {
      const ch = th.chars.get(card.dataset.pid);
      let head = null;
      if (ch) {
        const v = new THREE.Vector3(ch.position.x, 1.72, ch.position.z).project(th.camera);
        const r = document.getElementById('three-canvas').getBoundingClientRect();
        head = [Math.round((v.x + 1) / 2 * r.width), Math.round((1 - (v.y + 1) / 2) * r.height)];
      }
      const cr = card.getBoundingClientRect();
      out.plates.push({ pid: (card.textContent.match(/[\u4e00-\u9fa5a-zA-Z0-9]{1,6}/) || [''])[0], plateXY: [Math.round(cr.left + cr.width / 2), Math.round(cr.top)], headProj: head, vis: card.style.visibility || '' });
    });
    return out;
  }, tag);

  // ── 开局 ──
  await P.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await P.fill('#input-name', '阿泽');
  await P.click('details.adv summary'); await P.click('#chk-local');
  await P.click('.avatar-option >> nth=0'); await P.click('#btn-join');
  await P.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await P.textContent('#share-room')).trim();
  await Q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await Q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await Q.fill('#input-name', '小雨');
  await Q.click('details.adv summary'); await Q.click('#chk-local');
  await Q.fill('#input-room', room);
  await Q.click('.avatar-option >> nth=0'); await Q.click('#btn-join');
  await P.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await Q.waitForTimeout(800);
  await P.click('#btn-start');
  await P.waitForSelector('#screen-game.active', { timeout: 15000 });
  await Q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await P.waitForTimeout(2200);

  const chooserTab = async () => { for (const pg of [P, Q]) if (await pg.evaluate(() => S.turn.chooserId === myId)) return pg; return null; };
  const otherOf = (pg) => pg === P ? Q : P;
  const raycastChoose = async (pg) => {
    for (let a = 0; a < 6; a++) {
      const pt = await pg.evaluate(() => {
        const r = document.getElementById('three-canvas').getBoundingClientRect();
        const cands = [[0.78, 0.976, -0.12], [0.9, 0.976, -0.2], [0.62, 0.976, -0.02], [-0.78, 0.976, -0.12], [-0.9, 0.976, -0.2], [0.62, 0.976, 0.05]];
        for (const c of cands) {
          const v = new THREE.Vector3(c[0], c[1], c[2]).project(window.__three.camera);
          const x = (v.x + 1) / 2 * r.width + r.left, y = (1 - (v.y + 1) / 2) * r.height + r.top;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest && !el.closest('.player-card,#game-tools,#stage-actions,button')) return { x: +x.toFixed(0), y: +y.toFixed(0) };
        }
        return null;
      });
      if (!pt) return null;
      await pg.mouse.click(pt.x, pt.y);
      await pg.waitForTimeout(500);
      const ok = await pg.evaluate(() => S.turn.stage === 'drawing' && S.turn.chooserId === myId);
      if (ok) return true;
      if (await pg.evaluate(() => S.turn.stage) !== 'choosing') return false;
      await pg.waitForTimeout(800);
    }
    return false;
  };
  const waitRevealed = async (pg) => {
    await pg.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await pg.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await pg.waitForTimeout(2600);   // 翻面+打字机
  };

  // ═══ B1 揭晓近景相机是否落幅 ═══
  let C = await chooserTab();
  await C.evaluate(() => document.getElementById('card-dare').click());
  await C.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
  await waitRevealed(C);
  const camSeries = [];
  for (let i = 0; i < 6; i++) {
    camSeries.push((await gl(C, 'cam' + i)).cam);
    await C.waitForTimeout(900);
  }
  const atTarget = camSeries.some(c => Math.abs(c[0] + 1.2) < 0.2 && Math.abs(c[1] - 2.82) < 0.25 && Math.abs(c[2] - 0.46) < 0.35);
  rec('B1-reveal-cam-converge', '揭晓近景相机 6s 内是否落到 REVEAL_POS[−1.2,2.82,0.46]', '收敛到位', camSeries, atTarget);
  await C.screenshot({ path: path.join(SHOTS, 'fl-B-reveal-final.png') });
  // 回到 choosing 继续（跳过）
  await C.click('#btn-skip');
  await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });

  // ═══ B2 快速连点选卡（3 连击只算 1 次）═══
  C = await chooserTab();
  if (!C) { rec('B2', '环境异常', '', 'no chooser', false); }
  else {
    const meBefore = await st(C);
    await C.evaluate(() => {
      const b = document.getElementById('card-dare');
      b.click(); b.click(); b.click();
    });
    await C.waitForTimeout(900);
    const after = await st(C);
    const dRounds = after.rounds - meBefore.rounds, dDraws = after.players.reduce((s, p) => s + p.draws, 0) - meBefore.players.reduce((s, p) => s + p.draws, 0);
    rec('B2-rapid-triple-click', '选卡 3 连击', '仅 1 次抽卡：Δdraws=1、Δrounds=1、Δseq=1',
      { dDraws, dRounds, dSeq: after.seq - meBefore.seq, stage: after.stage, choice: after.choice },
      after.stage === 'drawing' && after.choice === 'dare' && dRounds === 1 && dDraws === 1 && after.seq === meBefore.seq + 1);
    // B3 同时动作：非选择者在 drawing 期调 choose
    const O = otherOf(C);
    await O.evaluate(() => { try { choose('truth'); } catch (e) {} });
    await O.waitForTimeout(500);
    const oSt = await st(O);
    const cSt2 = await st(C);
    rec('B3-opponent-blocked', '对手在抽卡期抢选', '被拒（toast 提示），choice 未被改写',
      { toast: oSt.toast, choiceStill: cSt2.choice },
      /轮到你|抽卡时机|抢/.test(oSt.toast) && cSt2.choice === 'dare');
    // B4 非选择者 raycast 点桌面选卡（drawing 期）
    const pt4 = await O.evaluate(() => {
      const r = document.getElementById('three-canvas').getBoundingClientRect();
      const v = new THREE.Vector3(0.78, 0.976, -0.12).project(window.__three.camera);
      return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - (v.y + 1) / 2) * r.height + r.top };
    });
    await O.mouse.click(pt4.x, pt4.y);
    await O.waitForTimeout(400);
    const dbg4 = await O.evaluate(() => window.__rayDbg || {});
    const gl4 = await gl(O, 'B4');
    rec('B4-raycast-during-drawing', '抽卡期点桌面选卡', '被阶段闩锁拒绝(stage!=choosing)，双卡无选中残影',
      { dbg: dbg4, choice: gl4.choice },
      (dbg4.stop || '').indexOf('stage') === 0 && gl4.choice.every(c => c.rotX === 0 && c.op === 1));
    await waitRevealed(C);
  }

  // ═══ B5 免答牌（换题不留痕）+ 3D 题面是否同步重绘 ═══
  C = await chooserTab();
  {
    const before = await st(C);
    const clip = await C.evaluate(() => {
      if (!window.THREE || !window.__three) return null;
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
    const shot1 = clip ? await C.screenshot({ clip, path: path.join(SHOTS, 'fl-B-pass-before.png') }) : null;
    const passVisible = before.passVisible;
    await C.click('#btn-pass');
    await C.waitForTimeout(2600);   // usePass mutate + playReveal 重播
    const afterP = await st(C);
    rec('B5-pass-effect', '免答牌：静默换题', 'punishment 变化、seq+1、chooser passes−1、score 不变、stage 仍 revealed',
      { punishChanged: afterP.punish !== before.punish, passes: afterP.players.map(p => p.passes), dScores: afterP.players.map((p, i) => p.score - before.players[i].score), skips: afterP.tStat.skips, stage: afterP.stage, seq: [before.seq, afterP.seq] },
      afterP.punish !== before.punish && afterP.players.some(p => p.passes === 1) && afterP.players.every((p, i) => p.score === before.players[i].score) && afterP.stage === 'revealed' && afterP.seq === before.seq + 1);
    const shot2 = clip ? await C.screenshot({ clip, path: path.join(SHOTS, 'fl-B-pass-after.png') }) : null;
    if (shot1 && shot2) {
      const diffRatio = await C.evaluate(async (arg) => {
        const load = (d) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d; });
        const [ia, ib] = await Promise.all([load(arg.a), load(arg.b)]);
        const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
        const g = cv.getContext('2d');
        g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data;
        g.clearRect(0, 0, cv.width, cv.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
        let diff = 0;
        for (let i = 0; i < da.length; i += 4) { if (Math.abs(da[i] - db[i]) > 10 || Math.abs(da[i + 1] - db[i + 1]) > 10 || Math.abs(da[i + 2] - db[i + 2]) > 10) diff++; }
        return diff / (da.length / 4);
      }, { a: shot1.toString('base64'), b: shot2.toString('base64') });
      rec('B5b-3d-texture-refresh', '免答牌后 3D 题面是否重绘（>2% 像素变化=重绘了）', '题面应更新为新题', { diffRatio: +diffRatio.toFixed(4) },
        diffRatio > 0.02);
    } else rec('B5b-3d-texture-refresh', '免答牌后 3D 题面是否重绘', 'clip 失败', null, false);
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
  }

  // ═══ B6 主持人换一题（host 非 chooser 时）═══
  let H = (await P.evaluate(() => isHost())) ? P : Q;
  C = await chooserTab();
  if (C && C !== H) {
    await raycastChoose(C).catch(() => {});
    if (await C.evaluate(() => S.turn.stage) === 'drawing') {
      await waitRevealed(C);
      const before = await st(H);
      const rerollVis = before.rerollVisible;
      await H.click('#btn-reroll');
      await H.waitForTimeout(2500);
      const afterR = await st(H), afterRC = await st(C);
      rec('B6-host-reroll', '主持人换一题', 'punishment 变化、seq+1、按钮可见可点、不崩',
        { rerollVis, changed: afterR.punish !== before.punish, seq: [before.seq, afterR.seq], stage: afterR.stage, errs: errs.length },
        rerollVis && afterR.punish !== before.punish && afterR.stage === 'revealed' && afterR.seq === before.seq + 1);
      // 3D 题面同步？同 B5 截图对比
      const clip = await C.evaluate(() => {
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
      if (clip) await C.screenshot({ clip, path: path.join(SHOTS, 'fl-B-reroll-after.png') });
      await C.click('#btn-accept');
      await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    }
  } else rec('B6-host-reroll', '主持人换一题（host==chooser 跳过本轮验证）', '环境', 'host is chooser this round', true);

  // ═══ B7 加倍挑战 ═══
  C = await chooserTab();
  {
    const b7 = await st(C);
    rec('B7a-stake-visible', '加倍按钮在 #stage-actions 可见（本回合持麦人）', 'stakeVisible=true',
      { vis: b7.stakeVisible, parent: b7.cardActionsParent }, b7.stakeVisible);
    await C.click('#btn-stake');
    await C.waitForTimeout(600);
    const b7b = await st(C);
    rec('B7b-stake-on', '点加倍 → stake=2、按钮收起', 'S.turn.stake=2 且加倍的入口隐藏',
      { stake: b7b.stake, vis: b7b.stakeVisible }, b7b.stake === 2 && !b7b.stakeVisible);
    await raycastChoose(C);
    await waitRevealed(C);
    const b7c = await st(C);
    rec('B7c-stake-labels', '加倍后按钮文案/徽章', '完成啦含 +20、跳过含 −10',
      { acc: b7c.acceptTxt, skip: b7c.skipTxt }, /\+20/.test(b7c.acceptTxt) && /−10/.test(b7c.skipTxt));
    await C.click('#btn-accept');
    await C.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    await C.waitForTimeout(800);
    const b7d = await st(C);
    rec('B7d-stake-accept-20', '加倍完成 +20', 'chooser score=20', { players: b7d.players }, b7d.players.some(p => p.score === 20));
  }

  // ═══ B8 竞态：chooser 点完成 vs host 点换一题（几乎同时）═══
  C = await chooserTab();
  if (C && C !== H) {
    await raycastChoose(C);
    await waitRevealed(C);
    const before = await st(H);
    const p1 = C.click('#btn-accept').catch(e => 'accept-err:' + e.message);
    await H.click('#btn-reroll').catch(e => 'reroll-err:' + e.message);
    await p1;
    await C.waitForTimeout(2000);
    const after = await st(H);
    const roundsDelta = after.rounds - before.rounds;
    rec('B8-race-accept-reroll', '竞态：完成啦 vs 换一题同时', '恰好一次结算（rounds+1、有 ±分），终态 choosing，无页面错',
      { stage: after.stage, roundsDelta, scores: after.players.map(p => p.score), errs: errs.length },
      after.stage === 'choosing' && roundsDelta === 1 && errs.length === 0);
  } else rec('B8-race-accept-reroll', '竞态（host==chooser 跳过）', '-', 'skipped', true);

  // ═══ B9 自由局重复持麦：旧动作按钮是否残影 ═══
  await H.click('#btn-back-lobby').catch(async () => { await H.evaluate(() => { try { endGame(); } catch (e) {} }); });
  await H.waitForSelector('#screen-lobby.active', { timeout: 10000 }).catch(() => {});
  const inLobby = await H.evaluate(() => document.getElementById('screen-lobby').classList.contains('active'));
  if (inLobby) {
    await H.click('#mode-pick .mode-opt[data-mode="free"]');
    await H.click('#btn-start');
    await P.waitForSelector('#screen-game.active', { timeout: 15000 });
    await Q.waitForSelector('#screen-game.active', { timeout: 15000 });
    await P.waitForTimeout(2000);
    // P 抢麦 → revealed → accept → P 再抢
    await P.evaluate(() => document.getElementById('card-dare').click());
    await P.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    await waitRevealed(P);
    await P.click('#btn-accept');
    await P.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 8000 });
    await P.waitForTimeout(1200);
    const f1 = await st(P);
    rec('B9a-free-repeat-stale', '自由局连续持麦：选卡期旧动作按钮是否残留可见', '不应看到上一轮的 完成啦/跳过',
      { accVisible: f1.accVisible, parent: f1.cardActionsParent, stage: f1.stage }, !f1.accVisible);
    await P.screenshot({ path: path.join(SHOTS, 'fl-B-free-repeat.png') });
    // 再抢一局确认可玩
    await P.evaluate(() => document.getElementById('card-dare').click());
    await P.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 8000 });
    rec('B9b-free-repeat-play', '自由局再抢再玩', '可再进入 drawing', true, true);
  } else rec('B9-free', '自由局（回大厅失败跳过）', '-', { inLobby }, false);

  // 名牌贴头检查（用 B1 收集的 plates 单独跑一次选卡期）
  const plates = await gl(P, 'plates');
  const plateOff = plates.plates.filter(p => p.headProj && Math.hypot(p.plateXY[0] - p.headProj[0], p.plateXY[1] - p.headProj[1]) > 90);
  rec('B10-plates', '名牌贴头（名牌中心与头顶投影距离 ≤90px）', '全部贴合', { plates: plates.plates, off: plateOff }, plateOff.length === 0);

  log('ERRORS:', errs.length ? errs.join(' || ').slice(0, 1200) : 'none');
  fs.writeFileSync(path.join(ROOT, '.pw', 'fl-B-result.json'), JSON.stringify({ results: R, errs }, null, 2));
  const fails = R.filter(r => !r.pass);
  log('==== SUMMARY: ' + (R.length - fails.length) + '/' + R.length + ' PASS ====');
  fails.forEach(f => log('FAIL ' + f.id + ': exp=' + f.expect + ' act=' + JSON.stringify(f.actual)));
  await browser.close();
  server.close();
  process.exit(0);
})();
