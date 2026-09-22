// UNO 轮终审修复批次：逻辑 P0×2 + 代码 P1×3 + 精选 P2 —— 跑完即删
const fs = require('fs');
const vm = require('vm');
let fail = 0;
function patch(F, pairs, verify) {
  let s = fs.readFileSync(F, 'utf8');
  for (const [o, n] of pairs) {
    const c = s.split(o).length - 1;
    if (c !== 1) { console.error(F + ' MATCH ' + c + 'x: ' + o.slice(0, 70).replace(/\n/g, '|')); fail++; continue; }
    s = s.replace(o, () => n);
  }
  fs.writeFileSync(F, s);
  if (verify) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(s))) {
      i++;
      if (i === verify) { try { new vm.Script(m[1]); } catch (e) { console.error(F + ' 解析坏: ' + e.message); fail++; } }
    }
  }
}

patch('D:/myidea/truth-or-dare/uno.html', [
  // [逻辑P0-1] beginTurn 换手全量重摆（旧南位手牌按新座位背面重铺，杜绝上家手牌泄漏）
  [`  G.phase = 'HANDOFF';
  saveGame(); updateHUD(); render2D();
  if (G.gl) layoutHand(G.turn, false);`,
   `  G.phase = 'HANDOFF';
  saveGame(); updateHUD(); render2D();
  if (G.gl) buildHands();   // 座位随当前玩家轮转：换手必须全量重摆（只摆新玩家会让上家手牌残留在南位泄漏`],
  // [代码P1-1] 暗牌下机器人手牌永不正面（南位动画期也在内）
  [`  const faceUp = isSouth ? (G.mode === 'dark' ? pi === G.turn && G.phase !== 'HANDOFF' : true)
                         : (G.mode === 'light' && !p.bot);   // 明牌：全真人手牌常开（机器人永不公开）`,
   `  let faceUp = false;
  if (p.bot) faceUp = false;   // 机器人永不公开（南位动画期也不许）
  else if (isSouth) faceUp = G.mode === 'light' || G.phase !== 'HANDOFF';
  else faceUp = G.mode === 'light';   // 明牌：全真人手牌常开`],
  // [逻辑P0-2] 抓包按钮点击 = 直接罚 2（不再走 settleCatch 的挂闸分支）
  [`      cb.onclick = () => { cb.hidden = true; G.unoCatch.done = true; settleCatch(G.unoCatch.who); };`,
   `      cb.onclick = () => { cb.hidden = true; G.unoCatch.done = true; const f = G.players[G.unoCatch.who]; SFX.catchU(); const got = dealTo(f, 2); toast('🫵 抓包成功！' + f.name + ' 忘喊 UNO，罚摸 ' + got + ' 张', 'loss'); updateHUD(); };`],
  // 抓包按钮不出现给受害者本人
  [`    if (G.unoCatch && !G.unoCatch.done && Date.now() < G.unoCatch.until) {`,
   `    if (G.unoCatch && !G.unoCatch.done && Date.now() < G.unoCatch.until && G.unoCatch.who !== G.turn) {`],
  // [代码P1-2] settleCatch 挂闸分支防覆盖（抓包按钮 done 后不得复活）+ 结算后刷新动作条
  [`  } else {
    G.unoCatch = { who, whoName: forgetter.name, until: Date.now() + 10000, done: false };
    toast(\`😮 \${forgetter.name} 忘了喊 UNO！下家可以在交接时抓包\`, 'loss');
  }
  updateHUD();`,
   `  } else if (!G.unoCatch || !G.unoCatch.done) {
    G.unoCatch = { who, whoName: forgetter.name, until: Date.now() + 10000, done: false };
    toast(\`😮 \${forgetter.name} 忘了喊 UNO！下家可以在交接时抓包\`, 'loss');
  }
  if (w && w.who === G.turn) { hideActions(); showActions(); }   // 罚后按钮残留刷新
  updateHUD();`],
  // [代码P1-3 / 玩家P1-B] 窗口只在持窗者行动时走表
  [`  if (G.phase !== 'AWAIT_ACTION') { w.lastTs = 0; return; }   // 交接/动画期暂停`,
   `  if (G.phase !== 'AWAIT_ACTION' || w.who !== G.turn) { w.lastTs = 0; return; }   // 交接/动画/他人回合暂停（受害者拿不到设备时不烧窗口）`],
  // [P2-4] REDUCED 数字倒计时
  [`    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    ring.style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;`,
   `    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    if (REDUCED) ub.textContent = 'UNO! ' + Math.ceil(w.remain / 1000) + 's';   // REDUCED 数字倒计时退路
    else ring.style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;`],
  // [P2-2] 最后一张是 +2/+4 仍结算罚摸（标准 UNO；结算罚分口径）
  [`  if (p.hand.length === 1) armUnoWindow(pi);
  else if (p.hand.length === 0) { updateHUD(); render2D(); onWin(pi); return; }`,
   `  if (p.hand.length === 1) armUnoWindow(pi);
  else if (p.hand.length === 0) {
    if (drawN) {   // 最后一张的功能效果仍结算（标准 UNO）
      const victim = nextIdx(pi);
      const got = dealTo(G.players[victim], drawN);
      toast(\`📥 \${G.players[victim].name} 罚摸 \${got} 张（最后一张效果仍结算）\`, 'loss');
      SFX.warn();
      if (G.players[victim].bot) botQuote('hit');
    }
    updateHUD(); render2D(); onWin(pi); return;
  }`],
  // [代码P2-1] RESOLVE 过渡期不落档（刷新会丢效果/重复摸牌；beginTurn/enterHumanTurn 落档足够）
  [`  updateHUD(); render2D(); saveGame();
  await sleep(300);
  advance(skipNext ? 1 : 0);`,
   `  updateHUD(); render2D();
  await sleep(300);
  advance(skipNext ? 1 : 0);`],
  // [P2-3] 摸到不可出的牌自动过（对齐设计「不可出自动过」）
  [`  toast('🫳 摸到 ' + (isWild(cd) ? '万能' : CNAME[cd.c] + (cd.v in SYM ? SYM[cd.v][1] : cd.v)) + '，出不了', 'loss');
  G.drawnThisTurn = true;
  G.phase = 'AWAIT_ACTION';
  if (G.gl) layoutHand(G.turn, false);
  showActions();`,
   `  toast('🫳 摸到 ' + (isWild(cd) ? '万能' : CNAME[cd.c] + (cd.v in SYM ? SYM[cd.v][1] : cd.v)) + '，出不了，自动过', 'loss');
  G.drawnThisTurn = true;
  G.passStreak++;
  G.phase = 'RESOLVE'; hideActions(); saveGame();
  setTimeout(() => advance(0), 400 * SPEED);`],
  // [P2-6] 压缩模式补小屏半边（<700px 视口 9 张即开浮层）
  [`  if (p.hand.length > 12) { openHandOverlay(k); return; }   // 压缩模式：开浮层`,
   `  if (p.hand.length > 12 || (Math.min(innerWidth, innerHeight) < 700 && p.hand.length > 9)) { openHandOverlay(k); return; }   // 压缩模式（大扇 + 小屏窄扇）`],
  // [P2-7] hud-tools hidden 生效
  [`  #hud-tools { position: fixed; right: 10px; top: calc(max(8px, env(safe-area-inset-top)) + 8px); z-index: 31; display: flex; flex-direction: column; gap: 6px; }`,
   `  #hud-tools { position: fixed; right: 10px; top: calc(max(8px, env(safe-area-inset-top)) + 8px); z-index: 31; display: flex; flex-direction: column; gap: 6px; }
  #hud-tools[hidden] { display: none; }`],
  // 规则速览补「最后一张效果仍结算」
  [`  <li>先出完手牌者胜 🏆</li>`,
   `  <li>先出完手牌者胜 🏆（最后一张的效果仍结算）</li>`],
], 2);

