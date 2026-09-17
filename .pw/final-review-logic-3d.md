# 业务逻辑终审 · 3D 牌桌优化轮（final-review-logic-3d）

> 终审人：业务逻辑检查官。只判「交付后玩家实际玩起来的逻辑是否正确」，代码工程质量归另一位检查官。
> 终审方式：Playwright 真跑游戏（本地双标签，端口 8831/8835/8837/8839/8841，`localStorage tod:perf='full'` 钉全效），模板 `.pw/probe-3d-diag.cjs` / `probe-3d-8p.cjs` 改造为 `fl-A-rounds.cjs` / `fl-B-consist.cjs` / `fl-B2-focused.cjs` / `fl-C-degrade.cjs` / `fl-D-cardtex.cjs`（均存于 `.pw/`，结果 JSON 同目录）。
> 对照契约：`.pw/design-plan-3d-polish.md` v3；硬标准：`.pw/report-persona-3d-akai.md` / `-tingting.md`。
> 共 4 轮完整跑测（探针 A 跑了 3 遍用于区分确定性缺陷与软渲帧率噪声），**全程 0 页面错误、0 控制台错误**。

---

## 总判定：【修复后可交付】

主干流程是真的通的：开局→选卡（DOM 兼容路径与 3D raycast 路径都实测通过）→飞卡动画→牌背在桌→翻面出题→题面与 `S.turn` 一致→完成啦/跳过结算→交接→下一回合可再玩（连续 3 回合无卡死）；双标签状态逐字段一致；计分/手数/轮转与 CSS 路径逐值一致；loperf 开机与运行中 `retire3D()` 全部还原后 CSS 路径连续可玩；REDUCED 静态但流程完整。用户五条 P0 中 ①②③④⑤ 全部实测达成（见「五条 P0 对照」）。

但存在 **1 个 P0**（免答牌/换一题后 3D 题卡不重绘，玩家对着旧题打完一轮且无任何地方能看到新题）与 **3 个 P1**（揭晓近景相机不保证落幅、失效按钮在错误阶段可见可点、CSS 揭晓暗幕叠在 3D 画面上）。这些是玩家每一局或每一两次使用就会撞上的功能性错误，修完才可放行。

---

## 一、实测用例清单（操作 → 预期 → 实际 → 判定）

### A 组：完整回合逻辑（双标签，1440×900，轮流+计分）

