# 设计方案 · 骗子酒馆式第三人称牌桌（TP-Table v3 · 定稿）

> v3 = v2 + 工程红线评审（.pw/review-3p-eng.md）+ 玩家价值评审（.pw/review-3p-player.md）全部修订项。
> 两位专家总判定均为【修订后批准】；玩家价值专家明示「修订稿核对落稿即可开工，无需再次全量评审」。
> 本文件只记录**定稿参数与裁决**，细节推导见两份评审原文。

## 架构定稿（相对 v2 的一处修正）
- **背影 `#tp-back` 改为 `#cam` 直接子元素**（非 me 卡内元素）——按玩家价值评审 A-2「全端底部锚定」：
  `position:absolute; left:50%; bottom:0; transform:translateX(-50%)`，视口锚定而非座位锚定。
  me 卡保留（名牌+徽章可见），avatar-ring/chr-body `visibility:hidden`（保 flyAvatarToDeck 测量，Eng A1/A3 随之简化：无父级 1.21 缩放换算）。
  z 序：UI 层 40 > 背影 35 > 座次卡 20-30 > 毡面 -1——揭晓压暗罩层罩不住背影（ ring 的 stacking context 内 z5），**背影恒亮，符合「我离镜头最近」**。

## 定稿参数表
| 项 | 定稿 | 来源 |
|---|---|---|
| base.game | `{z:-56, rx:19, s:1}` | 双专家一致 |
| spawn.game | `{z:-412, rx:20, s:1.18}`（保持 356px 推进行程） | Eng C1 |
| base.result | `{z:-80, rx:11}`（保住 game→result 后撤节拍） | Eng C2 |
| `.table3d` rotateX | 74°→62°（74+19=93° 翻背面） | Eng C1 |
| LAND_CAM.game | 不动 | Eng C2 |
| 牌堆锚定 | 接受毡面中心下移 14px（牌堆读作桌心偏后），写死不调 | Eng D1 |
| 牌堆 | scale 0.8 + 静态提高不透明度（无动画） | 双专家 |
| 远弧公式 | n≥3：`a_k = PI+GAP + k(2π−2GAP)/(n−2)`，k=0..n−2；n=2 特例：对手锚 a≡0 | Eng B1 |
| GAP | 宽环 0.65 / 窄环(grid<620) 0.95 | Eng B3 |
| n≥9 侧纵列 | x 阶梯 ∓38px（窄屏 ∓30）+ rs×0.85 + zIndex 跟阶梯行 | Eng B2 |
| 背影尺寸 | 窄屏宽 ≤40vw(≤175px)、高 ≤185px；landui 高 ≤117px；宽屏 clamp(180px,22vw,300px)、高 ≤300px | Eng B3 + 玩家 A-2 |
| 背影纵向 | 底贴屏底；竖屏 top≥640；桌面 top ≥ ring 盒 bottom−2（断言锁） | 玩家 A-2 |
| toast | 顶部：`top:max(12px, env(safe-area-inset-top))`；隐藏态 translateY(-120px)；landui 收编为一条 | Eng G1（T-3 的「状态条下 8px、上限 128」内部矛盾——全局元素取顶部安全区方案，标题非交互可短暂覆盖，不遮状态条与底部操作带） |
| 揭晓挂类 | 弃 :has；JS 在 renderGameStatic revealed/choosing 分支（锁检查后）+ runStage revealed 收尾挂/摘 `#screen-game.stage-revealed` | Eng E1 |
| 揭晓 ring 高 | 竖屏 340→210、短窗桌面 268→210；**height 无 transition**，类翻转同 tick 调 layoutRing 重锚 | Eng E2/E3 |
| 竖屏基础 ring | ≤600px 宽常驻 340→240（治 choosing 阶段 79px 超屏） | 玩家 T-1 |
| 揭晓压暗 | ring ::after 静态罩 rgba(10,10,26,.45) + 卡 opacity .8；**弃 filter:saturate** | Eng E4（裁决玩家 A-1） |
| 短窗桌面揭晓 | card-stage 负 margin 叠加（margin-top:−100px，环露 ~110px 下沿），弃竖排让位 | Eng E2 |
| 竖屏揭晓三件套 | ring 210 + card-stage min(280px,72vw) + tool-row 单行 overflow-x:auto（不藏文字，滚动条方案） | Eng E2（微调） |

