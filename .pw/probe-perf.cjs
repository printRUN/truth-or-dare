// 性能取证：DOM 节点 / 运行中动画 / JS 堆 是否随时间单调增长（模拟一整晚派对）
// 用法: node probe-perf.cjs [workers]
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8751;
const W = +(process.argv[2] || 1);
const ROOM = 'P' + Math.random().toString(36).slice(2, 6).toUpperCase() + 'X';   // 随机房间号，避开公共 broker 上的残留 retained
const log = (...a) => console.log('[perf]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve(port, host) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    });
    s.listen(port, host, () => resolve(s));
  });
}

const URL = `http://127.0.0.1:${PORT}/index.html`;

async function newWorker(browser, tag, i, room) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', tag, String(e).slice(0, 200)));
  await page.goto(URL + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-join.active', { timeout: 60000 });
  await sleep(400);
  await page.evaluate(() => closeGuide());
  await page.fill('#input-name', tag);
  await page.click('.avatar-option >> nth=' + (i % 12));
  await page.click('#btn-join');
  try {
    await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  } catch (e) {
    log('JOIN FAIL', tag, JSON.stringify(await page.evaluate(() => ({
      toast: (document.getElementById('toast') || {}).textContent,
      loading: (document.getElementById('loading-text') || {}).textContent,
      net: (document.getElementById('net-text') || {}).textContent,
      join: !!document.querySelector('#screen-join.active'),
      hidden: document.getElementById('screen-lobby') ? document.getElementById('screen-lobby').className : 'no-el',
    }))));
    throw e;
  }
  await sleep(1000);
  await page.evaluate(() => {
    closeGuide();
    // 统计 render 调用次数与每轮 DOM 规模
    window.__rc = 0; window.__pc = 0;
    const rg = window.renderGame; if (typeof rg === 'function') window.renderGame = function (...a) { window.__rc++; return rg.apply(this, a); };
    const rp = window.renderPlayers; if (typeof rp === 'function') window.renderPlayers = function (...a) { window.__pc++; return rp.apply(this, a); };
  });
  return { ctx, page };
}

const snap = page => page.evaluate(() => ({
  nodes: document.getElementsByTagName('*').length,
  confo: document.querySelectorAll('#bg-canvas .confetti').length,
  burst: document.querySelectorAll('.burst-particle').length,
  toasts: document.querySelectorAll('.toast').length,
  anims: document.getAnimations().length,
  heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
  players: S ? S.players.length : -1,
  recent: S && S.recent ? S.recent.truth.length + S.recent.dare.length : -1,
  renderGame: window.__rc, renderPlayers: window.__pc,
  loperf: document.body.classList.contains('loperf') ? 1 : 0,
}));

// CDP 指标：样式重算/布局/脚本执行耗时是“发热”的直接来源
async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const g = k => { const e = m.find(x => x.name === k); return e ? e.value : 0; };
  return {
    listeners: g('JSEventListeners'), nodes: g('Nodes'),
    recalc: g('RecalcStyleCount'), recalcMs: +g('RecalcStyleDuration').toFixed(1) * 1000 | 0,
    layout: g('LayoutCount'), scriptMs: Math.round(g('ScriptDuration') * 1000),
    taskMs: Math.round(g('TaskDuration') * 1000), heap: Math.round(g('JSHeapUsedSize') / 1048576 * 10) / 10,
  };
}

// 在页面内采样一段时间的真实帧率（掉帧 = CPU 被动画吃满）
function fpsMeter(page, ms) {
  return page.evaluate(d => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const step = () => { n++; if (performance.now() - t0 < d) requestAnimationFrame(step); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(step);
  }), ms);
}

async function churn(page, n) {
  // 模拟房间成员频繁加入/掉线 + 题库轮转
  await page.evaluate(cnt => {
    for (let i = 0; i < cnt; i++) {
      const id = 'zz' + Math.random().toString(36).slice(2, 8);
      mutate(s => {
        s.players.push({
          id, name: 'Ghost' + Math.floor(Math.random() * 9999), avatar: '🐵', isHost: false, ready: true,
          micOn: false, online: true, streak: 0, skipUsed: false, passes: 3, score: 0, draws: 0, truth: 0, dare: 0, skips: 0,
          lastSeen: Date.now(), joinedAt: Date.now(),
        });
        for (let j = 0; j < 20; j++) s.recent.truth.push('t' + Math.random());
        for (let j = 0; j < 20; j++) s.recent.dare.push('d' + Math.random());
      });
    }
  }, n);
}

(async () => {
  const server = await serve(PORT, '127.0.0.1');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let cdp = null, prev = null;
  const ws = [];
  ws.push(await newWorker(browser, 'P0', 0));            // 第一个 worker 新建房间
  cdp = await ws[0].ctx.newCDPSession(ws[0].page);
  await cdp.send('Performance.enable');
  prev = await metrics(cdp);
  const ROOM2 = await ws[0].page.evaluate(() => S.room);
  log('room created:', ROOM2);
  for (let i = 1; i < W; i++) ws.push(await newWorker(browser, 'P' + i, i, ROOM2));
  const p = ws[0].page;
  log('workers ready');
  log('t0      ', JSON.stringify(await snap(p)));
  const report = async label => {
    const now = await metrics(cdp);
    const d = {
      recalc: now.recalc - prev.recalc, layout: now.layout - prev.layout,
      scriptMs: now.scriptMs - prev.scriptMs, taskMs: now.taskMs - prev.taskMs,
      listeners: now.listeners, nodes: now.nodesCdp !== undefined ? now.nodesCdp : now.nodes, heapMB: now.heap,
    };
    prev = now;
    log(label, JSON.stringify(d), 'fps=' + await fpsMeter(p, 2000), JSON.stringify(await snap(p)));
  };

  // ── 空跑 60s：只有背景动画 + 心跳（真实挂机等人）
  for (let i = 1; i <= 6; i++) { await sleep(10000); await report('idle' + i * 10 + 's '); }

  // 拉人进房（开局至少 2 人）
  await churn(p, 3);
  await sleep(1500);

  // ── 开局 + 连续抽卡（每次揭晓都有 35 粒子 burst + 3D 翻牌）
  await p.click('#mode-pick .mode-opt[data-mode="free"]');
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 20000 });
  for (let r = 1; r <= 10; r++) {
    try {
      await p.waitForSelector('#choice-section:not([hidden]) >> #card-truth:not(.disabled)', { timeout: 8000 });
      await p.click('#card-truth');
      await p.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
      await sleep(2200);
      if (await p.locator('#btn-accept').isVisible()) await p.click('#btn-accept');
      await sleep(1200);
    } catch (e) { log('round' + r + ' skip:', String(e).slice(0, 80)); }
    await churn(p, 4);
    if (r % 3 === 0 || r === 10) await report('round' + r + '  ');
  }
  await sleep(25000);
  await report('settle');
  await browser.close();
  server.close();
  log('done');
})();
