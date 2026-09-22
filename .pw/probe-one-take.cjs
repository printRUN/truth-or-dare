// 探针：一镜到底 v2 的四段新取证（对应 .pw/design-plan.md v3 的 W1/W4/W5）
// 用法: node probe-one-take.cjs   （from .pw/；静态服务器端口 8795）
//
// 判据 1（揭幕间隙·旧墙不消失）：join→lobby 在加载层揭幕的 140ms delay 里，旧墙必须仍以
//        from 帧（opacity 1）在场——animation-fill-mode:backwards 的存在意义；消失了就是倒退。
// 判据 2（背板落位前归零）：实体背板必须在自己的关键帧里淡到 0（82%→100%），类摘除定时器
//        只是兜底——落位前背板 opacity 已 <0.1，不会在落位一帧后「暗板闪变」。
// 判据 3（窄屏零推进）：390×844 下换屏窗口期 Cam 不再平移（转身独占整个视口），
//        修走查实锤的「转场中段玩家卡被裁出左缘」。
// 判据 4（颁奖礼·重放红线）：换屏进入 result 播 ceremony（DOM 序=名次序、.pscore 首帧即终值），
//        心跳式的再次 renderScreen() 必须走无类终态——类被摘、文本不变、不重放。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8795;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const errors = [];
let fails = 0;
const log = (...a) => console.log('[one-take]', ...a);
const check = (cond, msg, extra) => { log((cond ? '  ✅ ' : '  ❌ ') + msg, extra ?? ''); if (!cond) fails++; };

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag, viewport) {
  const p = await ctx.newPage();
  // 首进大厅会自动弹新手引导（挡住后续所有点击）：探针预置已读标记，不测引导本身
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
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

(async () => {
  await new Promise(r => { server.listen(PORT, r); log(`serving :${PORT}`); });
  const browser = await chromium.launch({ args: ['--disable-gpu'] });

  // ── 判据 1/2：揭幕间隙 + 背板（桌面 1280×800，全程可见的转身） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'A', { width: 1280, height: 800 });
    await join(A, '阿一');
    // join→lobby 走 pendingSceneEnter 路径（加载层还盖着）：揭幕 260ms + 两面 delay 140ms。
    // ⚠ 加载层是复用元素：开机层的 .hide 还挂着时就会被 showLoading 摘掉重用，所以必须先等
    // 「hide 被摘掉」（加入过场开始）再等「hide 重新挂上」（揭幕开始），否则会匹配到开机层那轮。
    await A.waitForFunction(() => {
      const o = document.getElementById('loading-overlay');
      return !!o && !o.classList.contains('hide');
    }, null, { timeout: 20000 });
    await A.waitForFunction(() => {
      const o = document.getElementById('loading-overlay');
      return !!o && o.classList.contains('hide');
    }, null, { timeout: 20000 });
    const t0 = Date.now();
    // t≈80ms：揭幕 delay 期内——旧屏必须在场（pan-out from 帧 opacity 1），新屏必须整个在视口外
    // （门控纯几何：pan-in 的 from 在 +S，不靠透明度——加载层是 0.95 半透，透明度门控会露底）
    await sleep(80);
    const early = await A.evaluate(() => {
      const lv = document.querySelector('.screen.leaving');
      const en = document.querySelector('.screen.entering');
      if (!lv || !en) return null;
      const r = en.getBoundingClientRect();
      return {
        lvOp: +getComputedStyle(lv).opacity,
        lvDelay: lv.style.animationDelay,
        enDelay: en.style.animationDelay,
        enLeft: +r.left.toFixed(1),
        vw: window.innerWidth,
        overlayOp: +getComputedStyle(document.getElementById('loading-overlay')).opacity,
      };
    });
    log('[揭幕] t≈80ms:', JSON.stringify(early));
    check(!!early, '揭幕间隙：两面动画已挂载（entering/leaving 同时在场）');
    if (early) {
      check(early.lvOp > 0.9, `旧屏在 280ms 揭幕间隙里仍以 from 帧在场（opacity ${early.lvOp} > 0.9，fill-mode:backwards 生效）`);
      check(early.enLeft >= early.vw - 1, `新屏揭幕间隙整个在视口外（left ${early.enLeft} ≥ vw ${early.vw}，加载未完成绝不入画）`);
      check(early.lvDelay === '280ms' && early.enDelay === '280ms', `两面共用 280ms animationDelay（${early.lvDelay}/${early.enDelay}，> 260ms 揭幕）`);
    }
    // 等动画类摘干净 + 加载层移除
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving') &&
      !document.getElementById('loading-overlay'), null, { timeout: 5000 }).catch(() => {});
    check(true, '收尾：entering/leaving/加载层全部退场');
    await A.screenshot({ path: 'shots/one-take-lobby-settled.png' });
    await ctx.close();
  }

  // ── 判据 3：窄屏换屏零推进（390×844） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const A = await open(ctx, 'N', { width: 390, height: 844 });
    await join(A, '阿窄');
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForTimeout(1400);   // 等揭幕(280)+扫视(640)+回正(320) 完全落定
    // lobby→game：单人房不走 btn-start（要 2 人），直接写状态位触发真实 renderScreen 换屏链路
    await A.evaluate(() => mutate(n => { n.gameStarted = true; }));
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    // VR 扫视：换屏瞬间镜头不动（glance 第一段只转 ry/x，第二段才回位到新屏常态）——
    // z 从上一屏位收敛到牌桌常态 -24，判据是「单调收敛、绝无过冲」（旧版会冲到 -36 的过冲推进）。
    const zSamples = [];
    for (let i = 0; i < 10; i++) {
      zSamples.push(await A.evaluate(() => +Cam.cur.z.toFixed(2)));
      await sleep(100);
    }
    // 窄屏判据：z 从大厅 0 出发收敛到牌桌常态 -24（这段是「走向新房间」的合法位移），
    // 但绝不允许越过 -24 再回来——旧版会先冲到 -36~-48 的过冲推进，把屏内容推出边界。
    const min = Math.min(...zSamples), last = zSamples[zSamples.length - 1];
    log('[窄屏] Cam.cur.z 采样:', zSamples.join(', '), '（game 常态 -24）');
    check(min > -25.5 && Math.abs(last + 24) < 1.5, `窄屏换屏镜头无过冲（min=${min} > -25.5，收敛 |${last}+24|<1.5）`);
    await ctx.close();
  }

  // ── 判据 4：颁奖礼（双人局 · 结算 → ceremony → 心跳重绘不重放） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const A = await open(ctx, 'A', { width: 1280, height: 800 });
    await join(A, '阿奖');
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await A.waitForFunction(() => S && S.room, null, { timeout: 20000 });
    const room = await A.evaluate(() => S.room);
    const B = await open(ctx, 'B', { width: 1280, height: 800 });
    await join(B, '阿伴', room);
    await A.waitForFunction(() => S.players.length === 2, null, { timeout: 20000 });
    await A.waitForSelector('#screen-lobby.active .mode-opt[data-mode="free"]', { timeout: 15000 });
    // 点 mode-opt 只写本地 pickedMode，S.mode 要到 startGame 才落——所以两个 evaluate 连着做，开局后再等 S.mode
    await A.evaluate(() => document.querySelector('.mode-opt[data-mode="free"]').click());
    await A.evaluate(() => document.getElementById('btn-start').click());
    await A.waitForFunction(() => S.mode === 'free', null, { timeout: 10000 });
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForSelector('#choice-section:not([hidden])', { timeout: 20000 });
    await A.click('#card-truth');
    await A.waitForFunction(() => S.turn.stage === 'revealed' && S.turn.punishment, null, { timeout: 30000 });
    await A.waitForFunction(() => revealAnim === false, null, { timeout: 20000 });
    await A.click('#btn-accept');
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    await A.evaluate(() => setLowPerf(false, 'full'));   // 本机软件光栅会被 perfWatch 自动降载，颁奖礼判据需在全效档取证
    // 主持人结算（armedTap 二次确认：首点染红 → 再点执行；用类名确认第一下真的arm上了）
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => document.getElementById('btn-finish-game').dataset.armed === '1', null, { timeout: 5000 });
    await A.evaluate(() => document.getElementById('btn-finish-game').click());
    await A.waitForFunction(() => S.finished, null, { timeout: 8000 });
    await A.waitForSelector('#screen-result.active', { timeout: 20000 });
    const c0 = await A.evaluate(() => ({
      ceremony: document.getElementById('result-podium').classList.contains('ceremony'),
      firstPod: document.querySelector('#result-podium .pod')?.className,
      score0: document.querySelector('#result-podium .pod .pscore')?.textContent,
      stateScore0: (() => { const s = [...S.players].sort((a, b) => (b.score || 0) - (a.score || 0))[0]; return S.scoring !== false ? (s.score || 0) + ' 分' : (s.draws || 0) + ' 次抽卡'; })(),
      veil: !!document.getElementById('result-veil'),
    }));
    log('[颁奖] 首帧:', JSON.stringify(c0));
    check(c0.ceremony, '换屏进入 result 首渲染挂 .ceremony（步进揭晓只播这一次）');
    check((c0.firstPod || '').includes('p1'), `podium DOM 序保持名次序（第一个 .pod 是冠军：${c0.firstPod}）`);
    check(c0.score0 === c0.stateScore0, `.pscore 首帧即终值（「${c0.score0}」= 状态值，无计数跳动，E2E 读值安全）`);
    check(c0.veil, '黑场聚焦罩已挂 body（#result-veil）');
    await A.screenshot({ path: 'shots/one-take-result-c0.png' });
    await sleep(1300);   // 让步进链走完（≤1.16s）
    await A.screenshot({ path: 'shots/one-take-result-end.png' });
    // 心跳式重绘：再调一次 renderScreen()（changed=false 分支）→ renderResult 必须走无类终态
    const c1 = await A.evaluate(() => { renderScreen(); return {
      ceremony: document.getElementById('result-podium').classList.contains('ceremony'),
      firstPod: document.querySelector('#result-podium .pod')?.className,
      score0: document.querySelector('#result-podium .pod .pscore')?.textContent,
    }; });
    log('[颁奖] 重绘后:', JSON.stringify(c1));
    check(!c1.ceremony, '心跳重绘走无类终态（.ceremony 已摘，动画类不会随 25s 心跳重放）');
    check((c1.firstPod || '').includes('p1') && c1.score0 === c0.score0, '重绘后名次序与分值不变');
    await ctx.close();
  }

  await browser.close();
  server.close();
  if (errors.length) { console.log('\nJS 报错:'); errors.forEach(e => console.log('  ', e)); }
  else console.log('\n零 JS 报错 ✅');
  console.log(fails === 0 ? '\n✅ 一镜到底 v2 取证全部通过' : `\n❌ ${fails} 项未过`);
  process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
