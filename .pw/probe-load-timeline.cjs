// 加载时间线探针 v2（2026-09-24 加载优化轮）：5 页 × {本地环回, 4Mbps 节流} 两轮
//   FCP / DCL / 加入屏可见 / html 传输量 + tod「本地加入→揭幕」区间断言（1050-2600ms）
// 背景：3.3MB→外置 dicebear/three 后 HTML 瘦身收益要在节流轮才显形；环回轮看解析成本。
// 用法: node probe-load-timeline.cjs <标签>
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const TAG = process.argv[2] || 'run';
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8931;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    const mime = f.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail || ''}`); }
}

async function timeline(p, url, selector, throttle) {
  if (throttle) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 20,
      downloadThroughput: 4 * 1024 * 1024 / 8,   // 4 Mbps ≈ 中端手机 Wi-Fi 下限
      uploadThroughput: 1 * 1024 * 1024 / 8,
    });
  }
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'commit' });
  let sel = null;
  try { await p.waitForSelector(selector, { timeout: 30000 }); sel = Date.now() - t0; } catch (e) { sel = -1; }
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint');
    return {
      kb: Math.round((nav.transferSize || 0) / 1024),
      fcp: paint ? Math.round(paint.startTime) : null,
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
    };
  });
  return { ...m, sel };
}

const PAGES = [
  ['index(中心)', `http://127.0.0.1:${PORT}/index.html`, 'body.on-arcade'],
  ['tod', `http://127.0.0.1:${PORT}/tod.html`, '#screen-join.active'],
  ['monopoly', `http://127.0.0.1:${PORT}/monopoly.html`, '#setup:not([hidden])'],
  ['uno', `http://127.0.0.1:${PORT}/uno.html`, '#setup:not([hidden])'],
  ['bombcat', `http://127.0.0.1:${PORT}/bombcat.html`, '#screen-join.active'],
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  console.log(`[${TAG}] load-timeline on :${PORT}`);
  const browser = await chromium.launch();

  for (const [label, url, selector] of PAGES) {
    console.log(`\n■ ${label}`);
    for (const throttle of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
      const p = await ctx.newPage();
      const r = await timeline(p, url, selector, throttle);
      chk(`[${throttle ? '4Mbps' : '环回'}] 加入屏可见`, r.sel > 0, r.sel > 0 ? `${r.sel}ms` : '超时');
      if (!throttle) chk(`[环回] FCP`, r.fcp != null && r.fcp < 800, `${r.fcp}ms`);
      console.log(`     [${throttle ? '4Mbps' : '环回'}] html=${r.kb}KB FCP=${r.fcp}ms DCL=${r.dcl}ms 加入屏=${r.sel}ms`);
      await ctx.close();
    }
  }

  // tod 本地加入→揭幕（区间断言：门下限 1050，上限给节流/弱机留到 2600）
  console.log('\n■ tod 本地加入→揭幕');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 30000 });
    // 等启动过场揭幕落幕再装钩子（提速后加入屏会早于 boot 揭幕就绪，别把启动揭幕计进样本）
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 5000 }).catch(() => {});
    await p.evaluate(() => {
      try { closeGuide(); } catch {}
      const c = document.getElementById('chk-local'); if (c && !c.checked) c.click();
      window.__hideLog = [];
      const orig = hideLoading;
      hideLoading = function () { window.__hideLog.push({ t: Date.now() }); return orig.apply(this, arguments); };
    });
    await p.fill('#input-name', '测加载');
    const t0 = Date.now();
    await p.click('#btn-join');
    let hideMs = -1;
    try {
      await p.waitForFunction(() => window.__hideLog && window.__hideLog.length, { timeout: 15000 });
      hideMs = (await p.evaluate(() => window.__hideLog[0].t)) - t0;
    } catch (e) {}
    chk('本地加入→揭幕 ∈ [1050, 2600]ms', hideMs >= 1050 && hideMs < 2600, `${hideMs}ms`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n[${TAG}] pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
