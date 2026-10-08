# 策划方案：数字实体化轮（SPEC §1.11 候选）——金额与数字 = 正确的 3D 元素，拒绝同面堆叠

2026-10-08，用户点名「将所有游戏的所有元素改为3d，同时不要在同一个层面堆叠显示，金额和数字等需要显示正确的3d元素」。
前序：§1.6e/f/g（monopoly 现金/实体/天际线）、§1.10（全场 3D 感+一镜缝合）。本轮聚焦**数字的表达介质**：场景内的数字不许再是「DOM 平面文本悬浮」或「纯平面 Sprite」，必须是**有厚度的实体**；同时清理审计发现的面堆叠隐患。

## 0. 设计语言：3D 数字铭牌（Plaque）

全场统一的「数字实体」语言，五个单文件各自内联实现（本仓库单文件哲学，不新增共享 JS 文件、不动 three.r128.js sha 锁）：

- **几何**：`BoxGeometry(w, h, d)`，材质数组六面——前/后面 = 数字 CanvasTexture（sRGB + 各文件既有 anisotropy 纪律），四个侧面 = 描边色材质（rim）。厚度 d ≈ 高度的 12~18%（读作实体号牌/筹码牌，不是纸片）。
- **朝向**：**Y 轴圆柱 billboard**——每帧 `rot.y = atan2(cam.x - x, cam.z - z)`，只绕 Y 转不正对俯仰：任何机位可读，且厚度侧面随视角变化（完全 billboard 会让厚度时隐时现，穿帮）。
- **纹理**：复用各文件既有 canvas 画法字重（uno cardFaceTex 的 900 合成斜体、monopoly noteTex 的双线框语言）；圆角底 + 玩家身份色描边。缓存按内容签名（同 bombcat sig 纪律），文字不变不重绘。
- **浮空影**：铭牌下方桌面一圈 0.008y 的柔影 plane（禁 depthWrite），锚定「这是实体物」的空间感。
- **出场/退场**：超冲 pop（scale 0.6→1.12→1，120/140ms）+ 上浮；退场缩隐 150ms。全部走各文件既有动画池/帧循环语言。
- **四退路铁律**：REDUCED=直落位无动画；bodyLo/loperf=不建（DOM 退路继续承担）；TURBO（mono/uno）=onArrive 立即语义；GL-off=DOM 原样保留。

## 1. 工作包

### W1 bombcat（收益 TOP1：头顶平面贴片 × 全场最高频）
- **B1 头顶名牌 3D 化**：`.nplate` DOM 投影贴片（:2800-2841，`▶ name 🃏N`）→ GL plaque 挂 char 头顶 y≈1.32，内容 `名字 · N张`，sig（name|N|回合）缓存重建；Y-billboard。DOM .nplate 退役进 GL-off 分支（three3d 不画）。updatePlates 的每帧投影在 three3d 分支停止（GL-off 照旧）。
- **B2 牌库/弃牌堆计数铭牌**：syncPiles 两堆旁各立 mini plaque（`牌库 N` / `弃牌 N`），随快照 sig 更新；解决「HUD 数字与 3D 堆脱节」。#bc-top DOM 保留（HUD 带），GL-off 不受影响。
- **B3 nope 倒计时实体化**：nope 窗期内弃牌堆上空立倒计时环（RingGeometry thetaLength 随 200ms tick 收缩，uno dirRing y 语言）+ 堆顶秒数 plaque（`3`→`2`→`1`）；DOM nope 横幅保留（按钮交互层），`#nope-sec` 数字保留（无障碍+GL-off）。
- **不碰**：syncPiles 厚度堆叠（CARD_T=0.014 精确堆叠是正确示范）、iconTexFor 角标、build 管线已死（bombcat.html 是事实源）、probe-bombcat-ui「观战」文案、__cat/__bcScene 访问器只增不改。

