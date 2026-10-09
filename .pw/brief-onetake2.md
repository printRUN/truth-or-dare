# 一镜到底第二轮：全场硬切清零（brief-onetake2，2026-10-08）

用户点名：「将所有游戏每一个元素要有一镜到底的过渡动画，给玩家更强烈的游戏感觉，探索头脑风暴整改添加」。
上一轮（SPEC §1.10）做了页间 warp / uno 选色 / bombcat 悬念拍+结算一镜 / mono 清算仪式。本轮清剩余硬切。

## 取证基础
- Explore 全场盘点（五页硬切清单+行号，2026-10-08）。
- 真机走查（IAB 浏览器实玩）：monopoly 自动开局+买地链路通、UNO 发牌/抬牌/出牌一镜在工作；实拍 .pw/shots/ot2-{arcade-boot,mono-buymodal,uno-board,uno-raise}.png。
- 环境观察项（备案，不立项）：本机 IAB 软渲下 monopoly 自动翻 body.loperf 后 GL 画布全黑、仅剩 DOM HUD（uno 未翻）。loperf 档本来就是探针状态机档，真机弱端是低帧不是黑屏；但「loperf 静默黑屏无任何降级提示」值得工程专家评估是否加一行 toast（本轮不做，避免动 perfWatch）。

## 玩家模拟结论（优先级依据）
按「每局触发频次 × 突兀感 × 现成参照」排序：
1. **uno 名牌/行动环全量重建闪断**（refreshSeatFx :1195-1222）——每次摸牌/出牌/换回合都发生，是全五页最高频的硬切；所有座位名牌+环 scene.remove→add 整批闪断，行动环 0.12↔0.95 瞬跳。
2. **uno 结算裸进**（showResult :1838-1860）——四页结算里唯一没有镜头语言的（bombcat 有 victoryOneTake、mono 有 focusPawn+钞雨+veil、tod 有 veil+pod-rise+shake）；result-overlay.hidden=false 一拍直切。
3. **monopoly 破产棋子凭空蒸发**（:2523-2524 visible=false 双瞬隐）——清算仪式（钞票飞+房子收回）都有了，唯独「人」本身没有谢幕；bombcat:3068-3075 有现成 600ms 倒地可移植。
4. **tod/index DOM 硬切族**——bet-box/stake-row/倒计时条/揭底答案/modal 关闭，全是 hidden 翻转裸切；index 首进四卡无入场（返回时才有 drop-back）。
5. **monopoly 出狱整体缩隐**（syncJailCages :1568-1578 收笼=升起+缩隐）——「破笼而出」没有门的语义；铁笼根本没有门（1508-1530 无门子对象）。
6. **bombcat 插回滑杆纯 DOM + NOPE 倒计时纯 DOM**（:2003-2024 / :1786-1803）——全场张力最高的两个决策时刻没有 3D 存在感。

## 工作项（六项，全部吸收上一轮红线经验）

### W1 uno seatFx 常驻化+渐变（最高频，先行）
- 现状：`refreshSeatFx`（uno.html:1195-1222）签名（任何人手牌数/回合归属）一变即 `scene.remove` 全部 label+ring 再重建；行动环 opacity 0.12↔0.95 瞬跳。
- 改造：名牌 sprite 与行动环 mesh **常驻**（首次构建后不 remove），`refreshSeatFx` 只 diff 文本/位置/颜色；行动环透明度与缩放走 **180ms 墙钟 smoothstep ramp**（目标值 0.12/0.95，每帧向目标收敛或微补间——参照 tod.html:7240-7247 名牌 opacity 渐变模式）；换座位（restart/人数变化）仍允许一次性重建（结构性变化豁免，签名加 seatRev 计数）。
- 位置变化（对手堆垫片/label 跟随 seatPos）：直接写目标位（座位本身不动画，出牌方向语义不变）。
- 红线：**probe-uno-net B2 隐私断言与 ev-uno-seats dealOrder 断言零改动保绿**——label 文本（名字·牌数）必须即时更新（ramp 只作用于 opacity/缩放出入场与行动环切换，不作用于文本内容）；暗牌期对手手牌数照常显示（现状语义，不新增暴露）。