| # | 操作 | 预期 | 实际 | 判定 |
|---|---|---|---|---|
| A1 | 双标签开局进入牌桌 | 双方 three3d=true、chars=2、canvas 全屏 | `[true,2,[0,0,1440,900]]` 双方一致，3 轮跑测全过 | ✅ |
| A1b | 选卡阶段 3D 状态 | 行动卡不可见（park）、选卡双卡在桌 op=1 rotX=0 | 与预期一致 | ✅ |
| A2 | 头像映射（P0-1） | 3D 脸盘=所选头像 | 程序读回：两人脸盘纹理 65536/65536 非底色像素（全画上）；目检大厅粉/绿像素头像 ↔ 3D 头像素脸同图案同色（fl-A-lobby-P vs fl-A-revealed2-P） | ✅ |
| A3 | **DOM 兼容路径选卡**（evaluate 级 click #card-dare） | 双方 stage=drawing、choice=dare、seq 同步 +1、rounds=1 | 全部一致 | ✅ |
| A3b | 选后 UI | choice-section 隐藏、播报「起身去卡堆抽卡了…」 | 一致 | ✅ |
| A4 | **抽卡动画**（P0-3） | 卡有起飞→飞行→落桌过程 | 3 采样位置 `[0.72,1.43,0.16]→[0,0.98,−0.64]`（run3）/`[1.12,0.98,0.6]→[0.16,1.2,−0.46]→rest`（run1），卡全程可见，飞卡弧线实测存在 | ✅ |
| A4c | 抽卡中画布不压缩（P0-4） | canvasRect 恒 [0,0,1440,900]、buffer 不变 | 恒 `[0,0,1440,900]`/`[1440,900]` | ✅ |
| A4d | 非选择者同步 | 对方 tab 同一阶段、同一张桌面卡 | 状态与 3D 卡逐帧一致（采样时刻差导致的 1 次断言偏移不计） | ✅ |
| A5/A5b | 3D 翻面动画 | 存在中间角度 | 软渲 ~1.5-2fps 下翻面在单帧内从 0 跳到 −π（墙钟 650ms 被追帧吞掉），无法在 headless 证伪；代码路径为 650ms 三段式、终态正确（0→−π）。按环境限制记「无法证伪」，需真机抽查 | ⚠️ 无法判定 |
| A6 | 翻面终态 | 题卡躺毡面、纹理已画 | phase=shown、texVersion=2、题面 canvas 523,757 像素已绘制（fl-D 读回）；落点 z=−1.28（远边枢轴翻面后比 REST 偏北 0.64，见 P1-2） | ✅（附注） |
| A7 | 题面内容与 S.turn 一致 | type/人名/题干三者对得上 | DOM `#punishment-text` ≡ `S.turn.punishment`；3D 卡面徽章色（🎯橙/💬蓝）、「××抽到的题」署名、题干文本与状态一致（fl-D/fl-B 截图逐字核对） | ✅ |
| A7b/c | **双标签桌面同态** | stage/choice/seq/flipped/3D 卡相位全等 | 全等 | ✅ |
| A8 | 动作按钮 reparent（P0-5） | #card-actions 在 #stage-actions 且按钮有实矩形可点 | 父=stage-actions、rect=[627,755,84,35] | ✅ |
| A9 | 揭晓近景落幅 | 相机到 REVEAL_POS[−1.2,2.82,0.46] | **非确定性**：run3 到位 [−0.9,3.1,0.5]；run2 连续 6 采样 × 6s 冻结在 [−0.9,3.37,0.11] 不动（详见 P1-1） | ❌ |
| A10 | 完成啦结算 | choosing、+10、rounds=1、skips=0 | `{score:10, rounds:1, skips:0}` | ✅ |
| A11 | 交接轮转 | chooser 换人、双方一致 | 一致 | ✅ |
| A12 | 回合结束复位 | 按钮归位 card-front、3D 卡回 park、双卡复位 | 全部复位（双方） | ✅ |
| A13 | **3D raycast 路径选卡**（真鼠标点击 3D 选卡投影点） | drawing + `__rayDbg.hit='card'` | `hit:'card'`、choice=truth、stage=drawing；两轮回合均成功 | ✅ |
| A14 | 换人后回合 2 揭晓 | 双方 punishText=S.turn.punishment | 一致（`最近一次熬夜是为了什么？`） | ✅ |
| A15 | **跳过结算 + 连续 2 回合无卡死** | −5、skips=1、rounds=2、轮转继续 | `{−5, skips:1, rounds:2, chooser 换人}` | ✅ |
| A16 | 第 3 回合选卡恢复可点 | raycast 再入 drawing | 成功（无闩锁残留、无高亮残留） | ✅ |

### B 组：状态一致性 + 按钮功能

| # | 操作 | 预期 | 实际 | 判定 |
|---|---|---|---|---|
| B1 | 揭晓近景相机 6s 收敛性采样（0.9s×6） | 收敛到 REVEAL_POS | 3 次跑测 2 次冻结：`[−0.9,3.37,0.11]`×6、`[−0.53,3.59,3.6]`×6、1 次到位 → **确定性缺陷，非软渲噪声**（见 P1-1） | ❌ |
| B2 | 选卡 3 连击（<150ms） | 只算 1 次抽卡 | Δdraws=1、Δrounds=1、Δseq=1 | ✅ |
| B3 | 对手在抽卡期抢选 | 被拒 + choice 不变 | toast「现在不是抽卡时机」、choice 仍 dare | ✅ |
| B4 | 抽卡/揭晓期 raycast 点桌面选卡 | 阶段闩锁拒绝、无双卡残影 | `stop:'stage/latch'`、双卡 op=1 rotX=0 | ✅ |
| B5 | **免答牌** | 换题、seq+1、passes−1、分不动 | punishChanged ✓、passes 2→1、Δscore=0、stage=revealed | ✅ |
| B5b | **免答牌后 3D 题卡是否重绘** | 题面更新为新题 | 卡面截图像素差 **0.63%**（=呼吸噪声级），题没换 → P0-1 | ❌ |
| B6 | 主持人换一题（host≠chooser，#stage-actions 内真实点击） | 可见可点、换题不崩 | rerollVis=true、punish 变化、seq 6→7、stage=revealed | ✅ |
| B6b | 换一题后 3D 题卡重绘 | 题面更新 | 卡面像素差 **0**（一个像素都没变），DOM 已是新题 → P0-1（截图 fl-B2-reroll-table：卡面仍是旧题） | ❌ |
| B7a/b | 加倍按钮（#stage-actions 内） | 可见；点击 stake=2 且入口收起 | vis=true → 点击后 stake=2、vis=false | ✅ |
| B7c/c2 | 加倍后按钮文案 | 完成啦含 +20 / 跳过含 −10 | 打字机完成后文案正确（`完成啦 ✅ +20`/`这题先跳过 −10`）；但打字机窗口内为基础文案（见 P2-7） | ✅（附注） |
| B7d | 加倍完成结算 | +20 | score −5→+15（=+20），k=2 生效 | ✅ |
| B8 | **竞态**：chooser 点完成 vs host 点换一题（近乎同时） | 恰好一次结算、终态 choosing、无错 | 恰好一次 +10、stage=choosing、0 页面错误（rounds 在抽卡时已计，Δrounds=0 属正常） | ✅ |
| B9 | 自由局连续持麦（accept→再抢） | 无上一轮按钮残留、可再玩 | accVisible=false、raycast 再入 drawing 成功 | ✅ |
| B10 | 名牌贴头（P0-4） | 名牌锚在头顶投影点 | 名牌盒顶边=头顶投影 y（偏差 2px）；此前「中心距 98px」为探针取盒中心所致的假阳性。走位中有 ~1 帧拖影（P2-8） | ✅ |

