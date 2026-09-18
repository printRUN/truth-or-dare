# 设计方案 v3 定稿 ——「一镜到底」3D 体验升级（真心话大冒险）

> 三位挑刺专家（视觉/动效、工程红线、玩家价值/业务逻辑）评审后的定稿。
> 评审记录见会话；本文件是实施的唯一依据。

## 裁决摘要
- **砍 W2（FLIP morph 整包）**：几何上与 640ms 立方体转身冲突（转身期间目标 rect 是坍缩投影）、
  join→lobby 恰是名单 innerHTML 重建高发时刻（克隆中途飞错）、landforce 坐标系陷阱、玩家派对场景无感。
- **W6 砍半**：只做窄屏加入页横滚头像带 + 大厅横幅折叠；1440 主持控制台推迟下一轮。
- **收编 W8 微增强**：视差 ±1.6°、加载卡 ≥1280 放大、loading overlay 去除既有 blur 违规。

## 五条玩家价值红线（实施不可违背）
1. **时钟红线**：一切「晚到吃掉」判断只用本端到达时刻，严禁 turn.ts 与本机 Date.now() 直接比较。
2. **动画锁红线**：revealAnim/cardDealt 语义零改动；动作按钮/押注面板可见时刻不得晚于打字机完成帧。
3. **重放红线**：result 屏每次心跳整屏重绘——ceremony 用 finished.at 首到分支两套 markup，
   .pscore 第一帧即终值（计数跳动取消，改 pop）。
4. **悬念红线**：打字机速度不做全局封顶；只允许「同步补偿」（状态晚到直出），禁止节奏压缩。
5. **E2E 断言红线**：result-podium DOM 顺序保持名次序（test-host pods[0]=冠军，视觉台阶用 grid 列位）；
   free 模式 #stat-turn span 保持纯数字（test.cjs:223-224）；矮屏五 CTA 首屏红线逐一复测。

## 最终工作包

### W1 换屏转身 v2（收，带必改）
- 时长 0.8s→**640ms**（line 528/533 两处逐字同改），曲线 bezier(0.4,0,0.2,1) 不动。
- **揭幕**：.hide 删 blur(8px)，transition 改 opacity/transform .26s；o._rm 520→300。
- **挂载方式（工程专家必改）**：armCube+playSceneEnter 仍在 hideLoading **同步 t=0** 执行；
  join→lobby 揭幕间隙用 `animation-delay:140ms + animation-fill-mode:backwards` 实现
  （仅 pendingSceneEnter 路径），两面延迟期分别停在 from 帧，JS 零竞态。
- **实体背板**：`body:not(.loperf) .screen.entering::before/.leaving::before`，z-index:-1，
  深色渐变底 + 1px 棱线；独立关键帧 `plate-in/out { 0%,80%{opacity:1} 100%{opacity:0} }`
  （落位前归零，不依赖类摘除）；同伪元素叠**无方向平涂暗化** rgba(5,5,15) 峰值 0.28
  （光照连续且与转身方向无关，弃 105° 渐变方案）。
- **窄屏防出界**：innerWidth<760 或 landui 时 Cam.enter 推进幅度=0（转身独占）；桌面减半。
- 清理定时器 _txT/_txL 保持 1000/900（覆盖 140+640）。

### W3 牌桌空间感（收，便宜）
- sheen 扫掠：`.table3d` 子元素（接受台面透视，读作「桌上的一道反光」）+ `.table3d` 加 overflow:hidden；
  **落位后起**（delay 640ms）、时长 500ms、transform 移动静态高光条；LOWPERF 不挂。
- 台面亮度覆层 opacity 0.35→1（700ms，随转身起点并行）。
- 桌心徽记 🎭：.table3d 内部、pointer-events:none、opacity 0.12 静态。
- 持麦座位聚光：.player-card::after 径向光斑 opacity 脉动，显式 z-index；REDUCED + body.loperf 静态化。

### W4 揭晓仪式 v2（收，全场最高价值）
- 三段式 WAAPI：预备 120ms（scale 1.06）→ 主翻 520ms（rotateY 180° + 中途 translateZ 48px，
  bezier(0.45,0.05,0.35,1)）→ 落定 220ms（scale 回 1 + flipGlint）；**终帧精确 = rotateY(180deg) translateZ(0)**，
  .flipped 在主翻起点挂、期间压制 0.85s transition；revealAnim 锁不动（仍绑 typewriter done）。
- **内容先于镀铬**：💬/🎯 徽章在打字机首字符落地时 pop（stageTimers.push(setTimeout(pop, ~32ms))）；
  押注面板/动作按钮在主翻结束（t≈640ms）200ms 淡入；🎁 角标打字机完成后 +120ms，与类型徽章同行 flex。
- **迟到补偿（时钟红线）**：applyState 观察 revealed 首达记本端 arrivalLocal；到达时若已晚于
  （drawing 本端到达 + 2600ms + 300ms 容忍）→ 跳过剩余等待直接翻牌。

### W5 结算颁奖礼（收，拆三颗雷）
- 暗场罩：append 到 document.body（绝不进 #app），z-index 600-900，opacity-only，
  keyframes `0→0.85@45%→hold0.5@75%→0@100%` 总长 1000ms，与转身同起点；REDUCED/LOWPERF 跳过。
- 颁奖台 2-1-3：grid 列位摆台（**DOM 保持名次序**），台阶 translateY；冠军居中升高 + 金环
  （伪元素 opacity 脉冲 1.1s alternate **限 3 拍后定格**，禁 box-shadow 动画）。
- 步进：第3→第2→第1 rise-in 240ms/步；奖章 chips 自冠军落定（t0+560ms）起 80ms stagger；
  分数**第一帧即终值** + pop（取消计数跳动）。
- ceremony/终态双 markup：lastResultCeremony 载体（finished.at 首到），其余渲染直出终态无类。
- 台阶高度 clamp + line 642 压档块内收缩补偿；probe-landscape 844×390 首屏复测。

### W6 窄屏入局（砍半）
- <620px 加入页头像墙改两行横向滚动带 + 滚动边缘渐隐示能；名字/房间号/加入按钮进首屏。
- 大厅本地模式警告横幅折叠成一行 chip，点开展开。

### W7 轮次诚实（改法换）
- roundLimit>0：chip 显真进度 `第 {min(rounds+1, limit)}/{limit} 轮`；
  roundLimit=0：turn 模式显「第 N 手」（N=轮转位置 turnIndex%len+1），free 模式 span 保持纯数字
  （test.cjs:223-224 断言）；轮转位置同时进 turn-info 文案。
- 顺手修：390px 顶部 chip 行左缘裁切。

### W8 微增强
- Cam.parallax 系数 ±0.9°/±0.65° → ±1.6°/±1.2°（pointer 驱动，非循环）。
- ≥1280 视口加载层卡片 90→130px（一次落位 scale，不做循环漂浮）。

## 验收
- 回归全绿：check-syntax / probe-cube / probe-scene / test-3d / test-landscape / test-perf /
  test-host / test / test-fun / test-audio（+ mic 系列不涉改动可选跑）。
- 新增 probe-one-take.cjs：揭幕→起转时序（delay 生效、旧墙不消失）、背板落位前归零、
  窄屏 Cam 零推进、颁奖步进时序与终态重绘不重放、迟到补偿。
- 截图连拍：换屏 6 帧（390×844 与 1440×900）/ 翻牌 4 帧 / 颁奖 5 帧。
- SPEC.md 同步：换屏转身、揭晓时序、颁奖台、轮次 chip、打字机时钟红线。
