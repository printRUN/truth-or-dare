# 镜头随流程改造简报（tod / monopoly / uno）

用户需求原话：「每一个游戏的场景，镜头推走都要跟随游戏的流程，比如谁动了就跟谁，跟完以后要回到整个布局，镜头的推转移缓慢，而不要快速导致人员看得会晕」

## 三条设计原则
- **P1 跟随**：谁动（回合行动者/棋子/飞牌）镜头跟谁——各游戏已有各自语法，本轮补缺口。
- **P2 回全景**：跟随段落结束后，镜头缓慢拉回整个布局（全景档），再进入下一段跟随。
- **P3 缓慢**：所有流程运镜时长 ×1.3~1.6；az 插值必须走最短弧；不改缓动曲线形状（smoothstep 起收零速已有）。

## 现状取证（2026-09-22 ev-mono-cam 基线 + 代码审计）
- monopoly：acting 端全程近景档（dist 4.8/elev 55°），回合切换 az 大幅甩镜（146°→-46°→72°），**从不回全景**；`focusPawn` 的 az 用 atan2 绝对角直接插值，**没走最短弧**（rig.az=3.0→目标-3.0 会绕 340° 而不是 20°）。
- uno：出牌/摸牌 glanceAside 推 480ms→停 780ms→回 520ms，偏快；回全景（focusK→1）已有。
- tod：选卡 nudge 820ms / 抽卡 focusCam 950ms / 揭晓近景推 0.9s；回合交接回全景 Cam.home(420ms) 偏快。

## 改动清单

### monopoly.html
1. `camTo` 内加 az 最短弧：`to.az = from.az + shortestArc(to.az - from.az)`。
2. `focusPawn`：back 700→1100ms；near 900→1250ms。
3. 新增 `backToBoard(ms, done)`：elev=REF_ELEV/dist=baseDist()/focusK=1/tgt=TGT（**az 保持当前**，纯拉远不旋转=最温和）。
4. 新增 `approachTurn(pi)`：已在全景（rig.autoDist && |dist-baseDist()|<0.3）则直接 near；否则先 backToBoard(750) 再接 focusPawn(pi,false)（done 链，token 作废语义照旧）。
5. `beginTurn` bot 分支与 `enterHumanTurn`：focusPawn(G.turn,false) → approachTurn(G.turn)。
6. `beginTurn` 热座 handoff 分支：显示交接卡同时 backToBoard(750)（跟完上一动作者，回全景等待交手机）。
7. `movePawn` 跟随阻尼 0.90→0.93/帧（60fps 追踪时间常数 ~230ms，更从容）。
8. `revealCard`：推近 900→1250ms；揭晓完回全景 500→1000ms。
9. 远端观战（applyGameSnapshot）focusPawn(back) 时长随 2）自动变慢。

### uno.html
1. `glanceAside`：推 focusK 0.86@480ms → 0.84@750ms；保持 780→950ms；回 az0/focusK1 520→900ms。
2. 无其他改动（行动者恒南位、回全景已有；本端自己出牌镜头保持稳定是既定设计，防干扰点牌）。

### tod.html + index.html（孪生副本，同改）
1. `runStage('choosing')` 回全景 Cam.home(420)→Cam.home(700)。
2. `Cam.nudge` 820→1000ms；`Cam.focus` 默认 dur 900→1050ms。
3. `focusCam` 两处 950→1150ms。
4. GL 揭晓近景 `rStep` 分母：推近 0.9→1.15s；拉回 0.7→0.9s。
5. **不动**：Cam.glance 320+320（与换屏 640ms 面板同拍，脱拍=穿帮）、Cam.init 900（开机落位）、realign 420（转屏续接）、Cam.home 默认 750。

### 不改
- 炸弹猫（index 里是外链占位，无场景无镜头）。
- REDUCED/bodyLo/TURBO 瞬移路径（降级语义不变）。

## 风险与验证计划
- 探针时序假设：.pw 下 test-3d（运镜断言）/probe-choice-upgrade/probe-3d-feel/probe-egg-react/probe-draw-continuity/ev-mono-*/probe-mono-net/probe-uno-net 可能对时长有隐含等待；实施后逐条跑，假红先判断「断言等运镜落定的轮询上限」还是「真回归」。
- monopoly 双数再掷（同 actor 连续回合）：approachTurn 只在 beginTurn/enterHumanTurn 触发，双数路径不触发=镜头不折腾，符合「跟完再回」节奏。
- 联机：回合接管协议不涉及镜头；远端观战回全景已覆盖。

## As-built 修订（2026-09-22 实施+双检查官终审后的最终参数）
- monopoly：未引入独立 backToBoard()——回全景=focusPawn(pi,true)（1100ms，含 az 对准；转身天然在全景距完成）。
- approachTurn 决策门（终审 P2-3/P2-6 吸收）：同一位行动者原地再进入（azOff<75°+近景两锚 tgt≈pawn×0.35/×0.8 贴合+elev55+dist≈near）→ 免脉冲直推；已在全景且 azOff<10°（交接卡/快照已对准）→ 直推；其余一律 back(1100)→near(1250)。
- movePawn 阻尼 0.92（非简报的 0.93；终审 B 实测滞后仅 +5~11%），且补 rig.autoDist=false（终审 P2-2）。
- R1 阈值 0.75→0.85（终审 B：0.95 过松）；R2a 重写 inspect 真机档（390×844 SPEED=1，旧 autotest 档采样无信号）+ 三条负向钉死（回全景穿越/az 角速率/段末收敛）。
- uno：推 0.84@750、回程顺延最后一手后 950ms、回 900ms；>0.96 才重启推镜。已知观察项：连续 <950ms 出牌链回程顺延（自限）。
- 门禁：check-syntax 加 tod↔index 孪生镜头区断言（bombcat.html 缺失改 SKIP）；probe-draw-continuity 补 three3d evaluate 级 click 契约 + 软渲降级报告（本机无信号时明确标注，不硬崩）。
- 终审取证：.pw/ev-cam-final.cjs（monopoly 端点 4.80/8.47/42°/55° 精确命中；stash 对照旧码从不回全景；uno 谷值 0.840；tod -76↔-56 往返）。
