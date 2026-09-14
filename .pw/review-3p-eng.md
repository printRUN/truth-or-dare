# 工程红线评审 · TP-Table v2（design-plan-3p.md）

评审人：工程红线挑刺专家。只评可行性 / SPEC 红线 / 性能 / 回归风险 / 实现细节正确性。
基线核对：index.html（5772 行，只读未改）、SPEC.md §2、.pw/test-3d.cjs、双 persona 报告。
本评审所有像素级数字均按当前实现实测算出（ring 高：1440×900 短窗档 = clamp(180,26.5vh,268) → 238.5px；390×844 基础档 = clamp(210,44vh,340) → 340px；ring 宽 = min(96vw,900)；rx=46%/ry=26%（宽）、41%/30%（窄 grid<620））。

---

## A. 背影挂卡 `.tp-back`（方案 §A/§F）

**A1【有条件通过】挂卡内 + visibility:hidden 的点击穿透：成立。**
- 依据：`.tp .avatar-ring, .tp .chr-body { visibility:hidden }` 下，visibility:hidden 子树不参与命中测试，点击落到 `.player-card.me` 本身，卡上的 `hostPickPlayer(p.id)` 监听（index.html:2470）照常触发；且 renderPlayers:2519 的 pickable 条件本就排除 `p.id===myId`，穿透语义无新增风险。`.tp-back` 必须 `pointer-events:none`（方案已写，保持）。
- 修订指令：CSS 一律带网格作用域 `.players-grid.ring3d .player-card.tp …`，禁止裸 `.tp`。renderPlayers 是大厅/牌桌共用函数（2454），`.tp` 类与 tp-back 标记必须以 `gridId==='game-players-grid'` 为前置条件写入，不得只按 `p.id===myId` 写进共享 innerHTML 模板——否则泄漏进大厅网格（大厅 me 卡正面被藏 = 回归）。
- 风险：实现者图省事把 tp-back 无条件拼进模板。check-syntax 查不出这种泄漏，必须在 test-3d 新增断言里补一条「大厅 #players-grid .player-card.me 无 .tp 类」。

**A2【否决（方案遗漏，必须补）】徽章体系没有完整迁移清单，会留下悬空伪影。**
- 事实：renderPlayers 徽章刷新循环把 host-tag / score-tag / skip-badge / combo-tag / off-badge 全部 append 进 `.avatar-wrap`（2496-2523）；me-tag、mic-badge、wave、chr-status 也在 avatar-wrap 里。方案只隐藏 `.avatar-ring/.chr-body`，这些兄弟元素仍可见——徽章保留是对的（我仍需看到自己的 👑/分数/连击，婷婷 H6、阿凯 §四4），但两样东西会变成悬空伪影：
- 修订指令：`.tp .mic-badge { display:none }`（麦克风状态在名牌/别处可读，悬空的 🎤 浮在隐形环上是破损观感）；`.tp .wave` 保留但重新定位为背影头顶光环（inset 改挂 .tp-back 顶部），或一并 display:none——二选一，不许留原位。`.chr-status`（去抽卡…气泡）保留原位（挂在卡顶，正好是背影头顶，语义成立）。
- 风险：`.speaking .avatar-ring` 的 box-shadow 绿光随环一起隐藏（visibility 隐藏元素连 shadow 一起不画），方案 F 说「绿光同步到背影」——必须实现为 `.tp.speaking .tp-back::after`（预栅格化 radial 光晕，动画只动 opacity），**不许把 box-shadow 动画搬到背影上**（SPEC 铁律：座位聚光从 box-shadow 脉动改 ::after opacity 就是同一教训，SPEC §2「点亮舞台」段）。

**A3【有条件通过】背影几何：方向对，参数没算父级缩放。**
- 事实：.tp-back 挂在 `.player-card.me` 内，me 卡基态 `scale(var(--rs))` = 1.21（REDUCED 下被 473 行 `transform: translate(-50%,-50%) !important` 拍平成 1）。方案写的宽 clamp(150px, 卡宽×2.1, 45vw) 会被再乘 1.21，实际落屏 2.54×卡宽，与婷婷 22%/45% 上限的核对全部失真。
- 修订指令：所有背影尺寸按「最终落屏尺寸」写规格，实现时除以 1.21（或直接 `.tp-back { width: clamp(124px, calc(卡宽×2.1/1.21), 37.2vw) }` 换算）；落屏验收不改：竖屏 ≤22% 屏高 / ≤45vw，宽屏落屏宽 ≈ 卡宽×2.1。头顶锚点 = 我卡头像环上沿（me 卡中心 − 半个头像），即原 avatar 位置——与方案「头不高于环下沿」一致。
- 风险：REDUCED 下父级 scale 拍平，背影瞬间缩小 17%——可接受（静态退路），但验收截图别在 REDUCED 环境量尺寸。

