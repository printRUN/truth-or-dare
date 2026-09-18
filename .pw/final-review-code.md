# 合入前终审 · 第三人称牌桌改造（代码维度）

评审人：代码检查官（终审）。基线：工作区未提交 diff（index.html +296 行、test-3d.cjs、probe-fp.cjs），依据 = design-plan-3p.md（TP-Table v3 定稿）+ 三份专家评审 + SPEC.md §2。
方法：只读 index.html 与 .pw 测试脚本，**未改任何被测文件**；除静态逐行核对（diff、选择器特异度、绘制顺序、JS 锁交互）外，用 Playwright 内联脚本对 390×844 / 844×390 / 1280×800 三档做了背影 rect 与 scrollHeight 实测，并本机复跑了全部门禁。

> ⚠ 前提修正：**「probe-3p-verify 63 断言已全绿」本次复测不成立。** 本机实跑两次：整跑 61/63（FAIL：1440×900 躯干露出、390×844 对手遮挡），单跑 390×844 又换成另两条 FAIL（scrollHeight=881、工具栏按钮 bottom=864）。失败集随轮次漂移 = 概率绿（见 P1-2），该读数不能作为合入依据。

---

## P0（必须修才能合入）

### P0-1 揭晓态背影在竖屏完全出画、横屏只剩 20px，且把竖屏文档撑出 245px 滚动

- 位置：`index.html:859` `#screen-game.stage-revealed #tp-back { transform: translateX(-50%) translateY(110px) scale(0.85); }` —— 该规则**未按视口分档**。110px 下沉量是按桌面 300px 高的背影调的；竖屏背影高 168px 且 `bottom:-145px`（:862）、横屏高 112px 且 `bottom:-16px`（:866），再沉 110px×0.85≈93.5px 后整个元素被推到视口下缘之外。
- 实测（本机 Playwright，6 人本地局）：

| 视口 | 阶段 | tp-back 可见高度 | scrollHeight |
|---|---|---|---|
| 390×844 | choosing | 188px（top=651, bottom=839） | 844 ✓ |
| 390×844 | **revealed** | **0px（top=911）** | **1089（超 245px）** |
| 844×390 | **revealed** | **20px** | — |
| 1280×800 | revealed | 197px（但 tpBottom=838 > 800，桌面也溢出 38px） | — |

- 截图佐证：`3p-verify-390x844-revealed.png`、`3p-verify-844x390-revealed.png` 中背影完全不可见；`3p-verify-1280x800-revealed.png` 中仅剩头顶绿晕。
- 违反的红线：阿凯 A-2「背影全程在画」【必须】、定稿 z 序节的「背影恒亮，符合『我离镜头最近』」、婷婷 T-1「四阶段 scrollHeight ≤ 844」独立硬验收（transform 溢出计入滚动区，body 只有 overflow-x:hidden），以及 :858 自家注释「躯干从题面卡下缘露出（人在画）」——该注释在竖屏/横屏为假。
- 未被测试逮住的原因（正是 probe 断言语义缺口）：probe-3p-verify 的「背影在视口内」只在 choosing 快照断言（:92），revealed 档对 vw≤600/landui 只断言 `!!tp` 存在（:144），不查可见高度与 scrollHeight。
- **修复指令（参数级）**——把 :859 按档分流；scale 以 `transform-origin:50% 100%`（:809 已有）收缩，底缘不动、不新增滚动：
  ```css
  /* :859 改为 ↓ */
  @media (min-width: 601px) {
    body:not(.landui) #screen-game.stage-revealed #tp-back { transform: translateX(-50%) translateY(110px) scale(0.85); }
  }
  @media (max-width: 600px) {
    #screen-game.stage-revealed #tp-back { transform: translateX(-50%) scale(0.94); }  /* 不下沉：底缘已贴屏，任何正 translateY 都会出画+撑滚动 */
  }
  body.landui #screen-game.stage-revealed #tp-back { transform: translateX(-50%) scale(0.94); }
  ```
  **必须与 P1-1 同批修**：竖屏不下沉后，背影（651–839）会与底部押注条（≈810–844）重叠，若不先把押注条/工具栏抬进 z40 浮层层（见 P1-1），暗色背影会画在按钮之上。
- 修复后验收：probe 五档 revealed 快照新增两条断言并三遍全绿——`min(tp.b,vh) − max(tp.y,0) ≥ 40`（竖屏/横屏档）；`scrollHeight ≤ vh+2`（choosing/drawing/revealed/交接四阶段各查一次，现在只查 choosing）。

