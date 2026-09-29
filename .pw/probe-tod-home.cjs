/* probe-tod-home.cjs —— tod.html 返回游戏中心三入口回归锁（2026-09-24）
   ① join 屏「← 游戏中心」药丸恒显且点击 → index.html 落 arcade 屏
   ② 大厅「🏠 游戏中心」可见且点击 → index.html 落 arcade 屏（真实加入房间后测）
   ③ 结算屏「🏠 游戏中心」存在、可见（showScreen 合成切屏）且点击 → index.html
   ④ 返回后从 arcade 点 tod 卡再回 tod.html：会话票不清 → 自动重join 回原房 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8941;   // 专用端口（勿与其他探针共用）

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail !== undefined ? ' | ' + detail : ''}`);
  cond ? pass++ : fail++;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  const BASE = `http://127.0.0.1:${PORT}`;

  // ── ① join 屏药丸 ──
  await p.goto(`${BASE}/tod.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const pill = await p.evaluate(() => {
    const el = document.getElementById('btn-arcade-back');
    const r = el?.getBoundingClientRect();
    return { vis: !!el && el.offsetParent !== null, w: r?.width, txt: el?.textContent.trim() };
  });
  ok('① join 屏「← 游戏中心」药丸恒显', pill.vis && pill.w > 30, JSON.stringify(pill));
  await p.screenshot({ path: `${ROOT}/.pw/shots/tod-home-join.png` });
  await p.click('#btn-arcade-back');
  await p.waitForURL('**/index.html', { timeout: 8000 });
  await p.waitForTimeout(900);
  ok('① 点击 → index.html 落 arcade 屏',
    await p.evaluate(() => document.querySelector('.screen.active')?.id) === 'screen-arcade', p.url());

  // ── ② 大厅按钮（真实加入房间）──
  await p.goto(`${BASE}/tod.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await p.fill('#input-name', '探针甲');
  await p.evaluate(() => { document.getElementById('chk-local').checked = true; });   // 自绘复选框视觉隐藏，直接置属性（doJoin 点击时读取）
  await p.click('#btn-join');   // 房号留空=本地建新房（retained 不存在，带房号反而会判「房间不存在」）
  await p.waitForFunction(() => document.querySelector('.screen.active')?.id === 'screen-lobby', null, { timeout: 20000 });
  const roomCode = await p.evaluate(() =>
    (document.getElementById('input-room')?.value || '').trim() ||
    (document.getElementById('share-room')?.textContent || '').trim());
  await p.waitForTimeout(1000);   // 首访 450ms 后自动弹玩法说明（localStorage tod:guide 门控），等它弹完再关
  await p.evaluate(() => closeGuide());
  await p.waitForFunction(() => document.getElementById('guide-mask').hidden === true, null, { timeout: 5000 });
  const lb = await p.evaluate(() => {
    const el = document.getElementById('btn-home-lobby');
    return { vis: !!el && el.offsetParent !== null, txt: el?.textContent.trim() };
  });
  ok('② 大厅「🏠 游戏中心」可见', lb.vis, JSON.stringify(lb));
  await p.screenshot({ path: `${ROOT}/.pw/shots/tod-home-lobby.png` });
  await p.click('#btn-home-lobby');
  await p.waitForURL('**/index.html', { timeout: 8000 });
  await p.waitForTimeout(900);
  ok('② 点击 → index.html 落 arcade 屏',
    await p.evaluate(() => document.querySelector('.screen.active')?.id) === 'screen-arcade', p.url());

  // ── ④ 会话票自动重join（ arcade → tod 卡）──
  await p.evaluate(() => document.getElementById('card-tod').click());   // index 开机 overlay 不代表导航不可用：DOM 触发与 probe-arcade ② 等价
  await p.waitForURL('**/tod.html', { timeout: 8000 });
  await p.waitForFunction(() => document.querySelector('.screen.active')?.id === 'screen-join', null, { timeout: 15000 });
  await p.waitForTimeout(1800);   // 回房票自动重join 有延迟
  const re = await p.evaluate(() => ({
    active: document.querySelector('.screen.active')?.id,
    room: document.getElementById('input-room')?.value || document.getElementById('share-room')?.textContent || '',
  }));
  ok('④ 返回后再进 tod：票自动重join 回原房', /lobby/.test(re.active) || (re.room && re.room.includes(roomCode)), JSON.stringify({ re, roomCode }));

  // ── ③ 结算屏按钮（合成切屏验证接线）──
  await p.evaluate(() => {   // showScreen 走既有函数，避免手掰 class 漏副作用
    const fn = window.showScreen || window.goto;
    if (typeof fn === 'function') fn('result');
    else document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')),
         document.getElementById('screen-result').classList.add('active');
  });
  await p.waitForTimeout(400);
  const rs = await p.evaluate(() => {
    const el = document.getElementById('btn-home-result');
    return { vis: !!el && el.offsetParent !== null, txt: el?.textContent.trim() };
  });
  ok('③ 结算屏「🏠 游戏中心」可见', rs.vis, JSON.stringify(rs));
  await p.screenshot({ path: `${ROOT}/.pw/shots/tod-home-result.png` });
  await p.evaluate(() => document.getElementById('btn-home-result').click());   // 状态回包可能切屏，绕开命中测试直击处理器
  await p.waitForURL('**/index.html', { timeout: 8000 });
  await p.waitForTimeout(900);
  ok('③ 点击 → index.html 落 arcade 屏',
    await p.evaluate(() => document.querySelector('.screen.active')?.id) === 'screen-arcade', p.url());

  ok('零 pageerror', errs.length === 0, errs.join('; ').slice(0, 200));

  await browser.close();
  server.close();
  console.log(`\n══ probe-tod-home 结果 ══\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(2); });
