# 业务逻辑终审 · 头像区分度+发型 2D 相似度轮 v4（2026-10-11）

**判定：SHIP WITH FIXES** —— 五条验收线全过、用户抱怨的两根主根因（热座无 av、提取器反转）实跑确认已解决；但实跑抓到 1 个真功能洞（UNO 热座「再来一局」头像全丢，复现实锤）+ 1 个标准不一致（联机机器人风格池没走 14 允许名单），建议修后发布（均为一行级修复）。

---

## 五条验收线（value 专家基准，全部实跑复验）

### 1. 提取器反转清零 — ✅（带一处阈值字面破线备案）
`taskkill chrome` 后实跑 `node .pw/persona-ava4-uno.cjs`，重读 `.pw/persona-ava4-data.json`，另用共享提取器（AV3.extractAvatarFeatures）对 4 张选型 SVG 直接取证：
- **卷卷（personas/Jill 大卷）= afro，非 bald** ✅（hair #f2b28b / skin #eec2ab / 墨镜 dark，与定稿记录逐位一致）
- **阿琅（adventurer/Maria 金发）hairGuess=false 且 style=long** ✅（hair #e4d6a3 / skin #f2d3b1，直跑提取器确认 hairGuess=false）
- **hair-skin 同族检查（dist3<0.07，提取器同域 /441.673）**：刺头哥 0.4312 ✅、丸子姐 0.4784 ✅、卷卷 0.0815 ✅、**阿琅 0.0453 < 0.07 ⚠️**。判定：非反转回归——金发确实提取为金发（hairGuess=false、style=long、tod 近截目检为金发长直发侧垂），0.07 是「金发误判成肤色」的代理阈值，对「真淡金发贴淡肤色」的 2D 原生配色必然误报；但它同时预警了真问题：UNO 半身像尺寸下阿琅的头读起来偏「白蛋」（见第 2 条）。

### 2. UNO 四人可辨 — ✅（数据全过；阿琅在半身像距离偏弱）
- 四座位 style/hair：阿琅 long/#e4d6a3、刺头哥 short/#c93305（红）、丸子姐 short/#72452f（深棕）、卷卷 afro/#f2b28b+墨镜。6 对两两比较全部至少 style 或发色相可辨（刺头哥 vs 丸子姐同 short，发色 dist3=0.394 红棕分明）✅
- 目检 `.pw/shots/persona-ava4-tod-compare.png`（3D 近截）：四人明显不同——长直发侧垂 / 橙红短发 / 棕色短发 / 宽轮廓爆炸头+墨镜 ✅；`persona-ava4-uno-compare.png`（半身像 33-55px）：刺头哥/丸子姐/卷卷靠发色+墨镜仍可辨，**阿琅淡金贴淡肤在该距离偏「白蛋」**，靠名牌底色环+座位色兜底——建议下轮把 bust 档给 long 类加侧垂轮廓强调。

### 3. 热座全景入画 — ✅
- `node .pw/ev-ava4-pano.cjs`：**4 pass / 0 fail**——GO 聚集档 cy=738,737 < vh−40=760，行动者（turn=0）100% 画内，零 pageerror（与定稿记录 cy 849→738 一致）
- `persona-ava4-mono.cjs` 真人 4 座位交叉确认：GO 全景 **4/4 入画（cy=717,715,713,711）**；中盘全景 4/4 可见（cy=517-726）；目检 `persona-ava4-mono-3-panorama-go.png` / `8-panorama-mid.png` 全员带名牌入画。

### 4. 热座无兜底头 — ✅
- `persona-ava4-mono.cjs`：**9 pass / 0 fail**。4 座位改名后全员 dcb 特征头（style=long/bald/afro/afro，无 fb）、四座两两互异（bald=派发 dcb 的真实秃，非兜底）、交接卡点名+头像、真人推进 10 掷（交接/买地/入狱/连掷全走真 UI）、零 pageerror
- `ev-avatars-mono.cjs`：**14 pass / 0 fail**——NETMODE 双端金值不漂（avaprobeB short→flat 为已备案 ava4 金值更新）、热座段 dcb 特征头两两互异（short/#694d35 vs fringe/#7f4d1f）。
- 微备案：persona-mono 座位 2/3 同为 afro，发色 #601c18 vs #5c3917 的 dist3≈0.066，30px 头径下偏近，靠名牌底色环/座位色/身体色兜住（value P2-3 分层兜底的预期工况）。

