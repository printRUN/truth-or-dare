# 视觉挑刺专家评审 · ava4 发型轮（expert-ava4-visual.md）

**判定：SHIP WITH FIXES**（方向对、撞脸指标真实改善，但 2 个 P0 必须先修：buzz 几何实为 no-op、bald 判定存在反向极性漏洞；修完必须重出对照板复验 A 清单 7 个劣化行）

评审材料：ava-compare.png（25 行逐行 3x 放大）、ava-lab-before/after.png、ava-cmp-new.json（80 案 feats 逐条核对）、lab-ava4-next.js（hairMaskMetrics L80-130 / hairStyleOf L133-146 / buildAvatarHead L376-569 逐行读）、ava-mono-hotseat / ava-uno-net-host / ava-tod-feats、report-ava4-persona-mono.md + report-ava4-persona-uno.md。

---

## A. 「发型更像 2D」逐案判定（25 行全判）

✔=更像 / ✘=变差或假改善 / ○=持平（2D|旧|新三联 + cmp-new.json feats 交叉核对）

| 行 | 案例 | 判定 | 一句话 |
|---|---|---|---|
| 1 | pixel-art P00→flat | ✔ | 方顶+直刘海贴 2D，本轮最佳行之一 |
| 2 | pixel-art P09→flat | ○ | 2D 是蓬圆不是平顶，圆柱略"桶"，但刘海改善 |
| 3 | adventurer B2-1→buzz | ✘ | **假改善实锤**：2D 明显有发髻+侧分刘海，3D 渲染与旧 3D 几乎同壳（见 P0-1），应为 bun/fringe |
| 4 | adventurer C3-2→fringe | ✔ | 粉发前帘位置对 |
| 5 | adventurer D4-3→buzz | ✘ | 2D 是典型黑刺头，判 buzz 且渲染同旧壳，应 spiky |
| 6 | avataaars D4-3→bun | ✘ | **假丸子**：2D 是短夸发（quiff），无丸 |
| 7 | big-smile C3-2→buzz | ✘ | 2D 金色长发+眼罩，长发全丢（new 与 old 视觉同壳），应 long |
| 8 | big-smile D4-3→fringe | ✔ | 直刘海对 2D |
| 9 | micah C3-2→spiky | ✔~ | 夸发≈刺头方向对，但刺稀疏如"荆棘"（见 P1-2） |
| 10 | micah D4-3→spiky | ✘~ | 2D 光头被判 spiky；发量倒是比旧 bob 少了，但类错 |
| 11 | miniavs B2-1→fringe | ✔~ | 发量上去了，但 2D 是后掠蓬巴杜，前帘方向不对 |
| 12 | open-peeps B2-1→bun | ✘~ | 2D 是平顶盒（hi-top），应 flat；顶部"有物"算半个信号 |
| 13 | open-peeps C3-2→fringe | ✔ | 与旧接近、帘稍深，微改善 |
| 14 | open-peeps D4-3→buzz | ✘ | 渲染与旧同壳（P0-1）；且 2D 灰白发提成了 #040303 近黑 |
| 15 | personas A1-0→mohawk | ✘ | **假莫霍克**：2D 是发带+黑发，判成莫霍克几乎剃光 |
| 16 | personas D4-3→fringe | ✔~ | 微改善 |
| 17 | toon-head A1-0→fringe | ○ | 旧 bob 本来就对 |
| 18 | toon-head B2-1→bun | ✔ | 2D 顶髻对顶髻，本轮样板行 |
| 19 | toon-head C3-2→bun | ✘ | **假丸子**：2D 蓬乱短发无丸 |
| 20 | avataaars B2-1→long | ○ | 旧已对（头巾读作 long 可接受） |
| 21 | big-smile B2-1→long | ✔ | len0.9 侧垂锁过颌，贴 2D |
| 22-24 | pixel-art P01/P03/P13 | ○ | afro/bald 维持 |
| 25 | avataaars A1-0→bald | ○ | 2D 红大胡子+白头巾均未表现（旧同）——见 P2-5 |

**计分：✔7 / ✘7 / ○11。**「更像 2D」只在约 3/10 的展示行成立；且所有 ✘ 里没有一行是"几何画错了"，全是**分类错或 buzz 假改善**——修分类+P0-1 后这 7 行大多能翻成 ✔。

