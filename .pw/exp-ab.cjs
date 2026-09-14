// A/B 决断实验：HEAD 基线版（无深度层）vs 当前版，同一进程交替测大厅+牌桌（不作为验收门禁）
// 目的：判定牌桌 p95 33.4 是「恢复文件引入的牌桌态成本」还是「机器漂移」。
// baseline-check.html 由 `git show HEAD:index.html` 只读导出，实验后删除。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8773;
const log = (...a) => console.log('[ab]', ...a);
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

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const run = async (label, file, screen) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-join.active', { timeout: 60000 });
    await sleep(400);
    await page.evaluate(() => closeGuide());
    await page.fill('#input-name', 'AB');
    await page.click('.avatar-option >> nth=0');
    await page.click('#btn-join');
    await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
    await sleep(800);
    await page.evaluate(() => closeGuide());
    await page.evaluate(() => {
      for (let i = 0; i < 15; i++) {
        const id = 'zz' + Math.random().toString(36).slice(2, 8);
        mutate(s => s.players.push({ id, name: 'G' + i, avatar: '🐵', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
      }
    });
    await sleep(1000);
    let r;
    if (screen === 'lobby') {
      r = await page.evaluate(frameStats, 3000);
    } else {
      await page.click('#mode-pick .mode-opt[data-mode="free"]');
      await page.click('#btn-start');
      await sleep(1000);
      r = await page.evaluate(frameStats, 4000);
    }
    log(label.padEnd(14), JSON.stringify(r));
    await ctx.close();
    return r;
  };
  await run('HEAD 大厅', 'baseline-check.html', 'lobby');
  await run('HEAD 牌桌#1', 'baseline-check.html', 'table');
  await run('当前 牌桌#1', 'index.html', 'table');
  await run('HEAD 牌桌#2', 'baseline-check.html', 'table');
  await run('当前 大厅', 'index.html', 'lobby');
  await browser.close();
  server.close();
})();
