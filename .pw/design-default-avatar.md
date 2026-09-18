# 设计：去除默认头像 → 默认定制头像 + 3D 场景头像转化保持全链路

用户原话：**「将默认头像去除，默认为自定义，头像选择后在3d场景转化为3d头像」**

## 解读（三条逐句落地）

1. **将默认头像去除** = 加入页移除「预设」标签（24 预设格 + 🎲 随机按钮 + av:P01 预选）。预设不再是一等入口；`av:` 短索引协议**保留**（旧房间状态/旧票/旧存档向后兼容，resolveAvatar 不动）。
2. **默认为自定义** = 加入页默认落在「🎨 定制」，且**开箱即用**：boot 生成一张随机定制头像并预选中——什么都不点直接加入，进状态的就是 `dcb:{s,d,b}` 配方（~54B）。定制器里换风格/换底色/🎲 重掷**实时同步**当前选中（所见即所得，不必点「就用它」）；「✓ 就用它」保留作显式确认+toast。
3. **头像选择后在3d场景转化为3d头像** = 选中的头像进牌桌后必须变成 3D 人物的脸（syncPlayers → avatarTexture → 球面脸贴片 v8④/⑬）。管线已存在，本轮保证对**全部头像类型**（dcb: 定制 / 上传图 / 遗留 av: / emoji）逐类 E2E 像素取证；并修复一个边角：`resolveAvatar` 返回空串时脸贴片会以无 map 白片渲染——改为保持上一张/隐藏。

## 参数级改动清单（index.html 单文件）

### HTML（~1431-1441）
- 删 `#avtab-preset` 按钮整行 + `#av-panel-preset` 整块（24 格 + 🎲）。
- `#avtab-custom` 挂 `.sel` + `aria-selected="true"`；`#av-panel-custom` 去掉 `hidden`。
- `#grp-avatar` label 文案去掉「预设 /」：`选个头像（🎨 全 31 风格定制 / 我的，下次访问还在）`。
- `#mine-empty` 文案已兼容（提「🎨 定制」），不动。

### JS
- `avTab()`：循环 `['custom','mine']`（原 `['preset','custom','mine']`）。
- 删 `$('btn-avatar-random')` 监听块（元素已不存在，留了会 null 解引用）。
- 删 `buildAvatarSelector()` 函数与其 boot 调用；`updateSelVisual()` 只查 `#mine-selector`。
- `avatarSel` 初始 `{ rep:'', name:'', tab:'custom' }`；boot 序列在 `refreshCz()` 之后补一句 `selectRep(czRep(), '定制 · ' + (DB_STYLE_CN[cz.style]||cz.style), 'custom')`。
- **boot 换风格随机**：`cz.seed = czRandSeed()` 已有；新增 `cz.style = 随机人物向风格`（从 31 风格里剔除纯抽象的 identicon/icons/rings/glass/initials 5 个）——多人同桌 3D 头像风格各异，桌上一眼分清人。
- **live-follow**：style chip 点击 / 底色点击 / `cz-reroll` 三处，当 `avatarSel.tab==='custom'` 时同步 `selectRep(czRep(), '定制 · …', 'custom')`（tab 是 mine 时不动用户的已选项）。
- `storeDel` 回落：`selectRep('av:P01',…,'preset')` → `selectRep(czRep(),'定制 · …','custom'); avTab('custom')`。
- `applyIdentity` 遗留迁移：`av.startsWith('av:')` 分支从「切 preset tab」改为 **`storeAdd(av)` 收进「我的」并选中**（老用户的 av:P07 刷新后还在、可见、可删，删了按新规则回落定制）。
- `selectRep` 默认 tab 三元 `(rep.startsWith('av:') ? 'preset' : 'mine')` → 直接 `'mine'`。
- `avatarTexture`（3D 侧）空 uri 防御：`resolveAvatar` 返回空时不清掉已有脸贴图（现状会落成无 map 白脸片）。

### CSS
- `.dice-btn` 两条规则删（唯一引用随预设面板一起删）。

### 明确不做
- **加入页实时 3D 预览**：v8 渲染门禁 `frame()` 在 `#screen-game` 非 active 直接早退（性能红线，SPEC §2），join 屏背后是星空背景；为预览常开渲染循环违背架构与性能约定。
- **删除 av: 协议/AVATAR_PRESETS/ensureAvMaps**：旧 retained 状态、旧票、旧 `tod:me` 仍在传 av:，删了会把老用户变白脸。

### E2E（.pw/）
- `test-avatars.cjs`：新增步骤 0（fresh boot：tabSel=avtab-custom、`avatarSel.rep` 以 `dcb:` 开头、预设面板不存在）；步骤 1 不再点 avtab-custom（默认就在）；步骤 8 断言回落=定制配方而非 av:P01。
- `probe-facevisual.cjs`：`.avatar-option >> nth=` 点击改为默认定制直接加入；保留 emoji mutate 分支。
- 新增 3D 脸映射取证：默认定制头像进牌桌后，从 `window.__three.chars` 的 face 材质 canvas 采样与 `resolveAvatar(avatarSel.rep)` 生成图比对（复用 debug-avatar-crop 的采样法）。
- `check-syntax.cjs` 门禁照跑；`test-3d` 回归抽核心段。

### 文档
- SPEC.md：§2 增本条记录；「Avatar options」段落重写（三标签→两标签、默认定制、遗留迁移、回落规则）。
- wiki/design 记一篇。
