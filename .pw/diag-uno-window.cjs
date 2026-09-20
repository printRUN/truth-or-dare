// diag-uno-window.cjs — UNO 喊名窗口联机诊断：join 打到 1 张牌 → 窗口武装/按钮出现 → 对端只见徽标
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8925;
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
  const url = q => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=53535&q=${q}`;
  const host = await ctx.newPage();
  const join = await ctx.newPage();
  await host.goto(url('h') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await join.goto(url('j') + '&role=join&name=小蓝', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  await host.evaluate(() => window.__uno.net().start({}));
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 2, null, { timeout: 10000 });
  // host 空过（摸+保留/过），把回合让给 join
  for (let i = 0; i < 20; i++) {
    const myTurn = await join.evaluate(() => window.__uno.net().myTurn && window.__uno.state.phase === 'AWAIT_ACTION');
    if (myTurn) break;
    await host.evaluate(() => {
      const G = window.__uno.state, n = window.__uno.net();
      if (n.myTurn && G.phase === 'AWAIT_ACTION') { window.__uno.draw(); }
      const g = document.getElementById('gen-modal');
      if (g && !g.hidden) { const keep = [...g.querySelectorAll('button')].pop(); keep && keep.click(); }
    });
    await sleep(500);
  }
  // join 回合：强制手牌 = [当前色可出牌, 随意一张] → 打出第一张 → 剩 1 张 → 窗口武装
  const r = await join.evaluate(() => {
    const G = window.__uno.state, n = window.__uno.net();
    if (!(n.myTurn && G.phase === 'AWAIT_ACTION')) return { err: 'not-my-turn', ph: G.phase, my: n.myTurn };
    window.__uno.forceHand(G.turn, [{ c: G.cur, v: '5' }, { c: 'g', v: '7' }]);
    window.__uno.play(0);
    return { ok: true };
  });
  console.log('join 打出:', JSON.stringify(r));
  await sleep(600);
  const w1 = await join.evaluate(() => ({ ph: window.__uno.state.phase, unoWin: window.__uno.state.unoWin ? { who: window.__uno.state.unoWin.who, remain: window.__uno.state.unoWin.remain } : null, btnShow: document.getElementById('btn-uno').classList.contains('show'), hands: window.__uno.state.players.map(p => p.hand.length) }));
  console.log('J 窗口状态:', JSON.stringify(w1));
  const w2 = await host.evaluate(() => ({ unoWin: window.__uno.state.unoWin ? { who: window.__uno.state.unoWin.who } : null, badge: !!document.querySelector('#pchip-1') && document.querySelector('#pchip-1').textContent, hands: window.__uno.state.players.map(p => p.hand.length) }));
  console.log('H 观察状态:', JSON.stringify(w2));
  // join 点 UNO 按钮喊名
  await join.evaluate(() => { const b = document.getElementById('btn-uno'); if (b.classList.contains('show')) b.click(); });
  await sleep(700);
  const w3 = await join.evaluate(() => ({ unoWin: window.__uno.state.unoWin, hands: window.__uno.state.players.map(p => p.hand.length), ph: window.__uno.state.phase }));
  console.log('J 喊名后:', JSON.stringify(w3));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
