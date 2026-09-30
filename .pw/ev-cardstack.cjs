/* ev-cardstack.cjs —— 验收探针（端口 8943，2026-09-24 常驻轮）：三项门禁
   A. UNO 联机常驻+隐私：非本端回合，本端手牌常驻南位明牌(z=2.3)、行动者(对手)恒背
   B. UNO 压缩浮层：15 张 → 堆叠不滚动(scrollWidth ≤ clientWidth)、超宽 flex-wrap 换行
   C. 炸弹猫：12 张手牌 → 同套堆叠不滚动
   截图存 .pw/shots/ev-cards-*.png。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8943;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
async function shot(page, name) {
  await page.bringToFront();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ROOT, '.pw', 'shots', name) });
  console.log('  📷 ' + name);
}
const UNO_CARDS = i => [
  { c: 'r', v: '1' }, { c: 'b', v: '2' }, { c: 'g', v: '3' }, { c: 'y', v: '4' }, { c: 'r', v: '5' },
  { c: 'b', v: '6' }, { c: 'g', v: '7' }, { c: 'y', v: '8' }, { c: 'r', v: '9' }, { c: 'b', v: '0' },
  { c: 'g', v: 'S' }, { c: 'y', v: 'R' }, { c: 'w', v: 'W' }, { c: 'w', v: 'W4' }, { c: 'r', v: 'D2' },
].slice(0, i);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });

  /* ── A. UNO 联机暗牌：join 端在 host 回合看不到自己手牌? ── */
  console.log('— A. UNO 联机（暗牌强制）—');
  const url = q => `${BASE}/uno.html?autotest=1&net=1&localnet=1&room=89431&q=${q}`;
  const host = await ctx.newPage();
  host.on('pageerror', e => console.log('  [host pageerror]', e.message.slice(0, 100)));
  await host.goto(url('h') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  const join = await ctx.newPage();
  join.on('pageerror', e => console.log('  [join pageerror]', e.message.slice(0, 100)));
  await join.goto(url('j') + '&role=join&name=小蓝', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await host.evaluate(() => window.__uno.net().start({}));
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 2, null, { timeout: 10000 });
  ok(true, '联机局已开（2 人）');
  // 等「host 的回合稳定」（join 非行动者）
  const hostTurnStable = await join.waitForFunction(() => {
    const n = window.__uno.net(); const G = window.__uno.state;
    return n.doc.started && G.phase === 'AWAIT_ACTION' && n.doc.players[G.turn].id !== n.myId;
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok(hostTurnStable, '进入 host 回合（join 端非行动者）');
  const jState = await join.evaluate(() => {
    const n = window.__uno.net(); const G = window.__uno.state;
    return { mode: G.mode, myTurn: n.myTurn, turn: G.turn, phase: G.phase, handN: G.players.map(p => p.hand.length) };
  });
  console.log('  join 端状态:', JSON.stringify(jState));
  ok(jState.mode === 'dark', '联机强制暗牌模式');
  ok(!jState.myTurn, '非本端回合');
  const vis = await join.evaluate(() => {
    const n = window.__uno.net();
    const seat = n.doc.players.findIndex(pl => pl.id === n.myId);
    return { seat, turn: window.__uno.state.turn,
      cards: window.__uno.cards().filter(c => c.owner === seat || c.owner === window.__uno.state.turn) };
  });
  ok(vis.seat >= 0 && vis.seat !== vis.turn, `join 座位=${vis.seat}, 行动者=${vis.turn}`);
  ok(vis.cards.length > 0 && vis.cards.every(c => c.face === (c.owner === vis.seat)), '常驻+隐私:南位只明本端手牌,行动者恒背');
  ok(vis.cards.some(c => c.owner === vis.seat && c.face && c.z === 2.3), '本端手牌常驻南位(z=2.3 明牌)');
  await shot(join, 'ev-cards-uno-net-notmyturn.png');
  await shot(host, 'ev-cards-uno-net-myturn.png');

const GL_STUB = `(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    if (/webgl/.test(String(type))) return null;
    return orig.call(this, type, ...a);
  };
})();`;
  /* ── B. UNO 压缩浮层：15 张手牌 → #hand-strip（去浮层轮:浮层仅 GL-off 存在,改 GL_STUB 上下文验证 2D 退路） ── */
  console.log('— B. UNO 热座压缩浮层（15 张,GL-off）—');
  const ctxB = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p2 = await ctxB.newPage();
  await p2.addInitScript(GL_STUB);
  p2.on('pageerror', e => console.log('  [uno2 pageerror]', e.message.slice(0, 100)));
  await p2.goto(`${BASE}/uno.html?autotest=1`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.__uno && window.__uno.state.phase === 'AWAIT_ACTION', null, { timeout: 20000 });
  await p2.evaluate(() => { window.__uno.forceHand(0, []); });   // 先清（forceHand 需要数组）
  await p2.evaluate(cs => { window.__uno.forceHand(0, cs); }, UNO_CARDS(15));
  const fanN = await p2.evaluate(() => window.__uno.state.players[0].hand.length);
  ok(fanN === 15, '注入 15 张手牌');
  await shot(p2, 'ev-cards-uno-3d-fan15.png');
  await p2.evaluate(() => { const b = document.querySelector('#act-hand'); b && b.click(); });
  await p2.waitForSelector('#hand-ovl.show', { timeout: 5000 });
  const strip = await p2.evaluate(() => {
    const s = document.querySelector('#hand-strip');
    return { sw: s.scrollWidth, cw: s.clientWidth, n: s.children.length };
  });
  ok(strip.n === 15, `浮层 15 张卡（${strip.n}）`);
  ok(strip.sw <= strip.cw + 1, `堆叠不滚动：scrollWidth ${strip.sw} ≤ clientWidth ${strip.cw}`);
  await shot(p2, 'ev-cards-uno-overlay15.png');

  /* ── C. 炸弹猫：12 张手牌 → #bc-hand(GL_STUB:DOM 手牌只在 2D 退路存在——3D 局已退役,堆叠 CSS 断言迁到退路上下文) ── */
  console.log('— C. 炸弹猫长手牌(GL-off) —');
  const bcJoin = async (page, name, room) => {
    await page.goto(`${BASE}/bombcat.html` + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
    await page.click('details.adv summary');
    await page.click('#chk-local');
    await page.fill('#in-name', name);
    await page.click('#btn-join');
    await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  };
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pA = await ctxC.newPage(); const pB = await ctxC.newPage(); const pC = await ctxC.newPage();
  [pA, pB, pC].forEach(pg => pg.addInitScript(GL_STUB));
  [pA, pB, pC].forEach(p => p.on('pageerror', e => console.log('  [bc pageerror]', e.message.slice(0, 100))));
  await bcJoin(pA, '猫大', '');
  const room = (await pA.textContent('#share-room')).trim();
  await bcJoin(pB, '猫二', room);
  await bcJoin(pC, '猫三', room);
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 15000 });
  await pA.click('#btn-start');
  for (const p of [pA, pB, pC]) await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.evaluate(() => __cat.setTiming({ turn: 300000, afk: 300000, nopeMs: 6000, nopeStep: 800, quick: 200, favor: 4000, defuse: 6000, pick: 4000 }));
  const ids = await Promise.all([pA, pB, pC].map(p => p.evaluate(() => __cat.myId)));
  await pA.evaluate(([a, b, c]) => {
    const e = __cat.engine;
    e._H.hands[a] = ['defuse:8', 'attack:0', 'skip:0', 'taco:0', 'taco:1', 'melon:0', 'melon:1', 'melon:2', 'melon:3', 'beard:0', 'beard:1', 'hairy:0'];
    e._H.hands[b] = ['defuse:9', 'nope:0', 'favor:0', 'taco:2', 'taco:3'];
    e._H.hands[c] = ['defuse:7', 'skip:1', 'melon:4', 'beard:2', 'hairy:1'];
    e._H.deck = e._H.deck.filter(x => CAT.kindOf(x) !== 'ek');
    e.G.turn.pid = a; e.G.turn.acted = Date.now();
    for (const pid of [a, b, c]) __cat.hostOnAct({ from: pid, mid: 'i' + Math.random(), a: { t: 'hello' } });
  }, ids);
  await pA.waitForFunction(() => __cat.hand.length === 12, null, { timeout: 8000 });
  const bar = await pA.evaluate(() => {
    const s = document.querySelector('#bc-hand');
    return { sw: s.scrollWidth, cw: s.clientWidth, n: s.querySelectorAll('.hcard').length };
  });
  ok(bar.n === 12, `炸弹猫手牌 12 张（${bar.n}）`);
  ok(bar.sw <= bar.cw + 1, `堆叠不滚动：scrollWidth ${bar.sw} ≤ clientWidth ${bar.cw}`);
  await shot(pA, 'ev-cards-bombcat-hand12.png');

  console.log(`\n取证完成: ${pass} pass, ${fail} fail`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
