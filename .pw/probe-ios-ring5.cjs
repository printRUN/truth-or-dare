// 归因探针 v2：用「藏起 <img>」当基准，量 .avatar-inner 的圆裁切是否生效
// 判据：内层方框的四角（内切圆之外）——裁切生效时藏不藏 img 都一样(zero diff)；
//       裁切失效时藏掉 img 后四角会露回背景 => 有大片差异。
// 用法: node probe-ios-ring5.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8801;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

function decodePNG(buf) { // 与 crop.cjs 同款解码
  let off = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); const ct = data[9]; bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('ct ' + ct); })(); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
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
  await p.check('#chk-local'); await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

async function leak(p, sel, label, shot) {
  const snap = async () => {
    const b = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
    return decodePNG(await p.screenshot({ clip: { x: b.x, y: b.y, width: b.w, height: b.h } }));
  };
  const withImg = await snap();
  await p.addStyleTag({ content: `${sel} img{visibility:hidden !important}` });
  await p.waitForTimeout(220);
  const noImg = await snap();
  await p.addStyleTag({ content: `${sel} img{visibility:visible !important}` });
  await p.waitForTimeout(220);

  // 四角 22%×22% 区块（完全在内切圆外）；差异像素 = 头像漏到圆外
  const cw = Math.round(withImg.w * 0.22), ch = Math.round(withImg.h * 0.22);
  const corners = [[0, 0], [withImg.w - cw, 0], [0, withImg.h - ch], [withImg.w - cw, withImg.h - ch]];
  let tot = 0, diff = 0;
  for (const [ox, oy] of corners) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = ((oy + y) * withImg.w + (ox + x)) * withImg.bpp;
    tot++;
    const d = Math.max(Math.abs(withImg.data[i] - noImg.data[i]), Math.abs(withImg.data[i + 1] - noImg.data[i + 1]), Math.abs(withImg.data[i + 2] - noImg.data[i + 2]));
    if (d > 20) diff++;
  }
  // 顺带：整个方框内有多少像素受影响（裁切生效 ≈ 内切圆占比 78.5%，失效 ≈ 100%）
  let boxTot = 0, boxDiff = 0;
  for (let y = 0; y < withImg.h; y++) for (let x = 0; x < withImg.w; x++) {
    const i = (y * withImg.w + x) * withImg.bpp; boxTot++;
    const d = Math.max(Math.abs(withImg.data[i] - noImg.data[i]), Math.abs(withImg.data[i + 1] - noImg.data[i + 1]), Math.abs(withImg.data[i + 2] - noImg.data[i + 2]));
    if (d > 20) boxDiff++;
  }
  const pct = diff / tot * 100;
  console.log(`  ${label.padEnd(28)} 四角漏出 ${pct.toFixed(1)}%  整框受影响 ${(boxDiff / boxTot * 100).toFixed(1)}%  ${pct < 3 ? '✅ 圆裁切正常' : '❌ 头像漏成方块'}`);
  if (shot) { const b = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel); await p.screenshot({ path: shot, clip: { x: b.x - 8, y: b.y - 8, width: b.w + 16, height: b.h + 16 } }); }
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
  await leak(A, '#players-grid .player-card .avatar-inner', '大厅（基线）');

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
  await leak(A, S, '游戏屏（原样）', `shots/leak2-${tag}-base.png`);
  for (const [name, css] of [
    ['去 #app perspective', '#app{perspective:none !important}'],
    ['去 #cam perspective', '#cam{perspective:none !important}'],
    ['去 .world transform', '.world{transform:none !important;will-change:auto !important}'],
    ['去 player-card transform', '#game-players-grid .player-card{transform:none !important}'],
    ['去 .world will-change', '.world{will-change:auto !important}'],
    ['去全部 3D 因', '#app,#cam{perspective:none !important}.world{transform:none !important;will-change:auto !important}#game-players-grid .player-card{transform:none !important}'],
  ]) { await A.addStyleTag({ content: css }); await A.waitForTimeout(350); await leak(A, S, name); }
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
