# av3 头像特征强相似轮 · 工程红线挑刺裁决（expert-eng，2026-10-08，feat/3d-avatars）

评审基线：`.pw/brief-av3-design.md` + `.pw/av3-feat.js` + SPEC §2 红线 + `.pw/check-syntax.cjs`/`check-syntax-bc.cjs` + 四页现状（worktree = HEAD 3e82834 + 并行 W3 未提交 hunks）。所有行号为当前 worktree 行号。

## 总判定：**修订后通过**（7 项中 5 项「修订后通过」、1 项局部「否决」= bombcat 特征几何头、1 项「通过」= NaN 防御骨架）

---

## 裁决 1 代码组织：共享 avatar-features.js —— 判定：**修订后通过（共享文件，但收窄为 3 页）**

**评审**：「两文件不共享 JS、独立实现同语言」惯例的适用域是**页面游戏逻辑**（monopoly/uno 的棋局代码）；共享基础设施早有更强的先例在先——three.r128.js（5 页）、dicebear-local.js（4 页）、party-net.js（mono/uno）。提取器是纯函数 + 钉扎数据表（PIN_*），零页面状态、零 DOM 依赖，恰属 dicebear 先例类。且 hairFromImage 现在就已经是 mono 1543 / uno 双份逐字节拷贝——本轮再内联 200 行 ×4，每次调阈值/补钉扎键要人肉同步 4 处，漂移概率 > 提交成本，设计方主张成立。

**check-syntax.cjs 要动几处**：3 处、合 1 个 hunk——
1. `SHA_EXPECT` 表（:17-20）+1 行 `'avatar-features.js': '<sha 前 16 位>'`；
2. 新增 `const NEED_FEAT = ['index 不进', 'monopoly.html','uno.html','tod.html']` +1 行；
3. 仿 §3 dicebear 段（:54-67）新增一节：逐页断言 `<script src="avatar-features.js"></script>` 在位 + 页面不得残留内联签名串（探 `function extractFeatures(`）+ `new Function` 语法 + sha256 锁 + `\r` 硬检（照抄 dicebear 的 CRLF 红线），约 12-15 行。
bombcat 的 `check-syntax-bc.cjs` **零改动**——若 bombcat 需要引用断言，放进 check-syntax.cjs 的 NEED_FEAT（three.r128.js 的 NEED_THREE 已含 bombcat，先例成立），不另开第二门禁。

**四页 <script src> 插入点**（全部在头部 script 区，**与并行 W3 零冲突**——W3 当前 dirty hunks 在 CSS :254、applyGameSnapshot :595、JS :1283 以后）：
- monopoly.html：`:408` dicebear 行后插（three :406 / party-net :418 同区）；
- uno.html：`:354` dicebear 行后插；
- tod.html：`:1877` dicebear 行后插（主内联 :1879 之前，DiceBearLocal 先于 extractFeatures 首次调用加载）；
- bombcat.html：**不插**（见裁决 4：bc: 猫脸协议被排除在提取器外，无消费方就不加 script——设计稿「四页」改「三页」）。

**最终判定：共享文件**（3 页 src + sha 锁）；内联四份**否决**。附带保险丝见 P0-4。

---

## 裁决 2 提取器运行成本 —— 判定：**修订后通过**

**评审（代码实测口径，修正设计稿的性能声明）**：设计稿 §1 称「钉扎最多 3 次 SVG 再生成」——**对 avataaars 不成立**。`pinGlassesExact`（av3-feat.js :22-27）对具名变体走 `names.some(n => pinDiff(...))`，而 `pinDiff`（:14-20）**每次调用都重新生成基图 a + 钉图 b 两份**：avataaars 无眼镜 seed 最坏扫满 8 个具名变体 = 16 次 diceAvatar，加 facial 2 + hair 2 = **最坏 20 次生成 ≈ 40ms/头像**（设计稿口径 <15ms 只对非具名风格成立）。
- 16 人进房是否卡帧：tod 是 16 人页（mono/uno maxPlayers=4，:503/:455），tod 头像全 dataURL（resolveAvatar :6072 无 CDN 回退），16 个 onload 若落在同一批任务里，最坏 16×40ms ≈ 640ms **同步主线程阻塞**——会卡，必须分帧。
- **修订**：① `pinGlassesExact` 基图提升——base 只生成一次，循环内只生成 b（最坏 8 变体 = 1+8+2+2 = 13 次 ≈ 26ms，`some` 短路对真戴者更快）；② 提取任务队列化：每 idle 槽处理 1 个头像，`requestIdleCallback(cb,{timeout:1200})` + **`setTimeout(cb,0)` 退路**（tod 目标老 WebView 无 rIC），结果照常进缓存，头渐进出现（与现贴片 onload 渐进同语言，非回归）；③ 队列在 REDUCED/bodyLo 下照跑（提取不是动画，无静态退路义务）。
- 缓存上限：16 恰好等于满员数，任一换头像即挤出最老存活键 → buildPawns/remap 重建时无谓重提取。**修订：16→32，命中时 delete+set 刷新（2 行 LRU）**。条目本身 ~百字节，内存无虞。
- bombcat 钉扎降级：pinDiff 有 try/catch → DiceBearLocal 缺失自动返回 null → 像素路径，机制完备；**但假秃归零靠的正是钉扎兜底**，无钉扎 = 假秃风险回潮。因裁决 4 把 bc: 排除出提取器，此问题对本轮**消解**（既不加 script 标签、也不走纯像素路径）；未来 bombcat 若引入 dcb: 头像，届时必须同步加 dicebear-local.js 标签 + NEED_FEAT 扩 bombcat，两者同 commit。

