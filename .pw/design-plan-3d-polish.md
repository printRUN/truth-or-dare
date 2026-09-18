# 3D 界面优化轮 · 设计方案 v2（综合用户点名 + 双 persona 走查 + 根因诊断）

> 需求来源优先级：**用户点名 P0（2026-09-16）> persona【必须】> persona【加分】> v1 草稿质感项**。
> 诊断证据：`.pw/probe-3d-diag.cjs` 输出（loperf:true 双页触发 / canvasRect=[268,160,902,545] 非全屏 / 抽卡时 #cam 545→718 变形 / P 页 syncLog 空 chars=0）。

## P0-0 【用户间接受害者，最高优先】loperf 触发后的「混合怪象」修复
根因：`perfWatch()`（1669 行）在弱机/headless 实测帧率 <38fps 时 `setLowPerf(true)` → `body.loperf`。
但 three 模块只在不渲染帧循环里「跳帧」，`body.three3d` 不摘除；CSS 门控全是 `body.three3d:not(.loperf)` →
**DOM 回退层（#tp-back 黑蛋、.table-deck、.table3d、DOM 头像卡）全部复活，叠在冻住的 WebGL 画布上**；
人物同步（帧循环节询）一并停摆 → 名牌漂进虚空（阿凯 #3）、chars=0（阿凯 8 人局全程）、
「省电模式」toast 盖顶（婷婷 #2 绿块 = `.toast.success`，验证后若仍有另查）。
**修法**：帧循环检测 `loperf && body.three3d` → 走 `retire3D()`：① 摘 `body.three3d`；② 停 rAF；
③ 清空全部 .player-card 的 inline left/top/zIndex（名牌回归 layoutRing CSS 定位）；④ canvas 从 DOM 移除。
boot 期 loperf 早退逻辑不变。E2E 探针 init 脚本统一设 `localStorage` 性能偏好=全特效，保证 3D 门禁可测。

## P0-1 【用户点名】头像必须按玩家所选头像映射
- 真 bug D1：脸盘 z=0.168 陷在头球（r=0.2）内部被深度剔除——头像只露外圈一环，玩家看到的就是「没映射」。
  **修**：脸盘 r 0.17→0.19、z=0.206（球面外），MeshBasicMaterial 保持自亮。
- 贴图改 **cover 裁剪**（现 drawImage 拉伸变形）：160→256px canvas，按图片短边居中裁剪。
- `resolveAvatar` 链路已核实支持 av:/dcb:/data: 三种来源，模块调用时序无问题（A2 后再验一次端到端）。

## P0-2 【用户点名】3D 场景全屏化，不再被裁成「面板盒」
根因：`#three-canvas` 是 `#cam` 子元素，#cam 只有屏幕面板大（诊断 canvasRect 902×545 @1440×900），
四周露出 CSS 星空 = 「背景被裁剪」。
**修**：canvas 改挂 **body 层**（#bg-canvas 与 #app 之间，fixed inset:0，pointer-events:none），
CSS 选择器 `#cam > #three-canvas` → `body > #three-canvas`（保持 (2,0,0) 级特异度写法防通配压制）；
尺寸=视口，aspect 恒定。名牌投影坐标改用 canvas 自身 rect（全屏）再减容器偏移（见 P1-4）。
配套：地板 CircleGeometry r10→40 + `FogExp2(背景色, ~0.05)` 远缘融进星空，任何视口都看不到地板硬边。

## P0-3 【用户点名】抽卡+出卡全程在桌面完成（含抽卡动画）
现状：drawing 期 DOM 弹一张居中大卡「抽取中…」盖住场景；揭晓卡浮在半空不在桌上；无任何抽卡动作。
**修（三段式，全在 3D 场景里）**：
1. **起身**：轮到者 3D 人物离座滑向牌堆（seatPos→牌堆前 35% 插值 + 转身面向牌堆，呼吸/探身保留），
   镜头照旧推镜（Cam 编排不动）。交接阶段对称走回。
2. **抽卡**：进入 drawing 时，牌堆顶卡「抬起→弧线飞到桌心上方→落下」，全程 ~900ms（位置曲线在帧循环
   里做，不引补间库）；「抽取中…」状态由**桌面上的牌背**承担（3D 卡背朝上躺桌心），不再弹 DOM 大卡。
