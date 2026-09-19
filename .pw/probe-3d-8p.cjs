// 8 人局复验（玩家价值专家条件）：chars 齐建 + 选卡/揭晓构图截图
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8829;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '测八');
  await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await p.evaluate(() => {
    const names = ['小雨', '阿豪', '婷婷', '大飞', '圆圆', '老白', '阿珍'];
    names.forEach((n, i) => mutate(s => s.players.push({ id: 'zz' + i, name: n, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
  });
  await p.click('#mode-pick .mode-opt[data-mode="free"]');
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 20000 });
  await p.waitForTimeout(4500);
  const st1 = await p.evaluate(() => ({ chars: window.__three.chars.size, players: S.players.length, stage: S.turn.stage }));
  console.log('[8p-choosing]', JSON.stringify(st1));
  await p.screenshot({ path: 'shots/3d-8p-choosing.png' });
  // 推进到 revealed（谁先选都行：free 模式本机直接选）
  await p.evaluate(() => document.getElementById('card-dare').click());
  await p.waitForFunction(() => !document.getElementById('card-section').hidden, null, { timeout: 25000 });
  await p.waitForTimeout(4200);
  const st2 = await p.evaluate(() => ({ chars: window.__three.chars.size, stage: S.turn.stage }));
  console.log('[8p-revealed]', JSON.stringify(st2));
  await p.screenshot({ path: 'shots/3d-8p-revealed.png' });
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors ✅');
  await browser.close(); server.close();
})();