**A4【通过】flyAvatarToDeck 对我早退后时钟咬合：无风险。**
- 依据：runStage('drawing')（3008-3027）里洗牌 1400ms / dealFlyingCard 1500ms / scheduleReveal 1800ms 是三条独立 setTimeout，与 flyAvatarToDeck 的 850ms 克隆动画零耦合；早退只少一个克隆，时钟不动。早退条件必须严格 `pid === myId`（本机判定），他人屏幕照常飞我的头像——各端表现一致性由 `.away`（CSS，全端同挂）保证：我的背影在所有人屏幕上都做离座前倾，只有本机少飞一个克隆。
- 风险：`resolveAvatar` 在 pid 为我且头像为空时的既有早退路径（3051 `!p||!ring||!uri`）与新增早退叠加——新早退要放在最前，行为等价即可。

---

## B. 远弧重排数学（方案 §B）

**B1【否决（公式未定义，n=2 直接打破 test-3d）】必须钉死分布公式与 n=2 特例。**
- 计算：若按「n−1 人均分弧长、端点占位」的自然写法 `a_k = PI+GAP + k·(2π−2GAP)/(n−1)`，n=2 时唯一对手落在弧端点 a=PI+0.65，front=cos(0.65)=0.796，rs=1.127，与我（1.21）差 **0.083 < 0.15** —— test-3d 第 4 节断言（前排 rs − 后排 rs ≥ 0.15）直接红。
- 修订指令：n≥3 用 `a_k = PI+GAP + k·(2π−2GAP)/(n−2)`（k=0..n−2，端点占位，n−2 段弧长）；**n=2 特例：唯一对手锚在 a≡0（正面最远位，front=−1，rs=0.84）**，rs 差 0.37 ≥ 0.15，zIndex 30 vs 10 ✓。将该公式与特例写进方案 §B 正文，不许留给实现者即兴。
- 风险：除数写错（n−1 vs n−2）只影响间距均匀度，测试测不出 n=3..8 的问题——公式进 SPEC 后 code review 逐字符核对。

**B2【否决（验收红线自相矛盾，n≥9 数学上不可达）】「相邻中心距 ≥1.2×卡宽」与 GAP=0.65 在桌面短窗档冲突。**
- 计算（1440×900，rx=414px、ry=62px、卡宽 ≈80px）：n=9（步长 0.712rad）侧纵列相邻对 Δ=(42.2, 42.7) → 中心距 **60px**；n=10（步长 0.623rad）侧纵列 Δ=(3.2, 37.9) → **38px**。要求值 ≈96-110px。缺口 36-72px，且侧纵列处 dx/dθ≈0（sinθ≈1），**沿弧再怎么错位都几乎只动 y 不动 x**——方案「上下半档阶梯错位」若理解为弧上错半步，等于没错。
- 修订指令（三层）：
  1. n≤8 保留 ≥1.2×卡宽红线（n=8 实测 117px，过线但只有 7% 余量，探头盯住）；
  2. n≥9 侧纵列（|sinθ|≥0.9 的每侧两座）强制 **x 阶梯**：相邻两座 --rx 反向偏移 ∓38px（窄屏 ∓30px）+ rs×0.85 + zIndex 按阶梯行递减。修订后桌面 n=10 该对 Δ=(76,38)，头像缘间隙 6px、名牌（≤92px 宽，Δy 38 > 名牌高）不相交——满足 persona 红线「脸+名牌完整不叠」；
  3. **验收判据对 n≥9 改为「两两 rect 相交测试：头像圆与名牌框零相交」**（probe 实现，婷婷 §4 口径），弃用 1.2× 中心距——否则红线与自身的阶梯豁免互相打架，终审必吵。
