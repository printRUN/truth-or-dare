// E2E: 开麦=广播 × 多人网状网（A 一个人开麦，B/C 都不点任何东西也要能听到）
// 用法: node test-mic-3way.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8748;
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
const log = (...a) => console.log('[3way]', ...a);

const COUNT_GUM = () => {
  window.__gum = [];
  try {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = c => { window.__gum.push(JSON.stringify(c || {})); return orig(c); };
  } catch {}
};

async function joinTab(ctx, { name, room, tag, nth }) {
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

// 每条链路都按期望方向位接通（期望值是多路 dir 排序后的数组）
const dirsConnected = (p, expect) => p.waitForFunction(e => {
  const got = [...MIC.peers.values()].filter(pr => pr.pc.connectionState === 'connected').map(pr => pr.dir).sort();
  return JSON.stringify(got) === JSON.stringify(e);
}, expect.slice().sort(), { timeout: 25000 });

const audibleAll = (p, n) => p.waitForFunction(c => {
  const els = [...document.querySelectorAll('audio')].filter(el => el.srcObject);
  return els.length >= c && els.every(el => !el.paused && el.currentTime > 0.05 && !el.muted && el.volume > 0 && el.readyState >= 2);
}, n, { timeout: 20000 });

const dump = p => p.evaluate(() => [...MIC.peers.values()].map(pr => ({ dir: pr.dir, cs: pr.pc.connectionState })));
const all = f => Promise.all(['A', 'B', 'C'].map(t => f(PAGES[t], t)));
let PAGES = {};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  await ctx.addInitScript(COUNT_GUM);
  await ctx.grantPermissions(['microphone']);
  try {
    // 1) 三人进房
    PAGES.A = await joinTab(ctx, { name: '小鹅', tag: 'A', nth: 0 });
    const room = (await PAGES.A.textContent('#share-room')).trim();
    PAGES.B = await joinTab(ctx, { name: '小鸭', room, tag: 'B', nth: 1 });
    PAGES.C = await joinTab(ctx, { name: '小鸡', room, tag: 'C', nth: 2 });
    for (const t of ['A', 'B', 'C']) await PAGES[t].waitForSelector('#players-grid .player-card >> nth=2', { timeout: 20000 });
    log('three joined', room);

    // 2) 只有 A 开麦：B、C 一次麦克风都不该申请，但要各有一路 dir=2 且真出声
    await PAGES.A.click('#btn-mic-lobby');
    await dirsConnected(PAGES.B, [2]);
    await dirsConnected(PAGES.C, [2]);
    await dirsConnected(PAGES.A, [1, 1]);          // A 要同时把声音播给 B 和 C（网状扇出）
    const gums = await all(async p => await p.evaluate(() => ({ n: window.__gum.length, stream: !!MIC.stream })));
    if (gums[1].n !== 0 || gums[2].n !== 0 || gums[1].stream || gums[2].stream) {
      throw new Error(`只听的人不该申请麦克风: B=${JSON.stringify(gums[1])} C=${JSON.stringify(gums[2])}`);
    }
    await audibleAll(PAGES.B, 1);
    await audibleAll(PAGES.C, 1);
    log('A 一人开麦 → B/C 不点任何东西都听得到（且没被要麦克风权限）');

    // 3) A 的上行确实发给两个人，且没人误报 🔇
    const aStats = await PAGES.A.evaluate(async () => {
      const out = [];
      for (const pr of MIC.peers.values()) {
        const st = await pr.pc.getStats();
        let b = 0;
        st.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'audio') b = Math.max(b, s.bytesSent || 0); });
        out.push({ dir: pr.dir, bytes: b, mute: pr.warnedMute });
      }
      return out;
    });
    if (aStats.length !== 2 || aStats.some(s => !(s.bytes > 0) || s.mute)) {
      throw new Error(`A 没有向两路都推流: ${JSON.stringify(aStats)}`);
    }
    log('A 两路都在推流:', JSON.stringify(aStats.map(s => s.bytes)));

    // 4) B 也开麦：A-B 升级为全双工，B-C 是 B 单播给 C（C 仍是纯收听）
    await PAGES.B.click('#btn-mic-lobby');
    await dirsConnected(PAGES.A, [1, 3]);
    await dirsConnected(PAGES.B, [1, 3]);
    await dirsConnected(PAGES.C, [2, 2]);
    await audibleAll(PAGES.C, 2);                  // C 同时听到 A 和 B 两个人
    await audibleAll(PAGES.A, 1);
    await audibleAll(PAGES.B, 1);
    log('B 开麦后：A↔B 全双工，C 同时听到 A+B 两路');

    // 5) C 全程没开麦，头像上应能看到两个人在说话
    await PAGES.C.waitForFunction(() => document.querySelectorAll('#players-grid .player-card.speaking').length >= 2, null, { timeout: 15000 });
    await PAGES.C.screenshot({ path: 'shots/3way-c.png' });
    await PAGES.A.screenshot({ path: 'shots/3way-a.png' });
    log('C 看到 2 个人在说话（自己一次麦克风都没开）');

    // 6) A 关麦：A 转为纯收听（不能把自己收听 B 的那一路一起拆没），B 变成向 A、C 两路广播，C 只剩 B 一路
    await PAGES.A.click('#btn-mic-lobby');
    await dirsConnected(PAGES.A, [2]);
    await dirsConnected(PAGES.B, [1, 1]);
    await dirsConnected(PAGES.C, [2]);
    await audibleAll(PAGES.A, 1);
    await audibleAll(PAGES.C, 1);
    log('A 关麦后转为纯收听，仍能听到 B；C 也从两路收为一路');

    if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
    else log('ALL 3-WAY BROADCAST E2E PASSED ✅');
  } catch (e) {
    console.error('FAILED:', e.message);
    for (const t of ['A', 'B', 'C']) {
      try { if (PAGES[t]) log('  ', t, 'peers', JSON.stringify(await dump(PAGES[t]))); } catch {}
    }
    errors.forEach(x => console.error('  ' + x));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
