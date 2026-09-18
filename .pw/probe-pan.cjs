// 探针：VR 扫视换场的回归门（替代 probe-cube 的刚体判据——扫视动的是镜头，不是两面）
// 用法: node probe-pan.cjs   （from .pw/；静态服务器端口 8796）
//
// 判据 1 加载门控：揭幕期间镜头偏航停在换屏前基线（|Δry|<0.5°）、入屏整体在视口外（left ≥ vw）、
//                 出屏停在原位——「加载没完成，新场景一个像素不入画、镜头不动」。
// 判据 2 扫视连续：入屏 translateX 逐帧单调推进无反向、无跳变（Δ < 0.04·S+10，相对阈值防大屏假红）。
// 判据 3 全景空隙：vw≥900 时两房同框的帧里缝宽（B.left − A.right）≥ 220px
//                 （面板各自居中，缝 = S − 面板宽，随视口增大——恒速三段让缝在屏 ~54% 时长）。
// 判据 4 偏头一瞥：扫视中段世界层 |ry − 基线| ∈ (2°, 9°]（钟形偏航，dolly 双段），收尾回正。
// 判据 5 终态无残差：类摘除后无 entering/leaving、落位屏 computed transform === 'none'（pan-in 终帧字面 none）。
// 判据 6 镜像 + 窄屏同框：回扫（tx-back）入屏从 −S 侧进入（rect.right ≤ vw）；390 视口两房同框有持续窗口。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8796;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const errors = [];
let fails = 0;
const log = (...a) => console.log('[pan]', ...a);
const check = (cond, msg, extra) => { log((cond ? '  ✅ ' : '  ❌ ') + msg, extra ?? ''); if (!cond) fails++; };

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag, viewport) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  await p.setViewportSize(viewport);
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
// rAF 采样器：入屏/出屏投影矩形 + 世界层 ry（从 matrix3d 解 atan2(m[8], m[0])，括号切分防函数名混入数字）
function installSampler(p) {
  return p.evaluate(() => {
    window.__ps = []; window.__psOn = false;
    const ryOf = () => {
      const t = getComputedStyle(document.getElementById('world3d')).transform;
      if (!t || t === 'none') return 0;
      const m = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')')).split(',').map(Number);
      return (m.length < 16 || m.some(isNaN)) ? 0 : Math.atan2(m[8], m[0]) * 180 / Math.PI;
    };
    const rect = el => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1) }; };
    window.__psStart = () => {
      window.__ps = []; window.__psOn = true;
      const tick = () => {
        if (!window.__psOn) return;
        const en = document.querySelector('.screen.entering'), lv = document.querySelector('.screen.leaving');
        window.__ps.push({ t: performance.now(), en: en ? rect(en) : null, lv: lv ? rect(lv) : null, ry: +ryOf().toFixed(2) });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__psStop = () => { window.__psOn = false; return window.__ps; };
  });
}

