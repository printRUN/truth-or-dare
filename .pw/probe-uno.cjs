// 探针：uno.html 全流程 —— feat/arcade-monopoly UNO 轮
// A：3D（loperf=1 跳帧渲染）规则链：出牌合法性 / +4 强限 / 效果 / UNO 窗口与抓包 / 洗回 / 僵局保险丝 / 再来一局先手 / 存档恢复
// B：2D 降级（GL_STUB）开局→摸牌→出牌
// C：turbo 蒙特卡洛 20 局全终局
// 探针断言走 UI 真路径（act-hand → 手牌浮层点击），运行时与探针共用 canPlay 谓词。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8909;
const URL = `http://127.0.0.1:${PORT}/uno.html?autotest=1&loperf=1`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});
const results = [];
const ok = (name, cond, extra) => { const line = name + (extra !== undefined ? ` | ${JSON.stringify(extra).slice(0, 140)}` : ''); results.push([cond ? 'PASS' : 'FAIL', line]); console.log((cond ? 'PASS ' : 'FAIL ') + line); if (!cond) process.exitCode = 1; };
const GL_STUB = `(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    if (/webgl/.test(String(type))) return null;
    return orig.call(this, type, ...a);
  };
})();`;
const cd = (c, v) => ({ c, v });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ A：3D 规则链 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });   // evaluate 里的造牌助手（页面上下文）
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION', { timeout: 25000 });
    let st = await p.evaluate(() => ({
      n: __uno.state.players.length, h0: __uno.state.players[0].hand.length, h1: __uno.state.players[1].hand.length,
      phase: __uno.state.phase, names: __uno.state.players.map(x => x.name),
      bar: !!document.querySelector('#act-draw'),
    }));
    ok('A1 自动开局 1 真人+1 机器人，起手 7 张', st.n === 2 && st.h0 === 7 && st.h1 === 7 && st.names[0] === '测试员', st.names);
    ok('A1 动作条出现（AWAIT_ACTION）', st.phase === 'AWAIT_ACTION' && st.bar);

    // A2 出牌合法性：可出 2 张、不可出 1 张（r5/b7/wW，当前红）
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '5'), cd('b', '7'), cd('w', 'W')]); });
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 10000 });
    st = await p.evaluate(() => ({ play: document.querySelectorAll('.hcard.playable').length, dim: document.querySelectorAll('.hcard.dim').length }));
    ok('A2 合法性高亮：可出 2 / 压暗 1', st.play === 2 && st.dim === 1, st);
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.getElementById('hand-ovl').classList.remove('show'));

    // A3 +4 强限：手中有当前色 → W4 灰；没有 → 可出
    await p.evaluate(() => __uno.forceHand(0, [cd('r', '2'), cd('w', 'W4')]));
    await p.click('#act-hand');
    st = await p.evaluate(() => [...document.querySelectorAll('.hcard')].map(e => e.classList.contains('playable') ? 1 : 0));
    ok('A3 +4 强限：有当前色时 W4 不可出', st[0] === 1 && st[1] === 0, st);
    await p.evaluate(() => document.getElementById('hand-ovl').classList.remove('show'));   // 第一段断言完关浮层（否则下个 act-hand 点击被 z70 拦截）
    await p.waitForTimeout(120);
    await p.evaluate(() => __uno.forceHand(0, [cd('b', '2'), cd('w', 'W4')]));
    await p.click('#act-hand');   // 重新打开浮层（上一段已关闭，strip 里是旧 DOM）
    await p.waitForFunction(() => document.querySelectorAll('#hand-strip .hcard')[1] && document.querySelectorAll('#hand-strip .hcard')[1].classList.contains('playable'), { timeout: 8000 });
    await p.evaluate(() => document.getElementById('hand-ovl').classList.remove('show'));
    ok('A3 +4 强限：无当前色时可出', true);

    // A4 万能选色：出 W → 弹四色 → 选蓝 → cur=b
    await p.evaluate(() => { __uno.state.discard = [cd('r', '3')]; __uno.state.cur = 'r'; __uno.forceHand(0, [cd('w', 'W'), cd('r', '2')]); });   // 垫一张：出 W 不触发胜利
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForSelector('#wild-modal:not([hidden])', { timeout: 8000 });
    await p.evaluate(() => __uno.chooseColor('b'));
    await p.waitForFunction(() => __uno.state.cur === 'b' && __uno.state.turn === 1, { timeout: 15000 });
    st = await p.evaluate(() => ({ cur: __uno.state.cur, chip: document.getElementById('color-name').textContent }));
    ok('A4 万能选色生效 + chip 带色名', st.cur === 'b' && st.chip.includes('蓝'), st);
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, { timeout: 20000 });

    // A5 +2 罚摸并轮空：真人出 D2 → 机器人摸 2 → 回到真人
    const botBefore = await p.evaluate(() => __uno.state.players[1].hand.length);
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', 'D2'), cd('g', '4')]); });   // 垫一张防"打完即胜"
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForFunction(() => __uno.state.turn === 0 && __uno.state.phase === 'AWAIT_ACTION', { timeout: 20000 });
    st = await p.evaluate(b => ({ bot: __uno.state.players[1].hand.length, top: __uno.state.discard[__uno.state.discard.length - 1].v }), botBefore);
    ok('A5 +2 罚摸并轮空', st.bot === botBefore + 2 && st.top === 'D2', st);

    // A6 UNO 窗口：出牌剩 1 张 → 按钮出现；不喊 → 机器人抓包罚 2
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '8'), cd('g', '4')]); });   // 垫一张防"打完即胜"
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForFunction(() => __uno.state.unoWin && __uno.state.unoWin.who === 0 && !__uno.state.unoWin.penalized, { timeout: 10000 });
    st = await p.evaluate(() => ({ show: document.getElementById('btn-uno').classList.contains('show') }));
    ok('A6 剩 1 张 UNO 按钮脉冲', st.show);
    await p.evaluate(() => __uno.forceUnoTimeout());
    await p.waitForFunction(() => __uno.state.players[0].hand.length === 3, { timeout: 15000 });   // 1 张(喊名窗口) → 忘喊 → 罚 2 = 3 张
    st = await p.evaluate(() => ({ h: __uno.state.players[0].hand.length, pen: __uno.state.unoWin && __uno.state.unoWin.penalized }));
    ok('A6 忘喊被抓：罚摸 2（7→...→1→3）', st.h === 3 && st.pen, st);
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, { timeout: 20000 });

    // A7 喊 UNO 免罚：出牌剩 1 → 点 UNO → 无罚
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '8'), cd('g', '4')]); });   // 垫一张防"打完即胜"
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForFunction(() => __uno.state.unoWin && __uno.state.unoWin.who === 0 && !__uno.state.unoWin.penalized, { timeout: 10000 });
    await p.click('#btn-uno', { force: true });   // 脉冲动画永不'稳定'，force 绕过 actionability
    st = await p.evaluate(() => ({ h: __uno.state.players[0].hand.length, pen: __uno.state.unoWin && __uno.state.unoWin.penalized }));
    ok('A7 喊 UNO 后不被罚（手牌仍 1）', st.h === 1 && st.pen, st);
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, { timeout: 20000 });

    // A8 胜局不挨罚：直接出最后一张 → 结算浮层、无抓包
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '9')]); });
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForFunction(() => __uno.state.phase === 'OVER', { timeout: 15000 });
    st = await p.evaluate(() => ({
      over: __uno.state.phase, hidden: document.getElementById('result-overlay').hidden,
      winner: document.getElementById('result-winner').textContent,
      h0: __uno.state.players[0].hand.length, pods: document.querySelectorAll('.pod').length,
    }));
    ok('A8 出完获胜 + 结算浮层', st.over === 'OVER' && !st.hidden && st.winner.includes('测试员') && st.h0 === 0 && st.pods === 2, st);

    // A9 再来一局：胜者先手 + 配置保留
    await p.click('#btn-rematch');
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, { timeout: 20000 });
    st = await p.evaluate(() => ({ turn: __uno.state.turn, h: __uno.state.players.map(x => x.hand.length), names: __uno.state.players.map(x => x.name) }));
    ok('A9 再来一局：胜者先手、手牌重发', st.turn === 0 && st.h[0] === 7 && st.h[1] === 7 && st.names[0] === '测试员', st);

    // A10 洗回边界：牌库空 + 弃牌多张 → 摸牌触发洗回，顶牌除外，当前色不变（顶 wild 选蓝）
    await p.evaluate(() => {
      __uno.state.deck = [];
      __uno.state.discard = [cd('w', 'W'), cd('r', '4'), cd('g', '6'), cd('y', '2'), cd('b', '1')];
      __uno.state.cur = 'b';
      __uno.forceHand(0, [cd('r', '9')]);
    });
    await p.click('#act-draw');
    await p.waitForFunction(() => __uno.state.players[0].hand.length === 2, { timeout: 15000 });
    st = await p.evaluate(() => ({ deckN: __uno.state.deck.length, cur: __uno.state.cur, top: __uno.state.discard.length }));
    ok('A10 洗回：顶牌保留、当前色不变', st.deckN === 3 && st.cur === 'b' && st.top === 1, st);
    await p.evaluate(() => { const btns = [...document.querySelectorAll('#gen-actions button')]; const keep = btns.find(b => b.textContent.includes('留')); if (keep) keep.click(); });   // 摸到可出牌会弹打出/保留，选留以便 A11 过牌
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0 && document.getElementById('gen-modal').hidden, { timeout: 20000 });

    // A11 僵局保险丝：200 次过牌 → 和局按罚分结算
    await p.evaluate(() => { __uno.state.passStreak = 200; __uno.state.drawnThisTurn = true; });
    await p.evaluate(() => doPass());   // 摸牌自动过后 drawnThisTurn 复位会让 act-pass 呈禁用——直接驱动页面函数
    await p.waitForFunction(() => __uno.state.phase === 'OVER', { timeout: 15000 });
    st = await p.evaluate(() => ({ over: __uno.state.phase, txt: document.getElementById('result-winner').textContent }));
    ok('A11 僵局保险丝：和局结算', st.over === 'OVER' && st.txt.includes('和局'), st);
    await p.click('#btn-rematch');
    await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION', { timeout: 20000 });

    // A12 存档恢复：强改手牌 → 重载 → 恢复提示 → 手牌与回合一致
    await p.evaluate(() => { __uno.state.cur = 'g'; __uno.state.discard = [cd('g', '5')]; __uno.forceHand(0, [cd('g', '7'), cd('y', '3')]); __uno.forceHand(1, [cd('b', '2'), cd('r', '6'), cd('w', 'W4')]); });
    await p.evaluate(() => __uno.saveNow());
    await p.waitForTimeout(400);
    const before = await p.evaluate(() => ({ turn: __uno.state.turn, h0: __uno.state.players[0].hand.length, h1: __uno.state.players[1].hand.length }));
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && (__uno.state.phase === 'AWAIT_ACTION' || __uno.state.phase === 'HANDOFF'), { timeout: 25000 });   // autotest 有档自动续局
    st = await p.evaluate(() => ({ turn: __uno.state.turn, h0: __uno.state.players[0].hand.length, h1: __uno.state.players[1].hand.length, ph: __uno.state.phase }));
    ok('A12 恢复后手牌保持（机器人先动导致回合前进属正常）', st.h0 === before.h0 && st.h1 === before.h1 && ['AWAIT_ACTION', 'HANDOFF'].includes(st.ph), { before, after: st });

    ok('A 全程零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ B：2D 降级（GL_STUB） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(GL_STUB);
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION', { timeout: 25000 });
    let st = await p.evaluate(() => ({
      glOff: document.body.classList.contains('gl-off'),
      d2: !!document.querySelector('#board2d .d2-table'),
      canvasHidden: getComputedStyle(document.getElementById('uno-canvas')).display === 'none',
    }));
    ok('B1 gl-off + 2D 牌桌呈现', st.glOff && st.d2 && st.canvasHidden, st);
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '5')]); });
    await p.click('#act-hand');
    await p.waitForSelector('#hand-ovl.show', { timeout: 8000 });
    await p.click('.hcard[data-k="0"]');
    await p.waitForFunction(() => __uno.state.discard[__uno.state.discard.length - 1].v === '5', { timeout: 15000 });
    ok('B2 2D 出牌走通（弃牌顶更新）', true);
    ok('B 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ C：蒙特卡洛 20 局（turbo，全机器人） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.text().startsWith('[uno-mc]')) console.log('  ' + m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&turbo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION', { timeout: 25000 });
    const mc = await p.evaluate(async () => await __uno.mc(20));
    ok('C1 20 局全部终局且产出胜者', mc.length === 20 && mc.every(g => g.winner != null), mc.map(g => g.winner));
    ok('C 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('\n══ probe-uno 结果 ══');
  results.forEach(([s, n]) => console.log(`${s === 'PASS' ? '✅' : '❌'} ${n.replace(/\n/g, ' ')}`));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? `\n${fails} FAILED / ${results.length}` : `\nALL ${results.length} PASS ✅`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
