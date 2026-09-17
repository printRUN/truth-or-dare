# 3D 界面优化轮 · 工程红线评审（eng）

> 评审对象：`.pw/design-plan-3d-polish.md`（v2）。
> 核验方式：逐行读 index.html 内联 three 模块（6089–6293，其中 6107 行为 603KB UMD）、Cam（3139–3295）、runStage/playReveal（3298–3510）、perfWatch/setLowPerf（1637–1688）、anchorTpBack（2899–2915）、layoutRing（4050–4106）、landPick（3999）、相关 CSS 与全部 .pw 探针；并重跑 `probe-3d-diag.cjs`（端口 8819）取证。

## 总判定：【修订后通过】

方向全对，P0-0/P0-2/P0-3 的根因诊断被我的复跑完全证实。但有 **4 处会当场翻车的参数级硬伤**（P0-2 的 landforce/名牌坐标公式、P0-3 的选卡 E2E 断供、P1-5 的锚定基准翻转、test-perf 必红）和 **1 处红线误读**（P1-6 的 matchMedia 监听），必须按下列指令修订后才能动代码。

---

## 证据核验（重跑 probe-3d-diag.cjs，2026-09-16）

- P 页：`three3d:true, loperf:true, chars:0, syncLog:[]` —— 方案 P0-0 的「混合怪象」根因逐字证实：帧循环在 6287 行（模块内 `if loperf…return`）先于 600ms 节询返回，syncPlayers 一次都没跑过（syncLog 连 skip 都没有），DOM 回退层叠在冻住的画布上。
- 双页 loperf：Q 在 choosing 时还是全相机（z:-76, rx:19），到 drawing-mid 已被压平（z:-30.4, rx:0 —— 正是 Cam.to 的 LOWPERF 分支 `z*=0.4, rx=0`，3188–3191 行）→「双页触发」证实。
- 画布变形：`canvasW:920, canvasH:608`（入场时一次性 setSize 的缓冲）被塞进随阶段变化的 CSS 盒 `596→718→566` 高 —— 方案 P0-3 第 5 条「缓冲区随 #cam 盒拉伸」证实，且比方案写的更糟（缓冲在进场时刻冻结，之后每阶段都在错位拉伸）。
- 工具行漂移：toolsRect top `764→873→989` —— P1-5 证实。
- 非全屏：canvasRect `[268,150,902,596]` @1440×900 —— P0-2 证实。
- 无 pageerror。

---

## 逐项判定与修订指令

### P0-0 retire3D() —— 判定：修（方向对，清单不完整）

1. **检测时机**：`loperf` 检查必须移到 `frame()` 的**最顶部**（`requestAnimationFrame(frame)` 之后第一句），先于 `if (!active) return` 和 `paused` 早退（现 6284–6287 行的顺序会导致非牌桌屏翻转时漏检到下次进桌）。600ms 节询窗口与检测无关——class 检查是逐帧的，不会漏；节询只影响人物同步，不是漏检源。方案表述需更正。
2. **retire3D 清单补全**（方案只有 ①摘类 ②停 rAF ③清名牌 inline ④摘 canvas）：
   - ⑤ `window.removeEventListener('resize', size)` —— 模块 6141 行挂了 resize 监听，不摘就是泄漏（rAF 停了监听还在，每次 resize 白跑 setSize）。
   - ⑥ 还原钩子：`Cam.apply = _ap`、`paintVoice = _pv`（模块 6239–6248 行的覆盖必须还原，否则 syncCam 永远写一块已摘除的画布的相机）。
   - ⑦ **归还 reparent 出去的按钮行**（P0-3 的 #card-actions/#btn-reroll/#stake-row，见下）并移除 #stage-actions —— 方案 P0-0 完全漏了这条，loperf 翻转时按钮会永远钉在 body 层。
   - ⑧ `renderer.dispose()` + `renderer.forceContextLoss()`；scene.traverse 里 dispose geometry/material/texture（texCache、题面纹理在内）。
   - ⑨ 全部动作在**同一个同步函数**里完成、无 await：先摘 `body.three3d`（CSS 回退当帧复活）再摘 canvas，中间无绘制帧，不会闪。
