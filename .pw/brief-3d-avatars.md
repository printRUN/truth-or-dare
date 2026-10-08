# 全游戏 3D 头像轮（brief-3d-avatars，2026-10-08，分支 feat/3d-avatars）

用户点名：「将所有游戏 3D 人物的头像转为 3D 来显示，表单选择的头像做好 3D 兼容」。

## 0. 现状取证（Explore + 真机 IAB 截图）

| 游戏 | 3D 人物 | 头像现状 | 证据 |
|---|---|---|---|
| tod.html | 全身小人 | ✅ 球面脸贴片 r0.215 + squircle CanvasTexture + alphaTest 0.5 | buildChar :7431-7462 / avatarTexture :7398-7430 / circleMask :7391-7397 |
| bombcat.html | 猫小人 | ✅ 同款移植（bc: 色相协议） | buildChar :2703-2728 / avatarTexture :2729-2751 |
| monopoly.html | 锥身+球头棋子 | ❌ 纯玩家色，无脸；名牌=色点+名字 Sprite；头像只在 HUD DOM | buildPawns :1410-1446 / netAvatarHtml :751 / NDOC.players[i].av |
| uno.html | 无人物 | ❌ 座位=纯文字实体铭牌+行动环+牌堆；头像只在 HUD DOM | seatPlaque :1207 / refreshSeatFx :1260 / netAvatarHtml :558 |

头像协议（party-net.js avatarUri :1132）：`dcb:{s,d,b}` 本地 SVG dataURL / `data:image/...;base64` 严格白名单 / `av:P##` 预设本地生成 / 漏带 dicebear-local 才走 CDN。`p.av` 已随房间文档广播（enter :1530 / addBotToDoc :1865），monopoly/uno 的 G.players[i] 与 NDOC.players[i] 按座位下标对齐（netAvatarHtml 同下标读）。**数据管道已就绪，只差 3D 渲染接线。**

热座模式（不走表单）玩家无 av——需要 fallback 让全桌统一「人人有脸」。

## 1. W-A monopoly：棋子头像脸贴片 + 名牌头像

**脸贴片**（buildPawns 内，head 之后）：
- 球头 r0.095 保持；新增 `headGrp`（子 Group）收纳 head+face，**脸贴片 SphereGeometry(0.105, 20, 14, π/2−0.7, 1.4, π/2−0.7, 1.4)**（同心贴片 r=头×1.1，tod r0.215/r0.2 同比例语言），MeshBasicMaterial({ color: 玩家色, transparent: true, alphaTest: 0.5 })。
- **billboard yaw**：monopoly 相机 az 环绕（approachTurn 对准行动者+idle 环绕 +4°/s），固定朝南会背对镜头——tick (:3172) 加 `syncPawnFacesFrame()`：`headGrp.rotation.y = atan2(cam.x−pawn.x, cam.z−pawn.z)`（yaw-only，禁 lookAt 全轴=会低头翘头）。写子组不写 grp.rotation，与并行会话 W3 倒地（写 grp.rotation.z/y）天然无冲突。TURBO 门控（不渲染就不算）。
- 破产倒地（W3 在飞）时脸随 grp 倒——无额外处理。

**纹理管线 `pawnFaceTex(i)`**：
- av 解析：`NETMODE && NDOC?.players[i]?.av` → `P.avatarUri(av)`；热座/无 av → 程序化 fallback 脸（**确定性绘制禁 Math.random**：玩家色增亮圆底+白描边+双眼+微笑弧，全桌统一有脸）。
- Image 加载：`img.crossOrigin='anonymous'`（CDN 回退路径防画布污染；本地 dataURL 无影响），256×256 canvas：**白圆底 + contain 整图 + 圆形裁切 + 2px 玩家色蚀刻描边**（tod squircle 语言在球面贴片上简化为圆）。
- **异步兜底**：加载完成前先上「玩家色圆底+名字首字」占位纹理（同步可显示），onload 重画同一 canvas + `tex.needsUpdate=true`；onerror 保持占位（防线不炸）。
- **挂 map 后 color 必须回白**（map×color 相乘染黑教训）：上真图那帧 `face.material.color.set(0xffffff)`；占位期（无 map 用纯绘制）color 同白（占位画在 canvas 里不是靠 color 染）。
- 缓存：全局 `Map<avKey,{tex,canvas}>` 封顶 16 清最旧；纹理跨 buildPawns 重建复用（换局不闪）。

