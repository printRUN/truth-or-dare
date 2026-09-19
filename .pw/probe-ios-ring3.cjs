// 定量探针：把「环」和「头像」谁在上面量出来
// 做法：同一个 active 头像，拍两张 —— 有 ::before（实际渲染） vs ::before{display:none}（头像真身）。
//       按像素比较圆内区域，差异占比 = 环盖住头像的面积比例。
// 对照：WebKit(Safari 引擎) vs Chromium。用法: node probe-ios-ring3.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8798;
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

async function run(engine, browserType, tag, extra) {
  const browser = await browserType.launch(extra?.launch || {});
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...(extra?.ctx || {}),
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(700);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2200);

  // 强制把一个头像置为 .active，且动画定住（避免两次截图相位不同）
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.evaluate(() => {
    const cards = [...document.querySelectorAll('#game-players-grid .player-card')];
    cards.forEach(c => { c.querySelector('.avatar-ring').classList.remove('active'); c.style.setProperty('--rs', '1'); });
    cards[0].querySelector('.avatar-ring').classList.add('active');
  });
  await A.waitForTimeout(500);

  const box = await A.evaluate(() => {
    const r = document.querySelector('#game-players-grid .player-card .avatar-ring').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const clip = { x: box.x, y: box.y, width: box.w, height: box.h };
  const withRing = decodePNG(await A.screenshot({ path: `shots/diff-${tag}-with.png`, clip }));
  await A.addStyleTag({ content: '.avatar-ring::before, .avatar-ring.active::before{display:none !important}' });
  await A.waitForTimeout(400);
  const noRing = decodePNG(await A.screenshot({ path: `shots/diff-${tag}-without.png`, clip }));

  // 圆内像素差异：以「无环」为真身，统计有环时被改写的比例
  const cx = withRing.w / 2, cy = withRing.h / 2, R = Math.min(withRing.w, withRing.h) / 2;
  let inside = 0, diff = 0, maxd = 0;
  for (let y = 0; y < withRing.h; y++) for (let x = 0; x < withRing.w; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
    inside++;
    const i = (y * withRing.w + x) * withRing.bpp;
    const d = Math.max(Math.abs(withRing.data[i] - noRing.data[i]), Math.abs(withRing.data[i + 1] - noRing.data[i + 1]), Math.abs(withRing.data[i + 2] - noRing.data[i + 2]));
    if (d > 24) diff++;
    if (d > maxd) maxd = d;
  }
  // 环应该只占最外圈 3px padding：按环宽算「合法覆盖环带」的像素数
  const pr = 3 * 3; // padding:3px @dpr3
  const ringBand = inside - Math.PI * (R - pr) ** 2;
  console.log(`[${tag}] 圆内 ${inside}px  被改写 ${diff}px (${(diff / inside * 100).toFixed(1)}%)  最大色差 ${maxd}  环带理论占比 ${(ringBand / inside * 100).toFixed(1)}%`);
  console.log(`        结论：${diff / inside < 0.12 ? '✅ 环只占外圈，头像没被盖' : '❌ 环压在头像上了'}`);
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit, 'webkit');
  await run('chromium', chromium, 'chromium', { launch: { args: ['--no-sandbox'] } });
  server.close();
})();
