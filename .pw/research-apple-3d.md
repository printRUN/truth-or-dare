# Apple 3D 交互/叙事动效模式库 → 纯 CSS 3D 单文件派对游戏

> 研究目标：把 apple.com 产品页（AirPods Pro / iPhone / MacBook Pro / Vision Pro）与 Apple 动效准则（HIG Motion、WWDC18《Designing Fluid Interfaces》、WWDC23《Animate with Springs》、WWDC24《Enhance your UI animations and transitions》）的 3D 叙事手法，提炼为可落地到 **file:// 离线单文件、纯 CSS 3D** 的模式库。
> 目标项目形态：加入页 → 大厅 → 牌桌 → 结算 四屏换场 + 卡牌仪式（点击驱动，非滚动驱动）。
> 研究日期：2026-09-13。

---

## 一、模式库（12 个模式）

> 【视觉公式】中的具体数值标注来源：`(Apple 文档)` = 官方明确表述；`(技术拆解)` = 对 apple.com 实现的社区逆向拆解；`(设计推演)` = 依据 Apple 准则推导的可执行参数。Apple 官方从未公布过网页端 easing 具体值（官网 CSS 未被权威分析公开），带 bezier 的值均为社区近似/推演，使用前自行调优。

---

### P1 深度走廊换场（Depth Corridor / 机位推进）

**原型**：Apple 产品页「逐段走进产品」的整体结构——每个 section 是空间中的一站，滚动即机位前进；社区拆解确认 apple.com 大量依赖 `position: sticky` 把视口钉住、再在钉住期间改变对象的深度属性（掘金《苹果官网动画探索》：进度控制三件套 = 视频 / canvas 图片序列 / Web 动画，sticky 布局承担「相机停机位」）。

- **视觉公式** `(设计推演)`：舞台 `perspective: 1200px; perspective-origin: 50% 42%`；四屏（加入/大厅/牌桌/结算）绝对定位在同一 3D 空间，纵深间隔 `translateZ(-600px ~ -2400px)`。换场 = 一次连续的机位推进：旧屏 `translateZ(0 → -700px) + opacity 1→0（前 70% 时长）`，新屏 `translateZ(-700px → 0)`；总时长 **620ms**；easing `cubic-bezier(0.4, 0.0, 0.2, 1)`（标准 ease-in-out，Apple 经典曲线形态）；推进中新屏附带轻微 `scale(1.04 → 1)` 抵消 Z 轴文字模糊。
- **适用场景**：四屏主流程换场的主干。一次只动「机位」，屏幕内容本身不各自为政——这正是「一镜到底」的结构基础。
- **CSS 3D 落地难度**：**中**（需要把所有屏放进同一 `transform-style: preserve-3d` 祖先；或退化为「只对当前两屏做 Z 插值」的简易版）。
- **性能风险**：中。`translateZ` 动画走合成器（transform/opacity），桌面流畅；风险点在**非整数缩放下文字重栅格化发虚**、低端机大平面纹理上传。规避：转场结束后把落定屏的 transform 归一到 `translateZ(0) scale(1)`。

---

### P2 尺度配对换场（Hero Scale Match / 缩放穿身而过）

**原型**：MacBook Pro / AirPods 页的标志性「画面放大到穿透屏幕、无缝接进下一个满幅 section」；腾讯云拆解 16 寸 MacBook 页：缩放动画 = sticky 定位 + canvas，图片钉在屏幕正中、以中心为基准缓慢放大；YouTube《How Apple Makes Those Awesome Zooming Page Transitions as You Scroll》同款手法。

- **视觉公式** `(技术拆解+设计推演)`：旧屏核心视觉 `scale(1 → 2.6) + opacity(1 → 0，在 scale>1.8 后快速衰减)`；新屏从 `scale(0.92) + opacity(0)` 接入至 1；两段共用一条曲线，总时长 **700ms**，easing `cubic-bezier(0.32, 0.08, 0.24, 1)`（前段缓入后段缓出，速度连续）；放大中心固定在视口中心（`transform-origin: 50% 50%`），保证「穿过」感。
- **适用场景**：加入页 → 大厅（房间 logo 放大成为大厅背景）；结算页开场（牌桌结果放大定格）。
- **CSS 3D 落地难度**：**低**（纯 `transform: scale` + opacity，无需真 3D）。
- **性能风险**：低-中。scale 放大会临时放大合成层（内存峰值 ≈ 面积 × scale²），限制被放大元素 ≤ 视口 1/3 面积即可；避免放大带 `box-shadow` 的元素。

