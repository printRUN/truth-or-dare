/* ev-num3d-tod.cjs —— 数字实体化轮 T1/T2/T4 取证（端口 9047，2026-10-08）
   T1 计分泡：applyState 分数 diff → 头顶实体牌（近景剔除/1.6s 自收/池≤6）；
   T2 北桌缘两行计分立牌（PLACE_OBST 登记/revealed 钳光）；T4 stage-actions 浮窗动态让位。
   index.html 与 tod.html 同构镜像（代码一致性由 check-syntax 孪生镜头区+本探针兜底）。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 9047;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

async function joinTab(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 140)));
  await page.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });   // 抑制首进引导+钉全 perf 档（probe-3p-verify 同款），防软渲机 perfWatch 降级 loperf 拆掉 GL
  await page.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  return { page, errs };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const a = await joinTab(ctx, { name: '小A', tag: 'A' });
  await a.page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  const room = (await a.page.textContent('#share-room')).trim();
  const b = await joinTab(ctx, { name: '小B', room, tag: 'B' });
  await b.page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await a.page.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length >= 2, null, { timeout: 25000 });
  await a.page.click('#btn-start');
  await a.page.waitForSelector('#screen-game.active', { timeout: 15000 });
  await b.page.waitForSelector('#screen-game.active', { timeout: 15000 });
  await a.page.waitForFunction(() => window.__three && document.body.classList.contains('three3d'), null, { timeout: 15000 });

  console.log('— T2 桌面计分立牌 —');
  const board1 = await a.page.evaluate(() => __three.scorePops().board);
  ok(board1 && board1.visible === true, `计分立牌已立（sig=${board1 && board1.sig}）`);
  ok(board1 && /\d+\|\d+\|\d+\|\d+\|\d+$/.test(board1.sig), 'sig=truth|dare|skips|scoring|players 五段');
  await a.page.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-tod-board.png') });

  console.log('— T1 计分泡（弹出即收） —');
  const pid = await a.page.evaluate(() => S.players[0].id);
  const pop1 = await a.page.evaluate(pid => __three.scorePop(pid, 10), pid);
  ok(pop1 === true, 'scorePop 受理（正面 +10）');
  const pop2 = await a.page.evaluate(pid => __three.scorePop(pid, -5), pid);
  ok(pop2 === true, 'scorePop 受理（负面 −5）');
  const live1 = await a.page.evaluate(() => __three.scorePops());
  ok(live1.live === 2 && live1.total === 2, `双泡在飞（live=${live1.live} total=${live1.total}）`);
  await a.page.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-tod-pops.png') });
  await a.page.waitForFunction(() => __three.scorePops().live === 0, null, { timeout: 4000 });
  const live2 = await a.page.evaluate(() => __three.scorePops());
  ok(live2.live === 0 && live2.total === 2, `泡 1.6s 自收（live=${live2.live} total=${live2.total}）`);

  console.log('— T1 applyState diff 接线（真实触发路径，非手工直调） —');
  const before = await a.page.evaluate(() => __three.scorePops().total);
  const wired = await a.page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(S));   // 造同 ver 新态：0 号玩家 +7 分 → applyState 内 prevScores diff 应触发 scorePop
    s.players[0].score = (s.players[0].score || 0) + 7;
    applyState(s);
    return __three.scorePops().total;
  });
  ok(wired === before + 1, `applyState 分数 diff 触发计分泡（total ${before}→${wired}）`);

  console.log('— T4 stage-actions 浮窗动态让位 —');
  // 叠压只在工具行折两行时出现（1100 宽单行 toolsTop≈759，默认 64px 本就无叠压=max(64,51) 保持是正确行为）
  // → 收窄到 820 宽让 12 颗按钮必然折两行，验证动态锚定真的抬起来
  let t4 = null, t4pg = null;
  for (const pg of [a.page, b.page]) {
    await pg.waitForFunction(() => S.turn && S.turn.stage === 'choosing', null, { timeout: 30000 });
    const isChooser = await pg.evaluate(() => S.turn.chooserId === myId);
    if (!isChooser) continue;
    t4pg = pg; break;
  }
  if (t4pg) {
    await t4pg.setViewportSize({ width: 820, height: 800 });   // 折行触发
    await t4pg.waitForTimeout(900);   // resize→layoutRing 重排+帧内实测重写
    t4 = await t4pg.evaluate(() => {
      const sa = document.getElementById('stage-actions');
      const tools = document.getElementById('game-tools');
      if (sa.style.display === 'none' || !tools) return null;
      const tr = tools.getBoundingClientRect();
      if (!(tr.top > 0)) return null;
      const sar = sa.getBoundingClientRect();
      return { saBottom: sa.style.bottom, toolsTop: Math.round(tr.top), saRectBottom: Math.round(sar.bottom), vh: window.innerHeight, toolsH: Math.round(tr.height) };
    });
  }
  ok(!!t4, `chooser 页 stage-actions 与工具行同屏可测（${JSON.stringify(t4)}）`);
  if (t4) {
    const want = Math.max(64, t4.vh - t4.toolsTop + 10);
    const got = parseInt(t4.saBottom, 10);
    ok(t4.toolsH > 50, `窄视口工具行已折两行（高 ${t4.toolsH}px）`);
    ok(Math.abs(got - want) <= 3, `动态锚定=max(64, 工具顶+10)（want=${want} got=${got}）`);
    ok(t4.saRectBottom <= t4.toolsTop + 2, `渲染位无叠压（sa 底 ${t4.saRectBottom} ≤ 工具顶 ${t4.toolsTop}）`);
  }
  ok(a.errs.length === 0 && b.errs.length === 0, `零 pageerror（A:${a.errs.length} B:${b.errs.length}）${(a.errs[0] || b.errs[0] || '')}`);

  await ctx.close();
  await browser.close();
  server.close();
  console.log(`═══ ev-num3d-tod：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('PROBE CRASH:', e.message || e); process.exit(2); });
