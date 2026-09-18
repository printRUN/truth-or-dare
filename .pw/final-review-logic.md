# 业务逻辑终审 · 第三人称牌桌改造（TP-Table v3）

> 终审人：业务逻辑检查官 · 2026-09-14 · 分支 `feat/3d-one-take`（index.html 工作区未提交改动）
> 方法：只读审查 `git diff index.html` 全量 296 行 ± 逐路径走读；本机实跑全部相关测试与探针；
> 对两条存疑失败做了 **HEAD（第一人称版）基线对照实验**（`git show HEAD:index.html` 起独立服务实测）。
> 未改动 index.html 与 .pw 既有脚本；临时探针写入系统临时目录，跑完即弃。

---

## 一、测试矩阵实测（本机，非转抄）

| 套件 | 结果 | 备注 |
|---|---|---|
| test-3d | **37/37 PASS** | 含新断言 rx≈19 / z-56 / tp-back 存在+pointer-events:none / .tp 不泄漏进大厅 / 揭晓环常驻 / 按钮 bottom≤vh-4 |
| test.cjs（FREE/TURN × LOCAL/MQTT） | **ALL PASS** | 抢麦/轮转/跳过/统计/离房全过 |
| test-sync / test-rejoin / test-host / test-fun | **全部 PASS** | 断网自愈、重连身份、主持门禁/点名/换题/免答/代跳、加倍/押注/限时/惊喜卡 |
| test-landscape | **86~87/88（跨运行抖动）** | 两条边缘断言失败项逐 run 不同；HEAD 基线同样 86~87/88 且**同两条、数值相同或更差**（见 P2-2/P2-3）→ 非本改造回归 |
| probe-3p-verify（5 视口 × 4 阶段） | **63/65** | 2 条 FAIL 均在 1024×768：工具栏可点（既有问题，HEAD 同样不达）＋揭晓躯干露出（**真问题，P1-1**） |
| probe-akai-9p / probe-tingting-mobile / probe-tingting-land | 全部 DONE，零 JS 错误 | 9 人阶梯座位/布局指纹/竖屏横屏四阶段走查 |
| probe-fp | **ALL PASS** | rx≈19 收敛、牌堆锚=环心+8% 偏置、我抽卡挂 tp-away 不飞克隆 |
| probe-pan | 3 跑 1 过 2 抖，失败项各不相同（一次「无跳变 Δ304.7>270」、一次「入屏无反向帧」）→ 无头环境帧拍噪声，非确定性回归；扫视的 join↔lobby 两屏不含任何本改动元素 |
| 自建 /tmp 探针（已弃） | 多端一致性 7/7；toast 顶部几何 3 视口 OK；押注面板时序 OK；HEAD 对照 2 组 | 见下文引用 |

---

## 二、发现清单

### P0
无。

### P1-1 stage-revealed 挂类闸在「打字机完成帧」，揭晓三件套迟到 2~4.5s，且与验收断言直接冲突

**现象（实测时间线，1024×768 六人局，/tmp 探针逐 500ms 采样）**：
- revealed 状态包到达 `+2.0s` → 卡面可见 `+3.0s` → 打字机进行中 `+3.5s` → **stage-revealed 挂类 `+4.1s`**（=打字机完成帧的 renderGameStatic）→ **背影 transform 过渡 `+4.8~5.1s` 才落定**。
- 即：翻牌 + 打字的 2~3.5s 里，**压缩（340→210）/压暗罩/短窗桌面 -100px 叠卡/背影俯身全部未生效**，之后三者与「已读完的答案」同帧一次性出现——短窗桌面卡面**瞬跳 -100px**（`.card-stage` 无 margin 过渡，已核实 L300），bet-box/工具行整体上蹿 100px。
- 抽卡者本人的背影是 **tp-away(-34px) → revealed(+110px) 双段运动**（挂类前 tp-away 在 drawing/revealed 全程生效）。
- transform 过渡启动还被揭晓庆典的主线程负载（burst 粒子/打字机 32ms 定时器/layoutRing）**再拖 0.5~1s**——实测挂类帧与过渡启动帧之间隔了 1~2 个采样周期。

