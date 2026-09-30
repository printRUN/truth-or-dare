/* ev-handontable.cjs —— 「手牌贴桌+抬牌确认」轮取证/验收探针（端口 8945）
   玩家投诉：①卡片飘在桌面上空、盖到对手头上；②点一张要抬起来看全牌面，确认才打出。
   本探针改造前后各跑一遍：
   - bombcat 三人局：量 #bc-hand 视口位置（贴底=合格）、名牌与手牌重叠、选中卡 translateY 抬升量、截图。
   - uno 真机档：截图南位手牌；改造后断言「点牌=抬起预览、确认按钮才打出」。
   截图存 .pw/shots/hot-*.png。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8945;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const before = !process.argv.includes('--after');
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log((before ? '  · [改前记录] ' : '  ✗ ') + label); } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'bombcat.html' : p);
  try {
    const data = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  /* ══ 1. bombcat：竖屏 700×900 三人局 ══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 900 } });
    const join = async (page, name, room) => {
      await page.goto(BASE + '/bombcat.html' + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
      await page.click('details.adv summary');
      await page.click('#chk-local');
      await page.fill('#in-name', name);
      await page.click('#btn-join');
      await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    };
    const pA = await ctx.newPage(); const pB = await ctx.newPage(); const pC = await ctx.newPage();
    await join(pA, '猫大', '');
    const room = (await pA.textContent('#share-room')).trim();
    await join(pB, '猫二', room);
    await join(pC, '猫三', room);
    await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 15000 });
    await pA.click('#btn-start');
    for (const p of [pA, pB, pC]) await p.waitForSelector('#screen-game.active', { timeout: 15000 });
    await pA.evaluate(() => __cat.setTiming({ turn: 120000, afk: 60000, nopeMs: 8000, nopeStep: 800, favor: 6000, defuse: 8000, pick: 6000, quick: 200 }));
    const ids = await Promise.all([pA, pB, pC].map(p => p.evaluate(() => __cat.myId)));
    await pA.evaluate(([a, b, c]) => {
      const e = __cat.engine;
      e._H.hands[a] = ['defuse:8', 'attack:0', 'skip:0', 'taco:0', 'taco:1'];
      e._H.hands[b] = ['defuse:9', 'favor:0', 'melon:0', 'melon:1'];
      e._H.hands[c] = ['defuse:10', 'shuffle:0', 'beard:0', 'beard:1'];
      e._H.deck = e._H.deck.filter(x => CAT.kindOf(x) !== 'ek');
      for (const pid of [a, b, c]) __cat.hostOnAct({ from: pid, mid: 'i' + Math.random(), a: { t: 'hello' } });
    }, ids).catch(() => {});
    await pA.waitForTimeout(2500);
    await pB.bringToFront();
    await pB.waitForTimeout(800);

    /* 3D 手牌全端化:DOM 手牌/放大窗在 GL 局退役,断言迁到 3D 卡(handScreenPos/Box,_sel) */
    const m = await pB.evaluate(() => {
      const handEl = document.querySelector('#bc-hand');
      const domHidden = getComputedStyle(handEl).display === 'none';
      const acts = document.querySelector('#bc-actions').getBoundingClientRect();
      const n = __cat.hand.length;
      const boxes = [];
      for (let i = 0; i < n; i++) boxes.push(__cat.handScreenBox(i));
      const okBox = boxes.filter(Boolean);
      return {
        vh: innerHeight, three3d: document.body.classList.contains('three3d'), domHidden, n,
        boxes: okBox,
        lowest: okBox.length ? Math.max(...okBox.map(b => b.y1)) : 0,
        actsTop: Math.round(acts.top),
        posOk: okBox.length === n && okBox.every(b => b.y0 >= 0 && b.x0 >= 0 && b.x1 <= innerWidth + 1 && b.y1 <= innerHeight + 1),
      };
    });
    console.log('  bombcat 量测:', JSON.stringify({ ...m, boxes: m.boxes.length }));
    ok(m.three3d, 'GL 牌桌激活');
    ok(m.domHidden, 'DOM 手牌退役（3D 手牌全端化,body.three3d 下 #bc-hand 隐藏）');
    ok(m.posOk && m.n >= 4, `3D 手牌 ${m.n} 张全部在视口内`);
    ok(m.lowest <= m.actsTop + 2, `手牌不压按钮排（牌底 ${Math.round(m.lowest)} ≤ 按钮顶 ${m.actsTop}）`);
    const boxBefore = await pB.evaluate(() => __cat.handScreenBox(1));
    const clickPos = await pB.evaluate(() => __cat.handScreenPos(1));
    await pB.mouse.click(Math.round(clickPos.x), Math.round(clickPos.y));
    await pB.waitForTimeout(500);
    const sel = await pB.evaluate(() => {
      const b = __cat.handScreenBox(1);
      return { selN: __cat._sel.size, raised: b ? b.y0 : null, inView: b ? (b.y0 >= 0 && b.x0 >= 0 && b.x1 <= innerWidth + 1 && b.y1 <= innerHeight + 1) : false };
    });
    console.log('  bombcat 选中态:', JSON.stringify({ ...sel, before: boxBefore ? Math.round(boxBefore.top) : null }));
    ok(sel.selN === 1, '点牌选中（_sel=1）');
    ok(sel.raised !== null && boxBefore && sel.raised <= boxBefore.y0 - 20, `选中卡向上抬升（top ${boxBefore ? boxBefore.y0 : '?'}→${sel.raised !== null ? sel.raised : '?'}px）`);
    ok(sel.inView, '选中卡完整可见（在视口内）');
    await pB.screenshot({ path: path.join(ROOT, '.pw', 'shots', before ? 'hot-bc-before.png' : 'hot-bc-after.png') });
    if (!before) {
      /* 点牌查看:选中即出放大窗(整卡名称+描述);点空白处=选中全部收下 */
      const peek1 = await pB.evaluate(() => { const pk = document.getElementById('bc-peek'); return pk ? getComputedStyle(pk).display : 'none'; });
      ok(peek1 === 'none', 'GL 局放大查看窗退役（3D 抬起即看全脸,body.three3d 下 #bc-peek 隐藏）');
      await pB.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'hot-bc-peek.png') });
      const pos2 = await pB.evaluate(() => { for (let i = 0; i < __cat.hand.length; i++) { if (!__cat._sel.has(i)) { const q = __cat.handScreenPos(i); if (q) return q; } } return null; });
      if (pos2) await pB.mouse.click(Math.round(pos2.x), Math.round(pos2.y));
      await pB.waitForTimeout(400);
      const twoSel = await pB.evaluate(() => __cat._sel.size);
      ok(twoSel === 2, '第二张加入多选（组合仍可选）');
      const blank = await pB.evaluate(() => {   // 找真空白:从左上角向右下扫,跳过一切可交互/排除元素
        for (let y = 40; y < 300; y += 40) for (let x = 30; x < 650; x += 60) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const bad = el.closest('button,.hcard,#bc-hand,#bc-actions,.ovl,#bc-nope,#react-dock,a,input,.nplate,#bc-log');
          if (!bad) return { x, y };
        }
        return { x: 30, y: 40 };
      });
      await pB.mouse.click(blank.x, blank.y);   // 真空白处
      await pB.waitForTimeout(350);
      const afterClear = await pB.evaluate(() => ({
        selN: __cat._sel.size,
        btnDisabled: document.getElementById('btn-play').disabled,
      }));
      ok(afterClear.selN === 0, '点空白处=选中全部收下（卡片回手牌行）');
      ok(afterClear.btnDisabled, '收下后「打出选中」回不可用');
    }
    await ctx.close();

    /* 矮屏档（横屏手机 700×390）：贴底 UI 不得吃掉大半屏 */
    {
      const ctxL = await browser.newContext({ viewport: { width: 700, height: 390 } });
      const pL = await ctxL.newPage();
      const joinL = async (page, name, room) => {
        await page.goto(BASE + '/bombcat.html' + (room ? '?room=' + room : ''), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
        await page.click('details.adv summary');
        await page.click('#chk-local');
        await page.fill('#in-name', name);
        await page.click('#btn-join');
        await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
      };
      const qA = await ctxL.newPage(); const qB = await ctxL.newPage();
      await joinL(qA, '矮大', '');
      const roomL = (await qA.textContent('#share-room')).trim();
      await joinL(qB, '矮二', roomL);
      await qA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
      await qA.click('#btn-start');
      for (const q of [qA, qB]) await q.waitForSelector('#screen-game.active', { timeout: 15000 });
      await qA.evaluate(() => __cat.setTiming({ turn: 120000, afk: 60000 }));
      const idsL = await Promise.all([qA, qB].map(q => q.evaluate(() => __cat.myId)));
      await qA.evaluate(([a, b]) => {
        const e = __cat.engine;
        e._H.hands[a] = ['defuse:8', 'attack:0', 'skip:0'];
        e._H.hands[b] = ['defuse:9', 'taco:0', 'taco:1', 'melon:0'];
        e._H.deck = e._H.deck.filter(x => CAT.kindOf(x) !== 'ek');
        for (const pid of [a, b]) __cat.hostOnAct({ from: pid, mid: 'l' + Math.random(), a: { t: 'hello' } });
      }, idsL).catch(() => {});
      await qB.bringToFront();
      await qB.waitForTimeout(2200);
      const mL = await qB.evaluate(() => {
        const acts = document.querySelector('#bc-actions').getBoundingClientRect();
        const n = __cat.hand.length;
        const boxes = [];
        for (let i = 0; i < n; i++) boxes.push(__cat.handScreenBox(i));
        const okBox = boxes.filter(Boolean);
        const handTop = okBox.length ? Math.min(...okBox.map(b => b.y0)) : null;
        return { vh: innerHeight, domHidden: getComputedStyle(document.querySelector('#bc-hand')).display === 'none',
          n, inView: okBox.length === n && okBox.every(b => b.y0 >= 0 && b.y1 <= innerHeight + 1),
          handTopPct: handTop !== null ? Math.round(handTop / innerHeight * 100) : -1, actsTop: Math.round(acts.top),
          lowest: okBox.length ? Math.max(...okBox.map(b => b.y1)) : 0 };
      });
      console.log('  bombcat 矮屏量测:', JSON.stringify(mL));
      if (!before) ok(mL.domHidden && mL.inView && mL.lowest <= mL.actsTop + 2 && mL.handTopPct >= 40, `矮屏：3D 手牌全在视口内且不压按钮排（牌顶 ${mL.handTopPct}%, 牌底 ${Math.round(mL.lowest)} ≤ 按钮顶 ${mL.actsTop}）`);
      else console.log('  · [改前记录] 矮屏 gap=' + mL.gapToBottom);
      await qB.screenshot({ path: path.join(ROOT, '.pw', 'shots', before ? 'hot-bc-short-before.png' : 'hot-bc-short-after.png') });
      await ctxL.close();
    }
  }

  /* ══ 2. uno：真机档（真 GL）南位手牌 ══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.cd = (c, v) => ({ c, v }); });
    await p.goto(BASE + '/uno.html?autotest=1', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__uno && __uno.state.phase === 'AWAIT_ACTION', { timeout: 25000 });
    await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '5'), cd('b', '7'), cd('r', '2'), cd('w', 'W')]); });
    await p.waitForTimeout(1200);
    const u = await p.evaluate(() => {
      const cards = __uno.cards().filter(c => c.owner === 0);
      const bar = document.querySelector('#action-bar');
      return { n: cards.length, barBottom: bar && bar.classList.contains('show') ? Math.round(bar.getBoundingClientRect().top) : -1, cards };
    });
    console.log('  uno 南位卡:', JSON.stringify(u));
    ok(u.n === 4, '南位常驻手牌 4 张');
    await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', before ? 'hot-uno-before.png' : 'hot-uno-after.png') });

    if (!before) {
      /* 改后语义：点桌牌=抬起预览（不打出）→ 确认按钮才打出 */
      const camRest = async () => {   // 镜头回位+轮到你;颜色规则修好后 bot 更合法、局更快结束——OVER 则重开一局再继续
        await p.waitForFunction(() => __uno.camInfo().focusK >= 0.99 && ((__uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0) || __uno.state.phase === 'OVER'), { timeout: 25000 });
        const over = await p.evaluate(() => window.__uno.state.phase === 'OVER');
        if (over) {
          await p.evaluate(() => { const b = document.getElementById('btn-rematch'); if (b) b.click(); });
          await p.waitForFunction(() => __uno.state.phase === 'AWAIT_ACTION' && __uno.state.turn === 0, null, { timeout: 25000 });
          await p.waitForFunction(() => __uno.camInfo().focusK >= 0.99, null, { timeout: 25000 });
        }
      };   // 镜头补间与回合解耦:glanceAside 推近回位约2.6s,没回到全景时投影点击会错位
      await camRest();
      const pos = await p.evaluate(() => __uno.cardScreenPos(0));   // 第一张（红5，可出）
      await p.evaluate(() => Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise(r => setTimeout(r, 300))])).catch(() => {});   // 渲染两帧让 matrixWorld 随新位置更新(产品侧 pickHand 也已强制同步,这里是双保险)
      const cnt0 = await p.evaluate(() => __uno.state.players[0].hand.length);
      await p.mouse.click(Math.round(pos.x), Math.round(pos.y));
      await p.waitForTimeout(500);
      const st = await p.evaluate(() => ({
        cnt: __uno.state.players[0].hand.length,
        sel: __uno.cards().filter(c => c.owner === 0).map(c => !!c.sel),
        ys: __uno.cards().filter(c => c.owner === 0).map(c => c.y),
        btn: (() => { const b = document.getElementById('act-play'); return b ? { shown: b.style.display !== 'none', disabled: b.disabled } : null; })(),
      }));
      console.log('  uno 选中态:', JSON.stringify(st));
      ok(st.cnt === cnt0, '点桌牌不立即打出');
      const si = st.sel.indexOf(true);   // 索引无关断言:cardScreenPos 按 handLess 显示序取点,__uno.cards() 是状态序,两者下标不必对应(代码检查官 P1 实锤)
      ok(si >= 0 && st.sel.filter(Boolean).length === 1 && st.ys[si] > 0.5 && st.ys.filter((y, i) => i !== si && y > 0.5).length === 0, '被点卡抬起（恰一张 y>0.5），邻牌不动');
      ok(st.btn && st.btn.shown && !st.btn.disabled, '「打出这张」确认按钮出现且可用');
      await p.bringToFront();
      await p.waitForTimeout(250);   // 后台页 rAF 节流会让画布停在旧帧(场景数据已变):置前+强制渲一帧再截图
      await p.evaluate(() => __uno.forceRender && __uno.forceRender());
      await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'hot-uno-sel.png') });
      await p.click('#act-play');
      await p.waitForFunction(c => __uno.state.players[0].hand.length === c - 1, cnt0, { timeout: 8000 });
      ok(true, '确认按钮打出成功（手牌 -1）');
      const cleared = await p.evaluate(() => __uno.cards().filter(c => c.owner === 0).every(c => !c.sel));
      ok(cleared, '打出后选中态清空');
      /* 再点同一张=取消选中(等回合回到玩家+镜头回位,给确定牌面) */
      await camRest();
      await p.evaluate(() => { window.cd = window.cd || ((c, v) => ({ c, v })); __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '5'), cd('b', '7'), cd('g', '2')]); });
      await p.waitForTimeout(500);
      const pos2 = await p.evaluate(() => __uno.cardScreenPos(0));
      await p.mouse.click(Math.round(pos2.x), Math.round(pos2.y));
      await p.waitForTimeout(400);
      const st2 = await p.evaluate(() => __uno.cards().filter(c => c.owner === 0).map(c => !!c.sel));
      ok(st2.filter(Boolean).length === 1, '再点第二张切换选中（恰一张在选）');
      const pos2b = await p.evaluate(() => __uno.cardScreenPos(0));   // 卡已抬起:按抬起后的实时投影点再点
      await p.mouse.click(Math.round(pos2b.x), Math.round(pos2b.y));
      await p.waitForTimeout(400);
      const st3 = await p.evaluate(() => __uno.cards().filter(c => c.owner === 0).map(c => !!c.sel));
      ok(st3.every(s => !s), '重复点同张=取消选中');
      /* 点空白处=收下抬起牌（点别的地方卡片就回去） */
      await camRest();
      await p.evaluate(() => { __uno.state.cur = 'r'; __uno.state.discard = [cd('r', '3')]; __uno.forceHand(0, [cd('r', '5'), cd('b', '7'), cd('g', '2')]); });
      await p.waitForTimeout(500);
      const pos3 = await p.evaluate(() => __uno.cardScreenPos(0));
      await p.mouse.click(Math.round(pos3.x), Math.round(pos3.y));
      await p.waitForTimeout(400);
      const st4 = await p.evaluate(() => __uno.cards().filter(c => c.owner === 0).map(c => !!c.sel));
      ok(st4.filter(Boolean).length === 1, '先选中一张（空白收下前置态）');
      await p.mouse.click(200, 120);   // 画布空白区：pickHand 只对手牌 raycast，落空即收
      await p.waitForTimeout(400);
      const st5 = await p.evaluate(() => ({
        sel: __uno.cards().filter(c => c.owner === 0).map(c => !!c.sel),
        btnShown: (() => { const b = document.getElementById('act-play'); return b ? b.style.display !== 'none' : false; })(),
      }));
      ok(st5.sel.every(s => !s), '点空白处=选中收下（牌回扇形原位）');
      ok(!st5.btnShown, '点空白处=「打出这张」按钮隐藏');
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(before ? `\n[改前取证] pass=${pass} (记录项不计失败) fail=${fail}` : `\n[改后验收] pass=${pass} fail=${fail}`);
  if (!before && fail > 0) process.exitCode = 1;
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
