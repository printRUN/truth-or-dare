// 专项：手机/平板端连麦默认走「媒体外放」（扬声器）而不是元素直出——
// 元素直出会被系统当成通话切进听筒，媒体外放（AudioContext.destination）在各端恒定走扬声器。
// 手法：整个 context 用 isMobile+hasTouch 模拟触屏设备，真触发 (hover:none) and (pointer:coarse) 媒体查询；
//      本机模式（localStorage 单槽位）同房两页，A 只听不播（顺带证明外放不需要麦克风权限）、B 开麦。
//      启动参数显式要求「自动播放需手势」，逼真机行为：ctx 必须有手势才能跑起来，验证预热/解锁链路真的有效。
// 用法: node test-mic-speaker.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8762;
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
const log = (...a) => console.log('[speaker]', ...a);

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}

async function join(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 });
  await page.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
  await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');   // 这次点击也是真机上的「首次手势」：媒体外放的 ctx 靠它预热
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=user-gesture-required'],
  });
  // 触屏设备模拟：viewport 取竖屏手机（布局用例 test-landscape.cjs 同款配方）
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  await ctx.grantPermissions(['microphone']);
  let failed = null;
  try {
    const A = await join(ctx, { name: '小鹅', tag: 'A' });
    const room = (await A.textContent('#share-room')).trim();
    const B = await join(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    log('joined', room);

    // 1) 触屏检测真的被触发（不是靠 UA 猜的），且默认就走媒体外放
    const det = await A.evaluate(() => ({
      mq: matchMedia('(hover: none) and (pointer: coarse)').matches,
      hover: matchMedia('(hover: none)').matches,
      touch: navigator.maxTouchPoints,
      coarse: COARSE_TOUCH, use: useMediaOut(), pref: speakerPref,
    }));
    log('检测:', JSON.stringify(det));
    if (!det.coarse) throw new Error('移动端模拟没触发触屏检测（媒体查询 + maxTouchPoints 两条都没中）: ' + JSON.stringify(det));
    if (!det.use) throw new Error('触屏设备上没默认走媒体外放: ' + JSON.stringify(det));

    // 2) B 开麦（A 全程只听不播：媒体外放不需要麦克风权限）
    await B.click('#btn-mic-lobby');
    const conn = async (p, t) => {
      try {
        await p.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.pc.connectionState === 'connected'), null, { timeout: 25000 });
      } catch { throw new Error(`${t} 链路没连上`); }
    };
    await conn(A, 'A'); await conn(B, 'B');
    log('webrtc connected both sides');

    // 3) 出声路径就是媒体外放：gain 已接上；元素只当「消费者」挂着，**必须是不播的**（播了就会叠音+被拽回听筒）
    const st = await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return pr && pr.mediaOut === true && pr.gainOn === true;
    }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const a = await A.evaluate(() => {
      const pr = [...MIC.peers.values()][0];
      return { hasEl: !!pr.el, elPaused: pr.el ? pr.el.paused : null, elT: pr.el ? +pr.el.currentTime.toFixed(2) : null, mediaOut: pr.mediaOut, gainOn: pr.gainOn, attached: pr.attached, audios: document.querySelectorAll('audio').length };
    });
    log('A 出声路径:', JSON.stringify(a));
    if (!st) throw new Error('A 没进入媒体外放态: ' + JSON.stringify(a));
    if (!a.hasEl) throw new Error('媒体外放缺「消费者」元素：实测没有元素时 WebAudio 收不到数据 → 真机没声音');
    if (!a.elPaused) throw new Error('消费者元素在播（会叠音，还会把输出拽回听筒）: ' + JSON.stringify(a));
    if (a.attached !== true) throw new Error('远端流没挂上（attachRemote 没跑）');

    // 4) 提示要说实话（外放=EC 变弱，得让用户知道）
    const hint = await A.waitForFunction(() => /外放/.test(document.getElementById('toast').textContent), null, { timeout: 8000 })
      .then(() => true).catch(() => false);
    if (!hint) throw new Error('没提示「已走外放」：' + await A.textContent('#toast'));
    log('已提示:', (await A.textContent('#toast')).trim());

    // 5) 波形照常（analyser 由 MediaStreamSource 喂，与出声路径无关）
    const wave = await A.waitForFunction(() => { const pr = [...MIC.peers.values()][0]; return pr && pr.level > 0.01; }, null, { timeout: 12000 })
      .then(() => true).catch(() => false);
    if (!wave) throw new Error('媒体外放模式下头像波形没动（analyser 没被喂）');

    // 6) 真出声：在 gain 上再接一个分析器取样（只有图里接了 destination 才会被拉动）
    //    这是本用例的核心证据——元素不播，声音却真的从媒体外放这一路出来了
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
      return { rms: +best.toFixed(4), ctxState: MIC.ctx.state, elPaused: pr.el.paused, elT: +pr.el.currentTime.toFixed(2) };
    });
    log('媒体外放输出取样:', JSON.stringify(out));
    if (out.ctxState !== 'running') throw new Error(`媒体外放的 AudioContext 没跑起来（${out.ctxState}）：真机上就是「对方在动但没声音」`);
    if (!(out.rms > 0.005)) throw new Error(`媒体外放没出声（rms=${out.rms}, ctx=${out.ctxState}）`);
    if (!out.elPaused) throw new Error('取样期间消费者元素被播起来了（叠音）');

    // 7) 通话中切换：关 → 退回元素直出（旧路径回归），再开 → 回到媒体外放
    await A.click('#btn-guide-lobby');
    await A.waitForSelector('#guide-mask:not([hidden])', { timeout: 8000 });
    const btnVisible = await A.isVisible('#btn-speaker-guide');
    if (!btnVisible) throw new Error('触屏设备上没显示「连麦语音外放」开关');
    await A.click('#btn-speaker-guide');
    const off = await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return pr && pr.mediaOut === false && pr.el && !pr.el.paused && pr.el.currentTime > 0.05 && pr.gainOn === false;
    }, null, { timeout: 12000 }).then(() => true).catch(() => false);
    if (!off) {
      const d = await A.evaluate(() => { const pr = [...MIC.peers.values()][0]; return { mediaOut: pr.mediaOut, paused: pr.el && pr.el.paused, t: pr.el && +pr.el.currentTime.toFixed(3), gainOn: pr.gainOn, audios: document.querySelectorAll('audio').length }; });
      throw new Error('关掉外放后没退回元素直出: ' + JSON.stringify(d));
    }
    const prefOff = await A.evaluate(() => localStorage.getItem('tod:speaker'));
    if (prefOff !== '0') throw new Error(`外放开关没持久化（tod:speaker=${prefOff}）`);
    log('关掉外放 → 元素直出接管，兜底已撤');

    await A.click('#btn-speaker-guide');
    const on = await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return pr && pr.mediaOut === true && pr.gainOn === true && pr.el && pr.el.paused;
    }, null, { timeout: 12000 }).then(() => true).catch(() => false);
    if (!on) {
      const d = await A.evaluate(() => { const pr = [...MIC.peers.values()][0]; return { mediaOut: pr.mediaOut, gainOn: pr.gainOn, paused: pr.el && pr.el.paused }; });
      throw new Error('再打开外放后没回到媒体外放路径: ' + JSON.stringify(d));
    }
    const prefOn = await A.evaluate(() => localStorage.getItem('tod:speaker'));
    if (prefOn !== '1') throw new Error(`外放开关没持久化（tod:speaker=${prefOn}）`);
    log('再打开 → 回到媒体外放，元素已停播（只当消费者）');
    await A.click('#btn-guide-ok');   // 关掉引导面板：遮罩会拦住后面所有点击
    await A.waitForSelector('#guide-mask', { state: 'hidden', timeout: 8000 });

    // 8) 单向广播时，广播方自己没有入向音轨（没有远端流可挂）——这是对的，不是漏建
    const b1 = await B.evaluate(() => {
      const pr = [...MIC.peers.values()][0];
      return { use: useMediaOut(), hasEl: !!pr.el, mediaOut: pr.mediaOut, dir: pr.dir };
    });
    log('B（单向广播方）:', JSON.stringify(b1));
    if (!b1.use) throw new Error('B 也是触屏设备却没走媒体外放模式');

    // 9) 双向：A 也开麦 → 两边都有入向音轨，广播方也该走媒体外放；且外放开麦时压得更狠（6%）
    await A.click('#btn-mic-lobby');
    const both = async (p, t) => {
      try {
        await p.waitForFunction(() => [...MIC.peers.values()].some(pr => pr.pc.connectionState === 'connected' && pr.mediaOut === true && pr.gainOn === true && pr.el && pr.el.paused), null, { timeout: 25000 });
      } catch { throw new Error(`${t} 双向时没进入媒体外放态`); }
    };
    await both(A, 'A'); await both(B, 'B');
    const duck = await A.evaluate(() => ({ music: +SFX.musicDuck.toFixed(3), on: MIC.on, mediaOut: useMediaOut() }));
    log('外放开麦时的压低力度:', JSON.stringify(duck));
    if (duck.on && duck.mediaOut && !(duck.music <= 0.061)) throw new Error(`手机外放开麦时背景音乐没压到 6%（musicDuck=${duck.music}）`);

    if (errors.length) throw new Error('页面报错: ' + errors.join(' | '));
    await A.screenshot({ path: 'shots/mic-speaker.png' });
    log('ALL MOBILE-SPEAKER E2E PASSED ✅');
  } catch (e) {
    failed = e.message;
    console.error('FAILED:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = failed ? 1 : 0;
})();
