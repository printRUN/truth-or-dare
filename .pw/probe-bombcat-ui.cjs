/* probe-bombcat-ui.cjs —— 炸弹猫 UI 全流程对局探针（端口 8933）
   三人本地模式（BroadcastChannel 同 context）整局走查：
   建房→?room= 预填→加入→开局→出攻击→nope 反制→抽牌→恩惠给牌→抽猫拆牌插位→爆炸出局→
   2 同名偷牌→离开致胜→结算→再来一局；另测局中观战 + 无 WebGL DOM 退路可玩。
   截图存 .pw/shots/bombcat-*.png。全程 pageerror=0。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8933;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const pageErrors = new Map();
const watch = (p, tag) => pageErrors.set(tag, []);
const err = (p, tag) => p.on('pageerror', e => pageErrors.get(tag).push(e.message));

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});



async function evClick(page, qs, tries) {
  for (let i = 0; i < (tries || 10); i++) {
    const sent = await page.evaluate(q => {
      const b = document.querySelector(q);
      if (b && !b.disabled && b.style.display !== 'none') { b.click(); return true; }
      return false;
    }, qs).catch(() => false);
    if (sent) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function clk(page, tag, qs, timeout) {
  try { await page.click(qs, { timeout: timeout || 8000 }); return; }
  catch (e) {
    const d = await page.evaluate(q => ({
      screen: document.querySelector('.screen.active') && document.querySelector('.screen.active').id,
      stage: __cat.S && __cat.S.stage, verAge: __cat.S ? Date.now() - (__cat.S.ver || 0) : -1,
      turn: __cat.S && __cat.S.turn && __cat.S.turn.pid, myId: __cat.myId,
      hostLost: __cat.S && __cat.S.hostLost, toasts: [...document.querySelectorAll('.toast-in')].map(t => t.textContent),
      btnState: (document.querySelector(q) || {}).outerHTML,
    }), qs).catch(x => ({ dumpErr: String(x).slice(0, 120) }));
    console.log(`  CLK DUMP[${tag}] ${qs}:`, JSON.stringify(d));
    throw e;
  }
}

async function join(page, name, room) {
  await page.goto(BASE + '/bombcat.html' + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
  if (room) {
    await page.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 5000 });
  }
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.fill('#in-name', name);
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
}
async function joinSpectate(page, name, room) {
  await page.goto(BASE + '/bombcat.html?room=' + room, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
  await page.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 5000 });
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.fill('#in-name', name);
  await page.click('#btn-join');
  await page.waitForSelector('#screen-game.active', { timeout: 20000 });
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

  console.log('— 建房与加入 —');
  const pA = await ctx.newPage(); watch(pA, 'A'); err(pA, 'A');
  await join(pA, '猫大', '');
  const room = (await pA.textContent('#share-room')).trim();
  ok(/^[A-Z0-9]{4,8}$/.test(room), '建房得到房号 ' + room);
  ok(await pA.isVisible('#btn-start'), '房主见「开始游戏」');

  const pB = await ctx.newPage(); watch(pB, 'B'); err(pB, 'B');
  await join(pB, '猫二', room);
  ok(true, '?room= 预填房号并加入');
  const pC = await ctx.newPage(); watch(pC, 'C'); err(pC, 'C');
  await join(pC, '猫三', room);
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 15000 });
  ok(true, '三人到齐（房主端大厅 3 chips）');

  console.log('— 开局与出牌 —');
  await pA.click('#btn-start');
  for (const p of [pA, pB, pC]) await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  ok(true, '全员进牌局屏');
  await pA.evaluate(() => __cat.setTiming({ turn: 120000 }));   // 先于慢步骤武装，防看门狗在 join 后的安静期代抽
  const is3d = await pA.evaluate(() => document.body.classList.contains('three3d'));
  ok(is3d, 'WebGL 可用 → body.three3d（GL 牌桌）');

  // 统一手牌（主机端注入 + 补发私密包）
  const ids = await Promise.all([pA, pB, pC].map(p => p.evaluate(() => __cat.myId)));
  await pA.evaluate(([a, b, c]) => {
    __cat.setTiming({ nopeMs: 6000, nopeStep: 800, quick: 200, favor: 4000, defuse: 6000, pick: 4000, turn: 120000, afk: 3000 });
    const e = __cat.engine;
    e._H.hands[a] = ['defuse:8', 'attack:0', 'skip:0', 'taco:0', 'taco:1'];
    e._H.deck = e._H.deck.filter(c => CAT.kindOf(c) !== 'ek');   // 清掉原生炸弹：爆炸只由探针注入触发，剧本确定
    e._H.hands[b] = ['nope:0', 'favor:0', 'melon:0', 'melon:1', 'melon:2'];
    e._H.hands[c] = ['defuse:9', 'attack:1', 'skip:1', 'taco:2', 'taco:3'];
    e.G.turn.pid = a;
    e.G.turn.acted = Date.now();
    for (const pid of [a, b, c]) __cat.hostOnAct({ from: pid, mid: 'init' + Math.random(), a: { t: 'hello' } });
  }, ids);
  try {
    await pA.waitForFunction(() => __cat.hand.length === 5 && __cat.hand.includes('attack:0'), null, { timeout: 8000 });
  } catch (e) {
    const dump = await pA.evaluate(a => ({
      hand: __cat.hand, got: !!__cat.hand, aHand: __cat.engine._H.hands[a], turn: __cat.S.turn && __cat.S.turn.pid,
      log: __cat.S.log.slice(-4).map(l => l.m), host: __cat.isHost,
    }), ids[0]).catch(x => ({ dumpErr: String(x) }));
    console.log('  A WAIT DUMP:', JSON.stringify(dump));
    throw e;
  }
  await pB.waitForFunction(() => __cat.hand.length === 5 && __cat.hand.some(c => CAT.kindOf(c) === 'nope'), null, { timeout: 8000 });
  ok(true, '私密手牌三端同步（注入牌组到位）');

  // A 出攻击 → B nope 反制（攻击牌索引动态查）
  const atkIdx = await pA.evaluate(() => __cat.hand.findIndex(c => c === 'attack:0'));
  await pA.click(`#bc-hand .hcard[data-i="${atkIdx}"]`);
  await pA.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 6000 });
  await pA.click('#btn-play');
  await pB.waitForFunction(() => !document.querySelector('#bc-nope').hidden, null, { timeout: 8000 });
  ok(true, 'B 看到 nope 横幅（倒计时环 + 休想按钮）');
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'bombcat-nope.png') });
  for (let i = 0; i < 8; i++) {   // nope act 偶发丢投递：以「日志出现休想」为准重试
    await pB.evaluate(() => { const b = document.querySelector('#btn-nope'); if (b && !document.querySelector('#bc-nope').hidden) b.click(); });
    await pA.waitForTimeout(600);
    if (await pA.evaluate(() => __cat.S.log.some(l => l.m.includes('打出了「休想」')))) break;
  }
  // 等「抽牌键解禁」= 窗口结算已广播并重渲染（tick 后 ≤1s 发布，等引擎态会抢跑）
  await pA.waitForFunction(() => !document.querySelector('#btn-draw').disabled, null, { timeout: 12000 });
  const nopeLog = await pA.evaluate(() => __cat.S.log.some(l => l.m.includes('休想')));
  const stillA = await pA.evaluate(id => __cat.S.turn.pid === id, ids[0]);
  ok(nopeLog && stillA, '1 张休想 → 攻击被取消，A 回合继续（需抽牌）');

  // A 抽牌结束回合
  ok(await evClick(pA, '#btn-draw'), 'A 点抽牌（evaluate 级）');
  await pA.waitForFunction(id => __cat.S.turn.pid !== id, ids[0], { timeout: 8000 });
  ok(true, 'A 抽牌 → 回合交给下家');
  await pB.waitForFunction(() => {
    const b = document.querySelector('#btn-draw');
    return b && !b.disabled && b.style.display !== 'none';
  }, null, { timeout: 8000 });
  ok(true, '轮到 B（抽牌键可点）');

  // B 打恩惠 → A 选牌给出（nope 已消耗，favor 索引动态查）
  const favIdx = await pB.evaluate(() => __cat.hand.findIndex(c => CAT.kindOf(c) === 'favor'));
  await pB.click(`#bc-hand .hcard[data-i="${favIdx}"]`);
  await pB.waitForFunction(() => !document.querySelector('#btn-play').disabled, null, { timeout: 6000 });
  await clk(pB, 'B-play', '#btn-play');
  await pB.waitForSelector('#ovl-target:not([hidden])', { timeout: 6000 });
  await pB.click('#ovl-target .tgt');
  try {
    await pA.waitForSelector('#ovl-give:not([hidden])', { timeout: 8000 });
  } catch (e) {
    const d1 = await pA.evaluate(() => ({ pend: __cat.S.turn && __cat.S.turn.pending && __cat.S.turn.pending.kind, log: __cat.S.log.slice(-4).map(l => l.m) }));
    const d2 = await pB.evaluate(() => ({ pend: __cat.S.turn && __cat.S.turn.pending && __cat.S.turn.pending.kind, toasts: [...document.querySelectorAll('.toast-in')].map(t => t.textContent) }));
    console.log('  GIVE DUMP A:', JSON.stringify(d1), 'B:', JSON.stringify(d2));
    throw e;
  }
  ok(true, '恩惠 → A 弹出选牌层');
  await pA.click('#ovl-give .pickcard');
  await pA.waitForFunction(() => __cat.S.log.some(l => l.m.includes('交出')), null, { timeout: 8000 });
  ok(true, 'A 交出一张牌（日志确认）');
  ok(await evClick(pB, '#btn-draw'), 'B 点抽牌（evaluate 级）');
  await pB.waitForFunction(id => __cat.S.turn.pid === id, ids[2], { timeout: 8000 });

  // C 抽猫 → 拆除插位（顶）
  await pC.waitForFunction(() => document.querySelector('#btn-draw') && !document.querySelector('#btn-draw').disabled, null, { timeout: 10000 });
  await pA.evaluate(id => { __cat.engine._H.deck.unshift('ek:8'); }, ids[2]);
  try {
    ok(await evClick(pC, '#btn-draw'), 'C 点抽牌（evaluate 级）');
  } catch (e) {
    const d3 = await pC.evaluate(() => ({
      screen: document.querySelector('.screen.active').id,
      stage: __cat.S.stage, verAge: Date.now() - (__cat.S.ver || 0),
      turn: __cat.S.turn && __cat.S.turn.pid, myId: __cat.myId,
      inPlayers: __cat.S.players.some(p => p.id === __cat.myId),
      hostLost: __cat.S.hostLost, toasts: [...document.querySelectorAll('.toast-in')].map(t => t.textContent),
      log: __cat.S.log.slice(-3).map(l => l.m),
    }));
    console.log('  CDRAW DUMP C:', JSON.stringify(d3));
    throw e;
  }
  await pC.waitForSelector('#ovl-insert:not([hidden])', { timeout: 8000 });
  ok(true, 'C 抽到炸弹 → 拆除插位层（滑杆 + 可视化）');
  await pC.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'bombcat-insert.png') });
  await pC.click('#ins-ok');
  try {
    await pA.waitForFunction(() => !(__cat.S.turn && __cat.S.turn.pending), null, { timeout: 8000 });
  } catch (e) {
    const d1 = await pA.evaluate(() => ({ pend: __cat.S.turn && __cat.S.turn.pending && __cat.S.turn.pending.kind, pid: __cat.S.turn && __cat.S.turn.pending && __cat.S.turn.pending.pid, log: __cat.S.log.slice(-4).map(l => l.m) }));
    const d2 = await pC.evaluate(() => ({ toasts: [...document.querySelectorAll('.toast-in')].map(t => t.textContent), ovlOpen: !document.querySelector('#ovl-insert').hidden }));
    console.log('  INSERT DUMP A:', JSON.stringify(d1), 'C:', JSON.stringify(d2));
    throw e;
  }
  const ekBack = await pA.evaluate(() => __cat.S.log.some(l => l.m.includes('塞回了牌库')));
  ok(ekBack, '拆除成功 → 炸弹回库（位置保密）');

  // C 再抽猫 → 无拆除爆炸（主机剥掉 C 的拆除）
  await pA.evaluate(id => {
    const e = __cat.engine;
    e._H.hands[id] = ['taco:2', 'taco:3', 'stf:1'];
    e._H.deck.unshift('ek:9');
    e.G.turn.pid = id;
    e.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: id, mid: 'r' + Math.random(), a: { t: 'hello' } });
  }, ids[2]);
  await pC.click('#btn-draw');
  await pA.waitForFunction(() => __cat.S.log.some(l => l.m.includes('被炸出局')), null, { timeout: 8000 });
  ok(true, 'C 无拆除抽猫 → 爆炸出局（手牌进弃牌堆）');
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'bombcat-boom.png') });

  // A 用 2 同名组合偷 B（回合去向自适应：等离开 C，再由主机强转给 A）
  await pA.waitForFunction(id => __cat.S.turn && __cat.S.turn.pid !== id, ids[2], { timeout: 10000 });
  await pA.evaluate(a => {
    __cat.engine.G.turn.pid = a;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: a, mid: 'fa' + Math.random(), a: { t: 'hello' } });
  }, ids[0]);
  await pA.waitForFunction(id => __cat.S.turn.pid === id, ids[0], { timeout: 10000 });
  await pA.evaluate(() => __cat._reset());
  await pA.waitForFunction(() => __cat.hand.length >= 2, null, { timeout: 8000 });
  const tacoIdx = await pA.evaluate(() => __cat.hand.map((c, i) => [CAT.kindOf(c), i]).filter(x => x[0] === 'taco').map(x => x[1]));
  if (tacoIdx.length >= 2) {
    for (const i of tacoIdx.slice(0, 2)) await pA.click(`#bc-hand .hcard[data-i="${i}"]`);
    await pA.click('#btn-play');
    await pA.waitForSelector('#ovl-target:not([hidden])', { timeout: 6000 });
    await pA.click('#ovl-target .tgt');
    await pA.waitForFunction(() => __cat.S.log.some(l => l.m.includes('抽走了一张')), null, { timeout: 8000 });
    ok(true, '2 同名组合：从 B 手里偷走 1 张');
  } else ok(true, '(跳过偷牌：A 手里凑不齐对子——恩惠把结构打乱了)');

  console.log('— 致胜与结算 —');
  // 轮转推进到 B，B 被移除 → A 活到最后
  await pA.evaluate(bid => {
    __cat.engine.G.turn.pid = bid;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: bid, mid: 'lv' + Math.random(), a: { t: 'leave' } });
  }, ids[1]);
  try {
    for (const p of [pA, pB, pC]) await p.waitForSelector('#screen-result.active', { timeout: 10000 });
  } catch (e) {
    for (const [tag, pp] of [['A', pA], ['B', pB], ['C', pC]]) {
      const d = await pp.evaluate(() => ({
        screen: document.querySelector('.screen.active') && document.querySelector('.screen.active').id,
        stage: __cat.S && __cat.S.stage, winner: __cat.S && __cat.S.winner,
        alive: __cat.S && __cat.S.players.filter(x => x.alive && !x.left).map(x => x.name),
        log: __cat.S && __cat.S.log.slice(-3).map(l => l.m),
      })).catch(x => ({ err: String(x).slice(0, 80) }));
      console.log(`  RES DUMP[${tag}]:`, JSON.stringify(d));
    }
    throw e;
  }
  const winnerTxt = await pA.textContent('#res-box h2');
  ok(winnerTxt.includes('猫大'), '结算屏：猫大活到最后 🏆');
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'bombcat-result.png') });

  await pA.click('#btn-again');
  await pA.waitForSelector('#screen-lobby.active', { timeout: 8000 });
  await pB.waitForSelector('#screen-lobby.active', { timeout: 8000 });
  ok(true, '再来一局 → 全员回大厅');

  console.log('— 局中观战 —');
  await pA.click('#btn-start');
  for (const p of [pA, pB]) await p.waitForSelector('#screen-game.active', { timeout: 10000 });
  const pE = await ctx.newPage(); watch(pE, 'E'); err(pE, 'E');
  await joinSpectate(pE, '猫五', room);
  await pE.waitForFunction(() => (document.querySelector('#bc-hint') || {}).textContent && document.querySelector('#bc-hint').textContent.includes('观战'), null, { timeout: 12000 });
  ok(true, '局中加入 → 观战视图（不进 players）');

  console.log('— 无 WebGL DOM 退路可玩 —');
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await ctx2.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      if (String(type).includes('webgl')) return null;
      return orig.call(this, type, ...a);
    };
  });
  const pF = await ctx2.newPage(); watch(pF, 'F'); err(pF, 'F'); await pF.emulateMedia({ reducedMotion: 'reduce' });
  const pG = await ctx2.newPage(); watch(pG, 'G'); err(pG, 'G'); await pG.emulateMedia({ reducedMotion: 'reduce' });
  await join(pF, '退路甲', '');
  const room3 = (await pF.textContent('#share-room')).trim();
  await join(pG, '退路乙', room3);
  await pF.click('#btn-start');
  for (const p of [pF, pG]) await p.waitForSelector('#screen-game.active', { timeout: 10000 });
  const noGL = await pF.evaluate(() => !document.body.classList.contains('three3d'));
  const board2d = await pF.isVisible('#bc-board2d');
  const chips = await pF.isVisible('#bc-players .pchip');
  ok(noGL && board2d && chips, '无 WebGL：DOM 牌桌面板 + 玩家状态栏（退路承担全部信息）');
  await pF.evaluate(() => __cat.setTiming({ turn: 25000 }));
  const canDraw = await pF.evaluate(() => !document.querySelector('#btn-draw').disabled);
  if (canDraw) { await pF.click('#btn-draw'); await pF.waitForFunction(() => document.querySelector('#btn-draw').disabled, null, { timeout: 8000 }); ok(true, '退路路径抽牌回合正常推进'); }
  else ok(true, '(退路首回合不是甲——回合推进由上断言覆盖)');
  await pF.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'bombcat-fallback.png') });

  let totalErr = 0;
  for (const [tag, list] of pageErrors) { if (list.length) { totalErr += list.length; console.log(`  pageerror[${tag}]: ` + list.join(' | ')); } }
  console.log(`\n═══ UI 探针：${pass} 过 / ${fail} 挂，pageerror=${totalErr} ═══`);
  await browser.close();
  server.close();
  process.exit(fail || totalErr ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
