# 设计简报：选卡可读性/互动光效 + 题卡落点=回合玩家面前（2026-09-18）

用户两条实测反馈（原话）：
1. 「选择模式的在桌面上防止看不清，需要有浮动的文字提示，互动效果加强光效。」
2. 「卡片的翻牌后的位置要到该回合的那个人面前。」

改动范围：仅 index.html 内联 Three.js 场景段（v8，~line 6440-7788）。CSS 回退路径（无 WebGL/loperf）零改动。

## 现状与痛点（截图取证 shots/3d-drawing.png、shots/3d-revealed.png）

- 选卡双卡平贴毡面 x=±0.78（`choiceCard()` line 6752），靠卡面纹理表达「真心话/大冒险」；躺角透视下文字压缩，无任何浮空提示；互动只有 hover 探头/按压回弹/选中白闪+涟漪（无呼吸光、无卡下光池）。
- 题卡落点写死桌心北：REST=(0,FELT_Y,-0.64)、PIVOT=(0,·,-0.96)（line 6644-6645），翻面后卡心在 (0,·,-1.28)。**2p 局里这正是对手面前——抽卡者的牌落在别人面前**（截图证实：小雨抽的题躺在北座阿泽面前）。
- 揭晓近景机位 REVEAL_POS = CARD_LOOK+(-0.9,2.08,+1.14)（世界轴固定偏移）。

## 方案 A：选卡浮动文字 + 互动光效（GL 层，全在 three3d 内）

### A1 浮动文字提示（GL Sprite，同 reactBubble 语言：fog:false / depthTest:false / depthWrite:false / renderOrder 6）
- **双卡标签**：每卡一枚静态 Sprite（CanvasTexture 一次性画好：圆角玻璃胶囊 + 图标 + 「真心话/大冒险」大字，蓝 0x3b82f6 / 橙 0xf97316），挂卡中心上方 (±0.78, FELT_Y+0.52, -0.12)，scale 0.72×0.30，轻浮动 bob ±0.02@1.7Hz（REDUCED 不 bob）。billboard 由 Sprite 天然朝镜头。
- **状态提示**：双卡上方中央一枚动态 Sprite（y≈FELT_Y+1.0，scale 1.24×0.31，canvas 448×112）：`iCanPick()` → 「轮到你了 · 点卡牌选择」（青色）；旁观 → 「等待「名字」选择…」（白 75%）；**只在状态签名（stage+chooserId+iCanPick）变化时重绘**（同 qSig 回合级重绘豁免），非逐帧。
- 淡入淡出：三枚 sprite material.opacity 向目标（choosing=1 / 其他=0）指数追踪，只在变化帧写 uniform；REDUCED 直接赋值无动画。choosing 之外（drawing/revealed/大厅）全隐。
- 不新增 DOM、不碰 pointer-events（canvas 红线不破；raycast 只对 cTruth.mesh/cDare.mesh，sprite 不进命中）。

### A2 光效加强（全部 uniform 写值/共享几何，禁 needsUpdate、禁新增逐帧重绘）
- **卡下光池**：两枚 PlaneGeometry(1,1) 共享一张 256px 径向渐变白 CanvasTexture，material.color 染蓝/橙，additive+fog:false+depthWrite:false，renderOrder 2，y=FELT_Y+0.006，置于双卡中心。呼吸 3.4Hz（与 turnRing 同拍）：轮到我 base 0.34±0.16，旁观 base 0.16±0.05（纯信息不是邀请语义，呼应 ⑫① 门禁：邀请脉动只给能点的人），非 choosing 0。hover 该卡光池目标 ×1.6。
- **卡面自发光呼吸**：faceMat.emissive 按卡色写 setRGB(k·r,k·g,k·b)（k=呼吸量+0.18·hov+flash 现有白闪不冲突——flash 已走同 uniform，语义叠加上限可接受）。非 choosing 归零。
- 选中反馈链保留：白闪+涟漪+65° 抬升不变。
- REDUCED：光池静态 base 值、无呼吸无 bob；loperf 整场景 retire 自动带走（池/材质都进 scene.traverse dispose）。

## 方案 B：题卡落点 = 该回合玩家面前（动态 placement）

