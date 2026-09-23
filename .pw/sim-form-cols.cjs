// sim-form-cols.cjs — 表单左右分区改造的玩家模拟取证：四游戏加入表单宽/窄视口截图
// 用法: node .pw/sim-form-cols.cjs before|after [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';

const MODE = process.argv[2] || 'before';
const PORT = Number(process.argv[3] || 8941);
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'shots', 'formcols');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0].split('#')[0];
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  try {
    const buf = fs.readFileSync(f);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await require(PW).chromium.launch({ args: ['--auto-accept-this-tab-capture'] });
  const shots = [
    // [file, w, h, name, setup]  setup: 进入表单前的动作
    ['tod.html', 1100, 600, 'tod-wide', null],          // 真横屏矮视口 → landui 左右分区（参照母本）
    ['tod.html', 390, 844, 'tod-narrow', null],
    ['monopoly.html', 1280, 800, 'mono-wide', async p => { await p.evaluate(() => { const s = document.getElementById('setup'); if (s) s.hidden = false; }); }],
    ['monopoly.html', 390, 844, 'mono-narrow', async p => { await p.evaluate(() => { const s = document.getElementById('setup'); if (s) s.hidden = false; }); }],
    ['uno.html', 1280, 800, 'uno-wide', async p => { await p.evaluate(() => { const s = document.getElementById('setup'); if (s) s.hidden = false; }); }],
    ['uno.html', 390, 844, 'uno-narrow', async p => { await p.evaluate(() => { const s = document.getElementById('setup'); if (s) s.hidden = false; }); }],
    ['bombcat.html', 1280, 800, 'bc-wide', null],
    ['bombcat.html', 390, 844, 'bc-narrow', null],
  ];
  for (const [file, w, h, name, setup] of shots) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('PAGEERROR', name, String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:${PORT}/${file}?room=`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    if (setup) await setup(p);
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, `${MODE}-${name}.png`) });
    console.log('shot', `${MODE}-${name}.png`);
    await ctx.close();
  }
  await b.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