---

## P1（合入前修）

### P1-1 浮层 z40 规则里 `#cam > .tool-row` 是死选择器，`.bet-box` 完全没进浮层层级

- 位置：`index.html:728`。实际 DOM（:1441、:1438）中 `#bet-box` 与 `#game-tools`（.tool-row）是 **#screen-game 的子元素、#cam 的兄弟**，`#cam > .tool-row` 永远匹配不上；bet-box 则两条都不沾。
- 后果：#cam 有 `perspective:900px`（:706）→ 自成堆叠上下文，作为 position:relative 的兄弟整体画在**静态兄弟 .tool-row/.bet-box 之后**（CSS 绘制顺序第 8 步 > 第 3/4 步）。即注释宣称的「浮层 z40 > 背影 z35」对这两者**不成立**：背影实际画在工具栏/押注条之上（竖屏 choosing 背影与工具栏重叠区已是暗上画暗，未暴露；一旦按 P0-1 让背影在揭晓态保持可见，就会直接盖住押注按钮的视觉）。点击不受影响（tp-back pointer-events:none），但「按钮画在上层」的层序契约是破的。
- **修复指令**：:728 删去 `#cam > .tool-row` 臂，追加一条兄弟选择器规则（z40 与选卡/题面同层）：
  ```css
  #screen-game > .tool-row, #screen-game > .bet-box { position: relative; z-index: 40; }
  ```
  修完用 elementFromPoint + 截图复核竖屏 revealed 押注条、工具栏压在背影之上。

### P1-2 probe-3p-verify 门禁是概率绿，且两处断言语义缺口正好放走了 P0-1

- 实测漂移：整跑 FAIL {1440×900 躯干露出, 390×844 对手遮挡}；单跑 390×844 FAIL {scrollHeight=881, 工具栏按钮 bottom=864 且 4 颗 hit:false}。两个根因都在测试侧（不许改 index.html，修 probe）：
  1. **字体未 stub**：probe-3p-verify 没有 test-3d.cjs:56-57 的 Google Fonts route stub，ZCOOL KuaiLe/Noto Sans 是否加载会改变竖屏 844 红线处的行高与折行（844 vs 881 的漂移来源）。→ 照抄 test-3d 的两条 `p.route(...)` 到 `openPage`/建页处。
  2. **Cam.jump 后没等收敛就量 rect**：FAIL 详情里 `world rotateX=19.83deg`（未到 19.00）——runStage 挂的 nudge 定时器在 snapshot 的 120ms 固定等待后又拉起运镜，SPEC §2 明告「rect 在运镜中会被动画扭曲」，那次「对手遮挡」FAIL 是量运镜量出来的假阳性。→ snapshot() 的 `Cam.jump` 后改 `await p.waitForFunction(() => Math.abs(Cam.cur.rx - 19) < 0.1, null, {timeout: 3000})`，删掉裸 sleep(120)。
  3. **断言缺口**：revealed/交接快照补「背影可见高度 ≥40px」与「scrollHeight ≤ vh+2」（见 P0-1 验收）；「躯干露出 ≥60px」在 1440×900 正好骑在阈值上（整跑 FAIL、单跑 PASS），给阈值 ±8px 余量或把下沉量钉死后再取整数阈值。
- 修复后以「三遍连续全绿」作为门禁读数；在此之前任何「已全绿」表述不采信。

---

## P2（记录在案，后续修；不挡合入）

