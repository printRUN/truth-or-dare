// PC/平板宽度体检：每屏是否水平居中、fixed 浮窗是否还在可视区、有无横向溢出。
// 用法: node probe-pcwidths.cjs [port]   → 逐档写 shots/pcwidths.json（长跑被掐也保留已完成档位）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = parseInt(process.argv[2] || '8818', 10);
const URLBASE = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const OUT = path.join(__dirname, 'shots', 'pcwidths.json');
const SIZES = [[1920, 1000], [1440, 900], [1280, 800], [1024, 768], [900, 900], [820, 1180]];
const rows = [];
function emit(o) { rows.push(o); fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); }

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

const MEASURE = screenId => {
  const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const act = document.querySelector('.screen.active');
  const c = b => (b ? Math.round(b[0] + b[2] / 2) : null);
  const bar = r('#react-bar');
  const land = r('#btn-land');
  return {
    vw: innerWidth, vh: innerHeight, sx: scrollX, docW: document.documentElement.scrollWidth,
    land: document.body.className,
    screen: r('#' + screenId), screenCenterOff: act ? Math.round(act.getBoundingClientRect().left + act.getBoundingClientRect().width / 2 - innerWidth / 2) : null,
    h1: c(r('h1')) - Math.round(innerWidth / 2), chip: c(r('.net-chip')) - Math.round(innerWidth / 2),
    bar: bar, barIn: bar ? bar[0] >= 0 && bar[0] + bar[2] <= innerWidth && bar[1] >= 0 : null,
    landBtn: land,
    kids: [...(act ? act.querySelectorAll(':scope > *') : [])].map(el => {
      const b = el.getBoundingClientRect();
      return { id: el.id || (el.className || '').toString().slice(0, 24), off: Math.round(b.left + b.width / 2 - innerWidth / 2), w: Math.round(b.width), right: Math.round(b.right), bottom: Math.round(b.bottom) };
    }),
  };
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [W, H] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); });
    const p = await ctx.newPage();
    await p.route('**fonts.googleapis.com**', rr => rr.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.route('**fonts.gstatic.com**', rr => rr.abort());
    p.on('pageerror', e => emit({ size: W + 'x' + H, pageerror: String(e.message).slice(0, 200) }));
    await p.goto(URLBASE, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 30000 });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1600);
    const join = await p.evaluate(MEASURE, 'screen-join');
    await p.screenshot({ path: path.join(__dirname, 'shots', `pcw-${W}x${H}-join.png`) });
    await p.fill('#input-name', 'PC' + W);
    await p.click('.avatar-option >> nth=0');
    await p.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await p.waitForTimeout(1600);
    const lobby = await p.evaluate(MEASURE, 'screen-lobby');
    emit({ size: W + 'x' + H, join, lobby });
    await p.screenshot({ path: path.join(__dirname, 'shots', `pcw-${W}x${H}-lobby.png`) });
    await ctx.close();
  }
  emit({ done: true });
  await browser.close();
  server.close();
})().catch(e => { emit({ ERROR: String(e && e.message || e) }); process.exit(1); });
