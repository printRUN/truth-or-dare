// 回退层（无 WebGL，CSS 3D 卡片环）6p 宽屏验收：
// 全环等分公式下 6p 宽屏 rel=1/rel=2 曾同落 x=10.2%（近卡头像盖远卡名牌=点名牌点错人），
// LADDER 放宽到宽屏 n≥6 后必须：每张名牌中心 elementFromPoint 命中自己的卡（蛋瞄准/点名不错人）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8891;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + ' —— ' + d); } };
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {}
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2' || type === 'webkit-2d' && false) return null;
      return orig.call(this, type, ...a);
    };
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await p.fill('#input-name', '测回退');
  await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await p.evaluate(() => mutate(s => {
    const names = ['甲', '乙', '丙', '丁', '戊'];
    names.forEach((n, i) => s.players.push({ id: 'fb' + i, name: n, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
  }));
  await p.click('#mode-pick .mode-opt[data-mode="free"]');
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 20000 });
  await p.waitForTimeout(2500);   // left/top 0.55s 过渡 + 镜头落定
  const env = await p.evaluate(() => ({ three3d: document.body.classList.contains('three3d'), n: S.players.length }));
  check('回退层生效（body 无 three3d）且 6 人局', !env.three3d && env.n === 6, JSON.stringify(env));
  const hit = await p.evaluate(() => {
    const out = { badName: [], badCard: [], ladderShifts: [] };
    document.querySelectorAll('#game-players-grid .player-card').forEach(c => {
      const pid = c.dataset.pid;
      const name = c.querySelector('.player-name');
      const nr = name.getBoundingClientRect();
      const nh = document.elementFromPoint(nr.left + nr.width / 2, nr.top + nr.height / 2);
      const nhCard = nh && nh.closest ? nh.closest('.player-card') : null;
      if (!nhCard || nhCard.dataset.pid !== pid) out.badName.push({ pid: pid.slice(0, 6), hit: nhCard ? nhCard.dataset.pid.slice(0, 6) : String(nh && nh.className).slice(0, 24) });
      const cr = c.getBoundingClientRect();
      const ch = document.elementFromPoint(cr.left + cr.width / 2, Math.min(cr.top + cr.height / 2, innerHeight - 1));
      const chCard = ch && ch.closest ? ch.closest('.player-card') : null;
      if (!chCard || chCard.dataset.pid !== pid) out.badCard.push({ pid: pid.slice(0, 6), hit: chCard ? chCard.dataset.pid.slice(0, 6) : String(ch && ch.className).slice(0, 24) });
      const m = new DOMMatrixReadOnly(getComputedStyle(c).transform === 'none' ? undefined : getComputedStyle(c).transform);
      out.ladderShifts.push({ pid: pid.slice(0, 6), cx: Math.round(cr.left + cr.width / 2), rs: c.style.getPropertyValue('--rs') });
    });
    return out;
  });
  check('每张名牌中心命中自己的卡（点名牌不错人）', hit.badName.length === 0, JSON.stringify(hit.badName));
  check('每张卡中心命中自己（既有契约）', hit.badCard.length === 0, JSON.stringify(hit.badCard));
  const boxes = await p.evaluate(() => [...document.querySelectorAll('#game-players-grid .player-card')].map(c => { const r = c.getBoundingClientRect(); return { pid: c.dataset.pid.slice(0, 6), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), h: Math.round(r.height) }; }));
  const stacked = boxes.some((a, i) => boxes.some((b, j) => j > i && Math.abs(a.cx - b.cx) < 3 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2));
  check('6p 无同列且纵向相叠的座位（阶梯已把同侧座横向拉开）', !stacked, JSON.stringify(boxes));
  await p.screenshot({ path: 'shots/seats-fallback-6p.png' });
  check('无 pageerror', errs.length === 0, errs.join(' | '));
  await browser.close(); server.close();
  console.log(fail === 0 ? `FALLBACK SEATS PROBE PASSED ✅ (${pass})` : `FAILURES: ${fail}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