3. **出卡**：揭晓时桌心那张卡 **绕横轴 3D 翻面 650ms**，正面=题面 CanvasTexture
   （512×680 canvas 排版：大冒险/真心话徽章色 + 题干自动换行 + 抽卡者头像小图），
   翻完以躺角贴在毡面上直到本回合交接。
4. **操作按钮去留**：three3d 模式下 `#card-section` 隐藏，把**动作按钮行整体 reparent**（非克隆，ID 不动）
   到 body 层新建的 `#stage-actions` 底部条（完成啦/免答牌/跳过/换一题），回合结束归位——
   `#punishment-text` 等状态元素留在原处（hidden 但可读，E2E 断言文本仍过）；
   选卡双卡（真心话/大冒险）同样 3D 化：桌心左右各一张躺角卡面（CanvasTexture），点击走
   document 级 raycast 转发（canvas 保持 pointer-events:none 红线不破）。
5. **压缩问题顺带消灭**：canvas 全屏化后缓冲区不再随 #cam 盒变高（545→718）而拉伸变形；
   渲染尺寸只跟窗口 resize 走。

## P0-4 【persona 双确认】名牌必须钉在对应人物头顶
- 坐标错位根因：updatePlates 用**视口坐标**写 `.player-card` 的 left/top，但卡片 offsetParent 是
  #screen-game（#cam 盒内，偏移 [268,160]）——全桌名牌整体错位 268,160 →「飘在虚空/贴错人」。
  **修**：sx/sy 减去 grid.getBoundingClientRect() 的 left/top（本地坐标），画布全屏化后一次修对。
- z 序按深度已有；me 名牌 pointer-events:none 保持。
- 名牌字号 13px→≥15px（婷婷硬标准），z 序重叠时给 5% 透明度渐隐而非硬叠。

## P1 质感与构图（persona 硬标准映射）
- **P1-1 光有源+影落地**（阿凯#1/#6、婷婷#6）：可见吊灯（线+罩+自发光灯泡）+ PCFSoft 阴影
  （单 DirectionalLight castShadow 1024，人物/桌投影到毡面与地板）。
- **P1-2 色调**：sRGBEncoding + ACESFilmic（exposure≈1.05），紫毡改深档 + 程序噪声纹理，
  随之重调环境光/补光强度（A/B 截图验收，防止把身份色调脏）。
- **P1-3 牌堆像牌**：5 张薄片微随机旋转 + 顶面 card-back CanvasTexture（与 DOM 牌背同语言）。
- **P1-4 我的角色不挡事**（阿凯#2/#4、婷婷#5）：竖屏 aspect<0.8 相机平滑后撤+抬高（近景占比 ~50%→~35%）；
  选卡双卡移到桌心左右后，「我」正好坐在两卡之间的缺口正后方，不再压「大冒险」。
- **P1-5 底部工具栏钉死**（阿凯#8、婷婷#9）：body.three3d 下 #game-tools 改绝对定位钉底
  （选卡/抽卡/揭晓/交接四阶段同一位置），不再随内容流漂移。
- **P1-6 REDUCED 退路**（红线补口）：matchMedia 监听，REDUCED 时停呼吸/摇摆/发浮动/抽卡飞行动画
  （抽卡流程退化为「牌直接出现在桌上」，与 CSS 路径同哲学），名牌投影与渲染保留。
- **P1-7 提示语叠字**（婷婷#7）：「点击玩家头像可指定…」与「等待对方选择…」互斥显示（阶段条件化）。

## 明确不做（本轮）
- 8 人局座次重排/自由转桌视角（阿凯加分 #5）——涉及 layoutRing 公式，风险面太大，下轮单独立项。
- 横屏 11 连按钮收纳（婷婷#8）——DOM 工具栏改版，与 3D 无关，下轮。
- 桌上杯子/筹码/彩带落点（双方加分项）——质感 P2，先保 P0/P1。

## 验收门禁
1. `check-syntax.cjs` 过。
2. `probe-3d-diag.cjs`（新）复测：全阶段 three3d=true、loperf=false（探针锁 perf pref）、
   chars==人数、canvasRect==视口、四阶段截图目检（灯/影/牌在桌上/头像脸可见）。
