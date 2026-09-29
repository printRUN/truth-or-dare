// 一次性诊断：REDUCED 下本地加入为何提前揭幕（抓 hideLoading 调用栈）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const PORT = 8939;
const server = http.createServer((req, res) => {
  const fp = decodeURIComponent(req.url.split('?')[0]);
  const real = path.join('D:/myidea/truth-or-dare', fp === '/' ? 'tod.html' : fp);
  fs.readFile(real, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'Content-Type': real.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(d); });
});
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const hctx = await b.newContext({ viewport: { width: 900, height: 800 }, reducedMotion: 'reduce' });
  const h = await hctx.newPage();
  await h.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  await h.waitForSelector('#screen-join.active', { timeout: 20000 });
  await h.evaluate(() => { try { closeGuide(); } catch {} const c = document.getElementById('chk-local'); if (c && !c.checked) c.click(); });
  await h.fill('#input-name', '主机');
  await h.click('#btn-join');
  await h.waitForFunction(() => document.querySelector('#screen-lobby.active'), { timeout: 15000 });
  const room = await h.evaluate(() => S.room);
  console.log('host room =', room);
  const g = await hctx.newPage();
  await g.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  await g.waitForSelector('#screen-join.active', { timeout: 20000 });
  await g.evaluate(() => {
    try { closeGuide(); } catch {}
    const c = document.getElementById('chk-local'); if (c && !c.checked) c.click();
    window.__log = []; window.__t0 = Date.now();
    const lg = k => window.__log.push([Date.now() - window.__t0, k]);
    const os = window.sleep;
    window.sleep = async ms => { const r = await os(ms); lg('sleep(' + ms + ')'); return r; };
    const oh = window.hideLoading;
    window.hideLoading = function () {
      const st = (new Error().stack || '').split('\n').slice(1, 5).join(' | ');
      lg('hideLoading <= ' + st);
      return oh.apply(this, arguments);
    };
    const owl = window.waitLoaderDone;
    window.waitLoaderDone = async function (a, b2) { lg('gate enter elapsed=' + (Date.now() - window.__t0) + ' minMs=' + a); const r = await owl(a, b2); lg('gate exit elapsed=' + (Date.now() - window.__t0)); return r; };
  });
  await g.fill('#input-name', '静静');
  await g.fill('#input-room', room);
  const t0 = Date.now();
  await g.click('#btn-join');
  await g.waitForFunction(() => window.__log.some(x => String(x[1]).indexOf('hideLoading') === 0), { timeout: 15000 });
  await g.waitForTimeout(1500);
  const log = await g.evaluate(() => window.__log);
  console.log('点击→首次揭幕 wall=' + (Date.now() - t0) + 'ms');
  for (const [t, k] of log) console.log('  +' + t + 'ms  ' + k);
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