---

## 裁决 3 monopoly headGrp 子树重建 × 并行 W3 —— 判定：**修订后通过**

**评审**：运气极好的契约——`fallAndFade`（:2900）淡出段和 `resetPawnPose`（:2891）都是**每帧/每次现场重读 `grp.userData.headMats`**（:2943/:2951/:2896），不是闭包捕获旧数组。所以子树重建只要**整组原子换锚**，W3 的代码一行不用动：
1. rebuild 单一入口（挂在 syncPawnFaces 的 faceKey diff 分支 :1637-1640 替换 applyHeadPalette 调用为 applyFeats），同步段内顺序固定：`headGrp.remove(旧 head.grp)` → 旧子树 `traverse(geometry.dispose + material.dispose)`（ monopoly 头内 6 材质全私有，逐个 dispose；无纹理，不涉独占所有权）→ `buildAvatarHead(0.1, colorIdx, feats)` 新 grp 入 headGrp → **同段内重写 `userData.hairMat / userData.headMats / userData.headGrp`（headGrp 身份保持不变，只换孩子）** → 按 e.hair/e.skin 重上色。任一步漏锚的症状：billboard 失灵（syncPawnFacesFrame :1653 写旧组）、倒地淡出淡空气（fallAndFade 淡旧材质数组）、applyHeadPalette 写死引用。
2. **fallAndFade/resetPawnPose 零改动是本轮硬纪律**——它们是 W3 的未提交领地（worktree +82 行 hunk @@2880）。淡出中途 rebuild 的错位（新头继承半透明中间值）是可接受化妆品级瑕疵，不值得为它碰 W3 hunk。
3. `buildAvatarHead` 第三参 feats **带默认值 undefined**——`buildPawns`（:1656）调用点**不改**，默认头=纯 fallback 彩色头，feats 由 syncPawnFaces 异步补齐。这样 buildPawns 整个函数（W3 dirty hunk @@1667）也零接触。
4. rebuild 幂等门：`userData.featsSig = [style,glasses,beard,skin,hair,hairGuess,mouth].join('|')`，sig 同值直接 return（notify 会多次到达）。
5. **冲突面预警**：av3 唯一会碰 W3 邻区的是 syncPawnFaces 尾部（:1630-1647）——W3 的 @@1642,13+1649,14 hunk 起点就在 syncPawnFacesFrame（:1648），两者只隔 5 行。提交时按 3e82834/758f97c 的 HEAD 重建分离索引术分拣；此边界大概率出 MIXED hunk，降级规则照旧（-行转上下文、+行丢弃后手补）。

---

## 裁决 4 tod/bombcat 头重建 —— 判定：tod **修订后通过**；bombcat 特征几何头 **否决（改贴片保留）**