3. **探针 perf 偏好**：项目已有先例 —— `test-3d.cjs` 头注与 init 已写明 `tod:perf=full` 钉全效（正是为压 headless 软件光栅下 perfWatch 误翻省电）。`probe-3d-diag.cjs:24` 与 `probe-3d-smoke.cjs:24` 目前只设 `tod:guide`，必须补 `localStorage.setItem('tod:perf','full')`，跟随同一模式。`PERF_PREF_KEY='tod:perf'`、全效存值为 `'full'`（`PERF_PREF_OF`，1659 行），别写错值。
4. boot 期早退（模块 6119 行 `contains('loperf') → return`）保持不动，方案表述正确。

### P0-1 头像映射 —— 判定：过（参数已核）

- 脸盘 r0.17→0.19、z 0.168→0.206：rim 点到球心距离 √(0.19²+0.206²)=0.280 > 0.2（头球半径），全圆周在球外，无深度剔除；面盘与球面间隙 0.006 在该尺度不可见。若仍见毛边，把 z 提到 0.208，**不许**再加大 r。
- 160→256 cover 裁剪：贴图重绘只发生在 `avatarTexture` 的 uri 变更分支（现 6180–6194 行按 uri 缓存），是事件级不是帧级，不触红线。
- CanvasTexture 若配 `renderer.outputEncoding = sRGBEncoding`（P1-2 引入），头像/题面纹理必须设 `tex.encoding = THREE.sRGBEncoding`，否则按线性管线二次提亮，脸色发灰白。

### P0-2 画布挂 body —— 判定：修（两处硬伤）

**层级与特异度（已核，方案这半对）**：`#bg-canvas { position:fixed; inset:0; z-index:0 }`（18 行）、`#app { position:relative; z-index:1 }`（34 行）；grep 全文**不存在任何 `body > *` / `body > div` 通配规则**，`body > #three-canvas`（特异度 (1,0,1)，方案写「(2,0,0) 级」是错的记法，但含 ID 即压一切无 ID 规则，实质无竞争）不冲突。canvas `appendChild` 到 body 末位 + `z-index:0` → 星空之上、#app 全部 UI 之下，成立。`#app` 的 `perspective:1400px`（607 行）只作用于其子元素，不影响 body 层画布；`.screen`（49 行）无背景，#app 无背景，canvas 不会被不透明层盖住。`#cam` 的 `overflow-x:clip`（711 行）随 canvas 迁出而不再裁剪它——正是全屏化的目的。

**硬伤一：landforce 旋转兜底会废掉 fixed 画布。** `body.landforce { transform: rotate(90deg) translateY(-100%) }`（1116–1118 行）——body 一旦带 transform 就成为 fixed 后代的包含块，且画布随 body 旋转。这**不是**要改挂 html（挂 html 反而让场景在 landforce 下不跟转、横竖颠倒）；正确指令：
- CSS：`body > #three-canvas { position:fixed; inset:0; z-index:0; pointer-events:none; display:block; }`（原 760 行 `#cam > #three-canvas` 整条**替换**，不许两并存）。
- `size()` 改量**画布自身**：`const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight` —— **禁止**用 `window.innerWidth/innerHeight`（landforce 下物理视口与逻辑视口互换，会算错 aspect）。resize 监听保留（旋转/分屏都会触发 resize）。

**硬伤二：非游戏屏的残帧。** 画布进 body 后常显；出牌桌（`active` 由 true→false 的边沿）时最后一帧 WebGL 画面会一直垫在 lobby/result 屏底下。指令：frame 循环里在既有 `wasActive` 边沿上补一次 `renderer.clear()`（只清一次，不许每帧清）。

**名牌坐标公式（回答任务书提问，方案 P0-4 的诊断句有错）**：
- `.player-card` 是 `position:absolute`（806 行），其包含块是 `#game-players-grid` 自己——它是 `position:relative`（796 行），**不是**方案 P0-4 写的 #screen-game。「只减 grid rect」结论碰巧对，但理由和公式要按下面的来。
- 精确公式（canvas 全屏后）：
  `sx_local = (V.x+1)/2 × canvas.clientWidth − gridOffsetX`
  `sy_local = (1−(V.y+1)/2) × canvas.clientHeight − gridOffsetY`
