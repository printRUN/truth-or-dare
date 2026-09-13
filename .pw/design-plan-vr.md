# 设计方案 v4 —— VR 扫视换场（W9，替代立方体转面）

> 用户反馈（原话）：「我想要的不是硬切，而是像 VR 世界一样通过人脸去扫过去看到这个场景；
> 如果是加载状态，一定要等加载完成之后再扫过去；加载没完成，背景就已经出现了加载后的场景不行；
> 要有 VR 世界左右看另一个场景的感觉。」
>
> 即三条硬需求：
> ① 换场 = 镜头（视线）连续扫视，不是面板翻转硬切；
> ② 扫视中途能看到「两个场景之间的空间」（左右看另一个场景的全景感）；
> ③ 加载严格门控：加载完成前新场景绝不入画，扫视只在加载完成后开始。

## 方案：全景滑动 + 偏头一瞥（panorama slide + glance yaw）

### 几何（为什么这样能同时满足三条）

- 两个场景在换场期间是**并排的两个房间**：出屏 A 从 0 滑向 `-S`（行进方向的反侧退场），
  入屏 B 从 `+S` 滑到 0（从行进方向侧入场），S = max(视口宽, 900) + 140px。
- **中段有真实空隙**：k=50% 时 A 右缘 ≈ -0.5S+W、B 左缘 ≈ +0.5S，中间露出 ~140px+ 的背景星空
  ——这就是「VR 里左右看，两个场景之间还有空间」的全景感。
- **加载门控几何**：B 在动画 from 帧（delay 期，fill backwards）就在 `+S` —— **完全在视口外**，
  加载层还盖着时新场景连一个像素都不在画里；出屏 A 静止在原位（from 帧 = none）供揭幕展示。
- **「人脸扫过去」**：Cam 在同一条 640ms 时间轴上给世界层一个**钟形偏航**（ry 0 → ∓6° → 0，
  行进方向偏头一瞥再回正）——面板在滑动中带有透视侧角，读作「转头扫过去」而不是「抽屉平移」。
- **终态零残差**：B 的 100% 关键帧 = `translateX(0) rotateY(0)` = 单位阵，类摘除是视觉 no-op
  （继承立方体方案的「常态 transform:none」红线）；A 被类清理移除。没有铰链、没有背板需求
  （cube 的 plate-in/out 与 --tx-a 铰链公式全部退役）。

### 时序（加载门控）

- **无加载层路径**（lobby→game 等常规换屏）：renderScreen 同拍挂两面动画 + Cam 偏航，640ms 完成。
- **有加载层路径**（join→lobby，用户点名的场景）：renderScreen 只把 `.active` 切给 B 并攒下
  `pendingSceneEnter`；`hideLoading()` 揭幕（260ms）——**揭幕期间 A 静止在画面中央独处**（from 帧），
  B 在视口外；两面动画 `animationDelay: 280ms`（> 揭幕 260ms），Cam 偏航定时器同样 280ms 起——
  **幕布完全落下后才开始扫**。「加载没完成就露出新场景」在几何上不可能（B 在 +S 视口外）。
- 清理定时器 _txT/_txL 调到 1100/1000（覆盖 280+640）。

### 相机

- `Cam.enter` 重写为扫视段：`to({ry: ∓6°}, 320, 'out')` → `to(b, 320, 'dolly')`，与滑动同起点同终止；
  低端机 Cam.to 自动把 ry 拍平（现有行为）；REDUCED 仍瞬跳。
- 方向：前进（join→lobby→game→result，SCENE_ORDER 最短路不变）A 向左出 B 从右入、偏航 -6°；
  回退（tx-back）整体镜像。

### 降级

- LOPERF：两面仍走 `scene-in-lite/out-lite` 纯淡切；Cam 偏航被 Cam.to 拍平（自动）。
- REDUCED：现状不变（不挂动画类、Cam.jump）。

### 退役

