// 探针：退出房间 / 加入进场 的「加载动画 ↔ 屏幕入场」是否同步，顺带量帧间隔
// 用法: node probe-leave.cjs   （from .pw/；静态服务器端口 8794）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8794;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

async function open(ctx, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}
async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 页面内记录：加载层 class 变化 / 每个 .screen 的 entering|leaving|active 变化 / 帧间隔
function installRecorder(p) {
  return p.evaluate(() => {
    window.__ev = []; window.__frames = []; window.__t0 = performance.now();
    const now = () => Math.round(performance.now() - window.__t0);
    const snap = () => [...document.querySelectorAll('.screen')].map(s => s.id + ':' + (s.classList.contains('active') ? 'A' : '-') + (s.classList.contains('entering') ? 'E' : '-') + (s.classList.contains('leaving') ? 'L' : '-')).join('  ');
    const mo = new MutationObserver(muts => {
      for (const mu of muts) {
        const el = mu.target;
        if (el.classList && el.classList.contains('loading-overlay')) window.__ev.push({ t: now(), m: 'overlay ' + (el.classList.contains('hide') ? 'hide' : 'show') });
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    let last = 0, state = '';
    const tick = () => {
      const n = performance.now();
      if (last) window.__frames.push({ t: now(), gap: Math.round(n - last) });
      last = n;
      const s = snap();
      if (s !== state) { state = s; window.__ev.push({ t: now(), m: 'screens ' + s }); }
      if (window.__rec) requestAnimationFrame(tick);
    };
    window.__rec = true; requestAnimationFrame(tick);
  });
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 840 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const A = await open(ctx, 'A');
  await installRecorder(A);
  await join(A, '阿泽');                                   // ← 加入：记录加载层收起 ↔ 大厅入场
  await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await sleep(3200);
  const joinEv = await A.evaluate(() => window.__ev);
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, 'B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
  await sleep(800);

  console.log('── 加入流程（加载层 ↔ 大厅入场）──');
  console.log(joinEv.map(e => `  ${String(e.t).padStart(5)}ms  ${e.m}`).join('\n'));

  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await sleep(1800);

  // 重置记录，退出房间（在页内触发，__mark 到首个 class 变化 = 应用自己的响应延迟）
  await A.evaluate(() => { window.__ev = []; window.__frames = []; window.__t0 = performance.now(); window.__mark = window.__t0; });
  const tClick = Date.now();
  await A.evaluate(() => document.getElementById('btn-leave-game').click());
  await A.waitForSelector('#screen-join.active', { timeout: 20000 });
  const tActive = Date.now() - tClick;
  await sleep(1600);

  const out = await A.evaluate(() => ({ ev: window.__ev, frames: window.__frames.slice(-500) }));
  const gaps = out.frames.slice().sort((a, b) => b.gap - a.gap).slice(0, 6);
  console.log('\n── 退出房间 ──');
  console.log('  点击 → #screen-join.active 用时: ' + tActive + 'ms');
  console.log(out.ev.map(e => `  ${String(e.t).padStart(5)}ms  ${e.m}`).join('\n'));
  console.log('  最大帧间隔 top6: ' + gaps.map(g => `${g.gap}ms@${g.t}`).join(', '));

  // 退出后再加入：这是之前真正的不同步场景（lastScreenName 已是 join，入场会在加载层后面提前跑完）
  await A.evaluate(() => { window.__ev = []; window.__frames = []; window.__t0 = performance.now(); });
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await sleep(3600);
  const reEv = await A.evaluate(() => window.__ev);
  console.log('\n── 退出后再加入（应：overlay hide ↔ lobby 入场同拍）──');
  console.log(reEv.map(e => `  ${String(e.t).padStart(5)}ms  ${e.m}`).join('\n'));
  const ei = reEv.findIndex(e => /AE/.test(e.m) && /screen-lobby/.test(e.m));
  let hi = -1;
  for (let i = ei - 1; i >= 0; i--) if (reEv[i].m === 'overlay hide') { hi = i; break; }
  console.log('  overlay hide → lobby 入场 间隔: ' + (ei >= 0 && hi >= 0 ? (reEv[ei].t - reEv[hi].t) + 'ms' : 'n/a'));

  console.log('\n' + (errors.length ? 'ERRORS:\n' + errors.join('\n') : '零 JS 报错 ✅'));
  await browser.close();
  server.close();
  process.exitCode = errors.length ? 1 : 0;
})();
