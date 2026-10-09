# report-A.md · 头像特征强相似轮 · tod.html / bombcat.html 玩家模拟走查（A 组）

- 模拟员：真实玩家模拟员 A（tod.html + bombcat.html）
- 日期：2026-10-08 · 分支 feat/3d-avatars · 端口 9141（A 组专用）
- 方法：Playwright 真实表单流实跑（本地模式 6 标签建房/入座/开局），截图取证，零代码改动。
- 脚本：`.pw/persona-av3/contact-sheet.cjs`（选角底稿）、`.pw/persona-av3/av3-tod.cjs`、`.pw/persona-av3/av3-bombcat.cjs`、`.pw/persona-av3/composite.cjs`（并排图拼版）
- 材质取证数据：`.pw/persona-av3/tod-materials.json`、`.pw/persona-av3/bc-materials.json`
- 两局全程 **0 pageerror / 0 console error**。
- 拍摄口径：全景图与揭晓图是**纯自然画面**；每角色「正面/斜 55° 特写」为**探针冻结相机接管**的仪摄（游戏相机每帧直写 position/lookAt，不接管拍不到特写），接管只动相机、不动任何场景物体。
- 诚实备案：bombcat 探针第一版曾在页面里挂 `Object3D.prototype.add` 只读钩子时误吞多参（导致角色缺头、证据作废），已修复并在修复后重新采集全部 bombcat 证据；tod 证据全程使用页面原生 `window.__three` 句柄，无此问题。

## 选角（覆盖 brief 要求的特征维度）

2D 头像经游戏自身头像管线注入（tod 走房间文档 `p.avatar` 的 `dcb:` 配方 + `mutate()` 状态正道；bombcat 走表单状态 `localStorage cat:av-pick` → `p.av`），6 人对局：

| # | tod 角色 | 特征 | bombcat 角色 | 特征 |
|---|---|---|---|---|
| 0 | 阿泽 adventurer:Zoe | 深肤 + 浅蓝长发 | 橘胖 bc:18:5 | 橘猫·圆眼 |
| 1 | 老白 micah:Felix | 浅肤 + 秃头 + 胡茬 | 雪球 bc:42:205 | 奶黄·细眼 |
| 2 | 眼镜妹 miniavs:Felix | 黑长发 + 圆眼镜 | 抹茶 bc:95:79 | 绿猫·圆眼 |
| 3 | 络腮胡 avataaars:Mika | 深肤 + 红络腮胡 | 薄荷 bc:160:341 | 青猫·细眼 |
| 4 | 粉毛 personas:Jack | 粉短发 | 蓝精灵 bc:200:607 | 蓝猫·圆眼 |
| 5 | 丸奶奶 open-peeps:Mika | 灰白丸子头 + 眼镜 | 芋泥 bc:320:889 | 粉猫·圆眼 |

选角依据：候选风格×种子全量底稿（contact-sheet 探针生成）+ 两张 2D 参照照（下方证据清单）。

---

## 1) tod.html —— 评分：**2 / 5**（正面特写勉强 3 分，斜视角/全景 2 分）

并排对照图：**`.pw/shots/av3-persona/composite-tod.png`**（2D vs 3D 正面 vs 斜 55°，6 人全量）
分项证据：
- 2D 参照：`.pw/shots/av3-persona/tod-av3-2d-reference.png`
- 自然全景：`.pw/shots/av3-persona/tod-av3-wide.png`
- 揭晓近景（持麦人视角）：`.pw/shots/av3-persona/tod-av3-reveal.png`；旁观者视角：`.pw/shots/av3-persona/tod-av3-reveal-spec.png`
- 每角色特写：`.pw/shots/av3-persona/tod-av3-head-{0..5}-front.png` / `tod-av3-head-{0..5}-oblique.png`

### 结论
3D 头 =「头球（恒浅橘肤 #e8b98c）+ 球面贴片脸（头像图整张贴在前侧）+ 半球发壳（颜色 = 玩家 id 哈希随机色）」。正面怼脸看，贴片里的头像特征（眼镜、胡子、发型画）确实在、可认人；但贴片之外的一切——发壳颜色、头壳肤色、身体颜色——都与头像无关。**侧面 55° 时脸贴片被压到球体边缘，剩下大半个随机色素球，一眼看不出是谁**；自然对局距离下更小。

