# 工程红线挑刺 · 头像发型改造方案 v1（expert-ava4-eng，2026-10-11）

**判定：NO-SHIP（v1 草稿现状）。** 草稿 `.pw/lab-ava4-next.js` 生成于 15:02，早于 persona-uno 实锤报告（15:09）7 分钟，经逐行比对，`extractFeatures` 的肤色评分（L179）、hairC 同族排除（L202）、rescue/pixelVetoBald 双门（L216/229）、bald 分支特征丢失四处与线上 `avatar-features.js` **逐字节相同**——两个「特征反转级」P0 一条都没吸收。发型几何词汇扩得再好，喂进来的是错特征：卷卷渲染成光头蛋、阿琅发色变肤色，比「难分辨」更糟（表现错）。并入下列 P0×4 并复测实验室指标后，可升 SHIP WITH FIXES。几何模板（A3）、11 类分类骨架、guess 路径形状照测方向全部正确，无需推倒。

**归因方法学说明（可复核）**：本评审在 Node 里直接加载 `dicebear-local.js` 生成四位 persona 的原始 SVG 逐一取证——这是本轮所有颜色/结构结论的原始依据，不是看截图猜的。

---

## P0（阻塞合并，全部在 avatar-features.js 单一母本内修，禁止三页内联）

### P0-1 ｜卷卷（personas/Jill）→ bald 反转 + bald 路径 glasses 恒 false：三层叠加缺陷，给出结构级修法

**代码级归因（三层连锁，缺一不成立）**：
1. **簇融合（根因）**：personas/Jill 命中 `hairCurly` 变体；SVG 原始 fill：肤 `#e5a07e`、发 `#f29c65`，dist3=hypot(13,-4,-25)/441.67≈**0.064 < 贪心合并阈 0.09**（pixelClusters L68）。且两个组件都叠 `mix-blend-mode:overlay` 白罩（发 .26 / 颅面 .36），光栅后两者都被提亮、更加贴近 → 发+肤并成单簇，均值被大像素量的发拉到 **#f1b692 —— 与 `persona-ava4-data.json` 实录 skin 逐位吻合**。当心：uno 报告建议的「同族剥夺」按字面实现**救不了这例**——融合后已不存在独立的顶带主簇可供比对，剥夺对象根本找不到。
2. **topMass 被毒化**：顶带非肤扫描（L208-214）以 skinC 为参照（dist<0.10 排除）——卷发≈skinC 同族 → 全被排除，topMass 只剩少量暗色卷影 < 0.008 → **pixelVetoBald 误触发**。该否决权（上轮 expert-eng P0-2 钉子，不许回退）设计目标是「pin 说有发而像素真空」，这里像素的「空」是被错误 skinC 制造出来的假空。rescue 需要 topMass>0.012，同样被毒死。pin 本身没病：本评审已验证 `diceAvatar('personas',{seed:'Jill',hair:[]})` 与原串不同（5914 vs 3495 字节），位图差分必返 true → pinBald=false（pin 说有发是对的）。
3. **结构缺陷**：glasses/嘴/胡子像素检测整体挂在 `if (pixelHasHair || (pinSaysHair && hairC))` 分支内；bald 分支只有 `f.glasses = pinGlasses === true`，而 personas 不在 PIN_GLASSES/PIN_GLASSES_NAMED → pinGlasses=null → **2D 大墨镜静默丢失**。personas 在 GLASSES_STYLES/FACIAL_STYLES 里，但这两个集合只控制「有发分支内」的像素兜底——bald 时永远走不到。

