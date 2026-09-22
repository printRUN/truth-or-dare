// 修后验证：uno 镜头 rig（默认位形等价 + 出牌 glance + perfWatch 预热）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8935;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots/ev-uno-fixed';
fs.mkdirSync(SHOTS, { recursive: true });
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
const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ` | ${JSON.stringify(extra).slice(0, 160)}` : '')); if (!cond) fails++; };
const D2R = Math.PI / 180;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ U1+U2：inspect=1 真机路径，热座 1真人+1机器人，glance/飞牌/默认位形 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('unhandledrejection', e => errs.push('REJ:' + String(e && e.reason).slice(0, 140)));
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.waitForFunction(() => window.__uno && __uno.camInfo && __uno.camInfo().gl, null, { timeout: 15000 });

    // U1 默认位形与旧静态机位等价：pos=(0, d·sin46°, d·cos46°)、lookAt(0,0,-0.2)
    const c0 = await p.evaluate(() => __uno.camInfo());
    const halfV = Math.tan(21 * D2R), aspect = 1100 / 800;
    const dWant = Math.max(6.4, 4.6 / (halfV * aspect), (5.4 * Math.sin(46 * D2R)) / halfV * 0.92);
    const posOk = Math.abs(c0.pos[0]) < 1e-6
      && Math.abs(c0.pos[1] - dWant * Math.sin(46 * D2R)) < 1e-4
      && Math.abs(c0.pos[2] - dWant * Math.cos(46 * D2R)) < 1e-4;
    ok('U1 默认位形=旧静态机位（逐参数等价）', posOk && c0.az === 0 && c0.focusK === 1, { dWant: +dWant.toFixed(3), pos: c0.pos.map(v => +v.toFixed(4)) });

    // U3 预热豁免：8s 前不降级（预热 2.6s+双慢窗最早 ~8s）；本机软渲 uno 真实帧耗>26ms，之后按设计降级
    const t0 = Date.now();
    let flipT = -1;
    while (Date.now() - t0 < 20000) {
      if (await p.evaluate(() => document.body.classList.contains('loperf'))) { flipT = Date.now() - t0; break; }
      await p.waitForTimeout(200);
    }
    ok('U3 真机路径 bodyLo 不在 8s 前翻转', flipT < 0 || flipT > 8000, { flipTms: flipT });
    const degradedStart = flipT > 0;

    // 开局（跳过交接）：UI 点击（热座在 adv-box details 里）
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => __uno.state.phase !== 'SETUP' && __uno.state.phase !== 'BOOT' && __uno.state.phase !== 'HANDOFF', null, { timeout: 15000 });

    // U2 驱动 40s：本端真人 __uno.play/draw；机器人自动。采样 focusK/az
    await p.evaluate(() => {
      window.__K = []; window.__kOn = true;
      const snap = () => {
        if (!window.__kOn) return;
        try {
          const G = __uno.state;
          window.__K.push({ ph: G.phase, turn: G.turn, k: __uno.camInfo().focusK, az: __uno.camInfo().az, lo: __uno.camInfo().lo });
        } catch (e) {}
        setTimeout(snap, 60);
      };
      snap();
    });
    const d0 = Date.now();
    let myPlays = 0, shotI = 0;
    while (Date.now() - d0 < 40000) {
      const st = await p.evaluate(() => {
        const G = __uno.state;
        return { ph: G.phase, myTurn: G.phase === 'AWAIT_ACTION' && !G.players[G.turn].bot, modal: !document.getElementById('gen-modal').hidden, handoff: !document.getElementById('handoff').hidden };
      }).catch(() => ({ dead: true }));
      if (st.dead) break;
      if (st.handoff) await p.evaluate(() => __uno.handoff());
      else if (st.modal) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
      else if (st.myTurn) {
        const did = await p.evaluate(() => {
          const G = __uno.state, k = G.turn;
          const hand = G.players[k].hand;
          // 优先出可出的牌（play 内部有 canPlay 校验，不可出会摇牌拒绝）
          for (let j = 0; j < hand.length; j++) { try { __uno.play(j); if (__uno.state.phase !== 'AWAIT_ACTION') return true; } catch (e) {} }
          try { __uno.draw(); return true; } catch (e) { return false; }
        });
        if (did) myPlays++;
        // wild 弹窗
        const wild = await p.evaluate(() => !document.getElementById('wild-modal').hidden);
        if (wild) await p.evaluate(() => __uno.chooseColor('r'));
      }
      if ((Date.now() - d0) / 10000 > shotI) { shotI++; try { await p.screenshot({ path: `${SHOTS}/u-${String(shotI).padStart(2, '0')}.png` }); } catch (e) {} }
      await p.waitForTimeout(300);
    }
    const K = await p.evaluate(() => { window.__kOn = false; return window.__K; }).catch(() => []);
    const loBad = K.filter(e => e.lo).length;
    // 降级 ladder 双叉：未降级→动画档断言；降级→瞬时档断言（glance/fly 按设计静默，只验不崩+回中性）
    if (degradedStart || loBad > 0) {
      ok('U2[降级档] 降级后零动画直落（glance 静默）', loBad > 0 && K.slice(-20).every(e => e.k === 1), { loBad, tail: K.slice(-3).map(e => e.k) });
      console.log('     （本机软渲持续 >26ms 中位 → 按设计进入瞬时档；glance 动效由小视口档 U2b 覆盖）');
    } else {
      ok('U2[动画档] 40s 渲染不降级', K.length > 100 && loBad === 0, { samples: K.length, loBad });
      const dips = [];
      let run = null;
      K.forEach(e => {
        if (e.k < 0.95) { if (!run) run = { min: e.k }; else run.min = Math.min(run.min, e.k); }
        else if (run) { dips.push(run); run = null; }
      });
      ok(`U2[动画档] 机器人出牌 glance 下探（${dips.length} 次）`, dips.length >= 2, dips.map(d => +d.min.toFixed(3)));
    }
    ok('U2 glance 回中性 focusK=1', Math.abs(K[K.length - 1].k - 1) < 1e-6, K[K.length - 1].k);
    console.log(`     （本端行动 ${myPlays} 次，JS 错误 ${errs.length}${errs.length ? ': ' + errs[0] : ''}）`);
    ok('U2 零 JS 错误', errs.length === 0, errs[0]);
    await ctx.close();
  }

  // ══ U2b：小视口（软渲帧耗降到阈值下）验证 glance 动效本体 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => __uno.state.phase !== 'SETUP' && __uno.state.phase !== 'BOOT' && __uno.state.phase !== 'HANDOFF', null, { timeout: 15000 });
    await p.evaluate(() => {
      window.__K = []; window.__kOn = true;
      const snap = () => {
        if (!window.__kOn) return;
        try { window.__K.push({ k: __uno.camInfo().focusK, lo: __uno.camInfo().lo }); } catch (e) {}
        setTimeout(snap, 50);
      };
      snap();
    });
    const d0 = Date.now();
    while (Date.now() - d0 < 30000) {
      const st = await p.evaluate(() => {
        const G = __uno.state;
        return { ph: G.phase, myTurn: G.phase === 'AWAIT_ACTION' && !G.players[G.turn].bot, modal: !document.getElementById('gen-modal').hidden, handoff: !document.getElementById('handoff').hidden };
      }).catch(() => ({ dead: true }));
      if (st.dead) break;
      if (st.handoff) await p.evaluate(() => __uno.handoff());
      else if (st.modal) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
      else if (st.myTurn) {
        await p.evaluate(() => {
          const G = __uno.state;
          const hand = G.players[G.turn].hand;
          for (let j = 0; j < hand.length; j++) { try { __uno.play(j); if (__uno.state.phase !== 'AWAIT_ACTION') return; } catch (e) {} }
          try { __uno.draw(); } catch (e) {}
        });
        const wild = await p.evaluate(() => !document.getElementById('wild-modal').hidden);
        if (wild) await p.evaluate(() => __uno.chooseColor('r'));
      }
      await p.waitForTimeout(250);
    }
    const K = await p.evaluate(() => { window.__kOn = false; return window.__K; }).catch(() => []);
    const loBad = K.filter(e => e.lo).length;
    const dips = [];
    let run = null;
    K.forEach(e => {
      if (e.k < 0.95) { if (!run) run = { min: e.k }; else run.min = Math.min(run.min, e.k); }
      else if (run) { dips.push(run); run = null; }
    });
    ok(`U2b[小视口] glance 下探 ${dips.length} 次（降级 ${loBad} 样本）`, K.length > 100 && dips.length >= 1, { dips: dips.length, loBad, samples: K.length });   // 回中性由 U2 档断言；收尾允许 glance 仍在飞行
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
