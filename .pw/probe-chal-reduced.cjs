// 业务终审补刀：prefers-reduced-motion=reduce 下，带答案的挑战题是否会直接把答案亮在牌面上
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8953;
let fails = 0;
const errors = [];
const ok = (c, n, d) => { if (c) console.log('PASS ·', n, d !== undefined ? JSON.stringify(d).slice(0, 160) : ''); else { fails++; console.log('FAIL ·', n, d !== undefined ? JSON.stringify(d).slice(0, 200) : ''); } };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  const q = await ctx.newPage();
  q.on('pageerror', e => errors.push('pageerror: ' + e.message));
  q.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await q.waitForURL(/tod\.html/, { timeout: 15000 }).catch(() => {});
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await q.fill('#input-name', '阿泽');
  await q.click('details.adv summary');
  await q.click('#chk-local');
  await q.click('.avatar-option >> nth=0');
  await q.click('#btn-join');
  await q.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await q.textContent('#share-room')).trim();
  const b = await ctx.newPage();
  await b.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await b.waitForURL(/tod\.html/, { timeout: 15000 }).catch(() => {});
  await b.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await b.fill('#input-name', '小雨');
  await b.click('details.adv summary');
  await b.click('#chk-local');
  await b.click('.avatar-option >> nth=0');
  await b.fill('#input-room', room); await b.click('#btn-join');
  await q.waitForFunction(() => S.players.length >= 2, null, { timeout: 20000 });
  await q.click('#btn-start');
  await q.waitForSelector('#screen-game.active', { timeout: 15000 });
  await b.waitForSelector('#screen-game.active', { timeout: 15000 });
  await sleep(1500);
  // 开挑战
  await q.evaluate(() => { document.getElementById('btn-settings-game').click(); });
  await q.waitForSelector('#st-challenge', { timeout: 8000 });
  await q.click('#st-challenge');
  await sleep(300);
  await q.evaluate(() => { const m = document.getElementById('modal-mask'); if (m && !m.hidden) m.click(); });
  // 连抽 dare 直到抽中带答案的题，检查牌面文本是否泄答案
  let hit = null, clean = null, ansRowShown = null;
  for (let i = 0; i < 24 && !hit; i++) {
    await q.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 20000 });
    const isChooser = await q.evaluate(() => S.turn.chooserId === myId);
    const pg = isChooser ? q : b;
    await sleep(1000);
    await pg.evaluate(() => choose('dare'));
    await q.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await sleep(1200);
    const st = await q.evaluate(() => ({
      p: S.turn.punishment,
      dom: document.getElementById('punishment-text').textContent,
      rowHidden: document.getElementById('answer-row').hidden,
    }));
    if (st.p && st.p.includes('\u0001')) {
      const ans = st.p.split('\u0001')[1];
      hit = { q: st.p.slice(0, st.p.indexOf('\u0001')), ans, dom: st.dom };
      clean = st.dom.indexOf(ans) === -1;
      ansRowShown = !st.rowHidden;
      break;
    }
    await pg.evaluate(() => { try { document.getElementById('btn-accept').click(); } catch (e) {} }).catch(() => {});
    await sleep(500);
  }
  ok(!!hit, '抽中带答案的挑战题', hit && { q: hit.q, ans: hit.ans });
  if (hit) {
    ok(clean, 'REDUCED 下牌面不含参考答案（答案只走揭底按钮）', { dom: hit.dom, ans: hit.ans });
    ok(ansRowShown, '揭底按钮仍然出现', { rowHidden: !ansRowShown });
  } else {
    console.log('WARN · 24 次没抽中带答案的题');
  }
  ok(errors.length === 0, '零 pageerror/console.error', errors.slice(0, 3));
  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
