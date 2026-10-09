// ev-uno-result.cjs —— W2 uno 结算一镜取证/验收探针（端口 8987，brief-onetake2 W2 定稿）
// 断言：①showResult 起拍 camTo（__uno.resultFx() 取证口，t0 夹逼在 play→结算屏翻转窗内）+ 目标≠当前机位；
// ②veil 延迟窗 250-350ms(×SPEED)，结算屏翻转同 tick veil 内联 opacity=0 未起播、随后真实起播；
// ③胜者端 ms=560（RESULT_PUSH_MS 完整加冕）、败者/观战端 ms=350 短推；
// ④僵局 stall=true 不推镜（resultFx.camTo=null，镜头原地不动）；
// ⑤REDUCED / bodyLo(loperf=1) 推镜分支不跑（四退路直落）。
// 采样法：playCard 异步（GL 落堆 sleep(420) 后才 onWin），用 MutationObserver 钉住结算屏 hidden 翻转的同一 tick
// （微任务时点早于 45ms veil 定时器），veil/取证口/镜头态在该点确定性观测。
// 纪律：每处相机断言采样前先断非 bodyLo（软渲自动降档会假红）；AUTOTEST 行为零改动，只读取证口。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8987;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 200) : '')); } };
const SPEED = 0.15;   // AUTOTEST 非 turbo 档（uno.html :339），veil 延迟窗按此标定
const azDist = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);   // 角差归一（Node 侧断言用）

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
const urlNet = (room, q, role, name) =>
  `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=${room}&q=${q}&role=${role}${name ? '&name=' + name : ''}`;
const urlHot = (extra) => `http://127.0.0.1:${PORT}/uno.html?autotest=1${extra || ''}`;