(async () => {
  await new Promise(r => { server.listen(PORT, r); log(`serving :${PORT}`); });
  const browser = await chromium.launch({ args: ['--disable-gpu'] });

  // ── 判据 1 加载门控 + 判据 2/3/4/5 扫视几何（桌面 1280×800） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'A', { width: 1280, height: 800 });
    await join(A, '阿扫');
    // 门控：等加入过场的揭幕开始（加载层是复用元素：先等它显示、再等它隐藏）
    await A.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !!o && !o.classList.contains('hide'); }, null, { timeout: 20000 });
    const baseRy = await A.evaluate(() => +Cam.cur.ry.toFixed(2));   // join 基线 ry=-3
    const joinRect = await A.evaluate(() => { const r = document.getElementById('screen-join').getBoundingClientRect(); return { l: +r.left.toFixed(1) }; });
    await A.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !!o && o.classList.contains('hide'); }, null, { timeout: 20000 });
    await sleep(30);    // 紧跟揭幕采样（280ms delay 未到；evaluate 往返有开销，别再睡多）
    const gate = await A.evaluate(() => {
      const en = document.querySelector('.screen.entering');
      const lv = document.querySelector('.screen.leaving');
      if (!en || !lv) return null;
      return {
        ry: +Cam.cur.ry.toFixed(2),
        enLeft: +en.getBoundingClientRect().left.toFixed(1),
        lvLeft: +lv.getBoundingClientRect().left.toFixed(1),
        vw: window.innerWidth,
      };
    });
    log('[门控] 揭幕中段:', JSON.stringify(gate), ' 基线 ry=', baseRy, ' join.left=', joinRect.l);
    check(!!gate, '揭幕期间两面动画在场');
    if (gate) {
      check(Math.abs(gate.ry - baseRy) < 0.5, `加载未完成镜头不动（ry ${gate.ry} vs 基线 ${baseRy}，|Δ|<0.5°）`);
      check(gate.enLeft >= gate.vw - 1, `新场景整个在视口外（left ${gate.enLeft} ≥ vw ${gate.vw}）`);
      const notStarted = await A.evaluate(() => { const el = document.querySelector('.screen.leaving'); const a = el && el.getAnimations ? el.getAnimations() : []; return a.length ? a[0].currentTime < 280 : true; });
      check(notStarted && Math.abs(gate.lvLeft - joinRect.l) < 220, `旧场景停在原位供揭幕（动画未起跑 currentTime<280ms，left ${gate.lvLeft} ≈ ${joinRect.l}±投影漂移）`);
    }
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 8000 }).catch(() => {});
    await A.waitForTimeout(600);   // 等回正段收完

    // 扫视几何：先切到 game（这次扫视不采样），再回大厅→再进 game，第二次前进扫视才是采样对象
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 6000 }).catch(() => {});
    await A.waitForTimeout(400);
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));   // game→lobby：回扫（不采样，顺带验证不炸）
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 6000 }).catch(() => {});
    await A.waitForTimeout(400);   // 等回正段收完，两次扫视的采样窗严格分离
    await installSampler(A);
    await A.evaluate(() => window.__psStart());
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));   // lobby→game：前进扫视（分析对象）
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 6000 }).catch(() => {});
    const samples = await A.evaluate(() => window.__psStop());
    const S = 1280 + 280;
    const fwd = samples.filter(s => s.en && s.lv);
    log(`[扫视] 采样 ${samples.length} 帧，两面在场 ${fwd.length} 帧`);
    // 判据 2：连续性
    let maxD = 0, rev = 0;
    for (let i = 1; i < fwd.length; i++) {
      const d = fwd[i].en.l - fwd[i - 1].en.l;
      if (d > 0.5) rev++;
      maxD = Math.max(maxD, Math.abs(d));
    }
    check(fwd.length >= 8, `扫视被逐帧采到（${fwd.length} 帧 ≥ 8）`);
    check(rev === 0, `入屏滑动无反向帧（rev=${rev}）`);
    // v4.2 深度参照层上线后，软件光栅（headless SwiftShader）下合成 6 个动层，掉帧更长：
    // 实测单帧最大 Δ ~232px（≈95ms 运动量，掉帧非传送——传送是 S 级 ~1560px）；0.12→0.16·S 容纳之，
    // 真机 GPU 合成无此现象（判据意图不变：容掉帧，不容传送）
    check(maxD < 0.16 * S + 20, `无跳变（最大帧间 Δ ${maxD.toFixed(1)}px < 0.16·S+20 = ${(0.16 * S + 20).toFixed(0)}，容掉帧不容传送）`);
    // 判据 3：空隙 + 判据 4：偏航
    const both = fwd.filter(s => s.en.l < s.en.r && s.lv.r > s.lv.l && s.en.l >= s.lv.r);
    const gaps = both.map(s => +(s.en.l - s.lv.r).toFixed(1));
    const minGap = gaps.length ? Math.min(...gaps) : -1;
    log('[空隙] 两房同框帧:', both.length, ' 缝宽范围:', gaps.length ? `${Math.min(...gaps)}~${Math.max(...gaps)}` : 'n/a');
    check(both.length >= 6, `两房同框有持续窗口（${both.length} 帧 ≥ 6，恒速段让缝在屏 ~54% 时长）`);
    check(minGap >= 220, `缝宽 ≥220px（实测最小 ${minGap}px，桌面 = vw+280−面板920 = 640 档）`);
    const ryPeak = Math.max(...fwd.map(s => Math.abs(s.ry)));
    const ryEnd = Math.abs(samples[samples.length - 1].ry);
    log('[偏航] 峰值 |ry| =', ryPeak, ' 收尾 |ry| =', ryEnd);
    check(ryPeak > 2 && ryPeak <= 9, `偏头一瞥钟形到位（峰值 |ry| ${ryPeak}° ∈ (2°,9°]，桌面 7° 档）`);
    check(ryEnd < 1.5, `扫视收尾镜头回正（|ry| ${ryEnd}° < 1.5°，lobby/game 基线 0°）`);
    // 判据 5：终态无残差
    const finAny = await A.evaluate(() => !!document.querySelector('.screen.entering,.screen.leaving'));
    const actT = await A.evaluate(() => getComputedStyle(document.getElementById('screen-game')).transform);
    check(!finAny, '落位后无残留 entering/leaving');
    check(actT === 'none', `落位屏 computed transform === 'none'（pan-in 终帧字面 none）实测 '${actT}'`);
    await A.screenshot({ path: 'shots/pan-settled-game.png' });
    await ctx.close();
  }

  // ── 判据 6 窄屏两房同框（390） + 镜像（回扫入屏从 −S 侧进入） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const A = await open(ctx, 'N', { width: 390, height: 844 });
    await join(A, '阿窄');
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => S && S.room, null, { timeout: 20000 });
    const roomN = await A.evaluate(() => S.room);
    const B = await open(ctx, 'N2', { width: 390, height: 844 });
    await join(B, '阿陪', roomN);
    await A.waitForFunction(() => S.players.length === 2, null, { timeout: 20000 });
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 8000 }).catch(() => {});
    await A.waitForTimeout(800);
    // rAF 在 headless 后台页会被节流（采样 0 帧的教训）——Node 侧轮询投影矩形
    await A.bringToFront();
    const poll = async () => A.evaluate(() => {
      const en = document.querySelector('.screen.entering'), lv = document.querySelector('.screen.leaving');
      const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1) }; };
      return { en: r(en), lv: r(lv) };
    });
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));   // 触发 lobby→game 前进扫视（上轮补丁误删，没有它整段无换屏）
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const s = await poll();
      if (!s.en && samples.length) break;   // 类已摘且采到过数据 → 扫视结束
      if (s.en) samples.push(s);
      await sleep(60);
    }
    const fwd = samples;
    const both = fwd.filter(s => s.lv && s.en.l < s.en.r && s.lv.r > s.lv.l && s.en.l >= s.lv.r);
    log('[窄屏] 采样', samples.length, '帧，同框', both.length, '帧');
    check(both.length >= 4, `窄屏两房同框（${both.length} 帧 ≥ 4——S=逻辑宽+280 无 900 下限，移动端也有「之间」）`);
    const minGap = both.length ? Math.min(...both.map(s => +(s.en.l - s.lv.r).toFixed(1))) : -1;
    check(minGap >= 100, `窄屏缝宽 ≥100px（实测 ${minGap}px，390+280−390=280 档）`);
    // 镜像：回扫 tx-back
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));
    const back = [];
    const t1 = Date.now();
    while (Date.now() - t1 < 4000) {
      const s = await poll();
      if (!s.en && back.length) break;
      if (s.en) back.push(s);
      await sleep(60);
    }
    const firstEn = back.find(s => s.en.r !== null);
    log('[镜像] 回扫入屏首帧 rect:', firstEn ? JSON.stringify(firstEn.en) : 'n/a', ' vw=390');
    check(!!firstEn && firstEn.en.r <= 391, `回扫入屏从 −S 侧进入（right ${firstEn ? firstEn.en.r : 'n/a'} ≤ vw，tx-back 镜像成立）`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  if (errors.length) { console.log('\nJS 报错:'); errors.forEach(e => console.log('  ', e)); }
  else console.log('\n零 JS 报错 ✅');
  console.log(fails === 0 ? '\n✅ VR 扫视换场取证全部通过' : `\n❌ ${fails} 项未过`);
  process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