## B. 新几何模板质量（逐模板参数修订）

实测基准：r 归一（头球半径=1），lab 渲染 r0.2、uno 半身 r0.16、mono 棋子 r0.1。

- **buzz（P0 级）**：`shaved` 只含 mohawk（L397），buzz 走 `!shaved` 分支 → **先加满 short 壳（0.31π+0.38π）再叠 0.22π 薄帽 = short+0，视觉 no-op**。对照板 3/14 行"新 buzz"渲染出完整 bob 即此 bug 直接证据，7 行（len0.6 浅色）只是颜色浅看不出来。修法见 P0-1。
- **spiky**：现 8 根 / Cone(0.13r, 0.52r, 6) / el 1.05−(i%2)·0.22 / az+0.35。板上读感=稀疏天线刺，冠顶覆盖率不足，42° 俯视每刺仅 ~3px。修订：数量 8→**12**（外环 7 el=1.15、内环 5 el=0.90，az 各偏 0.35/0.72），Cone 半径 0.13→**0.155r**、长 0.52→**0.60r**；正面 ±0.6rad 内的刺 scale **0.85**（前小后大，贴 2D 刺头透视）。
- **fringe**：Sphere(1.05r, φStart π/2−0.95, φLen 1.9, θStart 0.10, θLen 0.30π)。渲染良好（行 4/8/13），仅侧缘与后壳有接缝。修订：φLen 1.9→**2.05**（包到颞角），θStart 0.10→**0.08**、θLen 0.30π→**0.32π**（帘底再压 2°，仍不遮 0.48r 眼心）。
- **flat**：Cylinder(顶 0.74r, 底 0.86r, 高 0.34r) @ y=0.88r。**倒锥（上窄下宽）读成桶帽/菲斯帽**，且 hairBack 0.38π 在前缘露出"帽檐"悬边（行 1）。修订：顶 0.74→**0.80r**、底 0.86→**0.83r**（近直筒微扩），高 0.34→**0.38r**、y 0.88→**0.92r**（顶面抬到 1.11r，俯视更醒目）；flat 时 hairBack θLen 0.38π→**0.30π** 杀掉悬边。
- **mohawk**：5 锥 / Cone(0.16r, 0.55r) / 间距 0.42rad。锥底弧隙 0.39r>锥径 0.32r → **脊断裂成独角**（行 15 恶果被假阳性放大）。修订：5→**7** 锥、间距 0.42→**0.30rad**、Cone 0.16→**0.19r**、长 0.55→**0.62r**、基径 0.94→**0.92r**。
- **bun**：0.36r @ (0, 0.98r, −0.30r)。uno 南位前视被颅球遮（uno 报告§三实锤），v4 未动。修订：0.36→**0.34r**、z −0.30→**−0.20r**、y 0.98→**1.02r**、scale(0.92,1,0.92)——南位能露弧、俯视仍凸。
- **long**：锁 0.34r scale(0.80, 2.05·lenK, 0.78) @ (±0.88r, −0.42r−0.22·len)。行 21 读感好，**免修**；仅 lenK 下限 0.85→**0.95**（len=0 的 long 别短过颌）。
- **curly / twin**：80 案 0 命中，几何无法证伪。**备案保留**，下轮实验室强制夹带 personas/George（双马尾）、adventurer/Prem、一例中卷各 1 seed 验证再调。

## C. 分类误判（hairStyleOf 阈值修订）

80 案 feats 逐条核对出的错判（不止对照板 7 行）：

