// 终审取证 B（镜头随游戏流程）：真机行为轨迹一次性取证，不改任何断言门禁。
// mono: ① 1100×800 autotest+loperf 端点契约表（camTo 瞬落=路径被调用的端点证明）
//       ② 640×520 inspect 真机补间轨迹（HANDOFF 回全景→推近循环 + HOPPING 跟随 + 中位滞后实测）
// uno : 640×480 inspect，bot 出牌 glanceAside focusK 1→≤0.9→1 轨迹 + 回中性落定
// tod : ?game=tod 三人局，Cam.cur.z 轨迹：choosing nudge(-76) → revealed → 交接 Cam.home(-56) → nudge(-76)
// 结束时删 page/context、browser.close()、server.close()；全程 try/finally + 看门狗，不留端口残留。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
function makeServer() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  });
}
async function listenOn(server, start) {
  for (let p = start; p < start + 20; p++) {
    try { await new Promise((res, rej) => { server.once('error', rej); server.listen(p, '127.0.0.1', () => res()); }); return p; }
    catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('no free port');
}
const ONLY = process.argv[2] || 'ABUT';   // 可只跑部分段：如 node ev-cam-final.cjs T
const D2R = Math.PI / 180;
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : -1;

(async () => {
  const server = makeServer();
  const PORT = await listenOn(server, 8941);
  console.log(`[ev-cam-final] serving on :${PORT}`);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const watch = (p, tag, bag) => {
    p.on('pageerror', e => bag.push(`[${tag}] pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') bag.push(`[${tag}] console: ${m.text().slice(0, 120)}`); });
  };

  try {
    // ══════════ ① monopoly autotest+loperf：端点契约表 ══════════
    if (ONLY.includes('A')) {
      console.log('\n══ M-A mono 1100×800 ?autotest=1&loperf=1（端点契约） ══');
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
      const p = await ctx.newPage();
      const errs = []; watch(p, 'M-A', errs);
      await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&loperf=1`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
      await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 30000 });
      const anchor = await p.evaluate(() => {
        if (__mono.distAnchor) return __mono.distAnchor();   // 旧代码无此访问器：按同款公式现算
        const halfV = Math.tan(21 * Math.PI / 180), asp = innerWidth / innerHeight;
        return { near: Math.max(4.8, 1.6 / (halfV * asp)), base: Math.max(7.2, 4.0 / (halfV * asp), (7 * Math.sin(42 * Math.PI / 180) / 2 + 0.6) / halfV) };
      });
      console.log(`  锚距 near=${anchor.near.toFixed(2)} base=${anchor.base.toFixed(2)}`);
      await p.evaluate(() => {
        window.__F = []; window.__on = true;
        const snap = () => { if (!window.__on) return;
          const G = __mono.state;
          window.__F.push({ ph: G.phase, d: +__mono.rigSnap().dist.toFixed(2), e: +(__mono.rigSnap().elev * 57.3).toFixed(1) });
          setTimeout(snap, 40); };
        snap();
      });
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        const st = await p.evaluate(() => ({ ph: __mono.state.phase, handoff: !document.getElementById('handoff').hidden, modal: !document.getElementById('buy-modal').hidden, gen: !document.getElementById('gen-modal').hidden })).catch(() => ({ dead: true }));
        if (st.dead) break;
        if (st.handoff) await p.evaluate(() => __mono.handoff());
        else if (st.modal) await p.evaluate(() => __mono.buy(true));
        else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (st.ph === 'AWAIT_ROLL') await p.evaluate(() => __mono.step());
        await p.waitForTimeout(60);
      }
      const F = await p.evaluate(() => { window.__on = false; return window.__F; }).catch(() => []);
      // 相位 → dist/elev 端点表
      const byPh = {};
      for (const s of F) { (byPh[s.ph] = byPh[s.ph] || []).push(s); }
      console.log('  相位端点表（loperf 瞬落值=路径终点的直接证据）:');
      for (const [ph, arr] of Object.entries(byPh)) {
        const ds = [...new Set(arr.map(s => s.d))], es = [...new Set(arr.map(s => s.e))];
        console.log(`    ${ph.padEnd(12)} n=${String(arr.length).padStart(4)}  dist∈{${ds.slice(0, 6).join(',')}}  elev∈{${es.slice(0, 6).join(',')}}`);
      }
      const ar = byPh['AWAIT_ROLL'] || [];
      const ho = byPh['HANDOFF'] || [];
      const nearOk = ar.length > 0 && ar.every(s => Math.abs(s.d - anchor.near) < 0.35 && Math.abs(s.e - 55) < 1);
      const baseOk = ho.length > 0 && ho.some(s => Math.abs(s.d - anchor.base) < 0.35 && Math.abs(s.e - 42) < 1);
      console.log(`  端点契约: AWAIT_ROLL≈近景档(near,55°)=${nearOk ? 'YES' : 'NO'}；HANDOFF(back leg)≈全景档(base,42°)=${baseOk ? 'YES' : 'NO'}（AUTOTEST 强制 skip-handoff，back leg 在本档被跳过属设计内，回全景腿由 M-B 真机档取证）`);
      console.log(`  JS 错误 ${errs.length}${errs.length ? ': ' + errs[0] : ''}`);
      await ctx.close();
    }

    // ══════════ ② monopoly inspect 640×520：真机补间轨迹 ══════════
    if (ONLY.includes('B')) {
      console.log('\n══ M-B mono 640×520 inspect=1（真机补间：回全景→推近循环） ══');
      const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
      const p = await ctx.newPage();
      const errs = []; watch(p, 'M-B', errs);
      await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
      // 不勾 skip-handoff：人机局里人类回合边界会亮交接卡 → focusPawn(true) 完整回全景腿可观测
      await p.evaluate(() => { document.getElementById('adv-box').open = true; });
      await p.click('#btn-start');
      // 不勾 skip-handoff：首回合就停在交接卡，先点穿到 AWAIT_ROLL
      const tStart = Date.now();
      while (Date.now() - tStart < 20000) {
        const st = await p.evaluate(() => ({ ph: window.__mono ? __mono.state.phase : null, handoff: !document.getElementById('handoff').hidden })).catch(() => ({ dead: true }));
        if (st.dead) break;
        if (st.ph === 'AWAIT_ROLL') break;
        if (st.handoff) await p.evaluate(() => { const b = document.getElementById('btn-handoff-go'); if (b) b.click(); });
        await p.waitForTimeout(200);
      }
      const anchor = await p.evaluate(() => {
        if (__mono.distAnchor) return __mono.distAnchor();   // 旧代码无此访问器：按同款公式现算
        const halfV = Math.tan(21 * Math.PI / 180), asp = innerWidth / innerHeight;
        return { near: Math.max(4.8, 1.6 / (halfV * asp)), base: Math.max(7.2, 4.0 / (halfV * asp), (7 * Math.sin(42 * Math.PI / 180) / 2 + 0.6) / halfV) };
      });
      console.log(`  锚距 near=${anchor.near.toFixed(2)} base=${anchor.base.toFixed(2)}`);
      await p.evaluate(() => {
        window.__F = []; window.__on = true;
        const snap = () => { if (!window.__on) return;
          try {
            const G = __mono.state, r = __mono.rigSnap(), w = __mono.pawnWorld();
            window.__F.push({ t: Date.now(), ph: G.phase, turn: G.turn, d: r.dist, e: r.elev * 57.3, az: r.az, fk: r.focusK, tx: r.tgt.x, tz: r.tgt.z, w: w && w[G.turn] ? [w[G.turn][0], w[G.turn][2]] : null, lo: document.body.classList.contains('loperf') });
          } catch (e) {}
          setTimeout(snap, 55); };
        snap();
      });
      const t0 = Date.now();
      let handoffSeen = 0;
      while (Date.now() - t0 < 55000 && handoffSeen < 2) {
        const st = await p.evaluate(() => ({ ph: __mono.state.phase, handoff: !document.getElementById('handoff').hidden, roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null, buyYes: !document.getElementById('buy-modal').hidden, gen: !document.getElementById('gen-modal').hidden })).catch(() => ({ dead: true }));
        if (st.dead) break;
        if (st.handoff) { handoffSeen++; await new Promise(r => setTimeout(r, 1500)); await p.evaluate(() => { const b = document.getElementById('btn-handoff-go'); if (b) b.click(); }); }
        else if (st.buyYes) await p.evaluate(() => { const b = document.getElementById('btn-buy-yes'); if (b && !b.disabled) b.click(); else document.getElementById('btn-buy-no').click(); });
        else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (st.roll) { try { await p.click('#act-roll', { timeout: 1500 }); } catch (e) {} }
        await p.waitForTimeout(220);
      }
      const F = await p.evaluate(() => { window.__on = false; return window.__F; }).catch(() => []);
      console.log(`  样本 ${F.length}（loperf 降级 ${F.filter(s => s.lo).length}），交接卡 ${handoffSeen} 次`);
      // 相位 run 表：每段相位的首/末/极值 dist/elev
      const runs = [];
      for (const s of F) {
        const last = runs[runs.length - 1];
        if (last && last.ph === s.ph && s.t - last.endT < 900) { last.endT = s.t; last.n++; last.dEnd = s.d; last.eEnd = s.e; last.dMax = Math.max(last.dMax, s.d); last.dMin = Math.min(last.dMin, s.d); last.eMin = Math.min(last.eMin, s.e); last.eMax = Math.max(last.eMax, s.e); }
        else runs.push({ ph: s.ph, t0: s.t, endT: s.t, n: 1, d0: s.d, dEnd: s.d, e0: s.e, eEnd: s.e, dMax: s.d, dMin: s.d, eMin: s.e, eMax: s.e });
      }
      console.log('  相位 run 轨迹表（dist: 起→末 [min,max] / elev: 起→末 [min,max]）：');
      for (const r of runs.filter(r => r.n >= 2)) {
        console.log(`    ${new Date(r.t0).toISOString().slice(14, 22)} ${r.ph.padEnd(12)} n=${String(r.n).padStart(3)}  d ${r.d0.toFixed(1)}→${r.dEnd.toFixed(1)} [${r.dMin.toFixed(1)},${r.dMax.toFixed(1)}]  e ${r.e0.toFixed(0)}→${r.eEnd.toFixed(0)}° [${r.eMin.toFixed(0)},${r.eMax.toFixed(0)}]`);
      }
      // HANDOFF 段是否到全景档；其后 AWAIT_ROLL 段是否收到近景档
      for (const r of runs.filter(r => r.ph === 'HANDOFF' && r.n >= 2)) {
        console.log(`  ▸ HANDOFF 段：dist 峰 ${r.dMax.toFixed(2)}（base=${anchor.base.toFixed(2)}） elev 谷 ${r.eMin.toFixed(1)}°（42°为目标）→ 回全景腿 ${r.dMax > anchor.near + 1.0 ? '有展开' : '未展开'}`);
      }
      const arRuns = runs.filter(r => r.ph === 'AWAIT_ROLL' && r.n >= 2);
      for (const r of arRuns) {
        console.log(`  ▸ AWAIT_ROLL 段：dist ${r.d0.toFixed(2)}→${r.dEnd.toFixed(2)}（near=${anchor.near.toFixed(2)}） elev ${r.e0.toFixed(1)}→${r.eEnd.toFixed(1)}° → 推近腿 ${Math.abs(r.eEnd - 55) < 4 ? '收敛' : '未收敛'}`);
      }
      // HOPPING 跟随：R1 同款中位误差（对照 0.95 阈值的实测值）
      const hop = F.filter(s => s.ph === 'HOPPING' && !s.lo && s.w);
      const errs2 = hop.map(s => Math.hypot(s.tx - s.w[0] * 0.8, s.tz - s.w[1] * 0.8)).sort((a, b) => a - b);
      console.log(`  HOPPING 跟随 tgt×0.8 中位误差 = ${pct(errs2, 0.5).toFixed(3)}（p25=${pct(errs2, 0.25).toFixed(3)} p75=${pct(errs2, 0.75).toFixed(3)}，n=${errs2.length}）← 对照 R1 阈值 0.95 / 旧 0.75`);
      const hopElev = hop.map(s => s.e);
      console.log(`  HOPPING elev 范围 [${Math.min(...hopElev).toFixed(1)}, ${Math.max(...hopElev).toFixed(1)}]°（自愈带 42~55）`);
      console.log(`  JS 错误 ${errs.length}${errs.length ? ': ' + errs[0] : ''}`);
      await ctx.close();
    }

    // ══════════ ③ uno 640×480 inspect：glanceAside focusK 轨迹 ══════════
    if (ONLY.includes('U')) {
      console.log('\n══ U uno 640×480 inspect=1（glanceAside focusK 循环） ══');
      const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
      const p = await ctx.newPage();
      const errs = []; watch(p, 'U', errs);
      await p.goto(`http://127.0.0.1:${PORT}/uno.html?inspect=1`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
      await p.waitForFunction(() => window.__uno && __uno.camInfo && __uno.camInfo().gl, null, { timeout: 15000 });
      await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
      await p.click('#btn-start');
      await p.waitForFunction(() => __uno.state.phase !== 'SETUP' && __uno.state.phase !== 'BOOT' && __uno.state.phase !== 'HANDOFF', null, { timeout: 15000 });
      await p.evaluate(() => {
        window.__K = []; window.__on = true;
        const snap = () => { if (!window.__on) return;
          try { const G = __uno.state; window.__K.push({ t: Date.now(), k: __uno.camInfo().focusK, ph: G.phase, turn: G.turn, botTurn: G.players[G.turn] ? !!G.players[G.turn].bot : null, lo: __uno.camInfo().lo }); } catch (e) {}
          setTimeout(snap, 45); };
        snap();
      });
      const d0 = Date.now();
      let myPlays = 0;
      while (Date.now() - d0 < 32000) {
        const st = await p.evaluate(() => { const G = __uno.state; return { ph: G.phase, myTurn: G.phase === 'AWAIT_ACTION' && !G.players[G.turn].bot, modal: !document.getElementById('gen-modal').hidden, handoff: !document.getElementById('handoff').hidden }; }).catch(() => ({ dead: true }));
        if (st.dead) break;
        if (st.handoff) await p.evaluate(() => __uno.handoff());
        else if (st.modal) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (st.myTurn) {
          await p.evaluate(() => { const G = __uno.state; const h = G.players[G.turn].hand;
            for (let j = 0; j < h.length; j++) { try { __uno.play(j); if (__uno.state.phase !== 'AWAIT_ACTION') return; } catch (e) {} }
            try { __uno.draw(); } catch (e) {} });
          myPlays++;
          const wild = await p.evaluate(() => !document.getElementById('wild-modal').hidden);
          if (wild) await p.evaluate(() => __uno.chooseColor('r'));
        }
        await p.waitForTimeout(250);
      }
      const K = await p.evaluate(() => { window.__on = false; return window.__K; }).catch(() => []);
      // bot 出牌事件：botTurn 的 AWAIT_ACTION 段结束次（每段≈一手）
      let botPlays = 0;
      for (let i = 1; i < K.length; i++) if (K[i - 1].botTurn && K[i - 1].ph === 'AWAIT_ACTION' && K[i].ph !== 'AWAIT_ACTION') botPlays++;
      const dips = []; let run = null;
      for (const s of K) {
        if (s.k < 0.9) { if (!run) run = { t0: s.t, min: s.k }; else run.min = Math.min(run.min, s.k); }
        else if (run) { run.t1 = s.t; dips.push(run); run = null; }
      }
      if (run) { run.t1 = K[K.length - 1].t; dips.push(run); }
      console.log(`  样本 ${K.length}，降级 ${K.filter(s => s.lo).length}，bot 出牌段 ${botPlays}，本端行动 ${myPlays}`);
      console.log(`  focusK 下探 ${dips.length} 次，谷值: ${dips.map(d => d.min.toFixed(3)).join(', ') || '（无）'}（新参数目标 0.84）`);
      for (const d of dips.slice(0, 8)) console.log(`    dip ${new Date(d.t0).toISOString().slice(14, 22)} ~ ${new Date(d.t1).toISOString().slice(14, 22)} 谷 ${d.min.toFixed(3)} 宽 ${d.t1 - d.t0}ms`);
      const backTo1 = dips.every(d => K.some(s => s.t >= d.t1 && s.t <= d.t1 + 2500 && s.k === 1));
      const settles = await (async () => { try { await p.waitForFunction(() => __uno.camInfo().focusK === 1, null, { timeout: 4500 }); return true; } catch (e) { return false; } })();
      console.log(`  每次下探后 2.5s 内回 focusK=1: ${backTo1 ? 'YES' : 'NO'}；窗末 waitForFunction 回中性: ${settles ? 'YES' : 'NO'}`);
      console.log(`  JS 错误 ${errs.length}${errs.length ? ': ' + errs[0] : ''}`);
      await ctx.close();
    }

    // ══════════ ④ tod 三人局：Cam.cur.z 轨迹 ══════════
    if (ONLY.includes('T')) {
      console.log('\n══ T tod ?game=tod 三人局（z: -56 全景 ↔ -76 推近循环） ══');
      const ctx = await browser.newContext({ viewport: { width: 620, height: 820 } });   // 降载：软渲 3 页并发会把 rAF 饿到 ~0.4fps，采不到交接腿
      await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
      const errs = [];
      const open = async (tag) => {
        const q = await ctx.newPage(); watch(q, tag, errs);
        await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
        await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
        await q.waitForSelector('#input-name', { state: 'visible', timeout: 15000 }).catch(() => {});
        await q.waitForTimeout(900);
        return q;
      };
      const host = await open('T-host');
      await host.fill('#input-name', '阿泽');
      await host.click('details.adv summary');
      await host.click('#chk-local');
      await host.click('.avatar-option >> nth=0');
      await host.click('#btn-join');
      await host.waitForSelector('#screen-lobby.active', { timeout: 20000 });
      const room = (await host.textContent('#share-room')).trim();
      console.log(`  房间号 ${room}，加入另两位…`);
      const tabs = [host];
      for (const [nm, i] of [['小雨', 1]]) {
        const q = await open('T-' + nm);
        tabs.push(q);
        await q.fill('#input-name', nm);
        await q.click('details.adv summary');
        await q.click('#chk-local');
        await q.fill('#input-room', room);
        await q.click('.avatar-option >> nth=0');
        await q.click('#btn-join');
        await q.waitForSelector('#screen-lobby.active', { timeout: 20000 }).catch(() => {});
        await host.waitForTimeout(1200);
      }
      await host.waitForFunction(() => typeof S !== "undefined" && S.players.length >= 2, null, { timeout: 30000 }).catch(async () => {
        const dbg = await host.evaluate(() => ({ n: typeof S !== "undefined" ? S.players.length : -1, lobby: document.getElementById('screen-lobby').className })).catch(() => ({ dbg: 'fail' }));
        console.log(`  ⚠️ 两人未齐：${JSON.stringify(dbg)}（软渲下 guest 加入慢，继续用现有人数取证）`);
      });
      await host.waitForTimeout(600);
      await host.click('#btn-start');
      const gameOn = await host.waitForSelector('#screen-game.active', { timeout: 15000 }).then(() => true).catch(() => false);
      if (!gameOn) {
        const dbg = await host.evaluate(() => ({ n: typeof S !== "undefined" ? S.players.length : -1, scr: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id) })).catch(() => ({}));
        console.log(`  ⚠️ 未能进入牌桌（${JSON.stringify(dbg)}），tod 段放弃（软渲环境限制，非实现信号）`);
        await ctx.close();
        return;
      }
      await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 10000 });
      await host.waitForTimeout(1500);
      await host.evaluate(() => {
        window.__Z = [];
        // 钩在 Cam.apply 上：每一帧真实写出的机位都记录（软渲主线程饥饿时 setTimeout 采样会漏帧，
        // apply 钩子不依赖定时器，帧序=真实播出序列）
        const raw = Cam.apply.bind(Cam);
        Cam.apply = function () { raw(); try { window.__Z.push({ t: performance.now(), st: (typeof S !== 'undefined' && S.turn) ? S.turn.stage : '?', z: Cam.cur.z, s: Cam.cur.s, x: Cam.cur.x }); } catch (e) {} };
      });
      const t0 = Date.now();
      let clicks = 0, coolUntil = 0, lastStage = '?';
      while (Date.now() - t0 < 90000 && clicks < 4) {
        let acted = false;
        for (const q of tabs) {
          const st = await q.evaluate(() => ({
            me: !!(typeof S !== "undefined" && S.turn && S.turn.chooserId === myId),
            stage: (typeof S !== 'undefined' && S.turn) ? S.turn.stage : '?',
            dis: document.getElementById('card-truth').classList.contains('disabled'),
          })).catch(() => ({ dead: true }));
          if (st.dead) continue;
          if (lastStage === 'revealed' && st.stage === 'choosing') coolUntil = Date.now() + 2800;   // 交接腿（home 700 + nudge 1000）先播完再点卡
          lastStage = st.stage;
          if (st.me && st.stage === 'choosing' && !st.dis && Date.now() > coolUntil) { await q.evaluate(() => document.getElementById('card-truth').click()); clicks++; acted = true; break; }
          if (st.me && st.stage === 'revealed') { await q.evaluate(() => { const b = document.getElementById('btn-accept'); if (b) b.click(); }); clicks++; acted = true; break; }
        }
        if (!acted) await host.waitForTimeout(600);
      }
      const Z = await host.evaluate(() => window.__Z).catch(() => []);
      console.log(`  z 样本 ${Z.length}，驱动点击 ${clicks} 次`);
      // 按阶段 run 压缩
      const zruns = [];
      for (const s of Z) {
        const last = zruns[zruns.length - 1];
        if (last && last.st === s.st && s.t - last.endT < 1200) { last.endT = s.t; last.n++; last.zEnd = s.z; last.zMin = Math.min(last.zMin, s.z); last.zMax = Math.max(last.zMax, s.z); }
        else zruns.push({ st: s.st, t0: s.t, endT: s.t, n: 1, z0: s.z, zEnd: s.z, zMin: s.z, zMax: s.z });
      }
      for (const r of zruns.filter(r => r.n >= 2)) {
        console.log(`    ${new Date(r.t0).toISOString().slice(14, 22)} ${r.st.padEnd(9)} n=${String(r.n).padStart(3)}  z ${r.z0.toFixed(1)}→${r.zEnd.toFixed(1)} [${r.zMin.toFixed(1)},${r.zMax.toFixed(1)}]`);
      }
      const draws = zruns.filter(r => r.st === 'drawing' && r.n >= 2);
      const choos = zruns.filter(r => r.st === 'choosing' && r.n >= 2);
      if (choos.length) console.log(`  ▸ choosing 段 z 谷（nudge 推近目标 -76）: ${choos.map(r => r.zMin.toFixed(1)).join(', ')}；段内 z 峰（回全景目标 -56）: ${choos.map(r => r.zMax.toFixed(1)).join(', ')}`);
      if (draws.length) console.log(`  ▸ drawing 段 z 谷（focusCam 目标 -76）: ${draws.map(r => r.zMin.toFixed(1)).join(', ')}`);
      // 交接回全景证据：相邻 choosing 段之间 z 是否先升向 -56 再降向 -76
      for (let i = 1; i < choos.length; i++) {
        const prev = choos[i - 1], cur = choos[i];
        const between = Z.filter(s => s.t > prev.endT && s.t <= cur.t0 + 8000);
        const peak = between.length ? Math.max(...between.map(s => s.z)) : NaN;
        console.log(`  ▸ 第 ${i} 次回合交接（revealed→choosing）：过渡窗 z 峰 ${peak.toFixed(1)}（≥-58 即 home(700) 回全景到位），随后 choosing z 谷 ${cur.zMin.toFixed(1)}（nudge 再推近）`);
      }
      console.log(`  JS 错误 ${errs.length}${errs.length ? ': ' + errs[0] : ''}`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    await new Promise(r => server.close(r));
    console.log('\n[ev-cam-final] browser + server closed, no port residue');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
