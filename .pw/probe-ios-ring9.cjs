// A/B 矩阵：WebKit 下逐个 CSS 开关，拍同一个头像环，最后拼成对比图
// 用法: node probe-ios-ring9.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8805;
const URL = `http://127.0.0.1:${PORT}/index.html`;
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

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(800);

  const shotRing = async (f) => {
    // 固定冻住环动画，保证各变体相位一致、可比
    await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
    await A.waitForTimeout(320);
    await A.locator('#game-players-grid .player-card').first().locator('.avatar-ring').screenshot({ path: f });
  };

  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2500);
  await A.locator('#game-players-grid .player-card').first().locator('.avatar-ring').screenshot({ path: 'shots/ab-0-base.png' });

  const variants = [
    ['1-no-cam-perspective', '#cam{perspective:none !important}'],
    ['2-no-app-perspective', '#app{perspective:none !important}'],
    ['3-no-world-transform', '.world{transform:none !important;will-change:auto !important}'],
    ['4-no-card-transform', '#game-players-grid .player-card{transform:none !important}'],
    ['5-no-cam-overflow', '#cam{overflow:visible !important}'],
    ['6-no-3d-all', '#app,#cam{perspective:none !important}.world{transform:none !important;will-change:auto !important}#game-players-grid .player-card{transform:none !important}'],
    ['7-backface-off', '.player-card,.avatar-ring,.avatar-inner,.avatar-ring::before{backface-visibility:visible !important;transform-style:flat !important}'],
  ];
  for (const [name, css] of variants) {
    await A.addStyleTag({ content: css });
    await A.waitForTimeout(400);
    await shotRing(`shots/ab-${name}.png`);
  }
  await browser.close();
  server.close();

  const files = ['ab-0-base.png', ...variants.map(v => `ab-${v[0]}.png`)].map(f => `shots/${f}`);
  execFileSync('node', ['stack.cjs', 'shots/ab-contact.png', '4', '200', ...files], { stdio: 'inherit' });
  console.log('顺序（左上→右下）: 0原样 | 1去#cam perspective | 2去#app perspective | 3去.world transform | 4去卡片transform | 5去#cam overflow | 6去全部3D | 7平面化backface');
})();
