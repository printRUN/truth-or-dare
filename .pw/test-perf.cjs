// 性能回归：背景光球不再有 blur 层；弱 GPU 下大厅/牌桌都要稳住帧率；省电模式三档可用
// 用法: node test-perf.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8755;
const log = (...a) => console.log('[perf-test]', ...a);
let fails = 0;
const ok = (cond, msg) => { log((cond ? '  ✅ ' : '  ❌ ') + msg); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

const frameStats = d => new Promise(res => {
  const gaps = []; const start = performance.now(); let last = start;
  const fin = () => {
    const g = gaps.slice(2);
    const avg = g.reduce((a, b) => a + b, 0) / (g.length || 1);
    const s = g.slice().sort((a, b) => a - b);
    res({ fps: +(1000 / avg).toFixed(1), p95: +(s[Math.max(0, Math.floor(s.length * 0.95) - 1)] || 0).toFixed(1), frames: g.length });
  };
  const step = t => { gaps.push(t - last); last = t; if (t - start >= d) fin(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
});

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag} console: ${m.text().slice(0, 200)}`); });
}

async function boot(browser, tag, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  watch(page, tag);
  if (init) await page.addInitScript(init);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-join.active', { timeout: 60000 });
  await sleep(400);
  await page.evaluate(() => closeGuide());
  await page.fill('#input-name', tag);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  await sleep(1200);
  await page.evaluate(() => closeGuide());
  return { ctx, page };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  // --disable-gpu = 软件光栅，等价于一台很弱的手机 GPU：帧率不达标记为失败
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });

  // ── 1. 背景层不再有每帧重光栅化的模糊滤镜
  const { ctx: c1, page: a } = await boot(browser, 'PerfA');
  const orb = await a.evaluate(() => {
    const o = [...document.querySelectorAll('.orb')];
    return { n: o.length, filters: o.map(e => getComputedStyle(e).filter), anims: o.map(e => getComputedStyle(e).animationName) };
  });
  ok(orb.n === 3 && orb.filters.every(f => f === 'none'), `光球不再挂 filter:blur（实测 ${JSON.stringify(orb.filters)}）`);
  ok(orb.anims.every(x => /^drift-/.test(x)), '光球仍保留缓慢飘动（观感没丢）');
  const conf = await a.evaluate(() => document.querySelectorAll('#bg-canvas .confetti').length);
  ok(conf === 26, `背景纸屑 ${conf} 片（buildBg 只在启动时调用一次，不会逐轮累积）`);

  // ── 2. 大厅帧率：16 人满员 + 全部动效开着
  await a.evaluate(() => {
    for (let i = 0; i < 15; i++) {
      const id = 'zz' + Math.random().toString(36).slice(2, 8);
      mutate(s => s.players.push({ id, name: 'G' + i, avatar: '🐵', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
    }
  });
  await sleep(1200);
  const lobby = await a.evaluate(frameStats, 4000);
  log('大厅 16 人', JSON.stringify(lobby));
  ok(lobby.fps >= 50 && lobby.p95 <= 25, `大厅满员帧率达标（fps=${lobby.fps}, p95=${lobby.p95}ms）`);

  // ── 3. 牌桌帧率 + 连续抽卡后 DOM/粒子不累积
  await a.click('#mode-pick .mode-opt[data-mode="free"]');
  await a.click('#btn-start');
  await a.waitForSelector('#screen-game.active', { timeout: 20000 });
  await sleep(1000);
  const game = await a.evaluate(frameStats, 4000);
  log('牌桌 16 人', JSON.stringify(game));
  ok(game.fps >= 50 && game.p95 <= 25, `牌桌帧率达标（fps=${game.fps}, p95=${game.p95}ms）`);

  let rounds = 0;
  let before = null;
  for (let r = 0; r < 6; r++) {
    try {
      await a.waitForSelector('#choice-section:not([hidden]) >> #card-truth:not(.disabled)', { timeout: 10000 });
      await a.click('#card-truth');
      await a.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
      await sleep(2000);                       // 翻牌 + 打字机 + 揭晓爆彩
      if (await a.locator('#btn-accept').isVisible()) await a.click('#btn-accept');
      rounds++;
      if (rounds === 2) before = await a.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, anims: document.getAnimations().length }));
    } catch (e) { log('round', r, '跳过', String(e).slice(0, 60)); }
    await sleep(900);
  }
  await sleep(2500);
  const after = await a.evaluate(() => ({
    nodes: document.getElementsByTagName('*').length,
    anims: document.getAnimations().length,
    burst: document.querySelectorAll('.burst-particle').length,
    recent: S.recent.truth.length + S.recent.dare.length,
  }));
  log(`同屏幕连抽 ${rounds} 轮：第2轮 ${JSON.stringify(before)} → 结束 ${JSON.stringify(after)}`);
  ok(after.burst === 0, `爆彩粒子已全部自清理（残留 ${after.burst} 个）`);
  ok(after.recent <= 20, `防重复清单有上限（${after.recent} 条 ≤ 2×10）`);
  ok(before && after.nodes - before.nodes < 60, `牌桌内连抽后 DOM 节点不累积（${before && before.nodes} → ${after.nodes}）`);
  ok(before && after.anims <= before.anims + 6, `运行中动画数不随轮数增长（第2轮 ${before && before.anims} → 结束 ${after.anims}）`);
  await c1.close();

  // ── 4. 切后台/切聊天窗口：动画冻结，回来恢复
  const { ctx: c2, page: b } = await boot(browser, 'PerfB');
  await b.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pausedOn = await b.evaluate(() => ({
    cls: document.body.classList.contains('paused'),
    play: getComputedStyle(document.querySelector('.orb')).animationPlayState,
  }));
  ok(pausedOn.cls && pausedOn.play === 'paused', `切走即冻结背景动画（${JSON.stringify(pausedOn)}）`);
  await b.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const pausedOff = await b.evaluate(() => getComputedStyle(document.querySelector('.orb')).animationPlayState);
  ok(pausedOff === 'running', `切回来自动恢复播放（${pausedOff}）`);
  await c2.close();

  // ── 5. 省电模式：手动开关 + 记忆；自动档靠实测帧率
  const { ctx: c3, page: c } = await boot(browser, 'PerfC');
  await c.click('#btn-guide-lobby');
  await c.waitForSelector('#guide-mask:not([hidden])');
  const hasBtns = await c.evaluate(() => ['auto', 'on', 'off'].every(k => !!document.getElementById('btn-perf-' + k)));
  ok(hasBtns, '「怎么玩」里有省电模式三档开关');
  await c.click('#btn-perf-on');
  const on = await c.evaluate(() => ({ lo: document.body.classList.contains('loperf'), pref: localStorage.getItem('tod:perf'), conf: getComputedStyle(document.querySelector('.confetti')).display }));
  ok(on.lo && on.pref === 'low' && on.conf === 'none', `手动开启生效并已持久化（${JSON.stringify(on)}）`);
  await c.click('#btn-perf-off');
  const off = await c.evaluate(() => ({ lo: document.body.classList.contains('loperf'), pref: localStorage.getItem('tod:perf') }));
  ok(!off.lo && off.pref === 'full', `手动关闭生效（${JSON.stringify(off)}）`);
  await c.reload({ waitUntil: 'domcontentloaded' });
  await c.waitForSelector('#screen-lobby.active, #screen-join.active', { timeout: 60000 });
  const kept = await c.evaluate(() => ({ lo: document.body.classList.contains('loperf'), pref: localStorage.getItem('tod:perf') }));
  ok(!kept.lo && kept.pref === 'full', `刷新后仍记住用户选择（${JSON.stringify(kept)}）`);
  await c3.close();

  // ── 6. 自动档：真正掉帧的设备（软件光栅 + 人为塞回 blur 层）要被实测抓出来
  const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const d = await ctxD.newPage();
  watch(d, 'PerfD');
  await d.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await d.waitForSelector('#screen-join.active', { timeout: 60000 });
  await d.evaluate(() => {   // 把 blur 层塞回去，制造持续掉帧：perfWatch 必须自动降载
    const st = document.createElement('style');
    st.textContent = '.orb{filter:blur(80px) !important}';
    document.head.appendChild(st);
    perfSamples = 0; perfLast = 0; perfPref = 'auto'; LOWPERF = false;
    document.body.classList.remove('loperf');
    perfWatch(3000);
  });
  const t0 = Date.now();
  let auto = null;
  while (Date.now() - t0 < 15000) {
    auto = await d.evaluate(() => ({ lo: document.body.classList.contains('loperf'), pref: localStorage.getItem('tod:perf') }));
    if (auto.lo) break;
    await sleep(800);
  }
  ok(auto.lo === true && auto.pref === 'auto', `持续掉帧被实测捕获并自动降载（${JSON.stringify(auto)}；pref 仍为 auto → 下次进页会重新实测）`);
  await ctxD.close();

  await browser.close();
  server.close();
  if (errors.length) { fails++; log('❌ 页面报错：\n' + errors.join('\n')); }
  log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 性能回归全部通过');
  process.exit(fails ? 1 : 0);
})();