**名牌 Sprite 升级**：色点 (22,h/2,r9) → 有 av 时画**圆形头像 r11 + 白描边**（同一 canvas 语法），无 av 保持色点；名字起始 x 不动。

**同步 `syncPawnFaces()`**：挂 updateHUD (:1497) 尾——diff `i:avKey` 签名，变了才换 face map/重绘名牌 map（dispose 旧 map）；心跳幂等常态零成本。buildPawns 重建后签名空 → 首帧自动补挂。

**探针口**：`__mono.faces()` → `[{av, hasMap, texW, texH, hasFallback, yaw}]`；`syncPawnFacesFrame` 在 tick 中 TURBO 早退。

## 2. W-B uno：座位 3D 头像半身像

**新独立系统 `seatAvatars`（刻意绕开并行会话 W1 正在重写的 refreshSeatFx）**：
- 每个对手座位一个 bust Group：底座 Cylinder(0.16,0.20,0.06) + 身锥 Cylinder(0.05,0.15,0.30) + 头球 r0.14 + **脸贴片 SphereGeometry(0.155, 20, 14, π/2−0.7, 1.4, π/2−0.7, 1.4)**（tod 同参数比例）。
- 位置 `seatPos(seat)×1.22`（R2.6→3.17，桌 r6.4 内）：「玩家坐在桌缘自己的座位后」的空间叙事；行动环(×1.0 r0.3-0.42)/铭牌(×1.0 y0.78)/牌堆(×0.55)全不遮。**脸朝南固定 yaw=0**（uno 相机固定南侧，无 billboard 需求）。
- **south 座位不建**（与铭牌同语义：自己的名字在 HUD/手牌在南位；自我中心渲染，你的半身像只在别人设备上）。
- 材质：底座/身=玩家色（Standard），头=脸贴片同 monopoly 管线（fallback=玩家色程序化脸）。
- 柔影：CircleGeometry 半径≈0.33×宽 y=−0.042 renderOrder 1（seatFx 常驻牌同语言）。
- sig diff：`players.map((p,i)=>`${i}:${p.av||''}:${south}`).join('|')`——变化全量重建（入局/换座低频）；纹理异步加载同 W-A 管线（独立实现同语言，两文件不共享 JS）。
- 调用点：updateHUD (:1329) 尾 `refreshSeatFx()` 之后加 `refreshSeatAvatars()`；BOOT/SETUP 早退对齐 refreshSeatFx；dispose 纪律 traverse 全释放 + 柔影。

**探针口**：`__uno.avatars()` → `[{seat, hasMap, texW, headYawToSouth}]` + `seatsWithBust`。

## 3. W-C 表单头像 3D 兼容（核查矩阵）

| 协议 | 来源 | 3D 路径 | 状态 |
|---|---|---|---|
| `dcb:{s,d,b}` | party-net 定制器/机器人 | avatarUri→本地 SVG dataURL→Image | 本轮接线 |
| `data:image/...;base64` | 上传照片（白名单已挡注入） | 原样→Image contain | 本轮接线 |
| `av:P##` | 遗留预设 | presetUri 本地 SVG | 本轮接线 |
| CDN https（漏带 dicebear-local） | 回退 | crossOrigin='anonymous' 防污染 | 防御性 |
| 空/无效/解码失败 | 热座/坏包 | 玩家色程序化 fallback 脸 | 本轮新增 |
| emoji（tod 表单）| tod | 已 3D（fillText 画字） | 不动 |
| `bc:hue:seed`（bombcat）| 猫脸 | 已 3D | 不动 |