---

### P3 配对元素变形（Matched Morph / Apple Zoom Transition）

**原型**：iOS 18 zoom transition（WWDC24 session 10145，一手引用）：
> "the cell you tap **morphs into** the incoming view"
> "increase the sense of **continuity** … by **keeping the same UI elements on screen across the transition**"

实现机制 = 源视图与目标视图共享标识符（`matchedTransitionSource` / `navigationTransition(.zoom)`），系统对同一元素做单次位置+尺寸插值。Web 侧对应物是 **View Transitions API（同文档）**：`::view-transition-group(card)` 自动做 from→rect 到 to→rect 的插值。

- **视觉公式** `(Apple 文档 + 设计推演)`：元素从「源 rect」到「目标 rect」单次插值，时长 **500ms**，easing `cubic-bezier(0.2, 0.0, 0, 1)`（快速启动、长尾减速，Apple zoom 的手感形态）；过程中保持纵横比不扭曲（View Transitions 默认即如此）；结束瞬间源元素必须已从旧屏移除，避免重影。
- **适用场景**：**本项目核心**——点击「入座」时玩家头像卡 morph 成牌桌座位；牌桌里抽到的卡牌 morph 成结算页的战绩卡。同文档 View Transitions 已达 Baseline（Chrome/Edge 111+、Safari 18.0+、Firefox 144+），file:// 可用。
- **CSS 3D 落地难度**：**中**（有 VT API 则低——只需 `view-transition-name`；无 API 环境需手写 FLIP：读旧 rect → 设新 rect → 反向 transform → 过渡归零）。
- **性能风险**：中。VT 快照 = 把新旧两帧截图为替换图像，**快照瞬间可能掉一帧**；不要在同一转场里给大面积元素加 backdrop-filter/大阴影。降级路径必须准备（`@supports not (view-transition-name: none)` → 用 P2）。

---

### P4 刚体转身展示（Rigid Y-Turn）

**原型**：Apple 产品页「产品任意角度旋转」（UX Planet《8 Things I Learned Analyzing Apple's Product Pages》：产品以任何想象得到的角度旋转展示）；iPhone 页的机型 45° 展示位。本质是**刚体绕 Y 轴转动 + 恒定光照**。

- **视觉公式** `(设计推演)`：`perspective: 1000px`；对象 `rotateY(-18° → 0°)`（入场时从侧 3/4 视角转正），时长 **450ms**，easing `cubic-bezier(0.22, 1, 0.36, 1)`（easeOutQuint 形态，转正即「安顿」）；同步给一个 `translateZ(40px → 0)` 的「靠向观众」，让转身有体积感而非纸片旋转。光照用固定角度的 CSS 高光（见 P8）在旋转中保持不动——光照不动、对象在动，是「刚体」可信度的关键。
- **适用场景**：牌桌开场时桌面/牌堆转正；结算页奖杯/卡组展示。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：低。rotateY + perspective 走合成器；唯一注意点是转角大于 ~45° 时 2D 文字层透视变形明显，文字要放在近似正对视角的角度。

---

### P5 卡牌翻转仪式（Flip Reveal）

**原型**：Apple「一次性、精确、跟手的反馈动效」（HIG："Aim for **brevity and precision** in feedback animations"）+ 产品页的对象「翻面/揭幕」叙事（AirPods 充电盒开盖的滚动光影拆解，CSDN：光影随滚动持续变化，揭幕感由光照完成）。卡牌翻转 = 刚体转身（P4）的 180° 特例。

- **视觉公式** `(设计推演，含 Apple 准则约束)`：三段式：
  1. 预备 `scale(1 → 1.08)`，**120ms**，ease-out——「吸气」；
  2. 主翻转 `rotateY(0 → 180deg)` + `translateZ(0 → 60px → 0)`（中途抬起 60px），**480ms**，easing `cubic-bezier(0.45, 0.05, 0.35, 1)`（两端慢中间快，模拟指尖拨动）；
  3. 落定 `scale(1.08 → 1)` + 一次性高光扫过（P8），**220ms**。
  总计 **≈820ms**，仪式感段落允许超过常规转场预算，但**全流程只能点一次、不可重复触发**（HIG："Let people cancel motion" / 避免高频交互动效）。`backface-visibility: hidden` + 双面子元素实现正反面。
