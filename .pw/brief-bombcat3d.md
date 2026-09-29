# 设计简报：bombcat 手牌 3D 化（3D 可替代 2D 就不要 2D，全端适配）

用户点名：「如果3d卡片可以替代2d卡片就不需要2d的卡片，适配手机端和平板和pc端，所有游戏都是一样」。

## 现状审计（为什么只动 bombcat）

- **tod**（tod.html）：选卡双卡/题面卡已是 GL 毡面卡 + 揭晓近景，DOM 选卡 opacity 0.001 仅作 E2E 盒子。✅ 已合规
- **UNO**（uno.html）：2026-09-24 深夜已完成「3D 手牌全端化」——南位常驻扇形 + 抬牌 kSelScale 看全脸 + 竖屏 camApply（半宽 2.4/lookAt z+0.6）+ 点空白收下 + 点牌库摸牌；DOM 浮层仅 GL-off 退路。✅ 已合规
- **monopoly**（monopoly.html）：无手牌；机会/命运本就是桌面翻牌；买地弹窗是 UI 非卡牌。✅ 不适用
- **bombcat**（bombcat.html）：GL 场景已有（桌/牌堆/弃牌堆/人物/吊灯/演出），**但手牌是 DOM `.hcard` 贴底行（78px 堆叠）+ `#bc-peek` DOM 放大窗**。❌ 本轮唯一主战场

## 设计（全部改动限于 bombcat.html 单文件；bombcat.html 是事实源，构建管线已死禁跑 build-bombcat.cjs）

### 1. GL 模式退役 DOM 手牌与放大窗
- CSS：`body.three3d #bc-hand, body.three3d #bc-peek { display:none !important }`；`body.three3d #bc-actions { margin-top:auto }`（手牌行隐藏后按钮排仍钉视口底）；`body.three3d #react-dock` bottom 从 192px 降到 ~88px（只剩按钮行 ~56px）。
- DOM 手牌/peek 完整保留为 GL-off（无 WebGL/loperf）退路——与 UNO 同规。

### 2. 3D 手牌扇（initScene 内新增）
- **卡网格**：复用既有 `mkCard(texForCard(kind), true)` BoxGeometry（CARD_W=0.62 × CARD_T × CARD_L=0.9，顶面 =y 是牌面），躺桌 rotation.x = -PI/2 + 倾角。
- **贴桌几何红线**（倾角 θ 的牌下缘沉 (卡长/2)·sinθ，y 必须 ≥ 毡面+下沉量+余隙，否则切进桌面）：
  - restY = FELT_Y + (CARD_L/2)·fanScale·sin(0.42) + 0.015
  - 扇心 z ≈ +1.30（南位桌沿，我方座位 SEAT_R=2.71 与牌堆 z=-0.72 之间）；每张 y 再 +0.003·k 防共面重叠 z-fight
  - step = min(0.40, 2.2/max(1,n-1))；fanScale = min(1, 6/n)（bombcat 卡 0.62 比 UNO 0.52 宽，阈值相应收紧）
- **抬牌=看全脸**（替代 #bc-peek 职责，§1.5e/f 既有语义）：选中卡 kSelScale = max(fanScale, innerWidth<700 ? 1.7 : 1.25) 替换式缩放（不叠乘），riseY = rest 顶 + (CARD_L/2)·kSelScale·sin(0.98)，倾角 0.98 朝镜头；多选错层 = 第 sn 张（选择顺序）额外 riseY + sn·0.09，组合牌互不遮脸（对齐 DOM 版 --sn 语义）。
- **重建纪律**：手牌 id 序列签名比对——没变只重摆（短路径，不重建网格不重栅纹理）；变了才 dispose+重建（onPrivMsg 手牌真变已 sel.clear()）。

### 3. 交互（对齐 §1.5f「点牌查看/点空白收下」全游戏统一语义）
- document 级 click（仅 GL）：目标在排除表（button/.ovl/#bc-actions/#bc-nope/#react-dock/a/input/select/textarea/label/summary/#lnk-arcade/#bc-top）则忽略；否则 raycast（含 camera.updateMatrixWorld + 逐组 updateMatrixWorld(true) 硬化，后台页 rAF 冻结坑）：
  - 命中手牌卡 → 翻转 sel 中该下标（多选 anytime 可选，与 DOM 版一致；打出可行性只由 updatePlayButton 把关）；tap 音；重摆。
  - 命中牌库堆 → 等价 #btn-draw 点击（对齐 UNO 点牌库摸牌；守卫在按钮 disabled）。
  - 落空 → sel 非空则全收下（点空白处收下）+ tap + 重摆 + updatePlayButton。
- `sel`（Set<下标>）仍是唯一选中事实源，GL 层只读写它；#btn-play「打出选中」确认流零改动。

### 4. 全端机位 camApply（替换写死 CAM_BASE）
- 横屏/PC：现机位 (0,3.55,6.35)/target(0,0.85,0) 逐字节不动。
- 竖屏 aspect<0.9：拉远升高（候选 pos(0,4.15,8.4)/target(0,0.62,0.28)），保证整桌+南位扇入画、抬牌不压按钮行；常数值以探针多视口截图定稿（375×667 / 390×844 / 740×360 横 / 768×1024 / 1280×800）。
- 视差/shake 叠加在 camApply 输出之上，零改动。

### 5. E2E/调试钩子（`__cat` 扩展，对齐 UNO cardScreenPos 范式）
- `hand3d()`：每卡 {i, kind, x,y,z, sel}；`handScreenPos(i)`：真相机投影像素（page.mouse.click 真输入路径）；`deckScreenPos()`；`forceRender()`；`debugSetHand(ids)`（host 端确定性摆手牌，取证用）。

### 6. REDUCED / loperf 退路
- REDUCED：位置直写无过渡（本就无 tween），抬牌即静态终态。
- loperf 翻转 → retireScene()：摘 three3d 后**必须补 renderHand()** 让 DOM 手牌复活（现在 retire 后 DOM 手牌是 stale 隐藏态）；retire 单向不回流（同 tod）。

### 7. 非目标（备案）
- 手牌不做显示排序（索引直映 PRIV.hand，acts idxs 协议不动；UNO 的 handLess 不搬）。
- 对手手牌不进 3D（隐私同规，名牌计数已够）。
- monopoly/tod/uno 零改动。

## 你要挑的刺
按你的专长找**本设计**的错（玩家价值漏洞 / 几何与工程红线），不要翻旧账挑与本案无关的既有问题。输出格式：每条 `[P0|P1|P2] 标题：问题 → 建议修法`，最后给一行结论 `SHIP` 或 `SHIP WITH FIXES`（附必须修清单）或 `NEEDS WORK`。
