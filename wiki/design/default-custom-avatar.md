# 默认定制头像体系（2026-09-18）

> 状态：已实施并双检查官终审。SPEC §2 ⑰ 为权威记录，本文沉淀「为什么这么做」与复查线索。
> 置信度：高（实施当轮 E2E + 像素级取证）。

## 需求原话与解读

用户：「将默认头像去除，默认为自定义，头像选择后在3d场景转化为3d头像」

三条逐句落地：
1. **去除默认头像** = 「预设」标签（24 格 + 🎲）退役；`av:` 短索引**协议保留**（旧 retained 状态/旧票/旧 tod:me 还在传它，删协议=老用户白脸）。
2. **默认为自定义** = 加入页默认「🎨 定制」tab，且**开箱即用**——boot 随机人物向风格 + 随机 seed 并预选中，零点击直接加入进状态的就是 `dcb:` 配方（~54B，与 av:P## 同量级）。
3. **选择后转 3D 头像** = 牌桌 GL 球面脸贴片管线（syncPlayers→avatarTexture）对全部头像类型成立；新增像素级 E2E（材质 canvas vs resolveAvatar 产物，diff=0）。

## 关键决策与理由

- **不做加入页实时 3D 预览**：v8 渲染门禁 `frame()` 在 `#screen-game` 非 active 早退（性能红线），join 屏背后只有星空。为预览常开渲染循环违背架构。
- **boot 随机风格剔除纯抽象系**（identicon/icons/rings/glass/initials/shapes）：3D 桌上要一眼读出「这是个人」；且必须**在 `buildCzStyles()` 之前**定稿，否则 chip 选中态按旧 style 烧死。
- **live-follow 的边界**：`avatarSel.tab==='custom'` 才跟随拨动——「我的」里选了上传图的玩家回定制 tab 拨弄，选中不被抢走；不一致时预览格挂 `.pending`「预览中」角标，把「拨了没生效」从猜变成看。
- **老玩家迁移**：遗留 `av:P##` → `storeAdd` 进「我的」+一次性 toast（解释凭空多出的卡）；`dcb:` → 配方回填定制器落「定制」tab（落「我的」会撞空态文案「还没有你的专属头像」的自相矛盾——挑刺专家逮住的 P1）。回填**置 styleTouched=true**：恢复存档=已表达风格偏好，🎲 换一张只重掷 seed（双检查官意见相左后采纳业务侧——防一次误触把保存的风格冲掉且 UI 无法找回；想整只随机先点任一风格 chip）。删除迁移项时 `storeDel` 同步改写 `tod:me`——不然刷新后 applyIdentity 又把它迁回来+二次 toast（「删不掉」体感）。
- **3D 白片防御（终审修订）**：face 材质无 map 时渲染成白色球面片（MeshBasic 默认白 + alphaTest 0.5 被不透明 alpha 放行）——初始 `color:0xe8b98c` 头球同肤色，解析失败/空串读作裸脸（纹理解码中的数十 ms 瞬态呈深色，可接受）。**但 material.color 会与 map 相乘**（three.js map_fragment `diffuseColor *= texelColor`）——syncPlayers 赋 map 的同一帧必须 `color.set(0xffffff)`，否则全桌脸被染土棕（代码检查官 P1，已修 + E2E 锁 color===0xffffff 不变量）。E2E 的纹理比对是采样制（隔 10 像素/容差 24/diff<400 阈值），量的是纹理 canvas 不是着色输出——着色侧不变量靠 color 断言守。
- **窄屏折叠**：31 chip 全展开把 390×844 的 CTA 顶出屏 242px（实测）；`<620px` 默认折叠成一行「31 风格与底色 ▸」，收起 styles/credit/bgs/acts 后 CTA bottom=819 ≤ 836 验收线。桌面侧栏不受影响（折叠规则全部 media-gated，HTML 常驻 `foldcz` 类）。

## 复查线索（下次动头像先看这些）

- E2E：`.pw/test-default-avatar.cjs`（默认定制 5 步 + 3D 脸像素比对）、`test-avatars.cjs`（定制器/持久化/回落定制）、`test-mask.cjs`（av: 遗留协议单测）。
- 基线留档：`.pw/baseline-default-ava.cjs` + `shots/base-join-avatar-before.png`（改版前三标签证据）。
- 悬空引用红线：`#avtab-preset`/`#av-panel-preset`/`#btn-avatar-random`/`buildAvatarSelector` 已全部移除——**恢复任何预设 UI 时记得同步恢复对应监听**，监听留而元素删=整页顶层 TypeError（主脚本其后所有语句不执行，挑刺专家标过 P0）。
- 测试口径：预设 UI 删除后 `.avatar-option` 第 0 个=定制预览格（可见），≥1 都是「我的」隐藏格——E2E 点头像一律 nth=0 或 `:visible first()`；3D 模式断言用 `S.turn.stage` 而非 DOM 可见性（test.cjs 的 `waitCardShown`/`waitDeckShown`/`domClick` 三件套是模板）。
