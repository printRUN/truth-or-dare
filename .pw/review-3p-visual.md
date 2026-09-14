# 视觉终审 · TP-Table 定稿 v3（评审人：视觉挑刺专家）

只审「改完后的画面是否成立」：构图、比例、层次、色彩、动效语言、「第三人称骗子酒馆味」。
基准：5 张现状截图已逐张看过（desktop choosing/revealed、mobile choosing、9 人局、tt-land）；
视觉语法依据：SPEC §2 Color Palette / Animation System、index.html 697-820（毡面/光池/名牌/chr-body）。
全站语法一句话：**深色填充永远配一道细亮缘 + 一处身份色**（table3d 的 2px 白 .06 环、毡面的 inset 3px 紫 .16 缘、chr-body 的 chr1→chr2 渐变 + inset 影、名牌胶囊 1px 紫缘）——没有任何一个元素是「无缘的黑影」。这是下面 a 条全部判定的标尺。

---

## a) 背影造型：定稿完全没写「表面处理」，照稿实施必成一团黑影【有条件通过（参数块必改）】

**判定依据（算过数）**：--bg = #0a0a1a；毡面最暗径向停点 rgba(17,9,38,.88)/rgba(12,7,28,.7)；揭晓压暗罩还是 rgba(10,10,26,.45)。背影「椅背+肩背」若按骗子酒馆直觉做成暗色剪影，与这三层背景的 RGB 差只有 2~8，**在星空底上不可见**；而 chr1 是 hsl(h,66%,60%)——直接铺满 300px 高的背影又会亮过整个中景（现有 chr-body 只是 46×17 的小点缀）。结论：背影必须是「**逆光剪影**」——身份色压暗做体、细亮缘做形、氛灯做魂。这也顺带解决 f 条的色相冲突（压暗后即使 chrHue 与头像发色不符也不刺眼）。

**参数级修订指令（可直接落 CSS；#tp-back 基准 transform: translateX(-50%)，底贴屏底）**：

```css
/* 1. 椅背：最底层，比肩宽 +8% 两侧探出、顶缘高于肩线——两侧探出 8% 才读作「椅背」，不探出就是一坨光晕 */
.tp-chair { position:absolute; left:50%; bottom:6%; width:116%; height:64%; transform:translateX(-50%);
  border-radius:18px 18px 0 0 / 28px 28px 0 0;
  background:linear-gradient(180deg, rgba(76,29,149,.50), rgba(30,12,64,.88) 62%);   /* 紫-900 族，禁纯黑 */
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 1px rgba(167,139,250,.22); } /* 椅顶 1px 缘光 */
/* 2. 肩背：chrHue 压暗 40-66%——用叠 var(--bg) 半透明层实现，禁 filter（Eng E4 同理） */
.tp-shoulder { position:absolute; left:50%; bottom:0; width:100%; height:56%; transform:translateX(-50%);
  border-radius:50% 50% 0 0 / 92% 92% 0 0;
  background:
    linear-gradient(180deg, rgba(10,10,26,.42), rgba(10,10,26,.66) 78%),
    linear-gradient(180deg, var(--chr1), var(--chr2) 64%);
  box-shadow:inset 0 2px 1px rgba(255,255,255,.18),   /* 肩线 1px 主轮廓光——这条是「黑影 vs 人」的分界 */
             inset 0 -14px 26px rgba(10,10,26,.55),
             0 0 0 1px rgba(255,255,255,.10); }
/* 3. 后脑勺：宽屏 30% / 竖屏 26% 头身比（骗子酒馆的大头比例）；老内核禁 aspect-ratio，用 % 高 */
.tp-head { position:absolute; left:50%; bottom:44%; width:30%; height:28%; transform:translateX(-50%);
  border-radius:50%;
  background:
    linear-gradient(205deg, rgba(10,10,26,.30), rgba(10,10,26,.55) 70%),
    linear-gradient(200deg, var(--chr1) 12%, var(--chr2) 80%);
  box-shadow:inset 0 2px 2px rgba(255,255,255,.20), 0 0 0 1px rgba(255,255,255,.12); }
/* 4. 接地影：贴屏底一道接触影，防「人形贴片浮空」；占 ::before（::after 留给方案已有的氛灯/说话 halo） */
#tp-back::before { content:''; position:absolute; left:50%; bottom:-10px; width:130%; height:22px;
  transform:translateX(-50%); border-radius:50%;
  background:radial-gradient(ellipse, rgba(0,0,0,.6), transparent 68%); }
```

