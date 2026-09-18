// 诊断：开麦后对方「没声音」到底卡在哪一段
// 逐端打印：ICE/DTLS 状态、inbound-rtp 统计、远端 audio 元素的播放状态、play() 是否被拒
// 用法: node probe-audio.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8742;
const URL = `http://localhost:${PORT}/index.html`;

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

const log = (...a) => console.log('[audio]', ...a);

// 在任何脚本前注入：记录 play() 的失败原因 + audio 元素生命周期
const INIT = () => {
  window.__playErr = [];
  window.__els = [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const el = this;
    const p = orig.apply(el, arguments);
    if (p && p.then) {
      p.then(() => { window.__els.push('played:' + el.tagName); }, e => { window.__playErr.push(String(e && e.name) + ':' + String(e && e.message)); });
    }
    return p;
  };
  try { localStorage.setItem('tod:guide', '1'); } catch {}
  // 统计真实发出去的信令：非 trickle 下 6s 之后再也没有任何 ice 消息 = 晚到的候选永久丢失
  window.__pub = [];
  const iv = setInterval(() => {
    let L = null;
    try { L = link; } catch { return; }
    if (L && L.publishMic && !L.__wrapped) {
      L.__wrapped = 1;
      const o = L.publishMic.bind(L);
      L.publishMic = function (obj) {
        const sdp = obj.sdp ? (obj.sdp.sdp || '') : '';
        const cand = (sdp.match(/^a=candidate:.*/gm) || []).length;
        let gs = null;
        try { for (const [pid, pr] of MIC.peers) if (pid === obj.to) gs = pr.pc.iceGatheringState; } catch {}
        window.__pub.push({ kind: obj.kind, t: Math.round(performance.now()), cand, gatherAtSend: gs });
        return o(obj);
      };
    }
  }, 5);
};

