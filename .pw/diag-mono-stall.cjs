// diag-mono-stall.cjs — 诊断联机回合断链：双端 seq/G 相位轨迹采样
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8919;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const url = q => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=47474&q=${q}`;
  const host = await ctx.newPage();
  const join = await ctx.newPage();
  for (const pg of [host, join]) pg.on('pageerror', e => console.log('PAGEERROR', e.message));
  await host.goto(url('host') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  await join.goto(url('join') + '&role=join&name=小绿', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  await host.evaluate(() => window.__mono.net().start({ roundLimit: 20 }));

  // 采样器：每 250ms 记录两端 seq/phase/turn/bar；行动端自动点掷骰
  const log = [];
  const t0 = Date.now();
  for (let i = 0; i < 160; i++) {
    for (const [tag, pg] of [['H', host], ['J', join]]) {
      const st = await pg.evaluate(() => {
        const n = window.__mono.net();
        return n.joined ? { seq: n.doc && n.doc.seq, ph: window.__mono.state.phase, turn: window.__mono.state.turn, bar: document.querySelector('#action-bar').classList.contains('show'), my: n.myTurn, started: n.doc && n.doc.started } : null;
      }).catch(() => null);
      log.push(`${Date.now() - t0}|${tag}|` + (st ? JSON.stringify(st) : 'dead'));
    }
    // 行动：谁的 bar true 就点（真人端）
    for (const pg of [host, join]) {
      const can = await pg.evaluate(() => document.querySelector('#action-bar') && document.querySelector('#action-bar').classList.contains('show') && document.querySelector('#act-roll')).catch(() => false);
      if (can) { await pg.evaluate(() => document.querySelector('#act-roll').click()).catch(() => {}); }
      const buy = await pg.evaluate(() => !document.querySelector('#buy-modal').hidden).catch(() => false);
      if (buy) { await pg.evaluate(() => (document.querySelector('#btn-buy-yes') && !document.querySelector('#btn-buy-yes').disabled ? document.querySelector('#btn-buy-yes') : document.querySelector('#btn-buy-no')).click()).catch(() => {}); }
    }
    await sleep(250);
  }
  // 压缩轨迹：只打印相位/seq 变化点
  let last = '';
  for (const line of log) {
    const [t, tag, rest] = line.split('|');
    const key = tag + rest;
    if (key !== last) { console.log(`${t.padStart(6)} ${tag} ${rest}`); last = key; }
  }
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