async function boot(p, url) {
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
  await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, null, { timeout: 25000 });
  return errs;
}
// 胜局采样：摆必胜牌→play→MutationObserver 钉结算屏翻转瞬（veil 定时器未及触发），全量取证
const forceWinCapture = p => p.evaluate(async () => {
  __uno.state.cur = 'r';
  __uno.state.discard = [{ c: 'r', v: '3' }];
  __uno.forceHand(0, [{ c: 'r', v: '9' }]);
  const t0 = performance.now();
  __uno.play(0);
  await new Promise(res => {
    const ovl = document.getElementById('result-overlay');
    if (!ovl.hidden) return res();
    const mo = new MutationObserver(() => { mo.disconnect(); res(); });
    mo.observe(ovl, { attributes: true, attributeFilter: ['hidden'] });
  });
  const t1 = performance.now();
  return {
    t0, t1, over: __uno.state.phase,
    overlayHidden: document.getElementById('result-overlay').hidden,
    winnerTxt: document.getElementById('result-winner').textContent,
    fx: __uno.resultFx ? __uno.resultFx() : undefined,
    veilOp: getComputedStyle(document.getElementById('result-veil')).opacity,
    cam: __uno.camInfo(),
    lo: document.body.classList.contains('loperf'),
  };
});
// 页面侧：镜头是否收敛到取证口目标位（focusK/角差双收敛）
const camSettledFx = fx => {
  const azd = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const c = __uno.camInfo();
  return Math.abs(c.focusK - fx.camTo.focusK) < 0.02 && azd(c.az, fx.camTo.az) < 0.02;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ROOM = String(Math.floor(10000 + Math.random() * 89999));   // 随机 5 位房号：避开并行会话的本地房

  // ══ A：联机局（host 胜）——①起拍取证 ②veil 延迟窗 ③胜者 560 / 败者端 350 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const errs = [];
    const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host:' + e.message));
    await host.goto(urlNet(ROOM, 'h', 'host'), { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
    const join = await ctx.newPage(); join.on('pageerror', e => errs.push('join:' + e.message));
    await join.goto(urlNet(ROOM, 'j', 'join', '小蓝'), { waitUntil: 'domcontentloaded' });
    await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
    await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 10000 });
    await host.evaluate(() => window.__uno.net().start({}));   // firstPlayer 0：host 先手
    await host.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.net().myTurn, null, { timeout: 15000 });
    await join.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION', null, { timeout: 15000 });

    const cap = await forceWinCapture(host);   // host（胜者端）
    ok(cap.lo === false && cap.over === 'OVER' && cap.overlayHidden === false,
      'A0 host 采样前非 bodyLo + OVER 即结算屏（hidden 同步翻零改动）', { lo: cap.lo, over: cap.over, hidden: cap.overlayHidden });
    ok(!!cap.fx && !!cap.fx.camTo && cap.fx.t0 >= cap.t0 && cap.fx.t0 <= cap.t1 && cap.fx.stall === false,
      '① showResult 起拍 camTo（resultFx.t0 夹逼在 play→结算屏翻转窗内）', cap.fx);
    ok(cap.fx && cap.fx.camFrom && cap.fx.camFrom.focusK >= 0.99 &&
       cap.fx.camTo.focusK < 0.5 && azDist(cap.fx.camTo.az, 0) < 1e-6,
      '① 加冕目标≠当前机位（focusK 1→深推、az=南位 atan2(0,2.3)=0）', cap.fx && { from: cap.fx.camFrom, to: cap.fx.camTo });
    ok(cap.fx && cap.fx.ms === 560, '③ 胜者端 ms=560（RESULT_PUSH_MS 完整加冕）', cap.fx && cap.fx.ms);
    ok(cap.fx && cap.fx.veilDelay >= 250 * SPEED && cap.fx.veilDelay <= 350 * SPEED && cap.veilOp === '0',
      '② veil 延迟窗 250-350ms×SPEED 且翻转瞬内联压住未起播', cap.fx && { veilDelay: cap.fx.veilDelay, veilOp: cap.veilOp });
    await host.waitForFunction(() => getComputedStyle(document.getElementById('result-veil')).opacity !== '0', null, { timeout: 3000 });
    ok(true, '② veil 延迟后真实起播（1s veil-in 放行）');
    await host.waitForFunction(camSettledFx, cap.fx, { timeout: 4000 }).catch(() => {});
    const camLanded = await host.evaluate(camSettledFx, cap.fx);
    ok(camLanded, '① 推镜落定在加冕位（focusK/az 双收敛）', { fx: cap.fx && cap.fx.camTo });

    // 败者/观战端（join）：快照补演 OVER → 350ms 短推（补演路径先 glanceAside 后 showResult，crown 的 camTo token 作废前者）
    await join.waitForFunction(() => window.__uno.resultFx && __uno.resultFx() && !document.getElementById('result-overlay').hidden, null, { timeout: 15000 });
    const jcap = await join.evaluate(() => ({
      fx: __uno.resultFx(), cam: __uno.camInfo(), lo: document.body.classList.contains('loperf'),
      winnerTxt: document.getElementById('result-winner').textContent,
    }));
    ok(jcap.lo === false && jcap.fx && jcap.fx.stall === false && !!jcap.fx.camTo && jcap.fx.ms === 350,
      '③ 败者/观战端 ms=350 短推（快照补演透传 stall=false）', jcap.fx);
    ok(jcap.fx && azDist(jcap.fx.camTo.az, Math.PI) < 1e-6 && jcap.fx.camFrom.focusK >= 0.99,
      '③ 败者端加冕位朝胜者（join 视角胜者在北，az=atan2(0,-2.6)=π）', jcap.fx);
    await join.waitForFunction(camSettledFx, jcap.fx, { timeout: 4000 }).catch(() => {});
    const jcam = await join.evaluate(camSettledFx, jcap.fx);
    ok(jcam, '③ 败者端推镜同样落定加冕位', { fx: jcap.fx && jcap.fx.camTo });
    ok(errs.length === 0, 'A 全程零 pageerror', errs.join(';'));
    await host.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-uno-result-host.png') });
    await join.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-uno-result-join.png') });
    await ctx.close();
  }

  // ══ B：热座僵局——④stall=true 不推镜（doPass 经 350ms×SPEED 定时进 advance，先等 OVER 再采样） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = await boot(p, urlHot());
    const pre = await p.evaluate(() => {
      __uno.state.passStreak = 200; __uno.state.drawnThisTurn = true;
      doPass();   // 摸牌自动过后 drawnThisTurn 复位会让 act-pass 禁用——直接驱动页面函数（probe-uno A11 同款）
      return __uno.camInfo();
    });
    await p.waitForFunction(() => __uno.state.phase === 'OVER', null, { timeout: 10000 });
    const st = await p.evaluate(() => ({
      fx: __uno.resultFx(), cam: __uno.camInfo(),
      overlayHidden: document.getElementById('result-overlay').hidden,
      txt: document.getElementById('result-winner').textContent,
      lo: document.body.classList.contains('loperf'),
    }));
    ok(st.lo === false, 'B0 采样前非 bodyLo', { lo: st.lo });
    ok(st.fx && st.fx.stall === true && st.fx.camTo === null && st.fx.ms === 0, '④ 僵局 stall=true 不推镜（camTo=null）', st.fx);
    ok(st.cam.focusK >= 0.99 && st.cam.az === 0 && pre.focusK >= 0.99, '④ 僵局镜头原地不动（无加冕位）', { pre, post: st.cam });
    ok(!st.overlayHidden && st.txt.includes('和局'), '④ 僵局结算屏照常（hidden 同步翻零改动）', st.txt);
    ok(errs.length === 0, 'B 零 pageerror', errs.join(';'));
    await ctx.close();
  }

  // ══ C：REDUCED——⑤推镜分支不跑（直落现状） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errs = await boot(p, urlHot());
    const st = await forceWinCapture(p);
    ok(st.over === 'OVER' && st.fx && st.fx.camTo === null && st.fx.ms === 0 && st.fx.stall === false,
      '⑤ REDUCED：推镜分支不跑（camTo=null 直落）', st.fx);
    ok(st.cam.focusK >= 0.99 && st.cam.az === 0, '⑤ REDUCED：镜头未动（全景机位）', st.cam);
    ok(!st.overlayHidden && st.winnerTxt.includes('🏆'), '⑤ REDUCED：结算屏照常出现', st.winnerTxt);
    ok(errs.length === 0, 'C 零 pageerror', errs.join(';'));
    await ctx.close();
  }

  // ══ D：bodyLo（loperf=1）——⑤推镜分支不跑（直落现状） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = await boot(p, urlHot('&loperf=1'));
    const loOn = await p.evaluate(() => document.body.classList.contains('loperf'));
    ok(loOn === true, 'D0 loperf=1 已强制 bodyLo（退路档就位）', loOn);
    const st = await forceWinCapture(p);
    ok(st.lo === true && st.over === 'OVER' && st.fx && st.fx.camTo === null && st.fx.ms === 0,
      '⑤ bodyLo：推镜分支不跑（camTo=null 直落）', st.fx);
    ok(st.cam.focusK >= 0.99 && st.cam.az === 0, '⑤ bodyLo：镜头未动（全景机位）', st.cam);
    ok(!st.overlayHidden, '⑤ bodyLo：结算屏照常出现');
    ok(errs.length === 0, 'D 零 pageerror', errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n═══ ev-uno-result：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
