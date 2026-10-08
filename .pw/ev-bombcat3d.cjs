/* ev-bombcat3d.cjs —— 3D 手牌全端化取证/验收探针（端口 8971，2026-09-24）
   手机 375×667 / 窄机 320×568 / 横屏手机 740×360 / 平板 768×1024 / PC 1280×800：
   8 张手牌扇每张屏内、点最右卡抬起完整入画且不压按钮行、点空白收下、点牌库摸牌、
   非我回合点牌库哑弹拦截、竖屏北位名牌可见；REDUCED 抬牌即时落位；观战清扇。
   截图存 .pw/shots/ev-bc3d-*.png。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8971;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'bombcat.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});

const HAND8 = ['taco:0', 'taco:1', 'attack:0', 'nope:0', 'skip:0', 'favor:0', 'stf:0', 'shuffle:0'];

async function twoPlayerGame(ctx, tag) {
  const pA = await ctx.newPage();
  pA.on('pageerror', e => console.log(`  [${tag} pageerror]`, e.message.slice(0, 120)));
  await pA.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
  await pA.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pA.click('details.adv summary');
  await pA.click('#chk-local');
  await pA.fill('#in-name', '甲');
  await pA.click('#btn-join');
  await pA.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  const room = (await pA.textContent('#share-room')).trim();
  const pB = await ctx.newPage();
  await pB.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
  await pB.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
  await pB.click('details.adv summary');
  await pB.click('#chk-local');
  await pB.fill('#in-name', '乙');
  await pB.click('#btn-join');
  await pB.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  await pA.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
  await pA.click('#btn-start');
  await pA.waitForSelector('#screen-game.active', { timeout: 15000 });
  await pA.evaluate(() => __cat.setTiming({ turn: 120000 }));
  await pA.waitForFunction(() => __cat.hand.length >= 1, null, { timeout: 10000 });
  return { pA, pB, room };
}

async function forceTurn(p) {
  await p.evaluate(() => {
    const a = __cat.myId;
    __cat.engine.G.turn.pid = a;
    __cat.engine.G.turn.acted = Date.now();
    __cat.hostOnAct({ from: a, mid: 'fa' + Math.random(), a: { t: 'hello' } });
    __cat.hostPublish('probe-force-turn');   // hello 走 r.priv 分支不发布:不补发布=S 停在旧回合渲染,btn-draw 态陈旧
  });
  await p.waitForFunction(() => __cat.S.turn && __cat.S.turn.pid === __cat.myId, null, { timeout: 8000 });
  await p.waitForFunction(() => {
    const b = document.querySelector('#btn-draw');
    return b && !b.disabled && b.style.display !== 'none';
  }, null, { timeout: 8000 });
  await p.waitForTimeout(250);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  for (const [tag, vp, portrait] of [
    ['phone', { width: 375, height: 667 }, true],
    ['narrow', { width: 320, height: 568 }, true],
    ['land', { width: 740, height: 360 }, false],
    ['tablet', { width: 768, height: 1024 }, true],
    ['pc', { width: 1280, height: 800 }, false],
  ]) {
    console.log(`— ${tag} ${vp.width}×${vp.height} —`);
    const ctx = await browser.newContext({ viewport: vp });
    const { pA } = await twoPlayerGame(ctx, tag);
    const is3d = await pA.evaluate(() => document.body.classList.contains('three3d'));
    ok(is3d, 'GL 局 body.three3d');
    const domHidden = await pA.evaluate(() => {
      const h = document.querySelector('#bc-hand'), pk = document.querySelector('#bc-peek');
      return getComputedStyle(h).display === 'none' && getComputedStyle(pk).display === 'none';
    });
    ok(domHidden, 'DOM 手牌 + 放大窗退役（display:none）');
    await forceTurn(pA);
    await pA.evaluate(cards => __cat.debugSetHand(cards), HAND8);
    await pA.waitForFunction(() => window.__cat.hand3d && window.__cat.hand3d().length === 8, null, { timeout: 8000 });
    await pA.evaluate(() => window.__cat.forceRender());
    await pA.waitForTimeout(250);
    // 1) 8 张全在屏内
    const centers = await pA.evaluate(() => window.__cat.hand3d().map(h => ({ i: h.i, pos: window.__cat.handScreenPos(h.i) })));
    const inView = centers.every(c => c.pos && c.pos.x >= 4 && c.pos.x <= vp.width - 4 && c.pos.y >= 4 && c.pos.y <= vp.height - 4);
    ok(inView, '8 张扇形屏中心全部入画（' + centers.map(c => c.pos.x + ',' + c.pos.y).join(' | ') + '）');
    // 2) 点最右卡（显示序按 x 最大）→ 抬起完整入画 + 不压按钮行
    const rightmost = await pA.evaluate(() => {
      const hs = window.__cat.hand3d().map(h => ({ i: h.i, x: h.x }));
      hs.sort((a, b) => b.x - a.x);
      return hs[0].i;
    });
    const rp = await pA.evaluate(i => window.__cat.handScreenPos(i), rightmost);
    await pA.mouse.click(rp.x, rp.y);
    await pA.waitForFunction(() => window.__cat.hand3d().some(h => h.sel), null, { timeout: 5000 });
    await pA.waitForTimeout(300);   // 抬起动画 190ms 落定
    await pA.evaluate(() => window.__cat.forceRender());
    const box = await pA.evaluate(i => window.__cat.handScreenBox(i), rightmost);
    const fits = box && box.x0 >= 0 && box.y0 >= 0 && box.x1 <= vp.width && box.y1 <= vp.height;
    ok(fits, `抬起卡完整入画 box=${JSON.stringify(box)}`);
    ok(box && box.y0 >= 40, `抬起卡顶不钻 HUD 带（卡顶 ${box.y0} ≥ 40,#bc-top/速览条/名牌让位）`);
    if (portrait) {   // 竖屏必修1(视觉终审):抬起卡底不得压扇形带——自动居中进「HUD 底↔扇形顶」净空带
      const fanTop = await pA.evaluate(() => Math.min(...window.__cat.hand3d().filter(h => !h.sel).map(h => { const b = window.__cat.handScreenBox(h.i); return b ? b.y0 : 1e9; })));
      ok(box && box.y1 <= fanTop + 2, `竖屏抬起卡底不压扇形带（卡底 ${box.y1} ≤ 扇顶 ${fanTop}+2，2px=角标包围盒余量）`);
    }
    const actRect = await pA.evaluate(() => {
      const r = document.querySelector('#bc-actions').getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right };
    });
    const noCover = box && (box.y1 <= actRect.top + 4 || box.x1 < actRect.left || box.x0 > actRect.right);
    ok(noCover, `抬起卡不压按钮行（卡底 ${box.y1} vs 按钮顶 ${Math.round(actRect.top)}）`);
    if (!portrait) {   // 宽屏单选外挂位:抬到扇端外侧空毡,整条扇形保持可见(视觉终审 P0:看一张牌不许丢整手牌)
      const outer = await pA.evaluate(() => {
        const hs = window.__cat.hand3d();
        const sel = hs.find(h => h.sel), rest = hs.filter(h => !h.sel).map(h => h.x);
        return { selX: sel && sel.x, fanMax: rest.length ? Math.max(...rest) : 0 };
      });
      ok(outer.selX != null && outer.selX > outer.fanMax, `单选外挂位在扇端外侧（sel x=${outer.selX && outer.selX.toFixed(2)} > 扇右缘 ${outer.fanMax.toFixed(2)}）`);
    }
    ok(true, `抬起倍数=${(await pA.evaluate(() => window.__cat.hand3d().find(h => h.sel))).s.toFixed(2)}`);
    const logPE = await pA.evaluate(() => getComputedStyle(document.querySelector('#bc-log')).pointerEvents);
    ok(logPE === 'none', '日志面板点击穿透（pointer-events:none，不挡牌堆摸牌热区）');
    await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', `ev-bc3d-${tag}-sel.png`) });
    // 3) 点空白收下
    await pA.mouse.click(40, 40);
    await pA.waitForFunction(() => !window.__cat.hand3d().some(h => h.sel), null, { timeout: 5000 });
    await pA.waitForTimeout(280);   // 回落动画 190ms:抬起卡从牌库屏幕区(640,330)扫过,立刻扫牌库命中点会撞在飞卡
    ok(true, '点空白处 → 选中全部收下');
    // 4) 点牌库摸牌（我回合：抽牌结束回合）。牌库可见点扫描：扇形卡顶边可能盖住牌库屏幕中心，真人点的是露出部分
    const handBefore = await pA.evaluate(() => __cat.hand.length);
    const dp = await pA.evaluate(() => {
      const d = window.__cat.deckScreenPos();
      const cands = [[0, 0], [0, -14], [0, -26], [0, -38], [-18, -20], [18, -20], [-18, -34], [18, -34], [0, -50], [-30, -30], [30, -30], [-34, 0], [34, 0]];
      for (const [dx, dy] of cands) {
        const px = d.x + dx, py = d.y + dy;
        const got = window.__cat.pick(px, py);
        if (!got || got.kind !== 'deck') continue;
        const el = document.elementFromPoint(px, py);   // 落点还得真可点:被排除面(button/ovl/tipfirst...)盖住时点击会被吞
        if (el && el.closest && el.closest('button, .ovl, #bc-actions, #bc-nope, #react-dock, #bc-tipfirst, a, input, select, textarea, label, summary')) continue;
        return { x: px, y: py };
      }
      return null;
    });
    if (!dp) { ok(false, '点牌库摸牌：牌库屏幕中心及外沿 13 采样点全部被手牌遮挡'); await ctx.close(); continue; }
    await pA.mouse.click(dp.x, dp.y);
    await pA.waitForFunction(n => __cat.hand.length === n + 1, handBefore, { timeout: 6000 });
    ok(true, `点牌库摸牌（${handBefore}→${handBefore + 1}，抽牌即结束回合；命中点 ${dp.x},${dp.y}）`);
    await ctx.close();
  }

  console.log('— 非我回合点牌库（哑弹拦截）—');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { pA } = await twoPlayerGame(ctx, 'guard');
    await forceTurn(pA);
    await pA.evaluate(cards => __cat.debugSetHand(cards), HAND8);
    await pA.waitForFunction(() => window.__cat.hand3d().length === 8, null, { timeout: 8000 });
    // 强转回合给乙（A 非行动方）——补 hostPublish（hello 走 r.priv 分支不发布，S 会停在旧回合渲染）
    await pA.evaluate(() => {
      const b = __cat.S.players.find(x => x.id !== __cat.myId).id;
      __cat.engine.G.turn.pid = b;
      __cat.engine.G.turn.acted = Date.now();
      __cat.hostOnAct({ from: b, mid: 'fb' + Math.random(), a: { t: 'hello' } });
      __cat.hostPublish('probe-force-turn-b');
    });
    await pA.waitForFunction(() => __cat.S.turn && __cat.S.turn.pid !== __cat.myId, null, { timeout: 8000 });
    await pA.waitForTimeout(300);
    const drawHidden = await pA.evaluate(() => document.querySelector('#btn-draw').style.display === 'none');
    const n0 = await pA.evaluate(() => __cat.S.deckN);
    const h0 = await pA.evaluate(() => __cat.hand.length);
    const dp2 = await pA.evaluate(() => {
      const d = window.__cat.deckScreenPos();
      const cands = [[0, 0], [0, -14], [0, -26], [0, -38], [-18, -20], [18, -20], [-18, -34], [18, -34], [0, -50]];
      for (const [dx, dy] of cands) {
        const got = window.__cat.pick(d.x + dx, d.y + dy);
        if (got && got.kind === 'deck') return { x: d.x + dx, y: d.y + dy };
      }
      return null;
    });
    if (!dp2) { ok(false, '非我回合点牌库：找不到牌库可见点'); await pA.mouse.click(40, 40); }
    else await pA.mouse.click(dp2.x, dp2.y);
    await pA.waitForTimeout(700);
    const n1 = await pA.evaluate(() => __cat.S.deckN);
    const h1 = await pA.evaluate(() => __cat.hand.length);
    const toasts = await pA.evaluate(() => [...document.querySelectorAll('.toast-in')].map(t => t.textContent).join('|'));
    ok(drawHidden && n0 === n1 && h0 === h1, `非我回合点牌库零副作用（deckN ${n0}=${n1}，hand ${h0}=${h1}，抽牌键 display:none=${drawHidden}，toast=「${toasts}」）`);
    await ctx.close();
  }

  console.log('— REDUCED：抬起即时落位 —');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const { pA } = await twoPlayerGame(ctx, 'reduced');
    await forceTurn(pA);
    await pA.evaluate(cards => __cat.debugSetHand(cards), HAND8);
    await pA.waitForFunction(() => window.__cat.hand3d().length === 8, null, { timeout: 8000 });
    const rp = await pA.evaluate(i => window.__cat.handScreenPos(i), 0);
    await pA.mouse.click(rp.x, rp.y);
    await pA.waitForFunction(() => window.__cat.hand3d().some(h => h.sel), null, { timeout: 5000 });
    await pA.waitForTimeout(30);   // 不等动画窗（REDUCED 应即时落位）
    const y = await pA.evaluate(() => window.__cat.hand3d().find(h => h.sel).y);
    ok(y > 1.6, `REDUCED 抬起即时落位（点击后 30ms y=${y.toFixed(3)}）`);
    await ctx.close();
  }

  console.log('— 观战清扇 + 竖屏名牌 —');
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const { pA, pB, room } = await twoPlayerGame(ctx, 'spect');
    await forceTurn(pA);
    await pA.evaluate(cards => __cat.debugSetHand(cards), HAND8);
    await pA.waitForFunction(() => window.__cat.hand3d().length === 8, null, { timeout: 8000 });
    const pC = await ctx.newPage();
    await pC.goto(`http://127.0.0.1:${PORT}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
    await pC.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
    await pC.click('details.adv summary');
    await pC.click('#chk-local');   // 房间是本地链路建的,观战端不勾本地=join 到公网平行房间永远看不到对局
    await pC.fill('#in-name', '丙');
    await pC.click('#btn-join');
    await pC.waitForSelector('#screen-game.active', { timeout: 15000 });
    await pC.waitForTimeout(600);
    const ghost = await pC.evaluate(() => (window.__cat.hand3d() || []).length);
    ok(ghost === 0, `观战端零鬼牌（hand3d.length=${ghost}）`);
    // 竖屏：A 端北位（乙）名牌可见（数字实体化轮 B1：.nplate DOM 投影退役为 GL 3D 铭牌，断言改读 __cat.plates()）
    await pA.evaluate(() => window.__cat.forceRender());
    const plate = await pA.evaluate(() => {
      const plates = (window.__cat.plates && window.__cat.plates()) || [];
      const vis = plates.filter(r => r.visible);
      return { total: plates.length, visible: vis.length, sample: vis[0] ? vis[0].sig : '' };
    });
    ok(plate.visible >= 1, `竖屏 3D 铭牌可见（${plate.visible}/${plate.total}，sig「${plate.sample}」）`);
    await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-bc3d-phone-portrait.png') });
    void pB;
    await ctx.close();
  }

  console.log('— PC 多选组合散开取证 —');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { pA } = await twoPlayerGame(ctx, 'combo');
    await forceTurn(pA);
    await pA.evaluate(cards => __cat.debugSetHand(cards), ['taco:0', 'taco:1', 'taco:2', 'attack:0', 'nope:0']);
    await pA.waitForFunction(() => window.__cat.hand3d().length === 5, null, { timeout: 8000 });
    const tacoIdx = await pA.evaluate(() => window.__cat.hand3d().map(h => ({ i: h.i, kind: h.kind })).filter(h => h.kind === 'taco').map(h => h.i));
    for (const i of tacoIdx) {
      const rp = await pA.evaluate(ix => window.__cat.handScreenPos(ix), i);
      await pA.mouse.click(rp.x, rp.y);
      await pA.waitForTimeout(280);
    }
    const selInfo = await pA.evaluate(() => window.__cat.hand3d().filter(h => h.sel).map(h => ({ i: h.i, x: h.x, y: +h.y.toFixed(2) })));
    ok(selInfo.length === 3, '3 张同名全部选中');
    const xs = selInfo.map(h => h.x);
    const distinct = new Set(xs.map(x => x.toFixed(1))).size === xs.length;
    ok(distinct, `多选横向散开错层（x = ${xs.join(', ')}）`);
    await pA.evaluate(() => window.__cat.forceRender());
    await pA.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-bc3d-combo.png') });
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`═══ ev-bombcat3d：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
