# expert-value-final.md · 玩家价值终审 · 头像特征强相似轮（feat/3d-avatars）

- 终审人：玩家价值终审专家（最后一道玩家视角验收，唯一标准：**玩家选了某个 2D 头像后，桌上的 3D 角色头能不能「一眼认出是同一个人」**）
- 日期：2026-10-08
- 依据材料：`.pw/shots/av3-headproto.png`（46° 俯角 15 案例 2D/3D 并排，逐格 4-6 倍放大核对）+ `ava-tod-feats.png` / `ava-uno-net-host.png` / `ava-mono-net-overview.png` / `ava-mono-hotseat.png` / `ava-bc-hue.png`（真机）+ baseline `av3-persona/composite-tod.png`、`composite-bombcat.png`、`b-mono-pair-01.png` + report-A/B §三 + expert-visual / expert-eng 修订清单 + SPEC §1.14 + 代码抽查（avatar-features.js 三页 src、mono/uno hairFromImage 已删、bombcat hsl(hue) 直通、check-syntax sha 锁 876bcf0d27b55f37）
- 打分口径：「一眼同一人」1–5 分（1=完全认不出，3=靠主特征能认，5=神似）

---

## 一、persona 优先级清单前 5 条缺口逐条判定

| # | 缺口（persona 报告定级） | 判定 | 证据 |
|---|---|---|---|
| 1 | **发色 NaN 死链**（P0：SVG 无宽高→drawImage 空→NaN→#000000，全员黑头盔，探针假绿） | ✅ **修了，修到位** | mono/uno 两份 hairFromImage 已删尸（grep=0）；共享 avatar-features.js（宽高注入+空光栅重试+像素否决权）三页 src + sha 锁进 check-syntax。headproto 15 例发色逐一正确：Zoe 红、toon-head 金、Leo 黑、pixel-art 深红、Ivy 粉、miniavs/notionists 棕/黑；真机 uno 半身像棕发、tod 老白金棕发。旧探针 `#000000` 假绿洞已换金值断言 |
| 2 | **肤色写死 #e8b98c/0xe9bb90**（P0） | ✅ **修了，修到位** | headproto 深浅肤全谱正确：micah 双例深棕、adventurer/Kim 深棕、Ivy 棕、notionists 灰白、Zoe/miniavs 奶油；分层饱和钳落地。深肤玩家「侧面换人」问题随几何头+肤色迁移消失 |
| 3 | **秃头反转**（P0：2D 秃→3D 大发壳） | ✅ **修了，修到位** | micah/Jack、micah/Maria → 光头无壳；lorelei-neutral → 奶油秃（NEUTRAL_LINEART 黑碗已废）；open-peeps/Leo 爆炸头→**黑 afro**（反向修复同样到位）。15 例 + av3-verify 146 格零假秃。改革前最遭恨的「2D 秃 3D 毛」整类灭绝 |
| 4 | **贴纸感/徽章感**（P1：深紫底描边环、斜 55° 素球） | ✅ **基本修到位（dcb 人脸）** | dcb 头像全面改几何头，贴片路径只留给 emoji/默认头像（双专家裁决保留项）与 bombcat 猫脸。真机 tod 老白=几何脸+眼镜环，无描边环、无素球侧。**残留**：bombcat 猫脸贴片深色方底在橘猫头上仍隐约可见（P2 打磨）；index.html 深链副本旧贴片脸（显式降级备案，非 bug） |
| 5 | **眼镜/胡子缺失**（P1） | ⚠️ **修了一半——机制在、召回不稳** | 机制确实在：真机 tod 一例戴镜者眼镜双环清晰可读（老白特写）；headproto 的 Zoe/Ivy 渲染墨镜片（无眼球=dark 子型正确）、big-smile 渲染普通框。**但 15 例网格中 6 个戴镜者只有 2 个出镜**：micah/Jack、micah/Maria、miniavs/Felix、notionists/Felix 四例均无眼镜环（标签也无「眼镜」）——而 av3-verify.json 对同样四例记录 glasses=True，**同输入两种输出，取证管线与共享提取器不同步**。胡子更弱：toon-head/Aiden 的小胡子原型曾检出、实施后丢失；dylan 胡茬无踪；15 例无一渲染胡子 |
| 附 | **bombcat 猫色错配**（report-A P0，两专家裁定 hue 直通） | ✅ **修了，修到位** | ava-bc-hue.png：粉猫=粉壳粉身、蓝猫=蓝、橘猫=浅橘；代码 `hsl(hue,…)` 直通壳/身/头球（bombcat.html:2709/2717）。残留：橘猫饱和度偏淡（52%），贴片方底可见（P2） |

