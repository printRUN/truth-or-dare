# 真心话大冒险 - 在线多人游戏

## 1. Project Overview

**Type**: Interactive multiplayer party game
**Summary**: A real-time "Truth or Dare" game where players join with custom avatars, select truth or dare, and draw punishment cards with cinematic animations.
**Target**: Party settings, friends gathering, online multiplayer

## 2. Visual & Rendering Specification

### Scene Setup
- **View**: 3D 舞台（CSS 3D）——`#app { perspective: 1400px }` 提供透视，`#world3d`（`.world`）是唯一的「摄影机 rig」，四个屏（join/lobby/game/result）都在这一层里；屏常态下不挂 3D 变换（只有换屏那 0.64s 的 VR 扫视滑动，见下方红线里的 `pan-in/out`），每屏的常态机位在 JS `Cam.base`
- **Background**: Animated gradient with floating particle confetti, continuous slow-motion drift (one-shot camera feel)
- **Camera**: 无用户相机控制，全部由 `Cam` 调度为一条连续时间轴：`Cam.enter(name, dir)`（换屏时从**当前机位**续接的一段推进——先过冲再缓收常态，不再瞬移到 spawn；`dir<0` 为回退，镜头反向）、`Cam.home()`、`Cam.focus(el)`（推近到元素）、`Cam.nudge(el)`（滑向持麦人）、`Cam.shake()`（翻牌/暴击的震动）、`Cam.parallax(nx,ny)`（鼠标微视差）
- **Lighting**: Soft glow on active elements, neon accents on cards；牌桌由 `.table3d`（rotateX 62° 的椭圆渐变台面 + `#cam` 自带 `perspective: 900px`）充当「桌面反射」（2026-09 第三人称改造：世界俯角 rx19 后 74° 会净超 90° 翻出背面，必须降到 62°）
- **第三人称牌桌（2026-09 v6，用户点名「改第三人称、借鉴骗子酒馆」；设计/评审档案在 `.pw/design-plan-3p.md` + 三份 review-3p-*.md）**：进 game = 过肩视角——镜头在「我」身后上方，屏幕下沿中央是**我的背影** `#tp-back`，对面及两侧坐满其他玩家，中间是牌桌。四阶段（选卡/抽卡/揭晓/交接）桌子、背影、对手三者同框，任何阶段不许整体退场 ——
  ① **背影化身 `#tp-back`**：`#cam` 直接子元素（z35，`pointer-events:none`），**JS 量测驱动锚定** `anchorTpBack()`（renderGameStatic 每渲染 + 500-3000ms 五拍补测）：顶边永远压在「最低可见内容区（选卡/题面/代跳/悬浮押注）下缘 +6px」之下、绝不上探盖按钮（②公式在躺角+缩放+透视复合变换下非线性，必须读回 rect 迭代校准——v1-v4 公式版全踩坑）；无内容区时底缘贴视口下缘（近景裁切构图）；「逆光剪影」造型——身份色压暗做体（`--chr1/--chr2` 叠 --bg 半透明层，禁 filter）、细亮缘做形（肩线 1px 主轮廓光）、氛灯做魂（`::after` 青色 halo，说话覆写绿并随 `--voice` 亮度）。me 卡保留名牌/徽章但 avatar/身体 `visibility:hidden`（**不能 display:none**：flyAvatarToDeck 要量头像环 rect）；`.tp` 类只挂在 game 网格（renderPlayers 大厅/牌桌共用，泄漏=大厅正面卡被藏）。z 序：UI 浮层 40 > 背影 35 > 座次卡 10-30 > 毡面 -1；⚠ 两条特异度实雷：`#cam > :not(...)` 通配链**不许加 `:not(#tp-back)`**（会把 (1,2,0) 抬成 (2,2,1) 压过浮层 z40），背影/浮层都用 `#cam > #tp-back`、`#cam > #choice-section` 这类 (2,0,0) 写法；`#game-tools`/`#bet-box` 是 #screen-game 的子元素（#cam 的兄弟），要单独 `#screen-game > ...` 抬 z40；
  ② **全环 n 等分围桌（2026-09-18 改，用户点名「围绕桌子平均分布，有人加入自动重新分布」；旧「远弧」公式小人数把对手全堆在我弧端两侧、远半桌全空，且 3p 对手背对镜头——面向与视线夹角 116°，脸完全看不见）**：`layoutRing` 我仍锚 a=PI，其余人 `a_rel = PI + rel·2π/n`（rel=「相对我的入座次序」；加入者落我邻座、加入/离开时全员按新 n 重新等分=平移补位——真实圆桌语义，SPEC 在此注明防后人当 bug 修）；DOM 卡换座走既有 left/top 0.55s 过渡，GL 人物由 syncPlayers 记账+帧循环滑移（见 Three.js v7 ⑥）；**n=2 特例保留对手锚 a≡0**（front=−1，与我的 rs 差 0.21 ≥ test-3d 的 0.15 锁，逐字节基线）；纵深系数 0.08（远座投影卡宽 ≥64px@桌面，老值 0.16 会把远座压到 56px 不可辨）；n≥6 或（横屏/窄环且 n≥5）侧纵列阶梯：同侧座反向偏移（近座外移/远座内移），位移 land 46 / 窄 26 / 宽 38px，zIndex 仍按 front 分层（全环 n 等分下同侧最多 3 排封顶，旧远弧 n=16 可达 4 排）；**缩一档 rs×0.85 只给稠密档**（窄环/横屏全档、宽屏 n≥9）——宽屏 6-8p 开阶梯只为防「同柱纵叠埋名牌」（全环公式 6p 宽屏时 rel=1/2 同落 x=10.2%，近卡头像盖住远卡名牌=点名牌点错人，双检查官发现），再缩会跌破 64px 可读契约；16 人满员相邻座 3D 弦距 1.06（凳径 0.68 不穿模）、DOM 最近座 ±17.6% 不压背影；
  ③ **牌堆与桌面**：`.table-deck` scale 0.8 + opacity 0.95（静态，不再读作幽灵卡）；锚点 = 环心 + **8% 环高偏近侧**（n=2 时牌堆不被正对面卡压住）；`layoutRing` 锚定仍只用 offsetLeft/Top；毡面 `::before` h210%/top56% 向下探到座位脚下（rx19 俯角下近坡大远坡小读作桌面）；
  ④ **揭晓态牌桌常驻**：JS 挂 `#screen-game.stage-revealed`（renderGameStatic 的 revealed/choosing 分支锁检查后 + playReveal ③落定帧）——**绝不能改回 `:has(#card-section:not([hidden]))`**：老 WebView 静默不生效，且 dealFlyingCard 在 drawing 期就取消 card-section hidden 会把压缩插进推镜中途；规则 = **环高任何阶段保持原生值（桌子不许压缩——2026-09-14 用户反馈后废弃了 210px 压档）** + `::after` 静态压暗罩 rgba(10,10,26,.45)（**禁 filter:saturate**——挂在有常驻动画的环上=每帧重光栅化）+ 卡 opacity .85（.active 豁免）+ **题面卡与真心话/大冒险选项双卡都以 rotateX(12-14°) 躺角贴在毡面上**（`#card-section.on-table` 在发牌时挂上、选卡阶段摘除——牌背出现即躺着，翻面就在桌上原地翻，全程无向下漂移；选项双卡常驻躺角、transform 只做视觉不动布局；点击热区随视觉缩放，仍远超触控线）+ 竖屏押注面板改底部悬浮（`position:absolute; bottom:56px`，抽离文档流；包含块 `#screen-game.stage-revealed:not(.leaving)`——⚠ 裸 id 和 .stage-revealed 特异度都会压过 `.screen.leaving` 的 absolute，把退场旧屏留在流里顶出 result 屏，两处都实测过）；
  ⑤ **机位**：base.game = `{z:-56, rx:19}`（过肩俯视；landui 维持 LAND_CAM.game z-26/rx2）；spawn.game `{z:-412, rx:20}`（保持 356px 推进行程）；base.result `{z:-80, rx:11}`（离席后撤）；抽卡推镜落 `z≈-76 s≈1.05`（发牌无飞行动画：牌背在台面原地落定，翻牌后以躺角呈现在毡面上——2026-09-14 用户反馈去掉向下飘牌）；轮到我 = 背影 `.tp-forward` 前倾（持续态）+ 选卡瞬间 `tp-slam` 400ms 拍桌 + 我抽卡 `.tp-away` 离座（flyAvatarToDeck 对 `pid===myId` 早退，避免双我）
  降级：REDUCED 背影动画全停、前倾保留静态终态（「轮到我了」是无障碍信息）；loperf 同停 + 状态瞬移；`body.paused` 自动覆盖。
- **Three.js 真 3D 场景（2026-09-15 v7，用户点名「用 threejs 模拟真实 3d 游戏，头像改为人物戴着头像」）**：混合架构——WebGL 画布 `#three-canvas`（#cam 最底层 z0，pointer-events:none）渲染房间/圆桌/单柱脚/牌堆/**3D 人物**，DOM UI（HUD/名牌/选卡/题面/押注）叠加其上。要点：
  ① three.js r128 UMD **内联**进单文件（603KB，不走 CDN 保 file:// 离线）；可读模块源 `.pw/three-scene.src.js`；
  ② 门禁：THREE 存在 + WebGL context 可用 + 非 loperf → `body.three3d`；否则整条链路回退 CSS 3D（零删码）；loperf 中途触发/页面 hidden → 渲染循环自动跳帧回退；
  ③ **人物**：每玩家一组 3D 身体（凳+双段身体 chrHue 身份色+头球+上半球发色），**脸部 = CircleGeometry 贴玩家头像图**（resolveAvatar 的 dataURL 画到 160px canvas → CanvasTexture，SVG/PNG 都吃）；座位角复用 layoutRing 的分配（`window.__seatAngleByPid`），人物面向桌心；
  ④ **相机**：挂 `Cam.apply` 钩子，Cam.cur 姿态实时映射 three 相机（x 平移/高度随 rx/距离随 z）——一镜到底编排（glance/nudge/focus/shake）零改动驱动 3D 视角；
  ⑤ **名牌投影**：每帧把人物头顶世界坐标 project 到屏幕，DOM 名牌（头像/身体已 hidden，徽章保留）跟随；z 序按深度；me 名牌 pointer-events:none（不吞工具栏点击）；
  ⑥ 状态动画：呼吸（torso scaleY）/离座探身（.away 等价）/说话摇摆（voice 幅度）；人物同步走 600ms 节询（不 hook renderPlayers——其调用时序不可靠）；**换座滑移（2026-09-18 站位全环重排配套，`.pw/probe-seats-redistribute.cjs` 18 条）**：`syncPlayers(now)` 只记账——①ε 门（|Δseat|/|Δrot|>1e-4 才动，防节询同值重置在飞滑移）；②首见角色从座位外沿 r=SEAT_R+1.15 走入（出生点水平距 base 相机 <2.6 单位时改「原地放大」0.42→1 入场——13-16 人局近侧座免巨物贴脸；REDUCED 直接落位）；③换座=非走位/非揭晓期记 moveFrom（**当下实际位置**，链式重定向同规）/rotFrom/moveT0，帧循环 else 分支跑 0.7s 墙钟 smoothstep（指数式会被软渲 dt 钳制拖慢，同 REVEAL 红线）；④**走位中（u.go>0.001——每个 drawing/revealed 全程都成立，不是小概率）与揭晓近景（revealK>0.05||revealTarget>0）只写 pending 不挪 u.seat**，go 收敛/近景结束的安全帧由帧循环消费（抽卡者不许在牌堆旁横弹 ~1.3u、近景不许人穿框）；⑤滑移只写 x/z（y 归 cheer 蹦跳独占）、期间置 walking=事件驱动阴影跟随；
  ⑦ 特异度铁律再现：任何 #cam 子元素都会被 `#cam > :not(...)` 的 (1,2,0) relative-z2 通配压住——`#three-canvas` 必须写 `#cam > #three-canvas` (2,0,0)；
  ⑧ 调试句柄：`window.__three = { scene, camera, chars }`（必须写在 chars 声明之后，否则 TDZ 崩掉整条初始化链）。
  锚定实现（⚠ 实雷两个）：牌堆与 `.table3d` 光池由 `layoutRing` 顺手锚到环心，**只能用 `offsetLeft/offsetTop`（纯布局值）** —— ① rect 是投影后坐标，状态包在扫视/运镜中到达时会被动画扭曲（实测横向偏 47px）；② `.table3d` 的 rect 是 rotateX 62° 的透视包围盒（近大远小 → 中心偏下），拿它当桌心会把牌堆压到自己座位上。环 `display:none` 时跳过不写，保留上次可见值。另：`#table3d` 的 id 是这次补上的 —— `armTableLit`/`renderScreen` 一直用 `$('table3d')` 取元素，此前只有 class 没有 id，「点亮舞台/台面扫光」整段静默失效（真 bug，顺手修复）
- **Three.js 场景 v8（2026-09-16 优化轮，用户点名「头像映射/全屏/抽卡动画出卡在桌面」；方案 .pw/design-plan-3d-polish.md v3 + 三份 review-3d-polish-*.md）**：
  ① **画布出 #cam 挂 body 层全屏**（body > #three-canvas，fixed inset:0 z0——星空之上 #app 之下；landforce 下 fixed 锚到被旋转的 body 盒=逻辑全屏）。#cam 盒只有面板大且随阶段变高，v7 画布被裁剪+缓冲不随动=「场景压缩/裁剪」两症状的根因；size() 只量 canvas 自身 clientWidth/Height（禁 window.innerWidth，landforce 必错），dpr 动态封顶 min(dpr,1.6,√(2.3e6/(w·h)))——全屏化像素量 ×4.2，1440×900→1.33；
  ② **loperf 翻转 → retire3D() 全量退役**（frame 顶格检测）：摘 three3d 类/停 rAF/摘 resize/还原 Cam.apply+paintVoice 钩子/归还 reparent 按钮/清名牌 inline/Dispose GL/摘 canvas，同一同步函数。v7 只「跳帧」，CSS 回退层（tp-back 黑蛋/DOM 牌堆）复活叠在冻画布上=「混合怪象」（headless 弱机 perfWatch 必触发，chars=0 名牌漂虚空即此）；
  ③ **抽卡/出卡全程在桌面（GL；2026-09-18 落点改「该回合玩家面前」，见⑱）**：drawing 边沿 1050ms 洗牌后飞卡（deck(1.12,·,0.60)→**chooser 座向落点**单正弦弧 900ms+旋卡≤180°+落弹 80ms）→牌背脉动→.flipped 边沿 650ms 远边枢轴 −180° 翻面→题面 CanvasTexture 躺毡面（512×1024 POT+sRGB+LinearFilter，回合级重绘单实例复用，document.fonts.load 后画）。选卡双卡平贴毡面 x=±0.78（±0.62 内缝与「我」躯干同宽必穿帮），document 级 raycast 转发 choose()（否决名单+阶段闩锁+landPick；canvas pointer-events:none 红线不破）；DOM 选卡 opacity0.001+pointer-events:none（**禁 display:none**——E2E force 点击需要盒子）；
  ④ **揭晓近景 overlay（2026-09-18 起机位随卡走，见⑱）**：reveal = look + RY(φ)·(−0.9,2.08,1.14)（look=翻面后卡心，y=FELT_Y+0.05；φ=0 时与旧 REVEAL_POS 逐字节同构），墙钟定长 0.9s smoothstep 推进（指数式在软渲 3fps 下被 dt 钳制拖慢 3 倍——推镜/走位一律墙钟），题干落屏竖屏 ≥16px；推镜期间名牌投影/拾取读同一相机现算禁缓存；**🥚 瞄准态 revealTarget=0 拉远、收瞄准滑回**（flip 入口与 shown 期每帧各评估一次——⑮「任何阶段可扔」的保命闭环：近景机位随卡到抽卡者一侧后全员贴脸/出画）；REDUCED 瞄准同样生效（revealK=revealTarget 直跳）；
  ⑤ **头像真因修复**：脸盘 r0.19/z0.206 出球面（v7 z0.168 陷在 r0.2 头球内被深度剔除——「头像没映射」的实际根因），256px cover 裁剪+sRGB；emoji 头像直接画 canvas（avatarImgHtml 同步改文本 span——<img src="🐵"> 会向服务器发请求 404）；
  ⑥ **名牌**：投影=全屏画布 NDC−offsetLeft/Top 链（禁 rect 差值，landforce 旋转必错）；相机后/出屏的点不写样式（绝对定位曾把文档撑到 scrollHeight 13498）；15px+min-width 72px（≥768px 屏，竖屏不启用防互压）；名牌区徽章改流式排布（婷婷#6 胶囊叠罗汉）；
  ⑦ **工具行/动作条/押注面板**：#game-tools 移 body 层 fixed 钉底（.world 每帧写 transform→fixed 包含块变成它——SPEC「#app perspective」同类陷阱）+flex-wrap:nowrap !important（内联 wrap 会压过样式表）+子项 flex:0 0 auto；非 active 屏隐藏必须写在 frame 早退之前；#stage-actions（body 层 bottom+96px）收 reparent 的 #card-actions/#btn-reroll/#stake-row（记录原位，换回合/.leaving/retire 三时机归还）；竖屏 bet-box 让位 bottom:175px 不压题面；
  ⑧ **灯光/影/雾**：可见吊灯（罩底 y2.49+自发光内壁+罩摆±1.2° 只摆罩不摆光）+暖点光 0xffd9a8 挂罩内+Hemisphere(0x7078b8,0x2a1840,0.7)+冷补光 0.24（「我」的缘光，禁砍）+阴影 DirectionalLight(−1.7,6,1.3)（影短投向右后永不向镜头；shadowMap.autoUpdate=false 事件驱动；禁 Point/Spot castShadow=6-pass cube）；FogExp2(0x0a0a1a,0.042)+地板 r48（远缘融进星空）；ACES+sRGB（ exposure1.05，CanvasTexture 必须 encoding=sRGBEncoding 否则发灰）；
  ⑨ **既有雷两颗顺手修**：runStage fresh 分支 nudge(1240ms) 与 glance 第二段(920ms 收尾)的 token 竞态——慢帧率下 nudge 作废 leg2→done 永不触发→rx 冻在进场前（改 nudge 等 Cam 空闲再发射）；打字机完成回调 burst 用 #card-section rect（three3d 全零→彩带炸 (0,0)）——__three 追加 tableCenterScreen() 投影访问器，炸点南移+减量（近景彩带不穿题面）；
  ⑩ REDUCED 用 boot 快照分支
