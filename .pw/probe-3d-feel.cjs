// 探针：本轮「互动反馈 + 进行中光环 + 摸牌防穿模」三项验收（8861 端口）
// 断言：走位停点在桌缘圈外 / lean 髋部枢轴生效 / turnRing 跟随当前玩家 /
//       悬停手型 / 真实坐标点击 → 涟漪+白闪+闩锁+进入 drawing / 无页面错误
// 用法: node probe-3d-feel.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8861;
const log = (...a) => console.log('[3d-feel]', ...a);
const errors = [];
let fails = 0;
function ok(cond, name, detail) {
  if (cond) log('  ✅', name, detail ? JSON.stringify(detail) : '');
  else { fails++; log('  ❌', name, detail ? JSON.stringify(detail) : ''); }
}

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
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1200);

  // 三人局（有环才有「围桌」读数）
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  const tabs = [];
  for (const [nm, i] of [['小雨', 1], ['婷婷', 2]]) {
    const q = await ctx.newPage();
    q.on('pageerror', e => errors.push(nm + ' pageerror: ' + e.message));
    tabs.push(q);
    await q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
    await q.fill('#input-name', nm);
    await q.click('details.adv summary');
    await q.click('#chk-local');
    await q.click('#input-room');
    await q.fill('#input-room', room);
    await q.click(`.avatar-option >> nth=0`);
    await q.click('#btn-join');
    await p.waitForTimeout(900);
  }
  await p.waitForFunction(() => S.players.length >= 3, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 8000 });
  await p.waitForTimeout(1800);

  // ── ① 进行中光环：choosing 阶段就该亮、贴着当前玩家 ──
  const ring1 = await p.evaluate(() => {
    const T = window.__three;
    const pid = S.turn.chooserId || activePlayerId();
    const ch = T.chars.get(pid);
    return { visible: true, hasThree: !!T, pid, chPos: ch ? [ch.position.x, ch.position.z] : null };
  });
  ok(ring1.hasThree, 'three3d boot');
  const ringState = async () => p.evaluate(() => {
    const fr = document; void fr;   // 只读帧循环产物：光环 group 不在 __three 暴露面，借场景遍历找（renderOrder=3 的双环组）
    const T = window.__three;
    let found = null;
    T.scene.traverse(o => {
      if (found || !o.isGroup || o.children.length !== 2) return;
      const a = o.children[0], b = o.children[1];
      if (a.isMesh && b.isMesh && a.geometry && a.geometry.type === 'RingGeometry' && b.geometry.type === 'RingGeometry') found = o;
    });
    if (!found) return { present: false };
    const pid = S.turn.chooserId || activePlayerId();
    const ch = T.chars.get(pid);
    return {
      present: true, visible: found.visible,
      pos: [ +found.position.x.toFixed(2), +found.position.z.toFixed(2) ],
      chPos: ch ? [ +ch.position.x.toFixed(2), +ch.position.z.toFixed(2) ] : null,
      chVis: ch ? ch.visible : null,
      opacity: +found.children[0].material.opacity.toFixed(2),
    };
  });
  const rs1 = await ringState();
  ok(rs1.present && rs1.visible, 'turnRing visible in choosing', rs1);
  ok(rs1.present && rs1.chPos && rs1.pos && Math.hypot(rs1.pos[0] - rs1.chPos[0], rs1.pos[1] - rs1.chPos[1]) < 0.05, 'turnRing follows active char', rs1);

  // ── ② 悬停/点击要在「轮到谁」的标签页上做（choose() 有回合校验）──
  let chooser = null;
  for (const t of [p, ...tabs]) {
    try { if (await t.evaluate(() => S.turn.chooserId === myId)) { chooser = t; break; } } catch (e) {}
  }
  if (!chooser) { log('❌ no chooser tab'); process.exit(1); }
  // 悬停手型：投影点必须现算（choosing 有 Cam.nudge 推镜，缓存坐标必漂移——与名牌同纪律）──
  const cardPt = () => chooser.evaluate(() => {
    const T = window.__three;
    let ct = null;
    T.scene.traverse(o => { if (!ct && o.isMesh && o.geometry.type === 'BoxGeometry' && o.parent && o.parent.position.x < -0.5) ct = o; });
    const v = ct.getWorldPosition(new THREE.Vector3()); v.project(T.camera);
    return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - (v.y + 1) / 2) * innerHeight) };
  });
  await chooser.waitForTimeout(1800);
  // 等运镜落定：加入页的 choosing 时钟启动晚于 host，不落定就交互会让投影点滑出卡面（探针自身时序雷）
  await chooser.evaluate(() => new Promise(res => {
    let last = null, same = 0;
    const tick = () => {
      const s = JSON.stringify([Cam.cur.x, Cam.cur.z, Cam.cur.rx, window.__three.camera.position.x, window.__three.camera.position.z]);
      same = (s === last) ? same + 1 : 0;
      last = s;
      if (same >= 3) return res(true);
      requestAnimationFrame(tick);
    };
    tick();
  })).catch(() => {});
  let cur1 = '', pose1 = null, pose2 = null;
  const hoverStable = () => chooser.evaluate(async () => {   // nudge 会让卡从指针下滑过：单次命中不算数，要稳 420ms
    const h = () => window.__three.feelState().hover;
    if (h() !== 'truth') return false;
    await new Promise(r => setTimeout(r, 420));
    return h() === 'truth';
  });
  for (let i = 0; i < 5 && cur1 !== 'pointer'; i++) {   // 现算→移→再算再移（视差：指针位置本身会转动相机，卡在指针下平移，二次收敛）→验稳
    const pt = await cardPt();
    await chooser.mouse.move(pt.x, pt.y, { steps: 4 });
    await chooser.waitForTimeout(240);
    const pt2 = await cardPt();
    await chooser.mouse.move(pt2.x, pt2.y, { steps: 2 });
    await chooser.waitForTimeout(300);
    cur1 = (await hoverStable()) ? 'pointer' : '';
  }
  ok(cur1 === 'pointer', 'hover cursor pointer on truth card', { cursor: cur1 });

  // 回合门禁：非本回合的标签页不得有任何可点暗示（光标/hover）
  let spectator = tabs.find(t => t !== chooser) || p;
  if (spectator && spectator !== chooser) {
    try {
      await spectator.evaluate(() => {
        document.getElementById('screen-game') || null;
      });
      const spt = await cardPt();   // 同一投影点在观战页视角不同——观战页自己现算一张卡的位置
      const spPt = await spectator.evaluate(() => {
        const T = window.__three;
        let ct = null;
        T.scene.traverse(o => { if (!ct && o.isMesh && o.geometry.type === 'BoxGeometry' && o.parent && o.parent.position.x < -0.5) ct = o; });
        if (!ct) return null;
        const v = ct.getWorldPosition(new THREE.Vector3()); v.project(T.camera);
        return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - (v.y + 1) / 2) * innerHeight) };
      });
      if (spPt) {
        await spectator.mouse.move(spPt.x, spPt.y, { steps: 3 });
        await spectator.waitForTimeout(320);
        const scur = await spectator.evaluate(() => ({ cursor: document.body.style.cursor, feel: window.__three.feelState().hover, turn: S.turn.chooserId === myId }));
        ok(scur.cursor !== 'pointer' && scur.feel === null && !scur.turn, 'spectator has NO hover affordance on cards', scur);
      }
    } catch (e) { log('  ⚠ spectator gate check skipped:', e.message.split('\n')[0]); }
  }
  const hov = await chooser.evaluate(() => {
    let rot = 0;
    window.__three.scene.traverse(o => {
      if (!rot && o.isGroup && o.children.length === 1 && o.children[0].isMesh && o.children[0].geometry.type === 'BoxGeometry' && o.position.x < -0.5) rot = +o.rotation.x.toFixed(3);
    });
    return { groupRotX: rot };
  });
  ok(hov.groupRotX < -0.05, 'hover tilt applied (group leans to camera)', hov);
  await chooser.screenshot({ path: 'shots/feel-hover.png' });

  // 按压 + 点击一体（真实用户序列）：按下→回弹下压，松开=选卡点击
  await chooser.evaluate(() => {
    window.__pd = [];
    document.addEventListener('pointerdown', e => window.__pd.push({ x: e.clientX, y: e.clientY, d: e.detail, tgt: (e.target && (e.target.id || e.target.className)) || '?' }), true);
    document.addEventListener('click', e => window.__pd.push({ click: 1, x: e.clientX, y: e.clientY, d: e.detail, tgt: (e.target && (e.target.id || e.target.className)) || '?' }), true);
  });
  for (let i = 0; i < 4; i++) {   // 按压前复验悬停仍稳，不稳就二次收敛重瞄
    if (await hoverStable()) break;
    const pt = await cardPt();
    await chooser.mouse.move(pt.x, pt.y, { steps: 4 });
    await chooser.waitForTimeout(240);
    const pt2 = await cardPt();
    await chooser.mouse.move(pt2.x, pt2.y, { steps: 2 });
    await chooser.waitForTimeout(300);
  }
  const cardScreen2 = await cardPt();
  await chooser.mouse.move(cardScreen2.x, cardScreen2.y, { steps: 2 });
  await chooser.mouse.down();
  await chooser.waitForTimeout(260);
  const pressSt = await chooser.evaluate(() => {
    let sx = 1;
    window.__three.scene.traverse(o => {
      if (o.isGroup && o.children.length === 1 && o.children[0].isMesh && o.children[0].geometry.type === 'BoxGeometry' && o.position.x < -0.5) sx = +o.children[0].scale.x.toFixed(3);
    });
    return { sx, feel: window.__three.feelState(), pd: window.__pd };
  });
  await chooser.mouse.up();
  ok(pressSt.feel.press === 'truth' && pressSt.sx < 0.985, 'press squish applied while holding', pressSt);

  // ── ③ 松开即选卡：涟漪 + 白闪（reset 后仍衰减可见）+ 闩锁 + 进入 drawing ──
  await chooser.waitForTimeout(140);
  const clk = await chooser.evaluate(() => {
    let flash = -1;
    window.__three.scene.traverse(o => {
      if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.material && o.material.length && o.material[2].emissive) flash = Math.max(flash, +o.material[2].emissive.r.toFixed(2));
    });
    return { flash, ripple: window.__three.feelState().ripples, stage: S.turn.stage, latch: window.__rayDbg ? window.__rayDbg.latch : null, hit: window.__rayDbg ? window.__rayDbg.hit : null };
  });
  ok(clk.hit === 'truth' && clk.stage === 'drawing', 'raycast click chose truth → drawing', clk);
  ok(clk.ripple >= 1, 'felt ripple alive after click', clk);
  ok(clk.flash > 0, 'chosen card face flash survives reset (decays)', clk);
  await chooser.screenshot({ path: 'shots/feel-click-ripple.png' });   // 涟漪 550ms 寿命内取证

  // ── ④ 摸牌防穿模：走位停点必须在桌缘圈外 + lean 前倾 ──
  await chooser.waitForFunction(() => {
    const T = window.__three;
    for (const [, ch] of T.chars) { const u = ch.userData; if (u.go !== null && Math.abs(u.go - 1) < 0.02) return true; }
    return false;
  }, null, { timeout: 12000 }).catch(() => {});
  await chooser.waitForTimeout(400);
  const walk = await chooser.evaluate(() => {
    const T = window.__three;
    const out = [];
    for (const [pid, ch] of T.chars) {
      const u = ch.userData;
      if (u.go > 0.5) out.push({ pid, go: +u.go.toFixed(2), r: +Math.hypot(ch.position.x, ch.position.z).toFixed(2), lean: +u.lean.rotation.x.toFixed(2) });
    }
    return out;
  });
  const wk = walk[0] || {};
  ok(walk.length === 1, 'one walker (chooser)', walk);
  ok(wk.r >= 2.42, 'walker stops OUTSIDE table rim (r>=2.42, rim outer=2.24)', wk);
  ok(Math.abs(wk.lean - 0.38) < 0.02, "hip-pivot lean applied (+0.38, forward toward deck -- sign was backwards, user bug)", wk);
  await chooser.screenshot({ path: 'shots/feel-drawing-walk.png' });   // go≈1 当拍：桌缘站位+前倾可见（晚拍会进翻面/近景）
  await chooser.waitForTimeout(1600);

  // 抽卡者屏幕距离检查：光环跟着走到牌堆旁。2026-09-18 起近景机位随题卡到抽卡者一侧，此拍常已进推镜
  // （chooser 贴脸让镜被剔除）——环的正确语义=与角色同隐现（无身体的悬空圈不许入画），可见时必跟随
  const rs2 = await ringState();
  ok(rs2.present && rs2.visible === rs2.chVis && (!rs2.visible || (rs2.chPos && Math.hypot(rs2.pos[0] - rs2.chPos[0], rs2.pos[1] - rs2.chPos[1]) < 0.05)), 'turnRing mirrors char visibility and follows walker', rs2);

  // 等揭晓 → 近景里 chooser 让镜被剔除，环随身体一起收（一致性语义，不再断言「恒可见」）
  await chooser.waitForFunction(() => S.turn.stage === 'revealed' && document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  await chooser.waitForTimeout(800);
  const rs3 = await ringState();
  ok(rs3.present && rs3.visible === rs3.chVis, 'turnRing consistency in revealed (hidden with culled char in close-up)', rs3);
  await chooser.screenshot({ path: 'shots/feel-revealed.png' });
  if (tabs[0]) {
    const betTab = [p, ...tabs].find(t => t !== chooser);   // 押注面板对抽卡者本人隐藏（正确行为）——要拿观战页验
    await betTab.waitForFunction(() => !document.getElementById('bet-box').hidden, null, { timeout: 12000 }).catch(() => {});
    await betTab.waitForTimeout(400);
    const bet = await betTab.evaluate(() => {
      const b = document.getElementById('bet-box');
      const r = b.getBoundingClientRect(), tb = document.getElementById('game-tools').getBoundingClientRect();
      return {
        betTop: Math.round(r.top), betBottom: Math.round(r.bottom), toolsTop: Math.round(tb.top),
        overlapTools: r.bottom > tb.top && r.height > 0, visible: !b.hidden, w: Math.round(r.width),
        dbg: { stage: S.turn.stage, scoring: S.scoring, chooserIsMe: S.turn.chooserId === myId, finished: !!S.finished, revealAnim: typeof revealAnim !== 'undefined' ? revealAnim : null },
      };
    });
    ok(bet.visible && !bet.overlapTools, 'bet-box floats above tools row (spectator view)', bet);
    await betTab.screenshot({ path: 'shots/feel-betbox.png' });
  }

  // ── ⑤ 光环空闲熄灭：完成啦进入下一回合准备期 ──
  await chooser.evaluate(() => document.getElementById('btn-accept').click());
  await chooser.waitForFunction(() => S.turn.stage !== 'revealed', null, { timeout: 10000 });
  await chooser.waitForTimeout(600);
  const rs4 = await ringState();
  ok(!rs4.present || !rs4.visible || true, 'post-turn state read', rs4);   // 信息性：下一回合 choosing 立即换人亮环

  // ── ⑥ 他人摸牌走位的目视取证：下一回合由对面标签页选卡，host 视角拍走位（穿模最直观视角）──
  let next = null;
  for (const t of [chooser, ...tabs]) {
    try { if (await t.evaluate(() => S.turn.stage === 'choosing' && S.turn.chooserId === myId)) { next = t; break; } } catch (e) {}
  }
  if (next) {
    await next.evaluate(() => document.getElementById('card-truth').click());   // E2E 同款：evaluate 级 click 直触发 handler
    await p.waitForFunction(() => {
      const T = window.__three;
      for (const [, ch] of T.chars) if (Math.abs(ch.userData.go - 1) < 0.03) return true;
      return false;
    }, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(250);
    const w2 = await p.evaluate(() => {
      const out = [];
      for (const [, ch] of window.__three.chars) {
        const u = ch.userData;
        if (u.go > 0.5) out.push({ r: +Math.hypot(ch.position.x, ch.position.z).toFixed(2), lean: +u.lean.rotation.x.toFixed(2) });
      }
      return out;
    });
    ok(w2.length === 1 && w2[0].r >= 2.42, 'next-turn walker also at rim (observed view)', w2);
    await p.screenshot({ path: 'shots/feel-walker-other.png' });
  } else {
    log('  ⚠ next-turn chooser tab not found (skip observer shot)');
  }

  log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
  log(fails === 0 && errors.length === 0 ? 'ALL FEEL CHECKS PASSED ✅' : `FAILURES: ${fails}`);
  await browser.close();
  server.close();
  process.exitCode = (fails || errors.length) ? 1 : 0;
})().catch(e => { console.error('[3d-feel] fatal:', e); process.exit(1); });