- 明度层级定死（骗子酒馆的 noir 桌灯逻辑）：**UI 玻璃卡（最亮）> 对面头像脸 > 我的缘光/氛灯 > 背影体色（最暗的可读物）> 毡面 > 压暗罩**。背影是「被桌灯从前面打亮的逆光者」，亮在全站认得的细缘上。
- 氛灯复用 me 的青色语言（index.html:761-762 的 me 名牌/chr-body 就是 rgba(34,211,238,…)），说话覆写绿 rgba(74,222,128,.35)、opacity calc(.25 + var(--voice,0)*.6)——与方案「paintVoice 写 #tp-back」啮合。
- REDUCED/loperf：以上全是静态单绘制层（无 blur/无 filter/无活渐变），天然便宜，无需额外退路； breathed 的只有既定 keyframes。

**风险**：实现者最可能把椅背画成比肩窄（读成斗篷）或把压暗层忘掉（chr1 原亮度直出，背影变成全场最亮的紫块，中景全灭）。验收截图按「眯眼看：能认出椅子和肩膀两条轮廓」为准。

---

## b) 构图叠层：三层秩序成立，但两处 z 序会被现有全局规则吃掉 + 揭晓态卡会压到头上【有条件通过】

**成立的部分**：压暗罩（ring ::after，z5，罩环内）+ 座次卡 opacity 压暗 + 背影在环盒外恒亮 + 题面卡 z40 压在暗桌之上——「暗下去的桌面、亮着的我、浮在桌面的题」正是骗子酒馆过肩镜头的语法；背影恒亮同时是「我离镜头最近」的深度锚。负 margin 叠加本体我也批：玻璃卡 + 落地影浮在场景上是全站既有语法（toast、押注盒都这么浮），「卡浮在人身上」只在**卡的下缘切进头景**时才成立——按当前数它会切进去（见修订 2）。

**参数级修订指令**：

1. **（必改，否则全盘层序倒置）** index.html:713 `#cam > :not(.table3d):not(.table-deck) { position:relative; z-index:2 }` 的特异度是 (1,2,0)，**压过 `#tp-back { z-index:35 }` 的 (1,0,0)**，且会把 absolute 锚定改回 relative。必须扩成 `#cam > :not(.table3d):not(.table-deck):not(#tp-back)`。同理 727 行 `#choice-section, #deck-section, #card-section, #ghost-bar, .pick-tip { z-index:2 }` 必须同步提到 **40**——不提，选卡/题面卡（z2）全压在背影（z35）之下，「我的头盖住真心话/大冒险按钮」，画面与交互双崩。这条请工程评审复核补进 E1 落地清单。
2. **揭晓态背影收一档**（治「卡浮在人身上」）：短窗桌面负 margin −100px 后，卡底在 1280×800 落在 y≈643，而 300px 背影头顶在 y≈500——卡的下缘切进头部 ~140px。修订：
   ```css
   #screen-game.stage-revealed #tp-back { transform:translateX(-50%) scale(.9); transform-origin:50% 100%;
     transition:transform .45s cubic-bezier(0.22,0.61,0.36,1); }   /* 顺带读作「我靠回椅背看牌」 */
   ```
   300→270 后头顶 y≈530，卡底只擦到肩线以上 ≤20px；再给题面卡一道「抬离」落地影，叠进 .flip-card 既有 box-shadow：`0 24px 56px rgba(0,0,0,.5)`。加断言：三档桌面 probe（1440×900/1280×800/1024×768）revealed 态 `card-stage rect ∩ tp-back 顶部 42% rect = ∅`（42% = 头+颈区）。
