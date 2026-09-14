# 第三人称牌桌（TP-Table，2026-09 v6）

> 来源：用户点名「改第三人称、借鉴骗子酒馆」。全流程：双 persona 走查 → 设计 v1-v3 → 三位挑刺专家评审 → 实施 → 双检查官终审。
> 权威规范以 SPEC.md §2「第三人称牌桌」段为准；本文记录设计语言与「为什么」。

## 画面语法（一句话）
**暗下去的桌面、亮着的我、浮在桌上的题、对面一圈脸。** 明度层级：UI 玻璃卡 > 对面头像脸 > 我的缘光/氛灯 > 背影体色 > 毡面 > 压暗罩。

## 组成
1. **背影 `#tp-back`**（#cam 子元素，z35，pointer-events:none）：逆光剪影——chrHue 身份色压暗做体、1px 亮缘做形、青色氛灯做魂。深色星空底上纯剪影不可见、原亮度身份色又亮过中景，这是视觉评审算出来的唯一可行区间。
2. **远弧座次**：我从角度分配中排除，对手只坐 [PI+GAP, PI+2π−GAP]（宽 0.65/窄 0.95）；n=2 对手锚正对面；纵深系数 0.08；n≥9/横屏/窄环侧座阶梯。
3. **机位** base.game `{z:-56, rx:19}`：所有运镜相对 base 计算，改 base = 整条时间轴平移，一镜到底语义保形。
4. **揭晓常驻**：JS 挂 `stage-revealed`（弃 ：has）→ ring 压 210 + 静态罩 + 卡 .85（.active 豁免）+ 桌面卡叠进环（-100px margin）+ 竖屏卡面收 260。height 无 transition，挂/摘同 tick layoutRing。

## 红线（踩过/评审定下的）
- `.world` 仍禁 preserve-3d；`#cam > :not(...)` 通配链**禁加 `:not(#tp-back)`**（特异度会反过来压死浮层 z40）——背影/浮层都用 `#cam > #xxx` (2,0,0) 写法，靠 z 数值分层。
- me 卡正面用 `visibility:hidden`（display:none 会破坏 flyAvatarToDeck 的 rect 测量）；`.tp` 类只挂 game 网格。
- 压暗禁 filter:saturate（常驻动画子树上的 filter = 每帧重光栅化）；罩层用静态 rgba + 卡 opacity。
- `stage-revealed` 挂类点必须在 revealAnim/cardDealt 锁检查之后（dealFlyingCard 在 drawing 期就取消 card-section hidden）。
- 竖屏/横屏的背影已锚屏缘（bottom 负偏移），**任何正 translateY 下沉都会整体出画并撑出滚动区**（终审 P0-1）。
- flyAvatarToDeck 对 `pid===myId` 早退：我的离座由 tp-away 承担，避免「双我」。
- rect 断言只能在镜头静止态采集（Cam.jump 后等 |rx−base|<0.15）；`window.Cam` 不存在（顶层 const 不挂 window），evaluate 里要裸引用 `Cam`。

## 动作语言
呼吸（chr-idle）→ 轮到我前倾（`.tp-forward` 持续态，.45s 同族缓动）→ 选卡拍桌（`tp-slam` 400ms 挂 .tp-inner）→ 抽卡离座（`.tp-away` 0.85s 与飞行时钟同拍）→ 说话（halo 随 --voice 亮度 + 2.1s sway，与 3.2s 呼吸错周期防同相锁死）。

## 档案
- 设计定稿与偏差备案：`.pw/design-plan-3p.md`
- persona 需求：`.pw/report-persona-akai.md` / `report-persona-tingting.md`
- 专家评审：`.pw/review-3p-eng.md` / `review-3p-player.md` / `review-3p-visual.md`
- 终审：`.pw/final-review-code.md` / `final-review-logic.md`（均【修复后可合入】，P0/P1 已修）
- 验收门禁：`.pw/probe-3p-verify.cjs`（5 视口 × 4 阶段 70 断言，连续三遍全绿）
