# 业务逻辑检查官 · 头像特征强相似轮（feat/3d-avatars）终审之二

日期：2026-10-08 ｜ 范围：仅本轮特性改动（SPEC §1.14）；并行 W3 破产倒地（fallTok/fallAndFade/resetPawnPose）与 W6（tod 动效）不在本轮，未审未计。
方法：通读 avatar-features.js（507 行）/monopoly/uno/tod/bombcat 四页 diff/party-net.js，逐条核对委托方 7 项清单；实跑四条探针复证。

## 判定：SHIP

复证门禁（本机实跑）：ev-avatars-mono 13/13 ✅、ev-avatars-uno 12/12 ✅（含眼镜金值 long+glasses）、ev-avatars-tod 10/10 ✅（含 person→emoji→person 双向翻转）、ev-avatars-bc 13/13 ✅（hue 偏差 0°）；check-syntax 13 块 + avatar-features.js sha 锁 43d42e12… + check-syntax-bc 全绿，零 pageerror。

## 清单逐项核对

### 1. 联机协议 ✅
- party-net.js `avatarRecipe(rep)`：纯读（av:P→presetOfAv / dcb:→JSON 解析），不写文档、不改广播结构；唯一出口语义成立（avMetaOf 只管 dcb，av:P 由宿主页补——两半拼图与注释一致）。
- 消费路径一致：mono syncPawnFaces:1646 / uno refreshSeatAvatars:1422 均 `NETMODE && NDOC.players[i].av`→`P.avatarUri`→`P.avatarRecipe`，与房间文档同源同下标（1.13 既定约定，探针 B 断言 doc.players[].av 原样广播）；tod avRecipeTod:7499 本地 `avRecipeTod` 与 party-net 的 AVATAR_PRESETS 逐项比对（24/24 零差异，含 st/sd 字段）——av:P## 钉扎元数据三端一致，无错位。
- 缓存键 `colorIdx|uri` 同 uri 不同色座：各自建条目、各自提取（特征只依赖 uri 像素与 style/seed，与色座零耦合），**无串色**；fallbackHair(colorIdx) 只在 feats=null/fb 分支参与。代价仅同 uri 重复提取一次（P3-2，非错误）。

### 2. 热座/无 av 路径 ✅
- fb 条目 `{feats:null, loaded:true, fb:true}`：无 uri 即无 Image、无提取任务（确认不触发）；applyFeats 对 fb 计算 sig='fb' 与 buildPawns 初值 'fb' 相等→早退，零重建。uno 热座 seats[0].fb 断言过，且探针 C（forceHand→updateHUD）证明 sig 幂等零重建。mono 热座 fb:0/fb:1 断言过。
- 提取失败三分支（onerror / AV3 缺失保险丝 / feats.person=false 非人脸）均落 `e.fb=true`→默认头，永不把非人判成秃。

### 3. 重入/时序 ✅
- tod：`u.avKey===uri` 守卫在 img.onload 的 await 之后同步判定——JS 单线程下检查与 applyTodFeats 之间无让出点，旧头像 feats 不可能落到新头像。守卫挡住的只是**应用**，误提取最多浪费一次工。
- mono/uno：notify 按 `faceKey===e.key` 匹配；头像变更后 syncPawnFaces 先写新 faceKey 再取新条目，旧条目 notify 落空。弱窗口=「av 已变但心跳未跑」的半拍内旧 notify 命中旧 key——但提取是 uri 纯函数，结果恒等，自愈无害。
- buildPawns/remapPawns 重建：faceKey 归空 + feats0 从缓存带特征（探针 remapPawns 后发色存活 ✅）；在飞 notify 落点=faceKey 匹配或落空，无孤儿写入。paletteCache 逐出后旧条目 notify 仍可应用（faceKey 活着时），特征值与新条目恒等，无正确性影响。

### 4. 状态一致性 ✅
- tod person→emoji→person 状态机完备：applyTodFeats 三态（feats/patch）对 u.featsSig、u.featGrp（摘除+dispose，且 `!==u.head.material`/`!==parts.skin` 的共享材质豁免正确）、u.face/u.hair.visible、u.head.material.color/roughness（0xe8b98c/0.65=buildChar:7476 基线，逐字节还原）七处锚全量回写；sig 域 'patch' 与特征 sig 不可能撞车。探针④双向翻转+翻回后特征一致 ✅。
- monopoly fall×applyFeats：applyFeats 只换 headGrp 孩子+重写 hairMat/headMats 指针，不碰 headGrp 变换；fall 循环每帧现场重读 headMats，换锚即被新头接管同拍淡出。**确认无逻辑破坏**，仅化妆品级（新头材质初始 opacity=1 在同帧即被写 1−k）——与视觉专家结论一致。
- bombcat buildChar 死亡变灰（deadT）读 u 里材质引用——buildChar 三行只改初始色，引用不换，无交互。

