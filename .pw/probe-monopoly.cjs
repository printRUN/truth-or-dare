// 探针：monopoly.html 全流程 —— feat/arcade-monopoly
// A：autotest 确定性对局（买地/租金/机会卡/监狱/破产/胜者/再来一局）
// B：2D 降级（WebGL stub → body.gl-off，同一状态机走一遍开局→买地→抽卡）
// C：蒙特卡洛 20 局（turbo ×0.01，验证经济收敛与终局可达 —— 玩家专家 P0-1 验收线）
// 注：A2/A5 用 driveBackTo0() 赶回合——机器人回合可能落在玩家地/抽卡上产生额外资金流，
//     买地扣款断言在 buy 点击后立即读现金（机器人链 120ms 后才启动，读写窗口安全）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8907;
const URL = `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&loperf=1`;

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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ A：3D autotest 对局 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    // 通用驱动：处理买地弹窗/交接屏，直到回到 0 号玩家的 AWAIT_ROLL
    const driveBackTo0 = async (label, tries = 14) => {
      for (let i = 0; i < tries; i++) {
        const st = await p.evaluate(() => ({
          ph: __mono.state.phase, turn: __mono.state.turn,
          modal: !document.getElementById('buy-modal').hidden,
          handoff: !document.getElementById('handoff').hidden,
          gen: !document.getElementById('gen-modal').hidden,
          jailed: __mono.state.players[0].jailed, jt: __mono.state.players[0].jailTurns,
        }));
        if (st.turn === 0 && st.ph === 'AWAIT_ROLL') return st;
        if (st.modal) await p.evaluate(() => __mono.buy(true));
        else if (st.handoff) await p.evaluate(() => __mono.handoff());
        else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });   // 抽卡的 DOM 玻璃卡（loperf/REDUCED 降级路）
        else if (st.turn === 1 && st.ph === 'AWAIT_ROLL') await p.evaluate(() => __mono.step());   // 伪真人（A4 冻结期）替它掷骰
        await p.waitForTimeout(350);
      }
      throw new Error('driveBackTo0 timeout: ' + label);
    };

    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', { timeout: 25000 });
    const scene = await p.evaluate(() => __mono.sceneInfo());
    ok('A0 3D 场景已建（格/棋子/骰子）', scene.gl && !scene.bodyLo === false && scene.tiles === 24 && scene.pawns === 2 && scene.dice === 2, scene);
    let st = await p.evaluate(() => ({
      n: __mono.state.players.length, cash0: __mono.state.players[0].cash, cash1: __mono.state.players[1].cash,
      phase: __mono.state.phase, names: __mono.state.players.map(x => x.name),
      bar: document.querySelectorAll('#players-bar .pchip').length,
      startBtn: !!document.querySelector('#act-roll'),
    }));
    ok('A1 自动开局 1 真人 + 1 机器人', st.n === 2 && st.names[0] === '测试员' && st.names[1] === '机器人甲', st.names);
    ok('A1 起始现金 ¥10000×2', st.cash0 === 10000 && st.cash1 === 10000);
    ok('A1 玩家条 2 chip', st.bar === 2);
    ok('A1 掷骰按钮出现（AWAIT_ROLL）', st.phase === 'AWAIT_ROLL' && st.startBtn);

    // A2 买地：跳过走位直接结算无主地 1 号（¥1000）；扣款在点击后立即读（机器人 120ms 后才动）
    await p.evaluate(() => __mono.resolveAt(0, 1));
    await p.waitForSelector('#buy-modal:not([hidden])', { timeout: 15000 });
    ok('A2 买地弹窗出现', true);
    await p.evaluate(() => __mono.buy(true));
    const cashBuy = await p.evaluate(() => __mono.state.players[0].cash);
    ok('A2 买下扣款 ¥1000', cashBuy === 9000, { cash: cashBuy });
    await driveBackTo0('A2');
    st = await p.evaluate(() => ({ owner: __mono.state.owners[1] }));
    ok('A2 归属写入', st.owner === 0, st);

    // A3 租金：机器人落在玩家的 1 号地 → 租金 ¥400（无同色 ×1）
    const before = await p.evaluate(() => __mono.state.players[0].cash);
    await p.evaluate(() => __mono.resolveAt(1, 1));
    await driveBackTo0('A3');
    st = await p.evaluate(() => __mono.state.players[0].cash);
    ok('A3 租金转移 +400', st === before + 400, { before, after: st });

    // A4 机会卡：先冻结机器人（伪真人消化后续回合），读牌堆顶，再抽
    await p.evaluate(() => { __mono.state.players[1].bot = false; __mono.state._lastCard = null; });
    const pre = await p.evaluate(() => ({
      top: __mono.state.decks.chance[0],
      cash: __mono.state.players[0].cash, jailCards: __mono.state.players[0].jailCards,
      pos: __mono.state.players[0].pos, jailed: __mono.state.players[0].jailed,
      botCash: __mono.state.players[1].cash,
    }));
    const resolveA4 = p.evaluate(() => __mono.resolveAt(0, 3)).catch(e => ({ evalErr: String(e).slice(0, 120) }));   // 3 号 = 机会；不 await：DOM 卡降级要等点击才返回
    // 卡牌揭晓双路：3D 飞卡（快机）或 DOM 玻璃卡（bodyLo/REDUCED 降级，要点「知道了」）
    await p.waitForFunction(() => (__mono.state._lastCard && __mono.state._lastCard.kind === 'chance') || !document.getElementById('gen-modal').hidden, { timeout: 30000 });
    const domCard = await p.evaluate(() => !document.getElementById('gen-modal').hidden);
    if (domCard) await p.click('#gen-actions button');
    await p.waitForFunction(() => __mono.state._lastCard && __mono.state._lastCard.kind === 'chance', { timeout: 20000 });
    await resolveA4;
    const card = await p.evaluate(() => ({ card: __mono.state._lastCard, cash: __mono.state.players[0].cash, jailCards: __mono.state.players[0].jailCards, pos: __mono.state.players[0].pos, jailed: __mono.state.players[0].jailed }));
    ok('A4 抽到的是牌堆顶那张', card.card.idx === pre.top, { top: pre.top, got: card.card.idx });
    const a = card.card.act, d = card.cash - pre.cash;
    let cardOk = false;
    if (a.gain != null) cardOk = d === a.gain;
    else if (a.pay != null) cardOk = d === -a.pay;
    else if (a.collectAll != null) cardOk = d === Math.min(pre.botCash, a.collectAll);
    else if (a.payAll != null) cardOk = d === -a.payAll;
    else if (a.jailCard) cardOk = card.jailCards === pre.jailCards + 1;
    else if (a.goto != null) cardOk = card.pos === a.goto && d === 1000;
    else if (a.jail) cardOk = card.jailed === true && card.pos === 6;
    else if (a.perProp != null) cardOk = d === -a.perProp;   // 此时玩家只有 1 号地
    ok('A4 卡牌效果与牌面一致', cardOk, { act: a, delta: d, after: card });
    // 伪真人消化 1 号这一回合（可能开买地弹窗），回合回 0 后再恢复机器人身份
    await driveBackTo0('A4-fake-human');
    await p.evaluate(() => { __mono.state.players[1].bot = true; });

    // A4b collectAll 边界：牌堆顶换成「生日收 500」，对方现金 700 → 足额付清存活剩 200
    await p.evaluate(() => { __mono.state.players[1].bot = false; __mono.state._lastCard = null; __mono.state.decks.chance[0] = 0; __mono.forceMoney(1, 700); });
    const resolveA4b = p.evaluate(() => __mono.resolveAt(0, 3)).catch(e => ({ evalErr: String(e).slice(0, 120) }));
    await p.waitForFunction(() => (__mono.state._lastCard && __mono.state._lastCard.kind === 'chance') || !document.getElementById('gen-modal').hidden, { timeout: 30000 });
    if (await p.evaluate(() => !document.getElementById('gen-modal').hidden)) await p.click('#gen-actions button');
    await p.waitForFunction(() => __mono.state._lastCard && __mono.state._lastCard.act && __mono.state._lastCard.act.collectAll === 500, { timeout: 20000 });
    await resolveA4b;
    const bnd = await p.evaluate(() => ({ alive: !__mono.state.players[1].bankrupt, cash1: __mono.state.players[1].cash, cash0: __mono.state.players[0].cash }));
    ok('A4b collectAll 边界：付清 500 存活（不误杀 500-999 段）', bnd.alive && bnd.cash1 === 200, bnd);
    await driveBackTo0('A4b');   // 先以伪真人身份驱动完 1 号回合（step 只对非 bot 生效），再恢复机器人身份
    await p.evaluate(() => { __mono.state.players[1].bot = true; });

    // A5 监狱（真人）：强制回合指针回 0 + 入狱，赌双数——要么出狱要么 jailTurns+1
    await p.evaluate(() => { __mono.state.turn = 0; __mono.state.phase = 'AWAIT_ROLL'; __mono.state.doubles = 0; __mono.forceJail(0); });
    await p.waitForTimeout(250);
    await p.evaluate(() => __mono.step());
    const jailSt = await driveBackTo0('A5');
    ok('A5 监狱双数判定一致（出狱或蹲 ≥1 回合）', jailSt.jailed === false || jailSt.jt >= 1, jailSt);

    // A6 破产与终局：机器人现金打光 → 所得税压垮 → 最后存活者胜
    await p.evaluate(() => { __mono.forceMoney(1, 100); __mono.forcePos(1, 0); });
    await p.evaluate(() => __mono.resolveAt(1, 15));   // 15 号 = 所得税 ¥1000
    await p.waitForFunction(() => __mono.state.phase === 'OVER', { timeout: 30000 });
    st = await p.evaluate(() => ({
      over: __mono.state.phase, hidden: document.getElementById('result-overlay').hidden,
      winner: document.getElementById('result-winner').textContent,
      bust: __mono.state.players[1].bankrupt, pods: document.querySelectorAll('.pod').length,
    }));
    ok('A6 破产判定', st.bust === true);
    ok('A6 结算浮层+胜者', st.over === 'OVER' && !st.hidden && st.winner.includes('测试员') && st.pods === 2, st);

    // A7 再来一局：同班人马 + 状态全重置
    await p.click('#btn-rematch');
    await p.waitForFunction(() => __mono.state.phase === 'AWAIT_ROLL' && __mono.state.turn === 0, { timeout: 30000 });
    st = await p.evaluate(() => ({
      cash0: __mono.state.players[0].cash, cash1: __mono.state.players[1].cash,
      owners: __mono.state.owners.every(o => o === null), bankrupt: __mono.state.players[1].bankrupt,
      names: __mono.state.players.map(x => x.name),
    }));
    ok('A7 再来一局重置完整', st.cash0 === 10000 && st.cash1 === 10000 && st.owners && !st.bankrupt && st.names[0] === '测试员', st);
    ok('A 全程零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ B：2D 降级（WebGL stub） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(GL_STUB);
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', { timeout: 25000 });
    let st = await p.evaluate(() => ({
      glOff: document.body.classList.contains('gl-off'),
      tiles: document.querySelectorAll('#board2d .t2').length,
      canvasHidden: getComputedStyle(document.getElementById('mono-canvas')).display === 'none',
    }));
    ok('B1 gl-off + 2D 棋盘 24 格', st.glOff && st.tiles === 24 && st.canvasHidden, st);
    await p.evaluate(() => { __mono.state.players[1].bot = false; __mono.resolveAt(0, 1); });
    await p.waitForSelector('#buy-modal:not([hidden])', { timeout: 15000 });
    await p.evaluate(() => __mono.buy(true));
    await p.waitForFunction(() => __mono.state.owners[1] === 0, { timeout: 15000 });
    st = await p.evaluate(() => ({ ownerTxt: document.getElementById('board2d').textContent.includes('测试员'), cash: __mono.state.players[0].cash }));
    ok('B2 2D 买地 + 归属可见', st.ownerTxt && st.cash === 9000, st);
    const resolveB3 = p.evaluate(() => __mono.resolveAt(0, 3)).catch(e => ({ evalErr: String(e).slice(0, 120) }));   // 不 await：等点击才返回
    await p.waitForSelector('#gen-modal:not([hidden])', { timeout: 20000 });
    ok('B3 2D 抽卡走 DOM 弹层', true);
    await p.click('#gen-actions button');
    await resolveB3;
    await p.waitForFunction(() => document.getElementById('gen-modal').hidden === true, { timeout: 10000 });
    ok('B3 DOM 卡确认可关', true);
    ok('B 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
    // B4：375px 竖屏玩家条 2×2 无溢出
    const ctx375 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p375 = await ctx375.newPage();
    const errs375 = [];
    p375.on('pageerror', e => errs375.push(String(e)));
    await p375.goto(URL, { waitUntil: 'domcontentloaded' });
    await p375.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p375.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', { timeout: 25000 });
    const hud = await p375.evaluate(() => {
      const bar = document.getElementById('players-bar');
      const cols = getComputedStyle(bar).gridTemplateColumns.split(' ').length;
      const chips = [...document.querySelectorAll('.pchip')];
      return { cols, over: chips.some(c => c.scrollWidth > c.clientWidth + 1), chipH: Math.round(chips[0].getBoundingClientRect().height) };
    });
    ok('B4 375px 玩家条 2×2 断档且无横向溢出', hud.cols === 2 && !hud.over && hud.chipH <= 42, hud);
    ok('B4 零 pageerror', errs375.length === 0, errs375.join(';'));
    await ctx375.close();
  }

  // ══ C：蒙特卡洛 20 局（turbo）——经济收敛 / 终局可达（玩家专家 P0-1 验收线） ══
  {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.text().startsWith('[mc]')) console.log('  ' + m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&turbo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', { timeout: 25000 });
    const mc = await p.evaluate(async () => await __mono.mc(20));
    const turns = mc.map(g => g.turns);
    const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
    ok('C1 20 局全部终局（回合上限或破产）', mc.length === 20 && turns.every(t => t <= 20 && t >= 2), { avg: +avg.toFixed(1), min: Math.min(...turns), max: Math.max(...turns) });
    ok('C2 平均局长落在收敛区（≤20 轮上限内）', avg <= 20.5, avg);
    ok('C3 有破产发生（经济真的在抽血）', mc.some(g => g.busts > 0), mc.map(g => g.busts));
    ok('C 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('\n══ probe-monopoly 结果 ══');
  results.forEach(([s, n]) => console.log(`${s === 'PASS' ? '✅' : '❌'} ${n.replace(/\n/g, ' ')}`));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? `\n${fails} FAILED / ${results.length}` : `\nALL ${results.length} PASS ✅`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
