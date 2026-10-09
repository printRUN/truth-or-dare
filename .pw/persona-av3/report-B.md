# report-B · 真实玩家模拟员 B（monopoly.html + uno.html）— 头像特征强相似轮走查

brief-av3-sim · 2026-10-08 · 分支 feat/3d-avatars · 端口 9143
任务：把多个玩家设成特征鲜明的 2D 头像（DiceBear），实跑联机对局，截 3D 头近景 vs 2D 头像并排图，逐头像打「一眼同一人」分并挑刺。

## 走查方法（可复现）

- 脚本（均在 `.pw/persona-av3/`，未改任何仓库现有文件）：
  - `candidates.cjs` — 用 dicebear-local.js 渲染 10 画风 ×12 seed 的候选 contact sheet（`.pw/shots/av3-persona/sheet-*.png`），人工选头像。
  - `sim-B-mono.cjs` — `monopoly.html?autotest=1&net=1&localnet=1&room=91431`：host+3 join 共 4 真人（同 context 每页 `addInitScript` 写自己的 `localStorage['mono:avatar']`，走 `NDOC.players[i].av` → `P.avatarUri` 全链路，即 `.pw/ev-avatars-mono.cjs` 同款注入）。开局后 `forcePos` 摊开，idle 环绕全景 + 页面全局 `camTo()` 推近逐棋子拍近景。
  - `sim-B-uno.cjs` — `uno.html?autotest=1&net=1&localnet=1&room=91432`：host（南位）+3 join。每张截图前 `__uno.forceRender()`（brief 纪律）。uno 的 `camApply` 相机位置从**原点**出发（与 tgt 无关），近景需反解 az/elev/focusK 把相机放到 bust 正南；北弧正中座位还得抬高 0.62 越过座位铭牌（否则被「7 张」牌遮死，详见脚本注释）。
  - `diag-hair.cjs` — 复刻 `hairFromImage` 16×16 采样管线做归因诊断。
  - `compose-B.cjs` — 生成 2D vs 3D 并排图。
- 元数据：`mono-meta.json` / `uno-meta.json`（每玩家的 av 配方、2D dataURL、3D hair 值、世界/屏幕坐标）。
- 两局均零 pageerror；`bodyLo` 未触发（monopoly 靠 boot 后立即哑化 `setBodyLo` 保连续渲染）。

## 选用的头像（覆盖 brief 要求的特征矩阵）

| 代号 | 玩家名 | 配方 | 2D 特征 |
|---|---|---|---|
| AV1 | 阿凯 | `dcb:{"s":"micah","d":"b10","b":"fde68a"}` | 深棕肤 · 金棕长发 · 方框眼镜 |
| AV2 | 老周 | `dcb:{"s":"miniavs","d":"b11","b":"ddd6fe"}` | 深棕肤 · 短黑发 · 髭+山羊胡 |
| AV3 | 小丸 | `dcb:{"s":"adventurer","d":"b11","b":"bbf7d0"}` | 浅肤 · 金发双丸子头 |
| AV4 | 蓝仔 | `dcb:{"s":"dylan","d":"b10","b":"bfdbfe"}` | 浅肤 · 蓝刺头 · 胡渣 |
| AV5 | 粉毛 | `dcb:{"s":"avataaars","d":"b07","b":"fbcfe8"}` | 浅肤 · 粉色长发 |
| AV6 | 光头 | `dcb:{"s":"avataaars","d":"b05","b":"fed7aa"}` | 浅肤 · 秃头 |

monopoly 上 AV1–AV4（座位 0–3），uno 上 AV1=host（南位，3D 不建自己 bust，仅 HUD）+ AV5/AV3/AV6 为对手 bust；AV3 两游戏同头像，可跨游戏对比。

---

## 一、monopoly.html（几何处头，buildAvatarHead ~:1549）

### 证据（相对仓库根）

| 玩家 | 并排图（2D 左 / 3D 右） | 3D 原始近景 |
|---|---|---|
| 阿凯 AV1 | `.pw/shots/av3-persona/b-sbs-mono-0.png` | `.pw/shots/av3-persona/b-mono-face-0.png` |
| 老周 AV2 | `.pw/shots/av3-persona/b-sbs-mono-1.png` | `.pw/shots/av3-persona/b-mono-face-1.png` |
| 小丸 AV3 | `.pw/shots/av3-persona/b-sbs-mono-2.png` | `.pw/shots/av3-persona/b-mono-face-2.png` |
| 蓝仔 AV4 | `.pw/shots/av3-persona/b-sbs-mono-3.png` | `.pw/shots/av3-persona/b-mono-face-3.png` |
| 四人同框（决定性证据） | `.pw/shots/av3-persona/b-mono-pair-01.png`（前 2 大 + 后 2 小，一帧内 4 颗头完全同款） | `.pw/shots/av3-persona/b-mono-pair-23.png` |
| 玩法实感全景 | `.pw/shots/av3-persona/b-mono-overview.png` | — |