- **gridOffset 必须用 offsetLeft/offsetTop 链（grid 沿 offsetParent 链累加到 body），不许用 `getBoundingClientRect` 差值**。理由有二：① rect 是旋转后的物理坐标，landforce（body 旋转 90°）下 x/y 互换，公式全废；② 本仓库在 4104–4106 行已有血泪注释钉死同一条：「用 offsetLeft/offsetTop（纯布局值），不能用 getBoundingClientRect 差值」。方案 P0-4「减 grid rect」与 P0-2「用 canvas 自身 rect」在普通竖屏/原生横屏下恰好等价，landforce 下双错——按 offset 链改。
- camEl（#cam）的 rect 从 updatePlates 中彻底退场；z 序 `600 − round(V.z×300)` 与逐帧写 left/top/zIndex 的现状保持。
- P0-4 的「重叠 5% 透明度渐隐」：opacity 是合成器属性，不违「逐帧只写 transform」预算，但必须**缓存上次值、变化才写**，不许每帧无条件写 style。

### P0-3 抽卡/出卡 3D 化 —— 判定：修（四个子项分开判）

**① CanvasTexture 回合规——判定：豁免，附防护条款。** 红线原文是「**逐帧**禁止新增材质色写入/离屏 canvas 重绘」，与「材质色写入」并列在同一条逐帧禁令里，真意是禁**每帧**重绘（对比现状：呼吸只写 transform）。回合级一次性重绘属不同节奏，豁免。防护条款（全部强制）：
- **复用同一个** canvas(512×680)+`THREE.CanvasTexture` 实例，重绘后只置 `needsUpdate=true` 一次——比方案写的「dispose 旧纹理」更好：零分配零 dispose 抖动；
- `tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false`（512×680 非二次幂，r128 在 WebGL1 回退设备上会强制 resize 并刷警告，这两行免疫）；`tex.encoding = THREE.sRGBEncoding`（同 P0-1）；
- 重绘触发点＝revealed 边沿每回合至多一次 + chooser 头像变更；**禁止**在帧循环任何分支里 touch 该 canvas；
- REDUCED/loperf 路径跳过飞卡但保留一次性上纹理（牌直接出现在桌上，与 P1-6 同哲学）。

**② document 级 raycast——判定：过，附三条强制防护。** canvas 保持 `pointer-events:none` 红线不破（方案已承诺）。事件顺序：按钮自身 handler 在 target 相先跑，document 冒泡在后——**会**出现「点完成啦同时 raycast 命中桌心卡」的双触发。防护：
- 否决名单：`e.target.closest('button,a,input,textarea,select,label,.choice-card,.player-card,#game-tools,#stage-actions,#bet-box')` 命中即 return；
- **阶段闩锁**：每次进入 choosing 只允许第一次命中生效，pick 后置闩，stage 离开 choosing 才清——同拍吞掉双触发与双击缩放的第二击（`e.detail>1` 也直接弃）；
- NDC 换算必须过 `landPick`（3999 行，landforce 物理坐标→逻辑坐标，Cam.focus 已有先例）：`ndc.x=(l.x/canvas.clientWidth)*2−1, ndc.y=−(l.y/canvas.clientHeight)*2+1`。
- 键盘可达性：#choice-section 双卡**不许 display:none**（见 ③），保 opacity 路径后键盘 Tab+Enter 仍可用，raycast 是增强不是唯一入口。