### C 组：降级路径 + CSS 计分对照

| # | 操作 | 预期 | 实际 | 判定 |
|---|---|---|---|---|
| C1 | `tod:perf='low'` 开机 | 无 three3d、无 WebGL 画布、CSS 牌堆/选卡可见 | 全部符合 | ✅ |
| C1b | **CSS 路径完整一局** | 选→抽→揭晓→接受，题面=状态 | 全程正常（deck-section→card-section 切换、打字机、按钮可点） | ✅ |
| C1c | CSS 计分/轮转（对照基准） | +10、rounds=1、turnIndex+1 | `{scores:[10,0], rounds:1, turnIndex:1}` —— 与 3D 路径 A10/A11/A15 逐值一致 | ✅ |
| C2 | full 局中 `setLowPerf(true,'low')`（=省电按钮）→ retire3D | three3d 摘除、画布/动作条移除、按钮归位、名牌 inline 清空、CSS 题卡出现 | 8 项检查全过：`three3d=false, canvas=false, stageActions=false, cardActionsParent='card-front', toolsParent='screen-game', plateInline='clean', cardShown=true` | ✅ |
| C2b | retire 后 CSS 连续两局 | 可玩、账本正确 | rounds=2、两个 +10 | ✅ |
| C3 | REDUCED（reducedMotion:'reduce'） | three3d 保留但静态、流程完整 | three3d=true、chars=2；抽卡=牌直接出现在 REST(0,−0.64)；揭晓=牌直接翻好（−π）且题面就绪；一局完整 +10 | ✅ |

---

## 二、发现的问题

### P0-1 免答牌 / 主持人换一题后，3D 题卡不重绘 —— 玩家对着旧题打完一轮
- **现象**：3D 模式下 `#card-section` 为 `display:none`，桌上那张 3D 题卡是**唯一**的题面显示。打免答牌或主持人换一题后，DOM 里题已换新，但 3D 卡面仍是旧题，玩家（含其他玩家）全程看不到新题，等于按错误题目执行挑战。
- **证据**：B5b 免答牌后卡面截图像素差 0.63%（呼吸噪声级）；B6b 换一题后像素差 **0**；截图 `.pw/shots/fl-B2-reroll-table.png`：换题后卡面仍是「如果可以瞬间学会一项技能，你选什么？」，而实际题已是「模仿在场你最不熟悉的人的说话方式」。
- **根因**：`three-scene` 帧循环只在 `stage==='revealed' && .flipped && phase∉{flip,shown}` 边沿且 `!qDrawn` 时 `drawQuestion()`；`qDrawn` 只在进入 drawing 时复位。usePass/hostReroll 只改 punishment+seq（仍 inRound、phase 已 shown）→ 永不重绘。
- **复现**：2 人局 → 任一回合揭晓后 → chooser 点「🃏 免答牌」或 host 点「🎲 换一题（主持人）」→ 看桌上卡面：还是旧题。
- **修法建议**：帧循环内对 `S.turn.punishment`/`S.turn.seq` 做边沿检测，变化即重绘 `drawQuestion()`（回合级豁免条款允许这一次重绘）。

