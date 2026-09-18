// 终审临时探针：revealed 中直接结束/回大厅，#stage-actions 是否残留（跑完即删）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8833;
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
  await p.evaluate(() => document.getElementById('card-truth').click());
  await p.waitForFunction(() => !document.getElementById('card-section').hidden, null, { timeout: 25000 });
  const moved = await p.evaluate(() => {
    const sa = document.getElementById('stage-actions');
    return { saDisplay: sa.style.display, saChildren: [...sa.children].map(c => c.id || c.className) };
  });
  console.log('revealed moved:', JSON.stringify(moved));
  // 场景 A：revealed 中直接回大厅（armedTap 双击确认；工具行单行横滚 → evaluate click）
  await p.evaluate(() => document.getElementById('btn-end-game').click());
  await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('btn-end-game').click());
  await p.waitForTimeout(1800);
  const afterLobby = await p.evaluate(() => {
    const sa = document.getElementById('stage-actions');
    const r = sa.getBoundingClientRect();
    const ca = document.getElementById('card-actions');
    return {
      screen: document.querySelector('.screen.active').id,
      saDisplay: sa.style.display, saInBody: sa.parentElement === document.body,
      caParent: ca ? (ca.parentElement.id || ca.parentElement.className) : 'none',
      saRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      saVisible: getComputedStyle(sa).display !== 'none' && r.height > 0,
      hitAtSa: (() => { const el = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + 20, innerHeight - 1)); return el ? (el.id || el.className || el.tagName) : 'null'; })(),
    };
  });
  console.log('A 回大厅后:', JSON.stringify(afterLobby));
  await p.screenshot({ path: 'shots/tmp-review-leave-lobby.png' });
  // 场景 B：再开一局，残留是否被下一局的 bridgeSync 收走
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForSelector('#screen-game.active', { timeout: 20000 }).catch(() => console.log('B: game screen 未激活（开局失败）'));
  await p.waitForTimeout(800);
  const afterRejoin = await p.evaluate(() => {
    const sa = document.getElementById('stage-actions');
    const ca = document.getElementById('card-actions');
    return { saDisplay: sa.style.display, caParent: ca ? (ca.parentElement.id || ca.parentElement.className) : 'none', stage: S.turn.stage };
  });
  console.log('B 再开局后:', JSON.stringify(afterRejoin));
  await browser.close(); server.close();
})();
