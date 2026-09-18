# 3D 优化实施 · 代码工程终审（final-review-code-3d）

> 终审对象：index.html 内联 three 模块 v8（6136–6825）+ CSS 补丁 + 三处 JS 小改 + 测试脚本改动；基线=HEAD。
> 契约：.pw/design-plan-3d-polish.md v3 定稿节 + .pw/review-3d-polish-eng.md 不可让步底线 1–7。
> 取证方式：逐行读实现与全部 diff；重跑 check-syntax / test-3d / test-perf / probe-3d-diag / probe-3d-smoke / probe-3d-8p 全部门禁；另写两个一次性诊断探针实测相机驱动与 reparent 归还（.pw/review-3d-probe-cam.cjs、.pw/review-3d-probe-leave.cjs、证据截图 shots/review-3d-leave-lobby.png，修复后可删）。
> 门禁实测：check-syntax 3 段全过；test-3d 37/37 绿；test-perf 全绿；diag/smoke/8p 零 pageerror，8p chars=8，diag 双路径选卡含真 raycast（mouse.click 打 3D 投影点）命中 ✓。

## 总判定：【修复后可交付】

工程底盘扎实：retire3D 全清单基本齐、逐帧写入账本不超纲、CanvasTexture 单实例回合级、否决名单+闩锁+retired 短路齐、名牌 offset 链、工具行钉底实测四阶段不动（toolsRect 恒 [270,859,900,33]）、画布全屏（canvasRect [0,0,1440,900]）、全部既有门禁绿。但存在 **2 个 P0**：最高优先的「揭晓近景」在真实条件下根本不动（真相卡完全不动、大冒险卡只被 Cam.shake 顺带推到 78% 处冻结），以及 **#stage-actions 残留在大厅/结算屏上挡点击**。两处都是接线级错误，修复面小（各一处），修完复跑 diag + 两个 review 探针即可交付。

---

## 逐项判定（A–G）

### A. retire3D 完整性 —— 【基本完整，2 处小漏 + 1 处僵尸循环，无 P0】
对照 eng 评审清单：①摘 three3d 类 ✓（6804）②停 rAF **△**（见 P2-2：frame 6650 先重排队再查 retired，retire 后 rAF 永久空转）③清名牌 inline **△**（6808–6812 只清 left/top/zIndex，漏 visibility，见 P1-3）④摘 canvas ✓（6821）⑤resize 监听摘除 ✓（6805）⑥Cam.apply/paintVoice 还原 ✓（6806–6807，_ap 为 bind 后原函数）⑦按钮归还 + #stage-actions 移除 ✓（6801–6803，bridgeRestore 按 {el,parent,next} 逆序插回 + stageActions.remove()）⑧traverse dispose geometry/material/map + renderer.dispose + forceContextLoss ✓（6813–6820；texCache 中未被引用的旧头像纹理不经 traverse，一次性小残留 → P2-8）⑨同一同步函数、先摘类再摘 canvas、无 await ✓。
**document click 监听**：6616 挂 document，retire 不摘——但模块 IIFE 单实例、监听只挂一次不存在累积；retired 短路在句首（6618），功能上失效充分；闭包持留与 window.__three 持留 scene/camera/chars 重叠，增量有限。判定：短路够，摘除为建议（P2-1）。

### B. 帧循环纪律 —— 【账本不超纲，通过】
逐帧写入清点（对照 eng 账本）：呼吸 torso.scale.y / 摇摆 torso.rotation.z / 发 hair.position.y（6740–6742）+ 探身 torso.rotation.x（6760）＝ 4 transform ✓；名牌 left/top/zIndex/visibility（6559–6568）✓；走位 ch.position/rotation.y（6754–6759）✓；飞卡/翻面 pose（6696–6697、6725、6688、6728）✓；相机（syncCam，触发缺失另案 P0-1）✓；工具行 display（6657）✓；牌背 scale（6703）✓。**没有账本外写入**：tickChoice 的材质 opacity 带 `!== dim` 变化才写（6794，uniform 写值不触发重编译，注释正确）；resetChoiceCards 仅事件沿。CanvasTexture：题面 qTex/qCanvas 单实例 + qDrawn 闩，翻面前一次性画（6314–6317、6708–6715）✓；backTex/feltTex/choiceTexture boot 一次性 ✓；avatarTexture 按 uri 缓存、事件级 ✓——全部 sRGB + anisotropy + NPOT LinearFilter/no-mipmap，符合豁免防护条款。dt 钳 0.2（6661）：软渲下推镜/走位按墙钟慢进而非跳变，无负 dt 路径，脉冲用 now-t0 不受影响；副作用仅「极端卡顿动画拉长」，可接受。唯一瑕疵：REDUCED 档牌背脉动仍在动（P1-2）。