- **适用场景**：**卡牌仪式**（真相/大冒险卡揭开）。这是全项目唯一允许「弹簧/表演性动效」的地方——把弹性预算全部集中在这里。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：低。纯 transform；卡面若用 backdrop-filter 玻璃质感（P9）则把 blur 限制在卡牌这个小面积上。

---

### P6 视差层分离（Parallax Layer Split）

**原型**：Apple 产品页 hero 区的层次运动：产品、标题、背景各层速度不同；百度智能云拆解：不同 `translateZ` 值实现不同滚动速度、3D 变换触发 GPU 加速保证 60fps；epub360《99% 的一镜到底 H5 都是这样的套路》：**在 Z 轴把元素前后放置、设定间距，营造立体空间穿梭感**——中文圈对「一镜到底」的核心共识。

- **视觉公式** `(技术拆解+设计推演)`：三层：背景层 `translateZ(-240px)`、主体层 `0`、前景层 `translateZ(120px)`（配合 `perspective: 1200px` 的速度比约 1 : 1.25 : 1.5）。换场时三层同向不同速移动，层间加 **60–90ms 逐层 stagger**（前景先动）；前景层同步 `opacity 0→1` 用 `cubic-bezier(0.33, 0, 0.67, 1)`。**关键**：移动方向单一（只沿 Z 或只沿 Y），层间不交叉换位——层深秩序恒定是「一镜」不穿帮的前提。
- **适用场景**：大厅列表与背景氛围的层次；结算页名次逐层浮现。
- **CSS 3D 落地难度**：**中**（`preserve-3d` 与 `overflow: hidden` 互斥——Safari 会把 preserve-3d 子树拍扁；层要脱离 overflow 容器）。
- **性能风险**：中。层数 ≤ 4，每层一个合成层；低端机合成层 = 内存，超出会触发丢弃重绘（jank）。`will-change: transform` 只标注正在动的层，转场结束移除。

---

### P7 速度匹配交接（Velocity-Matched Handoff）

**原型**：WWDC18《Designing Fluid Interfaces》核心三原则（一手）：
> "**Response**：instant response and constant redirection"
> "**Continuity**：maintain spatial consistency"
> "**Interrupts**：动画必须随时可停、可反向"

以及 HIG 的方向一致性（"if someone reveals a view by sliding it down from the top, they don't expect to dismiss the view by sliding it to the side"）。速度连续 = 旧元素退场的末速度与新元素进场的初速度相等，观感上像同一股力推着场景走。

- **视觉公式** `(设计推演)`：退场用**加速型**曲线 `cubic-bezier(0.55, 0.06, 0.68, 0.19)`（easeInCirc 形态，末速度最大），进场用**减速型** `cubic-bezier(0, 0.55, 0.45, 1)`；两段位移方向相同、量级相同（例如都走 `-100vh` 或 `translateZ -700px`），时间上 **60–70% 重叠**（旧元素还没走完新元素已入场），总时长 **560ms**。可检验标准：把两段曲线接在一张速度图上，接点处无尖峰。
- **适用场景**：大厅 → 牌桌（大厅整体向左下退场、牌桌从右上进场的同向接力）；标题文字交接。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：低。

---

### P8 光泽扫掠（Specular Sheen / 光照连续性）

**原型**：Apple 产品页光影叙事的骨架——AirPods 滚动光影拆解（CSDN：光影持续变化是「活着」的来源）；HIG visionOS 条目反证了光照连续的重要性："make sure the object's brightness level is **similar to the rest of the visible content**"。转场中高光方向不变 = 同一个光源 = 同一个世界。

- **视觉公式** `(设计推演)`：伪元素叠加 `linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.16) 50%, transparent 58%)`，用 `transform: translateX(-160% → 160%)` 移动（**不是** background-position），时长 **700ms**，`linear` 或轻微 ease-in-out；**每次转场只扫一次**；全局高光角度统一为 105°（与阴影/渐变方向一致），所有屏共用同一角度变量（`--sheen-angle`）。
- **适用场景**：卡牌落定（P5 第 3 段）；牌桌进场时桌面亮起；按钮按压反馈。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：低（transform 实现时）；**若用 background-position/filter 实现则翻车**（paint-bound，低端机掉帧）——这是本模式唯一的技术红线。

