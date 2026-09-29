// SPEC.md 契约同步（2026-09-24 加载提速轮）：门控参数、传输池化、外置件 sha 锁、dicebear 母本地位
'use strict';
const fs = require('fs');
const F = 'D:/myidea/truth-or-dare/SPEC.md';
let s = fs.readFileSync(F, 'utf8');
const rep = (a, b, name) => {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error(`${name} 出现 ${n} 次（应为 1）`); process.exit(1); }
  s = s.replace(a, b);
};

// 1. §加载动画：时长门 2400→1200 + dataTail 并行化语义 + 决策链
rep(`**进房揭幕时长门（2026-09-17，用户点名「没等加载效果完毕房间就进了」）**：doJoin 成功路径在 reveal 前过 \`waitLoaderDone(2400, loadT0)\`——①至少看满一整轮 2.4s 翻牌（loadT0=点「加入」时刻），②再对齐到翻牌 CSS 动画 currentTime 回到 0% 帧（正面朝上）那一拍才揭幕（读作「抽卡完成」；into≤80ms 视为已对齐免得多睡一轮；REDUCED/loperf 动画被关时 getAnimations 为空只剩时长门）。等待段文案置「✅ 就绪...」（数据真就绪，消除最坏 ~5s 停在「落座中」的假死感）；**按钮解禁必须排在 await 之后**（提前解禁会给 input-name 的 Enter 重入 doJoin 留 2.4s 窗口：掐活链路+新 myId 双身份入房，代码检查官实锤）。`,
`**进房揭幕时长门（2026-09-17 用户点名「没等加载效果完毕房间就进了」；2026-09-24 用户点名「加载进入过久」→ 门 2400ms 缩半为 1200ms，新指令覆盖旧参数，「至少播完一整轮翻牌」的仪式感语义保留）**：doJoin 成功路径 reveal 前过 \`Promise.all([dataTail, waitLoaderDone(1200, loadT0)])\`（外挂 .catch 兜底防吞错卡揭幕）——dataTail（题库等待+合并发布+落座自愈）与门**并行**，取两者较晚揭幕（数据慢于门时以数据为准，「幕下换屏」设计不变）。①至少看满一整轮 1.2s 翻牌（loadT0=点「加入」时刻；**CSS @keyframes loader-flip 的 duration 必须同改 1.2s**，正面定格 keyframes 0%,25%≈300ms 保「卡看清了才翻走」），②再对齐到翻牌 currentTime 回 0% 帧（正面朝上那一拍；into≤80ms 视为已对齐；REDUCED/loperf getAnimations 为空只剩时长门，下限断言 ≥1050ms=1200−150ms 派发偏差余量）。落座自愈改「先查后睡」（建房/正常加入首查即过零等待，仅自愈重试花 900ms/拍）；「✅ 就绪...」在 dataTail 末尾置（门剩余等待期可见，不显假死）；roomFull/撞号/连接失败/房间不存在等早退分支留在 dataTail **之前**的顺序段（各自揭幕+return，不进并行段）；**按钮解禁必须排在 await 之后**（Enter 重入 doJoin 的窗口随之缩为 1.2s：掐活链路+新 myId 双身份入房，代码检查官实锤）。`);

// 2. §传输不变式：SharedLinks 池 + warmup + 400ms 摘除
rep(`现在并行拨号 + 每一路都订阅，写入发向所有存活链路，任一路可达即在线；keeper 每 7s 补连挂掉的 broker（补回后自动升回 mqtt，本地兑底链路可共存），全断 3 轮才降级本地模式`,
`现在并行拨号 + 每一路都订阅，写入发向所有存活链路，任一路可达即在线；keeper 每 7s 补连挂掉的 broker（补回后自动升回 mqtt，本地兑底链路可共存），全断 3 轮才降级本地模式。**页面级 SharedLinks 共享连接池（2026-09-24 加载提速轮，tod/index/party-net/bombcat 四份同构拷贝，改必四份同改）**：每台 broker 一条 WebSocket 全页面共乘（enter/probeRoom/warmup 不再各拨各的——旧形态下加入者要付两轮拨号）；RoomLink 的 close/_retire 只摘引用（refs--），物理关闭归池 45s idle 定时器；broker 掉线由池驱逐并回调所有持有者各自摘槽；dial 的 entry 在 connect 前**同步注册**进池（pend 窗口内的并发 dial 共乘同一次 connect——warmup×自动回房同拍场景，否则双拨+孤儿连接误驱逐）；每次逻辑 subscribe 重发 SUBSCRIBE → broker 重投 retained（tod/party-net/bombcat 的状态应用均幂等；mic/act/react 非 retained 无重放）；open() 旧「await sleep(400) 等 retained」固定税已摘（订阅发生在 open 返回后，重发 SUBSCRIBE 自会触发 retained 重投）。\`RoomLink.warmup(cidPrefix)\` 进页预拨：party-net 由 cfg.localOnly 门控；tod/bombcat 由「本地模式不联网」承诺门控（本地回房票据/已勾选本地模式不拨；带房号落地立即拨；其余等名字/房号框首次交互才拨——armWarmup 必须放在 tabTicket/urlRoom 初始化**之后**，let TDZ 会炸启动脚本）；pagehide 释放持引用`);

