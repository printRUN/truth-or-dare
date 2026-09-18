# 3D 界面优化轮 · 挑刺专家评审简报

## 你要审的东西
设计方案：`.pw/design-plan-3d-polish.md`（v1 草稿）。
需求输入：`.pw/report-persona-3d-akai.md` + `.pw/report-persona-3d-tingting.md`（两位真机走查的玩家需求）。
现状代码：index.html 内联 three 模块（6089–6293 行）；可读参考 `.pw/three-scene.src.js`（略滞后，以内联为准）。
现状截图：`.pw/shots/3d-*.png`（改前基线）；`.pw/shots/persona3d-own-far-face.png`（头像脸盘被头球裁剪的实锤）。

## 评审角度（按你的代号二选一）
- **visual**（视觉专家）：方案落地后画面会更好吗？逐项挑：灯光数量与层次（多光源互相打架？）、ACES 色调映射把紫毡/身份色调脏的风险、雾密度会不会把对面人物也雾没了、吊灯构图会不会挡 HUD、牌堆纹理与 DOM 牌背语言是否一致、地毯/霓虹哪些该砍。对每项给出**参数级**意见（色号、强度、尺寸、密度数值）。
- **eng**（工程红线专家）：方案违反 SPEC §2 红线吗？重点核：① shadowMap 在 r128 UMD + 单文件内联下的坑（材质重编译、shader 溢出老 GPU、PointLight castShadow 是 6-pass cube——方案用 DirectionalLight 对不对）；② REDUCED 监听放模块内 vs matchMedia 变更监听的清理；③ D3 seatPos 方案与 syncPlayers 600ms 节询的竞态；④ E1 竖屏插值对 drawing 推镜（z −76）/揭晓镜头的耦合；⑤ 性能预算是否真的守得住（逐帧只写 transform 的现状不能被破坏——阴影贴图渲染算不算破坏、写在哪里）；⑥ 任何对 `#cam > :not(...)` / `window.__three` TDZ / loperf 回退的触碰。每条给**判定（过/修）+ 具体修改指令**。
- **player**（玩家价值专家）：拿两份 persona 报告的【必须】清单对照方案——哪条没被覆盖？哪条方案做过头（炫技大于可读性）？优先级排序：如果只能做 5 件事，是哪 5 件？砍掉的项会不会恰是玩家最想要的？

## 硬红线（方案不许违反，违反即打回）
1. `.world` 禁 preserve-3d；2. loperf/REDUCED 静态退路必须存在；3. 不动 DOM 结构/#three-canvas 特异度/window.__three 位置（chars 声明后）；4. 逐帧禁止新增材质色写入/离屏 canvas 重绘（呼吸只写 transform 的现状保持）；5. 603KB three UMD 不动；6. 单文件离线可用不破坏。

## 产出格式（写进 `.pw/review-3d-polish-<你的代号>.md`，最终回复给全文）
- 总判定：【通过 / 修订后通过 / 打回】
- 逐项意见：编号对应方案条目（A1…G），每条 = 判定 + 参数级修订指令（不许泛泛而谈）
- persona 覆盖核对表（player 必有，其他视角可选）
- 你坚持的底线（哪些指令不可再让步）
