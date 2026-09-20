// diag-uno-net.cjs — UNO 联机诊断：bot 局快速到结算 → 结算屏双端 → 重开跟随；中途验证接管
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8923;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const url = q => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=52525&q=${q}`;
  const host = await ctx.newPage();
  const join = await ctx.newPage();
  const errs = [];
  for (const [t, pg] of [['H', host], ['J', join]]) pg.on('pageerror', e => errs.push(t + ':' + e.message));
  await host.addInitScript(() => {
    window.__snapLog = [];
    const patch = () => {
      if (typeof window.applyGameSnapshot === 'function' && !window.applyGameSnapshot.__patched) {
        const orig = window.applyGameSnapshot;
        const wrapped = function (g, doc) { try { window.__snapLog.push({ ph: g && g.phase, turn: g && g.turn, t: Date.now() }); } catch (e) {} return orig.apply(this, arguments); };
        wrapped.__patched = true;
        window.applyGameSnapshot = wrapped;
        clearInterval(iv);
      }
    };
    const iv = setInterval(patch, 100);
  });
  await join.addInitScript(() => {
    window.__snapLog = [];
    const patch = () => {
      if (typeof window.applyGameSnapshot === 'function' && !window.applyGameSnapshot.__patched) {
        const orig = window.applyGameSnapshot;
        const wrapped = function (g, doc) { try { window.__snapLog.push({ ph: g && g.phase, turn: g && g.turn, t: Date.now() }); } catch (e) {} return orig.apply(this, arguments); };
        wrapped.__patched = true;
        window.applyGameSnapshot = wrapped;
      }
      if (typeof window.showResult === 'function' && !window.showResult.__patched) {
        const orig2 = window.showResult;
        const wrapped2 = function () { try { window.__snapLog.push({ sr: true, t: Date.now() }); } catch (e) {} return orig2.apply(this, arguments); };
        wrapped2.__patched = true;
        window.showResult = wrapped2;
      }
    };
    setInterval(patch, 100);
  });
  await host.goto(url('h') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await join.goto(url('j') + '&role=join&name=小蓝', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  // 加 bot 再开局：bot 由房主代跑，真人端各自接管
  await host.evaluate(() => { const b = document.querySelector('.pn-addbot'); if (b && !b.hidden) b.click(); });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 3, null, { timeout: 8000 }).catch(() => console.log('bot 加失败'));
  await host.evaluate(() => window.__uno.net().start({}));
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 3, null, { timeout: 10000 });

  // 驱动：真人端 AWAIT_ACTION+myTurn 时打出能出的第一张（或摸）；bot 房主代跑自动
  const act = pg => pg.evaluate(() => {
    try {
      const n = window.__uno.net(), G = window.__uno.state;
      if (!n.joined || !n.doc.started || G.phase !== 'AWAIT_ACTION') return false;
      if (!n.myTurn) return false;
      if (G.players[G.turn].bot) return false;
      const hand = G.players[G.turn].hand || [];
      const top = (G.discard && G.discard[G.discard.length - 1]) || null;
      let best = -1;
      for (let k = 0; k < hand.length; k++) {
        const cd = hand[k];
        if (!cd) continue;
        if (cd.c === G.cur && /^[0-9]$/.test(String(cd.v))) { best = k; break; }
        if (best < 0 && cd.c !== 'w' && (cd.c === G.cur || (top && cd.v === top.v))) best = k;
      }
      if (best >= 0) { const c0 = hand[best] && hand[best].c; window.__uno.play(best); if (c0 === 'w') window.__uno.chooseColor('r'); return 'play'; }
      window.__uno.draw();
      return 'draw';
    } catch (e) { return { err: e.message, turn: window.__uno.state.turn, nplayers: window.__uno.state.players.length }; }
  });
  // 收掉摸牌二选一弹窗
  const settle = pg => pg.evaluate(() => {
    const g = document.getElementById('gen-modal');
    if (g && !g.hidden) { const keep = [...g.querySelectorAll('button')].pop(); keep && keep.click(); }
    const w = document.getElementById('wild-modal');
    if (w && !w.hidden) { const b = w.querySelector('.wbtn'); b && b.click(); }
  });
  let t0 = Date.now(), over = false;
  for (let i = 0; i < 900 && Date.now() - t0 < 240000; i++) {
    // 诊断辅助：每 12 拍把 host 手牌缩成 1 张当前色可出的牌，让对局尽快自然走完（host 打出即胜）
    if (i % 12 === 5) {
      await host.evaluate(() => {
        const G = window.__uno.state;
        if (G.phase === 'AWAIT_ACTION' || G.phase === 'HANDOFF') window.__uno.forceHand(0, [{ c: G.cur === 'w' ? 'r' : G.cur, v: '5' }]);
      }).catch(() => {});
    }
    for (const pg of [host, join]) { await act(pg); await settle(pg); }
    over = await host.evaluate(() => window.__uno.state.phase === 'OVER');
    if (over) break;
    await sleep(300);
  }
  console.log('对局结束?', over, '耗时', Date.now() - t0, 'ms');
  await sleep(1200);
  console.log('J snapLog 尾部:', JSON.stringify((await join.evaluate(() => window.__snapLog)).slice(-8)));
  console.log('J showResult 调用数:', await join.evaluate(() => window.__snapLog.filter(x => x.sr).length));
  for (const [t, pg] of [['H', host], ['J', join]]) {
    const d = await pg.evaluate(() => {
      const G = window.__uno.state;
      return { ph: G.phase, winner: G.winner, hands: G.players.map(p => p.hand.length), overlay: !document.getElementById('result-overlay').hidden, pods: document.querySelectorAll('#result-pods .pod').length, winnerTxt: document.getElementById('result-winner').textContent, docPh: window.__uno.net().doc && window.__uno.net().doc.game && window.__uno.net().doc.game.phase };
    });
    console.log(t, JSON.stringify(d));
  }
  // 重开：房主点按钮
  await host.evaluate(() => document.getElementById('btn-rematch').click());
  await sleep(4000);
  for (const [t, pg] of [['H', host], ['J', join]]) {
    const d = await pg.evaluate(() => {
      const G = window.__uno.state, n = window.__uno.net();
      return { ph: G.phase, hands: G.players.map(p => p.hand.length), started: n.doc && n.doc.started, overlayHidden: document.getElementById('result-overlay').hidden };
    });
    console.log('rematch', t, JSON.stringify(d));
  }
  console.log('pageerrors:', JSON.stringify(errs));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
