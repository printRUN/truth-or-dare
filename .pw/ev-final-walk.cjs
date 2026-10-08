/* ev-final-walk.cjs —— 最终视觉验收走查（业务/视觉检查官，端口 8995，2026-10-02）
   一次性取证脚本：跑完清单 7 项并截图到 .pw/shots/final-*.png；只读游戏文件，零修改。
   用法: node ev-final-walk.cjs  */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8995;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

const log = (...a) => console.log(...a);
async function shot(p, name) {
  try {
    await p.screenshot({ path: path.join(SHOTS, name) });
    log(`  📷 ${name}`);
  } catch (e) { log(`  ⚠️ shot-fail ${name} | ${String(e).split('\n')[0].slice(0, 90)}`); }
}
const j = v => JSON.stringify(v).slice(0, 300);

async function openIndex(ctx, w = 1100, h = 800) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1600);
  return { p, errs };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  /* ══ 场景 A/B：清单① index 卡片 3D 化（1100×800 / 390×844）══ */
  log('\n══ A. index 卡片 3D 化（1100×800）══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const { p, errs } = await openIndex(ctx);
    const geo = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('.arcade-card')];
      const cs = el => getComputedStyle(el);
      return {
        n: cards.length,
        cards: cards.map(c => ({
          id: c.id, transform: cs(c).transform.slice(0, 60), style3d: cs(c).transformStyle,
          icoZ: cs(c.querySelector('.arc-ico')).transform.slice(0, 80),
          h2Z: cs(c.querySelector('h2')).transform.slice(0, 80),
          arrZ: cs(c.querySelector('.arc-arrow')).transform.slice(0, 80),
          rect: (r => ({ t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) }))(c.getBoundingClientRect()),
        })),
        vh: innerHeight, scrollW: document.documentElement.scrollWidth,
        hitCardCenter: (() => { const c = document.getElementById('card-tod'); const r = c.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el ? (c.contains(el) ? 'card-descendant' : el.className || el.tagName) : 'null'; })(),
      };
    });
    log('  A-geo', j(geo));
    await shot(p, 'final-1-arcade-desktop.png');
    await p.hover('#card-tod');
    await p.waitForTimeout(320);
    const hov = await p.evaluate(() => {
      const c = document.getElementById('card-tod');
      return { transform: getComputedStyle(c).transform.slice(0, 60) };
    });
    log('  A-hover-transform', j(hov));
    await shot(p, 'final-1-arcade-hover.png');
    log('  A-pageerror', j(errs));
    await ctx.close();
  } catch (e) { log('  A FATAL', String(e).slice(0, 200)); }

  log('\n══ B. index 卡片 3D 化（390×844 窄屏）══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { p, errs } = await openIndex(ctx, 390, 844);
    const geo = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('.arcade-card')];
      return {
        vh: innerHeight, vw: innerWidth,
        scrollW: document.documentElement.scrollWidth,
        cards: cards.map(c => { const r = c.getBoundingClientRect(); return { id: c.id, t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; }),
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        transform0: getComputedStyle(cards[0]).transform.slice(0, 60),
      };
    });
    log('  B-geo', j(geo));
    await shot(p, 'final-1-arcade-mobile.png');
    log('  B-pageerror', j(errs));
    await ctx.close();
  } catch (e) { log('  B FATAL', String(e).slice(0, 200)); }

  /* ══ 场景 C：清单② 点卡起飞一镜（tod 紫 / mono 青 / uno 红 / bombcat 状态文字）══ */
  const diveOnce = async (label, cardSel, target, theme) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const { p, errs } = await openIndex(ctx);
    // 取证手段（不碰游戏文件）：beforeunload 弹窗 + 延迟 accept —— 把导航冻在「wipe 已盖满」瞬间供拍照
    let dlg = null;
    p.on('dialog', d => { dlg = d; setTimeout(() => d.accept().catch(() => {}), 3000); });
    await p.evaluate(() => { window.addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = 'hold'; }); });
    const c = await p.evaluate(sel => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cardSel);
    await p.mouse.move(c.x, c.y);   // 真 hover（卡片抬升过渡）后真点击，时序确定
    await p.waitForTimeout(70);
    await p.mouse.down();
    await p.mouse.up();
    const t0 = Date.now();
    await p.waitForTimeout(80);
    const mid = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      if (!w) return { none: true };
      return { display: getComputedStyle(w).display, pe: getComputedStyle(w).pointerEvents, z: getComputedStyle(w).zIndex };
    }).catch(() => ({ nav: true }));
    log(`  ${label}-mid(${Date.now() - t0}ms)`, j(mid));
    await shot(p, `final-2-wipe-${label}-mid.png`);
    await p.waitForTimeout(160);   // ~300ms：wipe 应已盖满、导航被 beforeunload 弹窗冻住
    const full = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      if (!w) return { none: true };
      const corners = [[5, 5], [innerWidth - 5, 5], [5, innerHeight - 5], [innerWidth - 5, innerHeight - 5]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? w.contains(el) : false; });
      const st = w.querySelector('.wipe-status');
      return { display: getComputedStyle(w).display, cornersCovered: corners.every(Boolean), status: st && !st.hidden ? st.textContent.trim().slice(0, 20) : null };
    }).catch(() => ({ nav: true }));
    log(`  ${label}-full(${Date.now() - t0}ms)`, j(full));   // 盖满瞬间取证=冻结期四角命中断言（display:block + cornersCovered）；盖满视觉帧见 bombcat final-2-wipe-bc-status.png
    if (dlg) { try { await dlg.accept(); } catch (e) {} }   // 放行导航
    await p.waitForURL(`**/${target}`, { timeout: 12000 });
    await p.waitForTimeout(120);
    await shot(p, `final-2-arrival-${label}.png`);
    log(`  ${label} nav at +${Date.now() - t0}ms`);
    const warpA = await p.evaluate(() => {
      const box = document.querySelector('#loader .loader-box');
      const stage = document.querySelector('.loader-stage');
      return { loaderVisible: !!document.querySelector('#loader'), loaderBoxWarpIn: box ? box.classList.contains('warp-in') : 'no-loader', stageWarpIn: stage ? stage.classList.contains('warp-in') : 'no-stage', ticket: !!localStorage.getItem('tod:warp') };
    }).catch(() => ({ gone: true }));
    log(`  ${label}-warp@+150ms`, j(warpA));
    await p.waitForTimeout(300);
    await shot(p, `final-2-warpin-${label}-b.png`);
    const warp = await p.evaluate(() => {
      const box = document.querySelector('#loader .loader-box');
      const stage = document.querySelector('.loader-stage');
      return { loaderVisible: !!document.querySelector('#loader'), loaderBoxWarpIn: box ? box.classList.contains('warp-in') : 'no-loader', stageWarpIn: stage ? stage.classList.contains('warp-in') : 'no-stage', url: location.pathname.split('/').pop() };
    }).catch(() => ({ gone: true }));
    log(`  ${label}-warp@+550ms`, j(warp), 'errs:', j(errs));
    await ctx.close();
    return { mid, full, warp };
  };

  log('\n══ C1. 点卡起飞 → tod.html（紫色 warp-in）══');
  try { await diveOnce('tod', '#card-tod', 'tod.html', 'purple'); } catch (e) { log('  C1 FATAL', String(e).slice(0, 200)); }
  log('\n══ C2. 点卡起飞 → monopoly.html（青色 warp-in）══');
  try { await diveOnce('mono', '#card-monopoly', 'monopoly.html', 'cyan'); } catch (e) { log('  C2 FATAL', String(e).slice(0, 200)); }
  log('\n══ C3. 点卡起飞 → uno.html（红色 wipe）══');
  try { await diveOnce('uno', '#card-uno', 'uno.html', 'red'); } catch (e) { log('  C3 FATAL', String(e).slice(0, 200)); }

  log('\n══ C4. bombcat 卡探测路径：wipe 内嵌「正在确认能否开门…」══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const { p, errs } = await openIndex(ctx);
    await ctx.route('**/bombcat.html*', async route => { await sleep(700); await route.continue(); });   // HEAD 探测与 GET 都被拖住 → 状态文字可拍
    await p.click('#card-bombcat');
    await p.waitForTimeout(350);
    const st = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      if (!w) return { none: true };
      const s = w.querySelector('.wipe-status');
      return { display: getComputedStyle(w).display, statusHidden: s ? s.hidden : 'no-node', status: s ? s.textContent.trim().slice(0, 24) : null };
    }).catch(() => ({ nav: true }));
    log('  C4-status', j(st));
    await shot(p, 'final-2-wipe-bc-status.png');
    await p.waitForURL('**/bombcat.html', { timeout: 12000 });
    log('  C4 nav OK →', p.url().split('/').pop(), 'errs:', j(errs));
    await ctx.close();
  } catch (e) { log('  C4 FATAL', String(e).slice(0, 200)); }

  log('\n══ C5. uno.html?wildgl=1 + warp 票 → loader 不受影响 ══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:warp', JSON.stringify({ g: 'uno', t: Date.now() })); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?wildgl=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(420);
    const w = await p.evaluate(() => {
      const box = document.querySelector('#loader .loader-box');
      return { loaderVisible: !!document.querySelector('#loader'), boxWarpIn: box ? box.classList.contains('warp-in') : 'no-box', ticket: !!localStorage.getItem('tod:warp') };
    }).catch(() => ({ gone: true }));
    log('  C5-warp', j(w));
    log('  C5 errs', j(errs));
    await ctx.close();
  } catch (e) { log('  C5 FATAL', String(e).slice(0, 200)); }

  log('\n══ C6. warp-in loader 视觉帧（commit 即拍：tod 紫 / mono 青 / uno 红+wildgl）══');
  const loaderFrame = async (label, url, g) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript(gg => { try { localStorage.setItem('tod:warp', JSON.stringify({ g: gg, t: Date.now() })); } catch (e) {} }, g);
    await ctx.route('**/three.r128.js', async route => { await sleep(900); await route.continue(); });   // 取证：拖住阻塞脚本 → warp-in 动画窗口右移到可拍区间（loader 本体照常先画）
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'commit' });   // 提交即返：loader 窗口内落拍
    const cdp = await ctx.newCDPSession(p);   // attach ~+250ms，再停 750ms ≈ 动画起点（warp-in 类随阻塞脚本解堵才挂）
    for (const [tag, gap] of [['b', 750]]) {
      if (gap) await sleep(gap);
      try {
        const b64 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS, `final-2-warpin-${label}-${tag}.png`), Buffer.from(b64.data, 'base64'));
        log(`  📷 final-2-warpin-${label}-${tag}.png (cdp)`);
      } catch (e) { log(`  ⚠️ cdp-fail ${label}-${tag} | ${String(e).split('\n')[0].slice(0, 70)}`); }
    }
    const st = await p.evaluate(() => {
      const box = document.querySelector('#loader .loader-box');
      const stage = document.querySelector('.loader-stage');
      return { loaderVisible: !!document.querySelector('#loader'), boxWarpIn: box ? box.classList.contains('warp-in') : 'no-box', stageWarpIn: stage ? stage.classList.contains('warp-in') : 'no-stage' };
    }).catch(() => ({ gone: true }));
    log(`  ${label}-loader-state`, j(st));
    await cdp.detach().catch(() => {});
    await ctx.close();
  };
  try { await loaderFrame('tod', `http://127.0.0.1:${PORT}/tod.html`, 'tod'); } catch (e) { log('  C6-tod FATAL', String(e).slice(0, 200)); }
  try { await loaderFrame('mono', `http://127.0.0.1:${PORT}/monopoly.html`, 'monopoly'); } catch (e) { log('  C6-mono FATAL', String(e).slice(0, 200)); }
  try { await loaderFrame('uno', `http://127.0.0.1:${PORT}/uno.html?wildgl=1`, 'uno'); } catch (e) { log('  C6-uno FATAL', String(e).slice(0, 200)); }

  /* ══ 场景 D：清单③ 返回 pull-back（tod → index 四卡 drop-back）══ */
  log('\n══ D. 返回 pull-back（tod.html「← 游戏中心」→ index drop-back）══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#btn-join', { state: 'visible', timeout: 20000 });
    await p.waitForFunction(() => { const b = document.getElementById('btn-join'); return b && !b.disabled; }, null, { timeout: 15000 });
    await p.waitForTimeout(400);
    await p.click('#btn-arcade-back');
    await p.waitForURL('**/index.html', { timeout: 12000 });
    await p.waitForFunction(() => document.querySelector('.arcade-grid')?.classList.contains('drop-back'), null, { timeout: 15000 });   // 类落地瞬间=入场动画进行中
    const s1 = await p.evaluate(() => ({
      gridDropBack: document.querySelector('.arcade-grid')?.classList.contains('drop-back'),
      world: document.getElementById('world3d').style.transform.slice(0, 70),
      ticketGone: !localStorage.getItem('tod:warp-back'),
    }));
    log('  D-dropback-class-flip', j(s1));
    await shot(p, 'final-3-dropback-mid.png');
    await p.waitForTimeout(260);
    const s2 = await p.evaluate(() => ({ world: document.getElementById('world3d').style.transform.slice(0, 70), dropBack: document.querySelector('.arcade-grid')?.classList.contains('drop-back') }));
    log('  D-mid(+260ms)', j(s2));
    await shot(p, 'final-3-dropback-2.png');
    await p.waitForTimeout(1000);
    const s3 = await p.evaluate(() => ({ world: document.getElementById('world3d').style.transform.slice(0, 70), dropBack: document.querySelector('.arcade-grid')?.classList.contains('drop-back') }));
    log('  D-settled', j(s3));
    await shot(p, 'final-3-dropback-settled.png');
    log('  D errs', j(errs));
    await ctx.close();
  } catch (e) { log('  D FATAL', String(e).slice(0, 200)); }

  /* ══ 场景 E：清单④ monopoly 清算仪式 + 钞堆（inspect=1 真速 4 人局）══ */
  log('\n══ E. monopoly 4 人局：钞堆 + 破产清算仪式 + flyNotes ══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#setup:not([hidden])', { timeout: 25000 });
    await p.evaluate(() => document.getElementById('seat-plus').click());
    await p.evaluate(() => document.getElementById('seat-plus').click());   // 2 → 4 人
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForFunction(() => window.__mono && window.__mono.state.players.length === 4, null, { timeout: 25000 });
    await p.evaluate(() => window.__mono.handoff());   // 热座交接幕（inspect 未勾跳过）：点「开始回合」进 AWAIT_ROLL
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    await p.evaluate(() => window.__mono.handoff()).catch(() => {});   // 幂等兜底
    await p.waitForTimeout(1600);   // GL 落场稳定
    const gl = await p.evaluate(() => window.__mono.sceneInfo());
    log('  E-scene', j(gl));
    const st0 = await p.evaluate(() => window.__mono.stacks());
    log('  E-stacks-before', j({ per0: st0.perPlayer[0], per1: st0.perPlayer[1], busy: st0.notePoolBusy }));
    await shot(p, 'final-4-stacks-before.png');
    await p.evaluate(() => window.__mono.forceMoney(1, 20000));
    await p.waitForFunction(() => window.__mono.stacks().perPlayer[1].shown === 4, null, { timeout: 4000 });
    await p.waitForTimeout(350);
    const st1 = await p.evaluate(() => window.__mono.stacks());
    log('  E-stacks-after(+¥10000→¥20000)', j({ per1: st1.perPlayer[1], busy: st1.notePoolBusy }));
    await shot(p, 'final-4-stacks-after.png');

    // 破产清算仪式：玩家 0 名下两块地 + 打穷 → 克隆 mark 飞向桌心银行
    await p.evaluate(() => {
      const M = window.__mono;
      M.state.owners[3] = 0; M.state.owners[5] = 0;
      M.forceMoney(0, 100);
      window.__rc = [];
      window.__ri = setInterval(() => { const r = M.ritual(); window.__rc.push({ f: r.flying, t: r.tiles.slice(), b: r.bannerShown, busy: r.scatterBusy }); }, 16);
    });
    await p.evaluate(() => window.__mono.pay(0, 5000, null));
    let caught = false;
    for (let i = 0; i < 60; i++) {
      const r = await p.evaluate(() => window.__mono.ritual()).catch(() => null);
      if (r && r.flying > 0) {
        await shot(p, 'final-4-ritual-mid.png');
        await p.waitForTimeout(220);
        await shot(p, 'final-4-ritual-mid2.png');
        caught = true;
        break;
      }
      await sleep(25);
    }
    log('  E-ritual-caught-inflight', caught);
    await p.waitForFunction(() => window.__mono.ritual().bannerShown, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(120);
    const rb = await p.evaluate(() => { clearInterval(window.__ri); return { rec: window.__rc.filter((s, i) => i % 4 === 0).slice(0, 14), now: window.__mono.ritual() }; });
    log('  E-ritual-recorder', j(rb));
    await shot(p, 'final-4-bust-banner.png');
    const st2 = await p.evaluate(() => window.__mono.stacks().perPlayer[0]);
    log('  E-bankrupt-stack-cleared', j(st2));

    // flyNotes 航班与钞堆同框（收租 ¥2000 ≥1500 → thump+jolt）
    await p.evaluate(() => { const M = window.__mono; M.forceMoney(2, 20000); M.pay(2, 2000, 3); });
    let fn = false;
    for (let i = 0; i < 50; i++) {
      const s = await p.evaluate(() => window.__mono.stacks()).catch(() => null);
      if (s && s.notePoolBusy > 0) {
        await shot(p, 'final-4-flynotes.png');
        fn = true;
        break;
      }
      await sleep(20);
    }
    log('  E-flynotes-caught', fn);
    const jolt = await p.evaluate(() => ({ jolt: document.body.classList.contains('jolt'), shaking: document.body.classList.contains('shaking') }));
    log('  E-jolt-class', j(jolt));
    log('  E errs', j(errs));
    await ctx.close();
  } catch (e) { log('  E FATAL', String(e).slice(0, 300)); }

  /* ══ 场景 E2：清单④补拍——把棋子摆进近景视野，拍钞堆层数增减 + flyNotes 航线与钞堆同框 ══ */
  log('\n══ E2. monopoly 棋子钞堆可视化（棋子入镜）══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#setup:not([hidden])', { timeout: 25000 });
    await p.evaluate(() => document.getElementById('seat-plus').click());
    await p.evaluate(() => document.getElementById('seat-plus').click());
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForFunction(() => window.__mono && window.__mono.state.players.length === 4, null, { timeout: 25000 });
    await p.evaluate(() => window.__mono.handoff());
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    await p.waitForTimeout(1500);
    // 按格坐标挑 3 个「靠镜头、横向铺开」的格（底部可见区）：棋子与其背桌心方向的钞堆都留在镜内
    const picks = await p.evaluate(() => {
      const M = window.__mono;
      const cands = [];
      for (let t = 0; t < 24; t++) { const xy = M.tileXY(t); cands.push({ t, x: xy.x, z: xy.z }); }
      const near = cands.filter(c => c.z > 4.2).sort((a, b) => a.x - b.x);   // 近镜头一排
      const pick = near.length >= 3 ? [near[0].t, near[Math.floor(near.length / 2)].t, near[near.length - 1].t] : [6, 7, 8];   // 兜底=顶排（全可见、背桌心方向留白）
      M.forcePos(0, pick[1]);   // 当前玩家=镜头焦点：把焦点棋子也挪过去，让相机对准钞堆区
      M.forcePos(1, pick[0]); M.forcePos(2, pick[1]); M.forcePos(3, pick[2]);
      M.forceMoney(1, 5000); M.forceMoney(2, 20000); M.forceMoney(3, 15000);
      return { picks: pick, coords: pick.map(t => M.tileXY(t)), nearN: near.length };
    });
    log('  E2-picks', j(picks));
    await p.waitForTimeout(700);
    // 滚轮拉远相机（若 rig 支持 wheel zoom），让棋子+钞堆整体入镜
    const d0 = await p.evaluate(() => window.__mono.rigSnap().dist);
    await p.mouse.move(550, 420);
    await p.mouse.wheel(0, -900);
    await p.waitForTimeout(900);
    const d1 = await p.evaluate(() => window.__mono.rigSnap().dist);
    log(`  E2-zoom dist ${d0?.toFixed?.(1)} → ${d1?.toFixed?.(1)}`);
    const sv = await p.evaluate(() => window.__mono.stacks().perPlayer.map((s, i) => ({ i, cash: s.cash, want: s.want, shown: s.shown })));
    log('  E2-stacks', j(sv));
    await shot(p, 'final-4-stacks-view.png');
    await p.evaluate(() => window.__mono.forceMoney(1, 20000));   // +1 层滑入
    await p.waitForFunction(() => window.__mono.stacks().perPlayer[1].shown === 4, null, { timeout: 4000 });
    await p.waitForTimeout(400);
    await shot(p, 'final-4-stacks-view2.png');
    // flyNotes 航线（p2→p1，两枚棋子都在镜内）与钞堆同框
    await p.evaluate(() => window.__mono.pay(2, 2000, 1));
    let fn2 = false;
    for (let i = 0; i < 60; i++) {
      const s = await p.evaluate(() => window.__mono.stacks()).catch(() => null);
      if (s && s.notePoolBusy > 0) { await shot(p, 'final-4-flynotes-view.png'); fn2 = true; break; }
      await sleep(18);
    }
    log('  E2-flynotes-caught', fn2);
    log('  E2 errs', j(errs));
    await ctx.close();
  } catch (e) { log('  E2 FATAL', String(e).slice(0, 300)); }

  /* ══ 场景 F：清单⑤ uno GL 选色（?wildgl=1，桌面 + 390×844）══ */
  const unoGlRun = async (label, w, h, withShots) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&wildgl=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, null, { timeout: 25000 });
    const glOn = await p.evaluate(() => __uno.camInfo().gl);
    await p.evaluate(() => {
      __uno.state.cur = 'r';
      __uno.state.discard = [{ c: 'r', v: '3' }];
      __uno.state.deck = [{ c: 'y', v: '5' }, { c: 'y', v: '6' }, { c: 'y', v: '7' }];
      __uno.forceHand(0, [{ c: 'w', v: 'W' }, { c: 'r', v: '2' }, { c: 'g', v: '3' }]);
      __uno.forceHand(1, [{ c: 'y', v: '9' }, { c: 'y', v: '8' }]);
    });
    const wIdx = await p.evaluate(() => __uno.state.players[0].hand.findIndex(x => x.c === 'w'));
    await p.evaluate(k => __uno.play(k), wIdx);
    await p.waitForFunction(() => __uno.wild().active && __uno.wild().held, null, { timeout: 6000 });
    await p.waitForFunction(() => __uno.wild().balls.length === 4 && Math.min(...__uno.wild().balls.map(b => b.s)) > 0.8, null, { timeout: 6000 });
    await p.evaluate(() => __uno.forceRender());
    const balls = await p.evaluate(() => {
      const pos = {}; ['r', 'y', 'g', 'b'].forEach(c => { pos[c] = __uno.wild().ballScreen(c); });
      // 命中软半径（加大隐形 raycast 面）：从球心向右逐像素探
      const b = pos.b; let rad = 0;
      if (b) for (let d = 0; d <= 80; d += 4) { if (__uno.wild().hitTest(Math.round(b.x) + d, Math.round(b.y)) === 'b') rad = d; }
      return { pos, hitRadiusPx: rad, held: __uno.wild().held, inHand: __uno.wild().heldInHand };
    });
    log(`  ${label}-bloom gl=${glOn}`, j(balls));
    if (withShots) { await p.evaluate(() => __uno.forceRender()); await shot(p, `final-5-balls-bloom-${label}.png`); }
    // 点蓝球 → 缩入堆顶 + 染色
    const bs = balls.pos.b;
    await p.mouse.click(Math.round(bs.x), Math.round(bs.y));
    if (withShots) { await p.evaluate(() => __uno.forceRender()); await shot(p, `final-5-ball-pick-${label}.png`); }
    await p.waitForFunction(() => __uno.state.cur === 'b' && __uno.state.discard[__uno.state.discard.length - 1].c === 'w', null, { timeout: 8000 });
    await p.waitForTimeout(260);
    const picked = await p.evaluate(() => ({ cur: __uno.state.cur, top: __uno.state.discard[__uno.state.discard.length - 1].v, ballsLeft: __uno.wild().balls.length, active: __uno.wild().active }));
    log(`  ${label}-picked`, j(picked));
    if (withShots) { await p.evaluate(() => __uno.forceRender()); await shot(p, `final-5-pile-tinted-${label}.png`); }
    await p.waitForFunction(() => !__uno.wild().active && __uno.wild().balls.length === 0, null, { timeout: 6000 }).catch(() => {});
    log(`  ${label} errs`, j(errs));
    await ctx.close();
  };
  log('\n══ F1. uno GL 选色（1100×800 桌面）══');
  try { await unoGlRun('desktop', 1100, 800, true); } catch (e) { log('  F1 FATAL', String(e).slice(0, 200)); }
  log('\n══ F2. uno GL 选色（390×844 手机竖屏：可点区域）══');
  try { await unoGlRun('mobile', 390, 844, true); } catch (e) { log('  F2 FATAL', String(e).slice(0, 200)); }

  /* ══ 场景 G：清单⑥ bombcat 悬念拍 + 结算一镜（1280×860）══ */
  async function twoPlayerGame(ctx, nameA) {
    const pA = await ctx.newPage();
    const errsA = [];
    pA.on('pageerror', e => errsA.push(String(e).slice(0, 120)));
    await pA.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
    await pA.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
    await pA.click('details.adv summary');
    await pA.click('#chk-local');
    await pA.fill('#in-name', nameA);
    await pA.click('#btn-join');
    await pA.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    const room = (await pA.textContent('#share-room')).trim();
    const pB = await ctx.newPage();
    const errsB = [];
    pB.on('pageerror', e => errsB.push(String(e).slice(0, 120)));
    await pB.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
    await pB.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
    await pB.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 5000 });
    await pB.click('details.adv summary');
    await pB.click('#chk-local');
    await pB.fill('#in-name', '乙');
    await pB.click('#btn-join');
    await pB.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
    await pA.click('#btn-start');
    await pA.waitForSelector('#screen-game.active', { timeout: 15000 });
    await pB.waitForSelector('#screen-game.active', { timeout: 15000 });
    await pA.evaluate(() => __cat.setTiming({ turn: 120000, afk: 3000, quick: 200 }));
    await pA.waitForFunction(() => __cat.hand.length >= 1, null, { timeout: 10000 });
    await pA.waitForTimeout(1200);
    return { pA, pB, room, errsA, errsB };
  }
  log('\n══ G. bombcat 悬念拍 + 结算一镜（1280×860）══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const { pA, pB, errsA, errsB } = await twoPlayerGame(ctx, '甲');
    await shot(pA, 'final-7-bc-normal.png');
    const is3d = await pA.evaluate(() => document.body.classList.contains('three3d'));
    log('  G three3d', is3d);
    const ids = await Promise.all([pA, pB].map(p => p.evaluate(() => __cat.myId)));
    await pA.evaluate(b => {
      const e = __cat.engine;
      e._H.hands[b] = ['taco:9'];
      e._H.deck = e._H.deck.filter(c => CAT.kindOf(c) !== 'ek');
      e._H.deck.unshift('ek:9');
      e.G.turn.pid = b;
      e.G.turn.acted = Date.now();
      __cat.hostOnAct({ from: b, mid: 'fb' + Math.random(), a: { t: 'hello' } });
      __cat.hostPublish('walk-kill-b');
    }, ids[1]);
    await pB.waitForFunction(() => { const b = document.querySelector('#btn-draw'); return b && !b.disabled && b.style.display !== 'none'; }, null, { timeout: 8000 });
    await pB.evaluate(() => { const b = document.querySelector('#btn-draw'); if (b) b.click(); });
    await pA.waitForFunction(() => __cat.S && __cat.S.log.some(l => l.m.includes('被炸出局')), null, { timeout: 8000 });
    await pA.waitForFunction(() => __cat.fuseAlive(), null, { timeout: 4000 });
    await pA.waitForTimeout(350);   // 引信悬停中段（推近进行中）
    const fus = await pA.evaluate(() => ({ s: __cat.suspense, fuse: __cat.fuseAlive(), resultActive: document.querySelector('#screen-result').classList.contains('active') }));
    log('  G-fuse-mid', j(fus));
    await shot(pA, 'final-6-fuse-hover-a.png');
    await pA.waitForTimeout(400);
    await shot(pA, 'final-6-fuse-hover-b.png');
    // boom 帧：轮询到 boomFiredAt>0 立即拍
    let boomCaught = false;
    for (let i = 0; i < 400; i++) {
      const f = await pA.evaluate(() => __cat.boomFiredAt).catch(() => 0);
      if (f > 0) {
        await shot(pA, 'final-6-boom.png');
        await pA.waitForTimeout(180);
        await shot(pA, 'final-6-boom-2.png');
        boomCaught = true;
        break;
      }
      await sleep(12);
    }
    log('  G-boom-caught', boomCaught);
    // 结算 veil 帧：#screen-result 一 active 就拍
    for (let i = 0; i < 400; i++) {
      const act = await pA.evaluate(() => document.querySelector('#screen-result').classList.contains('active')).catch(() => true);
      if (act) { await shot(pA, 'final-6-result-veil.png'); break; }
      await sleep(12);
    }
    await pA.waitForTimeout(700);
    await shot(pA, 'final-6-result-settled.png');
    const res = await pA.evaluate(() => ({ h2: (document.querySelector('#res-box h2') || {}).textContent || '', veilAnim: (() => { const v = document.querySelector('#screen-result .result-veil'); return v ? getComputedStyle(v).animationName : 'missing'; })() }));
    log('  G-result', j(res));
    log('  G errs A', j(errsA), 'B', j(errsB));
    await ctx.close();
  } catch (e) { log('  G FATAL', String(e).slice(0, 300)); }

  /* ══ 场景 H：清单⑦ 回归观感（tod 一局牌桌帧）══ */
  log('\n══ H. tod.html 正常一局（本地双人）：3D 牌桌回归帧 ══');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const pA = await ctx.newPage();
    const errs = [];
    pA.on('pageerror', e => errs.push('A:' + String(e).slice(0, 100)));
    await pA.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await pA.waitForFunction(() => { const b = document.getElementById('btn-join'); return b && !b.disabled; }, null, { timeout: 20000 });
    await pA.fill('#input-name', '验收员');
    await pA.click('.join-box details.adv summary');
    await pA.click('#chk-local');
    await pA.click('#btn-join');
    await pA.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    const room = (await pA.textContent('#share-room')).trim();
    log('  H room', room);
    const pB = await ctx.newPage();
    pB.on('pageerror', e => errs.push('B:' + String(e).slice(0, 100)));
    await pB.goto(`http://127.0.0.1:${PORT}/tod.html?room=${room}`, { waitUntil: 'domcontentloaded' });
    await pB.waitForFunction(() => { const b = document.getElementById('btn-join'); return b && !b.disabled; }, null, { timeout: 20000 });
    await pB.fill('#input-name', '小明');
    await pB.click('.join-box details.adv summary');
    await pB.click('#chk-local');
    await pB.click('#btn-join');
    await pB.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await pA.waitForFunction(() => { const b = document.getElementById('btn-start'); return b && !b.disabled; }, null, { timeout: 15000 });
    await pA.evaluate(() => document.getElementById('btn-start').click());
    await pA.waitForFunction(() => document.querySelector('.screen.active') && document.querySelector('.screen.active').id !== 'screen-lobby' && document.querySelector('.screen.active').id !== 'screen-join', null, { timeout: 20000 });
    await pA.waitForTimeout(2000);
    await pA.evaluate(() => { const bs = [...document.querySelectorAll('button')]; const b = bs.find(x => (x.textContent || '').includes('明白啦')); if (b) b.click(); });   // 首局「怎么玩」教程弹窗：确认后拍牌桌
    await pA.waitForTimeout(1800);
    const st = await pA.evaluate(() => ({ active: document.querySelector('.screen.active')?.id }));
    log('  H game-screen', j(st));
    await shot(pA, 'final-7-tod-table.png');
    log('  H errs', j(errs));
    await ctx.close();
  } catch (e) { log('  H FATAL', String(e).slice(0, 300)); }

  await browser.close();
  server.close();
  const files = fs.readdirSync(SHOTS).filter(f => f.startsWith('final-')).sort();
  log('\n══ 取证产物（.pw/shots/）══');
  files.forEach(f => log('  ', f, fs.statSync(path.join(SHOTS, f)).size));
  console.log('\nev-final-walk 完成');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
