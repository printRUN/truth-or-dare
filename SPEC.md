# 真心话大冒险 - 在线多人游戏

## 1. Project Overview

**Type**: Interactive multiplayer party game
**Summary**: A real-time "Truth or Dare" game where players join with custom avatars, select truth or dare, and draw punishment cards with cinematic animations.
**Target**: Party settings, friends gathering, online multiplayer

## 2. Visual & Rendering Specification

### Scene Setup
- **View**: 3D 舞台（CSS 3D）——`#app { perspective: 1400px }` 提供透视，`#world3d`（`.world`）是唯一的「摄影机 rig」，四个屏（join/lobby/game/result）都在这一层里；屏常态下不挂 3D 变换（只有换屏那 ~0.8s 走 `scene-in/out` 的临时 transform），每屏的常态机位在 JS `Cam.base`
- **Background**: Animated gradient with floating particle confetti, continuous slow-motion drift (one-shot camera feel)
- **Camera**: 无用户相机控制，全部由 `Cam` 调度为一条连续时间轴：`Cam.enter(name, dir)`（换屏时从**当前机位**续接的一段推进——先过冲再缓收常态，不再瞬移到 spawn；`dir<0` 为回退，镜头反向）、`Cam.home()`、`Cam.focus(el)`（推近到元素）、`Cam.nudge(el)`（滑向持麦人）、`Cam.shake()`（翻牌/暴击的震动）、`Cam.parallax(nx,ny)`（鼠标微视差）
- **Lighting**: Soft glow on active elements, neon accents on cards；牌桌由 `.table3d`（rotateX 74° 的椭圆渐变台面 + `#cam` 自带 `perspective: 900px`）充当「桌面反射」

#### 3D 实现的红线（踩过的坑，改动前必读）
- **`.world` 绝不能开 `transform-style: preserve-3d`**：一旦开启，浏览器做 3D 命中测试时父平面（z=0）会盖过 `translateZ(-40px)` 的子屏，`document.elementFromPoint` 返回 `.world`，**全站按钮/输入框点不动**（`details/adv summary` 都打不开）。现在就义：世界层是「带透视的单平面」，屏内命中就是普通 2D；`.cam` 自己开 `perspective` 给牌桌子元素用。回归锁在 `.pw/test-3d.cjs`（`transformStyle === 'flat'` + `elementFromPoint` 命中自身）
- **`#app` 的 `perspective` 会把它变成 fixed 后代的包含块**：`.toast` / `.burst-container` / `.react-bar` / `.modal-mask` 必须留在 `#app` 外，否则定位基准会变
- **3D 座次只写 CSS 变量**（`--rx/--ry/--rs` + `zIndex`）：`layoutRing()` 只在名单结构变化/窗口 resize 时重排，不逐帧计算；前排（`--ry` 大）必须同时 `--rs` 大、`zIndex` 大（近大远小 + 前后遮挡）
- **每屏入场/退场是一段 3D 景深穿行**（`@keyframes scene-in` / `scene-out`）：换屏时新屏从走廊深处 `translate3d(0,0,-520px) rotateY(-6deg)` 推近到落位，旧屏从落位飞到 `translate3d(0,0,240px) rotateY(6deg)` 掠过镜头再淡出；透视直接写进 transform 的 `perspective(1200px)`，**不去动 `.world` 的渲染上下文**（红线：`preserve-3d` 绝不开，`.world` 仍 `transform-style: flat`）。方向变量 `--tx-zin/--tx-zout/--tx-ry/--tx-tilt` 挂在 `.world` 上，回退时 `.world.tx-back` 整体反向。两个动画都只在换屏那 0.8s 里动 transform，`animationend`/超时后 `entering`/`leaving` 类移除，**常态回到 `transform: none`** ——命中测试与布局不受影响（旧版 `screen-in` 只动 opacity 的做法已废弃）
- **低端机 / 降噪**：`body.loperf` 把 `.table3d` 拍平，`Cam.to()` 在 LOWPERF 下自动砍掉旋转/缩放、位移减半；`prefers-reduced-motion` 下 `.world { transform: none !important }`，同时 `Cam.to()` 走瞬时跳转（`Cam.jump` 会作废在跑的补间）
- **3D 命中不能影响正常点击**：`.flip-card` 只让可见的那一面接收点击（`:not(.flipped) .card-front` / `.flipped .card-back` 置 `pointer-events:none`）：部分浏览器会把背面也算进命中栈，翻牌后按钮点不动；E2E 里等待应用自己的动画锁 `revealAnim === false` 再点击，避免撞上翻牌过渡

