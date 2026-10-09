// dbg-w6-cardsdrop: index.html boot 单播取证——无票只播 playCardsDrop（不碰镜头）、有票播 drop+Cam 续接，严禁双播。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8979;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[w6i]', ...a);
let bad = 0;
const ok = (name, cond, extra) => { if (!cond) bad++; log((cond ? '✅' : '❌') + ' ' + name, extra === undefined ? '' : JSON.stringify(extra)); };

let server = null;
async function startServer() {
  await new Promise((res, rej) => {
    const s = http.createServer((req, res2) => {
      const u = req.url.split('?')[0];
      const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
      fs.readFile(f, (e, d) => {
        if (e) { res2.writeHead(404); res2.end('nf'); return; }
        res2.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res2.end(d);
      });
    });
    server = s; s.on('error', rej); s.listen(PORT, () => res());
  });
}

(async () => {
  await startServer();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-web-gl', '--disable-webgl'] });
  try {
    // ── ① 无票 boot：只播卡片 drop（280ms 延迟起拍），镜头不动（无 z=-38 起拍）──
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx1.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:warp-back', ''); localStorage.removeItem('tod:warp-back'); } catch {} });
    const p1 = await ctx1.newPage();
    let err1 = [];
    p1.on('pageerror', e => err1.push(String(e).slice(0, 120)));
    await p1.goto(URL, { waitUntil: 'domcontentloaded' });
    await p1.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    const dropSeen = await p1.waitForFunction(() => document.querySelector('.arcade-grid.drop-back'), null, { timeout: 4000 }).then(() => true).catch(() => false);
    ok('① 无票 boot：四卡 drop-back 起拍（揭幕 280ms 后）', dropSeen);
    const camMid = await p1.evaluate(() => (document.getElementById('world3d').style.transform || ''));
    await sleep(1400);
    const dropGone = await p1.evaluate(() => !document.querySelector('.arcade-grid.drop-back'));
    ok('① drop-back 1.3s 后摘类（常态回归基态）', dropGone);
    ok('① 无票镜头未被劫持到 z-38（Cam.init dolly 之外无 pull-back）', !camMid.includes('-38'), camMid);
    ok('① 零 pageerror', err1.length === 0, err1.join(';'));
    await ctx1.close();

    // ── ② 有票 boot：drop + Cam z-38 续接推回（内含一次 drop=单播）──
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:warp-back', JSON.stringify({ g: 'tod', t: Date.now() })); } catch {} });
    const p2 = await ctx2.newPage();
    let err2 = [];
    p2.on('pageerror', e => err2.push(String(e).slice(0, 120)));
    await p2.goto(URL, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    const ticketGone = await p2.evaluate(() => { try { return localStorage.getItem('tod:warp-back') === null; } catch (e) { return false; } });
    ok('② 票读后即删', ticketGone);
    const drop2 = await p2.waitForFunction(() => document.querySelector('.arcade-grid.drop-back'), null, { timeout: 4000 }).then(() => true).catch(() => false);
    const camNear = await p2.evaluate(() => (document.getElementById('world3d').style.transform || ''));
    ok('② 有票：drop 起拍', drop2);
    ok('② 有票：Cam 从 z-38 近位起拍续接', camNear.includes('-38'), camNear);
    await p2.waitForFunction(() => {
      const t = document.getElementById('world3d').style.transform || '';
      return !t.includes('-38');
    }, null, { timeout: 3000 }).catch(() => {});
    const camBack = await p2.evaluate(() => (document.getElementById('world3d').style.transform || ''));
    ok('② Cam 推回 base（续接完成）', !camBack.includes('-38'), camBack);
    ok('② 零 pageerror', err2.length === 0, err2.join(';'));
    await ctx2.close();

    // ── ③ REDUCED：全平（无 drop 无 Cam）──
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctx3.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:warp-back', JSON.stringify({ g: 'tod', t: Date.now() })); } catch {} });
    const p3 = await ctx3.newPage();
    await p3.goto(URL, { waitUntil: 'domcontentloaded' });
    await p3.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    await sleep(900);
    const redDrop = await p3.evaluate(() => !!document.querySelector('.arcade-grid.drop-back'));
    ok('③ REDUCED/降档守卫：drop 不播（照现状全平）', redDrop === false);
    await ctx3.close();

    log(bad ? `FAILED: ${bad} 项` : 'index boot 单播语义全部通过 ✅');
  } finally { try { await browser.close(); } catch {}; try { server.close(); } catch {} }
  process.exitCode = bad ? 1 : 0;
})();