### 缺失/走样特征（按视觉显著度排序）
1. **秃头反转（最刺眼，P0）**：老白 2D 是秃头+胡茬，3D 头顶却扣着一整顶大发壳圆顶（蓝紫色）——「2D 秃头、3D 毛发浓密」是特征直接反转，比缺失更违和。证据 `tod-av3-head-1-front.png`。
2. **肤色不迁移（P0）**：头球肤色恒 `#e8b98c` 浅橘棕。阿泽（深棕肤）、络腮胡（深肤）的下巴/后脑/脖颈露出的全是浅肤，只有贴片里那层「画」是深肤——侧面看就是「贴了张深色照片的浅肤球」。取证：`tod-materials.json` 全员 headColor=#e8b98c。
3. **发色随机（P0）**：发壳颜色来自 `chrColor(p.id)` 玩家 id 哈希，与头像发色无关。阿泽浅蓝长发 → 玫粉壳；丸奶奶灰白丸子头 → 紫粉壳；两次运行同玩家壳色都不同（id 变色就变）。取证：`tod-materials.json` hair 字段 + 两轮日志。
4. **眼镜/胡子/丸子头无几何（P1）**：这些特征只活在贴片平面里。正面特写可辨（眼镜妹圆眼镜、络腮胡红胡子、丸奶奶白框眼镜都清楚），斜 55° 即随贴片压缩消失，桌面对局距离下全部归零。
5. **贴片「徽章感」（P1）**：头像图 contain 进 canvas 时先铺 `#241235` 深紫底 → 头像四周有一圈深色描边环，读作「胸前挂的圆徽章/头像框」，不是「这是他的脸」。贴片边缘与头球色差进一步加重贴纸感。
6. **斜视角素球占比（P1）**：贴片 phi/theta 仅 ±0.7rad 窗口，55° 侧看时脸只剩边缘一条，可读面积 <15%。v8 的曲面贴片改造确实解决了「贴片漂移/悬浮」（贴片始终贴头、无错位）——但「贴纸感」本身还在，用户上一轮否掉贴图的理由在 tod/bombcat 依然成立。
7. 衣服颜色随机（P2）：躯干/胸色同为 id 哈希色，与头像衣服无关（次要，全身视角下才可见）。

### 走查中发现的其他视觉问题
- **揭晓近景不拍脸**：揭晓推镜的取景是「题卡特写」，6 人局下持麦人头肩不在画面内（`tod-av3-reveal.png` / `tod-av3-reveal-spec.png`）。brief 假设「揭晓近景是拍头像细节的最佳时机」——实测不成立；对局里玩家的 3D 脸只在全景里以极小尺寸出现。
- **朝向**：角色面向桌心，机位在南。自然对局中，自己与邻座（约半数字）只能看背影；能自然看到正脸的只有对面 1–2 人。发壳颜色错误因此被放大——看到的头顶全是错误颜色。
- 无穿模、影子正常、入场动画正常、名牌 2D 头像 chip 与 3D 头对应正确（HUD 层，`tod-av3-wide.png` 顶部可见）。

---

## 2) bombcat.html —— 评分：**2.5 / 5**（正面特写 3 分，斜视角 2 分）

并排对照图：**`.pw/shots/av3-persona/composite-bombcat.png`**（2D vs 3D 正面 vs 斜 55°，6 猫全量；右上为斜视角放大示例）
分项证据：
- 2D 参照：`.pw/shots/av3-persona/bc-av3-2d-reference.png`
- 自然全景：`.pw/shots/av3-persona/bc-av3-wide.png`（角色立于桌外）
- 每角色特写：`.pw/shots/av3-persona/bc-av3-head-{0..5}-front.png` / `bc-av3-head-{0..5}-oblique.png`

### 结论
与 tod 同款移植 buildChar（球面贴图脸 + 随机色发壳 + 随机色锥形身体），差异只在贴片内容：猫脸是 canvas 程序脸，整张含深色方底贴进 squircle 蒙版。猫脸贴片幅面更大（248/256），正面读感比 tod 好——「橘猫就是橘猫」（`bc-av3-head-0-front.png`）；但**猫的主体色完全没迁移到 3D 的壳和身体**，蓝猫戴米色壳、粉猫穿青绿衣服，斜视角下同样只剩素球。

