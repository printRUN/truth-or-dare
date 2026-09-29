// probe-mono-maps：大富翁多地图回归锁（SPEC §1.6c，feat/mono-maps）
// M-A setup 选图卡 + classic 逐字节保真（AUTOTEST 基线零变化 = 六门禁不动的根基）
// M-B world 机场（¥400 随机飞 0/6/18，落 18 被 sendToJail 带到 6）/ food 夜市（¥400 换卡+牌堆守恒）+ 回头客 + 护照集章
// M-C 存档带图 / 2D 降级（--disable-webgl）/ 联机快照带图（host world → joiner 自动 applyMap）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8965;
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
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ` | ${JSON.stringify(extra).slice(0, 150)}` : '')); if (!cond) fails++; };
const CLASSIC_NAMES = ['起点', '老城区', '小巷集市', '机会', '旧仓库', '码头街', '监狱', '大学路', '咖啡巷', '命运', '书店街', '剧院街', '免费停车', '金融街', '商贸广场', '所得税', '电视塔', '会展中心', '入狱', '科技园', '云端大厦', '机会', '星光大道', '环球中心'];
const CLASSIC_PRICES = [0, 1000, 1200, 0, 1400, 1600, 0, 1800, 2000, 0, 2200, 2400, 0, 2600, 2800, 0, 3000, 3200, 0, 3400, 3600, 0, 3800, 4000];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ M-A：AUTOTEST classic 基线（逐字节保真）══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__mono && __mono.state.phase !== 'BOOT', null, { timeout: 20000 });
    const m = await p.evaluate(() => __mono.map());
    ok('M-A1 classic 逐字节：24 格名与冻结字面量一致', JSON.stringify(m.tileNames) === JSON.stringify(CLASSIC_NAMES), m.tileNames && m.tileNames.slice(0, 6));
    ok('M-A2 classic 逐字节：价格表一致（A2 买 ¥1000 的根基）', JSON.stringify(m.prices) === JSON.stringify(CLASSIC_PRICES));
    const phase = await p.evaluate(() => __mono.state.phase);
    ok('M-A3 autotest 自动开局照常（多地图改造零干扰）', ['AWAIT_ROLL', 'HANDOFF', 'ROLLING', 'HOPPING', 'RESOLVE'].includes(phase), phase);
    const picker = await p.evaluate(() => ({ cards: document.querySelectorAll('.map-card').length, on: (document.querySelector('.map-card.on') || {}).dataset || null }));
    ok('M-A4 AUTOTEST 选卡默认 classic（不读偏好，探针基线）', picker.cards === 3 && picker.on && picker.on.map === 'classic', picker);
    ok('M-A 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ M-B2：world inspect 真机档——选卡 → 开局 → 机场 + 护照 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('.map-card[data-map="world"]');
    const sel = await p.evaluate(() => (document.querySelector('.map-card.on') || {}).dataset && document.querySelector('.map-card.on').dataset.map);
    ok('M-B2a 选卡 world 生效（高亮切换）', sel === 'world', sel);
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && ['AWAIT_ROLL', 'HANDOFF'].includes(__mono.state.phase), null, { timeout: 15000 });
    const mw = await p.evaluate(() => __mono.map());
    ok('M-B2b world 图板重建（12 号=机场，组1=富士山，主题=环游世界）', mw.corner12 === '机场' && mw.tileNames[1] === '富士山' && mw.theme === '环游世界', { c12: mw.corner12, t1: mw.tileNames[1] });
    ok('M-B2c 24 格齐全（引擎布局不变）', mw.tileNames.length === 24 && mw.prices[23] === 4000);
    const ap = await p.evaluate(async () => {
      const G = __mono.state;
      G.players[0].bot = false; G.turn = 0; G.doubles = 0;
      __mono.forceMoney(0, 5000);
      __mono.forcePos(0, 12);
      const before = G.players[0].cash;
      await __mono.resolveAt(0, 12);
      return { before, after: G.players[0].cash, pos: G.players[0].pos, jailed: G.players[0].jailed, bankrupt: G.players[0].bankrupt, phase: G.phase };
    });
    ok('M-B2d 机场扣费 ¥400（落 0 另领过路费 +1000）', (ap.before - ap.after === 400 || ap.before - ap.after === -600) && !ap.bankrupt, { delta: ap.before - ap.after });
    ok('M-B2e 机场落点收敛（飞 0/6 停原格；飞 18 被押送 pos=6+jailed）', [0, 6].includes(ap.pos) && (!ap.jailed || ap.pos === 6), { pos: ap.pos, jailed: ap.jailed });
    ok('M-B2f 机场回合正常收束（afterResolve 单次推进）', ['AWAIT_ROLL', 'HANDOFF', 'RESOLVE'].includes(ap.phase), ap.phase);
    const pp = await p.evaluate(() => {
      const G = __mono.state;
      G.turn = 0; G.players[0].visited = [true, true, false, false];
      __mono.forceMoney(0, 3000);
      const before = G.players[0].cash;
      __mono.arriveGo(0);
      return { before, after: G.players[0].cash, visited: G.players[0].visited };
    });
    ok('M-B2g 护照两洲：GO +1000 与集章 +400 同拍（共 +1400）且本圈清空', pp.after - pp.before === 1400 && pp.visited.filter(Boolean).length === 0, pp);
    ok('M-B world 档零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ M-B3：food inspect 真机档——夜市换卡 + 牌堆守恒 + 回头客 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('.map-card[data-map="food"]');
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && ['AWAIT_ROLL', 'HANDOFF'].includes(__mono.state.phase), null, { timeout: 15000 });
    const mf = await p.evaluate(() => __mono.map());
    ok('M-B3a food 图板（12 号=夜市，组1=臭豆腐）', mf.corner12 === '夜市' && mf.tileNames[1] === '臭豆腐', { c12: mf.corner12, t1: mf.tileNames[1] });
    const mk = await p.evaluate(async () => {
      const G = __mono.state;
      G.players[0].bot = false; G.turn = 0; G.doubles = 0;
      __mono.forceMoney(0, 5000); __mono.forcePos(0, 12);
      const before = G.players[0].cash;
      await __mono.resolveAt(0, 12);
      const cons = () => G.decks.chest.length + G.decks.chestDisc.length + G.players.reduce((s, q) => s + (q.jailCards || 0) - (q.marketCards || 0), 0);   // 牌堆来源守恒：夜市卡不计入
      const consAfterBuy = cons();
      __mono.forcePos(0, 12);
      await __mono.resolveAt(0, 12);   // 已有卡再来：不卖不扣
      return { before, after: G.players[0].cash, cards: G.players[0].jailCards, market: G.players[0].marketCards, consAfterBuy, consAfterSkip: cons(), cashAfterSkip: G.players[0].cash };
    });
    ok('M-B3b 夜市 ¥400 换免罚卡', mk.before - mk.after === 400 && mk.cards === 1 && mk.market === 1, mk);
    ok('M-C 牌堆守恒（deck+disc+手持=8，夜市卡不入堆）', mk.consAfterBuy === 8 && mk.consAfterSkip === 8, { buy: mk.consAfterBuy, skip: mk.consAfterSkip });
    ok('M-B3d 已有卡不重复卖（第二趟零扣费）', mk.cashAfterSkip === mk.after, { a: mk.after, b: mk.cashAfterSkip });
    const rc = await p.evaluate(async () => {
      const G = __mono.state;
      G.turn = 0; G.players[0].bot = false;
      G.owners[5] = 0;
      __mono.forceMoney(0, 3000); __mono.forcePos(0, 5);
      const before = G.players[0].cash;
      await __mono.resolveAt(0, 5);
      return { before, after: G.players[0].cash, price: __mono.map().prices[5] };
    });
    ok('M-B3e 回头客：落自家餐馆 +地价 8%（确定性，1600→+128）', rc.after - rc.before === Math.round(rc.price * 0.08), rc);
    ok('M-B food 档零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ M-C1：存档带图 + 2D 降级（--disable-webgl）══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('.map-card[data-map="world"]');
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && ['AWAIT_ROLL', 'HANDOFF'].includes(__mono.state.phase), null, { timeout: 15000 });
    const sv = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('mono:save:v1') || 'null'); } catch (e) { return null; } });
    ok('M-C1a 存档带 map+visited+marketCards（beginTurn 安全点已落）', !!sv && sv.map === 'world' && Array.isArray(sv.players[0].visited) && sv.players[0].marketCards === 0, sv && { map: sv.map, ph: sv.phase });
    ok('M-C1 world 档零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();

    const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2'] });
    const ctx2 = await b2.newContext({ viewport: { width: 640, height: 520 } });
    const p2 = await ctx2.newPage();
    const errs2 = []; p2.on('pageerror', e => errs2.push(String(e)));
    await p2.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    const glOff = await p2.evaluate(() => document.body.classList.contains('gl-off'));
    if (!glOff) { console.log('SKIP M-C1b（本机未吃 --disable-webgl，2D 路径由 probe-monopoly B 段 classic 覆盖）'); }
    else {
      await p2.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
      await p2.click('.map-card[data-map="world"]');
      await p2.click('#btn-start');
      await p2.waitForFunction(() => window.__mono && __mono.state.phase !== 'BOOT', null, { timeout: 15000 });
      const txt = await p2.evaluate(() => document.getElementById('board2d').textContent);
      ok('M-C1b 2D 降级 world：机场上板且无 undefined（顺修存量 bug）', txt.includes('机场') && !txt.includes('undefined'), { hasUndef: txt.includes('undefined') });
    }
    ok('M-C1b 2D 档零 pageerror', errs2.length === 0, errs2.join(';'));
    await b2.close();
  }

  // ══ M-C2：联机快照带图（host world → joiner 自动 applyMap）══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
    const host = await ctx.newPage();
    await host.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=42428&role=host`, { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => window.__mono && __mono.net().joined, null, { timeout: 20000 });
    const join = await ctx.newPage();
    await join.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=42428&role=join&name=小绿`, { waitUntil: 'domcontentloaded' });
    await join.waitForFunction(() => window.__mono && __mono.net().joined, null, { timeout: 20000 });
    const rowHidden = await join.evaluate(() => { const r = document.getElementById('net-map-row'); return r ? r.hidden : 'missing'; });
    ok('M-C2a joiner 端地图行隐藏（房主定图）', rowHidden === true, rowHidden);
    await host.evaluate(() => { const el = document.getElementById('net-map'); if (el) el.value = 'world'; });
    await host.evaluate(() => __mono.net().start({ roundLimit: 20, map: (document.getElementById('net-map') || {}).value || 'classic' }));
    await Promise.all([
      host.waitForFunction(() => __mono.map().id === 'world', null, { timeout: 20000 }).catch(() => {}),
      join.waitForFunction(() => __mono.map().id === 'world', null, { timeout: 20000 }).catch(() => {}),
    ]);
    const ids = await Promise.all([host.evaluate(() => __mono.map().id), join.evaluate(() => __mono.map().id)]);
    ok('M-C2b 快照带图：host 与 joiner 双端 world（joiner 走 applyGameSnapshot 自动重建）', ids[0] === 'world' && ids[1] === 'world', ids);
    const docMap = await join.evaluate(() => __mono.net().doc && __mono.net().doc.game && __mono.net().doc.game.map);
    ok('M-C2c 棋局快照字段 map=world', docMap === 'world', docMap);
    await ctx.close();
  }

  // ══ M-C3：偏好跨 reload 恢复（终审 F-A 回归锁：boot 首填曾把 mono:map 洗成 classic）══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; });
    await p.click('.map-card[data-map="food"]');
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    const after = await p.evaluate(() => ({
      id: __mono.map().id,
      on: (document.querySelector('.map-card.on') || {}).dataset && document.querySelector('.map-card.on').dataset.map,
      stored: localStorage.getItem('mono:map'),
    }));
    ok('M-C3 偏好跨 reload 恢复（选 food → 刷新 → 图板+选卡高亮+存储都是 food）', after.id === 'food' && after.on === 'food' && after.stored === 'food', after);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : `\nALL PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (e2) {} process.exit(1); });
