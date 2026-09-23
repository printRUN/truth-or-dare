/* probe-bombcat-rules.cjs —— 炸弹猫规则引擎纯逻辑断言（端口 8931）
   直接在页面里 CAT.create 引擎实例，不经传输；所有超时调小 + tick(未来时间) 驱动。
   覆盖：发牌四组数值/种子确定性/攻击叠加三例/nope 奇偶与反制/拆牌插位/爆炸出局/
        恩惠给牌与超时/组合三式与负例/stf peek 时序/看门狗代抽/牌库空/离开/观战/over 唤醒/mid 幂等 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8931;
const URL = `http://localhost:${PORT}/bombcat.html`;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const server = http.createServer((req, res) => {
  const f = req.url.split('?')[0];
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof CAT !== 'undefined' && !!CAT.create, null, { timeout: 15000 });

  console.log('— 发牌数值（定稿公式：52d−4n−1，猫 n−1，拆除回库 6d−n）—');
  const deckFacts = await page.evaluate(() => {
    const out = {};
    for (const n of [4, 5, 6, 8]) {
      const e = CAT.create({ room: 'D' + n, hostId: 'A', selfPid: 'A', seed: 777 });
      for (let i = 0; i < n; i++) e.join('p' + i, 'P' + i, 'bc:0:' + i);
      e.start();
      const deck = e._H.deck;
      out[n] = {
        decks: e.G.decks,
        deckN: deck.length,
        ek: deck.filter(c => CAT.kindOf(c) === 'ek').length,
        defuse: deck.filter(c => CAT.kindOf(c) === 'defuse').length,
        hand0: e._H.hands['p0'].length,
        handDefuse: e._H.hands['p0'].filter(c => CAT.kindOf(c) === 'defuse').length,
      };
    }
    return out;
  });
  ok(deckFacts[4].decks === 1 && deckFacts[4].deckN === 35 && deckFacts[4].ek === 3 && deckFacts[4].defuse === 2, `4p/1副：牌库35 猫3 拆2（实得 ${JSON.stringify(deckFacts[4])}）`);
  ok(deckFacts[5].decks === 1 && deckFacts[5].deckN === 31 && deckFacts[5].ek === 4 && deckFacts[5].defuse === 1, `5p/1副：牌库31 猫4 拆1（实得 ${JSON.stringify(deckFacts[5])}）`);
  ok(deckFacts[6].decks === 2 && deckFacts[6].deckN === 79 && deckFacts[6].ek === 5 && deckFacts[6].defuse === 6, `6p/2副：牌库79 猫5 拆6（实得 ${JSON.stringify(deckFacts[6])}）`);
  ok(deckFacts[8].decks === 2 && deckFacts[8].deckN === 71 && deckFacts[8].ek === 7 && deckFacts[8].defuse === 4, `8p/2副：牌库71 猫7 拆4（实得 ${JSON.stringify(deckFacts[8])}）`);
  ok(deckFacts[4].hand0 === 5 && deckFacts[4].handDefuse === 1, '开局手牌 = 1 拆除 + 4 张');

  console.log('— 种子确定性 —');
  const sameDeck = await page.evaluate(() => {
    const a = CAT.create({ room: 'S', hostId: 'A', selfPid: 'A', seed: 424242 });
    const b = CAT.create({ room: 'S', hostId: 'A', selfPid: 'A', seed: 424242 });
    for (let i = 0; i < 3; i++) { a.join('p' + i, 'P' + i, ''); b.join('p' + i, 'P' + i, ''); }
    a.start(); b.start();
    return JSON.stringify(a._H.deck) === JSON.stringify(b._H.deck);
  });
  ok(sameDeck, '同种子 → 牌库逐字节一致');

  console.log('— 攻击叠加（转结模型）—');
  const atk1 = await page.evaluate(() => {
    const e = CAT.create({ room: 'A', hostId: 'A', selfPid: 'A', seed: 1 });
    ['A', 'B', 'C'].forEach((id, i) => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, nopeStep: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['attack:0', 'skip:0'];
    const r = e.play('A', [0]);
    e.tick(Date.now() + 500);                       // 关 nope 窗
    e.act({ from: 'A', mid: 'm1', a: { t: 'end' } });  // 结束回合（不抽牌）
    return { ok: r.ok, pid: e.G.turn.pid, extra: e.G.turn.extra, queued: e.G.turn.attackQueued };
  });
  ok(atk1.ok && atk1.pid === 'B' && atk1.extra === 1, 'A 攻击 → B 连打 2 回合（extra=1）');
  const atk2 = await page.evaluate(() => {
    const e = CAT.create({ room: 'A2', hostId: 'A', selfPid: 'A', seed: 2 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, nopeStep: 20, turn: 60000 });
    e.G.turn.pid = 'A'; e.G.turn.extra = 1;         // A 被攻击中（第 1/2 回合）
    e._H.hands.A = ['attack:1'];
    e.play('A', [0]);
    e.tick(Date.now() + 500);
    e.act({ from: 'A', mid: 'm2', a: { t: 'end' } });
    return { pid: e.G.turn.pid, extra: e.G.turn.extra };
  });
  ok(atk2.pid === 'B' && atk2.extra === 2, '被攻击期间再攻 → 下家连打 3 回合（extra=2）');
  const atk3 = await page.evaluate(() => {
    const e = CAT.create({ room: 'A3', hostId: 'A', selfPid: 'A', seed: 3 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, nopeStep: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['attack:0', 'attack:1'];
    e.play('A', [0]);
    e.tick(Date.now() + 500);                        // 第一张结算
    e.play('A', [0]);                                // 同回合第二张
    e.tick(Date.now() + 500);
    e.act({ from: 'A', mid: 'm3', a: { t: 'end' } });
    return { pid: e.G.turn.pid, extra: e.G.turn.extra, discarded: e.G.discard.filter(c => CAT.kindOf(c) === 'attack').length };
  });
  ok(atk3.pid === 'B' && atk3.extra === 2 && atk3.discarded === 2, '同回合连打 2 张攻击 → 下家 3 回合 + 2 张攻击进弃牌堆');

  console.log('— nope 窗口 —');
  const nopeOdd = await page.evaluate(() => {
    const e = CAT.create({ room: 'N', hostId: 'A', selfPid: 'A', seed: 4 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 300, nopeStep: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['skip:0', 'taco:0']; e._H.hands.B = ['nope:0']; e._H.hands.C = ['taco:1'];
    const before = e._H.hands.B.length;
    e.play('A', [0]);
    const inWindow = e.G.turn.pending && e.G.turn.pending.kind === 'nope';
    e.act({ from: 'B', mid: 'n1', a: { t: 'nope' } });
    const bNopeGone = e._H.hands.B.length === before - 1;
    e.tick(Date.now() + 800);                       // 窗口关闭（延伸后）
    return { inWindow, bNopeGone, skipFlag: e.G.turn.skipFlag, stillA: e.G.turn.pid === 'A', windowGone: !e.G.turn.pending };
  });
  ok(nopeOdd.inWindow && nopeOdd.bNopeGone, '打出略过进 nope 窗；休想牌离手进弃牌堆');
  ok(nopeOdd.windowGone && nopeOdd.stillA && !nopeOdd.skipFlag, '1 张休想（奇）→ 行动取消，回合未结束（A 仍需抽牌）');
  const nopeEven = await page.evaluate(() => {
    const e = CAT.create({ room: 'N2', hostId: 'A', selfPid: 'A', seed: 5 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 300, nopeStep: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['skip:1']; e._H.hands.B = ['nope:1']; e._H.hands.C = ['nope:2'];
    e.play('A', [0]);
    e.act({ from: 'B', mid: 'n2', a: { t: 'nope' } });
    e.act({ from: 'C', mid: 'n3', a: { t: 'nope' } });   // 反制
    e.tick(Date.now() + 800);
    return { next: e.G.turn.pid !== 'A', nopeDiscard: e.G.discard.filter(c => CAT.kindOf(c) === 'nope').length };
  });
  ok(nopeEven.next && nopeEven.nopeDiscard === 2, '2 张休想（偶，反制）→ 略过生效、回合结束、2 张休想都进弃牌堆');
  const nopeOnce = await page.evaluate(() => {
    const e = CAT.create({ room: 'N3', hostId: 'A', selfPid: 'A', seed: 6 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 300, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['skip:2']; e._H.hands.B = ['nope:3', 'nope:4'];
    e.play('A', [0]);
    const r1 = e.act({ from: 'B', mid: 'n4', a: { t: 'nope' } });
    const r2 = e.act({ from: 'B', mid: 'n5', a: { t: 'nope' } });
    return { first: r1.ok, second: r2.ok, err: r2.err };
  });
  ok(nopeOnce.first && !nopeOnce.second, '同一窗口每人限休想一次');

  console.log('— 抽猫 / 拆除 / 爆炸 —');
  const defuseFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'F', hostId: 'A', selfPid: 'A', seed: 7 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, defuse: 40, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.deck.unshift('ek:0');
    const handBefore = e._H.hands.A.slice();
    e.draw('A');
    const inDefuse = e.G.turn.pending && e.G.turn.pending.kind === 'defuse' && e.G.turn.pending.pid === 'A';
    const deckShrunk = e.G.deckN === e._H.deck.length;
    e.act({ from: 'A', mid: 'f1', a: { t: 'insert', pos: 0 } });
    return { inDefuse, deckShrunk, topEk: CAT.kindOf(e._H.deck[0]) === 'ek', defuseInDiscard: e.G.discard.some(c => CAT.kindOf(c) === 'defuse'), handKept: e._H.hands.A.length === handBefore.length - 1, nextB: e.G.turn.pid === 'B' };
  });
  ok(defuseFlow.inDefuse && defuseFlow.deckShrunk, '抽到炸弹 + 有拆除 → 进 defuse-insert，公共只见图数变化');
  ok(defuseFlow.topEk && defuseFlow.defuseInDiscard && defuseFlow.handKept && defuseFlow.nextB, '插位 0=牌库顶；拆除进弃牌堆；回合立即结束');
  const boomFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'B', hostId: 'A', selfPid: 'A', seed: 8 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['taco:0', 'taco:1'];             // 无拆除
    e._H.deck.unshift('ek:1');
    e.draw('A');
    const dead = !e.G.players[0].alive;
    const handToDiscard = e.G.discard.filter(c => CAT.kindOf(c) === 'taco').length === 2;
    const ekToDiscard = e.G.discard.some(c => CAT.kindOf(c) === 'ek');
    const over = e.G.stage === 'over' ? 'over-2p' : (e.G.turn.pid === 'B' ? 'next' : '?');
    return { dead, handToDiscard, ekToDiscard, over };
  });
  ok(boomFlow.dead && boomFlow.handToDiscard && boomFlow.ekToDiscard, '无拆除抽猫 → 出局；手牌与炸弹都进弃牌堆');
  ok(boomFlow.over === 'next', '3 人局炸 1 人 → 游戏继续到下家');
  const boomWin = await page.evaluate(() => {
    const e = CAT.create({ room: 'B2', hostId: 'A', selfPid: 'A', seed: 9 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['taco:2'];
    e._H.deck.unshift('ek:2');
    e.draw('A');
    return { over: e.G.stage === 'over', winner: e.G.winner };
  });
  ok(boomWin.over && boomWin.winner === 'B', '2 人局炸 1 人 → 立即 over，B 获胜');

  console.log('— 恩惠 / 组合 —');
  const favorFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'V', hostId: 'A', selfPid: 'A', seed: 10 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, favor: 50, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['favor:0']; e._H.hands.B = ['taco:3', 'melon:0'];
    e.play('A', [0], 'B');
    e.tick(Date.now() + 500);
    const givePending = e.G.turn.pending && e.G.turn.pending.kind === 'give' && e.G.turn.pending.pid === 'B';
    const bBefore = e._H.hands.B.length, aBefore = e._H.hands.A.length;
    e.act({ from: 'B', mid: 'v1', a: { t: 'give', idx: 0 } });
    return { givePending, aGot: e._H.hands.A.length === aBefore + 1, bLost: e._H.hands.B.length === bBefore - 1, stillA: e.G.turn.pid === 'A' };
  });
  ok(favorFlow.givePending && favorFlow.aGot && favorFlow.bLost && favorFlow.stillA, '恩惠：B 选牌给 A，出牌者回合继续');
  const favorTimeout = await page.evaluate(() => {
    const e = CAT.create({ room: 'V2', hostId: 'A', selfPid: 'A', seed: 11 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, favor: 40, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['favor:1']; e._H.hands.B = ['taco:4'];
    e.play('A', [0], 'B');
    e.tick(Date.now() + 500);
    e.tick(Date.now() + 500);                        // 超时兜底
    return { resolved: !e.G.turn.pending, bLost: e._H.hands.B.length === 0 };
  });
  ok(favorTimeout.resolved && favorTimeout.bLost, '恩惠超时 → 自动随机给牌');
  const combo2 = await page.evaluate(() => {
    const e = CAT.create({ room: 'C', hostId: 'A', selfPid: 'A', seed: 12 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['taco:0', 'taco:1', 'skip:0']; e._H.hands.B = ['melon:1', 'melon:2'];
    e.play('A', [0, 1], 'B');
    e.tick(Date.now() + 500);
    return { aGot: e._H.hands.A.length === 2, bLost: e._H.hands.B.length === 1, continueA: e.G.turn.pid === 'A', disc2: e.G.discard.filter(c => CAT.kindOf(c) === 'taco').length === 2 };
  });
  ok(combo2.aGot && combo2.bLost && combo2.continueA && combo2.disc2, '2 同名：随机偷 1 张，两张组合牌进弃牌堆');
  const combo3 = await page.evaluate(() => {
    const e = CAT.create({ room: 'C2', hostId: 'A', selfPid: 'A', seed: 13 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['potato:0', 'potato:1', 'potato:2']; e._H.hands.B = ['defuse:9', 'melon:3'];
    e.play('A', [0, 1, 2], 'B', 'defuse');
    e.tick(Date.now() + 500);
    const got = e._H.hands.A.some(c => CAT.kindOf(c) === 'defuse');
    e._H.hands.B = ['melon:3'];
    // 第二例：点名没有的牌
    e._H.hands.A = ['melon:4', 'melon:5', 'melon:6'];
    e.play('A', [0, 1, 2], 'B', 'stf');
    e.tick(Date.now() + 500);
    return { got, missNothing: !e._H.hands.A.some(c => CAT.kindOf(c) === 'stf') };
  });
  ok(combo3.got && combo3.missNothing, '3 同名：点名有 → 必须给；点名没有 → 空欢喜');
  const combo5 = await page.evaluate(() => {
    const e = CAT.create({ room: 'C3', hostId: 'A', selfPid: 'A', seed: 14 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, pick: 50, turn: 60000 });
    e.G.turn.pid = 'A';
    e.G.discard = ['shuffle:3', 'attack:3'];
    e._H.hands.A = ['taco:5', 'potato:3', 'melon:4', 'rainbow:0', 'beard:0'];
    const r0 = e.play('A', [0, 1, 2, 3, 4]);
    e.tick(Date.now() + 500);
    const pickPending = e.G.turn.pending && e.G.turn.pending.kind === 'pick';
    e.act({ from: 'A', mid: 'c5', a: { t: 'pickDiscard', cardId: 'attack:3' } });
    const got = e._H.hands.A.some(c => c === 'attack:3');
    const gone = !e.G.discard.includes('attack:3');
    // 空弃牌堆拒绝
    e.G.discard = [];
    e._H.hands.A = ['taco:6', 'potato:4', 'melon:5', 'rainbow:1', 'beard:1'];
    e.G.turn.pid = 'A'; e.G.turn.pending = null;
    const rEmpty = e.play('A', [0, 1, 2, 3, 4]);
    return { okPlay: r0.ok, pickPending, got, gone, emptyRejected: !rEmpty.ok };
  });
  ok(combo5.okPlay && combo5.pickPending && combo5.got && combo5.gone && combo5.emptyRejected, '5 不同名：从弃牌堆挑 1 张；空弃牌堆拒绝打出');
  const comboNeg = await page.evaluate(() => {
    const e = CAT.create({ room: 'C4', hostId: 'A', selfPid: 'A', seed: 15 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['taco:0', 'melon:6', 'rainbow:2', 'beard:2', 'potato:5'];
    const twoDiff = e.play('A', [0, 1], 'B');
    const fourCards = e.play('A', [0, 1, 2, 3], 'B');
    e._H.hands.A = ['attack:0', 'attack:1', 'attack:2', 'attack:3', 'skip:0'];
    const fiveSame = e.play('A', [0, 1, 2, 3, 4], 'B');
    const noTarget = e.play('A', [0, 1]);
    return { twoDiff: !twoDiff.ok, fourCards: !fourCards.ok, fiveSame: !fiveSame.ok, noTarget: !noTarget.ok };
  });
  ok(comboNeg.twoDiff && comboNeg.fourCards && comboNeg.fiveSame && comboNeg.noTarget, '负例：2 异名/4 张/5 同名/缺目标 全部拒绝');

  console.log('— 预见未来 / 略过 —');
  const stfFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'T', hostId: 'A', selfPid: 'A', seed: 16 });
    const privs = [];
    e._sendPriv = (pid, obj) => privs.push({ pid, obj });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    const top3 = e._H.deck.slice(0, 3);
    e._H.hands.A = ['stf:0'];
    e.play('A', [0]);
    e.tick(Date.now() + 500);
    const peek = privs.length && privs[privs.length - 1].obj.peek;
    return { peekOk: JSON.stringify(peek) === JSON.stringify(top3), continueA: e.G.turn.pid === 'A' };
  });
  ok(stfFlow.peekOk && stfFlow.continueA, '预见未来：peek=牌库顶 3 张按序；回合继续');
  const skipFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'SK', hostId: 'A', selfPid: 'A', seed: 17 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, turn: 60000 });
    e.G.turn.pid = 'A'; e.G.turn.extra = 1;          // A 被攻击中
    e._H.hands.A = ['skip:3'];
    e.play('A', [0]);
    e.tick(Date.now() + 500);
    return { stillA: e.G.turn.pid === 'A', extraLeft: e.G.turn.extra };
  });
  ok(skipFlow.stillA && skipFlow.extraLeft === 0, '被攻击中打略过：只烧掉当前回合，剩余 extra 保留');

  console.log('— 看门狗 / 边界 —');
  const watchdog = await page.evaluate(() => {
    const e = CAT.create({ room: 'W', hostId: 'A', selfPid: 'A', seed: 18 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60, afk: 20 });
    e.G.turn.pid = 'A';
    e.G.turn.acted = Date.now() - 500;
    e._H.deck.unshift('taco:7');
    const handBefore = e._H.hands.A.length;
    e.tick(Date.now());
    return { autoDrawn: e._H.hands.A.length === handBefore + 1 || e.G.stage === 'over' || e.G.turn.pid !== 'A', afk1: e.G.players[0].afk >= 1, logged: e.G.log.some(l => l.m.includes('替')) };
  });
  ok(watchdog.autoDrawn && watchdog.logged, '回合超时 → 主机代抽并记日志');
  const emptyDeck = await page.evaluate(() => {
    const e = CAT.create({ room: 'E', hostId: 'A', selfPid: 'A', seed: 19 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.deck.length = 0;
    e.draw('A');
    return { movedOn: e.G.turn.pid !== 'A', logged: e.G.log.some(l => l.m.includes('牌库空')) };
  });
  ok(emptyDeck.movedOn && emptyDeck.logged, '牌库空 → 空抽结束回合');
  const leaveFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'L', hostId: 'A', selfPid: 'A', seed: 20 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e._H.hands.B = ['taco:8', 'melon:7'];
    e.act({ from: 'B', mid: 'lv1', a: { t: 'leave' } });
    const dead = !e.G.players[1].alive && e.G.players[1].left;
    const discardGot = e.G.discard.filter(c => CAT.kindOf(c) === 'taco' || CAT.kindOf(c) === 'melon').length >= 2;
    const spectate = e.join('Z', 'Z', '').err === 'spectate';
    return { dead, discardGot, spectate, alive2: e.G.players.filter(p => p.alive && !p.left).length === 2 };
  });
  ok(leaveFlow.dead && leaveFlow.discardGot && leaveFlow.spectate && leaveFlow.alive2, '局中离开：出局+手牌进弃牌堆；局中 join → 观战');
  const wakeUp = await page.evaluate(() => {
    const e = CAT.create({ room: 'U', hostId: 'A', selfPid: 'A', seed: 21 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['taco:9'];
    e._H.deck.unshift('ek:3');
    e.draw('A');                                     // 2 人局 A 爆 → over
    const wasOver = e.G.stage === 'over';
    const r = e.join('C', 'C', '');
    return { wasOver, revived: r.ok && e.G.stage === 'lobby', cIn: e.G.players.some(p => p.id === 'C') };
  });
  ok(wakeUp.wasOver && wakeUp.revived && wakeUp.cIn, 'over 局有人加入 → 唤醒回大厅');
  const midDup = await page.evaluate(() => {
    const e = CAT.create({ room: 'M', hostId: 'A', selfPid: 'A', seed: 22 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start();
    const r1 = e.act({ from: 'A', mid: 'mm', a: { t: 'draw' } });
    const pid1 = e.G.turn.pid;
    const r2 = e.act({ from: 'A', mid: 'mm', a: { t: 'draw' } });
    return { dup: r2.dup === true, noDoubleTurn: true, r1ok: r1.ok };
  });
  ok(midDup.dup && midDup.r1ok, 'act mid 幂等：重复消息只结算一次');

  console.log('— 终审补充（双检查官发现回归锁）—');
  const defuseTimeout = await page.evaluate(() => {
    const e = CAT.create({ room: 'DT', hostId: 'A', selfPid: 'A', seed: 30 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, defuse: 40, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.deck.unshift('ek:5');
    e.draw('A');
    const before = e._H.deck.length;
    e.tick(Date.now() + 500);
    return { done: !e.G.turn.pending, grew: e._H.deck.length === before + 1, nextB: e.G.turn.pid === 'B' };
  });
  ok(defuseTimeout.done && defuseTimeout.grew && defuseTimeout.nextB, '拆牌超时 → 种子随机插位（牌库 +1）并结束回合');
  const afkFlow = await page.evaluate(() => {
    const e = CAT.create({ room: 'AF', hostId: 'A', selfPid: 'A', seed: 31 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 60, afk: 20 });
    e._H.deck.unshift('taco:10', 'taco:11', 'taco:12', 'taco:13');
    e.G.turn.pid = 'A'; e.G.turn.acted = Date.now() - 100;
    e.tick(Date.now());
    const afk1 = e.G.players[0].afk === 1;
    e.G.turn.pid = 'A'; e.G.turn.acted = Date.now() - 100;
    e.tick(Date.now());
    const afk2 = e.G.players[0].afk === 2;
    e.G.turn.pid = 'A'; e.G.turn.acted = Date.now() - 100;
    e.tick(Date.now());
    return { afk1, afk2, fastThird: e.G.players[0].afk === 3 };
  });
  ok(afkFlow.afk1 && afkFlow.afk2 && afkFlow.fastThird, 'afk 计数跨回合累计：2 次后进入快进档');
  const afkAttack = await page.evaluate(() => {
    const e = CAT.create({ room: 'AA', hostId: 'A', selfPid: 'A', seed: 32 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, turn: 50, afk: 20 });
    e.G.turn.pid = 'A'; e.G.turn.attackQueued = 1; e.G.turn.acted = Date.now() - 100;
    const handBefore = e._H.hands.A.length;
    e.tick(Date.now());
    return { noDraw: e._H.hands.A.length === handBefore, moved: e.G.turn.pid === 'B', extra: e.G.turn.extra };
  });
  ok(afkAttack.noDraw && afkAttack.moved && afkAttack.extra === 1, '挂机的攻击玩家被代结束回合：不代抽、extra 转结照常');
  const noDrawInWindow = await page.evaluate(() => {
    const e = CAT.create({ room: 'NW', hostId: 'A', selfPid: 'A', seed: 33 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 300, nopeMs: 300, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['skip:4', 'taco:14'];
    e.play('A', [0]);
    const r = e.draw('A');
    return { rejected: !r.ok };
  });
  ok(noDrawInWindow.rejected, 'nope 窗口期间禁抽牌（先等当前行动结算）');

  const leaveInDefuse = await page.evaluate(() => {
    const e = CAT.create({ room: 'LD', hostId: 'A', selfPid: 'A', seed: 34 });
    ['A', 'B', 'C'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, defuse: 40, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.deck.unshift('ek:6');
    e.draw('A');
    e.act({ from: 'A', mid: 'ld1', a: { t: 'leave' } });   // 拆牌 pending 期间离场
    const cleared = !e.G.turn.pending;
    e.tick(Date.now() + 500);                               // tick 不再重试失败的 insert
    const ekBack = e._H.deck.some(c => CAT.kindOf(c) === 'ek') || e.G.discard.some(c => CAT.kindOf(c) === 'ek');
    const alive2 = e.G.players.filter(x => x.alive && !x.left).length === 2;
    return { cleared, ekBack, alive2 };
  });
  ok(leaveInDefuse.cleared && leaveInDefuse.ekBack && leaveInDefuse.alive2, '拆牌 pending 期间离场 → 炸弹随机回库、不悬挂 pending（P0 死锁回归锁）');
  const badIdx = await page.evaluate(() => {
    const e = CAT.create({ room: 'BI', hostId: 'A', selfPid: 'A', seed: 35 });
    ['A', 'B'].forEach(id => e.join(id, id, ''));
    e.start(); Object.assign(e._T, { quick: 20, nopeMs: 20, turn: 60000 });
    e.G.turn.pid = 'A';
    e._H.hands.A = ['attack:2', 'skip:5'];
    const r1 = e.play('A', ['abc']);
    const r2 = e.play('A', [1.5]);
    const clean = e.G.discard.every(c => typeof c === 'string' && c.indexOf('undefined') < 0);
    return { r1: !r1.ok, r2: !r2.ok, clean };
  });
  ok(badIdx.r1 && badIdx.r2 && badIdx.clean, '畸形下标（字符串/小数）被拒，公共态不被污染');

  console.log(`\n═══ 规则探针：${pass} 过 / ${fail} 挂，pageerror=${errors.length} ═══`);
  for (const e of errors) console.log('  pageerror: ' + e);
  await browser.close();
  server.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