**修法指令（avatar-features.js extractFeatures 内，参数级）**：
- **融合劈分（主修，一箭双雕 P0-2）**：skinC 选定后，在现有顶带扫描同一趟循环追加累计 `tSkinN`（顶带非bg 且 dist<0.10 入 skinC 的像素数）。当 `(!hairC || hairC.n <= 0.012*N) && pinBald !== true && tSkinN > 0.05*N`：对全图 skinC 族像素（dist<0.13）做确定性 2-means（k=2，种子=顶带族均值/中心带族均值，3 轮迭代）；两心 dist3>0.030 才接受劈分：skinC←中心心（重算 hexc），hairC←合成簇 `{n:tTop, mean:顶心, topN:tTop, cenN:0, sideN:0, lowN:0, minx:0, maxx:w, miny:0, maxy:…}`（字段形态照抄现有 rescue 合成簇 L226）。真秃脸（额头+脸颊同色）两心距 <0.030 → 不劈，bald 保全。**阈值域纪律：全部归一域（/N、dist3 域），禁乘 N（hairStyleOf L132 注释钉过两次归一=恒假）。**
- **bald 硬门槛（第二道闸，防 pin 侧失效）**：新增 `pixelBanBald = tAllN/N > 0.05`（tAllN=顶带非bg 总量，与 skinC 无关的独立累计）；`else` bald 分支前若 pixelBanBald → 改走 guess 路径（形状照测 + #4a382c，P0-3 钉子语义原样）。覆盖 pinBald===null（光栅失败/无钉扎的 dataURL 头像）与未来任何风格的 option 失配——**光栅瞬态失败 + hairC 空 = 现状必 bald，这是个静默反转暗道**。
- **检测外提（结构）**：scanBand 眼镜/嘴簇/胡子三段抽成 `detectFaceParts(f, at, isBg, clusters, N, w, h, skinC, hairC)`，hair/guess/bald 三分支统一调用。函数内已有 `hairC &&` 守卫（L242/273），bald 时 hairC=null 安全；personas∈GLASSES_STYLES/FACIAL_STYLES → 像素兜底生效，Jill 墨镜 → 'dark'（L=0.05<0.25）。guess 分支的 `f.glasses = pinGlasses === true`（L284）一并换用外提件。
- **门禁加账**：probe-ava-lab 的 classHist 现在把「bald 12→12 不变」当正确证据——这是盲区（12 里可能藏反转）。after 报告必须新增三分账：`bald = byPin(pinBald===true) / byVeto / byBanGuess`，byVeto 占比 >30% 即打回。

**验收**：`dcb:{"s":"personas","d":"Jill"}` → style∈{afro,curly}（maxRowW>0.65 走 afro 是合法落点）、hair≈#f5b7xx 系、glasses='dark'；`avFeats()` 断言进 ev-avatars-tod 或新 ev 用例。

### P0-2 ｜阿琅（adventurer/Maria）金发误判肤色：同族剥夺+发拯救的具体算法

**代码级归因**：adventurer/Maria 原始 fill：肤 `#f2d3b1`、金发 `#e5d7a3`，dist3=hypot(13,4,-14)/441.67≈**0.044 < 0.09 → 合并成单簇**，发像素量占优 → 均值≈#e3d6a5 ≈ 实录 skin=`#e5d6a3`（1/255 内吻合，实锤融合而非纯发簇得分胜出）。随后：hairC 同族排除 0.07（L202）→ 剩余无一簇 topN≥0.008N → hairC=null；topMass 以 #e5d6a3 为参照 → 金发被排除，只剩暗缘落在 **(0.008, 0.012] 缝隙带**：veto（<0.008）不过、rescue（>0.012）不过 → guess 路径锁死 #4a382c+short。发选取的 0.07 排除与 rescue 双双失效的根源与 P0-1 同一个：**skinC 先吞了发，一切以 skinC 为参照的后续信号全部失真**。`cenN − 1.2×topN` 调权重不解决问题——融合簇内部没有第二个候选可排序。

**修法指令**：P0-1 的劈分件原样覆盖本例（tSkinN≈金发量 >0.05N、两心距 0.044>0.030 → 劈分：肤←#f2d3b1 心、发←#e5d7a3 心）→ dropJaw>0.012 → **'long' + hairLen 连续参数**，正是 v4 几何想喂的头。禁止另做「肤色评分加权」补丁（会在 avataaars 棕肤 S0.78 保留案例试错，上轮 P0-4 钉子的平衡别动）。**验收**：Maria → style='long'、hairGuess=false、skin 回 #f2d3b1 系（skinClamp 前），persona-ava4-uno.cjs 复跑逐座位落点对照。

### P0-3 ｜featsSig 缺 hairLen/hairWid（+mouthWide）：三页六处，漏一处就漏重建