**tod**：
- **帧循环消费面**（:8399-8480，动 u.torso/chest/head/face/hair/lean 共 11 处写）：lean/voice/go/cheer/waveT 都作用于 lean 组与 torso/chest，与头内子树无关；真正踩头的是 `u.head.rotation.x` 点头（:8411）、`u.head/face/hair.scale.set` 三件套同缩（:8410，「不同缩脸陷进发壳」教训）、`u.hair.position.y = 0.825±0.01` 呼吸（:8402）。
- **修订（零帧循环改动的设计）**：**保持 `u.head` 的对象身份不变**——特征件不换掉头球，而是 `head.add(featureGrp)` 挂成现有头球 Mesh 的孩子：skull 复用 u.head 本体（材质 color 改 feats.skin；「syncPlayers 赋 map 同帧 color 归白」的乘色教训在头球上同样适用，赋肤色一次性写、勿每帧写）；发壳/眉/眼镜/胡子/嘴按 buildAvatarHead 的 r=0.2 局部坐标直接入子级。如此：点头、voice 三件套缩放**自动**连带全部特征件（三件套同缩红线免费满足），lean 前倾/揭晓近景只动父组与相机，无新假设。u.face 贴片 `visible=false`（引用留活，:7538 的 map 赋值与 :8410 的 scale 写照旧无害）、旧发半球 u.hair `visible=false`（:8402 位置写继续打在隐藏网格上=无害）。
- **emoji 双分支**：分支条件沿用 avatarTexture 的 `/^(data:|blob:|https?:)/i`（:7433）取反——emoji（resolveAvatar 原样返回裸串）走现贴片路径零改动；dcb:/av:/照片走特征头。**照片必须走特征头**（像素路径无钉扎但提取器已验证照片样张）。切换双向（person→emoji→person）都要支持：emoji→person 时记得贴片 map 停写不必要但无害，person→emoji 时恢复 visible 并 dispose 特征子树（几何+材质；**绝不 dispose u.face.material.map——纹理属 texCache 独占**，uno disposeBust 的教训）。
- **触发点**：syncPlayers :7538 uri 变更分支内，`u.featsKey !== style+'|'+seed+'|'+uri` 时入提取队列；提取在 avatarTexture onload 同一张 Image 上另画 128² 取像素（+1 次 drawImage ≈0.1ms），onload 里做（设计 §3 同点触发 ✓）。
- **顺手修一个现有雷**：tod texCache（:7409）按 pid 覆写 `{uri,tex}`，旧 THREE.Texture **从不 dispose**（bombcat 有 `oldTex.dispose()`，:2781，tod 没有）——换头像一次漏一张 256² 显存，本轮正碰这条路，补一行。

**bombcat —— 否决特征几何头**：设计稿 §0/§3 把 bombcat 当作「tod 同款 dcb 人脸」，**事实错误**：bombcat 头像是 `bc:<hue>:<seed>` 程序化**猫脸**（resolveAv :539 → makeCatFace :2500 区，128² canvas dataURL；表单只有猫选择器 :2191-2215，**没有 emoji 也没有 dcb**，设计稿 §0「emoji 仅 tod/bombcat 表单」对 bombcat 不成立）。把人脸提取器跑在猫脸上：style=null → 钉扎全 null 纯像素路径，而 av3-verify 的 146 格**零猫脸样本**；色相卫兵只拒绿青蓝紫，橙/褐系猫脸会被判 person=true（skin=猫脸色、hair=耳色），深色瞳孔在眼带断言边缘、鼻线/嘴线在胡子带边缘——即「猫被扣人发壳+疑似眼镜胡子」的特征反转，正是用户上轮 P0 投诉的形态。**修订**：bombcat 保留贴片（设计稿自己为 emoji 给出的论证——「猫脸是设计过的平面图形，贴图即其 3D 最佳表达」——对猫完全同理，且 similarity=100%）；本轮 bombcat 交付物 = 零代码改动 + ev-avatars-bc 回归探针。若用户点名要「3D 猫头」，另立 mini-brief（bc:hue 确定性毛色 + 耳锥几何，不走提取器），不搭本轮车。

---

## 裁决 5 NaN / 防御 —— 判定：**通过（骨架完备）+ 3 条参数级补强**

- 提取器本体 NaN 干净：所有除法有 n 守卫（:63/:134/:143），pinDiff 全 try/catch，`!data`、非人脸、找不到肤色均有归路（:71/:72/:115）。旧 hairFromImage 的「take 空→NaN→#000000」洞随替换消失——**mono/uno 两份 hairFromImage 必须删尸**（消费面仅 acquirePalette onload :1580/:1345，删除安全），防后人接回。
- ① **画布污染**：getImageData 的 SecurityError 防御在**调用侧**（extractFeatures 只收 data 不碰 canvas）——monopoly/uno 的 CDN 回退路径 crossOrigin='anonymous' 已在位（:1576-1581/:1341-1346），tod 全 dataURL 无污染面。修订：提取统一走一个 raster helper（128² drawImage + getImageData 全 try/catch → null → fallbackHair/默认头），不许散写。
- ② **SVG 瞬态空光栅**（设计稿 §0.5 自己踩到的雷）：helper 内做退化检测——`opaque/N < 0.02` 即视作空光栅，**rAF 一拍后重试恰一次**，仍空 → 返回 null feats → person=false → 3D 层走默认头（**永不渲染秃头**，:181-187 的 pinSaysHair 分支语义保持）。严禁把「空光栅」判成 bald。
- ③ **16 位量化+Map 与 >1MB 照片**：128²=16384 像素单趟 ≈3-5ms、bins ≤4096、dataURL 大头成本是已由贴图管线付过的 decode——无性能问题；cache key 是字符串引用非拷贝，无内存放大。EXIF 方向：提取与贴图读**同一张 Image**、同一 drawImage 语义 → 方向天然一致（现代内核 drawImage 默认按 EXIF 摆正），特征「顶带=头顶」前提成立，**无需新增代码**，注释注明即可。