1. **tp-slam 会被 speaking 压掉（源顺序）**：`.tp-back.tp-slam .tp-inner`（:823）与 `.tp-back.speaking .tp-inner`（:852）同特异度 (0,3,0)，后者在后 → 我边开麦说话边选卡时，slam 动画整段不播。修：把 :823 规则移到 :853 之后，或改成 `#tp-back.tp-slam .tp-inner` 借 id 提特异度。
2. **`--voice` 死变量**：paintVoice/resetVoice（:5079-5083/:5086-5090）往 tp-back 写 `--voice`，但没有任何 CSS 消费它（`.tp-back::after` opacity 恒 0.22，`.speaking::after` 只换背景色，:816-820）——说话强弱不反映在氛灯上，违背定稿「halo opacity 随 --voice」。修：补 `.tp-back.speaking::after { opacity: calc(0.3 + var(--voice, 0) * 0.5); }`，或删掉两处 JS 写入（二选一，不留悬空）。
3. **toast 的 `max()/env()` 无老内核回退**：:27-30 删掉了旧 `bottom:24px`，若 `top: max(12px, env(...))` 整条声明被老 WebView 丢弃（Chromium<79 不解析 max()），toast 会掉回 DOM 静态位置（页尾）。修：在 max() 行前补一行 `top: 12px;` 作级联回退。
4. **桌面揭晓底部 38px 溢出**：1280×800 revealed tpBottom=838 > 800，页面短暂可滚。修（二选一）：下沉量 110→70px；或 `#screen-game { overflow-y: clip; }`（与既有 overflow-x:clip 同族手法）。随 P0-1 的 probe 新断言（桌面档也查 scrollHeight）一并锁住。
5. **layoutRing 与定稿表的参数偏差备案**（实现自有理由，建议回写定稿表而非改代码）：窄环 ry 30→34（:3968，定稿无出处）；LADX 窄屏 26 vs 定稿 30（:3972）；桌心近侧偏移取 `h×0.08`（:4018）而非 Eng D1 给的二选一（不补偿 / 0.06），理由是 n=2 时牌堆不被对手卡压住——理由成立但需记录。阶梯 gate 0.8（:3974）与 Eng B2 的 0.9 不同但**0.8 才是对的**：n=9 第二排侧座 |sinθ|=0.874，用 0.9 阶梯抓不到整对、退回 60px 中心距——应回写定稿。另：n≥11 每侧出现第三排时（rs×0.85、同向 −LADX），第二/三排之间无新增分离，当前无测试覆盖，备案待 9+ 人局实测。
6. **9 人局红线无自动门**：probe-akai-9p.cjs 是纯取证脚本（0 个 check 断言），probe-3p-verify 只跑 6 人局——定稿验收 2 的「9 人局 pairwise 零交 + 布局指纹稳定」目前没有任何自动化锁。建议把 probe-3p-verify 的 pairwise 检查以 9 人参数移植（或给 akai probe 补 check）。
7. **注释/断言可读性四则**：:744-745「婷婷 ≥64px@桌面」引用的是玩家评审 A-5 明示否决的偷换数（定稿=1440 桌面**卡宽 ≥70px**；婷婷的数只管 390 竖屏头像 ≥40px，probe :114 也写成 64px，两处应按定稿改回 70px 卡宽口径并注明 66px 是头像投影）；:805「座次卡(20-30)」实为 10-30（`20+round(front×10)`，n=2 对手=10）；:856「背影同 步收一档」多一个空格；test-3d.cjs:267 的「合法起点」表达式绕了三层且末尾 `|| Math.abs(pre.z+56)<1` 是冗余臂，等价于 `|z+56|<1 || |z+76|<1`，建议改写为直白式（现写法易被下一位维护者当成恒真哑炮）。
8. **REDUCED/loperf 退路无断言锁**：CSS 退路矩阵本体齐全（见下「核对通过项」），但 test-3d 的 REDUCED 段没有断言 `.tp-inner { animation: none }` / `.tp-back { transition: none }`；补一条防将来回退。
9. **按钮判据口径**：test-3d.cjs:316 与 probe-3p-verify:152 用 `≤ innerHeight − 4`，定稿/Eng C3 是 `≤ innerHeight − 8`。统一到 −8。
10. **SPEC.md §2 必须随本 PR 同步改写**：74°（:15）、机位 z−24/rx8（:21、:72）、纵深 ±0.16（:18）、牌堆 scale 0.72（:19）、`:has` 收起座次环与 268 压档（:124-125）均已被本次改造作废。SPEC 是自家红线的权威记载，不同步的下一次改造就会把 62°/z−56/stage-revealed 当 bug「修回去」。

---

## 核对通过项（逐条查过，无需动作）

