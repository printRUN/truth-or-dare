// 只读探测：互动浮窗（#react-bar）在手机/平板/PC 各视口下会不会压住可交互元素
// 用法: node probe-reactdock.cjs [WxH ...]      默认 390x844 844x390
//       node probe-reactdock.cjs 1280x800 1024x768 768x1024 1180x820
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8814;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}
async function open(ctx, tag) {
  const p = await ctx.newPage();
  await p.route('**fonts.googleapis.com**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**fonts.gstatic.com**', r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 30000 });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
  return p;
}

// 浮窗实测：fab 与展开后的 6 颗 emoji 各自与「可交互元素」的重叠清单
const DOCK_PROBE = () => {
  const forced = document.body.classList.contains('landforce');
  const W = window.innerWidth;
  const box = el => { const r = el.getBoundingClientRect(); return forced ? { l: r.top, t: W - r.right, r: r.bottom, b: W - r.left } : { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const label = el => (el.id ? '#' + el.id : '.' + String(el.className).split(' ')[0]);
  const inter = [...document.querySelectorAll('button, input, select, textarea, .choice-card, .flip-card, .player-card, .copy-link-btn')]
    .filter(el => !el.closest('#react-bar'))
    .map(el => ({ el, r: box(el) }))
    .filter(o => o.r.r - o.r.l > 1 && o.r.b - o.r.t > 1);
  const hit = c => inter.filter(o => o.r.l < c.r && o.r.r > c.l && o.r.t < c.b && o.r.b > c.t).map(o => label(o.el));
  const rv = el => { const b = box(el); return [Math.round(b.l), Math.round(b.t), Math.round(b.r), Math.round(b.b)]; };
  const fab = document.getElementById('react-fab');
  const pop = document.getElementById('react-pop');
  const btns = [...document.querySelectorAll('#react-pop button[data-react]')];
  return {
    open: document.getElementById('react-bar').classList.contains('open'),
    vwL: forced ? window.innerHeight : W, vhL: forced ? W : window.innerHeight,
    fab: { rect: rv(fab), hits: hit(box(fab)) },
    pop: { rect: rv(pop), hits: hit(box(pop)) },
    btns: btns.map(b => ({ e: b.dataset.react, rect: rv(b), hits: hit(box(b)) })),
  };
};

const fmtHits = h => h.length ? 'HIT ' + [...new Set(h)].slice(0, 5).join(' ') : 'free ✅';

// 点浮标：若 Playwright 报「被遮挡」，先记下命中栈再退回 DOM click（探针要把证据带回来）
async function clickFab(p, notes, tag) {
  try { await p.click('#react-fab', { timeout: 4000 }); return; }
  catch (e) {
    const diag = await p.evaluate(() => {
      const fab = document.getElementById('react-fab');
      const r = fab.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return {
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        center: [Math.round(cx), Math.round(cy)],
        scrollY: Math.round(window.scrollY),
        stack: document.elementsFromPoint(cx, cy).slice(0, 6).map(x => (x.id ? '#' + x.id : '.' + String(x.className).split(' ')[0]) + '@z' + getComputedStyle(x).zIndex),
      };
    });
    notes.push(`${tag} 浮标点击被拦：${String(e.message).split('\n')[0]} | ${JSON.stringify(diag)}`);
    await p.evaluate(() => document.getElementById('react-fab').click());
  }
}

(async () => {
  const args = process.argv.slice(2).filter(a => /^\d+x\d+$/.test(a));
  const sizes = args.length ? args.map(a => a.split('x').map(Number)) : [[390, 844], [844, 390]];
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const report = {};
  const run = async (W, H) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const A = await open(ctx, 'A'), B = await open(ctx, 'B');
    const tag = `${W}x${H}`;
    report[tag] = { vp: { W, H }, notes: [] };
    await A.fill('#input-name', 'A'); await A.click('.avatar-option >> nth=0');
    await A.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    await A.click('#btn-join'); await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    const room = await A.evaluate(() => S.room);
    await B.fill('#input-name', 'B'); await B.click('.avatar-option >> nth=0');
    await B.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    await B.fill('#input-room', room); await B.click('#btn-join');
    await B.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length === 2, null, { timeout: 15000 });
    const shot = async key => {
      await clickFab(A, report[tag].notes, tag + '/' + key);
      await A.waitForTimeout(260);
      report[tag][key] = await A.evaluate(DOCK_PROBE);
      await A.keyboard.press('Escape');
      await A.waitForTimeout(120);
    };
    await shot('lobby');
    await A.click('#btn-start');
    await A.waitForSelector('#screen-game.active', { timeout: 15000 });
    await A.waitForTimeout(1300);
    const G = await A.evaluate(() => document.getElementById('choice-section').classList.contains('mine')) ? A : B;
    await clickFab(G, report[tag].notes, tag + '/game');
    await G.waitForTimeout(260);
    report[tag].game = await G.evaluate(DOCK_PROBE);
    await G.keyboard.press('Escape'); await G.waitForTimeout(120);
    await G.click('#card-truth');
    await G.waitForSelector('#card-section:not([hidden])', { timeout: 20000 });
    await G.waitForTimeout(2700);
    await clickFab(G, report[tag].notes, tag + '/revealed');
    await G.waitForTimeout(260);
    report[tag].revealed = await G.evaluate(DOCK_PROBE);
    await ctx.close();
  };
  try {
    for (const [W, H] of sizes) await run(W, H);
    fs.writeFileSync('shots/reactdock-report.json', JSON.stringify(report, null, 1));
    for (const [tag, screens] of Object.entries(report)) {
      console.log(`\n════ ${tag} ════`);
      for (const n of (screens.notes || [])) console.log(`   ⚠ ${n}`);
      for (const [screen, d] of Object.entries(screens)) {
        if (screen === 'vp' || screen === 'notes') continue;
        console.log(`── ${screen} (逻辑 ${d.vwL}x${d.vhL})  open=${d.open}`);
        console.log(`   浮标  [${d.fab.rect}] ${fmtHits(d.fab.hits)}`);
        console.log(`   展开  [${d.pop.rect}] ${fmtHits(d.pop.hits)}`);
        const out = d.btns.filter(b => b.rect[3] > d.vhL + 1 || b.rect[0] < -1 || b.rect[2] > d.vwL + 1);
        if (out.length) console.log(`   越界按钮: ${out.map(b => b.e + '[' + b.rect + ']').join(' ')}`);
      }
    }
  } catch (e) { console.log('ERR', e && e.message); }
  finally { await browser.close(); server.close(); }
})();
