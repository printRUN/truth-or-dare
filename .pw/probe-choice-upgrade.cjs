// 探针：2026-09-18 选卡可读性/互动光效 + 题卡落点=回合玩家面前（8921 端口）
// 断言：①choosing 期三枚浮动 Sprite 淡入（双卡词牌 + 「轮到你了/等待某人」状态条）+ 卡下光池（轮到我呼吸/旁观静态）
//       ②提示层与 DOM 回合文案两两不相交（桌面 900×900 + 竖屏 390×844 两档）
//       ③翻面后卡世界坐标 ≈ chooser 座位方向·R（我=南 1.02 / 对座=北 −1.02，旁观端同判）
//       ④飞卡起点世界坐标 ≈ DECK_POS（旁观端 φ≠0 的 deckL 旋向回归锁）
//       ⑤placeDebug 避障：牌堆邻座方向落点不撞牌堆/双卡且仍在「面前」锥内；竖屏 R 收 0.92
//       ⑥🥚 瞄准态把近景拉远、收瞄准滑回（近景随卡后「任何阶段可扔」的保命路径）
// 用法: node probe-choice-upgrade.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8921;
const log = (...a) => console.log('[choice-up]', ...a);
const errors = [];
let fails = 0;
function ok(cond, name, detail) {
  if (cond) log('  ✅', name, detail ? JSON.stringify(detail) : '');
  else { fails++; log('  ❌', name, detail ? JSON.stringify(detail) : ''); }
}
const near = (v, t, tol) => Math.abs(v - t) <= tol;

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const mk = async (nm, av) => {
    const q = await ctx.newPage();
    q.on('pageerror', e => errors.push(nm + ' pageerror: ' + e.message));
    q.on('console', m => { if (m.type() === 'error') errors.push(nm + ' console: ' + m.text()); });
    await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
    await q.fill('#input-name', nm);
    await q.click('details.adv summary');
    await q.click('#chk-local');
    await q.click(`.avatar-option >> nth=0`);
    return q;
  };
  const A = await mk('阿泽', 0);
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await mk('小雨', 1);
  await B.fill('#input-room', room);
  await B.click('#btn-join');
  await A.waitForFunction(() => S.players.length >= 2, null, { timeout: 15000 });
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 8000 });
  await A.waitForTimeout(1200);
  const seatOf = (pg, pid) => pg.evaluate(id => {
    const ch = window.__three.chars.get(id);
    return { x: ch.userData.seat.x, z: ch.userData.seat.z };
  }, pid);

  for (let round = 1; round <= 2; round++) {
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 20000 });
    const chooserId = await A.evaluate(() => S.turn.chooserId || activePlayerId());
    const chooser = (await A.evaluate(() => myId)) === chooserId ? A : B;
    const spec = chooser === A ? B : A;
    const cid = await chooser.evaluate(() => myId);
    log(`── round ${round}: chooser=${round === 1 ? '?' : ''}${chooser === A ? '阿泽(south)' : '小雨(north)'}`);

    // ① 浮动提示淡入 + 光池（先采旁观端：「等待」提示 4s 起淡出——到达即并行拍快照，窗口内 hint 必须 >0.3；迟到仅当 hintAge>3.5 时豁免，kind+waitGone 仍锁住存在性与淡出）
    const [tipS, snapS] = await Promise.all([
      spec.waitForFunction(() => {
        const fx = window.__three.fxState().choiceFx;
        return fx.labelT > 0.8 && fx.labelD > 0.8;
      }, null, { timeout: 4000 }).then(() => true).catch(() => false),
      spec.evaluate(() => window.__three.fxState().choiceFx).catch(() => null),
    ]);
    ok(!!snapS && tipS && snapS.hintKind === 'wait' && (snapS.hint > 0.3 || snapS.hintAge > 3.5), 'spectator: labels+wait-hint present (kind=wait)', snapS);
    const waitGone = await spec.waitForFunction(() => window.__three.fxState().choiceFx.hint < 0.1, null, { timeout: 9000 }).then(() => true).catch(() => false);
    ok(waitGone, 'spectator wait-hint fades out after ~4s');
    const tipC = await chooser.waitForFunction(() => {
      const fx = window.__three.fxState().choiceFx;
      return fx.labelT > 0.8 && fx.labelD > 0.8 && fx.hint > 0.8;
    }, null, { timeout: 4000 }).then(() => true).catch(() => false);
    const kindC = await chooser.evaluate(() => window.__three.fxState().choiceFx.hintKind);
    ok(tipC && kindC === 'me', 'chooser: labels+hint fade in, hint kind=me', kindC);
    const br = [];
    for (let i = 0; i < 4; i++) { br.push(await chooser.evaluate(() => window.__three.fxState().choiceFx.poolT)); await chooser.waitForTimeout(120); }
    const amp = Math.max(...br) - Math.min(...br);
    ok(Math.max(...br) > 0.2 && amp > 0.04, 'chooser: pools breathe (invitation pulse @3.4Hz)', br.map(v => +v.toFixed(2)));
    const st = [];
    for (let i = 0; i < 3; i++) { st.push(await spec.evaluate(() => window.__three.fxState().choiceFx.poolT)); await spec.waitForTimeout(120); }
    ok(near(st[0], 0.10, 0.05) && (Math.max(...st) - Math.min(...st)) < 0.02, 'spectator: pools static 0.10 (no breathing = no clickable hint)', st.map(v => +v.toFixed(2)));

    // ② 提示层与 DOM 回合文案两两不相交（桌面档；hit 兼容 Sprite 的 w/h 与 DOM 的 width/height——字段混用会恒假，逻辑检查官 F2 同类教训）
    const bx = await chooser.evaluate(() => {
      const rects = window.__three.choiceTipRects();
      const ti = document.getElementById('turn-info') ? document.getElementById('turn-info').getBoundingClientRect() : null;
      const hit = (a, b) => {
        if (!a || !b) return false;
        const bw = b.w !== undefined ? b.w : b.width, bh = b.h !== undefined ? b.h : b.height;
        return a.x < b.x + bw && b.x < a.x + a.w && a.y < b.y + bh && b.y < a.y + a.h;
      };
      const tib = ti ? { x: ti.left, y: ti.top, w: ti.width, h: ti.height } : null;
      return { hint: rects.hint, truth: rects.truth, dare: rects.dare, turn: tib,
        h_t: hit(rects.hint, tib), h_l: hit(rects.hint, rects.truth) || hit(rects.hint, rects.dare), l_l: hit(rects.truth, rects.dare) };
    });
    ok(bx.hint && bx.truth && bx.dare && !bx.h_t && !bx.h_l && !bx.l_l, 'desktop: tip sprites pairwise clear of turn-info & each other', { h_t: bx.h_t, h_l: bx.h_l, l_l: bx.l_l });
    if (round === 1) await chooser.screenshot({ path: 'shots/cu-choosing.png' });

    // ③ 飞卡起点=牌堆（世界系， chooser 与旁观端同判）；选卡
    await chooser.evaluate(() => choose('dare'));
    const deckFly = await spec.waitForFunction(() => {
      const fx = window.__three.fxState();
      return fx.cardPhase === 'waitfly' || fx.cardPhase === 'fly';
    }, null, { timeout: 4000 }).then(() => spec.evaluate(() => window.__three.fxState().cardWorld)).catch(() => null);
    ok(!!deckFly && near(deckFly.x, 1.12, 0.35) && near(deckFly.z, 0.60, 0.35), 'spectator: card waits at deck in WORLD coords (deckL yaw math; ±洗牌横移包络)', deckFly);
    await chooser.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
    await chooser.waitForFunction(() => window.__three.fxState().cardPhase === 'shown', null, { timeout: 15000 });
    await chooser.waitForTimeout(500);

    // ④ 落点 = chooser 座位方向 · R（逐端判：座次是每端自我中心的——旁观端上「抽卡者面前」= 该端眼中 chooser 的座位方向）
    for (const [tag, pg] of [['chooser', chooser], ['spectator', spec]]) {
      const seat = await seatOf(pg, cid);
      const sl = Math.hypot(seat.x, seat.z) || 1;
      const R = 1.02;
      const exp = { x: seat.x / sl * R, z: seat.z / sl * R };
      const pl = await pg.evaluate(() => window.__three.fxState().place);
      ok(near(pl.cx, exp.x, 0.06) && near(pl.cz, exp.z, 0.06), `${tag}: card rests in front of chooser (place ≈ seatDir·R)`, { place: pl, expect: { x: +exp.x.toFixed(2), z: +exp.z.toFixed(2) } });
      const cw = await pg.evaluate(() => window.__three.fxState().cardWorld);
      ok(near(cw.x, exp.x, 0.10) && near(cw.z, exp.z, 0.10), `${tag}: cardWorld at rest matches`, cw);
    }
    // 与牌堆/双卡真实间距
    const clr = await chooser.evaluate(() => {
      const p = window.__three.fxState().place;
      const d2 = (x, z, o) => Math.hypot(x - o.x, z - o.z);
      return { deck: +d2(p.cx, p.cz, { x: 1.12, z: 0.60 }).toFixed(2), choice: +Math.min(d2(p.cx, p.cz, { x: -0.78, z: -0.12 }), d2(p.cx, p.cz, { x: 0.78, z: -0.12 })).toFixed(2) };
    });
    ok(clr.deck > 0.62 && clr.choice > 0.55, 'clearance vs deck & choice cards', clr);
    await chooser.screenshot({ path: round === 1 ? 'shots/cu-revealed-me.png' : 'shots/cu-revealed-opp.png' });
    if (round === 2) await spec.screenshot({ path: 'shots/cu-revealed-opp-spec.png' });   // 旁观端视角：牌在「本端眼中对手」一侧（座次自我中心，与 chooser 端镜像）

    // ⑤ 🥚 瞄准拉远/收瞄准回近景（round 2 做一次就够）
    if (round === 2) {
      await spec.click('#btn-egg');
      const zoomOut = await spec.waitForFunction(() => window.__three.fxState().revealK < 0.1, null, { timeout: 4000 }).then(() => true).catch(() => false);
      ok(zoomOut, 'egg-aim zooms the card close-up back out (targets clickable any stage)');
      await spec.evaluate(() => setEggAim(false));
      const zoomIn = await spec.waitForFunction(() => window.__three.fxState().revealK > 0.9, null, { timeout: 4000 }).then(() => true).catch(() => false);
      ok(zoomIn, 'disarm glides the close-up back in');
      // 完成本回合进下一轮
      await chooser.evaluate(() => { try { document.getElementById('btn-accept').click(); } catch (e) {} });
      await chooser.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    } else {
      await chooser.evaluate(() => { try { document.getElementById('btn-accept').click(); } catch (e) {} });
      await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 });
    }
  }

  // ⑥ 竖屏档（390×844）：第三人加入 → 提示层挂卡组下方空带、与 turn-info 不相交；placeDebug R=0.92
  // ⚠ 必须同 context 新页面（本地模式 BroadcastChannel 不跨 context），viewport 用 per-page setViewportSize
  const P = await ctx.newPage();
  P.on('pageerror', e => errors.push('P pageerror: ' + e.message));
  await P.setViewportSize({ width: 390, height: 844 });
  await P.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await P.fill('#input-name', '阿凯');
  await P.click('details.adv summary');
  await P.click('#chk-local');
  await P.click('.avatar-option >> nth=0');
  await P.fill('#input-room', room);
  await P.click('#btn-join');
  await A.waitForFunction(() => S.players.length >= 3, null, { timeout: 15000 });
  await P.waitForSelector('#screen-game.active', { timeout: 20000 });
  await P.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 8000 });
  await P.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 25000 });
  const pTip = await P.waitForFunction(() => {
    const fx = window.__three.fxState().choiceFx;
    return fx.labelT > 0.6;
  }, null, { timeout: 6000 }).then(() => P.evaluate(() => {
    const rects = window.__three.choiceTipRects();
    const ti = document.getElementById('turn-info') ? document.getElementById('turn-info').getBoundingClientRect() : null;
    const hit = (a, b) => {
      if (!a || !b) return false;
      const bw = b.w !== undefined ? b.w : b.width, bh = b.h !== undefined ? b.h : b.height;
      return a.x < b.x + bw && b.x < a.x + a.w && a.y < b.y + bh && b.y < a.y + a.h;
    };
    return { hint: rects.hint, truth: rects.truth, dare: rects.dare,
      h_t: hit(rects.hint, ti ? { x: ti.left, y: ti.top, w: ti.width, h: ti.height } : null),
      h_l: hit(rects.hint, rects.truth) || hit(rects.hint, rects.dare), l_l: hit(rects.truth, rects.dare) };
  })).catch(() => null);
  ok(!!pTip && !pTip.h_t && !pTip.h_l && !pTip.l_l, 'portrait 390×844: tip sprites pairwise clear (hint below cards band)', pTip);
  // 状态条取证要「清晰在场」：P 的旁观 hint 只有 4s 窗口，且切后台会冻结画布（visibilitychange→body.paused，
  // rAF 停、canvas 停在旧帧——上一轮假红根因）——host 把麦指定给 P（me 态持久无时限），bringToFront 恢复渲染再拍
  const pidP = await P.evaluate(() => myId);
  await A.bringToFront();
  await A.evaluate(pid => { try { designate(pid); } catch (e) {} }, pidP);
  await P.bringToFront();
  const hintSolid = await P.waitForFunction(() => {
    const fx = window.__three.fxState().choiceFx;
    return fx.hint > 0.9 && fx.hintKind === 'me';
  }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  ok(hintSolid, 'portrait: host-designated me-hint solid on P (persistent pill)');
  await P.waitForTimeout(700);   // rAF 恢复 + choosing nudge 半拍落定
  await P.screenshot({ path: 'shots/cu-choosing-portrait.png' });   // 视觉验收用：状态条清晰在场
  const pR = await P.evaluate(() => window.__three.placeDebug(0, 1));
  ok(near(pR.cz, 0.92, 0.05), 'portrait: placement radius stepped down to 0.92', pR);

  // ⑦ placeDebug 避障单元：牌堆邻座方向（az≈62°）不撞牌堆/双卡、仍在面前锥内；正南/正北恒等落点；
  //    RYm 旋向用非平凡 φ 做世界回投锁（2p 的 φ∈{0,π} 是退化 case，RY(2φ)=恒等抓不住符号写反——逻辑检查官 F1）
  const avoid = await A.evaluate(() => {
    const az = Math.atan2(1.12, 0.60);   // 牌堆方位角：最近座方向=最坏情况
    const s1 = window.__three.placeDebug(Math.sin(az), Math.cos(az));
    const s2 = window.__three.placeDebug(0, 1);
    const s3 = window.__three.placeDebug(0, -1);
    const dDeck = Math.hypot(s1.cx - 1.12, s1.cz - 0.60);
    const dCh = Math.min(Math.hypot(s1.cx + 0.78, s1.cz + 0.12), Math.hypot(s1.cx - 0.78, s1.cz + 0.12));
    const dir = Math.hypot(s1.cx, s1.cz);
    const dot = (s1.cx / dir) * Math.sin(az) + (s1.cz / dir) * Math.cos(az);   // 与座位方向夹角余弦
    // deckL 世界回投：world = P + RY(φ)·deckL 必须精确复原 DECK_POS（RYm 若符号写反，φ≈1.08rad 时偏差 ~2 单位）
    const wx = s1.px + s1.deckL.x * Math.cos(s1.phi) + s1.deckL.z * Math.sin(s1.phi);
    const wz = s1.pz - s1.deckL.x * Math.sin(s1.phi) + s1.deckL.z * Math.cos(s1.phi);
    return { s1, s2, s3, dDeck: +dDeck.toFixed(2), dCh: +dCh.toFixed(2), dot: +dot.toFixed(2), wx: +wx.toFixed(3), wz: +wz.toFixed(3) };
  });
  ok(avoid.dDeck >= 0.60 && avoid.dCh >= 0.53, 'avoid: deck-adjacent seat keeps clearance', { dDeck: avoid.dDeck, dCh: avoid.dCh });
  ok(avoid.dot > 0.72, 'avoid: still inside the in-front cone (>44° off seat ray)', { dot: avoid.dot, place: avoid.s1 });
  ok(near(avoid.wx, 1.12, 0.02) && near(avoid.wz, 0.60, 0.02), 'RYm yaw math: deckL maps back to DECK_POS at non-trivial φ', { wx: avoid.wx, wz: avoid.wz });
  ok(near(avoid.s2.cz, 1.02, 0.05) && near(avoid.s3.cz, -1.02, 0.05) && near(avoid.s2.cx, 0, 0.01) && near(avoid.s3.cx, 0, 0.01), 'south/north identity placements unchanged', { s2: avoid.s2, s3: avoid.s3 });

  log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
  log(fails === 0 && errors.length === 0 ? 'ALL CHOICE-UPGRADE CHECKS PASSED ✅' : `FAILURES: ${fails}`);
  await browser.close();
  server.close();
  process.exitCode = (fails || errors.length) ? 1 : 0;
})().catch(e => { console.error('[choice-up] fatal', e); process.exit(1); });
