# 真心话大冒险 - 在线多人游戏

## 1. Project Overview

**Type**: Interactive multiplayer party game
**Summary**: A real-time "Truth or Dare" game where players join with custom avatars, select truth or dare, and draw punishment cards with cinematic animations.
**Target**: Party settings, friends gathering, online multiplayer

## 2. Visual & Rendering Specification

### Scene Setup
- **View**: 2D card-game style interface
- **Background**: Animated gradient with floating particle confetti, continuous slow-motion drift (one-shot camera feel)
- **Camera**: Fixed, no user control — cinematic pan/tilt via CSS transforms
- **Lighting**: Soft glow on active elements, neon accents on cards

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
- **启动加载动画**：3D 抽卡预加载 overlay（透视翻牌 + 三颗环绕光点 + 扫光进度条 + 分阶段文案），doJoin 全程复用同一层展示「创建房间 → 连接服务器 → 同步状态 → 载入题库 → 落座」；退场时淡出 + 放大 + 模糊（.hide 过渡后 remove）
- **Background**: Continuous slow drift of gradient orbs + confetti particles, 60s loop
- **Avatar entrance**: Slide-in from bottom with stagger, bounce easing
- **连麦头像波动**：说话者的头像环绿光光晕随音量 RMS 实时变强（--voice CSS 变量驱动 box-shadow），头像本体随音量缩放，双层声波圆环外扩淡出，名字变绿；音量不经过网络，每端用 AnalyserNode 就地分析自己收到的音轨
- **轮到自己抽卡**：真心话/大冒险双卡呼吸发光（brightness 脉动，不动几何位置，不影响点击稳定性）+ 卡面扫光循环
- **Card selection**: Card flies to center with scale-up
- **Card draw**: Card flips with 3D CSS transform, then reveals punishment；洗牌为真实交叉效果：`.deck.shuffling` 期间顶层两张牌按 `shuffle-left/right/mid`（0.55s）交替向左右交叉、中层微位移，容器整体 brightness 脉动；牌堆常驻扫光为窄光带（`left:-60%; width:60%` 平移 0→300%），`overflow:hidden` 裁切在卡面边界内，与 choice-card 扫光共用同一几何与关键帧
- **无障碍与低端机**：`prefers-reduced-motion` 命中时走 REDUCED 静态路径（跳过运镜/飞牌/洗牌/打字机，翻面 700ms 后直接呈现全文，翻牌动画锁仍生效）；`deviceMemory ≤ 3` 或 `hardwareConcurrency ≤ 4` 判定 LOWPERF → `body.loperf` 收紧动效 + 粒子/彩带减半；选择类控件全部 `button` 元素（键盘可聚焦、Enter/Space 可触发）
- **抽卡一镜到底时序**（多端以 `turn.ts` 为统一时钟）：头像飞入卡堆(0-1.1s) → 洗牌(0-1.4s) → 飞牌落向中央(1.5-2.2s，落点在目标布局下预先测量，修复旧版 hidden 零 rect 飞向左上角的 bug) → 牌背“抽取中”呼吸到 2.6s（`ANIM_DRAWING_MIN_MS`）→ 蓄势微抬 240ms → 翻面 850ms → 打字机揭晓 → 彩带
- **防闪答案动画锁**：`applyState` 在 `renderScreen` 绘帧前上锁（`revealAnim`/`cardDealt`），`renderGameStatic` 的 drawing/revealed 分支在动画窗口内直接 return；`playReveal` 用 `transition:none` 瞬时归位牌背再翻，保证“答案不会先闪现再翻回去”；`clearStageTimers` 同时清打字机 timer，防止旧回合对隐藏元素补放彩带
- **Punishment reveal**: Typewriter text effect with blinking caret, confetti burst
- **Turn transition**: All avatars subtly pulse, winner glows
- **Camera pan**: Subtle CSS `translate` drift following active player；抽卡链路 deck→card 两次 `focusCam` 缓推（0.9s transform 过渡），不再叠加 `scrollIntoView` 双通道抖动

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
- 连麦中（micOn）的玩家头像左下角显示 🎤 徐章；正在说话时叠加绿色声波环
- Avatars arranged in a semi-circle / grid layout

