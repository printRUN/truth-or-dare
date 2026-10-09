# 代码检查官 · 头像特征强相似轮（feat/3d-avatars 工作树）终审

审域：`avatar-features.js`（sha 锁 876bcf0d27b55f37，已独立复算一致）、monopoly/uno/tod/bombcat/party-net/check-syntax 本轮 hunk（W3 fallTok/fallAndFade/resetPawnPose hunks 按指令跳过）、四个 ev-avatars 探针。check-syntax 双门本机复跑 ALL PASS。

## 判定：SHIP WITH FIXES（2×P1）

P0-5 三锚原子换、tod u.head 身份契约、dispose 纪律、r128 红线、avatarRecipe 健壮性、check-syntax 门禁本体均验证通过；但有 2 个门禁覆盖不到的代码级 P1 需要修正指令。

---

## P1 修正指令（必须修）

### P1-1 tod：emoji 贴片路径回归——换头像后 3D 脸贴片显示上一张图（stale face）
- 位置：`tod.html` syncPlayers（≈7581-7586 行）。本轮把 `if (uri)` 收紧成 `if (isImgUri)`，但 HEAD 版本对 **emoji 也走 `avatarTexture()`**（7436 行 emoji 分支把字形画上 256² 画布）。收紧后：
  1. **图片→emoji 切换**：`u.face.material.map` 仍指向旧图纹理且 `color=0xffffff`，`applyTodFeats(ch,null)` 只做 `face.visible=true` → 3D 角色顶着**前一个头像的图**当脸（身份显示错误，非降级是错显）。`u.avKey` 门保证它不会被后续帧纠正。
  2. **纯 emoji 角色**：脸贴片永远是裸肤色球面（HEAD 行为是显示 emoji 字形）——视觉回归。
- 探针 `ev-avatars-tod.cjs` 第④步只断言 `faceVisible && !hasFeat`，纹理内容零断言——门禁绿灯正是漏网原因；截图拍在翻转之前，也未取证。
- **修法**：非图片 uri 分支恢复旧路径——`const tex = avatarTexture(p.id, uri)`（emoji 分支还在，现为死代码）并照旧 `map/color/needsUpdate` 三件套；或至少在 `applyTodFeats(null)`/emoji 分支里 `u.face.material.map=null; u.face.material.color.set(0xe8b98c); u.face.material.needsUpdate=true`。同时给探针补「image→emoji 后 face map 不含旧图」断言。

### P1-2 保险丝在挂载点缺位：monopoly/uno 主接入点裸引用 AV3，AV3 缺失=硬炸且 uno 粘性致残
- `monopoly.html:1647`（buildPawns）与 `uno.html:1402`（refreshSeatAvatars）直接 `AV3.buildAvatarHead(...)`，无 `typeof AV3` 守卫。expert-eng「三页接入点 typeof AV3→退默认」只落在了提取层（acquirePalette onload / applyFeats 入口 / tod syncPlayers），**三页里两页的主挂载点不守约**。avatar-features.js 一旦 404/损坏（部署漏发、CDN 回退目录不全），`window.AV3` 未声明 → ReferenceError：
  - monopoly：buildPawns 在 `applyGameSnapshot` 内被调（:597），异常**截断整个快照应用**，且 `!pawnObjs.length` 使每次快照重炸；
  - uno：更糟——`seatAva.sig` 在构建循环**之前**已写（:1385），炸后下一次 refreshSeatAvatars 被 sig 幂等门挡住 → 半身像**永久消失直到 sig 变化**。
  - 两页的 `applyHeadPalette` 保险丝退路因此成为不可达死代码（还没走到它就先炸了）。
- **修法**：两处挂载点加 `typeof AV3 !== 'undefined' && AV3 && AV3.buildAvatarHead` 守卫；缺失时至少**先于 sig 写入/数组清空早退**（uno 把 sig 赋值移到构建循环成功之后），保住「不再进一步破坏」的下界；理想再补一个无 AV3 时的最简默认头（旧的二阶几何头已删，纯色球+发壳即可）。

---

## P2 建议（不挡船）