**归因**：sig join 现为 `[style,glasses,beard,skin,hair,mouth]`，位于 `monopoly.html` L1621（applyFeats）与 **L1684（buildPawns 幂等门初值——这处最容易被漏）**、`uno.html` L1389/L1448、`tod.html` L7557。v4 里 hairLen/hairWid 直接驱动几何（long lenK=0.85+0.4·hairLen；afro wide=1.26+0.16·hairWid；flat/spiky/fringe 也吃分类参数）：两个 'long' 头像 hairLen 0.1 vs 0.9 → 六字段全同 → applyFeats 幂等门误判「没变」→ **旧头驻留，新头像静默不生效**。现状单头像 feats 不变所以没炸；B1 热座派发+改名后「同一 pawn 槽先后吃到同 style、发色经 clampColor 收敛后同 hex、异长度」的两个头像，从不可能变必然可能。
**指令**：六处统一为 `[style,glasses,beard,skin,hair,mouth, mouthWide?'w':'', hairLen, hairWid].join('|')`（数值直接 join；若 toFixed(2) 必须三页一字不差）。hairGuess 不进 sig（guess 的 hair 恒 #4a382c 且 style 已在 sig，进 sig 是过度设计——写进方案防后人加）。

### P0-4 ｜热座 B1 接线：av 断链三处 + 派发函数归属 + 确定性规范

**C 项锚点核对结论（用户问「逐一定位对不对」）**：对，但有两个漏点。
- ✓ `monopoly.html` syncPawnFaces L1641、buildPawns L1674；`uno.html` refreshSeatAvatars L1413/1420、netAvatarHtml L594；`monopoly.html` netAvatarHtml L791；两页 startGame G.players 构建（mono L2054 / uno L1708）——均只读 `NETMODE && NDOC…av`，热座恒空，定位正确。
- **漏点 1（存档断链）**：`monopoly.html` saveGame L1975 的 players 序列化是**显式字段表**，无 av → 热座中途刷新续档 → resumeGame（L3523）重建的 G.players 无 av → 3D 头全桌掉回 fb。指令：saveGame players map 追加 `av: p.av || ''`；resumeGame 的 Object.assign 已透传无需动；旧档无 av 回落 fb（写进方案）。
- **漏点 2（uno sig 锚）**：uno L1413 的 seatAva.sig 只含 NDOC av → 热座下恒为常量串 → **改名/重开局 bust 永不重建**。指令：sig 的 av 位改 `NETMODE ? NDOC…av : (G.players[i].av || '')`。mono 侧 faceKey diff（L1644）天然感知，无需改结构。
- **cfg.players 全入口透传**：mono L3286（rematch）/L3372（手动开局）/L3505+L3599（AUTOTEST）、uno L2473/L2606/L2740——逐处加 `av: seatAvatarRep(p.name, i)`，漏任一处=该入口热座无头像。rematch 复用同函数 → 同名同 avatar 跨局稳定 ✓。
- **seatAvatarRep 放 party-net.js 导出**（反对各页内联）：DB_STYLES/CZ_ABSTRACT/CZ_BGS/makeRecipe 全是组件私有件，内联=复制第四份风格池，违背 avatar-features.js 单母本同款纪律。party-net.js 仅语法门禁无 sha 锁 ✓ 可安全扩展。确定性规范：djb2 32 位 over `name+'#'+idx`（**禁复用 czRandSeed/pick 的 Math.random**）；style 池 = 非抽象且**显式排除 `-neutral` 线稿**（NEUTRAL_LINEART 走纸白肤秃头特例，全派它=制造新一排撞脸秃）；bg 按 `Math.imul(h,2654435761)>>>0 % CZ_BGS.length`；开局对全部座位做构造性去重（同 rep 则 seed 追加序号重散列）——「同房不撞」必须是构造保证，不能靠 32 位哈希不碰撞（≤16 座位碰撞概率 ~6e-8 可忽略，但 style 池 ~30 会自然重样，靠 seed+bg+发色区分）。改名重开局的缓存卫生结论：paletteCache key=uri，改名回旧名=命中复用正确，**无脏缓存路径**（featsSig 见 P0-3，mono buildPawns 每局重置 ✓）。

---

## P1（合并前必须给数字或落地）

