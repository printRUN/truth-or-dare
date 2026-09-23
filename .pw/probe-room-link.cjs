// 房间链接直进 · 边界探针（2026-09-23 四游戏表单对齐 tod 口径）
// 覆盖：?room= 预填 / 脏参数静默忽略 / 建房→复制邀请链接（剪贴板）/ 第二页开链接直进 / 粘贴整段邀请文字抽房号 / 不存在房间负例
// monopoly/uno 走 ?localnet=1（BroadcastChannel 本地链路，不碰外网 broker）；bombcat 本地模式同源隔离
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8951;
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
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   // 手机竖屏档=自适应口径
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    return ctx;
  };

  /* ═══ 1. monopoly（party-net 组件）═══ */
  {
    const ctx = await mkCtx();
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    // 1a. ?room= 预填
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?room=12345&localnet=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.pn-room', { timeout: 20000 });
    ok('monopoly ?room=12345 预填表单', (await p.inputValue('.pn-room')) === '12345', await p.inputValue('.pn-room'));
    // 1b. 脏参数静默忽略
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?room=abc&localnet=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.pn-room', { timeout: 20000 });
    ok('monopoly ?room=abc（非数字）不预填', (await p.inputValue('.pn-room')) === '');
    // 1c. 建房 → 复制邀请链接
    await p.fill('.pn-name', '房主甲');
    await p.click('.pn-create');
    await p.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    const code = (await p.textContent('.pn-code-b')).trim();
    ok('monopoly 建房得到 5 位房号', /^[0-9]{5}$/.test(code), code);
    await p.click('.pn-invite');
    await p.waitForTimeout(400);
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('monopoly 复制邀请链接含 ?room=' + code, clip.includes(`monopoly.html?room=${code}`), clip);
    ok('monopoly 复制后按钮反馈已复制', (await p.textContent('.pn-invite')).includes('已复制'));
    // 1d. 第二页直接打开复制出的链接 = 直进同一房
    const p2 = await ctx.newPage();
    const inviteUrl = clip.trim();
    await p2.goto(inviteUrl + '&localnet=1', { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('.pn-room', { timeout: 20000 });
    ok('monopoly 链接打开即预填房号', (await p2.inputValue('.pn-room')) === code);
    await p2.fill('.pn-name', '链接客');
    await p2.click('.pn-join');
    await p2.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    ok('monopoly 第二页经链接加入同房', (await p2.textContent('.pn-code-b')).trim() === code);
    // 1e. 粘贴整段邀请文字 → join 抽房号
    const p3 = await ctx.newPage();
    await p3.goto(`http://127.0.0.1:${PORT}/monopoly.html?localnet=1`, { waitUntil: 'domcontentloaded' });
    await p3.waitForSelector('.pn-room', { timeout: 20000 });
    await p3.fill('.pn-room', `来玩大富翁！点开就进 http://127.0.0.1/monopoly.html?room=${code} 房间号 ${code}`);
    await p3.fill('.pn-name', '粘贴侠');
    await p3.click('.pn-join');
    await p3.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    ok('monopoly 粘贴邀请文字抽出房号入房', (await p3.textContent('.pn-code-b')).trim() === code);
    // 1f. 负例：加入不存在的房间 → 明确报错不进房
    const p4 = await ctx.newPage();
    await p4.goto(`http://127.0.0.1:${PORT}/monopoly.html?localnet=1`, { waitUntil: 'domcontentloaded' });
    await p4.waitForSelector('.pn-room', { timeout: 20000 });
    await p4.fill('.pn-room', '00000');
    await p4.fill('.pn-name', '负例侠');
    await p4.click('.pn-join');
    await p4.waitForFunction(() => {
      const t = document.getElementById('toast');
      return t && t.textContent && t.textContent.includes('房间不存在');
    }, null, { timeout: 15000 }).catch(() => {});
    const toastTxt = await p4.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    ok('monopoly 不存在房间明确报错', toastTxt.includes('房间不存在'), toastTxt);
    ok('monopoly 零 JS 错误', errs.length === 0, errs[0]);
    await ctx.close();
  }

  /* ═══ 2. uno（party-net 同组件，抽测）═══ */
  {
    const ctx = await mkCtx();
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?room=24680&localnet=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.pn-room', { timeout: 20000 });
    ok('uno ?room=24680 预填', (await p.inputValue('.pn-room')) === '24680');
    await p.fill('.pn-name', 'U人');
    await p.click('.pn-create');
    await p.waitForSelector('.pn-lobby:not([hidden])', { timeout: 20000 });
    const code = (await p.textContent('.pn-code-b')).trim();
    ok('uno 大厅有复制邀请按钮且可复制', await p.isVisible('.pn-invite'));
    await p.click('.pn-invite');
    await p.waitForTimeout(400);
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('uno 复制邀请链接含房号', clip.includes(`uno.html?room=${code}`), clip);
    ok('uno 零 JS 错误', errs.length === 0, errs[0]);
    await ctx.close();
  }

  /* ═══ 3. bombcat ═══ */
  {
    const ctx = await mkCtx();
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=ab12`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#in-room', { timeout: 20000 });
    ok('bombcat ?room=ab12 预填并大写', (await p.inputValue('#in-room')) === 'AB12', await p.inputValue('#in-room'));
    await p.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#in-room', { timeout: 20000 });
    ok('bombcat 无参数不预填（留空=新建）', (await p.inputValue('#in-room')) === '');
    // A 建房 AB12 → 大厅复制按钮在场
    const nameSel = 'input[placeholder*="昵称"], #in-name, input[type=text]:not(#in-room)';
    await p.fill('#in-room', 'ab12');
    await p.fill(nameSel, '猫头').catch(() => {});
    await p.click('#btn-join');
    await p.waitForFunction(() => (document.querySelector('#share-room') || {}).textContent === 'AB12', null, { timeout: 25000 }).catch(() => {});
    ok('bombcat A 建房 ab12 进房', await p.evaluate(() => (document.querySelector('#share-room') || {}).textContent === 'AB12'));
    ok('bombcat 大厅有复制邀请按钮', await p.isVisible('#btn-copy'));
    // B 经链接加入同房
    const pb = await ctx.newPage();
    await pb.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=ab12`, { waitUntil: 'domcontentloaded' });
    await pb.waitForSelector('#in-room', { timeout: 20000 });
    await pb.fill('#in-room', 'ab12');
    await pb.fill(nameSel, '猫二').catch(() => {});
    await pb.click('#btn-join');
    await pb.waitForFunction(() => { const s = window.__cat && __cat.S; return s && s.players && s.players.length >= 2; }, null, { timeout: 25000 }).catch(() => {});
    ok('bombcat B 经链接加入同房（2 人）', await pb.evaluate(() => { const s = window.__cat && __cat.S; return !!(s && s.players && s.players.length >= 2); }));
    ok('bombcat 零 JS 错误', errs.length === 0, errs[0]);
    await ctx.close();
  }

  /* ═══ 4. tod 独立页（?room= 直进抽测）═══ */
  {
    const ctx = await mkCtx();
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/tod.html?room=TOD42`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#input-room', { timeout: 25000 });
    ok('tod ?room=TOD42 预填', (await p.inputValue('#input-room')).includes('TOD42'), await p.inputValue('#input-room'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