---

### P9 玻璃景深面板（Glass Depth Panel）

**原型**：Apple 全系玻璃拟态面板（visionOS 窗口语言：半透明、低对比、悬浮在真实空间之上；HIG visionOS："you can **increase the object's translucency** … or **lower its contrast**"——半透明本身就是「这是空间中的一个面」的深度线索）。

- **视觉公式** `(设计推演)`：`background: rgba(255,255,255,0.06)`；`backdrop-filter: blur(20px) saturate(1.8)`；`border: 1px solid rgba(255,255,255,0.1)`；面板再垫 `translateZ(2px)` 微抬。**铁律：blur 参数永不参与动画**——动画只动 transform/opacity（HIG 避免高频动效 + blur 动画是低端机杀手）。
- **适用场景**：大厅房间卡片、牌桌信息条、结算面板的静态质感。
- **CSS 3D 落地难度**：**低**（backdrop-filter：Chrome 76+ / Safari 9+ 带前缀 / Firefox 103+，file:// 无限制）。
- **性能风险**：**高（低端机）**。backdrop-filter 把下层内容读回重绘，大面积 + 叠 3D transform 是最贵组合。约束：玻璃面积 ≤ 视口 30%、同屏 ≤ 2 块、转场 600ms 内冻结新增玻璃层；低端机开关（JS 检测 `navigator.hardwareConcurrency ≤ 4` 时降级为半透明纯色）。

---

### P10 聚焦暗场（Stage Spotlight）

**原型**：Apple 产品发布的「黑场聚焦」语言：黑色空间里单一对象被打亮、其余一切退后；HIG visionOS 的对比度控制（"lower its contrast to make its motion less noticeable"）反向应用——**用对比度引导注意力**。

- **视觉公式** `(设计推演)`：转场时全屏 `radial-gradient(ellipse at 50% 42%, transparent 0%, rgba(0,0,0,0.55) 78%)` 的遮罩层 `opacity 0 → 0.6 → 0`（先聚光旧屏焦点，再在新屏开场淡出），总时长 = 转场时长 620ms 对齐；焦点元素同时在遮罩最亮时刻完成换位——观众的注意力被暗场「押送」过去，弱化两侧画面的差异。
- **适用场景**：结算页开场（全场暗下、只亮战绩卡）；从自由大厅进入有仪式感的牌桌。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：低-中。radial-gradient 大面积合成层是静态的（一次光栅化）；不要给遮罩加 blur。

---

### P11 位移淡出跳切（Fade-Relocate）

**原型**：HIG Motion visionOS 一手条目，直接可抄的官方模式：
> "**Consider using fades when you need to relocate an object.** When an object moves from one location to another, people naturally watch the movement. If such movement doesn't communicate anything useful … you can **fade the object out before moving it and fade it back in** after it's in the new location."
> "In general, **avoid letting people rotate a virtual world** … consider using instantaneous directional changes during a quick fade-out."

- **视觉公式** `(Apple 文档+设计推演)`：旧屏整体 `opacity 1→0`，**160ms**，`linear`；瞬时换位（0ms）；新屏 `opacity 0→1`，**240ms**。两段间不加位移——承认「跳切」反而干净。判据：两屏之间**找不到任何可配对元素**时才允许使用本模式；找得到就用 P3。
- **适用场景**：加入页 ⇄ 结算页（语义上相距最远的两屏）；错误/异常回退。
- **CSS 3D 落地难度**：**低**。
- **性能风险**：极低。这也是 `prefers-reduced-motion` 的**默认降级目标**（HIG："Make motion optional"）。

---

### P12 步进序列仪式（Keyframed Ceremony / 帧序列的 CSS 化）

**原型**：Apple 产品页滚动动画的技术本质是**逐帧序列**（CSS-Tricks：canvas 按滚动位置逐帧绘制；GitHub apple-page-simulate：视频切成几百帧、滚动百分比取帧）——「帧的确定性」是 Apple 动画可信的来源：任何时刻暂停，画面都成立。纯 CSS 无 canvas，但可以用**确定性 keyframe 链**复刻「每一步都成立」的性质。

