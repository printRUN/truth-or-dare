// ev-uno-wildpick.cjs —— UNO GL 选色一镜取证/验收探针（端口 8992，2026-10-02 3D 全场轮 W3）
// ?wildgl=1 强开 GL 选色（评审吸收 #15：AUTOTEST/inspect 恒走 DOM，专用 qs 探针强开）：
// ① wild 落堆后四颗色球绽放 + raycast 命中（加大隐形 hit 面）；② 点色球 → G.cur 变色（断言到状态，防假绿）；
// ③ 选色期 pickHand/humanDraw/humanPlay 被闸门拦截（#14）；④ 完成/退役清闸门回落常规路由；
// ⑤ REDUCED（wildgl 仍开）退回 DOM 弹窗；⑥ AUTOTEST 无 wildgl 恒走 DOM 弹窗且 chooseColor 钩子保活。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8992;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 160) : '')); } };
const cd = (c, v) => ({ c, v });

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
const URL_GL = `http://127.0.0.1:${PORT}/uno.html?autotest=1&wildgl=1`;
const URL_DOM = `http://127.0.0.1:${PORT}/uno.html?autotest=1&loperf=1`;

async function boot(p, url) {
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
  await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, null, { timeout: 25000 });
  return errs;
}
const dispIdxOf = (p, pair) => p.evaluate(w => {   // 显示序下标（与 placeHandCards/cardScreenPos 同序，抄 probe-uno）
  const co = { r: 0, y: 1, g: 2, b: 3, w: 4 };
  const vo = v => (/^[0-9]$/.test(v) ? +v : { S: 10, R: 11, D2: 12, W: 13, W4: 14 }[v]);
  const hand = __uno.state.players[0].hand;
  const idx = hand.findIndex(cd => cd.c === w[0] && cd.v === w[1]);
  if (idx < 0) return -1;
  const sig = x => co[x.c] * 100 + vo(x.v);
  return hand.filter(x => sig(x) < sig(hand[idx])).length;
}, pair);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  // ══ A：GL 选色一镜（?wildgl=1） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 650 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
    const errs = await boot(p, URL_GL);

    // 摆牌局：手上 wild+垫牌；机器人手牌/牌库全冻结成蓝色够不着的牌（防 bot 出牌改 G.cur 干扰②）
    await p.evaluate(() => {
      __uno.state.cur = 'r';
      __uno.state.discard = [cd('r', '3')];
      __uno.state.deck = [cd('y', '5'), cd('y', '6'), cd('y', '7')];
      __uno.forceHand(0, [cd('w', 'W'), cd('r', '2'), cd('g', '3')]);
      __uno.forceHand(1, [cd('y', '9'), cd('y', '8')]);
    });
    const wIdx = await p.evaluate(() => __uno.state.players[0].hand.findIndex(x => x.c === 'w'));
    await p.evaluate(k => __uno.play(k), wIdx);   // 真人路径直达 humanPlay（探针钩子）；GL 选色会话应武装
    await p.waitForFunction(() => __uno.wild && __uno.wild().active && __uno.wild().held, null, { timeout: 6000 });
    const held = await p.evaluate(() => { const w = __uno.wild(); return { active: w.active, held: w.held, inHand: w.heldInHand, modalHidden: w.modalHidden, qs: w.qs }; });
    ok(held.active && held.held && held.held.c === 'w' && held.inHand === true && held.modalHidden === true,
      '① session 武装：wild 视觉持有（状态未写仍在手牌数组）+ DOM 弹窗未出现', held);

    // 色球绽放 + raycast 命中/脱靶
    await p.waitForFunction(() => __uno.wild().balls.length === 4 && Math.min(...__uno.wild().balls.map(b => b.s)) > 0.8, null, { timeout: 6000 });
    await p.evaluate(() => __uno.forceRender());
    const hit = await p.evaluate(() => {
      const bs = __uno.wild().ballScreen('b');
      return { ball: bs, on: bs ? __uno.wild().hitTest(Math.round(bs.x), Math.round(bs.y)) : null, off: __uno.wild().hitTest(5, 5) };
    });
    ok(hit.on === 'b' && hit.off === null && hit.ball && hit.ball.y > 0 && hit.ball.y < 650,
      '① 色球绽放且 raycast 命中（蓝球命中 / 角落脱靶）', hit);

    // ③ 闸门拦截：选色期摸牌/出牌/点牌库全部哑火
    const before = await p.evaluate(() => ({
      h: __uno.state.players[0].hand.length, ph: __uno.state.phase, disc: __uno.state.discard.length,
    }));
    await p.evaluate(() => __uno.draw());
    await p.evaluate(k => __uno.play(k), 1);   // r2：闸门应在任何守卫之前拦下
    const dp = await p.evaluate(() => { __uno.forceRender(); return __uno.deckScreenPos(); });
    await p.mouse.click(Math.round(dp.x), Math.round(dp.y));
    await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({
      h: __uno.state.players[0].hand.length, ph: __uno.state.phase, disc: __uno.state.discard.length,
      active: __uno.wild().active, genHidden: document.getElementById('gen-modal').hidden,
    }));
    ok(after.h === before.h && after.ph === 'AWAIT_ACTION' && after.disc === before.disc && after.active === true && after.genHidden === true,
      '③ 选色期 humanDraw/humanPlay/点牌库全被闸门拦截（状态零变化）', { before, after });

    // ② 点色球 → G.cur 变色（断言到状态）+ 闸门解除
    const bs = hit.ball;
    await p.mouse.click(Math.round(bs.x), Math.round(bs.y));
    await p.waitForFunction(() => __uno.state.cur === 'b' && __uno.state.discard[__uno.state.discard.length - 1].c === 'w', null, { timeout: 8000 });
    const picked = await p.evaluate(() => ({ cur: __uno.state.cur, top: __uno.state.discard[__uno.state.discard.length - 1].v, active: __uno.wild().active, balls: __uno.wild().balls.length }));
    ok(picked.cur === 'b' && picked.top === 'W', '② 点蓝球 → G.cur=b、wild 落状态（弃牌顶=wild）', picked);
    await p.waitForFunction(() => !__uno.wild().active && __uno.wild().balls.length === 0, null, { timeout: 6000 });
    ok(true, '④ 选色完成：闸门解除、色球清场');

    // ④ 回落常规路由：等机器人摸 y5 出不了自动过 → 回本端，点手牌应能抬起选中
    await p.waitForFunction(() => __uno.state.turn === 0 && __uno.state.phase === 'AWAIT_ACTION', null, { timeout: 20000 });
    await p.evaluate(() => { __uno.forceHand(0, [cd('r', '5'), cd('b', '2')]); });
    await p.evaluate(() => __uno.forceRender());
    const di = await dispIdxOf(p, ['b', '2']);
    const pos = await p.evaluate(k => __uno.cardScreenPos(k), di);
    await p.mouse.click(Math.round(pos.x), Math.round(pos.y));
    await p.waitForFunction(() => __uno.cards().some(c => c.owner === 0 && c.sel), null, { timeout: 6000 });
    ok(true, '④ 常规路由恢复：点手牌抬起选中（pickHand 正常分流）');
    await p.mouse.click(30, 250);   // 点空白收下
    await p.waitForFunction(() => !__uno.cards().some(c => c.sel), null, { timeout: 6000 });
    ok(true, '④ 点空白收下也恢复（空白路由不被闸门残留劫持）');
    ok(errs.length === 0, 'A 全程零 pageerror', errs.join(';'));
    await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-uno-wildpick.png') });
    await ctx.close();
  }

  // ══ B：REDUCED + wildgl 仍退回 DOM 弹窗（退路可断言） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 650 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
    const errs = await boot(p, URL_GL);
    await p.evaluate(() => {
      __uno.state.cur = 'r';
      __uno.state.discard = [cd('r', '3')];
      __uno.forceHand(0, [cd('w', 'W'), cd('r', '2')]);
    });
    const wIdx = await p.evaluate(() => __uno.state.players[0].hand.findIndex(x => x.c === 'w'));
    await p.evaluate(k => __uno.play(k), wIdx);
    await p.waitForSelector('#wild-modal:not([hidden])', { timeout: 8000 });
    const domMode = await p.evaluate(() => { const w = __uno.wild(); return { active: w.active, qs: w.qs, modal: !document.getElementById('wild-modal').hidden }; });
    ok(domMode.modal && domMode.active === false, '⑤ REDUCED+wildgl：不进 GL 会话，恒走 DOM #wild-modal', domMode);
    await p.evaluate(() => __uno.chooseColor('b'));
    await p.waitForFunction(() => __uno.state.cur === 'b', null, { timeout: 15000 });
    ok(true, '⑤ DOM 弹窗选色生效（退路语义对齐现状）');
    ok(errs.length === 0, 'B 零 pageerror', errs.join(';'));
    await ctx.close();
  }

  // ══ C：AUTOTEST 无 wildgl 恒走 DOM + chooseColor 钩子保活（#15 回归面） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
    const errs = await boot(p, URL_DOM);
    await p.evaluate(() => {
      __uno.state.cur = 'r';
      __uno.state.discard = [cd('r', '3')];
      __uno.forceHand(0, [cd('w', 'W'), cd('r', '2')]);
    });
    const wIdx = await p.evaluate(() => __uno.state.players[0].hand.findIndex(x => x.c === 'w'));
    await p.evaluate(k => __uno.play(k), wIdx);
    await p.waitForSelector('#wild-modal:not([hidden])', { timeout: 8000 });
    const domMode = await p.evaluate(() => { const w = __uno.wild(); return { qs: w.qs, active: w.active, modal: !document.getElementById('wild-modal').hidden }; });
    ok(domMode.qs === false && domMode.modal && domMode.active === false, '⑥ AUTOTEST 无 wildgl：恒走 DOM 弹窗（GL 会话不武装）', domMode);
    await p.evaluate(() => __uno.chooseColor('b'));
    await p.waitForFunction(() => __uno.state.cur === 'b' && document.getElementById('wild-modal').hidden, null, { timeout: 15000 });
    ok(true, '⑥ chooseColor 钩子保活（DOM 分支照旧落色）');
    ok(errs.length === 0, 'C 零 pageerror', errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n═══ ev-uno-wildpick：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
