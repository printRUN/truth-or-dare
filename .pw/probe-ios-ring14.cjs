// 干净回归验证：全局冻结动画后，逐个摘掉本次新增的属性，量差异并出热力图
//   clip-path: circle(50%)  on .avatar-inner
//   z-index: 0              on .avatar-ring::before
// 用法: node probe-ios-ring14.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8810;
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
    const cur = out.slice(y * stride, (y + 1) * stride), prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
      cur[x] = ft === 0 ? v : ft === 1 ? (v + a) & 255 : ft === 2 ? (v + b) & 255
        : ft === 3 ? (v + ((a + b) >> 1)) & 255
        : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; })();
    }
  }
  return { w, h, bpp, data: out };
}
function stat(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { pct: 100, worst: 255 };
  let n = 0, worst = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = (y * a.w + x) * a.bpp, j = (y * b.w + x) * b.bpp;
    const d = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
    if (d > 4) n++; if (d > worst) worst = d;
  }
  return { pct: n / (a.w * a.h) * 100, worst };
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
const FREEZE = `*,*::before,*::after{animation:none !important;transition:none !important}
  .orb,.confetti,.react-rain,.tap-ring,.loader-orbit{display:none !important}
  .modal-mask,.toast{display:none !important}`;

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
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2600);
  await A.addStyleTag({ content: FREEZE });
  await A.waitForTimeout(500);

  const L = () => `shots/s-${tag}-`;
  const shoot = async (n) => { await A.screenshot({ path: `${L()}${n}.png` }); await A.waitForTimeout(250); return decodePNG(fs.readFileSync(`${L()}${n}.png`)); };
  const newShot = await shoot('new');
  await A.addStyleTag({ content: '.avatar-inner{clip-path:none !important}' });
  const noClip = await shoot('noclip');
  await A.addStyleTag({ content: '.avatar-ring::before{z-index:auto !important}' });
  const noZ = await shoot('noclip-noz');

  const s1 = stat(newShot, noClip), s2 = stat(newShot, noZ);
  console.log(`  clip-path 摘掉后: 差异 ${s1.pct.toFixed(3)}%  最大色差 ${s1.worst}`);
  console.log(`  再加上 z-index 摘掉: 差异 ${s2.pct.toFixed(3)}%  最大色差 ${s2.worst}`);
  execFileSync('node', ['diffimg.cjs', `${L()}new.png`, `${L()}noclip.png`, `${L()}diffclip.png`], { stdio: 'inherit' });
  execFileSync('node', ['diffimg.cjs', `${L()}new.png`, `${L()}noclip-noz.png`, `${L()}diffz.png`], { stdio: 'inherit' });
  await browser.close();
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
