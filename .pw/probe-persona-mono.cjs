// probe-persona-mono.cjs — 大富翁双端联机真实用户模拟走查（镜头/相机 + 游戏内部使用）
// 只用真实 DOM 点击推进（不用 __mono.step/forcePos）；__mono 仅作观察断言；forceMoney 仅在收尾兜底促结算并注明。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8915;
const ROOM = '73915';
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let shotN = 0;
async function shot(pg, name) {
  try { await pg.bringToFront(); await pg.waitForTimeout(420); await pg.screenshot({ path: path.join(SHOTS, `mono-pm-${name}.png`) }); shotN++; console.log('  📷', name); }
  catch (e) { console.log('  ⚠️ shot fail', name, e.message.split('\n')[0]); }
}
// 观察器：相机位置（包 THREE.PerspectiveCamera.prototype.lookAt）+ 未处理拒绝
const INIT = `
window.__errs = []; window.__camlog = [];
window.addEventListener('unhandledrejection', e => window.__errs.push('rej:' + String(e.reason && e.reason.message || e.reason)));
window.addEventListener('error', e => window.__errs.push('err:' + String(e.message)));
let _t; Object.defineProperty(window, 'THREE', { configurable: true,
  set(v) { _t = v;
    const tryPatch = () => { try { const P = v.PerspectiveCamera; if (!P || !P.prototype) return false; const la = P.prototype.lookAt;
      P.prototype.lookAt = function (...a) { try { const L = window.__camlog; const p = this.position;
        const rec = p.x.toFixed(2) + '|' + p.y.toFixed(2) + '|' + p.z.toFixed(2);
        if (!L.length || L[L.length - 1].c !== rec) L.push({ t: Date.now(), c: rec, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
        if (L.length > 4000) L.shift(); } catch (e2) {}
        return la.apply(this, a); };
      return true; } catch (e) { return false; } };
    let n = 0; const iv = setInterval(() => { if (tryPatch() || ++n > 200) clearInterval(iv); }, 50);
  },
  get() { return _t; } });
`;

const st = pg => pg.evaluate(() => {
  const G = window.__mono && window.__mono.state || {};
  const n = window.__mono && window.__mono.net ? window.__mono.net() : {};
  const bar = document.getElementById('action-bar');
  const roll = document.getElementById('act-roll');
  const buy = document.getElementById('buy-modal');
  return {
    phase: G.phase, turn: G.turn, pos: G.players && G.players[G.turn] ? G.players[G.turn].pos : -1,
    cash: G.players ? G.players.map(p => p.cash) : [], owners: G.owners ? G.owners.join('') : '',
    myTurnNet: !!(n.joined && n.doc && n.doc.started && n.doc.players && n.doc.players[G.turn] && n.doc.players[G.turn].id === n.myId),
    barShown: !!(bar && bar.classList.contains('show')),
    rollVisible: !!(roll && roll.offsetParent !== null),
    buyOpen: !!(buy && !buy.hidden),
    genOpen: !!(document.getElementById('gen-modal') && !document.getElementById('gen-modal').hidden),
    cam: window.__camlog && window.__camlog.length ? window.__camlog[window.__camlog.length - 1] : null,
    pawns: window.__mono && window.__mono.sceneInfo ? window.__mono.sceneInfo().pawns : -1,
  };
});
const camOf = pg => pg.evaluate(() => window.__camlog[window.__camlog.length - 1] || null);
const waitPhase = (pg, phases, t = 15000) => pg.waitForFunction(ps => ps.includes(window.__mono.state.phase), phases, { timeout: t, polling: 250 }).then(() => true).catch(() => false);

