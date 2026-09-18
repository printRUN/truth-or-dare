# 设计方案 v3（定稿）：游戏中心（index 大厅）+ 3D 大富翁

> 2026-09-19 · 分支 feat/arcade-monopoly · 三位挑刺专家（工程红线/视觉/玩家价值）均 REVISE，修订全部采纳，本版为实施定稿。
> v3 追加：玩家价值专家 P0×3（经济参数包+回合上限终局 / 热座交接闸 / 自动存档恢复）+ P1（破产清算规格、音效、免罚卡可见、剪贴板回流守卫、矮横屏断言、再来一局保配置、机器人参数、派对元素三件套）。

## 0. 需求（用户原话）

「创建新分支进行，通过该项目的3d的方式，帮我增加一款大富翁，可以让index文件当大厅来当游戏中心，选择各个游戏」

## 1. 总体架构决策

**index.html 只加「游戏中心」屏（arcade），大富翁做成独立自包含 monopoly.html。**

- index.html 已 3.3MB / 8016 行，全部门禁压身；新游戏域独立成文件，index 改动面控制在 §2.5 清单内。
- monopoly.html 内联复制 index.html 同一份 three.js r128 UMD（**连 SPDX 头一起**，check-syntax 加 sha256 一致性比对）；保持两边「单文件零外网双击即开」。
- 大富翁 → `location.href='monopoly.html'`；返回 → `location.href='index.html'`（**禁 `'./'`**：file:// 下是目录列表）。

## 2. 游戏中心屏（index.html）

### 2.1 状态驱动接入

- 新增 `window.__ARCADE__`；`currentScreen()` 改一行：`if (!joined) return window.__ARCADE__ ? 'arcade' : 'join';`
- 点「真心话大冒险」卡 = `__ARCADE__=false; renderScreen();` → 复用既有扫视机制（含加载期 pendingSceneEnter 攒屏链，无新增代码）。

### 2.2 early 判定脚本（插在 `.world3d` 闭合后、主脚本前）

默认 true；命中任一 skip 则 false；`?game=arcade` 强制 true 跳过所有 skip：
1. `URLSearchParams.get('game') === 'tod'` 或 hash `#tod`；
2. 有 `?room=` 参数；
3. `sessionStorage['tod:tab']` 票有效——**逐字复刻主脚本谓词**：`t.id && t.room && Date.now()-(t.ts||0) < 30*60*1000`；
4. `sessionStorage['tod:picked']==='1'`（本会话已选过 tod）。

整体 `try{}catch{}`，catch 强制 `__ARCADE__=false`。先赋 `__ARCADE__`，再 DOM：`.active` 摘挂、`body` 加 `on-arcade`（隐藏 net-chip，防红点「未连接」读成故障）+ `arcade-nav`（会话级常驻）、调 `applyTitle('arcade')`。
- `applyTitle(name)` 唯一实现（arcade→「🎮 游戏中心」+`document.title='游戏中心 · 真心话大冒险'`；否则→「🎭 真心话大冒险」+默认 title）；early 与 renderScreen 都调它。
- **剪贴板回流守卫（玩家专家 P1-7）**：主脚本两处 `pasteRoom(true)`（boot 1500ms + visibilitychange 切回）加 `if (window.__ARCADE__ && currentScreen()==='arcade') return;`；tod 卡点击处理补 `setTimeout(() => pasteRoom(true), 0)`。boot 命中邀请时 arcade 顶部出可点 banner「📋 检测到房间邀请 XXXX · 点击加入」直达 join 并回填。
- `bootSteps` 按 `__ARCADE__` 给「✨ 点亮游戏中心...」档。

### 2.3 场景系统适配

| 位置 | 改动 |
|---|---|
| `SCENE_ORDER` | `{ arcade:0, join:1, lobby:2, game:3, result:4 }`；`sceneTurn` **两个数字同改** `((next-prev+5)%5)`，阈值 `d>2?-1:1` 不动 |
| 注释重写 | 「五屏环；result→join 距离 2 按前进；**game→join、result→lobby 因插入点变距离 3 → 回扫**（方向翻转已接受，probe-leave/sim-* 回归锁定）」 |
| `Cam.base` | `arcade: { x:0,y:0,z:-52,rx:5,ry:0,rz:0,s:1 }`（比 join 的 z-40 净远 ~3.7%，给卡片呼吸） |
| `Cam.spawn` | `arcade: { z:190, rx:-4, s:1.04 }` |
| `Cam.init()` | **四处**：`const b = window.__ARCADE__ ? 'arcade' : 'join';` → `curScreen=b`、`jump(spawn[b])`、`enter(b)`、`to(baseOf(b), 900, 'dolly')` |