- 时序红线：快照先到、Image 后到 → 占位脸先上，onload 原位换图（同一 CanvasTexture needsUpdate，不换材质实例=无闪烁）。
- tod/bombcat 表单已 3D 兼容，零改动。

## 4. 红线（上一轮教训逐条对照）

1. mkTex 全局禁 mip（格面/名牌/骰面既定采样契约）——脸纹理走 mkTex（sRGB+Linear+no-mip）。
2. 挂 map 后 color 回白；alphaTest 材质不做 opacity 淡出（要淡出必同步降 alphaTest——本轮无淡出需求）。
3. 零 G 写入、零 rng 消耗（fallback 脸确定性绘制）——纯视觉层。
4. 与并行会话（W1 uno refreshSeatFx 常驻化 / W3 mono 倒地 / W2 uno 结算推镜）**只加不改其函数体**：monopoly 加段在 buildPawns 头球后+tick 尾+updateHUD 尾；uno 全新函数+updateHUD 尾一行。提交走 hunk 分拣术。
5. Box/贴片世界尺寸与画布分辨率拆参（num3d P0）：贴片世界半径固定，画布 256 固定，无耦合。
6. 探针端口新挑 9061/9063（核对未占用）；断言禁纯计数——几何断言（子 mesh 存在/map 非 null/世界尺寸）+ 截图取证双轨。
7. LF 行尾纪律（Edit 保持 LF，勿触发 check-syntax sha/EOL 翻车）。

## 5. 探针与门禁计划

- 新 `.pw/ev-avatars-mono.cjs`（9061）：NETMODE 双端 localnet（probe-mono-net 模式）→ faces() 全员 hasMap、名牌头像区像素非纯色、billboard yaw 收敛、全景+走位跟随近景截图；热座档 fallback 脸存在。
- 新 `.pw/ev-avatars-uno.cjs`（9063）：热座档（对手 fallback 脸 bust+south 无 bust）+ NETMODE 双端档（对手 av bust hasMap）+ 截图。
- 回归门禁全绿：probe-monopoly 28 / probe-mono-maps 22 / probe-mono-replay 8 / probe-mono-net 17 / ev-mono-verify / ev-num3d-mono / probe-uno 21 / probe-uno-net 11 / ev-num3d-uno / ev-uno-face / check-syntax(+bc)。环境噪声：长跑假红先 taskkill chrome 单跑复验。

## 6. 验收（真机 IAB 走查）

实施后 IAB 实机：monopoly NETMODE 双端对局看棋子脸/名牌头像/idle 环绕时脸跟随；uno 联机房看对手半身像；换 dcb 定制头像/上传照片双协议各验一端。

## 7. 双挑刺专家评审定稿（SHIP WITH FIXES ×2，12 条全吸收）

视觉 [P0]：uno 桌面真实顶面 y=**+0.20**（Cylinder 中心−0.05+半高0.25；:1288 行动环 y0.212 即既证），bust 基座钉 0.20、径向 **×1.28**（R3.33<桌6.4）；**弃埋影**（seatFx 柔影 −0.042 按错误「桌面−0.05」注释落的位=埋在桌里），bust 三 mesh 全 castShadow=true（dirLight ±5.5 覆盖）。
视觉 [P1]：贴片半径 ×1.075（tod 真实终值，非 1.1——月牙边教训）：mono **0.102**、uno **0.150**；蒙版 destination-in `arc(128,128,123)` 5px 蚀刻内缩。
视觉 [P1]：**脸纹理放开 mip**（照片类连续色调，全景 4-6px 必闪烁）：mono 走现成 mkTexMip :1143；uno 新增同款变体。格面/名牌/骰面 mkTex 禁 mip 契约不动。
视觉 [P2]：fallback 脸=外环原玩家色 r118-123 + 内盘增亮(+22%) + 深色五官 #1b1430（非白）；白描边只给真实头像图。
视觉 [P2]：行动环 ×1.0 与 bust ×1.28 的「环不圈人」错位——登记为 W1 落地后对齐跟进，本轮不动 refreshSeatFx。

