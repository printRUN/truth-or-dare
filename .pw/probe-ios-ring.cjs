// 探针：iOS/Safari（Playwright WebKit）下大厅 vs 游戏屏的头像环 / 牌桌背景渲染
// 用法: node probe-ios-ring.cjs   （from .pw/；静态服务器端口 8796）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8796;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const errors = [];

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide');
  }, null, { timeout: 25000 });
  await p.waitForTimeout(300);
  return p;
}

async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 逐元素把「谁画在头像上」量出来：对头像圆心做 elementFromPoint，再读环/内层/inner 的计算样式
async function probeRing(p, scope, label) {
  const out = await p.evaluate((scope) => {
    const grid = document.getElementById(scope === 'lobby' ? 'players-grid' : 'game-players-grid');
    const card = grid.querySelector('.player-card');
    const ring = card.querySelector('.avatar-ring');
    const inner = card.querySelector('.avatar-inner');
    const img = inner.querySelector('img');
    const rb = ring.getBoundingClientRect();
    const ib = inner.getBoundingClientRect();
    const cx = ib.left + ib.width / 2, cy = ib.top + ib.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const cs = el => { const c = getComputedStyle(el); return { z: c.zIndex, pos: c.position, tr: c.transform, ovf: c.overflow, mix: c.mixBlendMode, op: c.opacity }; };
    const before = getComputedStyle(ring, '::before');
    return {
      ring: { x: Math.round(rb.left), y: Math.round(rb.top), w: Math.round(rb.width), h: Math.round(rb.height) },
      inner: { x: Math.round(ib.left), y: Math.round(ib.top), w: Math.round(ib.width), h: Math.round(ib.height) },
      ringCS: cs(ring), innerCS: cs(inner), imgCS: img ? cs(img) : null,
      beforeCS: { z: before.zIndex, pos: before.position, bg: before.backgroundImage.slice(0, 60), anim: before.animationName },
      hitAtAvatarCenter: hit ? (hit.tagName + '.' + hit.className + (hit.id ? '#' + hit.id : '')) : null,
      hitIsInsideInner: !!(hit && inner.contains(hit)),
      camPersp: grid.closest('#cam') ? getComputedStyle(grid.closest('#cam')).perspective : '(no #cam)',
      camOvf: grid.closest('#cam') ? getComputedStyle(grid.closest('#cam')).overflow : '-',
      camClipMargin: grid.closest('#cam') ? getComputedStyle(grid.closest('#cam')).overflowClipMargin : '-',
      loperf: document.body.classList.contains('loperf'),
    };
  }, scope);
  console.log(`\n[${label}]`);
  console.log('  ring rect  ', JSON.stringify(out.ring), ' inner rect', JSON.stringify(out.inner));
  console.log('  ring cs    ', JSON.stringify(out.ringCS));
  console.log('  inner cs   ', JSON.stringify(out.innerCS));
  console.log('  ::before   ', JSON.stringify(out.beforeCS));
  console.log('  hit@center ', out.hitAtAvatarCenter, '| 落在头像内层 =', out.hitIsInsideInner);
  console.log('  #cam       persp=' + out.camPersp, 'overflow=' + out.camOvf, 'clip-margin=' + out.camClipMargin, '| loperf=' + out.loperf);
  return out;
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  // iPhone 13 逻辑分辨率；WebKit = Safari 引擎
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const A = await open(ctx, 'A');
  await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(900);
  await A.screenshot({ path: 'shots/ios-lobby.png' });
  await probeRing(A, 'lobby', 'WebKit / 大厅（用户说这里正常）');

  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, 'B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForSelector('#game-players-grid, #players-grid .player-card >> nth=1', { timeout: 30000 });
  await A.waitForTimeout(700);

  // 开局 → 游戏屏
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(1800);
  await A.screenshot({ path: 'shots/ios-game.png' });
  await probeRing(A, 'game', 'WebKit / 游戏屏（用户说这里坏）');

  // 局部放大截图：直接看头像那一块
  const card = A.locator('#game-players-grid .player-card').first();
  await card.screenshot({ path: 'shots/ios-game-card.png' }).catch(e => console.log('  (卡片截图失败:', e.message, ')'));
  await A.locator('#cam').screenshot({ path: 'shots/ios-game-cam.png' }).catch(e => console.log('  (#cam 截图失败:', e.message, ')'));

  console.log('\n=== 同一份 HTML 在 Chromium 下的对照（桌面视口）===');
  const browser2 = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const C = await open(ctx2, 'C');
  await join(C, '阿泽');
  await C.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await C.waitForTimeout(600);
  const room2 = (await C.textContent('#share-room')).trim();
  const D = await open(ctx2, 'D');
  await join(D, '小雨', room2);
  await D.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await C.waitForTimeout(700);
  await C.click('#btn-start');
  await C.waitForSelector('#screen-game.active', { timeout: 20000 });
  await C.waitForTimeout(1500);
  await C.screenshot({ path: 'shots/chrome-game.png' });
  await probeRing(C, 'game', 'Chromium / 游戏屏（对照）');
  await browser2.close();

  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n零 JS 报错 ✅');
  await browser.close();
  server.close();
})();