3. `probe-3d-smoke.cjs` 无 pageerror，四阶段截图过目。
4. `probe-3p-verify.cjs` 70 断言全绿（受影响的卡牌可见性断言按 three3d 模式如实更新，不许删锁）。
5. 竖屏 390×844 + 桌面 1440×900 双端 A/B 截图：近景占比、名牌贴合、桌上出卡、全屏无裁剪。
6. REDUCED 模拟（emulateMedia）截图：人物静止姿态、牌直接出现在桌上。

---

## v3 定稿（三专家合参 2026-09-16，评审档案：review-3d-polish-{eng,visual,player}.md）

三份评审均为【修订后通过】。以下为合参后的最终修订登记，实施以本节为准（与前文冲突处本节胜）：

### 参数裁决（冲突合并结果）
- 雾 `FogExp2(0x0a0a1a, 0.042)`（视觉值，竖屏远端人物透过率 ≥80% 约束）；地板 r=48。
- 阴影灯：位置 (−1.7, 6.0, 1.3) target(0,0,0)（视觉：影短投向右后、永不向镜头）；mapSize 1024、正交 ±4.5、near 2/far 12、bias −0.0002 + normalBias 0.02；`shadowMap.autoUpdate=false` 事件驱动 needsUpdate（座次/阶段变化/走路中）；**禁止 Point/Spot castShadow**（r128=6-pass cube）。
- 灯具：罩底 y≥2.49、灯泡 r0.07 自发光 0xffe9c4、罩内壁 emissive 0xffd9a8×0.9、吊线到 y6；点光 0xffd9a8×1.25 dist9 @ (0,2.58,0)；HemisphereLight(0x7078b8, 0x2a1840, 0.7)；冷补光保留 0.24（「我」的缘光，禁砍到 0）；罩摆 ±1.2°/3.5-4s 只摆罩不摆光（超载第一刀可砍）。
- 色调：ACES(exposure 1.05)+sRGB 分两步——第一步毡色保 0x4c2a8f，A/B 后必要时第二步 0x462688；噪声纹理 ±4% 对比、256 POT repeat5。所有 CanvasTexture 无例外 `encoding=sRGBEncoding` + `anisotropy=max`；题面纹理 POT 512×1024、`minFilter=LinearFilter, generateMipmaps=false`、`document.fonts.load` 就绪再画、翻面前一次性画完（回合级豁免逐帧红线，单实例复用只 needsUpdate）。
- 选卡双卡：x=±0.78、z=−0.12、尺寸 0.60×0.84、完全平贴毡面；选中升起 0.12+向镜头翘 65°+微亮、未选压暗 0.3；纹理字高 ≥110px。
- 牌堆移 (1.12, ·, 0.60)；5 张薄片 ±0.06 rad 旋转抖动保留、**x/z 位置抖动砍**（玩家价值专家判低于人眼分辨率）；厚 0.012；牌背 256×512 POT（135° 渐变+白边+虚线内框，对齐 DOM 279-312 行语言）、顶面 Standard+map 侧面 0x7c3aed。
- 飞卡节奏挂 2600ms 主时钟：t≈600ms 起飞（cardDealt 边沿补 600ms 前置「伸手拍」用走位承担）、飞行 900ms 三段（0-300 easeOut 抬起/300-620 近线性/620-900 easeIn）+80ms 落弹、弧顶 y≈1.55-1.65；1500-2600 牌背呼吸脉动 scale1→1.03；2600ms（.flipped 边沿）翻面 650ms 三段、**远边枢轴 −180° 本地 X**、纹理顶边朝北；交接拉回。触发全部走帧内边沿检测（cardDealt / .flipped），禁 600ms 节询、禁 setTimeout 链；换回合 snap 终态。
- 揭晓近景（3.7 最高优先）：翻面同步推近，落幅=到卡距离 ≈2.1-2.3 单位、仰角 ~46-52°、方位偏 ~25°（避免卡后顶人），题干落屏竖屏 ≥16px/桌面 ≥15px；实现为 syncCam 纯函数内的 overlay 通道（GL 独占，CSS 机位不动）；**推镜期间名牌投影/拾取必须读渲染相机现算，禁止缓存**（玩家价值专家最高风险条）。
- 竖屏后撤：aspect<0.8 → y+0.5/z+1.3（syncCam 纯函数或 k=1−exp(−dt×4) 一阶平滑，禁节询插值）；验收=390×844 截图我全身 ≤35% 屏高、躯干不压选卡内缘。
- dpr 动态封顶：`min(devicePixelRatio, 1.6, √(2.3e6/(w·h)))`（1440×900→1.33，390×844→1.6）；预算紧先降此值，禁先砍阴影/雾。
- retire3D 全清单：摘 three3d 类、cancel rAF、摘 resize 监听、还原 Cam.apply/paintVoice 钩子、归还 reparent 按钮+删 #stage-actions、清名牌 inline 样式、traverse dispose + renderer.dispose() + forceContextLoss()、摘 canvas——同一同步函数完成；loperf 检查在 frame() 最顶（先于 active/paused 早退）。
- REDUCED 用 boot 快照（模块读既有 REDUCED 常量分支），**禁新增 matchMedia live 监听**；E2E 用 reducedMotion:'reduce'。
- 名牌：坐标=投影(全屏 canvas) − offsetLeft/Top 链累加偏移（禁 getBoundingClientRect 差值，landforce 血泪）；字号 ≥15px（落地后截图实测防媒体查询压回）；**5% 渐隐砍**（先只修定位，验收发现持续重叠再补）；胶囊叠罗汉必补（名牌卡内徽章单行流式、超宽省略、禁绝对定位互压）。
- 工具行/动作条：`body.three3d:not(.loperf) #screen-game:not(.leaving){position:relative}` + 工具行 fixed 钉底（safe+8px，margin:0!important）+ #stage-actions fixed（safe+64px、min(96vw,900px)、z40、底衬渐变）；退场归还挂 .leaving 边沿。
- 选卡 DOM 三件套：#choice-section .choice-card → opacity 0.001+pointer-events:none（**禁 display:none**，保 force 点击）；#card-actions+#btn-reroll+#stake-row reparent（记录 {el,parent,nextSibling}，退场/换回合/retire 三时机归还）；1075 行选择器补 `body.three3d #stage-actions` 分支。
- raycast 转发：document click + 否决名单（button,a,input,textarea,select,label,.choice-card,.player-card,#game-tools,#stage-actions,#bet-box）+ 阶段闩锁（首次命中生效、e.detail>1 弃）+ NDC 过 landPick；canvas pointer-events:none 不破。
- burst 修复：`window.__three` 只追加 `tableCenterScreen()` 访问器；打字机完成回调 three3d 时取其值当炸点；**彩带让行规则**：揭晓近景窗口内炸点南移桌心 (0,TABLE_H,0.9)、数量减半——近景里彩带不许横穿题面。
- 提示语互斥（P1-7）保留；婷婷加分3「揭晓小动作+转头」记入不做清单备查。
- E2E 已先行落地：test-perf 拆档（1节 full/2-3节 low/4-6 不动）、test-3d 新增 A/B 相对断言（A≥0.5×B 且 A≥24）、diag/smoke 钉 tod:perf=full；probe-3p-verify 枚举更新（86 cardTf 接受 none、174 rect→tableCenterScreen、159 waitFor）与实现同批落地。

### 砍单顺序（工作量超载时，玩家价值专家裁定）
吊灯摆动 → 牌堆位置抖动(已砍) → P1-2 第二步调色 → 名牌渐隐(已砍) → 走位 55%→探身+转身最简版。
**任何情况不可动**：3.7 揭晓近景与题面可读、卡落桌、全屏化、头像映射、光影。

### 8 人局条件（更正误标：这是必须级痛点 #7/硬标准 5，非加分）
P0-0 修完后真实重走一局 8 人局；若「头像通讯录感」仍在（chars 建出但构图不可读），下轮升 P0 处理，不许再延。

### 验收补遗
- 揭晓帧三查（390×844 与 1440×900）：题干 ≥16px、名牌贴头、彩带不压卡面——任一不过即打回。
- 绿块（婷婷#2）若在验收揭晓截图中仍现，当场另查根因，不许带病放行。
- 明度硬序截图直方图核：UI 玻璃卡 > 头像脸盘 > 光池毡心 > 人物体色 > 地板。
