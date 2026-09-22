// 取证探针：窄屏 3D 工具收纳（🧰 浮标 + 玻璃面板）
// 判据：①面板默认收起不挡桌面 ②FAB 在屏内可点 ③点开=wrap 全量展示（无横滚、全部在屏内且命中）
//       ④点面板外收起 ⑤armed 确认期间面板不收 ⑥回结算屏 FAB/面板隐藏 ⑦宽屏 ≥768 无 FAB、工具行常驻
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8873;
const URL = `http://127.0.0.1:${PORT}/index.html?game=tod`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${ok ? '' : '  ↳ ' + detail}`); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
await new Promise(res => server.listen(PORT, res));
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function joinLocal(ctx, n) {
  const pages = [];
  for (let i = 0; i < n; i++) {
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror:', e.message));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    await p.click('details.adv summary');
    await p.check('#chk-local');
    await p.fill('#input-name', '玩家' + (i + 1));
    if (pages.length) await p.fill('#input-room', pages[0].room);
    await p.locator('.avatar-option:visible').first().click();
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    p.room = pages.length ? pages[0].room : (await p.textContent('#share-room')).trim();
    pages.push(p);
  }
  await pages.forEach(p => p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }));
  await pages[0].click('#btn-start');
  await pages[0].waitForSelector('#screen-game.active', { timeout: 20000 });
  await sleep(3300);
  return pages;
}

// ── A) 窄屏 390×844 三人本地局 ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const [A] = await joinLocal(ctx, 3);
  const is3d = await A.evaluate(() => document.body.classList.contains('three3d'));
  check('A: three3d 生效', is3d, String(is3d));

  const closed = await A.evaluate(() => {
    const p = document.getElementById('game-tools');
    const f = document.getElementById('tools-fab');
    const rp = p.getBoundingClientRect(), rf = f.getBoundingClientRect();
    return { panelShown: getComputedStyle(p).display !== 'none', panelW: rp.width,
      fab: { disp: getComputedStyle(f).display, x: rf.x, y: rf.y, r: rf.right, b: rf.bottom, w: rf.width },
      iw: innerWidth, ih: innerHeight };
  });
  check('A: 进桌默认收起（面板 display none）', !closed.panelShown && closed.panelW === 0, JSON.stringify(closed));
  check('A: FAB 显示且在右下角屏内', closed.fab.disp === 'flex' && closed.fab.w > 0 && closed.fab.r <= closed.iw + 1 && closed.fab.b <= closed.ih + 1, JSON.stringify(closed.fab));
  await A.screenshot({ path: `${SHOTS}/toolsfab-390-closed.png` });

  await A.evaluate(() => document.getElementById('tools-fab').click());
  await sleep(260);
  const open = await A.evaluate(() => {
    const p = document.getElementById('game-tools');
    const btns = [...p.querySelectorAll('.btn-secondary')].map(b => {
      const r = b.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1));
      return { t: b.textContent.slice(0, 6), b: Math.round(r.bottom), r: Math.round(r.right), hit: !!h && (h === b || b.contains(h)) };
    });
    const rp = p.getBoundingClientRect();
    return { shown: getComputedStyle(p).display !== 'none', rowScrollable: p.scrollWidth > p.clientWidth + 2, panel: { x: Math.round(rp.x), r: Math.round(rp.right), b: Math.round(rp.bottom), h: Math.round(rp.height) }, btns, iw: innerWidth, ih: innerHeight };
  });
  check('A: 点开面板显示', open.shown, JSON.stringify({ shown: open.shown }));
  check('A: 面板无横滚（wrap 全量展示）', !open.rowScrollable, `scrollW>clientW: ${open.rowScrollable}`);
  check('A: 全部按钮在屏内且可点', open.btns.length >= 7 && open.btns.every(b => b.b <= open.ih + 1) && open.btns.every(b => b.hit), JSON.stringify(open.btns.filter(b => !b.hit || b.b > open.ih)));
  check('A: 面板不越出右缘', open.panel.r <= open.iw + 1, JSON.stringify(open.panel));
  await A.screenshot({ path: `${SHOTS}/toolsfab-390-open.png` });

  // 点面板外收起（真实点击靶永远是元素：派发到 body，别派发到 document——nodeType 9 会被守卫忽略）
  await A.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 60, clientY: 300 })));
  await sleep(260);
  const reclosed = await A.evaluate(() => {
    const p = document.getElementById('game-tools');
    const f = document.getElementById('tools-fab');
    return { panel: getComputedStyle(p).display, fab: getComputedStyle(f).display, expanded: f.getAttribute('aria-expanded') };
  });
  check('A: 点面板外收起（FAB 保留）', reclosed.panel === 'none' && reclosed.fab === 'flex' && reclosed.expanded === 'false', JSON.stringify(reclosed));

  // host「随机点名」经面板触发：面板自动收起
  await A.evaluate(() => document.getElementById('tools-fab').click());
  await sleep(220);
  const pickVisible = await A.evaluate(() => { const b = document.getElementById('btn-pick-next'); const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  check('A: 面板内 host 按钮（随机点名）有可见盒', pickVisible, String(pickVisible));
  await A.evaluate(() => document.getElementById('btn-pick-next').click());
  await sleep(400);
  const afterPick = await A.evaluate(() => getComputedStyle(document.getElementById('game-tools')).display);
  check('A: 随机点名后面板自动收起', afterPick === 'none', afterPick);

  // armed 两连点确认期间面板保持打开
  await A.evaluate(() => document.getElementById('tools-fab').click());
  await sleep(220);
  await A.evaluate(() => document.getElementById('btn-finish-game').click());
  await A.waitForFunction(() => document.getElementById('btn-finish-game').dataset.armed === '1', null, { timeout: 5000 });
  const stillOpen = await A.evaluate(() => getComputedStyle(document.getElementById('game-tools')).display);
  check('A: armed 确认期间面板保持打开', stillOpen === 'flex', stillOpen);
  await A.evaluate(() => document.getElementById('btn-finish-game').click());
  await A.waitForSelector('#screen-result.active', { timeout: 10000 });
  const fabGone = await A.evaluate(() => { const f = document.getElementById('tools-fab'); const p = document.getElementById('game-tools'); return { fab: getComputedStyle(f).display, panel: getComputedStyle(p).display }; });
  check('A: 回结算屏 FAB/面板都隐藏', fabGone.fab === 'none' && fabGone.panel === 'none', JSON.stringify(fabGone));
  await ctx.close();
}

// ── B) 宽屏 900×900：无 FAB，工具行常驻 ──
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const [B] = await joinLocal(ctx, 3);
  const wide = await B.evaluate(() => {
    const p = document.getElementById('game-tools');
    const f = document.getElementById('tools-fab');
    const btns = [...p.querySelectorAll('.btn-secondary')].map(b => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: b.textContent.slice(0, 4), hit: !!h && (h === b || b.contains(h)) }; });
    return { panelShown: getComputedStyle(p).display !== 'none', fab: getComputedStyle(f).display, btns };
  });
  check('B: 宽屏无 FAB（display none）', wide.fab === 'none', wide.fab);
  check('B: 宽屏工具行常驻且全部可点', wide.panelShown && wide.btns.length >= 7 && wide.btns.every(b => b.hit), JSON.stringify(wide.btns.filter(b => !b.hit)));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n===== tools-fab probe: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERR', e); process.exit(1); });
