/* debug-bc3d-narrow.cjs —— 窄机 320×568 点牌库失败复现（完整 ev 探针步骤 + 逐步取证） */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8974;
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
const HAND8 = ['taco:0', 'taco:1', 'attack:0', 'nope:0', 'skip:0', 'favor:0', 'stf:0', 'shuffle:0'];
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const pA = await ctx.newPage();
  pA.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 150)));
  const join = async (p, name, room) => {
    await p.goto(`http://127.0.0.1:${PORT}/bombcat.html` + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
    await p.click('details.adv summary');
    await p.click('#chk-local');
    await p.fill('#in-name', name);
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  };
  await join(pA, '甲', '');
  const room = (await pA.textContent('#share-room')).trim();
  const pB = await ctx.newPage();
  await join(pB, '乙', room);
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
  await pA.click('#btn-start');
  await pA.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.evaluate(() => __cat.setTiming({ turn: 120000 }));
  await pA.waitForFunction(() => __cat.hand.length >= 1, null, { timeout: 10000 });
  await pA.evaluate(() => {
    const a = __cat.myId;
    __cat.engine.G.turn.pid = a;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: a, mid: 'fa' + Math.random(), a: { t: 'hello' } });
    __cat.hostPublish('debug');
  });
  await pA.waitForFunction(() => {
    const b = document.querySelector('#btn-draw');
    return __cat.S.turn && __cat.S.turn.pid === __cat.myId && b && !b.disabled && b.style.display !== 'none';
  }, null, { timeout: 8000 });
  await pA.evaluate(cards => __cat.debugSetHand(cards), HAND8);
  await pA.waitForFunction(() => window.__cat.hand3d().length === 8, null, { timeout: 8000 });
  await pA.waitForTimeout(250);
  // 步骤 1：点最右卡
  const rightmost = await pA.evaluate(() => {
    const hs = window.__cat.hand3d().map(h => ({ i: h.i, x: h.x }));
    hs.sort((a, b) => b.x - a.x);
    return hs[0].i;
  });
  const rp = await pA.evaluate(i => window.__cat.handScreenPos(i), rightmost);
  console.log('rightmost i =', rightmost, 'pos =', JSON.stringify(rp));
  await pA.mouse.click(rp.x, rp.y);
  await pA.waitForFunction(() => window.__cat.hand3d().some(h => h.sel), null, { timeout: 5000 });
  await pA.waitForTimeout(300);
  // 步骤 2.5：复刻 ev 探针的选中测量
  await pA.evaluate(() => window.__cat.forceRender());
  const selBox = await pA.evaluate(() => {
    const sel = window.__cat.hand3d().find(h => h.sel);
    return { sel: sel && { i: sel.i, y: sel.y, s: sel.s }, box: window.__cat.handScreenBox(sel.i), fanDbg: window.__bcScene._fanDbg() };
  });
  console.log('SELBOX:', JSON.stringify(selBox));
  console.log('TRC:', JSON.stringify(await pA.evaluate(() => window.__bcScene._fanTrc ? window.__bcScene._fanTrc() : null)));
  // 步骤 2：点空白 (40,40)
  const elAtBlank = await pA.evaluate(() => { const el = document.elementFromPoint(40, 40); return el ? (el.id || el.className || el.tagName) : 'none'; });
  console.log('elementFromPoint(40,40) =', elAtBlank);
  await pA.mouse.click(40, 40);
  await pA.waitForFunction(() => !window.__cat.hand3d().some(h => h.sel), null, { timeout: 5000 });
  await pA.waitForTimeout(280);
  // 步骤 3：牌库扫描 + 点击 + 取证
  const scan = await pA.evaluate(() => {
    const d = window.__cat.deckScreenPos();
    const cands = [[0, 0], [0, -14], [0, -26], [0, -38], [-18, -20], [18, -20], [-18, -34], [18, -34], [0, -50], [-30, -30], [30, -30], [-34, 0], [34, 0]];
    const rows = cands.map(([dx, dy]) => {
      const g = window.__cat.pick(d.x + dx, d.y + dy);
      const el = document.elementFromPoint(d.x + dx, d.y + dy);
      return [dx, dy, g && g.kind, g && g.i != null ? g.i : '', el ? (el.id || el.className || el.tagName) : 'none'];
    });
    return { deck: d, rows };
  });
  console.log('deck =', JSON.stringify(scan.deck));
  for (const r of scan.rows) console.log('  scan', JSON.stringify(r));
  const hit = scan.rows.find(r => r[2] === 'deck');
  if (!hit) { console.log('NO deck point'); process.exit(1); }
  const dx0 = scan.deck.x + hit[0], dy0 = scan.deck.y + hit[1];
  await pA.mouse.click(dx0, dy0);
  await pA.waitForTimeout(700);
  const tipbar = await pA.evaluate(() => ({ hidden: document.querySelector('#bc-tipfirst').hidden, bottom: document.querySelector('#bc-tipfirst').getBoundingClientRect().bottom }));
  console.log('tipbar:', JSON.stringify(tipbar));
  const bartop = await pA.evaluate(() => {
    const el = document.querySelector('#bc-top');
    const cs = getComputedStyle(el);
    return { rect: el.getBoundingClientRect().toJSON(), wrap: cs.flexWrap, ws: cs.whiteSpace, h: cs.height, pad: cs.padding };
  });
  console.log('bc-top:', JSON.stringify(bartop));
  const dbg = await pA.evaluate(() => window.__bcScene && window.__bcScene._fanDbg ? window.__bcScene._fanDbg() : null);
  console.log('fanDbg:', JSON.stringify(dbg));
  const after = await pA.evaluate(() => ({
    hand: __cat.hand.length,
    deckN: __cat.S.deckN,
    turnMine: __cat.S.turn && __cat.S.turn.pid === __cat.myId,
    btn: { disabled: document.querySelector('#btn-draw').disabled, display: document.querySelector('#btn-draw').style.display },
    sel: [...window.__cat._sel],
    toasts: [...document.querySelectorAll('.toast-in')].map(t => t.textContent),
    log: __cat.S.log.slice(-3).map(l => l.m),
  }));
  console.log('AFTER deck click at', dx0, dy0, ':', JSON.stringify(after, null, 1));
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'debug-bc3d-narrow.png') });
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