// 真实点击 #act-roll（带 covers 断言），返回点击信息
async function clickRoll(pg) {
  const info = await pg.evaluate(() => {
    const b = document.getElementById('act-roll');
    if (!b || b.offsetParent === null) return { ok: false, why: 'no-roll-btn' };
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: true, covered: !(el === b || b.contains(el)), coverTag: el ? el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') : 'null' };
  });
  if (!info.ok) return info;
  if (info.covered) console.log('  ⚠️ act-roll 被遮挡 by', info.coverTag);
  else { await pg.evaluate(() => document.getElementById('act-roll').click()); }   // elementFromPoint 已验证可达；用 DOM click 保证确定性（坐标点击在软渲下偶发丢帧）
  return info;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  const errs = [];
  const mkPage = async () => { const pg = await ctx.newPage(); pg.addInitScript(INIT); pg.on('pageerror', e => errs.push(e.message.slice(0, 160))); return pg; };
  const host = await mkPage(), join = await mkPage();
  const pages = [host, join];
  const url = q => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=${ROOM}&q=${q}`;
  const camTrace = [];

  /* ═══ A. 大厅：建房 → 加入（起名）→ 互看名单 ═══ */
  console.log('A. 大厅联机流程');
  await host.goto(url('host') + '&role=host', { waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 20000 });
  await join.goto(url('join') + '&role=join&name=小绿', { waitUntil: 'domcontentloaded' });
  await join.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 20000 });
  await host.waitForFunction(() => window.__mono.net().doc.players.length === 2, null, { timeout: 10000 });
  const hLobby = await host.evaluate(() => window.__mono.net().doc.players.map(p => p.name));
  const jLobby = await join.evaluate(() => window.__mono.net().doc.players.map(p => p.name));
  ok(hLobby.length === 2 && jLobby.length === 2 && hLobby.includes('小绿') && jLobby.includes('小绿'), `两端大厅名单一致 ${JSON.stringify(hLobby)}/${JSON.stringify(jLobby)}`);
  await shot(host, 'A-lobby-host'); await shot(join, 'A-lobby-join');

  /* ═══ B. 房主真实点击开局（局长 15 缩短） ═══ */
  console.log('B. 开局');
  await host.evaluate(() => { const s = document.querySelector('.pn-lobby-extra #net-round'); s.value = '15'; s.dispatchEvent(new Event('change')); });
  await host.evaluate(() => document.querySelector('.pn-start').click());
  for (let i = 0; i < 10; i++) {
    const ph = await st(host);
    console.log(`  · t+${i * 500}ms host phase=${ph.phase} turn=${ph.turn} bar=${ph.barShown}`);
    if (ph.phase !== 'SETUP' && ph.phase !== 'BOOT') break;
    await sleep(500);
  }
  const startedH = await waitPhase(host, ['HANDOFF', 'AWAIT_ROLL', 'ROLLING', 'HOPPING', 'RESOLVE'], 12000);
  const startedJ = await waitPhase(join, ['HANDOFF', 'AWAIT_ROLL', 'ROLLING', 'HOPPING', 'RESOLVE'], 12000);
  ok(startedH, 'host 开局进入对局');
  ok(startedJ, 'join 收到开局快照并进入对局');
  ok((await st(host)).pawns === 2 && (await st(join)).pawns === 2, '双端棋子已摆（pawns=2）');
  await shot(host, 'B-start-host'); await shot(join, 'B-start-join');
  for (const pg of pages) camTrace.push(['B-start', await camOf(pg)]);

  /* ═══ C/D. 对局推进：真人真实点击掷骰 / 购买 / 事件格；观察双端镜头 ═══ */
  console.log('C. 联机对局推进（真实点击）');
  let bought = false, moveShots = 0, stuckJoin = false, rounds = 0, stuckN = 0, stuckN2 = 0;
  const t0 = Date.now();
  for (let i = 0; i < 200 && Date.now() - t0 < 300000; i++) {
    const sH = await st(host), sJ = await st(join);
    if (sH.phase === 'OVER' || sJ.phase === 'OVER') break;
    const mine = sH.myTurnNet ? host : (sJ.myTurnNet ? join : null);
    if (!mine) {
      // 轮到 join（座位1）却持续没有任何掷骰按钮 → 联机回合断链取证
      if (sH.turn === 1 && !sJ.rollVisible && !sH.rollVisible && !sJ.buyOpen) {
        stuckN++;
        if (stuckN === 12) {
          stuckJoin = true;
          ok(false, `轮到 join(座位1) 但两端都无掷骰按钮（join barShown=${sJ.barShown} phase=${sJ.phase}）→ 联机回合断链`);
          await shot(join, 'D-join-turn-stuck');
          await shot(host, 'D-host-view-during-join-turn');
          console.log('  · join 端 typeof applyGameSnapshot =', await join.evaluate(() => typeof applyGameSnapshot));
        }
        if (stuckN > 40) break;
      } else stuckN = 0;
      await sleep(400); continue;
    }
    const s = mine === host ? sH : sJ;
    const other = mine === host ? join : host;
    if (s.genOpen) { await mine.evaluate(() => { const b = document.querySelector('#gen-actions .btn-primary, #gen-actions button'); if (b) b.click(); }); await sleep(500); continue; }
    // —— 购买弹窗（真实点击）——
    if (s.buyOpen) {
      const canAfford = await mine.evaluate(() => !document.getElementById('btn-buy-yes').disabled);
      await shot(mine, bought || !canAfford ? 'D-buyX-before' : 'C-buy-before');
      camTrace.push(['buy-before', await camOf(mine)]);
      await mine.evaluate(() => document.getElementById(document.getElementById('btn-buy-yes').disabled ? 'btn-buy-no' : 'btn-buy-yes').click());
      await sleep(900);
      await shot(mine, bought || !canAfford ? 'D-buyX-after' : 'C-buy-after');
      camTrace.push(['buy-after', await camOf(mine)]);
      bought = true; continue;
    }
    if (!s.rollVisible) {
      // 轮到本端（myTurnNet）却既无购买弹窗也无掷骰按钮 → 联机回合断链取证
      stuckN2++;
      if (stuckN2 === 12) {
        stuckJoin = true;
        ok(false, `轮到 ${mine === host ? 'host' : 'join'} 但本端无掷骰按钮也无购买弹窗（barShown=${s.barShown} phase=${s.phase}）→ 联机回合断链`);
        await shot(mine, 'D-join-turn-stuck');
        await shot(other, 'D-other-view-during-stuck');
        console.log('  · 端上 typeof applyGameSnapshot =', await mine.evaluate(() => typeof applyGameSnapshot));
      }
      if (stuckN2 > 40) break;
      await sleep(400); continue;
    }
    stuckN2 = 0;
    // —— 掷骰（真实点击 + 移动中镜头采样）——
    const click = await clickRoll(mine);
    ok(click.ok, `${mine === host ? 'host' : 'join'} 真实点击掷骰按钮（被遮挡=${click.covered}）`);
    if (click.covered) await shot(mine, 'E-roll-covered');
    const samples = [];
    for (let k = 0; k < 16; k++) {
      const a = await st(mine), o = await camOf(other);
      samples.push({ ph: a.phase, pos: a.pos, cam: a.cam, otherCam: o });
      if (a.phase !== 'ROLLING' && a.phase !== 'HOPPING' && k > 3) break;
      await sleep(150);
    }
    const hop = samples.filter(s2 => s2.ph === 'HOPPING' && s2.cam);
    if (hop.length >= 2) {
      const azs = hop.map(s2 => +Math.atan2(s2.cam.x, s2.cam.z).toFixed(3));
      const azSettled = new Set(azs).size <= 1;
      camTrace.push(['hopping', hop[0].cam, hop[hop.length - 1].cam]);
      console.log(`  · 移动中镜头采样 ${hop.length} 帧：az ${JSON.stringify([...new Set(azs)])} → ${azSettled ? '镜头未跟随棋子' : '镜头有变化'}`);
    }
    await waitPhase(mine, ['RESOLVE', 'AWAIT_ROLL', 'OVER', 'HANDOFF'], 20000);
    await sleep(600);
    if (moveShots === 0) { await shot(mine, `C-move1-actor-${mine === host ? 'host' : 'join'}`); await shot(other, 'C-move1-remote'); moveShots++; }
    else if (moveShots < 4) { await shot(mine, `D-move${moveShots + 1}-actor`); moveShots++; }
    camTrace.push(['after-move', await camOf(mine), await camOf(other)]);
    rounds++;
  }

  /* ═══ E. 联机局结论（若断链则注明） ═══ */
  console.log('E. 联机局状态汇总');
  const sH = await st(host), sJ = await st(join);
  ok(sH.phase === sJ.phase && sH.turn === sJ.turn, `两端状态一致 phase=${sH.phase}/${sJ.phase} turn=${sH.turn}/${sJ.turn}`);
  ok(JSON.stringify(sH.cash) === JSON.stringify(sJ.cash), `两端现金一致 ${JSON.stringify(sH.cash)}`);
  if (!stuckJoin && sH.phase !== 'OVER') {
    console.log('  · 联机局未自然到 OVER（回合断链或时长所限），结论以取证为准');
  }

  /* ═══ F. 热座兜底走查：完整 6+ 回合（真实点击）+ 镜头全程采样 + 结算/再来一局 ═══
     （联机真人对真人若被 P0 断链阻塞，热座同一状态机/同一镜头系统，走查仍有效） */
  console.log('F. 热座完整对局走查（相机/按钮闭环）');
  const hs = await mkPage();
  await hs.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
  await hs.waitForFunction(() => window.__mono && window.__mono.state && window.__mono.state.phase !== 'BOOT' && window.__mono.state.phase !== 'SETUP', null, { timeout: 20000 });
  ok(true, '热座 autotest 自动开局（测试员+机器人甲）');
  await shot(hs, 'F-hs-start');
  let hsShots = 0, hsRounds = 0, hsBuy = false, usedForce = false, hsOver = false;
  const t1 = Date.now();
  for (let i = 0; i < 900 && Date.now() - t1 < 480000; i++) {
    const s = await st(hs);
    if (s.phase === 'OVER') { hsOver = true; break; }
    if (s.genOpen) {
      await hs.evaluate(() => { const b = document.querySelector('#gen-actions .btn-primary, #gen-actions button'); if (b) b.click(); });
      await sleep(400); continue;
    }
    if (s.buyOpen) {
      const dis = await hs.evaluate(() => document.getElementById('btn-buy-yes').disabled);
      if (hsShots < 8) { await shot(hs, dis ? 'F-hs-buyX-before' : (hsBuy ? 'F-hs-buy2-before' : 'F-hs-buy-before')); }
      camTrace.push(['hs-buy-before', await camOf(hs)]);
      await hs.evaluate(() => document.getElementById(document.getElementById('btn-buy-yes').disabled ? 'btn-buy-no' : 'btn-buy-yes').click());
      await sleep(700);
      if (hsShots < 8) { await shot(hs, dis ? 'F-hs-buyX-after' : (hsBuy ? 'F-hs-buy2-after' : 'F-hs-buy-after')); hsShots++; }
      camTrace.push(['hs-buy-after', await camOf(hs)]);
      hsBuy = true; continue;
    }
    if (!s.rollVisible) {
      if (i % 25 === 0) console.log(`  · [idle i=${i}] phase=${s.phase} turn=${s.turn} roll=${s.rollVisible} buy=${s.buyOpen} jail=${JSON.stringify((await hs.evaluate(() => window.__mono.state.players.map(p => p.jailed))))}`);
      await sleep(300); continue;
    }
    const before = await camOf(hs);
    const click = await clickRoll(hs);
    if (!click.ok) { await sleep(400); continue; }
    ok(!click.covered, `热座第${hsRounds + 1}次掷骰按钮可达（无遮挡）`);
    // 采样移动镜头
    const hops = [];
    for (let k = 0; k < 14; k++) {
      const s2 = await st(hs);
      if (s2.phase === 'HOPPING') hops.push({ cam: s2.cam, pos: s2.pos });
      if (s2.phase !== 'ROLLING' && s2.phase !== 'HOPPING' && k > 3) break;
      await sleep(150);
    }
    if (hsRounds < 3 && hops.filter(h => h.cam).length >= 2) {
      const azs = hops.filter(h => h.cam).map(h => Math.atan2(h.cam.x, h.cam.z).toFixed(3));
      console.log(`  · 热座移动中镜头 az ${JSON.stringify(azs)}`);
      camTrace.push(['hs-hopping', hops[0].cam, hops[hops.length - 1].cam]);
    }
    await waitPhase(hs, ['RESOLVE', 'AWAIT_ROLL', 'OVER', 'HANDOFF'], 25000);
    await sleep(400);
    hsRounds++;
    console.log(`  · 热座第${hsRounds}回合完成（累计 ${(Date.now() - t1) / 1000 | 0}s, phase=${s.phase}）`);
    if (hsRounds <= 6 || hsRounds % 5 === 0) { await shot(hs, `F-hs-r${hsRounds}-after-move`); camTrace.push(['hs-after-move', await camOf(hs)]); }
    // 兜底促结算（注明）：超过 5 分钟仍接近上限 → 把现金最低者打空，等下一次扣款破产
    if (!usedForce && Date.now() - t1 > 300000 && s.phase !== 'OVER') {
      usedForce = true;
      const idx = await hs.evaluate(() => { const G = window.__mono.state; let w = 0; G.players.forEach((p, j) => { if (!p.bankrupt && p.cash < G.players[w].cash) w = j; }); window.__mono.forceMoney(w, 0); return w; });
      console.log(`  · 【兜底】5 分钟未自然结算，__mono.forceMoney(座位${idx}, 0) 促破产（报告注明）`);
    }
  }
  ok(hsRounds >= 6, `热座推进 ≥6 个回合（实际 ${hsRounds}）`);
  ok(hsOver, `热座到达结算 OVER（${usedForce ? '用了 forceMoney 兜底' : '自然结算'}）`);
  const resOpen = await hs.evaluate(() => !document.getElementById('result-overlay').hidden);
  ok(resOpen, '结算面板已弹出');
  await shot(hs, 'F-hs-result');

  /* ═══ G. 再来一局 ═══ */
  console.log('G. 再来一局');
  if (resOpen) {
    await hs.evaluate(() => document.getElementById('btn-rematch').click());
    const again = await waitPhase(hs, ['AWAIT_ROLL', 'HANDOFF'], 10000);
    const s2 = await st(hs);
    ok(again && (s2.cash.every(c => c === 10000)) , `再来一局成功重开（phase=${s2.phase}, cash=${JSON.stringify(s2.cash)}）`);
    await shot(hs, 'G-hs-rematch');
  }

  /* ═══ 汇总 ═══ */
  console.log('\n相机轨迹摘要（阶段 | 相机位置）：');
  camTrace.forEach(t => console.log('  ', t.map(x => typeof x === 'object' && x ? `[${x.x},${x.y},${x.z}]` : x).join(' | ')));
  ok(errs.length === 0, `无页面异常（共 ${errs.length}）${errs.slice(0, 4).join(' | ')}`);
  const rejAll = await Promise.all(pages.concat([hs]).map(p => p.evaluate(() => window.__errs)));
  ok(rejAll.every(a => a.length === 0), `无 unhandledrejection（${JSON.stringify(rejAll)}）`);

  await browser.close(); server.close();
  console.log(`\nprobe-persona-mono: ${pass} passed, ${fail} failed, ${shotN} shots`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (_) {} process.exit(2); });