---

## 裁决 6 探针 / 门禁 —— 判定：**修订后通过**

- **旧断言必须借本轮修**：ev-avatars-mono :54/:79/:89/:95 与 ev-avatars-uno :47/:53 的 `/^#[0-9a-f]{6}$/` 就是设计稿 §0.5 点名的假绿洞（#000000 恒过）。修订：探针头像（adventurer/avaprobeA、pixel-art/avaprobeB）**金值断言**——预期 hex 硬编码进探针（用 av3-verify.html 现管线生成一次后冻结，注释写明重生成方法），外加 `hair !== '#000000'` 与 `hair !== fallbackHair(colorIdx)` 两条廉价负断言。
- **ev-avatars-tod 断言面（新）**：① person 头像（已知 seed dcb）→ u.face.visible=false + u.head 子树含特征 mesh（按钉扎真值断言 torus 眼镜/发壳存在/无发壳=bald）+ 头球材质 color≈feats.skin；② emoji 同局另一人 → 贴片 visible + map 非空 + **无特征子树**；③ 换头像 person→emoji→person 双向翻转零 pageerror；④ bodyLo 中途翻转 → retire3D → rebuild 路径对已删 chars 的守卫（chars.get 空早退）。断言经 `window.__three` 追加访问器（chars 声明后追加，TDZ 铁律）。
- **ev-avatars-bc（新）**：猫贴片 map 非空 + 头未被换 + 零 pageerror（防回归闸，防未来误接提取器）。
- **负样本**：ev-avatars-mono 加一个 fun-emoji 风格 case → person=false → 默认头（非秃非猫）。
- **门禁先跑顺序**：每步改动后 `node .pw/check-syntax.cjs && node .pw/check-syntax-bc.cjs`；avatar-features.js 落地同 commit 内算 sha（LF 归一口径）并钉进 SHA_EXPECT——**先加文件后跑门禁会红一次是预期**，别在红态下继续叠改动。uno 的 parts 计数断言（:49）在新增眼镜/胡子后仍按现表过，但 parts 清单要**追加** glasses/beard/hairStyle 键并同步探针。

---

## 裁决 7 其他挑刺（实施顺序 / 提交切分 / 回滚）

1. **r128 API 红线（实锤）**：`grep CapsuleGeometry three.r128.js` = **0**——设计 §2「long=两侧垂发锁（CapsuleGeometry）」照抄必 ReferenceError。改 CylinderGeometry + 半球端帽或纵向缩放球。
2. **party-net 需加一个导出**：`presetOfAv`/AVATAR_PRESETS 是 create() 闭包私有、P 导出面只有 `presets: []`（party-net.js :1869-1883，注释明说是废键位）——mono/uno 拿不到 `av:P##` 的 (style,seed)，钉扎对预设失灵。修订：P 增 `avatarRecipe(rep)`（dcb: JSON.parse s/d、av: presetOfAv → {style,seed}，其余 null），**一个导出**，禁页面各自复制解析（那是本轮要消灭的漂移）。party-net 过 probe-mono-net/probe-uno-net/check-syntax 三门，改动后联跑。
3. **index.html tod 副本**：buildChar/avatarTexture/syncPlayers 在 index 有整份拷贝（:7515/:7534/:7567/:7599）。设计稿「四页」没算它——按既有 punParts 漂移先例**明确降级不追平**，但要在 brief 与 commit message 写明「index 深链回退副本保留旧贴片脸」，防验收时当 bug 报。
4. **open-peeps 假秃验证项**：open-peeps **不在 PIN_HAIR**（av3-feat.js :8）→ 它的秃头判定纯靠像素。核验 av3-verify 里 open-peeps 是否有秃头样张；没有就补一张（该风格发型是深色块，像素路径大概率对，但要留证）。
5. **实施顺序**（风险升序，每步独立可回滚）：
   - C1：avatar-features.js + check-syntax.cjs 锁 + 三页 script 标签 + pinGlassesExact 基图提升（零行为变更，全门禁绿）；
   - C2：uno 接入（全量重建先例、notify 通路现成、唯一特例=neck 材质再链）+ ev-avatars-uno 升级；
   - C3：monopoly 接入（applyFeats 单出口 + 三锚原子换 + W3 邻区 hunk 分拣）+ ev-avatars-mono 升级；
   - C4：tod 接入（u.head 子级挂载 + 双分支 + texCache 旧纹理 dispose）+ ev-avatars-tod 新建；
   - C5：bombcat（零代码）+ ev-avatars-bc 新建 + 全量回归（fall 29/monopoly 28/uno 21/seats 9/mono-net 17/uno-net 11/num3d×4/check-syntax 双门）。