### Color Palette
- Background: Deep navy (#0a0a1a) with animated gradient orbs
- Primary: Electric purple (#8b5cf6)
- Accent: Hot pink (#f472b6), Cyan (#22d3ee)
- Truth cards: Blue (#3b82f6)
- Dare cards: Orange-red (#f97316)
- Text: White (#ffffff) with subtle glow

### Typography
- Headings: "ZCOOL KuaiLe" (Google Fonts) — playful, Chinese-friendly
- Body: "Noto Sans SC"

### Materials & Effects
- Cards: Glassmorphism with blur backdrop
- Avatars: Circular with animated border glow on active player
- Buttons: Gradient fill with press animation
- Particles: CSS-based floating confetti dots

### Animation System (One-Shot Camera Feel)
- **一镜到底（2026-09 统一为 Cam 调度）**：所有运镜都写 `#world3d` 的 transform 字符串（`translate3d` + `rotateX/Y/Z` + `scale`），`Cam.to(pose, ms, ease)` 用 rAF 补间；**新镜头接管 = `token++`**，旧镜头（含它的 done 回调）当场作废并从当前位置续接，所以永远不会跳帧
- **换屏 = 一镜到底的场景穿行**：`renderScreen()` 只在换屏时干活——`Cam.enter(新屏, dir)` 从当前机位续接（540ms 过冲推进 → 660ms 缓收常态，**绝不瞬移**），旧屏加 `.leaving`（绝对定位、叠在上层、不接点击）沿景深飞掠出画，新屏加 `.entering` 从走廊深处推近； `.world.tx-back` 标记回退方向（join<lobby<game<result 由 `SCENE_ORDER` 定）。join→lobby→game→result 连起来读是一条连续镜头
- **入场时钟必须和加载层对齐**（踩过的坑）：① 入场动画只能在屏已经 `.active`（display:flex）**之后**再挂——`display:none` 期间 CSS 动画不跑，早挂会变成“一显形就已终态”或先满屏闪一帧（所以 `renderScreen` 是「先切 active → 再 `queueSceneEnter`」）；② 加载层还盖着时入场一律攒进 `pendingSceneEnter`，由 `hideLoading()` 揭开幕那一刻放——**不能只在 `prev===null` 时攒**，否则「退出房间后再加入」这种 `lastScreenName` 已是 `join` 的路径会把入场提前放在加载层后面跑完，幕一揭开只剩静态大厅（这正是「加载动画和进入显示不同步」的根因）；③ `scene-in` 的 opacity 在 22% 就坐实到 1——加载层淡出时新屏已是不透明的，揭幕不会先露一段黑底
- **退房不等网络**：`doLeave()` 先抓一份「离开后的房间状态」，**不等 `publishState`/`clearPool` 落地**就把 `joined/S/link` 归零并 `renderScreen()` 切回加入页（退房广播与关链路丢到后台补发；失败也无所谓，心跳超时同样会清掉我）。旧版 `await link.publishState(next)` 在坏网络下会变成退房时一段没任何反馈的空白卡顿。`/rejoin` 回归锁在 `.pw/test-rejoin.cjs` 的「手动退出后不再自动回房」
- **头个回合不抢镜**：进入牌桌时 `Cam.enter` 正在跑推进段，`runStage('choosing')` 用 `Cam.enteredAt` 判定「刚换屏」——刚换屏就不重复 `Cam.home`、把滑向持麦人的 `Cam.nudge` 拖到 1240ms（等推进段落定）；回合内交接才维持 `home(420)` + 460ms 后 `nudge`
- **牌桌常态机位**：game = `{z:-24, rx:5, s:1}`（微微俯视）；抽卡时 `focusCam(deck)` → `{z:-44, s:1.05}`，落牌后推卡牌 `{s:1.05}`，翻前 `Cam.shake()` 轻震；交接回合 `Cam.home(420)` 回桌心 → 460ms 后 `Cam.nudge(新持麦人)` 滑过去
- **启动加载动画**：3D 抽卡预加载 overlay（透视翻牌 + 三颗环绕光点 + 扫光进度条 + 分阶段文案），doJoin 全程复用同一层展示「创建房间 → 连接服务器 → 同步状态 → 载入题库 → 落座」；退场时淡出 + 放大 + 模糊（.hide 过渡后 remove）。**重建的加载层必须淡入**（先 `hide` 再下一帧摘掉，否则满屏深色硬闪一下）；`showLoading` 要 `clearTimeout(_rm)` 取消上一轮 `hideLoading` 排的移除，否则加载层会在使用中途自己消失
- **Background**: Continuous slow drift of gradient orbs + confetti particles, 60s loop
- **Avatar entrance**: Slide-in from bottom with stagger, bounce easing
- **连麦头像波动**：说话者的头像环绿光光晕随音量 RMS 实时变强（--voice CSS 变量驱动 box-shadow），头像本体随音量缩放，双层声波圆环外扩淡出，名字变绿；音量不经过网络，每端用 AnalyserNode 就地分析自己收到的音轨
- **轮到自己抽卡**：真心话/大冒险双卡呼吸发光（brightness 脉动，不动几何位置，不影响点击稳定性）+ 卡面扫光循环
- **Card selection**: Card flies to center with scale-up
- **Card draw**: Card flips with 3D CSS transform, then reveals punishment；洗牌为真实交叉效果：`.deck.shuffling` 期间顶层两张牌按 `shuffle-left/right/mid`（0.55s）交替向左右交叉、中层微位移，容器整体 brightness 脉动；牌堆常驻扫光为窄光带（`left:-60%; width:60%` 平移 0→300%），`overflow:hidden` 裁切在卡面边界内，与 choice-card 扫光共用同一几何与关键帧
- **背景光球不用 `filter: blur()`**：三个光球（500/400/350px）的柔边由多段 `radial-gradient` color-stop 直接画出。旧的 `blur(80px)` 是一个每帧都要重光栅化的大半径模糊层，实测（软件光栅 + DPR3）是大厅 16fps / 牌桌 16fps 的唯一主因；去掉后两处均钉回 60fps（p95 100ms → 16.7ms），而纸屑、`backdrop-filter` 毛玻璃、每人一个的旋转头像环单独开关均测不出成本（全在噪声里），因此保留不动
- **省电模式（三档，`localStorage['tod:perf']`）**：`auto` 自适应 / `low` 省电 / `full` 全效，入口在「🎭 怎么玩」弹窗（所有人可用，不依赖主持人）。猜型号不可靠（主流手机 `hardwareConcurrency` 普遍是 8，iOS 根本不报 `deviceMemory`），所以 `perfWatch()` 在开场与首次上牌桌时实测 rAF 帧间隔（最多 3 次、每次隔 ≥20s），中位帧间隔 >26ms（≈跑不满 38fps）才自动降载并 toast 告知；只自动降级不自动升级，用户手动选过就不再自动测
- **切后台即冻结**：`visibilitychange` 给 `body` 加 `paused`，`body.paused *::before/::after { animation-play-state: paused }`——切到微信聊天窗口时背景不再继续烧电
- **关麦后挂起 AudioContext**：`closeMic()` 里 `MIC.ctx.suspend()`（音频线程不空转），下次开麦 `resume`；进 bfcache（`pagehide` 且 `e.persisted`）时直接收麦，避免麦克风在后台常亮
- **无障碍与低端机**：`prefers-reduced-motion` 命中时走 REDUCED 静态路径（跳过运镜/飞牌/洗牌/打字机，翻面 700ms 后直接呈现全文，翻牌动画锁仍生效）；LOWPERF（`body.loperf`）砍背景光球/纸屑/毛玻璃/头像环旋转与扫光，并把爆彩粒子限量；选择类控件全部 `button` 元素（键盘可聚焦、Enter/Space 可触发）
- **抽卡一镜到底时序**（多端以 `turn.ts` 为统一时钟）：头像飞入卡堆(0-1.1s) → 洗牌(0-1.4s) → 飞牌落向中央(1.5-2.2s，落点在目标布局下预先测量，修复旧版 hidden 零 rect 飞向左上角的 bug) → 牌背“抽取中”呼吸到 2.6s（`ANIM_DRAWING_MIN_MS`）→ 蓄势微抬 240ms → 翻面 850ms → 打字机揭晓 → 彩带
- **防闪答案动画锁**：`applyState` 在 `renderScreen` 绘帧前上锁（`revealAnim`/`cardDealt`），`renderGameStatic` 的 drawing/revealed 分支在动画窗口内直接 return；`playReveal` 用 `transition:none` 瞬时归位牌背再翻，保证“答案不会先闪现再翻回去”；`clearStageTimers` 同时清打字机 timer，防止旧回合对隐藏元素补放彩带
- **Punishment reveal**: Typewriter text effect with blinking caret, confetti burst
- **Turn transition**: All avatars subtly pulse, winner glows
- **Camera pan**: 由 `Cam.focus/nudge` 承担（世界层位移 ≤46px + 轻微 scale，不叠 `scrollIntoView`）；抽卡链路 deck→card 两次缓推（0.95s transform 补间），REDUCED 下全部瞬时到位

### Phase 2.75: 趣味互动（新增）
- **😀 表情雨**：右上角互动浮窗 `#react-bar`（默认收成一颗 44px 浮标 😀，点开才展开 6 颗 emoji 按钮 👏😂😱🔥😈❤️ —— 按钮上显示的就是实际会广播出去的那个表情）在大厅/牌桌可用；展开后发送 1.4s 自动收起，无操作 9s、点屏幕其他位置、Esc 也收起。**位置经过实测**（`.pw/probe-reactdock.cjs`）：浮标固定在右上角（横屏开关下方），展开为竖排 —— 竖屏与横屏、join/lobby/game/revealed 上都与任何 `button/input/.player-card/.choice-card` 零重叠（旧版底栏在 390×844 会压住选卡与工具栏、在横屏左中会压住玩法切换）。点击 → 本机立刻飘一颗 + 房间广播（独立 topic `tod/v1/<房间>/react`，**非 retained**、qos0，不进房间状态），其他人 ~0.1-3s 内看到同样的表情从底部升起。防刷屏 320ms/颗、白名单外表情直接丢、`REACT_SEEN` 去重 + 5s 时效（本地模式 retained 回放不补放）、粒子上限 14（LOWPERF 5）且 2.4-2.6s 自清理
- **🔥 连击**：连续「完成啦」累计 `player.combo`（上限 9），跳过清零；combo≥2 头像挂 `🔥×N` 徽章，≥2 时爆彩 + 音效 + toast，≥3 追加镜头震动。**连击不改分**（完成仍 +10/跳过仍 −5），结算新增「🔥 连击王 ×N」奖章（要求 combo≥3）
- **🔥 加倍挑战**：计分开启时，持麦人在 choosing 阶段可点 `#btn-stake` 押 `turn.stake=2`：完成 +20 / 跳过 −10；不动 seq（不打断动画），回合收尾后自动复位 1；揭晓页显示「🔥 加倍 ×2」角标并把按钮改写成 +20/−10。默认 1 → 既有计分回归（test-host 的 +10/−5）不受影响
- **⏱ 限时挑战**：主持人设置里 `timer ∈ {0,15,30,45}` 秒（房间状态同步）。揭晓页 `#timer-wrap` 用 `turn.ts` 作为全场统一时钟倒计时（250ms 更新一次 `scaleX` + 文案，最后 5 秒变黄并滴答）；到点只显示「⏰ 超时啦（不扣分，大家看着呢）」——**不自动跳过、不扣分**，避免抢走玩家的选择权
- **🎡 命运转盘**：主持人点「🎲 随机点名」时，光点沿 3D 座次环加速跑动再减速停在目标上（`.player-card.spot` 高亮 + 镜头跟着扫），随后才 `designate(pid)` 落地；只在本机演，REDUCED/LOWPERF 直接定点
- **🔊 音效**：WebAudio 现场合成（whoosh/tick/flip/reveal/win/skip/combo/react/tap/draw/spark），**零资源下载**；首次 `pointerdown` 才创建 AudioContext（避免自动播放告警），开关存 `localStorage['tod:sfx']`，入口在大厅/牌桌工具条与「怎么玩」弹层
- **🎵 背景音乐**：同样是 WebAudio 现场合成（**零资源下载**），i–VI–III–VII 小调走向的慢和弦垫（低音铺底 + 三音和弦 + 高八度点缀，1.5s 一步）；`BGM` 复用 `SFX` 的 AudioContext/总线再挂一条独立增益（缓入 1.4s 到当前音量 / 缓出 0.6s）。**默认开**（`localStorage['tod:bgm']` 为 `off` 才关），但 **首帧不出声**：首次手势后才建 ctx 并起播，不违反自动播放策略；切后台（`visibilitychange`）自动停、切回自动续，省电不打扰。独立音量滑杆 `#bgm-vol`（0~100%，默认 90%）在「怎么玩」弹层，滑动即时平滑过渡（0.15s）并存 `localStorage['tod:bgm:vol']`；开关入口在大厅/牌桌工具条与「怎么玩」弹层，与音效开关互不干扰
- **🎵/🔊 双总线**：`SFX.master`（动作音效）与 `SFX.music`（背景音乐）是两条独立总线，各自直连 `destination`，音量互不影响；`BGM.node` 接 `SFX.music`，动作音效接 `SFX.master`。这样「压音乐」不会连带把抽卡/翻牌提示音一起调小
- **🎙️ 连麦自动压低（ducking）**：外放时本地音乐会从麦克风串出去（无法避免：`echoCancellation` 只对「远端播放信号」这个 AEC 参考有效，本地 WebAudio 现场合成的声音不在参考里），所以 `syncAudioDuck()` 在**广播**时把**背景音乐总线** `SFX.music` 压到 14%（触屏设备走媒体外放时压到 **6%**：那条出口不经过通话渲染，浏览器硬件回声消除的远端参考失效，串音更难消）、**仅收听**时压到 50%、空闲恢复 100%（320ms 缓变，只改增益不起停振荡器）。**动作音效总线 `SFX.master` 始终保持原音量**（只压音乐、保留音效原提示音）。**判据是真实链路数 `MIC.peers.size` 而不是默认开的 listen 偏好**（否则没人说话时也会无端压低音乐），钩子在 `makePeer`/`destroyPeer`/`toggleMic`/`closeMic`；远端人声两条总线都不走、音量不受影响。开关「连麦时降低音乐」在「怎么玩」弹层（`localStorage['tod:duck']`，默认开），关闭后开麦也不再压低；首次开麦且音乐开着时提示一次「戴耳机才能彻底消除音乐串音」（软件层面只能减弱、不能根治）
- **👆 抽卡/翻牌点击反馈**：选卡（`.choice-card`）、卡堆（`.deck`）、翻牌（`.flip-card`）在 `pointerdown` 时统一走 `tapFx()` —— 按下回弹（`tap-pop`；翻牌用独立 `translate` 属性的 `card-press`，**不覆盖 `.flipped` 的 rotateY**）+ 以点击点为圆心的涟漪 `.tap-ring`（`landPick` 换算旋转坐标，0.5s 自清理）+ 轻点击音 `tap`；落牌补 `draw` 发牌声、翻面补 `spark` 上扬音并闪一次牌面扫光 `.flip-glint`；牌面里的动作按钮（完成/跳过/免答）不抢反馈，REDUCED 下只保留音效与静态
- **🎲 观众押注**：牌一揭晓，旁观者（持麦人不能押）面板 `#bet-box` 出现：「✅ 会完成 / ⏭ 会跳过」，再点一次取消，可随时改押；押注存在 `turn.bets`（小对象，随状态同步），揭晓时保持秘密。持麦人交卡时 `settleBets()` 结算：押对 **+5** / 押错 **−3**，**只动押注者自己的分**（不动持麦人的账）；结果写进 `turn.betLog={at,items}`，全场看到同一份「押注结算」播报（按 `at` 去重，10s 时效 + 首帧不补报历史），押中者额外爆彩。无押注时零开销；计分关闭时面板不出现。
- **🎁 惊喜卡（纯气氛）**：揭晓时由 `surpriseOf(turn)` 从「题目文本 + turn.seq」确定性推导（同题同 seq 全场同结论，不占状态字段），**1/5 概率**开出；效果集：🎉 彩带风暴 / 🥁 命运鼓点（镜头震）/ 🌧 表情雨（本地自动撒）/ 🏅 金色卡面 / 📢 全场播报。金卡只是视觉（金边 + 扫光 + `.surprise-tag` 角标），**不改任何分数与账本**；主持可在 ⚙️ 设置里整体关闭（`S.surprise=false`，关闭后推导恒为空）。特效只在揭晓那一刻放一次（`lastSurpriseSeq` 去重），中途加入的客户端也能看到金卡静态上色。

### 横屏支持（手机横持自适应 + 手动切换）
- **一套布局、两条路径**：手机横过来（真·横屏矮视口 `innerHeight ≤ 620`）自动进横屏布局；竖着拿时点顶部右侧 `#btn-land` 也能横屏。两条路共用同一套 `body.landui` 规则，判定与开关都集中在 `applyLand()`
- **原生优先、旋转兜底**：手动切换先试「全屏 + `screen.orientation.lock('landscape')`」（Android Chrome 可用），不支持/被拒（iOS 浏览器、微信 webview、桌面）就给 `body.landforce`——把整个 body 旋转 90°（`rotate(90deg) translateY(-100%)` + `transform-origin: 0 0`，宽高用 --lvw/--lvh 互换）铺满物理视口，用户横持手机即正常玩。选择记 `localStorage['tod:land']`，刷新保持；真·横屏下按钮自动隐藏（已满足，无需入口）
- **逻辑尺寸一律用 `--lvw/--lvh`，不用 vw/vh**：旋转兜底时 vw/vh 仍是物理竖屏尺寸（844×390 的逻辑横屏会被当成 390 宽），所以横屏布局的尺寸都取 JS 实测并写在根元素上的 `--lvw/--lvh`；`body.landui` 把 body 锁成逻辑横屏视口（`height: var(--lvh)`、超出隐藏），滚动交给 `#app`
- **旋转下的 fixed 坐标换算**：`getBoundingClientRect` 给的是物理坐标，而旋转坐标系里的 fixed 元素要的是本地坐标（`Lx = Py`、`Ly = 物理视口宽 − Px`）——`landPick()` 负责换算，`burst()` 与飞头像/飞牌三个调用点已接入；`react-rise` 的上升距离改成 `--rh`（默认仍 36vh）
- **横屏机位分档**：`body.landui` 下 `Cam.base` 换成更平的矮屏机位（join z-30/1°、lobby z-22/1°、game z-26/2°、result z-34/3°；进出横屏时由 `swapCamBase` 整体切换并瞬时归位），避开 1400px 透视在 390px 高度里把屏底元素放大推出屏；`Cam.focus` 的平移钳位在横屏收到 ±16/±12（竖屏仍 ±46/±34）
- **座次环自适应**：`layoutRing` 的 narrow 判据从 `window.innerWidth < 620` 改成 `grid.clientWidth < 620`（横屏里座次区只占半屏）；横屏且环高 < 320 时椭圆压扁（`ry=24%`），玩家卡不越出座次区
- **每屏横屏排布**：join = 表单 + 头像墙 + 题库导入三栏（头像墙自身可滚）；lobby = 左侧邀请/玩法/开局、右侧玩家墙，工具条移到最底一行（宽度足以放下 6 颗按钮，不做横向滚动）；game = 左 3D 座次环、右回合文案/选卡/揭晓，工具栏压成一条横滑条（按钮缩到 0.66rem，内容不横向溢出）；result = 左颁奖台、右战绩榜；弹层整高 `calc(var(--lvh) - 16px)`、内容内部滚
- **矮屏红线**：横屏下五个屏的主 CTA 必须在首屏内（join 加入按钮、lobby 开始、选卡双卡、完成/跳过、结算按钮）；牌面长题走 `.punishment-text` 自身滚动（`flex:1 1 0; min-height:0; align-items: safe center`，超长时不裁首行），动作按钮永远留在卡内

### PC / 平板兼容（矮屏桌面与平板）
- **文档永不被 3D 投影撑宽**：`.table3d` 经 `#cam` 的 900px 透视放大后包围盒比视口宽（1280 视口实测被撑到 1318px），`.world` 的 rotateX + 透视投影也会外溢 —— 这会把移动仿真/平板上的 layout viewport 顶宽，连带把 `position: fixed` 的横屏开关与互动浮窗推出可视区。现在 `#app { overflow-x: clip }` + `#cam { overflow-x: clip; overflow-clip-margin: 28px }`（clip 不影响纵向，body 仍是唯一的页面滚动容器；28px 出血留给座次环前后排卡片的轻微溢出）。取证：`.pw/probe-overflow.cjs`（1280×800 / 1024×768 / 768×1024 三视口 ×3 屏，实测 `scrollWidth === clientWidth`）
- **矮屏桌面/平板（宽 >600 且高 ≤920，且非手机横屏）**：压档上限从 880 提到 920，因为 1440×900（笔电 / retina 缩放最常见档）下揭晓页「跳过」底 903.8 > 901 刚好掉出折线；座次环收到 `clamp(180px, 26.5vh, 268px)`、选卡 136×158、牌面 300×400、统计/回合文案降一档；**揭晓时用 `:has()` 收起座次环**（`body:not(.landui) #screen-game:has(#card-section:not([hidden])) .players-grid.ring3d { display:none }`），把首屏让给题面与「完成/跳过/免答牌」—— 修「1024×768 / 1280×800 下选卡与跳过掉到折线以下」。手机横屏 landui 是左右分栏，用 `body:not(.landui)` 排除
- **⚠ 这段压档规则必须写在基础规则「之后」**：它和 `.players-grid.ring3d`（基础值 `clamp(210px, 44vh, 340px)`，在 3D 舞台那一段里）同特异度，写在前面就会被反向盖掉 —— 早先这段在文件前部，座次环高度一直是死代码（1024×768 选卡底越界 22px 就是这么露出来的）。现已整段挪到 `body.loperf` 之后、`body.landui` 之前（landui 靠更高特异度继续接管横屏）
- **宽屏内容列居中**：`.screen` 是 `.world`（`width:100%`，1920 视口下 1880px）的普通块级子元素，光有 `max-width:920px` 会整块贴左边（3D 舞台落地后一直如此：`#app` 里的标题/状态条居中，屏内容偏左，右半边全空）—— 现在 `.screen { margin-left/right: auto }`；`body.landui .screen { max-width:none }` 与绝对定位的 `.screen.leaving`（`left:0; right:0; margin:auto` 居中，不用 `translateX(-50%)`，因为它的 transform 现在要留给 `scene-out`）都不受影响
- **宽屏加入页两栏**（`min-width:760px` 且非 landui）：`.join-box` 改 grid（左表单 + 右 264px 头像墙，`#grp-avatar` 用 `grid-row: 2/9` + `overflow-y:auto` 吃满行高不撑大文档），“加入游戏”从 y≈877 抬到 y≈566，720/768/900 高的笔记本首屏直接可点；窄屏与 landui 三栏版不变
- **宽屏房间页两栏**（`min-width:1440px` 且非 landui）：`#screen-lobby.active` 改 grid（`minmax(0,1fr) minmax(0,1.08fr)`，内容列放宽到 1180px），左列邀请码/玩法/统计、右列座次环（`grid-area:1/2/5/3`）、底部操作条跨两列 —— 1920 下 920px 内容列右侧近半屏全空的问题就地消化。门槛定在 1440 而不是 1280：1280 时 1180px 内容列右缘（1230）会被展开的互动浮窗（x≈1228 起）压住。实测 1440×900 / 1920×1000 左列中心偏移 -313px、座次环 +290px（真两栏），1280×800 及以下仍是单列
- **互动浮窗在 PC/平板上**：位置与手机一致（右上角），`.screen` 最宽 920px 居中，宽屏时浮标恰好落在内容列右侧留白里；桌面鼠标可用、Esc 收起；`.pw/probe-reactdock.cjs` 留了各视口的浮窗遮挡取证

## 3. Game Flow Specification

### Phase 1: Lobby / Join
- Player enters name → selects/creates avatar
- Avatar options: 加入页头像区三标签 —— **预设**（24 张 = 14 pixel-art 像素 + 10 shapes 假面，🎲 一键随机）/ **🎨 定制**（DiceBear 全部 31 风格自由选）/ **我的**（保存过的定制 + 上传照片，localStorage 持久化，下次访问还在，可删）
  - **DiceBear vendored（不调官方 API）**：`@dicebear/core@9.4.3 + @dicebear/collection`（全部 31 个风格包）经 esbuild 打成 ~2MB IIFE（`DiceBearLocal.diceAvatar(style, opts)` + `DiceBearLocal.STYLES`），内联进 index.html 的唯一 `<script>` 内 → file:// 离线可用。代价实测：单文件 ~2.21MB，file:// 冷启动到可交互 **~2.2s**（2026-09 实测）。许可：各风格包代码 MIT；31 个设计多为 CC0/CC-BY-4.0（定制器底部 `.cz-credit` 一行署名 dicebear.com），其中 avataaars/bottts 设计为作者 Pablo Stanley 明示「个人及商用免费」+ 代码 MIT。只用官方 npm 包，**不接 DiceBear 托管 API**（隐私 + 离线）；seed 是随机 base36 或固定串 `TOD-P##…`，**昵称绝不出本机**
  - **🎨 定制器**：`cz = {style, seed, bg}` 三轴——31 风格小样格（活体预览，跟随当前 seed/底色）、🎲 换一张（重掷 seed）、8 柔色底色 + 无底色（棋盘格）。「✔ 就用它」仅本场使用；「💾 保存到我的」入库并自动选中。shapes 风格自动挂 `style:'bold'` + 8 色鲜色池（原假面预设同款规则）
  - **`dcb:` 配方协议（状态只传配方不传图）**：定制头像在房间状态里是一条 `dcb:{"s":风格,"d":seed,"b":底色}` 短配方（~54B，无底色省掉 b），各端 `resolveAvatar → recipeToUri` 就地展开成 data-URI（`DCB_CACHE` 缓存、>400 条清空），`avKeyOf` 原样透传（不以 av:/data: 开头）→ 跨端逐字节一致、帧体积与旧 av:P## 同量级（两玩家空局整帧实测 ~687B，含 dcb 配方）。旧票/旧状态里的完整 data-URI（上一代手绘头像、上传照片）仍原样透传渲染，向后兼容
  - **「我的」持久化**：localStorage `tod:avatars:v1` = `{mine:[配方|dataURL,…]}`——去重置顶、**封顶 30 张**、quota 满 toast 认栽；`tod:me` 存上一次 {名字,头像}，下次访问 `applyIdentity` 恢复并自动落到对应标签页（非预设一律进「我的」）。上传照片走 canvas 居中裁方压成 96px JPEG q0.82（~3-9KB/张）直接入库并选中。删除是**两连点**（首点染红 ⚠ 2.5s 再点才删，与 `armedTap` 同一破坏性操作约定），删掉正在用的头像自动回落 `av:P01`；触屏无 hover → `@media (hover:none)` 下 ✕ 角标常显
  - **跨端逐字节一致**：PRNG 由 seed 播种、不开 `randomizeIds`（它用 Math.random，会破坏一致性）→ 任意两端同配方产物 SVG 相同（test-avatars 断言两个独立页面逐字节相等）；CSS `border-radius:50%` 把方图裁成正圆，替代 v9 不支持的 circle 背景
  - **v9.4.3 踩坑备忘**：`backgroundType` 实际只有 `solid`/`gradientLinear` 分支，传 `'circle'` 等会让渲染器返回 `undefined` 整图黑掉；颜色一律传**不带 `#`** 的 hex（core 的 `convertColor` 自己补，带 # 会变 `##xxx` 无效色）；多色池要传数组（`backgroundColor:[hex]`、shapes 的 `shape*Color: [8 色]` 每调用现切 `.slice()` 防共享数组被确定性 shuffle 原地打乱）；AVATAR_PRESETS 的 `st` 必须逐字对 bundle 风格键（写成 `'pixel'` 而键是 `'pixel-art'` → `createAvatar(undefined)` 直接崩页，被 test-mask 逮过）
- "加入游戏" button → player appears in the lobby grid
- All players see the lobby in real-time (MQTT sync; local-mode fallback via BroadcastChannel)
- 分享：http(s) 下显示并复制 `?room=` 链接；file:// 本地打开时链接对别人无效，自动降级为展示/复制「房间号邀请」（联机靠房间号 + 公共 broker，与各人文件存放位置无关）
- 邀请自动识别：`extractRoom()` 支持 `?room=` 链接 / 「房间号 XXXXX」邀请文字 / 裸房间号三种形态；四个入口 —— 页面加载后静默读剪贴板、从聊天切回页面时（visibilitychange）自动读、输入框 📋 按钮手动读、粘贴进输入框时当场提取；doJoin 对整段邀请原文也能兜底解析
- **主持人制度**：建房者即主持人（`S.hostId`，离开/消失时 `normState` 自动移交最早加入者，全员判定一致）；主持人头像左上角实时挂「👑主持人」金色徽章（大厅/牌桌通用，跟着 `hostId` 走，与 你/🎤/ 四角错开）。**主持人刷新自动回房即让位**：凭票回到房间后变成普通成员，指挥权移交给还在场上的最早玩家（只剩自己一人时不让位，否则没人能开局），并 toast 告知交给了谁只有主持人能：开始游戏 / ⚙️ 设置 / 🎲 点名 / 🎲 换一题 / 🏁 提前结算 / 🔙 回大厅 / 🔄 再来一局；非主持人点开始显示「等待主持人…」并 toast 提示，函数层也各自 `isHost()` 兜底。破坏性操作（提前结算、回大厅、覆盖导入、清空题库）走 `armedTap` 二次确认：首点染红 3 秒「⚠️ 再点一次：…」，超时自动解除
- **⚙️ 设置弹层**（主持人，大厅/游戏内同款）：玩法（轮流/自由，局中切换下一张牌生效、不打断当前持牌人）、题目尺度 🟢温和/🟡普通/🔴刺激、计分竞技开关、轮数上限（0/6/10/15/20，打满自动结算）、题库套装整套替换、恢复默认/清空题库；所有改动即时同步并在大厅摘要条（📦 套装 · 尺度 · 计分 · 轮数）汇总
- **🎯 点名**：主持人点玩家头像指定某人，或 🎲「随机点名」（自动避开自己与当前持牌人，点了必换人）——仅 choosing 阶段生效；可点头像带 🎯 角标 + 紫色名字 + hover 光环（`pickable` 态，排除主持人与当前持牌人），头像下方提示条「🎯 点玩家头像即可指定 TA 玩这一轮」只在该点名时向主持人显示；点当前持牌人幂等（不空转 seq 重放动画），普通玩家点头像静默无打扰
- **新手引导**：「❓ 怎么玩？3 秒看懂」弹层（建房/抽卡/完成或跳过四步图解）；每台设备首次进大厅自动弹一次（localStorage `tod:guide` 记录，只弹一次不再打扰）
- **撞号确认**：建房时房间号已被占用 → 弹层二选一「👋 加入这个房间 / 🆕 换个房间号自己开」，不再静默并入陌生局
- Host picks a game mode before starting: 🔄 轮流制对决 / 🎤 自由对决

### Phase 2: Avatar Display
- Grid of circular avatars with name labels below
- Active player's avatar pulses with glow ring
- 连麦中（micOn）的玩家头像左下角显示 🎤 徽章；正在说话时叠加绿色声波环
- Avatars arranged in a semi-circle / grid layout

### Phase 2.5: 连麦（语音通话）
- 大厅和游戏页均有 🎙️ 连麦开关（btn-secondary 胶囊，开启后变绿色 live 态 + 三色音量条）和 🔊 收听开关；**开麦 = 广播**：一个人点连麦，房里其他人在什么都不点的情况下就能听到他（不需要双方都开麦）；收听默认开（`localStorage['tod:listen']`），且只是自己这端的出口——关它不影响自己讲话，也不影响别人互听；两个开关都以 `player.micOn` / `player.micListen` 写进房间状态全房可见（**必须同步给对方**：广播方靠它决定要不要往这个人推流，不同步就会在对方静音后留下一串“声音打进黑洞”的死链路，而且对方恢复收听时再也接不上）
- 语音 = WebRTC 网状网，一条链路只要**有一方在广播**就该存在；方向位 `pr.dir`：1=我在播、2=对方在播、3=全双工，由 `iBroadcast(pid) = 我开麦 && 对方在听` 和 `theyBroadcast(pid) = 对方开麦 && 我在听` 算出，两端各算各的且天然互补；want 集或 `pr.dir` 任一变化就拆链重谈（`recvonly` 的旧链路不会因为我单方面 `addTrack` 就变成双向，不重谈会“显示接通但其实没声”）；信令走房间新 topic `tod/v1/<房间>/mic`（非 retained，点对点定向），MQTT/本地两种传输都复用同一条 RoomLink
- 带宽实话：N 人房里 1 人开麦 = 该人上行 N-1 份独立编码的音频流（Opus 约 40kbps/路），开麦的人越多、房间越大，每个广播者的上行压力线性增长；纯收听方只上行信令，几乎零带宽
- 防冲水：只有一方在广播时由**广播方**发 offer（纯收听的一方永远是应答端，方向不会被谈歪）；双方都在广播时才回到 clientId 字典序（小者发 offer），避免互发 offer 的 glare；非 trickle，等 ICE 收集完发整份 SDP（本地模式 localStorage 单槽位不丢候选），**但收集有 6s 上限**：到点先发出整份 SDP，之后新收集到的候选改走 `kind:'ice'` 单条补发（晚到的 srflx/relay 不再永久丢失，否则跳 NAT 必挂）；9s 不成链发起端重建一次；关麦发 bye 拆链（但 `pr.dir === 2` 的收听链路会留着，我一关麦不该把别人讲话的声音一起干掉）
- 出声两条路径、二选一互斥（同一个流走两路就是叠音）：**元素直出**（桌面默认，行为不变）与**媒体外放**（触屏设备默认）。触屏判定用 `(hover:none) and (pointer:coarse)` 媒体查询而**不用 UA**（iPadOS 会伪装成桌面 Safari 的 UA，UA 嗅探恰好在目标机型上误判）。为什么要两条：浏览器只要把远端 WebRTC 音频交给 `<audio>` 播放，就认定这是「通话」，系统会把输出切进 communication 模式 → **听筒**（Chromium 甚至回滚过「WebRTC 默认扬声器」的改动），而网页没有 `setSpeakerphoneOn`／切输出设备这类接口（移动端 `setSinkId` 在多数机型枚举不到输出设备，iOS 对单轨 WebRTC 流还会静默失效）——媒体外放绕开通话模式，媒体输出在各端恒定走扬声器
- **媒体外放的实测坑（`.pw/probe-micspeaker2.cjs`）**：远端音轨必须先被一个 media 元素「消费」，WebAudio 图才收得到数据——没有元素时 `AnalyserNode` 与 gain 输出**恒为 0**（真机上就是「链路已通却一点声音都没有」），把同一个流挂到一个不播放的元素上立刻有信号、移除元素又回到静音。所以媒体外放保留一个挂在流上、但 `autoplay=false` 且从不 `play()` 的**「消费者」元素**（paused 元素不出声、也不会被当成通话渲染），出声全交给 gain；`ensureAudible` 在这一路的判据换成「gain 断了就补、ctx 被挂起就限流 resume」，并在启动时 `pointerdown` 预热 ctx（纯收听的人可能从不点连麦，iOS 上 ctx 必须在某次手势内创建）
- 桌面走元素直出的三级保障：`<audio>` 自动播放被拦时 `AnalyserNode` 照样有波形（=“对方头像在动但一点声音都没有”），所以 `play()` 失败后会把远端流再接一路 `GainNode → AudioContext.destination` 兜底出声，并在下一次 `pointerdown` 手势重试；元素一旦真出声（`playing`）就撤掉兜底避免两路叠音，`pause` 则由 rAF 里的 `ensureAudible` 限流 1.2s 重新拉起；AudioContext 在 `toggleMic` 的**手势内同步**创建并 resume（先 `await getUserMedia` 再 resume 在 iOS 上已不算手势）
- 外放的代价与逃生门：媒体外放不经过通话渲染，**浏览器硬件回声消除对这条出口失效**（外放开麦时对方可能听到回声/音乐串音），对策是广播时把背景音乐压到 6%（见 ducking 一条）+ 首次走外放提示一次「戴耳机效果最好」；「怎么玩」弹层给一个「📢 连麦语音外放」开关（`localStorage['tod:speaker']`，桌面隐藏，默认开），个别机型 AudioContext 出声有问题或想改回听筒时一键切回元素直出，**通话中切换即时生效**（先拆旧路径再建新的，任何时序都不叠音）；连麦按钮 title 里也写明当前走的是「外放」还是「直出」（触屏设备才显示），真机上一眼能确认到底有没有外放
- 链路自检（2.5s 一次，getStats）：connected 但 `inbound-rtp` 一个音频包都没收到 → 「对方未推流」，**只在该链路 `dir & 2`（对方本该在播）时判定**，我单向广播给别人时收不到包是正常的事，不许误报；协商完成但 14s 还没成链 → 「跳运营商/对称 NAT 需要 TURN 中继」；走没走中继记在 `pr.relay` 并写进按钮 `title` 明细
- 音量可视化零网络开销：本地麦 + 每个远端音轨各挂一个 AnalyserNode，rAF 循环算 RMS → 写 `--voice` / `.speaking`，头像波动即音量计；门槛 RMS 0.045 + 320ms 拖尾防闪烁
- 已知限制：无 TURN 服务器（纯静态单文件零后端），对称 NAT / 严格防火墙下可能连不通；无麦克风权限时优雅降级为纯文字游戏

### Phase 3: Choice (Truth or Dare)
- Active player sees two large buttons: 真心话 / 大冒险
- Click → card animates to center
- Each card has icon + label + animated border

### Phase 4: Draw Card
- Card animates to center (3D flip reveal)
- Spinning/drawing animation (1.5s)
- Random punishment text appears with typewriter effect
- Confetti burst on reveal

### Phase 5: Punishment Display
- Large card showing the punishment（文案去术语：「抽到的题」「完成挑战或跳过」）
- Player must "完成啦 ✅" or "跳过"（跳过不再污名化：中性样式、只在计分开时显示 ⏭ 角标）
- **计分红线（scoring 开，默认）**：完成 +10、跳过 −5，实时反映到头像角标（负分粉色 `.score-tag.neg`）、🏆 领先 chip 与 📊 战况；计分关时隐藏一切分数元素，纯欢乐局零压力
- **🎲 押注红线**：旁观者的押注只改押注者自己的分（±5/−3），**永不改变持麦人的得失分**；`test-host.cjs` 的 +10/−5 与 `passes=2` 回归不受影响（无押注时分支零开销）
- **🃏 免答牌（每人每局 2 张）**：抽到不满意可打出——静默换一题，**不算跳过、不留任何记录**，牌数用尽即止；只有持牌回合本人可见
- **🎲 换一题（主持人）**：局中任何时候给当前这张牌换题，同样不动任何人的账本（掉线救急/口味不对都能用）

### Phase 6: Turn Pass
- Next player's turn (mode-dependent, see Game Modes)
- Smooth transition: active glow moves to next avatar
- Background subtly shifts perspective
- **掉线保活**：`lastSeen` 超 40s 的玩家头像灰化 + 「离线」角标；若卡住的回合属于掉线者，主持人/最老客户端看到 ⏭「替 TA 跳过本轮」代跳条（抽卡动画窗口内不出现），代跳按该玩家跳过记账（−5）并解锁回合
  - **巡检不靠状态包**（修「代跳条最长要等 25s 心跳」）：`startTimers()` 额外跑一个 2500ms 的轻量 `watchTimer`，只在本机处于牌桌且对局中时重刷灰化/徽章/代跳条（`renderPlayers` + `updateGhostBar`），不再依赖下一次整文档心跳；`stopTimers()` 一并清掉

### Phase 6.5: 结算与颁奖（🏁）
- 触发：主持人点「🏁 结算」（二次确认），或约定轮数打满（`roundLimit>0 && stats.rounds>=roundLimit`，`closeTurn` 内判定）→ 写入 `S.finished={at,by}` 标记，全员切到结算屏（`currentScreen` 最高优先级）
- **颁奖台**：按分数（计分关时按抽卡次数）排序的前三名 🥇🥈🥉 podium + 一次性彩带（`finished.at` 去重）；趣味奖章：🏆 本局冠军 / 🔥 最活跃 / 💬 最会坦白奖 / 🎯 玩得起奖（完成最多）/ 😌 稳如泰山奖（零跳过，需 ≥2 抽）
- 全员战绩明细表（抽卡/💬/🎯/⏭/🃏/分）
- 主持人操作：🔄 再来一局（重置比分/免答牌/防重历史，直接开下一局）· 🔙 回大厅（二次确认，清 finished 回大厅保留房间）；非主持人只读观赛

### Game Modes (两种对决模式)
- **🔄 轮流制对决 (turn)**: randomized first player; turns rotate in join order. Only the current player's choice cards are enabled; others wait with 「轮到某人」 hint. Accept/skip rotates `turnIndex` and hands the mic to the next player.
- **🎤 自由对决 (free)**: mic is open in every choosing phase — all players see enabled cards; first tap grabs the mic (`turn.chooserId`), late taps get a 「麦被别人抢了」 toast. After accept/skip the mic is released for the next grab. Stat chip 「回合」 counts total grabs (`stats.rounds`) instead of turn position.
- Mode is chosen in the lobby by the starter and stored in room state (`S.mode`); mid-game all clients follow `S.mode`. If the mic holder leaves/times out, `resetTurnStage()` releases (free) or rotates (turn) automatically.
- 局中换玩法：主持人 ⚙️ 设置里切换，**下一张牌生效**——只重新指派 choosing 阶段的持麦人，绝不没收正在翻牌/答题者的回合；回合交接语义统一显示为「轮到 X」。
- 轮数上限：`stats.rounds` 每抽一张牌 +1（代跳/跳过不占轮数之外的额度、换题/点名不产生轮数），打满 `roundLimit` 在 `closeTurn` 收尾时自动进结算屏。

## 4. Interaction Specification

### Controls
- Mouse/Touch: All interactions are click/tap based
- 横屏开关：手机端顶部右侧 `↔️ 横屏/竖屏`（触屏 / 窄屏 / 矮横屏才显示，真·横屏下自动隐藏；选择持久化在 `localStorage['tod:land']`）
- Keyboard: Enter to confirm, Tab to switch options；全部选择控件为原生 `button`（含头像格/套装/模式卡），Tab 可达 Enter/Space 可触发；房间号输入 `inputmode=text` + `enterkeyhint=go` + 自动转大写，名字框 Enter 直接加入

### Built-in Question Packs（三套装 × 三档尺度）
- 3 套内置题库（主持人 ⚙️ 里整套替换并同步）：🎉 热闹派对 / 💑 情侣私语（题须当场或远程可执行，不依赖在场第三人）/ 🏢 办公室安全（零隐私拷问、零身体接触、不发工作相关内容到任何地方）
- 每题带尺度标签 `{x, t}`，t ∈ mild/normal/hot（🟢温和=零隐私零社死 · 🟡普通 · 🔴刺激）；抽卡时按当前尺度过滤（过滤后为空则回退全池，绝不因改尺度出「无题可抽」）
- **防重复轮抽**：`recent.truth/dare` 记录最近出题（容量=候选池 60% 钳到 1..10，用尽自动重置），同一局不会连着看到重复题

### Import Punishment
- Paste a list of punishments into the import box (one per line)
- Markdown from external AI tools is auto-classified: `## 真心话` / `## 大冒险` section
  headings decide the bucket; `#` titles, tier headings, list numbers
  (`1.` / `1、` / `①`), bullets, bold and blockquote markers are stripped
- **档位识别**：小标题（`### 轻度/温和/刺激…`）给其后题目打尺度标签；行首 🟢/🟡/🔴 三色标是单题级声明（优先于小标题）；**换大类标题时档位回默认普通**，「温和级」不会串进下一节；无标线索默认 normal
- AI 把多条挤同一行（`…？1. …`）时先按「句末标点+序号」拆行；去重按题面文本
- Import target (for plain lists without headings) is picked by the 💬/🎯 tab
- **追加 / 覆盖两种导入**：默认追加去重合并；「覆盖导入」按钮 `armedTap` 二次确认后整桶替换（已自定义过的房间不怕误触）；自定义题库导入后 pack 标记清空（显示 📝 自定义）
- No in-app generator: the client is a single static file, so a real LLM call would need a
  backend + secret. Generation happens outside and is pasted in.

## 5. Data & State

### Room State（单文档，`normState` 入口归一：所有客户端对同一文档推演出同一结果，含 hostId 缺失时回落到最早加入者）
```json
{
  "room": "XXXXX", "ver": "number(时间戳 LWW)", "seq": "number(回退保护)",
  "mode": "turn|free", "gameStarted": "boolean",
  "hostId": "player id（建房者；消失自动移交最早加入者）",
  "level": "mild|normal|hot", "scoring": "boolean", "roundLimit": "number(0=不限)",
  "timer": "number(0=不限；15/30/45 秒限时挑战，仅展示不惩罚)",
  "surprise": "boolean(🎁 惊喜卡开关，默认 true；关闭后 surpriseOf 恒为空)",
  "finished": "null | {at, by}",
  "turn": { "stage": "choosing|drawing|revealed", "seq": "number", "chooserId": "id|null",
             "choice": "truth|dare|null", "punishment": "string|null", "ts": "number", "by": "publisher id",
             "stake": "1|2（🔥 加倍挑战，只作用于本轮，收尾后复位）",
             "bets": "{pid: 'accept'|'skip'}（🎲 旁观者押注，持麦人不参与；收尾结算后清空）",
             "betLog": "null | {at, items:[{pid,name,put,won,delta}]}（押注结算播报，全员同一份）" },
  "recent": { "truth": ["题面"], "dare": ["题面"] },
  "stats": { "rounds": "n", "truth": "n", "dare": "n", "skips": "n" },
  "players": [ "<Player>", "..." ]
}
```

### Player Data
```json
{
  "id": "uuid", "name": "string",
  "avatar": "\"av:P01\"…\"av:P24\" 预设短索引 | \"dcb:{s,d,b}\" 定制配方(~54B) | dataURL(上传照片/旧版头像)",
  "joinedAt": "number", "lastSeen": "number(心跳；写方时钟。各端另维护 HbMax/HbLocal 水位，发布不回退、在线判断用本端到达时刻)", "micOn": "boolean", "micListen": "boolean(在不在听别人广播；缺字段按 true 处理，防旧状态把新玩家当黑洞)",
  "passes": "number(剩余免答牌)", "skips": "number", "draws": "number",
  "combo": "number(🔥 连续完成次数，跳过清零；不改分，只用于徽章/颁奖)",
  "truth": "number", "dare": "number", "score": "number(可负)"
}
```
战绩字段由 `applyState` 里的自身快照（`myRecord`）与 `myPlayerTemplate()` 合并保护，重连不丢。

### Punishment Data（房间题库，独立 topic）
```json
{
  "truth": [{ "x": "题面", "t": "mild|normal|hot" }],
  "dare":  [{ "x": "题面", "t": "mild|normal|hot" }],
  "pack": "party|couple|office|\"\"(自定义)",
  "ts": "number", "expiresAt": "number"
}
```
Lives on its own retained topic (`.../pool`), not inside the room state document, so importing a
big bank never inflates per-turn sync traffic. 旧版纯字符串题库按 `{x: str, t:'normal'}` 兼容读取。

### Storage / Sync
- 在线联机：公共 MQTT broker（WebSocket, wss://broker.emqx.io 等 3 台），无需注册/密钥
  - **3 台同时连、写全部 fan-out**：每台 broker 的 retained 是各自独立的一份，只连「第一台可用」会让两个用户落在不同 broker 上 → 房间号相同却互相看不见（实际出现为一方名单里有对方、另一方没有）。现在并行拨号 + 每一路都订阅，写入发向所有存活链路，任一路可达即在线；keeper 每 7s 补连挂掉的 broker（补回后自动升回 mqtt，本地兑底链路可共存），全断 3 轮才降级本地模式
  - 房间状态 = topic `tod/v1/<房间号>/state`，retained 消息即房间最新状态，新玩家订阅即拿到全场快照
  - 房间题库 = topic `tod/v1/<房间号>/pool`（独立 retained 消息，只在导入时重发，空房间退出时擦除）
  - 连麦信令 = topic `tod/v1/<房间号>/mic`（非 retained 即发即忘，带 mid 去重 + 15s 时效护栏，防本地模式回放旧信令）
  - 表情雨 = topic `tod/v1/<房间号>/react`（同样非 retained/qos0，带 mid 去重 + 5s 时效护栏 + 表情白名单；不走房间状态，不撑大每帧状态包）
  - 任何状态变更整体发布（last-write-wins + seq 回退保护 + 掉线自愈/幽灵清理：最老客户端每 15s 巡检，`lastSeen` 超 90s 按 id 剔除幽灵——修复过旧版「按引用比较导致 prune 永不生效」的死代码；40s 即灰化标记并可被代跳，见 Phase 6）
  - **心跳水位线**（修「明明上线了对方却显示掉线」）：整文档 LWW 会把本端快照里别人旧的心跳一起发回去，盖掉对方刚续的心跳；而 `lastSeen` 是写方时钟，读方直减就把跳设备的时钟偏差当成掉线。两个水位分别消除：`HbMax`（本端见过的每人最大 lastSeen，发布/回写只前进）+ `HbLocal`（本端**收到**心跳增长的时刻，在线判断只看自己时钟）；时钟回跳等极端情况由「旧水位超过 STALE_MS 允许被接管」兼容；入房那一轮清理仍用绝对时间（刚拿文档时还没有到达水位），额外给 `HB_SKEW_GRACE_MS` 3min 容忍，房间 `expiresAt` 判定同样留这个缓冲
  - **reveal 单发布者**：drawing→revealed 只由抽卡人客户端定时发布（1.8s；REDUCED 0.7s），最老客户端仅 9s 超时兜底，各处带 seq 守卫；`applyState` 对「同 ver 同 seq 但 punishment 不同」的并发揭晓做确定性仲裁（`turn.by` 字典序小者胜），全端收敛同一张牌——修复过「双写各端显示不同题」
  - 🔄 重新同步按钮真实化：比对重订阅前后的状态签名 + 链路探活，明确回报「已拉到最新 / 已是最新画面已重绘 / 还没连上服务器正在重连」，不再假报成功；拉到后还会把本端（已合并各台 broker 结果）的状态 fan-out 回去，抹平某台 broker 上的旧快照
  - 分享与复制：**协议不是 http(s) 就当本地页**（微信「下载后直接打开」是 `content://com.tencent.mm.external.fileprovider/...`，旧版只判 `file:` 会把这种私有地址当成邀请链接发出去）；首次从 http(s) 打开时把在线地址存进 `localStorage['tod:home']`，之后用下载版也能拼出别人打得开的在线链接；`navigator.clipboard` 只在安全上下文存在（file://、content://、http://局域网IP 下它是 undefined，直接 `.writeText()` 会抛 TypeError，表现为「复制点了没反应」），因此 `copyText()` = clipboard API → `execCommand('copy')` → 长按复制手动弹窗（带「只复制房间号」），`.share-url` 开 `user-select: all` 方便一键全选
- 降级：本地模式（BroadcastChannel + localStorage），同一浏览器多标签页可玩；因为公共 broker 在部分移动网络不可达，降级时大厅分享区会显式提示「只有同一浏览器多标签能互相看见」，且 keeper 仍每 7s 在后台补连，连上即自动升回在线（不用刷新）
- **刷新自动回房（按标签页身份）**：加入成功后写 sessionStorage `tod:tab` 票（id/房间/名字/头像/local 标记/时间戳，天然按标签页隔离，多开不串号）；带票刷新 → 启动过场后自动 doJoin，同房间沿用旧 id，房间里的旧记录被原地替换，不会出现「两个一样的自己」，且回合 chooserId 不丢；主动退出（doLeave）/加入失败均擦票，刷新不再自动回房；票 30 分钟过期（与房间 expiresAt 对齐），**心跳里同步续期**（长局中途刷新不会因票过期中断身份复用）
- 回合阶段机：choosing → drawing → revealed（由 turn.seq 驱动，所有客户端同步重放动画）
- WebRTC 连通率：默认只配公共 STUN（Google + Twilio），**没有 TURN 就穿不过对称 NAT**（实测 metered/peerjs/stunprotocol 几台免费中继都拿不到 relay 候选，写进去只会白拖慢收集），因此改成 `localStorage['tod:ice']` 可覆盖：自建 coturn 后把 `RTCConfiguration.iceServers` 的 JSON 数组写进去即可，不用改代码
- 连麦标签只数 `connectionState === 'connected'` 的链路（**协商完成 ≠ 听得见声音**，旧版按 `remoteSet` 计数会把“根本没通”显示成「连麦中 · 2 人」）；按钮 `title` 给出「已接通 N 路 · 协商未完 N · 已断开 N · N 路走中继」明细
- 被叫端已 `remoteSet` 后又收到 offer（对方重建）时先拆旧 peer 再重建，防卡死

## 6. Acceptance Criteria

- [x] Players can join with name + avatar
- [x] 连麦：开/关麦全房同步，WebRTC 语音互通（本地 + MQTT 信令双链路 E2E 验证），说话者头像随音量波动/发光/声波环，关麦/退房即时拆链；**验收看“真出声”而不是“有元素”**：断言远端 `<audio>` 不 paused 且 `currentTime` 在推进（test-mic / test-mic-mqtt）
- [x] **开麦=广播**：A 单方开麦、B/C 零点击即可听声，且收听方 `getUserMedia` 调用数为 0（不弹麦克风权限）、`MIC.stream === null`、链路 `dir` 为 2/1 互补、广播方 `outbound-rtp.bytesSent > 0` 且跨满 3 轮自检不误报 🔇（test-mic-broadcast.cjs 9 步 / test-mic-3way.cjs 6 步：含三人房扇出、收听关闭→广播方同步撤链、恢复收听→链路自动重建、双方开麦→dir=3 全双工、广播者关麦后降级为纯收听）
- [x] 启动/加入加载动画：3D 抽卡 overlay 分阶段文案，首屏可见且完成后移除（Playwright detached 断言）
- [x] All joined players visible in real-time
- [x] Truth/Dare selection with animated cards
- [x] Card draw animation (3D flip + spin)
- [x] Punishment reveal with typewriter + confetti
- [x] Continuous background animation (one-shot feel)
- [x] Avatar entrance/exit animations
- [x] Import punishments by paste (Markdown auto-classified into truth/dare + 档位识别 + 追加/覆盖)
- [x] Mobile-responsive
- [x] 横屏与 PC/平板压档（`.pw/test-landscape.cjs`，88 条断言）：真·横屏 844×390 / 740×360（含 3 人局）自动套横屏布局，join/lobby/game/revealed/result 五个屏的主 CTA 全在首屏内且 trial click 可点、3 人局玩家卡不越出座次环也不顶到工具栏、`#card-truth` 中心命中自身（3D 命中不回归）、工具栏内容不横向溢出、设置弹层整体落在屏内、旁观者押注面板可见；390×844 竖屏点 `#btn-land` → `landforce+landui`、`--lvw/--lvh` 互换为 844/390、旋转后 body 铺满物理视口、旋转坐标系里输入框/加入按钮命中与点击均正常 → 再点一次类与变量完整还原；不切换时竖屏旧布局与 `--lvw/--lvh` 空缺零影响；另有 PC/平板压档梯队 1440×900 / 1280×800 / 1024×768（进入 `#screen-spectator`，逐屏检查「加入房间」「选类别牌」「跳过」等主 CTA 在首屏内且可点，并断言 `docEl.scrollWidth === innerWidth`）；全程零 JS 报错
- [x] Works in multiple browser tabs simultaneously
- [x] Two game modes: 轮流制对决 (rotating turns) and 自由对决 (grab-mic free-for-all), synced across clients; 局中可换玩法（下一张牌生效）
- [x] 主持人闭环：门禁/点名/换题/代跳/轮数上限自动结算/颁奖屏/再来一局，非主持人越权调用全部被拒（test-host.cjs 断言）
- [x] 题库升级：三套装×三档尺度过滤、防重复轮抽、🃏免答牌×2 静默换题不留记录、跳过脱污名
- [x] 韧性修复：reveal 双写仲裁、prune 死代码、票续期、resync 真实回报、撞号确认、re-offer 重建、40s 灰化
- [x] 同步韧性专项（`.pw/test-sync.cjs`）：3 台 broker 同时在线且写入 fan-out 到每一台 / 对端时钟慢 3 分钟仍显示在线 / 连发整文档不回退对方心跳 / 名单双向对称 / 全断降级本地后 keeper 自动升回在线且断网期间建的房间别人仍能加入；file:// 本地页不拿私有地址当链接、无 clipboard API 时复制仍有结果（已复制或手动弹窗）且全程零 JS 报错
- [x] 体验与性能：首进自动引导一次、DiceBear 本地打包默认头像（pixel-art + shapes，vendored MIT，零外网）+ av:P## 头像短索引（整帧状态 <1KB 量级）、REDUCED 静态动画路径、LOWPERF 降档、全按钮键盘可达
- [x] 性能回归（`.pw/test-perf.cjs`）：光球无 `filter:blur` 但保留飘动、`buildBg` 只在启动时调用（纸屑固定 26 片不逐轮累积）、软件光栅 + DPR3 下大厅 16 人与牌桌均 ≥50fps（p95 ≤25ms）、牌桌内连抽 6 轮后 DOM 节点与运行中动画数不增长、爆彩粒子残留为 0、防重复清单有上限、切走冻结/切回恢复、省电三档生效且刷新后记住、人为塞回 blur 层造成持续掉帧时被实测捕获并自动降载；全程零 JS 报错
- [x] 头像定制与持久化：31 风格 DiceBear 全量 vendored（~2MB IIFE，file:// 冷启动实测 ~2.2s）；定制器三轴（风格×seed×底色）+「就用它 / 保存到我的」；`dcb:` 配方进状态（~54B，双端逐字节一致）；「我的」localStorage 持久化（去重置顶封顶 30、上传压 96px JPEG、tod:me 下次访问自动恢复）；两连点删除 + 删使用中回落 av:P01 + 触屏角标常显；`.pw/test-avatars.cjs` 8 步 E2E 全绿
- [x] Layout polish: 单列宽度统一到 540px，触控目标 ≥ 40px，:focus-visible 描边，prefers-reduced-motion 降噪，窄屏头像/统计条收紧
- [x] E2E verified via Playwright: both modes × (local + MQTT) transports, sync/guard/stats all pass；连麦专项（test-mic.cjs / test-mic-mqtt.cjs / test-mic-broadcast.cjs / test-mic-3way.cjs）全绿；主持闭环专项（test-host.cjs，15 步）全绿
- [x] 连麦“没声音”专项：自动播放被拦时的兜底出声（test-mic-autoplay.cjs：复现 paused+有波形 → gain 路有输出 rms>0.005 → 手势后元素接管且兜底已撤）、晚到 ICE 候选补发 + 标签诚实性（test-mic-trickle.cjs）全绿；`check-syntax.cjs` 作为内联脚本语法门禁
- [x] 手机端连麦默认外放（`.pw/test-mic-speaker.cjs`，触屏模拟 `isMobile + hasTouch`，`--autoplay-policy=user-gesture-required` 逼真机行为）：真触发 `(hover:none) and (pointer:coarse)` 检测且默认走媒体外放；**「消费者」元素挂着但 `paused`**（不播 → 不叠音、不被切听筒）、gain 路真实出声 rms 0.398 且 ctx 仍 `running`（证明手势预热有效）、头像波形照常、已提示戴耳机、通话中开关切换（关→元素直出接管且兜底已撤 / 开→回到媒体外放并落 `tod:speaker`）、双向时广播方也走媒体外放且广播时音乐压到 6%；桌面回归（test-mic / test-mic-autoplay / test-mic-broadcast / test-mic-3way / test-mic-trickle / test-mic-mqtt）原样全绿，`probe-micspeaker2.cjs` 留「没有消费者元素就没声音」的对照取证
- [x] 3D 舞台与一镜到底（`.pw/test-3d.cjs`，31 条断言全绿）：`#app` 透视 1400px、`.world` 必须 `transform-style: flat`（防 3D 命中测试吃掉点击，`elementFromPoint` 锁）、每个 `.screen` 常态 `transform: none`；join→lobby→game 换屏时 `Cam.enter` 从当前机位续接且 1.5s 内收敛到常态机位（game `rx≈5`）；`.table3d` + `#cam` 透视存在；3D 座次前排更大更靠下且 zIndex 分层、每张卡中心都能命中自己；抽卡期间 `Cam.cur.z` 脱离常态实现推近；REDUCED 下 `Cam.to` 同 tick 瞬时到位且 world 计算值 `none`；全程零报错
- [x] 换屏一镜到底取证（`.pw/probe-scene.cjs`）：逐帧采样换屏期间的世界层机位——无瞬移（前 8 帧 z 单调推进）、新屏有 3D 入场且旧屏在飞掠、动画结束进屋态后每屏 `transform` 回到 `none` 且选卡仍可命中；加入页→大厅的入场确实在加载层收起那一刻才播；game→lobby 回退带 `tx-back`；`shots/scene-fwd-*.png` / `scene-back-*.png` 留帧
- [x] 退房/再加入的时序取证（`.pw/probe-leave.cjs`，MutationObserver 记 class 时间轴 + rAF 量帧间隔）：点退出到加入页 `.active` 实测 ~12ms（不再等 `publishState`）、加载层 hide → 大厅入场间隔 ~16ms（加入与「退出后再加入」两条路径都是）
- [x] 趣味互动（`.pw/test-fun.cjs`）：表情雨本机+对端互达、浮窗点开才展开（6 颗 emoji，按钮文本 = 实际广播的表情）、320ms 防刷屏、白名单拒绝非法表情、粒子自动清理；音效开关持久化且 `SFX.play` 不抛错；加倍挑战仅持麦人可见、对端同步 stake=2、完成 +20、收尾复位（未加倍仍 +10）；连击 ×2 徽章同步且不改分（20+10=30）、跳过清零 30−5=25；限时 15 秒倒计时在走、到点显示超时且不自动跳过；命运转盘停在新玩家且光点动画可观测；**押注**：面板只给旁观者、押注同步/可取消、押中 +5 押错 −3 且只动押注者分、结算播报全场可见、押注清空、计分关时不出面板；**惊喜卡**：同题同 seq 推导确定、触发率落在 1/5 区间（400 次命中 40-130）、金卡上色两端一致、主持关闭后 200 次全部为空
- [x] 背景音乐、点击反馈与连麦压低（`.pw/test-audio.cjs`）：BGM 默认开、首次手势后自动出声（音频上下文 running 且增益缓入到默认 90%）、音量滑杆改到 30% 即时生效并持久化、关闭后停播且持久化、指南入口标签同步；**ducking（双总线）**：空闲两总线均 0.2 / 广播音乐压到 0.028 而**音效总线保持 0.2** / 仅收听（有链路）音乐压到 0.1 而音效仍 0.2 / 无链路不无端压低 / 关掉开关后广播也满音量 / 设置持久化与复原；新增 tap/draw/spark 音效不抛错；选卡/卡堆/翻牌按下回弹 + 涟漪生成并在 0.9s 内自动清理、翻牌扫光元素生成；全程零 JS 报错。连麦回归：`.pw/test-mic.cjs`、`.pw/test-mic-broadcast.cjs` 全绿
- [x] 互动浮窗不挡操作（`.pw/test-landscape.cjs`）：844×390 / 390×844 / 1280×800 / 1024×768 下浮标与展开的 6 颗 emoji 均落在屏内且与所有 `button/input/.player-card/.choice-card` 零重叠、浮标可真实点击（Playwright 点击，非 DOM 兜底）；Esc 可收起；旧版「底栏常驻」在 390×844 会压住选卡/工具栏、横屏左中会压住玩法切换的问题已消除
- [x] PC / 平板兼容（`.pw/test-landscape.cjs` 的 1280×800 与 1024×768 分段）：大厅/牌桌/揭晓页文档宽 = 视口宽（3D 牌桌透视投影不再撑宽，移动仿真下 fixed 浮窗不再被推出屏）；矮屏桌面/平板的选卡与「完成/跳过」落在首屏内；互动浮窗不压控件；`.pw/probe-overflow.cjs` 留证
- [x] PC / 平板版式（`.pw/probe-pcwidths.cjs`、`.pw/probe-pcfit.cjs`）：1920×1000 / 1440×900 / 1280×800 / 1024×768 / 900×900 / 820×1180 六档下 join/lobby 内容列水平居中（偏移 0~8px，8px 是经典滚动条的一半）、文档宽恒等于视口宽、浮标在屏内；加入按钮在 720~1080 各高度全部落在首屏内（旧版 ≤900 高全部需要滚动）；`.pw/probe-tabletshift.cjs` 留了「居中不改变纵向位置」的 A/B 取证
