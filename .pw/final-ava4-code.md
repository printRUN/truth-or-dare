# final-ava4-code · 头像区分度+发型 v4 轮交付前终审（代码检查官，2026-10-11）

## 判定：**SHIP WITH FIXES**

全部门禁绿（check-syntax / ev-avatars-mono 14·uno 12·tod 10·bc 13 / ev-ava4-pano 4 / 抽查 probe-mono-net 17·probe-uno-net 11 全过），专家 P0 逐条并入有据；唯一功能缺陷=uno 热座 rematch 漏透传 av（一行修），另有一处刺头前向缩放带轴错 90°。

---

## P0

- **P0-1｜uno.html 热座 rematch 漏 av 透传（L2528）**：`btn-rematch` 的 `cfg.players = G.players.map(p => ({ name, bot }))` 无 `av` 字段（mono L3298 已加 `av: p.av || ''`）。startGame（L1711）`av: p.av || ''` 兜成 ''→ refreshSeatAvatars sig 变化→ 全桌 bust 重建为 fb 兜底头。热座 UNO「同班人马再来一局」确定性复现「难看出区别」，打在本轮主目标上。eng P0-4 的 uno 站点清单本身漏开了 rematch（只列 L2473/L2606/L2740），但 brief 声称 uno「对称接线」且 checklist C 明确含 rematch 路径。修法一行：map 里补 `av: p.av || ''`。

## P1

- **P1-1｜spiky 前向缩 0.85 的角度带锚错轴（avatar-features.js L492-493）**：`dAz=|az−π/2|` 收缩带中心在 az=π/2，而 dir=(cos el·sin az, sin el, cos el·cos az) 的 +Z 脸向对应 **az=0**——实际被缩的是头侧 ~3 根刺（az 1.25/2.15/1.98），正面刺原尺寸。visual P1-2 的「前小后大」没实现，反而引入左右冠不对称（读感歪冠）。修法：改为对 `az % 2π` 距 0（mod 2π）度量（中心角 π/2→0/2π）。

## P2（记录在案，不阻塞）

- mono L3618 / uno L2750 的 `mc` Monte-Carlo 钩子 startGame 无 av：纯 bot 模拟入口、无断言消费头像，fb 头无害；eng P0-4 点名的 uno L2740 即此，实施未加——按「非玩家入口」豁免可接受。
- mono L2293 入狱滑行回景 camTo 仍 `dist: baseDist()` 无 OV_DIST_ADD：该场景 autoDist=false 本就不满足 atOverview，下一拍 approachTurn/L621 恢复即拉回 base+1.9，仅 700ms 过渡取景用旧全景距，无卡死路径。
- eng P0-1 门禁加账（bald 三分账 byPin/byVeto/byBanGuess、byVeto>30% 打回）与 P1-1 lab 单头像耗时打点未落 lab-avatars.html——由反转验收锚（Jill/Maria/micah）+bald 12→9+撞脸 0 部分代偿，流程欠账非代码缺陷。
- 几何红线按字面：新 buzz 薄帽/fringe 前帘 sphere 用 (24,10)=既有壳族段数（红线点名的 spiky/curly/mohawk 锥=6 radial ✓、无 curly/twin 球）。可接受。
- lab-ava4-next.js 今日与母本逐字节同 sha（adcbcc72），lab after 证据链闭合；但它是指纹快照，未来改提取器会静默变陈旧（lab 默认加载真源码，仅 ?v=next 受影响）。

## 已核对通过项（简）

