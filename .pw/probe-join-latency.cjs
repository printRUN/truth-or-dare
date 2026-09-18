// 进房耗时 A/B 探针 v2:
//   1  创建房间(健康网络)
//   1b 创建房间(mosquitto 拨号被人为拖慢 6s → 看门禁是否被单台拖死)
//   2  第二个浏览器上下文加入(独立 storage,真实走 MQTT 互通)
//   3  断网 → 本地兜底
// 用法: node probe-join-latency.cjs <标签>
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const TAG = process.argv[2] || 'run';
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8799;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function prep(p, url) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 20000 });
  await p.evaluate(() => { try { closeGuide(); } catch {} });
  await p.evaluate(() => {
    window._dialLog = [];
    const orig = RoomLink.prototype._dial;
    RoomLink.prototype._dial = async function (url) {
      const t = Date.now();
      if (window._STALL_BROKER && url.includes(window._STALL_BROKER)) {
        await new Promise(r => setTimeout(r, window._STALL_MS || 6000));
      }
      const r = await orig.call(this, url);
      window._dialLog.push({ host: url.replace('wss://broker.', '').replace('wss://test.', '').split(':')[0], ms: Date.now() - t, ok: r });
      return r;
    };
  });
}

async function joinAndTime(p, { room, name }) {
  await p.fill('#input-name', name);
  await p.fill('#input-room', room || '');
  const t0 = Date.now();
  await p.click('#btn-join');
  try {
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  } catch { return { ms: -1, fail: true }; }
  const ms = Date.now() - t0;
  const info = await p.evaluate(() => ({
    kind: typeof link !== 'undefined' && link ? link.kind : null,
    net: (document.getElementById('net-text') || {}).textContent,
    dialLog: window._dialLog,
  }));
  return { ms, ...info };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];

  // ── 1. 创建房间(健康网络)──
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('1:' + String(e).slice(0, 150)));
    await prep(p, `http://127.0.0.1:${PORT}/index.html?game=tod`);
    const r = await joinAndTime(p, { room: '', name: '甲' });
    console.log(`[${TAG}] 1-create: ${r.ms}ms kind=${r.kind} net="${r.net}"`);
    console.log(`[${TAG}]   dials:`, JSON.stringify(r.dialLog));
    var roomCode = await p.evaluate(() => (typeof link !== 'undefined' && link ? link.room : ''));
    await ctx.close();
  }

  // ── 1b. 创建房间 + mosquitto 拖慢 6s ──
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('1b:' + String(e).slice(0, 150)));
    await prep(p, `http://127.0.0.1:${PORT}/index.html?game=tod`);
    await p.evaluate(() => { window._STALL_BROKER = 'mosquitto'; window._STALL_MS = 6000; });
    const r = await joinAndTime(p, { room: '', name: '甲' });
    console.log(`[${TAG}] 1b-create-stall: ${r.ms}ms kind=${r.kind} net="${r.net}"`);
    console.log(`[${TAG}]   dials:`, JSON.stringify(r.dialLog));
    await ctx.close();
  }

  // ── 2. 加入房间(独立上下文,走真实 MQTT)──
  {
    const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pa = await ctxA.newPage();
    pa.on('pageerror', e => errs.push('2a:' + String(e).slice(0, 150)));
    await prep(pa, `http://127.0.0.1:${PORT}/index.html?game=tod`);
    const ra = await joinAndTime(pa, { room: '', name: '房主' });
    const rc = await pa.evaluate(() => link.room);
    console.log(`[${TAG}] 2-host: ${ra.ms}ms room=${rc}`);

    const ctxB = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pb = await ctxB.newPage();
    pb.on('pageerror', e => errs.push('2b:' + String(e).slice(0, 150)));
    await prep(pb, `http://127.0.0.1:${PORT}/?room=${rc}`);
    const rb = await joinAndTime(pb, { room: rc, name: '客人' });
    console.log(`[${TAG}] 2-join: ${rb.ms}ms kind=${rb.kind} net="${rb.net}" players=${await pb.evaluate(() => document.getElementById('player-count').textContent)}`);
    console.log(`[${TAG}]   dials:`, JSON.stringify(rb.dialLog));
    await sleep(2000);
    console.log(`[${TAG}] 2-interop: host sees ${await pa.evaluate(() => document.getElementById('player-count').textContent)} (expect 2)`);
    await ctxA.close(); await ctxB.close();
  }

  // ── 3. 断网 → 本地兜底 ──
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('3:' + String(e).slice(0, 150)));
    await prep(p, `http://127.0.0.1:${PORT}/index.html?game=tod`);
    await ctx.setOffline(true);
    const r = await joinAndTime(p, { room: '', name: '丙' });
    console.log(`[${TAG}] 3-offline: ${r.ms}ms kind=${r.kind} net="${r.net}"`);
    console.log(`[${TAG}]   dials:`, JSON.stringify(r.dialLog));
    await ctx.setOffline(false);
    await ctx.close();
  }

  console.log(`[${TAG}] pageerrors:`, errs.length ? errs.join(' | ') : 'none');
  await b.close(); server.close();
})();
