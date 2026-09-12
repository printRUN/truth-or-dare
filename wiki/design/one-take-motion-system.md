# 一镜到底动效系统 —— 设计语言与运动常数

> **Confidence: 0.9** | 来源×3（玩家走查×2 + Apple 模式库研究）| 2026-09-13 实施并全量回归 | 与 SPEC.md 同步
> 数值的权威版本永远在 `SPEC.md` 与 `index.html` 注释里；本文记录「为什么是这个值」与取舍。

## 设计语言（苹果式连贯性在本项目的落法）

1. **单一运动源**：同一时刻只有一次主导运动。立方体转身期间镜头推进归零/减半、桌面扫光延迟到落位后（640ms）、morph 类方案被砍——都是这条的执行。
2. **刚体优先**：换屏是「一个立方体的两面绕公共竖棱转 90°」（θ 差恒 ±90°，probe-cube 实测最大偏差 0.00°），两面必须逐字同 duration/同 easing/同 R。
3. **光照连续**：不用方向性渐变做转角明暗（回退方向会翻面），用「面向镜头=亮」的 view-based 背板（plate-in/out，纯 opacity）。
4. **内容先于镀铬**：翻面时牌面只有牌；徽章随打字机首字符 pop，动作按钮/押注面板主翻落定才淡入，🎁 角标最后入列。
5. **时长预算**：普通换场 ≤0.7s（实测 640ms + 揭幕 140ms 间隙）、仪式链 ≤1.2s（颁奖礼 1.16s 收链）、揭幕 260ms 且禁 blur。
6. **弹性只授予仪式**：badge-pop/chip-pop/pod-rise 允许 overshoot 曲线 `(0.34,1.56,0.64,1)`；换场转场 bounce=0。

## 运动常数表（2026-09-13 定稿）

| 运动 | 时长 | 曲线 | 关键量 |
|---|---|---|---|
| 换屏转身 | 640ms | bezier(0.4,0,0.2,1) | ±90° 绕面心竖棱；两面逐字同参 |
| 揭幕 | 260ms | ease | opacity+scale 1.04，禁 blur；两面 delay 140ms+backwards |
| Cam.enter | 540+660ms | out→dolly | 窄屏/横屏零过冲；桌面 z12/rx0.6 |
| 揭晓三段 | 120/520/220ms | bezier(0.45,0.05,0.35,1) | rotateY 180°+translateZ 48px；终帧= .flipped |
| 颁奖步进 | 240ms/步×3（160ms 错拍） | bezier(0.22,0.61,0.36,1) | chips 560ms 起 80ms 错拍；veil 1s `0→0.85@45%→hold0.5@75%→0` |
| 桌面扫光 | 500ms，延迟 640ms | ease-out | transform 移动静态高光；LOWPERF 不挂 |
| 座位聚光 | 0.9s alternate ∞ | — | ::after 径向光斑纯 opacity（替代 box-shadow 脉动） |
| 视差 | — | — | nx×3.2 / ny×2.4 → 实际 ±1.6°/±1.2°（pointer 驱动非循环） |
| 打字机 | 32ms/字 | — | 不封顶（悬念红线）；迟到补偿只砍等待不改速度 |

## 红线（违反即出可见 bug 的组合）

- `.world` 禁 preserve-3d；`#app` perspective 是 fixed 后代包含块（veil 挂 body 不挂 #app）。
- 揭幕间隙只许 `animationDelay+fill:backwards`，禁 JS setTimeout 推迟挂载（旧墙会 display:none 凭空消失）。
- 背板伪元素基态 `opacity:0`（backwards 填充结束后回落基态，基态 1 会闪现暗板——probe-one-take 实测）。
- renderBetBox 吃 `revealAnim` 门控（否则押注面板「闪现→翻牌瞬灭→淡回」三连）。
- 颁奖礼：ceremony/终态双 markup 分支（finished.at 首到），podium DOM 序=名次序，.pscore 首帧即终值。
- 每个新动效必须同时给 REDUCED 媒体块与 body.loperf 补静态退路。

## 验证工具

`probe-one-take.cjs`（12 断言：揭幕间隙/背板/窄屏无过冲/颁奖礼生命周期）、`probe-cube.cjs`（刚体判据，
中段帧用 `getAnimations().pause()` 冻住再截——waitForFunction 返回后写盘延迟会拍假绿）、`review-code.cjs`
（检查官烟测：快跳残留/陈旧定时器/换题打断/REDUCED 连跳）。