**结论：5 条 P0 级缺口全部实质修复，唯一半拉子是「眼镜/胡子」的检测召回与管线一致性（P1）。**

---

## 二、headproto 15 例「一眼同一人」打分

逐格放大核对（4-6x），46° 玩法俯角列：

| # | 案例 | 3D 出了什么 | 丢了什么 | 分 |
|---|---|---|---|---|
| 1 | personas/Zoe | 红帽色壳+**墨镜片（无眼球）**+浅肤 | 嘴贴壳下缘 | **3.5** |
| 2 | micah/Jack | 秃+深肤+愁眉（对） | 方框眼镜 | **2.5** |
| 3 | micah/Maria | 秃+深肤+垂眼（对） | 圆眼镜 | **2.5** |
| 4 | toon-head/Aiden | 金发刘海（非橄榄兜帽，P0 修复生效） | 小胡子 | **2.5** |
| 5 | avataaars/Felix | 棕发+侧发（对） | 黄肤→粉白；X_X/大笑被抹平 | **2.5** |
| 6 | miniavs/Felix | 棕发齐刘海（对） | 圆眼镜（原型曾检出，实施后回退） | **2.5** |
| 7 | notionists/Felix | 黑发+灰白肤（灰度风成立） | 眼镜+髭山羊胡双丢 | **2.5** |
| 8 | big-smile/Aiden | 橙发+棕肤（对） | 紫眼罩→普通框露眼（SPEC 备案可接受）；大白牙没出 | **2.5** |
| 9 | open-peeps/Leo | **黑色爆炸头 afro（全场最佳修复）**+白肤 | 喊叫表情→平静（P3 不计） | **3.5** |
| 10 | dylan/Leo | — | 肤发同族橙红薯（分离不可辨）；胡茬无 | **2** |
| 11 | pixel-art/Jack | 深红大发量+白肤（对） | 红嘴没出 | **3** |
| 12 | adventurer/Kim | 深肤+橙棕发（对） | 顶丸子没检出（仍 short） | **2.5** |
| 13 | lorelei-neutral/Felix | 奶油秃（黑碗已废） | —（2D 本就无发） | **3** |
| 14 | personas/Ivy | 粉 afro+棕肤（对）；假胡子已灭 | 墨镜藏住了 2D 可见的眼睛（轻） | **3** |
| 15 | big-ears/Felix | 盖眉厚刘海+发色（对，发际线悬空已治） | 招风耳弱化 | **3** |

**均分 = 41/15 ≈ 2.7 / 5**（视觉专家实施前同口径 2.2 → +0.5）。

对比改革前：report-A tod 2 分 / bombcat 2.5 分（贴片球）、report-B mono/uno 全员 1 分（四颗同款黑盔头，`b-mono-pair-01.png` 为证）——**「特征反转」级错误（秃→毛、爆炸头→秃、猫色错配）已整类清零**，这是本轮最有玩家价值的部分。没到 3.0 的原因集中在两点：眼镜/胡子召回不稳（5 例丢眼镜）、表情同质化（见四）。

---

## 三、玩法真实距离远读核查（monopoly 28px / uno 45px）

- **monopoly 28px**（ava-mono-hotseat 两枚棋子 8x 放大）：发色块/肤色块/短发剪影三要素全部可辨，眼睛只剩两个深色点、眼镜胡子不可读——与 expert-visual 分层裁决一致。热座两枚为 fallback 头（发色=座色深化），与锥身颜色连贯，无「黑盔头」残留。本轮 net 全景中头像棋子未入画，28px 特征头直接证据不足，以 headproto 46° 列+热座几何头旁证。
- **uno 45px**（ava-uno-net-host 北位半身像 5x 放大）：棕发壳 vs 浅肤脸对比清晰，短发剪影可辨——肤色/发色/发型三远读特征成立，小五官不可读（预期内）。
- **tod 60-90px**（ava-tod-feats 老白特写）：金棕发+眼镜双环+浅肤+红嘴全部可读，是四页中远读最强的一页；阿泽头被名牌 UI 遮挡（UI 遮挡非管线问题）；默认仔 emoji 贴片按裁决保留、工作正常。