### 2.4 UI（参数定稿）

- `.arcade-grid`：`grid; gap:14px; 1fr; max-width:540px`；`≥900px` 三列 `repeat(3,1fr); max-width:920px; gap:18px`。标题下副标「挑一个游戏开始 · 联机派对 / 本地同屏」（0.8rem, rgba .6）。
- 卡片 `<div class="arcade-card" role="button" tabindex="0">`（**禁 `<button>`**：tapFx 的 closest('button:…') 守卫会吞按压动画）；pointerdown 直调 `tapFx(el, ev, 'tap')`；keydown Enter/Space 手动 click。
- 结构：图标 56×56 r16 渐变（tod `#8b5cf6→#f472b6` / 大富翁 `#22d3ee→#8b5cf6` / UNO 灰玻璃）+ 0.35 光晕 24px；标题 1.1rem；描述 0.78rem rgba.62；badge 胶囊 0.72rem；箭头 18px hover translateX(3px)；min-height 112/168px，padding 18px。
- hover：`translateY(-3px)` 双影 `.3s cubic-bezier(.34,1.56,.64,1)`；按压大面收敛 32% 帧 `translateY(2px) scale(0.965)`；`@media(hover:none)` 去 hover、active scale(.97)。
- **退路三挂点**：L490 REDUCED 块、L1180 `body.loperf` backdrop 清单、L428 `:focus-visible` outline 组。
- UNO 卡：`aria-disabled`、不进 Tab 序、虚线边、图标 grayscale(.45) opacity(.75)、标题 #fff、无箭头无 hover 不挂 tapFx、`title="🚧 UNO 正在建造中，敬请期待"`；禁整卡 opacity<0.6。
- join 屏「← 游戏中心」：ghost 药丸（.av-tab 家族），join-box 下 14px；仅 `body.arcade-nav` 显示。
- **矮横屏（玩家专家 P1-8）**：`body.landui`/矮横屏档 #screen-arcade 三卡改**横排**、卡高 ~120px、h1 降档；test-landscape 新增 arcade 落地档断言（三卡 boundingRect 全部 ≤ 视口高）。

### 2.5 index.html 改动清单

① `#screen-arcade` HTML；② early 脚本；③ `currentScreen()` 一行；④ `SCENE_ORDER`/`sceneTurn`/注释；⑤ `Cam.base`/`spawn`/`init`；⑥ renderScreen 调 `applyTitle(name)`（h1 加 id）；⑦ join 返回链接 + CSS 三挂点；⑧ pasteRoom×2 守卫 + 卡点击补触发 + bootSteps；⑨ CSS 段。**不碰** doJoin/MQTT/房间状态/3D 牌桌/卡片链。

## 3. 大富翁 monopoly.html

### 3.1 构成

单文件：`<style>` + loader HTML（**在 three.js script 标签之前**）+ three.js r128 内联（含 SPDX 头）+ 游戏脚本 + HUD DOM。palette 从 index :root 移植。

### 3.2 3D 场景

- ACES + sRGB + FogExp2(0.035) + dpr 封顶 `min(dpr,1.6,√(2.3e6/(w·h)))`；灯 = Hemisphere + 暖点光 + 冷补光 + DirectionalLight castShadow。
- 毡面 `#1d1523`；24 格环形（角：起点🏁/监狱🚔/免费停车☕/入狱🚨；每边 4 地产+1 特殊：机会❓/命运🎁/所得税💸/机会❓）；格面纹理 **256×128 POT、sRGB、LinearFilter**，格名 44px/价格 34px（>4 字截断），格底 `#171226→#0f0c1a` 渐变 + 白字（对比 ≥4.5:1）；**375px 竖屏棋盘投影 ≥320px**。
- 色组：`#f59e0b`/`#ef4444`/`#22c55e`/`#3b82f6`（避开 HUD 紫粉青金）；组色条 6px 格顶细条 + **白点计数（第 n 组 n 点）**色盲冗余。
- pawn：锥顶彩色；名牌 Sprite 径向外偏 +0.55、交替抬高 ±0.18、>4 字截断、投影 <22px 隐藏、内画同色圆点；不做 DOM 投影名牌。
- 骰子：pip ≥ 面宽 14%；翻滚 800ms + 回弹 120ms、四元数预解落定目标面；双数骰面 emissive 白闪降级为 toast+DOM 大字读数（§5.1 终审记录：pip 材质数组无 emissive 通道，白闪不实现）。

### 3.3 相机与运镜（全墙钟 smoothstep）

