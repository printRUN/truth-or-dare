// persona-mono-sfx-tmp.cjs —— 玩家模拟取证探针（一次性）
// 目的：为「音效/动效补全 + 镜头规则改正」收集第一手体验证据。只观察，不改游戏文件。
// 手段：真实 UI 点击驱动（#btn-start/#act-roll/#btn-buy-yes/#btn-handoff-go），
//       页面内包裹 SFX.* / toast()（纯观察日志，不改行为），__mono.rigSnap()/pawnWorld() 采样，
//       入狱/所得税用官方 inspect 钩子 __mono.resolveAt()（任务书允许）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8961;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots';
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

// ── 页面内安装观察器（load 后一次）：SFX/toast 包裹 + 结构化采样 ──
const INSTALL = () => {
  if (window.__INSTALLED) return; window.__INSTALLED = true;
  const t = () => +performance.now().toFixed(1);
  window.__LOG = { sfx: [], toast: [], phase: [], float: [], snap: [], cash: [] };
  const log = window.__LOG;
  // 1) 包裹 SFX（const 对象的可变属性：纯观察，调用原实现）
  try {
    const names = ['tap', 'roll', 'coin', 'pay', 'jail', 'bust', 'win', 'card', 'pop', 'flip', 'deal'];
    names.forEach(n => {
      const orig = SFX[n];
      if (typeof orig !== 'function') return;
      SFX[n] = function (...a) { log.sfx.push({ t: t(), n }); return orig.apply(this, a); };
    });
  } catch (e) { log.sfx.push({ t: t(), n: 'WRAP_FAIL:' + e.message }); }
  // 2) 包裹 toast
  try {
    const origToast = toast;
    window.toast = function (msg, kind) { log.toast.push({ t: t(), msg: String(msg), k: kind || '' }); return origToast(msg, kind); };
  } catch (e) {}
  // 3) moneyFloat DOM 观察
  try {
    const bar = document.getElementById('players-bar');
    new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(nd => {
        if (nd.nodeType === 1 && nd.classList && nd.classList.contains('mfloat')) log.float.push({ t: t(), pi: nd.dataset.pi, txt: nd.textContent });
      }));
    }).observe(bar, { childList: true, subtree: true });
  } catch (e) {}
  // 4) 结构化轮询：phase/turn/turn 名/现金 diff + 镜头快照（60ms）
  let lastPhase = '', lastCash = '';
  setInterval(() => {
    try {
      const G = __mono.state;
      const rig = __mono.rigSnap();
      const snap = {
        t: t(), ph: G.phase, turn: G.turn,
        bot: !!(G.players[G.turn] || {}).bot,
        lo: document.body.classList.contains('loperf'),
        ad: rig.autoDist, d: +rig.dist.toFixed(2), e: +(rig.elev * 57.3).toFixed(1),
        tx: +rig.tgt.x.toFixed(2), tz: +rig.tgt.z.toFixed(2),
      };
      if (G.phase !== lastPhase) { lastPhase = G.phase; log.phase.push({ t: t(), ph: G.phase, turn: G.turn, bot: snap.bot }); }
      log.snap.push(snap);
      if (log.snap.length > 4000) log.snap.splice(0, 2000);
      const cs = G.players.map(p => p.cash + '/' + (p.jailed ? 'J' : '') + (p.bankrupt ? 'B' : '')).join('|');
      if (cs !== lastCash) { lastCash = cs; log.cash.push({ t: t(), cs }); }
    } catch (e) {}
  }, 60);
  // 5) HOPPING 高频棋子采样（供逐跳/脚步声判断）
  setInterval(() => {
    try {
      const G = __mono.state;
      if (G.phase !== 'HOPPING') return;
      const w = __mono.pawnWorld();
      log.hoplog = log.hoplog || [];
      log.hoplog.push({ t: t(), turn: G.turn, x: +w[G.turn][0].toFixed(2), y: +w[G.turn][1].toFixed(2), z: +w[G.turn][2].toFixed(2) });
      if (log.hoplog.length > 3000) log.hoplog.splice(0, 1500);
    } catch (e) {}
  }, 40);
};

