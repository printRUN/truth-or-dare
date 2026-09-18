// 加载门控取证探针：填房号进房时「加载效果必须播完才揭幕」（2026-09-17 用户点名）
//   注意端点：applyState→renderScreen 会在加载层还盖着时就把 #screen-lobby 切 .active
//   （幕下换屏是设计行为），所以断言端点是 hideLoading 的调用时刻，不是 lobby.active。
//   A. 建房（本地模式）：点「加入」→ hideLoading ≥ 2300ms（一整轮 2.4s 翻牌时长门；阈值留 150ms 是因为 hideMs 的零点取在 doJoin 启动之后，系统性少算零点后偏移）
//   B. 填房号加入：同上门时长断言 + hideLoading 那一拍翻牌动画 currentTime % 2400 ≈ 0（揭幕对齐正面 0% 帧）
//   C. 揭幕后加载层 300ms 内真的移除（不留僵尸层）
//   D. 错误路径（房间不存在）不被时长门拖住，toast 照常出现
//   E. prefers-reduced-motion：loader 动画被关掉时只剩时长门，依然 ≥2250ms（同 context 内自建自加）
// 用法: node probe-loader-gate.cjs <标签>
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const TAG = process.argv[2] || 'run';
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8868;   // 已占用：8731/8793-8799/8861/8863
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = `http://127.0.0.1:${PORT}/`;
let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail || ''}`); }
}

async function prep(p) {
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 20000 });
  await p.evaluate(() => {
    try { closeGuide(); } catch {}
    try { localStorage.setItem('tod:perf', 'full'); } catch {}
    const c = document.getElementById('chk-local'); if (c && !c.checked) c.click();
  });
}

// 点加入 → 等 hideLoading 被调用（真揭幕），返回 {hideMs, flipMs}
async function clickJoin(p) {
  await p.evaluate(() => {
    window.__hideLog = [];
    const orig = hideLoading;
    hideLoading = function () {
      const c = document.querySelector('.loader-card');
      const anims = c && c.getAnimations ? c.getAnimations() : [];
      window.__hideLog.push({
        t: Date.now(),
        flipMs: anims.length && anims[0].currentTime != null ? Number(anims[0].currentTime) : null,
      });
      return orig.apply(this, arguments);
    };
  });
  await p.click('#btn-join');
  // click() 返回 ≈ 事件已派发（doJoin 已启动）。零点取派发之后的页面时钟——actionability 等待期间
  // 开机揭幕可能已进日志（属正常 boot 行为），t >= 零点的条目才是本次进房的真揭幕。
  await p.evaluate(() => { window.__t0Real = Date.now(); });
  const t0Real = await p.evaluate(() => window.__t0Real);
  await p.waitForFunction(() => window.__hideLog && window.__hideLog.some(e => e.t >= window.__t0Real), { timeout: 25000 });
  const log = await p.evaluate(() => window.__hideLog.filter(e => e.t >= window.__t0Real));
  await p.waitForSelector('#screen-lobby.active', { timeout: 15000 }).catch(() => {});
  return { hideMs: log[log.length - 1].t - t0Real, flipMs: log[log.length - 1].flipMs, hideCount: log.length };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    // ── A+B+C：建房 + 填房号加入（本地模式，同一上下文两个标签页）──
    const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
    const host = await ctx.newPage();
    await prep(host);
    await host.fill('#input-name', '阿凯');
    console.log('A. 建房（本地模式）');
    const a = await clickJoin(host);
    chk('建房 hideLoading ≥2250ms', a.hideMs >= 2250, `${a.hideMs}ms`);
    chk('建房 hideLoading 恰好一次', a.hideCount === 1, `count=${a.hideCount}`);
    await host.screenshot({ path: `${ROOT}/.pw/shots/loader-gate-lobby.png` });

    const guest = await ctx.newPage();
    await prep(guest);
    const room = await host.evaluate(() => S.room);
    await guest.fill('#input-name', '阿贵');
    await guest.fill('#input-room', room);
    console.log('B. 填房号加入');
    const b = await clickJoin(guest);
    chk('加入 hideLoading ≥2250ms', b.hideMs >= 2250, `${b.hideMs}ms`);
    chk('加入 hideLoading 恰好一次', b.hideCount === 1, `count=${b.hideCount}`);
    const into = b.flipMs == null ? -1 : Math.round(b.flipMs) % 2400;
    chk('揭幕对齐翻牌 0% 帧（into ≤150 或 ≥2250）', into >= 0 && (into <= 150 || into >= 2250), `flip=${b.flipMs}ms into=${into}ms`);
    await guest.screenshot({ path: `${ROOT}/.pw/shots/loader-gate-join-lobby.png` });

    console.log('C. 揭幕后加载层移除');
    await guest.waitForSelector('#loading-overlay', { state: 'detached', timeout: 1500 })
      .then(() => chk('加载层 300ms 内移除', true))
      .catch(() => chk('加载层 300ms 内移除', false, '仍连接在 DOM'));
    await host.waitForSelector('#loading-overlay', { state: 'detached', timeout: 1500 })
      .then(() => chk('建房端加载层也移除', true))
      .catch(() => chk('建房端加载层也移除', false));

    // ── D：错误路径不额外拖揭幕（房间不存在 → toast + 加载层收起）──
    console.log('D. 房间不存在错误路径');
    await guest.evaluate(() => { try { sessionStorage.removeItem('tod:tab'); } catch {} });
    await guest.evaluate(() => { location.href = `${location.origin}/`; });
    await guest.waitForSelector('#screen-join.active', { timeout: 20000 });
    await prep(guest);
    await guest.fill('#input-name', '阿强');
    await guest.fill('#input-room', 'ZZZZZ');
    await guest.evaluate(() => {
      window.__hideLog = [];
      const orig = hideLoading;
      hideLoading = function () { window.__hideLog.push({ t: Date.now() }); return orig.apply(this, arguments); };
    });
    const d0 = Date.now();
    await guest.click('#btn-join');
    await guest.waitForFunction(() => {
      const t = document.querySelector('.toast');
      return t && t.textContent.includes('房间不存在');
    }, { timeout: 15000 });
    const dMs = Date.now() - d0;
    const dHid = await guest.evaluate(() => { const o = document.getElementById('loading-overlay'); return !o || o._hid === true; });
    chk('错误路径 toast 出现且加载层已收起', dHid, `overlay._hid=${dHid}, ${dMs}ms（含 3200+1500 重试窗）`);
    await ctx.close();

    // ── E：REDUCED（动画全关）只剩时长门，依然 ≥2250ms（同 context 自建自加）──
    console.log('E. prefers-reduced-motion 退路');
    const ctx3 = await browser.newContext({ viewport: { width: 900, height: 800 }, reducedMotion: 'reduce' });
    const h3 = await ctx3.newPage();
    await prep(h3);
    await h3.fill('#input-name', '阿静');
    const r3 = await clickJoin(h3);
    chk('REDUCED 建房 hideLoading ≥2250ms', r3.hideMs >= 2250, `${r3.hideMs}ms`);
    const room3 = await h3.evaluate(() => S.room);
    const g3 = await ctx3.newPage();
    await prep(g3);
    await g3.fill('#input-name', '阿默');
    await g3.fill('#input-room', room3);
    const e = await clickJoin(g3);
    chk('REDUCED 加入 hideLoading ≥2250ms', e.hideMs >= 2250, `${e.hideMs}ms`);
    await ctx3.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n[${TAG}] pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