### P1-1 ｜hairMaskMetrics 耗时预算：先纠偏再给预算
它不是 5 次全图扫描——是 **1 次全图双循环**（16384px × at/isBg/near 三个闭包+临时数组）+ tProf 条带统计；且它**替换**了旧 5 类的 3 段扫描（bunN/maxRow/lowMass ≈0.62 全图当量）。净增量 ≈ +0.4 全图当量 ≈ **+13-18%/头像**。预算：featQPush 每槽 1 头像 + rIC 1200ms timeout 的节奏不动，16 人 tod 全桌增量 ≈ +10-30ms 总量摊在 idle 切片，无单帧尖刺 ✓；禁改同批 Promise.all。指令：merge 前给 lab-avatars.html 加 per-avatar performance.now 输出，单头像 >15ms 则做白拿优化——`near()` 前先查 `tProf[x]>=0 || fy<0.55` 跳过下半图（hairLen 仍需下半，改为 fy≥0.55 且已记录 hairLen>fy 时 continue），可省 ~35% 像素访问。

### P1-2 ｜PIN_RASTER_CACHE：新阈值对命中率冲击为 0，真风险在 B1 的 churn
hairStyleOf/新阈值不新增钉扎作业（作业集合=PIN_GLASSES/FACIAL/HAIR 不变），**阈值与命中率无关**。真实冲击：16 人房全 avataaars 时 8 named-glasses×2+2+2=20 张/人 → 320 张挤 96 LRU；B1 后改名/重开局提高 re-extract 频率 → 驱逐后 re-raster（每张 2×rAF）。指令：LRU 96→128；**key 硬化**：现为 `svg.length+'|'+strHash(svg)`（32 位 djb2+长度，碰撞即静默用错光栅=特征反转级故障），升级为完整 svg 字符串作 Map key（96-128 × ~40KB ≈ 4-5MB，可接受）或双独立 32 位哈希。

### P1-3 ｜guess 路径形状分类的探针冲击面 = 实验室闸，不是 ev 金值；ev 真正的威胁是「再分类」
guess 路径（hairC 空）在 ev-avatars 四闸现有金值头像中 **0 命中**（四闸全用本地 dice dcb，hairC 均命中）→ 冲击面仅 `probe-ava-lab after` 的 classHist/distinct（属计划内指标）。**真正会挂的是 hairStyleOf 对既有有发头像的再分类**：`ev-avatars-mono` L54 avaprobeB(pixel-art) `'short'`、`ev-avatars-uno` L47+L49 avaprobeU `'short'`+`parts.hair===2`、`ev-avatars-tod` L71/L76/L96 micah/Felix `'short'`×3。指令：(a) merge 前对这 4 个头像在 `?v=next` 逐个复测；(b) **pixel-art/pixel-art-neutral 的像素阶梯会让 edgeJag/peaks 虚高**（低分辨率楼梯不是发丝锯齿）——hairStyleOf 入口对这两风格将 edgeJag/peaks 归零；(c) micah 若翻 spiky 且对照板视觉成立，改金值并在 brief 记录理由；不成立则 edgeJag 阈 0.028→0.034 收口。

### P1-4 ｜回归闸必挂清单（D 项，逐条）
- `check-syntax.cjs` L21 avatar-features.js sha `68ff8336404dfaff` → 换新哈希（计划内，纯 LF 照旧）。
- `ev-avatars-mono` L95-97（热座 `f.fb && /^fb:\d$/`）→ **B1 后必挂** → 重写为 dcb 到位断言：`every(f => !f.fb && f.loaded && f.key.startsWith(i+'|data:'))` + 两两 style/hair 互异。
- `ev-avatars-uno` L63-65/L73（`seats[0].fb`、`/^fb:\d$/`）→ 同上重写；L73 的「sig 不变零重建」语义保留但键值换 dcb。
- `ev-avatars-uno` L49 `pts.hair===2`：avaprobeU 若再分类为 fringe(+1)/spiky(+8) 即挂 → 按 P1-3 复测结果改断言。
- `ev-avatars-mono` L54/L89、`ev-avatars-uno` L47/L53 的 skin/hair/style 金值 hex：P0-1/2 只作用于 hairC 为空的路径，这四个头像 hairC 命中 → **预期不变；merge 后全量复跑，一旦漂移按全局回归处理，禁止顺手改金值**。
- `ev-avatars-bc`：bc: 协议不走提取器（该文件 L3+工程专家裁决）→ 不受影响，不动。
- fall/monopoly/maps/num3d/net 闸：断言耦合 body 材质/格位/钞堆/镜头，`faces()` 仅 ev-avatars 消费 → 不动；seats 闸管 seatFx label 不涉 bust 几何 → 不动。REDUCED/loperf：提取器 canvas2d 与渲染分档无关（brief 红线成立），新几何在 REDUCED 下照常建，**但把「spiky/curly/mohawk 的锥/球 geometry 段数上限：cone radialSegments≤6、sphere≤10×8」写进 brief 红线，禁因观感回调段数**。

