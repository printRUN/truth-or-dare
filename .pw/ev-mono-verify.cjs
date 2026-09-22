// 修后验证：monopoly 镜头跟随机制 + perfWatch 预热豁免
// R2=autotest 档（desktop+portrait）：走位期间 tgt 应贴 pawn×0.8、dist=nearDist、无回中跳变
// R1=无参数真 UI 热座档：bodyLo 不得在 8s 前翻转（预热豁免生效）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8933;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots/ev-mono-fixed';
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ` | ${JSON.stringify(extra).slice(0, 160)}` : '')); if (!cond) fails++; };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ R2a：竖屏 autotest ══
  {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 860 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 30000 });
    const nd = await p.evaluate(() => ({ base: Math.round(__mono.rigSnap ? 0 : 0), nd: !!window.__mono.rigSnap }));
    ok('R2a rigSnap 访问器在', nd.nd);
    // 采 HOPPING 期间的 rig/棋子关系：120ms × 直到走出一次 ≥3 步的移动
    await p.evaluate(() => {
      window.__F = []; window.__fOn = true;
      const snap = () => {
        if (!window.__fOn) return;
        const G = __mono.state;
        const w = __mono.pawnWorld(), r = __mono.rigSnap();
        window.__F.push({ ph: G.phase, turn: G.turn, pos: G.players.map(x => x.pos), w, r, lo: document.body.classList.contains('loperf') });
        setTimeout(snap, 60);
      };
      snap();
    });
    const t0 = Date.now();
    let hopSamples = [];
    while (Date.now() - t0 < 25000 && hopSamples.length < 26) {
      const st = await p.evaluate(() => ({
        ph: __mono.state.phase, modal: !document.getElementById('buy-modal').hidden,
        gen: !document.getElementById('gen-modal').hidden, handoff: !document.getElementById('handoff').hidden,
      })).catch(() => ({ dead: true }));
      if (st.dead) break;
      if (st.modal) await p.evaluate(() => __mono.buy(true));
      else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
      else if (st.handoff) await p.evaluate(() => __mono.handoff());
      else if (st.ph === 'AWAIT_ROLL') await p.evaluate(() => __mono.step());
      await p.waitForTimeout(120);
      hopSamples = await p.evaluate(() => window.__F.filter(e => e.ph === 'HOPPING'));
    }
    await p.evaluate(() => { window.__fOn = false; });
    // autotest 档保留旧降级节奏（设计如此）：镜头断言只取未降级样本；SPEED=0.15 加速下阻尼滞后放大，阈值放宽
    const hopAll = await p.evaluate(() => window.__F.filter(e => e.ph === 'HOPPING'));
    hopSamples = hopAll.filter(e => !e.lo && e.w && e.w[e.turn]);
    // R2a 只钉竖屏近景机制（距离/仰角/不瞬跳）；跟随收敛与不回中由 R1 真机档钉（autotest 档 bodyLo 保留旧早翻转节奏，动画样本太少不稳定）
    const dists = hopSamples.map(e => +e.r.dist.toFixed(2));
    const distOk = dists.every(d => d > 4.5 && d < 8.0);
    ok(`R2a 近景距离 4.5~8.0（竖屏 nearDist≈7.5，NEAR_HALF_W 1.6 容骰子横移）`, hopSamples.length > 0 && distOk, [...new Set(dists)]);
    const tgtJumps = [];
    for (let i = 1; i < hopSamples.length; i++) {
      const a = hopSamples[i - 1].r.tgt, b = hopSamples[i].r.tgt;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 2.2) tgtJumps.push(i);   // 阻尼上界以上=真瞬跳
    }
    ok('R2a 无 tgt 瞬跳', tgtJumps.length === 0, tgtJumps);
    // 近景 elev 55 + focusK 1
    const elevs = [...new Set(hopSamples.map(e => +(e.r.elev * 57.3).toFixed(0)))];
    const fks = [...new Set(hopSamples.map(e => +e.r.focusK.toFixed(2)))];
    ok('R2a HOPPING elev=55° focusK=1', elevs.length === 1 && elevs[0] === 55 && fks.length === 1 && fks[0] === 1, { elevs, fks });
    await ctx.close();
  }

  // ══ R2b：桌面 autotest，镜头落定值 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 30000 });
    const r0 = await p.evaluate(() => __mono.rigSnap());
    ok('R2b 开局近景 focusK=1 elev≈55°', Math.abs(r0.focusK - 1) < 1e-6 && Math.abs(r0.elev * 57.3 - 55) < 0.5, r0);
    // 近景 dist 应为桌面 nearDist=4.8（full 7.57 不再被 elev 55 污染）
    ok('R2b 近景 dist≈4.8（不再 0.667×18.7）', Math.abs(r0.dist - 4.8) < 0.3, r0.dist);
    // 触发一次 resize（模拟 bodyLo 降级时的 sizeScene）：近景 dist 不得被打回全景
    await p.setViewportSize({ width: 1100, height: 780 });
    await p.waitForTimeout(300);
    const r1 = await p.evaluate(() => __mono.rigSnap());
    ok('R2b resize 不覆写近景 dist（autoDist 门禁）', Math.abs(r1.dist - 4.8) < 0.45, r1.dist);
    await ctx.close();
  }

  // ══ R1：无参数真 UI 热座档——bodyLo 预热豁免 + 真实渲染下的镜头跟随全程采样 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    const t0 = Date.now();
    let flipT = -1;
    while (Date.now() - t0 < 20000) {
      const lo = await p.evaluate(() => document.body.classList.contains('loperf'));
      if (lo) { flipT = Date.now() - t0; break; }
      await p.waitForTimeout(200);
    }
    ok('R1 真机路径 bodyLo 不在 8s 前翻转（预热豁免）', flipT < 0 || flipT > 8000, { flipTms: flipT });
    console.log(`     （本机软渲 ${flipT < 0 ? '20s 内未降级' : '于 ' + flipT + 'ms 降级'}）`);
    await p.close(); await ctx.close();
    // 游戏段换小视口（本机软渲 1100×800 帧耗贴阈值，负载抖动会按设计降级；640×520 保动画档验跟随）
    {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    {
      // 开一局本地热座（2 人、跳过交接），真实 UI 点击驱动，采样 HOPPING 镜头跟随
      await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
      await p.click('#btn-start');
      await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
      await p.evaluate(() => {
        window.__F = []; window.__fOn = true;
        const snap = () => {
          if (!window.__fOn) return;
          try {
            const G = __mono.state;
            window.__F.push({ ph: G.phase, turn: G.turn, w: __mono.pawnWorld(), r: __mono.rigSnap(), lo: document.body.classList.contains('loperf') });
          } catch (e) {}
          setTimeout(snap, 70);
        };
        snap();
      });
      // 真实点击驱动 45s：掷骰/买地
      const d0 = Date.now();
      let shots = 0;
      while (Date.now() - d0 < 45000) {
        const vis = await p.evaluate(() => ({
          roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
          buyYes: document.getElementById('btn-buy-yes') && !document.getElementById('buy-modal').hidden,
        })).catch(() => ({ dead: true }));
        if (vis.dead) break;
        try {
          if (vis.buyYes) await p.click('#btn-buy-yes', { timeout: 1500 });
          else if (vis.roll) await p.click('#act-roll', { timeout: 1500 });
        } catch (e) {}
        if ((Date.now() - d0) / 9000 > shots) { shots++; try { await p.screenshot({ path: `${SHOTS}/r1-${String(shots).padStart(2, '0')}.png` }); } catch (e) {} }
        await p.waitForTimeout(250);
      }
      const F = await p.evaluate(() => { window.__fOn = false; return window.__F; }).catch(() => []);
      const hop = F.filter(e => e.ph === 'HOPPING' && e.w && e.w[e.turn] && !e.lo);
      const errs = hop.map(e => Math.hypot(e.r.tgt.x - e.w[e.turn][0] * 0.8, e.r.tgt.z - e.w[e.turn][2] * 0.8)).sort((a, b) => a - b);
      const med = errs.length ? errs[Math.floor(errs.length / 2)] : -1;
      const loN = F.filter(e => e.lo).length;
      console.log(`     （R1 对局 ${F.length} 样本中降级 ${loN}——负载下按设计走阶梯；8s 前不翻转已由上一条钉住）`);
      ok(`R1 真机走位 tgt 跟随棋子×0.8（${hop.length} 样本，中位误差 ${med.toFixed(2)}）`, hop.length >= 8 && med < 0.75, med);
      console.log(`     （R1 游戏段 640×520：hop 样本 ${hop.length}，全样本 ${F.length}，降级 ${F.filter(e => e.lo).length}）`);
      let collapse = 0;
      for (let i = 1; i < hop.length; i++) {   // 连续 2 样本才算塌缩（抽卡回中后的阻尼展开首帧是合法瞬态）
        const a = hop[i - 1], b = hop[i];
        if (Math.hypot(b.w[b.turn][0], b.w[b.turn][2]) > 1.5 && Math.hypot(b.r.tgt.x, b.r.tgt.z) < 0.35
            && Math.hypot(a.r.tgt.x, a.r.tgt.z) < 0.6) collapse++;
      }
      ok('R1 走位 tgt 不回中塌缩', collapse === 0, { collapse });
      const elevs = [...new Set(hop.map(e => +(e.r.elev * 57.3).toFixed(0)))];
      ok('R1 HOPPING elev∈{55,42}', elevs.every(v => v === 55 || v === 42) && elevs.includes(55), elevs);
    }
    await ctx.close();
    }
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
