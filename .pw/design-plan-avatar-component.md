# 设计：头像表单下沉为全游戏共用组件（去默认 24 预设，接入 tod 定制器）

> **v2 终稿（2026-09-20）**：挑刺专家判定 SHIP WITH FIXES，F1-F12 修订全部收编；玩家 persona 走查实证两条关键现状——①现网「默认头像」根本不随机（`+localStorage.getItem(...)` 把 null 变 0，全员落第 0 格「月白」，party-net.js:1219）；②24 预设里 10 张 shapes 抽象脸恰是 tod 定制器 `CZ_ABSTRACT` 判定「读不出人」排除的素材。修订要点：F1 `presets:[]` 防必崩引用；F2 `av:` 遗留协议改「只读渲染映射」进组件（共享库 tod:avatars:v1 里确实有 tod applyIdentity 迁入的 av:P## 条目，不收必裂图；且这些条目不渲染删除角标，防 tod 侧复活）；F3 新探针端口改 8933（8931 被 probe-remember-me 占用）；F4 抽取落盘 LF + check-syntax 加 EOL 归一漂移门禁（index.html 现为 CRLF，「逐字节+LF」二选一是伪命题，门禁才是本体）；F5 boot「已存有效 rep 优先」+ selectRep 每次写 key:avatar（否则刷新换脸）；F6 storeAdd/Del 先重读 localStorage 合并再写 + storage 事件监听 + 删正用头像回写 key:avatar；F7 bot 配方内联生成禁拨 cz；F8 probe-mono-net/diag-mono-net A0 改 `.pnav-chip`===31 且首 chip img 为本地 data:image/svg（兼作 bundle 加载门禁）；F9 avatarUri 存在性守卫 `window.DiceBearLocal && typeof diceAvatar==='function' && Array.isArray(STYLES)` + 大厅 img onerror 首字母兜底；F10 折叠纯 CSS（fold 类常挂 + 仅媒体查询内启用）；F11 shapes 旧数据渲染变样写进 SPEC（可接受，retained 30 分钟过期）；F12 探针补 390×844 折叠/首屏断言。chips 清单组件内硬编码 31 名（无 bundle 也全功能走 CDN），本地生成断言改由「chip img src 前缀 data:image/svg」承担。

用户原话：**「不要用默认的头像，当前真心话大冒险已经有现成的表单选择，定制化这些一模一样当组件一起用就好了，其他所有游戏都用该组件」**

## 现状（2026-09-20 摸底）

- **tod（index.html）join 屏 = 母本**：两标签头像表单（🎨 定制 / 我的）——31 风格 DiceBear **本机生成**（`DiceBearLocal` 2MB IIFE 内联，零外网）+ 8+1 底色 + 🎲 换一张 + 「✓ 就用它/💾 保存到我的」+ 📷 上传（96px JPEG ~9KB）+ 我的库（`tod:avatars:v1`，cap 30）+ 两连点删除。选择模型 `avatarSel{rep,name,tab}`；rep = `'dcb:{s,d,b}'`（~50B 进状态包）/ dataURL / 遗留 `av:P##`。boot：`cz.style=czPersonaStyle(); cz.seed=czRandSeed(); selectRep(czRep(),…,'custom')` 开箱即用。
- **party-net.js v1 现状**：进房表单是 24 张硬编码预设格（`AVATAR_PRESETS`，seed=`AV_SEED-A##`），`picked` 存**索引**于 `key+':avatar'`，`myAvatar()=makeRecipe(i)`；`avatarUri` 走 api.dicebear.com **CDN**（shapes 特例丢失、断网即无脸、31 chip 交互无从谈起）。
- **宿主**：monopoly.html / uno.html 各 ~150 行适配层，头像只经 `P.avatarUri(rep)` 出 HUD `<img>`；`P.presets/P.myAvatar/P.avatarName` 无人消费。setup 面板 `.panel` max-width 420px 可滚动。CSS 变量三页同源（--primary/--accent-cyan/--accent-pink/--glass-border）。
- **bombcat**：独立 worktree（D:/myidea/truth-or-dare-bc，feat/bombcat-lobby），尚未接 party-net——按并行共存契约本轮不动，其接入时按 §1.9 契约自然继承新表单。

## 方案（主战场 party-net.js + 新文件 dicebear-local.js）