async function joinTab(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  page.on('pageerror', e => log(`[${tag}] pageerror`, e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

async function dump(page, tag) {
  const st = await page.evaluate(async () => {
    const out = { ctxState: MIC.ctx ? MIC.ctx.state : 'none', micOn: MIC.on, stream: null, peers: [] };
    if (MIC.stream) {
      const t = MIC.stream.getAudioTracks()[0];
      out.stream = t ? { enabled: t.enabled, muted: t.muted, readyState: t.readyState, label: t.label } : 'no-track';
    }
    for (const [pid, pr] of MIC.peers) {
      const p = {
        pid: pid.slice(0, 6), conn: pr.pc.connectionState, ice: pr.pc.iceConnectionState,
        sig: pr.pc.signalingState, iceGathering: pr.pc.iceGatheringState, remoteSet: pr.remoteSet,
        localSdpMlines: (pr.pc.localDescription ? pr.pc.localDescription.sdp.split('\r\n').filter(l => l.startsWith('m=') || /a=sendrecv|a=sendonly|a=recvonly|a=inactive/.test(l)) : []),
        senderTracks: pr.pc.getSenders().map(s => s.track ? s.track.kind + ':' + s.track.enabled + ':' + s.track.muted : 'null'),
        receiverTracks: pr.pc.getReceivers().map(r => r.track ? r.track.kind + ':enabled=' + r.track.enabled + ':muted=' + r.track.muted + ':' + r.track.readyState : 'null'),
        el: null, analyserLevel: +pr.level.toFixed(4),
      };
      if (pr.el) {
        p.el = {
          paused: pr.el.paused, muted: pr.el.muted, volume: pr.el.volume, readyState: pr.el.readyState,
          currentTime: +pr.el.currentTime.toFixed(3), srcObject: !!pr.el.srcObject,
          inDom: document.body.contains(pr.el), tracks: pr.el.srcObject ? pr.el.srcObject.getAudioTracks().length : -1,
        };
      }
      try {
        const stats = await pr.pc.getStats();
        p.rtp = []; p.dtls = null;
        stats.forEach(s => {
          if (s.type === 'inbound-rtp') p.rtp.push({ kind: s.kind, bytes: s.bytesReceived, packets: s.packetsReceived, audioLevel: s.audioLevel, jitter: s.jitter, lost: s.packetsLost, degraded: s.degraded });
          if (s.type === 'outbound-rtp' && s.kind === 'audio') p.rtp.push({ kind: 'out-' + s.kind, bytes: s.bytesSent, packets: s.packetsSent });
          if (s.type === 'transport') p.dtls = s.dtlsTransportState;
          if (s.type === 'candidate-pair' && s.state === 'succeeded') p.pair = s.nominated + '/' + s.state;
          if (s.type === 'local-candidate') (p.lcand = p.lcand || []).push(s.candidateType);
        });
      } catch (e) { p.statsErr = String(e); }
      out.peers.push(p);
    }
    out.orphanAudios = [...document.querySelectorAll('audio')].map(el => ({ paused: el.paused, srcObject: !!el.srcObject, inDom: document.body.contains(el) }));
    out.playErr = window.__playErr || [];
    out.pub = (window.__pub || []).slice(-8);
    out.label = document.querySelector('#btn-mic-lobby .mic-label') ? document.querySelector('#btn-mic-lobby .mic-label').textContent : null;
    return out;
  });
  log(tag, JSON.stringify(st, null, 1));
}

(async () => {
  const server = await serve();
  // 模拟大陆网络：两个 STUN 域名全部黑洞 → 只剩私网 host 候选，且没有 TURN 兑底
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--host-resolver-rules=MAP stun.l.google.com 10.255.255.1,MAP stun1.l.google.com 10.255.255.1,MAP global.stun.twilio.com 10.255.255.1',
    ],
  });
  const ctx = await browser.newContext();
  await ctx.addInitScript(INIT);
  await ctx.grantPermissions(['microphone']);
  try {
    const A = await joinTab(ctx, { name: '小鹅', tag: 'A' });
    const room = (await A.textContent('#share-room')).trim();
    const B = await joinTab(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    log('joined', room, '| link kind:', await A.evaluate(() => link.kind));

    await A.click('#btn-mic-lobby');
    await B.click('#btn-mic-lobby');
    const snap = p => p.evaluate(() => ({
      label: document.querySelector('#btn-mic-lobby .mic-label').textContent,
      peers: [...MIC.peers.values()].map(pr => ({ conn: pr.pc.connectionState, ice: pr.pc.iceConnectionState, gather: pr.pc.iceGatheringState, remoteSet: pr.remoteSet, hasEl: !!pr.el, paused: pr.el ? pr.el.paused : null })),
    }));
    for (let i = 0; i < 26; i++) {
      await A.waitForTimeout(1500);
      const a = await snap(A), b = await snap(B);
      log(`t=${(i + 1) * 1.5}s A ${a.label} ${JSON.stringify(a.peers)} | B ${b.label} ${JSON.stringify(b.peers)}`);
      const conn = x => x.peers.some(p => p.conn === 'connected');
      if (conn(a) && conn(b)) break;
    }
    await A.waitForTimeout(2000);

    await dump(A, 'A(小鹅)');
    await dump(B, 'B(小鸭)');

    // 关键断言：远端元素是否真的在往前走（= 听得到声音）
    const audible = await A.evaluate(() => [...MIC.peers.values()].map(pr => pr.el ? (!pr.el.paused && pr.el.currentTime > 0 && !pr.el.muted && pr.el.volume > 0) : 'no-el'));
    log('A 能听到对方吗:', JSON.stringify(audible));
    const audibleB = await B.evaluate(() => [...MIC.peers.values()].map(pr => pr.el ? (!pr.el.paused && pr.el.currentTime > 0 && !pr.el.muted && pr.el.volume > 0) : 'no-el'));
    log('B 能听到对方吗:', JSON.stringify(audibleB));
    log('mic label A:', await A.textContent('#btn-mic-lobby .mic-label'));
  } catch (e) {
    console.error('PROBE FAILED:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
