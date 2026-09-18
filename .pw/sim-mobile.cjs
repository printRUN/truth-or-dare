// sim-mobile.cjs — 「小雨」的 iPhone13 竖屏(390×844)触屏首次开黑走查
// 3 个 page 同 context（BroadcastChannel 本地模式）：p1=小雨(玩家视角) p2=阿豪 p3=婷婷
// 用法: node D:/myidea/truth-or-dare/.pw/sim-mobile.cjs   （端口 8801，被占则复用/重试）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8801;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[sim +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_SHOTS = !!process.env.SIM_NO_SHOTS;   // 纯采数模式：不截屏，帧间隔不被截屏停顿污染
const shot = (p, name) => NO_SHOTS ? Promise.resolve() : p.screenshot({ path: path.join(SHOTS, `sim-mobile-${name}.png`) }).then(() => log(`📸 ${name}`));

// ── 静态服务器（端口占用：先探测是否是本脚本的旧实例，是就复用；否则重试几次） ──
let server = null, reused = false;
function probeOurs() {
  return new Promise(res => {
    http.get(`http://127.0.0.1:${PORT}/index.html`, r => {
      let n = 0; r.on('data', c => { n += c.length; if (n > 100000) { r.destroy(); res(true); } });
      r.on('end', () => res(n > 100000)); r.on('error', () => res(false));
    }).on('error', () => res(false));
  });
}
async function startServer() {
  for (let i = 0; i < 10; i++) {
    try { await new Promise((res, rej) => { const s = http.createServer((req, res2) => { const u = req.url.split('?')[0]; const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u)); fs.readFile(f, (e, d) => { if (e) { res2.writeHead(404); res2.end('nf'); } else { res2.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res2.end(d); } }); }); server = s; s.on('error', rej); s.listen(PORT, () => res()); }); return; }
    catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      if (await probeOurs()) { reused = true; log(`端口 ${PORT} 上已有本脚本旧实例在跑，直接复用`); return; }
      await sleep(600);
    }
  }
  throw new Error(`端口 ${PORT} 被别的程序占用`);
}