⑪ **第二轮用户实测反馈修复（2026-09-16 晚）**：①近景推镜没接电——syncCam 只挂在 Cam.apply 钩子，revealed 期无运镜时永不被调（触屏必死；桌面靠视差偶发）→ frame() 内 revealK 推进后显式 syncCam()（相机在账本内合规）；近景位姿实测定稿 (-0.9,3.1,0.5)（吊灯/两端人物离轴出画，推进时 lampG.position.y 随 revealK 滑出头顶）；②名牌投影直接写视口坐标曾漏 offset 链→修正后**直写即贴头**（伺服闭环实测引入追帧重叠，已回退）；出屏/相机后的名牌 visibility:hidden 不写不测；min-width 按 --rs 缩放补偿（updatePlates 内 JS 写 72/rs px，CSS calc 除 var 不可靠）；③SVG 头像 naturalWidth=0 使 cover 裁剪退化成超大裁剪→无固有尺寸改整图拉伸；题面卡归属头像复用已栅格化 canvas（avCanvasOf）；④免答牌/换一题后题面**签名边沿重绘**（qSig=punishment+choice+chooserId，否则玩家对旧题打完整轮——逻辑终审 P0）；⑤CSS 揭晓压暗罩 ::after 在 three3d 隐藏（它把 GL 题卡压暗一层）；完成啦组/押注行按阶段搬运（revealed/choosing 准入，dealFlyingCard 会提前取消 hidden）；CARD_LOOK 对齐翻面后卡心 (z=-1.28)；⑥工具行桌面折行全部可点、<768px 单行横滚+子项 flex:0 0 auto（内联 wrap 要 !important 才压得过）；远座名牌 min-width JS 按 --rs 补偿（渲染宽恒 ≥72px）。（禁新增 matchMedia live 监听——全文件 40 处同模式）；E2E：test-3d 加 A/B 相对帧率（软渲 SwiftShader 检测到则降级为信息记录——软渲 WebGL 1-2fps 无信号）、diag/smoke 钉 tod:perf='full'，probe-3p-verify 三处断言按 three3d 语义如实改写（卡面可见性/工具行选择器/名牌间距）。
⑫ **互动反馈轮（2026-09-17，用户点名「点击模式/牌有互动+点击效果 / 谁正在进行有提示 / 摸牌不穿模」；验收探针 .pw/probe-3d-feel.cjs 连续三遍全绿）**：
  ① **选卡互动（GL 侧 tapFx 等价物）**：3D 下 DOM 选卡 pointer-events:none，DOM tapFx 永不触发——GL 自建反馈层：hover=近侧探头（group.rotation.x −0.2·hov+抬 0.045，指数追踪）+ `body.style.cursor='pointer'`（只在命中态翻转时写）；press=按下回弹（mesh scale 0.95）+ tap 音；点击=选中卡毡面涟漪（RingGeometry additive 池 ≤4，0.55s 自清）+ 牌面白闪（emissive uniform 直写、2.4/s 衰减）+ 既有 65° 选中抬升。**白闪必须活过 resetChoiceCards**：本地模式 choose() 同步翻转 drawing、reset 当帧执行，reset 清 flash=玩家永远看不到反馈——flash 交给 tickChoice 自然衰减，reset 不清（hov/press 照清）。click/pointerdown/帧 hover 三个 raycast 入口共用 pickChoiceCard()（landPick+画布逻辑尺寸一套换算，禁分叉）。REDUCED 动画全跳、光标保留。
  ② **进行中光环 turnRing**：当前玩家（chooserId||activePlayerId()，choosing/drawing/revealed 全程）脚下双色 additive 环（0x22d3ee、fog:false、depthWrite:false、renderOrder 3、y0.015），每帧贴角色位置（含走位），呼吸 ±7%@3.4Hz；空闲/结算熄灭；**与角色同隐现（2026-09-18）**：被近景让镜剔除的角色不画环（`ringCh.visible` 门）——近景机位随卡到抽卡者一侧后抽卡者整段 revealed 被剔除，无此门会出「无身体的悬空光圈」入画；REDUCED 静态显示。DOM 侧「当前」徽章/.active-name 照旧。
  ③ **摸牌防穿模（几何级）**：旧走位=座位→牌堆 55%（终点 r≈1.67 深陷桌面，躯干/胸插穿台面）。新走位：停点=座位→牌堆连线上**桌缘圈 WALK_R=TABLE_R+0.57=2.62** 的首个正根（|seat+u·s|=WALK_R；牌堆在圈内⇒根必在射程内）；前倾改 **lean 髋部枢轴组**（buildChar 把 torso/chest/head/face/hair 挂 lean Group@y0.52，帧循环写 lean.rotation.x=−0.38·go）——旧版只转 torso，chest/head 脱节；呼吸 hair 基准同步改 lean 局部 0.825。0.38rad 与 2.62 联算保证上身越过台面高度带（0.875~0.965）时仍在围边外缘（r2.24）之外。**WALK_R/LEAN_MAX 必须成对复算**（探针钉 r≥2.42、lean≈−0.38）。
  ④ 探针纪律：交互断言必须**等运镜落定 + hover 稳定命中 420ms**——choosing 的 nudge 延迟 1240ms 且等 Cam 空闲（再 820ms 补间），卡会从静止指针下滑过，单次命中即断言会假绿/假红；choosing 相机本就停 z−76 位（focusCam 桌心北），投影点现算不缓存。`window.__three.feelState()` 调试访问器（追加访问器约定）。
  ⑤ **顺手修 verify 假红**：远座卡宽断言量的是 `.avatar-wrap`，min-width 补偿只写在 card 上时 wrap 贴内容宽（6p 远座 65px 贴 64 线，±1px 布局抖动即挂、随机视口漂移）——updatePlates 把同一 72/rs 补偿同步写 wrap（远座渲染宽 65→68，余量 ~4px）；retire3D 名牌还原补清 card/wrap inline min-width（v8 起就漏清 card 的）。
⑬ **第二轮互动修复（2026-09-17 晚，用户截图实测反馈：非回合也能点选卡 / 完成啦押注显示差 / 头像偏移被裁剪）**：
⑭ **头像裁剪真修 + 填表页精美化（2026-09-17，用户点名「头像还是被裁剪了 / 精美填表页」）**：
  - **3D 脸纹理**：圆形蒙版+cover 居中裁源图 → **contain 整图入画 + 圆角方章 squircle 蒙版**（roundRect(5,5,246,246,76)，四周 5px 蚀刻边）——旧蒙版把满幅头像四周整圈削掉（用户monster头像的眼嘴被裁没）。emoji 分支同蒙版。脸贴片 r0.225→**0.215**（仍>发壳0.207）：满幅蒙版下侧座斜视角在头轮廓外露彩色月牙边，收半径+蚀刻边双保险（走查 P1 实拍确认消除）。
  - **填表页**：纯 CSS 观感层（id/handler 不动）——渐变标题+饰线、玻璃卡发丝线+内阴影、标签渐变圆点、输入框深底内阴影+聚焦光环、#input-room 大字距大写、av-tabs 分段胶囊、头像磁贴 52圆→54方圆（与3D脸呼应）、题库套装渐变选中态、#btn-join 大 CTA+循环流光（@keyframes cta-shine；**REDUCED 媒体块与 body.loperf 双退路已补**）、链接 ghost 药丸、details.join-adv ▸ 旋转箭头。<619px 收紧（磁贴 44/列 48/CTA padding 12）把 CTA 收回 390×844 首屏（iOS 可视高 ~664 折线问题，走查 P1）。滚动带渐隐 mask 12→20/22px。
  - 取证：.pw/debug-avatar-crop.cjs（4人桌，北座朝镜头看脸；像素采样 corner/edgeMid/diag45 断言蒙版形状）、.pw/debug-join-shots.cjs（1100/1440/390 三视口 + adv 展开态），shots/avcrop-*.png、join2-*.png。verify 42/42 两遍全绿、挑刺专家 SHIP（P1×2 已修）。

  ① **选卡互动回合门禁 iCanPick()**：镜像 choose() 的校验（非 free 模式 chooserId===myId；free 模式麦没被抢）——hover 探头/光标/按压/涟漪/白闪/65° 抬升/闩锁全部只给「轮到我」的客户端；观众点卡零暗示零状态消耗（此前观众能触发抬升+闩锁再吃一个「还没轮到你」toast）。
⑮ **弯腰方向修复 + 免答牌重抽 + 表情包气泡 + 🥚 扔鸡蛋（2026-09-17，用户反馈「弯腰拿牌方向错了/免牌时刷新牌要重新抽牌」；趣味点名「右上角特效改 3D 小人表情包/扔鸡蛋」）**：
  - **摸牌前倾符号修正**：`lean.rotation.x = +LEAN_MAX·go`（曾写 −0.38 把上身旋向本地 −Z=背对牌堆——角色 +Z 经 baseRotY/朝牌堆旋转后指向前方，负角=后仰，「弯腰方向错了」真因）。数值 0.38 与 WALK_R=2.62 的防穿模联算不变（当初就是按前向倾算的），feel 探针断言已改 `+0.38`。
  - **免答牌/换一题 = 收牌重抽**：qSig 签名边沿不再原地换皮——非 REDUCED 时置 `qDrawn=false` 并进 `reback`（300ms 翻回背面）→ `refly`（420ms 倒放飞卡弧线收回牌堆）→ 无缝复用既有 `fly`(900)→`pulse`→`flip`(650) 全链重新发牌翻面（翻面入口 qDrawn=false 拿新题重画 CanvasTexture）；REDUCED 保持题面瞬换。drawing 边沿相位表与 flip 准入门都补了 reback/refly，防中途新回合把状态机卡死。
  - **表情包气泡**：`spawnReact(e, seed, pid)` 带 pid——`body.three3d` 且发送者在 chars ⇒ `__three.reactBubble(pid,e)` 头顶 emoji Sprite（128px CanvasTexture sRGB、弹出超冲+上浮 0.5+末端淡出、≤8 颗、fog:false/depthTest:false/renderOrder6、跟随走位）+ 小人 `cheer` 蹦跳 1.1s 衰减；返回 false（大厅无 chars/loperf/retired）才回退 DOM 表情雨。发送者本机即时演，对端走既有 react 频道。
  - **🥚 扔鸡蛋**：`p.eggs` 库存（normState 缺省 1/startGame 重置 1/myPlayerTemplate 随 myRecord 重连保真）；**完成挑战 = 赢家 +1**（closeTurn accepted 分支，上限 9 防状态包膨胀，跳过/代跳不加）。交互：#btn-egg（🥚×N，工具行）→ `body.egg-aim` 瞄准态（金圈脉冲+名牌虚线圈+十字光标，9s/Esc/再点取消）→ 点目标**名牌或 3D 小人本体** `throwEgg(pid)`——**任何阶段可扔（2026-09-17 用户反馈「只有准备阶段能点人」的真因：瞄准态曾只认名牌，抽卡/揭晓近景里名牌缩小或被裁剪隐藏，点放大的 3D 本体走 GL 画布点击被直接 return）**；GL click 处理器的 egg-aim 分支对可见 chars 递归 raycast（父子上溯取 userData.pid；命中涟漪+tap 音+throwEgg；REJECT_SEL 之前的简单 return 守卫必须删除——它先执行会让 raycast 分支永不跑，`__rayDbg.eggHits` 无字段即此症）；点自己/0 颗被拦+toast（mutate 扣蛋防并发负数）。传输复用 react 即发即忘频道 `{egg,from,to,mid,t}`（onReact 前置分流 onEggMsg，独立 mid 去重+5s 时效，不撑状态包）。表现：`__three.eggFx(from,to,isMe)` 3D 飞蛋 1.15s 弧线（小蛋滚动自旋）——**被砸端蛋 0~45% 全透明「看不见」、45~75% 临头才显形并放大冲向本机 camera.position**，命中即 DOM `.egg-splat` 糊屏（body 层 z1295：多段 radial-gradient 蛋清 blob+蛋黄+两道流挂 drip，4.2s 后 0.6s 淡出自清；REDUCED/loperf 静态退路已补）；旁观端蛋飞向目标小人+**蛋碎三连（2026-09-17 用户反馈「蛋砸到 3D 人脸上就消失」）**：①`eggFaceSplat` 目标小人**脸上糊一滩蛋液**（256px CanvasTexture：三瓣正弦扰动蛋清团+蛋黄+下挂蛋液竖条；billboard Sprite 挂人物组随走位/点头，0.62 单位、超冲弹入、4.5s 内缓缓下淌 0.14 并淡出，随删池 ≤6）；②`shellBurst` 蛋壳/蛋黄碎粒迸溅（12 颗共享几何小球池 ≤26，随机上抛+4.2 重力+毡面 0.3 弹跳+自旋，0.95s 淡出）；③既有毡面白涟漪保留。被砸端命中瞬间另加 `Cam.shake(5,260)` 镜头轻震（GL 相机经 Cam.apply 钩子同震）。fxState 增 `shells`/`faceSplats` 访问器。无 3D 回退=目标端 900ms 延迟直接糊屏。音效新增 `splat`（闷响+啪+低通白噪声溅开，SFX.noise 脉冲）与 `pop`（表情气泡弹出，短促上滑啵）——**发表情与扔蛋全链路有声（2026-09-17 用户点名）**：表情 3D 气泡路径播 pop（此前提前 return 吞掉 react 音）、DOM 雨路径保持 react；扔蛋 whoosh 出手全场播（playEggFx 统一，投掷者不重复）、splat 命中全员同刻。落点撒 seed 哈希让每颗蛋糊的位置略不同。横屏工具行 12 颗按钮重新压回一行（landui 档 0.62rem/4px gap/5px padding，test-landscape「不横向溢出」契约）。
  - **🃏 牌堆洗牌 GL 化（2026-09-17 用户点名「洗牌动作不要少」）**：CSS 层 `.deck.shuffling` 的 GL 等价——`deckShuffle`（0.95s）：顶两张左右交叉互换+上浮+随机转角、中层微位移、牌背 emissive 脉动；**待抽的牌先躺上牌堆顶跟着一起滑**（顺手修掉旧版「牌先出现在桌心北、飞卡起点又瞬移回牌堆」的隐性跳变），fly/refly 起止高度改堆顶 0.06；drawing 边沿与免答重抽收牌各洗一遍（waitfly 600→1050ms，总时长不变——原为 pulse 空窗）；洗完顶两张层位/转角互换=「牌序洗过了」；REDUCED 不洗静态退路；fxState 增 `shuffling`。
  - 探针：`.pw/probe-egg-react.cjs`（8881，32 条：大厅雨保留/3D 气泡替代 DOM 雨/初始 1 颗/瞄准-投掷-糊屏-自清/0 颗拦截/洗牌开合/免答重抽相位链+cardPos 终态回归锁/揭晓阶段点本体投掷/完成 +1 蛋）；`.pw/probe-3d-feel.cjs` lean 断言翻正。
⑯ **全流程玩家模拟走查 + 主持人换题被押注浮窗遮挡修复（2026-09-18）**：
  - **`.pw/probe-persona-full.cjs`（8895，三人房完整对局 20 项）**：建房→三人入座→开局→三回合（完成=+10+1蛋 / 抽卡阶段观众点 3D 本体扔蛋+跳过=−5 / 免答牌收牌重抽后完成）→表情气泡→主持人（🎲 随机点名等光圈落地、🎲 换一题、🏁 二次确认结算→颁奖台→🔄 再来一局重置比分与蛋）→**刷新自动回房同身份**→退房；全程零 pageerror。走查探针自身三课：waitForFunction(fn, arg, options) 别多传位参（断言恒 false 假卡 30s）；随机点名的光圈 ~2s 后才落 designate，脚本须等 chooserId 变更再操作；近景相机距走位者可近至 0.4 单位，「投影在视口内」判据不适用（射线命中即可）。
  - **真 bug 修复：主持人旁观时 🎲 换一题被押注浮窗盖死**——host 旁观 revealed 时 #bet-box 与 #stage-actions（内含仅剩的换一题钮）同区叠放，#bet-box 后画覆盖拦截点击（走查取证 cov=#bet-box、handler 计数 rr=0、seq 不变）。修复：frame() 押注可见且换一题在浮窗内时，实测 #bet-box 顶缘把 #stage-actions 让位到其上方（bottom 帧内仅变化才写；押注收起即还原默认锚点）。
  - test-audio 残留断言改轮询等清空（软渲下 560/760ms 清理定时器可被 WebGL 帧阻塞晚 ~0.5s，单点 900ms 计数假红）。
  - **双检查官终审修复（SHIP WITH FIXES → 全修）**：① **flip 准入门补排 `fly`/`waitfly`**——重抽 refly 交棒 fly 的下一帧 DOM `.flipped` 仍在，不排会把飞行中的卡当场劫持成「牌堆原地翻面、桌心无卡」（探针只采样相位看不出来，已加 cardPos 终态断言：rest x≈0 而非牌堆 x≈1.12）；② **发送端统一 mid 并经 onReact/onEggMsg 预登记**——MQTT broker 会把 publish 回投发布者，「本地演 mid 与回声不同」是双份特效（线上投掷者两颗飞蛋/表情气泡双跳；sendReact 的 DOM 雨时代双滴同病顺手治）；③ 🥚 瞄准态屏蔽 GL 选卡 raycast 两入口 + CSS 路径 `body.egg-aim #choice-section .choice-card{pointer-events:none}` + 1.5s 投掷冷却（防满 9 颗对同一人叠糊屏/双击误触）；④ three3d 瞄准金圈改描名牌本体（`.avatar-ring` 在 3D 下 visibility:hidden，::after 全灭）。
  ② **动作条/押注面板浮窗化**：#stage-actions 从全宽渐变贴条改 fit-content 玻璃浮窗（贴工具行上方 bottom 64px，按钮放大到 42px 主操作级、换一题虚线改实边幽灵键）；#bet-box **上收 body 层 position:fixed**——它在 #screen-game 里做 absolute 只能锚到内容盒（屏盒高度随内容，bottom:60 实际落在屏中部叠题卡），与 #game-tools 同一个「.world transform → fixed 包含块」陷阱的解法；bottom 动态实测工具行顶缘（折行行数随视口变，可见时帧内读、仅变化才写）；hidden 属性仍由 renderBetBox 全权管理，retire 归还。
  ③ **头像曲面脸贴片**：v8 的平贴片（CircleGeometry@z0.195/0.21）斜视角下视差错动半个头宽（用户截图「头像偏移/被裁剪」真因，z 微调治不了）——改为**头球同心球面贴片** SphereGeometry(r0.225, φ/θ 各 1.4rad 朝 +Z)，整体在头球 0.2/发壳 0.207 之外任何方位角都贴头；头像画布加圆形 destination-in 蒙版（角透明 + alphaTest 0.5）保持圆脸造型；drawQuestion 的圆裁剪不受蒙版影响。
  ④ **近景贴脸角色让镜**：REVEAL 机位落在座位弧旁，相邻角色只剩半个头占画幅——revealK>0.55 时水平距相机 <2.05 单位的角色隐藏（回座还原），名牌联动 visibility:hidden，culled 变化时 shadowDirty()。
  ⑤ **focusCam 零尺寸目标修复（v8 遗留竞态现形）**：three3d 牌堆 DOM 自 v8 隐藏，focusCam($('deck')) 读零 rect 早退 → 抽卡推镜静默死亡；此前全靠「选卡 nudge 恰好已把 z 送到 -76」兜底，点击快于 1240ms nudge 时（nudge 被 drawing 边沿 clearStageTimers 清掉）z 永远停 -56 宽景。现在 focusCam 对零尺寸目标照走推镜（无 x/y 偏移、z-20/s×1.05 与 Cam.focus 同参、lastFocus 照记）——test-3d 三条运镜断言恢复确定性通过。