### W2 uno 结算一镜（四页唯一裸结算）
- 现状：showResult（:1838-1860）只 `result-overlay.hidden=false`；DOM 有 veil-in/pod-rise/彩带，镜头不动。
- 改造（bombcat victoryOneTake 语言移植）：胜者判定的当下——`camTo`（:640 现成 smoothstep 补间）从当前机位缓推至**胜者座位上空偏桌心**的加冕机位（500-600ms，终点=seatPos(winner)×0.55 高度 +1.2、lookAt 桌心）→ 200ms 后 `result-overlay.hidden=false`（veil-in 0.4s 罩上来盖住镜头运动收尾）→ 彩带照旧。败者视角/观战端同样推（推的是同一胜者）。僵局（200 连过）不推镜直落 veil。
- 相机安全性：推镜期间禁 `glanceAside` 回程（复用 wildGL 的 `clearTimeout(rig._glT)` 先例）；REDUCED/bodyLo/TURBO 直落 veil（现状）。快照补演路径（NETMODE 观战 OVER）同样先推后揭，总延迟 ≤700ms 不碰「快照相位过渡」语义。
- 门禁挂点：新 ev 断言「showResult 时 camTo 目标≠当前机位、veil 延迟 200-300ms 窗口」。

### W3 monopoly 破产倒地（纯移植+变灰）
- 现状：bustRitual 内 `pawnObjs[i].visible=false; plateSprites[i].visible=false`（:2523-2524）与 collectAll 分支（:2712）双瞬隐。
- 改造：移植 bombcat:3068-3075 倒地（600ms rotation→倒+下沉 0.18）+ **材质 lerp 变灰**（clone 一份灰色材质换上去，或 emissive 清零+color lerp 到 0x888888）；倒地完成后才 visible=false（名牌同步淡出 300ms）；插在 bustRitual 序列「散钞起抛」同一帧起拍（倒地与钞票飞并行，不延长仪式总时长）；**观战端 op 回放路径（:648 bust op）同样走倒地**。
- 冲突检查：倒地只写 pawnObjs[i] 的 rotation.y/z 与 position.y，**不碰 clone flight（从 TILES 坐标起飞）与 noteScatter（独立池）**；body.shaking 重震互斥判法沿用（:2283 先例）；REDUCED/bodyLo/TURBO 直落 visible=false（现状）。
- 代际：`deadT` per-player 代际（bombcat:2781-2782 同构）——重开/快照重写时立即置终态，防在飞倒地跨局残留。

### W4 monopoly 出狱「笼门摆开」
- 现状：铁笼=6 竖条+顶圈 Group（jailCage :1508-1530），无门；出狱=整体升起+缩隐 280ms（:1568-1578）。
- 改造：①几何——朝 TILES[6] 外侧的竖条中取 2 根改挂 `cageDoor` 子 Group（门轴 pivot 在笼缘，局部 x=+0.34），门上加一根横梢（细 Box）读作「门」；②出狱两拍——**门绕 y 轴向外摆 100°（260ms easeOut）→ 笼身上升+缩隐（240ms，现状语言）**，总时长与出狱滑行并行不阻塞 movePawn；③入狱落扣不变；④cageTok 代际锁语义不变（双翻转窗口安全，收笼终帧 `!jailCageState` 复核照旧）；⑤rebuildBoardVisuals 镜像 dispose 补 cageDoor（traverse 已覆盖 Group，确认无裸 geometry 残留）。
- REDUCED/bodyLo/TURBO：跳门摆直接现状缩隐。

