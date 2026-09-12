// 探针：换屏是「立方面刚性转身」而不是两张各转各的纸
// 用法: node probe-cube.cjs   （from .pw/；静态服务器端口 8793 已被 probe-scene 占用，这里用 8794）
//
// 核心判据（本次改动的唯一新语义）：出屏与入屏是同一個刚体的两面，绕立方体同一条竖棱同步转动，
// 所以两者的 rotateY 之差必须恒等于 90°（前进）或 -90°（回退）——即 θ_in − θ_out ≡ ±90° 全程为常数。
// 一旦两面用了不同的时长/缓动，这个差会立刻漂移，立方体就在中途「散架」；角度各自看都是对的，
// 只有这个差能把它抓出来。
// 其余判据补的是「角度对但半径/宽度错 = 两张纸错位而不是转身」——θ 差断言抓不到这一类：
//   · 判据 4：两面共用同一个 --tx-r       · 判据 6：两面同宽（出屏被内联拉到入屏的 2R）
//   · 判据 5：两面的投影区间不分离（分离即两墙之间漏背景）
// 三者合起来在解析上就保证了公共棱是同一个 3D 点、投影必然重合（判据 5 只是它的可观测症状）。
// ⚠ 半径必须取「入屏」面宽的一半：宽屏（≥1440，@media min-width:1440px）下大厅是 1180px、其余三屏 920px，
//   取出屏宽度会让出屏是大厅时被 .leaving 夹到 920（半宽 460 < 半径 590），棱够不到铰链、裂缝 ~130px。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8794;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const errors = [];
let fails = 0;
const log = (...a) => console.log('[cube]', ...a);
const check = (cond, msg, extra) => { log((cond ? '  ✅ ' : '  ❌ ') + msg, extra ?? ''); if (!cond) fails++; };

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(ctx, tag, viewport) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide');
  }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}