// ── 通用驱动：真实 UI 点击 + 关键瞬间截图 ──
async function drive(p, tag, ms, opt = {}) {
  const t0 = Date.now();
  const seen = { dice: 0, hop: 0, botHop: 0, card: 0, buy: 0, handoff: 0, awaitShot: 0 };
  let lastPhase = '', jailDone = !!opt.skipJail, taxDone = !!opt.skipTax, didNaturalWait = 0;
  while (Date.now() - t0 < ms) {
    const v = await p.evaluate(() => {
      const G = window.__mono ? __mono.state : null;
      if (!G) return { dead: true };
      const rig = __mono.rigSnap();
      return {
        phase: G.phase, turn: G.turn, myJailed: !!(G.players[0] || {}).jailed,
        rollVis: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
        fineVis: !!document.getElementById('act-fine') && document.getElementById('act-fine').offsetParent !== null,
        handoff: !document.getElementById('handoff').hidden,
        buy: !document.getElementById('buy-modal').hidden,
        gen: !document.getElementById('gen-modal').hidden,
        over: !document.getElementById('result-overlay').hidden,
        cardCam: !rig.autoDist && rig.elev * 57.3 < 38 && G.phase === 'RESOLVE',
        pos0: G.players[0] ? G.players[0].pos : -1,
      };
    }).catch(() => ({ dead: true }));
    if (v.dead) break;
    if (v.over) { await shot(p, tag + '-over.png'); break; }
    // 优先级：gen 弹窗 > buy 弹窗 > handoff > 掷骰/出狱操作
    if (v.gen) { await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); }); }
    else if (v.buy) {
      if (!seen.buy || Date.now() - seen.buy > 6000) {
        seen.buy = Date.now();
        await shot(p, `${tag}-buy-modal.png`);
        await p.evaluate(markSamplerStart).catch(() => {});
        await p.click('#btn-buy-yes', { timeout: 1500 }).catch(async () => { await p.click('#btn-buy-no', { timeout: 1500 }).catch(() => {}); });
        await p.waitForTimeout(110); await shot(p, `${tag}-buy-mark-1.png`);
        await p.waitForTimeout(140); await shot(p, `${tag}-buy-mark-2.png`);
        await p.waitForTimeout(220); await shot(p, `${tag}-buy-mark-3.png`);
        const ms2 = await p.evaluate(markSamplerGet).catch(() => null);
        if (ms2) { global.__MARKS = global.__MARKS || []; global.__MARKS.push({ tag, tile: ms2.tile, s: ms2.s }); }
      } else { await p.click('#btn-buy-yes', { timeout: 1200 }).catch(() => {}); }
    }
    else if (v.handoff) {
      if (!seen.handoff || Date.now() - seen.handoff > 4000) { seen.handoff = Date.now(); await shot(p, `${tag}-handoff.png`); }
      await p.click('#btn-handoff-go', { timeout: 1500 }).catch(() => {});
    }
    else if (v.rollVis && (v.phase === 'AWAIT_ROLL')) {
      if (!seen.awaitShot || Date.now() - seen.awaitShot > 5000) { seen.awaitShot = Date.now(); if (seen.awaitN < 4) { seen.awaitN = (seen.awaitN || 0) + 1; await shot(p, `${tag}-await.png`); } }
      // 取证动作：先税（自由身）后狱（押送连拍），各一次，放在真人等待期
      if (!taxDone && opt.doTax && didNaturalWait > 1) {
        taxDone = true;
        await p.evaluate(() => __mono.resolveAt(0, 15)).catch(() => {});
        await p.waitForTimeout(400); await shot(p, `${tag}-tax.png`);
        continue;
      }
      if (!jailDone && opt.doJail && (taxDone || !opt.doTax) && didNaturalWait > 1) {
        jailDone = true;
        await p.evaluate(jailBurstStart, 0).catch(e => console.log('  jailBurstStart fail', e.message));
        await p.waitForTimeout(150);
        for (let i = 0; i < 8; i++) { await shot(p, `${tag}-jail-burst-${i}.png`); await p.waitForTimeout(i === 3 ? 300 : 90); }
        await p.waitForTimeout(1100);
        const jb = await p.evaluate(jailBurstGet).catch(() => null);
        if (jb) { global.__JAIL = global.__JAIL || []; global.__JAIL.push({ tag, jb }); }
        continue;
      }
      didNaturalWait++;
      if (seen.dice <= 3) { await shot(p, `${tag}-dice-air.png`); } // 掷骰前摇（限前3次，软渲下截图很慢）
      await p.click('#act-roll', { timeout: 1500 }).catch(() => {});
      if (seen.dice <= 3) { await p.waitForTimeout(320); await shot(p, `${tag}-dice-mid.png`); }
      seen.dice++;
    }
    else if (v.phase === 'ROLLING' && lastPhase !== 'ROLLING') { /* 掷骰动画期 */ }
    else if (v.phase === 'HOPPING' && lastPhase !== 'HOPPING') {
      await p.waitForTimeout(120);
      await shot(p, `${tag}-hop-${v.bot ? 'bot' : 'me'}.png`);
      if (v.bot) { await p.waitForTimeout(380); await shot(p, `${tag}-hop-bot-2.png`); }
    }
    else if (v.cardCam && lastPhase !== 'CARDCAM') {
      await shot(p, `${tag}-card-reveal.png`);
    }
    if (v.cardCam) lastPhase = 'CARDCAM'; else lastPhase = v.phase;
    await p.waitForTimeout(110);
  }
}