工程 [P0]：monopoly fallAndFade 淡出拍**必须同步写 faceMat.opacity**（锚 grp.userData.faceMat；down 终帧/resetPawnPose 复位 transparent=false opacity=1）；变灰 lerp 不动脸。工程 [P0]：纹理缓存独占所有权——名牌头像=独立 mkTex 从缓存 canvas drawImage 重绘（禁共享纹理实例过 dispose 路径）；uno bust traverse 禁卸 .map；探针加 remap 存活断言。
工程 [P1]：syncPawnFaces diff 锚= per-pawn `grp.userData.faceKey`（buildPawns 每局全量重跑，模块级 sig 第二局裸头）；缓存键= `colorIdx|uri`，fallback 键 `fb:colorIdx`；uno sig 的 av 源= **NDOC.players[i].av**（G.players 快照无 av 字段，恒空=联机静默失效）。
工程 [P1]：缓存条目加 `loaded`/`fb` 标志并透出访问器——占位纹理天生有 map，hasMap 是空断言；NETMODE 档断言 `loaded && !fb`，热座档 `fb===true`。
工程 [P2]：yaw 断言= rigSnap+pawnWorld 现算期望值 diff<0.02rad 两帧（idle 环绕下无「收敛」态）；**门禁禁像素断言**（软渲假红红线），像素采样降为截图附件。
工程 [P2]：遮挡实证=ev-avatars-uno 截 4 人局全景+加冕位两帧，预案授权 ×1.28→1.32；门禁补 ev-mono-fall.cjs + ev-uno-result.cjs（并行会话新探针，覆盖我触碰的 buildPawns/updateHUD）；插入位=buildPawns 头球段在 grp.userData.mat(:1423) 之后不重排 W3 行、tick yaw 在 syncCashStacksFrame(:3195) 后渲染行前、uno 调用在 refreshDeckStack(:1348) 后；9061/9063 已核实空闲；crossOrigin 必须设在 src 赋值前。

## 8. 二阶重构：真 3D 几何处（同日，用户看后点名「不要贴图，需要更加逼真的显示」）

一阶的脸贴片（CanvasTexture 圆片糊球）被用户否了——**贴片退役，头=全几何**：皮肤球 + 发壳（顶盖 0.27π + 收窄后脑壳）+ 眉 + 眼球（球白+瞳孔+高光点）+ 鼻锥 + 微笑弧 + 耳，全部 MeshStandardMaterial 吃场景光；monopoly 加肩位嵌锥顶（y0.375 去棒棒糖间隙），uno 加肩+颈（真半身像轮廓，头 r0.16）。头像图的新角色=**发色来源**（hairFromImage：四角均值=背景色排除 + 上半区优先/全图兜底采样 + 较暗 45% 均值 + HSL 钳位 L∈[0.26,0.38]——描边画风最暗 45% 会聚到纯黑描边，明度钳中段保「发色」不保「黑头盔」；提取失败/坏图 → fallbackHair=玩家色深化）+ 名牌圆头像仍 carry 真实头像。**全部不透明几何=alphaTest/贴图裁切问题整类消失**，fallAndFade 淡出改 headMats[] 全套同步。三次实测迭代：46° 俯角下五官必须放球面 ~30° 仰角带（俯视才正对镜头）、发际线在眉上、发色明度钳中段。门禁：ev-avatars-mono 13 / ev-avatars-uno 11 + 回归 ev-mono-fall 29 / probe-monopoly 28 / probe-uno 21 / ev-uno-seats 9 / mono-net 17 / uno-net 11 全绿。
