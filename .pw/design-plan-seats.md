# 设计方案：围桌站位全环均匀分布 + 加入自动重排（2026-09-18）

用户点名：「多人一起的时候，围绕桌子平均分布人的站位，同时有人加入时会自动重新分布站位」。

## 现状取证（.pw/probe-seats-observe.cjs，8879，three3d 实测）

1. **3 人局分布不均**：layoutRing 现行「远弧公式」把两个对手放在 a=PI±GAP（±37°，紧挨我两侧），
   桌子远半边整片空着（截图 shots/seats-3p.png）。人数越少越极端：远弧等分弧长 = (2π−2·GAP)/(n−2)，
   n=3 时两张弧端点卡全堆在我身边。5 人局（shots/seats-5p.png）近侧 3 人、远侧 2 人，仍不匀。
2. **中途加入 = 全桌瞬移**：名单结构变化 → renderPlayers → layoutRing 重算角度（这部分已存在），
   但 3D 人物的 u.seat 在 syncPlayers（600ms 节询）里直接覆盖，帧循环 `ch.position.copy(u.seat)`
   单帧生效——采样到 5.14 / 2.19 / 4.01 单位的单帧跳变（瞬移）；新角色 buildChar 后下一帧直接出现在
   座位上，凭空冒出。DOM 卡有 left/top 0.55s CSS 过渡（回退层天然平滑），GL 层没有任何过渡。

## 方案

### A. 全环均匀分布（layoutRing 角度公式，DOM 回退层 + GL 座位角共用）

现行（远弧，GAP 让空我身边扇形）：
```js
if (rel === 0) return Math.PI;
if (n === 2) return 0;
return Math.PI + GAP + ((rel - 1) / (n - 2)) * ARC;
```
改为（全环 n 等分，我是圆上一点）：
```js
return Math.PI + rel * (Math.PI * 2 / n);   // rel=0 即我（a=PI）；n=2 时 rel=1 → a≡0，与现行特例一致
```
- GAP/ARC/远弧概念退役；**LADDER 侧纵列阶梯保留**（侧座判定 |sinθ|≥0.8 对新角度照常工作）。
- n=2 行为逐字节不变（对手 a≡0，front=−1，rs 差 0.21 ≥ test-3d 的 0.15 锁）。
- 我仍锚 a=PI（第三人称过肩），me +0.05 rs、zIndex 按 front、牌堆 8% 环高偏近侧全部不动。
- 16 人满员：相邻座位角距 22.5°，3D 圆周间距 1.06 单位（人物宽 ~0.6，不重叠）；DOM 回退层
  最近座 x=50±17.6%，不压 #tp-back 背影（±~14%）也不压 me 卡。

### B. GL 座位滑移（three3d 人物换座不瞬移 + 新人走入）

1. `buildChar` 的 userData 增 `moveFrom: Vector3 / rotFrom: 0 / moveT0: 0 / seatInit: false`。
2. `syncPlayers(now)` 写座位处增检测：
   - 首次（seatInit=false，含新角色）：座位数据照写；非 REDUCED 时出生点 =
     座位方向外推到 r=SEAT_R+1.15（从桌缘外走入），记 moveFrom=出生点、moveT0=now，
     帧循环滑移链自然把它滑进座位（GL 版「入座动画」，等价 DOM chr-in）。
   - 已有角色座位变化（重排）：moveFrom=ch.position 当前值、rotFrom=ch.rotation.y、moveT0=now。
   - REDUCED：全跳过，出生即落位。
3. 帧循环非走位分支（u.go≤0.001）：0.7s 墙钟 smoothstep 从 moveFrom 滑向 u.seat，
   rotY 同步最短路补间；滑移中置 walking=true（事件驱动阴影跟随）。**走位分支（去牌堆）零改动**
   ——WALK_R/LEAN_MAX 防穿模联算、摸牌时序完全不动；走位中途恰逢重排的极小概率竞态接受
   （go 收敛后下一帧滑移接管，moveFrom 取的是当时实际位置，不会跳）。
4. 名牌投影/turnRing/蛋投掷都读 ch.position——自动跟随滑移，无需改动。

### C. 文档

SPEC §2「第三人称牌桌」② 公式改全环均匀并补滑移说明；wiki/design/third-person-table.md 同步一行。

## 验收

- 断言版探针 probe-seats-redistribute.cjs：①3p 对手角 = PI±2π/3（±1e-3）；②中途加入 2 人，
  120ms 采样断言任意单帧位移 < 0.5 单位、2s 内全员收敛到新座位（距 seat < 0.05）；③新角色
  出生 r > SEAT_R 且滑入；④REDUCED 出生直接落位。
- 回归门禁：check-syntax、test-3d、probe-3p-verify 三视口、probe-3d-feel、probe-persona-full。

## 已知取舍

- n 大时（≥9）rel=1 座位进入我身边 ±40°（真实圆桌本来就该有人坐我旁边）；v6 的 GAP 是
  「远弧等分」公式下的配套产物，全环等分下最近座天然离我 2π/n ≥ 22.5°，不会有人坐在「我身上」。
- Cam.nudge 用的仍是 DOM 卡 rect（three3d 下 DOM 环与 GL 环 x 镜像是既状，nudge 位移 ≤46px 纯装饰）。
