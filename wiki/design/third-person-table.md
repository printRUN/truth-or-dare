# 第三人称牌桌（TP-Table，2026-09 v6）

> 来源：用户点名「改第三人称、借鉴骗子酒馆」。全流程：双 persona 走查 → 设计 v1-v3 → 三位挑刺专家评审 → 实施 → 双检查官终审。
> 权威规范以 SPEC.md §2「第三人称牌桌」段为准；本文记录设计语言与「为什么」。

## 画面语法（一句话）
**暗下去的桌面、亮着的我、浮在桌上的题、对面一圈脸。** 明度层级：UI 玻璃卡 > 对面头像脸 > 我的缘光/氛灯 > 背影体色 > 毡面 > 压暗罩。

## 组成
1. **背影 `#tp-back`**（#cam 子元素，z35，pointer-events:none）：逆光剪影——chrHue 身份色压暗做体、1px 亮缘做形、青色氛灯做魂。深色星空底上纯剪影不可见、原亮度身份色又亮过中景，这是视觉评审算出来的唯一可行区间。
2. **全环 n 等分座次（2026-09-18 改，用户点名「围绕桌子平均分布，有人加入自动重新分布」）**：我锚 a=PI，其余 `a_rel = PI + rel·2π/n`（rel=相对我的入座次序，加入/离开全员平移补位=真实圆桌语义，不是 bug）；n=2 对手锚正对面（逐字节基线）；纵深系数 0.08；n≥9/横屏/窄环侧座阶梯（全环下同侧 ≤3 排）。旧「远弧 [PI+GAP, PI+2π−GAP]」公式退役——小人数把对手全堆在我弧端两侧、远半桌全空，且 3p 对手背对镜头（面向向量与视线夹角 116°）。GL 人物换座由 syncPlayers 记账 + 帧循环 0.7s 墙钟滑移（走位/揭晓期 pending 冻结），详见 SPEC v7 ⑥。
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
- 验收门禁：`.pw/probe-3p-verify.cjs`（5 视口 × 4 阶段，WebGL 可用时为 3D 轮 43 断言，!is3d 断言仅在无 WebGL 环境激活；无 WebGL 回退层另有 `.pw/probe-seats-fallback.cjs` 专测点名牌命中）

## v8（2026-09-16，Three.js 真 3D 优化轮）
v6 的「画面语法」在 3D 语义下转译后继续成立：**暗房间 + 一池亮桌 / 近景剪影 + 缘光 / 躺在毡心的题 / 自亮头像盘恒为最亮 identity 层**。明度硬序（截图直方图验收）：UI 玻璃卡 > 头像脸盘 > 光池毡心 > 人物体色 > 地板。
- 单一光源叙事：可见吊灯 = 唯一光源，阴影平行光与它偏差 ≤20°、永不投向镜头；cool fill 只作「我」的剪影缘光。
- 节奏挂 2600ms 主时钟：飞卡 600ms 起飞 / 1500ms 落定（压 CSS 发牌拍）/ 2600ms 翻面——CSS 与 3D 两路径节拍同构。
- 揭晓是全程最贵的一秒：近景机位、名牌现算、彩带让行三件事任何一件走样，玩家只会记得那一秒是坏的。
- 评审档案：.pw/review-3d-polish-{eng,visual,player}.md（玩家价值专家的砍单顺序与「不可动清单」在案）。

## v8.1（2026-09-17，互动反馈轮）
三件用户点名的事：**点卡要有手感、在进行的人要看得见、摸牌不许插穿桌子**。
- 反馈语言沿用 DOM tapFx 的三层（按下→确认→涟漪），只是搬进 GL：hover 探头 + 光标、按压缩放 + tap 音、点击毡面涟漪 + 牌面白闪。涟漪/白闪是「uniform/变换级」效果，不新增纹理不触发重编译。
- 本地模式 choose() 同步翻转阶段是反馈杀手：reset 当帧执行，任何挂在选卡上的视觉若被 reset 清零，玩家就永远看不到——「反馈效果归 tickChoice 衰减，reset 只清输入态（hov/press）」。
- 进行中 = 脚下光环（世界尺度的第一眼信号）+ 名牌「当前」徽章（近读信号），两层同源（chooserId||activePlayerId）。
- 摸牌走位的几何契约：停点圈 r2.62 + 髋部枢轴前倾 0.38rad 成对成立，上身掠过台面高度带时仍在围边外——单独调任何一个都会穿模。人物现在有 lean 组（髋 y0.52），「上半身整体探出」取代「只有躯干斜躺」。
- 探针（probe-3d-feel）学到的：choosing 的 nudge 会迟到（等 Cam 空闲），卡会从静止指针下滑过——交互类断言必须「等运镜落定 + 命中稳 420ms」，否则假绿假红都出过。

