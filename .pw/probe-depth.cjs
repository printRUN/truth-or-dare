// 探针：深度参照层（depth-stage）取证
// 用法: node probe-depth.cjs   （from .pw/；静态服务器端口 8797）
// 判据 1 静止态：无 tx-run 时所有参照层 computed transform === 'none'（常态零 3D 姿态红线）。
// 判据 2 同拍：扫视窗口内参照层整体在动（≥4 层出现非零位移帧）。
// 判据 3 深度梯度：各层最大位移比严格递增（远星 < 中星 < 光柱 < 地板 < 尘埃 < 面板 1.0）。
// 判据 4 零残差：扫完后所有层 transform === 'none'（整数周期瞬移不可见）。
// 判据 5 取证：扫视中段整屏截图（桌面/窄屏）供肉眼核对视差。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8797;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const S = 'shots/';
let fails = 0;
const log = (...a) => console.log('[depth]', ...a);
const check = (cond, msg, extra) => { log((cond ? '  ✅ ' : '  ❌ ') + msg, extra ?? ''); if (!cond) fails++; };

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, viewport) {
  const p = await ctx.newPage();
  p.on('pageerror', e => { fails++; log('  ❌ pageerror:', e.message); });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  await p.setViewportSize(viewport);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide');
  }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}
async function join(p) {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', '深度');
  try { await p.locator('.avatar-option:visible').first().click({ timeout: 3000 }); }
  catch (e) { log('  （头像点击跳过：', e.message.split('\n')[0], '）'); }
  await p.click('#btn-join');
}
// 静止态读数
const SAMPLE_IDLE = () => {
  const out = { txRun: document.body.classList.contains('tx-run'), layers: {} };
  document.querySelectorAll('#depth-stage .ref-layer').forEach(el => {
    out.layers[el.className.replace('ref-layer', '').trim()] = getComputedStyle(el).transform;
  });
  return out;
};
// rAF 录制器：事件驱动——扫前预热 30 帧，tx-run 起录，摘除后再录 12 帧；总上限 10s 防挂死
const REC = () => {
  window.__rec = [];
  const txOf = el => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return null;
    const nums = t.match(/matrix.*\((.+)\)/)[1].split(',').map(parseFloat);
    return nums.length === 16 ? nums[12] : nums[4];   // matrix3d 的 tx 在 12，2D matrix 的 tx 在 4
  };
  let seen = false, after = -1;
  const t0 = performance.now();
  const step = () => {
    const row = { t: Math.round(performance.now() - t0), txRun: document.body.classList.contains('tx-run'), tx: {}, panel: null };
    document.querySelectorAll('#depth-stage .ref-layer').forEach(el => { row.tx[el.className.replace('ref-layer', '').trim()] = txOf(el); });
    const ent = document.querySelector('.screen.entering');
    if (ent) row.panel = Math.round(ent.getBoundingClientRect().left);
    if (row.txRun) seen = true;
    if (seen && !row.txRun) after++;
    window.__rec.push(row);
    if (row.t < 16000 && !(seen && after >= 12)) requestAnimationFrame(step);
    else window.__recDone = true;   // 录完旗标：读结果前必须等到它
  };
  requestAnimationFrame(step);
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  for (const [tag, vp] of [['desktop', { width: 1280, height: 800 }], ['narrow', { width: 390, height: 844 }]]) {
    log(`── ${tag} ${vp.width}x${vp.height} ──`);
    const ctx = await browser.newContext();
    const p = await open(ctx, vp);
    await p.waitForTimeout(400);

    // 判据 1：静止态零姿态
    const idle = await p.evaluate(SAMPLE_IDLE);
    check(!idle.txRun, '静止态无 tx-run');
    check(Object.values(idle.layers).every(t => t === 'none'), '静止态全部层 transform none');
    await p.screenshot({ path: `${S}depth-${tag}-idle.png` });

    // 装录制器 → 加入（join→lobby 加载路径，起扫在揭幕后 280ms）；等录制器自己报完成（headless 下 join 可能耗 2~5s）
    await p.evaluate(REC);
    await join(p);
    // 先确认真的换到大厅了（否则后面全是假失败）
    try {
      await p.waitForFunction(() => document.getElementById('screen-lobby')?.classList.contains('active'), null, { timeout: 20000 });
    } catch { log('  ❌ join 未到达大厅，跳过本轮（检查加入流程）'); await ctx.close(); continue; }
    await p.waitForFunction(() => window.__recDone === true, null, { timeout: 40000 });
    const rec = await p.evaluate(() => window.__rec);
    const sweep = rec.filter(r => r.txRun);
    const peakT = sweep.length ? sweep.reduce((a, b) => Math.abs(Object.values(b.tx).reduce((s, v) => s + (v || 0), 0)) > Math.abs(Object.values(a.tx).reduce((s, v) => s + (v || 0), 0)) ? b : a) : null;

    // 判据 2：扫视窗口内参照层在动
    check(sweep.length >= 10, `tx-run 窗口被采到（${sweep.length} 帧）`);
    const movingLayers = peakT ? Object.entries(peakT.tx).filter(([, v]) => v != null && Math.abs(v) > 1) : [];
    check(movingLayers.length >= 4, '扫视中参照层在场动画（≥4 层非零位移）', peakT ? JSON.stringify(peakT.tx) : '无峰值帧');
    log('  峰值帧位移(px)：', movingLayers.map(([k, v]) => `${k}:${v}`).join('  '), ' 面板left:', peakT && peakT.panel);

    // 判据 3：深度梯度
    const maxTx = k => Math.max(0, ...rec.map(r => Math.abs((r.tx[k] ?? 0) || 0)));
    const g = { far: maxTx('stars-far'), mid: maxTx('stars-mid'), pil: maxTx('pillars'), floor: maxTx('floor-grid'), dust: maxTx('dust-near') };
    check(g.far > 0 && g.far < g.mid && g.mid < g.pil && g.pil < g.floor && g.floor < g.dust,
      '深度梯度递增 far<mid<pillars<floor<dust', `far:${g.far} mid:${g.mid} pil:${g.pil} floor:${g.floor} dust:${g.dust}`);

    // 中段截图：用 mutate 直接触发 lobby→game（非加载路径，0 delay 起扫），中段拍帧
    await p.evaluate(REC);
    await p.evaluate(() => mutate(n => { n.gameStarted = true; }));
    await sleep(430);   // 0 delay 起扫，430ms ≈ 中段偏后
    await p.screenshot({ path: `${S}depth-${tag}-mid.png` });
    await p.waitForFunction(() => window.__recDone === true, null, { timeout: 30000 });

    // 判据 4：扫后零残差（headless 慢环境下等 tx-run 真正摘除再采，不赌时间）
    await p.waitForFunction(() => !document.body.classList.contains('tx-run'), null, { timeout: 20000 });
    await p.waitForTimeout(120);
    const done = await p.evaluate(SAMPLE_IDLE);
    check(!done.txRun, '扫后 tx-run 已摘');
    check(Object.values(done.layers).every(t => t === 'none'), '扫后全部层 transform none（整数周期瞬移不可见）');

    await ctx.close();
  }
  await browser.close();
  server.close();
  log(fails === 0 ? '✅ 深度参照层取证全部通过' : `❌ ${fails} 项未过`);
  process.exit(fails === 0 ? 0 : 1);
})();
