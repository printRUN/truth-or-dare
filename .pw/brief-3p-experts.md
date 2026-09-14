# 挑刺专家评审简报（第三人称牌桌 TP-Table）

## 你的角色
你是本项目的评审专家之一。用户要做大改：把 D:\myidea\truth-or-dare（单文件 index.html，纯 CSS 3D）从「第一人称牌桌」改成《骗子酒馆》式第三人称（屏幕下方是自己的角色背影，对面围坐其他玩家，中间是牌桌）。设计方案见 **.pw/design-plan-3p.md**（先读）。
两位玩家 persona 的需求报告在 **.pw/report-persona-akai.md** 与 **.pw/report-persona-tingting.md**（先读）。
基线截图（现状第一人称，用 Read 看图）：.pw/shots/3p-base-desktop-choosing.png / -drawing.png / -revealed.png / 3p-base-mobile-choosing.png。

## 输出要求（严格）
对你职责范围内的每一条意见，输出：
- **判定**：【通过】/【有条件通过（附参数修订）】/【否决（附理由与替代）】
- **参数级修订指令**：不要写「俯角再大一点」，要写「base.game rx 17→19、z -52→-58，理由：…」。泛泛评价无效。
- **风险与回归点**：你预判实施时会踩的坑（对照 SPEC 红线）。
最后给出总判定：【批准实施】/【修订后批准】/【打回重设计】。

## 背景事实（已核实，可信赖）
- 摄影机 = #world3d transform，Cam 调度；game base 现为 {z:-24, rx:8}。spec：SPEC.md 第 2 节。
- 座次 layoutRing（index.html ~3778）：我固定 a=PI（底部中央 --rs 1.21），其余人全圆周分布；桌面 1440×900 六人时 ±60°/±120° 同 x 重叠（截图可见阿豪/大飞被遮）。
- index.html:878：非 landui 且揭晓时 ring display:none——桌面端揭晓时牌桌整个消失（截图 -revealed 可见）。
- .pw/test-3d.cjs 把机位硬编码进断言：|rx−8|<0.6、抽卡推镜脱离 z=−24、聚焦档 z≈−44 s≈1.05——机位一改这些断言必须同步改（属预期连带改动，不是破坏测试）。
- 玩家卡：avatar-ring 70px（小屏 56px）+ chr-body 46×17 + 名牌；我的卡 --rs 1.21。
- flyAvatarToDeck 用 getBoundingClientRect 量头像环（visibility:hidden 保布局不破坏测量；display:none 会破坏）。
- 红线：.world 禁 preserve-3d（test-3d 回归锁）；#app perspective 是 fixed 包含块；新动画必须给 REDUCED + body.loperf 静态退路；桌面锚定只用 offsetLeft/Top。
- 性能：loperf 档 .table3d 拍平、动画全停；软件光栅下大渐变层重绘昂贵（SPEC 有实测数据）；新增元素必须静态便宜（无 blur/无滤镜/无大面积活渐变）。
