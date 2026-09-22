# 设计方案：游戏大厅 + 炸弹猫（Exploding Kittens）v1 — 2026-09-19

分支 `feat/bombcat-lobby`（基于 feat/3d-one-take @ 83d6658）。用户需求原文：
「创建新分支进行，通过该项目的3d的方式，帮我增加一款炸弹猫，可以让index文件当大厅来当游戏中心，选择各个游戏。」

## 0. 结论先行

- **文件结构**：`index.html`（现 tod 游戏）→ `git mv` 为 `tod.html`；新建 `index.html` = 纯 CSS 大厅；新建 `bombcat.html` = 炸弹猫完整对局；新建 `lib/three.min.js` + `lib/dicebear.js`（从 tod.html 内联体**复制提取**，tod.html 本体一字节不动其内联）。
- **炸弹猫玩法**：主机权威规则引擎（隐藏牌信息只存在于主机内存），私密手牌走新增 `p/<pid>` 主题；3D 牌桌借 tod 视觉 DNA（毡面圆桌/吊灯/雾/CanvasTexture 卡面/球面脸人物）但独立精简场景；无 WebGL/loperf → 纯 DOM 可玩退路。
- **规则以用户提供的中文规则为最高准据**，官方规则页（explodi.ng）佐证：56 张 = 4 爆炸猫+6 拆除+5 休想+攻击/略过/恩惠/洗混各4+预见未来 5+猫牌 5 种各 4；组合=**任意同名牌**（不限猫）；攻击叠加=「剩余回合 + 攻击数」（用户例：连出 2 张→下家 3 回合）；nope 可嵌套；被 nope 的牌进弃牌堆、效果视同不存在；拆除断回合、炸弹秘密塞回牌库任意位置。
- **范围裁剪（v1 明确不做）**：AI 机器人、游戏中断线重连后隐藏状态恢复（见 §4 主机迁移）、2 副牌 UI 提示动画、成就/积分。

## 1. 文件结构与重命名

| 文件 | 动作 | 内容 |
|---|---|---|
| `index.html` | `git mv` → `tod.html` | 内容仅追加：右上角「🎮 游戏厅」返回链接（独立 class，不碰既有布局系统） |
| `index.html` | 新建 | 游戏大厅（纯 CSS+少量 JS，无 three.js 依赖，<700 行） |
| `bombcat.html` | 新建 | 炸弹猫（引擎+传输+UI+3D，目标 ≤2600 行） |
| `lib/three.min.js` | 提取 | tod.html 内联 r128 UMD（行 6436）原样复制 |
| `lib/dicebear.js` | 提取 | tod.html 行 1950 的 `var DiceBearLocal=(...)` 原样复制 |
| `.pw/check-syntax.cjs` | 改 | 路径参数化：`process.argv[2] || 'tod.html'` |
| `.pw/*.cjs`（106 个） | sed | URL 字符串 `index.html` → `tod.html` |
| SPEC.md / wiki | 追加 | 大厅与炸弹猫章节 |

**红线**：tod.html 除「游戏厅」链接外零改动——它的 37/37 门禁基线不动。重命名后必须复跑 tod 冒烟探针确认 sed 无误伤。

## 2. 大厅 index.html（游戏中心）

- 视觉语言完全继承 tod：`#0a0a1a` 星空底 + 三颗 radial-gradient 光球（**禁 filter:blur**，SPEC 红线）+ 纸屑 + ZCOOL KuaiLe 标题渐变 + 玻璃卡。
- 结构：标题「派对游戏厅」→ 游戏卡网格（每卡：CSS 手绘迷你场景 + 名称 + 人数/时长/标签 + 进入按钮）：
  1. **真心话大冒险** → `tod.html`（紫/粉品牌色，副标：3D 牌桌 · 2-16 人 · 你敢吗？）
  2. **炸弹猫** → `bombcat.html`（火焰橙品牌色，副标：卡牌轮抽 · 2-8 人 · 活到最后！）
  3. 敬请期待占位 ×2（灰态，不可点）：你画我猜 / UNO（仅文案占位）。
- 交互：卡片 hover 3D 抬升（transform-only）、进入按钮流光、`prefers-reduced-motion` 与 `.loperf`（本地 perf 检测一行）双退路全动画停。
- 移动端：单列自适应；卡片高度 clamp；无横向滚动。
- 页脚：一行说明「游戏进度保存在本机，联机走公共 MQTT」。

## 3. bombcat.html 总体架构