**③ reparent #card-section 按钮行——判定：修（方案漏了三处）。**
- 移动清单不是「按钮行」一个：`#card-actions`（1489–1491）**和它的兄弟 `#btn-reroll`（1493，换一题）**必须一起走，建议连同一个新建 wrapper 整体搬，保持相对布局。**#stake-row（#btn-stake 加倍挑战）在 #choice-section 内部（1453–1455），three3d 隐藏选卡区后它会一起消失——必须一并 reparent 进 #stage-actions**，实证：`test-fun.cjs:140` 对 `#btn-stake` 做真实点击（该文件 63 行已钉 `tod:perf=full` → three3d 必然激活），不动它 test-fun 必红。
- **祖先链选择器失配清单（grep 核实）**：按钮样式全走独立类（.btn-accept/.btn-skip/.btn-pass，330–336 行），reparent 不失配；失配的只有一条——`.card-front .card-actions button { padding:7px 12px; font-size:0.82rem }`（1075 行，媒体查询内）。指令：该选择器改为 `.card-front .card-actions button, body.three3d #stage-actions .card-actions button`。`#cam > :not(...)`（745 行）与 `#cam > #choice-section…`（749 行）只命 #cam 直接子级，#card-actions 不是直接子级，无影响。
- **退场同步**：`.screen.leaving` 把整屏变 absolute 做 pan-out（618 行），1 秒后移除（2611–2616 行）——reparent 在 body 层的按钮**不会**跟着退场。指令：归还 reparent + 隐藏 #stage-actions 必须挂在「旧屏挂 .leaving」的同一处（2611 行附近），不能只靠「回合结束归位」（局结束/换屏≠回合结束）。
- **选卡 DOM 不许 display:none**：`probe-3p-verify.cjs:154` 用 `force:true` 点 `#card-truth`（37 行已钉 tod:perf=full → three3d 激活）——display:none 的元素无盒，force 也点不了，70 断言必红。指令：three3d 下 `#choice-section .choice-card { opacity:0.001; pointer-events:none; }`（有盒、可聚焦、真人不可见不可点）。`test-fun.cjs:143` 读 `#choice-hint` textContent 在 display:none 下也能过，但保持可见盒更稳。注意 `sim-mobile.cjs:174` 对 #choice-hint 的 tap 在隐藏盒上会失败（非门禁脚本，记录在案即可）。
- #punishment-text/#reveal-wait 等状态元素留原处「hidden 但可读」：判定过——`probe-3d-diag.cjs:91` 等 textContent 断言不受 display:none 影响。

**④ 飞卡动画写在哪——判定：过，方案已指定帧循环，补三条接线细节。**
- 触发源用**既有全局状态的帧内边沿检测**，不引新耦合：飞牌 = `cardDealt` false→true 边沿（3376 行置位）；3D 翻面 = `$('flip-card').classList.contains('flipped')` 边沿（playReveal 主翻起点 3462 行置位，REDUCED 分支 3440 行也置位——天然同拍）。**不许**放进 600ms 节询的 syncPlayers（动画起点会被量化出 ≤600ms 抖动），**不许**另起 setTimeout 链（与 runStage 的 seq 守卫脱钩）。
- 一切曲线用帧内 `sec`（time-based）算 pose；卡飞行/翻面期间**只写 mesh.position/rotation**（transform，合规），CanvasTexture 在飞行动画开始前已就位，飞行中零纹理写入。
- **seq 守卫**：动画挂 `S.turn.seq`，换回合（换题/点名）当场把卡 snap 到终态，防旧动画飞进新回合。
- 顺带修一个方案没发现的既有 bug 被本项引爆：打字机完成回调里 `burst($('card-section').getBoundingClientRect()…)`（≈3489 行）——#card-section 在 three3d 下 display:none 后 rect 全零，彩带炸在 (0,0)。指令：给 `window.__three` **追加**一个投影访问器（如 `tableCenterScreen()`，复用 updatePlates 投影公式投影点 (0, TABLE_H+0.35, 0)），burst 原点在 three3d 时取它，回退 innerWidth/2, innerHeight*0.45。追加方法不动 `window.__three` 的位置与既有字段（红线允许）。

**⑤ 起身走位 vs syncPlayers 竞态（D3 遗留，方案 v2 未答，必须补）**：syncPlayers 每 600ms 用 `__seatAngleByPid` 直接覆写 `ch.position`/`ch.rotation.y`（模块 6276–6280 行）——走位若直接改 position，≤600ms 内就会被座位节询拽回凳子。硬性接线：syncPlayers 改写 `ch.userData.seat`（Vector3）与 `ch.userData.baseRotY`；帧循环每帧 `ch.position = seat + walkOffset(walkK)`、`ch.rotation.y = baseRotY + faceDeckOffset`。600ms 节询只更新数据，帧循环独占 transform 写入。walkK 用 time-based 插值（去程 ~900ms 与抽卡 900ms 同拍，回程对称），REDUCED 跳过。

### P0-4 名牌钉头顶 —— 判定：修