### 几何
- 抽卡边沿（stage→drawing 的分支内、写 flyAt 之前）调 `computeCardPlacement()`：
  - 方向 d̂ = chooser 角色座位方向（chars.get(chooserId||activePlayerId()).userData.seat 归一；fallback (0,0,-1) 即旧北位，n=2 对手=北 ⇒ 与旧版完全同位）。
  - φ = atan2(d̂.x, d̂.z)；flipG.rotation.order='YXZ'（创建时设一次），翻转仍走 rotation.x=−π（绕已偏航的枢轴边），卡「向桌心翻、亮给抽卡者看」。
  - 翻面前（飞卡落点）卡心 = d̂·(R+0.64)，翻面后卡心 C = d̂·R，**R=1.02**（联算约束：翻面前外缘 R+0.96 ≤ 1.98 < 毡缘 2.05，不压围边）。
  - 枢轴 P = d̂·(R+0.32)；牌堆局部坐标 deckL = R(−φ)·(DECK_POS−P)（fly/refly/deckShuffle/牌堆顶待抽位四处引用全换 deckL，替代现写死的 DECK_POS−PIVOT）。
  - **避障**：牌堆 D=(1.12,0.60) 与选卡双卡 (±0.78,·,-0.12)（抽卡/揭晓期双卡仍在桌上——截图证实，被选卡还保持 65° 抬升）三障碍，圆近似 r≈0.75~0.85：不满足则 φ 逐步 ±0.12 旋转重算（最多 ±60°，取先满足侧），再不行 R 降到 0.85 重试，最终 fallback 旧北位。
- **近景机位随卡走**：cardPlace = {look: C+(0,FELT_Y+0.05−C.y? 保持 y=FELT_Y+0.05), reveal}；reveal = C + RY(φ)·(-0.9,2.08,+1.14)（φ=0 时与现 REVEAL_POS 逐字节同构）。syncCam 的 REVEAL_POS/CARD_LOOK 引用换成 cardPlace.reveal/look。
- 模块初始 cardPlace = 旧常量值 ⇒ 任何未计算路径行为与现状逐字节一致。
- reveal 近景的贴脸剔除（距离 <2.05 隐藏）不挑人——抽卡者走到牌堆旁（WALK_R=2.62）在近景相机背后，画面自然同框其头肩；自己抽卡时自己被剔除=既有「让镜」语义，均不需要新逻辑。

### 不变量
- 免答重抽链 reback→refly→fly 复用同 placement（同回合同 chooser，落点不变）。
- fxState 追加 `place:{phi,cx,cz}` 与 `choiceFx`（追加访问器约定，不改旧字段语义；cardPos 仍是本地坐标，rest 本地恒 (0,·,CARD_L/2) 故旧断言 x≈0 依旧成立）。
- IS_REDUCED：placement 照算（牌照样出现在抽卡者面前），只跳过飞行动画。
- CSS 回退层无题卡在桌概念（居中 flip-card），不动。

## 验收探针（新文件 .pw/probe-choice-upgrade.cjs，端口 8899）
1. 3 人房轮流两回合（南=我 / 对座），断言翻面后卡世界坐标 ≈ d̂·R（perp 距离 <0.3）且与牌堆/双卡距离 ≥0.7。
2. choosing 期三 sprite opacity>0.5、光池呼吸值>0；旁观客户端 hint 文案态=wait；drawing 后 label 渐隐。
3. hover 光池增强 + 感觉态 feelState.hover 照旧；iCanPick 门禁：旁观无邀请脉动（base 0.16 档）。
4. 回归：probe-egg-react 的 cardPos 终态断言、test-3d 31 条、verify 五档选卡可点。

## 请挑刺专家裁决的开放点
- a) 旁观者光池 0.16 档会不会仍然构成「可点暗示」（⑫① 红线是互动语义只给轮到者）？还是应 0？
- b) 状态提示 Sprite 的措辞/出现时机（choosing 全程 vs 仅前 4s）？
- c) R=1.02 与 ±60° 避障旋转上限是否会让「面前」语义被旋转稀释？
- d) 选中后未选卡压暗 0.3 是否应改为隐藏，给题卡让位（现状保留理由：全桌仪式感/回看自己选了什么）？
