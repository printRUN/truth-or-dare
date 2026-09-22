// 专项：浏览器拦住远端 audio 自动播放时（头像照常波动却一点声音都没有），兜底出声是否生效
// 手法：把 HTMLMediaElement.prototype.play 改成拒绝，等于真实浏览器里的 NotAllowedError
// 用法: node test-mic-autoplay.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8745;
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
const log = (...a) => console.log('[autoplay]', ...a);

const INIT = () => {
  window.__blockPlay = false;
  window.__playRejected = 0;
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__blockPlay && this.tagName === 'AUDIO') {
      window.__playRejected++;
      return Promise.reject(Object.assign(new Error('blocked by policy'), { name: 'NotAllowedError' }));
    }
    return orig.apply(this, arguments);
  };
  // 真被策略拦住时 autoplay 属性也不会起播，所以光 stub play() 不够：拦的时候补一刀 pause()
  document.addEventListener('playing', e => {
    if (window.__blockPlay && e.target && e.target.tagName === 'AUDIO') e.target.pause();
  }, true);
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
  await page.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
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
    log('joined', room);

    // A 的浏览器会拒绝播放远端音频；B 正常
    await A.evaluate(() => { window.__blockPlay = true; });
    await A.click('#btn-mic-lobby');
    await B.click('#btn-mic-lobby');
    const conn = async (p, t) => {
      try {
        await p.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.pc.connectionState === 'connected'), null, { timeout: 25000 });
      } catch {
        throw new Error(`${t} 链路没连上`);
      }
    };
    await conn(A, 'A'); await conn(B, 'B');
    log('webrtc connected both sides');

    // 1) 症状复现：audio 元素被拦（paused）+ 波形照样在动（level>0）→ 就是“对方头像在动却没声音”
    //（先等 2s：autoplay 属性会先起播一次，被 pause 模拟拦下后才能看到 paused 态）
    await A.waitForTimeout(2000);
    const blocked = await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return pr && pr.el && pr.el.paused && pr.gainOn === true && pr.level > 0.01;
    }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const sym = await A.evaluate(() => { const pr = [...MIC.peers.values()][0]; return { el: !!(pr && pr.el), elPaused: pr && pr.el && pr.el.paused, gainOn: pr && pr.gainOn, waveLevel: pr ? +pr.level.toFixed(3) : -1, rejected: window.__playRejected }; });
    log('症状复现:', JSON.stringify(sym));
    if (!blocked) throw new Error('没进入「元素被拦 + 波形在动 + 兜底已接上」状态');
    if (sym.rejected < 1) throw new Error('play() 没被拦，测试无效');

    // 2) 提示要说实话
    const toastTxt = await A.textContent('#toast');
    if (!/拦/.test(toastTxt)) throw new Error(`没提示自动播放被拦，toast=${toastTxt}`);
    log('已提示:', toastTxt);

    // 3) 兜底链路真在往外送声音：在 gain 上再接一个分析器取样（只有图里接了 destination 才会被拉动）
    const out = await A.evaluate(async () => {
      const pr = [...MIC.peers.values()][0];
      const probe = MIC.ctx.createAnalyser(); probe.fftSize = 512;
      pr.gain.connect(probe);
      const tmp = new Uint8Array(probe.fftSize);
      let best = 0;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => requestAnimationFrame(r));
        probe.getByteTimeDomainData(tmp);
        let sum = 0;
        for (let j = 0; j < tmp.length; j++) { const d = (tmp[j] - 128) / 128; sum += d * d; }
        best = Math.max(best, Math.sqrt(sum / tmp.length));
      }
      pr.gain.disconnect(probe);
      return { rms: +best.toFixed(4), ctxState: MIC.ctx.state };
    });
    log('兜底输出取样:', JSON.stringify(out));
    if (!(out.rms > 0.005)) throw new Error(`AudioContext 兜底没出声（rms=${out.rms}, ctx=${out.ctxState}）`);

    // 4) 用户再点一下页面 → 元素解冻接管，兜底自动撤走（不然两路叠音）
    await A.evaluate(() => { window.__blockPlay = false; });
    await A.mouse.click(20, 400);   // 一次真实手势（合成的 PointerEvent 不算用户激活，测不出解锁）
    const taken = await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return pr && pr.el && !pr.el.paused && pr.el.currentTime > 0.05 && pr.gainOn === false;
    }, null, { timeout: 12000 }).then(() => true).catch(() => false);
    if (!taken) {
      const d = await A.evaluate(() => { const pr = [...MIC.peers.values()][0]; return { paused: pr.el.paused, t: +pr.el.currentTime.toFixed(3), gainOn: pr.gainOn }; });
      throw new Error('解锁后 audio 元素没接管: ' + JSON.stringify(d));
    }
    log('手势后元素接管，兜底已撤');
    await A.screenshot({ path: 'shots/mic-autoplay.png' });
    log('ALL AUTOPLAY-FALLBACK E2E PASSED ✅');
  } catch (e) {
    failed = e.message;
    console.error('FAILED:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