### W5 bombcat 插回 3D 存在感 + NOPE 倒计时 3D 环
- 插回（:2003-2024 openInsert + #ins-slider :402）：**DOM 滑杆语义零改动**（ev 断言在 #ins-pos/#ins-slider）。加 GL 层：①ovl 弹出时（bodyLo 豁免）桌面**牌堆上方悬浮一张爆炸猫克隆卡**（flyCard `hold` 语言：从牌库顶升起 0.5 自旋悬停+浮沉）；②滑杆 input 事件驱动克隆卡在牌堆上方**沿插环轨迹滑动**（pos/len → 弧线参数，插入选定缝隙处放一枚发光缝隙指示片）；③确认插回→克隆卡俯冲进缝隙+缝隙爆一圈 ring（ shockRing 语言）+ovl 关闭。**引擎时序零改动**（ovl 弹出/确认的 DOM 时序不变，GL 演出全是伴随层；hold 条目 mesh 离场自清先例 :2894 段）。
- NOPE 环（:1786-1803 renderNope + #nope-ring conic）：贴桌 **additive RingGeometry 大环**（回合呼吸环语言 :2788-2798）置桌心，倒计时进度映射 `ring.geometry.thetaLength`（每帧重建几何太贵→用两个半环或 scale+opacity 脉冲近似——**实施时选开销最小方案**，禁每帧 new geometry）；nope 窗口开→环弹入（scale 0.6→1 200ms）+随剩余时间加速脉冲；窗口关/被 NOPE→环缩隐。DOM conic 环保留（可读性双保险）。
- REDUCED/bodyLo：GL 层全部不挂，纯 DOM 现状。
- 探针：ev-bc-suspense 的「引擎时序不变」断言模式复用；新 ev 断言 ovl 弹出时克隆卡存在、插回确认后克隆卡离场。

### W6 tod/index DOM 硬切族批修（同一 CSS 模式批量）
逐处（tod.html 行号，index 同源 +9~30）：
- **bet-box / stake-row**（:4717+4440 renderBetBox / :3390）：hidden 语义保留，加 `.on` 类过渡——进场 translateY(14px)+fade 240ms、离场 180ms 反向（离场用 transitionend 后补 hidden，或 visibility+opacity transition 纯 CSS 双态——**实施取纯 CSS 双态**，零 JS 时序风险）；REDUCED/loperf 直切。
- **限时挑战倒计时条**（:4411 + CSS:1115-1116）：display:none→flex 硬切改 opacity+translateY 过渡（`visibility` 双态写法，display 不动也能过渡——用 grid 常驻+visibility 折叠）。
- **揭底按钮→答案**（:6567-6568）：`answer-text` 进场接 playReveal 打字机（:3827 现成）或最简 badge-pop 0.35s；按钮退场 fade 150ms。
- **modal/guide 关闭**（:6344/6346/6378/6379）：抄 monopoly `ovl-pop`（monopoly:151-152）做进场，新增 `.out` 反向 180ms（关闭时挂类→180ms 后 hidden=true，单处 helper `closeOvlAnimated(el)` 收口所有调用点）。
- **index 首进四卡入场**（:6890-6896 揭幕后只调 playWarpBack）：把 playWarpBack 的 grid 错峰段提为 `playCardsDrop()`（.drop-back 类 60ms 错峰），boot 无票也播（**与揭幕时序对齐：揭幕 280ms 后起拍**，同 pull-back 起拍延迟参数）；有票时行为不变（probe-tod-home 8 断言零改动保绿；ev-arcade-dive 不受影响——它只测离场）。
- **tod GL 侧两处顺手**：turnRing 出入场 200ms opacity/scale ramp（:8273 visible 翻转处，名牌 fade 模式）；回合结束题卡收卡 300ms 缩落（:8055 visible=false 处，飞卡逆播）。
- 红线：新增 CSS 动画必须 **REDUCED 媒体块 + body.loperf 双退路**（上一轮通用雷#2：animation:none 清 forwards 填充会一帧弹没——`.off`/终态类必须钉住 transform 终值）；modal 关闭 helper 不得破坏 probe 断言的 `hidden` 属性最终态。

## 备案（本轮不做，留下一轮）
- index GL 大厅四桌实景 diorama（点卡飞入真实 3D 桌——最大工程，需独立一轮）。
- tod 结算 GL 颁奖台 3D 化（现有 veil+pod-rise+shake 已有礼感，GL 化收益/成本比低）。
- monopoly 买地 3D 地契卡（买地已有钞票→天降→印章三段高潮链，再加卡会拖节奏）。
- loperf 黑屏 toast 提示（动 perfWatch，独立小轮）。
- uno 手牌扇全量 tween 重排（摸牌双影瞬移，等 W1 落地后单独评估——风险在 layoutHand 短路径）。