坐标公式按 P0-2 硬伤二给出的 offset 链版本执行（方案「减 grid rect」在 landforce 不成立；「offsetParent 是 #screen-game」的诊断句错误，实为 grid 自身，796/806 行已核）。字号 ≥15px、深度渐隐的写法约束见 P0-2 末条。me 名牌 pointer-events:none（768 行）保持。

### P1-1 光有源+影落地 —— 判定：过，附阴影预算条款

- **DirectionalLight 选型正确**：r128 里 PointLight castShadow = 6-pass cube map，方案避开是对的，写进代码注释钉死「本场景禁止 PointLight/SpotLight castShadow」。
- 阴影贴图渲染发生在 `renderer.render()` 内部（GPU 深度 pass），不产生 CPU 侧逐帧材质写入——**不构成**红线 4 的违反；但它是真实 GPU 开销（全场景每帧双绘）。条款：`renderer.shadowMap.autoUpdate = false`；仅在 ① 座次/阶段变化 ② 任一 char walkK>0.01（走路中）时置 `needsUpdate=true`。呼吸 ±3% 的影子冻结不可感知。参数：`mapSize 1024`、光位 (2,7,2) target 原点、shadow.camera 正交盒 ±6、near 1 / far 20（只罩桌+人，不罩 r40 地板）。
- 吊灯可见 mesh（线+罩+自发光灯泡）为 boot 期一次性静态件，合规。注意吊灯摆在镜头（y≈3.75 俯视）与桌之间会不会挡 HUD 顶部 stat-chip——交给 visual 视角 A/B 截图，工程侧只要求灯罩 mesh 不进 `castShadow`（自发光件投影无意义白耗）。

### P1-2 色调 —— 判定：过，附两条参数

- r128 UMD 已核实具备 `renderer.outputEncoding = THREE.sRGBEncoding` 与 `THREE.ACESFilmicToneMapping`（r111+ 即有），`toneMappingExposure=1.05` 可用。
- 所有 CanvasTexture（头像/牌背/题面）`encoding = sRGBEncoding`（同前，漏了必发灰）。
- 雾：`scene.fog = new THREE.FogExp2(0x0a0a1a, 0.05)` —— **0x0a0a1a = `--bg`（12 行）**，不许自选色。密度 0.05 已核算：桌距 d≈5 雾化 6%，人物 d≈6–8 雾化 9–15%（可辨认），地板缘 d≈45 雾化 99.4%（硬边消失）。renderer 保持 `alpha:true` + clearColor 透明，雾把地板融进 #bg-canvas 星空。
- 紫毡/身份色在 ACES 下的偏移靠方案既定的 A/B 截图验收，工程不拦。

### P1-3 牌堆像牌 —— 判定：过

5 张薄片 + 微随机旋转 + 顶面 card-back CanvasTexture 全是 boot 期一次性构建。牌背纹理与 DOM 牌背语言一致性归 visual。纹理同样遵守 P0-3① 防护条款（一次性、minFilter Linear、encoding sRGB）。

### P1-4 我的角色不挡事 —— 判定：过，附一条实现约束

竖屏 aspect<0.8 后撤+抬高：实现必须是 `syncCam()` 里**纯函数**（只读 Cam.cur + camera.aspect + 是否竖屏，无自有状态），或至多在帧循环里做一阶平滑（`k = 1−exp(−dt×4)`）。禁止在 syncPlayers 节询里做相机插值。双卡挪桌心左右（±0.6 量级，桌半径 2.05）与「我」座位角 π（正前方）的几何不冲突，成立。

### P1-5 工具栏钉死 —— 判定：修（一个必踩的锚定陷阱）

- **锚定基准会翻**：`#screen-game.stage-revealed:not(.leaving) { position:relative }`（54 行）——#screen-game 的 positioned 态**随阶段翻转**，absolute 钉底在 choosing（包含块=#app）与 revealed（包含块=#screen-game）之间会跳位，恰是 P1-5 要消灭的漂移换了个马甲。指令两条一起上：
  - `body.three3d:not(.loperf) #screen-game:not(.leaving) { position:relative; }`（`:not(.leaving)` 必须带——`.screen.leaving` 是 (0,2,0) 的 position:absolute，不带会被 (1,x,x) 压掉，退场动画直接死）；
  - 工具行用 **fixed** 不用 absolute：`body.three3d:not(.loperf) #screen-game > .tool-row { position:fixed; left:50%; transform:translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); margin:0 !important; z-index:40; }` —— `margin:0 !important` 必须，因为 #game-tools 有内联 `margin-top:20px`（1507 行），内联样式只有 !important 压得住。fixed 在 landforce 下锚到被 transform 的 body 盒=逻辑全屏，仍读作「钉在屏幕底」，安全。
