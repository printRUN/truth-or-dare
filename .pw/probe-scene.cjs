// 探针：一镜到底转场是否真的「连续」（无瞬移机位 + 新旧屏 3D 景深穿行）并截图
// 用法: node probe-scene.cjs   （from .pw/；静态服务器端口 8793）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8793;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const errors = [];

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide');
  }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}

async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 换屏期间逐帧采样：世界层机位 + 新旧屏 class/transform，检查机位有没有“瞬移”
function installSampler(p) {
  return p.evaluate(() => {
    window.__samples = [];
    window.__sampling = false;
    window.__startSample = () => {
      window.__samples = []; window.__sampling = true;
      const tick = () => {
        if (!window.__sampling) return;
        const w = document.getElementById('world3d');
        // 注意：正则也会命中函数名里的 translate3d 的“3”，所以真正的 z 在 [3]、rx 在 [4]
        const c = w.style.transform.match(/-?\d+(\.\d+)?/g) || [];
        const act = document.querySelector('.screen.active');
        const lv = document.querySelector('.screen.leaving');
        window.__samples.push({
          t: performance.now(),
          z: parseFloat(c[3] || '0'), rx: parseFloat(c[4] || '0'),
          raw: w.style.transform.slice(0, 70),
          act: act ? act.id : null, actTr: act ? getComputedStyle(act).transform.slice(0, 60) : '',
          lv: lv ? lv.id : null, lvTr: lv ? getComputedStyle(lv).transform.slice(0, 60) : '',
          back: w.classList.contains('tx-back'),
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__stopSample = () => { window.__sampling = false; return window.__samples; };
  });
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 840 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const A = await open(ctx, 'A');
  await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  // 首屏（加入页→大厅）的入场是在加载层收起那一刻才放：轮询确认它真的播了
  let lobbyEntered = false;
  for (let i = 0; i < 60; i++) {
    if (await A.evaluate(() => document.getElementById('screen-lobby').classList.contains('entering'))) { lobbyEntered = true; break; }
    await sleep(100);
  }
  console.log('[scene] 加入页→大厅：加载层收起时大厅播了 3D 入场 =', lobbyEntered);
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, 'B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
  await A.waitForTimeout(600);

  await installSampler(A);

  // ── lobby → game（前进）──
  await A.evaluate(() => window.__startSample());
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.screenshot({ path: 'shots/scene-fwd-1.png' });
  await A.waitForTimeout(300);
  await A.screenshot({ path: 'shots/scene-fwd-2.png' });
  await A.waitForTimeout(1400);
  const fwd = await A.evaluate(() => window.__stopSample());
  await A.screenshot({ path: 'shots/scene-fwd-3.png' });

  // 机位连续性：相邻采样帧的世界层 z / rx 增量不该出现“瞬移”
  let maxDz = 0, maxDrx = 0, sawEntering = false, sawLeaving = false, worst = '';
  for (let i = 1; i < fwd.length; i++) {
    const dz = Math.abs(fwd[i].z - fwd[i - 1].z), drx = Math.abs(fwd[i].rx - fwd[i - 1].rx);
    if (dz > maxDz || drx > maxDrx) worst = `${fwd[i - 1].raw}  →  ${fwd[i].raw}`;
    maxDz = Math.max(maxDz, dz);
    maxDrx = Math.max(maxDrx, drx);
    if (fwd[i].actTr !== 'none') sawEntering = true;
    if (fwd[i].lv) sawLeaving = true;
  }
  console.log('[scene] fwd lobby→game samples=' + fwd.length, 'maxΔz=' + maxDz.toFixed(1), 'maxΔrx=' + maxDrx.toFixed(2));
  console.log('[scene] fwd 最大跳变处: ' + worst);
  console.log('[scene] fwd 前 8 帧 z:', fwd.slice(0, 8).map(s => s.z.toFixed(1)).join(','));
  console.log('[scene] fwd 后 4 帧 z:', fwd.slice(-4).map(s => s.z.toFixed(1)).join(','), '（应收敛到 game 常态 -24）');
  let maxGap = 0, gapAt = '';
  for (let i = 1; i < fwd.length; i++) { const d = fwd[i].t - fwd[i - 1].t; if (d > maxGap) { maxGap = d; gapAt = `${fwd[i - 1].z.toFixed(1)}→${fwd[i].z.toFixed(1)}`; } }
  console.log('[scene] fwd 最大帧间隔 =', maxGap.toFixed(0) + 'ms', '@z', gapAt);
  console.log('[scene] fwd 期间新屏有 3D 入场 =', sawEntering, '/ 旧屏同时在转身 =', sawLeaving, '/ tx-back =', fwd.some(s => s.back));

  // 稳态：动画结束后不留常驻 transform、不留 entering/leaving
  await A.waitForTimeout(400);
  const steady = await A.evaluate(() => ({
    anyTransform: [...document.querySelectorAll('.screen')].some(s => getComputedStyle(s).transform !== 'none'),
    entering: !!document.querySelector('.screen.entering'),
    leaving: !!document.querySelector('.screen.leaving'),
  }));
  const hit = await A.evaluate(async () => {
    const b = document.getElementById('card-truth');
    b.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 120));
    const r = b.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    // 轮到自己才是可点卡（否则卡是 disabled/pointer-events:none）——这里只验证「没有残留的转场层盖在牌桌上」
    return { ok: !!(h && h.closest && h.closest('#choice-section')), hit: h ? (h.id || h.className) : null, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  });
  steady.hitOk = hit.ok;
  console.log('[scene] game 稳态:', JSON.stringify(steady));
  if (!hit.ok) console.log('[scene] ⚠ 选卡命中异常: ', JSON.stringify(hit));

  // ── game → lobby（回退）──
  await A.evaluate(() => window.__startSample());
  await A.click('#btn-end-game');
  await A.click('#btn-end-game');   // 破坏性操作二次确认
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await A.screenshot({ path: 'shots/scene-back-1.png' });
  await A.waitForTimeout(1500);
  const back = await A.evaluate(() => window.__stopSample());
  console.log('[scene] back game→lobby tx-back =', back.some(s => s.back), '（应 true）/ samples=' + back.length);
  await A.screenshot({ path: 'shots/scene-back-2.png' });

  console.log(errors.length ? '[scene] ERRORS:\n' + errors.join('\n') : '[scene] 零 JS 报错 ✅');
  await browser.close();
  server.close();
  process.exitCode = errors.length ? 1 : 0;
})();