### 5. bombcat ✅
- `/bc:(\d+)/` 对 'bc:0:x'（无头像兜底键）→ hue 0，与 makeCatFace('bc:0:x')→h=0 的脸贴片同源一致（壳红脸红，不分家）；缺 av（`p.av||''`）与其它协议（dcb 等理论不发生）→ 回退 id 哈希色，头球/壳/身同 hue 自洽。CAT_HUES 8 档均 <360，THREE setHSL 内部 euclideanModulo 兜底越界值，无崩溃路径。
- charsList 取证口：闭包捕获本 initScene 的 chars Map；retireScene 置 __bcScene=null 下线，重进 game 屏 initScene 重建新 Map+新闭包——再生正确（探针 3 角色材质取证 ✅）。

### 6. 缓存与内存 ✅（两处 P2 备案见下）
- paletteCache 32 LRU（命中刷新 delete+set）、PIN_RASTER_CACHE 96（超限删最老）、tod texCache 按 pid 单条+换 uri dispose（本轮补上，泄漏口已关）；featQ/featTodQ 任务恒被消费出队。**未发现无限增长路径**。
- tod emoji/无 av 不进缓存：提取由 `u.avKey!==uri` 变化沿触发（非每 tick new Image——守卫真实有效），person↔emoji 反复翻转按次重提取（无跨头像缓存），量级=人工点击频率，可接受。

### 7. 断言覆盖面（缺口列举，不要求补）
- 无「提取中途换头像」重入探针（tod u.avKey 守卫 / mono faceKey 匹配两道守卫均无回归钉）。
- av:P## 预设路径三端均无探针（P.avatarRecipe 的 av: 分支零覆盖；tod 只走 dcb）；dataURL 照片、非人脸表（bottts/identicon）路径未盖。
- paletteCache >32 逐出再取、同 uri 异色座隔离/串色、tod texCache dispose 生效、bombcat 局间 retireScene→initScene 后 charsList 再生、非 bc: 协议回退哈希色：均无断言。
- featQ 异常路径（任务抛错不断流）无断言——而该 catch 本身有 P2-1 缺陷，属「无断言的代码恰是坏的」。

## 发现（均不阻塞）

- **P2-1 提取队列 catch 死代码且是坏的**（monopoly:1567 / uno:1332 / tod featTodPush 同构）：`catch (e) { next(); }` 的 `next` 未定义（续延是任务参数，作用域里无此绑定）——已用最小复现实锤 ReferenceError。当前三类任务（async 包装 / new Image 无同步抛点）不会触发，属潜伏；但一旦任务同步抛错，drain 崩溃且 featQOn 卡 true，**该页后续全部提取静默死亡**（全员滞留默认头，无报错无探针可查）。修正指令（一行×3 处）：`catch (e) { setTimeout(drain, 0); }`——替换 `next()`，保证换手续延。另建议把 `notify(); next();` 反序为 `try{notify()}finally{next()}`，防 notify 抛错同样断流。
- **P2-2 PIN_RASTER_CACHE 把 null 永久缓存**（avatar-features.js:456）：瞬时光栅失败/onerror 的 null 入缓存后不再重试，bmpDiffRatio(null)=0 → 钉扎恒判「组件不存在」（该头像眼镜/胡子永久漏检、发判定降级）。概率低（已有注尺寸+双画+decode 三重防护），但与「同输入确定提取」目标相悖；修正：`if (d2) cache.set(...)`，失败留空下次重试。
- P3-1 monopoly.html:1536 paletteCache 注释陈旧（仍写 `{hair:'#hex'}`，实为 feats 结构）。
- P3-2 tod avRecipeTod(p.avatar) 在任务执行时读 live 引用，与闭包 uri 有错位窗口——结果被 u.avKey 守卫丢弃，纯浪费工；mono/uno 的 meta 在 acquire 时定格，无此窗口（tod 若对齐可把 meta 一并入闭包）。

## 结论
协议零改动、fb/保险丝/幂等/双向状态机/缓存边界全部成立，四探针金值全绿；无 P0/P1。P2 两条为不触发的潜伏健壮性缺陷，随下一轮顺手修即可。