单文件内四个模块（顺序执行，共用全局命名空间 `window.__cat` 调试句柄）：

```
lib/three.min.js + lib/dicebear.js  ← <script src>（file:// 离线可用）
① 规则引擎 CAT.rules   纯函数，主机内存态 G，零 DOM 依赖（可测性核心）
② 传输 CAT.link        MiniMqtt/LocalTransport/RoomLink 改造版，topic 前缀 cat/v1/
③ UI/渲染 CAT.ui       DOM 手牌/按钮/弹层 + GL 场景（可整体缺席）
④ 引导 CAT.boot        加入页/大厅页/对局页/结算页（复用 tod 的 .screen 换屏 CSS 语法糖，但独立实现）
```

### 3.1 传输层（对 tod RoomLink 的改造点）

- 复制 `MiniMqtt`（index.html:2064-2175）、`LocalTransport`（2179-2210）、`RoomLink`（2217-2382）骨架，改动最小化：
  - topic 集：`cat/v1/<room>/state`（retained 公共态）、`cat/v1/<room>/act`（**非 retained**，玩家→主机动作请求）、`cat/v1/<room>/p/<pid>`（**非 retained**，主机→单玩家私密包）、`cat/v1/<room>/react`（表情/音效广播，非 retained）。
  - `LocalTransport` 的 keys 表从 topics 数组生成（现状已支持任意 topic 列表），私密包在本地模式下落 localStorage（同机互看可接受，文档注明）。
  - 保留三 broker fan-out + keeper 补连 + retained 合并去重 + `?room=` 链接进房 + 5 位房号（与 tod 同字符集，**不同前缀天然隔离**）。
- **主机权威**：只有主机跑引擎。非主机端全部动作=发 `act` 请求 `{t, from, mid, ...}`；主机校验后发布新 `state` + 受影响玩家的私密包。`mid` 幂等去重（主机记最近 64 个）。
- **私密包** `{ver, hand:[cardId...], peek?:[cardId×3], note}` 仅含该玩家可见信息；主机在每次 state 变更后对涉事玩家定向补发；玩家重连/进房时发 `{t:'hello'}` 触发补发。
- **主机迁移**：大厅/未开局期沿用 joinedAt 最早者。**开局后主机离开 ⇒ 发布 `hostLost:true` 终态**，全员收到后回大厅页（toast「主持人离开了，本局作废」）。文档明示 v1 限制。

### 3.2 规则引擎（纯函数 + 种子 RNG）

状态 `G`：
```
{ ver, seq, stage: 'lobby'|'dealing'|'turn'|'pending'|'defuse-insert'|'favor'|'steal-pick'|'over',
  hostId, seed, decks:1|2,
  players: [{id,name,avatar,joinedAt,alive,handCount}],   // 公共态：手牌只有数量！
  turn: {pid, extra, drawn, attackQueued, pending:{pid, cards, kind, target, namePick, nopeN, nopeBy:[], deadline}, by},
  deckCount, discardCount, discardTop:[最多8张公共可见], winner, log:[...尾20条] }
```
隐藏态 `H`（仅主机内存）：`{deck:[cardId], hands:{pid:[cardId]}, stfSeen}`。