- 默认：lookAt 桌心、仰角 42°、方位角 -90°、距离 7.2、fov 42；idle 环绕 +4°/s（仅 AWAIT_ROLL 且 3s 无操作；输入即停，token 作废照抄 Cam）。
- 回合聚焦：仰角 55°、方位角=pawn、距离 4.8，900ms；回默认 700ms。
- 机会/命运揭晓 =「**镜头去卡，卡不动**」：卡躺角落桌心 → 0.9s 推近 → 远边枢轴 -180° 翻面 650ms → 持读 1400ms → 420ms 淡出；卡面 512×1024 POT、题字 ≥52px。
- 掷骰 DOM 大字读数「3 + 4 = 7」0.9s。

### 3.4 规则 v1（玩家专家 P0-1 参数包，自洽收敛）

- 2-4 人本地热座 + 🤖；**起始 ¥10000**；**过起点 +¥1000**。
- 16 地产（4 组×4）价 ¥1000-4000；**租金 = 价×40%**（400/800/1200/1600）；**集齐同色组 ×3**（1200/2400/3600/4800）。
- 所得税 ¥1000；机会/命运各 8 张：金额±、移到起点、入狱、免罚卡（狱中可用）、向每位玩家收/付 ¥500（4 人局 ±1500，卡面揭晓时**总额数字放大**）。
- 监狱：三选一——🎲 赌双数出狱（并行走，最多 3 回合，第 3 回合败则强制付 ¥500）/ 💸 付 ¥500 立即出狱 / 🃏 使用免罚卡（有卡才显示）。
- **终局双条件**：① 最后存活着胜；② **回合上限**——setup 三档 **15 轮（约 10 分钟）/ 20 轮（约 15 分钟，默认）/ 不限（纯破产制）**，打满按「现金 + 地产购入价」结算排名；HUD 轮次 chip「第 12/20 轮」；setup 随档显示预计时长。
- **破产清算（P1-4 规格定死）**：现金 < 本回合应付额（租金/税/卡）即破产；**全部现金付给债主**（租金归地主、税与卡归银行），地产全部归还无主，棋子立即移除；「向每位玩家收」导致多人破产时现金全给收款人后出局，其余照常收满，不做链式追偿。
- **不做**：房屋/抵押/拍卖/联机。

### 3.5 回合状态机（含交接闸 P0-2）

`SETUP → HANDOFF（交接屏：📱 请把手机交给 XX + 单按钮「我是 XX，开始回合」≥56px）→ TURN_START → AWAIT_ROLL → ROLLING → HOPPING(260ms/格弧线) → RESOLVE（买地弹窗只在本人回合出现）→ (双数→AWAIT_ROLL 同人，三连双入狱) → 下一家（真人→HANDOFF；机器人→自动）`。
- 动作条按钮文案带名字（「🎯 小红 · 掷骰子」）；非本人回合**动作条整体隐藏**。
- setup 开关「跳过交接确认（大家都盯着屏幕）」默认**开闸**；下家是机器人不插闸。
- 每步入账后破产检查；机器人 800±300ms 抖动延迟 + toast 播报。

### 3.6 UI（HUD 全 body 级 fixed，禁进 transform 容器）

- 玩家条：≥768 单行 4 chip（44px，tabular-nums）；<768 2×2（40px）；safe-area-top；当前行动者 cyan 描边呼吸（REDUCED 静态描边）；徽章 🚔 狱中 / 💀 破产（灰化+「观战中」）/ **🃏×n 免罚卡角标**。
- 动作条：bottom safe-area；掷骰主键 52px `min(60vw,280px)` 渐变紫粉；监狱三选一各带一行说明；**音效开关 🔊**（`mono:sfx` 记忆）；❓ 规则速览按钮。
- toast：top = safe+92px、单条新替旧 2.6s；**收钱青色 / 付钱粉色**；大额变动 chip 上方 ± 数字 800ms 浮层；双数 toast「✨ 双数！再来一次」；破产全屏横幅「💀 XX 破产出局！」+ 震屏（Cam.shake 同语义）。
- **机器人台词池**各 3 条（入狱/收租/收租致破产），随机播报。
- 结算仪式：radial veil（关键帧照抄 #result-veil）+ pod-rise 错拍 + 胜者 84px 金环 crown-pulse；「🔄 同班人马再来一局」**完整保留玩家名单/名字/机器人勾选/局长档**（`mono:names` 记忆），只重置对局数据。
- 规则速览：setup 折叠面板首次自动展开（`mono:rulesSeen`）、局内 ❓ 重开；≤8 行每行 ≤18 字。
- 买地/退房确认：玻璃弹层（禁原生 confirm）；退房文案「对局已自动保存，下次进入可继续。确定离开？」

### 3.7 加载、存档与降级

