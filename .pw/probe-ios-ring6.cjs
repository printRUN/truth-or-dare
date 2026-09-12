// 直接取证：按元素实际 rect 截图（不猜坐标），印出关键点 RGB，并放大存档
// 关键点：内层方框四角（圆内切之外）/ 圆心 / 环带 / 圆外一点
// 用法: node probe-ios-ring6.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8802;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

function decodePNG(buf) {
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
const px = (im, x, y) => { const i = (Math.min(im.h - 1, Math.max(0, y)) * im.w + Math.min(im.w - 1, Math.max(0, x))) * im.bpp; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

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

async function shot(p, sel, label, file) {
  const info = await p.evaluate(s => {
    const inner = document.querySelector(s);
    const ring = inner.closest('.avatar-ring') || inner;
    const ir = inner.getBoundingClientRect(), rr = ring.getBoundingClientRect();
    const img = inner.querySelector('img');
    return { ir: [ir.left, ir.top, ir.width, ir.height], rr: [rr.left, rr.top, rr.width, rr.height],
      imgTag: img ? 'img' : (inner.firstElementChild ? inner.firstElementChild.tagName : 'EMPTY'),
      imgCSS: img ? { br: getComputedStyle(img).borderRadius, w: getComputedStyle(img).width } : null,
      innerCSS: { br: getComputedStyle(inner).borderRadius, ovf: getComputedStyle(inner).overflow, iso: getComputedStyle(inner).isolation } };
  }, sel);
  const pad = 10;
  const clip = { x: info.rr[0] - pad, y: info.rr[1] - pad, width: info.rr[2] + pad * 2, height: info.rr[3] + pad * 2 };
  const im = decodePNG(await p.screenshot({ clip }));
  // 内层方框在裁剪图中的位置
  const ox = Math.round(info.ir[0] - clip.x), oy = Math.round(info.ir[1] - clip.y), iw = Math.round(info.ir[2]), ih = Math.round(info.ir[3]);
  const corner = Math.round(iw * 0.10);
  const r = iw / 2;
  const diagOut = Math.round(r * 1.14);   // 圆外一点点（仍在方框内）
  console.log(`\n[${label}] 内层 ${iw}x${ih}  avatar元素=${info.imgTag}  img=${JSON.stringify(info.imgCSS)}`);
  console.log(`  inner border-radius=${info.innerCSS.br} overflow=${info.innerCSS.ovf}`);
  console.log(`  圆心         ${hex(px(im, ox + r, oy + r))}`);
  console.log(`  左上角(10%)  ${hex(px(im, ox + corner, oy + corner))}   右上角 ${hex(px(im, ox + iw - corner, oy + corner))}`);
  console.log(`  左下角       ${hex(px(im, ox + corner, oy + ih - corner))}   右下角 ${hex(px(im, ox + iw - corner, oy + ih - corner))}`);
  console.log(`  对角圆外(1.14r) ${hex(px(im, ox + r + diagOut * 0.707, oy + r + diagOut * 0.707))}`);
  console.log(`  → 四角若与「圆外」同色=裁切生效；若是亮肤色/白=头像漏出`);
  await p.screenshot({ path: file, clip });
  execFileSync('node', ['crop.cjs', file, file.replace('.png', '-zoom.png'), '0', '0', String(im.w), String(im.h), '2'], { stdio: 'ignore' });
}

async function run(tag, browserType, launchOpts) {
  console.log(`\n############ ${tag} ############`);
  const browser = await browserType.launch(launchOpts || {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(900);
  await shot(A, '#players-grid .player-card .avatar-inner', `${tag}/大厅`, `shots/e-${tag}-lobby.png`);
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(700);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2000);
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(400);
  await shot(A, '#game-players-grid .player-card .avatar-inner', `${tag}/游戏屏`, `shots/e-${tag}-game.png`);
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
