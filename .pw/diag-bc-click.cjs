/* diag-bc-click.cjs —— 诊断 bombcat 点牌不稳定(端口 8945):
   复现 probe-bombcat-ui 到首次点牌,观测 #bc-hand 重渲染频率与 cidx 可点性。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8945;
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
  const join = async (page, name, room) => {
    await page.goto(`http://127.0.0.1:${PORT}/bombcat.html` + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
    await page.click('details.adv summary');
    await page.click('#chk-local');
    await page.fill('#in-name', name);
    await page.click('#btn-join');
    await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  };
  const pA = await ctx.newPage(); const pB = await ctx.newPage(); const pC = await ctx.newPage();
  await join(pA, '猫大', '');
  const room = (await pA.textContent('#share-room')).trim();
  await join(pB, '猫二', room);
  await join(pC, '猫三', room);
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 15000 });
  await pA.click('#btn-start');
  for (const p of [pA, pB, pC]) await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.evaluate(() => __cat.setTiming({ turn: 120000, afk: 300000, nopeMs: 6000, nopeStep: 800, quick: 200, favor: 4000, defuse: 6000, pick: 4000 }));
  const ids = await Promise.all([pA, pB, pC].map(p => p.evaluate(() => __cat.myId)));
  await pA.evaluate(([a, b, c]) => {
    const e = __cat.engine;
    e._H.hands[a] = ['defuse:8', 'attack:0', 'skip:0', 'taco:0', 'taco:1'];
    e._H.hands[b] = ['defuse:9', 'nope:0', 'favor:0', 'taco:2', 'taco:3'];
    e._H.hands[c] = ['defuse:7', 'skip:1', 'melon:4', 'beard:2', 'hairy:1'];
    e._H.deck = e._H.deck.filter(x => CAT.kindOf(x) !== 'ek');
    e.G.turn.pid = a; e.G.turn.acted = Date.now();
    for (const pid of [a, b, c]) __cat.hostOnAct({ from: pid, mid: 'i' + Math.random(), a: { t: 'hello' } });
  }, ids);
  await pA.waitForFunction(() => __cat.hand.length === 5, null, { timeout: 8000 });
  await pA.bringToFront();
  // 观测 6s:#bc-hand 变更次数 + cidx 几何/可点性
  const obs = await pA.evaluate(() => new Promise(res => {
    let muts = 0;
    const mo = new MutationObserver(ms => { muts += ms.length; });
    mo.observe(document.querySelector('#bc-hand'), { childList: true, subtree: true });
    const el = document.querySelector('#bc-hand .hcard[data-i="1"] .cidx');
    const r0 = el ? el.getBoundingClientRect().toJSON() : null;
    setTimeout(() => {
      const el2 = document.querySelector('#bc-hand .hcard[data-i="1"] .cidx');
      res({
        muts,
        existed0: !!el, existedEnd: !!el2,
        rect0: r0, rect1: el2 ? el2.getBoundingClientRect().toJSON() : null,
        scroll: (s => ({ sw: s.scrollWidth, cw: s.clientWidth }))(document.querySelector('#bc-hand')),
        cards: document.querySelectorAll('#bc-hand .hcard').length,
      });
    }, 6000);
  }));
  console.log(JSON.stringify(obs, null, 1));
  // 真实点击尝试
  try { await pA.click('#bc-hand .hcard[data-i="1"] .cidx', { timeout: 8000 }); console.log('CLICK OK'); }
  catch (e) { console.log('CLICK FAIL: ' + String(e).split('\n')[0]); }
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
