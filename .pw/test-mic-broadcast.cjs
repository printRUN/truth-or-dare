// E2E: 开麦=广播（一个人点连麦，房里其他人不用点任何东西就能听到他）
// 用法: node test-mic-broadcast.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8747;
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

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}
const log = (...a) => console.log('[bcast]', ...a);

// 数一下本端到底申请了几次麦克风：只听的人一次都不该申请
const COUNT_GUM = () => {
  window.__gum = [];
  try {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = c => { window.__gum.push(JSON.stringify(c || {})); return orig(c); };
  } catch {}
};

async function joinTab(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
  await page.click('details.adv summary');
  await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return page;
}

// 等到某一路链路按期望的方向位接通
const connectedAs = (p, dir) => p.waitForFunction(d => {
  for (const pr of MIC.peers.values()) if (pr.dir === d && pr.pc.connectionState === 'connected') return true;
  return false;
}, dir, { timeout: 20000 });

const audible = p => p.waitForFunction(() => {
  const els = [...document.querySelectorAll('audio')].filter(el => el.srcObject);
  return els.length > 0 && els.every(el => !el.paused && el.currentTime > 0.05 && !el.muted && el.volume > 0 && el.readyState >= 2);
}, null, { timeout: 15000 });

const dumpPeers = p => p.evaluate(() => [...MIC.peers.values()].map(pr => ({
  dir: pr.dir, cs: pr.pc.connectionState, sign: pr.pc.signalingState, remoteSet: pr.remoteSet, mute: pr.warnedMute,
})));

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  await ctx.addInitScript(COUNT_GUM);
  await ctx.grantPermissions(['microphone']);
  let A, B, room;
  try {
    // 1) A 建房、B 加入，两边都不点任何东西
    A = await joinTab(ctx, { name: '小鹅', tag: 'A' });
    room = (await A.textContent('#share-room')).trim();
    B = await joinTab(ctx, { name: '小鸭', room, tag: 'B' });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    await B.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 15000 });
    log('both joined', room);

    // 2) 没开麦前：谁都不该有链路，也不该有人偷偷申请麦克风
    await B.waitForFunction(() => MIC.peers.size === 0, null, { timeout: 5000 });
    await A.waitForFunction(() => MIC.peers.size === 0, null, { timeout: 5000 });
    if ((await B.evaluate(() => window.__gum.length)) !== 0) throw new Error('B 一进房就申请了麦克风');
    if ((await A.evaluate(() => window.__gum.length)) !== 0) throw new Error('A 一进房就申请了麦克风');
    log('idle: 无链路、无麦克风申请');

    // 3) 只有 A 点连麦，B 全程不点任何东西
    await A.click('#btn-mic-lobby');
    await A.waitForFunction(() => document.querySelectorAll('#btn-mic-lobby.live').length === 1, null, { timeout: 10000 });
    await connectedAs(B, 2);            // B 侧：dir=2 = 只在收
    log('B 什么都没点，收听链路已自动接通（dir=2）');

    // 4) B 确实没被要求授权麦克风：只听不播不该申请设备
    const gumB = await B.evaluate(() => ({ n: window.__gum.length, stream: !!MIC.stream }));
    if (gumB.n !== 0 || gumB.stream) throw new Error(`B 只听不该申请麦克风: ${JSON.stringify(gumB)}`);
    // 方向位也要对：A 认为自己在广播（dir=1），不会误判成全双工
    const dirA = await A.evaluate(() => [...MIC.peers.values()].map(pr => pr.dir));
    if (!dirA.includes(1)) throw new Error(`A 侧方向位应为 1（我播），实际 ${JSON.stringify(dirA)}`);

    // 5) B 真的听得到：远端 audio 在推时间轴 + 头像在波动
    await audible(B);
    await B.waitForFunction(() => !!document.querySelector('#players-grid .player-card.speaking'), null, { timeout: 12000 });
    await A.screenshot({ path: 'shots/bcast-a.png' });
    await B.screenshot({ path: 'shots/bcast-b.png' });
    log('B 扬声器真出声，且看到 A 在说话');

    // 6) A 侧确实是单向推流，而且不能因为“没收到对方声音”误报 🔇
    //（watchdog 每 2.5s 一轮、链路满 6s 无入向包才判警，所以先让 A 这路老到 9s 以上再看标志位）
    await A.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return !!pr && pr.dir === 1 && pr.pc.connectionState === 'connected' && Date.now() - pr.at > 9000;
    }, null, { timeout: 20000 });
    await B.waitForFunction(() => {
      const pr = [...MIC.peers.values()][0];
      return !!pr && pr.gotAt > 0;
    }, null, { timeout: 15000 });
    const sent = await A.evaluate(async () => {
      const pr = [...MIC.peers.values()][0];
      const st = await pr.pc.getStats();
      let out = 0, inb = 0;
      st.forEach(s => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') out = Math.max(out, s.bytesSent || 0);
        if (s.type === 'inbound-rtp' && s.kind === 'audio') inb = Math.max(inb, s.bytesReceived || 0);
      });
      return { out, inb, muteWarn: pr.warnedMute, dir: pr.dir };
    });
    if (!(sent.out > 0)) throw new Error(`A 没有推流: ${JSON.stringify(sent)}`);
    if (sent.inb > 0) log('（注）A 也收到了入向包，全双工残留，不影响广播语义');
    if (sent.muteWarn) throw new Error(`A 误报了“没收到对方声音”: ${JSON.stringify(sent)}`);
    log('A 单向推流 bytesSent=' + sent.out + '，未误报 🔇');

    // 7) B 点“收听”关掉：不该再收任何东西，且 A 必须跟着撤掉推给 B 的那一路（黑洞修复）
    await B.click('#btn-listen-lobby');
    await B.waitForFunction(() => MIC.peers.size === 0 && localStorage.getItem('tod:listen') === '0', null, { timeout: 10000 });
    await A.waitForFunction(() => MIC.peers.size === 0, null, { timeout: 10000 }).catch(async () => {
      const d = await dumpPeers(A);
      throw new Error(`B 关收听后 A 仍留着推给它的链路（黑洞）: ${JSON.stringify(d)}`);
    });
    const btnTxt = await B.textContent('#btn-listen-lobby');
    if (!/已静音/.test(btnTxt)) throw new Error(`B 收听按钮文案没更新: ${btnTxt}`);
    log('B 关收听 → A 同步撤链路，黑洞已避免');

    // 8) B 再点一下恢复收听：必须能重新接上（这一步在广播方看不到收听状态时是修不好的）
    await B.click('#btn-listen-lobby');
    await B.waitForFunction(() => localStorage.getItem('tod:listen') === '1', null, { timeout: 5000 });
    await connectedAs(B, 2);
    await connectedAs(A, 1);
    await audible(B);
    log('B 恢复收听 → 链路自动重建，又听到声音');

    // 9) B 也开麦：升级为全双工（dir=3），两端都出声
    await B.click('#btn-mic-lobby');
    await connectedAs(B, 3);
    await connectedAs(A, 3);
    await audible(A); await audible(B);
    if ((await B.evaluate(() => window.__gum.length)) !== 1) throw new Error('B 开麦后应刚好申请一次麦克风');
    await A.screenshot({ path: 'shots/bcast-full.png' });
    log('双方开麦 → dir=3 全双工，两端都出声');

    if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
    else log('ALL BROADCAST E2E PASSED ✅');
  } catch (e) {
    console.error('FAILED:', e.message);
    errors.forEach(x => console.error('  ' + x));
    process.exitCode = 1;
  } finally {
    try {
      if (A) log('  A peers', JSON.stringify(await dumpPeers(A)));
      if (B) log('  B peers', JSON.stringify(await dumpPeers(B)));
    } catch {}
    await browser.close();
    server.close();
  }
})();