⑯ **窄屏工具收纳 🧰 浮标 + retire3D 归还 display（2026-09-17，用户截图反馈「tool-row 底部滚动显示不全/按钮挡游戏」）**：
  - **窄屏（<768px）three3d 工具行不再钉底横滚**（12 颗按钮横滚藏起一半+常驻挡桌面）——改右下角 **#tools-fab 🧰 浮标**（48px 圆、z41、仅 `three3d`+窄屏+game active 由 frame() 写显隐）点开右下角玻璃面板（#game-tools 原元素改 wrap 全量展示：max-width min(92vw,360px)、无横滚、右对齐锚 FAB 上方 66px）。桌面 ≥768px 照旧常驻折行，CSS 回退层（loperf/无 WebGL）零改动。开合状态 toolsOpen：窄屏默认收起、重进牌桌复位收起、点面板外（document pointerdown capture）收起；**btn-egg/btn-stats/btn-settings-game/btn-pick-next 点按即自动收**（瞄准/弹层/桌面反馈要看见牌桌），**finish/end 的 armed 两段确认不收**（首点收了二点就没）。#bet-box 帧内锚定在面板收起时回退 `calc(safe+68px)`（量不到行顶时锚 FAB 上方）。pick-tip 文案「按下方」改「在工具面板里点」。无新增动画=无需 REDUCED/loperf 退路；REJECT_SEL 的 `button` 选择器天然覆盖 FAB（raycast 不吃）。
  - **retire3D 归还清单补第 13 项：inline display**——`auto` 省电模式在**大厅/填表期**就可能实测帧率翻转 loperf（perfWatch 中位帧间隔 >26ms），此时 frame() 的显隐写入永远停在 lobby 时代写下的 `display:none`，retire 后工具行在 CSS 回退局**整局不可见**（结算/设置/退出全死，sim-mobile 真机档实测才现形；v8 只考虑了局中翻转、残留 'flex' 无害的路径）。bridgeTools 记 origDisplay，retire 时归还。#tools-fab 随 retire3D remove。
  - E2E：probe-3p-verify 竖屏档工具断言分叉（FAB 在屏内可点 → 点开后面板无横滚全按钮可点 → 还原收起）；sim-mobile 结算前按 FAB 有无开面板 + three3d 选卡改 evaluate 级 click（E2E 契约补齐）+ #card-section 等 hidden 属性换 waitForFunction（契约既有条目补齐到本脚本）；test-landscape 740 档改判「玩家卡不压 FAB 矩形」。取证 .pw/probe-tools-fab.cjs（8873，14 条全绿）、.pw/probe-fab-landui.cjs（8877，4 条：landforce 旋转系下 FAB 落视觉左下角、命中/面板全正常）。门禁：verify 五档全绿、sim-mobile exit=0 零 JS 错、test-landscape 64 断言 0 失败（长跑尾段被环境杀进程，断言无一失败）、check-syntax 过。
⑱ **选卡可读性 + 题卡落点=该回合玩家面前（2026-09-18，用户点名「选择模式看不清：浮动文字提示+互动光效加强 / 卡片翻牌后的位置要到该回合的那个人面前」；方案 .pw/brief-choice-upgrade.md + 双挑刺专家 SHIP WITH FIXES 全修 + 双检查官终审全修；验收探针 .pw/probe-choice-upgrade.cjs 34 条）**：
  - **题卡动态落点（solvePlacement/ensurePlacement/cardPlace）**：旧版写死桌心北=2p 局牌躺对面面前；现按 chooser 座位方向放牌——翻面前卡心 d̂·(R+0.64)（近抽卡者，外缘 ≤2.05 毡缘内）、翻面后卡心 d̂·R（横屏 1.02/竖屏 aspect<0.8 收 0.92）、枢轴 P=d̂·(R+0.32)；`flipG.rotation.order='YXZ'`（创建时设一次，运行期禁改）让 −π 翻转绕「已偏航枢轴边」进行——卡向桌心翻、题面对抽卡者正读。**座次是每端自我中心的**（我恒南）：方向解析链=chars.get(pid).userData.seat（零向量守卫>1e-6，**绝不用 ch.position**——drawing 期人正走向牌堆）→`__seatAngleByPid`（同步值）→null=旧北位兜底；每端各自把牌放到「本端眼中 chooser 面前」，2p 对座局两端 φ=0/π 镜像成立。**避障**（PLACE_OBST=牌堆0.62 含洗牌横移包络/选卡双卡0.55×2，双卡 drawing/revealed 期仍在桌上）：径向降档(1.02→0.90→0.80)→切向侧移 ±0.30→限角旋转 min(60°,max(24°,180/n−8°)) 步进 0.12→最小侵入兜底（绝不跳旧北位=牌落对面面前）；**已知几何死点**：≥9p（及 4p 竖屏）正东族座位无干净解，落最小侵入兜底（牌与双卡视觉叠压，dot≥0.72 面前锥保住、功能无损，接受）。**deckL=R(−φ)·(DECK_POS−P)**（lx=dx·cosφ−dz·sinφ，减号写反=牌堆顶悬幽灵位；2p 的 φ∈{0,π} 是 RYm 符号退化 case，探针必须用非平凡 φ 做世界回投锁）；堆顶待抽卡朝向 `rotation.y −φ` 补偿（fly 起点连续：`sin·2.6−φ(1−k)`；refly：`sin·2.2−φ·k`）。**三时机幂等**（chooserId 为键）：drawing 边沿（先于一切卡位写入，含 REDUCED）/翻面入口（堵 revealed 期刷新从未过 drawing 边沿的洞）/qSig 边沿（qSig 含 chooserId——revealed 期换人落点跟随，免答重抽同 chooser 落点稳定）；park 分支清键强制下回合重算。
  - **选卡可读性层（全 GL Sprite/平面，reactBubble 同语言 fog:false/depthTest:false/renderOrder 6，不进 raycast 命中表）**：①双卡词牌 Sprite（384×160 胶囊 CanvasTexture，scale 0.62×0.26 @(±0.78,FELT_Y+0.80,−0.12) 抬到卡上沿不盖卡面图标）；②状态条 Sprite（704×112，scale 1.42×0.226 挂**双卡近侧下方空带 (0,FELT_Y+0.26,+1.28)** 桌面/竖屏同位——上方竖带被 DOM turn-info 与词牌行带咬死塞不下 40px 胶囊（实测取证），近侧毛毡带与两者天然解耦）：「轮到你了 · 点一张」**严格=iCanPick()** 且 choosing 全程持久（选卡者此前没有任何可操作指令）；旁观「等待「名」选择…」名字>4字截「名…」、**4s 后淡出**（静=信息动=邀请）；文字重绘只在签名（kind|name）变化时（回合级豁免同 qSig）。③tipFade 指数 6/s、目标 0 且 <0.012 钳 0 并 visible=false（不烧空 draw call）、创建时 opacity=0+visible=false 防首帧闪满亮、REDUCED 直赋值。**探针 hit() 断言红线**：Sprite 矩形是 {w,h}、DOM 是 {width,height}，字段混用比较恒 NaN=false——遮挡断言必须归一化（曾全绿假象）。
  - **卡下光池+卡面自发光（邀请语义分级，静/动分线）**：光池=共享径向渐变白纹 PlaneGeometry 染色（真心话 **0x38bdf8 青蓝**——品牌蓝 0x3b82f6 在紫毡色相 258° 上被吞成「偏亮的紫」；大冒险 0xf97316），additive+fog:false+depthWrite:false、renderOrder 2、y=FELT_Y+0.008（涟漪 0.012 之下）、scale 1.5×1.9（±0.78 双池恰不相交）、visible=choosing（非选卡期 0 draw call）；呼吸 0.34±0.16@3.4Hz（与 turnRing 同拍）+hover×1.35 **只在 iCanPick() 生效**（⑫① 门禁同规）；旁观恒 0.10 静态纯指认（呼吸=可点暗示，违⑫①精神）。卡面 emissive.setRGB 按卡色染色（me 0.10+0.10·breathe+0.18·hov / 旁观 0.04 / 非 choosing 0），flash 白闪优先不叠染。全部 uniform 直写禁 needsUpdate。
  - **近景连带**：贴脸剔除半径内含抽卡者本人（相机随卡到其座位侧）——turnRing 同隐现（见⑫②修订）；🥚 瞄准拉远闭环见 v8④。
  - 探针：.pw/probe-choice-upgrade.cjs（8921，34 条：双端落点=seatDir·R/飞卡起点世界坐标=DECK/RYm 非平凡 φ 回投/避障+面前锥 dot>0.72/竖屏 R0.92/提示淡入淡出与静动分级/桌面+竖屏 bbox 两两不相交/瞄准拉远-回近）；probe-egg-react ⑥b 改走「瞄准拉远→点本体」（近景点人依赖拉远）；probe-3d-feel turnRing 断言改「环可见⟺角色可见」一致性语义；回归 test-3d 37/37、probe-3p-verify 43/43、probe-persona-full、probe-egg-react 全绿。


#### 3D 实现的红线（踩过的坑，改动前必读）
- **`.world` 绝不能开 `transform-style: preserve-3d`**：一旦开启，浏览器做 3D 命中测试时父平面（z=0）会盖过 `translateZ(-40px)` 的子屏，`document.elementFromPoint` 返回 `.world`，**全站按钮/输入框点不动**（`details/adv summary` 都打不开）。现在就义：世界层是「带透视的单平面」，屏内命中就是普通 2D；`.cam` 自己开 `perspective` 给牌桌子元素用。回归锁在 `.pw/test-3d.cjs`（`transformStyle === 'flat'` + `elementFromPoint` 命中自身）
- **`#app` 的 `perspective` 会把它变成 fixed 后代的包含块**：`.toast` / `.burst-container` / `.react-bar` / `.modal-mask` 必须留在 `#app` 外，否则定位基准会变
- **3D 座次只写 CSS 变量**（`--rx/--ry/--rs` + `zIndex`）：`layoutRing()` 只在名单结构变化/窗口 resize 时重排，不逐帧计算；前排（`--ry` 大）必须同时 `--rs` 大、`zIndex` 大（近大远小 + 前后遮挡）
- **换屏 = VR 扫视换场（2026-09 v3，用户点名的形态）**：不是面板翻转硬切，而是「镜头像转头一样扫过去」——换屏的两个场景像**并排的两个房间**：入屏 B 从 `+S` 滑到 0、出屏 A 从 0 滑到 `−S`（`--pan-dir` 随 `.world.tx-back` 整体反号），S = `calc(var(--lvw, 100vw) + 280px)`。扫视中段两房同框、中间露出 **~280px 的真实空隙**（背景星空）——「VR 里左右看，两个房间之间还有空间」。恒速三段键帧（缓入 22% → linear → 缓出，C1 连续）让缝在屏 ~54% 时长；「偏头一瞥」由 Cam.glance 承担（见下），**面板只滑、镜头只转——单一运动源，B 自身的 rotateY 入场是双旋转源，禁**。滑动距离必须用逻辑宽 `--lvw`（landforce 旋转兜底下 innerWidth 是物理竖屏宽；旋转机型上扫视读作纵滑，对称性不丢）。pan-in **终帧写字面 `transform: none`**、**不写任何 opacity 关键帧**（门控纯几何，加载层 0.95 半透下透明度门控会露底）；落位后摘类、常态 `transform: none`（旧版立方体铰链 `--tx-r/--tx-a` 与随转角明暗背板 `plate-in/out` 已退役）
- **恒亮房间墙（扫视的必备件）**：`.screen` 本身没有背景（内容浮在星空上），没有这堵墙「两个房间之间还有空间」就读不出来——`.screen.entering/leaving::before` 各背一块深色板（`body:not(.loperf)` 才挂、`z-index:-1`、inset -14px），扫视全程恒亮 opacity 0.92（cube 那套随转角明暗是「翻面光照」，扫视中面板始终近正视，恒亮才对），加一道朝缝一侧的内发光（`--pan-dir` 定向，读作「空隙的光溢到墙上」）；入屏的墙在自身关键帧 82%→100% 溶解归零（落位前归零，不靠类摘除定时器），**基态必须 opacity:0**——动画是 backwards 填充，结束瞬间回落基态，基态若是 1 会在「动画已完、类还没摘」的窗口里凭空亮出暗板（probe 实测逮到过）
- **深度参照层（扫视的「参照物」，2026-09 v4.2）**：只有两块面板在动、背景与镜头无关时，大脑没有深度梯度可读，会读成「两张卡片平移」——`#bg-canvas > #depth-stage` 在两房之间的空隙里摆了五档深度的参照物：远星(0.14S) → 中星(0.32S) → 光柱(0.5S) → 透视地板(0.67S) → 近景尘埃(0.8S)，全部与面板**同一条 640ms 时间轴、同一套恒速三段缓动**（`depth-pan` 关键帧复刻 pan-in/out 的分段结构，层间视差比恒定，脱拍即穿帮）；`armDepth()` 在 queueSceneEnter/hideLoading 内与 armPan/playSceneEnter 同拍武装（`body.tx-run` + `--tx-delay` 同一延迟），扫完 delay+1150ms 摘除。四条铁律：① **每层滑动距离必须是自己背景平铺周期的整数倍**——摘类瞬间 transform 回 none，图案瞬移整数个周期肉眼不可见（零残差不靠 JS 补偿）；② 层全是 background 平铺、无子元素、无 blur/滤镜，常态 transform:none 不进命中栈，两侧各外扩一个 `--tx-d` 防满行程露底；③ 透视地板的 rotateX 在静态包装层（`.floor-tilt`）上，动画层只做纯 translateX，几何用 63°/55vh/perspective 640px（75° 会把平面压成 ~55px 细带读不出地面），远端地平线渐隐盖边缘。REDUCED/LOWPERF 不武装（CSS 同步 `animation:none` 兜底）；Cam.glance 同步升级：偏头之外加 1.15° 压肩侧滚 + 24px 前倾（「带头部的转身」与「云台平移」的区别所在）；④ **填充必须是单操作 SVG data-URI 平铺纹理，不许活渐变**（2026-09 实雷）：软件光栅下牌桌 16 人波纹环持续产生 damage rect，重绘逐像素跑渐变数学，五层活渐变实测大厅 p95 16.8→33.3ms（60Hz 两档量化直接置零一档）；换单张 background-image 的 SVG 纹理后恢复 16.8 持平 HEAD——单绘制操作的层透明度可被折叠进该操作（免离屏缓冲），SVG 也只按 tile 尺寸栅格化一次、之后重绘全是位图 blit；tile 周期关系（①）不受绘制内容影响。⚠ 反面教材：background 纯色 FillRect + 层透明度实测同样 33.3ms——别以为「填纯色总够便宜」，多操作/效果节点路径一样贵
- **加载严格门控（用户点名的第二条）**：加载层揭幕 0.26s（opacity+scale，**禁 blur**——paint-bound 大层）；`armPan`/`playSceneEnter` 仍在 `hideLoading` **同步同拍**挂载（旧屏此刻刚丢 `.active`，`.leaving` 是它唯一的显示来源，晚一帧就「凭空消失再弹回」），起扫用 `animationDelay: 280ms + fill-mode:backwards`（**> 260ms 揭幕**：幕完全落下、旧屏独处一拍，才开始扫）——延迟期 A 停在 from 帧（原位 opacity 1）、B 停在 `+S` 视口外一像素不入画。**绝不许改成 JS setTimeout 推迟挂载**；镜头的偏头一瞥（`Cam.glance`）用 `to()` 的第 5 参 delay（rAF 时钟，token 作废机制照常接管），**武装点在 playSceneEnter 内与面板同拍**——挂在 renderScreen 同步路径的话，加载路径下偏航会在层后独自跑完（工程审查实雷）。⚠ `renderScreen` 的 forEach 清理**必须跳过正在扫视的 `.entering`**：状态回包会重跑这里，清掉 animationDelay 会让面板提前起滑、与镜头脱拍（probe 实测逮到）
- **相机职责（Cam.enter / Cam.glance）**：`enter()` 只记账 + REDUCED(jump)/LOWPERF(直通 to(b,540))——**正常路径的运动全部在 glance**：偏头 7°（窄屏 5°）+ 10px 侧倾弧，两段都 dolly（out 起步斜率 3 会抽搐），目标**相对 base**（`(b.ry||0) − G·ahead`，join 基线 ry=−3）。⚠ LOWPERF 下绝不能 `to({ry})`：to 的 LOWPERF 分支会把未指定的 z 乘 0.4，产生 ~10px 的垃圾 z 呼吸（工程审查实雷）；⚠ `Cam.init` 必须保留「开机落位」段（`to(baseOf('join'), 900)`）——enter 不再动镜头后，不补这段相机会永远停在 spawn 机位（probe 实测逮到）。narrow 判据不再归零镜头（偏航在 390 宽上边缘位移 ~3px，无出界风险；窄屏收 5° 纯为观感）
- **为什么扫视仍然不用 `preserve-3d`**：滑动是纯 translate（仿射），比 cube 的透视矫正采样更便宜（实测 test-perf 帧率从 ~38-56fps 抖升到稳定 59-60fps）；世界层偏航 ±7° 是单层合成期变换，Cam 补间管线本来每帧就写 world transform，无新增层。开 preserve-3d 会让 `#app { overflow-x: clip }` 与屏内 overflow 容器静默拍平 3D、且「世界层是带透视的单平面」的命中红线失守——`.pw/test-3d.cjs` 的 `transformStyle === 'flat'` 仍是回归门。
- **扫视的几何前提（动换场先读这条）**：① 两面必须**同一 duration + 同一 easing + 同一 delay**（同一次镜头扫视的两半，一快一慢=脱拍）；② B 的 from 帧在 `+S`（视口外）是加载门控的本体，**不许给 pan-in 加 opacity 关键帧**；③ pan-out 的 from 显式 `opacity:1`（.leaving 基态 0，揭幕 280ms 间隙全靠 backwards 填充顶住）；④ 方向走 `SCENE_ORDER` 环最短路（`sceneTurn`），`tx-back` 只反 `--pan-dir` 与 glance 符号；⑤ `lastScreenName` 初值必须是开机时屏上已是的那一面（加入页），留 null 会让 join→lobby 没有「出屏」；⑥ landforce 旋转兜底机型上扫视读作纵滑（对称性不丢，SPEC 如实记录）
- **降级路径原样保留**：`body.loperf` 换成只动 opacity 的 `scene-in-lite/scene-out-lite`（`will-change` 也只留 opacity）；`prefers-reduced-motion` 下 `.screen { animation: none !important }`、`.world { transform: none !important }`、`.screen.leaving { display:none !important }` 继续生效——**没有新增 DOM 元素、动画仍挂在 `.screen` 上**，这几条不用补
- **低端机 / 降噪**：`body.loperf` 把 `.table3d` 拍平，`Cam.to()` 在 LOWPERF 下自动砍掉旋转/缩放、位移减半；`prefers-reduced-motion` 下 `.world { transform: none !important }`，同时 `Cam.to()` 走瞬时跳转（`Cam.jump` 会作废在跑的补间）
- **3D 命中不能影响正常点击**：`.flip-card` 只让可见的那一面接收点击（`:not(.flipped) .card-front` / `.flipped .card-back` 置 `pointer-events:none`）：部分浏览器会把背面也算进命中栈，翻牌后按钮点不动；E2E 里等待应用自己的动画锁 `revealAnim === false` 再点击，避免撞上翻牌过渡