- 风险：阶梯改变了「深度」，zIndex 若仍按原 front 值算会出现「阶梯后排压前排」——zIndex 必须跟随阶梯行号。阶梯必须是 n与序号的确定性函数（位置稳定性，婷婷 §4「不许逐回合重排」）；layoutRing 现有调用面（名单结构变化 / applyLand）不扩，新增的揭晓重锚见 E3。

**B3【有条件通过】GAP=0.65 在竖屏会让最近对手撞进背影横 footprint。**
- 计算（390×844，rx=153px、ry=102px）：侧座 x=∓93px、front=0.796（rs≈1.13，卡半宽 ~40px）→ 内缘 ±53px；背影半宽 45vw/2=87px → **水平重叠 34px**，且侧座 y=+81px 只比我的锚点高 ~20px，肩部会擦到侧座名牌。
- 修订指令：窄环（grid.clientWidth<620，与 layoutRing narrow 同判据）**GAP 提到 0.95**（侧座 x=∓125，内缘 ±85 > 背影半宽 78——背影竖屏宽度同步收到 ≤40vw）；宽屏维持 0.65（侧座 x=∓250，余量充足）。
- 风险：GAP 变分档后 n=3（两端点对称侧座）在竖屏会显得「没人坐对面」——备选 0.9~1.0 内取值并跑一次 3 人局截图核对，属观感验收非红线。

---

## C. 机位连锁（方案 §C）

**C1【有条件通过】z−56/rx19 可行，且因所有运镜都相对 base 计算，一镜到底几何保形。**
- 依据：focus 的 z 增量（−20）、push 1.05、夹紧 ±46/±34 全部不变；focus/home/nudge/glance/realign 全是相对 base 的补间，改 base 只是整条时间轴平移。投影包络我逐点算过：环底（中心下 170px）落屏 y 从 168.7 → 160.9（升 8px）；画框上缘内容下移 ~17px（对面头顶余量变大）；底部工具行（中心下 430px）落屏 437 → 432.5（基本中性）——俯角的近大远小与拉远的缩小在底部互相抵消，**无新增出界/裁切**。`#cam` overflow-x clip + 28px 出血不变。
- 修订指令：base.game = {z:−56, rx:19, s:1} 批准；spawn.game 同步 **{z:−412, rx:20, s:1.18}**（保持原 356px 推进行程：−380−(−24)=−356 → −412−(−56)=−356）；牌堆 rotateX(16°) 不动（叠加世界 19° 后净 35°，透视压缩 cos35≈0.82，恰好更「躺」）；**`.table3d` 的 rotateX(74°)（index.html:698）必须降到 62°**——74+19=93° 越过侧视边沿，光池椭圆被压成细线并翻出背面（当前 74+8=82° 无此问题）；loperf 拍平分支（856 行）不受影响。
- 风险：loperf 下 `to()` 把 z×0.4、rx 归零（2879-2880）→ 低端机停在 z≈−22.4、正平行视角，第三人称俯视感消失（座次 % 布局不塌）。这是既有降级机制的必然结果，接受，但要写进 SPEC 降级段备查，不算破坏。

**C2【有条件通过】result/landui 连带。**
- result 基态 z−60/rx9 不动的话，game→result 的拉回段从 36px 缩到 4px，「起身离桌」的节拍没了。修订指令：result 基态改 {z:−80, rx:11}（保持 ~24px 后撤 + 略抬视角），result 屏无座次环，深移无回归面。
- landui：LAND_CAM.game（3720 行 z−26/rx2）**不动**；swapCamBase/realign（3725/3748）按新表补间，进横屏的 z 行程从 2px 变 30px，方向一致，realign 语义覆盖。landui 的第三人称构图（横屏 340px 环）需要单独探头验证，方案验收 2 已列，不重复。

