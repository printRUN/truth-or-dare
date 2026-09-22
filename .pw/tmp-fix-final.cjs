// 终审修复补丁：代码检查官 SHIP WITH FIXES 的 P1/P2（on-arcade 摘还、GPU dispose、slerpQuaternions、
// collectAll 破产边界、payAll 分发、check-syntax 缺文件硬失败、探针补断言）
const fs = require('fs');
let fail = 0;
function patch(F, pairs) {
  let s = fs.readFileSync(F, 'utf8');
  for (const [o, n] of pairs) {
    const c = s.split(o).length - 1;
    if (c !== 1) { console.error(F + ' MATCH ' + c + 'x: ' + o.slice(0, 60).replace(/\n/g, '|')); fail++; continue; }
    s = s.replace(o, () => n);
  }
  fs.writeFileSync(F, s);
}

patch('D:/myidea/truth-or-dare/index.html', [
  // P1：on-arcade 随屏驱动（early 只加不摘会吃掉整局 net-chip；深链回 arcade 也要再摘）
  [`function renderScreen() {
  const name = currentScreen();
  applyTitle(name);   // 顶部标题唯一写入口（arcade 屏换「游戏中心」；同值短路，状态回包高频重跑无害）`,
   `function renderScreen() {
  const name = currentScreen();
  applyTitle(name);   // 顶部标题唯一写入口（arcade 屏换「游戏中心」；同值短路，状态回包高频重跑无害）
  document.body.classList.toggle('on-arcade', name === 'arcade');   // 随屏驱动：离开 arcade 还 net-chip，深链回 arcade 再摘（early 脚本只管开机首帧）`],
]);

patch('D:/myidea/truth-or-dare/monopoly.html', [
  // P1：卡面纹理 dispose（一局 30-60 次抽卡不释放会攒 100MB+ VRAM）
  [`  cardMesh.material.map = tex;
  cardMesh.material.needsUpdate = true;
  cardMesh.material.opacity = 1;`,
   `  if (cardMesh.material.map) cardMesh.material.map.dispose();
  cardMesh.material.map = tex;
  cardMesh.material.needsUpdate = true;
  cardMesh.material.opacity = 1;`],
  // P1：重开局/恢复时释放旧棋子与名牌的 geometry/material/纹理
  [`function buildPawns() {
  pawnObjs.forEach(p => scene.remove(p)); pawnObjs = [];
  plateSprites.forEach(s => scene.remove(s)); plateSprites = [];`,
   `function buildPawns() {
  pawnObjs.forEach(p => { p.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); scene.remove(p); }); pawnObjs = [];
  plateSprites.forEach(s => { if (s.material.map) s.material.map.dispose(); s.material.dispose(); scene.remove(s); }); plateSprites = [];`],
  // P2：r128 实例方法（静态 slerp 已废弃，每次掷骰收尾都打告警）
  [`          THREE.Quaternion.slerp(starts[i].q, targets[i], m.quaternion, kk);   // 收尾短弧落定`,
   `          m.quaternion.slerpQuaternions(starts[i].q, targets[i], kk);   // 收尾短弧落定（r128 实例方法，静态 slerp 已废弃）`],
  // P2：collectAll 破产边界与 charge() 对齐——付得起照付，付不起才全表现金出局
  [`    G.players.forEach((o, j) => {
      if (j === G.turn || o.bankrupt) return;
      const take = Math.min(o.cash, a.collectAll);
      o.cash -= take; got += take;
      if (o.cash === 0 && take > 0) { o.bankrupt = true; bustBanner(o, null, 0); G.owners.forEach((idx2, ti) => { if (idx2 === j) { G.owners[ti] = null; ownerMarks[ti].visible = false; } }); const gp = pawnObjs[j]; if (gp) gp.visible = false; if (plateSprites[j]) plateSprites[j].visible = false; }
      moneyFloat(j, -take);
    });`,
   `    G.players.forEach((o, j) => {
      if (j === G.turn || o.bankrupt) return;
      const take = Math.min(o.cash, a.collectAll);
      o.cash -= take; got += take;
      if (o.cash < a.collectAll && take > 0) { o.bankrupt = true; bustBanner(o, null, a.collectAll - take); G.owners.forEach((idx2, ti) => { if (idx2 === j) { G.owners[ti] = null; ownerMarks[ti].visible = false; } }); const gp = pawnObjs[j]; if (gp) gp.visible = false; if (plateSprites[j]) plateSprites[j].visible = false; }   // 付不清才破产（与 charge 语义一致；恰好付清 = 存活）
      moneyFloat(j, -take);
    });`],
  // P2：payAll 先按承受力分配再扣款，杜绝「先分发后破产」凭空增发
  [`  if (a.payAll) {
    const per = Math.min(p.cash, a.payAll);
    G.players.forEach((o, j) => { if (j !== G.turn && !o.bankrupt) { o.cash += per; moneyFloat(j, per); } });
    SFX.pay();
    charge(p, per * (G.players.filter((o, j) => j !== G.turn && !o.bankrupt).length), null);
  }`,
   `  if (a.payAll) {
    const n2 = G.players.filter((o, j) => j !== G.turn && !o.bankrupt).length;
    if (n2 > 0) {
      const per = Math.min(a.payAll, Math.floor(p.cash / n2));   // 承受力上限内分发：扣款必然付清，不触发破产增发
      if (per > 0) {
        G.players.forEach((o, j) => { if (j !== G.turn && !o.bankrupt) { o.cash += per; moneyFloat(j, per); } });
        SFX.pay();
        charge(p, per * n2, null);
        if (per < a.payAll) toast('💸 现金不够，只能每人付到 ' + fmt(per), 'loss');
      } else toast('💸 身无分文，请客作废', 'loss');
    }
  }`],
]);

patch('D:/myidea/truth-or-dare/.pw/check-syntax.cjs', [
  // P2：monopoly 缺失/检出数不对 = 硬失败（漂移防护不许静默蒸发）
  [`  if (!fs.existsSync(file)) { if (short === 'monopoly.html') continue; console.log(\`MISSING: \${file}\`); bad++; continue; }`,
   `  if (!fs.existsSync(file)) { console.log(\`MISSING: \${file}\`); bad++; continue; }`],
  [`} else {
  console.log(\`three.js 内联段检出 \${Object.keys(threeHashes).length} 份（index 必须有）\`);
  if (!threeHashes['index.html']) bad++;
}`,
   `} else {
  console.log(\`three.js 内联段检出 \${Object.keys(threeHashes).length} 份（必须 index+monopoly 两份）\`);
  bad++;
}`],
]);

patch('D:/myidea/truth-or-dare/.pw/probe-arcade.cjs', [
  // P1 回归锁：点卡进 join 后 net-chip 必须恢复显示（on-arcade 摘还）
  [`    ok('② tod:picked 落 sessionStorage', st2.picked === '1');`,
   `    ok('② tod:picked 落 sessionStorage', st2.picked === '1');
    const netChip2 = await p.evaluate(() => getComputedStyle(document.querySelector('.net-chip')).display);
    ok('② 进 join 后 net-chip 恢复（on-arcade 已摘）', netChip2 !== 'none', netChip2);`],
]);
if (fail) { console.error('FAILED ' + fail); process.exit(1); }
console.log('final-review fixes OK');