### W2 monopoly（金额动效最频繁）
- **M1 moneyFloat → 3D 金额浮牌**：`.mfloat` DOM 上飘字（:1644-1651）→ plaque 从 pawn/银行位置升起（+¥ 绿框 / −¥ 红框，与 noteTex 配色语义一致），700ms×SPEED 上浮淡出，与 flyNotes 同拍起飞；charge/gain/bust 三调用点全走新 `cashFloat(pi, delta, at)`。REDUCED/bodyLo/TURBO：不建 plaque，DOM .mfloat 静态浮字原样保留（现备案行为）。updateHUD 的 mfloat 回挂逻辑随 GL 路径退役（仅 gl-off/REDUCED 用）。
- **M2 骰值铭牌**：`#dice-readout` DOM 大字条（:1654-1659）→ 骰子落定帧在骰位上方 y≈1.1 弹 plaque（`8` 大字 + 双数时 `✦双数` 角标行），900ms×SPEED 自收；DOM readout 退役进 REDUCED/GL-off。**顺带修掉 audit-B 实锤的 #dice-readout(bottom:128) 与 #action-bar 同屏重叠**。
- **M3 买地地契卡（P1，可砍）**：openBuy 时地块上方斜立 3D 地契卡（名+¥价+租金，noteTex 视觉语言），弹窗 DOM 保留按钮与 `__mono.buy` disabled 语义；关窗即收卡。
- **不碰**：flyNotes/notePool/busy 池三路径闭合、bustRitual、钞堆 stacks 层数阈值 3000/7000/12000（ev-mono-bust-ritual 钉死）、noteTex 512×256 断言、零 rig 写入/零状态包新字段、格面价格药丸（正确用法）、AUTOTEST 门控（新视觉层全部 AUTOTEST 跳过，同 §1.6f E1 纪律）。

### W3 uno（座位计数已是 Sprite——升级为实体）
- **U1 seatFx 名牌 Sprite → plaque**：`name · N张` Sprite（:1195-1222，depthTest:false 平面）→ 有厚度 plaque，Y-billboard，y 0.78 不变；sig 缓存照旧。**剩 1 张时** plaque 描边转警示红 + 「UNO!」行，pop 一次。
- **U2 牌库余量铭牌**：牌库堆旁 mini plaque `×N`（deck 变化 sig 更新）；refreshDeckStack 层数编码（每 18 张一层）保留不动——层数=远读、铭牌=精读，两级编码。
- **U3 平面残留清理**：#color-chip/#dir-chip DOM 保留（#color-name 是 probe-persona-uno 硬锁 + 它们是 UI 控件不是场景元素）。
- **不碰**：#wild-modal AUTOTEST/inspect 锁、renderOrder=k 扇形手牌定序红线、GL-off #board2d/act-hand 退路、REDUCED #btn-uno 倒计时文本。

### W4 tod + index（同构镜像实施）
- **T1 分数变化 3D 计分泡**：分数 ± 时 GL chars 头顶弹 plaque（`+10` / `−5`），reactBubble 同款挂点（y≈1.66 上浮带）+ 2.4s 常驻衰减；与 DOM score-tag 并存（CSS 路径退路）。分数泡走「弹出即收」不常驻——**避免与头顶投影名牌抢位（防新同面堆叠）**。
- **T2 桌面计分立牌**：北桌缘立计分牌 plaque 组（真心话 N / 大冒险 N / 跳过 N 三行），renderGame 后 sig diff 更新；**登记 PLACE_OBST 障碍圆**（复用 :7134 机制）防题卡落点撞牌。⚠ test.cjs 硬锁 `#stat-turn`/`#stat-truth` DOM 文本——**DOM chips 原样保留**（同步镜像，GL 立牌是场景主表达）。
- **T3 蛋库存/押注数不做**：#egg-left 是 probe 硬锁 + 按钮控件语义；#bet-count 同理。备案。
- **index 镜像**：T1/T2 在 index.html 的同构 GL 场景同步实施（§1.10 W1「index+tod 衔接」同规）。
- **T4 浮窗家族同层整理（P1）**：#stage-actions 与 tool-row 同 z40 的现存叠压——按 §v8⑯ 的帧内实测纪律给 stage-actions 动态让位（复用 bet-box 的「帧内读、仅变化才写」模式）。若专家判定现状无实叠（不同时机出现），降级备案。

## 2. 同面堆叠修复清单（本轮红线目标）
1. monopoly #dice-readout × #action-bar 重叠 → M2 退役 DOM readout 根治。
2. bombcat .nplate(z12) × #bc-log(z20) × #bc-peek(bottom:316) 的 DOM 投影避让三角 → B1 后 three3d 局无 DOM 名牌，避让常数只服务 GL-off。
3. tod 浮窗家族（T4）。
4. 新增元素一律走审计「y 分层常数表」：plaque 底部离所在面 ≥0.02，柔影 +0.008，绝不与既有 0.004-0.012 贴花带共面。
5. uno 新 plaque 不进 depthTest:false 层——**有厚度实体必须走真实深度**（这是「正确 3D」与旧 Sprite 的本质区别）；只有文字面对准时才可读性兜底 fog:false。