// ── 页面内小工具（mark 弹跳采样 / 入狱连拍采样）──
const markSamplerStart = () => {
  try {
    const G = __mono.state, i = G.players[G.turn].pos, mk = ownerMarks[i];
    if (!mk) return;
    window.__MK = { tile: i, t0: performance.now(), s: [] };
    const step = () => {
      if (!window.__MK) return;
      window.__MK.s.push({ t: +(performance.now() - window.__MK.t0).toFixed(0), sc: +mk.scale.x.toFixed(3), vis: mk.visible });
      if (performance.now() - window.__MK.t0 < 900) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } catch (e) {}
};
const markSamplerGet = () => { const m = window.__MK; window.__MK = null; return m; };
const jailBurstStart = (my) => {
  try {
    const G = __mono.state;
    const who = (my === undefined || my === null) ? G.turn : my;
    window.__JB = { t0: performance.now(), who, s: [], done: false };
    const step = () => {
      if (!window.__JB || window.__JB.done) return;
      const G2 = __mono.state, w = __mono.pawnWorld(), r = __mono.rigSnap();
      const p1 = G2.players[window.__JB.who];
      window.__JB.s.push({
        t: +(performance.now() - window.__JB.t0).toFixed(0), pos: p1.pos, jailed: p1.jailed,
        x: +w[window.__JB.who][0].toFixed(2), y: +w[window.__JB.who][1].toFixed(2), z: +w[window.__JB.who][2].toFixed(2),
        ad: r.autoDist, d: +r.dist.toFixed(2), e: +(r.elev * 57.3).toFixed(1), tx: +r.tgt.x.toFixed(2), tz: +r.tgt.z.toFixed(2),
      });
      if (performance.now() - window.__JB.t0 < 2400) requestAnimationFrame(step); else window.__JB.done = true;
    };
    requestAnimationFrame(step);
    setTimeout(() => { try { __mono.resolveAt(who, 18); } catch (e) {} }, 300);
  } catch (e) {}
};
const jailBurstGet = () => { const j = window.__JB; window.__JB = null; return j; };

const shot = async (p, name) => { try { await p.screenshot({ path: `${SHOTS}/${name}` }); console.log('  📷 ' + name); } catch (e) {} };
const dumpLog = async (p, name) => {
  try {
    const L = await p.evaluate(() => ({ sfx: __LOG.sfx, toast: __LOG.toast, phase: __LOG.phase, float: __LOG.float, cash: __LOG.cash, snap: __LOG.snap, hoplog: __LOG.hoplog || [] }));
    fs.writeFileSync(`${SHOTS}/${name}`, JSON.stringify(L));
    return L;
  } catch (e) { console.log('  dumpLog fail', e.message); return null; }
};
// 紧凑分析：SFX/toast/phase 时间轴合并 + HOPPING 窗口声音统计
function analyze(L, tag) {
  if (!L) return;
  const ev = [];
  L.phase.forEach(e => ev.push({ t: e.t, k: 'PHASE', s: `${e.ph}(P${e.turn}${e.bot ? '🤖' : ''})` }));
  L.sfx.forEach(e => ev.push({ t: e.t, k: 'SFX', s: e.n }));
  L.toast.forEach(e => ev.push({ t: e.t, k: 'toast', s: e.msg }));
  L.float.forEach(e => ev.push({ t: e.t, k: '¥', s: `P${e.pi} ${e.txt}` }));
  ev.sort((a, b) => a.t - b.t);
  console.log(`\n──── ${tag} 时间轴（SFX/toast/phase/金钱浮动）────`);
  ev.slice(0, 120).forEach(e => console.log(`${String(Math.round(e.t)).padStart(6)}ms [${e.k}] ${e.s}`));
  // HOPPING 窗口内的 SFX 统计（逐跳脚步声证据）
  const hops = []; let cur = null;
  L.snap.forEach(s => {
    if (s.ph === 'HOPPING' && !cur) cur = { a: s.t, b: s.t, bot: s.bot };
    else if (s.ph === 'HOPPING') { cur.b = s.t; }
    else if (cur) { hops.push(cur); cur = null; }
  });
  if (cur) hops.push(cur);
  console.log(`──── ${tag} HOPPING 窗口 ${hops.length} 个：`);
  hops.slice(0, 12).forEach(h => {
    const inWin = L.sfx.filter(x => x.t >= h.a - 20 && x.t <= h.b + 20).map(x => x.n);
    console.log(`  [${Math.round(h.a)}~${Math.round(h.b)}ms ${h.bot ? '🤖' : '人'}] 窗内SFX=[${inWin.join(',') || '无'}]`);
  });
  // 机器人 HOPPING 期镜头（dist/elev/autoDist 范围）
  const botHops = L.snap.filter(s => s.ph === 'HOPPING' && s.bot);
  if (botHops.length) {
    const ds = botHops.map(s => s.d), es = botHops.map(s => s.e), ads = [...new Set(botHops.map(s => s.ad))];
    console.log(`──── ${tag} 机器人 HOPPING 镜头采样 ${botHops.length} 个：dist[${Math.min(...ds).toFixed(2)}~${Math.max(...ds).toFixed(2)}] elev[${Math.min(...es).toFixed(0)}~${Math.max(...es).toFixed(0)}°] autoDist={${ads.join(',')}} tgt样例(${botHops[0].tx},${botHops[0].tz})→(${botHops[botHops.length - 1].tx},${botHops[botHops.length - 1].tz})`);
  } else console.log(`──── ${tag} 机器人 HOPPING 采样：无`);
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  console.log('server on :' + PORT);
  const browser = await chromium.launch();

  // ═══ Run A：桌面 1100×800 玩家主旅程（热座 + 座位2机器人 + 买地 + 税 + 入狱）═══
  if (!process.env.SKIP_A) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(INSTALL);
    // 像玩家一样检查设置屏：座位 2 是不是机器人
    const seats = await p.evaluate(() => [...document.querySelectorAll('.seat-row')].map(r => ({
      name: r.querySelector('input').value, bot: r.querySelector('.bot-toggle').classList.contains('on'),
    })));
    console.log('RunA 座位设置（默认）：', JSON.stringify(seats));
    await shot(p, 'persona-mono-sfx-a-setup.png');
    // 检查点：座位2必须为机器人（默认即 bot:true；若不是才去点）
    if (!seats[1] || !seats[1].bot) { await p.click('.seat-row:nth-child(2) .bot-toggle'); console.log('RunA 手动把座位2切成机器人'); }
    await p.evaluate(() => { document.getElementById('adv-box').open = true; });   // 展开高级项但不勾跳过交接（保留完整交接卡体验）
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase !== 'SETUP' && __mono.state.players.length > 0, null, { timeout: 15000 });
    await drive(p, 'persona-mono-sfx-a', 95000, { doJail: true, doTax: true });
    const LA = await dumpLog(p, 'persona-mono-sfx-runA.json');
    analyze(LA, 'RunA');
    // 终局面板若出现已截；关context
    await ctx.close();
  }

  // ═══ Run A2：640×520 动画保活档（软渲降级风险低）——入狱押送连拍 + 镜头逐跳采样 ═══
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(INSTALL);
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase !== 'SETUP' && __mono.state.players.length > 0, null, { timeout: 15000 });
    await drive(p, 'persona-mono-sfx-b', 80000, { doJail: true, doTax: true });
    // 入狱后观察：狱中回合 UI + 镜头，再赌一次双数
    const jailed = await p.evaluate(() => __mono.state.players[0].jailed).catch(() => false);
    console.log('RunA2 我是否在狱中：', jailed);
    if (jailed) {
      await p.waitForTimeout(600);
      await shot(p, 'persona-mono-sfx-b-jailed-ui.png');
      const rigJ = await p.evaluate(() => __mono.rigSnap());
      console.log('RunA2 狱中等待期镜头：', JSON.stringify(rigJ));
      const fine = await p.evaluate(() => !!document.getElementById('act-fine') && document.getElementById('act-fine').offsetParent !== null);
      if (fine) await p.click('#act-fine', { timeout: 1500 }).catch(() => {});
      else await p.click('#act-roll', { timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(1200);
    }
    const LB = await dumpLog(p, 'persona-mono-sfx-runA2.json');
    analyze(LB, 'RunA2');
    await ctx.close();
  }

  // ═══ Run B：竖屏 390×844（跳过交接，快节奏两三回合）═══
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('mono:nohandoff', '1'); } catch (e) {} });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(INSTALL);
    await shot(p, 'persona-mono-sfx-c-setup.png');
    await p.evaluate(() => { document.getElementById('adv-box').open = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase !== 'SETUP' && __mono.state.players.length > 0, null, { timeout: 15000 });
    await drive(p, 'persona-mono-sfx-c', 55000, { doJail: true, doTax: false });
    const LC = await dumpLog(p, 'persona-mono-sfx-runB.json');
    analyze(LC, 'RunB');
    await ctx.close();
  }

  // ═══ 汇总 ═══
  fs.writeFileSync(`${SHOTS}/persona-mono-sfx-bursts.json`, JSON.stringify({ jail: global.__JAIL || [], marks: global.__MARKS || [] }));
  console.log('\n════ 入狱连拍数据（棋子是否瞬移）════');
  (global.__JAIL || []).forEach(({ tag, jb }) => {
    console.log(`${tag}: 采样 ${jb.s.length} 帧（who=P${jb.who}）`);
    jb.s.forEach((s, i) => {
      const prev = jb.s[i - 1];
      const jump = prev && (prev.pos !== s.pos || Math.hypot(s.x - prev.x, s.z - prev.z) > 1.2);
      console.log(`  ${String(s.t).padStart(5)}ms pos=${s.pos} jailed=${s.jailed} world=(${s.x},${s.y},${s.z}) rig[ad=${s.ad} d=${s.d} e=${s.e}° tgt=(${s.tx},${s.tz})]${jump ? '  ←←← 位置跳变' : ''}`);
    });
  });
  console.log('\n════ 买地归属标记 bounce 采样（scale 0.01→≈1.15→1）════');
  (global.__MARKS || []).forEach(({ tag, tile, s }) => {
    console.log(`${tag}: tile=${tile} 帧 ${s.length}`);
    console.log('  ' + s.filter((_, i) => i % 2 === 0).map(x => `${x.t}ms:${x.sc}`).join(' '));
  });
  await browser.close();
  server.close();
  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
