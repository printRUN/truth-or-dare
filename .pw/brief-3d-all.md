# brief-3d-all.md — 全场 3D 感 + 一镜断点缝合（2026-10-02，feat/3d-all-one-take）

**缘起**：用户点名「将游戏的所有元素改为3d感觉，同时都要有一个一镜到底的过渡动画，给玩家有更强烈的游戏感觉，可以探索头脑风暴来进行整改和添加」。1.6e 已把大富翁货币做了一镜；本轮把同一语言推广到**大门（index）+ 三个短板（bombcat 镜头死板 / uno 选色硬切 / monopoly 1.6e 备案）**。

**盘点结论（两路 Explore 取证）**：
- index：4 张 .arcade-card 纯 DOM 玻璃卡（index.html:1181-1194），点卡 `location.href` 硬跳（:6667-6717），arcade-pop 0.42s 被导航截断播不完；Cam rig 已有 arcade 档（base z-52/rx5，:3529）。
- bombcat：镜头全程固定机位（CAM_BASE/CAM_PORT，bombcat.html:2277-2280）零流程运镜；`explode()` 在摸牌路径立即触发（:1143→:1156）；结算屏 `#screen-result` 瞬现；**没有九宫棋盘**（雷区即牌）。
- uno：出牌/摸牌/抬牌已一镜；选色仍是 DOM `#wild-modal` 弹窗（:281, openWild :1599，触发端=本端打 wild :1594）；`chooseColor` 程序化钩子 :2165 必须保活。
- monopoly：bust 流程 host 端 :2163-2172（bustBanner→owners 清空→SFX.bust）、观战端 bust op 回放 :648；ops 是**各端本地快照 diff 推导**（:582）——清算仪式无需新字段；1.6e 备案五项 grep 证实全部未做（512 贴图/钞堆/清算仪式/√SPEED/大额重拍）。

---

## W1 index.html 游戏中心：卡片 3D 化 + 点卡起飞一镜（页间假一镜）

① **卡片 3D 化（纯 CSS 层，id/handler/role 全不动）**：`.arcade-card` 静态微倾 + `transform-style:preserve-3d`——四卡 rotateY 交替 ±3.5°、rotateX 2°（读作「斜插在桌上的门票」）；hover 倾角归零 + translateY(-6px)；`.arc-ico`/h2/`.arc-arrow` 分层 translateZ（16/10/8px 视差浮起）。**landui 矮屏四卡不越视口（probe-arcade ⑩）必须复验**；`.arcade-card:focus-visible` outline 不受 transform 影响。
② **点卡起飞一镜**：点击 → 被点卡 scale 1→1.35（150ms）+ 全屏 radial wipe（新增 `#arcade-wipe` fixed 层，radial-gradient 从卡中心扩张，主题色：tod `#8b5cf6` / mono `#22d3ee` / uno `#ef4444` / bc `#b91c1c`）220ms 盖满 → **200ms 后**才 `location.href`。probe-arcade ②③⑥ 真导航契约保持（只是延迟 200ms，探针的 waitForURL 需复验容忍）。bombcat 的 HEAD 探测（≤1500ms）期间 wipe 保持盖屏；fail → wipe 0.3s 撤回 + toast「筹备中」（现状语义不变）。
③ **目的页 arrival 衔接**：index 点卡时写 `localStorage['tod:warp']={g,t:Date.now()}`；四个子页 boot 读票（<2500ms 新鲜且 g 匹配）→ `#loader .loader-box` 挂 `warp-in`（scale 1.5→1 + 主题色 glow 一闪 400ms，CSS 纯动画），**揭幕时序全部不变**；无票/过期/g 不匹配=现状零改动。tod 的 1200ms 揭幕门（probe-loader-gate）不受影响；读完即删票（防下次冷启动误播）。
④ **退路**：REDUCED（:489 transition:none 档）wipe 退化为 120ms 淡出、warp-in 不挂；loperf 同。wipe 层 pointer-events:none、z 高于一切 UI 低于 #loader。

## W2 monopoly.html：破产清算仪式 + 棋子钞堆 + 1.6e 备案清空

