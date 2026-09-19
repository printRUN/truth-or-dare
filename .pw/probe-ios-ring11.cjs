// 聚焦 active 环：两个引擎在同一路径（page.screenshot + clip）下拍「当前玩家」头像，
// 动画运行中连拍数帧；再看关掉 ::before 的样子。用来判定「环是否盖住头像」。
// 用法: node probe-ios-ring11.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8807;
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
  await A.waitForTimeout(800);
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2500);

  // 把 active 固定到第一张卡（两引擎一致），保持动画运行
  await A.evaluate(() => {
    document.querySelectorAll('#game-players-grid .player-card .avatar-ring').forEach(r => r.classList.remove('active'));
    document.querySelector('#game-players-grid .player-card .avatar-ring').classList.add('active');
  });
  await A.waitForTimeout(600);

  const clip = async () => {
    const r = await A.evaluate(() => { const b = document.querySelector('#game-players-grid .player-card .avatar-ring').getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height }; });
    return r;
  };
  const box = await clip();
  const files = [];
  for (let i = 0; i < 3; i++) {                      // 动画运行中连拍
    const f = `shots/a-${tag}-run${i}.png`;
    await A.screenshot({ path: f, clip: box });
    files.push(f);
    await A.waitForTimeout(190);
  }
  await A.addStyleTag({ content: '.avatar-ring::before, .avatar-ring.active::before{display:none !important}' });
  await A.waitForTimeout(350);
  const fNo = `shots/a-${tag}-nobefore.png`;
  await A.screenshot({ path: fNo, clip: box });
  files.push(fNo);

  // 量化：圆心一圈（0.5r 环带）在「有环」时相对「无环」被改写的比例
  const zlib = require('zlib');
  const dec = (buf) => { let off = 8, w = 0, h = 0, bpp = 4; const idat = [];
    while (off < buf.length) { const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.slice(off + 8, off + 8 + len);
      if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; off += 12 + len; }
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride); let p = 0;
    for (let y = 0; y < h; y++) { const ft = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
      const cur = out.slice(y * stride, (y + 1) * stride), prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) { const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = line[x];
        cur[x] = ft === 0 ? v : ft === 1 ? (v + a) & 255 : ft === 2 ? (v + b) & 255 : ft === 3 ? (v + ((a + b) >> 1)) & 255
          : (() => { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; })(); } }
    return { w, h, bpp, data: out }; };
  const no = dec(fs.readFileSync(fNo));
  for (let i = 0; i < 3; i++) {
    const im = dec(fs.readFileSync(files[i]));
    const cx = im.w / 2, cy = im.h / 2, r = Math.min(im.w, im.h) / 2;
    let inside = 0, diff = 0;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > (r * 0.82) ** 2) continue;   // 只看圆内 82%（避开环带）
      inside++;
      const a = (y * im.w + x) * im.bpp, b = (y * no.w + x) * no.bpp;
      const d = Math.max(Math.abs(im.data[a] - no.data[b]), Math.abs(im.data[a + 1] - no.data[b + 1]), Math.abs(im.data[a + 2] - no.data[b + 2]));
      if (d > 24) diff++;
    }
    console.log(`  帧${i}: 圆内被环改写 ${(diff / inside * 100).toFixed(1)}%  ${diff / inside < 0.05 ? '✅ 环没盖住头像' : '❌ 环压在头像上'}`);
  }
  await browser.close();
  execFileSync('node', ['stack.cjs', `shots/a-${tag}-contact.png`, '4', '230', ...files], { stdio: 'inherit' });
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
  console.log('\n对比图: shots/a-webkit-contact.png / shots/a-chromium-contact.png  [运行3帧 | 无::before]');
})();