**C3【有条件通过】test-3d 断言同步清单（必改四处，其中两处是「假绿」陷阱）。**
- 必改：① 182 行 `|rx−8|<0.6` → `|rx−19|<0.6`；② 248-249 行聚焦档 `|z+44|<1` → `|z+76|<1`（s≈1.05 不变）；③ **241 行 `waitForFunction(|z+24|>5)` 在新基态下恒真（|−56+24|=32>5，点击瞬间即过）——断言变哑炮**，必须改 `|z+56|>5` 并加前置「点击时 |z+56|<1」校验；④ 267 行 revealed 的 `|z+24|>5` 同病同修。方案 §2 只列了 ①②，③④漏了——这是「测试全绿但推镜早退」的隐雷。
- 新增断言（方案已列，认可并加两条）：tp-back 存在且正面 visibility:hidden；1100×900 揭晓时 ring 仍可见（旧 display:none 命中档，回归锁 E1）；**大厅 me 卡无 .tp**（见 A1）。
- 风险：probe-fp.cjs 也硬编码了旧机位，但它是探针不是门禁，修不修不挡合入，建议顺手改防误导。

---

## D. 桌面从「墙」变「面」（方案 §D）

**D1【通过】毡面扩展 + 牌堆增重，方向正确，两个小修正。**
- 毡面是环内 z:−1 伪元素（无滤镜无子元素，SPEC 认可的静态层），h 175%→210%/top 56% 只改一张静态渐变尺寸，无性能面。但 top 56% 使毡面中心低于环中心 ~14px（238.5px 环时），牌堆锚点是环心（3807 行 offsetLeft/Top 路径）——牌堆会悬在毡面中心上方一点。
- 修订指令：接受该 14px 偏移（牌堆略靠后沿，读作「牌堆在桌心偏远处」，可）；或 layoutRing 锚 deck 时用 `cy + ring.h×0.06` 补偿，二选一写死，不许留「看着调」。牌堆 scale 0.8 + 提不透明度：批准 0.8；「提不透明度」不许用 opacity 动画（静态值直接写死，无逐帧问题）。
- 风险：毡面 210% 高 ≈500px，下沿伸进 choice-section 区域——它是 z:−1 且在 ring 的 stacking context（#cam>规则给 ring 的 z:2）内，永远压不过 z:40 的 UI 层，视觉上是「按钮立在桌沿」，正是阿凯 §一5 要的。无回归面。

---

## E. 揭晓常驻（方案 §E）——本方案最大风险区

**E1【否决（:has 路线必死一半设备）】压缩/压暗不得依赖 `:has()`。**
- 事实：`:has` 需 Chromium 105+/Safari 15.4+；婷婷的主力环境是安卓微信内置 WebView，老内核普遍无 :has——现有 display:none 规则（878 行）在她手机上本来就不生效（她观察到的「手机没消失」主因），同样用 :has 写压缩规则，在她的设备上规则**静默不生效**，揭晓越界原样复发，且桌面 Chrome 上测试全绿。
- 修订指令：删除 878 行整条规则；改由 JS 挂类——renderGameStatic 的 revealed 分支（锁检查通过后）给 `#screen-game` 挂 `stage-revealed`，choosing 分支摘除；runStage('revealed') 的 playReveal 路径同样保证挂上。CSS 全部写 `#screen-game.stage-revealed …`。锁交互自然正确：revealAnim/cardDealt 窗口内 renderGameStatic 早退，类不翻转，压缩不会插进翻牌动画（这正是方案问的「revealAnim/cardDealt 锁与 runStage 的交互」答案：挂类点放在锁检查之后，锁内不动）。

**E2【否决（100px 压缩治不好竖屏，数字在此）】压缩量按实测重算。**
- 婷婷实测（390×844 揭晓）：题面卡 521–919、工具行 939–1058。压缩 100px（ring 340→240）后：卡 421–819 ✓，**工具行 839–958，仍出屏 114px**。方案验收写「完成/跳过按钮在 844 内完整可点」——完成/跳过在卡内确实进了，但工具行（连麦/战况/退出）仍在屏外，婷婷 §1.4 的痛点只治了一半。
- 修订指令（竖屏 revealed 三件套，合计让出 ≈228px）：
  1. ring 340→**210**（−130；别用 240，210 仍保住两排对手的头）；
  2. `.stage-revealed .card-stage { width: min(280px, 72vw) }` → 高 373（−27）；
  3. `.stage-revealed .tool-row` 收成单行：按钮只留图标（span 文案 display:none）+ 横向 overflow-x:auto，高度 ~48px（−71）。
  - 合计竖屏栈：162（顶）+210+12+373+12+48 ≈ **817 ≤ 844** ✓。婷婷的 iPhone 底线 760 仍差 ~57px——如实标注为「微信工具栏机型需轻微滚动」，别在验收单里假装达标；要彻底达标需 revealed 时藏 tool-row（主持按钮对答题人本就低频），作为备选写进方案由产品拍板。