- **牌表** `CAT.CARDS`：`ek×4, defuse×6, nope×5, attack×4, skip×4, favor×4, shuffle×4, stf×5, 猫牌×5种各4`（taco/potato/melon/rainbow/beard，中文名：塔可猫/土豆猫/西瓜猫/彩虹猫/胡子猫）。
- **RNG**：mulberry32(seed)，`window.__cat.setSeed(n)` + `__cat.forceDeck([...])` 测试钩子（仅开局前生效）。
- **发牌**（用户规则）：副数 d = n≤5 ? 1 : 2（n≤8）。全部牌 ×d；取出 d×4 爆炸猫 + d×6 拆除；每人 1 拆除 + 抽 4；放回 d×(6−n) 拆除 + d×(n−1) 爆炸猫；洗混。牌库大小公式 51d−4n−1（n=4,d=1 → 35 张 3 猫）。
- **回合**：`turn.pid` 开局随机（种子 RNG）。打任意张动作/组合（每张一个 pending+nope 窗），最后必须**抽一张**结束回合（点牌堆或「抽牌」按钮）。
- **抽到爆炸猫**：有拆除 ⇒ 必须打（官方），进 `defuse-insert`：本端 UI 选插入位置 0..deckCount（0=顶），公共端只见「拆除成功」。无拆除 ⇒ 出局：手牌+爆炸猫进弃牌堆，全场爆炸演出。出局后回合自然交接到下一位活人。
- **攻击叠加**（转结模型，与用户例严格一致）：`turn.attackQueued` 累计本回合打出的攻击数；回合结束时（不抽牌）`下家.extra += attackQueued + 我方剩余 extra`，我方 extra 清零。normal 攻击→下家 2 回合；被攻击期间再攻→3；同回合连打 2 张→3。✓
- **略过**：跳过本回合不抽牌；**自己剩余 extra 不转结**（烧掉一个）。
- **nope 窗口**：pending 挂 3s 倒计时（每收一个 nope +2s，上限 9s）；窗口关闭时 nope 数为奇 ⇒ 效果取消（牌照进弃牌堆）；偶 ⇒ 正常结算。每人每窗口限 1 张 nope；nope 自己的牌允许。被 nope 的攻击 ⇒ 回合恢复正常（仍需抽牌）。nope 不能挡爆炸猫/拆除（引擎层面不进 pending）。
- **组合**（任意同名牌，非猫也可）：2 同名=指定玩家随机抽 1 张；3 同名=点名一张牌名，有则必须给；5 不同名=从弃牌堆选 1 张加入手牌（弃牌堆空则不允许打出）。组合与单卡都吃 nope 窗。
- **恩惠**：指定玩家主动选一张给（其端 UI；20s 超时自动随机给）。
- **预见未来**：看牌库顶 3 张（顺序展示），私密包 `peek` 一次性下发，不进公共态。
- **洗混**：重洗牌库（GL 洗牌演出）。
- **牌库空**：抽牌动作视为空抽，回合结束（日志「牌库空了」）。爆炸猫被拆除后重新入库，牌库实际不可能枯竭到无法继续，但空抽规则仍保留。
- **胜利**：alive==1 ⇒ `stage:'over'`，winner 落定，全员结算页。
- **公共态极小化**：state 包不含任何手牌内容与牌库顺序（估算 <3KB），`p/<pid>` 包只含本人手牌。

### 3.3 3D 场景（借 DNA，不搬系统）

- 开场门禁同 tod：THREE 存在 + WebGL 可用 + 非 loperf ⇒ `body.three3d`；否则纯 DOM 桌面（§3.4）。
- **复用视觉常量与手法**：FogExp2(0x0a0a1a,0.042)、ACES+sRGB exposure1.05、Hemisphere+吊灯点光+冷补光、事件驱动阴影（DirectionalLight castShadow、autoUpdate=false）、dpr 封顶 `min(dpr,1.6,√(2.3e6/(w·h)))`、CanvasTexture 卡面（256×358，sRGB）、buildChar 人物（凳/lean 组/躯干/胸/头/球面脸贴片 r0.215/发壳，近乎原样移植）+ avatarTexture（squircle 蒙版+color 归白不变量）。
- **场景差分**（炸弹猫身份）：
  - 毡面换**炭火红**（0x3d1212 系）+ 桌缘琥珀描边；灯色 0xffc890 更暖。
  - 相机：固定过肩机位（我恒南），指针视差 ±2°；爆炸 shake；pending 窗口轻微推近牌堆。无 tod 的 Cam 全系统（新文件自足）。
  - **名牌 = GL 名牌 Sprite**（CanvasTexture，名+牌数+生死），不搬 tod 的 DOM 投影名牌系统（landmine 密集，v1 规避）。
  - 牌堆（北）+ 弃牌堆（东）双 GL 堆；出牌=从我座位飞至弃牌堆**面朝下**落定（规则：打出的牌面朝下）；nope 卡从 nope 者座位横向甩入叠顶；洗牌=顶两张交叉互换演出（tod 同语言）；爆炸=粒子迸溅+红闪+shake；拆除=绿光剪线+炸弹卡钻入牌堆。
  - 呼吸/idle 保留；出局者灰化躺倒（rot.x 90° 沉入凳）。
- **REDUCED/loperf/无 WebGL**：场景整体缺席，DOM 桌面退路（§3.4）承担全部信息。

### 3.4 DOM UI（可玩性主体，GL 只是演出）

