# 头像特征强相似轮 · 设计方案（brief-av3-design，2026-10-08，feat/3d-avatars）

用户点名：「将所有游戏选择的头像转化为 3D 人物的 3D 头像，3D 头像的特征要和 2D 头像有非常大的相似点」。

## 0. 现状与差距

| 页 | 3D 头现状 | 与 2D 头像的相似点 | 缺口 |
|---|---|---|---|
| tod.html | 球面**贴图脸**（头像图贴球面贴片）+ 玩家 id 色发半球 | 贴图 100% 还原但「贴纸感」（用户上轮在 monopoly/uno 点名否贴图） | 真实感；发色错（id 哈希色非头像发色）；肤色写死 |
| bombcat.html | 同款移植贴图脸 | 同上 | 同上 |
| monopoly.html | 二阶几何头（颅+发壳+眉+眼+鼻+微笑） | 名义上「发色来自头像」 | **实际发色链路已死**（见 0.5）：全员黑头盔+同一肤色+同一发型 |
| uno.html | 二阶几何半身像（+脖+肩） | 同上 | 同上 |

头像协议：`dcb:{s,d,b}` 本地 DiceBear SVG（31 风格）/ `av:P##` 预设 / dataURL 上传 / emoji（仅 tod/bombcat 表单）。

## 0.5 玩家模拟走查证据（两组 persona，报告+截图在 .pw/persona-av3/）

- **report-B（monopoly+uno）**：4 头像全部 1/5——「一帧四头同款黑盔」；uno 秃头玩家拿到全桌最大黑盔头。
- **report-A（tod+bombcat）**：2/5 与 2.5/5——P0：秃头被扣随机色大发壳（特征反转）、发色=id 哈希随机、肤色恒 #e8b98c；P1：斜 55° 贴纸感（脸可读面积 <20%）、眼镜/胡子只在平面贴片里。
- **发色链路死因（已亲自复现归因）**：`hairFromImage` 在 16×16 画布上做「最暗 45% 均值」，而细线条画风（adventurer 762 viewBox）在 16px 下细描边全部抗锯齿进背景 → 非背景像素 0 个 → `take` 空 → **NaN 传播 → '#000000'**；且 `ev-avatars-mono` 旧断言只验 `/^#[0-9a-f]{6}$/` 格式，#000000 恰好常年假绿。
- 次生发现：并行高负载下 Chromium 对无 width/height 的 SVG img `drawImage` 出现过**部分路径不渲染**的瞬态光栅（正常负载 12/12 稳定）——实施需「空光栅重试一次」兜底。

## 0.8 提取器与 3D 头原型（已完成校验，提取器已冻结）

- 提取器：`.pw/av3-feat-prod.js`（下文 §1；含 128² 空光栅 decode+rAF 重试兜底）；校验表 `.pw/av3-verify.html`（146 格，`.pw/shots/av3-verify.png`）；全网格 `.pw/av3-spike.html`（186 格，`.pw/shots/av3-spike-grid.png`）。
- 3D 特征头原型（生产构建器直渲）：`.pw/av3-headproto.html`（15 案例 2D/3D 并排，`.pw/shots/av3-headproto.png`）。
- 终版校验数字（186 格）：人在场 123/126（dylan 侧脸 2 例 + avataaars 1 例 → fb 优雅降级）；**零假秃、零假眼镜**；眼镜 big-smile 3/micah 2/miniavs 2/notionists 2/notionists-neutral 3/personas 2 与钉扎真值逐个一致；胡子 avataaars 1/toon-head 3/open-peeps 3；adventurer-neutral 全 6 认出（背景四角多数派修复）。
- 关键修复记录：①背景判定只用四角 ≥3 多数派（边缘中点会撞贴边头发——open-peeps 爆炸头被吃成假秃的教训）；②发-肤同族排除 0.10→0.07（金发 vs 浅肤 0.093 也要能当发）；③拯救带 0.20→0.30；④16×16 NaN 死因见 §0.5。已知接受缺口：dylan 侧脸不识别、照片深色眼镜漏检（与深发不可分）、极小发量（micah 灰白小撮）走默认短发。

## 1. 特征提取器（已在 .pw/av3-feat.js 完成校验）

**三层管线**，输入 128×128 canvas 像素（+可选 style/seed 元数据）：

1. **钉扎差分（结构·精确）**：dcb/预设的 style+seed 已知 → `diceAvatar(style,{seed,key:[]})` 与原输出 diff → 组件存在性精确判定。键位图已扫出：眼镜 11 风格（glasses/accessories 键）、胡子 6 风格（facialHair/beard/mustache）、秃头 13 风格（hair/top）。avataaars 用具名镜框变体（Kurt/Circle/Round/Sunglasses/SunglassAlt/Wayfarers/Prescription02）精确枚举。
2. **像素聚类（颜色·轮廓）**：量化 16/通道 → 近色簇贪心合并 → 肤色=「中心窗计数−1.2×顶带惩罚」最高分簇（色相卫兵拒绿青蓝紫）；发色=顶带最大非肤簇（+钉扎说有发时的顶带取色拯救）；发型轮廓=侧带垂发/顶心丸子/超宽爆炸；嘴型=嘴区簇高宽；衣服色=底带最大非肤簇。
3. **特例**：`-neutral` 线稿 6 风格 → 纸白肤+黑发（透明脸内像素不可判）；bottts/icons/identicon 等 10 非人脸风格 → person=false 走 fallback；照片（dataURL）纯像素路径。

