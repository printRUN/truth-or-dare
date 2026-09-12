// 定位探针：WebKit 下把游戏屏的头像环「被盖住」逐项归因
// 变体矩阵：原样 / 去掉 .active / 停掉 ::before 动画 / 去掉 #cam perspective / 去掉 overflow-x:clip
// 用法: node probe-ios-ring2.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8797;
const URL = `http://127.0.0.1:${PORT}/index.html`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 极简 PNG 解码（8bit RGBA/RGB，非隔行）——只为了量像素 ──
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, bpp = 4;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const bd = data[8], ct = data[9];
      if (bd !== 8) throw new Error('bit depth ' + bd);
      bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error('color type ' + ct); })();
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const line = raw.slice(p, p + stride); p += stride;
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
const px = (img, x, y) => { const i = (y * img.w + x) * img.bpp; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

async function open(ctx, tag) {
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

// 在游戏屏里量「当前玩家(active)头像圆心」的像素 + 头像内层几何
async function measure(p, label, shot) {
  const g = await p.evaluate(() => {
    const grid = document.getElementById('game-players-grid');
    const card = grid.querySelector('.player-card.active') || grid.querySelector('.player-card');
    const inner = card.querySelector('.avatar-inner');
    const rb = card.querySelector('.avatar-ring').getBoundingClientRect();
    const ib = inner.getBoundingClientRect();
    return { pid: card.dataset.pid, name: card.querySelector('.player-name').textContent, active: card.classList.contains('active'),
      ring: [rb.left, rb.top, rb.width, rb.height], inner: [ib.left, ib.top, ib.width, ib.height] };
  });
  const dpr = 3;
  const cx = Math.round((g.inner[0] + g.inner[2] / 2) * dpr), cy = Math.round((g.inner[1] + g.inner[3] / 2) * dpr);
  const buf = await p.screenshot({ path: shot, clip: { x: g.inner[0] - 6, y: g.inner[1] - 6, width: g.inner[2] + 12, height: g.inner[3] + 12 } });
  const img = decodePNG(buf);
  const center = px(img, Math.round(img.w / 2), Math.round(img.h / 2));
  // 头像圆内 8 个方位采样，看「边缘是不是被环盖住」
  const ringSamples = [0.5, 0.72, 0.86].map(f => {
    const dx = Math.round(img.w / 2 * f), off = Math.round(img.h / 2 - img.h / 2 * f);
    return { top: hex(px(img, Math.round(img.w / 2), off)), left: hex(px(img, off, Math.round(img.h / 2))), right: hex(px(img, img.w - 1 - off, Math.round(img.h / 2))) };
  });
  console.log(`[${label}] 卡片=${g.name} active=${g.active} ring=${g.ring.map(Math.round)} inner=${g.inner.map(Math.round)}`);
  console.log(`        圆盘尺寸 ${img.w}x${img.h}@dpr${dpr}  中心像素=${hex(center)}  由外向内 top样本=${ringSamples.map(s => s.top).join(' ')}`);
  return { hex: hex(center), img };
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const A = await open(ctx, 'A');
  await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, 'B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(700);

  // 先量大厅（用户说正常）——把「正常」的像素基线拿到
  const lobby = await A.evaluate(() => {
    const card = document.querySelector('#players-grid .player-card');
    const ib = card.querySelector('.avatar-inner').getBoundingClientRect();
    return [ib.left, ib.top, ib.width, ib.height];
  });
  const lbuf = await A.screenshot({ clip: { x: lobby[0] - 6, y: lobby[1] - 6, width: lobby[2] + 12, height: lobby[3] + 12 } });
  const limg = decodePNG(lbuf);
  console.log(`[WebKit/大厅 baseline] 圆盘 ${limg.w}x${limg.h} 中心像素=${hex(px(limg, Math.round(limg.w / 2), Math.round(limg.h / 2)))}`);

  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(1800);

  await measure(A, '原样', 'shots/v-base.png');

  // 变体 1：去掉 .active
  await A.evaluate(() => document.querySelectorAll('#game-players-grid .avatar-ring.active').forEach(r => r.classList.remove('active')));
  await A.waitForTimeout(400);
  await measure(A, '去掉 .active', 'shots/v-noactive.png');

  // 变体 2：停掉 ::before 的旋转动画（同样保留 .active 的静态渐变）
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}.avatar-ring.active::before{animation:none !important}' });
  await A.waitForTimeout(400);
  await measure(A, '停 ::before 动画', 'shots/v-noanim.png');

  // 变体 3：去掉 #cam 的 perspective（3D 上下文消失）
  await A.addStyleTag({ content: '#cam{perspective:none !important}' });
  await A.waitForTimeout(500);
  await measure(A, '去 #cam perspective', 'shots/v-nopersp.png');

  // 变体 4：去掉 #cam 的 overflow-x:clip（WebKit 不支持 overflow-clip-margin）
  await A.addStyleTag({ content: '#cam{overflow:visible !important}' });
  await A.waitForTimeout(500);
  await measure(A, '再去 overflow-x:clip', 'shots/v-noclip.png');

  // 变体 5：全放开 —— #cam 彻底回到普通块
  await A.addStyleTag({ content: '#cam{perspective:none !important;overflow:visible !important}.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(600);
  await A.screenshot({ path: 'shots/v-clean-full.png' });
  await measure(A, '全放开(参考)', 'shots/v-clean.png');

  await browser.close();
  server.close();
})();
