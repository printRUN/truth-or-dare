// 关键校验：同一个页面状态下，比较三条截图路径是否自洽
//   (a) page.screenshot(全视口) 再按 rect 裁 → 用户在真机上看到的合成结果
//   (b) locator('.player-card').screenshot()
//   (c) locator('.avatar-ring').screenshot()
// 若 (a) 与 (b)(c) 不一致 => 之前"复现"到的方块很可能只是 Playwright-WebKit 视口截图的合成差异
// 用法: node probe-ios-ring10.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8806;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

async function open(ctx) {
  const p = await ctx.newPage();
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 25000 });
  await p.waitForTimeout(300);
  return p;
}
async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local'); await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

async function run(tag, browserType, launchOpts) {
  console.log(`\n#### ${tag} ####`);
  const browser = await browserType.launch(launchOpts || {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(800);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2500);

  // 冻结环动画，避免三条路径因相位不同而"看起来"不一样
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(400);

  const geom = await A.evaluate(() => {
    const card = document.querySelector('#game-players-grid .player-card');
    const ring = card.querySelector('.avatar-ring');
    const inner = card.querySelector('.avatar-inner');
    const r = ring.getBoundingClientRect(), i = inner.getBoundingClientRect();
    return { ring: [r.left, r.top, r.width, r.height], inner: [i.left, i.top, i.width, i.height],
      dpr: window.devicePixelRatio, vv: [window.innerWidth, window.innerHeight],
      rs: getComputedStyle(card).getPropertyValue('--rs'), custom: !!card.querySelector('.avatar-inner img')?.getAttribute('src')?.startsWith('data:image/svg') };
  });
  console.log('  dpr=', geom.dpr, 'viewport=', geom.vv.join('x'), '--rs=', geom.rs.trim(), 'ring=', geom.ring.map(Math.round).join(','), 'inner=', geom.inner.map(Math.round).join(','));
  const d = geom.dpr;
  const [rx, ry, rw, rh] = geom.ring;
  const clipRing = { x: rx, y: ry, width: rw, height: rh };

  // (a) 全视口截图后裁剪
  const full = await A.screenshot({ path: `shots/p-${tag}-full.png` });
  fs.writeFileSync(`shots/_tmp-full-${tag}.png`, full);
  execFileSync('node', ['crop.cjs', `shots/_tmp-full-${tag}.png`, `shots/p-${tag}-a-viewportcrop.png`,
    String(Math.round(rx * d)), String(Math.round(ry * d)), String(Math.round(rw * d)), String(Math.round(rh * d)), '3'], { stdio: 'inherit' });

  // (b) 卡片元素截图  (c) 环元素截图
  await A.locator('#game-players-grid .player-card').first().screenshot({ path: `shots/p-${tag}-b-card.png` });
  await A.locator('#game-players-grid .player-card').first().locator('.avatar-ring').screenshot({ path: `shots/p-${tag}-c-ring.png` });

  // (d) 用 clip 参数直接截同一块
  await A.screenshot({ path: `shots/p-${tag}-d-clip.png`, clip: clipRing });

  // (e) 关掉 GPU/合成：--disable-gpu 已在 chromium 试；这里再试一次「把卡片从 3D 里摘出来」的重截
  await A.addStyleTag({ content: '#game-players-grid .player-card .avatar-ring{filter:none}.player-card{contain:none}' });
  await A.waitForTimeout(300);
  await A.screenshot({ path: `shots/p-${tag}-e-after.png`, clip: clipRing });
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();

  for (const tag of ['webkit', 'chromium']) {
    execFileSync('node', ['stack.cjs', `shots/p-${tag}-contact.png`, '4', '220',
      `shots/p-${tag}-a-viewportcrop.png`, `shots/p-${tag}-b-card.png`, `shots/p-${tag}-c-ring.png`, `shots/p-${tag}-d-clip.png`], { stdio: 'inherit' });
    console.log(`${tag}: [a全视口裁 | b卡片元素 | c环元素 | d clip参数] → shots/p-${tag}-contact.png`);
  }
})();