**为什么是 P1 而不是 P2**：这不是状态机逻辑错误（类从不挂错屏、从不挂错阶段、锁语义正确，见 §三-a），但它让 **probe-3p-verify 的验收断言「揭晓背影躯干从题面卡下缘露出 ≥60px」在 1024×768 间歇性 FAIL**（实测 FAIL 样本 `tpB=706 cardB=743 tf=matrix(0.94,…,-34) cls=tp-back tp-away`：采样点落在挂类后、过渡启动前的窗口里，computed transform 仍是 tp-away 起点）——**实现时序与定稿验收标准（阿凯 §三3「人在画」）矛盾**，验收矩阵不再可重复通过。

**参数级修复（一行，推荐 A）**：
- **A（提前挂类，对齐验收意图）**：在 `playReveal()` 的 ③落定 setTimeout（`flip.style.transition = ''` 所在块，约 L3396-3400）加一句 `syncStageRevealed(true);`。挂类点从「打字机完成（约 +2.2~4.5s）」提前到「主翻落定（wait+640ms）」，与镀铬层淡入/扫光同拍——-100px 卡跳被同帧的 chrome 淡入与 flipGlint 掩盖，背影单段完成 -34→+110，且过渡启动先于 burst/打字机重负载。`renderGameStatic` revealed 分支现有调用保留（中途加入/重连/REDUCED 兜底；`syncStageRevealed` 幂等早退，双重调用无害）。红线复核：E1 的「压缩不插进推镜中途」指 drawing 期推镜，此修复不触碰（drawing 期仍无类）。
- **B（只修验收）**：保持实现，把 probe-3p-verify 该断言采样改为「挂类后 ≥2.5s」。不推荐——探针是定稿验收素材（不许改既有脚本），且 2~4.5s 的表现迟到本身是玩家可感的降质。

**复现**：`.pw/probe-3p-verify.cjs` 跑 1024×768 档，观察「揭晓背影躯干…≥60px」间歇 FAIL；或手测：六人局抽卡揭晓后盯桌面——压暗/让位比翻牌晚约 3 秒才发生。修复后重跑 probe-3p-verify（65/65 预期）+ test-3d。

### P2-1（既有，非回归）1024×768 choosing 工具行第二行溢出屏底 3~14px
实测新库 row bottom=782 / body scrollHeight=799 > 768；**HEAD 对照 rowB=779、scrollHeight=799，一字之差**——第一人称版本来就溢出，只是新验收探针开始量它才暴露。11 颗按钮折两行，第二行按钮中心 y≈753 尚在屏内可点（本次 probe 的 elementFromPoint FAIL 属阈边缘抖动，HEAD 同测同样挂）。
**修复指令**：把竖屏的单行横滚处理扩展到矮桌面——`@media (min-width:601px) and (max-height:820px) { #screen-game.active .tool-row { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; } }`；或工具行改 `margin-top: 12px` 并把 11 颗按钮里仅主持可见的 5 颗（结算/回大厅/点名/设置/修复同步）保持现状但 gap 10→6px。
**复现**：1024×768 开六人局到 choosing，读 `#game-tools` getBoundingClientRect().bottom。

### P2-2（既有+环境噪声）landui 844×390 工具行 scrollWidth 838 > clientWidth 820
`test-landscape` 的「工具栏内容不横向溢出」断言与该行自身的设计（`body.landui .tool-row { flex-wrap: nowrap !important; overflow-x: auto }`，L1059）矛盾——它本来就是横滚条；「退出房间可点」断言同 run PASS。HEAD 基线**同断言同数值失败**（sw:838 cw:820 一字不差）。
**修复指令**：二选一——a) 断言改为「末按钮可点 且 scrollWidth−clientWidth ≤ 视口宽 3%」；b) `body.landui .tool-row .btn { padding: 5px 4px }`（再挤出 ~22px 即可让 11 颗全 fit）。
**复现**：`node .pw/test-landscape.cjs`，看 844 game 段。

### P2-3（既有，新库略优）740 三人局「玩家卡不越出座次环 ≤24px 出血」超差
新库实测出血 25.8px（容差 24）；**HEAD 基线 28.5px 更差**——远弧公式（3 人两端点 π±GAP，ry=34）反而把最深的卡抬回了一点，但仍在容差外。属断言阈值与公式的常量失配，非交互/逻辑问题。
**修复指令**：二选一——a) `layoutRing` 窄环 ry 34→33（L3966，把最深 --ry 从 69.8% 收到 69.2%）；b) 断言容差 24→30px（与设计「毡面下沿探到我的座位脚下」的出血语义对齐）。
**复现**：`node .pw/test-landscape.cjs`，看 740 三人局段。