6. **回滚方案**：C1 独立回滚（删 3 个标签 + SHA_EXPECT 行 + 门禁节）；C2-C4 各页独立 revert；**保险丝**：所有接入点以 `typeof window.extractFeatures === 'function'` 特性检测开头，共享文件加载失败（file:// 路径错/被防火墙拦）自动退回 fallbackHair + 默认几何头——共享文件方案必须带这条保险丝，否则一次 404 = 四处 TypeError。
7. **提交纪律**：worktree 现有 W3 未提交 hunks（monopoly +123/uno +51/tod +149/index +176）——延续 stage-avatars 的 HEAD 重建分离索引术；monopoly 的 syncPawnFaces 尾部（:1642-1647）与 W3 @@1649 hunk 是本轮预定 MIXED 点，提前按「-行转上下文、+行丢弃后手补」处理；全程 LF 书写（autocrlf 警告已在 git 输出里，新文件落盘前 `file` 抽查）。

---

## 修订指令清单（按优先级，参数级）

**P0（不修不批）**
1. bombcat bc: 协议排除出提取器，保留贴片；设计 §3 bombcat 段改写；NEED_FEAT=3 页；「四页」表述全案更正（裁决 4）。
2. av3-feat.js `pinGlassesExact` 基图提升：base 一次生成，具名循环只生成钉图（最坏 20→13 次 diceAvatar ≈26ms）（裁决 2）。
3. 长发垂锁几何改 Cylinder+端帽，删 CapsuleGeometry 表述（r128 无此 API，grep=0）（裁决 7-1）。
4. 三页接入点全部加 `typeof window.extractFeatures==='function'` 保险丝，失败退 fallbackHair/默认头（裁决 7-6）。
5. 重建单出口 applyFeats/rebuildHead 内**同一同步段**完成：旧子树 dispose（几何+材质，纹理除外）→ 新子树挂载 → `userData.{headGrp,hairMat,headMats}` 三锚重写 → featsSig 幂等门；uno 额外 `neck.material = 新 head.skin` 再链（共享实例，漏链=脖脸异色）（裁决 3/4）。

**P1（修了才 SHIP）**
6. 提取任务队列：rIC({timeout:1200}) + setTimeout(0) 退路，每槽 1 头像（裁决 2）。
7. paletteCache/特征缓存 16→32 + 命中刷新 LRU 两行（裁决 2）。
8. party-net P 增 `avatarRecipe(rep)` 导出，mono/uno/tod 统一经它取 (style,seed)；联跑 mono-net/uno-net 探针（裁决 7-2）。
9. ev-avatars-mono/uno 发色断言升级金值 + `!=='#000000'` + `!==fallbackHair`；uno parts 清单追加 glasses/beard/hairStyle（裁决 6）。
10. ev-avatars-tod 四断言 + ev-avatars-bc 回归闸 + fun-emoji 负样本（裁决 6）。
11. monopoly rebuild 走 syncPawnFaces diff 分支（:1637-1640），buildPawns/syncPawnFacesFrame/fallAndFade/resetPawnPose **零改动**；提交时该边界按 MIXED 预案分拣（裁决 3）。
12. raster helper 统一 try/catch + 空光栅检测（opaque/N<0.02）+ 单次重试 + 空则 null（永不判 bald）（裁决 5-②）。

**P2（顺手/记录在案）**
13. tod texCache 覆写时旧 tex `.dispose()`（对齐 bombcat :2781）（裁决 4）。
14. mono/uno hairFromImage 删尸；u.face/u.hair 隐藏而非移除（帧循环引用留活）（裁决 5/4）。
15. index tod 副本降级声明写入 brief + commit message（裁决 7-3）；open-peeps 秃头样张补验（裁决 7-4）。
16. 设计稿 §1 性能口径更正为「非具名风格 <15ms，avataaars 最坏 ≈26ms（修订后）/40ms（现状）」；EXIF 一致性注释写入 raster helper（裁决 5-③）。
