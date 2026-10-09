// ev-mono-fall.cjs — W3 破产倒地（两段式玩具语言+变灰谢幕，fallAndFade 单入口）+ cageTok 换图竞态修复取证（2026-10-08）
// 取证纪律（评审 #20 同款）：禁像素断言（软渲必假红）——全走 __mono AUTOTEST 访问器
//（fallFx={i,t0,phase} 只增不改 / pawnPose=visible+rotation+材质灰度 / plates / fallLive / snap / cage / remap）。
// 节奏纪律：AUTOTEST 软渲下 perfWatch 会在首个慢窗（60 帧 med>26ms）把 bodyLo 翻 true（探针档既有语义，
// 跳帧提速）——本探针所有「动画态断言」都压在页面加载后 ~4s 内完成，且采样前断言非 bodyLo（A0）。
// 帧量化说明：软渲 rAF ~40-125ms/帧，倾倒后段 27-37ms 的小窗可能整窗跳过——fallFx 断言取
// enter/topple/down 有序子集（down 帧钉死终态灰度），两段式小弹拍作证据记录不设硬门（A9）。
// A 段（autotest 3D，无 loperf——验动画必须真渲染）：charge 倒地 ramp+echo 豁免+cageTok 竞态+
//    collectAll 收口+终态+新局复位。B（REDUCED）/C（loperf）：直落语义。D：snap 驱动的 bust op 回放路径
//    （applyGameSnapshot diff 编译 → playReplayOp('bust') → bustRitual → fallAndFade，与观战端同一编译器+同一入口；
//    真机双端传输由 probe-mono-net 覆盖）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 8937;   // 挑未用口（在册：8911/8931/8933/8953/8965/8994/9041/9043/9045/9047）
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
let pass = 0, fail = 0;
const ok = (msg, c, extra) => { if (c) { pass++; console.log('  ✅', msg, extra !== undefined ? '| ' + JSON.stringify(extra).slice(0, 170) : ''); } else { fail++; console.log('  ❌', msg, extra !== undefined ? '| ' + JSON.stringify(extra).slice(0, 170) : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHASES = ['enter', 'topple', 'bounce', 'lie', 'fade', 'down'];
const phaseChain = (arr, need) => {   // 相位按序出现（帧量化允许小窗整跳；need=必须到场的相位前缀）
  let k = 0;
  for (const e of arr) { while (k < PHASES.length && e.phase !== PHASES[k]) k++; if (k < PHASES.length) k++; }
  return need.every(ph => arr.some(e => e.phase === ph)) &&
    arr.filter(e => PHASES.includes(e.phase)).every((e, idx, a) => idx === 0 || PHASES.indexOf(e.phase) >= PHASES.indexOf(a[idx - 1].phase));
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ A：主页面（autotest 3D，SPEED=0.15，不加 loperf——动画段必须真渲染）══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const gl = await p.evaluate(() => window.__mono.sceneInfo());
    ok('A0 3D 场景已建且非 bodyLo（采样前断言，动画段前提）', gl.gl && gl.tiles === 24 && gl.pawns === 2 && gl.bodyLo === false, gl);
    await p.evaluate(() => { const M = window.__mono; M.state.owners[3] = 0; M.state.owners[5] = 0; M.forceMoney(0, 100); });

    // 16ms 采样 recorder：抓玩家 0 在飞倒地窗口（SPEED=0.15 全程 ~230ms）
    await p.evaluate(() => {
      window.__fr = [];
      window.__ri = setInterval(() => {
        const pose = window.__mono.pawnPose()[0];
        window.__fr.push({ t: Math.round(performance.now()), live: window.__mono.fallLive()[0], vis: pose.vis, rx: pose.rx, ry: pose.ry, col: pose.col });
      }, 16);
    });
    // 破产 + echo 快照当场砸进来（同一同步块，先于任何 rAF——豁免门必须当场扛住）
    const burst = await p.evaluate(() => {
      const M = window.__mono;
      M.pay(0, 5000, null);   // charge 现金不足 → bustRitual → fallAndFade(0)（入口复位 visible + fallTok 在飞）
      const g = JSON.parse(JSON.stringify(M.state));   // echo 快照=破产终态重发（观战端行动者回声同构）
      M.snap(g);
      const pose = M.pawnPose()[0];
      return { live: M.fallLive()[0], vis: pose.vis, rx: pose.rx, ry: pose.ry };
    });
    ok('A1 echo 快照当场不杀在飞（live=true 且入口复位 vis=true）', burst.live === true && burst.vis === true, burst);
    ok('A2 起手朝向离桌心（rotation.y=pawnSlot 方位角，非 0）', burst.ry > 0.3 && Math.abs(burst.ry - 0.785) < 0.6, burst);
    // echo 快照补发两连（armed 后 prev diff 恒零，只 exercised 豁免分支）
    await sleep(60);
    await p.evaluate(() => { const M = window.__mono; M.snap(JSON.parse(JSON.stringify(M.state))); });
    await sleep(80);
    await p.evaluate(() => { const M = window.__mono; M.snap(JSON.parse(JSON.stringify(M.state))); });

    // ⑤ cageTok 换图竞态（趁 bodyLo 未翻：收笼循环只在 canFlyNotes 时创建）：玩家 1 落扣 → 收笼在飞 → remap 置 null
    //（用玩家 1——玩家 0 已破产，syncJailCages 的 want 对破产者不成立）
    const race = await p.evaluate(() => { window.__mono.forceJail(1); return window.__mono.cage(); });
    await sleep(200);   // 落扣+squash 落定（240+110 ms×0.15 ≈ 53ms），笼立着
    const race2 = await p.evaluate(() => {
      const M = window.__mono;
      const before = M.cage();
      M.state.players[1].jailed = false; M.state.players[1].jailTurns = 0;
      M.forceMoney(1, M.state.players[1].cash);   // updateHUD → syncJailCages：收笼循环排入 rAF（此刻 jailCage 仍在）
      const rebuilt = M.remap('world');           // 同步换图：rebuildBoardVisuals 置 jailCage=null + cageTok++
      return { before, rebuilt, after: M.cage() };
    });
    ok('A3 ⑤换图竞态：收笼在飞时 remap 置 null + cageTok bump（修复前 TypeError）', race2.rebuilt === true && race2.after.has === false && race2.after.tok > race2.before.tok && race.has === true, { before: race2.before.tok, after: race2.after.tok });
    await sleep(150);   // 放收笼循环首帧跑完（修复前：my===cageTok 且 jailCage=null → 踩空 TypeError）

    // ②collectAll 路径收口（趁 bodyLo 未翻）：牌堆顶换「生日收 ¥500」，玩家 1 资不抵债 → bustRitual → fallAndFade(1)
    await p.evaluate(() => { const M = window.__mono; M.state.decks.chance[0] = 0; M.forceMoney(1, 100); M.forceMoney(0, 10000); });
    const ra = p.evaluate(() => window.__mono.resolveAt(0, 3)).catch(() => {});
    await p.waitForFunction(() => window.__mono.state.players[1] && window.__mono.state.players[1].bankrupt, null, { timeout: 15000 });
    await p.evaluate(() => clearInterval(window.__ri));
    const fr = await p.evaluate(() => window.__fr);
    const liveS = fr.filter(s => s.live);
    ok('A4 ①倒地中段 vis=true（fallAndFade 复位生效，echo 后仍演给人看）', liveS.length >= 1 && liveS.some(s => s.vis === true && s.rx > 0.15), { samples: liveS.length, hit: liveS.filter(s => s.vis && s.rx > 0.15).slice(-1) });
    const rxs = liveS.filter(s => s.vis === true).map(s => s.rx);
    ok('A5 ①rotation.x 渐进（在飞窗口 0→0.85 采样）', rxs.length >= 1 && Math.min(...rxs) >= 0 && Math.max(...rxs) > 0.2, { min: Math.min(...rxs), max: Math.max(...rxs) });
    ok('A6 变灰采样（在飞窗口 color 离开本色）', liveS.some(s => s.col && s.col !== '#22d3ee'), { cols: [...new Set(liveS.map(s => s.col))] });
    const fx0 = await p.evaluate(() => window.__mono.fallFx().filter(e => e.i === 0));
    ok('A7 ②charge 路径收口：fallFx(0) enter→…→down 有序（中段小窗=帧量化可整跳，down 帧钉终态）', phaseChain(fx0, ['enter', 'down']), fx0.map(e => e.phase).join(','));
    const tTop = fx0.find(e => e.phase === 'topple'), tBn = fx0.find(e => e.phase === 'bounce');
    ok('A9 两段式小弹拍证据（topple→bounce dt≈420×SPEED=63ms；软渲跳帧可能整窗跳过任一拍，则仅记录旁证不作硬门）', !tTop || !tBn || (tBn.t0 - tTop.t0 > 20 && tBn.t0 - tTop.t0 < 400), { dt: tTop && tBn ? tBn.t0 - tTop.t0 : null, phases: fx0.map(e => e.phase).join(',') });

    // 双倒地终态：躺平 0.85rad + 灰材质钉死 + transparent 还原 + 名牌 opacity 淡出归零
    await p.waitForFunction(() => { const M = window.__mono; return !M.fallLive()[0] && !M.pawnPose()[0].vis && M.plates()[0].op < 0.05; }, null, { timeout: 6000 });
    const fin = await p.evaluate(() => { const q = window.__mono.pawnPose()[0]; return Object.assign(q, { plate: window.__mono.plates()[0] }); });
    ok('A10 终态：rx≈0.85 + 888888 + roughness 0.9 + transparent 还原', fin.rx > 0.8 && fin.rx < 0.9 && fin.col === '#888888' && fin.rough === 0.9 && fin.tr === false && fin.op === 1, fin);
    {   // A10c 世界方向断言（终审 P0-1 盲区堵口）：倒地姿态下头顶尖量的世界方位必须=倒地起拍写入的 yaw（=离桌心方位）——
      // 'XYZ' order 的旧实现 rotation.x 永远朝世界 +Z 倒，upA 恒 0 与 ry 差满角；YXZ 下 upA≈ry（差 <0.3rad）。
      // 基准用 ry（pawn 自身姿态，落定后不变）而非 slotA（活状态，对局继续推进 pos 后会漂——实测踩过）
      const d = Math.atan2(Math.sin(fin.upA - fin.ry), Math.cos(fin.upA - fin.ry));
      ok('A10c 世界方向：头顶尖量指向倒地 yaw=离桌心方位（|wrap(upA-ry)|<0.3rad，rotation.order=YXZ 生效）', Math.abs(d) < 0.3, { upA: fin.upA, ry: fin.ry, slotA: fin.slotA, diff: +d.toFixed(4) });
    }
    ok('A10b 终态：名牌谢幕（opacity 0 持久直写；visible 归 plateVisibility 每帧 cull=既有语义）', fin.plate.op === 0, fin.plate);
    await p.waitForFunction(() => { const M = window.__mono; return !M.fallLive()[1] && !M.pawnPose()[1].vis && M.plates()[1].op < 0.05; }, null, { timeout: 6000 });
    const fx1 = await p.evaluate(() => window.__mono.fallFx().filter(e => e.i === 1));
    const fin1 = await p.evaluate(() => window.__mono.pawnPose()[1]);
    ok('A11 ②collectAll 路径收口：fallFx(1) enter→…→down 有序（内联隐身处已走 fallAndFade）', phaseChain(fx1, ['enter', 'down']), fx1.map(e => e.phase).join(','));
    ok('A12 collectAll 破产终态：倒地隐身（rx≈0.85 后 visible=false）', fin1.vis === false && fin1.rx > 0.8, fin1);
    await ra;

    // ④ 新局 pose 复位（快照路径 buildPawns 不重跑：倒地 pose/灰材质残留必须被 resetPawnPose 收编；顺带把 endGame 的 OVER 拉回 AWAIT_ROLL）
    const rst = await p.evaluate(() => {
      const M = window.__mono;
      const g = JSON.parse(JSON.stringify(M.state));
      g.phase = 'AWAIT_ROLL';
      g.players[0].bankrupt = false; g.players[0].cash = 10000; g.players[0].pos = 3; g.players[0].jailed = false;
      M.snap(g);
      const q = M.pawnPose()[0];
      return { pose: q, plate: M.plates()[0] };
    });
    ok('A13 ④新局复位：rx/ry 归零 + 本色 + roughness 0.4 + transparent 还原', rst.pose.vis === true && rst.pose.rx === 0 && rst.pose.ry === 0 && rst.pose.col === '#22d3ee' && rst.pose.rough === 0.4 && rst.pose.tr === false && rst.pose.op === 1 && rst.pose.y === 0.34, rst.pose);
    ok('A13b 新局复位：名牌 opacity 拉回 1', rst.plate.op === 1, rst.plate);
    ok('A14 A 段零 pageerror（echo/竞态/双破产全链路）', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ B：REDUCED——直落语义（visible 立即 false、零 fallFx、零动画）══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const rb = await p.evaluate(() => {
      const M = window.__mono;
      M.forceMoney(0, 100);
      M.pay(0, 5000, null);   // REDUCED：fallAndFade flat() 直落
      const q = M.pawnPose()[0];
      return { vis: q.vis, live: M.fallLive()[0], fx: M.fallFx().length, plate: M.plates()[0] };
    });
    ok('B1 REDUCED 直落：pay 返回即本体+名牌双隐身（同步采样，无 rAF 插窗）', rb.vis === false && rb.plate.vis === false, rb);
    ok('B2 REDUCED 零 fallFx 段（无 enter/topple，直落不进动画）', rb.live === false && rb.fx === 0, rb);
    ok('B3 REDUCED 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ C：loperf（bodyLo 跳帧档）——直落语义分档写 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const glc = await p.evaluate(() => window.__mono.sceneInfo());
    ok('C0 loperf 档成立（bodyLo=true，分档前提）', glc.bodyLo === true && glc.pawns === 2, glc);
    const rc = await p.evaluate(() => {
      const M = window.__mono;
      M.forceMoney(0, 100);
      M.pay(0, 5000, null);
      const q = M.pawnPose()[0];
      return { vis: q.vis, live: M.fallLive()[0], fx: M.fallFx().length, plate: M.plates()[0] };
    });
    ok('C1 loperf 直落：pay 返回即双隐身 + 零 fallFx', rc.vis === false && rc.plate.vis === false && rc.live === false && rc.fx === 0, rc);
    ok('C2 loperf 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ D：bust op 回放路径（snap 驱动，与观战端同一编译器+同一入口）——
  //    快照先隐（:560 visible=!bankrupt）→ bust op 编译 → playReplayOp → bustRitual → fallAndFade 入口复位 → 倒地可见地演出来 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const d = await p.evaluate(() => {
      const M = window.__mono;
      window.__dr = [];
      window.__di = setInterval(() => {
        const pose = M.pawnPose()[0];
        window.__dr.push({ t: Math.round(performance.now()), vis: pose.vis, rx: pose.rx, ry: pose.ry, pop: M.plates()[0].op, live: M.fallLive()[0] });
      }, 16);
      const g1 = JSON.parse(JSON.stringify(M.state));   // 快照基线（armed；prev=全员存活）
      M.snap(g1);
      const g2 = JSON.parse(JSON.stringify(M.state));   // 破产 diff → bust op 编译（tiles=[] 无归属地 → 横幅直落拍）
      g2.players[0].bankrupt = true; g2.players[0].cash = 0;
      M.snap(g2);
      const pose = M.pawnPose()[0];
      return { vis: pose.vis, rx: pose.rx, live: M.fallLive()[0] };
    });
    ok('D1 快照先隐后 op 回放：fallAndFade 入口复位 vis=true（不演给空气）', d.vis === true && d.live === true, d);
    await p.waitForFunction(() => { const M = window.__mono; return !M.fallLive()[0] && !M.pawnPose()[0].vis && M.plates()[0].op < 0.05; }, null, { timeout: 6000 });
    await p.evaluate(() => clearInterval(window.__di));
    const dr = await p.evaluate(() => window.__dr);
    const dfx = await p.evaluate(() => window.__mono.fallFx().filter(e => e.i === 0));
    ok('D2 op 回放倒地可见（回放窗口内 vis=true 采样到）', dr.some(s => s.vis === true), { n: dr.length, hits: dr.filter(s => s.vis).slice(0, 2) });
    ok('D3 op 回放 rotation.y 同语言（向外倒，非世界 x 轴直倒）', dr.some(s => s.vis === true && Math.abs(s.ry) > 0.3), dr.filter(s => s.vis).slice(0, 2));
    ok('D4 ②op 回放路径收口：fallFx(0) enter→…→down 有序', phaseChain(dfx, ['enter', 'down']), dfx.map(e => e.phase).join(','));
    const dfin = await p.evaluate(() => window.__mono.pawnPose()[0]);
    ok('D5 op 回放终态：倒地隐身 + rx≈0.85', dfin.vis === false && dfin.rx > 0.8, dfin);
    ok('D6 D 段零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\nev-mono-fall: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
