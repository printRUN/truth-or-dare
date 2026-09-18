// 复现用户所见：不做任何 CSS 覆写，进游戏后逐张拍 .player-card（含 active 那张），放大存档
// 用法: node probe-ios-ring8.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8804;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
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

// 量化「头像圆是否被环盖住 / 是否溢出环外」：
// 以环外接方框为界，统计四个「角三角区」（圆外）里出现「头像亮色」的比例
function cornerLeak(im) {
  const dpr = im.w / 77;                        // ring 70px * scale1.1 ≈ 77
  const inset = Math.round(3 * dpr);
  let tot = 0, leak = 0;
  for (let y = inset; y < im.h - inset; y++) for (let x = inset; x < im.w - inset; x++) {
    const dx = x - im.w / 2, dy = y - im.h / 2;
    const rr = Math.min(im.w, im.h) / 2 - inset;
    if (dx * dx + dy * dy <= rr * rr) continue;  // 只看圆外
    tot++;
    const i = (y * im.w + x) * im.bpp;
    const [r, g, b] = [im.data[i], im.data[i + 1], im.data[i + 2]];
    // 头像像素：亮且偏暖/偏蓝(肤色/衣服)；背景/环：暗紫蓝 或 环带高饱和
    if (r > 150 && g > 130 && b > 110) leak++;
  }
  return { tot, leak, pct: tot ? leak / tot * 100 : 0 };
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

async function run(tag, browserType, launchOpts) {
  console.log(`\n############ ${tag} ############`);
  const browser = await browserType.launch(launchOpts || {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const A = await open(ctx); await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx); await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  await A.waitForTimeout(800);

  const lb = p => p.locator('#players-grid .player-card .avatar-ring').first().screenshot({ path: `shots/g-${tag}-lobby.png` });
  await lb(A); await lb(B);

  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2500);
  await A.screenshot({ path: `shots/g-${tag}-game-full.png` });

  const n = await A.locator('#game-players-grid .player-card').count();
  for (let i = 0; i < n; i++) {
    const card = A.locator('#game-players-grid .player-card').nth(i);
    const who = await card.locator('.player-name').textContent();
    const isActive = await card.evaluate(c => c.querySelector('.avatar-ring').classList.contains('active'));
    const f = `shots/g-${tag}-card${i}${isActive ? '-ACTIVE' : ''}.png`;
    const buf = await card.screenshot({ path: f });
    const im = decodePNG(buf);
    const { tot, leak, pct } = cornerLeak(im);
    console.log(`  卡片${i} ${who}${isActive ? ' [active]' : ''}  ${im.w}x${im.h}  圆外区域 ${tot}px 中头像亮色 ${leak}px = ${pct.toFixed(0)}%  ${pct > 12 ? '❌ 头像溢出/被环压' : '✅ 正常'}`);
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