- **loader**：里程碑三档（搭建棋盘/点亮灯光/就位）+ 细进度条；**最低 900ms**；揭幕 0.26s opacity+scale(1.04) 禁 blur；+300ms remove；字体 `document.fonts.load` 800ms 兜底 + 到位重绘一次。
- **自动存档（P0-3）**：每次相位迁移写 `localStorage['mono:save:v1']`（players/props/两副牌余序/seed/prngCalls/round/turnIndex/phase，~1KB）；mulberry32 确定性 + prngCalls 重放一致；加载时存档 <24h 弹「🏠 发现上一局（第 12 轮 · XX 领先）」继续/弃局。
- **REDUCED**：走位瞬移、骰子直出、相机固定、揭晓走 DOM 玻璃卡、idle 停、回合聚焦静态切换。
- **loperf-lite（中位帧间隔 >26ms 触发）**：dpr=1、关 castShadow、停 idle、hop 直线瞬移、纹理不重绘；DOM 去 blur 清单。
- **WebGL 不可用 2D 降级**：24 格列表化且组色+价格+owner 可见；掷骰按钮+点数文本；现金可见±变动；买地/监狱/破产/胜者可达；播报 ≥3 条。同一状态机，E2E 跑一遍 2D 路径。
- 全部新 CSS 动画配 REDUCED 静态退路。

### 3.8 音效（P1-5）

WebAudio 合成 ~100 行（复用 tod 思路，零资源下载）：掷骰落地咚、收钱上扬双音、付钱低音、入狱铁门、破产播报、胜利小号、按钮 tap；`mono:sfx` 开关记忆；REDUCED/loperf 照常可用（音效不是动画）。

### 3.9 机器人（P1-10）

- 买地：cash ≥ 价+2000；**例外：落地即凑齐同色第 4 块时 cash ≥ 价即买**。
- 入狱：cash ≥ 1000 立即付 ¥500；不足才赌双数。
- 节奏：800±300ms 抖动；骰子/走位动画正常速度播（围观可读）。

### 3.10 E2E 钩子

`?autotest=1`：mulberry32 种子、动画 ×0.15、自动开局 1 真人+1 机器人、`window.__mono = { state, buy(), forcePos(i,n), forceMoney(i,v), step() }`。

## 4. 测试计划

- **check-syntax.cjs 扩展**：循环 index.html + monopoly.html；three.js 内联段 sha256 一致断言。
- **.pw 补参（已完成）**：六步 sed 全量过审；probe-perf/test-sync/probe-boot 拼接点手工改 `&`；file:// 三处补参；`node --check` 全量通过；probe-join-latency 的 `/?room=` 故意保留（邀请路径测试）。
- **probe-arcade.cjs（8905）**：默认落地 arcade（active/`__ARCADE__`/h1/副标/net-chip 隐藏/三卡）；点 tod 卡 → join + h1 回 tod；`?game=tod` 直落 join；`?room=X` 直落 join；过期票落 arcade、新鲜票自动回房；点大富翁卡 → monopoly.html；monopoly setup 开局；落机位断言（z-52/rx5；`?game=tod` z-40/rx2.2）。
- **probe-monopoly.cjs（8907）**：autotest 全流程断言（开局→买地→租金→机会卡→监狱→破产→胜者）+ **20 局蒙特卡洛验收线（平均回合数 20-40、破产分布）** + 2D 降级路径开局→买地→租金。
- **test-landscape 新增**：arcade 落地档三卡 ≤ 视口高断言。
- **回归门禁**：check-syntax、probe-3p-verify、test-3d、probe-3d-smoke、test-landscape、probe-leave、sim-desktop、sim-mobile。

## 5. 风险与红线自查

preserve-3d 不碰 ✓；无新增 fixed 进 #app ✓；新 CSS 动画 REDUCED+loperf 双退路 ✓；`lastScreenName` 链由 early 原子脚本保证 ✓；E2E 六步补参已完成 ✓；并行会话：实施前重查 git status。

## 5.1 终审降级与澄清记录（2026-09-19 代码检查官终审后）

- 「boot 命中邀请时 arcade 顶部可点 banner」降级为 v2 候选：现有实现 = arcade 屏静默跳过剪贴板读取 + 点 tod 卡补触发，主路径可用。
- 「test-landscape 新增 arcade 落地档断言」改为在 probe-arcade ⑧ 以 667×375 矮视口断言三卡 ≤ 视口高（不动 test-landscape 文件，避免与并行特性冲突）。
- 澄清：「跳过交接确认」默认不勾 = **开闸**（交接闸默认生效），与 §3.5 设计一致。

## 6. 明确不做（v1）

index 内联大富翁；联机/MQTT；房屋/抵押/拍卖；UNO 实装；扔鸡蛋/表情互扔/押注/惊喜卡/BGM（v2 候选）。