### P2-4 定稿参数/注释与实现偏差（逐条核对 design-plan-3p.md 的记录，均无逻辑影响）
1. **tp-back 的 `--voice` 是死代码**：`paintVoice`/`resetVoice` 写入（L5080/L5090），但全表无任何 CSS 消费（`var(--voice` 仅用于 .player-card/.mic-meter）——定稿「说话：halo opacity 随 --voice」未实现，说话只有二值绿 halo + sway。修复：补一行 `.tp-back.speaking::after { opacity: calc(0.3 + var(--voice, 0) * 0.5); }`，或删掉两处写入并改定稿记录。
2. **「麦克风态看名牌绿光」无对应 CSS**：`.tp .mic-badge{display:none}` 隐藏自席 🎤 后，没有 `.player-card.tp.mic-on .player-name` 兜底规则——自己开麦时座位上无指示（自席语义由工具栏按钮 .live 态兜底，他人卡正常显示徽章，故不算功能丢失）。修复：`.players-grid.ring3d .player-card.tp.mic-on .player-name { border-color: rgba(74,222,128,.6); }`。
3. 注释级：layoutRing L3981「rs 差 0.37」实际 0.21（1.13−0.92，test-3d 的 ≥0.15 断言仍过）；L3976 注释 |sinθ|≥0.9 而代码阈值 0.8（L3992）；LADX 窄屏实现 26（定稿表写 30，probe-akai-9p 实测无叠卡）。改注释或在定稿表补一行「实施偏差」即可。

### P2-5 抽卡者本人屏幕上，自己座卡头顶气泡「🎴 去抽卡…」浮在隐形座位上
`.tp` 只挂在自己客户端的 me 卡（L2610），该卡 avatar 已 `visibility:hidden`，而 `.away` 触发的 `.chr-status` 气泡照常 display:block（L794）→ 本人视角：气泡悬空在空座位上方，仅名牌压暗+背影 tp-away 承担语义；**他人视角完全正常**（别人的屏幕上这张卡没有 .tp）。
**修复指令（安全、恰好只影响自己端）**：加 `.players-grid.ring3d .player-card.tp.away .chr-status { display: none; }`。
**复现**：轮到自己抽卡，看自己座位的名字上方。

### P2-6 边界人数：n≥12 且窄环时阶梯不分离（MAX_PLAYERS=16 的远端边界）
`LADDER` 对 row≥1 统一 `-LADX` + rs×0.85：n=12 时同侧候选 3 行，row1/row2 得到相同内移量，窄环（grid<620）下 sin 间距 ~26px < 卡宽，理论上叠脸。9-10 人（LADDER 起步区）实测零叠（probe-akai-9p 座位表两两间距 113~177px）。现实房间极少触达，不阻塞。
**修复指令**：把内移量改按行递增——`xShifts[i] = (row === 0 ? 1 : -(row)) * side * LADX / gw * 100;`，或窄环把 LADDER 阈值提到 n≥12。
**复现**：390 宽窄环构造 12 人局（本地模式批量开页）。

---

## 三、重点核查逐项结论（业务维度）

**a) 回合状态机 —— 逻辑零破坏，唯一问题是 P1-1 的表现时序。**
全路径走读+实测：
- choosing→drawing：`syncStageRevealed(false)` 在 drawing 分支且位于 `if (cardDealt) return` **之后**——cardDealt=true 时（揭晓兜底迟到 9s 内）早退不碰类，类保持 off，正确；dealFlyingCard 的「隐藏测量-恢复」是同帧同步操作（L3267-3270），不触发渲染、不挂类，`:has` 时代的两宗罪确实都被规避。
- drawing→revealed：turnChanged 先上 `revealAnim=true` 锁 → renderGameStatic revealed 分支**先锁检后挂类**（L2880-2881），翻牌/打字期间类保持 off；打字机完成帧 revealAnim=false + renderGameStatic → 挂类。类挂上后 `syncStageRevealed` 幂等早退（L2819），**心跳/重渲染既不会摘错也不会反复重锚 layoutRing**（/tmp 探针强制双跑 renderScreen + 5s 采样验证，类稳定）。
- revealed→choosing（交接）：choosing 分支摘类（probe「交接后 !stageCls」PASS）；runStage('choosing') 开头重置 revealAnim/cardDealt（L3169），打字机被 clearStageTimers 掐断也不会留脏锁。
- 中途加入/重连：firstApply → renderStageStatic → renderGameStatic（revealAnim 恒 false）→ revealed 场景直接带类呈现，flip-card transition 压制不重播（test-rejoin PASS）。
- 换一题（reroll，seq+1 同阶段）：类保持 on 不闪；加倍/免答/代跳/点名路径与类无耦合。
- 挂类触发的 layoutRing 用 offset 布局值（非投影 rect），resize/orientchange 有 `layoutRing` 兜底（L5841），类 on 时的 210px 高度下重锚正确。