- **双底栏叠放**：#stage-actions（P0-3）与钉死的工具行同在底部，给参数：工具行 `bottom: safe-area+8px`（高 ~44px）；#stage-actions `bottom: calc(env(safe-area-inset-bottom,0px) + 64px)`、`left:50%; transform:translateX(-50%); width:min(96vw,900px); z-index:40`（低于 toast z2000 / loading z1000）。
- #game-tools 脱离文档流后 #cam 盒变高——canvas 已全屏，无影响；anchorTpBack 量测照旧（其 2899–2915 行逻辑不依赖工具行）。

### P1-6 REDUCED 退路 —— 判定：修（违反项目既有模式，且是真红线）

**禁止新增 matchMedia 变更监听。** 项目现状（grep 核实）：`REDUCED` 是 1637 行的 **boot 期一次性快照**，全文件 40 处引用全部读这个常量；全文除 orientation 外没有任何 MQL change 监听。若只在 three 模块里挂 live 监听，会出现「3D 模块知道 REDUCED 翻转了、Cam/typewriter/runStage 等 40 处不知道」的半身不遂——比不监听更糟。指令：P1-6 改为「REDUCED 快照分支」（模块内 `if (REDUCED)` 跳过呼吸/摇摆/走位/飞卡/翻面，牌直接躺桌上，投影与渲染保留），与 runStage 3325 行、playReveal 3440 行的既有 REDUCED 分支同构。REDUCED 中途变更的正确预期就是「下次刷新生效」，与本页所有其他动画的决定方式一致。对应地，验收门禁 6 的 REDUCED 模拟用 Playwright context `reducedMotion:'reduce'`（加载前生效），probe 里 `emulateMedia` 后 reload。

### P1-7 提示语互斥 —— 判定：过

纯 JS 条件显示，无红线接触。注意 #pick-tip 是 #cam 直接子级（1447 行）不受 #choice-section 隐藏影响，ghost-note 同理，实现无坑。

---

## 性能预算复核（Mali/G 级真实成本）

1. **dpr cap 必须动**。现状 cap 1.6（模块 6131 行）在 902×545 盒上 ≈0.79MP；全屏 1440×900×1.6 = **3.32MP，像素量 ×4.2**，再叠阴影 pass，Mali/G 级与 SwiftShader 必炸。指令：把固定 1.6 换成缓冲区预算公式
   `dpr = Math.min(devicePixelRatio || 1, 1.6, Math.sqrt(2.3e6 / (w * h)))`（结果保留两位小数）。
   核算：1440×900 → cap 1.33（≈2.29MP）；390×844 → 仍 1.6（0.84MP，手机端不动）。2.3MP 预算对应弱 GPU 60fps 的经验上限，若验收仍紧，先降预算到 1.8e6，不许先砍阴影或雾。
2. **antialias:true 保留**（现状已是，TBDR 架构上 MSAA 代价可接受），雾/ACES 为逐像素常量开销，可忽略。
3. **阴影**按 P1-1 条款节流（needsUpdate 事件驱动），稳态零阴影 pass。
4. **逐帧 CPU 写入清单**（红线 4 的账本，实施后必须正好是这一张）：呼吸/摇摆/探身/头发（现状 4 项 transform）+ 名牌 left/top/zIndex（现状）+（新增）名牌 opacity（变化才写）+ 走位/飞卡/翻面 pose（transform）+ 相机。其余一律不许出现。
5. 每回合一次 512×680 canvas 2D 排版 + 一次 `tex.needsUpdate` 上传（0.35MB RGBA→GPU），回合级不构成预算压力。

## test-perf / E2E 红线

