/* probe-mono-replay.cjs —— 大富翁观战端动画回放回归锁（2026-09-24，用户点名「人人都能看到彼此的动画」）
   双标签本地链路：host 真实按钮掷骰/买地，viewer 只收快照。
   断言：① viewer 回放计数 ≥2（move/jail/buy/money 操作真的播了）② busy 窗口被观测到
        ③ 棋子位移是渐进动画不是瞬移（总位移 >> 单采样步长）④ 行动者端回放计数 =0（回声不重播）
        ⑤ 双端零 pageerror。真机速度（不传 autotest，SPEED=1），端口 8953。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8953;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✅', msg, extra !== undefined ? '| ' + JSON.stringify(extra) : ''); } else { fail++; console.log('  ❌', msg, extra !== undefined ? '| ' + JSON.stringify(extra) : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dist3 = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const errs = [];
  // 编排：host 建房(座位0) → host 加机器人(座位1) → viewer 进房(座位2) → host 开局。
  // 回合序 host→bot→viewer：观战者永不操作，对局在前两座位间连续走棋；bot 由 host 代跑（本地动画+快照）。
  // inspect=1 只暴露 __mono（SPEED 保持真机 1），enter/start 走 __mono.net() 编程入口。
  const BASE = `http://127.0.0.1:${PORT}/monopoly.html?net=1&inspect=1&localnet=1`;

  const host = await ctx.newPage();
  host.on('pageerror', e => errs.push('host:' + e.message));
  await host.goto(`${BASE}&room=53535`, { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__mono, null, { timeout: 20000 });
  ok('host 建房', await host.evaluate(() => window.__mono.net().enter('53535', '房主', true)), {});
  await host.waitForFunction(() => window.__mono.net().joined, null, { timeout: 20000 });
  await host.waitForSelector('.pn-addbot', { timeout: 10000 });
  await host.click('.pn-addbot');
  await host.waitForFunction(() => (window.__mono.net().doc || { players: [] }).players.length === 2, null, { timeout: 10000 });

  const viewer = await ctx.newPage();
  viewer.on('pageerror', e => errs.push('viewer:' + e.message));
  await viewer.goto(`${BASE}&room=53535`, { waitUntil: 'domcontentloaded' });
  await viewer.waitForFunction(() => window.__mono, null, { timeout: 20000 });
  ok('viewer 进房', await viewer.evaluate(() => window.__mono.net().enter('53535', '观战者', false)), {});
  await viewer.waitForFunction(() => window.__mono.net().joined, null, { timeout: 20000 });
  await viewer.waitForFunction(() => (window.__mono.net().doc || { players: [] }).players.length === 3, null, { timeout: 10000 });

  await host.evaluate(() => window.__mono.net().start({ roundLimit: 20 }));
  await host.waitForFunction(() => window.__mono.net().doc && window.__mono.net().doc.started, null, { timeout: 20000 });
  await viewer.waitForFunction(() => window.__mono.net().doc && window.__mono.net().doc.started, null, { timeout: 20000 });
  console.log('  对局已开始（host → bot → 观战者）');

  // 12 秒对局窗：host 真实按钮驱动（掷骰/买地），viewer 40ms 采样棋子轨迹 + 回放水位
  const samples = [];
  const t0 = Date.now();
  let hostRolls = 0, hostBuys = 0, viewerBuyToast = false;
  while (Date.now() - t0 < 12000) {
    // host：只在「轮到我 && 稳定等待期」掷（action-bar 用 show 类控制显隐）；买地弹窗就买（触发 buy 回放）
    const h = await host.evaluate(() => {
      const my = window.__mono.net().myTurn;
      if (!my) return { act: null, phase: window.__mono.state.phase };
      const buyVisible = !document.getElementById('buy-modal').hidden;
      if (buyVisible) { const b = document.getElementById('btn-buy-yes'); if (b && !b.disabled) { b.click(); return { act: 'buy' }; } }
      const bar = document.getElementById('action-bar');
      const roll = document.getElementById('act-roll');
      if (bar && bar.classList.contains('show') && roll) { roll.click(); return { act: 'roll' }; }
      return { act: null, phase: window.__mono.state.phase };
    });
    if (h.act === 'roll') hostRolls++;
    if (h.act === 'buy') hostBuys++;
    const v = await viewer.evaluate(() => ({
      pawns: window.__mono.pawnWorld(),
      n: window.__mono.net().replay().n,
      busy: window.__mono.net().replay().busy,
      toast: (document.getElementById('toast') || {}).textContent || '',
    }));
    if (/买下/.test(v.toast)) viewerBuyToast = true;
    samples.push(v);
    await sleep(40);
  }
  const hostReplay = await host.evaluate(() => window.__mono.net().replay());

  // ── 断言 ──
  const lastN = samples.length ? samples[samples.length - 1].n : 0;
  ok('viewer 回放操作数 ≥2', lastN >= 2, { n: lastN, hostRolls, hostBuys });
  ok('viewer 观测到回放 busy 窗口', samples.some(s => s.busy));

  // 棋子位移：总位移要远大于单采样步长（渐进动画 vs 瞬移）
  let best = { total: 0, maxStep: 0 };
  const nP = samples.length ? (samples[0].pawns || []).length : 0;
  for (let pi = 0; pi < nP; pi++) {
    let total = 0, maxStep = 0;
    let prev = samples[0].pawns[pi];
    for (let k = 1; k < samples.length; k++) {
      const cur = samples[k].pawns[pi];
      const d = dist3(prev, cur);
      total += d; if (d > maxStep) maxStep = d;
      prev = cur;
    }
    if (total > best.total) best = { total, maxStep };
  }
  ok('棋子存在净位移（走位真的发生了）', best.total > 1.5, best);
  ok('位移是渐进动画而非瞬移（单步 << 总位移）', best.total > 1.5 && best.maxStep < best.total * 0.7, best);
  console.log(`  [info] viewer 买地 toast 捕获=${viewerBuyToast}（软信号，是否落地可买取决于骰点）`);

  ok('行动者端回放计数 =0（本地动画不被快照回声重播）', hostReplay.n === 0 && !hostReplay.busy, hostReplay);
  ok('双端零 pageerror', errs.length === 0, errs.slice(0, 3));

  await host.screenshot({ path: `${ROOT}/.pw/shots/mono-replay-host.png` }).catch(() => {});
  await viewer.screenshot({ path: `${ROOT}/.pw/shots/mono-replay-viewer.png` }).catch(() => {});
  await browser.close();
  server.close();
  console.log(`\n══ probe-mono-replay 结果 ══\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(2); });