## 红线（全部沿用上一轮 brief，违反=返工）
- uno：GL-off 退路全保留；B2 手牌隐私断言零改动保绿；probe-uno/uno-net/persona/seats/verify 五探针零改动（AUTOTEST 行为不变）。
- monopoly：零 rig 写入（镜头所有权 R2c/R2d 锁）/零状态包新字段/抖动 Math.random 不消耗 rngBox/速度变量一律 let；破产倒地与 body.shaking 互拆检查。
- bombcat：**build 管线已死，bombcat.html 是事实源，禁跑 build-bombcat.cjs**；引擎时序零改动硬门；GL 门控 sceneReady()；retireScene 清理（新 GL 对象全部入 retire 清单）。
- index/tod：真导航契约（probe-arcade ②③⑥）/返回不劫持/tod:tab 不读不跳；probe-loader-gate B 禁碰 .loader-card；**LF 行尾纪律**（Edit 保存会整文件规范化，index/mono/uno sha 门禁）。
- 全部：REDUCED/bodyLo/TURBO/GL-off 四退路一个不能少；新 GL 元素必须在 retireScene/重建路径有释放（Group 化必须 traverse dispose）；check-syntax 五文件+three/dicebear sha 锁；**同文件实施必须串行**。

## 门禁（验收）
- 新探针：`.pw/ev-uno-seatfx.cjs`（常驻化后无 remove/add 闪断、行动环 ramp、B2 隐私回归、showResult 推镜+veil 窗口）、`.pw/ev-mono-fall.cjs`（破产倒地 ramp+代际清场+仪式共存、笼门两拍时序）、`.pw/ev-bc-insert3d.cjs`（插回克隆卡存在/联动/离场、nope 环弹入缩隐、引擎 ver/log 时序不变）、`.pw/ev-tod-domfade.cjs`（bet-box/倒计时/揭底/modal 四处过渡存在且 REDUCED 直落、index 首进入场）。
- 回归：probe-uno 21、probe-uno-net 11、probe-persona-uno、ev-uno-wildpick 14、probe-monopoly 28、probe-mono-maps、probe-mono-replay 8、probe-mono-net 17、probe-persona-mono 46、ev-mono-bust-ritual 25、ev-bc-suspense 12、probe-bombcat-ui、probe-bombcat-rules 37、ev-bombcat3d 61、probe-arcade 32、probe-loader-gate 10、probe-tod-home 8、ev-arcade-dive 19、check-syntax(+bc)。
- 端口纪律：新探针挑未用端口；实拍证据 .pw/shots/。

## 实施顺序（同文件串行）
A: W6 tod+index（DOM/CSS 为主，先做最快见效）→ B: W1+W2 uno（同文件一轮做完）→ C: W3+W4 monopoly（同文件一轮）→ D: W5 bombcat。每步完成即跑该页回归再交下一棒。

---

# 评审吸收（2026-10-08 三专家 SHIP WITH FIXES 全吸收，按此实施=定稿契约）

三位专家：视觉/动效、工程红线、玩家价值。以下合并全部必修+高优修订，**与上文冲突处以本节为准**。

## 定稿价值排序（玩家价值专家重排；工程实施顺序 A→D 不变，W4 降为 C 棒末位=指定砍单候选）
W1 > W3 > W5a(nope环) > W2 > W6主体 > W5b(插回) > W4。

## 节奏预算（硬指标，全部专家背书）
- 回合循环内伴随演出（W1 ramp/W6/nope环/turnRing）：**≤250ms 且与引擎并行**，离场过渡不得推迟下一 stage 可交互性；进场过渡期间按钮立即可点（transform-only，禁 animation-delay 挡 pointer）。
- 每局一次事件（W3/W4）：新增 ≤300ms（并行后），仪式总长不得超现状 +300ms。
- 结算（W2）：事件→结果可读 ≤1.2s（胜者档）；败者端 ≤800ms（350ms 短推）。
- 决策窗口（W5b）：0ms 输入延迟，确认键语义时刻=sendUp 时刻。
- 四退路（REDUCED/bodyLo/TURBO/GL-off）全部 0ms。