- **test-perf.cjs 必红，先改再动 index.html**：它 `--disable-gpu`（软件光栅）且**不钉** tod:perf（148–176 行的档位测试是故意不钉的），three3d 会激活 → 3D/软渲 fps 掉 → perfWatch 翻 loperf → P0-0 的 retire3D 在 4s 采样窗中途触发 → `fps>=50` 断言（103/111 行）混合采样必抖。且 118 行 `a.click('#card-truth')` 无 force，选卡转 3D 后按 ③ 的 opacity 方案虽可 force，普通 click 过不了 hit-test → rounds=0 → `before=null` → DOM 累积断言（132–134 行）直接 FAIL。指令：第 2/3 节（帧率+连抽）所在 context 的 boot init 钉 `tod:perf='low'`（回到与历史基线同构的 CSS 宇宙）；第 4/5 节（切后台冻结、档位开关）维持不钉。
- **A/B 对照义务**（既有教训：绝对帧率断言即环境噪声）：在 `test-3d.cjs`（已钉 full）新增一对同视口采样：A=three3d（full）vs B=CSS 路径（low），断言 **相对比** `A.fps ≥ 0.5 × B.fps` 且 `A.fps ≥ 24` 绝对地板。不许写任何「必须 ≥50fps」式的新绝对断言。
- **probe-3p-verify.cjs**（已钉 full，37 行）受影响断言枚举（如实更新、不许删锁）：86 行 cardTf（#card-section display:none 后 computed transform='none'，three3d 分支须接受 'none'）、174 行 card-section rect（全零，改投影访问器或跳过）、159 行 waitFor（加 catch 已有，确认不悬）；154 行 force click 与 192/193 行按钮点击在 ③④ 落地后自然通过。
- `probe-3d-diag.cjs:84` 的 `chooser.click('#card-dare')`（无 force）改双路：一条 force（走 DOM handler），一条 `page.mouse.click` 打在 3D 选卡投影坐标上（真 raycast 路径）——raycast 必须有 E2E 覆盖，不许只测 DOM 兜底。
- `check-syntax.cjs` 过（内联 script 抽取 new Function，不新增 script 标签也行，模块就地改）。

## 红线核对与修订条款（brief 硬红线 1–6）

1. `.world` 禁 preserve-3d：方案未触碰，过。
2. loperf/REDUCED 静态退路：P0-0 retire3D + P1-6 快照分支修订后满足（P1-6 按上文修订才算满足）。
3. **「不动 DOM 结构/#three-canvas 特异度/window.__three 位置」——本方案三处全部触碰，宣布按如下条款修订该红线**：DOM 允许**运行时可逆**的搬移（canvas 出 #cam 进 body、按钮行进 #stage-actions），条件是 ① 每次搬移记录 {el, parent, nextSibling} 并在 retire3D/换屏/退场三类时机全部归还；② `#cam > #three-canvas` 规则整条替换为 `body > #three-canvas`，不许双规则并存；③ `window.__three` 保持「chars 声明之后」的位置与既有字段，只允许追加访问器。不可逆的结构改动仍然一票打回。
4. 逐帧禁材质写入/离屏重绘：按 P0-3① 豁免条款 + 「逐帧 CPU 写入清单」执行；阴影 pass 属 GPU 侧不违约（P1-1 已给节流）。
5. 603KB UMD 不动：方案未触碰，过。
6. 单文件离线：方案明确不引补间库/外部资源，过；若实施中有人想引 tween 库，就地打回。

## 不可让步底线（不再接受任何形式的让步）

1. canvas `pointer-events:none` 不破；document raycast 必须带否决名单+阶段闩锁。
2. retire3D 必须完整还原它造成的一切（canvas、类、监听器、钩子、reparent、inline 样式、GL 资源），缺一项即打回。
3. 红线 4 的逐帧写入清单不得超纲；CanvasTexture 只许回合级、单实例复用。
4. REDUCED 一律 boot 快照，禁止 MQL live 监听。
5. 名牌/拾取坐标一律 offset 链 + landPick，禁止裸 getBoundingClientRect 差值（仓库 4104 行既有结论）。
6. E2E 先行：test-perf 钉档拆分 + test-3d 的 A/B 相对断言 + probe-3p-verify 受影响断言枚举更新，必须与实现同一提交落地；断言只许按 three3d 语义如实改写，不许删除。
7. `tod:perf='full'` 探针预置（diag/smoke）先于任何 3D 门禁跑动。
