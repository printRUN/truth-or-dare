# 设计方案 v2（定稿）：arcade 跨分支跳转 + UNO 实装

> 2026-09-19 · 两位挑刺专家（工程红线/玩家价值）REVISE，修订全部采纳，本版为实施定稿。
> P0 汇总已全修：file:// 探测必死 → fail-open 直跳；0 机器人局抓包崩溃 → 空集降级；4s 窗×交接闸互锁 → 累计 AWAIT_ACTION 计时 + 幂等取消；提交流程夹带 → 以 da63a8b 为底本外科手术；幽灵 ⑧ 断言 → 本轮真实交付。

## 1. arcade 跨分支跳转（index.html）

- 卡片 4 张：🎭 tod / 🎲 monopoly / 🃏 **uno（转正）** / 💣 **炸弹猫（新增）**（badge「2-8 人 · 联机对战」，title 属性记分支名 feat/bombcat-lobby）。
- **graceful jump**（仅炸弹猫走探测；tod/monopoly/uno 保持逐 id 直跳绑定零回归）：
  `file:` 协议 → fail-open 直跳（双击即开场景 404 也好过点不开）；http(s) → `fetch(href,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(1500)})`，`r.ok||405||501` 按存在算，失败再 GET 兜底；in-flight 锁防双 toast；结果存**页面级 memo**（禁 localStorage 负缓存）。渲染期后台预探测一次，点击瞬间跳转。
- 失败 toast：主文案「💥 炸弹猫还在筹备中，敬请期待 🚧」（error 色），副文案「先来一局 UNO / 大富翁吧」，3.5s；分支名只进 title/console.info。
- 探测失败卡挂「🚧 未开放」灰角标 + 降饱和（复用 locked filter 0.45/0.75）但保持可点；file:// 未知态不挂角标（乐观渲染）。合入后自动消失。
- 布局：删 ≥900px 3 列规则 → **≥700px 2×2**（max-width 680px、min-height 148px）；landui 横排横滚天然兼容 4 卡不动。

## 2. UNO（uno.html）

### 2.1 构成与复用

monopoly 模板照抄：loader 三里程碑/dpr 封顶/灯组/SFX+unlock/mulberry32+rngBox/存档骨架（24h TTL、SETUP/OVER 不存）/loperf-lite（idle 判据改 `AWAIT_ACTION`）/HUD body 级 fixed/veil+pod 结算/交接闸/GL_STUB。**新写**：手牌扇形数学、牌面纹理生成器（256×358 数字牌/功能牌中文注记/万能四分底/牌背纹样）、UNO 状态机、选色弹窗、方向环、bot 决策、2D 手牌双态、`__uno` 钩子。「🏠 游戏中心」返回链接对齐 bombcat 样式。

### 2.2 规则 v1（经典 UNO + 明确家规）

- 2-4 人（1-3 真人+🤖），起手 7 张；108 张标准牌组；**首翻只接受数字牌**，翻到功能/万能塞回牌库底重翻。
- 出牌匹配色/值；**+4 强限「手中无当前色才可出」**（引擎校验，无质疑制的平衡替代）；万能随时可出。
- 摸牌：随时可摸（战术保留）；摸到的牌可出→「打出/保留」二选；**保留后本回合仍可出任意手牌**（宽松家规，写进规则速览）；不可出自动过。
- 效果：跳过/反转（2 人局=跳过，方向 HUD 2 人局隐藏）/+2/万能选色/万能+4；牌库空→`ensureDeck` 洗回弃牌堆（**顶牌除外**），可摸数=min(n,deck)，0=强制过；顶牌万能洗回后 currentColor 独立不变。
- **UNO 喊名**：打出剩 1 张开窗 **6s**（DOM 环形倒计时+脉冲，REDUCED 数字倒计时）；计时=**累计 AWAIT_ACTION 墙钟**（HANDOFF/ANIMATING 时 pause），防交接闸互锁；`onPlay/onWin` 幂等 `cancelUnoWindow()`（胜局不挨罚，探针断言）。有机器人：100% 抓包、延迟 0.6-1.2s（读作反应快）；**全真人局**：下一位真人的交接闸上出「🫵 抓包！X 忘喊 UNO」按钮（10s，点=罚 2，社交压力）。0 机器人且窗口到期无人点 → 只 toast 不罚（永不崩）。罚摸 2。
- 僵局保险丝：连续 200 次过牌 → 和局按罚分排名结算。
- 明暗牌：默认**暗牌**（交接闸，真人手牌仅本人回合正面）；setup「明牌模式（客厅投屏）」= 全真人手牌常开小扇（≥30px/张），机器人永不公开；明牌时交接闸置灰。交接闸三件套对齐 monopoly（闸+跳过开关+存档），**开关在明牌下禁用**。
- 胜负：先出完者胜；结算 veil 展示各家罚分（数字=面值、功能 20、万能 50）；**胜者下局先手**；「🔄 同班人马再来一局」保留配置（`uno:names`）。