- **短窗桌面（1024×768/1280×800/1440×900）更要命**：今天 display:none 让出 268px；压缩到 210 只让出 58px——删除该规则后揭晓栈比现状**高出 210px**，SPEC §2「PC/平板兼容」段修好的「1024×768 选卡与跳过掉到折线以下」整批回归。768 高的窗口装不下 210+400+工具行。
- 修订指令（短窗桌面）：放弃「竖排让位」，改「** overlap 叠加**」——`.stage-revealed` 下 card-stage 拉负 margin 压到压暗的 ring 上（`margin-top: calc(-1 × (ring高 − 110px))`，即环只露 ~110px 下沿），题面卡读作「摆在桌面上的牌」，同时保住阿凯 §三3「桌子+人+题同框」。验收：1024×768 / 1280×800 / 1440×900 三档 probe 实测「跳过」底 ≤ innerHeight−8，加进 test-3d 新增断言。

**E3【有条件通过】压缩后的重锚与 transition 读数——问题是真的，解法如下。**
- 事实：若给 .ring3d 的 height 加 CSS transition，类翻转后立即调 layoutRing，offsetHeight 读到的是**过渡中间值**（height 是布局属性，动画期间逐帧变），deck/table3d 被锚到半路值——这正是 SPEC §2 锚定段「⚠ 实雷」的变体。
- 修订指令：**height 不加 transition（瞬时写入）**，落位顺滑由既有机制免费提供——卡的 left/top 是 % 值、已有 0.55s transition（740 行），高度瞬变后卡会自动滑到新 % 位置；毡面 ::before 若跳变扎眼，单独给它 `transition: height .3s`（loperf 下关），layoutRing 的重锚仍在类翻转**同一 tick 同步执行**（此刻 offsetHeight 已是新值）。触发时机：仅 `stage==='revealed'` 挂类时执行一次；**严禁挂在「card-section 可见」上**——dealFlyingCard 在 t≈2.2s 就把 card-section 取消隐藏（3109 行），那时还是 drawing、镜头正 focus 在 deck 上，:has 方案会在这个时点压缩，牌堆在镜头下位移 50px（又一个用 :has 的隐性理由，见 E1）。交接回合摘类 → 高度回弹 → 再跑一次 layoutRing 归锚，路径相同。

**E4【否决（filter:saturate 违反自家性能铁律）】压暗不用 filter。**
- 依据：.ring3d 内有常驻无限动画（avatar-ring::before ring-spin 4s、chr-idle 3.2s、wave 循环）。filter 挂在有动画子树的祖先上 = 动画每帧触发整个环层（900×238）的滤镜重光栅化——全效档（未触发 loperf 的中端机）上每帧都跑，软件光栅下就是 SPEC「背景光球去 blur」「16 人波纹环 p95 33.3ms」同款病，还可能把设备实测进 loperf（自我实现）。
- 修订指令：压暗 = 静态罩层 + 卡透明度：`#screen-game.stage-revealed .players-grid.ring3d::after { content:''; position:absolute; inset:0; background:rgba(10,10,26,0.45); z-index:5; pointer-events:none; }` + `.stage-revealed .ring3d .player-card { opacity:.8 }`（transition opacity，合成器路径）。saturate 一项放弃——压暗的目的（焦点让位）0.45 罩层足够，去饱和不是必要条件。罩层 pointer-events:none 保住环上既有点击路径；revealed 期 hostPickPlayer 本就被 2612 行「等这张牌了结再换人」挡掉，无交互回归。

---

## F. 性能与降级总查（方案 §A/§F/E）