## 3. 访问器与门禁计划
- 追加访问器（只增不改）：`__cat.plates()`（bombcat：nplate/plaque 清单+sig）、`__mono.floaters()`（金额浮牌+骰值铭牌状态）、`__uno.seatPlaques()`、`__three.scorePops()/scoreBoard()`（tod/index）。
- 新探针（各占新端口）：`ev-num3d-bc.cjs`（8941：plaque 存在性+sig 更新+nope 环收缩+DOM 退役态）、`ev-num3d-mono.cjs`（8943：mfloat plaque 起降+骰值铭牌+AUTOTEST 跳过+退路）、`ev-num3d-uno.cjs`（8945：seat plaque+UNO 警示态+牌库铭牌）、`ev-num3d-tod.cjs`（8947：计分泡+立牌+PLACE_OBST 让位）。
- 回归门禁全绿：probe-monopoly 28 / probe-mono-maps / probe-mono-replay 8 / probe-mono-net 17 / probe-persona-mono 46 / probe-uno 21 / probe-uno-net 11 / probe-persona-uno 28 / probe-bombcat-ui 25 / probe-bombcat-rules 37 / ev-bombcat3d 61 / ev-mono-bust-ritual 25 / ev-arcade-dive 19 / ev-uno-wildpick 14 / ev-bc-suspense 12 / probe-arcade 32 / probe-loader-gate 10 / probe-tod-home 8 / test-3d / check-syntax(+bc)。

## 4. 本轮不做（备案池）
- index arcade 卡 GL diorama 化（成本高收益中）；monopoly 结算 3D 资产展示；#round-chip；#egg-left/#bet-count；uno act-hand（GL-off 退路，3D 化无意义）；格面价格药丸（正确用法不动）；turnRing y=0.39 既有 0.009 间距（终审 F-4 已裁定）。

## 5. 评审吸收（工程红线专家 SHIP WITH FIXES，全部采纳——本节即实施契约）

### P0 修正（必改）
1. **端口改 9041/9043/9045/9047**：8941=probe-tod-home、8943=ev-cardstack、8945=ev-handontable 已占用（专家 grep 实锤）。
2. **ev-bombcat3d.cjs:242-249 `.nplate` visible 硬断言**：随 B1 改版为读 `__cat.plates()`（可见数+sig）；ev-handontable.cjs:119 仅排除选择器提及，惰性不改。
3. **M1 调用面=8 处**（非 3 处）：monopoly :655（**观战 money op 独立路径，漏则两端分叉**）、:2497、:2509、:2510、:2635、:2713、:2715、:2723 全量替换为 `cashFloat(pi, delta, at)`；bust（charge 破产分支 :2516-2527）**不调**浮牌（清算仪式专属，维持）。
4. **B1 语义改写**：`.nplate` 只在 three3d 局存在（updatePlates 仅被 GL frame :3063 调用；GL-off 局信息在 #bc-players）——「退役」= three3d 局停止 DOM 投影改 GL plaque、updatePlates 整体退役；**p.id===myId 不建 plaque**（视觉终审 P1「南位名牌压手牌扇」排除必须延续）。#bc-peek bottom:316 的避让对象随 B1 消失（可回落 292，本轮保守不动、只改注释归属）。
5. **M2 立论改写**：#dice-readout × #action-bar 经时序核验**时间互斥永不同屏**（doRoll 入口 hideActions :1871 先于 readout :1875）——删「根治重叠」叙事；DOM readout 在 REDUCED/bodyLo/TURBO 保留=「无 GL 时的唯一读数介质」。