- 屏幕流：`#screen-join`（昵称+头像定制器+房号+本地模式开关——复用 tod 的定制器交互骨架但精简）→ `#screen-lobby`（房号/邀请链接/玩家列表/人数选择/开局）→ `#screen-game` → `#screen-result`。
- **我的手牌**：底部横排卡条（私有），卡面=CanvasTexture 同款 canvas 转 img（或直接 CSS 画）；点选卡→高亮；组合选择器（自动识别 2 同/3 同/5 异并亮出「打出组合」）；攻击/恩惠/组合需目标→**目标选择浮层**（头像 chip）；3 同点名→牌名 picker；5 异→弃牌堆查看器。
- **抽牌**：大按钮「🎴 抽牌结束回合」（同时可点 GL 牌堆——v1 以按钮为准，GL 点击增强）。
- **nope 窗口横幅**：顶部「🚫 XX 打出了【攻击】—— 休想？」+ 倒计时环 + 手里有 nope 的端亮出大按钮；嵌套 nope 实时显示 ×N。
- **拆除插牌 UI**：抽到爆炸猫且有拆除 → 全屏遮罩「牌库 N 张，炸弹放哪？」滑杆 0..N + 顶/底快捷 + 确认（倒计时 15s 超时=随机位置）。
- **预见未来 overlay**：3 张迷你卡横排（仅本人，5s 自动收起+随时关）。
- 日志栏：左侧（桌面）/可收起（窄屏），显示最近动作。
- 结算页：胜者颁奖 + 本局事件数 + 「再来一局」（host 触发 re-deal）+「回游戏厅」链接。

## 4. 已知取舍（写进 SPEC，防后人当 bug）

1. **开局后主机离开=本局作废**（隐藏态无法移交；不做加密状态广播）。
2. **本地模式私密手牌落 localStorage**（同机多标签本来共享存储；联机模式走 p/<pid> 隔离）。
3. **act 通道明文**（与 tod 全员广播同信任级；不防「恶意房员读 act 主题」，但 state/私密包已分离，普通玩家端拿不到别人手牌）。
4. 名牌走 GL Sprite，牺牲 DOM 名牌的字体渲染质量换取零投影 landmine。
5. 炸弹猫不支持 9 人（tod 桌位上限 8；2 副牌 6-8 人已覆盖官方 2 副牌场景）。
6. nope 窗口定长 3s+2s/nope，不做「等待所有人确认」的负延迟设计。

## 5. 测试计划（.pw/，端口取未占用段 8930+）

1. `probe-bombcat-rules.cjs`（8931）：纯引擎断言 ×~28——发牌公式/牌数构成/抽猫拆猫回插/攻击叠加三例（2回合/3回合/同回合2张=3）/nope 奇偶取消/嵌套 nope/组合三种/5异需弃牌堆非空/预见未来顺序/洗混/出局清手牌/胜利判定/牌库空抽/超时自动给牌。
2. `probe-bombcat-ui.cjs`（8933）：本地模式 3 page 全流程——建房→加入→开局→出牌/nope 窗/目标选择/抽猫→拆除插牌→爆炸出局→胜利结算→再来一局；全程 pageerror=0；截图存 `.pw/shots/bombcat-*.png`。
3. `probe-lobby.cjs`（8935）：大厅渲染/两张游戏卡可点/导航到 tod.html 与 bombcat.html/REDUCED 类生效。
4. `check-syntax.cjs` 三连：tod.html / index.html / bombcat.html。
5. tod 回归冒烟：sed 后复跑 `check-syntax`（tod）+ `probe-3d-smoke.cjs` 确认重命名零误伤。

## 6. 实施顺序

1. 提取 lib/（node 脚本切行 6436/1950）→ git mv → 新 index.html → sed .pw。
2. bombcat.html 引擎 + 传输（先纯逻辑+DOM 可玩）→ 规则探针全绿。
3. 3D 场景 + 演出 → UI 探针全绿。
4. 大厅 + lobby 探针。
5. tod 冒烟回归 + check-syntax 三连。
6. 双检查官终审 → 修复 → 门禁复跑。

---

## 7. 双挑刺专家评审定稿（2026-09-19，工程 SHIP WITH FIXES × 玩法 SHIP WITH FIXES，全部采纳）

### 发牌算术（P0，定稿）
- 放回拆除 = `6d − n`（d=2 时恒 ≥4）；放回爆炸猫 = `n − 1`（**用户原文「人数减 1」为最高准据，不随副数翻倍**；n≤8 ⇒ ≤7 ≤ 4d 恒可行）。
- 牌库 = `52d − 4n − 1`。**probe 断言钉这四组**：n=4/d1→35 张 3 猫；n=5/d1→31 张 4 猫；n=6/d2→**79** 张 5 猫 6 拆；n=8/d2→**71** 张 7 猫 4 拆。（两位专家样例值有算误，按过程推导 46d−4n+6d−n+n−1 重算为准。）

