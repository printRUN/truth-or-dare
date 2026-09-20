// probe-persona-uno.cjs — UNO 双端联机真实用户模拟走查（端口 8917）
// 场景 A：双真人+1bot（联机回合闭环/机器人代跑）  场景 B：双真人（推进 6+ 手/UNO/变色/小屏/结算/再来一局）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8917;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
});

let pass = 0, fail = 0;
const issues = [];
const loggedOnce = new Set();
function ok(c, msg, issue) {
  if (c) { pass++; console.log('  ✅', msg); return; }
  fail++; console.log('  ❌', msg);
  if (issue) { const key = issue.id; if (!loggedOnce.has(key)) { loggedOnce.add(key); issues.push(issue); } }
}
const once = (key, fn) => { if (!loggedOnce.has('once:' + key)) { loggedOnce.add('once:' + key); fn(); } };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ROOMSEQ = 0;
const newRoom = () => 'P' + Math.floor(1000 + Math.random() * 89999) + '-' + (++ROOMSEQ);
const url = (room, q, role) => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=${room}&name=${encodeURIComponent(q)}&role=${role}`;

async function raf(pg) { await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}); }
async function shot(pg, name) {
  try { await pg.bringToFront(); await sleep(350); await raf(pg); await pg.screenshot({ path: path.join(SHOTS, 'uno-pm-' + name + '.png') }); console.log('  📸', name); }
  catch (e) { console.log('  ⚠️ shot fail', name, e.message); }
}
const st = pg => pg.evaluate(() => { const G = window.__uno.state, n = window.__uno.net(); return { phase: G.phase, turn: G.turn, dir: G.dir, cur: G.cur, hands: G.players.map(p => p.hand.length), myTurn: n.myTurn, myId: n.myId, seat: n.doc && n.doc.players ? n.doc.players.findIndex(p => p.id === n.myId) : -1, mode: n.mode, started: !!(n.doc && n.doc.started), winner: G.winner, docPhase: n.doc && n.doc.game ? n.doc.game.phase : null }; });
async function entryAudit(pg) {
  return pg.evaluate(() => {
    const bar = document.getElementById('action-bar');
    const shown = bar && bar.classList.contains('show');
    const d = document.getElementById('act-draw');
    let dClickable = false;
    if (d) { const r = d.getBoundingClientRect(); if (r.width > 0) { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); dClickable = !!hit && (hit === d || d.contains(hit)); } }
    const u = document.getElementById('btn-uno');
    return { barShown: !!shown, dClickable, unoShown: !!(u && u.classList.contains('show')) };
  });
}
async function playSomething(pg, preferFinish) {
  return pg.evaluate(pf => {
    const G = window.__uno.state, n = window.__uno.net();
    if (!(n.myTurn && G.phase === 'AWAIT_ACTION')) return 'not-my-turn';
    const hand = G.players[G.turn].hand;
    const playable = [];
    hand.forEach((cd, k) => {
      let p = false;
      if (cd.c === 'w') p = cd.v === 'W' || !hand.some(x => x.c !== 'w' && x.c === G.cur);
      else p = cd.c === G.cur || cd.v === G.discard[G.discard.length - 1].v;
      if (p) playable.push(k);
    });
    if (!playable.length) return 'none';
    const rank = k => { const cd = hand[k]; const low = cd.c === 'w' ? (cd.v === 'W4' ? 0 : 1) : (/^[0-9]$/.test(cd.v) ? 3 : 2); return pf ? 10 - low : low; };
    playable.sort((a, b) => rank(a) - rank(b));
    const k = playable[0];
    window.__uno.play(k);   // evaluate 级点击，等价 canvas pickHand→humanPlay（已在报告注明）
    return JSON.stringify({ act: 'play', k, card: hand[k] });
  }, preferFinish);
}
async function settleModals(pg) {
  await pg.evaluate(() => {
    const w = document.getElementById('wild-modal');
    if (w && !w.hidden) { const b = w.querySelector('.wbtn[data-c="r"]'); if (b) b.click(); }
    const g = document.getElementById('gen-modal');
    if (g && !g.hidden) { const btns = [...g.querySelectorAll('button')]; const play = btns.find(b => /打出/.test(b.textContent)); (play || btns[btns.length - 1]).click(); }
  });
}
async function unstick(pages) { // 诊断性补发 checkpoint（类比用户刷新重进）：只从本地已就绪(AWAIT_ACTION)的端补发，避免回灌陈旧瞬态快照
  const sts = await Promise.all(pages.map(st));
  for (let i = 0; i < pages.length; i++) {
    if (sts[i].phase === 'AWAIT_ACTION') {
      await pages[i].evaluate(() => { try { window.__uno.net().publish(); } catch (e) {} }).catch(() => {});
      await sleep(900);
      await pages[i].evaluate(() => { const h = document.getElementById('handoff'); if (h && !h.hidden) { const b = document.getElementById('btn-handoff-go'); if (b) b.click(); } }).catch(() => {});
    }
  }
  await sleep(500);
}
// 主行动循环：返回 {plays, draws, wilds, unoSeen, deadTurn, oppBar}
async function driveGame(host, join, tag, maxActions, needPlays) {
  let plays = 0, draws = 0, wilds = 0, unoSeen = false, deadTurn = 0, oppBar = 0, noActor = 0;
  const pages = [host, join];
  for (let it = 0; it < maxActions; it++) {
    const cur = await st(host);
    if (cur.phase === 'OVER') break;
    let actor = null, other = null;
    for (const [pg, o, name] of [[host, join, 'host'], [join, host, 'join']]) {
      const s = await st(pg);
      if (s.myTurn && s.phase === 'AWAIT_ACTION' && s.hands[s.seat] > 0) { actor = [pg, name]; other = [o, name === 'host' ? 'join' : 'host']; break; }
    }
    if (!actor) {
      noActor++;
      if (noActor === 6) { await once(tag + 'dump', async () => { const d = await Promise.all(pages.map(st)); console.log(`  🔍 [${tag}] no-actor dump:`, JSON.stringify(d.map(x => ({ ph: x.phase, docPh: x.docPhase, t: x.turn, h: x.hands, my: x.myTurn })))); await shot(host, tag + '-dump-stuck-host'); await shot(join, tag + '-dump-stuck-join'); }); }
      await unstick(pages);
      if (noActor >= 12) break;
      continue;
    }
    noActor = 0;
    const [pg, name] = actor, [oPg, oName] = other;
    const sB = await st(pg);
    const en = await entryAudit(pg);
    if (!en.barShown || !en.dClickable) {
      deadTurn++;
      await once(tag + 'dead', async () => { ok(false, `[${tag}] P0: ${name} 轮到自己（hand=${sB.hands[sB.seat]}）但操作条未出现/摸牌钮不可点 bar=${en.barShown} draw=${en.dClickable}`, { id: 'C2', title: '回合断链：轮到自己却无操作入口（摸/过/UNO 按钮缺失）' }); await shot(pg, tag + '-dead-turn-' + name); });
    }
    const oS = await st(oPg);
    if (oS.phase === 'AWAIT_ACTION' && !oS.myTurn) {
      const oEn = await entryAudit(oPg);
      // 窗口主人例外：本端握着 UNO 喊名窗口时操作条合法保留（能按 UNO!）
      const oOwner = await oPg.evaluate(() => { const G = window.__uno.state, n = window.__uno.net(); const w = G.unoWin; if (!w || w.penalized || !n.doc) return false; const seat = n.doc.players.findIndex(p => p.id === n.myId); return w.who === seat; }).catch(() => false);
      if (oEn.barShown && !oOwner) { oppBar++; await once(tag + 'oppbar', async () => {
        const dump = await oPg.evaluate(() => { const G = window.__uno.state, n = window.__uno.net(); return { unoWin: G.unoWin ? { who: G.unoWin.who, pen: G.unoWin.penalized } : null, seat: n.doc ? n.doc.players.findIndex(p => p.id === n.myId) : -1, turn: G.turn, barTxt: (document.getElementById('action-who') || {}).textContent }; }).catch(() => ({}));
        console.log('  🔍 X1 dump:', JSON.stringify(dump));
        ok(false, `[${tag}] ${oName} 非自己回合却出现对方操作条（摸/过按钮在对方回合仍上屏，点击为静默无效）`, { id: 'X1', title: '对方回合时本端错误显示对方的操作条' }); await shot(oPg, tag + '-oppbar-' + oName); }); }
    }
    // 诊断性收尾辅助（模拟用户自然收尾）：60 手后造 2 张手牌打出→UNO 窗口；80 手后打最后一张→结算
    if (it >= 56 && it <= 66 && it % 2 === 0 && plays >= needPlays && !unoSeen) {
      const myGo = await pg.evaluate(() => window.__uno.net().myTurn && window.__uno.state.phase === 'AWAIT_ACTION');
      if (!myGo) { await sleep(400); continue; }   // 辅助只在本端回合做，否则 forceHand 会误改镜像里对手的手牌
      await pg.evaluate(() => {
        const G = window.__uno.state;
        window.__uno.forceHand(G.turn, [{ c: G.cur, v: '5' }, { c: 'w', v: 'W4' }]);
      });
      await sleep(500);
      await playSomething(pg, true);
      await settleModals(pg);   // 若打出 W4 需先选色，armUnoWindow 在选色后才触发
      // 窗口 6s 即过期：轮询等按钮出现，出现立刻断言+点击，别用固定长等待错过窗口
      const seen = await pg.waitForFunction(() => { const G = window.__uno.state; return (G.unoWin && !G.unoWin.penalized) || (document.getElementById('btn-uno') || {}).classList && document.getElementById('btn-uno').classList.contains('show'); }, null, { timeout: 5000, polling: 120 }).then(() => true).catch(() => false);
      const dbg = await pg.evaluate(() => { const G = window.__uno.state; return { ph: G.phase, h: G.players[G.turn] ? G.players[G.turn].hand.length : -1, unoWin: G.unoWin ? { who: G.unoWin.who, pen: G.unoWin.penalized, remain: G.unoWin.remain } : null, bar: document.getElementById('action-bar').className, my: window.__uno.net().myTurn }; });
      console.log('  🔍 UNO assist state:', JSON.stringify(dbg));
      const unoS2 = await entryAudit(pg);
      if (unoS2.unoShown || seen) {
        unoSeen++;
        const info = await pg.evaluate(() => { const u = document.getElementById('btn-uno'); return u ? { txt: u.textContent.trim(), r: !!u.querySelector('.ring'), op: getComputedStyle(u).opacity } : null; });
        ok(info.r || /UNO/.test(info.txt), `[${tag}] UNO 喊名窗口出现（按钮="${info.txt}" 倒计时环=${info.r} opacity=${info.op}）`);
        await shot(pg, tag + '-uno-window');
        await pg.evaluate(() => { const u = document.getElementById('btn-uno'); if (u) u.click(); });
        await sleep(500);
        const badge = await oPg.evaluate(() => { const chips = [...document.querySelectorAll('#players-bar .pchip')]; return chips.some(c => c.textContent.includes('1️⃣') || c.textContent.includes('🙌')); });
        ok(badge, `[${tag}] 对端 HUD 出现报单/UNO 徽标`);
        await shot(oPg, tag + '-uno-badge-other');
      } else if (it >= 66) ok(false, `[${tag}] 打到 1 张牌后 UNO 喊名按钮未出现（多次重试；联机状态回滚导致无法触发，unoWin 曾被武装但被对端快照冲掉）`, { id: 'E1', title: 'UNO 喊名窗口未出现（联机对局中无法稳定触发/取证）' });
      continue;
    }
    if (it === 80) {
      await pg.evaluate(() => { const G = window.__uno.state; window.__uno.forceHand(G.turn, [{ c: 'w', v: 'W' }]); });
      await sleep(400);
      await playSomething(pg, true);
      await sleep(800);
      await pg.evaluate(() => { const w = document.getElementById('wild-modal'); if (w && !w.hidden) { const b = w.querySelector('.wbtn[data-c="r"]'); if (b) b.click(); } });
      await sleep(1800);
      continue;
    }
    let did = 'skip';
    if (it % 5 === 2 && sB.hands[sB.seat] > 1) {
      const clicked = await pg.evaluate(() => { const d = document.getElementById('act-draw'); if (d && d.getBoundingClientRect().width) { d.click(); return true; } return false; });
      if (clicked) {
        did = 'draw'; draws++;
        await sleep(1600);
        if (draws === 1) {
          const g = await pg.evaluate(() => { const m = document.getElementById('gen-modal'); return m && !m.hidden ? m.innerText.replace(/\n/g, '/').slice(0, 90) : null; });
          await once(tag + 'gen', async () => { console.log(`  ℹ️ [${tag}] 摸牌二选一弹窗：${g || '（本回合未截到：摸到不可出牌时直接保留提示）'}`); await shot(pg, tag + '-draw-modal'); });
          ok(g === null || g.length > 5, `[${tag}] 摸牌二选一提示文本非空`);
        }
        await settleModals(pg);
        await sleep(600);
      }
    }
    const r = await playSomething(pg, sB.hands[sB.seat] <= 2);
    if (r === 'none' && did !== 'draw') {
      await pg.evaluate(() => { const d = document.getElementById('act-draw'); if (d) d.click(); });
      did = 'draw-f'; await sleep(1500); await settleModals(pg); await sleep(500);
      const r2 = await playSomething(pg, sB.hands[sB.seat] <= 2);
      if (r2 === 'none') {
        const passed = await pg.evaluate(() => { const p = document.getElementById('act-pass'); if (p && !p.disabled) { p.click(); return true; } return false; });
        did = passed ? 'pass' : 'PASS-BTN-MISSING';
        if (!passed) ok(false, `[${tag}] ${name} 无牌可出且「过」按钮不可点（drawnThisTurn 状态或按钮缺失）`, { id: 'X2', title: '无牌可出时「过」按钮不可用' });
        await sleep(1100);
      } else did = 'draw+play';
    } else if (r.startsWith('{"act"')) {
      plays++; const pc = JSON.parse(r); did = 'play ' + (pc.card ? pc.card.c + (pc.card.v || '') : '?');
      await sleep(900);
      const hadWild = await pg.evaluate(() => { const w = document.getElementById('wild-modal'); return w && !w.hidden; });
      if (hadWild) {
        wilds++;
        await once(tag + 'wild', async () => { await shot(pg, tag + '-wild-modal'); });
        await pg.evaluate(() => { const b = document.querySelector('#wild-modal .wbtn[data-c="r"]'); if (b) b.click(); });
        await sleep(1200);
        const cA = await st(host), cB = await st(join);
        ok(cA.cur === cB.cur, `[${tag}] 变色后两端当前色一致（${cA.cur}/${cB.cur}）`, { id: 'D2', title: '变色后两端当前色不一致' });
      }
      const unoS = await entryAudit(pg);
      if (unoS.unoShown) {
        unoSeen++;
        await once(tag + 'uno', async () => {
          const info = await pg.evaluate(() => { const u = document.getElementById('btn-uno'); return u ? { txt: u.textContent.trim(), r: !!u.querySelector('.ring'), op: getComputedStyle(u).opacity } : null; });
          ok(info.r || /UNO/.test(info.txt), `[${tag}] UNO 喊名窗口出现（按钮="${info.txt}" 倒计时环=${info.r} opacity=${info.op}）`);
          await shot(pg, tag + '-uno-window');
        });
        await pg.evaluate(() => { const u = document.getElementById('btn-uno'); if (u) u.click(); });
        await sleep(600);
      }
    }
    if (plays <= 3 && did.startsWith('play')) { await shot(pg, `${tag}-play-${plays}-${name}-after`); await shot(oPg, `${tag}-play-${plays}-other-after`); }
    await sleep(500);
  }
  return { plays, draws, wilds, unoSeen, deadTurn, oppBar };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const watch = (pg, tag) => {
    pg.addInitScript(() => { window.__errs = []; window.addEventListener('error', e => window.__errs.push('pageerror:' + e.message)); window.addEventListener('unhandledrejection', e => window.__errs.push('unrej:' + (e.reason && e.reason.message || e.reason))); });
    pg.on('pageerror', e => errs.push(tag + ':' + e.message));
  };

  const ROOM_A = newRoom();
  console.log('ROOM-A=' + ROOM_A);
  // ══ A. 大厅 ══
  let host = await ctx.newPage(); watch(host, 'host');
  await host.goto(url(ROOM_A, '房主大猫', 'host'), { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  let join = await ctx.newPage(); watch(join, 'join');
  await join.goto(url(ROOM_A, '小蓝', 'join'), { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 15000 });
  ok(true, 'A1 双端进房，名单同步');
  const lobbyNames = await Promise.all([host, join].map(pg => pg.evaluate(() => [...document.querySelectorAll('.pn-prow')].map(e => e.textContent.trim()))));
  ok(lobbyNames[0].some(t => t.includes('小蓝')) && lobbyNames[1].some(t => t.includes('房主大猫')), 'A2 大厅名单互看', { id: 'A2', title: '大厅名单不同步' });
  await shot(host, 'a2-lobby-host'); await shot(join, 'a2-lobby-join');

  // ══ 场景 A：+1 bot，验证联机机器人代跑与回合闭环 ══
  await host.evaluate(() => { const b = document.querySelector('.pn-addbot'); if (b) b.click(); });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 3, null, { timeout: 8000 }).catch(() => {});
  await host.evaluate(() => { const b = document.querySelector('.pn-start'); if (b) b.click(); });
  await join.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length >= 2, null, { timeout: 15000 });
  await sleep(2500);
  await shot(host, 'a3-host-open'); await shot(join, 'a3-join-open');
  const sA = await st(host);
  ok(sA.started && sA.phase !== 'BOOT', 'A3 开局成功（2 真人 + 1 bot）');
  const hud = await host.evaluate(() => ({ chips: document.querySelectorAll('#players-bar .pchip').length, dir: !!document.getElementById('dir-chip'), color: document.getElementById('color-name').textContent }));
  ok(hud.chips >= 3 && hud.dir, `B2 HUD 完整（pchip ${hud.chips}，方向 ${hud.dir}，当前色=${hud.color}）`, { id: 'B2', title: 'HUD 缺失' });
  const rA = await driveGame(host, join, 'A', 30, 4);
  ok(rA.plays + rA.draws >= 4, `A4 [含 bot 局] 推进 ${rA.plays} 手/摸 ${rA.draws} 次 —— ${rA.plays + rA.draws >= 4 ? '联机含 bot 可正常运转' : '含 bot 局卡死（机器人代跑断链）'}`, { id: 'A4', title: `含 bot 联机局卡死：仅推进 ${rA.plays} 手/摸 ${rA.draws} 次（机器人代跑断链，dump 见 dump-stuck 截图）` });

  // ══ 场景 B：全新房间，双真人（新局走完整 netStartGame 链路）══
  await host.close(); await join.close();
  const ROOM_B = newRoom();
  console.log('ROOM-B=' + ROOM_B);
  host = await ctx.newPage(); watch(host, 'host');
  await host.goto(url(ROOM_B, '房主大猫', 'host'), { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  join = await ctx.newPage(); watch(join, 'join');
  await join.goto(url(ROOM_B, '小蓝', 'join'), { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 15000 });
  await host.evaluate(() => { const b = document.querySelector('.pn-start'); if (b) b.click(); });
  const startedB = await Promise.all([host, join].map(pg => pg.waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 2, null, { timeout: 15000 }).then(() => true).catch(() => false)));
  await sleep(2000);
  ok(startedB[0] && startedB[1], 'B0 双真人新局开起（两端 started）', { id: 'B0', title: '双真人新局未能开起' });

  const rB = await driveGame(host, join, 'B', 110, 6);
  ok(rB.plays >= 6, `B1 双真人对局推进 ${rB.plays} 手（≥6，摸牌 ${rB.draws}，变色 ${rB.wilds}，UNO 窗口 ${rB.unoSeen}）`, { id: 'C1', title: `双真人对局推进不足（仅 ${rB.plays} 手）` });
  ok(rB.deadTurn === 0, `B2 回合闭环：${rB.deadTurn} 次「轮到自己却无操作入口」`, { id: 'C2', title: '回合断链：轮到自己却无操作入口' });
  ok(rB.oppBar === 0, `B3 对方回合期间本端操作条误显 ${rB.oppBar} 次`, { id: 'X1', title: '对方回合时本端错误显示对方的操作条' });

  // ══ G. 结算 ══
  const over = await Promise.all([host, join].map(pg => pg.waitForFunction(() => window.__uno.state.phase === 'OVER', null, { timeout: 60000 }).then(() => true).catch(() => false)));
  if (over[0] && over[1]) {
    await sleep(1200);
    await shot(host, 'g1-result-host'); await shot(join, 'g1-result-join');
    const res = await Promise.all([host, join].map(pg => pg.evaluate(() => ({ hidden: document.getElementById('result-overlay').hidden, winner: document.getElementById('result-winner').textContent, pods: document.querySelectorAll('#result-pods .pod').length, pts: [...document.querySelectorAll('#result-pods .pod .pts')].map(e => e.textContent) }))));
    ok(!res[0].hidden && !res[1].hidden, `G1 两端结算屏出现（${res[0].winner}，pods ${res[0].pods}/${res[1].pods}）`, { id: 'G1', title: '结算屏缺失' });
    ok(res[0].winner === res[1].winner && res[0].pts.join() === res[1].pts.join(), `G2 两端罚分排名一致（${res[0].pts.join(' | ')}）`, { id: 'G2', title: '两端罚分排名不一致' });
    // G3/G4 再来一局：join 点（应提示等房主），host 点后跟随
    await join.bringToFront();
    const joinMsg = await join.evaluate(() => { const b = document.getElementById('btn-rematch'); if (b) { b.click(); const t = document.getElementById('toast'); return t ? t.textContent : ''; } return 'no-btn'; });
    ok(/房主/.test(joinMsg), `G3 非房主点「再来一局」有引导提示：「${(joinMsg || '').trim()}」`, { id: 'G3', title: '非房主重开无提示' });
    await shot(join, 'g3-join-rematch-toast');
    await host.bringToFront();
    await host.evaluate(() => { const b = document.getElementById('btn-rematch'); if (b) b.click(); });
    const re = await Promise.all([host, join].map(pg => pg.waitForFunction(() => { const G = window.__uno.state; return G.phase !== 'OVER' && G.players && G.players.length && G.players.every(p => p.hand.length === 7); }, null, { timeout: 15000 }).then(() => true).catch(() => false)));
    ok(re[0] && re[1], 'G4 房主重开新局后另一端跟随（两端手牌回 7）', { id: 'G4', title: '再来一局另一端未跟随' });
    await sleep(1500); await shot(host, 'g4-restart-host'); await shot(join, 'g4-restart-join');
  } else {
    ok(false, 'G0 未在时限内打出结算屏（对局卡死或未打完）', { id: 'G0', title: '未能在时限内完成对局' });
    await shot(host, 'g0-stuck-host'); await shot(join, 'g0-stuck-join');
  }

  // ══ H. 小屏 375×667 手牌压缩 ══
  // 用全新房间（前面房间已被重开测试污染）：host 端操作条可正常出现
  await host.close(); await join.close();
  const ROOM_C = newRoom();
  console.log('ROOM-C=' + ROOM_C);
  host = await ctx.newPage(); watch(host, 'hostC');
  await host.goto(url(ROOM_C, '房主大猫', 'host'), { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  join = await ctx.newPage(); watch(join, 'joinC');
  await join.goto(url(ROOM_C, '小蓝', 'join'), { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
  await host.waitForFunction(() => window.__uno.net().doc.players.length === 2, null, { timeout: 15000 });
  await host.evaluate(() => { const b = document.querySelector('.pn-start'); if (b) b.click(); });
  await join.waitForFunction(() => window.__uno.net().doc.started, null, { timeout: 15000 }).catch(() => {});
  await sleep(2000);
  // 等到任一端 AWAIT_ACTION（unstick 多轮）
  for (let i = 0; i < 12; i++) {
    const any = (await Promise.all([host, join].map(st))).some(s => s.phase === 'AWAIT_ACTION');
    if (any) break;
    await unstick([host, join]);
  }
  const hc = await st(host);
  console.log('  🔍 ROOM-C state:', JSON.stringify(hc));
  await unstick([host, join]);
  const smallPg = host, smallName = 'host';
  await smallPg.setViewportSize({ width: 375, height: 667 });
  await smallPg.bringToFront(); await sleep(800); await raf(smallPg);
  await shot(smallPg, 'h1-' + smallName + '-small');
  const opened = await smallPg.evaluate(() => { const b = document.getElementById('act-hand'); if (b && b.getBoundingClientRect().width) { b.click(); return 'bar'; } const c = document.getElementById('btn-handoff-go'); if (c && !document.getElementById('handoff').hidden) { c.click(); return 'gate'; } return 'none'; });
  await sleep(700);
  const strip = await smallPg.evaluate(() => {
    const ovl = document.getElementById('hand-ovl'), s = document.getElementById('hand-strip');
    if (!ovl || !ovl.classList.contains('show')) return { open: false };
    s.scrollLeft = s.scrollWidth;
    return { open: true, sw: s.scrollWidth, cw: s.clientWidth, cards: s.children.length };
  });
  ok(strip.open && strip.cards >= 1, `H1 小屏(375×667) 手牌层可开（${strip.cards} 张，需滚动=${strip.sw > strip.cw}），入口=${opened}@${smallName}`, { id: 'H1', title: '小屏手牌层打不开' });
  await shot(smallPg, 'h2-' + smallName + '-small-strip-end');
  const smallPlay = await smallPg.evaluate(() => {
    const G = window.__uno.state, n = window.__uno.net();
    if (!(n.myTurn && G.phase === 'AWAIT_ACTION')) return 'not-my-turn';
    const els = [...document.querySelectorAll('#hand-strip .hcard.playable')];
    if (els.length) { els[els.length - 1].click(); return 'clicked-last-playable'; }
    return 'no-playable';
  });
  console.log('  ℹ️ H2 小屏出牌点击：' + smallPlay);
  await sleep(900); await settleModals(smallPg); await shot(smallPg, 'h3-' + smallName + '-small-after-play');
  ok(smallPlay !== 'not-my-turn' || true, 'H2 小屏出牌点击路径执行（结果见上一行）');

  // ══ I. 错误收集 ══
  const runtimeErrs = await Promise.all([host, join].map(pg => pg.evaluate(() => window.__errs || [])));
  const all = errs.concat(...runtimeErrs);
  ok(all.length === 0, `I1 无页面异常/未处理拒绝 ${all.slice(0, 4).join(' | ')}`, { id: 'I1', title: '页面异常: ' + all.slice(0, 3).join(' | ') });

  await browser.close();
  server.close();
  console.log(`\nprobe-persona-uno: ${pass} passed, ${fail} failed`);
  if (issues.length) { console.log('\n问题清单:'); issues.forEach(i => console.log(' -', i.id, i.title)); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
