// 防掉线双胞胎 + 刷新回房 · 边界探针（2026-09-23）
// 覆盖：刷新自动回房同座位（不产生第二个自己）/ uid 跨刷新稳定 / 开局中刷新回场 / 主动退出后不自动回房
// monopoly/uno/bombcat 走本地链路（?localnet=1 / chk-local）；tod 的刷新回房由 probe-persona-full 钉
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
let PORT = 8963;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + name + (extra !== undefined ? ` | ${JSON.stringify(extra).slice(0, 140)}` : '')); if (!cond) fails++; };

(async () => {
  await new Promise((resolve, reject) => {
    let tries = 0;
    server.on('error', err => { if (err.code === 'EADDRINUSE' && ++tries <= 5) { PORT += 1; server.listen(PORT, resolve); } else reject(err); });
    server.listen(PORT, resolve);
  });
  const browser = await chromium.launch();
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    return ctx;
  };
  const prows = p => p.evaluate(() => document.querySelectorAll('.pn-prow').length);

  /* ═══ 1. monopoly：大厅刷新 / 他人在线刷新 / 开局中刷新 / 主动退出 ══ */
  {
    const ctx = await mkCtx();
    const pa = await ctx.newPage();
    await pa.goto(`http://127.0.0.1:${PORT}/monopoly.html?localnet=1`, { waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-room', { timeout: 20000 });
    await pa.fill('.pn-name', '刷新侠');
    await pa.click('.pn-create');
    await pa.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    const code = (await pa.textContent('.pn-code-b')).trim();
    ok('monopoly 建房 1 人', (await prows(pa)) === 1);
    // 大厅刷新 → 自动回房，仍是 1 人（不产生第二个自己）
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-lobby:not([hidden])', { timeout: 25000 });
    ok('monopoly 大厅刷新自动回房', (await pa.textContent('.pn-code-b')).trim() === code);
    ok('monopoly 刷新后仍是 1 人（无双胞胎）', (await prows(pa)) === 1, await prows(pa));
    // B 经链接加入 → 房主再刷新 → 仍 2 人
    const pb = await ctx.newPage();
    await pb.goto(`http://127.0.0.1:${PORT}/monopoly.html?room=${code}&localnet=1`, { waitUntil: 'domcontentloaded' });
    await pb.waitForSelector('.pn-room', { timeout: 20000 });
    await pb.fill('.pn-name', '同座客');
    await pb.click('.pn-join');
    await pb.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    await pa.waitForFunction(() => document.querySelectorAll('.pn-prow').length >= 2, null, { timeout: 15000 }).catch(() => {});
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-lobby:not([hidden])', { timeout: 25000 });
    await pa.waitForFunction(() => document.querySelectorAll('.pn-prow').length >= 2, null, { timeout: 15000 }).catch(() => {});
    ok('monopoly 他人在线时刷新仍 2 人（无双胞胎）', (await prows(pa)) === 2, await prows(pa));
    // 开局 → 房主刷新 → 回到进行中的对局（不产生第三个座位）
    await pa.click('.pn-start');
    await pa.waitForFunction(() => window.__mono && __mono.state && __mono.state.phase !== 'SETUP', null, { timeout: 20000 }).catch(() => {});
    await pa.reload({ waitUntil: 'domcontentloaded' });
    // 开局中刷新：回房成功后 setup 覆盖层会被刻意隐藏（进入对局视图），大厅面板随之不可见——
    // 等复合条件「2 人 + 已进对局」，不能再等大厅可见
    await pa.waitForFunction(() => document.querySelectorAll('.pn-prow').length >= 2 && document.getElementById('setup').hidden === true, null, { timeout: 30000 }).catch(() => {});
    ok('monopoly 开局中刷新回到对局（仍 2 人）', (await prows(pa)) === 2, await prows(pa));
    ok('monopoly 开局中刷新不落回设置屏', await pa.evaluate(() => document.getElementById('setup').hidden === true));
    // 同名回收：新标签页用与房主相同的昵称加入 = 掉线重开的同一个人 → 座位过户，不产生第三个自己
    const pc = await ctx.newPage();
    await pc.goto(`http://127.0.0.1:${PORT}/monopoly.html?room=${code}&localnet=1`, { waitUntil: 'domcontentloaded' });
    await pc.waitForSelector('.pn-room', { timeout: 20000 });
    await pc.fill('.pn-name', '刷新侠');
    await pc.click('.pn-join');
    // 房间已开局：同名回收后 pc 直接进入对局视图（大厅随 setup 隐藏），等进局而非等大厅
    await pc.waitForFunction(() => document.getElementById('setup').hidden === true, null, { timeout: 25000 }).catch(() => {});
    await pa.waitForFunction(() => document.querySelectorAll('.pn-prow').length >= 2, null, { timeout: 15000 }).catch(() => {});
    ok('monopoly 同名加入回收座位（仍 2 人，无第三个自己）', (await prows(pa)) === 2, await prows(pa));
    ok('monopoly 回收后新页即本座位', (await pc.textContent('.pn-code-b')).trim() === code);
    await ctx.close();
  }

  /* ═══ 2. uno：建房 → 刷新 → 不双胞胎（抽测） ══ */
  {
    const ctx = await mkCtx();
    const pa = await ctx.newPage();
    await pa.goto(`http://127.0.0.1:${PORT}/uno.html?localnet=1`, { waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-room', { timeout: 20000 });
    await pa.fill('.pn-name', 'U刷新');
    await pa.click('.pn-create');
    await pa.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-lobby:not([hidden])', { timeout: 25000 });
    ok('uno 刷新自动回房仍 1 人', (await prows(pa)) === 1, await prows(pa));
    // 主动退出清票据 → 刷新不自动回房
    await pa.click('.pn-leave');
    await pa.waitForSelector('.pn-form:not([hidden])', { timeout: 15000 }).catch(() => {});
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('.pn-room', { timeout: 20000 });
    await pa.waitForTimeout(2500);
    ok('uno 主动退出后刷新不自动回房', await pa.evaluate(() => document.querySelector('.pn-lobby').hidden === true));
    await ctx.close();
  }

  /* ═══ 3. bombcat：本地链路建房 → 刷新回房 / 双人在线刷新 / 主动退出 ══ */
  {
    const ctx = await mkCtx();
    const catRoom = 'bc' + Math.random().toString(36).slice(2, 6);
    const goLocal = p => p.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    const pa = await ctx.newPage();
    await pa.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
    await pa.waitForSelector('#in-room', { timeout: 20000 });
    await goLocal(pa);
    await pa.fill('#in-room', catRoom);
    await pa.fill('#in-name', '猫头');
    await pa.click('#btn-join');
    await pa.waitForFunction(() => window.__cat && __cat.S && __cat.S.players && __cat.S.players.length >= 1, null, { timeout: 25000 });
    ok('bombcat 建房 1 人', (await pa.evaluate(() => __cat.S.players.length)) === 1);
    // 刷新 → 自动回房同座位（不产生第二个自己）
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForFunction(() => window.__cat && __cat.S && __cat.S.players && __cat.S.players.length >= 1, null, { timeout: 25000 });
    await pa.waitForTimeout(500);
    ok('bombcat 刷新自动回房', await pa.evaluate(rm => (document.querySelector('#share-room') || {}).textContent === rm.toUpperCase(), catRoom));
    ok('bombcat 刷新后仍 1 人（无双胞胎）', (await pa.evaluate(() => __cat.S.players.length)) === 1);
    // B 加入 → 房主刷新 → 仍 2 人
    const pb = await ctx.newPage();
    await pb.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${catRoom}`, { waitUntil: 'domcontentloaded' });
    await pb.waitForSelector('#in-room', { timeout: 20000 });
    await goLocal(pb);
    await pb.fill('#in-room', catRoom);
    await pb.fill('#in-name', '猫二');
    await pb.click('#btn-join');
    await pb.waitForFunction(() => { const s = window.__cat && __cat.S; return s && s.players && s.players.length >= 2; }, null, { timeout: 25000 });
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await pa.waitForFunction(() => { const s = window.__cat && __cat.S; return s && s.players && s.players.length >= 2; }, null, { timeout: 25000 });
    ok('bombcat 他人在线时刷新仍 2 人（无双胞胎）', (await pa.evaluate(() => __cat.S.players.length)) === 2);
    // 同名回收：第三页用与房主相同昵称加入 → 座位过户仍 2 人（大厅语义；开局中的同名加入=观战不回收）
    const pc2 = await ctx.newPage();
    await pc2.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${catRoom}`, { waitUntil: 'domcontentloaded' });   // 带 ?room=：抑制共享票据触发的自动回房（pc2 要手动验证同名回收）
    await goLocal(pc2);
    await pc2.fill('#in-room', catRoom);
    await pc2.fill('#in-name', '猫头');
    await pc2.click('#btn-join');
    await pc2.waitForFunction(() => window.__cat && __cat.S && __cat.S.players && __cat.S.players.length >= 2, null, { timeout: 25000 });
    await pa.waitForFunction(() => { const s = window.__cat && __cat.S; return s && s.players.length === 2 && s.players.some(p => p.id === (window.__cat.myId)); }, null, { timeout: 15000 }).catch(() => {});
    ok('bombcat 同名加入回收座位（仍 2 人，无第三个自己）', (await pa.evaluate(() => __cat.S.players.length)) === 2);
    // B 主动退出 → 刷新不自动回房
    await pb.evaluate(() => document.getElementById('btn-leave').click());
    await pb.waitForTimeout(800);
    await pb.reload({ waitUntil: 'domcontentloaded' });
    await pb.waitForSelector('#in-room', { timeout: 20000 });
    await pb.waitForTimeout(2500);
    ok('bombcat 主动退出后刷新不自动回房', await pb.evaluate(() => !window.__cat || !__cat.S || !__cat.S.players || !__cat.S.players.some(p => p.id === __cat.myId)));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