### C. reparent 三时机归还 —— 【不通过：退场时机是死代码 → P0-2】
bridgeSync（每回合级，6591–6600）/ retire3D（6801）两路径 ✓；**第三时机「换屏退场」失效**：bridgeSync 的 `.leaving` 归还分支（6593）在 frame() 的 `if (!active) return`（6658）之后，而旧屏丢 `.active` 与挂 `.leaving` 是同一拍（2467 行仓库自注「旧屏此刻刚丢 .active，.leaving 是它唯一的显示来源」）——该分支永远不可达。实测（review-3d-probe-leave.cjs）：revealed 中回大厅后，lobby 屏上 #stage-actions display:'' 、rect [62,611,900,61]、elementFromPoint 命中 card-actions——死按钮条浮在结算/大厅屏上并可拦截点击，直到下一局第一个 choosing 帧才自愈。工具行 toolsMoved 无此问题（6657 在早退前按 active 切 display，.leaving 时 active 已丢 → display:none ✓）。修复见 P0-2。

### D. raycast 安全 —— 【防护齐备，1 处 landforce 坐标混用 → P1-1】
否决名单 ✓（6619，且比 spec 多拦 .modal-mask/.react-bar/.toast）；`e.detail>1` 弃 ✓（6618）；阶段闩锁 ✓（6624–6625，落空不闩 6639，离开 choosing 才清 6685）；retired 短路 ✓；NDC 过 landPick ✓（6627）但换算用 getBoundingClientRect 差值混物理/逻辑两套坐标（P1-1，非 landforce 时恒等价故平时无感）。绕过路径排查：键盘 Enter → detail=0 但 target 命中 .choice-card 被名单拦，走 DOM handler，单次 choose ✓；程序化 el.click()（evaluate）→ 同一次 dispatch 里按钮 handler 先跑、document 冒泡后被名单拦，不会 double-choose ✓（diag/smoke/verify/test-perf 四路实测无重复选卡）；pointer-events:none 的 .choice-card 上真实点穿 → target 落 #cam/.world/grid → raycast 接管，正是设计意图（diag 实测 target=game-players-grid 命中卡）。choose() 若抛错闩不回（6637），卡到换回合才解——DOM 按钮仍在，降级可接受（P2 记录）。

### E. 竞态与边界 —— 【走查无明显崩点，通过】
fast 换回合（seq 突变）：相位机以 stage 边沿驱动，drawing 入沿从 park/shown/flip 强制重置并 snap 终态（6677–6689），!inRound 沿再 snap（6684–6689）；「一帧内跳过 drawing」时卡从歇身处直接翻面，降级正确无崩点。翻面条件绑定 `stage==='revealed' && .flipped`（6707），旧回合动画不会飞进新回合。抽卡中刷新：重载全新 boot，retained 状态恢复，相位机从 park 重建 ✓。loperf 中途翻转：retire3D 同步全还原，CSS 路径当帧复活 ✓（残余见 P1-3/P2-1/P2-2）。8p：chars=8、零报错（本次终审实测重跑）✓。双开：每页独立 IIFE/监听/闩锁 ✓。landforce 横竖旋转：size() 量画布自身（6181–6188）✓、名牌 offset 链（6548）✓、resize 兜底 ✓；缺口仅 raycast（P1-1）。