### 虚拟世界：围桌的每个人都是一个虚拟角色（2026-09 新增）
- **角色化渲染**：大厅与牌桌的每张玩家卡 = 头像（头）+ `.chr-body` 身体（肩胄剪影，46×17px 渐变）+ 名牌，读作「一个人围桌而坐」；衣服色由 `chrHue(id)` 按 id 哈希出两档 HSL（`--chr1/--chr2`，JS 侧拼好完整 `hsl(h,s%,l%)` 字符串再写变量，不走现代空间语法以兼容老 webview），同一玩家全端同色；`.chr-body::before` 一枚座席位软阴影；呼吸动画 `chr-idle`（scaleY 1→1.07，3.2s，transform-only 合成器路径）。牌桌内名牌升级为胶囊 `.player-name`（ring3d 专属背景/描边）
- **入座（有人加入）**：牌桌上「名单里新增的那一张卡」才挂 `chr-in`，`chr-walk-in` 从桌心（`translate(calc(-50% + var(--wdx)), calc(-50% + var(--wdy))) scale 0.42`，向量由 layoutRing 按座位写入）走到座位（终帧 = 基态 `translate(-50%,-50%) scale(var(--rs))`，无缝交接）；老玩家离场不重播（名单结构变化重绘时按 `keepIds` 判新增，只有新到者有入场动画，其余人靠 left/top 过渡换座）；大厅新卡沿用既有 `player-enter`
- **触发谁谁去抽卡**：`drawing/revealed` 阶段触发者卡片挂 `.away`——身体变暗停呼吸、头像环去饱和（「人离座了」），头顶 `.chr-status` 气泡「🎴 去抽卡…/🎬 看牌中…」浮动；状态在 `renderPlayers` 的逐帧徽章刷新循环里同步（`gridId === 'game-players-grid'` 限定），选卡阶段自动归座；回合文案同步改为「起身去卡堆抽卡了…」
- **角色起身抽卡**：`flyAvatarToDeck` 飞的是完整角色（圆头 `fa-head`（跟随实际头像尺寸）+ 名牌 `fa-tag`），克隆锚点定在头像中心、所有关键帧自带 `translate(-50%,-50%)` 保证起终点与真实中心重合；四帧走路摆动（左肩 -6°/右肩 +6° 各带抬升）替代旧的整圈自旋，总时长 850ms 不变（不打乱抽卡一镜到底时钟：洗牌 1400ms / 发牌 1500ms / 揭晓 2.6s）
- **视角切到抽到的卡**：`choosing` 镜头滑向触发者（`Cam.nudge`）→ `drawing` 推向卡堆（角色走到哪镜头跟到哪）→ 落牌/翻牌推到中央卡面（`focusCam`），三段接力即「视角切到该用户抽到的卡」；揭晓卡署名 `card-owner` 改 `ownerHtml()` 渲染——带上抽卡者头像 `owner-ava` + 名字，卡面归属一眼可辨
- **降级**：REDUCED 下 `chr-idle/chr-float/chr-walk-in` 全部 `animation:none`；LOWPERF 同样停呼吸/气泡并取消入座动画（保留静态角色造型与离座变暗）；飞角色在 REDUCED 下本就不跑（`flyAvatarToDeck` 早退）