① **清算仪式**：bust 时，该玩家被收回的每个 ownerMark **克隆体**弧线飞向 `BANK_POS`（复用 flyNotes 动线语言：弧线+自旋+落地 pop 淡出，80ms 错峰）；散钞 noteScatter 照旧并行；host 端节拍=最后一块 mark 落地后 bustBanner 亮。归属推导：各端本地 diff `prev.owners` vs `G.owners`（:582 同款）得被收回地块列表，**零状态包新字段**；真 mark 立即隐藏（:2164 现状语义不变，克隆飞行不碰状态）。观战端从 bust op + 本地 prev 快照推导，同节奏演。
② **棋子旁现金钞堆**：cash>0 时棋子侧后 0.55（背桌心方向）常驻 1-4 层束堆（**独立静态池** 4 玩家×4 层，复用 noteTex 贴图但**不走 busy 池**——busy 契约是航班/散钞专用）；updateHUD/syncPawns 时 diff cash 增减层（滑入 200ms/滑出 150ms，纯视觉层不回写）；破产清空；观战端从快照同步；REDUCED/bodyLo 静态摆放无动画；位置与 flyNotes 落点（棋子头顶+0.5）错开。
③ **备案三项**：`noteTex` 256→512×256、面额字号加大（近景读清，缓存仍按面额）；noteScatter 重力参数 ×√SPEED；收租/进账 amount≥1500 叠低音 thump（SFX 现场合成）+ 复用 body.shaking 轻震（body 类非 rig 写入，镜头所有权不动）。

## W3 uno.html：GL 选色一镜

① **本端打 wild**：不再弹 `#wild-modal`——wild 牌照常 flyGroupToPile 落堆（380ms），落定后四颗色球从弃牌堆上空绽放（Sphere r0.22 自发光：红`#ef4444`/黄`#eab308`/绿`#22c55e`/蓝`#3b82f6`；scale 0→1 错峰 60ms + 呼吸）；镜头 glanceAside 顺路轻推到弃牌堆（本方回合，合规）；点色球 → 球缩入堆顶 + 堆顶 emissive 染色 + colorRings 对应环脉冲 + 桌面涟漪 + wildOpen→wildPick 音。raycast 按 tod choice-card 模式（document 级/命中表/landPick/iCanPick 等价门禁）。
② **退路**：REDUCED/loperf/GL-off/非本端（观战/联机对手）= `#wild-modal` 现状弹窗；`chooseColor` 程序化钩子（:2165）保活——GL 模式路由到 GL pick、DOM 模式照旧；bot 自动选色路径不动。
③ 手牌隐私红线（probe-uno-net B2）零触碰。

## W4 bombcat.html：镜头随流程 v1 + 悬念推镜 + 结算一镜

① **爆炸悬念拍**：摸到爆炸牌 → 既有 flyCard 到手后，卡抬到桌心上空自旋 + 相机 CAM_BASE→push 位推近 700ms + 引信音 1.2s → 既有 boom 演出（GL burst+shake+白闪）。**引擎时序不变**：explode() 的状态写入照旧立即完成并发布；悬念拍只是本端表现层延迟（actor 端 boom 视觉延 1.2s；其他端到达即演——共享悬念需加 stage，本轮不做，备案）。probe-bombcat-ui 爆炸断言若等固定时长须改成等终态。
② **结算一镜**：showResult 前：败者手牌飞回牌堆（复用 flyCard）→ 胜者扇形整体抬起展示 + 相机缓推向胜者座位 800ms → `#screen-result` 过渡进场（0.4s veil）。REDUCED 直切。
③ 回合轻推本轮不做（多端节奏风险，备案）。

---

## 红线（全部沿用，违反=返工）
- monopoly：零 rig 写入/零状态包新字段/抖动 Math.random 不消耗 rngBox/钞票 busy 三路径闭合（速度变量一律 let）。
- uno：GL-off 退路全保留；手牌隐私 B2。
- bombcat：**build 管线已死，bombcat.html 是事实源，禁跑 build-bombcat.cjs**；GL 门控 sceneReady()；retireScene 清理。
- index：真导航契约（probe-arcade ②③⑥）/返回不劫持/tod:tab 不读不跳。
- 全部：REDUCED/bodyLo/TURBO/GL-off 四退路一个不能少；check-syntax 五文件+three sha 锁；**并发 ≤2 agent**。