- **视觉公式** `(技术拆解+设计推演)`：把仪式拆成 4–6 个离散关键帧步（如：牌堆浮现 → 顶卡抬起 translateZ 30px → 翻转 P5 → 落定高光 P8 → 文字浮现），每步内用连续 easing、步与步之间用 `animation-delay` 硬对齐（步长 160–240ms）；每步的中间态都设计成「可单独定格为海报」的构图。对比 Apple 原法的取舍：牺牲逐帧自由度，换来零资产、零 JS、file:// 纯 CSS。
- **适用场景**：**卡牌仪式的整体编排**（P5 是其中的主步）；结算页名次揭晓（第 3 → 第 2 → 第 1 步进）。
- **CSS 3D 落地难度**：**中**（编排复杂度在 CSS keyframes 数量，技术本身简单）。
- **性能风险**：低。注意 `steps()` 只用于「数字/离散」跳变，连续运动用 bezier；帧链总长 ≤ 1.2s（HIG brevity + 可取消原则）。

---

## 二、一镜到底连续性清单（10 条验收判据）

> 「一镜到底」读起来连贯的本质（综合 WWDC18 Continuity、WWDC24 zoom、中文圈拆解共识）：观众的大脑在追踪一个**连续的相机 + 连续的光照 + 连续的速度场**。任何一条断掉，观众就会「意识到切换」。以下每条都可逐帧回放检验：

1. **单一运动源**：同一时刻整个转场只有一次主导运动（一个机位移动），新旧屏内容自身不叠加第二套独立动画。
2. **机位连续**：相机参数（perspective 原点、rotateX/Y、translateZ）在转场全程只做一次连续插值，逐帧无跳变、无方向反转。
3. **速度连续**：退场元素的末速度 = 进场元素的初速度（两条 bezier 在接点处斜率连续，速度曲线无尖峰）。
4. **配对元素**：转场中至少 1 个元素（标题/logo/卡牌/色块）在旧屏与新屏间有明确的单一位置+尺寸插值（from→to），观众视线可「搭车」。
5. **光照连续**：高光角度、阴影方向、整体明度在转场前后恒定（同一光源），扫光（P8）全站只有一个角度。
6. **层深秩序恒定**：背景/主体/前景三层的深度次序与速度比（近快远慢）在转场中不变，层与层不交叉换位。
7. **遮挡合法**：任何遮挡关系的变化只能由连续的 Z 轴运动产生，不允许 z-index/绘制顺序瞬时突变。
8. **时长预算且可中断**：普通换场 400–700ms、仪式段落 ≤1.2s；转场可被用户输入打断（中断即直接落定或反向，不强制播完）。
9. **焦点继承**：旧屏的注意力焦点元素（主按钮/标题）由新屏对应元素接棒（位置映射 + 同色/同形），焦点不凭空消失再凭空出现。
10. **降级保配对**：`prefers-reduced-motion: reduce` 时同一转场退化为 ≤200ms 淡入淡出（P11），但判据 4 的配对关系仍然成立（顺序、角色不变）。

---

## 三、不推荐清单（纯 CSS / 低端机会翻车的苹果效果）