1. **假 bun ×2**（avataaars D4-3 夸发、toon-head C3-2 蓬乱短发）：`bunBlob>0.012 && maxRowW<0.60`（L139）对任何"头顶中央有凸起"的造型都放行。修订：hairMaskMetrics 增列 **bunW**（fy<0.13 带内最大连续行宽）与 **bunJag**（该带 edgeJag），bun 判据改为 `bunBlob>0.012 && bunW<0.30w && bunJag<0.020 && maxRowW<0.55`——丸子窄而圆滑，夸发/乱发过不了。
2. **假 mohawk ×1**（personas A1-0 发带）：`centerBias>0.52 && sideMass<0.012 && maxRowW<0.55`（L135）被"发带压住两侧"的发型命中。修订：centerBias 0.52→**0.60**，且追加 `peaks>=2 && bunBlob<0.008`（真莫霍克矢状脊有起伏；发带平滑顶不过）。
3. **假 spiky ×1**（micah D4-3 真光头，噪声峰）：`peaks>=5 && edgeJag>0.028`（L140）无质量门槛。修订：追加 `topMass>0.030`。micah C3-2（真夸发）topMass 足够，不受影响。
4. **漏 flat ×1**（open-peeps B2-1 hi-top→bun）：`flatTop` 要求 flatN>0.30w 且 span>0.45w（L127）过严，且 flat 判在 bun 之后。修订：flatN>**0.22w**、span>**0.34w**，并把 **flat 分支移到 bun 之前**（bun 新判据已收窄，无互抢风险）。
5. **长发塌 buzz ×1**（big-smile C3-2，紧贴头侧的长发 dropJaw 不达）：long 判据追加或分支：`hairLen>0.85 && sideMass>0.012` → long（L137 处）。
6. **buzz 过宽 ×2**（adventurer B2-1 有发髻、open-peeps D4-3 有盘发）：`topMass<0.020 && maxRowW<0.45`（L144）太松。修订：`topMass<0.014 && maxRowW<0.42`；并在 fringe 判据处对 `fringe>0.006 && sideMass<0.020` **豁免 maxRowW<0.62**（接住侧分刘海）。
7. **假 bald ×1（P0 级，极性漏洞）**：micah A1-0（2D 满头黑发+眼镜+领带）lab 后网格判 bald 渲染光头蛋。路径：pinBald===true（钉扎说有发）但像素 hairC 找不到 → L216 拯救门要求 `pinBald===false` 不放行 → L285 else 直落 bald。**pin 两极性都会到 bald，但只有 false 极有拯救**。修订：拯救条件 `pinBald===false` 删去，改为 `topMass>0.012` 单门；bald 终判前加像素硬门 `topMass<0.008` 否则强制 guess 路径。brief 的「bald12 真实秃」结论**被此例证伪**，修后 bald 分布须重测（预计 12→10±，撞脸重算）。

## D. 角度鲁棒性（mono 俯视 42° / uno 南位 / tod 近景）

- **顶轮廓四类**：bun（修订后）/flat（顶面 42° 高亮）/mohawk（矢状线）在俯视下均可读，成立。
- **spiky 俯视弱**：现参数每刺 0.165r 外露、半径 0.13r，42° 下 ~3px 点刺；按 B 清单加密加粗后约 5-6px，过线。
- **buzz 在 r0.1 不可用（P1 级新发现）**：薄帽 1.03r=3% 外皮，r0.1 时 **0.3px**——mono 棋子上 buzz 与 12 颗 bald 视觉全同，比 2D 真相更秃，违背本类自订红线「绝不能比 2D 更秃」。修订：builder 内 `r<0.16 && style==='buzz'` 时回退 short 壳（0.31π）。
- **uno 南位**：bun 按 B 清单前移后可读；long 侧锁现状可读（uno 报告 1 分是旧提取器把 4 人全判 short/bald，非几何问题，v4 分类修复后自然受益）。
- **tod 近景**：行 18（bun+须）、行 21（long）在 r0.2 均一眼可读；房主背面视角 hairBack 0.38π 够厚，无需跟随 uno 报告 P2-5。

## E. 颜色/材质

- **近黑发的脏色**：#010100（clampColor 后 HSL(0,0.6,0.10)）在场景灯下发橄榄绿/暗褐（行 12 新旧一致，非 v4 新引入，但新几何让它更显眼）。修订（P2）：clampColor 入口处源 L<0.06 时 h 设 0.07（暖棕）、S≤0.35，杜绝黑底噪声色相。
- **灰白发提成近黑**（行 14，#040303）：浅色簇被 isBg(dist<0.16) 吃掉的假设最可能。修订（P1 验证项）：isBg 阈 0.16→**0.12**，并在 lab 复测 open-peeps D4-3 与 notionists B2-1（白纸色 #e3ece7 afro 发绿同源问题）。
- **bald 胡子吃座位色（P1）**：style=bald 且 F.hair=null 时 hairCol=fallbackHair(colorIdx)（L380），颌壳+髭被染成玩家色（tod 里即座位色）。修订：该分支 hairCol 兜底 **'#4a382c'**，不走 fallbackHair。
- **deep-skin 秃头茬不可见（P2）**：stubble=clampColor(skinCol,0.30,…)，深肤 L 恰 0.30 时茬=肤。改 loL 0.30→**0.22**。
- 头盔感：fringe/flat 新模板未引入明显"头盔感"（壳缘即发缘，行 1/4/8 可证）；眉色 browClamp 在新发色域无新增事故。整体过关。