async function join(p, name, room = '') {
  if (!(await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open))) await p.click('details.adv summary');
  await p.check('#chk-local');
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 逐帧采样：两面各自的 rotateY（从 matrix3d 的线性部分解出，与平移/透视无关）+ 投影矩形 + 透明度。
// matrix3d 是列主序：col1 = m[0..3], col3 = m[8..11]。纯 rotateY(θ) 的 3x3 给出 m[0]=cosθ、m[8]=sinθ，
// 而 perspective() 与 translate3d 都不改 3x3（透视矩阵的左上 3x3 是单位阵，平移只进第 4 列），
// 所以 θ = atan2(m[8], m[0]) 在这里是精确解，不用反推整个复合矩阵。
// ⚠ 必须按括号切分再 split(',')，不能用正则捞数字：正则会把函数名 matrix3d 里的 "3" 也当成一个数，
// 索引整体前移一位，解出来的角度恒为 0（probe-scene.cjs 的解析处也踩过同一个坑并留了注释）。
function installSampler(p) {
  return p.evaluate(() => {
    window.__cs = []; window.__csOn = false;
    const thetaOf = el => {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return null;
      const m = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')')).split(',').map(Number);
      if (m.length < 16 || m.some(isNaN)) return null;
      return Math.atan2(m[8], m[0]) * 180 / Math.PI;
    };
    const rectOf = el => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), o: +getComputedStyle(el).opacity }; };
    window.__csStart = () => {
      window.__cs = []; window.__csOn = true;
      const tick = () => {
        if (!window.__csOn) return;
        const en = document.querySelector('.screen.entering');
        const lv = document.querySelector('.screen.leaving');
        window.__cs.push({
          t: performance.now(),
          inId: en ? en.id : null, inTh: en ? thetaOf(en) : null, inR: en ? rectOf(en) : null,
          outId: lv ? lv.id : null, outTh: lv ? thetaOf(lv) : null, outR: lv ? rectOf(lv) : null,
          inW: en ? en.offsetWidth : 0, outW: lv ? lv.offsetWidth : 0,
          txr: document.getElementById('world3d').style.getPropertyValue('--tx-r'),
          back: document.getElementById('world3d').classList.contains('tx-back'),
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    window.__csStop = () => { window.__csOn = false; return window.__cs; };
  });
}

// 分析一段采样：刚体判据 + 两面同时可见 + 接缝
function analyze(samples, tag) {
  const act = samples.filter(s => s.inTh !== null && s.outTh !== null);
  log(`\n[${tag}] 两面同时有 transform 的帧数 = ${act.length} / 总采样 ${samples.length}`);
  if (!act.length) { check(false, `${tag}: 换屏期间新旧两面同时带 3D 姿态`, '两面从未同时出现'); return; }

  // 判据 1：θ_in − θ_out 恒为 ±90°
  const diffs = act.map(s => s.inTh - s.outTh);
  const sign = act[act.length - 1].back ? -1 : 1;
  const target = 90 * sign;
  const dev = diffs.map(d => Math.abs(d - target));
  const maxDev = Math.max(...dev);
  log(`[${tag}] 方向 = ${sign > 0 ? '前进' : '回退'}（期望 θ_in−θ_out = ${target}°）`);
  log(`[${tag}] θ_in−θ_out 范围 = ${Math.min(...diffs).toFixed(2)}° ~ ${Math.max(...diffs).toFixed(2)}°，最大偏差 = ${maxDev.toFixed(2)}°`);
  check(maxDev < 12, `${tag}: 两面刚性同步（θ_in−θ_out 恒为 ${target}°，最大偏差 ${maxDev.toFixed(2)}° < 12°）`);

  // 判据 2：确实是 90° 幅度的转角（不是一点微旋）
  const spread = act.map(s => Math.abs(s.inTh)).concat(act.map(s => Math.abs(s.outTh)));
  const maxAng = Math.max(...spread);
  log(`[${tag}] 单面最大转角 = ${maxAng.toFixed(1)}°`);
  check(maxAng > 50, `${tag}: 转角幅度够（最大 ${maxAng.toFixed(1)}° > 50°，是真转身不是微旋）`);
  check(Math.abs(maxAng - 90) < 14, `${tag}: 落点收在 ~90°（${maxAng.toFixed(1)}°）`);

  // 判据 3：中途两面同时可见（都还在画、都有投影宽度）
  const mid = act.filter(s => s.inR && s.outR && s.inR.w > 1 && s.outR.w > 1 && s.inR.o > 0.05 && s.outR.o > 0.05);
  log(`[${tag}] 两面同时可见（投影宽>1px 且 opacity>0.05）的帧数 = ${mid.length} / ${act.length}`);
  check(mid.length >= 3, `${tag}: 中途两面同时可见（${mid.length} 帧 ≥ 3，立方体转角真的露出来了）`);

  // 判据 4：两面用的是同一个 --tx-r
  const txrs = [...new Set(act.map(s => s.txr))];
  log(`[${tag}] 采样期间 --tx-r = ${JSON.stringify(txrs)}`);
  check(txrs.length === 1 && !!txrs[0], `${tag}: 两面共用同一个半径 --tx-r（${txrs.join(',')}）`);

  // 判据 5：两面的投影区间不得分离（缝里会直接漏出背景）。这是「两面是一个刚体」的可观测必要条件。
  // 为什么只查「分离」而不查「左右缘重合」：铰链在投影上落在框的哪一侧会随角度翻转——
  // 近棱被透视放大（z=+0.4R 时约 1.26×）、远棱朝灭点缩（z=-2R 时约 0.54×），θ 接近 ±90° 时整面是一个
  // 由远棱摊到近棱的窄条，框宽不是面宽。而「两面同宽 + 同一个 R + Δθ≡90°」这三点（判据 1/4/6）已经解析地
  // 保证铰链是同一个 3D 点、投影必然重合，所以这里只需抓「分离」这个能稳健量的症状。
  // 半径量错时（出屏是大厅、被 .leaving 夹回 920 而半径按 1180 算）症状正是两墙之间裂开 ~130px 缝。
  const R = parseFloat(act[0].txr) || 0;
  const sep = act.map(s => Math.max(s.inR.l, s.outR.l) - Math.min(s.inR.r, s.outR.r));
  const maxSep = Math.max(...sep);
  const si = sep.indexOf(maxSep);
  log(`[${tag}] 两面投影区间最大分离 = ${maxSep.toFixed(1)}px（>0 即两面在 x 上裂开）`);
  log(`[${tag}] 最分离那一帧：入屏 θ=${act[si].inTh}(${act[si].inW}px)[${act[si].inR.l},${act[si].inR.r}] 出屏 θ=${act[si].outTh}(${act[si].outW}px)[${act[si].outR.l},${act[si].outR.r}]`);
  check(maxSep < 8, `${tag}: 两面投影不分离、公共棱焊死（最大分离 ${maxSep.toFixed(1)}px < 8）`);

  // 判据 6：两面同宽——出屏会被内联拉到入屏的 2R（.leaving 已去掉 max-width）。
  // 不同宽就不存在能同时贴合两面的公共棱：这是「一个立方体」而不是「两张纸」的充要条件。
  // 宽屏（≥1440）下大厅 1180px、其余三屏 920px，正是这条最容易失守的地方。
  const wset = [...new Set(act.map(s => `${s.inW}/${s.outW}`))];
  log(`[${tag}] 入屏宽/出屏宽 = ${JSON.stringify(wset)}（期望 2R = ${(2 * R).toFixed(0)}）`);
  check(wset.length === 1 && act[0].inW === act[0].outW && Math.abs(act[0].inW - 2 * R) <= 1,
    `${tag}: 两面同宽且 = 2R（${wset.join(',')}）`);
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 840 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const A = await open(ctx, 'A');
  await join(A, '阿泽');
  await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await open(ctx, 'B');
  await join(B, '小雨', room);
  await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
  await A.waitForTimeout(600);
  // A 是在 B 之后开的页，处于后台——后台页的 rAF 被降频到几 fps，逐帧采样会稀疏到「两面同时在场的
  // 帧数」在阈值 3 附近抖（同一个转场有时 8 帧、有时 2 帧）。把 A 提到前台，采样率才回到正常。
  await A.bringToFront();

  await installSampler(A);
  // 起转可能被加载层延后（queueSceneEnter：出屏的转出和新屏的入场一起等揭幕），所以采样不能按固定延时收，
  // 要等「两面都清理完」——否则会在动画只跑了一半时 __csStop()，两面同时在场的帧数会随机器快慢抖动。
  // ⚠ 这个函数会**被序列化后送进页面执行**，所以只能引用页面里的东西（document / window.__cs）。
  // 写成 `p => p.evaluate(...)` 的形式会在页里抛 "A is not defined"，被 catch 吞掉后等待立刻返回、
  // 采样窗口只剩十几帧——正是这条判据要抓的现象被探针自己的 bug 制造出来。
  const waitSettled = (page, timeout = 15000) => page.waitForFunction(() =>
    !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving')
    && window.__cs.some(s => s.inTh !== null && s.outTh !== null), null, { timeout }).catch(() => {});

  // 中段取证帧：**不能**写成「等到角度对了再截图」——waitForFunction 返回后 Playwright 才去合成写盘，
  // 那 200~400ms 里 800ms 的转场已经快走完了。实测过：门在 |θ_in|≈40° 那一帧如实返回了，
  // 写盘时 |θ_in| 只剩 ~13°（截图里 game 屏内容相对落位只右移 ~110px、两面几乎重合），
  // 拍出来的「转角中段」看着像通过、其实什么都没看——而 .catch(()=>{}) 还把这次错过完全咽掉了。
  // 所以判断与冻结必须在**同一帧、在页面里**完成：getAnimations().pause() 把两面连同角度一起定住，
  // 之后再截图就没有延迟可输。冻结的是全部动画（含出屏那条），截图后立刻 play() 放行。
  // 取 38°~55°：首次命中在窗口上沿 ~54°，两面各 ~54°/~-36°，都还比较不透明（出屏的 opacity 收在 55% 之后），
  // 且离出屏 900ms 的内联宽度归位还有 ~600ms 余量，冻住期间不会被超时清掉一面。
  const freezeMid = async (page, tag) => {
    const f = await page.evaluate(() => new Promise(res => {
      const t0 = performance.now();
      const tick = () => {
        const s = window.__cs[window.__cs.length - 1];
        if (s && s.inTh !== null && Math.abs(s.inTh) > 38 && Math.abs(s.inTh) < 55) {
          document.getAnimations().forEach(a => { try { a.pause(); } catch {} });
          res({ inTh: +s.inTh.toFixed(1), outTh: s.outTh === null ? null : +s.outTh.toFixed(1), ms: Math.round(performance.now() - t0) });
        } else if (performance.now() - t0 > 6000) res(null);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })).catch(() => null);
    log(f ? `[${tag}] 中段取证帧已冻住（起判后 ${f.ms}ms）：入屏 θ=${f.inTh}° 出屏 θ=${f.outTh}°`
          : `[${tag}] ⚠ 6s 内没等到 38°~55° 的中段，cube-${tag}-2.png 不是转角中段`);
    return f;
  };
  const unfreeze = page => page.evaluate(() => document.getAnimations().forEach(a => { try { a.play(); } catch {} }));

  // ── 前进 lobby → game ──
  log('\n―― 前进 lobby → game ――');
  await A.evaluate(() => window.__csStart());
  // 「起转前」这一帧必须在**点击之前**拍：点击后 .active 立刻挂上，而截图本身要 ~300ms，
  // 等它写完再去冻结，动画可能已经越过 38° 下沿（冻不到了）。挪到点击前拍的是同一面墙的 θ=0 态，
  // 而且点击后第一件事就是 freezeMid，中间没有任何截图占时间。
  await A.screenshot({ path: 'shots/cube-fwd-1.png' });   // 起转前（θ≈0：出屏还贴在原位，即将绕自己的中心竖棱转出）
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 20000 });
  const fm = await freezeMid(A, 'fwd');
  await A.screenshot({ path: 'shots/cube-fwd-2.png' });   // 转角中段（两面各 ~50°，应拼成一个朝镜头的墙角）
  await unfreeze(A);
  check(!!fm, `fwd: 抓到转角中段的冻帧（${fm ? `入屏 ${fm.inTh}° / 出屏 ${fm.outTh}°` : '6s 内没等到'}）`);
  await waitSettled(A);
  const fwd = await A.evaluate(() => window.__csStop());
  await A.screenshot({ path: 'shots/cube-fwd-3.png' });   // 落位
  analyze(fwd, 'fwd');

  // 落位后：不留 class、每屏 transform 回到 none、且几何稳定不再变
  // （注意不能拿投影框比 offsetWidth：.world 常态机位本身不是单位阵——game 是 z:-24/rx:5，
  //   投影本来就会放大，那是镜头不是转场残留。落位是否干净由「transform 回到 none」+「连续两次采样几何不变」定义。）
  //
  // 采样前必须等镜头自己停稳：转场之后机位还会补间一段（Cam.enter 的 540ms 推进 + 660ms 缓收，
  // 以及 UI 换档触发的 realign），不定稳就采样，量到的会是镜头位移而不是残留姿态——
  // 实测过一次 camZ -38.66 → -44 被记成「几何漂移 4.9px」，而同一帧 anyTransform 已经是 false、
  // 两个 class 都已摘掉（也就是说 θ=0 的复合式确实是单位阵，落位是干净的）。
  await A.waitForFunction(() => {
    const st = window.__zs || (window.__zs = { z: Cam.cur.z, t: performance.now(), still: 0 });
    if (Math.abs(Cam.cur.z - st.z) > 0.02) { st.z = Cam.cur.z; st.t = performance.now(); st.still = 0; }
    else st.still = performance.now() - st.t;
    return st.still > 400;
  }, null, { timeout: 8000 }).catch(() => {});
  const grab = () => A.evaluate(() => {
    const g = document.getElementById('screen-game');
    const r = g.getBoundingClientRect();
    return {
      entering: !!document.querySelector('.screen.entering'),
      leaving: !!document.querySelector('.screen.leaving'),
      anyTransform: [...document.querySelectorAll('.screen')].some(s => getComputedStyle(s).transform !== 'none'),
      rect: [+r.left.toFixed(1), +r.top.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
      camZ: +Cam.cur.z.toFixed(2),
    };
  });
  const steady = await grab();
  await A.waitForTimeout(900);
  const steady2 = await grab();
  const drift = Math.max(...steady.rect.map((v, i) => Math.abs(v - steady2.rect[i])));
  log('[fwd] 稳态:', JSON.stringify(steady), '\n[fwd] +900ms:', JSON.stringify(steady2), `几何漂移 = ${drift}px`);
  check(!steady.entering && !steady.leaving, 'fwd: 落位后无 entering/leaving 残留');
  check(!steady.anyTransform, 'fwd: 落位后每屏 transform 回到 none（红线：常态不带 3D 姿态）');
  check(drift < 1.5, `fwd: 落位后几何稳定（+900ms 投影框最大漂移 ${drift}px < 1.5，θ=0 复合式=单位阵、无残留姿态）`);

  // 落位后命中测试（沿 probe-scene 的泄漏检测写法）
  const hit = await A.evaluate(async () => {
    const b = document.getElementById('card-truth');
    b.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 120));
    const r = b.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!(h && h.closest && h.closest('#choice-section')), hit: h ? (h.id || h.className) : null };
  });
  check(hit.ok, 'fwd: 落位后选卡中心 elementFromPoint 命中自身（没有转场层盖在牌桌上）', JSON.stringify(hit));

  // ── 回退 game → lobby ──
  log('\n―― 回退 game → lobby ――');
  await A.evaluate(() => window.__csStart());
  await A.screenshot({ path: 'shots/cube-back-1.png' });   // 起转前（θ≈0，同 fwd：必须在点击前拍，否则截图耗时会把角度带过可冻结的窗口）
  await A.click('#btn-end-game');
  await A.click('#btn-end-game');   // 破坏性操作二次确认
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const bm = await freezeMid(A, 'back');
  await A.screenshot({ path: 'shots/cube-back-2.png' });   // 转角中段（回退方向）
  await unfreeze(A);
  check(!!bm, `back: 抓到转角中段的冻帧（${bm ? `入屏 ${bm.inTh}° / 出屏 ${bm.outTh}°` : '6s 内没等到'}）`);
  await waitSettled(A);
  const back = await A.evaluate(() => window.__csStop());
  await A.screenshot({ path: 'shots/cube-back-3.png' });   // 落位
  analyze(back, 'back');

  // ── 半径 --tx-r 在三档宽度下是否等于入屏面宽的一半（量错就是两张纸错位/裂缝） ──
  // 三档都跑 join→lobby 并逐帧分析：宽屏那档命中 `@media (min-width:1440px)` 的大厅两栏规则，
  // 入屏 1180px 而其余三屏 920px——半径若取出屏（920/2=460），接缝会裂开/重叠 ~130px，判据 5 抓得到。
  log('\n―― --tx-r 三档宽度实测（join→lobby 逐帧） ――');
  const modes = [
    { tag: '窄屏 390×844', vp: { width: 390, height: 844 } },
    { tag: '宽屏 1440×900', vp: { width: 1440, height: 900 } },   // 命中 ≥1440 的大厅两栏：入屏 1180 ≠ 出屏 920
    { tag: '横屏 844×390', vp: { width: 844, height: 390 } },
  ];
  for (const m of modes) {
    const p = await ctx.newPage();
    await p.setViewportSize(m.vp);
    await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    await p.waitForTimeout(300);
    // 加载层盖着时出屏的转出也被延后（queueSceneEnter），采样要从点「加入」之前就起，才覆盖得到揭幕那一刻
    await installSampler(p);
    await p.evaluate(() => window.__csStart());
    await join(p, 'C' + Math.random().toString(36).slice(2, 5));
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    // 等转场真的跑完再收采样（同 settled）：转场是在加载层收起那一刻才起转的，只等 .leaving 消失会立刻
    // 通过（那时它还没挂上），采样器什么都没覆盖到。附带也就覆盖了 .leaving 的 900ms 内联宽度归位。
    await waitSettled(p);
    await p.waitForTimeout(120);
    const samples = await p.evaluate(() => window.__csStop());
    analyze(samples, m.tag);
    const r = await p.evaluate(() => {
      const l = document.getElementById('screen-lobby');
      const w = document.getElementById('world3d');
      return {
        lw: l.offsetWidth,
        txr: parseFloat(w.style.getPropertyValue('--tx-r')) || null,
        land: document.body.classList.contains('landui'),
        // 落位后出屏的内联宽度必须还回去了（否则它下次当入屏时会被缩着显示）
        staleW: [...document.querySelectorAll('.screen')].map(s => s.style.width).filter(Boolean),
      };
    });
    const expect = r.lw / 2;
    const okr = r.txr !== null && Math.abs(r.txr - expect) <= 0.6;
    log(`[${m.tag}] 入屏(大厅)面宽 = ${r.lw}px → 期望 R = ${expect}px，实测 --tx-r = ${r.txr}px，landui=${r.land}`);
    check(okr, `${m.tag}: --tx-r = 入屏面宽/2（实测 ${r.txr} / 期望 ${expect}）`);
    check(r.staleW.length === 0, `${m.tag}: 落位后没有残留的内联宽度（${JSON.stringify(r.staleW)}）`);
    await p.close();
  }

  log(errors.length ? '\n[cube] ERRORS:\n' + errors.join('\n') : '\n[cube] 零 JS 报错 ✅');
  log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 立方体转场取证全部通过');
  await browser.close();
  server.close();
  process.exitCode = (errors.length || fails) ? 1 : 0;
})();
