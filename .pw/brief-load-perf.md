# 挑刺评审简报：全游戏加载/进入提速轮（2026-09-24）

你是工程红线挑刺专家。请只从「正确性/回归风险/并发与联机语义/门禁一致性」角度挑刺，
输出「判定（可行/需修订/否决）+ 参数级修订指令」。不要泛泛评价。只审本简报范围内的改动。

## 用户诉求
"优化所有游戏的加载，目前加载进入过久"（2026-09-24）。

## 实测基线（Playwright 桌面 localhost，健康外网 broker）
- tod 本地建房：点击加入→揭幕 2.6s（碰撞检测窗口 1.0-1.2s → 落座固定先睡 900ms → 加载门 2400ms 剩余段）
- tod 联机建房：7.3s（首台 broker 拨通 0.9s + open() 内 retained 宽限 0.4s + 碰撞窗口 1.0s
  + 题库回声等待 1.6s + 落座 0.9s + 加载门与翻牌对齐 1.7s——全部串行）
- tod 联机加入（填房号）：状态窗口上限 3.2s + 题库 + 落座 + 门，量级 5-8s
- monopoly/uno 联机加入：party-net enter() 里 link.open()（拨 3 broker+400ms retained）
  之后 probeRoom() 再 new 一个 RoomLink 再拨一遍再等最多 3s——同一页面重复拨号两轮
- 页面本体：tod.html/index.html 各 3.3MB（内联 2MB DiceBear + 603KB three.js r128），
  monopoly/uno 内联 603KB three；真机手机 4Mbps 下光 HTML 下载就要 ~7s

## 改动方案（四招）

### 招1：tod 加入尾部并行化 + 加载门缩短（tod.html 内联 app）
现状 doJoin 尾部（~5110-5140）：题库等待(8×150ms) → 落座校验 for(3){ await sleep(900); if 有我 break; mutate }
→ await waitLoaderDone(LOADER_FLIP_MS=2400, loadT0)（先补足 2400ms 总时长，再对齐翻牌 CSS 循环 0% 帧，
最多再补一整轮 2400ms）→ hideLoading()。
改为：
- dataTail = (async () => { 题库等待+合并发布；落座校验改「先查后睡」：for(3){ if 有我 break; mutate; await sleep(900); } })()
- await Promise.all([dataTail, waitLoaderDone(1200, loadT0)])
- CSS .loader-card 翻牌动画周期 2400ms→1200ms，JS LOADER_FLIP_MS 同步 1200（对齐逻辑不变，into>80 补齐到周期头）
- 预期：本地建房 2.6s→约1.2-2.2s；联机建房 7.3s→约3s；联机加入→约1.2-2.4s
配套：probe-loader-gate.cjs 阈值 ≥2300ms→≥1150ms、% 2400→% 1200、注释与 SPEC §门控描述同步。

### 招2：共享 broker 连接池 + 进页预拨（tod.html 内联传输、party-net.js、bombcat.html 内联传输，三份同构修改）
现状：MiniMqtt.subs 是 Map<topic, cb> 单回调，subscribe 后订顶掉先订；每个 RoomLink 独立拨 3 台 broker。
改为页面级 SharedLinks 池：url → {mqtt, subs: Map<topic, Set<cb>>, refs, idleTimer}：
- RoomLink._dial(url) → 池.acquire(url)（首次真拨、之后复用）；逻辑 subscribe 在包装层做多路分发；
  每次逻辑 subscribe 都重发一次 MQTT SUBSCRIBE（broker 会重投 retained，旧回调收到重复状态是幂等的）
