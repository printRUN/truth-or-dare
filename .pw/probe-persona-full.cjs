// 全流程玩家模拟（8895）：三人房完整对局走查——建房/入座/开局、三回合（完成+赢蛋/瞄准扔蛋/跳过/免答牌）、
// 表情气泡、主持人（点名/换一题/结算/再来一局）、刷新自动回房、退房；全程零 pageerror
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8895;
const log = (...a) => console.log('[persona]', ...a);
let fails = 0;
const errors = [];
function ok(cond, name, detail) {
  if (cond) log('  ✅', name, detail !== undefined ? JSON.stringify(detail) : '');
  else { fails++; log('  ❌', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const mk = async (nm, av) => {
    const q = await ctx.newPage();
    q.on('pageerror', e => errors.push(nm + ' pageerror: ' + e.message));
    q.on('console', m => { if (m.type() === 'error') errors.push(nm + ' console: ' + m.text()); });
    await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
    await q.fill('#input-name', nm);
    await q.click('details.adv summary');
    await q.click('#chk-local');
    await q.click(`.avatar-option >> nth=0`);
    return q;
  };

  // ── P1 建房与入座 ──
  const A = await mk('阿泽', 0);
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await A.textContent('#share-room')).trim();
  ok(!!room, 'P1 host creates room', room);
  const B = await mk('小雨', 1);
  await B.fill('#input-room', room); await B.click('#btn-join');
  const C = await mk('婷婷', 2);
  await C.fill('#input-room', room); await C.click('#btn-join');
  await A.waitForFunction(() => S.players.length >= 3, null, { timeout: 20000 });
  ok(true, 'P1 three players seated');

  // ── P2 开局 ──
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await C.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 8000 });
  ok(true, 'P2 game started on all clients (three3d)');
  await sleep(2200);

  const chooserPage = async () => {
    for (const t of [A, B, C]) { try { if (await t.evaluate(() => S.turn.chooserId === myId)) return t; } catch (e) {} }
    return null;
  };
  const waitStage = async (stage, ms) => {
    for (const t of [A, B, C]) await t.waitForFunction(s => S.turn.stage === s, stage, { timeout: ms || 20000 }).catch(() => errors.push('waitStage ' + stage + ' timeout'));
  };
  const otherPage = async () => {
    for (const t of [A, B, C]) { try { if (await t.evaluate(() => S.turn.chooserId !== myId)) return t; } catch (e) {} }
    return B;
  };
  const topUp = (p, n) => p.evaluate(n2 => mutate(n3 => { const q = n3.players.find(x => x.id === myId); if (q) q.eggs = n2; }), n);

  // ── P3 三回合 ──
  for (let r = 1; r <= 3; r++) {
    await waitStage('choosing');
    const ch = await chooserPage();
    if (!ch) { ok(false, 'P3 r' + r + ' chooser found'); break; }
    await sleep(1500);   // 等开局/交接运镜与 nudge 落定（投影/点击纪律）
    await ch.evaluate(() => choose(Math.random() < 0.5 ? 'truth' : 'dare'));
    await waitStage('drawing', 15000);
    if (r === 2) {   // 抽卡阶段观众瞄准扔蛋（任何阶段可扔）→ 目标=走位中的持牌人（抽卡镜头下画内只有他，真实用户点的就是本体；raycast 路径）→ 该牌稍后跳过 −5
      const sp = await otherPage();
      const target = await sp.evaluate(() => S.turn.chooserId);
      await topUp(sp, 2);
      await sp.click('#btn-egg');
      await sleep(1800);   // 等走位与推镜落定
      const pt = await sp.evaluate(pid => {
        const ch = window.__three.chars.get(pid);
        const v = ch.userData.head.getWorldPosition(new THREE.Vector3());
        const vz = v.clone().applyMatrix4(window.__three.camera.matrixWorldInverse).z;
        v.project(window.__three.camera);
        return { vz: +vz.toFixed(2), x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - (v.y + 1) / 2) * innerHeight) };
      }, target);
      ok(pt.vz < 0, 'P3 r2 walker in front of camera (raycast reachable)', pt);   // 推镜后相机距走位者极近，投影可越出视口——射线仍会命中，不按「画内」断言
      await sp.mouse.click(pt.x, pt.y);
      await sleep(1500);
      const spEggs = await sp.evaluate(() => eggsOf(me()));
      ok(spEggs < 2, 'P3 r2 spectator egg thrown at walker via body click', spEggs);
    }
    await waitStage('revealed', 25000);
    const chName = await ch.evaluate(() => myId.slice(-4));

    if (r === 1) {   // 完成 = 赢家 +10 分 +1 蛋
      const before = await ch.evaluate(() => ({ score: me().score || 0, eggs: eggsOf(me()) }));
      await ch.click('#btn-accept');
      await waitStage('choosing', 15000);
      const after = await ch.evaluate(() => ({ score: me().score || 0, eggs: eggsOf(me()) }));
      ok(after.score === before.score + 10 && after.eggs === before.eggs + 1, 'P3 r1 accept: +10 score, +1 egg', [before, after]);
    } else if (r === 2) {   // 该牌跳过 −5
      await ch.click('#btn-skip');
      await waitStage('choosing', 15000);
      const sk = await ch.evaluate(() => me().score || 0);
      ok(sk <= -5, 'P3 r2 skip: score -5 applied', sk);
    } else if (r === 3) {   // 免答牌换一题再完成
      const passes0 = await ch.evaluate(() => me().passes ?? 2);
      await ch.waitForFunction(() => window.__three.fxState().cardPhase === 'shown', null, { timeout: 15000 }).catch(() => {});
      await ch.click('#btn-pass');
      await ch.waitForFunction(() => window.__three.fxState().cardPhase === 'shown', null, { timeout: 9000 }).catch(() => {});
      const st = await ch.evaluate(() => ({ stage: S.turn.stage, passes: me().passes ?? 2, phase: window.__three.fxState().cardPhase }));
      ok(st.stage === 'revealed' && st.passes === passes0 - 1 && st.phase === 'shown', 'P3 r3 pass card re-dealt, still revealed', st);
      await ch.click('#btn-accept');
      await waitStage('choosing', 15000);
      ok(true, 'P3 r3 accepted after pass');
    }

    // 每回合换段时来一发表情（第一位观众开 dock 真点）
    const sp2 = await otherPage();
    try {
      await sp2.click('#react-fab'); await sleep(150);
      await sp2.click('[data-react="🔥"]'); await sleep(250);
      const bub = await sp2.evaluate(() => window.__three.fxState().bubbles > 0);
      ok(bub, 'P3 r' + r + ' reaction bubble on sender');
      await sp2.keyboard.press('Escape');
    } catch (e) { ok(false, 'P3 r' + r + ' reaction', e.message); }
  }

  // ── P4 主持人：随机点名 + 换一题 ──
  await waitStage('choosing');
  await sleep(1200);
  const preDesig = await A.evaluate(() => S.turn.chooserId);
  await A.click('#btn-pick-next');
  await A.waitForFunction(old => S.turn.chooserId && S.turn.chooserId !== old, preDesig, { timeout: 8000 }).catch(() => {});   // 等光圈跑完、点名落地
  await sleep(700);
  const desig = await A.evaluate(() => S.turn.chooserId);
  ok(desig && desig !== preDesig, 'P4 host random designate landed (new chooser)', { pre: preDesig && preDesig.slice(-4), now: desig && desig.slice(-4) });
  const chp = await chooserPage();
  if (chp) {
    await sleep(800);
    await chp.evaluate(() => choose('dare'));
    await waitStage('revealed', 20000);
    const q1 = await chp.evaluate(() => S.turn.punishment);
    await chp.waitForSelector('#btn-reroll', { state: 'visible', timeout: 10000 }).catch(() => {});
    const seq0 = await A.evaluate(() => ({ seq: S.turn.seq, p: S.turn.punishment, host: S.hostId === myId, stage: S.turn.stage, vis: !document.getElementById('btn-reroll').hidden }));
    await A.evaluate(() => {   // 诊断：处理器是否真的被调用 + 元素是否被重建
      window.__rr = 0; window.__rrEl = document.getElementById('btn-reroll');
      const o = hostReroll; hostReroll = function () { window.__rr++; return o.apply(this, arguments); };
    });
    await A.click('#btn-reroll').catch(() => {});
    await sleep(800);
    const seq1 = await A.evaluate(q0 => ({ seq: S.turn.seq, p: S.turn.punishment, same: S.turn.punishment === q0, rr: window.__rr, elSame: window.__rrEl === document.getElementById('btn-reroll'), cov: (() => { const el = window.__rrEl; const r = el.getBoundingClientRect(); if (!r.width) return 'zero-box'; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h ? (h.id ? '#' + h.id : String(h.className).slice(0, 30)) : 'null'; })(), rect: (() => { const r = window.__rrEl.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })() }), q1);
    const q2 = await chp.evaluate(() => S.turn.punishment);
    ok(q1 && q2 && q1 !== q2, 'P4 host reroll changed the question', { q1: (q1 || '').slice(0, 10), q2: (q2 || '').slice(0, 10), seq0, seq1 });
    await chp.waitForFunction(() => window.__three.fxState().cardPhase === 'shown', null, { timeout: 9000 }).catch(() => {});
    await chp.click('#btn-skip');
    await waitStage('choosing', 15000);
  }

  // ── P5 刷新自动回房（B）──
  const bid = await B.evaluate(() => myId);
  await B.reload();
  await B.waitForSelector('#screen-game.active', { timeout: 25000 });
  const bid2 = await B.evaluate(() => myId);
  ok(bid2 === bid, 'P5 refresh rejoins same identity, back at table', [bid, bid2].map(s => s.slice(-4)));

  // ── P6 结算与再来一局 ──
  await A.click('#btn-finish-game'); await sleep(250); await A.click('#btn-finish-game');
  await A.waitForSelector('#screen-result.active', { timeout: 15000 });
  await B.waitForSelector('#screen-result.active', { timeout: 15000 });
  const podium = await A.evaluate(() => document.querySelectorAll('#result-podium .pod').length);
  ok(podium >= 1, 'P6 result podium rendered', podium);
  await A.screenshot({ path: 'shots/persona-result.png' });
  await A.click('#btn-rematch');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  const reset = await A.evaluate(() => ({ score: me().score || 0, eggs: eggsOf(me()), started: S.gameStarted }));
  ok(reset.started && reset.score === 0 && reset.eggs === 1, 'P6 rematch resets scores and eggs', reset);

  // ── P7 退房 ──
  await C.click('#btn-leave-game');
  await C.waitForSelector('#screen-join.active', { timeout: 10000 });
  ok(true, 'P7 leave returns to join screen');

  log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
  log(fails === 0 && errors.length === 0 ? 'PERSONA FULL-GAME WALKTHROUGH PASSED ✅' : `FAILURES: ${fails}`);
  await browser.close();
  server.close();
  process.exitCode = (fails || errors.length) ? 1 : 0;
})().catch(e => { console.error('[persona] fatal', e); process.exit(1); });
