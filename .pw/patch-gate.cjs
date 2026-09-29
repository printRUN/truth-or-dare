// 招1 补丁：tod.html + index.html 的 LOADER_FLIP_MS 2400→1200 + doJoin 尾部并行化（CSS 已另行改毕）
'use strict';
const fs = require('fs');
const ROOT = 'D:/myidea/truth-or-dare/';

for (const f of ['tod.html', 'index.html']) {
  let s = fs.readFileSync(ROOT + f, 'utf8');
  const rep = (a, b, name) => {
    const n = s.split(a).length - 1;
    if (n !== 1) { console.error(`${f}: ${name} 出现 ${n} 次（应为 1）`); process.exit(1); }
    s = s.replace(a, b);
  };

  rep('const LOADER_FLIP_MS = 2400;',
      'const LOADER_FLIP_MS = 1200;   // 翻牌 CSS 动画周期（@keyframes loader-flip 的 duration 同步 1.2s，改必同改）；揭幕门=至少看满一整轮',
      'LOADER_FLIP_MS');
  rep('① 至少看满 minMs（一整轮 2.4s 翻牌，从点「加入」起算）',
      '① 至少看满 minMs（一整轮 1.2s 翻牌，从点「加入」起算）',
      'waitLoaderDone 注释');

  const oldTail = [
    "  // 题库同步（独立 topic）：加入已有房间才需要等 retained 到达 → 并入本地编辑 → 只在有变化时发布",
    "  setLoadingText('📋 载入房间题库...');",
    "  if (sawState) for (let i = 0; i < 8 && !sawPool; i++) await sleep(150);",
    "  let poolDirty = !SPool;",
    "  if (!SPool) { SPool = JSON.parse(JSON.stringify(localPunishments)); SPool.pack = pickedPack; }",
    "  for (const t of editedPools) {",
    "    const arr = SPool[t] || (SPool[t] = []);",
    "    for (const it of localPunishments[t]) { if (!arr.some(o => o.x === it.x)) { arr.push(it); poolDirty = true; } }",
    "  }",
    "  if (poolDirty) await publishPool();",
    "  updatePoolCount();",
    "",
    "  // 加入校验：确保自己真的在房间里（发布竞争丢失时自愈）",
    "  setLoadingText('🎭 落座中...');",
    "  for (let i = 0; i < 3; i++) {",
    "    await sleep(900);",
    "    if (S && S.players.some(p => p.id === myId)) break;",
    "    await mutate(n => { if (!n.players.some(p => p.id === myId)) n.players.push(myPlayer()); });",
    "  }",
    "",
    "  setLoadingText('✅ 就绪...');",
    "  // 按钮解禁必须排在 await 之后：等待揭幕期间按钮保持禁用，否则 input-name 上的 Enter",
    "  // （keydown→btn-join.click）会重入 doJoin，掐掉活链路并以新 myId 再坐一个「自己」",
    "  await waitLoaderDone(LOADER_FLIP_MS, loadT0);   // 房间数据就绪 ≠ 揭幕：等加载效果播完这拍再进",
    "  btn.disabled = false; btn.textContent = '加入游戏 🎮';",
  ].join('\n');

  const newTail = [
    "  // 题库同步 + 落座自愈 = dataTail，与揭幕门「并行」跑（2026-09-24 加载提速轮）：",
    "  // 门只保证「至少看满一整轮翻牌」的仪式感，数据收尾慢于门时仍以数据为准（Promise.all 取较晚）；",
    "  // roomFull/撞号等早退分支留在上面的顺序段，不进 dataTail（早退要抢在并行门之前自己揭幕）。",
    "  const dataTail = (async () => {",
    "    setLoadingText('📋 载入房间题库...');",
    "    if (sawState) for (let i = 0; i < 8 && !sawPool; i++) await sleep(150);",
    "    let poolDirty = !SPool;",
    "    if (!SPool) { SPool = JSON.parse(JSON.stringify(localPunishments)); SPool.pack = pickedPack; }",
    "    for (const t of editedPools) {",
    "      const arr = SPool[t] || (SPool[t] = []);",
    "      for (const it of localPunishments[t]) { if (!arr.some(o => o.x === it.x)) { arr.push(it); poolDirty = true; } }",
    "    }",
    "    if (poolDirty) await publishPool();",
    "    updatePoolCount();",
    "",
    "    // 加入校验：确保自己真的在房间里（发布竞争丢失时自愈）。先查后睡：建房（applyState 已含我）",
    "    // 与正常加入（mutate 已把自己写进状态）首查即过、零等待；只有自愈重试才花 900ms 一拍。",
    "    setLoadingText('🎭 落座中...');",
    "    for (let i = 0; i < 3; i++) {",
    "      if (S && S.players.some(p => p.id === myId)) break;",
    "      await mutate(n => { if (!n.players.some(p => p.id === myId)) n.players.push(myPlayer()); });",
    "      await sleep(900);",
    "    }",
    "  })();",
    "",
    "  // 按钮解禁必须排在 await 之后：等待揭幕期间按钮保持禁用，否则 input-name 上的 Enter",
    "  // （keydown→btn-join.click）会重入 doJoin，掐掉活链路并以新 myId 再坐一个「自己」",
    "  await Promise.all([dataTail, waitLoaderDone(LOADER_FLIP_MS, loadT0)]);   // 房间数据就绪 ≠ 揭幕：至少看满一整轮翻牌再进",
    "  setLoadingText('✅ 就绪...');",
    "  btn.disabled = false; btn.textContent = '加入游戏 🎮';",
  ].join('\n');

  rep(oldTail, newTail, 'doJoin 尾部');
  fs.writeFileSync(ROOT + f, s);
  console.log(`${f}: LOADER_FLIP_MS→1200 + doJoin 尾部并行化 ✔`);
}
