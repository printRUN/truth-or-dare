// 专项：非 trickle 的 6s 兑底发出 SDP 后，晚到的 ICE 候选必须补发出去（否则跨 NAT 必挂）
// 手法：直接触发 onicecandidate，看对端有没有真的 addIceCandidate
// 用法: node test-mic-trickle.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8746;
const URL = `http://localhost:${PORT}/index.html?game=tod`;

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    });
    s.listen(PORT, () => resolve(s));
  });
}
const log = (...a) => console.log('[trickle]', ...a);

const INIT = () => {
  window.__added = [];
  window.__pubIce = [];
  const origAdd = RTCPeerConnection.prototype.addIceCandidate;
  RTCPeerConnection.prototype.addIceCandidate = function (c) {
    window.__added.push(c && c.candidate ? c.candidate : String(c));
    return origAdd.apply(this, arguments);
  };
  const iv = setInterval(() => {
    let L = null;
    try { L = link; } catch { return; }
    if (L && L.publishMic && !L.__wrapped) {
      L.__wrapped = 1;
      const o = L.publishMic.bind(L);
      L.publishMic = function (obj) {
        if (obj && obj.kind === 'ice') window.__pubIce.push({ to: obj.to, c: obj.c && obj.c.candidate, sdpMLineIndex: obj.c && obj.c.sdpMLineIndex });
        return o(obj);
      };
    }
  }, 5);
  try { localStorage.setItem('tod:guide', '1'); } catch {}
};

async function join(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[${tag}] pageerror`, e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript(INIT);
  await ctx.grantPermissions(['microphone']);
  let failed = null;
  try {
    const A = await join(ctx, { name: '小鹅', tag: 'A' });
    const room = (await A.textContent('#share-room')).trim();
    const B = await join(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    await A.click('#btn-mic-lobby');
    await B.click('#btn-mic-lobby');
    await A.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.remoteSet && pr.sdpSent), null, { timeout: 25000 });
    await B.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.remoteSet && pr.sdpSent), null, { timeout: 25000 });
    log('协商完成，sdpSent 已置位', room);

    // 1.5) 标签诚实性：协商完成 ≠ 听得见声音。把 ICE 伪造成还在 checking，按钮不能写「连麦中 · 2 人」
    const honest = await A.evaluate(() => {
      const pr = [...MIC.peers.values()][0];
      Object.defineProperty(pr.pc, 'connectionState', { get: () => 'checking', configurable: true });
      renderMicUI();
      const b = document.querySelector('#btn-mic-lobby');
      const out = { label: b.querySelector('.mic-label').textContent, title: b.title };
      delete pr.pc.connectionState; renderMicUI();
      return out;
    });
    log('未连通时的标签:', JSON.stringify(honest));
    if (/\u4eba/.test(honest.label)) throw new Error('ICE 没通却谎称已接通: ' + honest.label);
    if (!/已接通 0 路/.test(honest.title)) throw new Error('明细没反映真实连通数: ' + honest.title);

    // A 模拟一个在整份 SDP 发出之后才收集到的 relay 候选
    const late = 'candidate:987654321 1 udp 16777215 203.0.113.7 40001 typ relay raddr 0.0.0.0 rport 0 generation 0 ufrag lateUfrag pwd latePwd';
    const fired = await A.evaluate(c => {
      const pr = [...MIC.peers.values()][0];
      const cand = { candidate: c, address: '203.0.113.7', port: 40001, protocol: 'udp', type: 'relay', sdpMid: '0', sdpMLineIndex: 0, foundation: '987654321', priority: 16777215, relatedAddress: '0.0.0.0', relatedPort: 0, tcpType: 'passive', toJSON: () => ({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 }) };
      if (!pr.pc.onicecandidate) return 'no-handler';
      pr.pc.onicecandidate({ candidate: cand });
      return 'fired';
    }, late);
    if (fired !== 'fired') throw new Error('pc.onicecandidate 没挂上：' + fired);
    await A.waitForFunction(() => window.__pubIce.length > 0, null, { timeout: 8000 }).catch(() => { throw new Error('晚到候选没有补发（sdpSent 之后应发 kind:ice）'); });
    log('A 已补发:', JSON.stringify(await A.evaluate(() => window.__pubIce[0])));

    // B 侧必须真的把它交给 RTCPeerConnection
    await B.waitForFunction(() => window.__added.some(c => c && c.includes('203.0.113.7')), null, { timeout: 10000 }).catch(() => {
      throw new Error('B 没收到/没接收晚到候选，added=' + JSON.stringify([]));
    });
    log('B 已把晚到候选交给 ICE agent');
    log('ALL TRICKLE E2E PASSED ✅');
  } catch (e) {
    failed = e.message;
    console.error('FAILED:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