## W1 定稿（uno seatFx）
1. ramp=**系数制**：`r.material.opacity = r._k * amp`（amp=呼吸 0.55~0.95 正弦，:2095-2097 现写入改乘 _k）；_k 走 120ms（熄灭）/220ms（点亮）非对称墙钟 ramp，**从当前 opacity 相位值起播**（不从常数起，防跳变）；终值锚死 0.12/0.95。REDUCED/bodyLo 下 pulse 不跑（:2095 门控）→ ramp 分支三档直写终值（照 camTo :644 REDUCED 降级模式）。
2. label **按座常驻 canvas + CanvasTexture**：diff 只重绘变化座（文本签名 `名字·牌数` 缓存比对）+ `texture.needsUpdate=true`，零新建零 dispose；仅 seatRev 结构性重建走全量 dispose（对齐 :1200-1201）。**seatRev 豁免条件必须含 players 长度/名字集合变化**（AUTOTEST mc 连续开局、rematch 都触发）；豁免重建时旧元素走 120ms 淡出再 remove（结构性变化也不许自己造硬切）。
3. 取证口：构建时把文本写 `sp.userData.text`（现存断言零影响）——B2 只断言 cards() 不读 label 文本，新 ev 探针断言「摸牌后 200ms 内 userData.text 同步」补盲区。
4. 现状 `refreshSeatFx` 的 dispose-all 保留为 `rebuildSeatFx()`；`__uno.seatFx()` 快照形状保留（ev-uno-seats 的 `op<0.5` 断言：失活 ramp ≤180ms+首建直写 0.12 已兼容，新探针采样前等 ramp 完成）。

## W2 定稿（uno 结算一镜）
1. **veil 参数纠错**：#result-veil 实为 **1s radial vignette 且中心透明**（:160-161）——永远盖不住画面中心。编排=「暗角渐暗、镜头在暗角内落定」；**删一切 veil 覆盖类断言**。
2. **result-overlay.hidden 保持 :1859 同步翻转零改动**（probe-uno A8 在 OVER 后立即采样）；推镜/veil 改**覆盖层语言**：veil 元素先内联 opacity:0，`300ms(×SPEED)` 后起 1s veil-in；overlay 内容容器如需延迟入场挂类实现，hidden 语义一字不动。
3. 推镜 **560ms 单一常量**；本端=胜者 560ms 完整加冕、**败者/观战 350ms 短推**（camTo ms 参数三元式）、僵局不推镜。camTo 只能补 az/elev/focusK/tgt（机位 camApply 球坐标重算）——加冕位换算 `az=atan2(seatPos.x, seatPos.z)`、focusK=目标距离/基准 d、tgt 保持桌心；**禁直写 camera.position**。
4. `SFX.win()` 从 showResult 内前移到 camTo 起拍帧（败者短推路径同样起拍响）。
5. 双触发防护：hidden 同步翻自动闭环 :509 守卫，再兜 `G._resultShown`（startGame :1421 清）；**applyGameSnapshot :509 调 showResult 需透传 stall=（G.winner==null）**（现状无参调用会让观战端僵局误推镜）。
6. 推镜整体包 `if (!REDUCED && !bodyLo && !TURBO)`（不依赖 camTo :644 瞬落降级——会把结算屏背后钉在加冕位）；起拍前 `clearTimeout(rig._glT)`。
7. 门禁：断言「showResult 距 camTo 起拍 250-350ms（SPEED 标定，AUTOTEST 0.15 档=45ms 级）」+「败者端 ms≤400」；新探针采样前断言非 bodyLo。

