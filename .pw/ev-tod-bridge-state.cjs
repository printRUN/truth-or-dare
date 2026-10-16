#!/usr/bin/env node
// 一次性取证：P1（非持麦人）页面在持麦人选卡/揭晓期的桥接状态转储。端口 9131。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9131;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
  const open = async tag => { const p = await ctx.newPage(); await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {}); return p; };
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local'); await p.fill('#input-name', name);
    if (room) await p.fill('#input-room', room);
    await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  };
  const H = await open('H'); await join(H, '阿泽', '');
  const room = (await H.textContent('#share-room')).trim();
  const P1 = await open('P1'); await join(P1, '老白', room);
  const P2 = await open('P2'); await join(P2, '默认仔', room);
  await H.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
  await H.click('#btn-start');
  await H.waitForSelector('#screen-game.active', { timeout: 20000 });
  await H.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
  for (const p of [H, P1, P2]) await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
  await sleep(3800);
  const DUMP = () => ({
    stage: S.turn.stage, chooser: S.turn.chooserId, me: myId,
    isMeChooser: S.turn.chooserId === myId,
    chSecParent: document.getElementById('choice-section').parentElement.id,
    saDisplay: document.getElementById('stage-actions').style.display,
    saVisible: (() => { const r = document.getElementById('stage-actions').getBoundingClientRect(); return r.width > 2 && r.height > 2; })(),
    chOutBranch: (() => { const cs = document.getElementById('card-section'); const sr = document.getElementById('stake-row'); const chSec = document.getElementById('choice-section'); return { csOut: !!(cs && !cs.hidden && S.turn.stage === 'revealed'), srOut: !!(sr && !sr.hidden && S.turn.stage === 'choosing'), chOutGateNoWanted: !!(chSec && !chSec.hidden && S.turn.stage === 'choosing' && S.turn.chooserId === myId) }; })(),
    hint: document.getElementById('choice-hint').textContent,
  });
  console.log('选卡期(阿泽选) P1 视角:', JSON.stringify(await P1.evaluate(DUMP)));
  console.log('选卡期(阿泽选) H 视角:', JSON.stringify(await H.evaluate(DUMP)));
  await H.evaluate(() => { const b = document.querySelector('#card-truth'); if (b) b.click(); });
  await sleep(3000);
  console.log('揭晓期 P1 视角:', JSON.stringify(await P1.evaluate(DUMP)));
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