**F1【有条件通过】背影本体的性能面：合格，附条件。**
- 静态渐变面积：桌面 ~231×270、竖屏 ≤156×185（按 A3 修订后），一次性栅格化，可接受。呼吸复用 chr-idle（transform-only，合成器）✓。
- 修订指令（退路矩阵，逐条落 CSS，缺一不批）：
  - 呼吸：选择器并进既有 774 行 REDUCED 块与 775 行 loperf 块（chr-idle 已在列，补 .tp-back 的引用即可）；
  - 前倾推桌（轮到我）：transition 实现 → 并入 `body.loperf .players-grid.ring3d .player-card { transition:none }`（857 行）覆盖范围（.tp-back 是卡内元素，写显式选择器，别赌继承）；REDUCED 下给终态（静态前倾或静态正坐，二选一写死）；
  - 氛灯：::after opacity 脉动（合成器 ✓），REDUCED 块加 `animation:none` 并给静态亮态；
  - .away 背影位移：transition ✓，loperf 下瞬移可接受；REDUCED 下 flyAvatarToDeck 本就早退，.away 的背影位移退化为瞬移/静止；
  - 说话晃：新 keyframes（transform-only）→ REDUCED + loperf 两处 `animation:none`；
  - body.paused 的 `*::before/::after play-state paused`（840 行）自动覆盖全部新动画 ✓ 无需动作。
- 风险：最容易漏的是「前倾」和「氛灯」——它们是状态驱动（class 翻转）不是常驻动画，实现者常以为不用管 REDUCED。方案 §F 写了原则，这里给全了清单。

**F2【通过】新的 keyframes 数量受控（≤3 个），全部 transform/opacity 路径，无新增 blur/活渐变层。** 毡面/罩层均为静态单绘制层。批准。

---

## G. toast 移顶（方案 §G）

**G1【有条件通过】DOM 位置安全，两个具体坑。**
- 事实：#toast 在 `#app` 外（1396 行，burst-container 之后的兄弟节点）——SPEC 红线「perspective 包含块」天然满足，**实现时严禁顺手把它挪进 #app**（挪进去 fixed 基准就变了）。landui 已有顶部 toast 先例（1042-1043 行 top:6px + 隐藏态 translateY(-160px)），可推广。
- 修订指令：① 隐藏态 transform 从 `translateY(100px)` 翻成 `translateY(-120px)`（顶部弹出向**上**走）——漏掉这步，toast 会以半截常驻在顶部下方，比盖按钮更糟；② 竖屏 top 定在状态条之下：`top: calc(env(safe-area-inset-top, 0px) + 104px)`（婷婷实测标题+状态条占 y≤162 的一部分，104 可落在标题与状态条之间；landui 分支保留原 top:6px）；③ 与 react-dock（fixed top:46 right:8 z1300）错开：toast 展开期 max-width 收到 `min(90%, calc(100vw − 96px))`，避免 390 宽下盖住浮标；④ z-index 2000 维持（全站最高，压 modal 1500 是既有语义）。
- 风险：landui 旧规则与新全局规则叠加后出现双份定义——收编成一条，删 1042-1043 的特例，防将来只改一处。

---

## 总判定：修订后批准

方案骨架（背影挂卡+visibility、远弧重排、相对 base 改机位、揭晓常驻、全降级意识）与工程现实兼容，无结构性否决。但以下七处必须按本评审改完参数再动工，其中 **E1（:has）、E2（压缩量）、E4（filter）三条不改必翻车**：

1. B1：分布公式钉死为端点占位 (n−2) 除 + n=2 特例锚正面；
2. B2：n≥9 改 x 阶梯（∓38/∓30px + rs×0.85 + 阶梯 zIndex），验收换 rect 相交测试；B3：窄环 GAP 0.95 + 背影 ≤40vw；
3. C1：`.table3d` rotateX 74°→62°、spawn.game z−412/rx20；C3：test-3d 四处断言（含两处恒真假绿）；
4. E1：弃 :has，JS 挂 `stage-revealed` 类，压缩触发点在 revealed 锁检查后（不是 card-section 可见时）；
5. E2：竖屏三件套（ring 210 / 卡 280 / 工具行单行）+ 短窗桌面改负 margin 叠加式，桌面三档 probe 验收；
6. E3：height 不加 transition，重锚同步执行；E4：压暗用静态罩层+卡 opacity，弃 filter:saturate；
7. A1/A2：.tp 作用域与大厅豁免断言、mic-badge/wave 处置；G1：toast 隐藏态 y 翻号。

其余（A3/A4/C2/D1/F/G 主体）按方案实施即可。全部修订落地后，test-3d 更新版全绿 + 三档视口 probe（1440×900 / 1280×800 / 390×844 / 844×390）过一遍，即可进入终审。