// ── 错误收集 ──
const jsErrors = [];
function watch(p, tag) {
  p.on('pageerror', e => { jsErrors.push(`[${tag}] pageerror: ${e.message}`); log(`❗[${tag}] pageerror: ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error') { jsErrors.push(`[${tag}] console.error: ${m.text()}`); log(`❗[${tag}] console.error: ${m.text().slice(0, 200)}`); } });
}

// ── p1 上的性能/转场采样器 ──
async function installSamplers(p) {
  await p.evaluate(() => {
    window.__fi = { on: false, ints: [], last: 0 };
    const tick = t => { const f = window.__fi; if (f.on && f.last) f.ints.push(t - f.last); f.last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__fiBegin = () => { window.__fi.on = true; window.__fi.ints.length = 0; };
    window.__fiEnd = () => { window.__fi.on = false; return window.__fi.ints.slice(); };
    // 立方体转场时间轴：谁挂上/摘掉了 entering
    window.__tx = [];
    const w = document.getElementById('world3d');
    new MutationObserver(ms => { const now = performance.now(); for (const m of ms) { const el = m.target; if (!el.classList || !el.classList.contains('screen')) continue; const has = el.classList.contains('entering'); const last = window.__tx[window.__tx.length - 1]; if (has && (!last || last.kind !== 'in-start')) window.__tx.push({ kind: 'in-start', id: el.id, t: now }); if (!has && last && last.kind === 'in-start' && last.id === el.id) window.__tx.push({ kind: 'in-end', id: el.id, t: now }); } }).observe(w, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}
const fiStats = a => { if (!a || !a.length) return null; const s = [...a].sort((x, y) => x - y); const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))]; return { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p95: +q(0.95), max: +s[s.length - 1], slow25: a.filter(d => d > 25).length, slow100: a.filter(d => d > 100).length }; };

// ── 视口适配审计（可达性/遮挡/折叠线） ──
async function audit(p, ids) {
  return p.evaluate(idList => {
    const out = { innerW: innerWidth, innerH: innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, items: [] };
    for (const id of idList) {
      const el = document.getElementById(id); if (!el) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      out.items.push({ id, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), belowFold: r.bottom > innerHeight + 1, clipped: r.right > innerWidth + 1 || r.left < -1, small: r.width < 40 || r.height < 40 });
    }
    return out;
  }, ids);
}

// ── 通用小流程 ──
async function openPage(ctx, tag) {
  const p = await ctx.newPage(); watch(p, tag);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 });
  return p;
}
async function prepJoin(p, { name, room, avatarNth }) {
  // 默认即定制头像（预设已退役，无 #avtab-preset 可点）；avatarNth>0 时点首个可见头像格（=定制预览，等效采用当前定制）
  if (avatarNth > 0) await p.locator('.avatar-option:visible').first().tap();
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.tap('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
}
const chooserPage = async pages => {
  for (const p of pages) if (await p.evaluate(() => S.turn.chooserId === myId)) return p;
  return null;
};
const waitReady = (p, t) => p.waitForFunction(() => {
  const el = document.getElementById('punishment-text');
  return el && el.textContent.length > 4 && typeof S !== 'undefined' && S.turn.punishment && el.textContent === S.turn.punishment && S.turn.stage === 'revealed';
}, null, { timeout: 30000 });

// ════════════════════════ 主流程 ════════════════════════
(async () => {
  const digest = { timings: {}, transitions: [], frames: {}, audits: {}, notes: [] };
  await startServer();
  log(`server ${reused ? '(复用旧实例)' : 'started'} on :${PORT}`);

  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const t0 = Date.now();

  // ── 1. 首次进入：加载动画 ──
  const p1 = await ctx.newPage(); watch(p1, '小雨');
  await p1.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(350); await shot(p1, '01-loading-a');
  await sleep(650); await shot(p1, '01-loading-b');
  await p1.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 });
  digest.timings.bootToJoin = Date.now() - t0; log(`加载层揭开，耗时 ${digest.timings.bootToJoin}ms`);
  await sleep(600); await shot(p1, '02-join');
  digest.audits.join = await audit(p1, ['input-name', 'avtab-custom', 'cz-preview-tile', 'input-room', 'btn-join', 'btn-howto-join']);

  // ── 2. 填名字选头像 ──
  await prepJoin(p1, { name: '小雨', room: '', avatarNth: 0 });
  await sleep(300); await shot(p1, '03-avatar');
  await installSamplers(p1);

  // ── 3. 加入游戏（一镜到底：join→lobby）──
  await p1.evaluate(() => window.__fiBegin());
  const tJoin = Date.now();
  await p1.tap('#btn-join');
  await sleep(450); await shot(p1, '04-joinloading');
  await p1.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  digest.timings.joinTapToLobby = Date.now() - tJoin; log(`点加入→大厅 .active 计 ${digest.timings.joinTapToLobby}ms（含一次截屏 ~0.5s）`);
  // 新手引导自动弹
  const guideShown = await p1.waitForSelector('#guide-mask:not([hidden])', { timeout: 6000 }).then(() => true).catch(() => false);
  if (guideShown) { await sleep(350); await shot(p1, '05-guide'); await p1.tap('#guide-close'); log('新手引导弹层出现并关闭'); } else digest.notes.push('首进大厅未弹新手引导');
  await sleep(1100); await shot(p1, '06-lobby');
  digest.frames.join = fiStats(await p1.evaluate(() => window.__fiEnd()));
  digest.audits.lobby1 = await audit(p1, ['btn-start', 'lobby-tools', 'share-room', 'players-grid', 'react-fab']);
  const room = await p1.evaluate(() => S.room); log('房间号', room);

  // ── 4. 朋友加入 ──
  const p2 = await openPage(ctx, '阿豪');
  await prepJoin(p2, { name: '阿豪', room, avatarNth: 1 });
  await p2.tap('#btn-join');
  const p3 = await openPage(ctx, '婷婷');
  await prepJoin(p3, { name: '婷婷', room, avatarNth: 2 });
  await p3.tap('#btn-join');
  await p1.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length >= 3, null, { timeout: 25000 });
  log('三人到齐'); await sleep(700); await shot(p1, '07-lobby-3p');
  digest.audits.lobby3 = await audit(p1, ['btn-start', 'lobby-tools', 'players-grid']);
  await sleep(1200); // 小雨环顾大厅

  // ── 5. 开始游戏（立方体转身 lobby→game）──
  await p1.evaluate(() => window.__fiBegin());
  await p1.tap('#btn-start');
  await p1.waitForSelector('.screen.entering', { timeout: 8000 }).catch(() => digest.notes.push('开始游戏未见 .entering（转场未捕到）'));
  await shot(p1, '08-cube-mid1');
  await sleep(260); await shot(p1, '08-cube-mid2');
  await p1.waitForSelector('#screen-game.active', { timeout: 10000 });
  await p1.waitForSelector('.screen.entering', { state: 'detached', timeout: 5000 }).catch(() => {});
  await sleep(800); await shot(p1, '09-gametable');
  digest.frames.startGame = fiStats(await p1.evaluate(() => window.__fiEnd()));
  digest.audits.gameChoosing = await audit(p1, ['card-truth', 'card-dare', 'game-tools', 'turn-info', 'game-players-grid', 'react-fab', 'stats-row']);

  // 表情雨浮窗（竖屏遮挡检查）
  await p1.tap('#react-fab');
  await sleep(350); await shot(p1, '22-react');
  await p1.locator('#react-pop button[data-react]').nth(3).tap();
  await sleep(300);
  await p1.tap('#choice-hint').catch(() => {}); // 点别处收起
  await sleep(400);

  // ── 6. 三轮对局 ──
  const pages = [p1, p2, p3];
  const names = new Map([[p1, '小雨'], [p2, '阿豪'], [p3, '婷婷']]);
  let betDone = false, passDone = false, skipDone = false, nonMeRounds = 0;
  for (let round = 1; round <= 3; round++) {
    let cp = await chooserPage(pages);
    if (!cp) { log('回合' + round + ' 找不到持麦人'); break; }
    const isMe = cp === p1;
    if (!isMe) nonMeRounds++;
    const pick = round === 1 ? '#card-truth' : '#card-dare';
    await cp.waitForSelector(`${pick}:not(.disabled)`, { timeout: 15000 });
    log(`回合${round}: 轮到「${names.get(cp)}」，选 ${pick === '#card-truth' ? '真心话' : '大冒险'}`);
    if (!isMe && nonMeRounds === 1) { // 第一次旁观：拍等待态
      await shot(p1, `16-waiting`);
      log(`等待态: ${await p1.evaluate(() => document.getElementById('turn-info').textContent)}`);
    }
    await p1.evaluate(() => window.__fiBegin());
    // three3d 下 DOM 选卡 pointer-events:none（点击走 GL raycast），必须 evaluate 级 click；CSS 路径照常 tap
    if (await cp.evaluate(() => document.body.classList.contains('three3d'))) await cp.evaluate(sel => document.querySelector(sel).click(), pick);
    else await cp.tap(pick);
    // 抽卡动画中段连拍
    await p1.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });
    await sleep(650); await shot(p1, '10-draw-mid');
    await sleep(1150); await shot(p1, '10b-draw-late');
    // three3d 下 #card-section 被 CSS display:none!important（hidden 属性照常摘除）→ 按 E2E 契约用 waitForFunction
    await p1.waitForFunction(() => !document.getElementById('card-section').hidden, null, { timeout: 20000 });
    await p1.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 15000 });
    await sleep(280); await shot(p1, '11-flip-mid');
    await waitReady(p1);
    await shot(p1, '12-typing');
    await sleep(1500); await shot(p1, '13-confetti');
    if (round === 1) { digest.frames.drawR1 = fiStats(await p1.evaluate(() => window.__fiEnd())); }
    if (round === 1) { await sleep(900); await shot(p1, '14-revealed'); }
    digest.audits[`revealedR${round}`] = await audit(p1, ['btn-accept', 'btn-skip', 'btn-pass', 'punishment-text', 'card-front', 'game-tools', 'bet-box']);

    // 旁观押注（第一次非小雨回合）
    if (!isMe && !betDone) {
      betDone = true;
      const bet = await p1.waitForSelector('#bet-box:not([hidden])', { timeout: 6000 }).catch(() => null);
      if (bet) { await p1.tap('#bet-accept'); await sleep(400); await shot(p1, '17-bet'); log('小雨押了「✅ 会完成」'); }
      else digest.notes.push('旁观时未见押注面板');
    }
    // 小雨的回合：打一张免答牌
    if (isMe && !passDone) {
      passDone = true;
      const before = await p1.evaluate(() => S.turn.punishment);
      const passBtn = await p1.waitForSelector('#btn-pass:not([hidden])', { timeout: 5000 }).catch(() => null);
      if (passBtn) {
        await p1.tap('#btn-pass');
        await p1.waitForFunction(b => document.getElementById('punishment-text').textContent && document.getElementById('punishment-text').textContent !== b, before, { timeout: 20000 }).catch(() => digest.notes.push('免答牌后题目未变化?'));
        await sleep(1400); await shot(p1, '19-pass'); log('小雨打了免答牌，悄悄换了题');
      } else digest.notes.push('小雨回合未见免答牌按钮');
    }
    // 收尾：最后一个非小雨回合用「跳过」，其余「完成啦」
    const useSkip = !isMe && nonMeRounds >= 2 && round === 3;
    await sleep(800);
    if (useSkip) { await cp.tap('#btn-skip'); skipDone = true; log(`「${names.get(cp)}」点了跳过`); }
    else { await cp.tap('#btn-accept'); }
    await p1.waitForSelector('#choice-section:not([hidden])', { timeout: 15000 });
    if (round === 1) { await sleep(900); await shot(p1, '15-turnpass'); }
    if (useSkip) { await sleep(700); await shot(p1, '18-skip-feedback'); }
    await sleep(600);
  }

  // ── 7. 提前结算（立方体转身 game→result）──
  await p1.evaluate(() => window.__fiBegin());
  // 窄屏 3D：工具收进 🧰 浮标，先点开面板再结算（非 3D 回退层没有浮标，直接点按钮）
  const fabDiag = await p1.evaluate(() => {
    const f = document.getElementById('tools-fab');
    return { three3d: document.body.classList.contains('three3d'), loperf: document.body.classList.contains('loperf'),
      hasFab: !!f, fabW: f ? f.getBoundingClientRect().width : -1,
      panel: getComputedStyle(document.getElementById('game-tools')).display };
  });
  console.log('[sim] FAB 诊断:', JSON.stringify(fabDiag));
  if (fabDiag.hasFab && fabDiag.fabW > 0) {
    await p1.tap('#tools-fab');
    await p1.waitForTimeout(250);
    console.log('[sim] FAB tap 后面板:', await p1.evaluate(() => getComputedStyle(document.getElementById('game-tools')).display));
  }
  await p1.tap('#btn-finish-game');
  await p1.tap('#btn-finish-game'); // armedTap 二次确认
  await p1.waitForSelector('.screen.entering', { timeout: 8000 }).catch(() => digest.notes.push('结算未见 .entering'));
  await shot(p1, '20-cube-result');
  await p1.waitForSelector('#screen-result.active', { timeout: 10000 });
  await p1.waitForSelector('.screen.entering', { state: 'detached', timeout: 5000 }).catch(() => {});
  await sleep(900); await shot(p1, '21-result');
  digest.frames.toResult = fiStats(await p1.evaluate(() => window.__fiEnd()));
  digest.audits.result = await audit(p1, ['result-podium', 'result-list', 'btn-rematch', 'btn-result-lobby']);
  digest.transitions = await p1.evaluate(() => window.__tx.map(e => ({ ...e, t: Math.round(e.t) })));

  // ── 汇总 ──
  digest.timings.totalMs = Date.now() - t0;
  digest.jsErrors = jsErrors;
  console.log('\n===== AUDITS-COMPACT =====');
  for (const [k, a] of Object.entries(digest.audits)) {
    console.log(`${k}: doc ${a.docW}x${a.docH} vs view ${a.innerW}x${a.innerH}${a.docH > a.innerH ? ' (需滚动)' : ''}`);
    for (const it of a.items) console.log(`  ${it.id.padEnd(20)} top${String(it.top).padStart(4)}~bot${String(it.bottom).padStart(4)} ${it.w}x${it.h}${it.belowFold ? ' ⚠折叠线以下' : ''}${it.clipped ? ' ⚠横向出界' : ''}${it.small ? ' ⚠<40px' : ''}`);
  }
  console.log('===== DIGEST =====');
  console.log(JSON.stringify(digest, null, 1));
  if (jsErrors.length) log(`⚠ 共 ${jsErrors.length} 条 JS 错误（见 digest）`); else log('全程零 JS 报错');
  await browser.close();
  if (server && !reused) server.close();
  process.exit(jsErrors.length ? 0 : 0); // 错误已记录，不因此失败
})().catch(e => { console.error('[sim] FATAL', e); console.error('JS_ERRORS_SO_FAR:', JSON.stringify(jsErrors, null, 1)); process.exitCode = 1; });