### F. 测试改动正当性 —— 【总体「如实跟进」，无删锁；2 处记录】
1. **test-perf 拆档**：1 节钉 full（orb drift 断言在 loperf 下会被 animation:none 误杀，理由成立）、2–3 节新 context 钉 low（恢复 CSS 基线宇宙）、4–6 节维持不钉——与 eng 指令逐字一致，实测全绿（low 档 fps=60）。正当。
2. **test-3d rx 等待 2600→4200**：断言本身未动（rx≈19 不变），放宽的是等待；配合 3334–3338 的 nudgeWhenFree 竞态修复（glance 落定→再 nudge 接力，headless 下确实晚于 2.6s）。如实跟进。
3. **me 豁免 / visibility 豁免（hitBad）**：me 名牌 pointer-events:none 是既有 SPEC 设计（754 行 CSS 在案），visibility:hidden 元素本就不参与 elementFromPoint——语义必需，且 dbg.vis 真实采集（test-3d.cjs:223）、接线完整。正当。
4. **聚焦档 is3d 分支**：`|z+76|<1` 数值契约未放松（CSS 路径 focusCam(#deck) 的落点同为 b.z-20=-76），但 3D 分支的通过机理是「持麦人 nudge 聚焦档维持 z=-76」而非断言标签写的「GL overlay 接管」——标签与机理不符，建议改注释（P2-6）。断言本身无放松。
5. **probe-3p-verify 三处**：cardTf 断言在 is3d 分支改写为「3D 卡系统在场 + 画布全屏 + chars=人数」——比 eng 最低要求（接受 'none'）更强，非删锁；#card-truth force click → evaluate click：真实坐标输入路径的 raycast 覆盖**没有删**，落在 diag 的 mouse.click 双路径（真 raycast E2E 在案且本次实测通过）；工具行快照选择器放宽是 reparent 的语义必然后果；对手遮挡断言改测名牌间距（脸已进 WebGL，名牌=唯一可见身份标签）。全部判定：如实跟进。
6. **A/B 相对断言**：按 eng 公式落地（A≥0.5×B 且 A≥24），但本机 headless 是 SwiftShader → 410–411 行自动豁免（实测 A=3.3 / B=27.3 仅记录）——「3D 档不砍半」契约在本机从未真正判绿，见 P1-4。
7. diag/smoke/persona/8p 钉 `tod:perf='full'`（值与 PERF_PREF_OF 核对无误）✓，与实现同批落地，满足底线 6/7。

### G. 语法/约定 —— 【通过】
check-syntax.cjs 3 段全过；无外部依赖新增（无补间库、无新网络资源，字体链接为既有）；单文件离线不破坏；603KB UMD 未触碰；.world 无 preserve-3d 未破坏（test-3d 前置断言绿）；注释全中文、讲为什么，与仓库风格一致（个别同行接语句见 P2-7）。diff 中另有两处**任务书未列的改动**：RoomLink.open() 首拨即放行（2148–2160，Promise.race）与 doJoin 等待窗调参（4527–4546）——retryNow(2254)/resubscribe(2224)/_closing/_dialing 均真实存在，join 失败路径补重拨+重订阅，语法过、走查无明显崩点；工程侧不拦，语义归业务检查官。

---

## 问题分级清单

### P0（必须修，修完才可交付）

- **P0-1 揭晓近景（3.7「任何情况不可动」项）实际不工作**。
  证据：syncCam 只有 Cam.apply 一个触发口（index.html:6518–6519），而 frame() 逐帧推进 revealK（6729–6731）却从不调用 syncCam；revealed 期间无任何常驻 apply 源。实测（review-3d-probe-cam.cjs）：truth 卡整个 revealed 阶段 Cam.apply 仅 1 次调用，glCam 恒 [0,3.75,5.4]（远景）；dare 卡仅因 Cam.shake(300ms)（3506 行）顺带推进，diag 实测 glCam 冻结在 [-0.89,3.06,1.92]（目标 [-1.2,2.77,0.46] 的 78% 处）。桌面端靠鼠标视差偶发「阶跃跳近」，触屏端完全死。近景截图 3d-revealed.png / 3d-diag-revealed.png 题干均不可读。
  修复：frame() 内在 revealK 更新之后、updatePlates()（6770 行）之前调用 `syncCam();`（相机属账本内逐帧项，合规；6519 的钩子保留，重复调用无害）。index.html:6729–6770。
- **P0-2 #stage-actions 残留在非游戏屏，死按钮拦截点击**。
  证据：见 C 项。实测 lobby 屏上 stage-actions 可见（rect [62,611,900,61]）、elementFromPoint 命中 card-actions（截图 shots/review-3d-leave-lobby.png）；自然打完一局（终局 accept→result 同拍切屏）同命中。eng 原指令要求归还挂在「旧屏挂 .leaving 的同一处（2611 行附近）」，实现挂在 frame 循环内且位于早退之后，等于没挂。
  修复（二选一，推荐 ①）：① frame() 的 `if (!active) return;`（6658）之前补 `if (movedEls.length || stageActions.style.display !== 'none') bridgeRestore();`；② 按 eng 原指令把 bridgeRestore 调用挂到 2629 行 `old.classList.add('leaving')` 同一处（注意 bridgeRestore 定义在模块内，需经 window.__three 访问器或把挂载点留在模块内监听）。

### P1（建议修）

- **P1-1 landforce 下 raycast NDC 混坐标**（违反底线 5「拾取禁止裸 getBoundingClientRect 差值」精神）：6626–6629 用 canvas.getBoundingClientRect()（物理盒，left/top 非零、宽高互换）去减 landPick 返回的逻辑坐标。非旋转时 r.left=0、r.width=clientWidth，恒等价，故平时无感。修复：`mouseNdc.x = (pk.x / canvas.clientWidth) * 2 - 1; mouseNdc.y = -(pk.y / canvas.clientHeight) * 2 + 1;`（与 updatePlates 同款）。index.html:6626–6629。
- **P1-2 REDUCED 档牌背脉动仍在动**：6678 REDUCED 进入 'pulse' 相位，6700–6704 每帧写 scale 呼吸脉动——违反「REDUCED 静态退路」（设计：牌直接出现且静止）。修复：`if (st.phase === 'pulse' && !IS_REDUCED) {…}`，REDUCED 时补一次 `actionCard.scale.set(1,1,1)`。index.html:6678、6700–6704。
- **P1-3 retire3D 不清名牌 inline visibility**：updatePlates 会写 visibility='hidden'（6559、6564），retire3D 只清 left/top/zIndex（6808–6812）——loperf 翻转瞬间恰被出屏裁剪的名牌在 CSS 回退路径永久隐身（直到下次名单重建）。修复：清样式处补 `c.style.visibility = '';`。index.html:6808–6812。
- **P1-4 A/B 帧率门禁在本机自动豁免，契约从未真正判绿**：test-3d.cjs:410–411 SwiftShader 检测后仅记录（实测 A=3.3 / B=27.3）。豁免本身有 eng「软渲无信号」背书且日志响亮，但交付结论里「A/B 相对断言已落地」必须附带「仅真 GPU 环境生效」的说明，并在真 GPU 机器上跑一次 test-3d 留档数字；若真 GPU 上 A<0.5×B，按 eng 预算顺序先降 dpr 预算（6184 行 2.3e6）。

### P2（记录）

- **P2-1** document click 监听 retire 后不摘除（6616）：短路充分、单实例不累积；如要彻底释放闭包，具名 handler 并在 retire3D 里 removeEventListener。
- **P2-2** rAF 僵尸循环：6650 先 `requestAnimationFrame(frame)` 再查 retired，retire 后每显示帧空转一次。修复：两句交换顺序（`if (retired) return;` 在前）。
- **P2-3** updatePlates 每人每帧 `V.clone()`（6558）：8 人局 8 次/帧堆分配；可复用模块级备用 Vector3。
- **P2-4** drawQuestion 头像同步判定 `img.complete`（6333–6340）：blob:/https: 头像几乎必 false → 题面小头像常缺（emoji/data: 正常，不崩）。可在 onload 回调里补一次回合级重绘。
- **P2-5** test-3d.cjs:414–418 断言消息串把 `${}` 误写为 `\${}`——门禁逻辑正常（比较式是真实代码），仅日志打印字面量。
- **P2-6** test-3d.cjs:295 3D 分支断言标签「推近由 GL overlay 在翻面时接管」与实际通过机理（nudge 聚焦档维持 z=-76）不符，值未放松；建议改标签。
- **P2-7** index.html:3021 `}` 后同行接 `if (document.body.classList.contains('three3d'))…`，与仓库分行风格不符；且该 visibility 互斥只在 renderGameStatic 的 else 分支维护，走查各分支组合自洽，记录备查。
- **P2-8** texCache 无淘汰：离场玩家纹理与被替换的旧头像纹理留至 retire 且不经 traverse dispose（一次性别针泄漏，量小）。
- **P2-9** 视觉参数与 v3 定稿的偏差（工程不拦、归 visual 验收）：飞卡三段节奏改单正弦、弧顶 ≈1.48（v3：三段/1.55–1.65）；#stage-actions bottom 96px（v3：64px）；dpr 未保留两位小数（6184）。
- **P2-10** 本次终审新增诊断件：.pw/review-3d-probe-cam.cjs、.pw/review-3d-probe-leave.cjs、shots/review-3d-leave-lobby.png（复现 P0-1/P0-2），修复复验后可删。

## 复验指令（修复后）

1. `node .pw/check-syntax.cjs` 过；2. `node .pw/review-3d-probe-cam.cjs`：truth 卡 revealed 期 apply 次数持续增长、glCam 收敛至 ≈[-1.2,2.77,0.46]；3. `node .pw/review-3d-probe-leave.cjs`：A 回大厅后 saVisible=false；4. `node .pw/probe-3d-diag.cjs`：glCam 到位 + 零 pageerror + raycast OK；5. `node .pw/test-3d.cjs` 全绿；6. 真环境（真 GPU 或真机）跑一次 test-3d 记录 A/B 数字（P1-4）。