### Phase 2.5: 连麦（语音通话）
- 大厅和游戏页均有 🎙️ 连麦开关（btn-secondary 胶囊，开启后变绿色 live 态 + 三色音量条）；开关麦状态以 `player.micOn` 写入房间状态，全房可见
- 语音 = WebRTC 网状网（每人 ↔ 其他开麦者）；信令走房间新 topic `tod/v1/<房间>/mic`（非 retained，点对点定向），MQTT/本地两种传输都复用同一条 RoomLink
- 防冲水：两端按 clientId 字典序决定发起方（小者发 offer）；非 trickle，等 ICE 收集完发整份 SDP（本地模式 localStorage 单槽位不丢候选）；9s 不成链发起端重建一次；关麦发 bye 拆链
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
- **🃏 免答牌（每人每局 2 张）**：抽到不满意可打出——静默换一题，**不算跳过、不留任何记录**，牌数用尽即止；只有持牌回合本人可见
- **🎲 换一题（主持人）**：局中任何时候给当前这张牌换题，同样不动任何人的账本（掉线救急/口味不对都能用）

### Phase 6: Turn Pass
- Next player's turn (mode-dependent, see Game Modes)
- Smooth transition: active glow moves to next avatar
- Background subtly shifts perspective
- **掉线保活**：`lastSeen` 超 40s 的玩家头像灰化 + 「离线」角标；若卡住的回合属于掉线者，主持人/最老客户端看到 ⏭「替 TA 跳过本轮」代跳条（抽卡动画窗口内不出现），代跳按该玩家跳过记账（−5）并解锁回合

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
  "finished": "null | {at, by}",
  "turn": { "stage": "choosing|drawing|revealed", "seq": "number", "chooserId": "id|null",
             "choice": "truth|dare|null", "punishment": "string|null", "ts": "number", "by": "publisher id" },
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
  "joinedAt": "number", "lastSeen": "number(心跳；写方时钟。各端另维护 HbMax/HbLocal 水位，发布不回退、在线判断用本端到达时刻)", "micOn": "boolean",
  "passes": "number(剩余免答牌)", "skips": "number", "draws": "number",
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
  - 任何状态变更整体发布（last-write-wins + seq 回退保护 + 掉线自愈/幽灵清理：最老客户端每 15s 巡检，`lastSeen` 超 90s 按 id 剔除幽灵——修复过旧版「按引用比较导致 prune 永不生效」的死代码；40s 即灰化标记并可被代跳，见 Phase 6）
  - **心跳水位线**（修「明明上线了对方却显示掉线」）：整文档 LWW 会把本端快照里别人旧的心跳一起发回去，盖掉对方刚续的心跳；而 `lastSeen` 是写方时钟，读方直减就把跳设备的时钟偏差当成掉线。两个水位分别消除：`HbMax`（本端见过的每人最大 lastSeen，发布/回写只前进）+ `HbLocal`（本端**收到**心跳增长的时刻，在线判断只看自己时钟）；时钟回跳等极端情况由「旧水位超过 STALE_MS 允许被接管」兼容；入房那一轮清理仍用绝对时间（刚拿文档时还没有到达水位），额外给 `HB_SKEW_GRACE_MS` 3min 容忍，房间 `expiresAt` 判定同样留这个缓冲
  - **reveal 单发布者**：drawing→revealed 只由抽卡人客户端定时发布（1.8s；REDUCED 0.7s），最老客户端仅 9s 超时兜底，各处带 seq 守卫；`applyState` 对「同 ver 同 seq 但 punishment 不同」的并发揭晓做确定性仲裁（`turn.by` 字典序小者胜），全端收敛同一张牌——修复过「双写各端显示不同题」
  - 🔄 重新同步按钮真实化：比对重订阅前后的状态签名 + 链路探活，明确回报「已拉到最新 / 已是最新画面已重绘 / 还没连上服务器正在重连」，不再假报成功；拉到后还会把本端（已合并各台 broker 结果）的状态 fan-out 回去，抹平某台 broker 上的旧快照
  - 分享与复制：**协议不是 http(s) 就当本地页**（微信「下载后直接打开」是 `content://com.tencent.mm.external.fileprovider/...`，旧版只判 `file:` 会把这种私有地址当成邀请链接发出去）；首次从 http(s) 打开时把在线地址存进 `localStorage['tod:home']`，之后用下载版也能拼出别人打得开的在线链接；`navigator.clipboard` 只在安全上下文存在（file://、content://、http://局域网IP 下它是 undefined，直接 `.writeText()` 会抛 TypeError，表现为「复制点了没反应」），因此 `copyText()` = clipboard API → `execCommand('copy')` → 长按复制手动弹窗（带「只复制房间号」），`.share-url` 开 `user-select: all` 方便一键全选
