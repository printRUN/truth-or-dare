// sim-desktop.cjs — 「阿凯」的桌面主持人走查（1440×900 为主 + 1280×800 复核）
// 身份：28 岁聚会组织者、今晚的主持人；4 个 page 同 context（本地 BroadcastChannel 模式）
//   P1=阿凯(主持人, 全程评审视角)  P2=小雨  P3=阿豪  P4=婷婷（陪玩）
// 用法: node D:/myidea/truth-or-dare/.pw/sim-desktop.cjs   （端口 8802，被占则复用/重试）
// 产出: .pw/shots/sim-desktop-*.png（流程截图）+ .pw/shots/sim-cube-*.jpg|png（换屏转场帧取证）
// 红线：只新建本脚本/报告/截图，不改 index.html 与既有测试。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8802;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const T0 = Date.now();
const log = (...a) => console.log(`[sim +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jsErrors = [];
const collect = [];   // 报告用的结构化数据

function watch(p, tag) {
  p.on('pageerror', e => { jsErrors.push(`[${tag}] pageerror: ${e.message}`); log(`❗[${tag}] pageerror: ${e.message}`); });
  p.on('console', m => { if (m.type() === 'error') { jsErrors.push(`[${tag}] console.error: ${m.text()}`); log(`❗[${tag}] console.error: ${m.text().slice(0, 160)}`); } });
}
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, `sim-desktop-${name}.png`) }).then(() => log(`📸 ${name}`)).catch(e => log(`⚠ 截图失败 ${name}: ${e.message}`));

// ── 静态服务器（端口占用：先探测是否本脚本旧实例，是就复用） ──
let server = null;
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
      if (await probeOurs()) { log(`端口 ${PORT} 上已有旧实例，复用`); return; }
      await sleep(600);
    }
  }
  throw new Error(`端口 ${PORT} 被别的程序占用`);
}

async function open(ctx, tag, wantLoadingShot) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  if (wantLoadingShot) {
    await p.waitForSelector('#loading-overlay', { state: 'visible', timeout: 3000 }).catch(() => {});
    await sleep(400);
    await p.screenshot({ path: path.join(SHOTS, 'sim-desktop-loading.png') }).then(() => log('📸 loading')).catch(() => {});
  }
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}

async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

// ── 立方体转场采样器（P1 常驻）：rAF 逐帧记录两面 rotateY / 投影框 / 透明度 / 镜头 transform ──
async function installSampler(p) {
  await p.evaluate(() => {
    window.__cs = []; window.__csOn = false; window.__wall0 = 0;
    const thetaOf = el => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return null;
      const m = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')')).split(',').map(Number);
      if (m.length < 16 || m.some(isNaN)) return null;
      return Math.atan2(m[8], m[0]) * 180 / Math.PI;   // perspective()/translate3d 不改 3x3，此解精确
    };
    const rectOf = el => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), o: +(+getComputedStyle(el).opacity).toFixed(3) }; };
    const tick = () => {
      if (window.__csOn) {
        const en = document.querySelector('.screen.entering');
        const lv = document.querySelector('.screen.leaving');
        if (en && !window.__wall0) window.__wall0 = { perf: performance.now(), wall: Date.now() };
        window.__cs.push({
          t: performance.now(),
          inId: en ? en.id : null, inTh: en ? thetaOf(en) : null, inR: en ? rectOf(en) : null, inW: en ? en.offsetWidth : 0,
          outId: lv ? lv.id : null, outTh: lv ? thetaOf(lv) : null, outR: lv ? rectOf(lv) : null, outW: lv ? lv.offsetWidth : 0,
          world: document.getElementById('world3d').style.transform || getComputedStyle(document.getElementById('world3d')).transform,
          txr: document.getElementById('world3d').style.getPropertyValue('--tx-r'),
          back: document.getElementById('world3d').classList.contains('tx-back'),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// 中段冻帧改为「页面内自动哨兵」：转场前就装好 rAF 哨兵，|θ_in| 一进 38°~55° 就在同一帧里 pause 全部动画。
// Node 侧只需等 __frozen 标志（动画已冻结，截图延迟不再偷跑角度）。冻住前先把 .entering/.leaving 的
// 1s/0.9s 清理定时器改挂到 6s（class 被 setTimeout 摘掉会让冻帧中途散架），解冻后等动画真正跑完再手工收尾。
async function armFreezeSentinel(page) {
  await page.evaluate(() => {
    window.__frozen = null; window.__resume = null;
    const tick = () => {
      if (window.__frozen) return;
      const s = window.__cs[window.__cs.length - 1];
      // 38°~55° 在 ~208°/s 峰值角速度下只有 ~80ms 宽，26~36fps 的采样会整窗跳过 → 放宽到 32°~62°
      if (s && s.inTh !== null && Math.abs(s.inTh) > 32 && Math.abs(s.inTh) < 62) {
        const en = document.querySelector('.screen.entering'), lv = document.querySelector('.screen.leaving');
        if (en) { clearTimeout(en._txT); en._txT = setTimeout(() => en.classList.remove('entering'), 6000); }
        if (lv) { clearTimeout(lv._txL); lv._txL = setTimeout(() => { lv.classList.remove('leaving'); lv.style.width = ''; }, 6000); }
        document.getAnimations().forEach(a => { try { a.pause(); } catch {} });
        window.__frozen = { inTh: +s.inTh.toFixed(1), outTh: s.outTh === null ? null : +s.outTh.toFixed(1), wall: Date.now() };
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function unfreezeAndWait(page) {
  const wasFrozen = await page.evaluate(() => {
    if (!window.__frozen) return false;
    let anim = null;
    const a = document.getAnimations().find(x => x.animationName === 'scene-in');
    if (a && a.currentTime != null) anim = +a.currentTime;
    document.getAnimations().forEach(x => { try { x.play(); } catch {} });
    window.__resume = { wall: Date.now(), anim };
    return true;
  });
  if (!wasFrozen) return false;
  // 等两面动画真正播完，再替 app 收尾（摘 class、还宽度），不让 6s 兜底定时器拖着现场
  await page.evaluate(() => new Promise(res => {
    const t0 = performance.now();
    const check = () => {
      const a = document.getAnimations().find(x => x.animationName === 'scene-in' || x.animationName === 'scene-out');
      if (!a || performance.now() - t0 > 6000) {
        document.querySelectorAll('.screen.entering').forEach(e => { e.classList.remove('entering'); clearTimeout(e._txT); });
        document.querySelectorAll('.screen.leaving').forEach(e => { e.classList.remove('leaving'); e.style.width = ''; clearTimeout(e._txL); });
        res();
      } else requestAnimationFrame(check);
    };
    check();
  })).catch(() => {});
  return true;
}

// 一次换屏取证：screencast 连拍（真实时间轴帧）+ 冻帧 PNG + rAF 数值采样 + 刚体判据分析
const num1 = (s, re) => { const m = (s || '').match(re); return m ? +(+m[1]).toFixed(1) : null; };
async function cubeCapture(page, tag, trigger) {
  log(`―― 换屏取证 [${tag}] ――`);
  await page.bringToFront();
  await page.evaluate(() => { window.__csOn = true; window.__cs.length = 0; window.__wall0 = 0; window.__frozen = null; window.__resume = null; });
  await armFreezeSentinel(page);
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ev => {
    frames.push({ ts: ev.metadata && ev.metadata.timestamp ? ev.metadata.timestamp * 1000 : 0, data: ev.data, sessionId: ev.sessionId });
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  const wt0 = Date.now();
  await trigger();
  await page.waitForFunction(() => window.__wall0 && window.__wall0.wall > 0, null, { timeout: 12000 }).catch(() => {});
  const frozen = await page.waitForFunction(() => window.__frozen, null, { timeout: 9000 }).then(() => page.evaluate(() => window.__frozen)).catch(() => null);
  if (frozen) {
    log(`[${tag}] 冻帧 @ 入屏 ${frozen.inTh}° / 出屏 ${frozen.outTh}°`);
    await page.screenshot({ path: path.join(SHOTS, `sim-cube-${tag}-mid.png`) });
    log(`📸 sim-cube-${tag}-mid.png`);
  } else {
    log(`⚠ [${tag}] 没抓到 38°~55° 冻帧窗口`);
  }
  await unfreezeAndWait(page);
  await page.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(200);
  await cdp.send('Page.stopScreencast').catch(() => {});
  cdp.detach().catch(() => {});
  const samples = await page.evaluate(() => { window.__csOn = false; return window.__cs.slice(); });
  const wall0 = await page.evaluate(() => window.__wall0 ? window.__wall0.wall : 0);
  const resume = await page.evaluate(() => window.__resume);
  await page.screenshot({ path: path.join(SHOTS, `sim-cube-${tag}-end.png`) });
  log(`📸 sim-cube-${tag}-end.png（起转延迟 ${(wall0 - wt0) / 1000 | 0}s，screencast ${frames.length} 帧 / rAF ${samples.length} 帧）`);

  // ── 刚体判据分析（probe-cube 判据的走查版） ──
  const act = samples.filter(s => s.inTh !== null && s.outTh !== null);
  const R = act.length ? (parseFloat(act[0].txr) || 0) : 0;
  const res = { tag, frames: frames.length, samples: samples.length, R, act: act.length, table: [], checks: {} };
  if (act.length) {
    const diffs = act.map(s => s.inTh - s.outTh);
    const sign = act[act.length - 1].back ? -1 : 1;
    const target = 90 * sign;
    const maxDev = Math.max(...diffs.map(d => Math.abs(d - target)));
    const maxAng = Math.max(...act.map(s => Math.max(Math.abs(s.inTh), Math.abs(s.outTh))));
    const mid = act.filter(s => s.inR && s.outR && s.inR.o > 0.05 && s.outR.o > 0.05).length;
    const txrs = [...new Set(act.map(s => s.txr))];
    const sep = act.map(s => Math.max(s.inR.l, s.outR.l) - Math.min(s.inR.r, s.outR.r));
    const maxSep = Math.max(...sep);
    const wOk = act.every(s => s.inW === s.outW) && Math.abs(act[0].inW - 2 * R) <= 1;
    res.checks = {
      dir: sign > 0 ? '前进' : '回退', target,
      diffMin: +Math.min(...diffs).toFixed(2), diffMax: +Math.max(...diffs).toFixed(2), maxDev: +maxDev.toFixed(2),
      maxAng: +maxAng.toFixed(1), midFrames: mid, txrs, maxSep: +maxSep.toFixed(1),
      inW: act[0].inW, outW: act[0].outW, wOk,
      rigid: maxDev < 12, angleOk: maxAng > 50 && Math.abs(maxAng - 90) < 14, sepOk: maxSep < 8, txrOk: txrs.length === 1 && !!txrs[0],
    };
    // 每 ~100ms 取一帧列表（数值表）
    const t0 = act[0].t;
    for (let b = 0; b <= 850; b += 100) {
      let best = null, bd = 1e9;
      for (const s of act) { const d = Math.abs((s.t - t0) - b); if (d < bd) { bd = d; best = s; } }
      if (best && bd <= 60) res.table.push({
        t: +(best.t - t0).toFixed(0), inTh: +best.inTh.toFixed(1), outTh: +best.outTh.toFixed(1),
        d: +(best.inTh - best.outTh).toFixed(1), inO: best.inR.o, outO: best.outR.o,
        wz: num1(best.world, /translate3d\([^,]+,\s*[^,]+,\s*(-?[\d.]+)px\)/),
        wrx: num1(best.world, /rotateX\((-?[\d.]+)deg\)/),
      });
    }
  } else {
    res.checks.rigid = false;
    const anyIn = samples.some(s => s.inTh !== null);
    res.checks.note = anyIn ? '两面从未同时带姿态' : '全程未见 3D 姿态（转场没跑/被跳过）';
  }
  collect.push({ kind: 'cube', ...res });
  log(`[${tag}] θ差 ${res.checks.diffMin ?? '?'}~${res.checks.diffMax ?? '?'}° (目标 ${res.checks.target}°, 最大偏差 ${res.checks.maxDev ?? '?'}°) / 单面最大角 ${res.checks.maxAng ?? '?'}° / 同框 ${res.checks.midFrames ?? 0} 帧 / 分离 ${res.checks.maxSep ?? '?'}px / 同宽 ${res.checks.wOk}`);

  // ── screencast 帧 → sim-cube-<tag>-t{0,150,300,450,600,750}.jpg ──
  if (frames.length && wall0) {
    const animTof = f => {
      if (!f.ts) return NaN;
      if (resume && resume.wall && f.ts >= resume.wall && resume.anim != null) return f.ts - resume.wall + resume.anim;   // 冻结后：动画时钟 ≠ 壁钟
      return f.ts - wall0;
    };
    const freezeWall = frozen ? frozen.wall : 0;
    const real = frames.filter(f => f.ts && !(freezeWall && f.ts >= freezeWall && resume && f.ts < resume.wall));
    const targets = [0, 150, 300, 450, 600, 750];
    const picked = [];
    for (const tg of targets) {
      let best = null, bd = 1e9;
      for (const f of real) { const d = Math.abs(animTof(f) - tg); if (d < bd) { bd = d; best = f; } }
      if (best && bd <= 120) {
        if (picked.some(x => Math.abs(animTof(x) - animTof(best)) < 30)) continue;   // 冻结帧去重
        picked.push(best);
        fs.writeFileSync(path.join(SHOTS, `sim-cube-${tag}-t${tg}.jpg`), Buffer.from(best.data, 'base64'));
        log(`📸 sim-cube-${tag}-t${tg}.jpg（实际动画时刻 ≈${Math.round(animTof(best))}ms, 偏差 ${Math.round(bd)}ms）`);
      }
    }
  } else if (frames.length) {
    frames.slice(0, 6).forEach((f, i) => fs.writeFileSync(path.join(SHOTS, `sim-cube-${tag}-seq${i}.jpg`), Buffer.from(f.data, 'base64')));
    log(`⚠ [${tag}] 无 wall0，按到达顺序存前 6 帧 seq0-5`);
  }
  return res;
}

// 版式审计：可达性/折线/两栏
async function audit(p, stage, ids, tagNote) {
  const out = await p.evaluate(idList => {
    const o = { innerW: innerWidth, innerH: innerHeight, docW: document.documentElement.scrollWidth, items: [] };
    for (const id of idList) {
      const el = document.getElementById(id); if (!el) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) continue;
      const r = el.getBoundingClientRect();
      o.items.push({ id, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), belowFold: r.bottom > innerHeight + 1 });
    }
    const w = document.getElementById('world3d');
    o.world = (w.style.transform || '').slice(0, 130);
    const lob = document.getElementById('screen-lobby');
    if (lob && getComputedStyle(lob).display !== 'none') { o.lobbyW = lob.offsetWidth; o.lobbyCols = getComputedStyle(lob).gridTemplateColumns || null; }
    const app = document.getElementById('app');
    o.appPerspective = getComputedStyle(app).perspective;
    const tb = document.querySelector('.table3d');
    o.table3d = tb ? (getComputedStyle(tb).transform || '').slice(0, 90) : null;
    return o;
  }, ids);
  collect.push({ kind: 'audit', stage, note: tagNote || '', ...out });
  log(`📐 [${stage}${tagNote ? '@' + tagNote : ''}] ${out.innerW}×${out.innerH} docW=${out.docW} 首屏外: [${out.items.filter(i => i.belowFold).map(i => i.id).join(', ') || '无'}]`);
  return out;
}

(async () => {
  await startServer();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:sfx', 'off'); localStorage.setItem('tod:bgm', 'off'); } catch {} });

  try {
    // ── 0) 开机：加载层 + 加入页 ──
    const P = {};   // pages
    const p1 = P['P1'] = await open(ctx, 'P1', true);
    await audit(p1, 'join', ['btn-join', 'input-name', 'input-room', 'grp-avatar'], '1440x900');
    await shot(p1, 'join');
    const appSt = await p1.evaluate(() => ({
      perspective: getComputedStyle(document.getElementById('app')).perspective,
      worldFlat: getComputedStyle(document.getElementById('world3d')).transformStyle,
      table3d: !!document.querySelector('.table3d'),
      world: document.getElementById('world3d').style.transform,
    }));
    collect.push({ kind: 'stage0', ...appSt });
    log('舞台基线:', JSON.stringify(appSt));

    // 视差：鼠标左缘 vs 右缘
    await p1.mouse.move(720, 450); await sleep(250);
    const par0 = await p1.evaluate(() => document.getElementById('world3d').style.transform);
    await p1.mouse.move(60, 450); await sleep(350);
    const parL = await p1.evaluate(() => document.getElementById('world3d').style.transform);
    await p1.mouse.move(1400, 450); await sleep(350);
    const parR = await p1.evaluate(() => document.getElementById('world3d').style.transform);
    collect.push({ kind: 'parallax', center: par0, left: parL, right: parR });
    log('视差: 中→左', par0 !== parL ? '有变化' : '无变化', '；中→右', par0 !== parR ? '有变化' : '无变化');

    // ── 1) 阿凯建房（join→lobby 换屏取证：加载层揭幕那一刻起转） ──
    await installSampler(p1);
    await cubeCapture(p1, 'join-lobby', async () => {
      if (!(await p1.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p1.click('details.adv summary');
      await p1.click('#chk-local');
      await p1.fill('#input-name', '阿凯');
      await p1.click('.avatar-option >> nth=0');
      await p1.click('#btn-join');
    });
    await p1.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await sleep(900);
    const room = (await p1.textContent('#share-room')).trim();
    log('房间号:', room);
    await audit(p1, 'lobby', ['screen-lobby', 'players-grid', 'btn-start', 'btn-settings-lobby', 'share-room', 'btn-leave'], '1440x900');
    await shot(p1, 'lobby');

    // ── 2) 三位朋友加入 ──
    for (const [tag, name] of [['P2', '小雨'], ['P3', '阿豪'], ['P4', '婷婷']]) {
      const p = P[tag] = await open(ctx, tag);
      await join(p, name, room);
      log(`${name} 已入座`);
    }
    await p1.waitForFunction(() => S && S.players.length === 4, null, { timeout: 25000 });
    await sleep(700);
    await shot(p1, 'lobby-4p');
    // 主持人头像徽章取证
    const hostBadge = await p1.evaluate(() => {
      const me = document.querySelector('#players-grid .player-card .me-tag');
      const card = me && me.closest('.player-card');
      return { me: !!me, crown: card ? !!card.querySelector('.host-tag, .crown, [class*=host]') : false, text: card ? card.textContent.slice(0, 60) : null };
    });
    collect.push({ kind: 'hostBadge', ...hostBadge });

    // ── 3) ⚙️ 设置弹层（玩法/尺度/计分/轮数/限时） ──
    await p1.bringToFront();
    await p1.click('#btn-settings-lobby');
    await p1.waitForSelector('#modal-mask:not([hidden])', { timeout: 5000 });
    await sleep(350);
    await shot(p1, 'settings');
    await p1.selectOption('#st-rounds', '6');
    await sleep(400);
    await p1.click('#modal-body [data-tm="30"]');
    await sleep(400);
    await shot(p1, 'settings-after');
    await p1.click('#modal-close');
    await sleep(250);

    // ── 4) 开局（lobby→game 换屏取证） ──
    await cubeCapture(p1, 'lobby-game', () => p1.click('#btn-start'));
    await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
    await p1.waitForFunction(() => S && S.gameStarted && S.turn.stage === 'choosing', null, { timeout: 15000 });
    await sleep(1400);   // 等 Cam.enter 推进+缓收落定
    await audit(p1, 'game', ['game-players-grid', 'choice-section', 'card-truth', 'card-dare', 'deck-section', 'btn-pick-next', 'btn-finish-game'], '1440x900');
    await shot(p1, 'game');

    // ── 5) 🎲 命运转盘（随机点名） ──
    const prevChooser = await p1.evaluate(() => S.turn.chooserId);
    await p1.click('#btn-pick-next');
    await sleep(350); await shot(p1, 'spin-1');
    await sleep(850); await shot(p1, 'spin-2');
    await sleep(1100); await shot(p1, 'spin-3');
    await p1.waitForFunction(id => S && S.turn.chooserId && S.turn.chooserId !== id && S.turn.stage === 'choosing', prevChooser, { timeout: 15000 });
    log('命运转盘停定，新持麦人已点名');

    // pid→page 映射
    const pidOf = {};
    for (const [tag, p] of Object.entries(P)) pidOf[await p.evaluate(() => myId)] = tag;
    const pageOf = pid => P[pidOf[pid]];
    let chooser = await p1.evaluate(() => S.turn.chooserId);
    log('第一轮持麦人:', pidOf[chooser]);

    // ── 6) 抽卡 6 秒链（主持人视角 P1 连拍；锚定动画起点，避免截图耗时漂移） ──
    const anchoredShots = async (page, list) => {
      const t0 = Date.now();
      for (const [ms, name] of list) {
        const wait = t0 + ms - Date.now();
        if (wait > 0) await sleep(wait);
        await shot(page, name);
      }
    };
    const drawer = pageOf(chooser);
    await drawer.click('#card-truth');
    await p1.waitForFunction(() => S && S.turn.stage === 'drawing', null, { timeout: 12000 });
    await anchoredShots(p1, [[400, 'draw-1-fly'], [1200, 'draw-2-shuffle'], [1900, 'draw-3-cardfly'], [2600, 'draw-4-breath'], [3150, 'draw-5-flip'], [3900, 'draw-6-type'], [5000, 'draw-7-confetti'], [6500, 'draw-8-settled']]);
    await p1.waitForFunction(() => S && S.turn.stage === 'revealed', null, { timeout: 15000 });
    await sleep(300);
    await audit(p1, 'revealed', ['card-section', 'punishment-text', 'btn-accept', 'btn-skip', 'btn-reroll', 'timer-wrap'], '1440x900');
    await shot(p1, 'revealed');

    // ── 7) 主持人 🎲 换一题 ──
    const pun1 = await p1.evaluate(() => S.turn.punishment);
    if (await p1.locator('#btn-reroll').isVisible()) {
      await p1.click('#btn-reroll');
      await p1.waitForFunction(p => S.turn.punishment && S.turn.punishment !== p, pun1, { timeout: 10000 });
      await sleep(1300);
      await shot(p1, 'reroll');
      log('换题 OK:', pun1.slice(0, 10), '→', (await p1.evaluate(() => S.turn.punishment)).slice(0, 10));
    }

    // ── 8) 完成 → 回合交接 ──
    await drawer.click('#btn-accept');
    await p1.waitForFunction(() => S && S.turn.stage === 'choosing', null, { timeout: 15000 });
    await sleep(900);
    await shot(p1, 'turn-pass');
    const score1 = await p1.evaluate(() => S.players.find(p => p.id === S.turn.chooserId) ? S.players.map(x => ({ n: x.name, s: x.score })) : null);
    collect.push({ kind: 'score1', scores: score1 });

    // ── 9) 第二轮：抽大冒险 → 跳过（−5 负分角标） ──
    chooser = await p1.evaluate(() => S.turn.chooserId);
    log('第二轮持麦人:', pidOf[chooser]);
    const drawer2 = pageOf(chooser);
    await drawer2.click('#card-dare');
    await p1.waitForFunction(() => S && S.turn.stage === 'drawing', null, { timeout: 12000 });
    await anchoredShots(p1, [[1600, 'draw2-1'], [3300, 'draw2-2-flip'], [5300, 'draw2-3-settled']]);
    await p1.waitForFunction(() => S && S.turn.stage === 'revealed', null, { timeout: 15000 });
    await sleep(600);
    await drawer2.click('#btn-skip');
    await p1.waitForFunction(() => S && S.turn.stage === 'choosing', null, { timeout: 15000 });
    await sleep(800);
    await shot(p1, 'skip-neg');
    collect.push({ kind: 'score2', scores: await p1.evaluate(() => S.players.map(x => ({ n: x.name, s: x.score, sk: x.skips }))) });

    // ── 10) 表情雨（微动效采样） ──
    await p1.bringToFront();
    await p1.click('#react-fab');
    await sleep(300);
    await shot(p1, 'react-open');
    await p1.click('#react-bar button[data-react="🔥"]');
    await sleep(400);
    await shot(p1, 'react-rain');
    await p1.keyboard.press('Escape');
    await sleep(200);

    // ── 11) 🏁 结算（game→result 换屏取证） ──
    await cubeCapture(p1, 'game-result', async () => { await p1.click('#btn-finish-game'); await sleep(300); await p1.click('#btn-finish-game'); });
    await p1.waitForSelector('#screen-result.active', { timeout: 20000 });
    await sleep(1300);   // 彩带一段
    await shot(p1, 'result');
    await audit(p1, 'result', ['result-podium', 'result-awards', 'btn-rematch', 'btn-result-lobby'], '1440x900');
    await p1.mouse.wheel(0, 500); await sleep(450);
    await shot(p1, 'result-stats');
    await p1.mouse.wheel(0, -600); await sleep(300);

    // ── 12) 🔄 再来一局（result→game 回退换屏取证） ──
    await cubeCapture(p1, 'result-game-rematch', () => p1.click('#btn-rematch'));
    await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
    await sleep(1200);
    await shot(p1, 'rematch-game');

    // ── 13) 🔙 回到大厅（game→lobby 回退换屏取证） ──
    await cubeCapture(p1, 'game-lobby-back', async () => { await p1.click('#btn-end-game'); await sleep(300); await p1.click('#btn-end-game'); });
    await p1.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await sleep(1000);
    await shot(p1, 'final-lobby');

    await p1.close(); 
  } catch (e) {
    log('主流程异常:', e.message);
    jsErrors.push(`[flow] ${e.message}`);
    try { const pg = (await browser.contexts()[0].pages())[0]; await pg.screenshot({ path: path.join(SHOTS, 'sim-desktop-FAIL.png') }); } catch {}
  }

  // ── 14) 1280×800 复核（第二组 context，双人小局） ──
  try {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:sfx', 'off'); localStorage.setItem('tod:bgm', 'off'); } catch {} });
    const a = await open(ctx2, 'H1280');
    const b = await open(ctx2, 'J1280');
    await join(a, '阿凯', '');
    const room2 = (await a.textContent('#share-room')).trim();
    await join(b, '小雨', room2);
    await a.waitForFunction(() => S && S.players.length === 2, null, { timeout: 20000 });
    await sleep(700);
    await audit(a, 'lobby', ['screen-lobby', 'players-grid', 'btn-start', 'btn-settings-lobby'], '1280x800');
    await a.bringToFront(); await shot(a, '1280-lobby');
    await a.click('#btn-start');
    await a.waitForSelector('#screen-game.active', { timeout: 15000 });
    await a.waitForFunction(() => S && S.turn.stage === 'choosing', null, { timeout: 10000 });
    await sleep(1300);
    await audit(a, 'game', ['game-players-grid', 'choice-section', 'card-truth', 'card-dare', 'btn-finish-game'], '1280x800');
    await shot(a, '1280-game');
    // 抽一张看揭晓页版式
    const cid = await a.evaluate(() => S.turn.chooserId);
    const dp = cid === await a.evaluate(() => myId) ? a : b;
    await dp.click('#card-truth');
    await a.waitForFunction(() => S && S.turn.stage === 'revealed', null, { timeout: 20000 });
    await sleep(1200);
    await audit(a, 'revealed', ['card-section', 'punishment-text', 'btn-accept', 'btn-skip'], '1280x800');
    await shot(a, '1280-revealed');
    await dp.click('#btn-accept');
    await a.waitForFunction(() => S && S.turn.stage === 'choosing', null, { timeout: 10000 });
    await a.click('#btn-finish-game'); await sleep(300); await a.click('#btn-finish-game');
    await a.waitForSelector('#screen-result.active', { timeout: 15000 });
    await sleep(1000);
    await audit(a, 'result', ['result-podium', 'result-awards', 'btn-rematch'], '1280x800');
    await shot(a, '1280-result');
    await ctx2.close();
  } catch (e) {
    log('1280 复核异常:', e.message);
    jsErrors.push(`[1280] ${e.message}`);
  }

  await browser.close();
  server.close();

  // ── 汇总输出（供报告引用；紧凑 JSON 避免超长） ──
  const slim = collect.map(e => {
    if (e.kind === 'audit') return { kind: 'audit', stage: e.stage, note: e.note, dim: `${e.innerW}x${e.innerH}`, docW: e.docW,
      belowFold: (e.items || []).filter(i => i.belowFold).map(i => i.id), items: (e.items || []).map(i => `${i.id}: t${i.top} b${i.bottom} l${i.left} w${i.w}`),
      world: e.world, lobbyW: e.lobbyW, lobbyCols: e.lobbyCols, appPerspective: e.appPerspective };
    return e;
  });
  console.log('\n════════ 结构化数据 ════════');
  console.log(JSON.stringify(slim));
  console.log('\n════════ JS 错误 (' + jsErrors.length + ') ════════');
  console.log(jsErrors.length ? jsErrors.join('\n') : '无 ✅');
})();