| # | 效果 | 为什么翻车 |
|---|------|-----------|
| 1 | **Canvas 帧序列滚动叙事**（AirPods/MacBook 官网原法） | 需 100+ 帧图片资产与滚动 JS，与单文件/离线/点击驱动形态冲突；移动端解码+内存峰值大。结论：弃其形，取其「逐帧确定性」→ P12 |
| 2 | **滚动驱动转场**（CSS scroll-driven animations 原生方案） | 支持面不足：`animation-timeline` 为 Chrome/Edge 115+、**Safari 26+**，Firefox 至今仅 Nightly（"preview"，MDN BCD 实测数据）；且本项目是点击驱动，无滚动轴。只可作为渐进增强 |
| 3 | **动画 backdrop-filter**（玻璃面板 blur 值参与过渡） | blur 每帧全区域读回重绘；叠加 3D transform 时低端安卓直接掉到 <20fps。玻璃只静态化（P9），数值不动画 |
| 4 | **大角度 rotateX 大平面 + 正文文字**（地板/天花板视角） | 透视下文字非整数缩放重栅格化 → 发虚；大面积倾斜平面在软件光栅设备上纹理化昂贵。装饰性倾斜 ≤ 15°，正文保持正视 |
| 5 | **深层嵌套 preserve-3d + overflow/clip** | Safari 会把含 overflow/clip/filter 的 preserve-3d 子树**拍扁成 2D**，3D 层级静默失效；Chrome 与 Safari 渲染分歧大。3D 树内禁用 overflow，裁切用外层兄弟实现 |
| 6 | **无限循环环境动画**（产品页常驻漂浮/呼吸） | 常驻合成层耗电；HIG visionOS 明确警告 **~0.2Hz 的持续振荡**是人体最敏感频率——缓慢呼吸漂浮恰好落在这个区间。改为短暂入定动画 + 静止 |
| 7 | **filter / box-shadow / background-position 参与动画** | 全部 paint-bound（每帧重绘），非合成器路径；Apple 感的「光泽/阴影变化」一律改用 transform 移动静态高光层（P8 手法） |
| 8 | **弹跳（overshoot）滥用** | HIG："Don't add motion for the sake of adding motion. **Gratuitous or excessive animation can distract**"。弹性只授予卡牌仪式与庆祝时刻（P5/P12），常规换场 bounce = 0（对应 WWDC23 spring `bounce: 0`） |
| 9 | **View Transitions 大面积快照 + 重特效叠加** | VT 会把新旧 UI 截为替换图像再插值；转场域内若有大 backdrop-filter/巨大阴影/满屏渐变，快照与合成成本翻倍，低端机闪帧。转场期间冻结重特效，用 `::view-transition-group()` 限定动效范围 |
| 10 | **>800ms 不可打断的转场** | 违反 HIG "Let people cancel motion"；派对场景节奏密集，长锁转场会积压点击。所有转场 JS 侧允许「重入即落定」 |

---

## 四、CSS 3D 能力对照表（单文件 file:// 视角）

| 能力 | file:// 离线单文件可用 | 浏览器覆盖 | 性能风险（软件光栅/低端机） | 结论 |
|------|:--:|------|------|------|
| `perspective` / `rotateY` / `translateZ`（刚体转身、走廊） | ✅ 无任何限制 | 全绿（含旧 Safari 前缀时代） | 低：transform 走合成器；文字透视变形注意角度 | **主力** |
| `transform-style: preserve-3d` 多层 3D 树 | ✅ | 全绿 | 中：Safari 对 overflow/filter 子树拍扁；层多则内存涨 | 限制嵌套 ≤3 层 |
| `backface-visibility`（卡牌翻转） | ✅ | 全绿 | 低 | **主力** |
| CSS scroll-driven animations（`animation-timeline`） | ✅（协议无限制） | Chrome/Edge 115+，Safari 26+，Firefox 仅 Nightly（BCD：preview） | 低（transform/opacity 时 compositor 化，Chrome 官方性能案例佐证） | **不作为依赖**，仅渐进增强 |
| View Transitions API（同文档） | ✅ | Chrome/Edge 111+、Safari 18.0+、**Firefox 144+（Baseline Newly Available，web.dev 2025）** | 中：快照成本与转场域内特效量正相关 | **四屏换场的首选工程载体**，须备降级 |
| `linear()` easing（CSS 弹簧近似） | ✅ | Chrome 113+ / Safari 17.2+ / Firefox 112+ | 低 | 用它把 Apple spring（bounce≈0.15）烘焙进纯 CSS |
| `backdrop-filter` | ✅ | Chrome 76+ / Safari 9+（前缀）/ Firefox 103+ | **高**（大面积） | 静态小面积使用 |
| `will-change` | ✅ | 全绿 | 滥用反而制造层爆炸 | 只标当前动画层，结束即撤 |
| `@property`（数字翻牌计数） | ✅ | Chrome 85+ / Safari 16.4+ / Firefox 128+ | 低 | 结算页计分可用，Firefox <128 需降级 |
| `prefers-reduced-motion` | ✅ | 全绿 | — | 必接，P11 为统一降级 |

---

## 五、对本项目最有价值的 5 个模式（速览）