### P1-1 揭晓近景相机不保证落幅（非确定性冻结，可冻结在几何体内部）
- **现象**：翻面后相机应推近至 REVEAL_POS[−1.2,2.82,0.46]。3 次跑测：1 次到位、2 次连续 6 秒冻结在中途值（`[−0.9,3.37,0.11]`、`[−0.53,3.59,3.6]`）。冻结帧构图极端：相机贴在角色身体/灯罩内部（fl-B-reveal-final.png 右上大块白色=灯罩内壁）、题卡斜角小字、或近乎侧对镜头呈「黑卡」（fl-A-revealed-Q.png run2；run3 同阶段正常有字，纹理读回 523,757 像素已绘制，证明非纹理缺陷而是构图问题）。
- **根因**：`syncCam()` 只挂在 `Cam.apply` 钩子上（`three-scene.src.js:384`），帧循环只自增 `revealK` 不调用 `syncCam()`；揭晓阶段若无 Cam 补间（focusCam 早已结束、shake 仅 300ms）恰好触发，`revealK` 无人消费，相机永远停在旧机位。
- **影响**：违反 v3 契约「翻面同步推近、落幅 ≈2.1-2.3 单位、题干落屏 ≥15-16px」。落幅到位时实测题干 ~22px 达标（fl-D-card-clip.png）；冻结时不达标，且可能闪现荒谬画面。
- **复现**：多开几局到大冒险揭晓即可复现（约 2/3 概率冻结）。
- **修法建议**：帧循环内每帧调用 `syncCam()`（Cam.apply 钩子保留兜底），一行级修复。

### P1-2 题卡落点比取景假设偏北 0.64，加剧可读性问题
- **现象**：远边枢轴（z=−0.96）−180° 翻面后，卡体落在 z=−1.28（REST 0.64 以北），而相机 lookAt 仍是 CARD_LOOK(0,·,−0.64) → 题卡在画面上方以大斜角出现、占屏小、文字被强透视倾斜。契约写明「翻完以躺角贴在毡面上」且取景按 REST 计算，实现偏了 0.64。
- **证据**：A6 实测 `pos z=−1.28`；fl-A-revealed-Q.png（run3）题卡明显偏出取景中心。
- **修法建议**：翻面完成后把 `flipG.position`（或 lookAt）北移 0.64 对齐，二者取一。

### P1-3 失效按钮在错误阶段可见可点（点了没反应）
- **现象**：①抽卡后半段（dealFlyingCard 置 `card-section.hidden=false` 起）到整个揭晓，「完成啦/🃏免答牌/这题先跳过」出现在底部动作条——抽卡期它们是失效按钮（点了无效果无提示）；②「🔥 加倍挑战（+20/−10）」从选卡期一路可见到整个揭晓（stake-row 只在 renderGameStatic 的 choosing 分支管理 hidden，drawing/revealed 分支不管）。
- **证据**：fl-A-drawing-Q.png（run1：完成啦+跳过+加倍同框于抽卡期；run3：加倍于抽卡期）、fl-A-revealed-Q.png / fl-B-reveal-final.png / fl-B2-reroll-table.png（加倍于揭晓期）。代码路径：`bridgeSync()` 以 `#card-section.hidden` 翻转为搬运边沿，被 dealFlyingCard 的 DOM 复用误触发。
- **复现**：任意回合选卡→观察抽卡后半段与揭晓期的底部条。
- **修法建议**：bridgeSync 的搬运条件改为阶段判断（仅 revealed 搬 card-actions）；drawing 进入时把 stake-row 一并 hidden。

### P1-4 CSS 路径「揭晓压暗幕」遗留在 3D 画面上
- **现象**：`#screen-game.stage-revealed .players-grid.ring3d::after`（`rgba(10,10,26,0.45)`，924×225px，实测 gridRect [258,199,924,224]）在每次揭晓时叠在 WebGL 近景正中，把题卡、桌面、名牌整体压暗。这是 CSS 路径「揭晓页压暗让位」的遗留层——three3d 隐藏清单藏了 `.ring3d::before` 却漏了 `::after`。
- **证据**：elementsFromPoint 命中栈顶=game-players-grid（rect 与暗幕完全重合）；全部揭晓截图可见（fl-A-revealed-Q.png 等）。
- **修法建议**：`body.three3d:not(.loperf) .players-grid.ring3d::after { display:none !important }`。