## W3 定稿（monopoly 破产倒地）
1. 两段式：**倾倒 420ms easeOut + 触地小弹 180ms（回弹 ~8° 后落定）**（玩具语言，禁匀速瘫倒）；起拍=仪式起拍 **+120ms 错拍**（钱先飞、人后倒），总 720ms 与克隆航时 700ms 同点收尾，横幅时序不变。
2. 轴向：起手 `grp.rotation.y = atan2(px,pz)`（pawnSlot 坐标，朝离桌心方向）再 rotation.x 0→+0.85rad——**向外倒**（rig 环绕镜头，世界 x 轴会随方位倒错）。
3. 变灰：**倾倒 50% 进度起**，直接 `mat.color` lerp 到 0x888888 + roughness 0.4→0.9（mat 每 pawn 私有已验证 :1408-1411，零克隆零 dispose）；**躺平停 250ms（遗体告别拍）→ 250ms opacity 淡出（fade 起点置 mat.transparent=true，终帧还原）→ visible=false**。
4. **fallAndFade(i) 单入口**收口三隐身处（charge :2523、collectAll 内联 :2712、观战 bust op 回放——brief 原 :648 是 dealStamp 行号漂移，实为 :661 调用点）；入口起手**复位 grp.visible=true + plateSprites[i].visible=true**（观战端 :560/:561 快照先隐、倒地演给空气的漏门）。
5. **applyGameSnapshot :560 的 visible 写入与 placePawn 加 fallTok[i] 在飞守卫**（行动者端 echo 快照会杀在飞倒地+placePawn 复位 pose）；fall 终帧自带 visible=false。
6. 新局 pose 复位：startGame 路径对非破产 pawn 复位 `rotation.set(0,φ,0)/position.y` 基准（buildPawns 仅首次跑，NETMODE 重开 pawnObjs 复用会残留倒地 pose；placePawn 只归零 rotation.z 不够）。
7. deadT per-player 代际（bombcat :2781-2782 同构）；空地块路径横幅与倒地同屏正确、不对齐时序。

## W4 定稿（monopoly 笼门，C 棒末位）
1. 价值序最低=指定砍单候选；若实施按本节。门=取**局部 60°/120° 两根竖条**改挂 cageDoor 子 Group（hinge pivot 在笼缘），横梢必加（旋转读数本体）；**cageDoor 基础 rotation.y=atan2(TILES[6].x, TILES[6].z)**（多图方位安全；经典图 =−45° 朝外对角=朝镜头，两机位可见），摆幅 **115° easeOutBack**（过切线甩到笼壁+末端回弹）260ms 后接现状 240ms 升起缩隐；与 movePawn 并行。
2. 补 clank 音（SFX 现场合成 ~40ms 短方波+高通噪声，:440 pop 同款）。
3. **复位四路径**：正常收笼终帧（:1576 visible=false 处）、双翻转重落扣 want=true 分支（:1540-1541 visible=true 处）、REDUCED 直落分支、换图 rebuild（重建天然归零）。
4. **必修独立 bug：rebuildBoardVisuals :1247 置 jailCage=null 但不 bump cageTok**——在飞收笼循环无 `!jailCage` 空判，换图窗口 TypeError；**W4 前置先修此 bug（:1247 补 cageTok++）**，门摆循环带 my!==cageTok 守卫。
5. dispose 已验证 traverse 覆盖子 Group（barMat 共享重复 dispose 幂等无害），无需改。