1. **P3 配对元素变形**：同文档 View Transitions API 已全绿（含 Firefox 144+），直接承载「头像卡→座位」「抽牌→结算卡」的单次 rect 插值，是四屏换场 + 卡牌仪式的工程与设计双核心。
2. **P1 深度走廊换场**：把四个屏放进同一 perspective 空间、换场即一次 620ms 机位推进，让「四屏」读起来是一「镜」。
3. **P7 速度匹配交接 + 清单判据 3/4/5**：退场末速度=进场初速度、必有一个配对元素搭车、光照角度全局统一——这是把「苹果感」从单点特效升级为系统语言的三条最低成本铁律。
4. **P5 卡牌翻转仪式 + P12 步进编排**：全项目唯一的弹性/表演预算集中地，三段式（预备 120ms → 翻转 480ms → 落定高光 220ms）+ 确定性 keyframe 链，替代 Apple 的帧序列而无需任何资产。
5. **P11 位移淡出跳切**：HIG 原文的官方降级模式——无配对元素的换场和 `prefers-reduced-motion` 统一落到它身上，保证仪式感再强也有干净的退路。

---

## 六、来源列表

**Apple 一手**
1. HIG – Motion（正文经 `developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json` 取得全文）：https://developer.apple.com/design/human-interface-guidelines/motion
2. WWDC18 session 803 Designing Fluid Interfaces：https://developer.apple.com/videos/play/wwdc2018/803/
3. WWDC23 session 10158 Animate with Springs：https://developer.apple.com/videos/play/wwdc2023/10158/
4. WWDC24 session 10145 Enhance your UI animations and transitions（zoom transition）：https://developer.apple.com/videos/play/wwdc2024/10145/

**Apple 官网实现逆向拆解**
5. CSS-Tricks – Let's Make One of Those Fancy Scrolling Animations Used on Apple Product Pages：https://css-tricks.com/lets-make-one-of-those-fancy-scrolling-animations-used-on-apple-product-pages/
6. 掘金 – 苹果官网动画探索（sticky / 三种进度控制）：https://juejin.cn/post/7178698886721044539
7. 腾讯云 – 聊聊苹果营销页中几个有趣的交互动画（120 帧翻盖 / 正中缩放）：https://cloud.tencent.cn/developer/article/1634380
8. CSDN – 苹果官网动画解析之 AirPods 滚动光影：https://blog.csdn.net/yanyi24/article/details/135623759
9. GitHub – apple-page-simulate（帧序列 + 滚动百分比）：https://github.com/Coiggahou2002/apple-page-simulate
10. UX Planet – 8 Things I Learned Analyzing Apple's Product Pages：https://uxplanet.org/8-things-i-learned-analyzing-apples-product-pages-9a5284681b37
11. 优设 – 为什么苹果的动效设计每一帧都让人爱不释手：https://www.uisdc.com/apple-dynamic-effect-design-2
12. 意派 Epub360 – 99% 的一镜到底 H5 都是这样的套路（Z 轴纵深布局）：https://www.epub360.com/blogs/article/5e742be70f10a301f31fa9f3/
13. SegmentFault – 从零到一实现通用一镜到底 H5：https://segmentfault.com/a/1190000017848401
14. 百度智能云 – 苹果官网滚动特效 CSS/JS 全解析（translateZ 视差）：https://cloud.baidu.com/article/3696128

**CSS 能力与兼容性**
15. MDN – CSS scroll-driven animations：https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations
16. MDN browser-compat-data `animation-timeline`（Chrome 115 / Safari 26 / Firefox preview）：https://github.com/mdn/browser-compat-data/blob/main/css/properties/animation-timeline.json
17. web.dev – Same-document view transitions are now Baseline Newly Available：https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
18. MDN – View Transition API：https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
19. Chrome for Developers – Scroll-driven animations（含性能案例研究）：https://developer.chrome.com/docs/css-ui/scroll-driven-animations 、https://developer.chrome.com/blog/scroll-animation-performance-case-study
20. MDN – cubic-bezier() / linear() easing：https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function/cubic-bezier

**同类产品借鉴**
21. Stripe – Connect: behind the front-end experience（Web Animations API 构建）：https://stripe.com/blog/connect-front-end-experience
22. Next.js – View Transitions 官方指南：https://nextjs.org/docs/app/guides/view-transitions
23. Linear 设计拆解（YouTube）：https://www.youtube.com/watch?v=uaLeHKCJqCI
24. Josh W. Comeau – Scroll-Driven Animations：https://www.joshwcomeau.com/animation/scroll-driven-animations/
25. ICS Media – Using CSS linear() for spring animations（引用 WWDC18 弹簧模型）：https://ics.media/en/entry/260402/