注：近景是取证用推近镜头（页面全局 `camTo`，dist 0.72 平视头部），非玩法机位；玩法机位下的真实观感看 overview/pair——全景里 4 颗头已经能看出「同一张脸、同一个黑盔头」。

### 打分（「一眼同一人」1–5 分）

| 玩家 | 2D 显著特征 | 3D 实况 | 分 |
|---|---|---|---|
| 阿凯 AV1 | 深肤/长发/眼镜 | 浅紫灰肤 + 黑色波波头 + 无眼镜，与全桌相同 | **1** |
| 老周 AV2 | 深肤/胡子 | 同上，无胡子 | **1** |
| 小丸 AV3 | 丸子头/浅肤 | 同上，双丸子变黑盔头 | **1** |
| 蓝仔 AV4 | 蓝发/胡渣 | 同上，蓝发变黑盔头 | **1** |

四个人全部 1 分：桌面唯一能区分「谁是谁」的是棋子锥身颜色（玩家座色），与头像完全无关。**没有任何一颗 3D 头能被认出是 2D 那个人。**

### 缺失/走样特征（按视觉显著度排序）

1. **发色提取链路整体失效 → 全员纯黑发（P0，功能性 bug）**：`faces().hair` 四人全部 `#000000`。`diag-hair.cjs` 归因：dicebear-local 生成的 SVG 根元素只有 viewBox、**没有 width/height**，Chromium 下 `drawImage(svgImg, …, 16, 16)` 光栅化结果全透明 → `hairFromImage` 采样 0 像素 → 均值除 0 → NaN Color → `getHex()` 的 NaN<<16 = 0 → `'#000000'`，且 `if (hair)` 判真不回退 fb。即：**头像→3D 的唯一既有通道（发色）在真实运行时是断的**，10 个画风全部命中（6 个受测配方 + 10 画风抽查）。注意 ev 轮探针断言 `/^#[0-9a-f]{6}$/` 恰好放行 `#000000`，所以此前没被发现。
2. **肤色固定 0xe9bb90 且被场景光漂白（P0）**：2D 里阿凯/老周是深棕肤，3D 是所有人共享的浅肤，又叠加 ACES tone mapping + 紫色氛围光，实际观感是「灰紫白」。肤色是人脸第一识别特征，缺席感最强。
3. **发型轮廓唯一（P0/P1）**：顶盖+后脑壳的「波波头」是唯一发型。长发/丸子/刺头全被拉平；AV6 秃头在 uno 里也顶着同款黑盔（最违和的单点）。发型壳还把耳朵基本盖死。
4. **眼镜缺失（P1）**：阿凯的粗框眼镜是 2D 第一眼特征，3D 无任何承载。
5. **胡子缺失（P1）**：老周髭+山羊胡、蓝仔胡渣，3D 均无。
6. **五官/表情无个性（P2）**：大眼珠+圆微笑是全员统一五官；dylan 的点眼/咪咪眼、avataaars 的圆瞪眼等画风差异全被抹平。眉毛是 hairMat 色的小方条——发色坏掉时眉毛也跟着全黑。

### 其他视觉问题（走查顺带发现）

- 近景（camTo 推近）下「行动者光环」大绿环穿模入画（b-mono-face-0 顶部），玩法机位无此问题。
- 眉毛位置在发际线上方、与头发之间露一条额头，近景看像「眉毛长在头罩上」（b-mono-face-2/3 明显）。
- 46° 玩法俯角下眼白球外凸、双瞳孔平行前置，读作「瞪眼僵直」；头身比约 1:2.5，头大身小，近景更像吉祥物不像「人」。
- 名牌 Sprite（名字+2D 头像）反而是当前唯一 carry 真头像的地方——近景里它比 3D 头更像「本人」，形成自相矛盾的观感。

---

## 二、uno.html（几何半身像，buildAvatarHead ~:1323，与 monopoly 同族实现）

### 证据（相对仓库根）

| 玩家 | 并排图（2D 左 / 3D 右） | 3D 原始近景 |
|---|---|---|
| 粉毛 AV5 | `.pw/shots/av3-persona/b-sbs-uno-1.png` | `.pw/shots/av3-persona/b-uno-face-1.png` |
| 小丸 AV3 | `.pw/shots/av3-persona/b-sbs-uno-2.png` | `.pw/shots/av3-persona/b-uno-face-2.png` |
| 光头 AV6 | `.pw/shots/av3-persona/b-sbs-uno-3.png` | `.pw/shots/av3-persona/b-uno-face-3.png` |
| 玩法实感全景 | `.pw/shots/av3-persona/b-uno-overview.png` | — |