## W5 定稿（bombcat，拆两半）
### W5a NOPE 环（升格：修的是理解断层不是氛围）
1. 现状确认：#bc-nope 横幅含 iHaveNope 门控（:1790）——**手里没休想的玩家在窗口内什么都看不到，游戏「无缘无故卡住」**。贴桌大环**全场可见**（挂 renderGame 顶层按 pd.kind==='nope' 生命周期，不进 renderNope 的持牌者门控）；deadline 是公开状态零泄露。
2. 只在 `deadline-t0 ≥ 1.5s` 窗口全待遇：弹入 scale 0.6→1 200ms + 随剩余时间加速脉冲（红 0xef4444，禁用 turnRing 琥珀——红=危险窗口）；**quick=800ms 路径（:1111）不出环**（弹入即缩隐=闪烁噪声）。
3. 几何：**预生成 ~36 档 thetaLength 几何缓存，挂 scene 模块闭包内**（initScene 可重入，缓存随场景重建换新；禁模块级缓存持已 dispose 几何）；在既有 renderNope 200ms interval（:1797-1802）里按剩余时间切档，禁每帧 new geometry。
4. 位置：桌心贴桌（FELT_Y+0.012，turnRing 同层语言）——桌心已验证无物（deck 在 -0.95、弃牌堆在 +1.32）；additive/fog:false/depthWrite:false。
5. retireScene 自动覆盖（scene.traverse 全量 dispose 已验证 :3084-3089），前提 add 进该 scene。
### W5b 插回滑杆 3D（降级：指数收敛，价值天花板=仅本端可见）
1. **#ovl-insert 改下锚 bottom-sheet**（纯 CSS）：`background: linear-gradient(180deg, rgba(4,4,12,0.10), rgba(4,4,12,0.62) 60%); align-items: flex-end;` box `margin-bottom: max(12px, env(safe-area-inset-bottom))`——上半屏透亮看牌堆。**不动 ovl 进出场**（.ovl-box 已有 pop-in 0.22s :173）；#ovl-give/#ovl-discard 不动。
2. GL 层：ovl 弹出→爆炸猫克隆卡从牌堆顶升起悬停（flyCard hold 语言，:2907-2915 fuseMesh 持有模式）；滑杆驱动克隆卡沿**牌堆南侧竖直导轨**滑到目标缝隙高度（插回是深度语义：deck y 轴堆叠 :2452，无环无弧——brief 原「插环轨迹」几何错误作废）；缝隙指示片=发光薄片从堆侧伸出 0.06，**量化跳位**（步距 ≤CARD_T）。
3. 滑杆跟随**禁逐帧 1:1**：input 只写目标值，克隆卡每帧向目标指数收敛（rate ~14/s / 系数 0.25，tod tipFade 同款）；指示片即时跳。**监听必须扩写 ：2020 `slider.oninput` 属性赋值链**（`oninput = () => { drawVis(); glSync(); }`），**禁 addEventListener**（重开会叠加）。
4. 确认（#ins-ok :2022）→ **sendUp 语义时刻零延迟**，GL 俯冲进缝隙+ring 爆 ≤300ms 纯并行。离场**收口**：closeOvl 单点（按 ovl.id 分流，:2025）+ 阶段切换批量关（:1759-1761）+ **showScreen 胜利路径顺手收口**（:1437-1441 不关 ovl，stage→over 后 renderGame :1713 早退批量关不执行，ovl 跨屏残留）+ retireScene 兜底。克隆卡共享 texCache/cardGeo 绝不 dispose（:2512 纪律）。
5. DOM 语义零改动：#ins-slider/#ins-pos 断言口径、probe-bombcat-ui :221-229 同步 `!hidden` 断言全保绿；**closeOvl 严禁加延迟 hidden**。