// 3. §大富翁独立文件：three 外置
rep(`three.js r128 UMD 从 index.html 原样内联（含 SPDX 头），保持两边「单文件零外网双击即开」；`,
`three.js r128 UMD 已外置为 three.r128.js（2026-09-24 加载提速轮：五页 src 引用 + check-syntax sha 锁 9274bbce…，浏览器跨页缓存）；`)

// 4. §大富翁门禁：sha 三方一致 → 外置件锁
rep(`**门禁与 E2E**：check-syntax.cjs 扩为「index+monopoly+uno 内联脚本 + party-net.js 过 new Function」+ three.js sha 三方一致；`,
`**门禁与 E2E**：check-syntax.cjs =「五页内联脚本 + party-net.js + three.r128.js/dicebear-local.js 过 new Function」+ 外置件 sha256 锁（three 9274bbce…/dicebear cab07a03…）+ 五页 src 引用断言 + 内联残留断言（防回潮）；`)

// 5. §dicebear 宿主契约：母本地位变更
rep(`（index.html 内联母本的逐字抽取副本，check-syntax 有 EOL 归一漂移门禁拦单边改动）`,
`（2026-09-24 起本文件即唯一母本——tod/index 原内联段已摘除：四页 src 引用 + check-syntax sha256 锁 cab07a03… + 纯 LF 断言拦改动）`)

// 6. §dicebear 门禁
rep(`- **门禁**：check-syntax 加 dicebear-local.js（new Function + 母本漂移）；`,
`- **门禁**：check-syntax 加 dicebear-local.js（new Function + sha256 锁 + 纯 LF）；`)

// 7. §3D 结构：three 内联 → 外置
rep(`① three.js r128 UMD **内联**进单文件（603KB，不走 CDN 保 file:// 离线）；`,
`① three.js r128 UMD 经 \`<script src="three.r128.js">\` 引用（603KB，不走 CDN 保 file:// 离线；2026-09-24 起不再内联进单文件，五页共享同一份）；`)

// 8. 新增本轮纪要（挂在 E2E 契约节后）
rep(`**E2E 契约**：`,
`**2026-09-24 加载提速轮**（用户点名「优化所有游戏的加载，目前加载进入过久」）：①巨型脚本外置——three r128 → three.r128.js（五页共享+跨页缓存）、tod/index 内联 DiceBear → dicebear-local.js src 引用，五页 HTML 9.2MB→~2.4MB（tod 3.3M→769K/index 3.3M→760K），真机 4Mbps 加入屏可见 ~1s（改前被 3.3MB 挡死）；②tod/index 进房揭幕门 2400→1200ms + doJoin 尾部 dataTail 并行化（本地建房 2.6s→~1.4s、联机建房 7.3s→~2-3s）；③SharedLinks 共享池 + warmup 预拨（加入者双拨归一、温连接 dial 0-1ms）；④配套门禁：check-syntax 重写（双 sha 锁+回潮断言）、probe-loader-gate 阈值 1050/1200、probe-load-timeline.cjs（8931，环回+4Mbps 双轮 A/B）新增、probe-boot 观察型无断言。

**E2E 契约**：`)

fs.writeFileSync(F, s);
console.log('SPEC.md 八处契约同步 ✔');
