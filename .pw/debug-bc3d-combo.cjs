/* debug-bc3d-combo.cjs —— 复现组合选牌问题：点两张 taco 后 sel/btn/命中元素取证 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8973;
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pA = await ctx.newPage();
  pA.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 150)));
  pA.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 150)); });
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
  // 确定性摆手牌 + 强转回合到 A
  await pA.evaluate(() => __cat.debugSetHand(['taco:0', 'taco:1', 'attack:0', 'nope:0', 'skip:0']));
  await pA.evaluate(() => {
    const a = __cat.myId;
    __cat.engine.G.turn.pid = a;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: a, mid: 'fa' + Math.random(), a: { t: 'hello' } });
  });
  await pA.waitForFunction(() => __cat.S.turn && __cat.S.turn.pid === __cat.myId, null, { timeout: 8000 });
  await pA.waitForTimeout(400);
  const tacoIdx = await pA.evaluate(() => __cat.hand.map((c, i) => [CAT.kindOf(c), i]).filter(x => x[0] === 'taco').map(x => x[1]));
  console.log('tacoIdx =', tacoIdx);
  for (const i of tacoIdx.slice(0, 2)) {
    const pos = await pA.evaluate(ix => window.__cat.handScreenPos(ix), i);
    const elAt = await pA.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.className || el.tagName) : 'none';
    }, [pos.x, pos.y]);
    console.log(`click idx=${i} at (${pos.x},${pos.y}) elementFromPoint=${elAt}`);
    await pA.mouse.click(pos.x, pos.y);
    await pA.waitForTimeout(300);
    const st = await pA.evaluate(() => ({
      sel: [...window.__cat._sel],
      btnDisabled: document.querySelector('#btn-play').disabled,
      btnText: document.querySelector('#btn-play').textContent,
      hand3d: window.__cat.hand3d(),
    }));
    console.log('  sel =', JSON.stringify(st.sel), 'btnDisabled =', st.btnDisabled, 'btn =', st.btnText);
    console.log('  hand3d =', JSON.stringify(st.hand3d));
  }
  await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'debug-bc3d-combo.png') });
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
