// 两个症状的对照取证（固定 clip，两引擎同参数）：
//   A) 大厅 vs 游戏屏的同一个头像（看"头像被环挡住/被裁"）
//   B) 牌桌背景 .table3d 区域（看"背景扭曲"）
// 用法: node probe-ios-ring12.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8808;
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
  await A.waitForTimeout(900);

  // ── A) 大厅里「阿泽」的头像环：固定 clip（用元素 rect）──
  const lobbyBox = await A.evaluate(() => {
    const r = document.querySelector('#players-grid .player-card .avatar-ring').getBoundingClientRect();
    return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 };
  });
  await A.screenshot({ path: `shots/q-${tag}-A-lobby.png`, clip: lobbyBox });

  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2600);
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(400);

  const gameBox = await A.evaluate(() => {
    const r = document.querySelector('#game-players-grid .player-card .avatar-ring').getBoundingClientRect();
    const out = { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 };
    const c = document.querySelector('#cam').getBoundingClientRect();
    const t = document.querySelector('.table3d').getBoundingClientRect();
    return { out, ring: [r.left, r.top, r.width, r.height], cam: [c.left, c.top, c.width, c.height], table: [t.left, t.top, t.width, t.height] };
  });
  console.log('  ring=', gameBox.ring.map(Math.round).join(','), ' #cam=', gameBox.cam.map(Math.round).join(','), '  .table3d=', gameBox.table.map(Math.round).join(','));
  await A.screenshot({ path: `shots/q-${tag}-A-game.png`, clip: gameBox.out });

  // ── B) 牌桌背景：拍 .table3d 的包围盒 ──
  await A.screenshot({ path: `shots/q-${tag}-B-table.png`, clip: { x: gameBox.cam[0], y: gameBox.cam[1], width: gameBox.cam[2], height: Math.min(gameBox.cam[3], 560) } });

  // ── B2) 关掉 overflow-x:clip 后同一块 ──
  await A.addStyleTag({ content: '#cam{overflow:visible !important}' });
  await A.waitForTimeout(400);
  await A.screenshot({ path: `shots/q-${tag}-B2-table-noclip.png`, clip: { x: gameBox.cam[0], y: gameBox.cam[1], width: gameBox.cam[2], height: Math.min(gameBox.cam[3], 560) } });

  // ── B3) 再去掉 perspective ──
  await A.addStyleTag({ content: '#cam{perspective:none !important}' });
  await A.waitForTimeout(400);
  await A.screenshot({ path: `shots/q-${tag}-B3-table-flat.png`, clip: { x: gameBox.cam[0], y: gameBox.cam[1], width: gameBox.cam[2], height: Math.min(gameBox.cam[3], 560) } });

  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
  const S = 'shots/';
  execFileSync('node', ['stack.cjs', S + 'q-A-contact.png', '4', '260',
    S + 'q-webkit-A-lobby.png', S + 'q-webkit-A-game.png', S + 'q-chromium-A-lobby.png', S + 'q-chromium-A-game.png'], { stdio: 'inherit' });
  execFileSync('node', ['stack.cjs', S + 'q-B-contact.png', '3', '300',
    S + 'q-webkit-B-table.png', S + 'q-webkit-B2-table-noclip.png', S + 'q-webkit-B3-table-flat.png'], { stdio: 'inherit' });
  execFileSync('node', ['stack.cjs', S + 'q-B-chromium-contact.png', '3', '300',
    S + 'q-chromium-B-table.png', S + 'q-chromium-B2-table-noclip.png', S + 'q-chromium-B3-table-flat.png'], { stdio: 'inherit' });
  console.log('\nA图: [webkit大厅 | webkit游戏 | chromium大厅 | chromium游戏] → shots/q-A-contact.png');
  console.log('B图: [原样 | 去overflow:clip | 再去perspective] → shots/q-B-contact.png (webkit), q-B-chromium-contact.png');
})();