- 降级：本地模式（BroadcastChannel + localStorage），同一浏览器多标签页可玩；因为公共 broker 在部分移动网络不可达，降级时大厅分享区会显式提示「只有同一浏览器多标签能互相看见」，且 keeper 仍每 7s 在后台补连，连上即自动升回在线（不用刷新）
- **刷新自动回房（按标签页身份）**：加入成功后写 sessionStorage `tod:tab` 票（id/房间/名字/头像/local 标记/时间戳，天然按标签页隔离，多开不串号）；带票刷新 → 启动过场后自动 doJoin，同房间沿用旧 id，房间里的旧记录被原地替换，不会出现「两个一样的自己」，且回合 chooserId 不丢；主动退出（doLeave）/加入失败均擦票，刷新不再自动回房；票 30 分钟过期（与房间 expiresAt 对齐），**心跳里同步续期**（长局中途刷新不会因票过期中断身份复用）
- 回合阶段机：choosing → drawing → revealed（由 turn.seq 驱动，所有客户端同步重放动画）
- WebRTC 连通率：STUN 双源（Google + Twilio）；被叫端已 `remoteSet` 后又收到 offer（对方重建）时先拆旧 peer 再重建，防卡死；连麦徽标按「已完成协商的在连 peer 数」计数（接通中≠已接通）

## 6. Acceptance Criteria

- [x] Players can join with name + avatar
- [x] 连麦：开/关麦全房同步，WebRTC 语音互通（本地 + MQTT 信令双链路 E2E 验证），说话者头像随音量波动/发光/声波环，关麦/退房即时拆链
- [x] 启动/加入加载动画：3D 抽卡 overlay 分阶段文案，首屏可见且完成后移除（Playwright detached 断言）
- [x] All joined players visible in real-time
- [x] Truth/Dare selection with animated cards
- [x] Card draw animation (3D flip + spin)
- [x] Punishment reveal with typewriter + confetti
- [x] Continuous background animation (one-shot feel)
- [x] Avatar entrance/exit animations
- [x] Import punishments by paste (Markdown auto-classified into truth/dare + 档位识别 + 追加/覆盖)
- [x] Mobile-responsive
- [x] Works in multiple browser tabs simultaneously
- [x] Two game modes: 轮流制对决 (rotating turns) and 自由对决 (grab-mic free-for-all), synced across clients; 局中可换玩法（下一张牌生效）
- [x] 主持人闭环：门禁/点名/换题/代跳/轮数上限自动结算/颁奖屏/再来一局，非主持人越权调用全部被拒（test-host.cjs 断言）
- [x] 题库升级：三套装×三档尺度过滤、防重复轮抽、🃏免答牌×2 静默换题不留记录、跳过脱污名
- [x] 韧性修复：reveal 双写仲裁、prune 死代码、票续期、resync 真实回报、撞号确认、re-offer 重建、40s 灰化
- [x] 同步韧性专项（`.pw/test-sync.cjs`）：3 台 broker 同时在线且写入 fan-out 到每一台 / 对端时钟慢 3 分钟仍显示在线 / 连发整文档不回退对方心跳 / 名单双向对称 / 全断降级本地后 keeper 自动升回在线且断网期间建的房间别人仍能加入；file:// 本地页不拿私有地址当链接、无 clipboard API 时复制仍有结果（已复制或手动弹窗）且全程零 JS 报错
- [x] 体验与性能：首进自动引导一次、DiceBear 本地打包默认头像（pixel-art + shapes，vendored MIT，零外网）+ av:P## 头像短索引（整帧状态 <1KB 量级）、REDUCED 静态动画路径、LOWPERF 降档、全按钮键盘可达
- [x] 头像定制与持久化：31 风格 DiceBear 全量 vendored（~2MB IIFE，file:// 冷启动实测 ~2.2s）；定制器三轴（风格×seed×底色）+「就用它 / 保存到我的」；`dcb:` 配方进状态（~54B，双端逐字节一致）；「我的」localStorage 持久化（去重置顶封顶 30、上传压 96px JPEG、tod:me 下次访问自动恢复）；两连点删除 + 删使用中回落 av:P01 + 触屏角标常显；`.pw/test-avatars.cjs` 8 步 E2E 全绿
- [x] Layout polish: 单列宽度统一到 540px，触控目标 ≥ 40px，:focus-visible 描边，prefers-reduced-motion 降噪，窄屏头像/统计条收紧
- [x] E2E verified via Playwright: both modes × (local + MQTT) transports, sync/guard/stats all pass；连麦专项（test-mic.cjs / test-mic-mqtt.cjs）全绿；主持闭环专项（test-host.cjs，15 步）全绿
