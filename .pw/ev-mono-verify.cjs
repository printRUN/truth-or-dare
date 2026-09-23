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

  // ══ R2a：竖屏真机档（inspect=1，SPEED=1，390×844）——「回布局→跟人」机制 ══
  // （旧 autotest 档 SPEED=0.15 下走位 117ms/回合、占空比 ~5%，软渲里 25s 只能采到 0-1 个 HOPPING 样本=纯噪声；
  //   真机档走位 ~1.8s/回合才可断言。锚距读 __mono.distAnchor()，不硬编码视口数学。）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    ok('R2a rigSnap 访问器在', await p.evaluate(() => !!window.__mono && !!__mono.rigSnap));
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    const anchor = await p.evaluate(() => __mono.distAnchor());
    await p.evaluate(() => {
      window.__F = []; window.__fOn = true;
      const snap = () => {
        if (!window.__fOn) return;
        const G = __mono.state;
        const w = __mono.pawnWorld(), r = __mono.rigSnap();
        window.__F.push({ ph: G.phase, turn: G.turn, w, r, lo: document.body.classList.contains('loperf') });
        setTimeout(snap, 70);
      };
      snap();
    });
    // 真实 UI 点击驱动 40s（掷骰/买地/命运弹窗）
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const vis = await p.evaluate(() => ({
        roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
        buyYes: document.getElementById('btn-buy-yes') && !document.getElementById('buy-modal').hidden,
        gen: !document.getElementById('gen-modal').hidden,
      })).catch(() => ({ dead: true }));
      if (vis.dead) break;
      try {
        if (vis.buyYes) await p.click('#btn-buy-yes', { timeout: 1500 });
        else if (vis.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (vis.roll) await p.click('#act-roll', { timeout: 1500 });
      } catch (e) {}
      await p.waitForTimeout(250);
    }
    const F = await p.evaluate(() => { window.__fOn = false; return window.__F; }).catch(() => []);
    const loN = F.filter(e => e.lo).length;
    const hopSamples = F.map((e, i) => Object.assign({ i }, e)).filter(e => e.ph === 'HOPPING' && !e.lo && e.w && e.w[e.turn]);
    console.log(`     （R2a 竖屏 390×844：全样本 ${F.length}，降级 ${loN}，HOPPING 未降级 ${hopSamples.length}；锚距 near=${anchor.near.toFixed(2)} base=${anchor.base.toFixed(2)}）`);
    // R2a 钉竖屏「回布局→跟人」机制（2026-09-22 镜头随流程轮）：beginTurn 走 approachTurn（回全景对准→推近），
    // 真机节奏下近景段仍可能被快速掷骰打断 → movePawn 的 dist/elev 阻尼自愈。断言=采样带 + 段内收敛。
    ok(`R2a 采到 HOPPING 未降级样本（${hopSamples.length} 个）`, hopSamples.length >= 4, hopSamples.length);
    const near = anchor.near, base = anchor.base;
    const dists = hopSamples.map(e => +e.r.dist.toFixed(2));
    ok(`R2a 走位 dist 在收敛带 (${(near - 1.5).toFixed(1)}, ${(base + 0.5).toFixed(1)})`, hopSamples.length > 0 && dists.every(d => d > near - 1.5 && d < base + 0.5), [...new Set(dists)]);
    const runs = [];
    { let run = [];
      for (const e of hopSamples) {
        if (run.length && e.i === run[run.length - 1].i + 1) run.push(e);
        else { if (run.length) runs.push(run); run = [e]; }
      }
      if (run.length) runs.push(run);
    }
    const convBad = [];
    const tgtJumps = [];
    const azJumps = [];
    for (const r of runs) {
      if (r.length < 2) continue;
      const lastD = r[r.length - 1].r.dist, lastE = r[r.length - 1].r.elev * 57.3;
      if (!(lastD < near + 1.5 && Math.abs(lastE - 55) < 2.5)) convBad.push({ end: { d: +lastD.toFixed(2), e: +lastE.toFixed(1) } });
      for (let i = 1; i < r.length; i++) {
        if (r[i].r.dist > r[i - 1].r.dist + 0.4) convBad.push({ rise: [+r[i - 1].r.dist.toFixed(1), +r[i].r.dist.toFixed(1)] });
        const a = r[i - 1].r.tgt, b = r[i].r.tgt;   // 瞬跳只在段内判：跨回合镜头本来就要从上一家棋子挪到这一家
        if (Math.hypot(b.x - a.x, b.z - a.z) > 2.2) tgtJumps.push(r[i].i);   // 阻尼上界以上=真瞬跳
        if (i >= 2) {   // 段内 az 角速率上界（首样本豁免=approachTurn 推近的合法起段转身）：70ms 采样间 az 转过 >23° ≈ 甩镜级角速率，
          const dA = Math.abs(Math.atan2(Math.sin(r[i].r.az - r[i - 1].r.az), Math.cos(r[i].r.az - r[i - 1].r.az)));
          if (dA > 0.4) azJumps.push({ i: r[i].i, dAz: +dA.toFixed(2) });   // camTo 最短弧被删（绕远弧）会在此现形
        }
      }
    }
    ok('R2a 多样本走位段收敛到近景档（末样本 dist<near+1.5 且 elev≈55°；dist 不反向增大）', runs.some(r => r.length >= 2) && convBad.length === 0, convBad);
    ok('R2a 走位段内无 tgt 瞬跳', tgtJumps.length === 0, tgtJumps);
    ok('R2a 走位段内无 az 甩镜（角速率上界，钉 camTo 最短弧）', azJumps.length === 0, azJumps);
    // 「回布局」支柱负向钉死（终审 A P1-1）：走位与走位之间必须存在全景距样本——删掉 approachTurn 的 back 腿即红
    const sojourns = F.filter(e => e.ph !== 'HOPPING' && !e.lo && e.r && e.r.dist > base - 1.5).length;
    ok(`R2a 回合间存在回全景穿越（${sojourns} 个全景距样本）`, sojourns >= 1, sojourns);
    // 近景 elev 收敛带（自愈中途/卡片近景 32° 档被掐回程起步都是合法瞬态，下界放 30）+ focusK 1
    const elevs = [...new Set(hopSamples.map(e => +(e.r.elev * 57.3).toFixed(0)))];
    const fks = [...new Set(hopSamples.map(e => +e.r.focusK.toFixed(2)))];
    ok('R2a HOPPING elev∈收敛带[30,56] focusK=1', elevs.every(e => e >= 30 && e <= 56) && fks.length === 1 && fks[0] === 1, { elevs, fks });
    await ctx.close();
  }

  // ══ R2b：桌面 autotest，镜头落定值 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 30000 });
    // 2026-09-22 镜头随流程轮：开局走 approachTurn（先回全景对准新行动者，再推近），AWAIT_ROLL 翻转瞬间镜头还在半途——
    // 等「近景签名」（elev≈55°）出现再采样，钉的仍是落定值。
    await p.waitForFunction(() => {
      const r = window.__mono && __mono.rigSnap && __mono.rigSnap();
      return !!r && Math.abs(r.focusK - 1) < 1e-6 && Math.abs(r.elev * 57.3 - 55) < 0.5;
    }, null, { timeout: 15000 });
    const r0 = await p.evaluate(() => __mono.rigSnap());
    ok('R2b 开局近景 focusK=1 elev≈55°（approachTurn 两段落定后采样）', Math.abs(r0.focusK - 1) < 1e-6 && Math.abs(r0.elev * 57.3 - 55) < 0.5, r0);
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
      // 阻尼 0.90→0.92（2026-09-22 镜头随流程轮，用户点名「推拉缓慢防晕」）：终审 B 实测新旧中位 0.486→0.505~0.54（+5~11%），阈值 0.75→0.85 留慢机余量但保判别力
      ok(`R1 真机走位 tgt 跟随棋子×0.8（${hop.length} 样本，中位误差 ${med.toFixed(2)}）`, hop.length >= 8 && med < 0.85, med);
      console.log(`     （R1 游戏段 640×520：hop 样本 ${hop.length}，全样本 ${F.length}，降级 ${F.filter(e => e.lo).length}）`);
      let collapse = 0;
      for (let i = 1; i < hop.length; i++) {   // 连续 2 样本才算塌缩（抽卡回中后的阻尼展开首帧是合法瞬态）
        const a = hop[i - 1], b = hop[i];
        if (Math.hypot(b.w[b.turn][0], b.w[b.turn][2]) > 1.5 && Math.hypot(b.r.tgt.x, b.r.tgt.z) < 0.35
            && Math.hypot(a.r.tgt.x, a.r.tgt.z) < 0.6) collapse++;
      }
      ok('R1 走位 tgt 不回中塌缩', collapse === 0, { collapse });
      const elevs = [...new Set(hop.map(e => +(e.r.elev * 57.3).toFixed(0)))];
      // 2026-09-22 镜头随流程轮：approachTurn 让走子起步时镜头仍在滑入途中（终审 B 实采 45~54° 中途值），
      // 旧的集合相等 {55,42} 语义失效 → 改收敛带（与 R2a 同款 [30,56]），且末样本必须已到 55°（落定契约保留）
      ok('R1 HOPPING elev∈收敛带[30,56] 且收走位到 55°',
        elevs.every(v => v >= 30 && v <= 56) && Math.abs(hop[hop.length - 1].r.elev * 57.3 - 55) < 2.5, elevs);
    }
    await ctx.close();
    }
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
