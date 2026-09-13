const fs = require('fs');
const f = 'D:/myidea/truth-or-dare/wiki/design/one-take-motion-system.md';
let s = fs.readFileSync(f, 'utf8');
const R = (a, b) => { if (!s.includes(a)) { console.error('MISSING: ' + a.slice(0, 40)); process.exitCode = 1; return; } s = s.replace(a, b); };

R(`2. **刚体优先**：换屏是「一个立方体的两面绕公共竖棱转 90°」（θ 差恒 ±90°，probe-cube 实测最大偏差 0.00°），两面必须逐字同 duration/同 easing/同 R。`,
`2. **刚体优先 → VR 扫视（2026-09 v3 用户定版）**：换屏是「镜头转头扫过并排的两个房间」——两面同参恒速滑动（一快一慢=脱拍），中段露出 ~280px 真实空隙；「偏头一瞥」（±7°/窄屏 5° 钟形偏航 + 10px 侧倾弧）由镜头独占，面板只滑不转。取代初版立方体铰链转身（θ差恒±90° 判据随 probe-cube 退役）。`);

R(`| 换屏转身 | 640ms | bezier(0.4,0,0.2,1) | ±90° 绕面心竖棱；两面逐字同参 |
| 揭幕 | 260ms | ease | opacity+scale 1.04，禁 blur；两面 delay 140ms+backwards |
| Cam.enter | 540+660ms | out→dolly | 窄屏/横屏零过冲；桌面 z12/rx0.6 |`,
`| VR 扫视滑动 | 640ms 恒速三段（22%/78% C1） | 段内 bezier | S=--lvw+280px；两面逐字同参；B from 帧在视口外=加载门控本体 |
| 揭幕 | 260ms | ease | opacity+scale 1.04，禁 blur；两面 delay 280ms+backwards（>揭幕，幕落净才起扫） |
| 偏头一瞥 | 320+320ms | dolly 双段 | ry ∓7°(窄屏5°) + x ∓10px 相对 base；Cam.to 第5参 delay 与面板同拍 |`);

R(`- **加载严格门控**：B 的 from 帧钉在 +S 视口外，加载完成前新场景一个像素不入画；起扫只在揭幕（260ms）完成后（280ms delay）——用户原话「一定要等加载完成之后再扫过去」。`,
`- **加载严格门控**：B 的 from 帧钉在 +S 视口外，加载完成前新场景一个像素不入画；起扫只在揭幕（260ms）完成后（280ms delay）——用户原话「一定要等加载完成之后再扫过去」。门控纯几何：**pan-in 禁写 opacity 关键帧**（加载层 0.95 半透，透明度门控会露底）。`);

R(`\`probe-one-take.cjs\`（12 断言：揭幕间隙/背板/窄屏无过冲/颁奖礼生命周期）、\`probe-cube.cjs\`（刚体判据，
中段帧用 \`getAnimations().pause()\` 冻住再截——waitForFunction 返回后写盘延迟会拍假绿）、\`review-code.cjs\`
（检查官烟测：快跳残留/陈旧定时器/换题打断/REDUCED 连跳）。`,
`\`probe-pan.cjs\`（13 断言，回归门：门控/连续/空隙/偏航/终态无残差/镜像+窄屏同框）、\`probe-one-take.cjs\`
（11 断言：揭幕门控/窄屏无过冲/颁奖礼生命周期）、\`review-code.cjs\`（检查官烟测：快跳残留/陈旧定时器/换题打断/REDUCED 连跳）。
取证坑：**转场中段帧必须等揭幕层「先显示再隐藏」两段等待后拍**（开机层与加入层是同一个复用元素，只等 .hide
会匹配到开机层）；headless 后台页 rAF 被节流，逐帧采样要么 bringToFront 要么 Node 侧轮询。`);

fs.writeFileSync(f, s);
console.log('wiki motion updated');