3. **竖屏选择卡夹头**（必改）：390×844 choosing，双选卡 y≈545-705、各宽 150，中缝仅 ~20-30px；背影 ≤185px 高、头顶 y≈659、头宽 ~52px——**头被左右两张卡的内缘各切一刀，只露 20px 一条**。修订：
   ```css
   @media (max-width:600px) { #tp-back { bottom:-34px; }   /* 头顶降至 y≈693，只擦卡底 12px；肩没入卡后=手机镜头更近，对味 */
     .tp-head { width:26%; height:24%; } }
   ```
   bottom −34px 后 rect.top≈693 ≥ 640 断言线，无冲突；tp-back pointer-events:none 已定，不碰触摸。
4. 压暗罩 z5 压在毡面上、座次卡 20-30 在罩上靠 opacity .8 变暗——三套变暗机制（罩/透明度/恒亮）视觉上要读成同一档「熄灯」，参数见 f 条。

**风险**：负 margin 是 flex 栈整体上移，1024×768 揭晓栈底可能溢出 ~40-65px（工程 E2 的 probe 负责，视觉上表现为出现滚动条毁掉构图——probe 红线必须真跑）。

---

## c) 毡面 210%/top56% + rx19 + 牌堆 0.8：进深成立，缺一道「近沿收边」【有条件通过】

**成立的部分（算过）**：毡面椭圆 ry/rx ≈ 26/46 → 隐含倾角 ≈34°，牌堆 rotateX16°+世界 19°=35°——**两个「桌平面」的伪装角度几乎精确一致**，这就是基线截图桌面可信的原因；改机位后两者同受 rx19 前缩，一致性保持。牌堆 0.8 + 毡面中心下移 14px = 牌堆略近镜头略大 = 「桌心偏后」读法正确。毡面下沿弧线恰好穿过竖屏选择卡背后，读作「按钮立在桌沿」，是加分的。

**问题**：210%/top56% 后毡面椭圆上探至环顶上方 ~49%（桌面档 ≈117px，竖屏 ≈118px），淡出缘扫过标题/状态条背后；下沿以 alpha→0 软消失伸进工具行区——整张桌子没有一条可读的「终结边」，在 UI 区里读成「一片紫雾」而不是「一块桌面」。现有 inset 3px 缘光 (.16) 太弱。

**参数级修订指令**（替换 index.html:739 的 box-shadow 四元组，其余不动）：

```css
.players-grid.ring3d::before { box-shadow:
  inset 0 0 0 3px rgba(196,181,253,.22),      /* 全缘提亮一档：紫-300，远沿+近沿同时可读，椭圆=桌界 */
  inset 0 -16px 32px rgba(139,92,246,.12),    /* 新增：贴近沿一道内反光，「桌灯照到的近角」 */
  inset 0 0 60px rgba(0,0,0,.5),
  0 18px 44px rgba(0,0,0,.45); }
```

- 牌堆 0.8 + 静态 opacity ≥.92 照 Eng D1 落，无视觉异议（0.72→0.8 的增重方向正确）。
- 毡面上探进 HUD 区：alpha 极值处近 0，标题/turn-info 自带 G2 的 text-shadow，可读性够；验收截图确认「标题背后只是一层雾、不是一条硬边」即可，无需再改。

**风险**：别顺手把 inset 3px 提到 .3 以上——缘光比名牌胶囊的 1px 紫缘 (.35) 还亮就会喧宾夺主。loperf 拍平后毡面变正圆贴图，缘光仍在，无回归面。

---

## d) 机位 z-56/rx19 与 result z-80/rx11：比例关系成立【通过】

