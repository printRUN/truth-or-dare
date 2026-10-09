// ev-tod-domfade: sim-desktop 基线红（three3d 后 DOM 选卡不可点，drawer.click 基线即挂）的替代取证——
// 关 WebGL 走 CSS 路径（sim-desktop audit 的本意口径），验证 W6 四件套折叠/过渡语义：
// timer-wrap 高度归零+.on 上落、bet-box 离场双态（含 fadeChrome inline transition 压制竞态）、
// stake-row 双向双态、modal .out 180ms+token 重开竞态、REDUCED 直切退路。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8978;
const URL = `http://127.0.0.1:${PORT}/tod.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[ev-tod-domfade]', ...a);
let bad = 0;
const ok = (name, cond, extra) => { if (!cond) bad++; log((cond ? '✅' : '❌') + ' ' + name, extra === undefined ? '' : JSON.stringify(extra)); };

let server = null;
async function startServer() {
  await new Promise((res, rej) => {
    const s = http.createServer((req, res2) => {
      const u = req.url.split('?')[0];
      const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
      fs.readFile(f, (e, d) => {
        if (e) { res2.writeHead(404); res2.end('nf'); return; }
        res2.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res2.end(d);
      });
    });
    server = s; s.on('error', rej); s.listen(PORT, () => res());
  });
}
async function open(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => log('pageerror!', String(e).slice(0, 160)));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}
async function join(p, name, room) {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

(async () => {
  await startServer();
  // --disable-web-gl：body.three3d 不挂（#card-section/选卡恢复 DOM 路径）= sim-desktop audit 的 CSS 口径
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-web-gl', '--disable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:sfx', 'off'); localStorage.setItem('tod:bgm', 'off'); } catch {} });
  try {
    const p1 = await open(ctx);
    await join(p1, '阿凯');
    const room = (await p1.evaluate(() => (document.getElementById('share-room') || {}).textContent || '')).trim();
    const p2 = await open(ctx);
    await join(p2, '阿泽', room);
    await p1.waitForFunction(() => (S.players || []).length >= 2, null, { timeout: 15000 });
    await p1.click('#btn-start');
    await p1.waitForFunction(() => S && S.gameStarted && S.turn.stage === 'choosing', null, { timeout: 20000 });
    await sleep(600);
    const three3d = await p1.evaluate(() => document.body.classList.contains('three3d'));
    ok('CSS 路径生效（three3d 未挂）', three3d === false, { three3d });

    // ── A) 折叠态几何（sim-desktop audit 口径：visibility/高度占位）──
    const folded = await p1.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return {
        timer: { vis: cs('timer-wrap').visibility, h: document.getElementById('timer-wrap').getBoundingClientRect().height },
        bet: { vis: cs('bet-box').visibility, attrHidden: document.getElementById('bet-box').hidden },
      };
    });
    ok('折叠态 timer-wrap: visibility hidden + 高度归零（audit 不采/不占位）', folded.timer.vis === 'hidden' && folded.timer.h === 0, folded.timer);
    ok('折叠态 bet-box: hidden 属性语义保留（!hidden 口径不变）+ visibility hidden', folded.bet.attrHidden === true && folded.bet.vis === 'hidden', folded.bet);

    // ── B) stake-row 双向双态（非持麦人页=折叠态；持麦页=展开态，首选择者可能是任一端）──
    const iAmChooser0 = await p1.evaluate(() => S.turn.chooserId === myId);
    const other0 = iAmChooser0 ? p2 : p1;
    const stakeFold = await other0.evaluate(() => {
      const w = document.getElementById('stake-row');
      return { vis: getComputedStyle(w).visibility, h: w.getBoundingClientRect().height, attrHidden: w.hidden };
    });
    ok('非持麦人 stake-row: visibility hidden + 高度归零（不占位）', stakeFold.vis === 'hidden' && stakeFold.h < 2, stakeFold);
    const stakeOpen = await (iAmChooser0 ? p1 : p2).evaluate(() => {
      const w = document.getElementById('stake-row');
      return { vis: getComputedStyle(w).visibility, h: Math.round(w.getBoundingClientRect().height), attrHidden: w.hidden, tf: getComputedStyle(w).transform };
    });
    ok('持麦人 stake-row 展开：可见 + 高度恢复 + transform 复位', stakeOpen.vis === 'visible' && stakeOpen.h > 20 && (stakeOpen.tf === 'none' || stakeOpen.tf === 'matrix(1, 0, 0, 1, 0, 0)'), stakeOpen);

    // ── C) modal：token 重开竞态 + .out 180ms 出场 ──
    await p1.evaluate(() => { document.getElementById('btn-settings-game').click(); });
    await p1.waitForSelector('#modal-mask:not([hidden]) [data-tm="15"]', { timeout: 8000 });
    await p1.evaluate(() => { document.querySelector('#modal-mask [data-tm="15"]').click(); });
    await p1.waitForFunction(() => S && S.timer === 15, null, { timeout: 8000 });
    await p1.evaluate(() => { closeModal(); openSettingsModal(); });
    await sleep(320);
    const reopen = await p1.evaluate(() => ({ hidden: document.getElementById('modal-mask').hidden, out: document.getElementById('modal-mask').classList.contains('out') }));
    ok('modal 关后立即重开：不被迟到关闭定时器摁灭（token 作废）', reopen.hidden === false && reopen.out === false, reopen);
    await p1.evaluate(() => { const m = document.getElementById('modal-mask'); if (m && !m.hidden) m.click(); });
    await sleep(60);
    const closing = await p1.evaluate(() => ({ hidden: document.getElementById('modal-mask').hidden, out: document.getElementById('modal-mask').classList.contains('out'), pe: getComputedStyle(document.getElementById('modal-mask')).pointerEvents }));
    ok('.out 出场窗：hidden 仍 false + .out 挂上 + pointer-events:none 不拦点击', closing.hidden === false && closing.out === true && closing.pe === 'none', closing);
    await sleep(260);
    const closed = await p1.evaluate(() => ({ hidden: document.getElementById('modal-mask').hidden, out: document.getElementById('modal-mask').classList.contains('out') }));
    ok('180ms 后 hidden=true 且 .out 摘除（最终语义不变）', closed.hidden === true && closed.out === false, closed);

    // ── D) 揭晓一拍：DOM 路径点卡（CSS 模式下可点）→ timer-wrap .on 展开几何 ──
    const chooserIsMe = await p1.evaluate(() => S.turn.chooserId === myId);
    await (chooserIsMe ? p1 : p2).evaluate(() => choose('truth'));
    await p1.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await p1.waitForFunction(() => typeof revealAnim === 'undefined' || revealAnim === false, null, { timeout: 20000 });
    try {   // 等 .on 落类 + 240ms 上落过渡真正收敛（固定 sleep 会采到中间态——终审 P2-3）
      await p1.waitForFunction(() => {
        const w = document.getElementById('timer-wrap');
        if (!w) return false;
        const tf = getComputedStyle(w).transform;
        return w.classList.contains('on') && (tf === 'none' || tf === 'matrix(1, 0, 0, 1, 0, 0)');
      }, null, { timeout: 2500 });
    } catch (e) { /* 采不到收敛态就让下面的断言带着现场证据失败 */ }
    const on = await p1.evaluate(() => {
      const w = document.getElementById('timer-wrap');
      const cs = getComputedStyle(w);
      return { on: w.classList.contains('on'), vis: cs.visibility, h: Math.round(w.getBoundingClientRect().height), op: cs.opacity, tf: cs.transform, txt: document.getElementById('timer-text').textContent };
    });
    ok('timer-wrap .on 语义保留 + 展开可见（高度>0、倒计时在走）', on.on === true && on.vis === 'visible' && on.h > 10 && /还剩|超时/.test(on.txt), on);
    ok('timer-wrap 展开态 transform 复位（上落完成）', (on.tf === 'none' || on.tf === 'matrix(1, 0, 0, 1, 0, 0)' || /matrix(1, 0, 0, 1, 0, -?0.d+)/.test(on.tf)), on.tf);

    // ── E) bet-box 离场双态（观众端在场 → hidden 翻转 → 180ms 过渡窗，fadeChrome inline 压不死）──
    const spectator = chooserIsMe ? p2 : p1;
    const betExit = await spectator.evaluate(() => new Promise(res => {
      const b = document.getElementById('bet-box');
      if (b.hidden) { res({ skipped: true }); return; }
      b.hidden = true;
      const cs = getComputedStyle(b);
      setTimeout(() => {
        const csEnd = getComputedStyle(b);
        res({ trans: cs.transitionDuration, transProp: cs.transitionProperty, visMid: cs.visibility, dispMid: cs.display, tfMid: cs.transform, visEnd: csEnd.visibility, attrHidden: b.hidden });
      }, 90);
    }));
    if (betExit.skipped) log('（观众端无押注面板：该回合 scoring/身份门禁未开，跳过——不计 FAIL）');
    else ok('bet-box 离场：display:flex 保持 + 过渡窗内可见 + .18s 过渡生效（inline 压不死）',
      betExit.dispMid === 'flex' && betExit.visMid === 'visible' && betExit.trans.includes('0.18'), betExit);
    if (!betExit.skipped) {
      await sleep(700);   // 余量跨过心跳 echo 重渲染可能造成的 false→true 重启窗
      const betEnd = await spectator.evaluate(() => ({ vis: getComputedStyle(document.getElementById('bet-box')).visibility, attrHidden: document.getElementById('bet-box').hidden }));
      ok('bet-box 离场终态：visibility hidden + hidden 属性语义不变', betEnd.vis === 'hidden' && betEnd.attrHidden === true, betEnd);
    }

    // ── F) REDUCED 直切退路 ──
    const ctxR = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctxR.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const pr = await open(ctxR);
    const red = await pr.evaluate(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return {
        betHiddenTrans: cs('bet-box').transitionDuration,
        stakeTrans: cs('stake-row').transitionDuration,
        timerTrans: cs('timer-wrap').transitionDuration,
        timerVis: cs('timer-wrap').visibility, timerH: document.getElementById('timer-wrap').getBoundingClientRect().height,
      };
    });
    ok('REDUCED: 三处 transition 全 0（直切）', red.betHiddenTrans === '0s' && red.stakeTrans === '0s' && red.timerTrans === '0s', red);
    ok('REDUCED: timer-wrap 折叠态保持（visibility hidden + 高度 0）', red.timerVis === 'hidden' && red.timerH === 0, red);
    await ctxR.close();

    log(bad ? `FAILED: ${bad} 项` : 'W6 DOM 语义全部通过 ✅');
  } finally { try { await browser.close(); } catch {}; try { server.close(); } catch {} }
  process.exitCode = bad ? 1 : 0;
})();