## 背影动作语言（定稿）
- 呼吸：`.tp-inner` 复用 chr-idle；前倾 `.tp-forward`（chooserId===me && choosing，**持续态 class**）：--tp-y −8px + scale 1.05 + 头下压 + 氛灯 ::after 亮；选卡拍桌 `tp-slam` 400ms 一次性（choose() 内与 whoosh 同拍）；抽卡 `.tp-away`：--tp-y −34px + scale .94 + opacity .85（0.85s 与离座时钟同拍）；说话：halo opacity 随 --voice + sway keyframes。
- `paintVoice/resetVoice` 把 --voice/speaking 同步写到 #tp-back（myId 时）。
- flyAvatarToDeck：`pid===myId` 最前早退（Eng A4，时钟零耦合）。
- 他人离座可读性：`.player-card.away .player-name { opacity:.25 }` + 头像环原位压暗（补婷婷「头和名字分家」）。
- REDUCED/loperf 退路矩阵按 Eng F1 逐条落 CSS（呼吸/前倾/氛灯/away/说话全列）。

## HUD/连带给（新增 G2/G3，玩家价值 A-7/T-7）
- turn-info 提亮 #ffd76a + text-shadow 0 1px 8px rgba(0,0,0,.85)；≤430px 字号 1.5rem。
- 390 档 stat-chip padding 3px 9px、font .74rem、gap 6px；断言所有 chip ⊆ [0,390]；choosing 阶段 stats-row opacity 1。
- 说话可辨：对手沿用既有绿环+绿名（断言 computed color 差异），不另造话泡。

## 明确不做（含理由，供终审复核）
1. **头像环改细环（玩家 A-6 后半）——不采纳**：实拍核实（tt-mobile-myturn-choosing.png），「三色转盘吃人」是**抽象风格 DiceBear 头像图片本身**（avatar-inner 内容），非 `::before` conic 环（仅 3px 可见）。细环改动治不了该症还会改掉全站头像观感。真正落点=上面「他人离座可读性」。后续候选：头像选择器给抽象风格加「图形」分组标签（独立小任务）。
2. **对手话泡（T-7 部分）**：既有三通道（绿环/绿名/声波）已满足「半秒可辨」，不再加层。
3. **竖屏 revealed 藏 tool-row**：保持可见+横向滚动（Eng 备选不取，婷婷底线已由三件套达标，微信机型轻微滚动如实标注）。

## 验收（可证伪版）
1. test-3d 更新：|rx−19|<0.6；点击前 |z+56|<1 前置 + 点击后 |z+56|>5；聚焦档 |z+76|<1；revealed |z+56|>5；新增 tp-back 存在/在视口、lobby me 头像 visible（防 .tp 泄漏）、1100×900 揭晓 ring offsetWidth>0、跳过按钮 bottom≤innerHeight−8。
2. 四档视口 probe（1440×900 / 1280×800 / 1024×768 / 390×844 / 844×390）×（choosing/drawing/revealed/交接）：背影 rect 断言（锚定/上限/与对手脸+名牌 rect 零交）；竖屏 scrollHeight≤844 + 关键按钮 elementFromPoint 命中；landui 工具栏 bottom≤390 left≥0；远座卡宽 ≥70px@1440 / 头像直径 ≥40px@390；9 人局 pairwise 零交 + 布局指纹稳定。
3. 截图人审：四档×四阶段贴图（视觉终审素材）。

## 5. 实施后偏差备案（2026-09-14 实施完成，双检查官终审通过后回写）
| 参数 | 定稿 v3 | 实施值 | 理由 |
|---|---|---|---|
| 窄环 ry | 未单列（30） | 34 | 竖屏侧座两两间距：面圆距 ≥ 半径和（probe 实测） |
| LADX 窄屏 | 30 | 26 | 同上；26 已使两两零交（probe-akai-9p 实测 113-177px） |
| 阶梯 gate | 0.9（Eng B2） | 0.8 | n=9 第二排侧座 |sinθ|=0.874，0.9 抓不到整对（Eng 自己的数值复核，代码检查官 P2-5 确认 0.8 才对） |
| 桌心近侧偏移 | 二选一（不补偿 / +0.06） | +0.08 | n=2 牌堆不被正对面卡压住 |
| 揭晓下沉 | 桌面 110px 单值 | 宽屏 110 / 矮窗桌面 56 / 竖屏横屏 0（只 scale 0.94） | 终审 P0-1：竖屏/横屏背影已锚屏缘，正下沉会整体出画+撑滚动 |
| 挂类时机 | revealed 分支锁检查后 | 同左 + playReveal ③落定帧补挂 | 终审逻辑 P1-1：打字机完成帧挂类晚 2-4.5s，提前到主翻落定与 chrome 淡入同拍 |
| 背影不拦触摸/头像指定 | pointer-events:none | 同左 | hostPickPlayer 绑整卡，穿透语义保留 |
