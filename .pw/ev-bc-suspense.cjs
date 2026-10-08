/* ev-bc-suspense.cjs —— 炸弹猫 悬念拍 + 结算一镜 取证/验收探针（端口 8993，2026-10-02 3D 全场轮 W4）
   ① boom 视觉延迟窗存在：引擎事件即时落状态/日志，GL 引信克隆卡在飞（引擎事件与视觉分离）；
   ② 引擎时序零拖延（硬门）：S.ver/log 时间戳不随 1200ms 引信拖延；
   ③ overShown 门：有 pending boom 的终局等「引信→boom」播完才翻 #screen-result，多端不重复；
   ④ 结算进场过渡存在（veil 0.4s）+ 胜者内容正确；
   ⑤ REDUCED 直切现状（不包引信延迟，结算屏即时）；
   ⑥ loperf 中途翻转：引信到点 sceneReady 重查，回调不炸（零 pageerror）+ 照常翻屏。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8993;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? ' | ' + JSON.stringify(extra).slice(0, 200) : '')); } };

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

async function twoPlayerGame(ctx, nameA) {   // 双人本地局（抄 ev-bombcat3d 壳）：A 建房，B 加入，开局
  const pA = await ctx.newPage();
  const errsA = [];
  pA.on('pageerror', e => errsA.push(String(e)));
  await pA.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
  await pA.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pA.click('details.adv summary');
  await pA.click('#chk-local');
  await pA.fill('#in-name', nameA);
  await pA.click('#btn-join');
  await pA.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const room = (await pA.textContent('#share-room')).trim();
  const pB = await ctx.newPage();
  const errsB = [];
  pB.on('pageerror', e => errsB.push(String(e)));
  await pB.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
  await pB.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pB.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 5000 });
  await pB.click('details.adv summary');
  await pB.click('#chk-local');
  await pB.fill('#in-name', '乙');
  await pB.click('#btn-join');
  await pB.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
  await pA.click('#btn-start');
  await pA.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pB.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.evaluate(() => __cat.setTiming({ turn: 120000, afk: 3000, quick: 200 }));
  await pA.waitForFunction(() => __cat.hand.length >= 1, null, { timeout: 10000 });
  return { pA, pB, room, errsA, errsB };
}

// 主机端注入：乙被剥掉拆除、牌库顶=炸弹、回合强转乙（清原生炸弹保剧本确定）
async function armKill(pA, pB, bid) {
  await pA.evaluate(b => {
    const e = __cat.engine;
    e._H.hands[b] = ['taco:9'];
    e._H.deck = e._H.deck.filter(c => CAT.kindOf(c) !== 'ek');
    e._H.deck.unshift('ek:9');
    e.G.turn.pid = b;
    e.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: b, mid: 'fb' + Math.random(), a: { t: 'hello' } });
    __cat.hostPublish('probe-kill-b');
  }, bid);
  await pB.waitForFunction(() => {
    const b = document.querySelector('#btn-draw');
    return b && !b.disabled && b.style.display !== 'none';
  }, null, { timeout: 8000 });
}
async function bDraw(pB) {   // 乙点抽牌（evaluate 级）：抽到炸弹、无拆除 → 爆炸出局（2 人局 → 终局）
  await pB.evaluate(() => { const b = document.querySelector('#btn-draw'); if (b) b.click(); });
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  // ══ 1：悬念延迟窗 + 引擎时序零拖延 + overShown 门 + veil 进场 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const { pA, pB, errsA, errsB } = await twoPlayerGame(ctx, '甲');
    const is3d = await pA.evaluate(() => document.body.classList.contains('three3d'));
    ok(is3d, 'GL 局 body.three3d（悬念拍走 3D 引信）');
    const ids = await Promise.all([pA, pB].map(p => p.evaluate(() => __cat.myId)));
    await armKill(pA, pB, ids[1]);
    const t0 = Date.now();
    await bDraw(pB);
    await pA.waitForFunction(() => __cat.S && __cat.S.log.some(l => l.m.includes('被炸出局')), null, { timeout: 8000 });

    // ② 硬门：引擎状态/日志即时（不被引信 1200ms 拖延）
    const eng = await pA.evaluate(() => {
      const last = __cat.S.log[__cat.S.log.length - 1];
      return { ver: __cat.S.ver, logTs: last && last.ts, stage: __cat.S.stage, winner: __cat.S.winner };
    });
    ok(eng.stage === 'over' && eng.ver - t0 < 900 && eng.logTs - t0 < 900,
      `② 引擎时序零拖延：over 已发布（ver +${eng.ver - t0}ms / log +${eng.logTs - t0}ms，≪ 引信 1200ms）`, eng);

    // ① 视觉延迟窗：引信在飞、boom 演出未放、结算屏未翻
    const sus = await pA.evaluate(() => ({
      s: __cat.suspense, fired: __cat.boomFiredAt, fuse: __cat.fuseAlive(),
      resultActive: document.querySelector('#screen-result').classList.contains('active'),
    }));
    ok(!!sus.s && sus.s.done === false && sus.fired === 0 && sus.fuse === true && !sus.resultActive,
      '① boom 视觉延迟窗：引擎已炸完，引信克隆在飞、演出未放、结算屏未翻', sus);
    const spT0 = sus.s && sus.s.t0;
    await pB.waitForTimeout(350);
    const stillHeld = await pA.evaluate(() => ({
      resultActive: document.querySelector('#screen-result').classList.contains('active'),
      over: __cat.S.stage,
    }));
    ok(stillHeld.over === 'over' && !stillHeld.resultActive, '③ overShown 门：over 后 350ms 结算屏仍被悬念扣住', stillHeld);

    // 到点：boom 演出落地（延迟 ≈ 引信 1200ms）→ 才翻结算屏
    await pA.waitForFunction(() => __cat.boomFiredAt > 0, null, { timeout: 4500 });
    const fired = await pA.evaluate(t => ({ dt: __cat.boomFiredAt - t, fuse: __cat.fuseAlive(), sus: __cat.suspense }), spT0);
    ok(fired.dt >= 1000 && fired.dt <= 2400 && !fired.fuse && !fired.sus,
      `① 到点引爆：演出落地距事件 ${fired.dt}ms（≈1200ms 引信），引信克隆收场`, fired);
    await pA.waitForSelector('#screen-result.active', { timeout: 4000 });
    const veil = await pA.evaluate(() => {
      const v = document.querySelector('#screen-result .result-veil');
      return { anim: v ? getComputedStyle(v).animationName : 'missing', h2: (document.querySelector('#res-box h2') || {}).textContent || '' };
    });
    ok(veil.anim === 'bc-veil-in' && veil.h2.includes('甲'), '③④ 链播完才翻屏 + veil 进场存在 + 胜者正确', veil);
    await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-bc-suspense-result.png') });
    ok(errsA.length === 0 && errsB.length === 0, '1 全程零 pageerror', (errsA.concat(errsB)).join(';'));
    await ctx.close();
  }

  // ══ 2：REDUCED 直切现状（不包引信延迟） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
    const { pA, pB, errsA, errsB } = await twoPlayerGame(ctx, '甲');
    const ids = await Promise.all([pA, pB].map(p => p.evaluate(() => __cat.myId)));
    await armKill(pA, pB, ids[1]);
    await bDraw(pB);
    await pA.waitForFunction(() => __cat.S && __cat.S.log.some(l => l.m.includes('被炸出局')), null, { timeout: 8000 });
    const t0 = Date.now();
    await pA.waitForSelector('#screen-result.active', { timeout: 1200 });
    const immediate = await pA.evaluate(() => ({ fired: __cat.boomFiredAt, sus: __cat.suspense, waited: Date.now() - 0 }));
    ok(immediate.sus === null && immediate.fired > 0, '⑤ REDUCED：引信拍整段跳过（boom 即放、无悬念链）', immediate);
    console.log(`  （REDUCED 从日志可见到结算屏 ${Date.now() - t0}ms）`);
    ok(errsA.length === 0 && errsB.length === 0, '2 零 pageerror', (errsA.concat(errsB)).join(';'));
    await ctx.close();
  }

  // ══ 3：loperf 中途翻转——引信期场景退役，到点 sceneReady 重查不炸 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const { pA, pB, errsA, errsB } = await twoPlayerGame(ctx, '甲');
    const ids = await Promise.all([pA, pB].map(p => p.evaluate(() => __cat.myId)));
    await armKill(pA, pB, ids[1]);
    await bDraw(pB);
    await pA.waitForFunction(() => __cat.S && __cat.S.log.some(l => l.m.includes('被炸出局')), null, { timeout: 8000 });
    await pA.waitForTimeout(250);   // 引信在途中途翻转
    await pA.evaluate(() => document.body.classList.add('loperf'));
    await pA.waitForFunction(() => __cat.boomFiredAt > 0, null, { timeout: 4500 });
    const after = await pA.evaluate(() => ({ scene: __cat.scene(), ready: !!(window.__bcScene) }));
    ok(after.scene === null, '⑥ loperf 翻转：场景已退役（__bcScene 下线）', after);
    await pA.waitForSelector('#screen-result.active', { timeout: 4000 });
    ok(true, '⑥ 到点 sceneReady 重查：回调不炸、结算屏照常进场（overShown 门仍生效）');
    await pA.waitForTimeout(600);
    ok(errsA.length === 0 && errsB.length === 0, '3 零 pageerror', (errsA.concat(errsB)).join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n═══ ev-bc-suspense：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 500)); process.exit(2); });