- RoomLink 关闭/retire → 只摘除自己的回调 + refs--，不断 socket；refs==0 起 45s idle 定时器，到期才真关
- onStatus offline → 池标记死亡、驱逐、pending acquire 拒绝（keeper 7s 补连走 acquire 重新真拨）
- 新增 RoomLink.warmup()：进页挂表后 1s 拨三台；tod/party-net/bombcat 的加入页 boot 各调一次
- probeRoom 天然受益：复用温连接，3s 轮询通常 1-2 跳退出
红线关注：两标签同 clientId 互踢（每页 genId 各自随机，不受影响）；WebRTC 连麦信令走同一批 topic
（多路分发后所有订阅者都收到，语义不变）；retained 重投重复 applyState 幂等性。

### 招3：巨型脚本外置（tod.html / index.html / monopoly.html / uno.html / bombcat.html）
- 新增 three.r128.js：内容 = 现内联 three r128 块逐字节一致（作为提取源复制）
- tod/index 内联 2MB DiceBear 块 → 换成与 monopoly/uno 相同的 <script src="dicebear-local.js"></script>
  （需校验 tod/index 内联 blob 与现存 dicebear-local.js 逐字节一致后才可换）
- monopoly/uno/bombcat 内联 three 块 → <script src="three.r128.js"></script>（tod/index 同样）
- 全部用同步 src 外置、原位替换、执行顺序不变（不搞 defer/DOMContentLoaded 改造，本轮不碰启动时序）
- 收益：HTML 3.3MB→~1.3MB（tod/index）/ 0.9MB→~0.3MB；three+dicebear 跨页面/跨游戏 HTTP 缓存复用；
  静态托管 gzip/br 只压外置 JS 的收益稳定
配套：check-syntax.cjs（现为 index+monopoly(+uno/bombcat?) 内联 three sha256 一致断言）改为
「各页面引用 three.r128.js + 该文件 sha256 = 记录值」；dicebear-local.js 的 CRLF 陷阱照旧提防。

### 招4：测量与门禁
- .pw/probe-load-timeline.cjs（本轮新增，端口 8931）：5 页 FCP/DCL/加入屏可见 + tod 本地加入揭幕；
  改为 A/B 两侧各跑一遍（CDP 4Mbps 节流 + 不节流各一轮）输出对比
- 复跑门禁：check-syntax.cjs、check-syntax-bc.cjs、probe-loader-gate.cjs（新阈值）、
  probe-join-latency.cjs（A/B）、probe-arcade 类冒烟、test-3d 轻量冒烟（不碰 3D 代码，防意外）

## 明确不做（本轮）
- 不删 index.html 里的 tod 死代码（风险大，另立任务）
- 不做 defer/DOMContentLoaded 启动时序改造（牵连 5 文件 boot，另立任务）
- 不动 Cam.init/3D 场景初始化时机、不动 test-perf 帧率断言
- 不缩短页面启动过场（1200ms 揭幕仪式保留）

## 需要你重点挑刺的点
1. 招1 把 2026-09-17 用户点名的「加载效果必须播完才揭幕 ≥2.4s」门砍到 1.2s 一轮——
   今天用户嫌慢，新指令覆盖旧指令是否成立？砍法是否保留了「仪式感」语义（一整轮翻牌+对齐正面帧）？
2. 招2 共享池的多路分发：重发 SUBSCRIBE 触发 retained 重投给所有旧回调——各游戏 applyState 是否真幂等？
   tod 之外 party-net 的 netSetDoc、bombcat 的状态应用有没有「重复消息=状态错乱」的暗雷？
   refs/idle 生命周期：keeper 补连、降级本地、升回在线、mic 关闭等路径有没有漏 release/多 release？
3. 招3 同步外置：五文件执行顺序语义是否真的零变化？tod/index 的 DiceBear blob 与 dicebear-local.js
   若存在细微版本差（一个新一个旧），替换后行为差异怎么兜底？check-syntax 改法是否保住「防漂移」原意？
4. 落座校验「先查后睡」：把 sleep(900) 挪到 mutate 之后，弱网下自愈重试的语义是否等价（重试间隔不变）？
5. 有没有我没想到的「进入过久」主因被漏掉（例如字体、bfcache、启动过场、UNO/大富翁 startFlow）？
