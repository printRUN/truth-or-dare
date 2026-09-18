// review-code.cjs — 交付终审烟测（只新建这一个文件，跑完可删）
// 用法: node review-code.cjs   （from .pw/；自带静态服务器，端口 8805）
//
// A. 快速连跳两次换屏（真实链路）：join→lobby 揭幕 400ms 后立刻 lobby→game，
//    断言所有屏无 entering/leaving 残留、无内联 width/animationDelay 残留、无跑着的 scene 动画。
// B. 陈旧 _txT 复现（全合成、确定性）：nav1 按 hideLoading 原句把 lobby 挂 entering(delay140,_txT@1000)，
//    nav2(+450ms) 再把 lobby 挂 leaving(delay140)——armCube 不清 _txT，
//    采样 _txT 响起前后 scene-out 的 animationDelay 与 currentTime，验证「中途清 delay → 动画被重定时」。
// C. 换题打断揭晓仪式（主持人 reroll 踩在主翻窗口）：断言二轮揭晓自愈 + 旁观端 bet-box 三段取证。
// D. REDUCED 连续换屏 + 揭晓 + 结算×2：无残留、不建 #result-veil、镀铬还原。
// E. 颁奖礼生命周期：ceremony→重绘不重放→再来一局→再结算复播。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8805;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const errors = [];
let fails = 0;
const log = (...a) => console.log('[review]', ...a);
const check = (cond, msg, extra) => { log((cond ? '  ✅ ' : '  ❌ ') + msg, extra !== undefined ? JSON.stringify(extra) : ''); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

async function open(ctx, tag, viewport, extra = {}) {
  const p = await ctx.newPage();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  p.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.setViewportSize(viewport);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide');
  }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}

async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 全局 residue 快照：退场类（active 是合法态，不计）/内联残留 + 跑着的 scene/plate 动画
const residueSnapshot = () => {
  const out = { screens: [], runningAnims: [], overlay: !!document.getElementById('loading-overlay') };
  document.querySelectorAll('.screen').forEach(s => {
    const cls = [...s.classList].filter(c => c !== 'screen' && c !== 'active').join(' ');
    const rec = { id: s.id, cls, width: s.style.width || '', delay: s.style.animationDelay || '' };
    if (rec.cls || rec.width || rec.delay) out.screens.push(rec);
  });
  document.getAnimations().forEach(a => {
    const el = a.effect && a.effect.target;
    if (el && el.classList && ['scene-in', 'scene-out', 'scene-in-lite', 'scene-out-lite', 'plate-in', 'plate-out'].includes(a.animationName))
      out.runningAnims.push(`${el.id || el.className}:${a.animationName}@${a.playState}`);
  });
  return out;
};

