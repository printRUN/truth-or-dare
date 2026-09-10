// 性能取证：DOM 节点数 / 运行中动画数 / JS 堆 是否随时间单调增长（模拟真实一整晚派对）
// 用法: node probe-perf.cjs [workers]  （需先起 server：任何端口都行，见 probe-perf2）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = 'D:/myidea/truth-or-dare';
const URL_BASE = process.env.URL_BASE || `file:///${ROOT.replace(/\\/g, '/')}/index.html`;
const W = +(process.argv[2] || 2);
const log = (...a) => console.log('[perf]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newWorker(browser, tag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', tag, String(e).slice(0, 160)));
  await page.goto(URL_BASE + '?room=PERF01');
  await page.waitForSelector('#join-screen', { timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => closeGuide());
  await page.fill('#input-name', tag);
  await page.click('#btn-join');
  await page.waitForSelector('#lobby-screen', { timeout: 60000 });
  await sleep(800);
  await page.evaluate(() => dismissGuide && dismissGuide());
  return { ctx, page };
}

const snap = page => page.evaluate(() => {
  try {
    return {
      nodes: document.getElementsByTagName('*').length,
      confo: document.querySelectorAll('#bg-canvas .confetti').length,
      anims: document.getAnimations().length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
      players: S ? S.players.length : -1,
      recent: S ? S.recent.truth.length + S.recent.dare.length : -1,
      toasts: document.querySelectorAll('.toast').length,
      loperf: document.body.classList.contains('loperf') ? 1 : 0,
    };
  } catch (e) { return { err: String(e).slice(0, 80) }; }
});

async function addFakePlayers(page, n) {
  await page.evaluate(cnt => {
    for (let i = 0; i < cnt; i++) {
      const id = 'zz' + Math.random().toString(36).slice(2, 8);
      mutate(s => {
        for (let j = 0; j < 14; j++) if (!s.recent.truth.includes('x' + Math.random())) s.recent.truth.push('t' + Math.random());
        if (!s.players.some(p => p.id === id)) s.players.push({
          id, name: 'Ghost' + Math.floor(Math.random() * 9999), avatar: '🐵', isHost: false, ready: false,
          micOn: false, online: true, streak: 0, skipUsed: false, lastSeen: Date.now() - 40000, joinedAt: Date.now() - 40000,
        });
      });
    }
  }, n);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ws = [];
  for (let i = 0; i < W; i++) ws.push(await newWorker(browser, 'P' + i));
  log('workers ready', URL_BASE.slice(0, 30));
  log('t0', JSON.stringify(await snap(ws[0].page)));

  const t0 = Date.now();
  const el = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

  // ---- 60 s 空跑：只有背景动画 + 心跳（真实挂机等人） ----
  for (let i = 0; i < 6; i++) { await sleep(10000); log('idle ' + el(), JSON.stringify(await snap(ws[0].page))); }

  // ---- 抽卡循环 ----
  await ws[0].page.click('#btn-start-game');
  await sleep(1500);
  for (let r = 1; r <= 8; r++) {
    await ws[0].page.click('#btn-pick-card');
    await sleep(2200);
    await ws[0].page.click('#btn-done');
    await sleep(2000);
    if (r % 4 === 0) log('round' + r + ' ' + el(), JSON.stringify(await snap(ws[0].page)));
    await addFakePlayers(ws[0].page, 6);
  }
  log('after-rounds ' + el(), JSON.stringify(await snap(ws[0].page)));
  await sleep(20000);
  log('after-settle ' + el(), JSON.stringify(await snap(ws[0].page)));
  await browser.close();
  log('done');
})();
