// 决定性实验：媒体外放路径要有声，远端音轨需不需要一个 <audio> 元素当「消费者」？哪种变体真的有声？
// 测量两条：src 上的 analyser（波形）与 gain 输出上的探针 rms（真出声）。
// 用法: node probe-micspeaker2.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8764;
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
const log = (...a) => console.log('[probe2]', ...a);

async function join(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 });
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=' + (tag === 'A' ? 0 : 1));
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

// 测一次：src 波形 + gain 真实输出（在 gain 上挂探针 analyser 取样）。
// 注意：这个函数要装进页面里（页面作用域才有 MIC / rmsLevel），不能直接用 Node 侧闭包。
const INSTALL_MEASURE = () => {
  window.__measure = async (label) => {
    const pr = [...MIC.peers.values()][0];
    if (!pr || !pr.gain) return { label, err: 'no peer/gain' };
    const probe = MIC.ctx.createAnalyser(); probe.fftSize = 512;
    pr.gain.connect(probe);
    const tmp = new Uint8Array(probe.fftSize);
    let best = 0;
    for (let i = 0; i < 36; i++) {
      await new Promise(r => requestAnimationFrame(r));
      probe.getByteTimeDomainData(tmp);
      let sum = 0;
      for (let j = 0; j < tmp.length; j++) { const d = (tmp[j] - 128) / 128; sum += d * d; }
      best = Math.max(best, Math.sqrt(sum / tmp.length));
    }
    try { pr.gain.disconnect(probe); } catch {}
    const el = pr.el || document.querySelector('audio');
    const o = {
      label,
      srcWave: +rmsLevel(pr.analyser, pr.tmp).toFixed(5),
      gainOut: +best.toFixed(4),
      ctx: MIC.ctx.state,
      elCount: document.querySelectorAll('audio').length,
      elPaused: el ? el.paused : null, elT: el ? +el.currentTime.toFixed(2) : null, elMuted: el ? el.muted : null,
      elVol: el ? el.volume : null,
    };
    try {
      const t = pr.stream.getAudioTracks()[0];
      o.track = { muted: t.muted, enabled: t.enabled, rs: t.readyState };
    } catch (e) { o.trackErr = String(e); }
    return o;
  };
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  await ctx.grantPermissions(['microphone']);
  try {
    const A = await join(ctx, { name: '小鹅', tag: 'A' });
    const room = (await A.textContent('#share-room')).trim();
    const B = await join(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    await B.click('#btn-mic-lobby');
    await A.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.pc.connectionState === 'connected' && pr.gainOn), null, { timeout: 25000 });
    await A.waitForTimeout(1500);
    await A.evaluate(INSTALL_MEASURE);
    log('T0 无元素（现状：媒体外放裸奔）', JSON.stringify(await A.evaluate(() => window.__measure('T0'))));

    // V1: 建元素但不播（autoplay=false，且不调 play）
    log('V1 建元素不播', JSON.stringify(await A.evaluate(async () => {
      const pr = [...MIC.peers.values()][0];
      const el = document.createElement('audio');
      el.playsInline = true; el.autoplay = false; el.style.display = 'none';
      el.srcObject = pr.stream; document.body.appendChild(el);
      await new Promise(r => setTimeout(r, 1800));
      return await window.__measure('V1');
    })));

    // V2: 元素静音播放（muted=true）—— 出声应来自 gain
    log('V2 元素静音播放', JSON.stringify(await A.evaluate(async () => {
      const pr = [...MIC.peers.values()][0];
      const el = document.querySelector('audio');
      el.muted = true; el.autoplay = true;
      await el.play().catch(() => {});
      await new Promise(r => setTimeout(r, 1800));
      return await window.__measure('V2');
    })));

    // V3: 元素取消静音并播放（会叠音，仅诊断：确认音频本身有内容）
    log('V3 元素有声播放', JSON.stringify(await A.evaluate(async () => {
      const el = document.querySelector('audio');
      el.muted = false;
      await new Promise(r => setTimeout(r, 1800));
      return await window.__measure('V3');
    })));

    // V4: 移除元素（确认因果：没有元素就静音）
    log('V4 移除元素', JSON.stringify(await A.evaluate(async () => {
      const el = document.querySelector('audio');
      el.pause(); el.srcObject = null; el.remove();
      await new Promise(r => setTimeout(r, 1800));
      return await window.__measure('V4');
    })));
  } catch (e) {
    console.error('PROBE2 FAILED:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