patch('D:/myidea/truth-or-dare/uno.html', [
  // [代码P1-3] forceUnoTimeout 直结算（窗口只对持窗者走表后，强超时绕过）
  [`    forceUnoTimeout: () => { const w = G.unoWin; if (w && !w.penalized) { w.remain = 0; tickUnoWindow(performance.now() + 1); } },`,
   `    forceUnoTimeout: () => { const w = G.unoWin; if (w && !w.penalized) settleCatch(w.who); },`],
]);

patch('D:/myidea/truth-or-dare/index.html', [
  // [代码P1-3] AbortSignal.timeout 老浏览器兼容（iOS 15 等同步 TypeError 会炸整个主脚本块）
  [`function probeExternal(href) {
  return fetch(href, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(1500) })
    .then(r => r.ok || r.status === 405 || r.status === 501)
    .catch(() => fetch(href, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false));
}`,
   `function probeExternal(href) {
  const sig = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(1500) : undefined;   // 老浏览器无 timeout：undefined=不限时（一次探不到就当没有，不炸主脚本）
  return fetch(href, { method: 'HEAD', cache: 'no-store', signal: sig })
    .then(r => r.ok || r.status === 405 || r.status === 501)
    .catch(() => fetch(href, { method: 'GET', cache: 'no-store', signal: sig }).then(r => r.ok).catch(() => false));
}`],
  [`  if (bcCard) probeExternal(bcCard.dataset.href).then(ok => markExtAvailable(bcCard, ok));`,
   `  try { if (bcCard) probeExternal(bcCard.dataset.href).then(ok => markExtAvailable(bcCard, ok)); } catch (e) {}   // 预探测绝不打断主脚本后续顶层语句`],
  [`  if (location.protocol === 'file:') { location.href = href; return; }   // fail-open：404 也比永远点不开好
  if (jumpMemo[href] === true) { location.href = href; return; }`,
   `  if (location.protocol === 'file:' || typeof AbortSignal === 'undefined' || !AbortSignal.timeout) { location.href = href; return; }   // fail-open：file:// 与老浏览器直跳（404 也比永远点不开/炸脚本好）`],
  // [玩家P2] 炸弹猫文案对齐设计（去分支黑话）
  [`        toast('💥 ' + name + ' 还在装修，还没开门～（先来一局 UNO / 大富翁吧）', 'error');   // 玩家语言，分支黑话只进 console`,
   `        toast('💥 ' + name + ' 还在筹备中，敬请期待 🚧（先来一局 UNO / 大富翁吧）', 'error');   // 玩家语言，分支黑话只进 console`],
  [`data-name="炸弹猫" title="💣 炸弹猫 · 联机对战（feat/bombcat-lobby 分支，合入后自动直连）"`,
   `data-name="炸弹猫" title="💣 炸弹猫 · 联机对战（暂未开放，合入后自动点亮）"`],
  // 探针谓词对齐运行时（含 GET 兜底）
  [`        toast('💥 炸弹猫还在装修，还没开门～（先来一局 UNO / 大富翁吧）', 'error');`,
   `        toast('💥 炸弹猫还在筹备中，敬请期待 🚧（先来一局 UNO / 大富翁吧）', 'error');`],
]);

