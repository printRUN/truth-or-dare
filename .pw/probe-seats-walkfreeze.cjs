// 快速验证：抽卡走位（drawing/revealed，u.go≈1）期间有人加入 → 抽卡者座位冻结（pending），
// 不在牌堆旁横弹；回座后消费 pending 滑移到新座位，全员收敛。
// 双页：A=主持人（观察端），B=抽卡者（真实点卡/点完成）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8885;
const TAU = Math.PI * 2;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + ' —— ' + d); } };
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const errs = [];
  const mkPage = async name => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
    await p.fill('#input-name', name);
    await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0');
    return p;
  };
  const A = await mkPage('测冻');
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await mkPage('抽卡者');
  await B.fill('#input-room', room);
  await B.click('#btn-join');
  await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await A.evaluate(() => mutate(s => s.players.push({ id: 'wz1', name: '旁观', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
  await A.click('#mode-pick .mode-opt[data-mode="free"]');
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  await B.waitForSelector('#screen-game.active', { timeout: 20000 });
  await A.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.size === 3, null, { timeout: 20000 });
  await A.waitForTimeout(4000);
  // 主持人指定 wz0 抽卡 → B 点真心话 → drawing，B 走向牌堆
  await A.evaluate(() => designate((S.players.find(p => p.name === '抽卡者') || {}).id));
  await B.waitForFunction(() => S.turn.chooserId === myId && S.turn.stage === 'choosing', null, { timeout: 15000 });
  await B.evaluate(() => document.getElementById('card-truth').click());
  await A.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 20000 });
  await A.waitForFunction(() => { const c = window.__three.chars.get(S.players.find(x => x.name === '抽卡者').id); return c && c.userData.go > 0.9; }, null, { timeout: 15000 });   // 等走位真到位（指数逼近 ~1.5s）
  const preJoin = await A.evaluate(() => {
    const c = window.__three.chars.get(S.players.find(x => x.name === '抽卡者').id);
    return { pid: S.players.find(x => x.name === '抽卡者').id, pos: [+c.position.x.toFixed(3), +c.position.z.toFixed(3)], go: +c.userData.go.toFixed(3), seat: [+c.userData.seat.x.toFixed(3), +c.userData.seat.z.toFixed(3)] };
  });
  console.log('[preJoin walker]', JSON.stringify(preJoin));
  check('抽卡者已离座在桌缘（r≈2.62，go≈1）', preJoin.go > 0.9 && Math.abs(Math.hypot(...preJoin.pos) - 2.62) < 0.25, JSON.stringify(preJoin));

  // A 端 rAF 采样
  await A.evaluate(() => {
    window.__samples = [];
    const t0 = performance.now();
    const loop = () => {
      const row = { t: Math.round(performance.now() - t0), ch: {} };
      for (const [pid, c] of window.__three.chars) row.ch[pid] = [+c.position.x.toFixed(3), +c.position.z.toFixed(3)];
      window.__samples.push(row);
      if (window.__samples.length < 12000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // drawing 期间加入 1 人 → 座位重排到达，但抽卡者必须冻结
  await A.evaluate(() => mutate(s => s.players.push({ id: 'wz2', name: '迟到', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
  await A.waitForFunction(() => window.__three.chars.size === 4, null, { timeout: 15000 });
  await A.waitForTimeout(800);
  const frozen = await A.evaluate(pid => {
    const c = window.__three.chars.get(pid);
    return { pos: [+c.position.x.toFixed(3), +c.position.z.toFixed(3)], seat: [+c.userData.seat.x.toFixed(3), +c.userData.seat.z.toFixed(3)], pending: c.userData.pending, go: +c.userData.go.toFixed(3) };
  }, preJoin.pid);
  console.log('[frozen walker]', JSON.stringify(frozen));
  check('重排到达但抽卡者 u.seat 未被覆写 + pending 已记账（冻结生效）',
    Math.abs(frozen.seat[0] - preJoin.seat[0]) < 1e-3 && Math.abs(frozen.seat[1] - preJoin.seat[1]) < 1e-3 && !!frozen.pending && frozen.go > 0.9,
    JSON.stringify(frozen));
  // B 端等揭晓后点「完成啦」收尾（按钮揭晓名动画后才可点：轮询点击直到回合闭合）
  await B.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 30000 });
  await B.evaluate(() => {
    const iv = setInterval(() => {
      const b = document.getElementById('btn-accept');
      if (S.turn.stage === 'revealed' && b && !b.hidden) b.click();
      if (S.turn.stage === 'choosing') clearInterval(iv);
    }, 400);
    setTimeout(() => clearInterval(iv), 15000);
  });
  // 回合闭合 → wz0 回座（旧座位，go 指数衰减 ~2.2s）→ pending 消费 → 滑移到新座位（0.7s）：条件等待真收敛
  await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 20000 });
  await A.waitForFunction(pid => {
    const c = window.__three.chars.get(pid);
    return c && !c.userData.pending && Math.hypot(c.position.x - c.userData.seat.x, c.position.z - c.userData.seat.z) < 0.05;
  }, preJoin.pid, { timeout: 15000 });
  const finals = await A.evaluate(pid => {
    const out = { stage: S.turn.stage, seats: {}, pos: {}, ang: window.__seatAngleByPid, n: S.players.length, walkerPending: !!window.__three.chars.get(pid).userData.pending };
    for (const [p, c] of window.__three.chars) {
      out.seats[p] = [+c.userData.seat.x.toFixed(3), +c.userData.seat.z.toFixed(3)];
      out.pos[p] = [+c.position.x.toFixed(3), +c.position.z.toFixed(3)];
    }
    return out;
  }, preJoin.pid);
  console.log('[finals]', JSON.stringify(finals));
  const raw = await A.evaluate(() => window.__samples);
  let bad = null;
  const rows = raw.filter(r => r.ch[preJoin.pid]);
  for (let i = 1; i < rows.length && !bad; i++) {
    const d = Math.hypot(rows[i].ch[preJoin.pid][0] - rows[i - 1].ch[preJoin.pid][0], rows[i].ch[preJoin.pid][1] - rows[i - 1].ch[preJoin.pid][1]);
    const dt = (rows[i].t - rows[i - 1].t) / 1000;
    if (d > Math.max(0.5, 13 * dt)) bad = { t: rows[i].t, d: +d.toFixed(2), dt };
  }
  check('抽卡者全程无瞬移（冻结→回座→消费 pending 滑移）', !bad, JSON.stringify(bad));
  let worst = 0;
  for (const pid in finals.pos) worst = Math.max(worst, Math.hypot(finals.pos[pid][0] - finals.seats[pid][0], finals.pos[pid][1] - finals.seats[pid][1]));
  check('回合收尾后全员（含抽卡者）收敛到 4 人新座位（dist<0.05）', worst < 0.05 && !finals.walkerPending, 'worst=' + worst.toFixed(3) + ' pending=' + finals.walkerPending);
  const got = Object.values(finals.ang).map(a => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  const want = [0, 1, 2, 3].map(k => ((Math.PI + k * TAU / 4) % TAU + TAU) % TAU);
  const okA = want.every(w => got.some(g => Math.abs(((g - w + TAU + Math.PI) % TAU) - Math.PI) < 1e-3));
  check('抽卡者座位角已更新为 4 人等分（pending 消费落账）', okA, JSON.stringify(got.map(g => +g.toFixed(3))));

  // ── 场景②（终审 P2）：揭晓近景中途有人加入 → pending 记账且消费侧同样被揭晓门冻结，翻台后才滑 ──
  await A.evaluate(() => designate((S.players.find(p => p.name === '抽卡者') || {}).id));
  await B.waitForFunction(() => S.turn.chooserId === myId && S.turn.stage === 'choosing', null, { timeout: 15000 });
  await B.evaluate(() => document.getElementById('card-truth').click());
  await A.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 30000 });
  await A.waitForTimeout(1500);   // 近景推镜完成（revealK=1；2026-09-22 镜头放缓轮推近 0.9s→1.15s，余量 1200→1500）
  await A.evaluate(() => mutate(s => s.players.push({ id: 'wz3', name: '再迟到', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
  await A.waitForFunction(() => window.__three.chars.size === 5, null, { timeout: 15000 });
  await A.waitForTimeout(400);
  const holdA = await A.evaluate(() => {
    const c = window.__three.chars.get('wz1');
    return { pos: [+c.position.x.toFixed(3), +c.position.z.toFixed(3)], pending: !!c.userData.pending };
  });
  await A.waitForTimeout(1100);   // 揭晓期内远超 0.7s 滑移时长
  const holdB = await A.evaluate(() => {
    const c = window.__three.chars.get('wz1');
    return { pos: [+c.position.x.toFixed(3), +c.position.z.toFixed(3)], pending: !!c.userData.pending };
  });
  check('② 揭晓期旁观者 pending 已记账且位置纹丝不动（消费侧揭晓门生效）',
    holdA.pending && holdB.pending && Math.hypot(holdA.pos[0] - holdB.pos[0], holdA.pos[1] - holdB.pos[1]) < 0.02,
    JSON.stringify({ holdA, holdB }));
  await B.evaluate(() => {
    const iv = setInterval(() => {
      const b = document.getElementById('btn-accept');
      if (S.turn.stage === 'revealed' && b && !b.hidden) b.click();
      if (S.turn.stage === 'choosing') clearInterval(iv);
    }, 400);
    setTimeout(() => clearInterval(iv), 15000);
  });
  await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 20000 });
  await A.waitForFunction(() => {
    for (const [, c] of window.__three.chars) {
      if (c.userData.pending) return false;
      if (Math.hypot(c.position.x - c.userData.seat.x, c.position.z - c.userData.seat.z) > 0.05) return false;
    }
    return window.__three.chars.size === 5;
  }, null, { timeout: 15000 });
  check('② 翻台后 5 人全员收敛到新座位（含 wz3 新座位等分）', true, '');
  const ang5 = await A.evaluate(() => {
    const T = Math.PI * 2;
    const got = Object.values(window.__seatAngleByPid).map(a => ((a % T) + T) % T).sort((a, b) => a - b);
    return [0, 1, 2, 3, 4].every(k => got.some(g => Math.abs(((g - ((Math.PI + k * T / 5) % T + T) % T + T + Math.PI) % T) - Math.PI) < 1e-3));
  });
  check('② 5p 角度仍全环等分', ang5, '');

  // ── 场景③（终审 P1 验证）：drawing 期刷新页面 → 全新 GL 场景首见走入（moveT0 门的 spawn 路径）──
  // 注：本地模式下刷新回房会把回合修复成 choosing（chooser=null，转盘状态不跨刷新），走位同帧接管
  // 触发①在本地不可端到端复现——此处验证同一条「首见走入 + isGo 门」路径：入场滑移无单帧瞬移、落座收敛。
  await A.evaluate(() => designate((S.players.find(p => p.name === '抽卡者') || {}).id));
  await B.waitForFunction(() => S.turn.chooserId === myId && S.turn.stage === 'choosing', null, { timeout: 15000 });
  await B.evaluate(() => document.getElementById('card-truth').click());
  await A.waitForFunction(() => S.turn.stage === 'drawing', null, { timeout: 20000 });
  await B.reload();
  await B.waitForSelector('#screen-game.active', { timeout: 25000 });
  await B.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.get(myId), null, { timeout: 20000 });
  await B.evaluate(() => {
    window.__reloadSamples = [];
    const t0 = performance.now();
    const loop = () => {
      const me = window.__three.chars.get(myId);
      window.__reloadSamples.push({ t: Math.round(performance.now() - t0), pos: me ? [+me.position.x.toFixed(3), +me.position.z.toFixed(3)] : null });
      if (window.__reloadSamples.length < 3000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await B.waitForTimeout(3000);
  const rs = await B.evaluate(() => ({ rows: window.__reloadSamples.filter(r => r.pos), myId }));
  const rs2 = await B.evaluate(({ myId }) => {
    const c = window.__three.chars.get(myId);
    return { seat: [+c.userData.seat.x.toFixed(3), +c.userData.seat.z.toFixed(3)], pos: [+c.position.x.toFixed(3), +c.position.z.toFixed(3)] };
  }, rs);
  let rbad = null;
  for (let i = 1; i < rs.rows.length && !rbad; i++) {
    const d = Math.hypot(rs.rows[i].pos[0] - rs.rows[i - 1].pos[0], rs.rows[i].pos[1] - rs.rows[i - 1].pos[1]);
    const dt = (rs.rows[i].t - rs.rows[i - 1].t) / 1000;
    if (d > Math.max(0.5, 13 * dt)) rbad = { t: rs.rows[i].t, d: +d.toFixed(2), from: rs.rows[i - 1].pos, to: rs.rows[i].pos };
  }
  check('③ 刷新后本机角色首见走入全程无单帧瞬移', !rbad, JSON.stringify(rbad));
  const seatedDist = Math.hypot(rs2.pos[0] - rs2.seat[0], rs2.pos[1] - rs2.seat[1]);
  check('③ 刷新后本机角色落座收敛（dist<0.05）', seatedDist < 0.05, JSON.stringify({ seatedDist, rs2 }));
  check('无 pageerror', errs.length === 0, errs.join(' | '));
  await browser.close(); server.close();
  console.log(fail === 0 ? `WALK-FREEZE PROBE PASSED ✅ (${pass})` : `FAILURES: ${fail}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