### P1-5 ｜性能量化（E 项）与 geometry 共享的所有权纪律
数字：现有头 15 mesh（+glasses5=20，+beard3=23）。draft 最坏 curly=15+12=27，再叠 glasses5+beard3=**35/头**。16 人 tod：头 mesh 240→560（**+320 draw call**；castShadow 全开 → shadow pass 再 ×1 ≈ +640 次提交/帧）；4 人 mono：60→140（+80）。顶点量：curly 头 ≈3.5-4k tri ×16 ≈ 64k tri，GPU 无压力，瓶颈纯在 draw call 提交。判定：桌面无感；移动端中端 ≈ +1.5-3ms/帧，**可接受但不白给**。指令：(a) brief A3 的「~15-25 mesh」改为「15-35」；(b) geometry 共享列 P2 而非门槛：同页 r 恒定（mono 0.1/uno 0.16/tod 0.2），bumpGeo/coneGeo 可按 (part,r) 模块级共享，省 12-20 次 geometry 上传/头——**但必须复刻「纹理缓存独占所有权」教训的几何版**：共享 geo 打 `geo.userData.avShared=true`，三页 dispose 点（monopoly L1628、uno L1394+L1407、tod L7561/L7571 的 traverse 全弃）改为 `if (o.geometry && !o.geometry.userData.avShared) o.geometry.dispose()`——三处漏一处=第二局头消失。(c) 共享**不减 draw call**（每 mesh 仍单独提交），若门禁真红，正确抓手是 curly 凸包 12→8，**禁 merge geometry**（会毁 parts.hair 计数断言链）。

### P1-6 ｜uno 报告 P1 几何项未被草稿吸收，补进 A3
draft 的 bun 仍钉 `(0, 0.98r, −0.30r)` 颅后位、long 外倾仍 0.14rad——persona-uno §四.3（bun 前移抬高让南位俯视见弧、long 侧锁外倾加大成剪影级）未落地，而这两项正是「UNO 半身像可读性」清单里成本最低的两条。指令：bun → `(0, 1.02r, −0.12r)`；long lock `rotation.z` 0.14→0.22rad。tod 房主背面 hairBack 加厚维持 P2（r0.2 近景问题，不挡热座主目标）。

---

## P2（记录在案，不阻塞）

- **P2-1** mono/uno netAvatarHtml（L790/L593）在每次 updateHUD 重建 `<img>`，热座 dcb → data URI 每次重生成：G.players[i] 上缓存 `p._avUri` 按 key diff 跳过（联机路径现状同病，顺手治）。
- **P2-2** personas 的 pin 依赖「`hair:[]` 空池 = 组件消失」这一 DiceBear 隐式契约（本评审已验证字符串必变，但这是 bundle 内部行为非承诺）：P0-1 的 pixelBanBald 已兜底，无需代码动作；dicebear-local.js 升级时回归 personas/Jill 用例。
- **P2-3** hairStyleOf 的 curly 规则样本 0 命中（brief 自见）：接受带病合并（builder 分支在），但给 lab after 报告加 curly 命中计数，两轮仍 0 则删类减面。
- **P2-4** uno refreshSeatAvatars 的 `grp.userData.palette = e`（L1442）持有 palette 条目引用跨重建——paletteCache LRU 32 在 16 人+改名场景驱逐后该引用仍持旧 feats，行为无害（uri 未变 feats 不变）但与 mono 的 faceKey 查询式不对称，记一笔防未来改缓存策略时踩引用失效。

---

## 总评（≤100 字）

方向对、骨架好，但草稿早于 persona 实锤 7 分钟出生：两处特征反转（融合簇吞发→毒化 topMass→误秃/误肤色+bald 路径吞墨镜）零吸收，NO-SHIP。P0×4 全部落 avatar-features.js/三页 sig 锚，参数已给全；修完复测 lab 三分账+四闸金值即可升 SHIP。