## v8.1 第二轮（2026-09-17 晚，用户截图反馈修复）
三件事：**选卡是本回合玩家的特权、底部浮窗要有浮窗的样子、头像必须长在头上**。
- 互动 = 回合特权：GL 侧 hover/按压/涟漪/抬升全部过 iCanPick()（镜像 choose() 校验）。观众点了不该「像能点」——误导比不能点更伤手感。
- 浮窗家族：动作条与押注面板统一为深色玻璃浮窗（fit-content、贴工具行、blur+边光）。押注面板必须上收 body 层——#screen-game 的高度是内容高，absolute 的 bottom 锚不到视口底；这是「.world transform → fixed 包含块」陷阱的又一变种，解法同 #game-tools（reparent）。
- 头像：平贴片在斜视角下必然「滑离」头球（视差错动 ∝ 贴片离面距离）。脸必须用**同心球面贴片**（r 0.225，大于发壳 0.207），画布加圆形 alpha 蒙版保住圆脸读感。z 微调治不了视差，别再试。
- 揭晓近景的让镜：机位就落在座位弧旁，<2.05 单位的角色直接藏（他只剩半个头在画里）。
- focusCam 深雷：three3d 牌堆 DOM 隐藏 → 零 rect → Cam.focus 早退 → 抽卡推镜静默死亡，且只在「点击快于 1240ms nudge」时暴露（nudge 兜底被 clearStageTimers 清掉）。零尺寸目标要照走推镜 dolly。运镜断言（test-3d 三条 z 轴）现在是这条路径的回归锁。

## v8.4 趣味轮（2026-09-17，用户点名：弯腰方向 bug / 免牌重抽 / 表情包上小人 / 扔鸡蛋）
- **弯腰方向**：lean.rotation.x 写成负角把人旋成后仰——角色 +Z 朝牌堆，正角才是前倾。几何联算（WALK_R 2.62 + 0.38rad）当初就是按前向算的，符号一翻防穿模结论原样成立。教训：探针钉了「数值」没钉「方向」，视觉 bug 要靠人眼走查兜底。
- **免答牌重抽**：qSig 边沿从「原地换皮」升级为「收牌重抽」（reback 翻回 → refly 回牌堆 → 复用既有 fly/pulse/flip 全链）。近景机位下玩家看得到「重新抽了一张」，随机感是戏的一部分；翻面入口 qDrawn=false 拿新题重画，REDUCED 保持瞬换。
- **表情包气泡**：牌桌 3D 下互动表情直接挂到发送者小人头顶（emoji Sprite pop+上浮+淡出）+ 小人 cheer 蹦跳。DOM 表情雨降级为大厅/loperf 专属——「谁发的」比「满屏都是」更有信息量。
- **扔鸡蛋**：库存 p.eggs（开局 1 颗、完成挑战=赢家 +1、上限 9）；🥚 按钮 → 瞄准态（body.egg-aim）→ 点名牌投掷，走 react 即发即忘频道（不撑状态包）。被砸端「前半程看不见、临头才显形」的飞蛋冲本机镜头 + .egg-splat 糊屏几秒；旁观端蛋飞向目标小人+白涟漪。糊屏是 DOM 层（radial-gradient 画蛋清蛋黄，禁 filter:blur），3D 只负责「飞」。
- **测试基建的教训（本轮三次假红）**：① verify 快照的 Cam.jump 会被「等空闲再发射」的 nudge 轮询复燃顶掉——rect 必须在常态机位量，睡过一次轮询 tick 后二次 jump；② 换屏扫视的 animationend 在软渲下迟到，固定 sleep 会量到滑视中途；③ test-landscape 有三条 DOM 时代断言在 three3d 下结构性失效（选卡 pe:none / 按钮已 reparent / 名牌按投影定位），按 E2E 契约适配（evaluate 级 click、浮窗等价语义、视口内改判）而不是改应用。node 进程 server.close 被吊住不退出会累积僵尸 Chromium 拖垮后续所有帧率敏感断言——跑前跑后清端口。