**b) 多端一致性 —— 一致。** tp-forward/tp-away/身份色全部由各端从同一 S 推导（chooserId 状态机保证 turn 模式 choosing 期 chooserId 恒有值，free 模式 choosing 期 null → 不前倾，正确）。/tmp 双端探针实测：A 看 B 抽卡＝B 卡 `.away` 变暗 + 克隆飞行；B 自己＝tp-back 挂 tp-away、**无克隆**（flyAvatarToDeck 的 myId 早退，无双我）；三端 revealed 全部挂类；`applyChrColors(tp, myId)` chrHue 确定性同色。

**c) 计分与权限 —— 零破坏。** 押注（bet-box 在 #screen-game 流内、#cam 的 perspective 独立堆叠上下文之外，不受座卡 z 序影响；revealAnim 闸保持；/tmp 实测 chooser 之外第三端 3s 时按钮可见可点）、加倍（stake-row 在 choice-section，z40）、免答牌（test-host 覆盖 PASS）、代跳（ghost-bar 已收进 z40 列表，drawing 期隐藏逻辑未动）、换一题/随机点名（hostPickPlayer 走 data-pid+click 委托，.tp 自卡可点但有 `pid===myId` 幂等 toast；pickable 视觉类排除自己）。所有计分常量/结算函数（settleBets/closeTurn）零改动。

**d) 边界人数 —— 满足既有断言。** n=2 特例 a≡0：test-3d「rs 差≥0.15」PASS（实际 0.21）；n=3 远弧两端点、9-10 人阶梯：probe-akai-9p 座位表 pairwise 零叠、阶梯 rs 0.719/0.814/0.895 分层正确；远座卡宽 60-81px ≥ 64px@桌面档；「脸+名牌不叠」由 probe-3p-verify 四视口 PASS 背书。遗留 P2-6（n≥12 窄环）。

**e) 移动端关键路径 —— 达标。** 竖屏揭晓「完成啦」≤vh（probe PASS，实测 btn bottom 594/844）；横屏工具栏 bottom 369≤390 且不侵右栏；toast 挂顶后三视口实测 top=12、与 react-fab（top46 右缘）零交、fab 中心 elementFromPoint 命中；toast max-width 294px@390 与 dock（左缘 338）不相交；modal-mask z1500 < toast z2000 为改动前既有关系未恶化。390×844 揭晓推镜落位后工具行下部出画 ~105px——HEAD 对照同场景**卡面自身被裁 81px、工具行出画 400px**，新库显著更优，判改进而非回归。

**f) 老功能回归面 —— 干净。** REDUCED（test-3d 全过；`.tp-inner/::after` animation none、tp-back transition none、tp-forward 静态终态保留）、loperf（同级 CSS 降级落齐）、landforce（--lvw 逻辑宽系未动，test-landscape 结构性断言全过）、rejoin（test-rejoin PASS）、换屏扫视（probe-pan 抖动为无头帧拍噪声，pan 的两面 join/lobby 不含任何本改动元素）。

---

## 四、总判定

**【修复后可合入】**

理由：玩法与业务逻辑（回合状态机锁语义、计分/押注/加倍/免答/代跳/换题/点名、掉线代跳、轮次诚实、重连重渲染）**零破坏**，多端状态推导一致，既有测试全绿；唯一 P1 是揭晓三件套的**挂类时机**（表现时序，非逻辑错挂），一行参数级修复（playReveal ③落定帧补 `syncStageRevealed(true)`）即可让验收矩阵回到可重复通过，修复后重跑 probe-3p-verify + test-3d 确认 65/65、37/37。P2 六项均为既有边缘/文档偏差/远端边界，可随后续小任务清偿（其中 P2-5 建议随本次一并带上，一行 CSS）。