## 头脑风暴候选池（本轮不做，备案下一轮）
GL 大厅四桌实景 diorama（点卡飞入真实 3D 桌）、tod 结算颁奖台 3D 化、monopoly 买地 3D 地契卡、bombcat 插回滑杆 3D 化、NOPE 3D 倒计时环、UNO 结算镜头、跨页返回 pull-back 镜头、大富翁棋子旁钞堆随收租实时增减的可见化（与 flyNotes 落地对齐）。

## 门禁（验收）
- 新探针：`.pw/ev-arcade-dive.cjs`（点卡 wipe/导航时序/warp 票/REDUCED 退化）、`.pw/ev-mono-bust-ritual.cjs`（清算克隆动线/钞堆增减/√SPEED）、`.pw/ev-uno-wildpick.cjs`（GL 色球绽放/点选染色/DOM 退路/钩子保活）、`.pw/ev-bc-suspense.cjs`（悬念推镜/结算一镜/引擎时序不变）。
- 回归：probe-arcade 32、probe-loader-gate、probe-tod-home、probe-monopoly 28、probe-mono-maps、probe-mono-replay、probe-mono-net、probe-persona-mono、probe-uno 21、probe-uno-net、probe-persona-uno、probe-bombcat-ui 27、probe-bombcat-rules 37、ev-bombcat3d、check-syntax(+bc)。

---

# 评审吸收（2026-10-02 双评审 SHIP WITH FIXES，必修项全落，按此实施）

**优先级定案（玩家模拟 Q1）**：W1 > W3 > W2 > W4；四条全做，W4 按挑刺专家纠正后的机制收敛。
**新提上一轮（玩家模拟 Q3）**：**跨页返回 pull-back**——子游戏返回 index 前写 `localStorage['tod:warp-back']={t}`；index boot 读新鲜票（<2500ms）→ 四卡错峰 drop-back 入场（scale 1.15→1 + Cam 从 z-38 续接推到 base，与既有 boot dolly 同语言）+ 读后即删。浏览器 back（无票）走现状。各子游戏的返回路径各自写票（tod 三入口 / monopoly / uno / bombcat 返回按钮处各 1 行）。

## W1 修订
- **#1** `.tapped` 的 arcade-pop（0.42s CSS animation）transform 级联压过起飞缩放——起飞路径**不用 inline scale**：dive 专用 keyframes（挂 `#arcade-dive-card` 克隆或卡上加 `.dive` 类替换动画槽位），并移除 `.tapped`。
- **#2** bfcache：index 加 `pageshow(persisted)` 立即撤 wipe（display:none），ev-arcade-dive 加「goBack 返回后 wipe 不在文档」断言。
- **#3** backdrop-filter 压平 preserve-3d：玻璃模糊下放到 `::before`/内层子元素，`.arcade-card` 本体挂 preserve-3d+perspective；loperf 反转（:1220 移除 blur 后视差复活）可接受，但基础档视差必须生效。
- **#4** landforce 下 wipe 圆心走 `landPick()`（tapFx 同款先例 index.html:4141）。
- **#5** wipe z=**990**（>tap-ring 950、<loading-overlay 1000）；toast(z2000) 刻意留在 wipe 之上保 bombcat fail 路径「筹备中」可读。**wipe 必须 pointer-events:auto 拦输入**（玩家模拟 #4），防 200ms 窗口双击双导航 + `jumpPending` 式 busy 标志。
- **#6** warp-in 挂点按页分派：tod→`.loader-stage`（**禁碰 `.loader-card`**——probe-loader-gate B 锁它的 flip currentTime 对齐）；monopoly/uno→`#loader .loader-box`；**bombcat 无 loader，本轮不加 arrival**（备案）。wipe 盖满时长与 nav 延迟抽同一常量（nav ≥ 盖满）；TURBO 档延迟归零、wipe 跳过；REDUCED 改「120ms 淡入后保持遮盖直至跳转」（防淡出后露底 80ms）；warp 票窗放宽到 4000ms。
- bombcat jumpExternal 探测最坏 3s（HEAD 1500+GET 1500 兜底）：wipe 层内嵌「正在确认能否开门…」状态文字（模仿 toast 语义，探测完成即跳或撤）。

