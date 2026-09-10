// E2E: 连麦（WebRTC mesh over 本地模式信令）+ 说话头像波动 + 加载动画
// 用法: node test-mic.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8733;
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

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}
const log = (...a) => console.log('[mic]', ...a);

async function joinTab(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
  await page.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=' + (tag === 'A' ? 0 : 1));
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });   // 抑制首进引导弹窗（引导本体在 test-host.cjs 里专测），避免遮挡点击
  await ctx.grantPermissions(['microphone']);
  let A, B, room;
  try {
    // 1) 加载动画：3D 抽卡 overlay 首屏可见，随后淡出移除
    const p0 = await ctx.newPage();
    watch(p0, 'L');
    await p0.goto(URL, { waitUntil: 'domcontentloaded' });
    await p0.waitForSelector('.loader-card', { state: 'visible', timeout: 3000 });
    await p0.waitForTimeout(150);
    await p0.screenshot({ path: 'shots/mic-loader.png' });
    await p0.waitForSelector('#loading-overlay', { state: 'detached', timeout: 6000 });
    await p0.close();
    log('loader ok: visible -> detached');

    // 2) A 建房、B 加入
    A = await joinTab(ctx, { name: '小鹅', tag: 'A' });
    room = (await A.textContent('#share-room')).trim();
    B = await joinTab(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    await B.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    log('both joined', room);

    // 3) 双方开麦 → 按钮 live
    await A.click('#btn-mic-lobby');
    await B.click('#btn-mic-lobby');
    await A.waitForFunction(() => document.querySelectorAll('#btn-mic-lobby.live').length === 1, null, { timeout: 10000 });
    await B.waitForFunction(() => document.querySelectorAll('#btn-mic-lobby.live').length === 1, null, { timeout: 10000 });
    log('mic buttons live on both');

    // 4) micOn 徽章 + WebRTC 成链
    await A.waitForSelector('.player-card.mic-on >> nth=1', { timeout: 10000 });
    const connected = p => p.waitForFunction(() => {
      for (const pr of MIC.peers.values()) if (pr.pc.connectionState === 'connected') return true;
      return false;
    }, null, { timeout: 20000 });
    await connected(A); await connected(B);
    log('webrtc connected both sides');

    // 5) 假麦克风持续出音 → 两端都看到对方头像 speaking
    await A.waitForFunction(() => {
      const other = [...MIC.peers.values()].find(pr => pr.analyser);
      return other && other.level > 0.02;
    }, null, { timeout: 12000 });
    await A.waitForFunction(() => !!document.querySelector('#players-grid .player-card.speaking'), null, { timeout: 10000 });
    await B.waitForFunction(() => !!document.querySelector('#players-grid .player-card.speaking'), null, { timeout: 10000 });
    const levels = await A.evaluate(() => ({
      local: +MIC.localLevel.toFixed(3),
      remote: +([...MIC.peers.values()][0].level || 0).toFixed(3),
    }));
    log('voice levels on A:', JSON.stringify(levels));
    await A.screenshot({ path: 'shots/mic-speaking.png' });

    // 6) 真出声：光有 audio 元素不算——必须 paused=false 且 currentTime 在往前走
    //（AnalyserNode 有波形不代表听得到：自动播放被拦时头像照常波动却没声音）
    for (const [p, tag] of [[A, 'A'], [B, 'B']]) {
      await p.waitForFunction(() => {
        const els = [...document.querySelectorAll('audio')].filter(el => el.srcObject);
        return els.length > 0 && els.every(el => !el.paused && el.currentTime > 0.05 && !el.muted && el.volume > 0 && el.readyState >= 2);
      }, null, { timeout: 15000 }).catch(async () => {
        const d = await p.evaluate(() => [...document.querySelectorAll('audio')].filter(el => el.srcObject).map(el => ({ paused: el.paused, t: +el.currentTime.toFixed(3), muted: el.muted, vol: el.volume, rs: el.readyState, tracks: el.srcObject.getAudioTracks().length })));
        throw new Error(`${tag} 远端音频没出声: ${JSON.stringify(d)}`);
      });
      log(tag, '扬声器真出声（audio 元素在推时间轴）');
    }

    // 7) B 关麦：广播模型下不该拆干净——A 仍单向播给 B，B 仍留着收听 A 的那一路
    await B.click('#btn-mic-lobby');
    await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return MIC.peers.size === 1 && pr.dir === 1 && pr.pc.connectionState === 'connected';
    }, null, { timeout: 15000 }).catch(async () => {
      const d = await A.evaluate(() => [...MIC.peers.values()].map(pr => ({ dir: pr.dir, cs: pr.pc.connectionState })));
      throw new Error(`A 关麦后应只剩 dir=1 的广播路: ${JSON.stringify(d)}`);
    });
    await B.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return MIC.peers.size === 1 && pr.dir === 2 && pr.pc.connectionState === 'connected';
    }, null, { timeout: 15000 }).catch(async () => {
      const d = await B.evaluate(() => [...MIC.peers.values()].map(pr => ({ dir: pr.dir, cs: pr.pc.connectionState })));
      throw new Error(`B 关麦后应保留 dir=2 的收听路: ${JSON.stringify(d)}`);
    });
    // 核心验收：B 自己没开麦，但依然听得到 A
    await B.waitForFunction(() => {
      const els = [...document.querySelectorAll('audio')].filter(el => el.srcObject);
      return els.length > 0 && els.every(el => !el.paused && el.currentTime > 0.05);
    }, null, { timeout: 15000 });
    log('broadcast teardown ok（A 留 dir=1 广播、B 留 dir=2 收听且仍有声音）');

    // 8) 开局进游戏：游戏页连麦按钮可用（B 重新开麦，验证 A 自动重新成链）
    await A.click('#btn-start');
    await B.waitForSelector('#screen-game.active', { timeout: 15000 });
    await A.waitForSelector('#screen-game.active', { timeout: 15000 });
    await B.click('#btn-mic-game');
    await B.waitForFunction(() => document.querySelectorAll('#btn-mic-game.live').length === 1, null, { timeout: 10000 });
    await A.waitForFunction(() => MIC.peers.size === 1, null, { timeout: 15000 });
    await A.screenshot({ path: 'shots/mic-game.png' });
    await B.screenshot({ path: 'shots/mic-game-b.png' });
    log('game screen ok, mic re-established in-game');

    if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
    else log('ALL MIC E2E PASSED ✅');
  } catch (e) {
    console.error('FAILED:', e.message);
    errors.forEach(x => console.error('  ' + x));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