### 缺失/走样特征（按视觉显著度排序）
1. **猫色不迁移（P0）**：猫主体色（hue）完全没有驱动 3D 材质。取证 `bc-materials.json`：橘胖(18°) → 发壳 #8dd255 绿；芋泥(320° 粉) → 发壳 #55d2ac 青绿、身体青绿；蓝精灵(200° 蓝) → 发壳米白。近看「蓝猫戴米色头盔」，全景看身体颜色五颜六色与猫无关。
2. **斜 55° 贴纸感（P1，本页最直观证据）**：`bc-av3-head-4-oblique.png`——蓝猫脸被透视压缩贴在球体左缘，占可读面积 <20%，其余是米色素球+米色壳；与 2D 参照放同一张图（composite-bombcat.png 右上）对比即是「贴纸」的直接呈堂证供。
3. **贴片方底描边环（P1）**：猫脸 canvas 自带深色方底，squircle 蒙版四角露出深色底 → 贴片边界呈「圆角方牌」感，比 tod 的圆蒙版更明显。
4. **猫耳与发壳冲突（P2）**：猫耳画在贴片上部，发壳半球从正上方压下来把耳尖「切」在壳线以下，正面看猫像戴了顶帽子。
5. **眼型 variant 不可辨（P2）**：圆眼/细眼差异（种子项）在贴片内，对局距离完全不可辨；同类不可辨的还有花纹/胡须微差。

### 走查中发现的其他视觉问题
- 角色在桌外一圈（SEAT_R 2.71），机位在南：同 tod，近半数角色自然视角下只有背影。
- 头顶 3D 实体铭牌尺寸偏大（宽 ≈ 头宽 2 倍），怼脸角度会糊住半个画面（`bc-av3-head-4-oblique.png` 背景）；全景下尚可。2D 头像 chip 只在 HUD 玩家条里，3D 视区内没有 2D/3D 并排机会（tod 有）。
- 无穿模、无朝向错误、阴影正常、发牌/铭牌/牌堆渲染正常，0 pageerror。

---

## 3) 优先级清单：3D 头要补哪些特征才能「一眼同一人」

两个游戏同一条管线（贴图脸 + 随机 id 色壳），修法也共用：

1. **P0 · 发壳颜色 = 头像发色**：从头像 SVG/canvas 采样发色（或 dcb 协议显式加 `h` 字段）驱动发壳材质；**秃头头像直接不生成发壳**（这是唯一一处「特征反转」级违和）。
2. **P0 · 头球肤色 = 头像肤色**：采样头像脸部主色（或协议加 `sk` 字段）替换恒定 `#e8b98c`，深肤色玩家的下巴/后脑才不会「换人」。
3. **P1 · 贴片去徽章化**：canvas 铺底从深紫/方底改为「沿头像轮廓 alpha 抠脸」，贴片边界消失才能从「挂照片的球」变成「脸」。
4. **P1 · 扩贴片视角覆盖**：phi/theta 窗口 ±0.7 → 覆盖前半球（或加侧贴片），把 55° 斜视角的可读面积从 <20% 提到 >60%；这是用户否掉贴图方案的核心痛点，若做不到就应转向几何脸（monopoly/uno 的 buildAvatarHead 路线 + 上面的颜色迁移）。
5. **P1 · 身体/衣服色 = 头像衣服色**（次显著，全身视角立即可感）。
6. **P2 · 眼镜/胡子几何件**：镜框半环、胡子薄片贴壳面，保证斜视角存在感；丸子头/长发用壳形变形（后脑垂片）表达。
7. **P2 · bombcat 猫色直通**：hue 已是现成参数，把 `hsl(hue,…)` 直接喂给发壳/身体材质即可零成本消除最大违和。
8. **P3 · 揭晓近景顺带拍人**：推镜落位在卡面的基础上，回弹段扫过持麦人脸半秒，让「近景」真有一次看脸的机会（tod 6 人局实测近景无脸）。

## 附：证据文件清单（相对仓库根）
```
.pw/shots/av3-persona/composite-tod.png        ← tod 并排总图
.pw/shots/av3-persona/composite-bombcat.png    ← bombcat 并排总图
.pw/shots/av3-persona/tod-av3-2d-reference.png / bc-av3-2d-reference.png
.pw/shots/av3-persona/tod-av3-wide.png / tod-av3-reveal.png / tod-av3-reveal-spec.png
.pw/shots/av3-persona/bc-av3-wide.png
.pw/shots/av3-persona/tod-av3-head-{0..5}-{front,oblique}.png
.pw/shots/av3-persona/bc-av3-head-{0..5}-{front,oblique}.png
.pw/persona-av3/tod-materials.json / bc-materials.json   ← 发壳/头球/贴图材质取证
.pw/persona-av3/{contact-sheet,av3-tod,av3-bombcat,composite}.cjs  ← 全部脚本
```