### P1 采纳
6. **M1 运动参数**：起点 pawnNotePos+0.3y（y≈1.14）、终点 y≈1.55、水平再外移 +0.25（与名牌 Sprite 带 y0.86/1.04 及钞堆外移 0.55 错位）；与 flyNotes 错峰 +60ms（复用束间错拍常数）；存活 900ms×SPEED（与 DOM mfloat 取齐，删「同拍起飞」表述）。**调用驱动、禁 diff 驱动**（绝不挂 updateHUD cash diff——charge 里 updateHUD 调 2 次会重复弹）。
7. **U1 sig 拆键**：纹理 sig=`name|hand.length|unoWarn`（**去 turn 项**——照搬会每回合全量重建+重播 pop）；turn 只管既有 rings；pop 以 (pid,unoWarn) 边沿触发一次。**bodyLo 照建不退**（seatFx 现契约；uno bodyLo 双向翻转，照建直接消解 displayed 一致性问题）；pop/缩隐动画门控 `!REDUCED&&!bodyLo&&!TURBO&&!AUTOTEST`。`__uno.seatFx()` 返回形状不变（labels[].x/z），`ev-uno-seats.cjs` 补进门禁清单。
8. **T1 diff 挂点=applyState**（:2819-2823 S 赋值处 prev 还在作用域），逐 pid diff prevScores→`__three.scorePop(pid,delta)`；绝不 hook renderPlayers（按帧调用）。
9. **T2 坐标精算**：立牌 (±0.95, ·, −1.90) 双块或单块正北轴让空、障碍 r=0.35、总高 ≤0.45（顶 y≤1.42）——(0,·,−1.80) 会让北位 placeClear 恒 false（0.14<0.5）每轮被挤位；与 hintTip（南 z+1.28）无视线冲突。PLACE_OBST.push({x,z,r}) 即登记（placeClear/solvePlacement 直读该数组）；index 同构位 :7246 起，**无统一行偏移，逐段定位**。
10. **T4 升级为必修**：真叠压实锤两处——桌面 ≥768px `#game-tools`（fixed bottom safe+8，折两行顶缘≈92px）× `#stage-actions`（bottom safe+64）高带重叠 ~28px 且 stage-actions 后绘截胡点击；窄屏面板打开时同理。修法=复用 frame() :8006「帧内读、仅变化才写」：stage-actions 动态 bottom=innerHeight−toolsTop+10（窄屏面板开时量面板 top），替换写死 64px；触发条件 stage-actions display≠'none'（不等 reroll）。
11. **monopoly 门函数**：`canPlaque() = canFlyNotes() && !AUTOTEST`（canFlyNotes 不含 AUTOTEST——E1 先例是显式 `|| AUTOTEST` :1746）；M1/M2/M3 全走它。
12. **纹理缓存两类分离**：常驻牌（B1/B2/U1/U2/T2）进内容 sig 缓存；**一次性牌（M1/M2/T1）纹理退场即 dispose、禁进 sig 缓存**（防泄漏）。tod/index 模块级纹理缓存登记进 retire3D 池清空清单 :8341（bubbleTex 漏网先例不再添）。
13. **B3 语义升级备案**：3D nope 环是首个**全员可见**的 nope 倒计时（DOM 横幅仅持 nope 者可见）——写进 SPEC；环收缩读 `G.turn.pending.deadline`（:1108/:1796），挂 frame()。

### A 节采纳（几何/朝向/影）
14. Box 六面材质数组（r128 面序 +x,−x,+y,−y,+z,−z；6 槽全给；rim 四槽共享同一材质实例）；**前/后两面共用同一 CanvasTexture**（专家逐项核算 buildPlane：两视角都正读不镜像）；禁 PlaneGeometry DoubleSide 替代（那才镜像）。texture sRGB+anisotropy 按各文件纪律。
15. Y-billboard 只写 rotation.y，插桩点：bombcat frame() :3063 后 :3078 前；monopoly tick() :3011 旁；uno tick() :2099 前；tod/index frame() 相机合成 :7520-7535 后渲染提交前。
16. 柔影统一 y=FELT_Y+0.008、**renderOrder=1**（低于光池 2/涟漪 3/turnRing 3）、opacity≤0.35、半径≈0.6×plaque 宽；bombcat 当前行动者脚下 turnRing FELT_Y+0.012 不叠影（名牌影挂头顶铭牌本身不用脚底影——B1 影随 plaque 走，锚 plaque 下方 0.02）。

### 访问器/门禁修订
17. `__mono.floaters()` 挂 :3110 `AUTOTEST||inspect` 门控块内；`__cat.plates()` 挂 :2292 无条件块；`__uno.seatPlaques()` 挂 :2332 且 `seatFx()` 旧形状不变；`__three.scorePops()/scoreBoard()` 追加 :7431（只许追加铁律）。
18. 门禁清单补 `ev-uno-seats.cjs`；其余照 §3，端口换 9041/9043/9045/9047。
19. bombcat canvas 档位 256×64（勿上 512）；monopoly plaque 一次性纹理退场 dispose。
20. tod.html 引用行号勘误：makeTip :7238-7242、__three :7431（方案 §1 W4 原引 :7300-7330 是 tickChoiceFx 段）。