- 对面缩 6-8% + 我占屏宽 ~21%/高 ~33%：最大物体 + 恒亮 + 底部锚定 + 唯一持续动效体，四重信号都指「我最近」，成立。对面是亮色圆脸、我是暗色背影——视线天然先去对面的脸（看反应），正合品类；「这是我」由氛灯+名牌+（f 条的「你」章）承担，不靠面积。
- result z-80/rx11：后撤 24px + 俯角 19°→11°（机位抬平）+ 环已无——「从桌边靠回去看结果」的节拍成立，批准原参数。背影随 game 屏 DOM 消失，被 0.64s 换屏滑遮住，不需要补动作。
- 一处**带触发条件的备选**：`.table3d` rotateX 74°→62° 后净 81°，cos≈0.16，原全屏紫光池压成 ~90-140px 高的光带。截图像素核验 1440×900：若它读成「远处地面的一池光」→通过；若读成「一条发亮的硬线」→ 62°→**58°**（净 77°），再验一次。两值都在不翻面的安全区内，取读法好者写死。

---

## e) 动效语言：幅度同族，但三处未写死的参数会被实现者即兴掉【有条件通过】

slam 400ms 落在 combo-pop .5s / react-pop .22s / 卡翻 520ms 的既有脉冲带里；away 0.85s 与离座时钟 850ms 同拍；−8px/1.05、−34px/.94 都在 chr-idle（scaleY 1→1.07）的「小变换」语系内——幅度全部合格。缺的是**衔接参数**：

**参数级修订指令**：

1. `.tp-forward` 的**过渡**必须写死（方案只写了终态）：`transition:transform .45s cubic-bezier(0.22,0.61,0.36,1)`——与座次卡 transform 过渡（index.html:740）同族，进/出前倾各一次 .45s，不新增缓动品种。禁用 .34,1.56 回弹族（那是入场 pop 专用，前倾用回弹会读成受惊弹起）。
2. `tp-slam` 必须挂在 **`.tp-inner`** 上（不能挂 #tp-back）：#tp-back 基准 transform 含 translateX(-50%) 且 forward 态带 translateY(-8px) scale(1.05)，animation 一旦接管 declared transform 就会从前倾姿**跳变**到关键帧首帧。挂 inner 则叠加在父级前倾之上；与 chr-idle 同元素双 animation 各自动 transform，slam 400ms 内呼吸暂停，被拍桌动作完全遮住，可接受：
   ```css
   #tp-back.tp-slam .tp-inner { animation:chr-idle 3.2s ease-in-out infinite alternate, tp-slam .4s cubic-bezier(0.22,0.61,0.36,1); }
   @keyframes tp-slam { 0%{transform:none} 35%{transform:translateY(3px) scale(1.05,1.12)} 100%{transform:none} }
   ```
3. `.tp-away` 的 transform 串必须显式带基准位移，漏 `translateX(-50%)` 会横向瞬移半身：`transform:translateX(-50%) translateY(-34px) scale(.94); opacity:.85; transition:transform .85s cubic-bezier(0.22,0.61,0.36,1), opacity .85s;`——慢出曲线同族。
4. 说话 sway 周期定 **2.1s**（禁 3.2s）：与 chr-idle 同周期会同相锁死，叠加后某半圈看起来「没在动」。
5. 断言语义修订：前倾 −8px 会把头举过「top ≥ ring 盒 bottom−2」锁 8px。改法：**断言只在非 forward 态采集**（或桌面背影高度基准让 8px：头基线 = ring 盒 bottom + 6px，前倾峰值恰触 −2 线）。二选一写死，不许两头各让一半。
6. REDUCED：forward 保留**静态前倾终态**（Eng F1 的二选一，我裁定保留前倾——「轮到我了」是无障碍信息，不是装饰）；slam/away 瞬移；氛灯静态常亮。与 774-776 行既有降级块并列落列。

