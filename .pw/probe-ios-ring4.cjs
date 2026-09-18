// 归因探针：WebKit 下 .avatar-inner 的 border-radius+overflow:hidden 圆形裁切失效（头像画成方块）
// 度量：头像内层方框的「四角」——圆裁切生效时那里应是透明(露出背景)，失效时是头像像素。
//       统计四角区域里「非透明/亮色」像素占比 = 漏出比例。逐个 CSS 开关做变体。
// 用法: node probe-ios-ring4.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8799;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bpp = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); const ct = data[9]; bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('ct ' + ct); })(); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = ft === 0 ? v : ft === 1 ? (v + a) & 255 : ft === 2 ? (v + b) & 255
        : ft === 3 ? (v + ((a + b) >> 1)) & 255
        : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; })();
    }
  }
  return { w, h, bpp, data: out };
}

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
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 在给定选择器对应的头像上量「四角漏出」
async function leak(p, sel, label, shot) {
  const box = await p.evaluate((sel) => {
    const inner = document.querySelector(sel);
    const r = inner.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);
  const clip = { x: box.x, y: box.y, width: box.w, height: box.h };
  const buf = await p.screenshot(shot ? { path: shot, clip } : { clip });
  const img = decodePNG(buf);
  // 四角各取 28%x28% 的方块（完全落在内切圆之外）
  const cw = Math.round(img.w * 0.28), ch = Math.round(img.h * 0.28);
  const corners = [[0, 0], [img.w - cw, 0], [0, img.h - ch], [img.w - cw, img.h - ch]];
  let tot = 0, bright = 0;
  for (const [ox, oy] of corners) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = ((oy + y) * img.w + (ox + x)) * img.bpp;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    tot++; if (r + g + b > 240) bright++;   // 背景是深蓝(<120)，头像/浅色是亮色
  }
  const pct = bright / tot * 100;
  console.log(`  ${label.padEnd(30)} 四角漏出 ${pct.toFixed(1)}%  ${pct < 3 ? '✅ 圆裁切正常' : '❌ 头像漏成方块'}`);
  return pct;
}

async function run(tag, browserType, launchOpts) {
  console.log(`\n===== ${tag} =====`);
  const browser = await browserType.launch(launchOpts || {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(900);
  await leak(A, '#players-grid .player-card .avatar-inner', '大厅（基线）', `shots/leak-${tag}-lobby.png`);

  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(700);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2000);
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(300);

  const S = '#game-players-grid .player-card .avatar-inner';
  await leak(A, S, '游戏屏（原样）', `shots/leak-${tag}-base.png`);

  const variants = [
    ['去掉 .world will-change', '.world{will-change:auto !important}'],
    ['去掉 #cam perspective', '#cam{perspective:none !important}'],
    ['去掉 #cam overflow-x:clip', '#cam{overflow:visible !important}'],
    ['去掉 player-card transform', '#game-players-grid .player-card{transform:none !important}'],
    ['去掉 .world 全部 transform', '.world{transform:none !important;will-change:auto !important}'],
    ['去掉 #app perspective', '#app{perspective:none !important}'],
    ['perspective+transform 都去掉', '#app,#cam{perspective:none !important}.world{transform:none !important;will-change:auto !important}#game-players-grid .player-card{transform:none !important}'],
  ];
  for (const [name, css] of variants) {
    await A.addStyleTag({ content: css });
    await A.waitForTimeout(350);
    await leak(A, S, name, `shots/leak-${tag}-${name.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '_')}.png`);
  }
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
