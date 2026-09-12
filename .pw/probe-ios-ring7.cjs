// 直接取证 v2：用 locator.screenshot() 拍 .avatar-ring 元素本身（Playwright 负责坐标），
// 再按已知几何（ring padding:3px @dpr3 => 内层内缩 9 设备像素）采样关键点。
// 用法: node probe-ios-ring7.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8803;
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
const px = (im, x, y) => {
  x = Math.round(x); y = Math.round(y);
  if (!(x >= 0 && y >= 0 && x < im.w && y < im.h)) return null;
  const i = (y * im.w + x) * im.bpp;
  return [im.data[i], im.data[i + 1], im.data[i + 2]];
};
const hex = c => c ? '#' + c.map(v => v.toString(16).padStart(2, '0')).join('') : '(越界)';

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

async function exam(p, ringSel, label, file) {
  const ring = p.locator(ringSel).first();
  const meta = await p.evaluate(s => {
    const el = document.querySelector(s);
    const inner = el.querySelector('.avatar-inner');
    const img = inner.querySelector('img');
    const cs = getComputedStyle(inner);
    return { hasImg: !!img, imgSrc: img ? img.getAttribute('src').slice(0, 30) : null,
      innerBR: cs.borderRadius, innerOvf: cs.overflow, innerBG: cs.backgroundColor,
      firstChild: inner.firstElementChild ? inner.firstElementChild.tagName : 'EMPTY',
      transformedAncestors: (() => { const out = []; let n = el; while (n && n !== document.body) { const c = getComputedStyle(n); if (c.transform !== 'none' || c.perspective !== 'none' || c.filter !== 'none' || c.willChange !== 'auto' || c.contain !== 'none') out.push(`${n.tagName}${n.id ? '#' + n.id : '.' + (n.className || '').split(' ')[0]} [${c.transform !== 'none' ? 'transform ' : ''}${c.perspective !== 'none' ? 'perspective ' : ''}${c.filter !== 'none' ? 'filter ' : ''}${c.willChange !== 'auto' ? 'will-change:' + c.willChange + ' ' : ''}]`); n = n.parentElement; } return out; })(),
    };
  }, ringSel);
  const buf = await ring.screenshot({ path: file });
  const im = decodePNG(buf);
  const dpr = im.w / 70;                 // ring 宽 70 CSS px（窄屏 56）
  const inset = Math.round(3 * dpr);     // padding:3px
  const x0 = inset, y0 = inset, w = im.w - inset * 2, h = im.h - inset * 2;
  const r = w / 2, cx = x0 + r, cy = y0 + r;
  const c15 = Math.round(w * 0.15), c10 = Math.round(w * 0.10);
  const dOut = r * 1.10;
  console.log(`\n[${label}] ring ${im.w}x${im.h}(dpr${dpr.toFixed(1)})  内层 ${w}x${h}  img=${meta.hasImg}(${meta.firstChild})  border-radius=${meta.innerBR} overflow=${meta.innerOvf} bg=${meta.innerBG}`);
  console.log(`  圆心            ${hex(px(im, cx, cy))}`);
  console.log(`  内层左上角10%   ${hex(px(im, x0 + c10, y0 + c10))}      右上角 ${hex(px(im, x0 + w - c10, y0 + c10))}`);
  console.log(`  内层左下角      ${hex(px(im, x0 + c10, y0 + h - c10))}      右下角 ${hex(px(im, x0 + w - c10, y0 + h - c10))}`);
  console.log(`  对角圆外1.10r   ${hex(px(im, cx + dOut * 0.707, cy + dOut * 0.707))}   正交圆外 ${hex(px(im, cx + r * 0.98, y0 + 2))}（环带上方）`);
  console.log(`  内层15%对角     ${hex(px(im, x0 + c15, y0 + c15))}`);
  console.log(`  影响渲染的祖先: ${meta.transformedAncestors.join(' | ') || '(无)'}`);
  return im;
}

async function run(tag, browserType, launchOpts) {
  console.log(`\n############ ${tag} ############`);
  const browser = await browserType.launch(launchOpts || {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(1000);
  await exam(A, '#players-grid .player-card .avatar-ring', `${tag} / 大厅`, `shots/f-${tag}-lobby.png`);
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(700);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2200);
  await A.addStyleTag({ content: '.avatar-ring::before{animation:none !important}' });
  await A.waitForTimeout(400);
  await exam(A, '#game-players-grid .player-card .avatar-ring', `${tag} / 游戏屏`, `shots/f-${tag}-game.png`);
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