1. **builder mats 数组缺员**（`avatar-features.js:429`）：墨镜镜片材质（:372 内联）、张嘴牙材质（:414 内联）、发茬壳材质（:315 内联）不在 `mats` → 不进 monopoly `headMats` → W3 fallAndFade 淡出时牙/镜片/发茬保持不透明悬空 ~250ms（r=0.1 无发茬，实际触发=墨镜或张嘴大笑破产）。修：三处内联材质推入 mats。
2. **`rasterSvg64` 缓存键弱**（:436）：`svg.length + '|' + svg.slice(-80)`——DiceBear SVG 尾 80 字节全同（闭合标签），键实际退化成「长度」；同 style 不同 seed 的两张图等长即串缓存，pinDiff 拿错位图。修：补 `svg.slice(0,96)` 或真哈希。另注释写 LRU，实现是 FIFO（get 不刷新位次）——注释漂移。
3. **队列 next() 不在 finally**：monopoly/uno `featQPush` 与 tod `featTodPush` 的任务若 `notify()/applyTodFeats()` 抛错则 `next()` 不执行，整条提取队列永久停摆。修：`try{...}finally{next()}`。
4. **paletteCache LRU 驱逐在飞条目的 stale-notify 竞态**（monopoly:1583 / uno:1348）：32 容量驱逐时 onload 仍可能未回，旧 e 的 notify 按字符串 key 命中现任棋子、以 `feats=null/sig='fb'` 把已特征化的头打回默认头（新 e 完成后再翻回）——长会话+频繁换头像下闪脸。修：notify 里校验 `paletteCache.get(key)===e`。
5. **applyFeats 不避 W3 在飞窗**：破产淡出中 palette notify 到达会换上全新不透明头（新材质 opacity=1），与变灰淡出的遗体不一致 ~700ms。低概率低损害；可在 notify 回调加 `fallInFlight(i)` 推迟。
6. **check-syntax 残留探测只盯提取器**：`function extractFeatures(` 会红，但 `function buildAvatarHead(` 再内联不会——本轮恰恰把 builder 也去重了。建议补一个探测串。
7. **注释漂移**：`avatar-features.js` 两处写「宿主经 `P.avMeta` 补」，实际 party-net 导出名是 `P.avatarRecipe`；`clothes` 特征提取了但三页 builder 均不消费（死输出，留注释说明用途或删）；`faceW`（:132）声明后未用，死变量。
8. **svgWithSize 对 base64 SVG 会改坏**（`+`→`%2B`）：`startsWith('data:image/svg')` 连 base64 一起截获，注入失败后靠 `loadRaster` onerror→`avatarImageDataRetry(原始 img)` 兜底自愈，仅浪费一次加载；遗留「旧版头像」base64 svg 真实存在，建议显式排除 `;base64`。
9. tod 角色移除（chars.delete）不 dispose featGrp 几何——沿页内既有不 dispose 惯例，本轮每角色多挂 ≤十几个小几何，量级可忽略，记录在案。

## 逐项验收（expert-eng 清单）

| 项 | 结论 |
|---|---|
| P0-5 三锚原子换 | ✅ monopoly applyFeats 同步段完成 dispose→挂→hairMat/headMats/feats 重写；headGrp 身份不变（billboard :1630 与 W3 每帧重读 headMats 契约保持）；uno neck.material 再链 :1374（同同步段，无中间帧）；featsSig 幂等门三页齐全，buildPawns/refreshSeatAvatars 初值与缓存命中对齐（remap 不闪脸） |
| tod u.head 契约 | ✅ applyTodFeats 只换 u.head 子树+写材质 color/roughness，scale/rotation 写点无恙；u.face/u.hair 引用留活仅翻 visible；texCache 旧纹理 dispose :7433；u.face.material.map 独占（dispose 与换 map 同同步块）✅；emoji 双向**部分破**（P1-1） |
| 保险丝 | ⚠️ 提取层三页齐（含 DiceBearLocal 缺失→纯像素）；rIC+setTimeout 退路三份正确；挂载点缺（P1-2） |
| dispose 纪律 | ✅ builder 材质全私有每次新建；tod 摘颅球只 dispose 几何、共享 skin 留给耳/鼻 :7530；uno disposeBust 不卸纹理；换子树 traverse 全收 |
| r128 红线 | ✅ 仅 Sphere/Box/Cone/Cylinder/Circle/Torus/Color(HSL)/Standard/Basic，无 CapsuleGeometry 等越版 API |
| 提取器 | ✅ dist3 常数归一无除零；satOf/hueOf 空守卫；四角多数派背景；pinDiff 三键映射正确；位图差分 >0.5% 判存；⚠️ 缓存键弱（P2-2）、svgWithSize base64（P2-8） |
| avatarRecipe | ✅ typeof/try-catch/字段类型校验/越界索引全防（`av:0`→-1、`av:abc`→NaN 均 null） |
| check-syntax 门禁 | ✅ sha 锁复算一致；NEED_FEAT 三页 src 引用+残留探测；CRLF 门；⚠️ 探测串不覆盖 builder（P2-6） |
| 探针 | ✅ 四探针金值断言升级扎实（mono 双端金值/uno 几何清单/tod 特征+翻转/bc 色相直通+charsList 取证）；❗ tod 探针缺 emoji 贴片纹理断言（P1-1 漏网根因），bc 探针 writeHead 第二参写成 statusMessage 属探针侧侥幸（octet-stream 靠嗅探渲染），可顺手正名 |

## 结论

核心机制（提取→特征→三页渲染→取证）实现质量高，P0-5 原子换与 dispose 纪律干净；但 **tod emoji 换脸错显**是用户可见的身份显示错误，**两处裸 AV3 引用**让本轮自己设计的保险丝在最需要它的挂载点失效。两条 P1 修复量小（各 ≤10 行），修完即可 SHIP。
