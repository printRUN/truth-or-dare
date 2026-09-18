// 验收探针：围桌站位全环均匀分布 + 加入/离开自动重排（GL 滑移不瞬移、新人走入、REDUCED 退路）
// 断言：
//  ① 3p 对手座位角 = PI ± 2π/3（全环 n 等分），我的角 = PI
//  ② 中途加入 2 人 + 离开 1 人：rAF 逐帧采样，既有角色任意帧位移 ≤ max(0.5, 13·dt)（瞬移=单帧全距）
//     且收敛到新座位（dist < 0.05，5s 窗口覆盖 pending 释放）
//  ③ 新角色出生点在座位方向外侧（r ≥ 3.31）随后滑入座位；角度重排后仍 n 等分
//  ④ REDUCED：新角色出生直接落在座位上；离场后余员即时补位（无滑移语义）
//  ⑤ 16 人满员：座位角全环 22.5° 等分、GL 座位两两弦距 ≥0.9（不穿模）、名牌中心不埋进工具行
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8883;
const TAU = Math.PI * 2;
const norm = a => ((a % TAU) + TAU) % TAU;
const angDist = (a, b) => { let d = norm(a) - norm(b); if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + '  —— ' + detail); }
}
async function boot(ctx, port, name) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await p.fill('#input-name', name);
  await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  return { p, errs };
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // ───────── 主流程：3 人局 → 加入 2 人 → 离开 1 人（全程 rAF 采样）─────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const { p, errs } = await boot(ctx, PORT, '测座');
    await p.evaluate(() => mutate(s => {
      const mk = (id, name) => ({ id, name, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() });
      s.players.push(mk('zz0', '小雨'), mk('zz1', '阿豪'));
    }));
    await p.click('#mode-pick .mode-opt[data-mode="free"]');
    await p.click('#btn-start');
    await p.waitForSelector('#screen-game.active', { timeout: 20000 });
    await p.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.size === 3, null, { timeout: 15000 });
    await p.waitForTimeout(4200);   // 入座滑移 + 镜头落定

    // ① 3p 全环均匀
    const ang0 = await p.evaluate(() => window.__seatAngleByPid);
    const mePid = Object.keys(ang0).find(k => !k.startsWith('zz'));
    check('① 3p 我的座位角 = PI', angDist(ang0[mePid], Math.PI) < 1e-6, '实际 ' + ang0[mePid]);
    check('① 3p 两对手座位角 = PI ± 2π/3（全环三等分）',
      angDist(ang0.zz0, Math.PI + TAU / 3) < 1e-3 && angDist(ang0.zz1, Math.PI - TAU / 3) < 1e-3,
      JSON.stringify({ zz0: norm(ang0.zz0).toFixed(4), zz1: norm(ang0.zz1).toFixed(4) }));

    // rAF 逐帧采样（贯穿加入×2 + 离开×1）
    await p.evaluate(() => {
      window.__samples = [];
      const t0 = performance.now();
      const loop = () => {
        const row = { t: Math.round(performance.now() - t0), ch: {} };
        for (const [pid, c] of window.__three.chars) row.ch[pid] = [+c.position.x.toFixed(3), +c.position.z.toFixed(3)];
        window.__samples.push(row);
        if (window.__samples.length < 9000) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await p.evaluate(() => mutate(s => s.players.push({ id: 'zz2', name: '婷婷', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
    await p.waitForTimeout(1600);
    await p.evaluate(() => mutate(s => s.players.push({ id: 'zz3', name: '大飞', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
    await p.waitForFunction(() => window.__three.chars.size === 5, null, { timeout: 15000 });
    await p.waitForTimeout(4200);   // 第二次重排滑移收敛（含 pending 余量）
    await p.evaluate(() => mutate(s => { s.players = s.players.filter(x => x.id !== 'zz2'); }));   // 离开 1 人 → 4 人补位
    await p.waitForFunction(() => window.__three.chars.size === 4, null, { timeout: 15000 });
    await p.waitForTimeout(2500);

    const raw = await p.evaluate(() => window.__samples);
    const finals = await p.evaluate(() => {
      const out = { seats: {}, pos: {}, ang: window.__seatAngleByPid, n: S.players.length };
      for (const [pid, c] of window.__three.chars) {
        out.seats[pid] = [+c.userData.seat.x.toFixed(3), +c.userData.seat.z.toFixed(3)];
        out.pos[pid] = [+c.position.x.toFixed(3), +c.position.z.toFixed(3)];
      }
      return out;
    });
    check('② 最终 4 人房（离场补位生效）', finals.n === 4 && Object.keys(finals.pos).length === 4, JSON.stringify({ n: finals.n, chars: Object.keys(finals.pos) }));

    // ② 既有角色（zz0/zz1/zz3）全程无瞬移：帧位移 ≤ max(0.5, 13·dt)（13≈滑移峰值速度 8.6u/s ×1.5 容差）
    for (const pid of ['zz0', 'zz1', 'zz3']) {
      let bad = null;
      const rows = raw.filter(r => r.ch[pid]);
      for (let i = 1; i < rows.length && !bad; i++) {
        const d = Math.hypot(rows[i].ch[pid][0] - rows[i - 1].ch[pid][0], rows[i].ch[pid][1] - rows[i - 1].ch[pid][1]);
        const dt = (rows[i].t - rows[i - 1].t) / 1000;
        if (d > Math.max(0.5, 13 * dt)) bad = { t: rows[i].t, d: +d.toFixed(2), dt };
      }
      check(`② ${pid} 加入+离开全程无瞬移（帧位移 ≤ max(0.5, 13·dt)）`, !bad, JSON.stringify(bad));
    }
    // ② 收敛：全员落在自己座位上
    let worst = 0;
    for (const pid in finals.pos) worst = Math.max(worst, Math.hypot(finals.pos[pid][0] - finals.seats[pid][0], finals.pos[pid][1] - finals.seats[pid][1]));
    check('② 加入+离场重排后全员收敛到新座位（max dist < 0.05）', worst < 0.05, 'worst=' + worst.toFixed(3));
    // ③ 4p 角度 = PI + k·90°（离开重排后仍 n 等分）
    const want4 = [0, 1, 2, 3].map(k => norm(Math.PI + k * TAU / 4));
    const got4 = Object.values(finals.ang).map(norm);
    const ok4 = want4.every(w => got4.some(g => angDist(g, w) < 1e-3)) && got4.length === 4;
    check('③ 4p 全员座位角 = PI + k·90°（离场补位后仍 n 等分）', ok4, JSON.stringify(got4.map(g => +g.toFixed(3))));

    // ③ 新角色出生在桌缘外（首个采样 r > 3.31）并滑入座位（r≈2.71）——采样流里 zz2/zz3 首现点
    for (const pid of ['zz2', 'zz3']) {
      const rows = raw.filter(r => r.ch[pid]);
      if (!rows.length) { check(`③ ${pid} 出生在桌缘外并滑入`, false, '采样流无该角色'); continue; }
      const first = rows[0].ch[pid], last = rows[rows.length - 1].ch[pid];
      const r0 = Math.hypot(first[0], first[1]);
      // 末采样点可能在离场重排后（zz2 已删）——取该角色收敛到 2.71±0.1 的首个时刻判「滑入」
      const seated = rows.some(r => Math.abs(Math.hypot(r.ch[pid][0], r.ch[pid][1]) - 2.71) < 0.1);
      check(`③ ${pid} 出生在桌缘外（r=${r0.toFixed(2)} > 3.31）并滑入过座位`, r0 > 3.31 && seated, JSON.stringify({ first }));
    }
    await p.screenshot({ path: 'shots/seats-4p-after.png' });
    check('主流程无 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ───────── 16 人满员：等分 / 不穿模 / 名牌不埋工具行 ─────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const { p, errs } = await boot(ctx, PORT, '满员');
    await p.evaluate(() => mutate(s => {
      const names = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯', '辰'];
      names.forEach((n, i) => s.players.push({ id: 'f' + i, name: n, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }));
    }));
    await p.click('#mode-pick .mode-opt[data-mode="free"]');
    await p.click('#btn-start');
    await p.waitForSelector('#screen-game.active', { timeout: 20000 });
    await p.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.size === 16, null, { timeout: 20000 });
    await p.waitForTimeout(4500);
    const full = await p.evaluate(() => {
      const ang = Object.values(window.__seatAngleByPid).map(a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
      let even = ang.length === 16, maxDev = 0;
      for (let i = 0; i < ang.length; i++) {
        const diff = i === 0 ? ang[0] + Math.PI * 2 - ang[15] : ang[i] - ang[i - 1];
        maxDev = Math.max(maxDev, Math.abs(diff - Math.PI * 2 / 16));
      }
      even = even && maxDev < 1e-3;
      const seats = [...window.__three.chars.values()].map(c => c.userData.seat);
      let minPair = 99;
      for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++)
        minPair = Math.min(minPair, Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z));
      const tools = document.getElementById('game-tools');
      const tr = tools ? tools.getBoundingClientRect() : null;
      const buried = [];
      document.querySelectorAll('#game-players-grid .player-card .player-name').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (tr && cx > tr.left && cx < tr.right && cy > tr.top && cy < tr.bottom) buried.push(el.textContent);
      });
      return { even, maxDev: +maxDev.toExponential(1), minPair: +minPair.toFixed(3), buried, chars: window.__three.chars.size };
    });
    check('⑤ 16p 座位角全环 22.5° 等分', full.even && full.chars === 16, JSON.stringify({ maxDev: full.maxDev, chars: full.chars }));
    check('⑤ 16p GL 座位两两弦距 ≥0.9（相邻 1.06，不穿模）', full.minPair >= 0.9, 'minPair=' + full.minPair);
    check('⑤ 16p 名牌中心不埋进工具行矩形', full.buried.length === 0, JSON.stringify(full.buried));
    await p.screenshot({ path: 'shots/seats-16p.png' });
    check('16p 无 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ───────── REDUCED：出生即落位、离场即时补位 ─────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const { p, errs } = await boot(ctx, PORT, '静音');
    await p.evaluate(() => mutate(s => s.players.push({ id: 'rz0', name: '即落', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
    await p.click('#mode-pick .mode-opt[data-mode="free"]');
    await p.click('#btn-start');
    await p.waitForSelector('#screen-game.active', { timeout: 20000 });
    await p.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.size === 2, null, { timeout: 15000 });
    await p.waitForTimeout(1000);
    await p.evaluate(() => mutate(s => s.players.push({ id: 'rz1', name: '再落', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
    await p.waitForFunction(() => window.__three.chars.size === 3, null, { timeout: 15000 });
    await p.waitForTimeout(300);
    const rpos = await p.evaluate(() => {
      const c = window.__three.chars.get('rz1');
      return c ? { r: +Math.hypot(c.position.x, c.position.z).toFixed(3), seatR: +Math.hypot(c.userData.seat.x, c.userData.seat.z).toFixed(3) } : null;
    });
    check('④ REDUCED 新角色出生即落座位上（r==seatR，无走入）', rpos && Math.abs(rpos.r - rpos.seatR) < 0.02, JSON.stringify(rpos));
    await p.evaluate(() => mutate(s => { s.players = s.players.filter(x => x.id !== 'rz0'); }));
    await p.waitForFunction(() => window.__three.chars.size === 2, null, { timeout: 15000 });
    await p.waitForTimeout(400);
    const rre = await p.evaluate(() => {
      const out = {};
      for (const [pid, c] of window.__three.chars) {
        out[pid] = +Math.hypot(c.position.x - c.userData.seat.x, c.position.z - c.userData.seat.z).toFixed(3);
      }
      return out;
    });
    check('④ REDUCED 离场后余员即时补位（全部已在座位上）', Object.values(rre).every(d => d < 0.02), JSON.stringify(rre));
    check('④ REDUCED 无 pageerror', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fail === 0 ? `SEATS REDISTRIBUTE PROBE PASSED ✅ (${pass} checks)` : `FAILURES: ${fail}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