(async () => {
  await new Promise(r => { server.listen(PORT, r); log(`serving :${PORT}`); });
  const browser = await chromium.launch({ args: ['--disable-gpu'] });

  // ════ A：真实快速连跳 ════
  {
    log('── A 快速连跳（真实链路）──');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'A', { width: 1280, height: 800 });
    await join(A, '阿跳');
    await A.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !!o && !o.classList.contains('hide'); }, null, { timeout: 20000 });
    await A.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !!o && o.classList.contains('hide'); }, null, { timeout: 20000 });
    await sleep(400);   // 加载层已 remove（_rm=300ms），此刻换屏走直接路径（delay=0）
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));
    await A.waitForSelector('#screen-game.active', { timeout: 10000 });
    await sleep(1800);   // 等 900/1000ms 清理定时器全部走完
    const resA = await A.evaluate(residueSnapshot);
    check(resA.screens.length === 0, 'A. 快速连跳后所有屏无退场类/width/animationDelay 残留', resA.screens);
    check(resA.runningAnims.length === 0, 'A. 无跑着的 scene/plate 动画残留', resA.runningAnims);
    check(!resA.overlay, 'A. 加载层已移除');
    await ctx.close();
  }

  // ════ B：陈旧 _txT 重定时（全合成、确定性） ════
  {
    log('── B 陈旧 _txT 复现（合成，逐字复刻 hideLoading 调用）──');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'B', { width: 1280, height: 800 });
    await join(A, '阿计');
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => !document.getElementById('loading-overlay'), null, { timeout: 10000 });
    await sleep(1300);   // 开机链路的定时器全部落定，从干净态开始
    // nav1（t=0）：与 hideLoading 逐字同款 —— join 挂 entering(delay140) + _txT@1000，lobby 挂 leaving
    await A.evaluate(() => {
      document.getElementById('screen-lobby').classList.remove('active');
      document.getElementById('screen-join').classList.add('active');
      armCube('lobby', 'join', 140);
      playSceneEnter('join', false, 140);
    });
    await sleep(450);    // nav2：join 再度被换出（armCube 不清 _txT → join 的 _txT 还有 550ms 响）
    await A.evaluate(() => {
      document.getElementById('screen-join').classList.remove('active');
      document.getElementById('screen-game').classList.add('active');
      armCube('join', 'game', 140);
      playSceneEnter('game', false, 140);
    });
    // join 的 scene-out：t0+590 起播（delay140）、t0+1230 应结束；join 的陈旧 _txT 在 t0+1000 响
    const probe = () => A.evaluate(() => {
      const J = document.getElementById('screen-join');
      const a = J.getAnimations().find(x => x.animationName === 'scene-out');
      return { delay: J.style.animationDelay || '', ct: a ? +a.currentTime.toFixed(0) : -1, ps: a ? a.playState : 'gone', leaving: J.classList.contains('leaving') };
    });
    const s1 = await (async () => { await sleep(320); return probe(); })();   // t0≈950：_txT 未响，动画应 running + delay140
    const s2 = await (async () => { await sleep(180); return probe(); })();   // t0≈1150：_txT 已响（t0+1000）
    log(`B. join.scene-out: delay=${s1.delay} ct=${s1.ct}(${s1.ps}) → +180ms delay=${s2.delay} ct=${s2.ct}(${s2.ps})`);
    const cleared = s1.delay === '140ms' && s1.ps === 'running' && s2.delay === '';
    const linear = s2.ct > 0 && Math.abs((s2.ct - s1.ct) - 180) < 120;   // 动画钟随墙钟线性走 = 时间线连续无跳变
    if (cleared && linear) {
      check(true, 'B. 结论：陈旧 _txT 确会在离场动画中途清 animationDelay（140ms→\'\'），但 Chromium 对运行中的动画保持时间线连续（currentTime 线性推进、结束时刻不变）→ 无可见跳帧，仅卫生问题（armCube 建议顺手 clearTimeout(old._txT)）', { s1, s2 });
    } else {
      check(false, 'B. 时序与预期不符，需人工复核', { s1, s2, cleared, linear });
    }
    await sleep(1500);
    const resB = await A.evaluate(residueSnapshot);
    check(resB.screens.length === 0 && resB.runningAnims.length === 0, 'B. 收尾无残留（_txL 兜底有效）', resB);
    await ctx.close();
  }

  // ════ C+E：换题打断揭晓 + 颁奖礼生命周期（双人局） ════
  {
    log('── C/E 换题打断 + 颁奖礼 ──');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'A', { width: 1280, height: 800 });
    await join(A, '阿主持');
    await A.waitForFunction(() => S && S.room, null, { timeout: 20000 });
    const room = await A.evaluate(() => S.room);
    const B = await open(ctx, 'B', { width: 1280, height: 800 });
    await join(B, '阿观', room);
    await A.waitForFunction(() => S.players.length === 2, null, { timeout: 20000 });
    await A.evaluate(() => { document.querySelector('.mode-opt[data-mode="free"]').click(); document.getElementById('btn-start').click(); });
    await A.waitForFunction(() => S.mode === 'free', null, { timeout: 10000 });
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForSelector('#choice-section:not([hidden])', { timeout: 20000 });
    await A.evaluate(() => setLowPerf(false, 'full'));
    await B.evaluate(() => setLowPerf(false, 'full'));

    const betSeen = B.waitForFunction(() => S && S.turn && S.turn.stage === 'revealed', null, { timeout: 40000 }).then(() => true).catch(() => false);
    await A.click('#card-truth');
    await betSeen;
    await B.waitForTimeout(250);
    const betEarly = await B.evaluate(() => {
      const b = document.getElementById('bet-box');
      return { hidden: b.hidden, op: getComputedStyle(b).opacity, revealAnim, stage: S.turn.stage };
    });
    log('C. bet-box @revealed到达+250ms:', JSON.stringify(betEarly));
    check(betEarly.revealAnim === true && betEarly.stage === 'revealed' && !betEarly.hidden,
      'C. 取证：bet-box 在揭晓动画期间就提前显示（主翻起点会被 chromeEls 闪灭一次，设计要求落定才浮现）', betEarly);

    await A.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 30000 });
    await A.evaluate(() => document.getElementById('btn-reroll').click());
    await A.waitForFunction(() => revealAnim === false && S.turn.stage === 'revealed' && S.turn.punishment, null, { timeout: 30000 });
    await B.waitForFunction(() => revealAnim === false, null, { timeout: 30000 });
    await sleep(400);
    const afterInterruptA = await A.evaluate(() => ({
      badge: document.getElementById('type-badge').textContent,
      owner: document.getElementById('card-owner').textContent,
      flipTrans: document.getElementById('flip-card').style.transition || '(空)',
      actionsOp: document.getElementById('card-actions').style.opacity || '(空)',
      hold: surpriseTagHold,
      seq: S.turn.seq,
    }));
    check(afterInterruptA.badge.length > 0 && afterInterruptA.owner.length > 0, 'C. 打断后二轮揭晓自愈：徽章/署名已上屏', afterInterruptA);
    check(afterInterruptA.flipTrans === '(空)', 'C. flip-card transition 已还回（三段式收尾干净）', afterInterruptA.flipTrans);
    check(afterInterruptA.hold === false, 'C. surpriseTagHold 已释放（换题路径不永久按住角标）');
    const afterInterruptB = await B.evaluate(() => {
      const b = document.getElementById('bet-box');
      const w = document.getElementById('reveal-wait');
      return { betOp: b.style.opacity || '(空)', betHidden: b.hidden, waitOp: w.style.opacity || '(空)', waitDisp: w.style.display };
    });
    check(afterInterruptB.betOp === '1' && afterInterruptB.waitOp === '1', 'C. 旁观端镀铬层 opacity 均收在 1（无停在 0 的路径）', afterInterruptB);
    check(afterInterruptB.betHidden === false, 'C. 旁观端押注面板在场', afterInterruptB);

    // E. 颁奖礼：完成 → 结算 → ceremony → 重绘不重放 → 再来一局 → 再结算复播
    await A.click('#btn-accept');
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => document.getElementById('btn-finish-game').dataset.armed === '1', null, { timeout: 5000 });
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => S.finished, null, { timeout: 8000 });
    await A.waitForSelector('#screen-result.active', { timeout: 20000 });
    const c1 = await A.evaluate(() => ({
      ceremony: document.getElementById('result-podium').classList.contains('ceremony'),
      firstPod: document.querySelector('#result-podium .pod')?.className || '',
      score0: document.querySelector('#result-podium .pod .pscore')?.textContent || '',
      veil: !!document.getElementById('result-veil'),
      veilOn: !!(document.getElementById('result-veil') || {}).classList?.contains?.('on') || document.getElementById('result-veil')?.classList.contains('on'),
      at: S.finished.at, ceremonyAt: resultCeremonyAt,
    }));
    check(c1.ceremony, 'E1. 换屏进入 result 挂 ceremony', { at: c1.at, ceremonyAt: c1.ceremonyAt });
    check(c1.firstPod.includes('p1'), 'E1. podium DOM 序 = 名次序（pods[0]=冠军）', c1.firstPod);
    check(c1.veil && c1.veilOn, 'E1. #result-veil 挂 body 且 .on', c1);
    const st1 = c1.score0;
    await A.evaluate(() => renderScreen());
    const c2 = await A.evaluate(() => ({ ceremony: document.getElementById('result-podium').classList.contains('ceremony'), score0: document.querySelector('#result-podium .pod .pscore')?.textContent }));
    check(!c2.ceremony && c2.score0 === st1, 'E2. 重绘走无类终态：不重放、分数不变（重放红线）', c2);
    await A.evaluate(() => document.getElementById('btn-rematch').click());
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    await B.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForSelector('#choice-section:not([hidden])', { timeout: 30000 });
    await A.click('#card-truth');
    await A.waitForFunction(() => revealAnim === false, null, { timeout: 40000 });
    await A.click('#btn-accept');
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => document.getElementById('btn-finish-game').dataset.armed === '1', null, { timeout: 5000 });
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => S.finished, null, { timeout: 8000 });
    await A.waitForSelector('#screen-result.active', { timeout: 20000 });
    const c3 = await A.evaluate(() => ({
      ceremony: document.getElementById('result-podium').classList.contains('ceremony'),
      at: S.finished.at, ceremonyAt: resultCeremonyAt,
    }));
    check(c3.ceremony && c3.at !== c1.at, 'E3. 再来一局→再结算：新 finished.at 换来第二次 ceremony（不误判）', c3);
    await ctx.close();
  }

  // ════ D：REDUCED 连续换屏 + 揭晓 + 结算×2 ════
  {
    log('── D REDUCED ──');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const A = await open(ctx, 'R', { width: 390, height: 844 });
    const reduced = await A.evaluate(() => REDUCED);
    check(reduced, 'D. REDUCED 生效（matchMedia 命中）');
    await join(A, '阿静');
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => S && S.room, null, { timeout: 20000 });
    // 连续快速换屏：lobby→game→lobby→game（换屏直接路径，无揭幕）
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));
    await A.waitForSelector('#screen-game.active', { timeout: 10000 });
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));
    await A.waitForSelector('#screen-lobby.active', { timeout: 10000 });
    await A.evaluate(() => mutate(n => { n.gameStarted = true; n.mode = 'free'; }));
    await A.waitForSelector('#screen-game.active', { timeout: 10000 });
    await sleep(1300);
    const resR = await A.evaluate(residueSnapshot);
    check(resR.screens.length === 0 && resR.runningAnims.length === 0, 'D. REDUCED 连跳后无退场类/内联/动画残留', resR);
    await A.waitForSelector('#choice-section:not([hidden])', { timeout: 20000 });
    await A.click('#card-truth');
    const revealedOk = await A.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 30000 }).then(() => true).catch(() => false);
    if (!revealedOk) {
      const dbg = await A.evaluate(() => ({ stage: S.turn.stage, seq: S.turn.seq, chooser: S.turn.chooserId, myId, revealAnim, mode: S.mode, choiceSectionHidden: document.getElementById('choice-section').hidden }));
      check(false, 'D. 诊断：revealed 未到达', dbg);
    } else {
      await A.waitForFunction(() => revealAnim === false, null, { timeout: 20000 });
      const redReveal = await A.evaluate(() => ({
        badge: document.getElementById('type-badge').textContent,
        flipTrans: document.getElementById('flip-card').style.transition || '(空)',
        actionsOp: document.getElementById('card-actions').style.opacity || '(空)',
        waitOp: document.getElementById('reveal-wait').style.opacity || '(空)',
        hold: surpriseTagHold,
      }));
      check(redReveal.badge.length > 0, 'D. REDUCED 揭晓徽章直出', redReveal);
      check(redReveal.flipTrans === '(空)', 'D. REDUCED 不碰 flip-card transition', redReveal);
      check(redReveal.actionsOp === '(空)' && redReveal.waitOp === '(空)', 'D. REDUCED 镀铬 opacity 内联已还原', redReveal);
      check(redReveal.hold === false, 'D. REDUCED surpriseTagHold 已释放');
      await A.click('#btn-accept');   // 先完成挑战回 choosing，第二轮结算才有干净回合
      await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    }
    for (let round = 1; round <= 2; round++) {
      await A.evaluate(() => document.getElementById('btn-finish-game').click());
      await A.waitForFunction(() => document.getElementById('btn-finish-game').dataset.armed === '1', null, { timeout: 5000 });
      await A.evaluate(() => document.getElementById('btn-finish-game').click());
      await A.waitForFunction(() => S.finished, null, { timeout: 8000 });
      await A.waitForSelector('#screen-result.active', { timeout: 20000 });
      const rr = await A.evaluate(() => ({
        ceremony: document.getElementById('result-podium').classList.contains('ceremony'),
        veil: !!document.getElementById('result-veil'),
        score0: document.querySelector('#result-podium .pod .pscore')?.textContent || '',
      }));
      check(!rr.ceremony && !rr.veil && rr.score0.length > 0, `D${round}. REDUCED 结算直出终态：无 ceremony、无 veil、pscore 有值`, rr);
      if (round === 1) {
        // finishGame 会把 gameStarted 置 false（合法业务），再结算路径：清 finished + 重新开局
        await A.evaluate(() => mutate(n => { n.finished = null; n.gameStarted = true; }));
        await A.waitForSelector('#screen-game.active', { timeout: 20000 });
        await A.waitForSelector('#choice-section:not([hidden])', { timeout: 30000 });
        await A.click('#card-truth');
        await A.waitForFunction(() => revealAnim === false && S.turn.stage === 'revealed', null, { timeout: 40000 });
      }
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
  log('── 页面错误汇总 ──');
  if (errors.length) errors.forEach(e => log('  ⚠ ', e));
  check(errors.length === 0, '全程无 pageerror / console.error');
  log(`════ 完成：${fails} 项失败 ════`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('[review] fatal:', e); process.exit(2); });