### 2.3 3D 与动画

- 手牌扇形：`maxAngle=min(140°,10°+n·6°)`，重叠随 n 递增，步距下限 8px；**步距 <12px 或 n>12 → 压缩模式**：点扇形开「手牌浮层」（DOM 横滚 scroll-snap、卡宽 ≥64px、点=出/选中放大确认），浮层同时服务 2D 降级；未压缩时 3D 直点即出（命中按展开位次）。
- **可出牌高亮**：呼吸 emissive + 上浮 6px；不可出压暗 0.6；万能恒亮（+4 受限时压暗）。规则引擎的活还给眼睛。
- 动画预算：出牌 ≤550ms、摸牌 ≤400ms、效果链总长 ≤1.8s（第 2 段起 0.3s 相位并行）；toast 与名牌脉冲同发不排队；REDUCED 全瞬移。
- 当前色：桌面四色环高亮 + DOM chip 带色名文字（「当前：红」，色盲冗余）；功能牌牌面符号+中文单词双通道。
- 机器人台词池 3 事件×3 条（抓包/被罚摸/获胜或被跳过），1 条/事件/回合封顶。

### 2.4 存档/降级/E2E

- 存档 `uno:save:v1` 字段：hands/deck/discard/dir/currentColor/drawnThisTurn/mode/unoPending{who,deadlineEpochMs,penalized}/players/rngA/seed/round...；**恢复时窗口已过期未罚 → 立即结算抓包**（堵刷新漏洞）；恢复后暗牌：当前真人先过闸再翻牌，其余保持背面。加载时存档 <24h → 「🏠 发现上一局（X 只剩 2 张）继续/弃局」。
- 降级三套对齐 monopoly（REDUCED 瞬移+数字倒计时；loperf-lite dpr1/关阴影/瞬移动画；WebGL 不可用 → 2D 手牌列表明暗两态+2D 桌面）；新 CSS 动画全配 REDUCED 退路。
- 钩子 `?autotest=1`：种子 20260919、×0.15、自动开局 1 真人+1 机器人、`window.__uno = { state, deckN(), discardTop(), forceHand(i,cards), callUno(), forceUnoTimeout(), chooseColor(c), handoff(), mc(n) }`；`&unowin=<ms>` 覆盖喊名窗口（autotest 缺省 600ms）；`&loperf=1` 跳帧渲染；`&turbo=1` MC ×0.01。

## 3. 测试与提交

- check-syntax.cjs：FILES 加 uno.html；sha 断言 `=== 3` 份（硬编码白名单，**不含 bombcat.html**）；uno 缺失走 MISSING 分支算 fail。
- probe-arcade：① cards===4 + UNO 卡转正断言；⑦ monopoly 跳转不动；**新增 ⑧（补历史欠账）**：667×375 + 显式 landui → 4 卡 bottom ≤ 视口高且横排；新增 UNO 跳转与炸弹猫双分支断言（探针内先自探 fetch HEAD，存在→跳转+setup；不存在→toast+URL 不变——与运行时共用谓词，合入后自然转绿）。
- probe-uno.cjs（8909，新）：A 规则链（出牌合法性/+4 强限/效果四类/UNO 窗口与抓包/胜局不挨罚/洗回边界/首翻/僵局保险丝）；B GL_STUB 2D 降级；C turbo MC 20 局全终局；零 pageerror。
- 门禁：check-syntax、probe-arcade、probe-uno、probe-monopoly 回归；verify/test-3d 抽查。
- **提交流程（P0-3）**：主工作树仍被并行会话占用——index.html 以 `git cat-file blob da63a8b:index.html` 为底本**只叠加 arcade 局部 hunks**（禁取工作树版），uno.html/探针/check-syntax 用工作树版；git 底层命令落 feat/arcade-monopoly；提交后审计 `git diff da63a8b feat/arcade-monopoly -- index.html` 不含 `deviceUid|saveMyRecord|tod:uid|tod:myrec`。
- 合并顺序约定：bombcat-lobby 将来 rebase 到 feat/arcade-monopoly 之上，门禁文件冲突由 arcade 侧解决；bombcat.html 合入后 check-syntax 扩四方另开一票。

## 4. 明确不做（v1）

+4 质疑；叠 +2；7-0；多局计分赛制；UNO 联机；BGM；手牌自动排序开关（v2）。