### 打分（「一眼同一人」1–5 分）

| 玩家 | 2D 显著特征 | 3D 实况 | 分 |
|---|---|---|---|
| 粉毛 AV5 | 粉色长发 | 黑盔头+浅紫灰肤，与 monopoly 同款头 | **1** |
| 小丸 AV3 | 金发双丸子 | 同款黑盔头（与 monopoly 完全同模，跨游戏「统一NPC」） | **1** |
| 光头 AV6 | 秃头 | 2D 是光头，3D 反而顶着全桌最大的黑盔头——最刺眼的反向走样 | **1** |

全 1 分。半身像的头与 monopoly 逐字节同族（同 skin 常量、同发型几何、同 NaN 黑发），等于两个游戏共享一个「默认NPC脸」。

### 缺失/走样特征（按视觉显著度排序）

1. **同 monopoly P0 全套**：黑发（NaN 链路）、固定浅肤色、唯一发型壳、无眼镜/胡子——uno 的头与 monopoly 同源，不做重复计条。
2. **秃头反例（uno 特有显眼项）**：AV6 证明发型壳是「无条件加盖」——2D 没有头发时 3D 照样给一大顶，负分项。
3. **高角度五官悬浮感（uno 特有）**：固定南侧相机 elev 46°，眼球陷进眼窝但瞳孔贴在球面外侧，俯视下双眼像「浮在脸上的两颗珠子」；微笑弧被头壳投影吃掉半截。
4. **肩部造型**：横放椭球肩+锥身，正面近景读作「甜甜圈底座」，与「半身像」人形预期有距离（次要）。
5. **南位自己没有 3D 形象**（设计如此），自己的头像只活在 HUD 小圆片里——avatar 存在感再打折。

### 其他视觉问题（走查顺带发现）

- 近景取证机位下座位铭牌巨大、会遮头（我方抬高 0.62 才绕过）；玩法机位无此问题。
- 玩法全景中 bust 头高约 45px（1280×800）：即使发色修好，眼镜/胡子这类小特征在真实玩法相机下也读不出——**「一眼同一人」在 uno 主要靠 肤色/发色/发型轮廓 三个远读特征**。
- monopoly 全景棋子头高约 28px，结论同上且更严苛。

---

## 三、「3D 头要补哪些特征才能一眼同一人」优先级清单

1. **P0 · 先救活发色提取**（两游戏同一修复）：dicebear-local SVG 无 width/height → `drawImage` 全透明。修法任选：注入 `width/height` 属性再走 Image、或 `Image` 加载后按 viewBox 尺寸画布重绘、或改用 `Blob URL`+`decode()`；同时给 `hairFromImage` 加「空采样→回退 fb」守卫（现在 NaN 会伪装成 `#000000` 成功态），并把明度钳制 `L 0.26–0.38` 放宽——粉发/金发现在会被压成深褐。
2. **P0 · 肤色参数化**：从 2D 头像下半区采样肤色主色 → `skin.material.color`（monopoly/uno 同一个常量 `0xe9bb90` 改成按 palette 注入，与 hairMat 同管道）。这是辨识度最高、实现最便宜的一项；顺带把材质色调校正（ACES+紫光漂白）兜住，避免深肤采样后又被灯光洗白。
3. **P1 · 发型轮廓 3–4 档**：短壳（现状）/长发垂背/丸子/秃（无壳，眉色保留）。用 2D 上半区发色像素的垂直分布+风格名启发式选档即可，不求精确复刻。
4. **P1 · 眼镜**：一个通用框形（圆/方）+镜腿，2D 检出镜片像素即挂载，材质深灰半透。
5. **P1 · 胡子**：髭+下巴两片几何，吃 hairMat 色（眉同理）。
6. **P2 · 眼型/眉/嘴微参数**：dylan 式点眼、眉粗细、嘴弧度，从 2D 五官占比粗估。
7. **P2 · 玩法相机可读性**：monopoly 头 28px / uno 45px 的现实下，优先保证 肤色/发色/发型 三项远读可辨；小特征交给「近景/揭示时刻」或名牌，避免为小特征堆细节。

## 结论

monopoly 与 uno 的 3D 头目前是「同一张默认脸 + 一个坏掉的黑发色」：6 个特征鲜明的 2D 头像（深/浅肤、长发/丸子/秃、眼镜、胡子、粉/蓝发）过完管线后只剩**棋子座色**能区分玩家，全部 1 分。根因有两层：①发色提取链路在真实运行时直接产出 `#000000`（SVG 尺寸缺失 → 空采样 → NaN），唯一既有通道是断的；②头几何根本不消费肤色/发型/眼镜/胡子。要达到「一眼同一人」，按上面 P0→P1 顺序补：先修发色管线，再把肤色和发型轮廓带进几何头，眼镜/胡子随后。
