# 设计方案：手牌贴桌 + 抬牌预览 + 确认出牌（bombcat + uno）

2026-09-24 用户投诉（附两截图）：
1. 卡片需要**紧贴人面前的桌面**，不要飘到别人头上。
2. 点一张卡片时这张**向上移动可看到全部卡片信息**，**确认才打出**。所有卡片游戏都按此改。

范围界定：手牌游戏只有 bombcat（DOM 手牌叠层）与 uno（GL 南位手牌扇）。monopoly 的机会/命运卡本来就是桌面翻牌、tod 选卡双卡平贴毡面——均无手牌，不在本次范围。

## 改前取证（.pw/ev-handontable.cjs，8945）
- bombcat 700×900：#bc-hand 底边距视口底 **431px**（悬在桌上空、视觉上卡在两个对手名牌之间）；#bc-actions 在手牌**上方**；选中卡 translateY(-12px) 且仍被右邻牌**盖住 98px**（等于看不见牌面）。
- uno 真机档：南位 4 张 y≈0.38–0.47（毡面 y=0.20，倾角 0.98rad≈56° 立起），**可出的牌还要再浮高 0.09**；点击即 humanPlay 无确认步骤（probe-uno A4 已证）。

## 方案 A：bombcat（改 .pw/bc-src-a.html + bc-main-3.js，重建）

### A1 手牌贴桌（three3d 模式钉底）
- `body.three3d #screen-game { flex: 1; }`（#app 已是 min-height:100vh 纵向 flex，section 撑满剩余视口）。
- flex order 视觉重排（**两种模式都换**，2D 退路同样受益）：`#bc-actions { order: 1 }`、`#bc-hand { order: 2 }`——按钮排到手牌**下方**（屏幕最底缘），抬起的卡向上飞、永不压按钮。
- `body.three3d #bc-hand { margin-top: auto; }`（推到底）；safe-area 底垫移到 #bc-actions；#bc-hand 底 padding 收窄 6px。
- 视觉语义：手牌行钉在视口底 = 过肩视角下**我方（南侧）桌沿**，正好在本地玩家棋子前方；不再与对面名牌/棋子重叠。
- 2D 退路（无 WebGL）只换 order 不钉底——文档流从上排下来，手牌+按钮仍在内容底部。

### A2 选中抬牌看全脸 + 确认出牌
- `.hcard.sel`：`transform: translateY(-118px)`（卡高 110px，整张越过牌行顶）+ `z-index: 5` + 琥珀描边加亮。多选时全部同抬，z 同 5、按 DOM 序右牌在上（可预期）。
- **z 锁死坑规避**（tod-card-resident-stack）：hover 依旧**不**提 z 不加位移之外的效果（维持 -8px 悬浮）；`.sel` 是点击态不随指针消失，抬升后原露出条空出，邻牌露出条仍可点。选中卡再次点击=取消选中（现有 toggle 不变）。
- 确认=现有「打出选中」按钮（comboShape 校验、无效牌禁用），流程不变：点选→抬牌看全脸→按钮打出。需目标/点名的牌仍走既有弹层。
- renderHand() 短路径不变（innerHTML 全量重绘，抬升纯 CSS 类切换）。

## 方案 B：uno（改 uno.html）

### B1 南位手牌贴桌
- placeHandCards 南位分支：倾角 `-PI/2+0.98` → `-PI/2+0.55`（≈31°，与牌堆 0.42 同语言，读作躺在桌沿）；基础 y：以倾角 sin 补偿半卡长下沉，毡面 0.20 之上贴桌（目标 y≈0.26，**先量 mkCard 卡长再定值，不许穿模**）。
- 删除「可出牌 +0.09 浮高」——改为材质亮度区分（现有 children[1].setScalar 1/0.6 已有，保留），**位置不再分层**。
- z 不动（2.3=本端座位纵深），扇形跨度/上限不动（上轮 ev-cardstack 验收过）。
- **红线**：placeHandCards 常驻短路径、disposeCard、southOwner 语义、faceUp 隐私规则一律不碰。

### B2 点牌抬起预览 + 确认打出
- 新增 `tableSel`（存 cardRef 引用，不存下标——手牌增删下标会漂）。pickHand 点牌：不再直接 humanPlay，改 `tableSel = entry.cardRef`（再点同一张=取消）；placeHandCards 对选中卡 `y += 0.42`（抬到牌行上方、脸朝相机完整可见）+ 材质全亮。
- **确认按钮**：showActions() 追加 `#act-play`（「打出这张」）——`tableSel && canPlay(tableSel)` 才 enabled；点击 → humanPlay(手牌中该 cardRef 的下标) → 万能牌照旧弹选色。非我方回合/AWAIT_ACTION 之外 tableSel 强制清空。
- 不可出的牌也**可选中看牌面**（用户诉求=看全信息），仅按钮禁用+提示「这张现在出不了」。
- 压缩模式（>12 张 #hand-ovl 浮层）：浮层内点击同样改「点选抬牌(.sel CSS 抬升)+浮层内确认按钮打出」，与 3D 同语义。
- 动画：选中/取消直接在 placeHandCards 里落位（现状 iAct 抬升就是瞬落，不加补间——不碰 rAF 循环）。
- 玩家动作镜头红线不碰：不加相机运动。

## 探针与门禁
- `ev-handontable.cjs` 改后跑 `--after` 断言全绿（贴底≤90px、按钮在手牌下方、选中 translateY≤-60 且无遮盖、uno cards() y 值 + 交互流）。
- uno 侧 `__uno.cards()` 每张补 `sel` 布尔（inspect/AUTOTEST 钩子，只读）。
- 回归：check-syntax-bc、probe-bombcat-rules(37)、probe-bombcat-ui(25)、probe-uno、ev-cardstack、check-syntax。probe-bombcat-ui 的点牌→出牌流若因「点选=选中不直接出」而断，按新语义改探针（点牌→点确认按钮）。

## 不做
- bombcat 手牌不做 CSS rotateX 假透视（transform 命中区漂移风险 > 收益）。
- 不动 monopoly/tod（无手牌）。
- 不加相机推拉（uno 镜头随流程轮已定「本端动作镜头稳定」红线）。
