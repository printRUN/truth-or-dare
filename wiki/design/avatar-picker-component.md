# 头像定制器组件化（party-net v1.1）

> 2026-09-20。用户点名：「不要用默认的头像，当前真心话大冒险已经有现成的表单选择，定制化这些一模一样当组件一起用就好了，其他所有游戏都用该组件」。
> 档案：`.pw/design-plan-avatar-component.md`（v2 终稿，挑刺专家 F1-F12 全收）+ 双检查官终审（代码：SHIP WITH FIXES 1×P0；业务：SHIP WITH FIXES 1×P1）。SPEC 权威条目 = §1.9.1。

## 决策与理由

1. **主战场是 party-net.js，不是 tod**。tod（index.html）是母本且 SPEC 既定「本体不迁移」（join 屏与 arcade 门禁/战绩深耦）；仓库因此多一份 ~2MB 的 `dicebear-local.js`（index.html 内联 DiceBearLocal 的逐字抽取副本）——这是「不动 index.html」红线的刻意代价，check-syntax 加了 EOL 归一漂移门禁拦单边腐化。曾否决：塞进 party-net.js（组件 50KB→2MB，探针全陪跑）、CDN 渲染（断网/file:// 红线 + shapes 特例无法复刻）。
2. **「默认头像」本来就没工作**：v1.0 `+localStorage.getItem(...)` 把 null 变 0，随机分支是死代码，所有新玩家都落第 0 格「月白」；且 24 预设里 10 张 shapes 抽象脸恰是 tod 自己 `CZ_ABSTRACT` 判定「读不出人」排除的素材（persona 走查实锤）。换定制器是纠错不是翻新。
3. **共享「我的」库**（`tod:avatars:v1` 同 key）是产品语义的一部分：同一浏览器同一人，存的头像全游戏通用。遗留 `av:P##` 条目（tod applyIdentity 迁入）**可选可发、不可删**——删了 tod 侧 boot 会再迁回并重复 toast。
4. **bot 也给随机人物向配方**（`P.addBot()`），且禁拨宿主正在用的 `cz` 活状态（会偷换 pending 预览）。

## 红线（新增/重申）

- **宿主必须在 party-net.js 之前 `<script src="dicebear-local.js">`**；组件对 `window.DiceBearLocal` 的每个触摸点都有存在性守卫（`hasLocalDice()`），缺失退 CDN。
- **dataURL 进 `avatarUri` 必须过严格 base64 白名单**：rep 会经宿主 `innerHTML` 插值（两宿主 `netAvatarHtml`），任意 `data:` 串 = 对端伪造状态包的远程注入面（终审 P0）。两宿主另做了引号转义纵深。
- **buildAvatarUI 必须在 form 入文档后调用**：定制器构建/boot 全按 `root.querySelector` 找元素，detached 树上全静默 no-op（localStorage 照写、UI 全空——实测踩过，症状极迷惑）。
- **类名后缀一致性**：tab/panel 是 `custom|mine` 后缀（曾写成 `cust` 导致 `t===which` 永假、切不回定制标签）；foldcz 类无条件常挂、只在 `@media (max-width:619px)` 内生效（纯 CSS 折叠，无 resize 监听）；注入 CSS 的 reduced-motion 块**只许列组件自有类**（裸 `.btn-primary` 会全局命中宿主按钮）。

## 语义速查

- **v1.2 起「拨了即用」**：拨风格/底色/🎲 任何标签下立即生效，「✓ 就用它」「预览中」角标已删，预览格纯展示；💾 存进我的=入库动作（留 在定制页），📷 上传不切页。组件语义自此**有意超越 tod 母本**（tod 仍保留确认流），以组件为准。
- boot：`key:avatar` 有 dcb → 回填定制器（styleTouched=true）；dataURL / av: → 落「我的」；无效（v1.0 数字索引）→ 随机人物向风格开箱即用。selectRep 每次写 key:avatar。
- 删在用头像 → 🎲 换 seed 回落定制（rep 必重写）；删遗留 av: 项被 UI 禁止。
- 已知竞态存量（刻意冻结 index.html）：tod 页开着时其整对象回写可吞组件侧一次增删；组件删 `tod:me.avatar` 引用的配方会被 tod 复活。

## 布局速查（v1.2）

- 表单首位=头像区（`form.insertBefore(group, form.firstChild)`——buildAvatarUI 等 form 入文档后才跑，append 会掉到昵称下面）；其后昵称 → 创建 → 房号+加入 → 提示。
- 定制器内部：tabs → [预览 96 ｜ 💾 存进我的（右对齐垂直居中）] → [🎲 + 9 色点独占一行] → 31 chip（max-height 150 滚动）→ 版权行 → avname。
- 断点：≤619px 默认折叠（foldcz 常挂纯 CSS）+色点 24px；≤359px 磁贴 48/chip 52。设备扫描 320/390/740×360/768/1280 无横向溢出（probe-avatar-picker B 段）。

## 测试口径

- `probe-avatar-picker.cjs`（8933，47 断言）= 本特性回归锁：所见即所得/入库/刷新三路回填（dcb、dataURL、av:）/删除三路/数字迁移/上传/入房 dcb/大厅 data:svg/390×844 折叠首屏。
- 改 party-net.js 三处联跑不变：probe-mono-net(8911)/probe-uno-net(8913)/check-syntax；本轮 A0 已改「31 chip + 首 chip data:svg + 两标签 + dcb 入房」。