### 回合语义（P0，定稿）
- 攻击打出后**回合继续**（可再出牌）；`attackQueued>0` 时「🎴 抽牌」禁用，出现「结束回合」按钮；nope 取消攻击 ⇒ 清 attackQueued、恢复抽牌权。
- `pending` 窗口期间禁一切新 act（抽牌/出牌/组合）。
- 转结：回合收尾时 `下家.extra += attackQueued + 我方剩余 extra`。

### 私密性闭环（P0/P1）
- 上行私有主题 `cat/v1/<room>/p/<pid>/up`（非 retained，仅主机动态订阅）：defuse 插入位置、favor 给哪张、3 同点名 —— 敏感载荷不走公共 act。
- hello 重试闭环：玩家端 3s 重发直到收到私密包（≤10 次）；p 包带 mid 去重；主机对 hello 幂等全量应答。
- act 重试：客户端待结算 act 4s 内 seq 未进 → 同 (from,mid) 重发 ≤3 次；主机去重键 `from+':'+mid`；非主机端 state 按 seq 单调去重；主机忽略入站 state。

### 节奏与掉线（P0/P1）
- 看门狗：turn 30s 无 act → 主机代抽（有拆除自动拆+种子随机插位；无拆除爆炸出局）；连续 2 次代打标 `afk`（此后 8s 即代打，收到 act 解除）；玩家离开 → 主机标 alive:false、手牌入弃牌堆。
- nope 窗：其余存活玩家**无人持 nope** → 0.8s 快结算（泄「无人持」级弱信息，§4 注明）；有人持 → 2.5s 起、每 nope +2s、cap 9s。favor 选牌 10s 超时随机给；defuse 插牌 15s 保留，超时位置走**种子 RNG**（禁 Math.random，回放成立）。
- 掉线 hostLost：每端 watchdog（seq 20s 不动 + deadline 已过 → 判 hostLost；lobby 期 joinedAt 最早者自举接管）；over 10s 后主机发零长 retained 擦房；进房读到 hostLost/over 的 retained 态 → 全新大厅。

### 演出与信息（P1）
- 拆除三拍：红闪「XX 抽到了炸弹猫！」→ 公共 15s「拆除中…」倒计时 → 绿光解除；GL 钻入动画**固定从牌堆顶落入**（真实插入深度只存在于主机态）。
- 弃牌堆全量 cardId 进公共 state（出牌横幅本就公开牌名，5 异选择器吃全量）；discardTop8 仅 GL 堆面展示；出牌 GL=飞行面朝下、落定 300ms 后翻明。
- 偷牌/恩惠/给牌结算后对**失去方**补发新手牌（探针显式断言）；GL 偷牌悬念=背面卡从受害者飞向偷牌者 1s；日志只写「X 被 Y 抽走一张牌」。
- 回合环：移植 tod turnRing DNA，pending 变色（红=待 nope、绿=待拆牌、琥珀=待恩惠）。
- DOM 退路补**玩家状态栏**（头像 chip+名+牌数+生死+回主高亮；body.three3d 下隐藏），REDUCED 全流程探针覆盖。
- 音效至少：爆炸/nope 拍桌/抽牌/翻牌（WebAudio 合成，REDUCED 静音退路）。

### 大厅与引导（P0/P1/P2）
- **旧 ?room= 断流**：大厅解析 `?room=`，顶置横幅「检测到房间 XXXXX」→ 主按钮「继续加入真心话大冒险（原房间）」→`tod.html?room=X`；次按钮「用这个房号开炸弹猫」→`bombcat.html?room=X`。probe-lobby 断言横幅+带参跳转。
- 玩法速查表（≤14 行）进 lobby「玩法」按钮 + bombcat 加入页「怎么玩」+ 对局首回合速览条（可关）。
- 大厅文案：「卡牌对决 · 2-8 人 · 抽到炸弹猫就出局！」；两卡 hover 一句话玩法。
- 字体：两新文件复制 tod 的 preconnect + media="print" 字体 link，无其他外链。

