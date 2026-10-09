# 头像特征强相似轮 · 玩家模拟走查（brief-av3-sim，2026-10-08，分支 feat/3d-avatars）

用户点名：「将所有游戏选择的头像转化为 3D 人物的 3D 头像，3D 头像的特征要和 2D 头像有非常大的相似点」。
即：玩家在表单选的头像（DiceBear 画风头像为主）→ 牌桌 3D 小人头上的脸，必须一眼认得出是「同一个人」：
肤色、发色、发型轮廓、眼镜、胡子、嘴型等显著特征要带到 3D 头上。

你是真实玩家模拟员。**任务不是改代码，是实跑游戏+截图取证+输出挑刺清单**。所有结论必须有截图证据。

## 现状（你要评审的东西）

| 页 | 3D 人物头像现状 |
|---|---|
| tod.html | 全身小人：头=球面**贴图脸**（头像图画在球面贴片上）+ 玩家色半球头发（buildChar ~:7440） |
| bombcat.html | 同款移植小人（buildChar ~:2703） |
| monopoly.html | 几何处头（颅骨球+发壳+眉+眼+鼻+微笑），但**人人同肤色、同发型**，头像只贡献发色（buildAvatarHead ~:1549） |
| uno.html | 几何处半身像（头+脖子+肩膀），同上（buildAvatarHead ~:1323） |

## 基建事实（照抄，别自己发明）

- Playwright 从 npx 缓存 require：`const PW='C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright'`（node 24）。
- 每个脚本自起 http 静态服务器，serve 仓库根 D:\myidea\truth-or-dare。**你专用端口：A 组 9141，B 组 9143**（都空闲；崩溃不 close 残留就换 9145/9147）。
- 脚本放 `.pw/persona-av3/`（新建目录），截图放 `.pw/shots/av3-persona/`（新建目录）。**禁止改仓库里任何现有文件**。
- tod/bombcat 本地模式直接开 `http://127.0.0.1:PORT/tod.html`（进入即玩）；monopoly/uno 开 `monopoly.html?autotest=1`（确定性种子 + `__mono` 钩子）/ `uno.html?autotest=1`（`__uno` 钩子）。
- **截图前必须 bringToFront + 等一帧 rAF**（后台标签画布冻结会拍陈旧帧）；uno 截图前 `__uno.forceRender()`；monopoly 无此门。
- 头像注入方式参考现成探针：`.pw/ev-avatars-mono.cjs`（NETMODE+`NDOC.players[i].av` 走 `P.avatarUri`）和 `.pw/ev-avatars-uno.cjs`。tod/bombcat 的玩家头像走表单状态（`resolveAvatar`/`p.avatar`），可走 index 表单流或直接改本地状态（参考 .pw 里 persona 探针对 S.players 的注入手法）。
- 头像协议：`dcb:{"s":风格,"d":seed,"b":底色}` 本地 SVG / `av:P##` 预设 / dataURL 上传。dicebear-local.js 提供 `DiceBearLocal.diceAvatar(style,{seed}).toString()` 可在页面里现生成 dataURL。

## 走查任务

选一组特征鲜明的头像（覆盖：深肤色/浅肤色、长发/短发/秃头/丸子头、眼镜、胡子、粉发/蓝发），每个游戏把多个玩家设成不同头像，然后：

1. **tod.html**：进对局，等揭晓近景镜头，近距离截 2-3 个角色的头 vs 他们的 2D 头像并排图。
2. **bombcat.html**：同上（角色站在桌外，转镜头或借揭示动画近距离截）。
3. **monopoly.html**：autotest 局里截棋子近景（idle 环绕镜头），棋子头 vs 2D 头像并排。
4. **uno.html**：截对手半身像 vs 2D 头像并排。
5. 对每组并排图打分：肤色像吗？发型像吗？眼镜/胡子带上了吗？整体「一眼同一个人」1-5 分，**按视觉显著度排序列出缺失/走样特征清单**（例：「2D 是深棕皮肤，3D 是浅橘色——最大违和 P0」）。
6. 特别检查贴图脸（tod/bombcat）斜视角下是否仍有「贴纸感/偏移感」——这是用户上一轮否掉贴图的理由，看 tod/bombcat 是否还留着这个问题。

## 交付

写 `.pw/persona-av3/report-A.md`（A 组）/ `report-B.md`（B 组）：每游戏一节，含：并排截图相对路径、1-5 分、缺失特征按显著度排序、走查中发现的其他视觉问题（如穿模/朝向错/太小看不清）。最后给「3D 头要补哪些特征才能达到『一眼同一人』」的优先级清单。报告写中文。