## W6 定稿（tod/index DOM 族）
1. **bet-box**：入场维持 fadeChrome 现状零改动（:3852-3858 已有内联 opacity 0→1/0.2s——再叠 CSS 进场=双动效源互压）；只补离场：`#bet-box[hidden]{ display:flex; visibility:hidden; transform:translateY(14px); transition: transform .18s, visibility 0s linear .18s; }`（**只做 transform+visibility，opacity 归 fadeChrome 管**——inline 值会压死样式表 opacity；[hidden] 显式覆盖 UA display:none 才有过渡）；hidden 属性语义保留（probe-3d-feel:261/test-fun:240 `!hidden` 口径零改动）。transform-only=进场期按钮可点。
2. **stake-row**（无 chrome owner）：完整双向双态 240ms（pod-rise 家族）。
3. **timer-wrap 倒计时条**：**从上方落入 translateY(-8px)**（在卡片区上方，方向与 bet-box 反向才对）；折叠=visibility:hidden+opacity:0+**高度归零**（sim-desktop:407 audit 含 timer-wrap，占位会误判；实施后实跑 sim-desktop 验证）；test-fun:213 断言 `.on` 类语义保留。
4. **揭底答案**：**badge-pop 0.22s scale-in（0.92→1）钉死**——禁打字机（probe-challenge:123/127 断言 textContent 完整答案，300ms 即采）；textContent 同步全量写入、hidden 翻转保持同步；按钮退场 fade 150ms。
5. **modal/guide 关闭**：tod .modal-mask 已有 fade-in 0.25s 进场（:519）——**只补 .out 180ms 出场，勿叠第二层进场**，180ms 禁超。helper 必须 **token 化**：`el._closeTok++; const my=…; setTimeout(()=>{ if(el._closeTok===my) el.hidden=true; },180)`；showModal(:6344)/openGuide(:6378) 置 hidden=false 时同步 `el._closeTok++` 作废在飞关闭（modal 单例，test-fun:213 关后立 designated 重开会被迟到定时器摁灭）；REDUCED/bodyLo/AUTOTEST 直落同步 hidden。
6. **index 首进四卡**：抽 `playCardsDrop()`（只含 280ms 延迟+drop-back 挂摘）；playWarpBack=票判定+playCardsDrop+Cam 续接；**boot 无票只调 playCardsDrop（只播卡片不播镜头——boot 本就有 Cam.init dolly，叠 pull-back=双镜头源）；有票走 playWarpBack（内含一次 drop），严禁 boot 再独立调**。错峰 60→**40ms**、单卡 0.32→**0.26s**（总 ~380ms，玩家已在找卡点）。REDUCED/LOWPERF 守卫抄 :6772。
7. **tod turnRing ramp**：与 W1 同款系数制（`ringK·(0.55+0.25sin)`），visible=false 挂 ringK<0.02 收敛后，熄灭/点亮竞态 token；IS_REDUCED 直切现状保留。
8. **收卡**（:8055-8058）：**回堆 320ms 独立 tween**（位置向 deckL 小弧+scale→0.55+落堆顶——「物归牌堆」语义，非原地缩隐；不碰 reback/refly 相位机）；带代际 token（reroll/新回合 deal 抢跑防鬼影）。

## 事实修正（工程专家核查）
- 行号：观战 bust op 回放调用点=**:661**（brief 原 :648 是 dealStamp）。
- **不存在页面级 sha 门禁**：check-syntax 只锁 three.r128.js/dicebear-local.js 的 sha256（:17-20）；行尾纪律=「五文件 LF 工作区 + 外置件 sha 锁」。

## ⚠ 分域裁决（2026-10-08 11:45，并行会话「数字实体化轮」.pw/brief-num3d.md 正在同树实施五页：铭牌/金额/骰值 3D 化）
并行会话 hunk 实测映射：uno refreshSeatFx(:1194-1213)+tick(:2098+)；mono moneyFloat(:1645)/diceReadout(:1654)/flyNotes(:2322+93)；tod applyState(:2822)+:7718+(+97 铭牌系统)+:8006-8010+:8285+:8341；index 同构镜像；bombcat 全文件（B1/B2/B3）。
**本轮范围据此收窄（同文件所有权让位在先会话）：**
- **W1 uno seatFx → 移交并行轮**：其 U1 正在重写同函数（Sprite→plaque）；本 brief 的 W1 定稿参数（常驻化+120/220ms 非对称 ramp+系数制+userData.text 取证口）作为**其落地后的下一轮改造契约**存档，实施基座换 plaque。
- **W5a nope 环 → 移交并行轮**（其 B3=弃牌堆上空倒计时环+秒数铭牌，与本方案同构）；W5b 插回 3D → 备案（bombcat 全文件归并行会话，禁并发动刀）。
- **W4 笼门 → 砍**（玩家价值专家指定砍单候选+并行风险）；**仅保留 :1247 cageTok++ 独立 bug 修复**（真实 TypeError 窗口，与门无关）。
- **本轮实做=三包**：A=W6（tod+index DOM 族，hunk 不相交）→ B=W2（uno showResult :1838-1860，对方未触）→ C=W3（monopoly bust 区 :560/:661/:2178+/:2523/:2712+rebuild :1247，对方未触）。Edit 纪律：动刀前重读目标区（并行会话可能随时落新 hunk），撞车重读再改。
- 门禁相应收窄：ev-tod-domfade / ev-uno-result（原 ev-uno-seatfx 的结算部分）/ ev-mono-fall 三支新探针；W1/W5 相关断言随包移交。