- **eng P0-1**：融合劈分（tSkinN>0.025 实测校准带 Maria 数据、种子=顶带/中心带族均值、3 轮、两心距>0.030、合成簇字段照抄 rescue）；pixelBanBald=tAllN>0.05 且 pin 缺席走 guess（pin 明说无发=尊重钉）；detectFaceParts 外提，bald/guess 不再吞墨镜；全部在单一母本。
- **eng P0-2**：Maria→long+真肤（劈分门 0.025 为必要校准——eng 字面 0.05 会漏 Maria 顶带 ~0.04，理由成立）。
- **eng P0-3**：featsSig 六处（mono L1631/L1695、uno L1392/L1451、tod L7577）逐字节一致，含 mouthWide/hairLen/hairWid。
- **eng P0-4**：party-net seatAvatarRep=djb2 确定性（无 Math.random）、14 风格允许名单（升级有据：fun-emoji/bottts 非人协议必兜底，排除 -neutral 线稿秃）、taken 构造性去重、已导出；mono 全入口（startGame/rematch/autotest/saveGame/读取点/HUD/座位行/交接卡/名牌环 avBgColor）✓，uno 除 rematch 外 ✓；mono faceKey 天然感知 ✓。
- **eng P1**：PIN_RASTER_CACHE 128+完整 svg 串 key（L629/L643）✓；pixel-art jag/peaks 归零（L143）✓；ev 热座断言改写 dcb 到位+两两互异 ✓；金值变更走「目检+记录」协议（ava-golds-check.png 第 1/2 列实见 pixel-art 平顶、adventurer 浅肤棕发刘海，uno 旧 #684d35 确系发影棕误判肤）✓；bc 不动 ✓。
- **visual P0/P1**：buzz 摘壳成真类（0.20π+0.06π·len 薄帽，r<0.16 回退短壳）✓；拯救门去极性 pinBald!==true+topMass>0.012 ✓；bunW/bunJag/mohawk 0.60+peaks≥2+bunBlob<0.008/flat 前移+放宽/long sideMass 分支/buzz 收窄+fringe 豁免 ✓；spiky 阈值改 jag>0.026 有重校准数据（真刺 0.065-0.109/光头 0.017）且留 2.5× 边距，理由成立 ✓；bun(0,1.02r,−0.12r)/long 0.22rad/lenK 0.95/fringe 2.05·0.08π·0.32π/flat 0.80-0.83-0.38@0.92r ✓；isBg 0.12/近黑钉暖棕/bald+须 #4a382c/stubble loL 0.22/guess 色微抖 ✓。
- **value**：curly→afro/twin→long 路由+分类保留进 sig ✓；交接卡头像+座位色描边两页 ✓；全景 OV 修复 ev-ava4-pano 实测 cy 738<760、rig.dist=base+1.9 ✓。
- **红线**：avatar-features.js 纯 LF+sha 锁一致（adcbcc72，check-syntax 全绿）；三锚契约未破（tod u.head 身份不变、skull 按 avSkull 只弃几何、headMats 现场重读、uno neck 再链 L1410）；无 alphaTest/transparent；dispose 三页 traverse 与 builder 产物对齐（无跨头共享 geometry，spikeGeo/moGeo 头内共享由 traverse 幂等回收）；parts.hair 计数链保留。
- **热座生命周期**：改名（renderSeats paintAva 实时预览）→重开（btn-start 确定性重派）→续档（两页 saveGame 均带 av，mono Object.assign 透传/uno 显式字段，旧档回落 fb）→bot 座位（热座 seatAvatarRep 覆盖、联机 bot 走 addBotToDoc 既有 av，NETMODE 读 NDOC）四路 ✓（rematch 见 P0-1）；paletteCache key=uri 改名回旧名命中正确，无脏缓存；uno seatAva.sig 吃 G.players.av 后幂等语义保持（ev-uno「sig 无变化零重建」绿）。
- **镜头**：OV_TGT_K/OV_DIST_ADD 四处（focusPawn back/atOverview/sizeScene L1083/revealCard L3226）一致；nearDist 路径不受污染（autoDist=false 闸住覆写点）；REDUCED/bodyLo/TURBO 静态退路零改动。
- **门禁复跑**：check-syntax ALL 13 PARSE✅；ev-avatars-mono 14/0、uno 12/0、tod 10/0、bc 13/0、ava4-pano 4/0；probe-mono-net 17/0、probe-uno-net 11/0。ev-mono-fall 按备案未跑。
- **并行卫生**：tod.html 9 hunk 中仅 L7577 一行属本轮（其余 8 hunk=「信息不遮人」并行 WIP，含 ev-num3d-bc.cjs 铭牌 y 带改写与 bombcat/index 全部改动，均非本轮）；本轮档案（brief/expert/persona/report/lab/ev-ava4-pano）为 untracked 新档，shots/* 为探针再生成物。

## 总评（≤100 字）

上游反转修复实锤、featsSig 六处齐、门禁全绿，工程质地过关。扣船仅两处：uno rematch 漏一行 av 透传（热座重开即全桌兜底头）、刺头缩放带锚错 90° 成歪冠。一行+一角修完即 SHIP。