## 5b. 评审吸收（视觉+玩家价值专家 SHIP WITH FIXES，全部采纳）

### P0
21. **M3 地契卡砍掉**（过度设计：买地已有弹窗+dealStamp+flyNotes+toast 四重表现，地契卡与 dealStamp 同拍三动效必糊）。W2 聚焦 M1+M2。
22. **M1 配色**：`+` rim `#22d3ee` / `−` rim `#f472b6`（=DOM mfloat/toast 既有收支语义；noteTex 红=¥1000 面额色，红绿轴是发明新语义+色盲陷阱）；底 `#120e22` 实色；金额白 Georgia 900（呼应 noteTex 面额字体），**只有 +/− 符号染 rim 色**。
23. **B1 sig 补 dead 键**：sig=`name|N|turn|dead`（DOM 版四键 :2834 是真相）；内容 `名字 · N`，N=900 28px #fbbf24、名字 700 28px #fff truncate(name,5)；dead：名字 #94a3b8、N 槽 💀（canvas emoji 不吃 fillStyle，探针环境 tofu 则退灰字「0」）。▶ 指示符砍掉（turnRing 已承担）。
24. **T1 计分泡必须复用近景贴脸剔除**（水平距相机 <2.05 跳过，v8④ 同规）——z−76 近景时 0.6wu 牌会糊满屏。
25. **B2 尺寸加大**：0.72×0.20（竖屏实读 ≥24px 底线）；或，**裁决：保留 B2 但按此尺寸**。
26. **T2 压两行单块**：`真心话 N · 大冒险 N` / `跳过 N` 两行，世界 0.78×0.30 单块 @(0,·,−1.88)，PLACE_OBST r=0.35；canvas 256×96 行高 40px 字 30px；字色 #60a5fa/#fb923c/#94a3b8（卡种色提亮档）、700 ZCOOL KuaiLe；**revealed 期 material.opacity 钳 0.75、禁 pop**（完赛回 1），防揭晓抢焦点。

### P1/P2
27. **M1 形状**：Box(0.95, 0.30, 0.04)，圆角底画法抄 plateSprites 胶囊（:1418-1421），**不做钞票形**（2:1 是 flyNotes 视觉签名，混类）；canvas 352×96 或 measureText 自适应（最长 `+¥12,000`=8 字符）。
28. **M2 排版**：主数字 900 72px 白 sans；`✦双数` 副行 700 24px #fbbf24（doubleShock 金环既有色，第三冗余只做确认）；canvas 256×128；plaque 0.72×0.36 @骰位 y1.1（实读 47-66px 富余，**禁止再放大**——M1/M2 尺寸上限钉死防压名牌带）。
29. **U1 排版**：`N张` 的 N 用 900 34px 合成斜体（`ctx.transform(1,0,-0.14,1,0,0)`）+ rgba(0,0,0,.20) 偏移(3,3)底字（cardFaceTex:779-781 签名语言：数字会飞名字不飞）；警示红 `#ef4444`（COLORS.r 本色）；常态 1.2×0.30 / 警示 1.35×0.38（硬上限，d=0.05）；不碰行动环（turn 语义分离）。
30. **柔影只给常驻牌**（B1/U1/B2/T2）；**一次性牌（M1/M2/T1）免影**（动态黑斑读作污渍）。
31. **C2 时序注释**：M1 存活 900ms > 首束钞票落地 700+60=760ms——总额牌活得比钞票久是正确语义，写注释防后人「修」。
32. **备案分类学（防翻案）**：monopoly plateSprites 名牌 Sprite plaque 化=**下一轮第一顺位**（本轮 builder 必须写成独立可复用函数、零闭包耦合）；tod 词牌/hint 条、bombcat iconTexFor=**永久保持平面**（overlay 语义本体：depthTest:false 保压卡可读/0.3wu 厚度物理不可见），与「DOM 控件不 3D 化」同一分类学；reactBubble 非数字不适用。
33. **B3 秒数牌降为可选**：默认只做收缩环（thetaLength 随 200ms tick 读 G.turn.pending.deadline），秒数 plaque 留探针开关默认关；#nope-sec DOM 保留（无障碍）。
