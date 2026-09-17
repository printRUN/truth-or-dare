// 快速诊断：揭晓画面中部半透明暗面板是什么 DOM 元素 + 题面卡最终落幅
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8833;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const log = (...a) => console.log('[fl-panel]', ...a);
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
  const q = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('P:' + e.message));
  q.on('pageerror', e => errs.push('Q:' + e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary'); await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  await q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await q.fill('#input-name', '小雨');
  await q.click('details.adv summary'); await q.click('#chk-local');
  await q.fill('#input-room', room);
  await q.click('.avatar-option >> nth=1'); await q.click('#btn-join');
  await p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await q.waitForTimeout(800);
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForTimeout(2200);
  // 谁是 chooser 谁选
  const mine = await p.evaluate(() => S.turn.chooserId === myId);
  const C = mine ? p : q;
  await C.evaluate(() => document.getElementById('card-dare').click());
  await p.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
  await p.waitForFunction(() => document.getElementById('flip-card').classList.contains('flipped'), null, { timeout: 12000 });
  await p.waitForTimeout(4500);   // 等推镜完全落幅 + 打字机完成
  const info = await p.evaluate(() => {
    const out = { stack: [], panels: [], plates: [], cam: null, reveal: null };
    const els = document.elementsFromPoint(720, 330);
    for (const el of els.slice(0, 12)) {
      const cs = getComputedStyle(el);
      out.stack.push({ id: el.id, cls: String(el.className).slice(0, 40), bg: cs.backgroundColor, bgi: cs.backgroundImage.slice(0,40), bf: cs.backdropFilter, op: cs.opacity, disp: cs.display, rect: (r => [r.left, r.top, r.width, r.height].map(Math.round))(el.getBoundingClientRect()) });
    }
    // 找全屏内所有带非透明背景的可见块
    document.querySelectorAll('#screen-game *, body > :not(script)').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 100 || r.width > 1300) return;
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && (!cs.backgroundImage || cs.backgroundImage === 'none')) return;
      if (r.top < 150 || r.top > 600) return;
      out.panels.push({ id: el.id, cls: String(el.className).slice(0, 40), bg: cs.backgroundColor + '/' + cs.backgroundImage.slice(0, 60), rect: [r.left, r.top, r.width, r.height].map(Math.round), z: cs.zIndex });
    });
    document.querySelectorAll('#game-players-grid .player-card').forEach(c => {
      const r = c.getBoundingClientRect();
      out.plates.push({ pid: c.dataset.pid, name: (c.textContent || '').slice(0, 30), vis: c.style.visibility || '', rect: [r.left, r.top, r.width, r.height].map(Math.round) });
    });
    const th = window.__three;
    if (th) { const c = th.camera.position; out.cam = [c.x, c.y, c.z].map(v => +v.toFixed(2)); }
    out.reveal = { punish: document.getElementById('punishment-text').textContent, info: document.getElementById('turn-info').textContent };
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await p.screenshot({ path: path.join(SHOTS, 'fl-panel-revealed.png') });
  log('errs:', errs.join('|') || 'none');
  await browser.close(); server.close();
})();
