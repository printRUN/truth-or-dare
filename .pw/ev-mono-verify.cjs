// 修后验证：monopoly 镜头跟随机制 + perfWatch 预热豁免
// R2=真机档（inspect=1，SPEED=1）：竖屏钉「没摇骰=全景、走位才推近」+ 跟随收敛；桌面钉等待期全景落定值 + resize 跟踪
// R1=无参数真 UI 热座档：bodyLo 不得在 8s 前翻转（预热豁免生效）+ 真实渲染下的整段跟随
// （2026-09-24 镜头时序修订：approachTurn 不再「回全景→推近」，等待期一律停全景对准；推近只发生在 movePawn
//   走位跟随——dist/elev 阻尼从全景值收敛，2-3 跳落定。旧「开局近景 elev≈55/dist≈4.8」断言随旧行为一起废止。）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8933;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots/ev-mono-fixed';
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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ R2a：竖屏真机档（inspect=1，SPEED=1，390×844）——「等待期全景 + 走位推近跟随」机制 ══
  // （真机档走位 ~1.8s/回合才可断言；锚距读 __mono.distAnchor()，不硬编码视口数学。）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    ok('R2a rigSnap 访问器在', await p.evaluate(() => !!window.__mono && !!__mono.rigSnap));
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    const anchor = await p.evaluate(() => __mono.distAnchor());
    await p.evaluate(() => {
      window.__F = []; window.__fOn = true;
      const snap = () => {
        if (!window.__fOn) return;
        const G = __mono.state;
        const w = __mono.pawnWorld(), r = __mono.rigSnap();
        window.__F.push({ ph: G.phase, turn: G.turn, bot: !!(G.players[G.turn] && G.players[G.turn].bot), w, r, lo: document.body.classList.contains('loperf') });
        setTimeout(snap, 70);
      };
      snap();
    });
    // 真实 UI 点击驱动 40s（掷骰/买地/命运弹窗）
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const vis = await p.evaluate(() => ({
        roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
        buyYes: document.getElementById('btn-buy-yes') && !document.getElementById('buy-modal').hidden,
        gen: !document.getElementById('gen-modal').hidden,
      })).catch(() => ({ dead: true }));
      if (vis.dead) break;
      try {
        if (vis.buyYes) await p.evaluate(() => {   // 现金不足时 yes 是 disabled：点 no 兜底，防止弹窗卡死饿死后续走位样本（假红）
          const y = document.getElementById('btn-buy-yes');
          (y && !y.disabled ? y : document.getElementById('btn-buy-no')).click();
        });
        else if (vis.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (vis.roll) await p.click('#act-roll', { timeout: 1500 });
      } catch (e) {}
      await p.waitForTimeout(250);
    }
    const F = await p.evaluate(() => { window.__fOn = false; return window.__F; }).catch(() => []);
    const loN = F.filter(e => e.lo).length;
    // 2026-09-29 镜头所有权：走位推近跟随只属于本端真人回合（actorIsLocal）——机器人座位（inspect 档默认 seat1）的
    // HOPPING 样本镜头是冻结全景（autoDist=true），必须按采样时点的 bot 旗过滤，否则混入后 autoDist/tgt 断言全红
    const hopSamples = F.map((e, i) => Object.assign({ i }, e)).filter(e => e.ph === 'HOPPING' && !e.lo && e.w && e.w[e.turn] && !e.bot);
    console.log(`     （R2a 竖屏 390×844：全样本 ${F.length}，降级 ${loN}，HOPPING 未降级 ${hopSamples.length}；锚距 near=${anchor.near.toFixed(2)} base=${anchor.base.toFixed(2)}）`);
    // R2a 钉「没摇骰=全景、走位才推近」（2026-09-24 用户点名）：等待期 approachTurn 停全景对准；movePawn 从全景起
    // 用 dist/elev 阻尼推近（2-3 跳落定），软渲抖动会切段 → 断言=采样带 + 段内单调推近 + 存在收敛段。
    ok(`R2a 采到 HOPPING 未降级样本（${hopSamples.length} 个）`, hopSamples.length >= 4, hopSamples.length);
    const near = anchor.near, base = anchor.base;
    const dists = hopSamples.map(e => +e.r.dist.toFixed(2));
    ok(`R2a 走位 dist 在收敛带 (${(near - 1.5).toFixed(1)}, ${(base + 0.5).toFixed(1)})`, hopSamples.length > 0 && dists.every(d => d > near - 1.5 && d < base + 0.5), [...new Set(dists)]);
    // 等待期停全景的驻留佐证：AWAIT_ROLL 样本 dist≈base、tgt 回桌心、autoDist=true。
    // 环境双峰：快机下探针在 1100ms 回景补间落定前就点骰（合格样本少），重载局 loperf 瞬落全景（样本多）——
    // 门槛只要求「真实对局中存在落定全景驻留」；落定语义由下一行零容忍 + R2b 确定性断言钉死。
    // 降级样本不算无效证据：bodyLo 下 approachTurn 走瞬落分支，落点同样是全景档（对齐「按降级双叉写」的软渲机约定）
    const wideWaits = F.filter(e => e.ph === 'AWAIT_ROLL' && e.r && e.r.autoDist === true
      && e.r.dist > base - 1.5 && Math.hypot(e.r.tgt.x, e.r.tgt.z) < 0.05).length;
    ok(`R2a 等待期停在全景（AWAIT_ROLL 全景样本 ${wideWaits} 个）`, wideWaits >= 2, wideWaits);
    // 终审 E-2 零容忍：等待期不允许出现 autoDist=false 样本——approachTurn/双数续掷任一处被改回推近此线必红
    // （focusPawn(back) 同步置 autoDist=true，补间中途也=true，无合法假红；降级瞬摆不写 autoDist 也无假红）
    const nearWaits = F.filter(e => e.ph === 'AWAIT_ROLL' && e.r && e.r.autoDist === false).length;
    ok('R2a 等待期无近景残留（AWAIT_ROLL autoDist=false 样本=0）', nearWaits === 0, nearWaits);
    // 推近门禁：HOPPING 期间 autoDist 必须为 false（sizeScene 不覆写 dist 的前提）
    ok('R2a 走位期 autoDist=false（resize 不覆写 dist 的门禁）', hopSamples.length > 0 && hopSamples.every(e => e.r.autoDist === false), [...new Set(hopSamples.map(e => e.r.autoDist))]);
    const runs = [];
    { let run = [];
      for (const e of hopSamples) {
        if (run.length && e.i === run[run.length - 1].i + 1) run.push(e);
        else { if (run.length) runs.push(run); run = [e]; }
      }
      if (run.length) runs.push(run);
    }
    const convBad = [];
    const tgtJumps = [];
    const azJumps = [];
    for (const r of runs) {
      if (r.length < 2) continue;
      const firstD = r[0].r.dist, lastD = r[r.length - 1].r.dist;
      if (lastD > firstD + 0.3) convBad.push({ noPush: [+firstD.toFixed(1), +lastD.toFixed(1)] });   // 推近从全景起：段内 dist 只减不增
      for (let i = 1; i < r.length; i++) {
        if (r[i].r.dist > r[i - 1].r.dist + 0.4) convBad.push({ rise: [+r[i - 1].r.dist.toFixed(1), +r[i].r.dist.toFixed(1)] });
        const a = r[i - 1].r.tgt, b = r[i].r.tgt;   // 瞬跳只在段内判：跨回合镜头本来就要从上一家棋子挪到这一家
        if (Math.hypot(b.x - a.x, b.z - a.z) > 2.2) tgtJumps.push(r[i].i);   // 阻尼上界以上=真瞬跳
        if (i >= 2) {   // 段内 az 角速率上界（首样本豁免=起段瞬态）：70ms 采样间 az 转过 >23° ≈ 甩镜级角速率，
          const dA = Math.abs(Math.atan2(Math.sin(r[i].r.az - r[i - 1].r.az), Math.cos(r[i].r.az - r[i - 1].r.az)));
          if (dA > 0.4) azJumps.push({ i: r[i].i, dAz: +dA.toFixed(2) });   // camTo 最短弧被删（绕远弧）会在此现形
        }
      }
    }
    ok('R2a 走位段推近进行中（段末不比段首远；dist 不反向增大）', runs.some(r => r.length >= 2) && convBad.length === 0, convBad);
    const settledRuns = runs.filter(r => r.length >= 2 && r[r.length - 1].r.dist < near + 1.5 && Math.abs(r[r.length - 1].r.elev * 57.3 - 55) < 2.5);
    ok(`R2a 存在收敛到近景档的走位段（${settledRuns.length} 段，末样本 dist<near+1.5 且 elev≈55°）`, settledRuns.length >= 1, settledRuns.map(r => ({ d: +r[r.length - 1].r.dist.toFixed(2), e: +(r[r.length - 1].r.elev * 57.3).toFixed(1) })));
    ok('R2a 走位段内无 tgt 瞬跳', tgtJumps.length === 0, tgtJumps);
    ok('R2a 走位段内无 az 甩镜（角速率上界，钉 camTo 最短弧）', azJumps.length === 0, azJumps);
    // 「等待期回全景」支柱负向钉死：走位与走位之间必须存在全景距样本——等待期不回全景（推近不撤）即红
    const sojourns = F.filter(e => e.ph !== 'HOPPING' && !e.lo && e.r && e.r.dist > base - 1.5).length;
    ok(`R2a 回合间存在全景驻留（${sojourns} 个全景距样本）`, sojourns >= 1, sojourns);
    // 近景 elev 收敛带（推近从全景 42° 起步单调上行；卡片近景 32° 档被掐回程起步都是合法瞬态，下界放 30）+ focusK 1
    const elevs = [...new Set(hopSamples.map(e => +(e.r.elev * 57.3).toFixed(0)))];
    const fks = [...new Set(hopSamples.map(e => +e.r.focusK.toFixed(2)))];
    ok('R2a HOPPING elev∈收敛带[30,56] focusK=1', elevs.every(e => e >= 30 && e <= 56) && fks.length === 1 && fks[0] === 1, { elevs, fks });
    await ctx.close();
  }

  // ══ R2b：桌面真机档（inspect=1），等待期全景落定值（2026-09-24 用户点名「没摇骰=大图」）══
  // （探针自己不开骰：AWAIT_ROLL 窗口由探针节奏控制，落定值可无竞态采样；热座等待期操作条在场，idle 环绕被门禁=镜头静止）
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    // 等全景签名落定（elev≈42°=REF_ELEV、dist≈base、tgt 回桌心）：开局 rig 初值 elev 本就是 42/tgt 本就在桌心，
    // 只差 dist 从 7.2 补间到 baseDist —— dist 也进等待条件才不会在半途误判落定
    await p.waitForFunction(() => {
      const r = window.__mono && __mono.rigSnap && __mono.rigSnap();
      if (!r) return false;
      const a = __mono.distAnchor();
      return Math.abs(r.elev * 57.3 - 42) < 0.5 && Math.hypot(r.tgt.x, r.tgt.z) < 0.05 && Math.abs(r.dist - a.base) < 0.25;
    }, null, { timeout: 15000 });
    const r0 = await p.evaluate(() => __mono.rigSnap());
    const a0 = await p.evaluate(() => __mono.distAnchor());
    ok('R2b 等骰期全景 focusK=1 elev≈42° tgt 回桌心（approachTurn 停全景，摇骰前不推近）', Math.abs(r0.focusK - 1) < 1e-6 && Math.abs(r0.elev * 57.3 - 42) < 0.5 && Math.hypot(r0.tgt.x, r0.tgt.z) < 0.05, r0);
    ok('R2b 等骰期 dist≈baseDist（全景完整入画；旧「开局推近 4.8」废止）', Math.abs(r0.dist - a0.base) < 0.3, { dist: +r0.dist.toFixed(2), base: +a0.base.toFixed(2) });
    // resize（autoDist=true 路径）：全景 dist 按新纵横比重算跟踪（sizeScene 的职责面）
    await p.setViewportSize({ width: 1100, height: 780 });
    await p.waitForTimeout(300);
    const a1 = await p.evaluate(() => __mono.distAnchor());
    const r1 = await p.evaluate(() => __mono.rigSnap());
    ok('R2b resize 后全景 dist 跟踪新 baseDist（autoDist 路径）', Math.abs(r1.dist - a1.base) < 0.3, { dist: +r1.dist.toFixed(2), base: +a1.base.toFixed(2) });
    // 终审 E-1 交接卡路径覆盖：不勾 skip-handoff 重开——HANDOFF 交接卡显示期就必须停全景对准下一位（beginTurn 的 focusPawn(back)）
    // （同 context 重载前先清上局存档：否则 boot 的「继续对局」模态盖住 #btn-start）
    await p.evaluate(() => { try { localStorage.removeItem('mono:save:v1'); } catch (e) {} });
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; });   // 不勾 skip-handoff
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'HANDOFF', null, { timeout: 15000 });
    await p.waitForFunction(() => {
      const r = window.__mono && __mono.rigSnap && __mono.rigSnap();
      if (!r) return false;
      const a = __mono.distAnchor();
      return r.autoDist === true && Math.abs(r.elev * 57.3 - 42) < 0.5 && Math.hypot(r.tgt.x, r.tgt.z) < 0.05 && Math.abs(r.dist - a.base) < 0.25;
    }, null, { timeout: 15000 });
    const rh = await p.evaluate(() => __mono.rigSnap());
    ok('R2b 交接卡期全景对准下一位（HANDOFF 停全景，摇骰前不推近）', rh.autoDist === true && Math.abs(rh.elev * 57.3 - 42) < 0.5 && Math.hypot(rh.tgt.x, rh.tgt.z) < 0.05, rh);
    await p.evaluate(() => document.getElementById('btn-handoff-go').click());
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    // 点下后已在全景且对准 → approachTurn 走免空转分支，镜头不动仍是全景
    const ra = await p.evaluate(() => __mono.rigSnap());
    const aa = await p.evaluate(() => __mono.distAnchor());
    ok('R2b 交接卡点下后仍全景（approachTurn 免空转分支不重启推近）', ra.autoDist === true && Math.abs(ra.elev * 57.3 - 42) < 0.5 && Math.abs(ra.dist - aa.base) < 0.3, ra);
    await ctx.close();
  }

  // ══ R2c：竖屏真机档（inspect=1）——「他人回合镜头冻结全景」回归锁（2026-09-29 镜头所有权）══
  // （inspect 档默认座位=seat0 真人+seat1 机器人；探针只负责点骰/弹窗推进流程，机器人回合纯旁观采样）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    await p.evaluate(() => {
      window.__F = []; window.__fOn = true;
      const snap = () => {
        if (!window.__fOn) return;
        try {
          const G = __mono.state;
          window.__F.push({ ph: G.phase, turn: G.turn, bot: !!(G.players[G.turn] && G.players[G.turn].bot), r: __mono.rigSnap(), lo: document.body.classList.contains('loperf') });
        } catch (e) {}
        setTimeout(snap, 70);
      };
      snap();
    });
    // 推进 30s：真人回合点骰/买地/弹窗（不推进则永远停在 seat0 的 AWAIT_ROLL），机器人回合不碰任何东西
    const t0c = Date.now();
    while (Date.now() - t0c < 30000) {
      const vis = await p.evaluate(() => ({
        roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
        buyYes: document.getElementById('btn-buy-yes') && !document.getElementById('buy-modal').hidden,
        gen: !document.getElementById('gen-modal').hidden,
      })).catch(() => ({ dead: true }));
      if (vis.dead) break;
      try {
        if (vis.buyYes) await p.evaluate(() => {
          const y = document.getElementById('btn-buy-yes');
          (y && !y.disabled ? y : document.getElementById('btn-buy-no')).click();
        });
        else if (vis.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
        else if (vis.roll) await p.click('#act-roll', { timeout: 1500 });
      } catch (e) {}
      await p.waitForTimeout(250);
    }
    const F = await p.evaluate(() => { window.__fOn = false; return window.__F; }).catch(() => []);
    const anchor = await p.evaluate(() => __mono.distAnchor());
    const botHops = F.filter(e => e.ph === 'HOPPING' && e.bot && !e.lo && e.r);
    console.log(`     （R2c 竖屏 390×844：全样本 ${F.length}，机器人走位样本 ${botHops.length}，base=${anchor.base.toFixed(2)}）`);
    ok(`R2c 采到机器人 HOPPING 未降级样本（${botHops.length} 个）`, botHops.length >= 8, botHops.length);
    // 镜头所有权硬门：他人走位期 movePawn 不得接管镜头（autoDist 置 false=推近开始，出现即红）
    ok('R2c 机器人走位期镜头不接管（autoDist 恒 true）', botHops.length > 0 && botHops.every(e => e.r.autoDist === true), [...new Set(botHops.map(e => e.r.autoDist))]);
    // 只设上界：beginTurn 的 approachTurn 回景补间（1100ms）会延续进机器人前 1-2 跳，早期 dist<base 是合法瞬态
    ok('R2c 机器人走位期 dist 不越过全景（dist < base+0.5）', botHops.length > 0 && botHops.every(e => e.r.dist < anchor.base + 0.5), botHops.map(e => +e.r.dist.toFixed(1)).slice(0, 12));
    ok('R2c 存在冻结落定样本（|dist-base|≤0.5）', botHops.some(e => Math.abs(e.r.dist - anchor.base) <= 0.5), { base: +anchor.base.toFixed(2) });
    await ctx.close();
  }

  // ══ R2d：押送滑行回归锁（2026-09-29 惩罚动效）——「入狱不是瞬移」══
  // （双检查官 P0 的回归锁：滑行闭包活读 G.turn 曾让弧线一帧自废、全部门禁照绿。resolveAt 走真 resolveTile，
  //   动画档断言弧线（maxY≥0.9=0.34 基高+0.9 弧顶）+ 落点贴监狱格 + 落监闷响；bodyLo 档按双叉约定断瞬摆+闷响。）
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    const r2d = await p.evaluate(async () => {
      // 包一层 jail 音计数（SFX 是脚本顶层 const 对象，方法可替换）
      const origJail = SFX.jail;
      window.__jailN = 0;
      SFX.jail = (...a) => { window.__jailN++; return origJail(...a); };
      const lo0 = document.body.classList.contains('loperf');
      const samples = [];
      const t0 = performance.now();
      __mono.resolveAt(0, 18);   // 真 resolveTile 路径进押送（gotojail 格）
      while (performance.now() - t0 < 2200) {
        const w = __mono.pawnWorld();
        if (w && w[0]) samples.push({ y: w[0][1], x: w[0][0], z: w[0][2], t: performance.now() - t0 });
        await new Promise(r => setTimeout(r, 40));
      }
      const t6 = TILES[6];
      const end = samples[samples.length - 1];
      return {
        lo0, jailN: window.__jailN, n: samples.length,
        maxY: Math.max(...samples.map(s => s.y)),
        endDist: end ? Math.hypot(end.x - t6.x, end.z - t6.z) : -1,
        arcSamples: samples.filter(s => s.y > 0.45).length,
        jailed: __mono.state.players[0].jailed, pos: __mono.state.players[0].pos,
      };
    });
    console.log(`     （R2d 押送滑行 640×520：样本 ${r2d.n}，maxY=${r2d.maxY.toFixed(2)}，落点距监狱格 ${r2d.endDist.toFixed(2)}，jail 音 ${r2d.jailN}，${r2d.lo0 ? 'bodyLo 档' : '动画档'}）`);
    ok('R2d 入狱状态正确（jailed+pos=6）', r2d.jailed === true && r2d.pos === 6, r2d);
    ok('R2d 落监闷响恰好一拍（警笛由 siren 承担，jail 是落地拍）', r2d.jailN === 1, r2d.jailN);
    if (r2d.lo0) {   // 降级双叉：bodyLo=静态瞬摆（禁动不禁声），只锁落点与状态
      ok('R2d bodyLo 档瞬摆落监狱格（距 tile6 <0.6）', r2d.endDist >= 0 && r2d.endDist < 0.6, +r2d.endDist.toFixed(2));
    } else {
      ok('R2d 动画档存在弧线样本（maxY≥0.9，瞬移不可能越过 0.34 基高）', r2d.maxY >= 0.9, +r2d.maxY.toFixed(2));
      ok('R2d 滑行落点贴监狱格（距 tile6 <0.6）', r2d.endDist >= 0 && r2d.endDist < 0.6, +r2d.endDist.toFixed(2));
    }
    await ctx.close();
  }

  // ══ R1：无参数真 UI 热座档——bodyLo 预热豁免 + 真实渲染下的镜头跟随全程采样 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    const t0 = Date.now();
    let flipT = -1;
    while (Date.now() - t0 < 20000) {
      const lo = await p.evaluate(() => document.body.classList.contains('loperf'));
      if (lo) { flipT = Date.now() - t0; break; }
      await p.waitForTimeout(200);
    }
    ok('R1 真机路径 bodyLo 不在 8s 前翻转（预热豁免）', flipT < 0 || flipT > 8000, { flipTms: flipT });
    console.log(`     （本机软渲 ${flipT < 0 ? '20s 内未降级' : '于 ' + flipT + 'ms 降级'}）`);
    await p.close(); await ctx.close();
    // 游戏段换小视口（本机软渲 1100×800 帧耗贴阈值，负载抖动会按设计降级；640×520 保动画档验跟随）
    {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 520 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    {
      // 开一局本地热座（2 人、跳过交接），真实 UI 点击驱动，采样 HOPPING 镜头跟随
      await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
      await p.click('#btn-start');
      await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
      await p.evaluate(() => {
        window.__F = []; window.__fOn = true;
      const snap = () => {
        if (!window.__fOn) return;
        try {
          const G = __mono.state;
          window.__F.push({ ph: G.phase, turn: G.turn, bot: !!(G.players[G.turn] && G.players[G.turn].bot), w: __mono.pawnWorld(), r: __mono.rigSnap(), lo: document.body.classList.contains('loperf') });
        } catch (e) {}
        setTimeout(snap, 70);
      };
        snap();
      });
      // 真实点击驱动 45s：掷骰/买地
      const d0 = Date.now();
      let shots = 0;
      while (Date.now() - d0 < 45000) {
        const vis = await p.evaluate(() => ({
          roll: !document.getElementById('action-bar').hidden && document.getElementById('act-roll') && document.getElementById('act-roll').offsetParent !== null,
          buyYes: document.getElementById('btn-buy-yes') && !document.getElementById('buy-modal').hidden,
        })).catch(() => ({ dead: true }));
        if (vis.dead) break;
        try {
          if (vis.buyYes) await p.click('#btn-buy-yes', { timeout: 1500 });
          else if (vis.roll) await p.click('#act-roll', { timeout: 1500 });
        } catch (e) {}
        if ((Date.now() - d0) / 9000 > shots) { shots++; try { await p.screenshot({ path: `${SHOTS}/r1-${String(shots).padStart(2, '0')}.png` }); } catch (e) {} }
        await p.waitForTimeout(250);
      }
      const F = await p.evaluate(() => { window.__fOn = false; return window.__F; }).catch(() => []);
      // 同 R2a：机器人座位走位期镜头冻结全景（2026-09-29 镜头所有权），按采样时点 bot 旗过滤只锁真人走位
      const hop = F.map((e, i) => Object.assign({ i }, e)).filter(e => e.ph === 'HOPPING' && e.w && e.w[e.turn] && !e.lo && !e.bot);
      const anchor1 = await p.evaluate(() => __mono.distAnchor());
      const loN = F.filter(e => e.lo).length;
      console.log(`     （R1 游戏段 640×520：hop 样本 ${hop.length}，全样本 ${F.length}，降级 ${loN}——负载下按设计走阶梯）`);
      // 走位段（连续 HOPPING 样本）末端跟随误差：2026-09-24 起推近从全景开始，段首误差天然偏大（合法瞬态），
      // 「跟得住棋子」改用段末误差中位衡量（整段跟完时镜头必须已贴上棋子×0.8）
      const runs1 = [];
      { let run = [];
        for (const e of hop) {
          if (run.length && e.i === run[run.length - 1].i + 1) run.push(e);
          else { if (run.length) runs1.push(run); run = [e]; }
        }
        if (run.length) runs1.push(run);
      }
      const endErrs = runs1.filter(r => r.length >= 2).map(r => {
        const b = r[r.length - 1];
        return Math.hypot(b.r.tgt.x - b.w[b.turn][0] * 0.8, b.r.tgt.z - b.w[b.turn][2] * 0.8);
      }).sort((a, b) => a - b);
      const medEnd = endErrs.length ? endErrs[Math.floor(endErrs.length / 2)] : -1;
      // 段数门槛按降级占比双叉：重载局 bodyLo 吞掉大半走位动画（瞬摆不走阻尼），非降级段只剩 1-2 段也算取证成立
      const heavyLo = F.length > 0 && loN / F.length > 0.5;
      const needRuns = heavyLo ? 1 : 4;
      ok(`R1 真机走位段末 tgt 贴棋子×0.8（${runs1.filter(r => r.length >= 2).length} 段${heavyLo ? '，重载降级局降门槛' : ''}，段末误差中位 ${medEnd.toFixed(2)}）`, endErrs.length >= needRuns && medEnd < 0.85, medEnd);
      let collapse = 0;
      for (let i = 1; i < hop.length; i++) {   // 连续 2 样本 tgt 都贴桌心才算塌缩：推近从全景起，段首单个桌心样本是合法起点，阻尼一转就离开
        const a = hop[i - 1], b = hop[i];
        if (Math.hypot(b.w[b.turn][0], b.w[b.turn][2]) > 1.5 && Math.hypot(b.r.tgt.x, b.r.tgt.z) < 0.35
            && Math.hypot(a.r.tgt.x, a.r.tgt.z) < 0.35) collapse++;
      }
      ok('R1 走位 tgt 不回中塌缩（连续 2 样本贴桌心=阻尼冻结）', collapse === 0, { collapse });
      const elevs = [...new Set(hop.map(e => +(e.r.elev * 57.3).toFixed(0)))];
      // 2026-09-24 起推近从全景 42° 开始：带 [30,56] 保持；「收走位到 55°」改为存在收敛段（全局末样本可能停在任一段中途）
      const settledRun = runs1.find(r => r.length >= 2 && Math.abs(r[r.length - 1].r.elev * 57.3 - 55) < 2.5 && r[r.length - 1].r.dist < anchor1.near + 1.5);
      ok('R1 HOPPING elev∈收敛带[30,56] 且存在收敛到近景 55° 的走位段',
        elevs.every(v => v >= 30 && v <= 56) && !!settledRun, { elevs, settled: settledRun ? { d: +settledRun[settledRun.length - 1].r.dist.toFixed(2), e: +(settledRun[settledRun.length - 1].r.elev * 57.3).toFixed(1) } : null });
    }
    await ctx.close();
    }
  }

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