patch('D:/myidea/truth-or-dare/.pw/probe-arcade.cjs', [
  [`    const avail = await p.evaluate(() => fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => false));`,
   `    const avail = await p.evaluate(() => fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => fetch('bombcat.html', { method: 'GET', cache: 'no-store' }).then(r2 => r2.ok).catch(() => false)));   // 与运行时 probeExternal 同谓词（含 GET 兜底）`],
  [`    const avail = await p.evaluate(async () => { const c = document.getElementById('card-bombcat'); if (!c || c.dataset.href !== 'bombcat.html') return false; const avail = await fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => false); const soon = c.querySelector('.arc-badge-soon'); return avail ? soon.hidden : !soon.hidden; }));`,
   `    const avail = await p.evaluate(async () => { const c = document.getElementById('card-bombcat'); if (!c || c.dataset.href !== 'bombcat.html') return false; const avail = await fetch('bombcat.html', { method: 'HEAD', cache: 'no-store' }).then(r => r.ok || r.status === 405 || r.status === 501).catch(() => fetch('bombcat.html', { method: 'GET', cache: 'no-store' }).then(r2 => r2.ok).catch(() => false)); const soon = c.querySelector('.arc-badge-soon'); return avail ? soon.hidden : !soon.hidden; }));`],
]);
if (fail) { console.error('FAILED ' + fail); process.exit(1); }
console.log('final-review UNO fixes OK');
