// 回归验证：新加的 clip-path:circle(50%) 与 ::before 的 z-index:0 是否「零像素影响」
// 做法：同一页面状态下拍两次 —— (新) 原样 vs (旧) 用 style 覆写回旧写法，
//       逐像素比对整屏 + 头像环局部。两引擎都跑。
// 用法: node probe-ios-ring13.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { webkit, chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8809;
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
function diffPct(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { pct: 100, worst: 255, note: `尺寸不同 ${a.w}x${a.h} vs ${b.w}x${b.h}` };
  let n = 0, worst = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = (y * a.w + x) * a.bpp, j = (y * b.w + x) * b.bpp;
    const d = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
    if (d > 4) n++;
    if (d > worst) worst = d;
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

  // 冻住所有环动画 + 隐藏会随时间变的东西，保证两次截图可比
  const freeze = '.avatar-ring::before{animation:none !important}.avatar-ring.active{animation:none !important}'
    + '.orb,.confetti{animation:none !important}.react-rain,.tap-ring{display:none !important}'
    + '.loader-orbit{display:none !important}';

  const grab = async (label) => {
    await A.addStyleTag({ content: freeze });
    await A.waitForTimeout(450);
    await A.screenshot({ path: `shots/r-${tag}-${label}-lobby.png` });
    return decodePNG(await A.screenshot());
  };

  const lobbyNew = await grab('new');

  // 游戏屏
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForTimeout(2600);
  const ringBox = await A.evaluate(() => { const r = document.querySelector('#game-players-grid .player-card .avatar-ring').getBoundingClientRect();
    return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; });
  const gameNew = await grab('new');
  const ringNew = decodePNG(await A.screenshot({ clip: ringBox }));

  // ── 只摘掉这次新加的两个属性（border-radius / overflow 保持原样，隔离变量）──
  await A.addStyleTag({ content: '.avatar-inner{clip-path:none !important}.avatar-ring::before{z-index:auto !important}' });
  await A.waitForTimeout(450);
  const ringOld = decodePNG(await A.screenshot({ clip: ringBox }));
  const gameOld = await grab('old');

  const a = diffPct(ringNew, ringOld), b = diffPct(gameNew, gameOld);
  console.log(`  头像环局部 新 vs 旧: 差异 ${a.pct.toFixed(3)}%  最大色差 ${a.worst} ${a.pct < 0.5 ? '✅ 无视觉变化' : '⚠ 有变化(预期:旧写法本来就是坏的)'}`);
  console.log(`  游戏屏整屏 新 vs 旧(去圆裁切): 差异 ${b.pct.toFixed(2)}%  最大色差 ${b.worst}`);
  await browser.close();
  return { a, b };
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await run('webkit', webkit);
  await run('chromium', chromium, { args: ['--no-sandbox'] });
  server.close();
})();
