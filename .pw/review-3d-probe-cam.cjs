// 终审临时探针：查 revealed 近景的 GL 相机由什么驱动（跑完即删）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8831;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '审');
  await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await p.evaluate(() => {
    mutate(s => s.players.push({ id: 'zz1', name: '伴', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
  });
  await p.click('#mode-pick .mode-opt[data-mode="free"]');
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 20000 });
  // 装 safeapply 计数器：包一层 Cam.apply 统计每 500ms 的调用次数与调用栈首帧
  await p.evaluate(() => {
    window.__cnt = { apply: 0, sync: 0, stack: '' };
    const orig = Cam.apply.bind(Cam);
    Cam.apply = function () { window.__cnt.apply++; if (!window.__cnt.stack) { try { throw new Error('t'); } catch (e) { window.__cnt.stack = String(e.stack).split('\n').slice(2, 4).join(' <- '); } } return orig(); };
    const th = window.__three;
    const sc = th.syncCam; // 不可达（闭包），改测 glCam 变化代替
  });
  // 等到 revealed
  await p.evaluate(() => document.getElementById('card-truth').click());
  await p.waitForFunction(() => !document.getElementById('card-section').hidden, null, { timeout: 25000 });
  await p.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(700);
    const s = await p.evaluate(() => {
      const c = window.__three.camera.position;
      return { apply: window.__cnt.apply, stack: window.__cnt.stack, gl: [c.x, c.y, c.z].map(v => +v.toFixed(2)), busy: Cam.busy, raf: Cam.raf, stage: S.turn.stage };
    });
    console.log('t+' + ((i + 1) * 700), JSON.stringify(s));
  }
  await browser.close(); server.close();
})();