### 工程实现细则（P1/P2）
- lib 提取范围：dicebear=行 1945-1974（注释+代码+许可块），three=行 6433-6436；头部注释 `extracted from tod.html @ <sha>`；probe-lib-extract.cjs 断言 THREE.REVISION='128'、STYLES=31、diceAvatar 输出与 tod 内联逐字节相等、bombcat.html file:// 冒烟。
- 'tod' 硬编码三处改名：`cat:room:` / `'cat-'+room` / `'cat-'+genId()`；guide key `cat:guide`。LocalTransport key 的 `split('/').pop()` 对 p/<pid> 天然去重——**不许顺手重构**。
- GL 名牌：Sprite sizeAttenuation:false + 固定屏幕像素 scale + fog:false + depthTest:false + renderOrder 6；重绘仅在 (handCount|alive|isTurn) 签名边沿。
- 超时自动行为全走种子 RNG；`__cat.setTiming({nopeMs,nopeStepMs,nopeCapMs,favorMs,defuseMs,turnMs,afkMs})` 测试钩子。
- 局中 join → 拒绝+定向 `{t:'spectate'}` 观战视图；v1 不支持局中入座（§4 补第 7 条）。
- check-syntax.cjs 路径：`path.join(__dirname, '..', process.argv[2] || 'tod.html')`。
- tod 回归门禁（sed 后必跑）：check-syntax + test-3d(37/37) + probe-3p-verify + test-sync；全局 grep 断言 tod.html 内零 "index.html" 自引用。
- 「🎮 游戏厅」返回链接规格：`position:fixed; top:10px; right:12px; z-index:41`，probe 断言不与任何 button/input 相交。

### 引擎边界探针补充（P2）
- stf 的 peek 仅在 nope 窗结算成功后下发；牌库 <3 张按现存展示；目标校验：存活/非本人/偷牌类要求手牌>0（浮层灰显过滤）。
- 出局者手牌经弃牌堆自然公开（不摊活人手牌）；手牌/peek 可经 hello 恢复，pending 中断靠超时兜底（§4.1 措辞统一）。

---

## 8. 架构修订 v2：与并行会话（feat/arcade-monopoly，大富翁）共存（2026-09-19）

工作树内发现并行会话实锤：`.pw/design-plan-arcade-monopoly.md`（用户同构需求「大富翁 + index 当大厅」，方案 v2 定稿）+ 其 .pw 六步 sed 第①②步已落地（106 个探针 → `index.html?game=tod`）。其架构定案：**index.html 内加 `#screen-arcade` 屏 + early 脚本 `?game=` 门控**。

裁决（全部采纳）：
1. **放弃 §1 的 git mv 重命名与新建 index.html**。index.html 留给 arcade 会话；本分支**零改动 index.html**。
2. 本分支交付物收敛为：`bombcat.html`（单文件自包含，three.js r128 UMD **内联**——同 monopoly 纪律，保「单文件双击即开」分发习惯；放弃共享 lib/ 方案）+ `probe-bombcat-*` 探针 + `check-syntax-bc.cjs`（独立命名，避让其计划的 check-syntax.cjs 扩展）+ SPEC/wiki 章节。
3. **游戏中心集成 = 粘贴片段**：bombcat 卡片按对方 §2.4 `.arcade-card` 规格写好（见 §9），合并 arcade 分支时一行插入。
4. `.pw` 现存 sed 改动归 arcade 会话，本分支提交时不 add；tod 回归门禁（test-3d 等）归 arcade 会话的门禁清单。
5. 头像系统弃 DiceBear（省 2MB 内联）：炸弹猫主题的**程序化猫脸生成器**（种子 canvas 猫头，8 色系），avKey `bc:{h,s}` ~24B，join 预览与 3D 脸贴片共用同一 dataURL。
6. `?room=` 兼容：bombcat.html 解析 `?room=` 直填房号（与 arcade 卡片跳转 `bombcat.html?room=X` 契约一致）。

## 9. arcade 卡片粘贴片段（合并时插入 index.html 的 .arcade-grid，tod 卡之后）

```html
<div class="arcade-card" role="button" tabindex="0" aria-label="炸弹猫：抽到炸弹猫就出局，活到最后">
  <div class="arcade-icon" style="background:linear-gradient(135deg,#f97316,#ef4444)">💣</div>
  <div class="arcade-meta"><b>炸弹猫</b><span>卡牌对决 · 2-8 人 · 抽到炸弹猫就出局！</span>
  <i class="arcade-badge">活到最后</i></div><span class="arcade-arrow">→</span>
</div>
<!-- JS：location.href='bombcat.html'（禁 './'：file:// 下是目录列表）；pointerdown 直调既有 tapFx(el,ev,'tap') -->
```