**结论：三页真实玩法距离下，肤色/发色/发型三大远读特征均可辨——本轮把 P0 全押在远读正确性上的策略，实测成立。**

---

## 四、有没有为凑相似引入的新违和？

逐项排查（过度卡通化几何件 / 颜色刺眼 / 表情崩坏）：

1. **表情同质化「倦怠脸」（最主要的新违和，非崩坏）**：15 例全部是垂上睑+樱桃小嘴的同一张「没睡醒」脸——2D 的喊叫（Leo）、咧嘴大白牙（big-smile）、X_X（avataaars）、哭脸（Maria）全被抹平成同一档冷脸。金鱼眼瞪眼是治好了，但矫枉过正成全队困倦。属 P2 打磨（上睑线/瞳 y 微调、嘴宽下限），不构成发版障碍。
2. **dylan 橙红薯**：数值门 Δhue>0.05 过了，肉眼上发肤仍同族（#fe543e vs #c26450 渲染后都读橙粉）——数值达标≠视觉达标，P1。
3. **无颜色刺眼**：全谱发色/肤色均为哑光低饱和（L/S 钳生效），无霓虹色、无外星人绿紫（hairGuess 玩家色调色板已废）。
4. **无几何件堆砌感**：afro/侧锁/刘海读作头发不读作头盔；墨镜片取代眼球（Zoe/Ivy）是正确的「藏眼」而非崩坏；无穿模、无悬浮件。
5. **headproto 管线漂移**（流程性违和）：同案例 av3-verify.json glasses=True 而 headproto 不渲染——取证页与共享提取器不同步，必须钉死单一来源，否则验收材料自相矛盾。

---

## 五、最终判定：**SHIP WITH FIXES**

P0 全清（NaN 死链/肤色写死/秃头反转/猫色错配四大反转级缺口灭失，玩家在真实对局距离已能靠「肤色+发色+发型」认人）；剩余问题全部是 P1/P2 打磨，不构成「不修不发」级。以下 P1 修正指令随本轮或下一微轮落地：

**P1 修正指令**
1. **眼镜渲染对齐（最优先）**：排查 headproto 取证路径为何与共享 avatar-features.js 输出不一致（micah/Jack、micah/Maria、miniavs/Felix、notionists/Felix 四例 verify=True 而渲染无镜）；在 ev-avatars-mono/uno/tod 补这四例的 torus 存在金值断言，钉死「同一输入只有一种输出」。
2. **dylan 肤发分离视觉达标**：在数值门之外加渲染回读探针（脸颊 vs 发壳像素 Δhue≥0.06），红橙系发色向深棕压 L 一档。
3. **胡子召回复测**：toon-head 小胡子（原型曾检出）与 micah 胡茬阈 0.009N 落地核查，进 ev 负/正样本。
4. **倦怠脸微调（P2 可并入）**：上睑线淡化或瞳孔 y +0.01r、嘴宽下限 0.09r；headproto 15 例肉眼回归。
5. **bombcat 打磨（P2）**：橘猫 hue 饱和 52%→60%；猫脸贴片 alpha 抠底去方底残影。

**备案不追**：index 深链副本旧贴片脸（显式降级）；uno 南位无 3D 自我形象（设计如此）；big-smile 眼罩判普通框（SPEC 已备案可接受）。

---

## 判定摘要（≤200 字）

**SHIP WITH FIXES。** 四大 P0 反转级缺口（发色 NaN 黑盔、肤色写死、秃头反转、猫色错配）全部实质修复并在真机证实；headproto 15 例「一眼同一人」均分 2.7（实施前 2.2，改革前 mono/uno 全员 1 分），46° 俯角下肤色/发色/发型三大远读特征在 monopoly 28px / uno 45px 均可辨。未达 3.0 的短板集中且非反转级：6 例戴镜者仅 2 例出镜（取证管线与共享提取器漂移）、dylan 肤发同族、全队「倦怠脸」同质化。按 P1 清单（眼镜对齐金值断言/肤发分离回读/胡子召回/表情微调）修补后即为完整交付。
