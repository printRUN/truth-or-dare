// 探针：游戏中心（arcade）落地屏 —— feat/arcade-monopoly
// 覆盖：默认落地 / 深链 ?game=tod / 邀请 ?room= / 回房票（新鲜+过期）/ 卡片导航 / 相机落位 / 标题联动
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8905;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});
const results = [];
const ok = (name, cond, extra) => { results.push([cond ? 'PASS' : 'FAIL', name + (extra ? ` | ${extra}` : '')]); if (!cond) process.exitCode = 1; };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ── ① 默认落地：游戏中心 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1600);   // Cam.init 900ms 落位
    const st = await p.evaluate(() => ({
      active: document.querySelector('.screen.active')?.id,
      arcade: window.__ARCADE__,
      title: document.getElementById('app-title').textContent,
      docTitle: document.title,
      netChip: getComputedStyle(document.querySelector('.net-chip')).display,
      cards: document.querySelectorAll('.arcade-card').length,
      onArcade: document.body.classList.contains('on-arcade'),
      nav: document.body.classList.contains('arcade-nav'),
      world: document.getElementById('world3d').style.transform,
    }));
    ok('① 默认落地 screen-arcade.active', st.active === 'screen-arcade', st.active);
    ok('① __ARCADE__=true', st.arcade === true);
    ok('① h1=游戏中心', st.title === '🎮 游戏中心', st.title);
    ok('① document.title 联动', st.docTitle === '游戏中心 · 真心话大冒险', st.docTitle);
    ok('① net-chip 隐藏（不挂红点）', st.netChip === 'none');
    ok('① 四张游戏卡', st.cards === 4, st.cards);
    ok('① UNO 卡已转正（无 locked/aria-disabled、有箭头）', await p.evaluate(() => { const c = document.getElementById('card-uno'); return !!c && !c.classList.contains('locked') && !c.hasAttribute('aria-disabled') && !!c.querySelector('.arc-arrow'); }));
    ok('① 炸弹猫卡存在（角标状态与可用性一致）', await p.evaluate(async () => { const c = document.getElementById('card-bombcat'); if (!c || c.dataset.href !== 'bombcat.html') return false; const avail = await fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => fetch('bombcat.html', { method: 'GET', cache: 'no-store' }).then(r2 => r2.ok).catch(() => false)); const soon = c.querySelector('.arc-badge-soon'); return avail ? soon.hidden : !soon.hidden; }));
    ok('① body.on-arcade + arcade-nav', st.onArcade && st.nav);
    ok('① 相机落位 arcade（z-52/rx5）', st.world.includes('-52px') && st.world.includes('rotateX(5deg)'), st.world.slice(0, 80));
    ok('① 零 pageerror', errs.length === 0, errs.join(';'));

    // ── ② 点「真心话大冒险」卡 → join 屏 ──
    await p.click('#card-tod');
    await p.waitForTimeout(150);
    const st2 = await p.evaluate(() => ({
      active: document.querySelector('.screen.active')?.id,
      arcade: window.__ARCADE__,
      title: document.getElementById('app-title').textContent,
      back: getComputedStyle(document.querySelector('.arcade-back')).display,
      picked: sessionStorage.getItem('tod:picked'),
    }));
    ok('② 点卡进 join 屏', st2.active === 'screen-join', st2.active);
    ok('② __ARCADE__ 翻假', st2.arcade === false);
    ok('② h1 回 tod', st2.title === '🎭 真心话大冒险', st2.title);
    ok('② 「← 游戏中心」可见（arcade-nav 常驻）', st2.back !== 'none', st2.back);
    ok('② tod:picked 落 sessionStorage', st2.picked === '1');
    const netChip2 = await p.evaluate(() => getComputedStyle(document.querySelector('.net-chip')).display);
    ok('② 进 join 后 net-chip 恢复（on-arcade 已摘）', netChip2 !== 'none', netChip2);

    // ── ③ 返回游戏中心 ──
    await p.click('#btn-arcade-back');
    await p.waitForTimeout(150);
    const st3 = await p.evaluate(() => ({
      active: document.querySelector('.screen.active')?.id,
      arcade: window.__ARCADE__,
      picked: sessionStorage.getItem('tod:picked'),
    }));
    ok('③ 返回 arcade 屏', st3.active === 'screen-arcade', st3.active);
    ok('③ __ARCADE__ 翻真', st3.arcade === true);
    ok('③ tod:picked 已清', st3.picked === null);
    await ctx.close();
  }

  // ── ④ 深链 ?game=tod 直落 join（E2E 入口契约） ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1600);
    const st = await p.evaluate(() => ({
      active: document.querySelector('.screen.active')?.id,
      arcade: window.__ARCADE__,
      nav: document.body.classList.contains('arcade-nav'),
      world: document.getElementById('world3d').style.transform,
    }));
    ok('④ ?game=tod 直落 join', st.active === 'screen-join', st.active);
    ok('④ __ARCADE__=false', st.arcade === false);
    ok('④ 无 arcade-nav（返回链接不显）', st.nav === false);
    ok('④ 相机落位 join（z-40/rx2.2 不回归）', st.world.includes('-40px') && st.world.includes('rotateX(2.2deg)'), st.world.slice(0, 80));
    await ctx.close();
  }

  // ── ⑤ 邀请链接 ?room= 直落 join 并回填 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/index.html?room=ZZ99`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    const st = await p.evaluate(() => ({
      active: document.querySelector('.screen.active')?.id,
      room: document.getElementById('input-room').value,
      arcade: window.__ARCADE__,
    }));
    ok('⑤ ?room= 直落 join', st.active === 'screen-join', st.active);
    ok('⑤ 房间号回填', st.room === 'ZZ99', st.room);
    ok('⑤ __ARCADE__=false', st.arcade === false);
    await ctx.close();
  }

  // ── ⑥ 回房票：新鲜票直落 join / 过期票落游戏中心 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => sessionStorage.setItem('tod:tab', JSON.stringify({ id: 't1', room: 'RR01', name: '小明', ts: Date.now() })));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    ok('⑥ 新鲜回房票直落 join', await p.evaluate(() => document.querySelector('.screen.active')?.id) === 'screen-join');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => sessionStorage.setItem('tod:tab', JSON.stringify({ id: 't1', room: 'RR01', name: '小明', ts: Date.now() - 31 * 60 * 1000 })));
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    const a = await p.evaluate(() => ({ active: document.querySelector('.screen.active')?.id, arcade: window.__ARCADE__ }));
    ok('⑥ 过期票落游戏中心（谓词=主脚本 30min 窗）', a.active === 'screen-arcade' && a.arcade === true, JSON.stringify(a));
    await ctx.close();
  }

  // ── ⑦ 点「大富翁」卡 → monopoly.html ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.click('#card-monopoly');
    await p.waitForURL('**/monopoly.html', { timeout: 10000 });
    ok('⑦ 跳转 monopoly.html', p.url().includes('monopoly.html'), p.url());
    await p.waitForSelector('#setup:not([hidden])', { timeout: 25000 });
    ok('⑦ 大富翁 setup 屏出现', true);
    await ctx.close();
  }

  // ── ⑧ UNO 跳转 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.click('#card-uno');
    await p.waitForURL('**/uno.html', { timeout: 10000 });
    ok('⑧ 跳转 uno.html', p.url().includes('uno.html'), p.url());
    await p.waitForSelector('#setup:not([hidden])', { timeout: 25000 });
    ok('⑧ UNO setup 屏出现', true);
    await ctx.close();
  }

  // ── ⑨ 炸弹猫探测跳转（与运行时共用 HEAD 谓词，合入后自动转绿）──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    const avail = await p.evaluate(() => fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => fetch('bombcat.html', { method: 'GET', cache: 'no-store' }).then(r2 => r2.ok).catch(() => false)));   // 与运行时 probeExternal 同谓词（含 GET 兜底）
    await p.click('#card-bombcat');
    if (avail) {
      await p.waitForURL('**/bombcat.html', { timeout: 10000 });
      ok('⑨ 炸弹猫已合入 → 直连跳转', p.url().includes('bombcat.html'), p.url());
    } else {
      await p.waitForFunction(() => document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent.includes('筹备中'), { timeout: 8000 });
      const urlSame = !p.url().includes('bombcat');
      ok('⑨ 炸弹猫未合入 → toast 拦截不跳转', urlSame, p.url());
    }
    await ctx.close();
  }

  // ── ⑩ 矮屏欠账（历史 ⑧）：667×375 + landui → 4 卡全部 ≤ 视口高且横排可滚 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 667, height: 375 } });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await p.evaluate(() => document.body.classList.add('landui'));
    await p.waitForTimeout(300);
    const geo = await p.evaluate(() => {
      const vh = innerHeight;
      const cards = [...document.querySelectorAll('.arcade-card')].map(c => { const r = c.getBoundingClientRect(); return { b: r.bottom, t: r.top }; });
      const grid = document.querySelector('.arcade-grid');
      return { vh, maxBottom: Math.max(...cards.map(c => c.b)), n: cards.length, scrollable: grid.scrollWidth >= grid.clientWidth - 2, cols: getComputedStyle(grid).display };
    });
    ok('⑩ landui 矮屏：4 卡横排且不越出视口高', geo.n === 4 && geo.maxBottom <= geo.vh && geo.cols === 'flex' && geo.scrollable, geo);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('\n══ probe-arcade 结果 ══');
  results.forEach(([s, n]) => console.log(`${s === 'PASS' ? '✅' : '❌'} ${n}`));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? `\n${fails} FAILED / ${results.length}` : `\nALL ${results.length} PASS ✅`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
