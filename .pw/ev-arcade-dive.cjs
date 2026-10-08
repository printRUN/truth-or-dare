// ev-arcade-dive.cjs —— 点卡起飞一镜 + warp 票 + bfcache + REDUCED/TURBO 退路（feat/3d-all-one-take W1，2026-10-02）
// 覆盖（brief-3d-all 评审吸收 #20）：
//   ① 点卡后 #arcade-wipe 盖屏（pointer-events:auto 拦输入）且 200ms 窗口内未导航；盖满后到达 tod.html
//   ② warp 票点卡时写入（g/tod）且 tod 侧读后即删
//   ③ warp-in 挂 .loader-stage 且 .loader-card 翻牌动画未被打断（评审 #6 红线：严禁碰 loader-card）
//   ④ bfcache：goBack 返回 index 后 wipe 不在文档（评审 #2）
//   ⑤ 404 服务器分支：bombcat fail → wipe 状态文字出现 → 0.3s 撤回（节点出文档）+ toast「筹备中」（probe-arcade ⑨ 同语义）
//   ⑥ REDUCED：wipe 120ms 淡入保持遮盖直至跳转；tod 侧 warp-in 不挂
//   ⑦ TURBO（html.turbo 探针档）：直跳零延迟，wipe 从未出现
// 用法: node ev-arcade-dive.cjs <标签>
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const TAG = process.argv[2] || 'run';
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8981;            // 正常服务（勿与其他探针共用）
const PORT_404 = 8982;        // bombcat.html 恒 404 的同构服务（⑤ 专用）

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
function mkServer(port, bombcatGone) {
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (bombcatGone && f.replace(/\\/g, '/').endsWith('/bombcat.html')) { res.writeHead(404); return res.end('no'); }
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    } else { res.writeHead(404); res.end('no'); }
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra !== undefined ? ' | ' + extra : ''}`);
  cond ? pass++ : fail++;
}

(async () => {
  const server = mkServer(PORT, false), server404 = mkServer(PORT_404, true);
  await new Promise(r => server.listen(PORT, r));
  await new Promise(r => server404.listen(PORT_404, r));
  const browser = await chromium.launch();

  // ── ①②③④ 正常档一条链：点卡 dive → wipe 盖满 → tod（warp-in）→ goBack（wipe 撤干净）──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1600);   // Cam.init 900ms 落位
    // bfcache 取证钩子：restore 时 pageshow persisted 会写进快照里的这个位
    await p.evaluate(() => { window.__psPersisted = null; window.addEventListener('pageshow', e => { window.__psPersisted = !!e.persisted; }); });

    const t0 = Date.now();
    await p.click('#card-tod');
    // 立即采样：wipe 在文档 + 盖屏态 + pointer-events:auto 拦输入（命中测试打在卡心=wipe 圆心）
    const s1 = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      if (!w) return { none: true };
      const card = document.getElementById('card-tod');
      const r = card.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      let ticket = null;
      try { ticket = JSON.parse(localStorage.getItem('tod:warp') || 'null'); } catch (e) {}
      return {
        none: false, display: getComputedStyle(w).display, pe: getComputedStyle(w).pointerEvents,
        intercept: !!hit && w.contains(hit), ticketG: ticket && ticket.g,
        url: location.pathname, statusHidden: w.querySelector('.wipe-status').hidden,
      };
    }).catch(e => ({ evalErr: String(e).slice(0, 80) }));
    ok('① 点卡后 wipe 层在文档且盖屏（display:block）', !s1.none && !s1.evalErr && s1.display === 'block', JSON.stringify(s1));
    ok('① wipe pointer-events:auto 拦输入（卡心命中测试落 wipe 内）', s1.intercept === true, `pe=${s1.pe}`);
    ok('② warp 票点卡时写入（g=tod）', s1.ticketG === 'tod', JSON.stringify(s1.ticketG));
    ok('① wipe 不内嵌状态文字（普通卡探测文案仅 bombcat 用）', s1.statusHidden === true, `statusHidden=${s1.statusHidden}`);
    await p.waitForTimeout(120);
    const urlMid = await p.evaluate(() => location.pathname.split('/').pop()).catch(() => '(已导航)');
    ok('① 200ms 盖满窗内未导航（仍在 index）', urlMid === 'index.html' || urlMid === '', urlMid);
    await p.waitForURL('**/tod.html', { timeout: 6000 });
    const navMs = Date.now() - t0;
    ok('① 盖满后才导航（nav ≥ 盖满 220ms）', navMs >= 200, `${navMs}ms`);

    // ②③ tod 侧：票读后即删 + warp-in 挂 stage 且 loader-card 翻牌未被打断
    let tod = null;
    for (let i = 0; i < 12 && !(tod && tod.found); i++) {   // loader 在揭幕（1200ms+300ms）后整个移除：只认有效样本
      tod = await p.evaluate(() => {
        const stage = document.querySelector('.loader-stage');
        const card = document.querySelector('.loader-card');
        if (!stage || !card) return { found: false };
        const anims = card.getAnimations ? card.getAnimations() : [];
        return {
          found: true,
          gone: localStorage.getItem('tod:warp') !== null ? 'leftover' : 'deleted',
          warpInOnStage: stage.classList.contains('warp-in'),
          warpInOnCard: card.classList.contains('warp-in'),
          flipAnims: anims.length,
          flipState: anims.length ? anims[0].playState : 'none',
          flipT1: anims.length ? Number(anims[0].currentTime) : null,
        };
      }).catch(() => ({ found: false, err: true }));
      if (tod && tod.found) break;
      await sleep(60);
    }
    const t2 = tod.found && tod.flipT1 != null ? await sleep(220).then(() => p.evaluate(() => {
      const c = document.querySelector('.loader-card');
      const a = c.getAnimations ? c.getAnimations() : [];
      return a.length ? Number(a[0].currentTime) : null;
    }).catch(() => null)) : null;
    const dT = t2 != null && tod.flipT1 != null ? t2 - tod.flipT1 : null;
    ok('② tod 侧读票后即删（无残留）', tod.found && tod.gone === 'deleted', JSON.stringify(tod.gone));
    ok('③ warp-in 挂 .loader-stage', tod.found && tod.warpInOnStage === true, JSON.stringify({ wi: tod.warpInOnStage }));
    ok('③ .loader-card 未被碰（无 warp-in 类，probe-loader-gate 红线）', tod.found && tod.warpInOnCard === false, `cardWarpIn=${tod.warpInOnCard}`);
    ok('③ .loader-card 翻牌动画在跑且推进（未被打断）', tod.found && tod.flipAnims >= 1 && tod.flipState === 'running' && dT != null && dT > 120 && dT < 700,
      `anims=${tod.flipAnims} state=${tod.flipState} t1=${tod.flipT1 == null ? '-' : Math.round(tod.flipT1)} t2=${t2 == null ? '-' : Math.round(t2)} dT=${dT == null ? '-' : Math.round(dT)}ms/220ms`);

    // ④ bfcache：goBack 返回 index 后 wipe 不在文档
    await p.goBack();
    await p.waitForFunction(() => document.querySelector('.screen.active')?.id === 'screen-arcade', null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(400);
    const back = await p.evaluate(() => ({
      wipe: !!document.getElementById('arcade-wipe'),
      ps: window.__psPersisted,
      arcade: document.querySelector('.screen.active')?.id,
    })).catch(e => ({ evalErr: String(e).slice(0, 80) }));
    ok('④ goBack 返回 index 后 wipe 不在文档', back.wipe === false, `persisted=${back.ps} screen=${back.arcade} ${back.evalErr || ''}`);
    ok('④ 零 pageerror（①-④ 链）', errs.length === 0, errs.join(';').slice(0, 160));
    await ctx.close();
  }

  // ── ⑤ 404 服务器：bombcat fail → wipe 撤回 + toast「筹备中」──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT_404}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);   // 等预探测（404→desat）落地
    await p.click('#card-bombcat');
    const s5 = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      return { wipe: !!w, status: w && !w.querySelector('.wipe-status').hidden ? w.querySelector('.wipe-status').textContent : null, url: location.pathname.split('/').pop() };
    }).catch(() => ({ wipe: false }));
    ok('⑤ fail 路径 wipe 盖屏 + 内嵌「正在确认能否开门…」', s5.wipe && !!s5.status && s5.status.includes('正在确认能否开门'), JSON.stringify(s5));
    await p.waitForFunction(() => document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent.includes('筹备中'), { timeout: 8000 });
    const urlSame = !p.url().includes('bombcat');
    ok('⑤ bombcat 不可用 → toast「筹备中」拦截不跳转', urlSame, p.url().split('/').pop());
    await p.waitForTimeout(600);   // 撤回动画 0.3s + 340ms 移除定时器
    const gone = await p.evaluate(() => ({ wipe: !!document.getElementById('arcade-wipe'), toast: document.getElementById('toast').classList.contains('show') }));
    ok('⑤ wipe 0.3s 撤回（节点出文档）且 toast 仍可读', gone.wipe === false && gone.toast === true, JSON.stringify(gone));
    await ctx.close();
  }

  // ── ⑥ REDUCED：wipe 120ms 淡入保持遮盖直至跳转；tod 侧 warp-in 不挂 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
    await p.click('#card-tod');
    const s6 = await p.evaluate(() => {
      const w = document.getElementById('arcade-wipe');
      if (!w) return { none: true };
      return { none: false, reduced: w.classList.contains('reduced'), display: getComputedStyle(w).display, url: location.pathname.split('/').pop() };
    }).catch(() => ({ none: true }));
    ok('⑥ REDUCED wipe 挂 reduced 档（淡入后保持遮盖）', !s6.none && s6.reduced === true && s6.display === 'block', JSON.stringify(s6));
    await p.waitForURL('**/tod.html', { timeout: 6000 });
    let wi6 = null;
    for (let i = 0; i < 10 && wi6 === null; i++) {
      wi6 = await p.evaluate(() => {
        const stage = document.querySelector('.loader-stage');
        if (!stage) return null;
        return stage.classList.contains('warp-in');
      }).catch(() => null);
      if (wi6 !== null) break;
      await sleep(60);
    }
    ok('⑥ REDUCED tod 侧 warp-in 不挂', wi6 === false, `warpIn=${wi6}`);
    await ctx.close();
  }

  // ── ⑦ TURBO（html.turbo 探针档）：直跳零延迟，wipe 从未出现 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript(() => {   // ⚠ 注入时刻 documentElement 可能还是 null（实测 TypeError）：等文档就绪再挂类
      const arm = () => { if (document.documentElement) document.documentElement.classList.add('turbo'); };
      if (document.documentElement) arm();
      else {
        document.addEventListener('readystatechange', () => { if (document.readyState !== 'loading') arm(); });
        new MutationObserver((m, mo) => { if (document.documentElement) { arm(); mo.disconnect(); } }).observe(document, { childList: true });
      }
    });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    const t0 = Date.now();
    await p.click('#card-tod');
    const s7 = await p.evaluate(() => ({ wipe: !!document.getElementById('arcade-wipe'), url: location.pathname.split('/').pop() }))
      .catch(() => ({ wipe: false, nav: true }));   // 上下文已销毁=已导航（直跳够快）
    ok('⑦ TURBO wipe 从未出现', s7.wipe === false, JSON.stringify(s7));
    await p.waitForURL('**/tod.html', { timeout: 3000 });
    const navMs = Date.now() - t0;
    ok('⑦ TURBO 直跳零延迟（nav < 800ms）', navMs < 800, `${navMs}ms`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  server404.close();
  console.log(`\n══ ev-arcade-dive [${TAG}] 结果 ══\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
