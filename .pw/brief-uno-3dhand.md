# 评审简报:UNO 3D 手牌全端化——去 2D 浮层(2026-09-24 第五轮)

## 用户需求
「uno 如果 3D 卡片可以替代 2D 卡片就不需要 2D 的卡片,适配手机端和平板和 PC 端」+ 手机截图(手牌浮层 2D 卡)。
即:WebGL 可用时,3D 手牌是唯一手牌 UI(手机/平板/PC 全端可用);2D 浮层不再自动接管。

## 取证(.pw/ev-uno-multi.cjs,端口 8963,截图 ev-multi-*.png)
10 张手牌、各视口邻牌中心距(=露出条宽):
- 手机 375×667:**13px/条,整扇 121px**(camApply 宽度适配备 `4.6/(halfV·aspect)` 在竖屏把半宽撑到 4.6 世界,整套桌子塞进 375px)——3D 完全不可用,这正是浮层存在的理由。
- 平板 768×1024:28px/条,扇 256px。
- PC 1100×800:42px/条,扇 380px。
- PC-L 1920×1080:57px/条,扇 514px。

## 整改方案
### A. 竖屏取景重构(camApply)
`d = Math.max(6.4, (aspect < 0.9 ? 2.2 : 4.6) / (halfV * aspect), 9.3项) * focusK`
——竖屏半宽 4.6→2.2 世界:框住「南位扇+牌堆±1.15+方向环 1.5+色环 1.9」,对手与桌面仍在画面;预计手机条宽 13→~25px、扇 121→~270px(70% 宽)。横屏(aspect≥0.9)逐位不变(ev-uno-verify U1/U2/U2b、ev-handontable 全在横屏视口)。
### B. 贴桌轮抬起=全端「看全脸」(替代浮层职责)
- `kSelScale = Math.max(fanScale, innerWidth < 700 ? 1.6 : 1.15)`:抬起的牌放大(手机 1.6×≈58×80px,PC 1.15×),不再是缩扇里的迷你牌。
- `riseY = 0.84 + (CARD_H/2)·kSelScale·sin(0.98)`(0.84=rest 牌顶 0.69+0.15 余隙;现 1.35 常数删除)。rotation.x 0.98 不变。
### C. 去浮层(GL-on)
- pickHand 删压缩分支(>12/小屏>9 → openHandOverlay)。
- showActions 的「手牌(n)」按钮仅 `!G.gl` 渲染(GL-off 2D 退路没有 3D 手牌,浮层是它唯一手牌面,必须保留)。
- openHandOverlay/关闭逻辑保留(GL-off 专用),GL-on 全路径不再触达。
### D. 可出性断言口径
`__uno.cards()` 增加 `play` 字段(iAct && canPlay(cd)),probe-uno A2/A3 的 playable/dim 计数从 DOM `.hcard.playable` 迁到 `cards().play`。
### E. 探针迁移
- probe-uno A4-A8:浮层点卡 → `cardScreenPos(k)`(显示序)+ `#act-play` 确认(ev-handontable 已示范该流);B2(gl-off)浮层路径保留不动。
- probe-persona-uno H2(375×667 小屏出牌):同上迁 3D 流。
- ev-cardstack B(UNO 浮层堆叠)/ev-uno-face B(浮层 img):改 gl-off 上下文跑(它们验证的浮层只在 GL-off 存在);bombcat 部分/3D 部分不动。
- ev-uno-multi 升级为验收:各端条宽 ≥ 阈值(手机 ≥20px)。

## 待挑刺点
1. camApply 竖屏 2.2 半宽:对手位(z=-1.29)、方向环 1.5、色环 1.9~2.06 是否全在画面;手机上 flyToPile 起点南位、glanceAside focusK 0.84 推近后构图;U1(横屏钉默认机位)是否逐位不受影响。
2. 抬起放大:kSelScale 1.6/1.15 与 riseY 公式的几何自洽(下缘不插毡面、不与 rest 牌相交);fanScale<0.5 大手牌时抬起比例。
3. 去浮层后手机大扇(n≥14)可用性:fanScale 0.5→条宽多少;「扫一眼+点选看全脸」流是否成立;要不要 fanScale 下限。
4. probe-uno A2/A3 迁 cards().play 的口径(iAct 窗口外 play 恒 false——A2/A3 都在自己回合吗);A4-A8 的 cardScreenPos 点击在镜头补间期的稳定性(camRest 前置,参照 ev-handontable)。
5. persona-uno H2 迁移的断言面;gl-off 上下文怎么构造(参考 probe-uno B1)。
6. iOS 触屏 click 300ms/双击缩放等历史坑是否被 viewport meta 现有配置覆盖。
7. 有没有第 5 个必须做的移动端适配点(对照 .pw/shots/ev-multi-phone.png)。