**风险**：前倾（状态 class）和氛灯（状态 class）是最容易被当成「常驻动画」漏掉 REDUCED 退路的两处——Eng F1 已列，此处从视觉侧再锁一次。

---

## f) 配色：chrHue 冲突靠「压暗」化解；压暗罩参数微调【有条件通过】

1. **chrHue vs 头像图色**：chr1=hsl(h,66%,60%) 与 DiceBear 像素头像的发色/衣色无保证一致——若背影用原亮度铺 300px，色相冲突会被放大到全屏可见。按 a 条压暗 40-66% 后，背影色相读作「环境光下的衣服暗部」，冲突感知趋零；「认出是我」由**名牌+徽章+青色氛灯**（全站 me 语言，761-762 行）承担，不押在色相上——与玩家评审 A-4 的结论殊途同归，但给出了画面层面的解。批准 chrHue 方案，**前提是 a 条压暗层同步落地**。
2. **压暗罩 rgba(10,10,26,.45)**：与 --bg 同色同族——罩上去是「关小舞台灯」而不是「蒙一层灰」，色相选择正确，保持。但 .45 罩 + 卡 .8 透明度叠加后，远排小脸的有效亮度只剩 ~44%，婷婷的「揭晓也要认得出人」会紧。修订：
   ```css
   #screen-game.stage-revealed .players-grid.ring3d .player-card { opacity:.85; }        /* .8→.85 */
   #screen-game.stage-revealed .players-grid.ring3d .player-card.active { opacity:1; }   /* 持麦人不暗：揭晓页换一题(主持人)的语义锚 */
   ```
   罩自身 .45 不动。
3. **竖屏名牌与背影脱钩**（必改的一条视觉补丁）：v3 让 me 名牌留在座次卡上，桌面端它恰好落在头顶上方 = 「头顶名牌」，完美；但竖屏背影 bottom 锚定后，名牌悬在环底（y≈402）、头顶在 y≈693——**名牌和背影中间空出 ~250px，读成别人的名牌**。补：
   ```css
   #tp-back .tp-you { position:absolute; top:-14px; right:-4px; font-size:.62rem; font-weight:800;
     color:#cffafe; background:rgba(10,10,26,.66); border:1px solid rgba(34,211,238,.65);
     border-radius:999px; padding:1px 7px; }
   ```
   （「你」胶囊挂在背影头侧，复用 me 名牌的青缘语法；环上的原名牌不撤，桌面端二者重叠无碍，竖屏端由它补链。）

---

## 总判定：【修订后批准】

六条无一需要推翻架构——问题全部集中在 v3 从 v2 精简时**丢掉的「表面/衔接参数」**和两处现有全局规则的吞并陷阱。以下 7 项落稿即可开工，不需要再走一轮全量评审：

1. a 条背影表面四件套（椅背缘光/肩线 1px 主轮廓光/chrHue 压暗 40-66%/接地影）——**不改必成黑影，这是唯一接近否决的项**；
2. b-1 两处 z 序硬雷：713 行 :not 链扩 `:not(#tp-back)`、727 行 UI 组 z2→40；
3. b-2 揭晓态背影 scale .9 + 题面卡落地影 + 头区零交断言；b-3 竖屏 bottom −34px + 头身比 26%；
4. c 条毡面缘光四元组（.22 紫-300 全缘 + 近沿内反光）；
5. d 条附带条件：.table3d 净 81° 截图核验，读成硬线则 62°→58°；
6. e 条五参数：forward 过渡 .45s(0.22,0.61,0.36,1)、slam 挂 .tp-inner、away 显式 translateX(-50%)、sway 2.1s、前倾断言语义二选一写死；
7. f 条：座次卡 .85 + .active 豁免、竖屏「你」胶囊上背影。

「第三人称骗子酒馆味」在参数落位后成立：暗桌、亮我、桌上题、对面一圈脸——这个画的骨架是对的。