- **SPEC 红线**：`.world` preserve-3d 未触碰（test-3d transformStyle=flat + elementFromPoint 锁复跑通过）；toast/burst/react-bar/modal 仍在 #app 外，tp-back 是流内元素无 fixed 包含块问题；新 keyframes 仅 tp-slam/tp-sway，全 transform/opacity 路径；毡面/压暗罩纯静态单绘制层，无 filter/blur/活渐变（`.away .avatar-ring` 的 saturate 为既有代码，未扩大）。
- **REDUCED + body.loperf 退路矩阵（Eng F1 清单逐项）**：呼吸/sway/拍桌/氛灯脉动 `animation:none`（:899-909，!important 双写）、tp-back `transition:none`（前倾=transition 驱动，退化为瞬移但**静态前倾终态保留**，符合视觉 e-6 裁定）、away 瞬移；`body.paused *`（:973）覆盖 .tp-inner 实元素动画。
- **z 序主链**：`#cam > :not(...)` (1,2,0) < `#cam > #tp-back` (2,0,0)=35 < 浮层 (2,0,0)=40——实施不加 `:not(#tp-back)` 而以 (2,0,0) 直接压过，注释记载的实施教训成立（勿回退，:722-723）；压暗罩 z5 在 ring 上下文内、罩不住恒亮背影 ✓；landui ring 高规则 (1,3,1) > stage-revealed (1,3,0)，横屏揭晓环高不被 210px 误伤（实测 landui revealed toolBottom=380 ≤ 390，T-2 达标）✓；媒体档 600/601 无缝无叠，601+920 两块均带 `body:not(.landui)` ✓。
- **!important**：仅 tool-row flex-wrap / game-tools margin-top 两处，对应 DOM 内联样式（:1438），确属必要（landui :1059 同款属既有模式）。
- **layoutRing 数学逐字符核对（Eng B1/B2/B3）**：n≥3 `a=PI+GAP+k(2π−2GAP)/(n−2)`（k=rel−1, 0..n−2）与定稿公式一致；n=2 特例 a≡0；实机验证 rs 1.13/0.92（差 0.21 ≥ 0.15）、zIndex 30/10；GAP 0.65/0.95 分档 ✓；n=9 阶梯 ∓38px（gw 百分比换算自洽）、近座外移/远座内移+rs×0.85、front 排序比较子方向正确 ✓。
- **JS 锁与时机**：syncStageRevealed 三处调用全在 revealAnim/cardDealt 锁检查之后；类无变化时 early-return 幂等；挂/摘同 tick layoutRing（height 无 transition，:873 注释与实现一致）；playReveal 路径由打字机完成回调 `renderGameStatic()` 补挂（锁内不动类，符合 Eng E1）；REDUCED 分支 `revealAnim=false; renderGameStatic()` 同样覆盖 ✓。
- **flyAvatarToDeck**：`pid===myId` 早退位于 resolveAvatar 之前（:3227），三条 stageTimers 零耦合，他人端照常飞克隆、表现一致性由全端同挂的 .away 保证 ✓。
- **tp-slam 的 setTimeout**：一次性 450ms 自清，choose() 同步 `setChoiceEnabled(false)` 防重入，remove→reflow→add 防叠——无泄漏、无重复触发（仅 P2-1 的 speaking 压制问题）。
- **paintVoice/resetVoice 对 tp-back 的同步**：pid===myId 判定正确、S 空保护、resetVoice 对称摘除（--voice 死变量另见 P2-2）。
- **死代码清扫**：`:has(` 全站无选择器残留（仅 :870 注释警示）；`74deg` 无残留；landui toast 特例（旧 :1042-1043）已收编进全局顶部规则，隐藏态 y 翻号 −140px ✓；旧 `#choice-section… z2` 规则已删。
- **测试真实性**：test-3d 新断言全部在测实现（rs 差 ≥0.15 能逮 n−1 除法回归；`|z+56|>5` 前置 +256 前校验非恒真；lobby 无 .tp 泄漏；stage-revealed+ringW>50 旧 display:none 命中档回归锁）；probe-fp 的 tp-away 双分支、8% 桌心偏移断言与实现对账 ✓。
- **本机门禁复跑**：check-syntax ✅；test-3d 37/37 ✅；probe-fp 全绿 ✅；probe-3p-verify 61/63（见 P1-2）。

---

## 总判定：【修复后可合入】

- **P0-1**（揭晓态背影竖屏出画 + 竖屏滚动 245px）触碰两条 persona 的【必须】红线，必修；修法为一处 CSS 分流 + 与 P1-1 同批。
- **P1-1 / P1-2** 与 P0 同批完成：z40 死选择器补上兄弟选择器规则；probe 稳定化（字体 stub + 运镜收敛等待 + revealed 可见性/滚动断言）后**三遍连续全绿**作为门禁读数。
- P2 十条不挡合入，其中 P2-10（SPEC §2 同步改写）强烈建议随同一 PR 提交。
- 除上述外，实施对三份专家评审的 20+ 条修订指令（E1 弃 :has、E2 三件套、E3 height 无 transition、E4 静态罩层、F1 退路矩阵、G1 toast 翻号、视觉 a/c/e/f 参数块、B1 公式、C1/C3 机位与断言）落实验证为实，工程质量整体扎实。
