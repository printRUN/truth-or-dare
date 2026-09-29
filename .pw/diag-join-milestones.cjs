// 诊断 v2：tod 加入全时间线（区分页面启动揭幕 vs 加入揭幕），local/online 各一次
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const PORT = 8937;
const server = http.createServer((req, res) => {
  const f = path.join('D:/myidea/truth-or-dare', decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(d); });
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  for (const mode of ['local', 'online']) {
    const ctx = await b.newContext({ viewport: { width: 420, height: 860 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 20000 });
    await p.waitForTimeout(1600);   // 让页面启动揭幕（1200ms 定时器）先走完，别混进样本
    await p.evaluate((m) => {
      try { closeGuide(); } catch {}
      if (m === 'local') { const c = document.getElementById('chk-local'); if (c && !c.checked) c.click(); }
      window.__log = []; window.__t0 = Date.now();
      const lg = (k) => window.__log.push([Date.now() - window.__t0, k]);
      const os = window.sleep;
      window.sleep = async (ms) => { const r = await os(ms); lg(`sleep(${ms})`); return r; };
      const oh = window.hideLoading;
      window.hideLoading = function () { lg('hideLoading'); return oh.apply(this, arguments); };
      const od = window.RoomLink ? RoomLink.prototype._dial : null;
      if (od) RoomLink.prototype._dial = async function (u) { const t = Date.now(); const r = await od.call(this, u); lg(`dial ${u.replace('wss://broker.','').replace('wss://test.','')}=${r}(${Date.now()-t}ms)`); return r; };
    }, mode);
    await p.fill('#input-name', '诊');
    const t0 = Date.now();
    await p.click('#btn-join');
    try { await p.waitForFunction(() => window.__log.filter(x => x[1] === 'hideLoading').length >= 2, { timeout: 25000 }); } catch (e) { console.log('  (等待第二个揭幕超时)'); }
    const log = await p.evaluate(() => window.__log);
    const lobby = await p.evaluate(() => document.querySelector('#screen-lobby.active') ? Date.now() - window.__t0 : -1);
    console.log(`\n■ tod ${mode} 点击→揭幕 wall=${Date.now() - t0}ms  lobby.active=+${lobby}ms`);
    for (const [t, k] of log) console.log(`  +${t}ms  ${k}`);
    await ctx.close();
  }
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
