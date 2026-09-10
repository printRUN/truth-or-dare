// 逐项隔离背景/装饰动效的真实开销（软件光栅 + DPR3 模拟弱手机）
// 用法: node probe-perf2.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8753;
const log = (...a) => console.log('[perf2]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

const frameStats = d => new Promise(res => {
  const gaps = []; const start = performance.now(); let last = start;
  const fin = () => {
    const g = gaps.slice(1);
    const avg = g.reduce((a, b) => a + b, 0) / (g.length || 1);
    const s = g.slice().sort((a, b) => a - b);
    res({ fps: +(1000 / avg).toFixed(1), p95ms: +(s[Math.max(0, Math.floor(s.length * 0.95) - 1)] || 0).toFixed(1) });
  };
  const step = t => { gaps.push(t - last); last = t; if (t - start >= d) fin(); else requestAnimationFrame(step); };
  requestAnimationFrame(step);
});

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-join.active', { timeout: 60000 });
  await sleep(500);
  await page.evaluate(() => closeGuide());
  await page.fill('#input-name', 'Bench');
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => closeGuide());

  const css = s => page.evaluate(t => {
    let el = document.getElementById('bench');
    if (!el) { el = document.createElement('style'); el.id = 'bench'; document.head.appendChild(el); }
    el.textContent = t;
  }, s);
  const fill = n => page.evaluate(cnt => {
    for (let i = 0; i < cnt; i++) {
      const id = 'zz' + Math.random().toString(36).slice(2, 8);
      mutate(s => s.players.push({ id, name: 'G' + i, avatar: '🐵', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
    }
  }, n);
  const run = async (label, style) => {
    await css(style || '');
    await sleep(700);
    const st = await page.evaluate(frameStats, 4000);
    log(label.padEnd(28), JSON.stringify(st), 'anims=' + await page.evaluate(() => document.getAnimations().length));
  };

  await run('大厅 1 人（基线）');
  await fill(15); await sleep(1200);
  await run('大厅 16 人');
  await run('16人 · 停头像环旋转', '.avatar-ring::before{animation:none !important}');
  await run('16人 · 停 backdrop', '.join-box,.btn-secondary,.toast,.modal-mask{backdrop-filter:none !important}');
  await run('16人 · 停纸屑', '.confetti{display:none !important}');
  await run('16人 · 光球去 blur', '.orb{filter:none !important}');
  await run('16人 · 光球停飘动', '.orb{animation:none !important}');
  await run('16人 · 全停（loperf）', '.orb,.confetti{display:none !important}.avatar-ring::before{animation:none !important}.join-box,.btn-secondary,.toast{backdrop-filter:none !important}');

  await css('');
  await page.click('#mode-pick .mode-opt[data-mode="free"]');
  await page.click('#btn-start');
  await page.waitForSelector('#screen-game.active', { timeout: 20000 });
  await sleep(1200);
  await run('牌桌 16 人（等抽卡）');
  await run('牌桌 · 光球去 blur', '.orb{filter:none !important}');
  await run('牌桌 · 停 choice/deck', '#choice-section.mine .choice-card,#choice-section.mine .choice-card::before,.deck-card::before,.card-back .draw-icon{animation:none !important}');
  await run('牌桌 · 停头像环', '.avatar-ring::before{animation:none !important}');
  await browser.close();
  server.close();
  log('done');
})();