### P2（不影响流程，供打磨）
1. **选卡双卡整局留在桌上**：进入 drawing/revealed 后 3D 真心话/大冒险卡不退场（DOM #choice-section 隐藏但 3D 卡没有隐藏逻辑），挤占揭晓近景构图、走位者从其上穿过。
2. **抽卡动画开场双跳**：waitfly 窗口（0-600ms）牌先躺在桌心 REST，起飞瞬间瞬移回牌堆再飞回（健康帧率下可见「出现→跳走→飞回」）；软渲低帧率下恰好被跳过。建议 waitfly 期保持牌在牌堆。
3. **加倍文案迟到**：点加倍后到打字机完成前（约 1-2.5s），按钮显示基础文案「完成啦 ✅」而非「+20」（renderGameStatic 在 revealAnim 期间早退）。复测打字机完成后正确。
4. **走位期名牌拖影**：抽卡走位+相机 pan 时名牌投影滞后一帧（fl-A-drawing-Q.png run3 名牌偏离头顶 ~100px，瞬态）。
5. **选卡期北座玩家与顶部 HUD 重叠**：1440×900 下「轮到你了！」胶囊与主持人徽章盖在北座玩家脸上（fl-A-choosing-Q.png / handover-Q）。
6. **「选择一项：」提示压毡面**：#choice-hint 以极低对比度直接印在 3D 毡面上，几乎不可读。

### 无法在本环境判定（需真机抽查）
- 3D 翻面 650ms 动画的观感：软渲 ~2fps 下被追帧吞成单帧跳变（A5/A5b），代码路径正确（三段式、墙钟定长），无法证伪也无法证实流畅度。

---

## 三、用户五条 P0 对照

| 用户 P0 | 判定 | 依据 |
|---|---|---|
| ① 头像按所选映射 | ✅ | 纹理读回 2 人全部 65536 非底色像素 + 截图与大厅所选像素头像同图案 |
| ② 3D 场景全屏不裁剪 | ✅ | 所有阶段 canvasRect=[0,0,1440,900]、buffer 1440×900，截图满幅无 CSS 星空穿帮 |
| ③ 有抽卡动画 | ✅ | 飞卡三采样位移实测（牌堆→弧线→桌心 REST），位置曲线连续 |
| ④ 抽卡中场景不压缩 | ✅ | 抽卡全程 canvasRect/buffer 恒定 |
| ⑤ 抽卡和出卡在桌面完成 | ✅ | 选卡=桌面双卡 raycast（DOM 兼容路径亦验）、抽卡=飞卡上桌、出卡=桌面翻面；按钮在 #stage-actions 底部条。注：P0-1 换题不重绘是本条的瑕疵 |

## 四、回归安全性结论（本轮未发现新问题）
- 状态机终态：快速连点、对手同时动作、接受/跳过/换一题/免答/加倍 六种结算与扰动后，3D 卡均回到正确终态（park/ shown），无半飞卡、无选卡高亮残留、无闩锁残留（A12/A12b/A16/B2/B3/B4/B8/B9）。
- 降级：loperf 开机、loperf 运行中触发（retire3D 全清单 8 项核对）、REDUCED 三条路径均可完整玩局，账本与 CSS 基准一致（C 组全绿）。
- 双标签：状态逐字段一致、桌面卡同相位、双方截图同内容（A4d/A7b/A7c）。

## 五、主要截图索引（.pw/shots/）
- 流程：fl-A-lobby-P / fl-A-choosing-P·Q / fl-A-drawing-Q·P-other / fl-A-revealed-Q·P-other / fl-A-revealed2-P·Q-other / fl-A-handover-P·Q / fl-A-round3-drawing
- 问题证据：fl-B-reveal-final（相机冻结贴脸+暗幕+加倍残影）、fl-B2-reroll-table（换题后旧题卡）、fl-B-pass-before/after（免答牌前后题面零变化）、fl-card-orient-check（题面方向正常，排除倒置）
- 降级：fl-C-css-choosing/drawing/revealed、fl-C-retired-revealed/next-choosing、fl-C-reduced-choosing/drawing/revealed·other
- 读回：fl-D-card-clip / fl-D-full（题面纹理正常渲染的基准帧）

—— 终审完毕。P0-1 修复量小（一个边沿重绘）、P1-1 是一行级修复、P1-3/P1-4 各为条件补齐/一行 CSS，建议修完这四项后用本目录四个探针回归即可放行。
