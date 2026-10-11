# 头像区分度+发型 2D 相似度轮 · 设计方案 v1（2026-10-11）

用户反馈（原话）：「真心话大冒险的3d头像做的可以，同时发型可以做得更像2d即可，但是大冒险和其他游戏的3d头像做得很难看出区别」

拆解：① tod 头像保留现状，发型（形状）要更贴近 2D 头像的发型；② 大富翁/UNO（及他游戏）的 3D 头像互相难分辨。
本轮目标：所有游戏的 3D 头像「一眼是哪张 2D 头像的人」「同桌互相一眼可辨」。

## 取证（已完成，可复核）
- 实验室基线 `.pw/probe-ava-lab.cjs before`（9073，产物 `.pw/shots/ava-lab-before.png/.json`）：
  80 个代表头像（24 预设 + 14 热门风格×4seed）→ 50 个人脸，只得到 **38 种 3D 长相，12 对撞脸**。
  发型分布 short=24 / afro=10 / bald=12 / long=4 / **bun=0**；**12 个提取失败落到完全相同**的「默认棕#4a382c+同款壳」（guess 路径锁死 style='short'）。
  2D 里明显不同的刺头/齐刘海/丸子/莫霍克/平顶/卷发全部塌成一个通用发帽+后壳。
- 游戏现场：
  - `ava-mono-hotseat.png`：热座棋子头 ~20px，全部兜底头，仅身体色不同——**热座根本无头像数据**。
  - `ava-uno-hotseat.png` / `ava-uno-net-host.png`：对手半身像=发色蛋，特征不可读。
  - mono `startGame`（monopoly.html:2054）与 uno `startGame`（uno.html:1708）的 G.players **无 av 字段**；3D 头 av 源=`NETMODE && NDOC.players[i].av`——热座恒空；联机机器人也无 av。
- bombcat：bc: 猫脸协议（hue+seed），有毛色区分，本轮不属重灾区。

## 方案

### A. 发型 2D 相似度（avatar-features.js 共享件，tod/mono/uno 同源受益）
A1 **发掩码轮廓度量**（新 hairMaskMetrics）：不依赖发色簇成败——用「顶带非背景非肤」像素做掩码，输出标量：
   topH（发顶高度）/ maxRowW（最大行宽）/ dropJaw（过颌线下垂质量）/ fringeDepth（前额中带发缘下探）/ spikeScore（顶缘凹凸方差）/ centerBias（中央占比高+两侧少=莫霍克）/ bunBlob（颅顶上小凸块）/ twinScore（两侧中带对称双峰）/ hairLen/hairWid（0.85-1.2 连续缩放带）。
A2 **发型 12 类**（现行 5 类升级）：bald / buzz / short / **fringe(齐刘海)** / **spiky(刺头)** / **flat(平顶)** / **mohawk** / **curly(卷发)** / afro / long / **twin(双马尾)** / bun。
   guess（发色失败）路径不再锁 'short'：形状照测（掩码与颜色无关），只有颜色用 guess——消灭 12 连撞脸。
A3 **builder 几何模板**（buildAvatarHead 内新增，全不透明 Standard 材质+castShadow 纪律不变）：
   - spiky：帽壳+7-9 根外倾 Cone 刺（环形分布、前小后大）。
   - fringe：前壳 partial-sphere 下压到眉上（额前遮盖）。
   - flat：顶部扁圆柱替代帽顶。
   - mohawk：矢状 5 锥脊+两侧剃青（无侧发壳）。
   - curly：帽壳+10-14 个小球凸包（布点由发色哈希确定性撒放）。
   - twin：两侧低位球链（2-3 球/侧）。
   - long/afro/bun/buzz/bald：保留现行，长宽吃 hairLen/hairWid 参数。
   - parts 计数器同步（探针断言用）；材质数增加仍在每头 ~15-25 mesh 量级。
A4 连续参数随头像量化（hairLen/hairWid），同类不同人轮廓仍不同→撞脸率进一步下降。

### B. 其他游戏区分度
B1 **热座座位发头像**（monopoly/uno）：座位行自动派发确定性 dcb 头像（hash(座位名+序号)→非抽象风格+seed，同房不撞），
   `cfg.players[i].av` → `G.players[i].av`；3D 头 av 源改 `(NETMODE ? NDOC…av : G.players[i].av)`。座位行渲染小圆头像 img（玩家看得见谁是谁）；不做重随 UI（P2 备选）。
B2 **联机机器人发头像**：host netStartGame 时给每个 bot 派 dcb av（进 doc，全端一致渲染）。
B3 **小头可读性**：新发型大多强化「顶视轮廓」（bun/mohawk/flat/curly 在大富翁俯视角下恰好可读），monopoly r0.1 不单独改参数（上轮视觉专家 P1 清单钉过数值，禁单页回调）。
B4 bombcat：本轮不动（猫脸协议上轮裁决独立；hue 已有区分度）。玩家价值专家如判 P0 再议。

### C. 门禁
- 实验室指标（after）：撞脸 ≤5（基线 12）、distinct ≥44/50、bun/spiky/fringe/mohawk/flat 至少 4 类非零、guess 路径 sig 不再全同。
- ev-avatars-mono/uno/tod/bc 金值断言按新几何更新；全量回归（fall/monopoly/maps/mono-net/uno/seats/uno-net/face/result/card3d/num3d/check-syntax）。