### 5. 实验室门禁 — ✅
`node .pw/probe-ava-lab.cjs after`：total 116 / faces 88，**distinct=88=faces、撞脸 0**；classHist：**fringe=16 / spiky=4 / flat=5 / bun=1 全部非零**（mohawk=0=样本无真莫霍克，诚实为零，与定稿一致）；guess 路径 9 例不撞（distinct=88/88 即证 guess sig 不再全同）。

---

## 逻辑洞检查 A–F

**A. 热座改名→重开局：✅ 跟随**。`seatAvatarRep`（party-net.js:1162）= djb2(名字#序号) 确定性，改名必换脸；setup 座位行头像 input 即时重绘（monopoly.html:3365 / uno.html:2457，所见即所得）；btn-start 全座位重派（3386/2480）；3D 头 av 源= `G.players[i].av`（1684）随 startGame 重建；交接卡每回合取当前 p.av（2110-2111）。实跑交叉证：persona-mono 改名 4 座→4 张互异特征头。微洞（不挡发）：预览用 taken=null、开局用 taken 去重重散，座位间撞款时预览≠开局头像（概率极低，guard≤8）。

**B. 大富翁存档→刷新→继续：✅ av 全链透传**。saveGame 落 av（monopoly.html:1987 / uno.html:1673）、resumeGame 恢复 av（mono Object.assign 3541 / uno 显式 2633）、buildPawns 读 G.players.av（1684）；续局 offer 在 loader 之后（GL 已就位），联机快照路径另有懒 buildPawns（600）兜底。

**C. 机器人头像：热座 ✅ / 联机有但标准不一致 ⚠️**。热座：btn-start 对全部座位（含 bot）无差别派发（code）+实跑证（ev-avatars-mono 热座默认座位 2=机器人甲，拿到 dcb 特征头）。联机：addBotToDoc（party-net.js:1900）内联配方进 doc、全端一致、rematch 稳定——**但**它用 czPersonaStyle=DB_STYLES−CZ_ABSTRACT=25 风格池，其中 11 个（bottts、bottts-neutral、fun-emoji、thumbs、6 个 -neutral 线稿）在 v4 自己定的 14 人脸允许名单之外（party-net.js:1166 注释自证「-neutral=纸白肤秃头特例」「fun-emoji/bottts 必兜底」）→ 联机局每个 bot 约 44% 概率落兜底/纸白秃头，两个 bot 同落即复刻「互相难辨」。热座标准（14 白名单）没同步到联机 bot——建议 addBotToDoc 换用同一允许名单。

**D. 结算「再来一局」：大富翁 ✅ / UNO ❌ 实锤洞**。mono 热座 rematch av 透传（monopoly.html:3298 注释「同名同头像跨局稳定」，实跑复验：rematch 后 faces 仍 short/fringe、fb=false、av 全在）；联机 rematch 走 doc（bot/真人 av 均在 doc，稳定）。**UNO 热座 rematch（uno.html:2529）映射 `{name, bot}` 漏了 av** → startGame（1710）落 av:''。实跑复现（按按钮真实映射二次 startGame）：`第一局 avs 有/有、seats fb=false → 再来一局 avs 无/无、seats fb=true`——半身像塌回兜底蛋、HUD 头像消失、且续局存档从此带 av:''。用户抱怨的正是 UNO；结算屏主 CTA 一点就退化。修复=照抄 mono 3298 一行 `{..., av: p.av || ''}`。

**E. tod 近景无回归：✅**。`ev-avatars-tod.cjs` **10 pass / 0 fail**（fringe 分类演进备案、头球肤色迁移、眼镜、emoji 双向翻转零残留）；persona-ava4-uno 的 tod 段 4 人特征头+揭晓态正常，对照板四类发型可辨——用户已认可的 tod 部分未被动坏。

**F. bombcat 不受影响：✅**。`ev-avatars-bc.cjs` **13 pass / 0 fail**（bc hue 直通偏差 0°≤8°、猫脸贴片在位、三猫色相互异、零 pageerror）——本轮未碰猫协议，回归闸绿。

---

## 总评（≤100 字）

用户两条抱怨打准了：热座全员 dcb 特征头、提取器反转清零、实验室 0 撞脸，tod/bc 零回归，全景四子全入画。但 UNO 热座「再来一局」漏透传 av，实锤塌回兜底蛋；联机 bot 风格池未收进 14 白名单。两处均一行级修复，修完即可 SHIP。