- cube 的 `scene-in/out` 铰链关键帧、`--tx-a`、`plate-in/out` 背板及其基态 opacity 规则、
  armCube 的半径测量（换成 armPan 量滑动距离）。probe-cube 的刚体判据随之被 probe-pan 取代
  （刚体 θ 差判据对「镜头扫视」不再适用——现在动的是镜头，不是两面）。

## 新判据（probe-pan.cjs，取代 probe-cube 成为这门换场的回归门）

1. **加载门控**：揭幕期间（overlay .hide 后 ~150ms）采样——Cam ry === 0（未起扫）、B 的投影矩形
   完全在视口外（left ≥ vw）、A 在原位（transform none 或 from 帧）。
2. **扫视连续**：非加载换屏前 8 帧 translateX 单调推进、无跳变（Δ < 40px/帧）。
3. **全景空隙**：k≈50% 时 A 右缘 < B 左缘（中间漏背景 ≥ 40px）。
4. **偏航钟形**：世界层 ry 在扫视中段 |ry| ∈ (2°, 10°]、起止 |ry| < 0.5°。
5. **终态无残差**：落位后 B transform none、无 entering/leaving、Cam ry ≈ b.ry、A 已摘。
6. **镜像**：tx-back 方向滑动/偏航反号。

---

## v4.1 定稿（视觉+工程两位挑刺专家 merged 修订）

1. **恒亮房间墙（必改，需求②的落点）**：屏本身没有背景——没有墙，「之间的空间」读不出来。plate 不退役，改恒亮：entering/leaving 期间 ::before opacity 0.92 恒定（深色渐变+1px 描边），entering 的墙 82%→100% 溶解归零（防落位暗板闪现，基态仍 0）；A 随 pan-out 整体淡出无需自溶。不做随转角明暗（扫视中面板近正视，恒亮才对）。
2. **缝侧边缘光**：::before 加朝缝一侧 inset 光晕（--pan-dir 定向，紫 primary 0.45，14px blur），静态值零合成成本。
3. **滑动 = 恒速三段键帧（C1 连续）**：缓入 22% → 线性 → 缓出，缝在屏时间 ~54%；时长 640ms 不变。
4. **S 纯 CSS**：`--pan-s: calc(var(--lvw, 100vw) + 280px)`（缝 280px；去 900 下限——否则手机全程无两房同框；--lvw 兜 landforce 逻辑宽红线）。`--pan-dir` 挂 `.tx-back`（类名保留）。
5. **相机 = camGlance 双 dolly 段**：`to({ry:(b.ry||0) − G·ahead, x:−10·ahead}, 320, 'dolly')` → `to(b,320,'dolly')`；G=7° 桌面 / 5° 窄屏(<760||landui)；两段都 dolly（out 起步斜率 3 会抽搐）。**Cam.to 加第 5 参 delay**（rAF 时钟 k 钳 0），武装点在 playSceneEnter 与面板动画同拍同 delay——严禁留在 renderScreen 同步路径（加载路径下会在层后跑完）。
6. **三态守卫**：REDUCED：playSceneEnter 早退已豁免；LOWPERF：camGlance 直通 `to(b,540,'dolly')`（LOPERF 下 to({ry}) 会乘 0.4 造成 z 呼吸——真 bug）；narrow 不再归零（旋转无出界风险）。
7. **关键帧终态**：pan-in 终帧写字面 `transform:none`（摘类窗口 computed 即 none）；pan-in 不写任何 opacity（门控纯几何：from 在 +S 视口外）；pan-out from 显式 opacity:1（揭幕间隙生命线）→ to 0（=基态，回落无闪）。
8. **SFX**：whoosh 挪到起扫拍点（armPan 同点，加载路径即 280ms 处）。
9. **探针**：probe-pan 六判据按修订阈值（ry 相对基线、Δ 相对 S、缝恒定 35%/65% 采样、窄屏同框判据、摘类后采终态）；probe-one-take 判据1 改 280+投影矩形、判据2 删；test-3d:138 worldT 断言改 waitForFunction；probe-scene z 叙事改写。
10. **landforce**：扫视读作纵滑（对称性不丢），SPEC 写明；S 走 --lvw 已兜住。