### Color Palette
- Background: Deep navy (#0a0a1a) with animated gradient orbs
- Primary: Electric purple (#8b5cf6)
- Accent: Hot pink (#f472b6), Cyan (#22d3ee)
- Truth cards: Blue (#3b82f6)
- Dare cards: Orange-red (#f97316)
- Text: White (#ffffff) with subtle glow

### Typography
- Headings: "ZCOOL KuaiLe" (Google Fonts) — playful, Chinese-friendly
- Body: "Noto Sans SC"

### Materials & Effects
- Cards: Glassmorphism with blur backdrop
- Avatars: Circular with animated border glow on active player
- Buttons: Gradient fill with press animation
- Particles: CSS-based floating confetti dots

### Animation System (One-Shot Camera Feel)
- **一镜到底（2026-09 统一为 Cam 调度）**：所有运镜都写 `#world3d` 的 transform 字符串（`translate3d` + `rotateX/Y/Z` + `scale`），`Cam.to(pose, ms, ease)` 用 rAF 补间；**新镜头接管 = `token++`**，旧镜头（含它的 done 回调）当场作废并从当前位置续接，所以永远不会跳帧
- **换屏 = 一镜到底 + VR 扫视**：`renderScreen()` 只在换屏时干活——`Cam.enter` 记账（REDUCED/LOWPERF 就位），`armPan(旧屏, 新屏)` 给两面挂同一组 0.64s 恒速三段滑动（旧屏 `.leaving` 绝对定位滑出、新屏 `.entering` 从 +S 滑入），`armDepth(back, delay)` 同拍武装深度参照层（`body.tx-run`），`Cam.glance` 在 playSceneEnter 内同拍武装偏头一瞥（280ms 加载延迟共享）；方向是 `SCENE_ORDER` 环上的最短路。join→lobby→game→result 连起来读是镜头在房间之间连续扫视，每一次换屏是其中一站
- **入场时钟必须和加载层对齐**（踩过的坑）：① 入场动画只能在屏已经 `.active`（display:flex）**之后**再挂——`display:none` 期间 CSS 动画不跑，早挂会变成“一显形就已终态”或先满屏闪一帧（所以 `renderScreen` 是「先切 active → 再 `queueSceneEnter`」）；② 加载层还盖着时入场一律攒进 `pendingSceneEnter`，由 `hideLoading()` 揭开幕那一刻放——**不能只在 `prev===null` 时攒**，否则「退出房间后再加入」这种 `lastScreenName` 已是 `join` 的路径会把入场提前放在加载层后面跑完，幕一揭开只剩静态大厅（这正是「加载动画和进入显示不同步」的根因）；③ `scene-in` 的 opacity 在 22% 就坐实到 1——加载层淡出时新屏已是不透明的，揭幕不会先露一段黑底
- **退房不等网络**：`doLeave()` 先抓一份「离开后的房间状态」，**不等 `publishState`/`clearPool` 落地**就把 `joined/S/link` 归零并 `renderScreen()` 切回加入页（退房广播与关链路丢到后台补发；失败也无所谓，心跳超时同样会清掉我）。旧版 `await link.publishState(next)` 在坏网络下会变成退房时一段没任何反馈的空白卡顿。`/rejoin` 回归锁在 `.pw/test-rejoin.cjs` 的「手动退出后不再自动回房」
- **头个回合不抢镜**：进入牌桌时 `Cam.enter` 正在跑推进段，`runStage('choosing')` 用 `Cam.enteredAt` 判定「刚换屏」——刚换屏就不重复 `Cam.home`、把滑向持麦人的 `Cam.nudge` 拖到 1240ms（等推进段落定）；回合内交接才维持 `home(420)` + 460ms 后 `nudge`
- **牌桌常态机位**：game = `{z:-56, rx:19, s:1}`（第三人称过肩俯视，2026-09 v6）；抽卡时 `focusCam(deck)` → `{z:-76, s:1.05}`，落牌后推卡牌 `{s:1.05}`，翻前 `Cam.shake()` 轻震；交接回合 `Cam.home(420)` 回桌心 → 460ms 后 `Cam.nudge(新持麦人)` 滑过去
- **`Cam.focus` 的偏移必须在镜头坐标系里算**（踩过的坑）：`landforce` 旋转兜底时 `body` 整体 `rotate(90deg)`，`#world3d` 的 `translate3d` 跟着转，而 `getBoundingClientRect()` 给的是**屏幕**坐标。直接拿屏幕坐标当偏移会把 x/y 轴对调——横屏下抽卡镜头会横着平移而不是推向卡堆（`landPick()` + `--lvw/--lvh` 逻辑视口做换算；非旋转路径 `landPick` 是恒等，竖屏/真横屏数值不变）。实测同一张卡（屏幕中心 621,213）在「真横屏」与「旋转兜底」两种模式下现在算出同一个目标偏移 `[-45,-6]`
- **横竖屏切档不切镜**：`applyLand()` 判定 `landui` 翻转时不再 `resetCam(true)` 瞬移，改 `Cam.realign()`——`focus()` 记下最近聚焦的元素，换档后按新布局重算落点续接那一段运镜，没有聚焦元素就 `home(420)` 补间回新常态。旧写法那一瞬会把在跑的运镜连同它的 done 回调一起作废：抽卡中场转屏会看到机位硬切一下（实测单帧 Δz=18、Δs=0.048 无中间帧），之后停在常态不再推镜
- **横屏镜头平移量**：`focus()` 的位移夹紧是 `LAND.ui ? ±16/±12 : ±46/±34`——横屏下留白更紧，夹紧是为了不让世界层平移露出 `.screen` 边缘（聚焦档净投影 ≈1.0×，没有富余）。代价是横屏里卡位（`#card-section` 居中需要 x≈-45）只能拿到 -16px，卡片落在屏幕中线右侧；这是版式取舍，未改动
- **启动加载动画**：3D 抽卡预加载 overlay（透视翻牌 + 三颗环绕光点 + 扫光进度条 + 分阶段文案），doJoin 全程复用同一层展示「创建房间 → 连接服务器 → 同步状态 → 载入题库 → 落座」；退场是 **0.26s「揭幕」**（opacity+scale 1.04，**不挂 blur**——旧版 `filter 0.5s` 是 paint-bound 违规且会把转身的可见段盖掉，.hide 过渡后 300ms remove）。**重建的加载层必须淡入**（先 `hide` 再下一帧摘掉，否则满屏深色硬闪一下）；`showLoading` 要 `clearTimeout(_rm)` 取消上一轮 `hideLoading` 排的移除，否则加载层会在使用中途自己消失；≥1280 视口加载卡放大一档（116×154 + 文案 1.35rem，一次落位不加循环漂浮）；**进房揭幕时长门（2026-09-17，用户点名「没等加载效果完毕房间就进了」）**：doJoin 成功路径在 reveal 前过 `waitLoaderDone(2400, loadT0)`——①至少看满一整轮 2.4s 翻牌（loadT0=点「加入」时刻），②再对齐到翻牌 CSS 动画 currentTime 回到 0% 帧（正面朝上）那一拍才揭幕（读作「抽卡完成」；into≤80ms 视为已对齐免得多睡一轮；REDUCED/loperf 动画被关时 getAnimations 为空只剩时长门）。等待段文案置「✅ 就绪...」（数据真就绪，消除最坏 ~5s 停在「落座中」的假死感）；**按钮解禁必须排在 await 之后**（提前解禁会给 input-name 的 Enter 重入 doJoin 留 2.4s 窗口：掐活链路+新 myId 双身份入房，代码检查官实锤）。错误路径（连接失败/房间不存在/房号被占）不门户，保持快速揭幕+toast。配套：boot 揭幕定时器（load+1200ms）加 `if (link || rejoinName) return` 守卫——快速点加入时 doJoin 已接管加载层，boot 揭幕半路置 _hid 会废掉时长门并中途闪掉加载层。取证 `.pw/probe-loader-gate.cjs`（10 条断言：时长门/0% 帧对齐/加载层移除/错误路径/REDUCED 退路）
- **Background**: Continuous slow drift of gradient orbs + confetti particles, 60s loop
- **Avatar entrance**: Slide-in from bottom with stagger, bounce easing
- **连麦头像波动**：说话者的头像环绿光光晕随音量 RMS 实时变强（--voice CSS 变量驱动 box-shadow），头像本体随音量缩放，双层声波圆环外扩淡出，名字变绿；音量不经过网络，每端用 AnalyserNode 就地分析自己收到的音轨。**three3d 下的说话声波（2026-09-17 用户点名「开启说话的声波在3d里要有效果」）**：paintVoice 钩子早已把 RMS 喂进 `chars` 的 `u.voice`，但只有极轻的躯干摇摆——3D 里头像环整个 visibility:hidden，说话基本不可见。现补齐世界尺度等价语言：①身体绿光（torso/chest emissive 随 voice，uniform 直写不重编译）；②点头说话（head.rotation.x 6.4Hz 摆动 ×voice）+ 头/脸/发三件套同步 1+0.1·voice 微缩（对齐 DOM 头像缩放，三者必须一起缩否则脸陷进发壳）；③**脚下外扩声波环**（#4ade80 additive，1.1s 波前外扩淡出、0.55s 交错=恒 2 环在场，与 DOM wave-out/w2 同节奏；池 ≤10 共享几何、跟随走位、voice 越大波越亮）；REDUCED 无波环但保留绿光/名字变绿静态态；retire 清池。探针 probe-egg-react ③b 节：paintVoice 直调喂 voice→assert 波环数/绿光 emissive/点头角，结束 1.3s 后归零
- **轮到自己抽卡**：真心话/大冒险双卡呼吸发光（brightness 脉动，不动几何位置，不影响点击稳定性）+ 卡面扫光循环
- **进牌桌「点亮舞台」（2026-09 v2）**：换屏进 game 时 `armTableLit()` 给 `.table3d` 挂 `lit`——亮度覆层（`::before` 同一张渐变 opacity 0→1，700ms，随转身起点并行）+ 落位后（延迟 640ms=转身落定）一道台面反光扫过（`.table-sheen`，transform 移动静态高光条 500ms，**不在旋转的墙上扫第二道运动源**）；桌心 🎭 徽记（`.table3d` 内部、`pointer-events:none`、opacity 0.12 静态）填补中段空黑、绝不进 3D 命中栈；持麦人座位聚光是 `.avatar-ring.active::after` 径向光斑 opacity 脉动（合成器路径，替代旧的 box-shadow 脉动 paint-bound 写法），显式 `z-index:0`（iOS 合成层排序坑）。LOWPERF：lit 不挂（台面已拍平）、聚光定格；REDUCED 媒体块全部 `animation:none`
- **Card selection**: Card flies to center with scale-up
- **Card draw**: Card flips with 3D CSS transform, then reveals punishment；洗牌为真实交叉效果：`.deck.shuffling` 期间顶层两张牌按 `shuffle-left/right/mid`（0.55s）交替向左右交叉、中层微位移，容器整体 brightness 脉动；牌堆常驻扫光为窄光带（`left:-60%; width:60%` 平移 0→300%），`overflow:hidden` 裁切在卡面边界内，与 choice-card 扫光共用同一几何与关键帧
- **背景光球不用 `filter: blur()`**：三个光球（500/400/350px）的柔边由多段 `radial-gradient` color-stop 直接画出。旧的 `blur(80px)` 是一个每帧都要重光栅化的大半径模糊层，实测（软件光栅 + DPR3）是大厅 16fps / 牌桌 16fps 的唯一主因；去掉后两处均钉回 60fps（p95 100ms → 16.7ms），而纸屑、`backdrop-filter` 毛玻璃、每人一个的旋转头像环单独开关均测不出成本（全在噪声里），因此保留不动
- **省电模式（三档，`localStorage['tod:perf']`）**：`auto` 自适应 / `low` 省电 / `full` 全效，入口在「🎭 怎么玩」弹窗（所有人可用，不依赖主持人）。猜型号不可靠（主流手机 `hardwareConcurrency` 普遍是 8，iOS 根本不报 `deviceMemory`），所以 `perfWatch()` 在开场与首次上牌桌时实测 rAF 帧间隔（最多 3 次、每次隔 ≥20s），中位帧间隔 >26ms（≈跑不满 38fps）才自动降载并 toast 告知；只自动降级不自动升级，用户手动选过就不再自动测
- **切后台即冻结**：`visibilitychange` 给 `body` 加 `paused`，`body.paused *::before/::after { animation-play-state: paused }`——切到微信聊天窗口时背景不再继续烧电
- **关麦后挂起 AudioContext**：`closeMic()` 里 `MIC.ctx.suspend()`（音频线程不空转），下次开麦 `resume`；进 bfcache（`pagehide` 且 `e.persisted`）时直接收麦，避免麦克风在后台常亮
- **无障碍与低端机**：`prefers-reduced-motion` 命中时走 REDUCED 静态路径（跳过运镜/飞牌/洗牌/打字机，翻面 700ms 后直接呈现全文，翻牌动画锁仍生效）；LOWPERF（`body.loperf`）砍背景光球/纸屑/毛玻璃/头像环旋转与扫光，并把爆彩粒子限量；选择类控件全部 `button` 元素（键盘可聚焦、Enter/Space 可触发）
- **抽卡一镜到底时序**（多端以 `turn.ts` 为统一时钟）：头像飞入卡堆(0-1.1s) → 洗牌(0-1.4s) → 飞牌落向中央(1.5-2.2s，落点在目标布局下预先测量，修复旧版 hidden 零 rect 飞向左上角的 bug) → 牌背“抽取中”呼吸到 2.6s（`ANIM_DRAWING_MIN_MS`）→ **三段式揭晓（2026-09 v2）**：吸气 120ms（scale 1.06）→ 主翻 520ms（WAAPI `rotateY 180°` + 中途 `translateZ 48px` 抬起，`bezier(0.45,0.05,0.35,1)`）→ 落定 220ms（扫光 + 镀铬浮现）；WAAPI 终帧精确等于 `.flipped` 的 `rotateY(180deg)`，`.flipped` 在主翻起点挂、transition 压制到落定才还回去 → 打字机揭晓 → 彩带
- **揭晓「内容先于镀铬」**：翻面时牌面只有牌——💬/🎯 类型徽章与题主署名在打字机首字符落地那刻 `badge-pop` 进来，押注面板/动作按钮在主翻落定（t≈640ms）才 200ms 淡入，🎁 惊喜角标压到打字机**完成后 120ms** 才入列（`surpriseTagHold` 门控 `paintSurprise`），且与类型徽章同排 flex（旧版角标 absolute 叠在徽章上）。**押注面板必须吃 `revealAnim` 门控**（`renderBetBox` 的 `hidden = !can || revealAnim`）：renderGameStatic 在动画早退分支之前就跑到它，否则观众端每回合看到「面板闪现→翻牌瞬灭→640ms 后淡回」（代码检查官 P1）
- **揭晓迟到补偿（时钟红线）**：revealed 文档比「drawing 的**本端到达时刻**（`drawingArrivalLocal`，perf.now()）+ 2.6s 动画窗口 + 300ms 容忍」还晚到 → 跳过剩余等待立即翻牌。**判据只用本端到达钟**，严禁拿发布方 `turn.ts` 对本机 `Date.now()` 比较——发布方时钟落后会把远端的揭晓悬念整段吃掉（与在线判定走 HbLocal 同一个道理）；打字机速度保持 32ms/字**不做全局封顶**（长题慢速烧是喜剧核心），迟到只影响等待时长、不改题面内容
- **防闪答案动画锁**：`applyState` 在 `renderScreen` 绘帧前上锁（`revealAnim`/`cardDealt`），`renderGameStatic` 的 drawing/revealed 分支在动画窗口内直接 return；`playReveal` 用 `transition:none` 瞬时归位牌背再翻，保证“答案不会先闪现再翻回去”；`clearStageTimers` 同时清打字机 timer，防止旧回合对隐藏元素补放彩带
- **Punishment reveal**: Typewriter text effect with blinking caret, confetti burst
- **Turn transition**: All avatars subtly pulse, winner glows
- **Camera pan**: 由 `Cam.focus/nudge` 承担（世界层位移 ≤46px + 轻微 scale，不叠 `scrollIntoView`）；抽卡链路 deck→card 两次缓推（0.95s transform 补间），REDUCED 下全部瞬时到位

### Phase 2.75: 趣味互动（新增）
- **😀 表情雨**：右上角互动浮窗 `#react-bar`（默认收成一颗 44px 浮标 😀，点开才展开 6 颗 emoji 按钮 👏😂😱🔥😈❤️ —— 按钮上显示的就是实际会广播出去的那个表情）在大厅/牌桌可用；展开后发送 1.4s 自动收起，无操作 9s、点屏幕其他位置、Esc 也收起。**位置经过实测**（`.pw/probe-reactdock.cjs`）：浮标固定在右上角（横屏开关下方），展开为竖排 —— 竖屏与横屏、join/lobby/game/revealed 上都与任何 `button/input/.player-card/.choice-card` 零重叠（旧版底栏在 390×844 会压住选卡与工具栏、在横屏左中会压住玩法切换）。点击 → 本机立刻飘一颗 + 房间广播（独立 topic `tod/v1/<房间>/react`，**非 retained**、qos0，不进房间状态），其他人 ~0.1-3s 内看到同样的表情从底部升起。防刷屏 320ms/颗、白名单外表情直接丢、`REACT_SEEN` 去重 + 5s 时效（本地模式 retained 回放不补放）、粒子上限 14（LOWPERF 5）且 2.4-2.6s 自清理
- **🔥 连击**：连续「完成啦」累计 `player.combo`（上限 9），跳过清零；combo≥2 头像挂 `🔥×N` 徽章，≥2 时爆彩 + 音效 + toast，≥3 追加镜头震动。**连击不改分**（完成仍 +10/跳过仍 −5），结算新增「🔥 连击王 ×N」奖章（要求 combo≥3）
- **🔥 加倍挑战**：计分开启时，持麦人在 choosing 阶段可点 `#btn-stake` 押 `turn.stake=2`：完成 +20 / 跳过 −10；不动 seq（不打断动画），回合收尾后自动复位 1；揭晓页显示「🔥 加倍 ×2」角标并把按钮改写成 +20/−10。默认 1 → 既有计分回归（test-host 的 +10/−5）不受影响
- **⏱ 限时挑战**：主持人设置里 `timer ∈ {0,15,30,45}` 秒（房间状态同步）。揭晓页 `#timer-wrap` 用 `turn.ts` 作为全场统一时钟倒计时（250ms 更新一次 `scaleX` + 文案，最后 5 秒变黄并滴答）；到点只显示「⏰ 超时啦（不扣分，大家看着呢）」——**不自动跳过、不扣分**，避免抢走玩家的选择权
- **🎡 命运转盘**：主持人点「🎲 随机点名」时，光点沿 3D 座次环加速跑动再减速停在目标上（`.player-card.spot` 高亮 + 镜头跟着扫），随后才 `designate(pid)` 落地；只在本机演，REDUCED/LOWPERF 直接定点
- **🔊 音效**：WebAudio 现场合成（whoosh/tick/flip/reveal/win/skip/combo/react/tap/draw/spark），**零资源下载**；首次 `pointerdown` 才创建 AudioContext（避免自动播放告警），开关存 `localStorage['tod:sfx']`，入口在大厅/牌桌工具条与「怎么玩」弹层
- **🎵 背景音乐**：同样是 WebAudio 现场合成（**零资源下载**），i–VI–III–VII 小调走向的慢和弦垫（低音铺底 + 三音和弦 + 高八度点缀，1.5s 一步）；`BGM` 复用 `SFX` 的 AudioContext/总线再挂一条独立增益（缓入 1.4s 到当前音量 / 缓出 0.6s）。**默认开**（`localStorage['tod:bgm']` 为 `off` 才关），但 **首帧不出声**：首次手势后才建 ctx 并起播，不违反自动播放策略；切后台（`visibilitychange`）自动停、切回自动续，省电不打扰。独立音量滑杆 `#bgm-vol`（0~100%，默认 90%）在「怎么玩」弹层，滑动即时平滑过渡（0.15s）并存 `localStorage['tod:bgm:vol']`；开关入口在大厅/牌桌工具条与「怎么玩」弹层，与音效开关互不干扰
- **🎵/🔊 双总线**：`SFX.master`（动作音效）与 `SFX.music`（背景音乐）是两条独立总线，各自直连 `destination`，音量互不影响；`BGM.node` 接 `SFX.music`，动作音效接 `SFX.master`。这样「压音乐」不会连带把抽卡/翻牌提示音一起调小
- **🎙️ 连麦自动压低（ducking）**：外放时本地音乐会从麦克风串出去（无法避免：`echoCancellation` 只对「远端播放信号」这个 AEC 参考有效，本地 WebAudio 现场合成的声音不在参考里），所以 `syncAudioDuck()` 在**广播**时把**背景音乐总线** `SFX.music` 压到 14%（触屏设备走媒体外放时压到 **6%**：那条出口不经过通话渲染，浏览器硬件回声消除的远端参考失效，串音更难消）、**仅收听**时压到 50%、空闲恢复 100%（320ms 缓变，只改增益不起停振荡器）。**动作音效总线 `SFX.master` 始终保持原音量**（只压音乐、保留音效原提示音）。**判据是真实链路数 `MIC.peers.size` 而不是默认开的 listen 偏好**（否则没人说话时也会无端压低音乐），钩子在 `makePeer`/`destroyPeer`/`toggleMic`/`closeMic`；远端人声两条总线都不走、音量不受影响。开关「连麦时降低音乐」在「怎么玩」弹层（`localStorage['tod:duck']`，默认开），关闭后开麦也不再压低；首次开麦且音乐开着时提示一次「戴耳机才能彻底消除音乐串音」（软件层面只能减弱、不能根治）
- **👆 抽卡/翻牌点击反馈**：选卡（`.choice-card`）、卡堆（`.deck`）、翻牌（`.flip-card`）在 `pointerdown` 时统一走 `tapFx()` —— 按下回弹（`tap-pop`；翻牌用独立 `translate` 属性的 `card-press`，**不覆盖 `.flipped` 的 rotateY**）+ 以点击点为圆心的涟漪 `.tap-ring`（`landPick` 换算旋转坐标，0.5s 自清理）+ 轻点击音 `tap`；落牌补 `draw` 发牌声、翻面补 `spark` 上扬音并闪一次牌面扫光 `.flip-glint`；牌面里的动作按钮（完成/跳过/免答）不抢反馈，REDUCED 下只保留音效与静态
- **🎲 观众押注**：牌一揭晓，旁观者（持麦人不能押）面板 `#bet-box` 出现：「✅ 会完成 / ⏭ 会跳过」，再点一次取消，可随时改押；押注存在 `turn.bets`（小对象，随状态同步），揭晓时保持秘密。持麦人交卡时 `settleBets()` 结算：押对 **+5** / 押错 **−3**，**只动押注者自己的分**（不动持麦人的账）；结果写进 `turn.betLog={at,items}`，全场看到同一份「押注结算」播报（按 `at` 去重，10s 时效 + 首帧不补报历史），押中者额外爆彩。无押注时零开销；计分关闭时面板不出现。
- **🎁 惊喜卡（纯气氛）**：揭晓时由 `surpriseOf(turn)` 从「题目文本 + turn.seq」确定性推导（同题同 seq 全场同结论，不占状态字段），**1/5 概率**开出；效果集：🎉 彩带风暴 / 🥁 命运鼓点（镜头震）/ 🌧 表情雨（本地自动撒）/ 🏅 金色卡面 / 📢 全场播报。金卡只是视觉（金边 + 扫光 + `.surprise-tag` 角标），**不改任何分数与账本**；主持可在 ⚙️ 设置里整体关闭（`S.surprise=false`，关闭后推导恒为空）。特效只在揭晓那一刻放一次（`lastSurpriseSeq` 去重），中途加入的客户端也能看到金卡静态上色。

### 横屏支持（手机横持自适应 + 手动切换）
- **一套布局、两条路径**：手机横过来（真·横屏矮视口 `innerHeight ≤ 620`）自动进横屏布局；竖着拿时点顶部右侧 `#btn-land` 也能横屏。两条路共用同一套 `body.landui` 规则，判定与开关都集中在 `applyLand()`
- **原生优先、旋转兜底**：手动切换先试「全屏 + `screen.orientation.lock('landscape')`」（Android Chrome 可用），不支持/被拒（iOS 浏览器、微信 webview、桌面）就给 `body.landforce`——把整个 body 旋转 90°（`rotate(90deg) translateY(-100%)` + `transform-origin: 0 0`，宽高用 --lvw/--lvh 互换）铺满物理视口，用户横持手机即正常玩。选择记 `localStorage['tod:land']`，刷新保持；真·横屏下按钮自动隐藏（已满足，无需入口）
- **逻辑尺寸一律用 `--lvw/--lvh`，不用 vw/vh**：旋转兜底时 vw/vh 仍是物理竖屏尺寸（844×390 的逻辑横屏会被当成 390 宽），所以横屏布局的尺寸都取 JS 实测并写在根元素上的 `--lvw/--lvh`；`body.landui` 把 body 锁成逻辑横屏视口（`height: var(--lvh)`、超出隐藏），滚动交给 `#app`
- **旋转下的 fixed 坐标换算**：`getBoundingClientRect` 给的是物理坐标，而旋转坐标系里的 fixed 元素要的是本地坐标（`Lx = Py`、`Ly = 物理视口宽 − Px`）——`landPick()` 负责换算，`burst()` 与飞头像/飞牌三个调用点已接入；`react-rise` 的上升距离改成 `--rh`（默认仍 36vh）
- **横屏机位分档**：`body.landui` 下 `Cam.base` 换成更平的矮屏机位（join z-30/1°、lobby z-22/1°、game z-26/2°、result z-34/3°；进出横屏时由 `swapCamBase` 整体切换并瞬时归位），避开 1400px 透视在 390px 高度里把屏底元素放大推出屏；`Cam.focus` 的平移钳位在横屏收到 ±16/±12（竖屏仍 ±46/±34）
- **座次环自适应**：`layoutRing` 的 narrow 判据从 `window.innerWidth < 620` 改成 `grid.clientWidth < 620`（横屏里座次区只占半屏）；横屏且环高 < 320 时椭圆压扁（`ry=24%`），玩家卡不越出座次区
- **每屏横屏排布**：join = 表单 + 头像墙 + 题库导入三栏（头像墙自身可滚）；lobby = 左侧邀请/玩法/开局、右侧玩家墙，工具条移到最底一行（宽度足以放下 6 颗按钮，不做横向滚动）；game = 左 3D 座次环、右回合文案/选卡/揭晓，工具栏压成一条横滑条（按钮缩到 0.66rem，内容不横向溢出）；result = 左颁奖台、右战绩榜；弹层整高 `calc(var(--lvh) - 16px)`、内容内部滚
- **矮屏红线**：横屏下五个屏的主 CTA 必须在首屏内（join 加入按钮、lobby 开始、选卡双卡、完成/跳过、结算按钮）；牌面长题走 `.punishment-text` 自身滚动（`flex:1 1 0; min-height:0; align-items: safe center`，超长时不裁首行），动作按钮永远留在卡内

### PC / 平板兼容（矮屏桌面与平板）
- **文档永不被 3D 投影撑宽**：`.table3d` 经 `#cam` 的 900px 透视放大后包围盒比视口宽（1280 视口实测被撑到 1318px），`.world` 的 rotateX + 透视投影也会外溢 —— 这会把移动仿真/平板上的 layout viewport 顶宽，连带把 `position: fixed` 的横屏开关与互动浮窗推出可视区。现在 `#app { overflow-x: clip }` + `#cam { overflow-x: clip; overflow-clip-margin: 28px }`（clip 不影响纵向，body 仍是唯一的页面滚动容器；28px 出血留给座次环前后排卡片的轻微溢出）。取证：`.pw/probe-overflow.cjs`（1280×800 / 1024×768 / 768×1024 三视口 ×3 屏，实测 `scrollWidth === clientWidth`）
- **⚠ iOS / 微信 WebView 的头像圆裁切**：真机反馈「大厅正常、进游戏后头像被环挡住」——大厅里 `.player-card` 没有常驻 transform，游戏屏里被 `layoutRing` 写上了 `transform: translate(-50%,-50%) scale(var(--rs))`，**每张玩家卡因此被提升为合成层**；微信 iOS 的 WKWebView 在这种层里会丢掉 `overflow: hidden + border-radius` 的圆裁切，头像就画成方块糊住环。现在 `.avatar-inner` 同时挂 `clip-path: circle(50%)`（**在合成阶段生效，层提升也不会丢**）与 `border-radius: 50% + overflow: hidden`（老引擎兜底，两者取交叠）；`.avatar-ring::before` 补 `z-index: 0`（无限旋转的动画伪元素会被单独开层，不写死顺序时 iOS 可能按「层创建先后」而非 DOM 顺序排，环就压到头像上）。**取证**：`.pw/probe-ios-ring14.cjs`（WebKit + Chromium 双引擎，全局冻结动画后逐属性回退做像素比对——`clip-path` 只改了两处头像圆的边缘抗锯齿，整屏差异 0.03%/0.09%；`z-index` 是逐字节 no-op）。**注**：PC 上 Playwright 的 WebKit 复现不出该症状（布局/像素与 Chromium 逐项一致，见 `probe-ios-ring*`），故本条是「针对 iOS 合成层特性加固」而非「已复现后修好」——真机复验仍在待办
- **矮屏桌面/平板（宽 >600 且高 ≤920，且非手机横屏）**：压档上限从 880 提到 920，因为 1440×900（笔电 / retina 缩放最常见档）下揭晓页「跳过」底 903.8 > 901 刚好掉出折线；座次环收到 `clamp(180px, 26.5vh, 268px)`、选卡 136×158、牌面 300×400、统计/回合文案降一档；**揭晓时座次环常驻**（2026-09 v6 起废弃 `:has()` display:none——老 WebView 静默不生效 + dealFlyingCard 在 drawing 期就取消 card-section hidden 会把压缩插进推镜中途；改由 JS 挂 `#screen-game.stage-revealed` 做缩小让位+压暗，见上方第三人称牌桌段④）
- **⚠ 这段压档规则必须写在基础规则「之后」**：它和 `.players-grid.ring3d`（基础值 `clamp(210px, 44vh, 340px)`，在 3D 舞台那一段里）同特异度，写在前面就会被反向盖掉 —— 早先这段在文件前部，座次环高度一直是死代码（1024×768 选卡底越界 22px 就是这么露出来的）。现已整段挪到 `body.loperf` 之后、`body.landui` 之前（landui 靠更高特异度继续接管横屏）
- **宽屏内容列居中**：`.screen` 是 `.world`（`width:100%`，1920 视口下 1880px）的普通块级子元素，光有 `max-width:920px` 会整块贴左边（3D 舞台落地后一直如此：`#app` 里的标题/状态条居中，屏内容偏左，右半边全空）—— 现在 `.screen { margin-left/right: auto }`；`body.landui .screen { max-width:none }` 与绝对定位的 `.screen.leaving`（`left:0; right:0; margin:auto` 居中，不用 `translateX(-50%)`，因为它的 transform 现在要留给 `scene-out`）都不受影响
- **宽屏加入页两栏**（`min-width:760px` 且非 landui）：`.join-box` 改 grid（左表单 + 右 264px 头像墙，`#grp-avatar` 用 `grid-row: 2/9` + `overflow-y:auto` 吃满行高不撑大文档），“加入游戏”从 y≈877 抬到 y≈566，720/768/900 高的笔记本首屏直接可点；窄屏与 landui 三栏版不变
- **宽屏房间页两栏**（`min-width:1440px` 且非 landui）：`#screen-lobby.active` 改 grid（`minmax(0,1fr) minmax(0,1.08fr)`，内容列放宽到 1180px），左列邀请码/玩法/统计、右列座次环（`grid-area:1/2/5/3`）、底部操作条跨两列 —— 1920 下 920px 内容列右侧近半屏全空的问题就地消化。门槛定在 1440 而不是 1280：1280 时 1180px 内容列右缘（1230）会被展开的互动浮窗（x≈1228 起）压住。实测 1440×900 / 1920×1000 左列中心偏移 -313px、座次环 +290px（真两栏），1280×800 及以下仍是单列
- **互动浮窗在 PC/平板上**：位置与手机一致（右上角），`.screen` 最宽 920px 居中，宽屏时浮标恰好落在内容列右侧留白里；桌面鼠标可用、Esc 收起；`.pw/probe-reactdock.cjs` 留了各视口的浮窗遮挡取证
⑰ **默认头像退役 → 默认定制头像（2026-09-18，用户点名「将默认头像去除，默认为自定义，头像选择后在3d场景转化为3d头像」；方案 .pw/design-default-avatar.md + 双挑刺专家 SHIP WITH FIXES 全修）**：
  - **加入页两标签**：「预设」标签（24 格 + 🎲）整体移除，只留 **🎨 定制（默认）/ 我的**；`av:` 短索引协议保留做旧状态/旧票兼容（resolveAvatar/avKeyOf/AVATAR_PRESETS 不动）。**开箱即用**：boot 随机人物向风格（31 风格剔除 identicon/icons/rings/glass/initials/shapes 6 个纯抽象）+ 随机 seed → `selectRep(czRep(),…,'custom')`——什么都不点直接加入，进状态的就是 `dcb:` 配方（~54B）。随机风格必须在 `buildCzStyles()` 之前定稿，chip 选中态才不烧死。
  - **所见即所得（live-follow）**：定制 tab 激活时拨风格/底色/🎲 即采用（`avatarSel.tab==='custom'` 守卫，「我的」已选项不被抢走）；拨动后与选中不一致时预览格挂 `.pending`「预览中」虚线角标。🎲 换一张承接原预设 🎲 语义：没点过风格 chip（`cz.styleTouched`）时整只随机（风格+seed），点过后只换脸。
  - **老玩家迁移**：`applyIdentity` 遗留 `av:` → `storeAdd` 收进「我的」+ 一次性 toast；`dcb:` → 配方回填定制器（style/seed 类型守卫/bg）落在「定制」tab（不进「我的」空态文案自相矛盾的坑）；回填**置 styleTouched**——恢复存档=已表达风格偏好，🎲 只重掷 seed（整只随机需先点任一风格 chip），防一次误触把保存的风格冲掉。删除使用中头像回落定制（`storeDel` → czRep()），并**同步改写 `tod:me`**（还记着被删头像时），防刷新后 applyIdentity 再迁回来+二次 toast。`repName` 顺手修 NaN（`parseInt(rep.slice(5))`，旧 `Number(rep.slice(3))` 恒 NaN→「预设」）。
  - **3D 脸贴片契约不变 + 白片防御（终审修订）**：默认定制头像进牌桌即成 3D 人物球面脸（syncPlayers→avatarTexture 管线原样），test-default-avatar 从 `__three.chars` 材质 canvas 与 `resolveAvatar` 产物做采样比对（隔 10 像素、通道容差 24、diff<400 阈值断言）通过。`buildChar` 的 face 材质初始 `color:0xe8b98c`（头球同肤色，resolveAvatar 空串/解析失败时读作裸脸而非白片；纹理解码中的数十 ms 瞬态呈深色，可接受）；**syncPlayers 赋 map 的同一帧必须把 color 归白**——material.color 会与 map 相乘（r128 map_fragment `diffuseColor *= texelColor`），留着肤色=全桌 3D 脸染土棕（代码检查官 P1，已修 + E2E 加 color===0xffffff 不变量断言）。
  - **窄屏折叠**：31 风格 chip 全展开会把 390×844 的加入按钮顶出屏 242px——`<620px` 默认折叠（`#cz-expand`「31 风格与底色 ▸」一行，收起 styles/credit/bgs/acts），实测 CTA bottom 819 ≤ 836 验收线；桌面 264px 侧栏照常全展开。`.cz-chip span` 补 nowrap/ellipsis 治两行折行。
  - **E2E 回归面（预设 UI 删除波及 ~40 脚本）**：`.avatar-option >> nth≥1` 一律落空（现在 nth=0=定制预览格，nth≥1=隐藏的「我的」格超时红）→ 44 处点击统一 nth=0；test-mask 重写为 av: 协议单测（预设表 24=14 像素+10 假面/展开/回映射/零外网）；test-avatars 回落断言改 `dcb:`；test-host 头像断言放宽 `^(av:P\d{2}|dcb:\{)`；sim-mobile 换 tab/审计列表同步。**test.cjs 架构性过时顺手修**：`#card-section`/`#deck-section` DOM 可见断言只对 CSS 降档路径成立（three3d 下 display:none，GL 毡面/牌堆替代；A/B 取证 HEAD 同样超时，非本轮回归）→ `waitCardShown`/`waitDeckShown` 双模式（3D 等 `S.turn.stage`），选卡/完成/跳过点击改 `domClick`（evaluate click 双路径通用，3D 下 pointer-events:none）。新证据：`.pw/test-default-avatar.cjs`（8874，5 步：fresh boot 默认定制/live-follow/我的不被抢/直接加入状态=配方/3D 脸贴片像素比对）、`.pw/baseline-default-ava.cjs`（改版前基线，留档）、debug-join-shots 三视口截图。

## 3. Game Flow Specification

### Phase 1: Lobby / Join

- Player enters name → selects/creates avatar
- Avatar options: 加入页头像区**两标签（2026-09-18 起，预设已退役）** —— **🎨 定制（默认标签，开箱即用：随机人物向风格+seed 的 dcb: 配方已预选中）** / **我的**（保存过的定制 + 上传照片 + 首次回访自动迁入的遗留 av: 预设，localStorage 持久化，下次访问还在，可删）。定制器内拨风格/底色/🎲 即采用（所见即所得，「预览中」角标标记未采用态）；🎲 没点过风格 chip 时整只随机
  - **窄屏入局（<620px，2026-09 v3）**：定制器默认折叠成「🎨 31 风格与底色 ▸」一行（收起 styles/credit/bgs/acts，预览 64px），390×844 的加入按钮稳收首屏（bottom 819）——v2 的「两行头像滚动带」随预设一起退役；桌面 ≥620px 侧栏照常全展开
  - **DiceBear vendored（不调官方 API）**：`@dicebear/core@9.4.3 + @dicebear/collection`（全部 31 个风格包）经 esbuild 打成 ~2MB IIFE（`DiceBearLocal.diceAvatar(style, opts)` + `DiceBearLocal.STYLES`），内联进 index.html 的唯一 `<script>` 内 → file:// 离线可用。代价实测：单文件 ~2.21MB，file:// 冷启动到可交互 **~2.2s**（2026-09 实测）。许可：各风格包代码 MIT；31 个设计多为 CC0/CC-BY-4.0（定制器底部 `.cz-credit` 一行署名 dicebear.com），其中 avataaars/bottts 设计为作者 Pablo Stanley 明示「个人及商用免费」+ 代码 MIT。只用官方 npm 包，**不接 DiceBear 托管 API**（隐私 + 离线）；seed 是随机 base36 或固定串 `TOD-P##…`，**昵称绝不出本机**
  - **🎨 定制器**：`cz = {style, seed, bg, styleTouched}` 三轴+偏好标记——31 风格小样格（活体预览，跟随当前 seed/底色）、🎲 换一张（没点过风格 chip 时整只随机=风格+seed 都换，点过后只重掷 seed）、8 柔色底色 + 无底色（棋盘格）。**拨动即采用**（定制 tab 激活时与选中实时同步）、「✔ 就用它」/点预览格是显式确认兜底；「💾 保存到我的」入库并自动选中。shapes 风格自动挂 `style:'bold'` + 8 色鲜色池（原假面预设同款规则）
  - **`dcb:` 配方协议（状态只传配方不传图）**：定制头像在房间状态里是一条 `dcb:{"s":风格,"d":seed,"b":底色}` 短配方（~54B，无底色省掉 b），各端 `resolveAvatar → recipeToUri` 就地展开成 data-URI（`DCB_CACHE` 缓存、>400 条清空），`avKeyOf` 原样透传（不以 av:/data: 开头）→ 跨端逐字节一致、帧体积与旧 av:P## 同量级（两玩家空局整帧实测 ~687B，含 dcb 配方）。旧票/旧状态里的完整 data-URI（上一代手绘头像、上传照片）仍原样透传渲染，向后兼容
  - **「我的」持久化**：localStorage `tod:avatars:v1` = `{mine:[配方|dataURL|遗留av:…],…}`——去重置顶、**封顶 30 张**、quota 满 toast 认栽；`tod:me` 存上一次 {名字,头像}，下次访问 `applyIdentity` 恢复（`dcb:` 回填定制器落「定制」tab；遗留 `av:` 自动收进「我的」+ 一次性 toast；上传图进「我的」）。上传照片走 canvas 居中裁方压成 96px JPEG q0.82（~3-9KB/张）直接入库并选中。删除是**两连点**（首点染红 ⚠ 2.5s 再点才删，与 `armedTap` 同一破坏性操作约定），删掉正在用的头像自动回落定制（当前随机定制配方）；触屏无 hover → `@media (hover:none)` 下 ✕ 角标常显
  - **跨端逐字节一致**：PRNG 由 seed 播种、不开 `randomizeIds`（它用 Math.random，会破坏一致性）→ 任意两端同配方产物 SVG 相同（test-avatars 断言两个独立页面逐字节相等）；CSS `border-radius:50%` 把方图裁成正圆，替代 v9 不支持的 circle 背景
  - **v9.4.3 踩坑备忘**：`backgroundType` 实际只有 `solid`/`gradientLinear` 分支，传 `'circle'` 等会让渲染器返回 `undefined` 整图黑掉；颜色一律传**不带 `#`** 的 hex（core 的 `convertColor` 自己补，带 # 会变 `##xxx` 无效色）；多色池要传数组（`backgroundColor:[hex]`、shapes 的 `shape*Color: [8 色]` 每调用现切 `.slice()` 防共享数组被确定性 shuffle 原地打乱）；AVATAR_PRESETS 的 `st` 必须逐字对 bundle 风格键（写成 `'pixel'` 而键是 `'pixel-art'` → `createAvatar(undefined)` 直接崩页，被 test-mask 逮过）
- "加入游戏" button → player appears in the lobby grid
- All players see the lobby in real-time (MQTT sync; local-mode fallback via BroadcastChannel)
- 分享：http(s) 下显示并复制 `?room=` 链接；file:// 本地打开时链接对别人无效，自动降级为展示/复制「房间号邀请」（联机靠房间号 + 公共 broker，与各人文件存放位置无关）
- 邀请自动识别：`extractRoom()` 支持 `?room=` 链接 / 「房间号 XXXXX」邀请文字 / 裸房间号三种形态；四个入口 —— 页面加载后静默读剪贴板、从聊天切回页面时（visibilitychange）自动读、输入框 📋 按钮手动读、粘贴进输入框时当场提取；doJoin 对整段邀请原文也能兜底解析
- **主持人制度**：建房者即主持人（`S.hostId`，离开/消失时 `normState` 自动移交最早加入者，全员判定一致）；主持人头像左上角实时挂「👑主持人」金色徽章（大厅/牌桌通用，跟着 `hostId` 走，与 你/🎤/ 四角错开）。**主持人刷新自动回房即让位**：凭票回到房间后变成普通成员，指挥权移交给还在场上的最早玩家（只剩自己一人时不让位，否则没人能开局），并 toast 告知交给了谁只有主持人能：开始游戏 / ⚙️ 设置 / 🎲 点名 / 🎲 换一题 / 🏁 提前结算 / 🔙 回大厅 / 🔄 再来一局；非主持人点开始显示「等待主持人…」并 toast 提示，函数层也各自 `isHost()` 兜底。破坏性操作（提前结算、回大厅、覆盖导入、清空题库）走 `armedTap` 二次确认：首点染红 3 秒「⚠️ 再点一次：…」，超时自动解除
- **⚙️ 设置弹层**（主持人，大厅/游戏内同款）：玩法（轮流/自由，局中切换下一张牌生效、不打断当前持牌人）、题目尺度 🟢温和/🟡普通/🔴刺激、计分竞技开关、轮数上限（0/6/10/15/20，打满自动结算）、题库套装整套替换、恢复默认/清空题库；所有改动即时同步并在大厅摘要条（📦 套装 · 尺度 · 计分 · 轮数）汇总
- **🎯 点名**：主持人点玩家头像指定某人，或 🎲「随机点名」（自动避开自己与当前持牌人，点了必换人）——仅 choosing 阶段生效；可点头像带 🎯 角标 + 紫色名字 + hover 光环（`pickable` 态，排除主持人与当前持牌人），头像下方提示条「🎯 点玩家头像即可指定 TA 玩这一轮」只在该点名时向主持人显示；点当前持牌人幂等（不空转 seq 重放动画），普通玩家点头像静默无打扰
- **新手引导**：「❓ 怎么玩？3 秒看懂」弹层（建房/抽卡/完成或跳过四步图解）；每台设备首次进大厅自动弹一次（localStorage `tod:guide` 记录，只弹一次不再打扰）
- **撞号确认**：建房时房间号已被占用 → 弹层二选一「👋 加入这个房间 / 🆕 换个房间号自己开」，不再静默并入陌生局
- Host picks a game mode before starting: 🔄 轮流制对决 / 🎤 自由对决

### Phase 2: Avatar Display
- 每个玩家是一个**虚拟角色**：头像（头）+ 角色身体 `.chr-body`（按 id 确定色的衣服）+ 名字名牌，大厅与牌桌一致
- 牌桌上沿椭圆围桌而坐（3D 座次环）；有人加入时新角色从桌心「入座」滑到自己座位，全员可见
- Active player's avatar pulses with glow ring
- 连麦中（micOn）的玩家头像左下角显示 🎤 徽章；正在说话时叠加绿色声波环
- Avatars arranged in a semi-circle / grid layout

### Phase 2.5: 连麦（语音通话）
- 大厅和游戏页均有 🎙️ 连麦开关（btn-secondary 胶囊，开启后变绿色 live 态 + 三色音量条）和 🔊 收听开关；**开麦 = 广播**：一个人点连麦，房里其他人在什么都不点的情况下就能听到他（不需要双方都开麦）；收听默认开（`localStorage['tod:listen']`），且只是自己这端的出口——关它不影响自己讲话，也不影响别人互听；两个开关都以 `player.micOn` / `player.micListen` 写进房间状态全房可见（**必须同步给对方**：广播方靠它决定要不要往这个人推流，不同步就会在对方静音后留下一串“声音打进黑洞”的死链路，而且对方恢复收听时再也接不上）
- 语音 = WebRTC 网状网，一条链路只要**有一方在广播**就该存在；方向位 `pr.dir`：1=我在播、2=对方在播、3=全双工，由 `iBroadcast(pid) = 我开麦 && 对方在听` 和 `theyBroadcast(pid) = 对方开麦 && 我在听` 算出，两端各算各的且天然互补；want 集或 `pr.dir` 任一变化就拆链重谈（`recvonly` 的旧链路不会因为我单方面 `addTrack` 就变成双向，不重谈会“显示接通但其实没声”）；信令走房间新 topic `tod/v1/<房间>/mic`（非 retained，点对点定向），MQTT/本地两种传输都复用同一条 RoomLink
- 带宽实话：N 人房里 1 人开麦 = 该人上行 N-1 份独立编码的音频流（Opus 约 40kbps/路），开麦的人越多、房间越大，每个广播者的上行压力线性增长；纯收听方只上行信令，几乎零带宽
- 防冲水：只有一方在广播时由**广播方**发 offer（纯收听的一方永远是应答端，方向不会被谈歪）；双方都在广播时才回到 clientId 字典序（小者发 offer），避免互发 offer 的 glare；非 trickle，等 ICE 收集完发整份 SDP（本地模式 localStorage 单槽位不丢候选），**但收集有 6s 上限**：到点先发出整份 SDP，之后新收集到的候选改走 `kind:'ice'` 单条补发（晚到的 srflx/relay 不再永久丢失，否则跳 NAT 必挂）；9s 不成链发起端重建一次；关麦发 bye 拆链（但 `pr.dir === 2` 的收听链路会留着，我一关麦不该把别人讲话的声音一起干掉）
- 出声两条路径、二选一互斥（同一个流走两路就是叠音）：**元素直出**（桌面默认，行为不变）与**媒体外放**（触屏设备默认）。触屏判定用 `(hover:none) and (pointer:coarse)` 媒体查询而**不用 UA**（iPadOS 会伪装成桌面 Safari 的 UA，UA 嗅探恰好在目标机型上误判）。为什么要两条：浏览器只要把远端 WebRTC 音频交给 `<audio>` 播放，就认定这是「通话」，系统会把输出切进 communication 模式 → **听筒**（Chromium 甚至回滚过「WebRTC 默认扬声器」的改动），而网页没有 `setSpeakerphoneOn`／切输出设备这类接口（移动端 `setSinkId` 在多数机型枚举不到输出设备，iOS 对单轨 WebRTC 流还会静默失效）——媒体外放绕开通话模式，媒体输出在各端恒定走扬声器
- **媒体外放的实测坑（`.pw/probe-micspeaker2.cjs`）**：远端音轨必须先被一个 media 元素「消费」，WebAudio 图才收得到数据——没有元素时 `AnalyserNode` 与 gain 输出**恒为 0**（真机上就是「链路已通却一点声音都没有」），把同一个流挂到一个不播放的元素上立刻有信号、移除元素又回到静音。所以媒体外放保留一个挂在流上、但 `autoplay=false` 且从不 `play()` 的**「消费者」元素**（paused 元素不出声、也不会被当成通话渲染），出声全交给 gain；`ensureAudible` 在这一路的判据换成「gain 断了就补、ctx 被挂起就限流 resume」，并在启动时 `pointerdown` 预热 ctx（纯收听的人可能从不点连麦，iOS 上 ctx 必须在某次手势内创建）
- 桌面走元素直出的三级保障：`<audio>` 自动播放被拦时 `AnalyserNode` 照样有波形（=“对方头像在动但一点声音都没有”），所以 `play()` 失败后会把远端流再接一路 `GainNode → AudioContext.destination` 兜底出声，并在下一次 `pointerdown` 手势重试；元素一旦真出声（`playing`）就撤掉兜底避免两路叠音，`pause` 则由 rAF 里的 `ensureAudible` 限流 1.2s 重新拉起；AudioContext 在 `toggleMic` 的**手势内同步**创建并 resume（先 `await getUserMedia` 再 resume 在 iOS 上已不算手势）
- 外放的代价与逃生门：媒体外放不经过通话渲染，**浏览器硬件回声消除对这条出口失效**（外放开麦时对方可能听到回声/音乐串音），对策是广播时把背景音乐压到 6%（见 ducking 一条）+ 首次走外放提示一次「戴耳机效果最好」；「怎么玩」弹层给一个「📢 连麦语音外放」开关（`localStorage['tod:speaker']`，桌面隐藏，默认开），个别机型 AudioContext 出声有问题或想改回听筒时一键切回元素直出，**通话中切换即时生效**（先拆旧路径再建新的，任何时序都不叠音）；连麦按钮 title 里也写明当前走的是「外放」还是「直出」（触屏设备才显示），真机上一眼能确认到底有没有外放
- 链路自检（2.5s 一次，getStats）：connected 但 `inbound-rtp` 一个音频包都没收到 → 「对方未推流」，**只在该链路 `dir & 2`（对方本该在播）时判定**，我单向广播给别人时收不到包是正常的事，不许误报；协商完成但 14s 还没成链 → 「跳运营商/对称 NAT 需要 TURN 中继」；走没走中继记在 `pr.relay` 并写进按钮 `title` 明细
- 音量可视化零网络开销：本地麦 + 每个远端音轨各挂一个 AnalyserNode，rAF 循环算 RMS → 写 `--voice` / `.speaking`，头像波动即音量计；门槛 RMS 0.045 + 320ms 拖尾防闪烁
- 已知限制：无 TURN 服务器（纯静态单文件零后端），对称 NAT / 严格防火墙下可能连不通；无麦克风权限时优雅降级为纯文字游戏

### Phase 3: Choice (Truth or Dare)
- Active player sees two large buttons: 真心话 / 大冒险
- Click → card animates to center
- Each card has icon + label + animated border

### Phase 4: Draw Card
- Card animates to center (3D flip reveal)
- Spinning/drawing animation (1.5s)
- Random punishment text appears with typewriter effect
- Confetti burst on reveal

### Phase 5: Punishment Display
- Large card showing the punishment（文案去术语：「抽到的题」「完成挑战或跳过」）
- Player must "完成啦 ✅" or "跳过"（跳过不再污名化：中性样式、只在计分开时显示 ⏭ 角标）
- **计分红线（scoring 开，默认）**：完成 +10、跳过 −5，实时反映到头像角标（负分粉色 `.score-tag.neg`）、🏆 领先 chip 与 📊 战况；计分关时隐藏一切分数元素，纯欢乐局零压力
- **🎲 押注红线**：旁观者的押注只改押注者自己的分（±5/−3），**永不改变持麦人的得失分**；`test-host.cjs` 的 +10/−5 与 `passes=2` 回归不受影响（无押注时分支零开销）
- **🃏 免答牌（每人每局 2 张）**：抽到不满意可打出——静默换一题，**不算跳过、不留任何记录**，牌数用尽即止；只有持牌回合本人可见
- **🎲 换一题（主持人）**：局中任何时候给当前这张牌换题，同样不动任何人的账本（掉线救急/口味不对都能用）

### Phase 6: Turn Pass
- Next player's turn (mode-dependent, see Game Modes)
- Smooth transition: active glow moves to next avatar
- Background subtly shifts perspective
- **掉线保活**：`lastSeen` 超 40s 的玩家头像灰化 + 「离线」角标；若卡住的回合属于掉线者，主持人/最老客户端看到 ⏭「替 TA 跳过本轮」代跳条（抽卡动画窗口内不出现），代跳按该玩家跳过记账（−5）并解锁回合
  - **巡检不靠状态包**（修「代跳条最长要等 25s 心跳」）：`startTimers()` 额外跑一个 2500ms 的轻量 `watchTimer`，只在本机处于牌桌且对局中时重刷灰化/徽章/代跳条（`renderPlayers` + `updateGhostBar`），不再依赖下一次整文档心跳；`stopTimers()` 一并清掉

### Phase 6.5: 结算与颁奖（🏁）
- 触发：主持人点「🏁 结算」（二次确认），或约定轮数打满（`roundLimit>0 && stats.rounds>=roundLimit`，`closeTurn` 内判定）→ 写入 `S.finished={at,by}` 标记，全员切到结算屏（`currentScreen` 最高优先级）
- **颁奖台**：按分数（计分关时按抽卡次数）排序的前三名 🥇🥈🥉 podium + 一次性彩带（`finished.at` 去重）；趣味奖章：🏆 本局冠军 / 🔥 最活跃 / 💬 最会坦白奖 / 🎯 玩得起奖（完成最多） / 😌 稳如泰山奖（零跳过，需 ≥2 抽）
- **颁奖礼编排（2026-09 v2，只在换屏进入 result 的首渲染播一次）**：换屏与黑场聚焦罩（`#result-veil` 挂 **document.body**——`#app` 的 perspective 是 fixed 后代包含块红线——`0→0.85@45%→hold 0.5@75%→0@100%` 共 1s，纯 opacity）同起点；第3→第2→第1名 `pod-rise` 步进升起（160ms 错拍、240ms/步），冠军落定（t≈560ms）金环 `crown-pulse` 呼吸 3 拍定格亮环（纯 opacity）+ 彩带 + `Cam.shake(4)`（回调判 `Cam.curScreen==='result'` 防隔屏震），奖章 chips 自 t0+560ms 起 80ms 错拍 `chip-pop`，整链 ≤1.2s
- **重放红线（E2E 两颗雷）**：`renderResult` 每次心跳都整屏重建 innerHTML——ceremony 只许在「换屏进入 result」那一次播（`armResultCeremony` 在 renderScreen 的 changed 分支置 pending + `finished.at` 去重记账，renderResult 消费后其余渲染一律走无类终态）；**podium 的 DOM 顺序保持名次序**（`.pod.p2{order:-1}` 只动 flex 视觉列位，test-host 直接读 `pods[0]`=冠军），**`.pscore` 文本第一帧就是终值**（不做计数跳动，只有 pop——test-host 在 result 屏一出现就读值）；矮横屏 `body.landui .pod.p1{margin-bottom:6px}` 收缩冠军台阶保首屏 CTA
- 全员战绩明细表（抽卡/💬/🎯/⏭/🃏/分）
- 主持人操作：🔄 再来一局（重置比分/免答牌/防重历史，直接开下一局）· 🔙 回大厅（二次确认，清 finished 回大厅保留房间）；非主持人只读观赛

### Game Modes (两种对决模式)
- **🔄 轮流制对决 (turn)**: randomized first player; turns rotate in join order. Only the current player's choice cards are enabled; others wait with 「轮到某人」 hint. Accept/skip rotates `turnIndex` and hands the mic to the next player.
- **🎤 自由对决 (free)**: mic is open in every choosing phase — all players see enabled cards; first tap grabs the mic (`turn.chooserId`), late taps get a 「麦被别人抢了」 toast. After accept/skip the mic is released for the next grab. Stat chip 「回合」 counts total grabs (`stats.rounds`) instead of turn position.
- **轮次 chip 诚实化（2026-09 v2，`renderGameStatic`）**：旧文案「第 N 轮」渲染的是轮转位置 `turnIndex%len+1`，首回合随机起始就显示「第 4 轮」——三个分支按局型给真话：限轮局显示**真进度**「轮次 X/Y」（`stats.rounds` 在 `choose()` 抽卡那一刻就 +1，所以 choosing 显示 done+1、drawing/revealed 显示 done 本身——业务检查官逮过这里的 off-by-one，别改回去）；不限轮轮流局显示「第 N 手」（轮转位置的本义）；自由局 span 保持**纯数字** = `stats.rounds`（test.cjs:223-224 直接断言 `#stat-turn` 文本，别加装饰）。
- Mode is chosen in the lobby by the starter and stored in room state (`S.mode`); mid-game all clients follow `S.mode`. If the mic holder leaves/times out, `resetTurnStage()` releases (free) or rotates (turn) automatically.
- 局中换玩法：主持人 ⚙️ 设置里切换，**下一张牌生效**——只重新指派 choosing 阶段的持麦人，绝不没收正在翻牌/答题者的回合；回合交接语义统一显示为「轮到 X」。
- 轮数上限：`stats.rounds` 每抽一张牌 +1（代跳/跳过不占轮数之外的额度、换题/点名不产生轮数），打满 `roundLimit` 在 `closeTurn` 收尾时自动进结算屏。

## 4. Interaction Specification

### Controls
- Mouse/Touch: All interactions are click/tap based
- 横屏开关：手机端顶部右侧 `↔️ 横屏/竖屏`（触屏 / 窄屏 / 矮横屏才显示，真·横屏下自动隐藏；选择持久化在 `localStorage['tod:land']`）
- Keyboard: Enter to confirm, Tab to switch options；全部选择控件为原生 `button`（含头像格/套装/模式卡），Tab 可达 Enter/Space 可触发；房间号输入 `inputmode=text` + `enterkeyhint=go` + 自动转大写，名字框 Enter 直接加入

### Built-in Question Packs（三套装 × 三档尺度）
- 3 套内置题库（主持人 ⚙️ 里整套替换并同步）：🎉 热闹派对 / 💑 情侣私语（题须当场或远程可执行，不依赖在场第三人）/ 🏢 办公室安全（零隐私拷问、零身体接触、不发工作相关内容到任何地方）
- 每题带尺度标签 `{x, t}`，t ∈ mild/normal/hot（🟢温和=零隐私零社死 · 🟡普通 · 🔴刺激）；抽卡时按当前尺度过滤（过滤后为空则回退全池，绝不因改尺度出「无题可抽」）
- **防重复轮抽**：`recent.truth/dare` 记录最近出题（容量=候选池 60% 钳到 1..10，用尽自动重置），同一局不会连着看到重复题

### Import Punishment
- Paste a list of punishments into the import box (one per line)
- Markdown from external AI tools is auto-classified: `## 真心话` / `## 大冒险` section
  headings decide the bucket; `#` titles, tier headings, list numbers
  (`1.` / `1、` / `①`), bullets, bold and blockquote markers are stripped
- **档位识别**：小标题（`### 轻度/温和/刺激…`）给其后题目打尺度标签；行首 🟢/🟡/🔴 三色标是单题级声明（优先于小标题）；**换大类标题时档位回默认普通**，「温和级」不会串进下一节；无标线索默认 normal
- AI 把多条挤同一行（`…？1. …`）时先按「句末标点+序号」拆行；去重按题面文本
- Import target (for plain lists without headings) is picked by the 💬/🎯 tab
- **追加 / 覆盖两种导入**：默认追加去重合并；「覆盖导入」按钮 `armedTap` 二次确认后整桶替换（已自定义过的房间不怕误触）；自定义题库导入后 pack 标记清空（显示 📝 自定义）
- No in-app generator: the client is a single static file, so a real LLM call would need a
  backend + secret. Generation happens outside and is pasted in.

## 5. Data & State

### Room State（单文档，`normState` 入口归一：所有客户端对同一文档推演出同一结果，含 hostId 缺失时回落到最早加入者）
```json
{
  "room": "XXXXX", "ver": "number(时间戳 LWW)", "seq": "number(回退保护)",
  "mode": "turn|free", "gameStarted": "boolean",
  "hostId": "player id（建房者；消失自动移交最早加入者）",
  "level": "mild|normal|hot", "scoring": "boolean", "roundLimit": "number(0=不限)",
  "timer": "number(0=不限；15/30/45 秒限时挑战，仅展示不惩罚)",
  "surprise": "boolean(🎁 惊喜卡开关，默认 true；关闭后 surpriseOf 恒为空)",
  "finished": "null | {at, by}",
  "turn": { "stage": "choosing|drawing|revealed", "seq": "number", "chooserId": "id|null",
             "choice": "truth|dare|null", "punishment": "string|null", "ts": "number", "by": "publisher id",
             "stake": "1|2（🔥 加倍挑战，只作用于本轮，收尾后复位）",
             "bets": "{pid: 'accept'|'skip'}（🎲 旁观者押注，持麦人不参与；收尾结算后清空）",
             "betLog": "null | {at, items:[{pid,name,put,won,delta}]}（押注结算播报，全员同一份）" },
  "recent": { "truth": ["题面"], "dare": ["题面"] },
  "stats": { "rounds": "n", "truth": "n", "dare": "n", "skips": "n" },
  "players": [ "<Player>", "..." ]
}
```

### Player Data
```json
{
  "id": "uuid", "name": "string",
  "avatar": "\"av:P01\"…\"av:P24\" 预设短索引 | \"dcb:{s,d,b}\" 定制配方(~54B) | dataURL(上传照片/旧版头像)",
  "joinedAt": "number", "lastSeen": "number(心跳；写方时钟。各端另维护 HbMax/HbLocal 水位，发布不回退、在线判断用本端到达时刻)", "micOn": "boolean", "micListen": "boolean(在不在听别人广播；缺字段按 true 处理，防旧状态把新玩家当黑洞)",
  "passes": "number(剩余免答牌)", "skips": "number", "draws": "number",
  "combo": "number(🔥 连续完成次数，跳过清零；不改分，只用于徽章/颁奖)",
  "truth": "number", "dare": "number", "score": "number(可负)"
}
```
战绩字段由 `applyState` 里的自身快照（`myRecord`）与 `myPlayerTemplate()` 合并保护，重连不丢。

### Punishment Data（房间题库，独立 topic）
```json
{
  "truth": [{ "x": "题面", "t": "mild|normal|hot" }],
  "dare":  [{ "x": "题面", "t": "mild|normal|hot" }],
  "pack": "party|couple|office|\"\"(自定义)",
  "ts": "number", "expiresAt": "number"
}
```
Lives on its own retained topic (`.../pool`), not inside the room state document, so importing a
big bank never inflates per-turn sync traffic. 旧版纯字符串题库按 `{x: str, t:'normal'}` 兼容读取。

### Storage / Sync
- 在线联机：公共 MQTT broker（WebSocket, wss://broker.emqx.io 等 3 台），无需注册/密钥
  - **3 台同时连、写全部 fan-out**：每台 broker 的 retained 是各自独立的一份，只连「第一台可用」会让两个用户落在不同 broker 上 → 房间号相同却互相看不见（实际出现为一方名单里有对方、另一方没有）。现在并行拨号 + 每一路都订阅，写入发向所有存活链路，任一路可达即在线；keeper 每 7s 补连挂掉的 broker（补回后自动升回 mqtt，本地兑底链路可共存），全断 3 轮才降级本地模式
  - 房间状态 = topic `tod/v1/<房间号>/state`，retained 消息即房间最新状态，新玩家订阅即拿到全场快照
  - 房间题库 = topic `tod/v1/<房间号>/pool`（独立 retained 消息，只在导入时重发，空房间退出时擦除）
  - 连麦信令 = topic `tod/v1/<房间号>/mic`（非 retained 即发即忘，带 mid 去重 + 15s 时效护栏，防本地模式回放旧信令）
  - 表情雨 = topic `tod/v1/<房间号>/react`（同样非 retained/qos0，带 mid 去重 + 5s 时效护栏 + 表情白名单；不走房间状态，不撑大每帧状态包）
  - 任何状态变更整体发布（last-write-wins + seq 回退保护 + 掉线自愈/幽灵清理：最老客户端每 15s 巡检，`lastSeen` 超 90s 按 id 剔除幽灵——修复过旧版「按引用比较导致 prune 永不生效」的死代码；40s 即灰化标记并可被代跳，见 Phase 6）
  - **心跳水位线**（修「明明上线了对方却显示掉线」）：整文档 LWW 会把本端快照里别人旧的心跳一起发回去，盖掉对方刚续的心跳；而 `lastSeen` 是写方时钟，读方直减就把跳设备的时钟偏差当成掉线。两个水位分别消除：`HbMax`（本端见过的每人最大 lastSeen，发布/回写只前进）+ `HbLocal`（本端**收到**心跳增长的时刻，在线判断只看自己时钟）；时钟回跳等极端情况由「旧水位超过 STALE_MS 允许被接管」兼容；入房那一轮清理仍用绝对时间（刚拿文档时还没有到达水位），额外给 `HB_SKEW_GRACE_MS` 3min 容忍，房间 `expiresAt` 判定同样留这个缓冲
  - **reveal 单发布者**：drawing→revealed 只由抽卡人客户端定时发布（1.8s；REDUCED 0.7s），最老客户端仅 9s 超时兜底，各处带 seq 守卫；`applyState` 对「同 ver 同 seq 但 punishment 不同」的并发揭晓做确定性仲裁（`turn.by` 字典序小者胜），全端收敛同一张牌——修复过「双写各端显示不同题」
  - 🔄 重新同步按钮真实化：比对重订阅前后的状态签名 + 链路探活，明确回报「已拉到最新 / 已是最新画面已重绘 / 还没连上服务器正在重连」，不再假报成功；拉到后还会把本端（已合并各台 broker 结果）的状态 fan-out 回去，抹平某台 broker 上的旧快照
  - 分享与复制：**协议不是 http(s) 就当本地页**（微信「下载后直接打开」是 `content://com.tencent.mm.external.fileprovider/...`，旧版只判 `file:` 会把这种私有地址当成邀请链接发出去）；首次从 http(s) 打开时把在线地址存进 `localStorage['tod:home']`，之后用下载版也能拼出别人打得开的在线链接；`navigator.clipboard` 只在安全上下文存在（file://、content://、http://局域网IP 下它是 undefined，直接 `.writeText()` 会抛 TypeError，表现为「复制点了没反应」），因此 `copyText()` = clipboard API → `execCommand('copy')` → 长按复制手动弹窗（带「只复制房间号」），`.share-url` 开 `user-select: all` 方便一键全选
- 降级：本地模式（BroadcastChannel + localStorage），同一浏览器多标签页可玩；因为公共 broker 在部分移动网络不可达，降级时大厅分享区会显式提示「只有同一浏览器多标签能互相看见」，且 keeper 仍每 7s 在后台补连，连上即自动升回在线（不用刷新）。**长警告默认折叠成一行 chip**（`.share-box.fold`，点击展开全文）——旧版整段警告吃掉大厅首屏 ~40%，把「派对现场」挤成表单（走查实锤）；在线态不折叠
- **刷新自动回房（按标签页身份）**：加入成功后写 sessionStorage `tod:tab` 票（id/房间/名字/头像/local 标记/时间戳，天然按标签页隔离，多开不串号）；带票刷新 → 启动过场后自动 doJoin，同房间沿用旧 id，房间里的旧记录被原地替换，不会出现「两个一样的自己」，且回合 chooserId 不丢；主动退出（doLeave）/加入失败均擦票，刷新不再自动回房；票 30 分钟过期（与房间 expiresAt 对齐），**心跳里同步续期**（长局中途刷新不会因票过期中断身份复用）
- 回合阶段机：choosing → drawing → revealed（由 turn.seq 驱动，所有客户端同步重放动画）
- WebRTC 连通率：默认只配公共 STUN（Google + Twilio），**没有 TURN 就穿不过对称 NAT**（实测 metered/peerjs/stunprotocol 几台免费中继都拿不到 relay 候选，写进去只会白拖慢收集），因此改成 `localStorage['tod:ice']` 可覆盖：自建 coturn 后把 `RTCConfiguration.iceServers` 的 JSON 数组写进去即可，不用改代码
- 连麦标签只数 `connectionState === 'connected'` 的链路（**协商完成 ≠ 听得见声音**，旧版按 `remoteSet` 计数会把“根本没通”显示成「连麦中 · 2 人」）；按钮 `title` 给出「已接通 N 路 · 协商未完 N · 已断开 N · N 路走中继」明细
- 被叫端已 `remoteSet` 后又收到 offer（对方重建）时先拆旧 peer 再重建，防卡死

## 6. Acceptance Criteria

- [x] Players can join with name + avatar
- [x] 连麦：开/关麦全房同步，WebRTC 语音互通（本地 + MQTT 信令双链路 E2E 验证），说话者头像随音量波动/发光/声波环，关麦/退房即时拆链；**验收看“真出声”而不是“有元素”**：断言远端 `<audio>` 不 paused 且 `currentTime` 在推进（test-mic / test-mic-mqtt）
- [x] **开麦=广播**：A 单方开麦、B/C 零点击即可听声，且收听方 `getUserMedia` 调用数为 0（不弹麦克风权限）、`MIC.stream === null`、链路 `dir` 为 2/1 互补、广播方 `outbound-rtp.bytesSent > 0` 且跨满 3 轮自检不误报 🔇（test-mic-broadcast.cjs 9 步 / test-mic-3way.cjs 6 步：含三人房扇出、收听关闭→广播方同步撤链、恢复收听→链路自动重建、双方开麦→dir=3 全双工、广播者关麦后降级为纯收听）
- [x] 启动/加入加载动画：3D 抽卡 overlay 分阶段文案，首屏可见且完成后移除（Playwright detached 断言）
- [x] All joined players visible in real-time
- [x] Truth/Dare selection with animated cards
- [x] Card draw animation (3D flip + spin)
- [x] Punishment reveal with typewriter + confetti
- [x] Continuous background animation (one-shot feel)
- [x] Avatar entrance/exit animations
- [x] Import punishments by paste (Markdown auto-classified into truth/dare + 档位识别 + 追加/覆盖)
- [x] Mobile-responsive
- [x] 横屏与 PC/平板压档（`.pw/test-landscape.cjs`，88 条断言）：真·横屏 844×390 / 740×360（含 3 人局）自动套横屏布局，join/lobby/game/revealed/result 五个屏的主 CTA 全在首屏内且 trial click 可点、3 人局玩家卡不越出座次环也不顶到工具栏、`#card-truth` 中心命中自身（3D 命中不回归）、工具栏内容不横向溢出、设置弹层整体落在屏内、旁观者押注面板可见；390×844 竖屏点 `#btn-land` → `landforce+landui`、`--lvw/--lvh` 互换为 844/390、旋转后 body 铺满物理视口、旋转坐标系里输入框/加入按钮命中与点击均正常 → 再点一次类与变量完整还原；不切换时竖屏旧布局与 `--lvw/--lvh` 空缺零影响；另有 PC/平板压档梯队 1440×900 / 1280×800 / 1024×768（进入 `#screen-spectator`，逐屏检查「加入房间」「选类别牌」「跳过」等主 CTA 在首屏内且可点，并断言 `docEl.scrollWidth === innerWidth`）；全程零 JS 报错
- [x] Works in multiple browser tabs simultaneously
- [x] Two game modes: 轮流制对决 (rotating turns) and 自由对决 (grab-mic free-for-all), synced across clients; 局中可换玩法（下一张牌生效）
- [x] 主持人闭环：门禁/点名/换题/代跳/轮数上限自动结算/颁奖屏/再来一局，非主持人越权调用全部被拒（test-host.cjs 断言）
- [x] 题库升级：三套装×三档尺度过滤、防重复轮抽、🃏免答牌×2 静默换题不留记录、跳过脱污名
- [x] 韧性修复：reveal 双写仲裁、prune 死代码、票续期、resync 真实回报、撞号确认、re-offer 重建、40s 灰化
- [x] 同步韧性专项（`.pw/test-sync.cjs`）：3 台 broker 同时在线且写入 fan-out 到每一台 / 对端时钟慢 3 分钟仍显示在线 / 连发整文档不回退对方心跳 / 名单双向对称 / 全断降级本地后 keeper 自动升回在线且断网期间建的房间别人仍能加入；file:// 本地页不拿私有地址当链接、无 clipboard API 时复制仍有结果（已复制或手动弹窗）且全程零 JS 报错
- [x] 体验与性能：首进自动引导一次、DiceBear 本地打包默认头像（pixel-art + shapes，vendored MIT，零外网）+ av:P## 头像短索引（整帧状态 <1KB 量级）、REDUCED 静态动画路径、LOWPERF 降档、全按钮键盘可达
- [x] 性能回归（`.pw/test-perf.cjs`）：光球无 `filter:blur` 但保留飘动、`buildBg` 只在启动时调用（纸屑固定 26 片不逐轮累积）、软件光栅 + DPR3 下大厅 16 人与牌桌均 ≥50fps（p95 ≤25ms）、牌桌内连抽 6 轮后 DOM 节点与运行中动画数不增长、爆彩粒子残留为 0、防重复清单有上限、切走冻结/切回恢复、省电三档生效且刷新后记住、人为塞回 blur 层造成持续掉帧时被实测捕获并自动降载；全程零 JS 报错
- [x] 头像定制与持久化：31 风格 DiceBear 全量 vendored（~2MB IIFE，file:// 冷启动实测 ~2.2s）；定制器三轴（风格×seed×底色）+「就用它 / 保存到我的」；`dcb:` 配方进状态（~54B，双端逐字节一致）；「我的」localStorage 持久化（去重置顶封顶 30、上传压 96px JPEG、tod:me 下次访问自动恢复）；两连点删除 + 删使用中回落 av:P01 + 触屏角标常显；`.pw/test-avatars.cjs` 8 步 E2E 全绿
- [x] Layout polish: 单列宽度统一到 540px，触控目标 ≥ 40px，:focus-visible 描边，prefers-reduced-motion 降噪，窄屏头像/统计条收紧
- [x] E2E verified via Playwright: both modes × (local + MQTT) transports, sync/guard/stats all pass；连麦专项（test-mic.cjs / test-mic-mqtt.cjs / test-mic-broadcast.cjs / test-mic-3way.cjs）全绿；主持闭环专项（test-host.cjs，15 步）全绿
- [x] 连麦“没声音”专项：自动播放被拦时的兜底出声（test-mic-autoplay.cjs：复现 paused+有波形 → gain 路有输出 rms>0.005 → 手势后元素接管且兜底已撤）、晚到 ICE 候选补发 + 标签诚实性（test-mic-trickle.cjs）全绿；`check-syntax.cjs` 作为内联脚本语法门禁
- [x] 手机端连麦默认外放（`.pw/test-mic-speaker.cjs`，触屏模拟 `isMobile + hasTouch`，`--autoplay-policy=user-gesture-required` 逼真机行为）：真触发 `(hover:none) and (pointer:coarse)` 检测且默认走媒体外放；**「消费者」元素挂着但 `paused`**（不播 → 不叠音、不被切听筒）、gain 路真实出声 rms 0.398 且 ctx 仍 `running`（证明手势预热有效）、头像波形照常、已提示戴耳机、通话中开关切换（关→元素直出接管且兜底已撤 / 开→回到媒体外放并落 `tod:speaker`）、双向时广播方也走媒体外放且广播时音乐压到 6%；桌面回归（test-mic / test-mic-autoplay / test-mic-broadcast / test-mic-3way / test-mic-trickle / test-mic-mqtt）原样全绿，`probe-micspeaker2.cjs` 留「没有消费者元素就没声音」的对照取证
- [x] 3D 舞台与一镜到底（`.pw/test-3d.cjs`，31 条断言全绿）：`#app` 透视 1400px、`.world` 必须 `transform-style: flat`（防 3D 命中测试吃掉点击，`elementFromPoint` 锁）、每个 `.screen` 常态 `transform: none`；join→lobby→game 换屏时 `Cam.enter` 从当前机位续接且 1.5s 内收敛到常态机位（game `rx≈5`）；`.table3d` + `#cam` 透视存在；3D 座次前排更大更靠下且 zIndex 分层、每张卡中心都能命中自己；抽卡期间 `Cam.cur.z` 脱离常态实现推近；REDUCED 下 `Cam.to` 同 tick 瞬时到位且 world 计算值 `none`；全程零报错
- [x] 换屏一镜到底取证（`.pw/probe-scene.cjs`）：逐帧采样换屏期间的世界层机位——无瞬移跳变、新屏滑动入场且旧屏同步滑出（同一 0.64s）、动画结束进屋态后每屏 `transform` 回到 `none` 且选卡仍可命中；加入页→大厅的入场确实在加载层收起那一刻才播；game→lobby 回退带 `tx-back`；`shots/scene-fwd-*.png` / `scene-back-*.png` 留帧
- [x] 一镜到底 v2 取证（`.pw/probe-one-take.cjs`，11 条断言全绿）：①加载门控——join→lobby 的 280ms 揭幕间隙里旧屏仍以 from 帧 opacity 1 在场（fill-mode:backwards）、**新屏投影整体在视口外（left ≥ vw，加载未完成绝不入画）**、两面共用同一 delay；②窄屏（390×844）换屏镜头无过冲（z 单调收敛 -24，min>-25.5）；③颁奖礼——首渲染挂 ceremony + veil 挂 body、podium DOM 序=名次序、`.pscore` 首帧即终值、心跳式 renderScreen 重绘走无类终态不重放
- [x] VR 扫视取证（`.pw/probe-pan.cjs`，13 条断言全绿，回归门）：①加载门控——揭幕中段镜头停在换屏前基线（|Δry|<0.5°，join 基线 −3°）、入屏 left ≥ vw、出屏 rect==静置位且动画 currentTime<280ms；②扫视连续——入屏滑动逐帧单调无反向、无传送级跳变（Δ < 0.16·S+20，容掉帧不容传送；v4.2 深度层上线后软件光栅下掉帧更长，实测 ~232px ≈ 95ms 运动量，真机 GPU 无此现象）；③全景空隙——两房同框持续窗口（桌面 37 帧）且缝宽 ≥220px（实测 444~500px；恒速三段让缝在屏 ~54% 时长）；④偏头一瞥——中段 |ry| 峰值 6.66° ∈ (2°,9°]、收尾回正 <1.5°；⑤终态无残差——无 entering/leaving、落位屏 computed transform === 'none'（pan-in 终帧字面 none）；⑥窄屏两房同框（390+280 缝 282px，无 900 下限）+ 回扫 tx-back 镜像（入屏从 −S 侧进入）。`probe-cube`（立方体刚体判据）随形态退役删除。取证帧 `shots/pan-join-lobby-t*.png`（中段帧：旧房滑出左侧、新房从右侧滑入、中间露出星空空隙）
- [x] 深度参照层取证（`.pw/probe-depth.cjs`，双端 10 条断言全绿；⚠ headless 冷启动会被 perfWatch 自动降级 loperf，探针用 `localStorage['tod:perf']='full'` 强制全特效）：①静止态零姿态——无 tx-run 时五层 computed transform 全 'none'；②同拍武装——join→lobby 与 lobby→game（mutate 触发）的 tx-run 窗口内 ≥4 层非零位移；③深度梯度——峰值位移严格递增 far<mid<pillars<floor<dust（桌面 218/498/779/1038/1246px ≈ 0.14/0.32/0.5/0.667/0.8 × S=1560，与设计值逐像素吻合）；④零残差——摘类后五层 transform 全 'none'（整数周期瞬移不可见）。像素取证（`analyze-depth.cjs`）：idle 天区亮像素 23.9 万/地板区 13.7 万（参照物肉眼可见），idle→mid 差异 64~93% 像素（整场都在动；SVG 纹理版 2026-09-14 复测）。取证帧 `shots/depth-{desktop,narrow}-{idle,mid}.png`
- [x] 深度层填充绘制成本取证（2026-09，exp 对照实验；`exp-paint/exp-table` 已删、`exp-ab.cjs` 留作漂移分诊工具）：五层活渐变时大厅 p95 33.3ms（HEAD 基线 16.8），换 SVG data-URI 纹理后 16.8 持平 HEAD；同实验中「纯色 FillRect + 层透明度」也是 33.3ms → 成本模型是「绘制操作数/效果节点」而非「渐变 vs 纯色」。⚠ 牌桌门禁在 HEAD 上也会偶发 33.3（A/B 交替测同判）：p95 在 16.8/33.3 两档量化间是刀锋态，后台负载 ~40% 即掉档——牌桌遇 33.3 先跑 `.pw/exp-ab.cjs`（需先 `git show HEAD:index.html > baseline-check.html` 导出基线副本，测完删）分清「代码回归」还是「机器漂移」，别急着改代码
- [x] 退房/再加入的时序取证（`.pw/probe-leave.cjs`，MutationObserver 记 class 时间轴 + rAF 量帧间隔）：点退出到加入页 `.active` 实测 ~12ms（不再等 `publishState`）、加载层 hide → 大厅入场间隔 ~16ms（加入与「退出后再加入」两条路径都是）
- [x] 抽卡运镜跨横竖屏的连续性取证（`.pw/probe-draw-continuity.cjs`，逐帧采样 `Cam.cur` + 阶段 + 目标矩形，四种场景：竖屏 / 真横屏 / 旋转兜底横屏 / 抽卡中转屏）：① 转屏那一帧的单帧瞬移（Δz=18、Δs=0.048）已消除，`drawing→drawing` 换档帧给出中间值（z=-42.3）而不是端点，且转屏后镜头仍收敛到聚焦档（-46）而不是卡在常态；② `landforce` 与真横屏对同一张卡算出同一目标偏移 `[-45,-6]`（修复前旋转兜底算的是轴对调的 `[7,-35]`）；③ 竖屏数值与修复前逐项一致（`card` 目标 `[0,-33]`、`Cam.cur.y=-34`），无回归。回归：`.pw/test-3d.cjs` 31/31、`.pw/test-landscape.cjs` 88/88、`.pw/probe-scene.cjs` 换屏连续性原样
- [x] 趣味互动（`.pw/test-fun.cjs`）：表情雨本机+对端互达、浮窗点开才展开（6 颗 emoji，按钮文本 = 实际广播的表情）、320ms 防刷屏、白名单拒绝非法表情、粒子自动清理；音效开关持久化且 `SFX.play` 不抛错；加倍挑战仅持麦人可见、对端同步 stake=2、完成 +20、收尾复位（未加倍仍 +10）；连击 ×2 徽章同步且不改分（20+10=30）、跳过清零 30−5=25；限时 15 秒倒计时在走、到点显示超时且不自动跳过；命运转盘停在新玩家且光点动画可观测；**押注**：面板只给旁观者、押注同步/可取消、押中 +5 押错 −3 且只动押注者分、结算播报全场可见、押注清空、计分关时不出面板；**惊喜卡**：同题同 seq 推导确定、触发率落在 1/5 区间（400 次命中 40-130）、金卡上色两端一致、主持关闭后 200 次全部为空
- [x] 背景音乐、点击反馈与连麦压低（`.pw/test-audio.cjs`）：BGM 默认开、首次手势后自动出声（音频上下文 running 且增益缓入到默认 90%）、音量滑杆改到 30% 即时生效并持久化、关闭后停播且持久化、指南入口标签同步；**ducking（双总线）**：空闲两总线均 0.2 / 广播音乐压到 0.028 而**音效总线保持 0.2** / 仅收听（有链路）音乐压到 0.1 而音效仍 0.2 / 无链路不无端压低 / 关掉开关后广播也满音量 / 设置持久化与复原；新增 tap/draw/spark 音效不抛错；选卡/卡堆/翻牌按下回弹 + 涟漪生成并在 0.9s 内自动清理、翻牌扫光元素生成；全程零 JS 报错。连麦回归：`.pw/test-mic.cjs`、`.pw/test-mic-broadcast.cjs` 全绿
- [x] 互动浮窗不挡操作（`.pw/test-landscape.cjs`）：844×390 / 390×844 / 1280×800 / 1024×768 下浮标与展开的 6 颗 emoji 均落在屏内且与所有 `button/input/.player-card/.choice-card` 零重叠、浮标可真实点击（Playwright 点击，非 DOM 兜底）；Esc 可收起；旧版「底栏常驻」在 390×844 会压住选卡/工具栏、横屏左中会压住玩法切换的问题已消除
- [x] PC / 平板兼容（`.pw/test-landscape.cjs` 的 1280×800 与 1024×768 分段）：大厅/牌桌/揭晓页文档宽 = 视口宽（3D 牌桌透视投影不再撑宽，移动仿真下 fixed 浮窗不再被推出屏）；矮屏桌面/平板的选卡与「完成/跳过」落在首屏内；互动浮窗不压控件；`.pw/probe-overflow.cjs` 留证
- [x] PC / 平板版式（`.pw/probe-pcwidths.cjs`、`.pw/probe-pcfit.cjs`）：1920×1000 / 1440×900 / 1280×800 / 1024×768 / 900×900 / 820×1180 六档下 join/lobby 内容列水平居中（偏移 0~8px，8px 是经典滚动条的一半）、文档宽恒等于视口宽、浮标在屏内；加入按钮在 720~1080 各高度全部落在首屏内（旧版 ≤900 高全部需要滚动）；`.pw/probe-tabletshift.cjs` 留了「居中不改变纵向位置」的 A/B 取证

---

## 4. 炸弹猫（bombcat.html）— 第二款游戏（2026-09-19，分支 feat/bombcat-lobby）

单文件自包含卡牌游戏（three.js r128 UMD 内联，双击即开，无 CDN 依赖）。**与 arcade 会话（feat/arcade-monopoly）的分工契约**：index.html 的游戏中心屏由 arcade 会话实现（`?game=` 门控），炸弹猫以 `.arcade-card` 卡片接入（粘贴片段见 `.pw/design-bombcat-lobby.md` §9），`bombcat.html?room=X` 与跳转契约一致；本分支**零改动 index.html**。

### 4.1 架构
- **主机权威**：只有 host 跑规则引擎 `CAT`（纯逻辑单例，`G` 公共态永不含手牌内容/牌库顺序，手牌只在主机内存 `H`）。非主机一切动作走 `act` 主题（重试闭环：4s 未进 seq → 同 (from,mid) 重发 ≤3 次），敏感载荷（拆除插位/恩惠给牌）走 `p/<pid>/up` 私密上行主题。
- **传输**：MiniMqtt/LocalTransport/RoomLink 移植自 index.html，topic 族 `cat/v1/<room>/{state,act,react,p/<pid>,p/<pid>/up}`；'tod' 硬编码全部改名 'cat'（channel `cat-<room>`、key `cat:room:<room>:*`、clientId `cat-*`）。**LocalTransport 的 key 懒分配**支持动态私密主题；p/<pid> 的 `.pop()` 天然去重不许重构。
- **私密包**：主机对每个 state 变更向全部活人补发 `{hand, peek?}`；hello 3s 重试直到收到；qos1。
- **发牌公式**（probe 钉死）：副数 d=n≤5?1:2；放回拆除 6d−n、爆炸猫 **n−1**（用户原文准据，不随副数翻倍）；牌库 52d−4n−1；n=4→35张3猫 / n=5→31张4猫 / n=6→79张5猫 / n=8→71张7猫。种子 RNG mulberry32，`__cat.setSeed/forceDeck/setTiming` 测试钩子。
- **回合转结**：攻击不结束回合（attackQueued 累计，抽牌禁用+「结束回合」按钮）；收尾时 `下家.extra += attackQueued + 我方剩余 extra`。nope 窗 2.5s 起（无人持 nope 快结算 0.8s）、每 nope +2s cap 9s；奇数张=取消。出牌/窗口结算时刷新 `turn.acted`（等待他人不占决策时钟）。
- **看门狗**（主机 1s tick 唯一时钟）：nope 窗/拆牌 15s/恩惠 10s/弃牌挑 15s 超时兜底（种子 RNG）；回合 30s 无动作代抽，afk≥2 后 8s；**tick 后 dirty→必须 hostPublish**（引擎被 tick 改过而没广播 = P0，吃过亏）。
- **hostLost**：主机每 5s 心跳刷 ver；客户端 20s 无 ver 更新且 pending 过期 → 判死局回大厅（心跳不刷 ver = 全端误判弹回大厅，吃过亏）。over 局有人 join → 唤醒回大厅。

### 4.2 3D 与退路
- 借 tod DNA：FogExp2(0x0a0a1a,0.042)、ACES+sRGB、dpr 封顶、事件驱动阴影、球面脸贴片（r0.215，`color` 必须随 map 归白）、turnRing。**initScene 成功后必须挂 `body.three3d`**（忘挂=画布永远 display:none，吃过亏）。名牌=DOM 投影（本文件无嵌套 transform，直接写视口坐标）+ **签名边沿 innerHTML**（禁每帧重绘）。
- 无 WebGL/loperf/REDUCED → 纯 DOM 可玩：`#bc-board2d` + `#bc-players` 玩家状态栏承担全部信息。头像=程序化猫脸（`bc:h:s`，makeCatFace 种子 canvas）。

### 4.3 E2E 门禁与踩过的雷（改前必读）
- `.pw/check-syntax-bc.cjs`（独立命名，勿动 arcade 会话的 check-syntax.cjs）；`node .pw/build-bombcat.cjs` 从 `.pw/bc-src-a.html + bc-main-{1..4}.js + three-r128.blob.js` 组装 bombcat.html——**改源件后必须重建**。
- `probe-bombcat-rules.cjs`(8931) 31 断言：发牌四组数值/种子确定性/攻击叠加三例/nope 奇偶反制/拆牌/爆炸/恩惠/组合三式/负例/stf/看门狗/牌库空/离开/over 唤醒/mid 幂等。
- `probe-bombcat-ui.cjs`(8933) 25 断言：三人本地局全流程+观战+无 WebGL 退路；**稳定四连绿**（flake 治理史：act 重复投递曾引发「dup→hostPublish→storage 事件→再发布」风暴——`hostOnAct` 对 dup 必须 early-return；over 态残留自动 hostRestart 曾把结算屏 0ms 顶掉）。
- 探针纪律：本地模式同 context 多 page；注入手牌后给**每人**发 hello 补私密包；**清掉牌库原生 ek**（爆炸只由探针注入触发，剧本才确定）；等「按钮解禁」而非引擎态（渲染晚于 publish ≤1s）；GL 页截图 3-10s，nope/defuse 窗要放宽；3D 下点击用 evaluate 级 click（仓库既有契约）；page.evaluate 闭包**不能引用 Node 变量**（ids 用参数传）。