## W2 修订
- **#8** 清算仪式拆 `bustBanner`：散钞+克隆动线**立即**起，横幅/shaking 挂「克隆全落地」计数回调；**三个调用点统一走同一仪式入口**（charge :2178 / collectAll 内联 :2286 / 观战 op :648）。
- **#9** 观战端 prev 不可达：op 编译时就地携带 `tiles:[prevOwners==i 的地块]`（ops 是本地推导对象，不违零状态包新字段）；**无 prev（中途加入/重连）跳过仪式直接落终态**（玩家模拟 #14）。
- **#10** 克隆体：`clone.material=mk.material.clone()`；`clone.visible=true` 显式；观战端从 TILES[t] 坐标起飞；**绝不调 flyNotes**（busy 池），独立 mesh 组只共享 noteTex 缓存。
- **#11** 钞堆 diff 源=独立镜像 `lastStackCash[]`，updateHUD 末尾对 `G.players[i].cash` diff（**没有 syncPawns，禁读 DOM**）；bodyLo 翻转时显式隐藏静态池；REDUCED 静态摆放无动画（玩家模拟 #9 补退路）。
- **#12** 轻震用 **body.jolt**（不是 shaking——那是破产重震专用，bustBanner :2312 的 remove 定时器会互相拆台），沿用 :2283 互斥判法。
- **#13** 静态钞堆 4×4=16 束不进 notePool（上限 10）。

## W3 修订
- **#14(P0) 输入闸门**：新增 `wildGLArm` 标志，`pickHand`(:2046)/`humanDraw`(:1554)/`humanPlay`(:1589) 三处同判——选色期 document 级点击只认色球；选色完成/退役必须清标志；loperf 不退役场景就让它点完、不中途换弹窗（与闸门同处收口）。
- **#15** **AUTOTEST/inspect 恒走 DOM 弹窗**（probe-uno 21/uno-net/persona/seats/verify 四探针零改动保绿）；GL pick 仅真人路径；新探针用专用 qs（如 `?wildgl=1`）强开。`chooseColor` 钩子 GL 模式改「暂存 pending 色、色球武装后自动消费」。
- **#3(uno)** wild 视觉持有：复用 flyGroupToPile 的 splice 摘出做「视觉持有」，选色完成才真正写状态，防扇形里复活重复牌。
- **#16** 选色推镜前 `clearTimeout(rig._glT)`（防上一位对手 glanceAside 回程拽走镜头）。
- 色球挂**加大隐形 raycast 面**（bombcat 牌库 34px 软半径先例），绽放一开始就受理点击；**非本端不出现任何选色 UI**（只看 setColor 结果动效——玩家模拟 #8 措辞修正）。

## W4 修订（挑刺专家 #17/18/19 纠正机制）
- 悬念拍插入点=**onGameEvent 'boom'（:1636）**：ek 牌从不进手牌、无既有 flyCard 到手动画（brief 原描述作废）；对**所有端**包 1200ms 延迟（actor 与远端各自本地延迟，节拍天然对齐），卡用**克隆 mesh** 从牌库/座位顶起飞自旋；相机推近写进**渲染循环 CAM_BASE 合成处**（:2894 每帧直写会覆盖体外 lerp）；回调内重查 `sceneReady()` 与 `S.stage`。
- **overShown 门**（applyState over 分支 :1588）：有 pending boom 的端等「引信→boom」播完再 `showScreen('result')`，无 boom 的终局照旧即时——防结算屏截断悬念（玩家模拟 #1）+ 防多端重复触发。
- 结算一镜：飞行源=**事件当下捕获的扇 mesh 克隆**（胜者抬扇展示；败者/爆炸者扇已清就跳过该拍），相机缓推向胜者座位 800ms → `#screen-result` veil-in 0.4s；REDUCED/bodyLo 直切。
- 引擎时序零改动是硬门：ev-bc-suspense 必须断言「引擎 ver/log 时间戳未被 1.2s 拖延」。

## 探针设计约束（#20）
- ev-arcade-dive：补 bfcache 返回断言 + 404 服务器分支（测 bombcat fail 撤回）。
- ev-mono-bust-ritual：像素断言必假红——用 `__mono`（monopoly.html:2808）加 AUTOTEST 门控的克隆/钞堆枚举访问器。
- ev-uno-wildpick：断言到 `G.cur` 变色而非「球存在」（防假绿）。
- ev-bc-suspense：断言引擎时间戳不变 + boom 视觉延迟窗。
