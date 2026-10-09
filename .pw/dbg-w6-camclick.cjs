// dbg-w6-camclick: 复现 sim-desktop 的「#cam intercepts」——选择期对 #card-truth 的命中栈取证
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8977;
const URL = `http://127.0.0.1:${PORT}/tod.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[dbg]', ...a);

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

async function open(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => log('pageerror!', String(e).slice(0, 200)));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}
async function join(p, name, room) {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
}

(async () => {
  await startServer();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); localStorage.setItem('tod:sfx', 'off'); localStorage.setItem('tod:bgm', 'off'); } catch {} });
  try {
    const p1 = await open(ctx);
    await join(p1, '阿凯');
    const room = await p1.evaluate(() => (document.getElementById('share-room') || {}).textContent || '');
    const p2 = await open(ctx);
    await join(p2, '阿泽', room.trim());
    await p1.waitForFunction(() => (S.players || []).length >= 2, null, { timeout: 15000 });
    await p1.click('#btn-start');
    await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
    await p1.waitForFunction(() => S && S.gameStarted && S.turn.stage === 'choosing', null, { timeout: 20000 });
    await sleep(1200);
    const snap = await p1.evaluate(() => {
      const el = document.getElementById('card-truth');
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const stack = document.elementsFromPoint(cx, cy).slice(0, 6).map(x => x.id || x.className || x.tagName);
      return {
        stage: S.turn.stage, chooserMe: S.turn.chooserId === myId,
        rect: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        pe: getComputedStyle(el).pointerEvents, disabled: el.disabled,
        topAtPoint: (document.elementFromPoint(cx, cy) || {}).id || 'null',
        stack, three3d: document.body.classList.contains('three3d'), loperf: document.body.classList.contains('loperf'),
        stakeRowHidden: document.getElementById('stake-row').hidden,
        stakeRowParent: document.getElementById('stake-row').parentElement.id || document.getElementById('stake-row').parentElement.className,
        stageActionsDisplay: (document.getElementById('stage-actions') || {}).style ? document.getElementById('stage-actions').style.display : 'n/a',
      };
    });
    log('chooser 页命中栈:', JSON.stringify(snap, null, 1));
    // Playwright 真 click（含 actionability/hit-test）
    try { await p1.click('#card-truth', { timeout: 6000 }); log('Playwright click OK'); }
    catch (e) { log('Playwright click FAIL:', String(e).split('\n')[0]); }
    await browser.close();
  } finally { try { server.close(); } catch {} }
})();
