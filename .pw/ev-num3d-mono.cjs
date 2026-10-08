/* ev-num3d-mono.cjs —— 数字实体化轮 M1/M2 取证（端口 9043，2026-10-08）
   M1 金额浮字 .mfloat → 3D 总额牌（inspect=1 真机路径；调用驱动、GL 局 DOM 浮字退役、
   REDUCED/TURBO/AUTOTEST 走 DOM parity）；M2 骰值读出 → 骰位实体铭牌。
   软渲对抗：perfWatch 中和 + setBodyLo(false)（记忆 tod-mono-cash 检查官方法）。
   断言只认 __mono.floaters() 访问器。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 9043;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

async function bootInspect(browser, url, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1100, height: 800 } }, opts || {}));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 140)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 20000 });
  await p.evaluate(() => {   // 软渲对抗：帧率自适中和（inspect 真渲染在 SwiftShader 下必翻转 bodyLo → canPlaque 恒假假红）
    if (window.setBodyLo) try { setBodyLo(false); } catch (e) {}
    if (window.perfWatch) { try { window.perfWatch = function () {}; } catch (e) {} }
  });
  await p.evaluate(() => startGame({ players: [{ name: '我' }, { name: '乙', bot: true }, { name: '丙', bot: true }], roundLimit: 20, skipHandoff: true }));
  return { ctx, p, errs };
}

async function driveToMyRoll(p, tries) {
  for (let i = 0; i < (tries || 24); i++) {
    const st = await p.evaluate(() => ({
      ph: __mono.state.phase, turn: __mono.state.turn,
      modal: !document.getElementById('buy-modal').hidden,
      handoff: !document.getElementById('handoff').hidden,
      gen: !document.getElementById('gen-modal').hidden,
      bodyLo: document.body.classList.contains('loperf'),
    }));
    if (st.turn === 0 && st.ph === 'AWAIT_ROLL' && !st.modal && !st.handoff && !st.gen) return st;
    if (st.modal) await p.evaluate(() => __mono.buy(true));
    else if (st.handoff) await p.evaluate(() => __mono.handoff());
    else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
    await p.waitForTimeout(250);
  }
  return null;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  console.log('— inspect 真机路径：M1 金额浮牌 / M2 骰值铭牌 —');
  {
    const { ctx, p, errs } = await bootInspect(browser, `http://127.0.0.1:${PORT}/monopoly.html?inspect=1`);
    const st0 = await driveToMyRoll(p);
    ok(!!st0, '对局进行中回到我方 AWAIT_ROLL');
    const gate = await p.evaluate(() => ({ can: __mono.floaters().can, gl: __mono.state.gl, lo: document.body.classList.contains('loperf') }));
    ok(gate.can === true && gate.gl === true && gate.lo === false, `canPlaque 门开（can=${gate.can} gl=${gate.gl} loperf=${gate.lo}）`);

    // M1：pay 触发双方浮牌（GL 主表达），DOM .mfloat 退役
    await p.evaluate(() => __mono.pay(0, 500, 1));
    const f1 = await p.evaluate(() => ({ live: __mono.floaters().live, cash: __mono.floaters().cash, w: __mono.floaters().w, pos: __mono.floaters().pos, pawn: (pawnObjs[0] ? [pawnObjs[0].position.x, pawnObjs[0].position.y, pawnObjs[0].position.z].map(n => +n.toFixed(2)) : null), dom: document.querySelectorAll('.mfloat').length }));
    ok(f1.live >= 1 && f1.cash >= 1, `3D 浮牌已起飞（live=${f1.live} cash=${f1.cash}）`);
    ok(f1.w > 0.5 && f1.w <= 1.5, `铭牌世界宽度正常（w=${f1.w}，防画布像素当世界单位的巨板回归）`);
    // 起飞位=契约位（pawnNotePos+0.3y≈+0.8、外移 0.25）：角格 pawn 在全景机位下出画是机位事实（相机所有权 az 会回合重置），投影视口断言不可用——业务终审 P2-1 改几何位断言
    const lat = f1.pos && f1.pawn ? Math.hypot(f1.pos.x - f1.pawn[0], f1.pos.z - f1.pawn[2]) : 0;
    ok(f1.pos && f1.pawn && lat > 0.15 && lat < 0.35 && Math.abs(f1.pos.y - (f1.pawn[1] + 0.8)) < 0.05, `起飞位=pawn 头顶外移带（pos=${JSON.stringify(f1.pos)} pawn=${JSON.stringify(f1.pawn)} lat=${lat && lat.toFixed(2)}）`);
    ok(f1.dom === 0, 'GL 局 DOM .mfloat 退役（0 残留）');
    await p.waitForTimeout(260);   // 跨过 +60ms×SPEED 起飞延迟窗，拍升浮中段（业务终审 P2-1：旧版拍在延迟窗内拍到空帧）
    await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-mono-live.png') });   // 在飞存证
    await p.waitForFunction(() => __mono.floaters().live === 0, null, { timeout: 4000 });
    const f2 = await p.evaluate(() => __mono.floaters());
    ok(f2.live === 0, `浮牌 900ms×SPEED 自到期（live=${f2.live}）`);
    await p.evaluate(() => __mono.pay(0, 12000, 1));   // 最长 +¥12,000 字宽路径
    const f3 = await p.evaluate(() => __mono.floaters().cash);
    ok(f3 >= 2, `大额浮牌可容（cash=${f3}）`);
    await p.waitForFunction(() => __mono.floaters().live === 0, null, { timeout: 4000 });

    // M2：掷骰 → 骰位铭牌，DOM readout 退役
    const st1 = await driveToMyRoll(p);
    ok(!!st1, '回合回到我方可掷骰');
    await p.evaluate(() => __mono.step());
    let diceOk = true;
    try { await p.waitForFunction(() => __mono.floaters().dice >= 1, null, { timeout: 9000 }); } catch (e) { diceOk = false; }
    const f4 = await p.evaluate(() => ({ dice: __mono.floaters().dice, readout: document.getElementById('dice-readout').classList.contains('show') }));
    ok(diceOk && f4.dice >= 1, `骰值铭牌弹出（dice=${f4.dice}）`);
    ok(!f4.readout, 'GL 局 DOM 骰值条退役（无 .show）');
    await p.waitForFunction(() => __mono.floaters().live === 0, null, { timeout: 5000 });
    await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', 'ev-num3d-mono-inspect.png') });
    ok(errs.length === 0, `零 pageerror（${errs.length}）${errs[0] || ''}`);
    await ctx.close();
  }

  console.log('— REDUCED 退路：DOM 浮字承担 —');
  {
    const { ctx, p } = await bootInspect(browser, `http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { reducedMotion: 'reduce' });
    const gate = await p.evaluate(() => __mono.floaters().can);
    ok(gate === false, `REDUCED 下 canPlaque 关（can=${gate}）`);
    await p.evaluate(() => __mono.pay(0, 300, 1));
    const f = await p.evaluate(() => ({ dom: document.querySelectorAll('.mfloat').length, live: __mono.floaters().live }));
    ok(f.dom >= 1 && f.live === 0, `DOM .mfloat 承担（dom=${f.dom} live=${f.live}）`);
    await ctx.close();
  }

  console.log('— AUTOTEST parity：DOM 承担、plaque 恒跳 —');
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&loperf=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 20000 });
    await p.waitForFunction(() => window.__mono && __mono.state.phase !== 'SETUP', null, { timeout: 20000 });
    const gate = await p.evaluate(() => __mono.floaters().can);
    ok(gate === false, `AUTOTEST 下 canPlaque 关（can=${gate}）`);
    await p.evaluate(() => __mono.pay(0, 200, 1));
    const f = await p.evaluate(() => ({ dom: document.querySelectorAll('.mfloat').length, live: __mono.floaters().live }));
    ok(f.dom >= 1 && f.live === 0, `AUTOTEST DOM parity（dom=${f.dom} live=${f.live}）`);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`═══ ev-num3d-mono：${pass} 过 / ${fail} 挂 ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('PROBE CRASH:', e.message || e); process.exit(2); });
