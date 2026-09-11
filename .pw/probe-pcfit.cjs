// PC/平板 join 首屏适配体检：主要控件是否落在首屏内、页面是否需要滚动。
// 用法: node probe-pcfit.cjs [port]   → 逐档写 shots/pcfit.json
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = parseInt(process.argv[2] || '8819', 10);
const URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT = path.join(__dirname, 'shots', 'pcfit.json');
const SIZES = [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [820, 1180], [768, 1024]];
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

const M = () => {
  const r = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const inView = a => !!a && a[1] >= 0 && a[1] + a[3] <= innerHeight;
  return {
    vw: innerWidth, vh: innerHeight,
    docH: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    joinBox: r('.join-box'), btnJoin: r('#btn-join'), inputName: r('#input-name'), grpAv: r('#grp-avatar'),
    importWrap: r('#import-join-wrap'), btnHowto: r('#btn-howto-join'), btnDonate: r('#btn-donate'),
    joinInView: inView(r('#btn-join')),
    offX: (() => { const b = document.querySelector('#screen-join'); if (!b) return null; const q = b.getBoundingClientRect(); return Math.round(q.left + q.width / 2 - innerWidth / 2); })(),
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
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 30000 });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1400);
    const d = await p.evaluate(M);
    emit(Object.assign({ size: W + 'x' + H }, d));
    await ctx.close();
  }
  emit({ done: true });
  await browser.close();
  server.close();
})().catch(e => { emit({ ERROR: String(e && e.message || e) }); process.exit(1); });