**输出** `{person, skin, hair, hairGuess, style: bald|short|long|bun|afro, glasses, beard, mouth: smile|open|flat, clothes}`。

**校验结果**（186 格网格 + 146 格校验表，人工逐格核对）：
- 结构特征与钉扎真值 100% 一致（big-smile 3 眼镜/micah 2/notionists 2/miniavs 2/toon-head 3 胡子/avataaars 1 胡子全对，零假阳性）
- personas 像素兜底眼镜 2-3/6 检出零假阳；open-peeps 像素胡子 3 检出
- 零假秃（假秃曾是最严重问题，钉扎兜底后归零）；照片合成样 skin/hair/长发全中；非人脸风格 0 误判
- 已知可接受缺口：dylan 侧脸 2/6 不识别（fb 兜底）、照片深色眼镜漏检（与深发色不可分）、personas 浅发浅肤同化时发色走默认
- 性能：128² 两次扫描 ≈3-5ms + 钉扎最多 3 次 SVG 再生成 ≈2ms/次 → 单头像 <15ms，异步 onload 里跑，进房/换头像各一次，Map 缓存

## 2. 3D 头消费特征（buildAvatarHead 升级：r, colorIdx, feats）

- **肤色**：skin 材质 = feats.skin（L 钳 [0.25,0.88] 保立体；!person → 现默认 0xe9bb90）
- **发型几何**：bald=无发壳；short=现有顶盖+后脑壳；long=+两侧垂发锁（CapsuleGeometry 到下颌下）；bun=+顶后丸子球；afro=发壳横向放大 ×1.22；hairGuess=发色退玩家色深化（现状 fallbackHair）
- **眼镜**：双 torus 镜框（r×0.19）+ 鼻梁横杆 + 两侧镜腿至耳位；深灰 0x2a2a33
- **胡子**：下颌壳（球面 PHI 段）+ 嘴上髭条；色=发色
- **嘴型**：smile=现有弧；open=暗色椭圆腔加深；flat=细直条
- **衣服色**：uno 肩膀上 feats.clothes（去饱和 ×0.85 防艳）；monopoly 锥身保持玩家色（座位识别优先，见争议①）
- **眉**=发色（现状不变）

## 3. tod/bombcat：贴图脸 → 特征几何头

- person=true 头像：buildAvatarHead(0.2) 族头替换 face 贴片 + 玩家色发半球；发壳材质色=feats.hair（hairGuess→现 chrHue 玩家色深化）
- **emoji 头像保留现贴片路径**（emoji 本体是平面图形，贴图即其 3D 最佳表达；见争议②）
- 头随身体 baseRotY 朝桌心，无 billboard 需求；揭晓近景镜头下特征清晰可见
- 异步：avatarTexture onload 现成钩子里触发头子树重建（features 提取同点）

## 4. 数据流与缓存

- monopoly：acquirePalette 条目扩容为特征缓存 {skin,hair,style,glasses,beard,mouth}；syncPawnFaces faceKey diff → 命中缓存特征 **重建 headGrp 子树**（几何变化不只是换色）→ applyHeadPalette 单出口改为 applyFeats(headGrp, feats)
- uno 同族（seatAva.busts）
- tod/bombcat：texCache 条目扩容特征；syncPlayers 里 uri 变更点触发 rebuildHead(pid)
- 全部异步 onload 链路，不卡帧；缓存封顶 16 沿用

## 5. 探针与门禁

- ev-avatars-mono/uno 扩断言：深肤头像→head skin 读值≈提取 skin；眼镜头像→头内 torus 存在；bald→无发壳 mesh；long→侧锁 mesh 存在
- 新 ev-avatars-tod（贴图脸退役/emoji 保留/特征头存在）+ ev-avatars-bc（bombcat 同）
- 回归：fall 29/monopoly 28/uno 21/seats 9/mono-net 17/uno-net 11/num3d×2/check-syntax 全绿

## 6. 争议点（请挑刺专家裁决）

1. **monopoly 锥身色**：保持玩家色（座位识别优先）还是染 2D 衣服色（相似优先）？我主张玩家色——棋子识别靠色，衣服相似由头+名牌头像圆补。
2. **emoji 贴片保留**是否违反用户「不要贴图」？我主张保留——「不要贴图」语境是 DiceBear 人脸头像的贴片扁平感，emoji 没有几何对应物。
3. **代码组织**：共享 avatar-features.js（四页 script src + check-syntax sha 锁，dicebear-local.js 先例）还是四页内联同语言（monopoly/uno 现状惯例）？我主张共享文件——提取器 200 行 ×4 份内联的漂移风险 > 拆分提交成本。
4. **眼镜框色**：固定深灰（我主张）还是提取框色（瞳孔/描边污染风险）？
5. **嘴型/衣服色等低显著特征**值得做吗？（成本递增、显著度低——可砍）