## 红线（工程）
- avatar-features.js 唯一母本 + check-syntax sha 锁（tod/mono/uno 三页 src）；LF 行尾。
- 三锚原子换契约不破（headGrp/u.head 身份不变、headMats 现场重读、uno neck 共享 skin 再链）。
- alphaTest×opacity 雷区不碰（全部不透明几何）。
- tod:perf=full 探针钉；LO/软渲退路零改动（提取器是 canvas2d，与渲染分档无关）。

## 原型实测（草稿 .pw/lab-ava4-next.js，专家评审材料）
- 对照板：`.pw/shots/ava-compare.png`（同头像 2D | 旧 3D | 新 3D 三联，按类别自动选例）。
- 实验室指标（80 案例/50 人脸）：撞脸 12→**0**（签名=style|镜|须|发色钳位|hairLen|肤色钳位），distinct 38→**50**；
  发型分布 short 24→5，新类 buzz4/fringe6/bun4/flat2/spiky2/mohawk1 全部非零，long4/afro10 保持，bald12 不变（真实秃）。
- 途中修掉的坑：hairStyleOf 阈值误乘两次 N（归一域混用，dist3 单位域同款教训）——fringe/bun/long/twin 曾全灭。
- 已知自见问题（请专家复核）：buzz 类观感偏薄（已改薄帽非发茬）；flat 圆柱比例已收（0.74-0.86r）；
  curly 分类规则在样本上 0 命中（builder 分支在，等真命中案例再调）；twin 样本 0 命中（几何在，需真实双马尾头像验证）。
- persona 取证：`report-ava4-persona-mono.md`（热座 2/5 分：兜底头实锤/俯视 42° 可读性排序=顶轮廓>发色相>身体色≫眼镜胡子/
  全景棋子出画的镜头问题/交接卡建议）；uno 联机版见 `report-ava4-persona-uno.md`（若已产出）。

## 定稿 v2 实施记录（2026-10-11，三专家评审全部并入后）
- **提取器**（avatar-features.js sha adcbcc72…，LF）：顶带一趟三账扫描（tAll/tSkin/tn）→ 融合劈分（确定性 2-means，tSkinN>0.025+双带证据+两心距>0.030，肤←中心心/发←顶心合成簇）→ 拯救门去极性（pinBald!==true）→ pixelBanBald（tAllN>0.05 且 pin 缺席才走 guess；pin 明说无发=帽巾尊重钉）→ 检测外提 detectFaceParts（三分支统一，bald 不再吞墨镜）→ veto 0.008→0.004（micah A1-0 细笔画 0.0056 逃出）。isBg 0.16→0.12；guess 色 seed 哈希微抖；clampColor 近黑源钉暖棕；stubble loL 0.22。
- **发型 11 类**：mohawk/afro/long/twin/flat/bun/spiky/fringe/buzz/short/bald + hairLen/hairWid 连续参数。visual 六处阈值全并（bunW/bunJag 新度量、mohawk 0.60+peaks≥2+bunBlob<0.008、spiky 阈值改 jag>0.026——劈分后 mm 参照色已变，visual 的 topMass>0.030 口径失效，实测 jag 才是真分离特征：真刺头 0.065-0.109/光头 0.017）；pixel-art 像素阶梯 jag/peaks 归零守卫（eng P1-3b）；flat 提到 bun 前。curly/twin：分类保留、builder 路由 curly→afro/twin→long（value P2-1；twin 规则实测在 adventurer 座位真实命中，路由生效）。
- **实验室终值**：116 案例 88 人脸 → **88/88 可辨、0 撞脸**（签名含钳位肤/发+len）；类分布 flat5/afro20/short14/long18/spiky4/fringe16/bald9/bun1/buzz1（价值验收线 5：fringe/spiky/flat/bun 4 类非零 ✓，mohawk 0=样本无真莫霍克，诚实为零）。
- **反转验收**（eng P0-1/2 逐位达标）：personas/Jill → afro+肤 #eec2ab+发 #f2b28b+墨镜 dark；adventurer/Maria → long+肤 #f2d3b1+发 #e4d6a3+hairGuess=false；micah/A1-0 → buzz+guess（不再秃）。
- **热座接线**：party-net `seatAvatarRep(name, idx, taken)`（djb2 确定性、14 人脸风格允许名单——fun-emoji/bottts 等非人协议实测会兜底，构造性去重）；mono 21 处/uno 14 处锚点（startGame/rematch/autotest/saveGame/resumeGame/读取点/HUD/座位行头像/交接卡头像）；featsSig 六处 +mouthWide/hairLen/hairWid。
- **兜底件**：名牌底色环（avBgColor 配方 b 字段）；交接卡头像+座位色描边；全景镜头（OV_TGT_K 0.22/OV_DIST_ADD 1.9——**camApply L1083 autoDist 每帧覆写 dist 是隐藏坑，余量必须加在覆写点**；GO 聚集档实测 cy 849→738，ev-ava4-pano 钉 <vh−40）；PIN_RASTER_CACHE 128+完整 svg 串 key。
- **金值更新**（协议=目检+记录）：mono avaprobeB style short→flat（目检 ✓）；uno avaprobeU 肤/发/style 全换（**旧 #684d35 是发影棕误判肤的修正**，非回归）+parts.hair 2→3（fringe 前帘）；tod micah/Felix short→fringe。
- **环境噪声备案**：ev-mono-fall 在当日负载下 HEAD 基线同点 FATAL（git worktree A/B 两轮），非本轮回归；persona-mono 真 UI 流在重载下会触发 loperf→GL 退役（文档在案行为），验收证据改走 ev-ava4-pano（autotest 路径）+ev-avatars-mono 热座段。