## F. bald 12 例全同头表态

**可接受，但"12 例全是真实秃"的前提已被证伪**（见 C-7，micah A1-0）。纯秃 2D 就秃，同头是忠实；身份区分交给须/镜/肤色/发茬壳（r≥0.16 已有）。修完 C-7 后预计剩 ~10 例真实秃+2 例转 guess/有发，届时若 mono 42° 下仍嫌同质，方案是给 bald+beard 者的颌壳（已有）而非给假发——不要为了区分度给秃头扣发。

---

## P0（必须修才能实施）

1. **buzz=short+0 假改善**：buildAvatarHead L397 `shaved` 增补 buzz（`F.style==='mohawk'||F.style==='buzz'`），buzz 仅渲染薄帽；薄帽参数 θLen `0.20π+0.06π·hairLen`、半径 `1.03+0.01·hairLen`。修后重出 ava-compare 板，复验行 3/7/14 三行"新>旧"才许过门。连带：buzz 4 案与 bald 12 案的视觉撞脸复测（r0.16 以下按 P1-4 回退壳）。
2. **bald 反向极性漏洞（假 bald=特征反转）**：按 C-7 修——L216 拯救门去 `pinBald===false` 改 `topMass>0.012` 单门；bald 终判前像素硬门 `topMass<0.008`，否则走 guess。修后重跑 80 案，classHist.bald 与撞脸数重新过门（原门撞脸≤5/distinct≥44 按新分布重算）。

## P1（实施时应修）

1. **hairStyleOf 六处阈值**：按 C-1..C-6 全量修订（bunW/bunJag 新度量、mohawk 0.60+peaks、spiky topMass>0.030、flat 前移+放宽、long sideMass 分支、buzz 收窄+fringe 豁免）。
2. **spiky 几何**：8→12 刺双环、Cone(0.155r,0.60r)、el 1.15/0.90、前向刺 scale 0.85。
3. **mohawk/bun/flat/fringe 几何**：按 B 清单数值（mohawk 7 锥 0.30rad 间距；bun 0.34r 前移 z−0.20r；flat 近直筒 0.80/0.83/0.38r@0.92r+hairBack 0.30π；fringe φLen 2.05、θ 0.08π/0.32π）。
4. **buzz 在 r<0.16 回退 short 壳**（mono 棋子 0.3px 薄帽=读秃）。
5. **bald+beard 发色漏座位色**：F.hair null 且 bald 时 hairCol='#4a382c'。
6. **浅发吃 bg 复测**：isBg 0.16→0.12，重测 open-peeps D4-3 / notionists B2-1 发色（灰白→近黑/纸绿两案）。

## P2（备案）

1. 近黑发色相噪声：源 L<0.06 时 hue 钉 0.07、S≤0.35（治橄榄绿脏色）。
2. bald 秃头茬深肤不可见：stubble loL 0.30→0.22。
3. curly/twin 0 命中：下轮实验室强制夹带 personas/George、adventurer/Prem、中卷各 1 seed 验证。
4. guess 12 案全落同款棕 bob：#4a382c 按 seed 哈希 hue ±0.02 微抖（同房多 guess 不再同色同形）。
5. avataaars A1-0 红大胡子+白头巾未表现（beard=false 待 pin 复核；头饰本轮无帽子概念，明确出范围）。
6. shapes 10 案（非人协议）仍是"同形蛋只换帽色"：2D 本抽象，可接受；如要进一步可全部走 bald+须随机。

---

**总评（<100 字）**：骨架对了——撞脸 12→0 是真的，flat/fringe/bun/long 四类有样板级好行（1/8/18/21）。但 buzz 是假类（壳没摘），bald 有假阴性，7/25 行被分类拖累反而更假。阈值按单修订、P0 两项修完重出对照板，再谈实施。
