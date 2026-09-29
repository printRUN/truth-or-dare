# 评审简报:UNO 手牌常驻 + 全游戏卡牌堆叠不滚动(2026-09-24)

## 用户原话(需求)
1. 「uno的纸牌3d显示有问题,将卡片显示作为常驻。」
2. 「所有游戏如果纸牌过多不作滚动,堆叠起来,漏出卡片图标在角落即可,同时如果还是过多超过屏幕宽度再换行。」

## 取证结论(探针 .pw/ev-cardstack.cjs,端口 8943,截图 .pw/shots/ev-cards-*.png)
- **P0 泄漏**:uno.html `layoutHand`(L801-840)南位固定给「当前玩家」且暗牌非 HANDOFF 相位即 faceUp——联机暗牌下,**对手设备上当前玩家的手牌明摊在南位**(截图 ev-cards-uno-net-notmyturn.png 可读出房东手牌)。热座语义泄漏进联机。
- **不常驻**:联机下自己的手牌在自己设备上,非本端回合时是远处一摞背面(不可见),要等自己回合才能在南位看到。
- **扇形过挤**:15 张时 step=0.0786/卡宽0.52,数字互相叠压;maxAngle 上限 140° 使边缘牌倾斜 ±50° 近乎横躺(截图 ev-cards-uno-3d-fan15.png)。
- **滚动现状**:uno `#hand-strip`(L84-92,scroll-snap+overflow-x:auto)15 张时 scrollWidth 1108>clientWidth 1032;bombcat `#bc-hand`(L122,overflow-x:auto)窄屏必滚动。

## 实施方案(待挑刺)

### A. UNO 手牌常驻(uno.html)
1. 新增 `southOwner()` = `NETMODE ? netSeatOf(myId) : G.turn`(入座守卫:联机未入座时退回 G.turn)。
2. `seatPos(i)`:南位判 `i === southOwner()`(原 `i === G.turn`),其余按相对 southOwner 的弧线均分——联机时对手坐在对面,自己永远南位。
3. `layoutHand(pi)`:
   - `isSouth = pi === southOwner()`;
   - faceUp:`isSouth && NETMODE` → **恒 true**(自己设备看自己的牌,暗牌也看);热座走原逻辑(bot 不公开、暗牌 HANDOFF 翻背、明牌全开);非南位 faceUp = 明牌(联机暗牌恒背)→ **堵泄漏**;
   - playable 高亮条件改为「南位牌主是本端行动者」:`isSouth && pi===G.turn && G.phase==='AWAIT_ACTION' && (NETMODE ? netIsMyTurn() : !p.bot)`(原 `isSouth && pi===G.turn && …`,热座等价);
4. `pickHand`(L1543):`const si = NETMODE ? netSeatOf(myId) : G.turn`,守卫/`mine` 过滤/压缩模式全用 `si`(原 G.turn);netIsMyTurn 守卫保留。
5. `flyToPile`(L1354):`const south = pi === southOwner()`(原 `pi === G.turn`);快照补演路径 flyToPile(pi, seatPos(pi)) 自动正确。
6. `openHandOverlay` 改用 si(联机语义一致;按钮本就只在自己回合出现)。
7. 扇形可读性:`step` 上限不动(0.15),跨度上限 1.1→1.5(`Math.max(0.07, 1.5/Math.max(1,n-1))`);`maxAngle` 上限 140°→56°(边缘 ±28°)。压缩模式点击阈值(>12 张开浮层)不变。

### B. 卡牌堆叠不滚动(uno.html #hand-strip + bombcat.html #bc-hand)
1. 两容器:`flex-wrap:wrap` + `row-gap`,**删 overflow-x:auto / scroll-snap**(uno L86,bombcat L122);`justify-content:center`。
2. 堆叠:`.hcard + .hcard { margin-left:-38px }`(uno 卡宽64→露26px角标; bombcat 卡宽78→`margin-left:-48px` 露30px)。**不滚**:任何数量先堆一排,排宽超容器才换行(flex wrap 原生语义,负 margin 计入 flex 假想主尺寸)。
3. **角标**:两游戏 .hcard 内加 `<i class="cidx">` 左上角图标(uno=牌面符号/万能★;bombcat=`CAT.DEFS[kind].i` emoji),堆叠露出 26-30px 恰好露出角标 → 满足「漏出卡片图标在角落」。
4. hover/选中(z-index 提升防止被右侧牌压住):`.hcard:hover,.hcard.sel{z-index:5}`(uno hover 现有上浮 CSS 不动;bombcat 既有 translateY 动效在 REDUCED 块已有静态退路 L214)。
5. 兼容:uno 压缩模式(>12 张点 3D 牌开浮层)保留,浮层从「滚动条」变「堆叠+换行」;bombcat 选牌点击逻辑不变(可见角标条即可点)。

## 边界与红线(评审必须覆盖)
- 热座暗牌隐私不得回退:HANDOFF 相位南位翻背、bot 永不公开、交接闸行为不变。
- 联机 2 人局 seatPos:southOwner=自己,对手应在正对面(z 负半轴),不得重叠/穿模。
- 快照补演(applyGameSnapshot L476-479)「手牌变短者=出牌者」在常驻方案下仍成立。
- 存量门禁:probe-uno(8909,21断言)/probe-uno-net(8913,8)/probe-persona-uno(29)/probe-arcade(35)/probe-bombcat-ui(8933,37)/probe-bombcat-rules(25)/check-syntax(三文件 sha+10 块)/ev-uno-verify。凡断言钉住「南位=当前玩家」「滚动条存在」的要同步改;**persona 探针是回归锁,改动不得红**。
- SPEC.md §1.7/§1.8 需补记本轮语义(南位=本端手牌常驻)。
- 行尾:uno/monopoly/index 已统一 LF,编辑不得引入 CRLF。
- 新 CSS 动效需 REDUCED + body.loperf 静态退路(本轮新增均为布局,hover z-index 非动效)。
