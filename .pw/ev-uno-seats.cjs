/* ev-uno-seats.cjs —— 多人定位取证探针(端口 8975,2026-09-24):
   三人联机(本机 BroadcastChannel),等每个玩家各出一张牌后,
   逐端截图 + 采样各座位手牌堆的屏幕位置/出牌动画起点,核「每个人出牌和手牌定位不一样」的具体形态。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8975;
const BASE = `http://127.0.0.1:${PORT}`;
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const url = (role, name) => `${BASE}/uno.html?autotest=1&net=1&localnet=1&room=89750&q=${role}&role=${role}&name=${encodeURIComponent(name)}`;
  const pages = [];
  for (const [i, [role, name]] of [['host', '甲'], ['join', '乙'], ['join', '丙']].entries()) {
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`  [${name} pageerror]`, e.message.slice(0, 100)));
    await p.goto(url(role, name), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
    pages.push({ p, name });
  }
  console.log('  三人进房');
  await pages[0].p.evaluate(() => window.__uno.net().start({}));
  await pages[0].p.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 3, null, { timeout: 15000 });
  for (const { p, name } of pages) {
    await p.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 3, null, { timeout: 15000 });
  }
  await pages[0].p.bringToFront();
  await pages[0].p.waitForTimeout(400);
  await pages[0].p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-seats-jia.png') });
  await pages[1].p.bringToFront();
  await pages[1].p.waitForTimeout(400);
  await pages[1].p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-seats-yi.png') });
  await pages[2].p.bringToFront();
  await pages[2].p.waitForTimeout(400);
  await pages[2].p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-seats-bing.png') });
  console.log('  📷 三端开局截图 ev-seats-jia/yi/bing.png');

  // 验收断言:发牌动画收尾(本端 7 张全明)、对手座位对称铺北半弧、名牌/指示环就位
  await pages[0].p.waitForFunction(() => {
    const G = window.__uno.state;
    return __uno.cards().filter(c => c.owner === 0).length === 7 && __uno.cards().filter(c => c.owner === 0).every(c => c.face);
  }, null, { timeout: 10000 });
  let pass = 0, fail = 0;
  const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
  const a = await pages[0].p.evaluate(() => {
    const fx = __uno.seatFx();
    const G = window.__uno.state;
    const byOwner = {};
    __uno.cards().filter(c => c.owner !== G.turn).forEach(c => {
      (byOwner[c.owner] = byOwner[c.owner] || []).push(c);
    });
    const cxs = Object.values(byOwner).map(cs => cs.reduce((s, c) => s + c.x, 0) / cs.length);
    const southOwnerNow = Object.keys(byOwner).length >= 0 ? null : null;
    // 指示环归属:按玩家顺序跳过 south 座位依次对应 rings
    const south = [0, 1, 2].find(i => i === G.turn);   // host 页 turn 座位
    const nonSouthSeats = [0, 1, 2].filter(i => i !== G.turn);
    return {
      oppSeats: Object.keys(byOwner).length,
      north: Object.values(byOwner).every(cs => cs.every(c => c.z < -0.9)),
      back: Object.values(byOwner).every(cs => cs.every(c => !c.face)),
      mirror: cxs.length === 2 ? Math.abs(cxs[0] + cxs[1]) : -1,
      labels: fx.labels.map(l => ({ x: l.x, z: l.z })),
      labelMirror: fx.labels.length === 2 ? Math.abs(fx.labels[0].x + fx.labels[1].x) : -1,
      rings: fx.rings.map(r => r.op),
      turnIsSouth: nonSouthSeats.every(i => i !== G.turn) || G.turn === G.turn && Object.keys(byOwner).length === 2 && G.turn === (window.__uno.state.turn),
      nonSouthSeats,
      turn: G.turn,
    };
  });
  ok(a.oppSeats === 2 && a.north && a.back, '对手 14 张全扣着铺北半弧(z<-0.9)');
  ok(a.mirror >= 0 && a.mirror < 0.1, `对手手牌左右对称(|cx1+cx2|=${a.mirror.toFixed(3)})`);
  ok(a.labels.length === 2, `座位名牌 2 块(${a.labels.length})`);
  ok(a.labelMirror >= 0 && a.labelMirror < 0.1, `名牌左右对称(|x1+x2|=${a.labelMirror})`);
  ok(a.rings.length === 2 && a.rings.every(op => op < 0.5), '行动指示环就位(当前行动者=自己,对手环暗);非自己回合时自己座位侧环会亮');
  const shared = await pages[0].p.evaluate(() => ({ layers: __uno.deckLayers(), deckN: window.__uno.state.deck.length }));
  ok(shared.layers >= 2 && shared.layers <= 6, `共用抽牌堆叠加感(牌库 ${shared.deckN} 张 → ${shared.layers} 层)`);
  const dealOrder = await pages[0].p.evaluate(() => __uno.seatFx().dealOrder);
  ok(dealOrder.length === 21 && dealOrder.every((seat, i) => seat === (i % 3)), `发牌轮转=出牌方向(${JSON.stringify(dealOrder.slice(0, 6))}…)`);
  // 方向断言(2026-09-27 发牌方向轮):顺时针局,下家(south+1)在左手(x<0);发牌轮转次序=出牌方向
  const dirInfo = await pages[0].p.evaluate(() => {
    const G = window.__uno.state;
    const byOwner = {};
    __uno.cards().filter(c => c.owner !== G.turn).forEach(c => { (byOwner[c.owner] = byOwner[c.owner] || []).push(c); });
    const cxs = Object.entries(byOwner).map(([seat, cs]) => ({ seat: +seat, cx: cs.reduce((s, c) => s + c.x, 0) / cs.length }));
    const nextSeat = (G.turn + G.dir + 3) % 3;
    const nextCx = (cxs.find(o => o.seat === nextSeat) || {}).cx;
    return { dir: G.dir, nextSeat, nextCx, dealOrder: __uno.seatFx().dealOrder };
  });
  ok(dirInfo.nextCx !== undefined && dirInfo.nextCx < 0, `顺时针下家(乙,座位${dirInfo.nextSeat})在左手(cx=${dirInfo.nextCx})`);
  // 下家座位环在发牌/对局中应为该座位的行动环(轮到下家时亮)——此处仅验环与座位对位
  ok(a.rings.length === 2, '指示环数量=对手数(2)');

  // 各端视角的座位布局采样:每个座位手牌堆中心屏幕坐标(取该座位 cardGroups 平均 x/y)
  for (const { p, name } of pages) {
    const layout = await p.evaluate(() => {
      const G = window.__uno.state;
      const co = { r: 0, y: 1, g: 2, b: 3, w: 4 };
      const vo = v => (/^[0-9]$/.test(v) ? +v : { S: 10, R: 11, D2: 12, W: 13, W4: 14 }[v]);
      const sig = cd => co[cd.c] * 100 + vo(cd.v);
      const out = {};
      for (let seat = 0; seat < G.players.length; seat++) {
        const mine = __uno.cards().filter(c => c.owner === seat);
        if (!mine.length) { out[seat] = null; continue; }
        const xs = mine.map(c => c.x), ys = mine.map(c => c.y);
        out[seat] = { n: mine.length, cx: +(xs.reduce((a, b) => a + b) / xs.length).toFixed(2), cy: +(ys.reduce((a, b) => a + b) / ys.length).toFixed(2), face: mine[0].face };
      }
      return { me: window.__uno.net().myId, turn: G.turn, seats: out };
    });
    console.log(`  [${name} 视角] `, JSON.stringify(layout));
  }

  // 每人各出一张牌(轮到谁谁出),期间在三端截图出牌动画
  for (let round = 0; round < 3; round++) {
    for (const { p, name } of pages) {
      const isTurn = await p.evaluate(() => {
        const G = window.__uno.state, n = window.__uno.net();
        return n.doc.started && G.phase === 'AWAIT_ACTION' && n.doc.players[G.turn] && n.doc.players[G.turn].id === n.myId;
      });
      if (!isTurn) continue;
      await p.bringToFront();
      const done = await p.evaluate(() => {
        const G = window.__uno.state;
        const hand = G.players[G.turn].hand;
        for (let k = 0; k < hand.length; k++) {
          const cd = hand[k];
          if (cd.c === G.cur && /^[0-9]$/.test(cd.v)) { window.__uno.play(k); return true; }
          if (cd.c === G.cur) { window.__uno.play(k); window.__uno.chooseColor('r'); return true; }
        }
        return false;
      });
      if (!done) { await p.evaluate(() => window.__uno.draw()); }
      await p.waitForTimeout(900);
      // 三端各截一张出牌后的画面(第一个出牌者截动画瞬间)
      const idx = pages.indexOf(pages.find(x => x.name === name));
      await pages[idx].p.bringToFront();
      await pages[idx].p.waitForTimeout(120);
      await pages[idx].p.screenshot({ path: path.join(ROOT, '.pw', 'shots', `ev-seats-play-${idx}.png`) });
      console.log(`  ${name} 出牌,截 ${idx} 端画面`);
      await p.waitForTimeout(1200);
    }
  }
  console.log(`
座位验收: ${pass} pass, ${fail} fail`);
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });
