# 真心话大冒险 · 项目知识库索引

> 按知识编译系统（LLM Wiki v2）组织：`wiki/` 存编译后的知识文章（带置信度），
> `SPEC.md` 是代码接口的权威规范（无置信度、永远最新），两者互补——SPEC 变了以 SPEC 为准，
> 置信度按时间衰减规则见 skill（90 天未访问降权）。

## 文章

- [design/one-take-motion-system](design/one-take-motion-system.md) —— 一镜到底动效系统的设计语言、全部运动常数与红线（实施依据 design-plan v3）
- [design/third-person-table](design/third-person-table.md) —— 骗子酒馆式第三人称牌桌（背影/远弧座次/揭晓常驻）：画面语法、红线与全部档案链接（2026-09 v6）
- [research/player-walkthrough-2026-09](research/player-walkthrough-2026-09.md) —— 双 persona 玩家走查（手机竖屏/桌面主持）的发现清单与「发现 → 工作包」映射

## 实体图谱

见 `.entities.json`。核心实体：Cam（摄影机 rig）、CubeTurn（立方体转身）、RevealCeremony（揭晓仪式）、
PodiumCeremony（颁奖礼）、PerfGuard（三档性能护栏）、TurnChip（轮次诚实）。

## 已知遗留（下一轮候选）

- FLIP 配对元素 morph（W2）：被两位挑刺专家否决（几何冲突 + innerHTML 重建竞态 + 玩家无感），若重启需先解决「转身期间目标 rect 投影坍缩」
- 1440 大厅右列「主持控制台」（W6 后半）：牵动 probe-pcwidths/pcfit/tabletshift 三条回归，性价比待重估
- 粒子池统一（表情雨/彩带/爆彩三套互不认账）、1280×800 工具栏第二行贴折线
- renderResult ceremony 窗口（~1.3s）内的心跳重建会把步进动画快进到终态（内容正确、不重放，低概率）
- `runStage('revealed')` 基线等待公式仍拿发布方 turn.ts 对本机钟（遗留 P2，新补偿只砍白等不补悬念）