1. **新文件 `dicebear-local.js`**：把 index.html 行 2058 的 IIFE（2,041,557B，`var DiceBearLocal=(()=>{…})();`）+ 尾部 license 注释**逐字节**抽出成独立文件（LF 行尾）。monopoly/uno 在 party-net.js 之前 `<script src>`。**index.html 一字不动**（其内联副本即母本；three.js sha 三方门禁不涉此段；避开并行会话撞车）。
2. **party-net.js 定制器化**：
   - 删：`AVATAR_PRESETS` 24 预设表、`pn-avgrid/pn-av/pn-avname` UI、`pickedAvatar()` 索引持久化、`avSeedPrefix` 语义（cfg 字段保留接收但作废，防宿主旧调用报错）。
   - 移植 tod 全套（逐字等价，ID 改 root 级 class 查询）：`makeRecipe/recipeToUri`（含 `DCB_CACHE` 400 防涨 + **shapes→bold 三色池特例**，否则假面系列与 tod 渲染不一致）/`svgUri`/`resolveAvatar`（dcb + dataURL 直通；`av:` 遗留协议组件从未发过，不收）/`DB_STYLE_CN/CZ_BGS/CZ_ABSTRACT/czPersonaStyle`/cz 状态机/两标签 UI/我的库/上传压缩/两连点删除/boot 随机定制开箱即用。
   - **我的库与 tod 共用同一 key `tod:avatars:v1`**（同一浏览器=同一人，存的头像全游戏通用）；「删正用着的回落定制」逻辑随库走（无 tod:me 同步需求）。
   - 选择持久化：`key+':avatar'` 改存 **rep 字符串**（旧数字值视为无效 → 走随机定制 boot；旧 retained 房间文档里的 `dcb:{…MONO-A05…}` 配方 31 风格表全覆盖，渲染不受影响）。
   - `avatarUri(rep)`：DiceBearLocal 在 → dcb 本地生成（各端逐字节一致）；dataURL → 原样返回；**无 DiceBearLocal（宿主漏带 script）→ CDN 兜底**（shapes 色彩特例退化为 CDN 默认，可接受降级）→ 再不行首字母圆。
   - UI/CSS：`pnav-*` 前缀自注入（组件注入纪律），视觉值逐条拷贝 tod（av-tabs 胶囊 / cz-chip 58px / cz-preview 96px / pending 虚线角标 / mine-wrap 删除角标…），var 全带兜底值；**≤619px 默认折叠**（`pnav-fold` 初始类 + 展开钮），桌面常开——tod 踩过的「31 chip 把 CTA 顶出首屏」坑直接绕开；420px 面板内 chip 自动折行、面板自身可滚。
   - 机器人头像：`addBotToDoc` 给 bot 随机人物向配方（不再首字母圆，与「去默认头像」一致）。
3. **宿主 monopoly/uno**：各加一行 `<script src="dicebear-local.js"></script>`；适配层零改动（`netAvatarHtml` 走 `P.avatarUri` 自动本地化）。
4. **探针**：probe-mono-net A0「24 头像格」断言改为新表单断言（31 chip/两标签/预选 rep 以 `dcb:` 开头）；新增 `probe-avatar-picker.cjs`（端口 8931，monopoly+uno 双页）：定制器拨风格/底色/🎲 所见即所得、💾 入库「我的」、📷 上传、删两张回落、入房 `players[0].av` 以 `dcb:` 开头、大厅行 `<img src="data:image/svg+xml…">`、刷新回填。
5. **门禁扩展**：check-syntax.cjs 把 dicebear-local.js 加进 new Function 白名单。
6. **文档**：SPEC §1.9 追加「头像定制器化（v1.1）」小节；wiki 记一篇。

## 明确不做

- **index.html 不迁移到组件**：join 屏与 arcade 门禁/战绩深度耦合，SPEC §1.9 既定「组件母本即它」；其内联 DiceBearLocal 保留（仓库 ~2MB 双份是刻意代价，换零风险）。
- **bombcat.html 不动**（别的 worktree）。
- 昵称跨游戏共享 / `tod:me` 迁移（非本任务）。

## 风险清单（给挑刺专家的靶子）

1. pn-form 变高：420px 面板可滚 + ≤619px 折叠是否足够？大厅/热座 details 会不会被推走？
2. `dcb` 配方带 `"n"` 字段的旧数据（party-net 旧预设）进 `recipeToUri` 是否安全？
3. 上传 dataURL ~9KB 进 retained 状态包：monopoly 4 人 × 心跳重发，MQTT 5s PUBACK 超时余量够吗？（tod 16 人同带宽数据已长期实证）
4. probe-mono-net/probe-uno-net/persona 回归锁里还有哪些 `.pn-av`/头像耦合断言要跟着改？
5. CDN 兜底路径与本地生成路径的 shapes 不一致，会不会让「同房不同端」显示不同脸？（DiceBearLocal 缺失是唯一触发条件——两宿主都带 script 后理论不可达）
