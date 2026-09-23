// party-net.js — 派对游戏公共联机组件（v1.1，2026-09-20：进房头像区升级为 tod 定制器整套）
// 从 index.html（真心话大冒险）整体搬出的三大件：MiniMqtt/RoomLink 房间链、WebRTC 网状连麦、
// tod 式进房体验（头像定制器 + 昵称填表 + 创建/加入 5 位房号 + 大厅）。 monopoly.html / uno.html 消费；
// tod 本体因 join 屏与 arcade 门禁深度耦合暂保留原生实现（其本身就是这套组件的母本）。
// v1.1：进房表单的 24 预设格退役，换 tod 同款「🎨 定制（31 风格本机生成）/ 我的（tod:avatars:v1 共库）」
// 两标签定制器；本地渲染依赖 dicebear-local.js（宿主须在本文之前 <script src>，缺失自动退 DiceBear CDN）。
// 设计契约见 SPEC.md §1.9：零依赖轻组件（file:// 相对 script 可用），CSS 由组件自注入，宿主只需一个挂载容器。
// 用法： const P = PartyNet.create({ key, prefix, snapshot, onGame, onState, kick, prune, onStart, allowBots, ... }); P.mount("#party-net")
// 红线：改这里必须三处联跑 probe-mono-net(8911)/probe-uno-net(8913)/check-syntax（组件文件也过 new Function 门禁）。
'use strict';
const NET_HEARTBEAT_MS = 25000, NET_STALE_GRAY_MS = 40000, NET_STALE_MS = 90000;
/* ═══════════════ 实例状态 + 进房 UI（tod 式填表/头像/大厅） ═══════════════ */
// create(cfg) 返回一个独立实例：传输核/连麦/UI 全在闭包里，多游戏互不串扰。
// cfg = { key, prefix, maxPlayers, toast, sleep, sfx, snapshot, onGame, onState, kick, prune, allowBots, avSeedPrefix, lobbyExtraHtml, onStart }
function create(cfg) {
  const key = cfg.key, prefix = cfg.prefix || (key + '/v1');
  const maxPlayers = cfg.maxPlayers || 4;
  const sleep = cfg.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const toast = cfg.toast || (() => {});
  const sfxTap = () => { try { cfg.sfx && cfg.sfx.tap && cfg.sfx.tap(); } catch (e) {} };
  const enc = new TextEncoder(), dec = new TextDecoder();
  function genId() { return Math.random().toString(36).slice(2, 10); }
  function roomCode() { return String(Math.floor(10000 + Math.random() * 90000)); }

  /* ── 传输核（逐字移植 index.html tod 体系，topic/key 前缀参数化） ── */
  const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
class MiniMqtt {
  constructor({ url, clientId, keepalive = 60, onStatus }) {
    this.url = url;
    this.clientId = clientId;
    this.keepalive = keepalive;
    this.onStatus = onStatus || (() => {});
    this.subs = new Map();          // topic -> cb
    this.buf = [];
    this.nextPid = 1;
    this.pubacks = new Map();       // pid -> resolve
    this.ws = null;
    this.closed = false;
    this.pingTimer = null;
  }
  // 连接：resolve(true)=CONNACK 成功  resolve(false)=失败
  connect(timeoutMs = 6000) {
    return new Promise(resolve => {
      let settled = false;
      const finish = ok => { if (!settled) { settled = false; settled = true; this.onStatus(ok ? 'online' : 'offline'); resolve(ok); } };
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch { return finish(false); }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { try { ws.close(); } catch {} finish(false); }, timeoutMs);
      ws.onopen = () => ws.send(this._pkt([0x10], this._connectBody()));
      ws.onmessage = ev => {
        this.buf.push(...new Uint8Array(ev.data));
        this._drain();
        if (this._connack && !settled) { clearTimeout(to); finish(true); }
      };
      ws.onerror = () => { clearTimeout(to); finish(false); };
      ws.onclose = () => {
        clearTimeout(to);
        clearInterval(this.pingTimer);
        if (!settled) finish(false);
        else if (!this.closed) this.onStatus('offline');
      };
      this._connack = false;
    });
  }
  _connectBody() {
    const cp = enc.encode(this.clientId);
    return [0x00, 0x04, ...enc.encode('MQTT'), 0x04, 0x02, (this.keepalive >> 8) & 255, this.keepalive & 255,
      (cp.length >> 8) & 255, cp.length & 255, ...cp];
  }
  static _varint(n) { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; }
  _pkt(flagsByte, body) { return new Uint8Array([flagsByte, ...MiniMqtt._varint(body.length), ...body]); }
  _str(s) { const b = enc.encode(s); return [(b.length >> 8) & 255, b.length & 255, ...b]; }
  _send(bytes) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(bytes); }

  _drain() {
    while (this.buf.length >= 2) {
      let mul = 1, len = 0, i = 1, digit;
      do {
        if (i >= this.buf.length) return;      // 头不完整，等下一帧
        digit = this.buf[i++];
        len += (digit & 127) * mul; mul *= 128;
      } while (digit & 128);
      if (this.buf.length < i + len) return;   // 体不完整
      const type = this.buf[0] >> 4, flags = this.buf[0] & 15;
      const body = Uint8Array.from(this.buf.slice(i, i + len));
      this.buf = this.buf.slice(i + len);
      this._handle(type, flags, body);
    }
  }
  _handle(type, flags, body) {
    if (type === 2) {          // CONNACK
      this._connack = body[1] === 0;
      if (this._connack) {
        this.pingTimer = setInterval(() => this._send(this._pkt(0xc0, [])), this.keepalive * 1000 / 2);
        for (const topic of this.subs.keys()) this._subscribe(topic);
      }
    } else if (type === 3) {   // PUBLISH
      const qos = (flags >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.slice(2, 2 + tlen));
      let off = 2 + tlen;
      if (qos > 0) off += 2;
      const payload = body.slice(off);
      if (qos === 1) { const pid = (body[2 + tlen] << 8) | body[3 + tlen]; this._send(this._pkt(0x40, [(pid >> 8) & 255, pid & 255])); }
      const cb = this.subs.get(topic);
      if (cb) cb(payload);
    } else if (type === 4) {   // PUBACK
      const pid = (body[0] << 8) | body[1];
      const fn = this.pubacks.get(pid);
      if (fn) { this.pubacks.delete(pid); fn(); }
    }
    // 9 SUBACK / 13 PINGRESP: 无需处理
  }
  _subscribe(topic) {
    const pid = this.nextPid++;
    this._send(this._pkt(0x82, [(pid >> 8) & 255, pid & 255, ...this._str(topic), 0x01]));
  }
  subscribe(topic, cb) {
    this.subs.set(topic, cb);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this._subscribe(topic);
  }
  publish(topic, bytes, { retain = true, qos1 = true, timeout = 5000 } = {}) {
    return new Promise(resolve => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return resolve(false);
      let pid = 0;
      const head = qos1 ? 0x30 | (1 << 1) | (retain ? 1 : 0) : 0x30 | (retain ? 1 : 0);
      const varhdr = this._str(topic);
      if (qos1) { pid = this.nextPid++; varhdr.push((pid >> 8) & 255, pid & 255); }
      this._send(this._pkt(head, [...varhdr, ...bytes]));
      if (!qos1) return resolve(true);
      const to = setTimeout(() => { this.pubacks.delete(pid); resolve(false); }, timeout);
      this.pubacks.set(pid, () => { clearTimeout(to); resolve(true); });
    });
  }
  close() { this.closed = true; clearInterval(this.pingTimer); try { this.ws && this.ws.close(); } catch {} }
}

// ═══════════════════════════════════════════════════════════════
// 本地传输（BroadcastChannel + localStorage retained 模拟，支持多 topic）
// ═══════════════════════════════════════════════════════════════
class LocalTransport {
  constructor(room, keyPrefix, topics) {
    this.tab = genId();
    this.subs = new Map();               // topic -> cb
    this.keys = new Map();               // topic -> localStorage key（首个 topic 沿用旧 key，不丢历史房间）
    (topics || []).forEach((t, i) => this.keys.set(t, keyPrefix + ':net:room:' + room + (i === 0 ? '' : ':' + t.split('/').pop())));
    this.channel = ('BroadcastChannel' in window) ? new BroadcastChannel(keyPrefix + '-' + room) : null;
    if (this.channel) this.channel.onmessage = e => { const d = e.data; if (d && d.tab !== this.tab) this._emit(d.topic); };
    window.addEventListener('storage', e => { if (e.key && e.key.indexOf(keyPrefix + ':net:room:' + room) === 0) this._emit(); });
  }
  _emit(topic) {
    for (const t of (topic ? [topic] : [...this.subs.keys()])) {
      const cb = this.subs.get(t); if (!cb) continue;
      const s = localStorage.getItem(this.keys.get(t));
      if (s) cb(enc.encode(s));
    }
  }
  connect() { this._emit(); return Promise.resolve(true); }
  subscribe(topic, cb) {
    this.subs.set(topic, cb);
    const s = localStorage.getItem(this.keys.get(topic));
    if (s) cb(enc.encode(s));
  }
  publish(topic, bytes, opts) {
    const key = this.keys.get(topic);
    if (key) { if (bytes && bytes.length) localStorage.setItem(key, dec.decode(bytes)); else localStorage.removeItem(key); }
    if (this.channel) this.channel.postMessage({ tab: this.tab, topic });
    return Promise.resolve(true);
  }
  close() { this.channel && this.channel.close(); }
}

// ═══════════════════════════════════════════════════════════════
// RoomLink：对外统一接口。内部「同时」连所有公共 broker —— 每台 broker 上的
// retained 状态是各自独立的一份，只连「第一台可用」会让两个用户落在不同 broker 上，
// 于是房间号相同却互相看不见对方。所有写入一律 fan-out 到每条链路，读入则合并去重。
// 任一链路存活即在线；掉线由 keeper 后台补连；全挂才降级本地模式。
// ═══════════════════════════════════════════════════════════════
class RoomLink {
  constructor(room, prefix, keyPrefix) {
    this.room = room;
    this.topic = `${prefix}/${room}/state`;
    this.poolTopic = `${prefix}/${room}/pool`;   // 题库单独一路：不随每次抽卡重发，状态包小很多
    this.micTopic = `${prefix}/${room}/mic`;     // 连麦信令（WebRTC offer/answer/ice，非点对点广播）
    this.reactTopic = `${prefix}/${room}/react`; // 表情雨（即发即忘、不 retained：不污染房间状态体积）
    this.cbs = { state: null, pool: null, mic: null, react: null };
    this.slots = [];              // { url, host, t, dead } —— 每个可达 broker 一条链路
    this.kind = 'online';
    this.statusCb = () => {};
    this.currentHost = '';
    this._dialing = new Set();
    this._keeper = null;
    this._closing = false;
    this._reconnecting = false;
    this._emptyRounds = 0;
  }
  get client() { const s = this.slots.find(x => !x.dead); return s ? s.t : null; }   // 兼容旧引用：任一存活链路
  get alive() { return this.slots.some(s => !s.dead); }
  _disp(key) {   // 每条链路各装一份派发闭包：重新 subscribe 时替换的是同一个语义，回调永远读最新的 this.cbs
    const topic = key === 'state' ? this.topic : key === 'pool' ? this.poolTopic : key === 'react' ? this.reactTopic : this.micTopic;
    return bytes => { try { const v = JSON.parse(dec.decode(bytes)); const cb = this.cbs[key]; if (cb) cb(v); } catch {} };
  }
  _wire(t) {   // 新连接/重连都要把三路订阅上（解析失败静默丢弃，不阻断消息循环）
    t.subscribe(this.topic, this._disp('state'));
    t.subscribe(this.poolTopic, this._disp('pool'));
    t.subscribe(this.micTopic, this._disp('mic'));
    t.subscribe(this.reactTopic, this._disp('react'));
    return t;
  }
  _add(t, url) {
    const slot = { url, host: url ? this._host(url) : '本地', t, dead: false };
    this.slots.push(slot);
    this._wire(t);
    return slot;
  }
  _retire(slot) {
    slot.dead = true;
    this.slots = this.slots.filter(x => x !== slot);
    try { slot.t.close(); } catch {}
  }
  async open() {
    this.statusCb('connecting', '');
    // 入场门禁只等「第一台拨通」：Promise.all 等的是最慢一台落定，被墙/挂掉的 broker 会吃满
    // 5s 超时，把所有人的进房速度拖到它的水平——旧注释宣称「不会被单台卡住」，实际恰恰相反。
    // 没拨完的两台留在后台继续（_dialing 防 keeper 重复拨）；晚到链路 _wire 时读最新 cbs，
    // retained 照常重投，三台各持一份房间状态的不变式由 keeper 补齐。
    const allSettled = Promise.all(BROKERS.map(url => this._dial(url)));
    await Promise.race([
      (async () => { while (!this.alive && !this._closing) await sleep(50); })(),   // 第一台活 → 立刻放行
      allSettled,   // 全部落定仍无一存活 → 走本地兜底
    ]);
    if (!this.alive) return this._fallbackLocal('所有在线服务器不可用，已切换到本地模式（同浏览器多标签）');
    await sleep(400);   // 稍等 retained 消息送达
    this.kind = 'mqtt';
    this._status();
    this._startKeeper();
    return 'mqtt';
  }
  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    const c = new MiniMqtt({ url, clientId: key + '-' + genId(), onStatus: st => { if (st !== 'online') this._onDown(url); } });
    let ok = false;
    try { ok = await c.connect(5000); } catch { ok = false; }
    this._dialing.delete(url);
    if (this._closing || !ok) { c.close(); return false; }
    this.kind = 'mqtt';   // 本地模式下补连成功 → 自动升回在线
    this._add(c, url);
    this._status();
    return true;
  }
  _onDown(url) {
    const s = this.slots.find(x => x.url === url && !x.dead);
    if (s) this._retire(s);
    if (this.kind === 'mqtt') this._status();
  }
  _status() {
    const net = this.slots.filter(s => s.url).map(s => s.host);   // 混着用本地兵底链路时，不把「本地」算进在线台数
    if (net.length) {
      this.currentHost = net.length > 1 ? `${net[0]} 等 ${net.length} 台` : net[0];
      this.statusCb('online', this.currentHost);
    } else if (this.slots.length) {
      this.currentHost = '本地';
      this.statusCb('online', '本地');
    } else this.statusCb('syncing', '');
  }
  _startKeeper() {
    if (this._keeper) return;
    this._keeper = setInterval(async () => {
      if (this._closing) return;
      for (const url of BROKERS) if (!this.slots.some(s => s.url === url)) await this._dial(url);   // 补连：让每台 broker 都持有同一份房间状态
      if (!this.alive && this.kind === 'mqtt') {
        if (++this._emptyRounds >= 3 && !this.slots.some(s => s.url === ''))
          this._fallbackLocal('与所有同步服务器的连接都断了，已临时切到本地模式（只有同一浏览器多标签能联机）');
        else this._status();
      } else this._emptyRounds = 0;
    }, 7000);
  }
  useLocal() {
    if (!this.slots.some(s => s.url === '')) this._add(new LocalTransport(this.room, key, [this.topic, this.poolTopic, this.micTopic, this.reactTopic]), '');
    this.kind = 'local';
    this.currentHost = '本地';
    this.statusCb('online', '本地');
    return 'local';
  }
  _fallbackLocal(msg) {
    if (msg) toast(msg, 'error', 4000);
    this.useLocal();
    this._startKeeper();   // 全断不等于永远断：后台继续补连，能连上就自动升回在线，不然一次并服失败就只能刷新页面
    return 'local';
  }
  _host(url) { try { return new URL(url).hostname.replace('broker.', '').replace('test.', ''); } catch { return url; } }
  subscribe(cb) { this.cbs.state = cb; this._resub(this.topic, 'state'); }
  subscribePool(cb) { this.cbs.pool = cb; this._resub(this.poolTopic, 'pool'); }
  subscribeMic(cb) { this.cbs.mic = cb; this._resub(this.micTopic, 'mic'); }
  subscribeReact(cb) { this.cbs.react = cb; this._resub(this.reactTopic, 'react'); }
  _resub(topic, key) { for (const s of this.slots) { try { s.t.subscribe(topic, this._disp(key)); } catch {} } }   // 重新 SUBSCRIBE → broker 重投 retained
  resubscribe() { this._resub(this.topic, 'state'); this._resub(this.poolTopic, 'pool'); this._resub(this.micTopic, 'mic'); this._resub(this.reactTopic, 'react'); }
  async publishState(obj) { return this._pub(this.topic, obj); }
  async publishPool(obj) { return this._pub(this.poolTopic, obj); }
  publishMic(obj) {   // 信令即发即忘：不 retained、不重发，错过就靠重协商补
    this._pubBytes(this.micTopic, enc.encode(JSON.stringify(obj)), { retain: false, qos1: false });
    return Promise.resolve(this.alive);
  }
  publishReact(obj) {  // 表情雨同样是即发即忘：迟到的旧表情在接收端按时间戳丢弃
    this._pubBytes(this.reactTopic, enc.encode(JSON.stringify(obj)), { retain: false, qos1: false });
    return Promise.resolve(this.alive);
  }
  clearPool() {   // 空零长度 retained = 从 broker 上擦除房间题库
    return this._pubBytes(this.poolTopic, new Uint8Array(0), { retain: true });
  }
  publishNow(topic, obj) {   // pagehide 尽力而为：不等 PUBACK，同步塞进每条存活链路
    const bytes = enc.encode(JSON.stringify(obj));
    for (const s of this.slots) { try { s.t.publish(topic, bytes, { retain: true, qos1: false }); } catch {} }
  }
  async _pub(topic, obj) { return this._pubBytes(topic, enc.encode(JSON.stringify(obj)), { retain: true }); }
  async _pubBytes(topic, bytes, opts) {
    const live = this.slots.filter(s => !s.dead);
    if (!live.length) {
      if (this.kind === 'mqtt' && !this._reconnecting) this.retryNow();
      return false;
    }
    const rs = await Promise.all(live.map(s => s.t.publish(topic, bytes, opts).catch(() => false)));
    const ok = rs.some(Boolean);
    if (!ok && this.kind === 'mqtt' && !this._reconnecting) this.retryNow();
    return ok;
  }
  async retryNow() {   // 手动/自动补连：并行重拨所有 broker
    if (this._reconnecting) return this.alive;
    this._reconnecting = true;
    if (!this.alive && this.kind === 'mqtt') this.statusCb('syncing', '重连中');
    await Promise.all(BROKERS.map(url => this._dial(url)));
    this._reconnecting = false;
    if (this.kind === 'mqtt') this._status();
    return this.alive;
  }
  _tryReconnect() { return this.retryNow(); }
  close() {
    this._closing = true;
    clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
  }
}

  /* ── 连麦：WebRTC 网状语音（逐字移植 tod MIC 块，存储 key 前缀参数化） ── */
  const ICE_SERVERS = (() => {
  try {
    const own = JSON.parse(localStorage.getItem(key + ':ice') || 'null');
    if (Array.isArray(own) && own.length) return own;
  } catch { /* 配错就当没配，用默认 STUN */ }
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:global.stun.twilio.com:3478'] },
  ];
})();
const VOICE_OPEN = 0.045;      // RMS 门槛：超过即认为在说话
const VOICE_HOLD_MS = 320;     // 短暂停顿不熄灭“正在说话”
const MIC_SIGNAL_TTL = 15000;  // 本地模式 localStorage 会回放旧信令：超龄丢弃
const MIC_LINK_WARN_MS = 14000;   // 协商完成后这么久 ICE 还没通 → 大概率缺 TURN，主动告知
const MIC_INBOUND_WARN_MS = 6000; // 链路 connected 但一个音频包都没收到 → 对端没推流
const LISTEN_KEY = key + ':listen';  // 收听开关（默认开）：开麦=广播，不收听就不建链
// 链路方向位：1=我在广播（开麦） 2=对方在广播 → 3=全双工
// 开麦只发给房间里其他人，没开麦的人只听不播 → 一个人开麦全房能听
function micLive() { return MIC.on || MIC.listen; }

// 连麦自动压低（ducking）：外放时本地音乐/音效会被麦克风收进去——
// 浏览器的 echoCancellation 只对「远端播放信号」这个参考有效，本地 WebAudio 现场合成的声音不在参考里，消不掉；
// 所以广播时把总线压到 14%（手机走媒体外放时压到 6%，见下）；仅收听（有活跃语音链路）时压到 50%，降低串音与掩蔽。
// 判据用「真实链路数 MIC.peers.size」而不是收听偏好（listen 默认开，没人说话时不能无端压低）。远端人声不走这条总线，不受影响。
// 戴耳机仍是唯一能彻底消除音乐串音的办法（首次开麦给一次提示）。
const DUCK_KEY = key + ':duck';
let duckPref = true;
try { duckPref = localStorage.getItem(DUCK_KEY) !== '0'; } catch {}
let duckHinted = false;

// 手机端连麦默认外放（扬声器）：浏览器只要把远端 WebRTC 音频喂给 <audio> 元素播放，就认定这是「通话」，
// 系统会把输出切进 communication 模式 → 听筒（Chromium 甚至回滚过「WebRTC 默认扬声器」的改动），
// 而网页没有 setSpeakerphoneOn / 切输出设备这类接口（移动端 setSinkId 多数机型枚举不到输出设备）。
// 唯一的绕法是换一条路径：远端人声走 AudioContext.destination（媒体输出）——媒体输出在各端恒定走扬声器，不会进听筒。
// 桌面不受影响（没有听筒问题，且元素播放的硬件回声消除在桌面真实有效），所以只在触屏设备上启用。
// 判据用媒体查询而不是 UA：iPadOS 会伪装成桌面 Safari 的 UA，UA 嗅探恰好会在目标机型上误判。
const COARSE_TOUCH = (() => {
  try {
    return matchMedia('(hover: none) and (pointer: coarse)').matches
      || (matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 0);
  } catch { return false; }
})();
const SPEAKER_KEY = key + ':speaker';   // '0' = 退回 <audio> 元素播放（个别机型 AudioContext 没声音时的逃生门）
let speakerPref = true;
try { speakerPref = localStorage.getItem(SPEAKER_KEY) !== '0'; } catch {}
let speakerHinted = false;
function useMediaOut() { return COARSE_TOUCH && speakerPref; }

function syncAudioDuck(animate = true) {
  // 媒体外放这一路的回声消除参考不再是被渲染出的声音，串音更难消 → 广播时压得更狠（只影响手机外放；桌面/听筒仍 14%）
  const f = !duckPref ? 1 : (MIC.on ? (useMediaOut() ? 0.06 : 0.14) : (MIC.peers.size ? 0.5 : 1));
  SFX.duckMusic(f, animate ? 320 : 0);   // 只压背景音乐；动作音效（master 总线）保持原音量
}
function syncDuckBtn() {
  const g = $('btn-duck-guide');
  if (g) g.textContent = '连麦时降低音乐：' + (duckPref ? '开' : '关');
}
function syncSpeakerBtn() {
  const g = $('btn-speaker-guide');
  if (!g) return;
  g.hidden = !COARSE_TOUCH;   // 桌面没有听筒问题，按钮不出现（也不占位）
  if (COARSE_TOUCH) g.textContent = '📢 连麦语音外放：' + (speakerPref ? '开' : '关');
}
function micDuckHint() {   // 每次会话只提示一次，别刷屏
  if (duckHinted) return;
  duckHinted = true;
  if (duckPref) toast('💡 已把音乐压低；想让对方完全听不到音乐，请戴耳机或关掉音乐', '', 4200);
}
function speakerHint() {   // 走媒体外放：EC 变弱，提示一次（同样会话级，别刷屏）
  if (speakerHinted) return;
  speakerHinted = true;
  toast('📢 对方声音已走外放（免提）；外放开麦时回声抑制较弱，戴耳机效果最好', '', 4600);
}

const MIC = {
  on: false, stream: null, ctx: null, analyser: null, tmp: null,
  peers: new Map(),   // pid -> { pc, el, src, gain, analyser, tmp, ice[], remoteSet, sdpSent, dir, level, hold, ... }
  seen: new Set(),    // 信令 mid 去重
  localLevel: 0, hold: 0, raf: 0, sig: '',
  since: 0, watch: null, unlock: null, warnedLink: false,
  listen: (() => { try { return localStorage.getItem(LISTEN_KEY) !== '0'; } catch { return true; } })(),
};

function rmsLevel(analyser, tmp) {
  analyser.getByteTimeDomainData(tmp);
  let sum = 0;
  for (let i = 0; i < tmp.length; i++) { const d = (tmp[i] - 128) / 128; sum += d * d; }
  return Math.sqrt(sum / tmp.length);
}
function voiceSpeaking(st, lvl) {
  if (lvl > VOICE_OPEN) st.hold = Date.now() + VOICE_HOLD_MS;
  return Date.now() < st.hold;
}

function peerMicOn(pid) { return !!(S && S.players.some(p => p.id === pid && p.micOn)); }
// 对方在不在听（收不听开关）：旧房间状态没这个字段时按“在听”处理，不能让老玩家变成黑洞
function peerListenOf(pid) { const p = S && S.players.find(x => x.id === pid); return !p || p.micListen !== false; }
// 广播要对着“在听的人”发：不然我单方面留着链路，声音只会打进黑洞，对方重新打开收听时也接不上
function iBroadcast(pid) { return !!MIC.on && peerListenOf(pid); }
function theyBroadcast(pid) { return peerMicOn(pid) && !!MIC.listen; }
function peerDir(pid) { return (iBroadcast(pid) ? 1 : 0) | (theyBroadcast(pid) ? 2 : 0); }
// 这条链路还需不需要：只要有一方在广播就需要（双向都需要）
function peerNeeded(pid) { return !!S && S.players.some(p => p.id === pid && p.id !== myId) && (iBroadcast(pid) || theyBroadcast(pid)); }
// 谁发 offer：只有一方广播时由广播方发（这样只听的一方永远是应答端，方向不会谈歪）；
// 双方都广播时回到字典序，避免互发 offer 的 glare
function iAmOfferer(pid) {
  const me = iBroadcast(pid), them = theyBroadcast(pid);
  if (me !== them) return me;
  return myId < pid;
}
// 把本端的开麦/收听两个开关写回房间状态（对方靠它们决定要不要往我这里推流）
function publishMicFlags() {
  if (!joined || !link) return Promise.resolve();
  return mutate(n => {
    const p = n.players.find(x => x.id === myId);
    if (p) { p.micOn = !!MIC.on; p.micListen = !!MIC.listen; }
  }).catch(() => {});
}

// 只听不播的人不走 getUserMedia（不弹麦克风权限），但头像波动/自动播放兜底还需要一个 AudioContext
function ensureMicCtx() {
  try {
    MIC.ctx = MIC.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (MIC.ctx.state === 'suspended') MIC.ctx.resume().catch(() => {});
  } catch { MIC.ctx = null; }
}
function startMicRuntime() {
  if (!micLive()) return;
  ensureMicCtx();
  startMicMeter(); startMicWatch(); startMicUnlock();
}
function stopMicRuntime() { stopMicMeter(); stopMicWatch(); stopMicUnlock(); }

async function toggleMic() {
  if (!joined || !link) { toast('先进入房间才能连麦', 'error'); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { toast('当前浏览器不支持连麦（WebRTC）', 'error'); return; }
  if (MIC.on) { closeMic(); return; }
  // 先在手势内同步拉起 AudioContext：await getUserMedia 会弹权限提示，那之后再 resume 已经不算用户手势
  // （iOS Safari 就会把它停在 suspended，头像不波动、兜底的出声链路也放不出声）
  try {
    MIC.ctx = MIC.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (MIC.ctx.state === 'suspended') MIC.ctx.resume().catch(() => {});
  } catch { MIC.ctx = null; }
  try {
    MIC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch { toast('麦克风权限被拒绝，无法连麦', 'error'); return; }
  try {
    MIC.analyser = MIC.ctx.createAnalyser(); MIC.analyser.fftSize = 512;
    MIC.tmp = new Uint8Array(MIC.analyser.fftSize);
    MIC.ctx.createMediaStreamSource(MIC.stream).connect(MIC.analyser);
  } catch { /* 分析器建不起来不阻断通话，仅头像不波动 */ }
  MIC.on = true; MIC.since = Date.now(); MIC.warnedLink = false;
  syncAudioDuck();   // 开始广播 → 压低本机背景音乐，减少被麦克风收进去（音效不变）
  startMicRuntime();
  renderMicUI();
  await publishMicFlags();
  toast('🎙️ 麦克风已开，房里所有人都能听到你', 'success');
  micDuckHint();
}

// 收听开关：只听不播，不需要麦克风权限；关掉后不再建任何语音链路
async function toggleListen() {
  MIC.listen = !MIC.listen;
  try { localStorage.setItem(LISTEN_KEY, MIC.listen ? '1' : '0'); } catch {}
  syncAudioDuck();   // 仅收听时也适度压低背景音乐，免得音乐盖住人声
  if (MIC.listen) startMicRuntime();
  else if (!MIC.on) stopMicRuntime();
  syncMicPeers();   // 按新的方向位该拆的拆、该重谈的重谈（我还在广播的那几路要留住，不能一概拆掉）
  await publishMicFlags();   // 通知广播方：别往我这边推流了（不发的话对方会留一串黑洞链路）
  renderMicUI();
  toast(MIC.listen ? '🔊 已恢复收听' : '🔇 已静音收听（不影响你自己的麦克风）', '', 2600);
}

function closeMic(silent) {
  const was = MIC.on;
  MIC.on = false;
  syncAudioDuck();   // 关麦 → 背景音乐恢复原音量
  // 只拆“我作为广播方”参与的那些链路（方向变了就必须重谈）；“我在听他播”的那几路原样留着，
  // 否则我一关麦就会把别人讲话的声音一起干掉
  for (const [pid, pr] of [...MIC.peers]) {
    if (was && !silent && link && (pr.dir & 1)) { try { link.publishMic({ from: myId, to: pid, kind: 'bye', mid: genId(), t: Date.now() }); } catch {} }
    if (pr.dir !== 2 || silent) destroyPeer(pid);   // silent = 退房/重进房：静默拆干净，不留收听链路
  }
  MIC.stream && MIC.stream.getTracks().forEach(t => t.stop());
  MIC.stream = null; MIC.analyser = null;
  // 挂起 AudioContext：不再需要它（没人收听或已无链路）时才挂，不然音频线程一直转（白发热）
  try { MIC.ctx && MIC.ctx.state === 'running' && (!micLive() || !MIC.peers.size) && MIC.ctx.suspend(); } catch {}
  if (!micLive()) stopMicRuntime();
  if (was && !silent) publishMicFlags();
  renderMicUI();
}

function destroyPeer(pid) {
  const pr = MIC.peers.get(pid);
  if (!pr) return;
  MIC.peers.delete(pid);
  syncAudioDuck();   // 链路少了：只有还在听（或仍在广播）才继续压
  pr.dead = true;
  try { pr.pc.close(); } catch {}
  if (pr.el) { pr.el.pause(); pr.el.srcObject = null; pr.el.remove(); }
  try { pr.gain && pr.gain.disconnect(); pr.src && pr.src.disconnect(); pr.analyser && pr.analyser.disconnect(); } catch {}
}

function makePeer(pid) {
  if (MIC.peers.has(pid)) return MIC.peers.get(pid);
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const pr = { pid, pc, at: Date.now(), dir: peerDir(pid), el: null, src: null, gain: null, gainOn: false, analyser: null, tmp: null, ice: [], remoteSet: false, sdpSent: false, dead: false, relay: false, bytes: 0, gotAt: 0, trackAt: 0, nextTry: 0, warnedPlay: false, warnedMute: false, level: 0, hold: 0, attached: false, mediaOut: false, stream: null };
  if (MIC.on && MIC.stream) {
    // 我开麦：挂上音轨（sendrecv）。只听的一方会回 recvonly，协商结果就是单向广播
    MIC.stream.getAudioTracks().forEach(t => pc.addTrack(t, MIC.stream));
  } else if (peerMicOn(pid)) {
    // 我只收听：必须显式加一条 recvonly 音频 m-line，否则 SDP 里没有接收端，ontrack 永远不会触发
    try { pc.addTransceiver('audio', { direction: 'recvonly' }); }
    catch { /* 老浏览器没 addTransceiver：这种配对只能退回双方都开麦的全双工 */ }
  }
  // 对方推的音轨：streams[0] 在部分浏览器/不带 msid 的对端上是空数组，兜底用 track 自拼一个流，否则永远没声音
  pc.ontrack = e => attachRemote(pid, pr, (e.streams && e.streams[0]) || (e.track ? new MediaStream([e.track]) : null));
  // 6s 兜底发出的 SDP 可能还没收集完候选（实测 gatherAtSend 就是 'gathering'）：
  // 晚到的 srflx/relay 候选单独补发，不然它们永远传不出去，跨 NAT 就必挂
  pc.onicecandidate = e => {
    if (!e.candidate || !pr.sdpSent || !link || MIC.peers.get(pid) !== pr) return;
    try { link.publishMic({ from: myId, to: pid, kind: 'ice', c: e.candidate, mid: genId(), t: Date.now() }); } catch {}
  };
  pc.onconnectionstatechange = () => {
    if (!micLive() || !MIC.peers.get(pid) || pr.pc !== pc) return;
    // 链路断了：只有发起端重建，避免双方轮流重连
    if (pc.connectionState === 'failed' && iAmOfferer(pid)) { destroyPeer(pid); createPeerTo(pid); }
    renderMicUI();   // 接通/掉线即时反映到按钮标签
  };
  MIC.peers.set(pid, pr);
  syncAudioDuck();   // 新建语音链路：只听也适度压低音乐
  return pr;
}

// 非 trickle：等 ICE 收集完再发整份 SDP，本地模式（localStorage 单槽位）也不丢候选
function whenGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const chk = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', chk); res(); } };
    pc.addEventListener('icegatheringstatechange', chk);
  });
}
async function sendLocalSdp(pid, pr, kind) {
  await Promise.race([whenGatheringComplete(pr.pc), sleep(6000)]);
  if (MIC.peers.get(pid) !== pr || !pr.pc.localDescription || !link) return;
  try {
    link.publishMic({ from: myId, to: pid, kind, sdp: pr.pc.localDescription, mid: genId(), t: Date.now() });
    pr.sdpSent = true;   // 整份 SDP 已走 → 之后新收集到的候选改走单条 ice 消息
  } catch {}
}
async function createPeerTo(pid) {
  const pr = makePeer(pid);
  try {
    const offer = await pr.pc.createOffer();
    await pr.pc.setLocalDescription(offer);
    sendLocalSdp(pid, pr, 'offer');
    // 信令丢失兜底：9s 还没成链且这条链路仍然需要，重来一次
    setTimeout(() => {
      if (MIC.peers.get(pid) === pr && !pr.remoteSet && micLive() && peerNeeded(pid) && iAmOfferer(pid)) {
        destroyPeer(pid); createPeerTo(pid);
      }
    }, 9000);
  } catch {}
  return pr;
}

// 出声路径只有两条，二选一、互斥（同一个流同时走两路就是叠音）：
//   A. 元素直出（桌面）：<audio srcObject> 播。音质与回声消除按通话调校，但移动端会被系统切进听筒模式。
//   B. 媒体外放（触屏设备）：src → gain → ctx.destination。绕开通话模式，恒定走扬声器（见 useMediaOut 处注释）。
// 两条都搭在 pr.src（MediaStreamSource）之上：analyser 由它供数据，所以头像波形与走哪条路径无关。
//
// 实测（probe-micspeaker2.cjs，触屏模拟 + 假麦克风）：远端 WebRTC 音轨必须先被一个 media 元素「消费」，
// WebAudio 图才收得到数据——没有元素时 analyser 与 gain 输出恒为 0（真机上就是「链路已通却一点声音都没有」），
// 把同一个流挂到一个**不播放**的元素上，gain 输出立刻有信号；把元素移除，又回到静音。
// 所以媒体外放要留一个元素挂在流上当消费者，但绝不播它：paused 元素不出声，也不会被系统当成通话渲染。
function armGainOut(pr) {   // 建/恢复「媒体外放」链路（幂等：重复 connect 同一节点是 no-op）
  if (!pr.src || !MIC.ctx) return false;
  try {
    if (MIC.ctx.state === 'suspended') MIC.ctx.resume().catch(() => {});
    pr.gain = pr.gain || MIC.ctx.createGain();
    pr.src.connect(pr.gain);
    if (!pr.gainOn) { pr.gain.connect(MIC.ctx.destination); pr.gainOn = true; }
    return true;
  } catch { return false; }
}
// 远端元素只建一次、监听器一次挂全——它有两个身份：
//   · 元素直出时是「播放器」：出声 + 真出声后撤兜底防叠音
//   · 媒体外放时是「消费者」：只挂在流上不出声（没有它 WebAudio 收不到数据），万一被谁播起来立刻按回去
// 两个身份靠 pr.mediaOut 区分，所以监听器必须都挂着：切换身份时不能缺任何一条。
function makeRemoteEl(pid, pr, stream) {
  if (pr.el) return pr.el;
  const el = document.createElement('audio');
  pr.el = el;
  el.playsInline = true; el.style.display = 'none';
  el.srcObject = stream;
  el.addEventListener('canplay', () => { if (!pr.mediaOut && el.paused) playRemote(pid, pr); });
  el.addEventListener('playing', () => {
    if (pr.mediaOut) el.pause();   // 消费者不该出声：播了会叠音，还会把输出拽回听筒
    else unlockOff(pr);            // 元素真出声了 → 撤掉 gain 兜底，避免两路叠音
  });
  el.addEventListener('pause', () => { pr.nextTry = 0; });
  document.body.appendChild(el);
  return el;
}
// 媒体外放的「消费者」：挂着但从不播放（autoplay=false，也不调 play），出声全交给 gain
function attachRemoteSink(pr, stream) {
  const el = makeRemoteEl(pr.pid, pr, stream);
  el.autoplay = false;
}
// 元素直出那一条（桌面默认；也是媒体外放在 AudioContext 建不起来时的退路）
function attachRemoteEl(pid, pr, stream) {
  makeRemoteEl(pid, pr, stream).autoplay = true;
  playRemote(pid, pr);
}

function attachRemote(pid, pr, stream) {
  if (!stream || pr.attached) return;
  pr.attached = true;
  pr.stream = stream;   // 存一份：通话中切「外放/直出」要靠它重建另一条路径
  try {
    pr.src = MIC.ctx.createMediaStreamSource(stream);
    pr.analyser = MIC.ctx.createAnalyser(); pr.analyser.fftSize = 512;
    pr.tmp = new Uint8Array(pr.analyser.fftSize);
    pr.src.connect(pr.analyser);   // 只接分析器，不出声：出声交给下面二选一的那条路径
  } catch {}
  pr.trackAt = Date.now();
  // 触屏设备：走媒体外放。先挂「消费者」元素（没有它 WebAudio 收不到数据），再把它接到 gain 上
  if (useMediaOut() && pr.src) {
    attachRemoteSink(pr, stream);
    if (armGainOut(pr)) { pr.mediaOut = true; speakerHint(); return; }
  }
  attachRemoteEl(pid, pr, stream);   // 桌面，或 AudioContext 不可用 → 退回元素直出
}

// 通话中实时切换出声路径（设置面板的「连麦语音外放」开关）：先把旧路径拆干净再建新的，
// 任何事件时序下都不会出现两路同时出声
function applySpeakerMode() {
  for (const [, pr] of MIC.peers) {
    if (!pr.stream || pr.dead) continue;
    if (useMediaOut()) {
      if (pr.mediaOut) continue;
      if (pr.el) { pr.el.autoplay = false; pr.el.pause(); }   // 元素降级成不出声的「消费者」（仍挂在流上）
      else attachRemoteSink(pr, pr.stream);
      if (pr.src && armGainOut(pr)) pr.mediaOut = true;
      else if (pr.el) {                                // ctx 不可用：宁可退回元素直出，也别把声音切没
        pr.el.autoplay = true; playRemote(pr.pid, pr);
      }
    } else if (pr.mediaOut || !pr.el) {
      pr.mediaOut = false;
      unlockOff(pr);                                   // 撤掉媒体外放那一路
      attachRemoteEl(pr.pid, pr, pr.stream);           // 元素转回真正的播放元素（同一个元素复用，消费者身份也保住）
    }
  }
  syncAudioDuck();   // 外放开关影响压低力度（6% vs 14%）
}

// audio 元素被自动播放策略拦住时，AnalyserNode 照样有波形（头像照常波动），但扬声器一点声音都
// 没有——这正是“对方头像在动却没声音”的形态。三级兜底：重试 → 改走 AudioContext 直接出声 → 下次触摸再试。
function playRemote(pid, pr) {
  if (pr.mediaOut) return;   // 媒体外放：元素只是「消费者」不许播，出声走 gain，不进这套元素播放/兜底阶梯
  const el = pr.el;
  if (!el || pr.dead || !document.body.contains(el)) return;
  el.play().then(() => unlockOff(pr)).catch(() => {
    // 元素被拦住 → 改走 AudioContext 直接出声（这条兜底恰好就是手机端要的外放路径）
    if (armGainOut(pr)) { /* 重复 connect 同一节点是 no-op，所以不需要“只试一次”的守卫 */ }
    if (!pr.warnedPlay) { pr.warnedPlay = true; toast('🔇 浏览器拦住了语音自动播放，再点一下页面任意处就出声', 'error', 4200); }
  });
}
// 光靠一次 play() 不够：autoplay 属性可能先起播又被打断（iOS 音频会话抢占、后台切换），
// 这时元素停在 paused、AudioContext 兜底又被 playing 撤走 → 又是“波形在动但没声音”。
// 所以每帧确认“至少有一条出声路径”，没有就限流重试。
function ensureAudible(pr, now) {
  if (pr.mediaOut) {
    // 媒体外放：元素的 paused/canplay 判据全不适用。gain 断了就补；ctx 被系统挂起（切后台、被抢占）就限流唤醒
    if (!pr.gainOn) armGainOut(pr);
    else if (MIC.ctx && MIC.ctx.state !== 'running' && pr.nextTry <= now) {
      pr.nextTry = now + 1200;
      MIC.ctx.resume().catch(() => {});
    }
    return;
  }
  if (!pr.el || pr.gainOn || !pr.el.paused) return;
  if (pr.nextTry > now) return;
  pr.nextTry = now + 1200;
  playRemote(pr.pid, pr);
}
function unlockOff(pr) {
  if (pr.mediaOut) return;   // 媒体外放：gain 就是唯一的出声路径，不能撤
  if (!pr.gainOn) return;
  pr.gainOn = false;
  try { pr.gain && pr.gain.disconnect(); } catch {}
}
// 自动播放只在“有一次真实手势”后才放行；开麦期间每一次触摸都顺手把还没出声的链路推一把
function startMicUnlock() {
  if (MIC.unlock) return;
  MIC.unlock = () => {
    if (MIC.ctx && MIC.ctx.state === 'suspended') MIC.ctx.resume().catch(() => {});   // 媒体外放靠 ctx，被挂起就唤不醒
    for (const [pid, pr] of MIC.peers) {
      if (pr.mediaOut) { if (!pr.gainOn) armGainOut(pr); }
      else if (pr.el && pr.el.paused) playRemote(pid, pr);
    }
  };
  document.addEventListener('pointerdown', MIC.unlock, { passive: true });
}
function stopMicUnlock() { if (MIC.unlock) { document.removeEventListener('pointerdown', MIC.unlock); MIC.unlock = null; } }

// 玩家列表 / micOn 变化时对账网状网：该建的建、该拆的拆、方向变了的重谈
function syncMicPeers() {
  // 我开麦 → 和房里每个人都要有一路（我广播给他们）；我没开麦 → 只连开了麦的人（我听他们）
  const want = new Set(S && joined ? S.players.filter(p => p.id !== myId && (iBroadcast(p.id) || theyBroadcast(p.id))).map(p => p.id) : []);
  for (const [pid, pr] of [...MIC.peers]) {
    // 方向签名变了（比如我后开麦、对方后开麦）必须拆重谈：recvonly 的旧链路不会因为我单方面 addTrack 就变成双向
    if (!want.has(pid) || pr.dir !== peerDir(pid)) destroyPeer(pid);
  }
  for (const pid of want) {
    if (MIC.peers.has(pid)) continue;
    if (iAmOfferer(pid)) createPeerTo(pid);   // 发起端：主动 offer
    else makePeer(pid);                        // 响应端：先挂好回调等 offer
  }
  if (MIC.peers.size) startMicRuntime();
  else if (!MIC.on) stopMicRuntime();
}

async function onMicMsg(m) {
  if (!m || !m.from || !m.kind || m.from === myId || !joined) return;
  if (m.to !== myId && m.to !== '*') return;
  if (typeof m.t === 'number' && Date.now() - m.t > MIC_SIGNAL_TTL) return;   // 旧信令回放丢弃
  if (m.mid) {
    if (MIC.seen.has(m.mid)) return;
    if (MIC.seen.size > 500) MIC.seen.clear();
    MIC.seen.add(m.mid);
  }
  if (!micLive()) return;
  if (m.kind === 'bye') { destroyPeer(m.from); return; }
  if (m.kind === 'offer') {
    if (iAmOfferer(m.from)) return;   // 双方都发 offer 的冲突兜底：该自己发的那一方不去答对方
    // 对方抓在我本地开关生效前发来 offer：按最新方向位这条链路不该存在，建了就是个孤儿
    if (!peerNeeded(m.from) || !peerDir(m.from)) return;
    // 对端 9s 重建后重发的 offer：旧链路已死透，拆掉重谈，而不是当作重复消息丢弃
    if (MIC.peers.has(m.from) && MIC.peers.get(m.from).remoteSet) destroyPeer(m.from);
    const pr = makePeer(m.from);
    try {
      await pr.pc.setRemoteDescription(m.sdp);
      pr.remoteSet = true;
      for (const c of pr.ice.splice(0)) pr.pc.addIceCandidate(c).catch(() => {});
      const ans = await pr.pc.createAnswer();
      await pr.pc.setLocalDescription(ans);
      sendLocalSdp(m.from, pr, 'answer');
    } catch {}
  } else if (m.kind === 'answer') {
    const pr = MIC.peers.get(m.from);
    if (pr && !pr.remoteSet) {
      try {
        await pr.pc.setRemoteDescription(m.sdp);
        pr.remoteSet = true;
        for (const c of pr.ice.splice(0)) pr.pc.addIceCandidate(c).catch(() => {});
      } catch {}
    }
  } else if (m.kind === 'ice') {
    const pr = MIC.peers.get(m.from);
    if (!pr || !m.c) return;
    if (pr.remoteSet) pr.pc.addIceCandidate(m.c).catch(() => {});
    else pr.ice.push(m.c);
  }
}

// 音量仪表：本地 + 每个远端音轨就地 RMS → 写 --voice / speaking 到头像卡片
function paintVoice(pid, level, speaking) {
  const cards = document.querySelectorAll(`.player-card[data-pid="${CSS.escape(pid)}"]`);
  for (const c of cards) {
    c.classList.toggle('speaking', speaking);
    const ring = c.querySelector('.avatar-ring');
    if (ring) ring.style.setProperty('--voice', speaking ? Math.min(1, level * 1.8).toFixed(3) : '0');
  }
  // 背影化身同步说话态（第三人称：我在画面里的化身是我自己的发言指示器）
  const tp = document.getElementById('tp-back');
  if (tp && pid === myId) {
    tp.classList.toggle('speaking', speaking);
    tp.style.setProperty('--voice', speaking ? Math.min(1, level * 1.8).toFixed(3) : '0');
  }
}
function resetVoice() {
  document.querySelectorAll('.player-card.speaking').forEach(c => { c.classList.remove('speaking'); c.querySelector('.avatar-ring')?.style.setProperty('--voice', '0'); });
  document.querySelectorAll('.mic-btn').forEach(b => b.style.setProperty('--voice', '0'));
  const tp = document.getElementById('tp-back');
  if (tp) { tp.classList.remove('speaking'); tp.style.setProperty('--voice', '0'); }
}
function startMicMeter() {
  if (MIC.raf) return;
  const loop = () => {
    MIC.raf = 0;
    let any = false;
    if (MIC.on && MIC.analyser) {
      const raw = rmsLevel(MIC.analyser, MIC.tmp);
      MIC.localLevel += (raw - MIC.localLevel) * 0.35;
      const sp = voiceSpeaking(MIC, MIC.localLevel);
      paintVoice(myId, MIC.localLevel, sp);
      const lv = sp ? Math.min(1, MIC.localLevel * 1.8) : 0;
      document.querySelectorAll('.mic-btn').forEach(b => b.style.setProperty('--voice', lv.toFixed(3)));
      any = true;
    } else {
      paintVoice(myId, 0, false);
    }
    for (const [pid, pr] of MIC.peers) {
      if (pr.analyser) {
        const raw = rmsLevel(pr.analyser, pr.tmp);
        pr.level += (raw - pr.level) * 0.35;
        paintVoice(pid, pr.level, voiceSpeaking(pr, pr.level));
      }
      ensureAudible(pr, Date.now());
      any = true;
    }
    if (any) MIC.raf = requestAnimationFrame(loop);
    else { resetVoice(); renderMicUI(); }
  };
  MIC.raf = requestAnimationFrame(loop);
}
function stopMicMeter() { if (MIC.raf) cancelAnimationFrame(MIC.raf); MIC.raf = 0; resetVoice(); }

// 语音自检：“按钮显示连麦中、头像也在波动，但就是没声音”是连麦最难自查的一类，这里主动把它报出来
function startMicWatch() {
  if (MIC.watch) return;
  MIC.watch = setInterval(async () => {
    if (!micLive()) return;
    const now = Date.now();
    let live = 0, stale = 0;
    for (const pr of MIC.peers.values()) {
      const cs = pr.pc.connectionState;
      if (cs !== 'connected') {
        // 计时从“这条链路建立”起算，不是从本端开麦起算：对端晚开麦不该被当成卡死
        if (pr.remoteSet && now - pr.at > MIC_LINK_WARN_MS) stale++;
        continue;
      }
      live++;
      let bytes = pr.bytes, relay = pr.relay;
      try {
        const st = await pr.pc.getStats();
        const cand = new Map();
        st.forEach(s => { if (s.type === 'local-candidate') cand.set(s.id, s.candidateType); });
        st.forEach(s => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') bytes = Math.max(bytes, s.bytesReceived || 0);
          if (s.type === 'candidate-pair' && (s.selected || s.nominated) && cand.get(s.localCandidateId) === 'relay') relay = true;
        });
      } catch {}
      pr.bytes = bytes; pr.relay = relay;
      if (bytes > 0) { if (!pr.gotAt) pr.gotAt = now; }
      // 只有“对方应该在广播”的链路才需要入向流量；我开麦、对方只听时，收不到包是正常的
      else if ((pr.dir & 2) && !pr.warnedMute && now - (pr.trackAt || pr.at) > MIC_INBOUND_WARN_MS) {
        pr.warnedMute = true;
        toast('🔇 链路已通但没收到对方的声音：对方麦克风未推流或未放行', 'error', 4200);
      }
    }
    if (!live && stale && !MIC.warnedLink && now - MIC.since > MIC_LINK_WARN_MS) {
      MIC.warnedLink = true;
      toast('📶 语音链路一直连不通：跳运营商/对称 NAT 需要 TURN 中继，换网络（如手机热点）再试', 'error', 5200);
    }
    if (live) MIC.warnedLink = false;
    renderMicUI();   // 中继/断开等统计变化也能反映到按钮 title
  }, 2500);
}
function stopMicWatch() { clearInterval(MIC.watch); MIC.watch = null; }

function renderMicUI() {
  const n = S ? S.players.filter(p => p.micOn).length : 0;
  // 标签说实话：协商完成不等于听得见声音，只有 ICE/DTLS 真正 connected 才算一路接通
  let live = 0, pending = 0, dead = 0, relay = 0;
  for (const pr of MIC.peers.values()) {
    const cs = pr.pc.connectionState;
    if (cs === 'connected') { live++; if (pr.relay) relay++; }
    else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') dead++;
    else pending++;
  }
  // 触屏设备上把「走的是外放还是直出」也写进 title：真机上这就是「到底有没有外放」的自查依据
  const route = COARSE_TOUCH ? ` · 输出：${speakerPref ? '外放' : '直出'}` : '';
  const detail = MIC.on
    ? `语音链路：已接通 ${live} 路 · 协商未完 ${pending} · 已断开 ${dead}${relay ? ` · ${relay} 路走中继` : ''}${route}`
    : `语音通话（WebRTC）${route}`;
  document.querySelectorAll('.js-mic-btn').forEach(b => {
    b.classList.toggle('live', MIC.on);
    b.title = MIC.on ? detail : '开麦即广播：房里其他人不用开麦就能听到你';
    const label = b.querySelector('.mic-label');
    if (label) label.textContent = MIC.on
      ? (live ? `连麦中 · ${live + 1} 人${pending || dead ? '（链路未全通）' : ''}` : (n > 1 ? (pending ? '连麦中 · 接通中…' : '连麦中 · 连不通') : '连麦中 · 等待他人开麦'))
      : (n > 1 ? `连麦（房内 ${n} 人开麦）` : '连麦');
  });
  // 收听开关：默认开，所以这里只是“不想听”的出口
  const speaking = S ? S.players.filter(p => p.micOn && p.id !== myId).length : 0;
  document.querySelectorAll('.js-listen-btn').forEach(b => {
    b.classList.toggle('off', !MIC.listen);
    b.setAttribute('aria-pressed', MIC.listen ? 'true' : 'false');
    const label = b.querySelector('.listen-label');
    if (label) label.textContent = MIC.listen ? (speaking ? `收听中 · ${speaking} 人在说` : '收听（没人开麦）') : '已静音';
  });
}
function updateMicBadges() {
  if (!S) return;
  const on = new Set(S.players.filter(p => p.micOn).map(p => p.id));
  document.querySelectorAll('.player-card').forEach(c => c.classList.toggle('mic-on', on.has(c.dataset.pid)));
}

  /* ── 头像（tod 定制器整套下沉，v1.1 2026-09-20）：
     协议 'dcb:{"s":风格,"d":seed,"b":底色}'（~50B 随状态传输，各端本地生成逐字节一致）/ dataURL 上传图 /
     遗留 'av:P##' 短索引（组件不自创；共享库 tod:avatars:v1 里 tod applyIdentity 迁入的老预设可选可发、不可删）。
     渲染本地优先（window.DiceBearLocal，宿主须在本文之前 <script src="dicebear-local.js">），
     缺失时退 api.dicebear.com CDN（shapes 鲜色池特例会退化为 CDN 默认配色，仅漏带 script 才可达）。 ── */
  const DB_STYLES = ['adventurer', 'adventurer-neutral', 'avataaars', 'avataaars-neutral', 'big-ears', 'big-ears-neutral', 'big-smile', 'bottts', 'bottts-neutral', 'croodles', 'croodles-neutral', 'dylan', 'fun-emoji', 'glass', 'icons', 'identicon', 'initials', 'lorelei', 'lorelei-neutral', 'micah', 'miniavs', 'notionists', 'notionists-neutral', 'open-peeps', 'personas', 'pixel-art', 'pixel-art-neutral', 'rings', 'shapes', 'thumbs', 'toon-head'];
  const DB_STYLE_CN = {
    adventurer: '冒险者', 'adventurer-neutral': '冒险者·无脸', avataaars: '扁平小人', 'avataaars-neutral': '扁平·无脸',
    'big-ears': '大耳朵', 'big-ears-neutral': '大耳·无脸', 'big-smile': '大笑脸', bottts: '机器人', 'bottts-neutral': '机器人·无脸',
    croodles: '涂鸦', 'croodles-neutral': '涂鸦·无脸', dylan: '迪伦风', 'fun-emoji': '表情包', glass: '玻璃', icons: '图标',
    identicon: '万花筒', initials: '字母', lorelei: '线稿', 'lorelei-neutral': '线稿·无脸', micah: '米卡', miniavs: '迷你头像',
    notionists: '笔记人', 'notionists-neutral': '笔记·无脸', 'open-peeps': '人群', personas: '名片人',
    'pixel-art': '像素脸', 'pixel-art-neutral': '像素·无脸', rings: '三环', shapes: '假面', thumbs: '拇指人', 'toon-head': '卡通头',
  };
  const CZ_BGS = ['f7eeda', 'e3ece7', 'ece2f2', 'dee9f3', 'f7e3dd', 'f1ebda', 'e7e7ef', 'eaebeb'];
  const CZ_ABSTRACT = ['identicon', 'icons', 'rings', 'glass', 'initials', 'shapes'];   // 纯抽象/几何系不进默认随机池：桌上读不出「人」（与 tod 母本同规）
  const DB_SHAPE_COLORS = ['8b5cf6', 'f472b6', '22d3ee', 'f59e0b', '4ade80', 'ef4444', '6366f1', '14b8a6'];
  // 24 张遗留预设 = 纯渲染映射（逐字抄 tod 母本）：老玩家从 tod「我的」里带过来的 av:P## 条目还能出图；
  // 旧 party-net 房间文档（dcb + MONO-A## seed）不走这张表，31 风格本地全可生成。
  const AVATAR_PRESETS = [
    { n: '月白', st: 'pixel-art', sd: 'TOD-P00', bg: 'f7eeda' },
    { n: '拾翠', st: 'pixel-art', sd: 'TOD-P01', bg: 'e3ece7' },
    { n: '小贝', st: 'pixel-art', sd: 'TOD-P02', bg: 'ece2f2' },
    { n: '书呆', st: 'pixel-art', sd: 'TOD-P03', bg: 'dee9f3' },
    { n: '围炉', st: 'pixel-art', sd: 'TOD-P04', bg: 'f7e3dd' },
    { n: '栀子', st: 'pixel-art', sd: 'TOD-P05', bg: 'f1ebda' },
    { n: '嫩芽', st: 'pixel-art', sd: 'TOD-P06', bg: 'e7e7ef' },
    { n: '绅士', st: 'pixel-art', sd: 'TOD-P07', bg: 'eaebeb' },
    { n: '宿雾', st: 'pixel-art', sd: 'TOD-P08', bg: 'f7eeda' },
    { n: '栖霞', st: 'pixel-art', sd: 'TOD-P09', bg: 'e3ece7' },
    { n: '竹月', st: 'pixel-art', sd: 'TOD-P10', bg: 'ece2f2' },
    { n: '浮玉', st: 'pixel-art', sd: 'TOD-P11', bg: 'dee9f3' },
    { n: '远黛', st: 'pixel-art', sd: 'TOD-P12', bg: 'f7e3dd' },
    { n: '听雪', st: 'pixel-art', sd: 'TOD-P13', bg: 'f1ebda' },
    { n: '问心', st: 'shapes', sd: 'TOD-S14', bg: 'e7e7ef' },
    { n: '两面', st: 'shapes', sd: 'TOD-S15', bg: 'eaebeb' },
    { n: '戏面', st: 'shapes', sd: 'TOD-S16', bg: 'f7eeda' },
    { n: '窥真', st: 'shapes', sd: 'TOD-S17', bg: 'e3ece7' },
    { n: '挑灯', st: 'shapes', sd: 'TOD-S18', bg: 'ece2f2' },
    { n: '虚实', st: 'shapes', sd: 'TOD-S19', bg: 'dee9f3' },
    { n: '恶面', st: 'shapes', sd: 'TOD-S20', bg: 'f7e3dd' },
    { n: '照妖', st: 'shapes', sd: 'TOD-S21', bg: 'f1ebda' },
    { n: '羞月', st: 'shapes', sd: 'TOD-S22', bg: 'e7e7ef' },
    { n: '惊心', st: 'shapes', sd: 'TOD-S23', bg: 'eaebeb' },
  ];
  function hasLocalDice() {   // 存在性守卫：宿主漏带 dicebear-local.js 时裸引用会 ReferenceError 炸整条调用链
    return typeof window !== 'undefined' && !!window.DiceBearLocal
      && typeof window.DiceBearLocal.diceAvatar === 'function' && Array.isArray(window.DiceBearLocal.STYLES);
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function svgUri(svg) {   // 比 encodeURIComponent 省 ~35%：头像随房间状态走 MQTT，越短越好（tod 同款）
    return 'data:image/svg+xml,' + svg
      .replace(/%/g, '%25').replace(/"/g, "'").replace(/#/g, '%23')
      .replace(/</g, '%3C').replace(/>/g, '%3E').replace(/&/g, '%26')
      .replace(/\s+/g, ' ');
  }
  function presetUri(p) {   // 遗留预设本地生成（shapes 走鲜色池，与 tod 渲染一致）
    const opts = { seed: p.sd, backgroundColor: [p.bg] };
    if (p.st === 'shapes') {
      opts.style = 'bold';
      opts.shape1Color = opts.shape2Color = opts.shape3Color = DB_SHAPE_COLORS.slice();   // core 对多色数组做确定性 shuffle，须现切
    }
    return svgUri(window.DiceBearLocal.diceAvatar(p.st, opts).toString());
  }
  function cdnAvatarUri(st, seed, bg) {
    return 'https://api.dicebear.com/9.x/' + st + '/svg?seed=' + encodeURIComponent(seed) + '&backgroundColor=' + (bg || 'e7e7ef');
  }
  // 定制头像配方 → data-URI（DCB_CACHE 防呆：极端刷屏不清空就无限涨）
  const DCB_CACHE = new Map();
  function recipeToUri(rep) {
    if (DCB_CACHE.has(rep)) return DCB_CACHE.get(rep);
    let uri = '';
    try {
      const r = JSON.parse(rep.slice(4));
      if (r && typeof r.d === 'string' && window.DiceBearLocal.STYLES.includes(r.s)) {
        const opts = { seed: r.d };
        if (r.b) opts.backgroundColor = [r.b];
        if (r.s === 'shapes') {
          opts.style = 'bold';
          opts.shape1Color = opts.shape2Color = opts.shape3Color = DB_SHAPE_COLORS.slice();
        }
        uri = svgUri(window.DiceBearLocal.diceAvatar(r.s, opts).toString());
      }
    } catch { uri = ''; }
    if (DCB_CACHE.size > 400) DCB_CACHE.clear();
    DCB_CACHE.set(rep, uri);
    return uri;
  }
  function makeRecipe(style, seed, bg) {
    return 'dcb:' + JSON.stringify(bg ? { s: style, d: seed, b: bg } : { s: style, d: seed });
  }
  function presetOfAv(rep) {   // 'av:P07' → 预设表条目（表序与 tod ensureAvMaps 一致：P01 起算）
    if (!rep || !rep.startsWith('av:')) return null;
    return AVATAR_PRESETS[parseInt(rep.slice(5), 10) - 1] || null;
  }
  function avatarUri(rep) {
    if (!rep) return '';
    if (rep.startsWith('data:')) {   // 上传照片 dataURL 原样进 <img>。严格白名单：dataURL 会经宿主 innerHTML 插值，
      // 对端可伪造状态包里的 av（如 `data:x" onerror=…`）——只放行 base64 图片，其余一律拒
      return /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(rep) ? rep : '';
    }
    if (rep.startsWith('av:')) {
      const p = presetOfAv(rep);
      return p ? (hasLocalDice() ? presetUri(p) : cdnAvatarUri(p.st, p.sd, p.bg)) : '';
    }
    if (rep.startsWith('dcb:')) {
      if (hasLocalDice()) return recipeToUri(rep);
      try { const r = JSON.parse(rep.slice(4)); return cdnAvatarUri(r.s, r.d, r.b); } catch (e) { return ''; }
    }
    return '';
  }
  function avatarName(rep) {
    if (rep && rep.startsWith('av:')) { const p = presetOfAv(rep); return p ? p.n : '预设'; }
    try { return JSON.parse(rep.slice(4)).n || ''; } catch (e) { return ''; }
  }
  function czPersonaStyle() { return pick(DB_STYLES.filter(s => !CZ_ABSTRACT.includes(s))); }
  function czRandSeed() { return Math.random().toString(36).slice(2, 8); }
  const cz = { style: 'adventurer', seed: '', bg: CZ_BGS[0], styleTouched: false };   // 定制器活状态（bot 配方禁拨它，见 addBotToDoc）
  function czRep() { return makeRecipe(cz.style, cz.seed, cz.bg); }
  function czName() { return '定制 · ' + (DB_STYLE_CN[cz.style] || cz.style); }

  /* ── 「我的」头像库（与 tod 共用同一 key：同一浏览器同一人，存的头像全游戏通用）。
     写前必重读合并 + 监听 storage：tod 页开着时整对象回写会吞掉组件侧的增删，反之亦然 ── */
  const AV_STORE_KEY = 'tod:avatars:v1';
  let avatarStore = (() => {
    try { const o = JSON.parse(localStorage.getItem(AV_STORE_KEY) || ''); if (o && Array.isArray(o.mine)) return o; } catch { /* 损坏当空库 */ }
    return { mine: [] };
  })();
  function reloadStore() {
    try { const o = JSON.parse(localStorage.getItem(AV_STORE_KEY) || ''); if (o && Array.isArray(o.mine)) avatarStore = o; } catch { /* 保持内存态 */ }
  }
  function saveAvatarStore() {
    try { localStorage.setItem(AV_STORE_KEY, JSON.stringify(avatarStore)); }
    catch (e) { toast('本地存储已满，这张头像存不下了', 'error'); }
  }
  function storeAdd(rep) {   // 去重置顶，封顶 30 张（上传图 ~9KB/张，quota 无压力）
    reloadStore();
    avatarStore.mine = [rep, ...avatarStore.mine.filter(x => x !== rep)].slice(0, 30);
    saveAvatarStore(); renderMine();
  }
  function storeDel(rep) {
    reloadStore();
    avatarStore.mine = avatarStore.mine.filter(x => x !== rep);
    saveAvatarStore(); renderMine();
    if (avatarSel.rep === rep) {   // 删了正用着的 → 换一张全新定制脸（🎲 换 seed；selectRep 回写 key:avatar，防下次 boot 把被删 rep 捡回来）
      cz.seed = czRandSeed();
      selectRep(czRep(), czName(), 'custom'); avTab('custom');
    }
  }

  /* ── 选择模型：rep 进房间状态（'dcb:{…}' | dataURL | 只读遗留 'av:P##'）；每次选择都落 key:avatar（下次还在） ── */
  let avatarSel = { rep: '', name: '', tab: 'custom' };
  function repName(rep) {
    if (rep.startsWith('av:')) { const p = presetOfAv(rep); return p ? p.n : '预设'; }
    if (rep.startsWith('dcb:')) return '定制头像';
    return rep.startsWith('data:image/svg') ? '旧版头像' : '上传照片';
  }
  function selectRep(rep, name, tab) {
    avatarSel = { rep, name: name || repName(rep), tab: tab || 'mine' };
    try { localStorage.setItem(key + ':avatar', avatarSel.rep); } catch (e) {}
    updateSelVisual();
    showAvatarName(avatarSel.name);
  }
  function myAvatar() { return avatarSel.rep || makeRecipe(czPersonaStyle(), czRandSeed(), CZ_BGS[0]); }   // mount 前被 enter 的兜底（正常宿主先 mount）
  function showAvatarName(name) { const n = root && root.querySelector('.pn-avname'); if (n) n.textContent = name || ''; }
  function updateSelVisual() {
    if (!root) return;
    root.querySelectorAll('.pn-mine-selector .pn-avopt')
      .forEach(x => x.classList.toggle('selected', (x.dataset.avKey || x.dataset.avatar) === avatarSel.rep));   // data-av-key=遗留 av: 项
    const cnt = root.querySelector('.pn-mine-count');
    if (cnt) cnt.textContent = avatarStore.mine.length ? ' ' + avatarStore.mine.length : '';
  }
  function avTab(which) {
    if (!root) return;
    for (const t of ['custom', 'mine']) {
      const on = t === which;
      const panel = root.querySelector('.pn-avpanel-' + t);
      if (panel) panel.hidden = !on;
      const tab = root.querySelector('.pn-avtab-' + t);
      if (tab) { tab.classList.toggle('sel', on); tab.setAttribute('aria-selected', String(on)); }
    }
    if (which === 'custom') refreshCz();
  }
  function mkTile(rep) {   // 「我的」圆角格（遗留 av: 项带 data-av-key；无本地生成时 img onerror 回首字母圆）
    const d = document.createElement('button');
    d.type = 'button'; d.className = 'pn-avopt';
    if (rep.startsWith('av:')) d.dataset.avKey = rep; else d.dataset.avatar = rep;
    const img = document.createElement('img');
    img.src = avatarUri(rep); img.alt = '';
    img.onerror = () => { const fb = el('span', 'pn-avfb', escHtml((repName(rep) || '?')[0] || '😊')); img.replaceWith(fb); };
    d.appendChild(img);
    return d;
  }
  function renderMine() {
    if (!root) return;
    const box = root.querySelector('.pn-mine-selector');
    if (box) {
      box.innerHTML = '';
      for (const rep of avatarStore.mine) {
        const wrapEl = document.createElement('span'); wrapEl.className = 'pn-mine-wrap';
        const nm = repName(rep);
        const d = mkTile(rep);
        d.title = nm; d.setAttribute('aria-label', nm);
        d.addEventListener('click', () => selectRep(rep, nm, 'mine'));
        wrapEl.appendChild(d);
        if (!rep.startsWith('av:')) {   // 遗留 av: 项不渲染删除角标：删了 tod 侧 boot 会把它再迁回来并重复 toast
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'pn-avdel'; x.textContent = '✕';
          x.title = '删除这张头像'; x.setAttribute('aria-label', '删除头像 ' + nm);
          x.addEventListener('click', ev => { ev.stopPropagation(); tapDel(x, rep); });
          wrapEl.appendChild(x);
        }
        box.appendChild(wrapEl);
      }
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'pn-avopt'; up.textContent = '📷';
      up.title = '上传图片'; up.setAttribute('aria-label', '上传自定义头像');
      up.addEventListener('click', () => { const f = root.querySelector('.pn-avatar-file'); if (f) f.click(); });
      box.appendChild(up);
    }
    const emptyEl = root.querySelector('.pn-mine-empty');
    if (emptyEl) emptyEl.hidden = avatarStore.mine.length > 0;
    updateSelVisual();
  }
  function tapDel(btn, rep) {   // 破坏性操作：首点染红 ⚠ 2.5s，再点才真删
    if (btn.dataset.armed) { storeDel(rep); return; }
    btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = '⚠';
    setTimeout(() => { btn.dataset.armed = ''; btn.classList.remove('armed'); btn.textContent = '✕'; }, 2500);
  }
  function refreshCz() {   // v1.2「拨了即用」：定制器即所选，预览只需跟图
    if (!root) return;
    const img = root.querySelector('.pn-cz-img');
    if (img) img.src = avatarUri(czRep());
  }
  function buildCzStyles() {   // 31 张活体小样（跟随当前 seed/底色；所见即所得：拨风格即采用）
    const box = root && root.querySelector('.pn-cz-styles');
    if (!box) return;
    box.innerHTML = '';
    for (const s of DB_STYLES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pn-cz-chip' + (s === cz.style ? ' sel' : '');
      b.title = s;
      const img = document.createElement('img');
      img.src = avatarUri(makeRecipe(s, cz.seed, cz.bg)); img.alt = '';
      const lab = document.createElement('span'); lab.textContent = DB_STYLE_CN[s] || s;
      b.append(img, lab);
      b.addEventListener('click', () => {
        cz.style = s; cz.styleTouched = true;
        box.querySelectorAll('.pn-cz-chip').forEach(x => x.classList.toggle('sel', x === b));
        refreshCz();
        selectRep(czRep(), czName(), 'custom');   // 拨了即用（v1.2：不再区分当前标签、无确认步骤）
      });
      box.appendChild(b);
    }
  }
  function buildCzBgs() {
    const box = root && root.querySelector('.pn-cz-bgs');
    if (!box) return;
    box.innerHTML = '';
    for (const c of [...CZ_BGS, '']) {   // 末位 '' = 无底色（透明）
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pn-cz-bg' + (c ? '' : ' none') + (c === cz.bg ? ' sel' : '');
      b.title = c ? '#' + c : '无底色';
      b.setAttribute('aria-label', b.title);
      if (c) b.style.background = '#' + c;
      b.addEventListener('click', () => {
        cz.bg = c;
        box.querySelectorAll('.pn-cz-bg').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
        refreshCz(); buildCzStyles();
        selectRep(czRep(), czName(), 'custom');   // 拨了即用
      });
      box.appendChild(b);
    }
  }
  function bootAdopt() {   // 上次的选择优先于随机（F5）：dcb 回填定制器继续拨；dataURL 落「我的」；无效/缺失（含旧版数字索引）才随机定制开箱即用
    let saved = '';
    try { saved = localStorage.getItem(key + ':avatar') || ''; } catch (e) {}
    if (saved.startsWith('dcb:')) {
      try {
        const r = JSON.parse(saved.slice(4));
        if (!hasLocalDice() || window.DiceBearLocal.STYLES.includes(r.s)) {
          cz.style = r.s; cz.seed = typeof r.d === 'string' ? r.d : ''; cz.bg = r.b || '';
          cz.styleTouched = true;   // 恢复上次选择=已表达风格偏好：🎲 只换脸不换风格
          buildCzBgs(); buildCzStyles();
        }
      } catch (e) {}
      selectRep(saved, undefined, 'custom'); avTab('custom');
      return;
    }
    if (saved.startsWith('av:') && presetOfAv(saved)) { selectRep(saved, undefined, 'mine'); avTab('mine'); return; }   // 遗留预设（tod 迁入）同样跨刷新恢复
    if (saved.startsWith('data:')) { selectRep(saved, undefined, 'mine'); avTab('mine'); return; }
    selectRep(czRep(), czName(), 'custom');   // 开箱即用：什么都不点直接加入，进状态的就是随机定制配方
  }
  function buildAvatarUI(form) {   // 进房表单的头像区（视觉/交互逐条对齐 tod 母本；≤619px 默认折叠，纯 CSS 无 resize 监听）
    const group = el('div', 'pn-avatar-group');
    const tabs = el('div', 'pn-avtabs'); tabs.setAttribute('role', 'tablist');
    const tabC = el('button', 'pn-avtab pn-avtab-custom sel', '🎨 定制');
    tabC.type = 'button'; tabC.setAttribute('role', 'tab'); tabC.setAttribute('aria-selected', 'true');
    tabC.addEventListener('click', () => avTab('custom'));
    const tabM = el('button', 'pn-avtab pn-avtab-mine', '我的<span class="pn-mine-count"></span>');
    tabM.type = 'button'; tabM.setAttribute('role', 'tab'); tabM.setAttribute('aria-selected', 'false');
    tabM.addEventListener('click', () => avTab('mine'));
    tabs.append(tabC, tabM);
    group.appendChild(tabs);

    const panelC = el('div', 'pn-avpanel-custom foldcz');   // foldcz 无条件常挂：展开钮与隐藏规则都只在 ≤619px 媒体查询里生效
    const expand = el('button', 'pn-btn-tiny pn-cz-expand', '🎨 31 风格与底色 ▸');
    expand.type = 'button'; expand.setAttribute('aria-expanded', 'false');
    expand.addEventListener('click', () => {
      const folded = panelC.classList.toggle('foldcz');
      expand.textContent = folded ? '🎨 31 风格与底色 ▸' : '收起风格与底色 ▴';
      expand.setAttribute('aria-expanded', String(!folded));
    });
    panelC.appendChild(expand);
    const wrapEl = el('div', 'pn-cz-wrap');
    const previewTile = el('div', 'pn-avopt pn-cz-preview');
    previewTile.title = '正在使用的头像 · 拨风格/底色/🎲 立即生效';
    previewTile.appendChild(el('img', 'pn-cz-img'));
    const side = el('div', 'pn-cz-side');
    const tools = el('div', 'pn-cz-tools');
    const reroll = el('button', 'pn-btn-tiny pn-cz-reroll', '🎲');
    reroll.type = 'button'; reroll.title = '随机换一张（点过风格后只换脸不换风格；同 seed 全网同一张）';
    reroll.setAttribute('aria-label', '随机换一张头像');
    reroll.addEventListener('click', () => {   // 没表达过风格偏好时整只随机，点过风格 chip 后只换脸不换风格
      cz.seed = czRandSeed();
      if (!cz.styleTouched) cz.style = czPersonaStyle();
      refreshCz(); buildCzStyles();
      selectRep(czRep(), czName(), 'custom');   // 拨了即用
    });
    tools.appendChild(reroll);
    const bgs = el('div', 'pn-cz-bgs'); bgs.setAttribute('role', 'group'); bgs.setAttribute('aria-label', '底色');
    tools.appendChild(bgs);
    const saveB = el('button', 'pn-btn-tiny pn-cz-save', '💾 存进我的');
    saveB.type = 'button'; saveB.title = '存进「我的」后，下次访问（其他游戏也一样）直接选';
    saveB.addEventListener('click', () => {
      const r = czRep();
      storeAdd(r);
      selectRep(r, '定制头像', 'custom');   // 存库≠切换：留在定制页继续拨
      toast('已存进「我的」，下次访问还能用 🎉', 'success');
    });
    side.appendChild(saveB);   // 存库钮贴预览右侧（垂直居中）， dice+色点独占下一整行
    wrapEl.append(previewTile, side);
    panelC.appendChild(wrapEl);
    panelC.appendChild(tools);
    const styles = el('div', 'pn-cz-styles'); styles.setAttribute('role', 'group'); styles.setAttribute('aria-label', '风格');
    panelC.appendChild(styles);
    panelC.appendChild(el('p', 'pn-cz-credit', '31 种风格本机生成（零外网）· 设计版权见 dicebear.com'));
    group.appendChild(panelC);

    const panelM = el('div', 'pn-avpanel-mine'); panelM.hidden = true;
    panelM.appendChild(el('div', 'pn-mine-selector'));
    panelM.appendChild(el('p', 'pn-mine-empty', '还没有你的专属头像 —— 去「🎨 定制」保存一张，或传张照片。✕ 可删除（点两次确认）。'));
    group.appendChild(panelM);

    group.appendChild(el('div', 'pn-avname'));
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true; file.className = 'pn-avatar-file';
    file.addEventListener('change', e => {   // 上传照片：压成 96px JPEG → 存入「我的」并选中（tod 同款）
      const f = e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        const dataUrl = cv.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(img.src);
        storeAdd(dataUrl);
        selectRep(dataUrl, '上传照片', 'mine');
        toast('照片已存进「我的」，下次访问还在 ✓', 'success');
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); toast('图片读不出来，换一张试试', 'error'); };
      img.src = URL.createObjectURL(f);
      e.target.value = '';
    });
    group.appendChild(file);
    form.insertBefore(group, form.firstChild);   // 头像区是表单第一块（昵称/创建在其下）；本函数在 form 入文档后才跑，这里必须前插

    buildCzBgs();
    cz.style = czPersonaStyle();   // 默认定制：随机人物向风格 + 随机 seed——必须在 buildCzStyles() 前定稿，chip 选中态才不烧死
    cz.seed = czRandSeed();
    buildCzStyles();
    refreshCz();
    bootAdopt();   // 上次的选择优先；都没有就用刚摇的随机定制
    renderMine();
    window.addEventListener('storage', e => { if (e.key === AV_STORE_KEY) { reloadStore(); renderMine(); } });   // 多端写库对账（F6）
  }

  /* ── 实例状态（S/myId/joined/link/NDOC 与 MIC 块的既名对齐） ── */
  let NDOC = null, S = null, myId = sessionStorage.getItem(key + ':tab') || genId();
  try { sessionStorage.setItem(key + ':tab', myId); } catch (e) {}
  let joined = false, NETMODE = false, link = null, netHBTimer = null;
  let lastKickSeq = 0, firstNetApply = true, root = null;
  const isHost = () => !!(NDOC && NDOC.players[0] && NDOC.players[0].id === myId);
  const seatOf = pid => NDOC ? NDOC.players.findIndex(p => p.id === pid) : -1;

  // 修改房间文档：深拷贝 → 改 → 本地应用 → 全链路发布。
  // mode: 'ck' 行动检查点（game 用 cfg.snapshot() 全量覆盖）| 'hb' 纯心跳（对端不重放 game）| 'edit' 治理写
  async function mutate(fn, mode = 'ck') {
    if (!NDOC || !link) return;
    const next = JSON.parse(JSON.stringify(NDOC));
    fn(next);
    next.writer = myId;
    next.ts = Date.now();
    next.expiresAt = Date.now() + 30 * 60 * 1000;
    next.seq = (next.seq || 0) + (mode === 'hb' ? 0 : 1);   // 心跳不占 seq 号：纯水位，防与行动检查点并发撞 seq 吞掉「轮到谁」快照
    if (mode === 'ck' && next.started) { try { next.game = cfg.snapshot(); } catch (e) {} }
    next.hbOnly = mode === 'hb';   // ck/edit 必须清掉 hbOnly（NDOC 拷贝会残留上次心跳的标记 → 对端从此不重放棋局）
    netSetDoc(next);
    let ok = await link.publishState(next);
    if (!ok && link.kind === 'mqtt') { await sleep(1200); ok = await link.publishState(next); }
  }

  function netSetDoc(d) {
    if (NDOC && d.room !== NDOC.room) return;
    if (NDOC) {
      // 心跳不占 seq 号后仍可能落后于接收端 seq：水位照收（lastSeen 不丢，否则落后者会被误判掉线）
      if (d.hbOnly && d.writer && d.writer !== myId) {
        const hp = NDOC.players.find(x => x.id === d.writer);
        if (hp && (d.ts || 0) > (hp.lastSeen || 0)) hp.lastSeen = d.ts;
      }
      if ((d.seq || 0) < (NDOC.seq || 0)) return;                        // 旧 seq 丢弃
      if ((d.seq || 0) === (NDOC.seq || 0) && (d.ts || 0) < (NDOC.ts || 0)) return;   // 同 seq 旧 ts 丢弃
      const old = new Map(NDOC.players.map(p => [p.id, p]));             // 成员合并：防发布竞争吞人/幽灵加入
      d.players = d.players.map(p => {
        const o = old.get(p.id);
        return o && (o.lastSeen || 0) > (p.lastSeen || 0) ? Object.assign({}, p, { lastSeen: o.lastSeen }) : p;
      });
      for (const o of old.values()) if (!d.players.some(p => p.id === o.id)) d.players.push(o);
    }
    const prevIds = NDOC ? NDOC.players.map(p => p.id) : [];
    const wasStarted = NDOC && NDOC.started;
    const needApply = d.started && d.game && d.writer !== myId && !d.hbOnly;
    NDOC = d; S = d;
    if (needApply) {
      try { cfg.onGame && cfg.onGame(d.game, d); } catch (e) {}
      if (!wasStarted) toast('🎮 房主已开局！', 'gain');
      if (cfg.kick && isHost() && d.game && d.game.phase !== 'OVER') {
        const p = d.game.players[d.game.turn];
        if (p && p.bot && d.seq !== lastKickSeq) {   // 房主接管补跑：代管座位/迁移后的悬空回合
          lastKickSeq = d.seq;
          setTimeout(() => { try { cfg.kick(d); } catch (e) {} }, 400);
        }
      }
    }
    if (!firstNetApply) {
      for (const p of d.players) if (!prevIds.includes(p.id) && p.id !== myId) toast(`🎉 ${p.name} 加入了房间`, 'gain');
    }
    firstNetApply = false;
    try { cfg.onState && cfg.onState(d); } catch (e) {}
    renderLobby();
  }

  /* ── 房间生命周期 ── */
  async function enter(room, name, asHost) {
    NETMODE = true;
    try { sessionStorage.setItem(key + ':netroom', room); } catch (e) {}
    link = new RoomLink(room, prefix, key);
    if (cfg.localOnly) link.useLocal();
    else await link.open();
    link.subscribe(d => netSetDoc(d));
    link.subscribeMic(onMicMsg);
    link.subscribeReact(m => { try { cfg.onReact && cfg.onReact(m); } catch (e) {} });
    const existing = asHost ? null : await probeRoom(room);
    if (!asHost && !existing) { toast('房间不存在或已过期', 'error'); leave(true); return false; }
    const mySeat = existing && existing.players.some(p => p.id === myId);
    if (existing && existing.started && !mySeat) { toast('该房间已开局，无法加入', 'error'); leave(true); return false; }
    if (existing && !existing.started && existing.players.length >= maxPlayers && !mySeat) { toast(`房间满员（${maxPlayers} 人）`, 'error'); leave(true); return false; }
    const doc = {
      room, v: 1, writer: myId, ts: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000,
      seq: existing ? (existing.seq || 0) + 1 : 0,   // 从房间现役 seq 起步：归零会被全员守卫丢弃（幽灵加入）
      started: existing ? existing.started : false, game: existing ? existing.game : null,
      players: existing ? existing.players.slice() : [],
    };
    if (!doc.players.some(p => p.id === myId)) doc.players.push({ id: myId, name, av: myAvatar(), micOn: false, micListen: true, lastSeen: Date.now() });
    else { const me = doc.players.find(p => p.id === myId); me.lastSeen = Date.now(); me.name = name || me.name; me.av = me.av || myAvatar(); }
    NDOC = doc; S = doc; joined = true;
    link.publishState(doc);
    startTimers();
    try { cfg.onState && cfg.onState(doc); } catch (e) {}
    renderLobby();
    sfxJoin();
    return true;
  }
  async function probeRoom(room) {
    const probe = new RoomLink(room, prefix, key);
    if (cfg.localOnly) probe.useLocal(); else await probe.open();
    let doc = null;
    probe.subscribe(d => { if (!doc) doc = d; });
    for (let i = 0; i < 30 && !doc; i++) await sleep(100);   // 最多 3s：弱网不误报「房间不存在」
    probe.close();
    if (doc && doc.expiresAt && Date.now() > doc.expiresAt) return null;   // 废弃房间当不存在
    return doc;
  }
  function sfxJoin() { try { cfg.sfx && cfg.sfx.join && cfg.sfx.join(); } catch (e) {} }

  function startTimers() {
    if (netHBTimer) return;
    netHBTimer = setInterval(async () => {
      if (!joined || !NDOC || !link || !link.alive) return;
      const now = Date.now();
      if (isHost()) {   // 掉线处置只由房主执行（并发处置会同 seq 互相覆盖）
        const dead = NDOC.players.filter(p => p.bot !== true && now - (p.lastSeen || 0) > NET_STALE_MS);
        if (dead.length) {
          await mutate(n => {
            if (!n.started) n.players = n.players.filter(p => now - (p.lastSeen || 0) <= NET_STALE_MS);   // 大厅：直接移出
            else if (cfg.prune) cfg.prune(n, now);   // 开局：游戏自己的代管策略（座位不删）
          }, 'edit');
          dead.forEach(p => toast(`👻 ${p.name} 掉线${NDOC.started ? '' : '，已移出房间'}`, '', 3000));
          return;
        }
      }
      await mutate(n => {
        const me = n.players.find(x => x.id === myId); if (me) me.lastSeen = Date.now();
        if (isHost()) n.players.forEach(p => { if (p.bot) p.lastSeen = Date.now(); });   // 机器人由房主代跑心跳
      }, 'hb');
    }, NET_HEARTBEAT_MS);
  }
  function leave(silent) {
    closeMic(true);
    if (netHBTimer) { clearInterval(netHBTimer); netHBTimer = null; }
    if (link) { try { link.close(); } catch (e) {} link = null; }
    NDOC = null; S = null; joined = false; NETMODE = false;
    try { sessionStorage.removeItem(key + ':netroom'); } catch (e) {}
    if (!silent && root) { root.querySelector('.pn-lobby').hidden = true; root.querySelector('.pn-form').hidden = false; }
    try { cfg.onState && cfg.onState(null); } catch (e) {}
    renderLobby();
  }
  window.addEventListener('pagehide', () => { if (NETMODE && joined && NDOC && link) { NDOC.writer = myId; NDOC.hbOnly = true; link.publishNow(link.topic, Object.assign({}, NDOC, { ts: Date.now(), seq: (NDOC.seq || 0) + 1 })); } });

  /* ── UI（自注入 CSS；容器内 = 默认联机表单 / 大厅；本地热座由宿主放进「高级选项」details） ── */
  const PN_CSS = `
.pn-form,.pn-lobby{display:grid;gap:10px}
.pn-form[hidden],.pn-lobby[hidden]{display:none!important}
.pn-avatar-group{display:grid;gap:6px}
.pn-grp-label{font-size:0.85rem;color:rgba(255,255,255,0.7)}
.pn-avtabs{display:flex;gap:4px;background:rgba(10,10,26,0.42);border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:4px;width:max-content;max-width:100%}
.pn-avtab{padding:7px 15px;border-radius:999px;border:none;background:transparent;color:rgba(255,255,255,0.75);font-family:inherit;font-size:0.82rem;cursor:pointer;transition:all 0.2s;min-height:36px}
.pn-avtab:hover{color:#fff}
.pn-avtab.sel{background:linear-gradient(135deg,var(--primary,#8b5cf6),var(--accent-pink,#f472b6));color:#fff;font-weight:700;box-shadow:0 4px 14px rgba(139,92,246,0.4)}
.pn-mine-count{font-size:0.72rem;opacity:0.75;margin-left:3px}
.pn-btn-tiny{padding:7px 12px;border-radius:10px;border:1px solid var(--glass-border,rgba(255,255,255,0.15));background:rgba(255,255,255,0.07);color:#fff;font-family:inherit;font-size:0.78rem;cursor:pointer;transition:all 0.2s;min-height:36px}
.pn-cz-reroll{padding:6px 9px;font-size:0.95rem;line-height:1;min-height:32px}
.pn-btn-tiny:hover{border-color:var(--accent-cyan,#22d3ee);background:rgba(34,211,238,0.12)}
.pn-btn-tiny:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(34,211,238,0.35)}
.pn-btn-tiny.primary{background:linear-gradient(135deg,var(--primary,#8b5cf6),var(--accent-pink,#f472b6));border:none;font-weight:700}
.pn-avopt{width:54px;height:54px;border-radius:16px;border:2px solid transparent;cursor:pointer;overflow:hidden;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#fff;padding:0;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),border-color 0.2s,box-shadow 0.2s}
.pn-avopt:hover{transform:translateY(-3px) scale(1.06);border-color:var(--accent-cyan,#22d3ee)}
.pn-avopt.selected{border-color:var(--accent-cyan,#22d3ee);box-shadow:0 0 0 3px rgba(34,211,238,0.32),0 8px 20px rgba(34,211,238,0.22)}
.pn-avopt:focus-visible{outline:none;border-color:var(--accent-cyan,#22d3ee)}
.pn-avopt img{width:100%;height:100%;object-fit:cover;display:block}
.pn-avfb{display:flex;align-items:center;justify-content:center;font-weight:800;color:#0b1020;background:linear-gradient(135deg,#22d3ee,#a78bfa)}
.pn-avname{color:var(--accent-cyan,#22d3ee);font-size:0.82rem;letter-spacing:3px;min-height:1.2rem;margin-top:3px;opacity:0.85}
.pn-cz-expand{display:none}   /* 桌面样式常开；仅 ≤619px 显示展开钮（窄屏默认折叠， tod 同款） */
.pn-cz-wrap{display:flex;gap:14px;align-items:center}
.pn-cz-preview{width:96px;height:96px;flex:none;background:rgba(255,255,255,0.14);cursor:default}
.pn-cz-preview:hover{transform:none;border-color:transparent}
.pn-cz-side{display:flex;align-items:center;justify-content:flex-end}
.pn-cz-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%;margin-top:10px}
.pn-cz-bgs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pn-cz-bg{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,0.25);cursor:pointer;padding:0;transition:transform 0.15s,border-color 0.15s}
.pn-cz-bg:hover{transform:scale(1.12)}
.pn-cz-bg.sel{border-color:var(--accent-cyan,#22d3ee);box-shadow:0 0 0 2px rgba(34,211,238,0.4)}
.pn-cz-bg.none{background:repeating-conic-gradient(rgba(255,255,255,0.25) 0% 25%,transparent 0% 50%) 0 0/10px 10px,rgba(0,0,0,0.3);font-size:0.6rem;color:#fff;line-height:1}
.pn-cz-styles{display:flex;gap:6px;flex-wrap:wrap;max-height:150px;overflow-y:auto;margin-top:10px;padding:4px 2px;scrollbar-width:thin}
.pn-cz-chip{width:58px;padding:4px 2px 3px;border-radius:12px;border:1px solid transparent;background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.72);font-family:inherit;font-size:0.62rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:all 0.15s}
.pn-cz-chip img{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1)}
.pn-cz-chip span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}   /* 「冒险者·无脸」折两行会把 chip 列撑乱 */
.pn-cz-chip:hover{border-color:var(--accent-cyan,#22d3ee);color:#fff}
.pn-cz-chip:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(34,211,238,0.35)}
.pn-cz-chip.sel{border-color:var(--primary,#8b5cf6);background:rgba(139,92,246,0.2);color:#fff;font-weight:700}
.pn-cz-credit{font-size:0.68rem;color:rgba(255,255,255,0.45);line-height:1.5;margin:8px 0 0}
.pn-mine-selector{display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%}
.pn-mine-wrap{position:relative}
.pn-avdel{position:absolute;top:-4px;right:-4px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(239,68,68,0.9);color:#fff;font-size:0.72rem;line-height:1;cursor:pointer;opacity:0;transition:opacity 0.15s,transform 0.15s;padding:0;z-index:2}
.pn-mine-wrap:hover .pn-avdel,.pn-mine-wrap:focus-within .pn-avdel{opacity:1}
.pn-avdel.armed{opacity:1;background:#b91c1c;transform:scale(1.25);box-shadow:0 0 0 3px rgba(239,68,68,0.4)}
.pn-mine-empty{font-size:0.74rem;color:rgba(255,255,255,0.55);line-height:1.6;margin:6px 0 0}
.pn-name{width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.25);color:#fff;font-size:0.95rem;box-sizing:border-box}
.pn-row{display:flex;gap:8px;align-items:center}
.pn-row .pn-room{width:110px;flex:0 0 auto;text-align:center;letter-spacing:4px;padding:10px 8px;border-radius:12px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.25);color:#fff;box-sizing:border-box}
.pn-row .btn-primary{flex:1;margin-top:0}
.pn-create,.pn-start{width:100%}
.pn-code{text-align:center;font-size:1.05rem;margin:4px 0}
.pn-code b{font-size:1.6rem;color:var(--accent-cyan,#22d3ee);letter-spacing:6px}
.pn-invite{margin:2px auto 8px;display:block;width:fit-content;font-size:0.82rem}
.pn-invite.copied{border-color:rgba(34,197,94,0.6);color:#4ade80}
.pn-players{display:grid;gap:6px;margin:4px 0}
.pn-prow{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:0.88rem}
.pn-prow img,.pn-prow .pn-avfb{width:28px;height:28px;border-radius:50%;flex:0 0 auto}
.pn-prow .off{opacity:0.45}
.pn-sub{font-size:0.8rem;color:rgba(255,255,255,0.6);margin:0 0 10px;line-height:1.5}
.pn-adv>summary{cursor:pointer;font-size:0.85rem;color:rgba(255,255,255,0.6);margin:6px 0}
@media (hover:none),(pointer:coarse){.pn-avdel{opacity:0.85}}   /* 触屏没 hover：删除角标常显 */
@media (max-width:619px){
  .pn-cz-expand{display:inline-flex;margin-bottom:2px}
  .pn-avpanel-custom.foldcz .pn-cz-styles,.pn-avpanel-custom.foldcz .pn-cz-credit,
  .pn-avpanel-custom.foldcz .pn-cz-tools{display:none}
  .pn-cz-preview{width:64px;height:64px}
  .pn-cz-bg{width:24px;height:24px}   /* 窄屏收一档：🎲+9 色点确定单行不折 */
}
@media (max-width:359px){   /* 极窄屏（320 级）：磁贴/chip 再收一档，防 cz-wrap 挤压换行错乱 */
  .pn-cz-preview{width:52px;height:52px}
  .pn-avopt{width:48px;height:48px}
  .pn-cz-chip{width:52px}
  .pn-cz-chip img{width:36px;height:36px}
}
@media (min-width:720px){   /* 宽屏左右分区（对齐 tod landui 加入页）：左列表单字段 + 右列头像墙；DOM 顺序不动（头像首位 v1.2 契约），纯 grid 放位。align-items:start 防 grid 默认 stretch 把左列输入框/CTA 撑高 */
  .pn-form{grid-template-columns:minmax(0,1.15fr) minmax(0,0.95fr);grid-template-rows:repeat(5,auto);align-items:start;align-content:start;column-gap:18px}
  .pn-form>.pn-avatar-group{grid-column:2;grid-row:1/span 5;align-self:start;max-height:calc(100vh - 140px);overflow-y:auto;padding-right:2px;scrollbar-width:thin}   /* span 数值而非 1/-1：隐式行下 -1 会塌成单行 */
  .pn-form>.pn-name,.pn-form>.pn-create,.pn-form>.pn-row,.pn-form>.pn-sub,.pn-form>.pn-pills{grid-column:1}
  .pn-form>.pn-create{align-self:start}   /* 基础样式的 align-self:stretch 在被头像列摊高的行里会把 CTA 拉成两倍高；横向满宽由 width:100% 保证 */
  .pn-lobby{max-width:520px;margin:0 auto;width:100%}   /* 入房大厅不跟宿主拉宽后的面板一起摊大饼 */
}
@media (prefers-reduced-motion:reduce){.pn-avopt,.pn-cz-bg,.pn-cz-chip,.pn-avtab,.pn-btn-tiny,.pn-create,.pn-join,.pn-start,.pn-addbot,.pn-leave{transition:none!important;animation:none!important}}   /* 只列组件自有类：裸 .btn-primary/.btn-ghost 会命中宿主页面组件外的按钮 */
/* ── 大 CTA + 药丸（2026-09-23 对齐 tod 填表页三件套：主操作=渐变大按钮+流光扫过；药丸由宿主注入 .pn-pills） ── */
.pn-create{position:relative;overflow:hidden;align-self:stretch;padding:14px 24px;font-size:1.04rem;border-radius:16px;letter-spacing:4px;text-indent:4px;font-weight:800;border:none;color:#fff;background:linear-gradient(120deg,#8b5cf6,#ec4899 55%,#8b5cf6);box-shadow:0 10px 30px rgba(139,92,246,0.4),inset 0 2px 0 rgba(255,255,255,0.28)}
.pn-create::after{content:'';position:absolute;top:0;bottom:0;left:-70%;width:44%;pointer-events:none;background:linear-gradient(105deg,transparent,rgba(255,255,255,0.5),transparent);transform:skewX(-18deg);animation:pn-shine 3.4s cubic-bezier(.4,0,.2,1) infinite}
@keyframes pn-shine{0%,60%{left:-70%}88%,100%{left:132%}}
.pn-create:hover{transform:translateY(-2px);box-shadow:0 16px 46px rgba(139,92,246,0.55),inset 0 2px 0 rgba(255,255,255,0.28)}
.pn-create:active{transform:scale(0.98)}
@media (prefers-reduced-motion:reduce){.pn-create::after{animation:none!important;display:none!important}}
body.loperf .pn-create::after{display:none}
.pn-pills{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.pn-pill{min-height:36px;padding:7px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);color:var(--accent-cyan,#22d3ee);font-family:inherit;font-size:0.84rem;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s}
.pn-pill:hover{border-color:var(--accent-cyan,#22d3ee);background:rgba(34,211,238,0.12)}
`;
  let cssInjected = false;
  function injectCss() {
    if (cssInjected) return; cssInjected = true;
    const st = document.createElement('style'); st.textContent = PN_CSS; document.head.appendChild(st);
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  /* ── 房间邀请链接（2026-09-23，四游戏表单对齐 tod 口径）：复制 ?room= 链接 + 粘贴链接/邀请文字自动抽房号 ──
     剪贴板降级链与 tod 同款：navigator.clipboard（安全上下文）→ execCommand 兜底 → 失败 toast 报房号。
     file:// 下 origin+pathname 拼不出可分享链接，退化为纯房号邀请文字。 */
  function pnExtractRoom(text) {
    if (!text) return '';
    const t = String(text);
    const m = t.match(/[?&#]room=([0-9]{5})/i) || t.match(/房号\s*[:：]?\s*([0-9]{5})/) || t.match(/^\s*([0-9]{5})\s*$/) || t.match(/([0-9]{5})/);
    return m ? m[1] : '';
  }
  function pnLegacyCopy(text) {
    let ta;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0';
      ta.contentEditable = 'true';
      document.body.appendChild(ta);
      const sel = document.getSelection();
      ta.focus(); ta.setSelectionRange(0, text.length);
      if (sel) { try { const r = document.createRange(); r.selectNodeContents(ta); sel.removeAllRanges(); sel.addRange(r); } catch (e) {} }
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (sel) { try { sel.removeAllRanges(); } catch (e) {} }
      return ok;
    } catch (e) { return false; }
    finally { try { ta && ta.remove(); } catch (e) {} }
  }
  async function pnCopyText(text) {
    const cb = navigator.clipboard;
    if (cb && cb.writeText && window.isSecureContext !== false) {
      try { await cb.writeText(text); return true; } catch (e) {}
    }
    return pnLegacyCopy(text);
  }
  function pnInviteText(room) {
    if (location.protocol === 'file:') return '来玩一局！各自打开同一份文件，输入房号 ' + room + ' 即可联机';
    return location.origin + location.pathname + '?room=' + room;
  }
  function mount(container) {
    injectCss();
    root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root || root._pn) return root; root._pn = true;
    const form = el('div', 'pn-form');
    const name = el('input', 'pn-name'); name.maxLength = 8; name.placeholder = '你的昵称'; name.autocomplete = 'off'; name.setAttribute('enterkeyhint', 'go');
    try { name.value = localStorage.getItem(key + ':netname') || ''; } catch (e) {}
    const create = el('button', 'btn-primary pn-create', '🌐 创建房间'); create.type = 'button';
    const row = el('div', 'pn-row');
    const roomIn = el('input', 'pn-room'); roomIn.maxLength = 120; roomIn.placeholder = '房号 / 邀请链接'; roomIn.inputMode = 'numeric'; roomIn.autocomplete = 'off';
    roomIn.addEventListener('paste', ev => {   // 粘整段邀请链接/文字即时抽房号（maxLength 放宽否则链接会被截断在 5 字符）
      try {
        const t = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
        const code = pnExtractRoom(t);
        if (code) { ev.preventDefault(); roomIn.value = code; }
      } catch (e) {}
    });
    const joinB = el('button', 'btn-primary pn-join', '加入'); joinB.type = 'button';
    row.appendChild(roomIn); row.appendChild(joinB);
    const hint = el('p', 'pn-sub', '创建房间把 5 位房号发给朋友；也可直接粘贴邀请链接或「房号 12345」文字。本地热座收在「高级选项」。');
    form.appendChild(name); form.appendChild(create); form.appendChild(row); form.appendChild(hint);
    // 直进预填（2026-09-23 对齐 tod「发现房间 X，输入名字即可加入」落地体验）：邀请链接 ?room=12345 打开即带房号
    // （数字 5 位才认，脏参数静默忽略）；带房号落地改提示文案并聚焦名字框，名字框回车即加入。
    try {
      const qr = pnExtractRoom(decodeURIComponent(location.search));
      if (qr) {
        roomIn.value = qr;
        hint.textContent = `已带上房号 ${qr} —— 输入名字即可加入`;
        // 聚焦名字框：宿主 boot（说明弹层/头像 UI 装配）可能随后夺焦，短轮询重试直到焦点钉在名字框
        let tries = 0;
        const focusName = () => {
          if (tries++ > 10 || !root.isConnected) return;
          try { name.focus(); } catch (e) {}
          if (document.activeElement !== name) setTimeout(focusName, 200);
        };
        setTimeout(focusName, 350);
      }
    } catch (e) {}
    name.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); joinB.click(); } });

    const lobby = el('div', 'pn-lobby'); lobby.hidden = true;
    const code = el('div', 'pn-code', '房号 <b class="pn-code-b">-----</b>');
    const invite = el('button', 'btn-ghost pn-invite', '📋 复制邀请链接'); invite.type = 'button';
    invite.addEventListener('click', async () => {
      sfxTap();
      if (!NDOC) return;
      const room = NDOC.room, text = pnInviteText(room);
      const ok = await pnCopyText(text);
      if (ok) {
        invite.textContent = '✅ 已复制！'; invite.classList.add('copied');
        setTimeout(() => { invite.textContent = '📋 复制邀请链接'; invite.classList.remove('copied'); }, 2000);
        if (location.protocol === 'file:') toast('已复制房号邀请（本地文件页地址不可分享）', 'success', 3600);
      } else toast('复制失败，房号：' + room + '（长按房号手动复制）', 'error', 4000);
    });
    const players = el('div', 'pn-players');
    const extra = el('div', 'pn-lobby-extra'); if (cfg.lobbyExtraHtml) extra.innerHTML = cfg.lobbyExtraHtml;
    const start = el('button', 'btn-primary pn-start', '开始游戏 🎮'); start.type = 'button'; start.hidden = true;
    const addBot = el('button', 'btn-ghost pn-addbot', '＋ 加一个机器人'); addBot.type = 'button'; addBot.hidden = true;
    const lv = el('button', 'btn-ghost pn-leave', '退出房间'); lv.type = 'button';
    lobby.appendChild(code); lobby.appendChild(invite); lobby.appendChild(players); lobby.appendChild(extra); lobby.appendChild(start); lobby.appendChild(addBot); lobby.appendChild(lv);

    create.addEventListener('click', async () => {
      sfxTap();
      const nm = (name.value || '').trim() || '房主';
      try { localStorage.setItem(key + ':netname', nm); } catch (e) {}
      create.disabled = joinB.disabled = true;
      await enter(roomCode(), nm, true);
      create.disabled = joinB.disabled = false;
    });
    joinB.addEventListener('click', async () => {
      sfxTap();
      const raw = (roomIn.value || '').trim();
      const rm = pnExtractRoom(raw) || raw.replace(/\D/g, '').slice(0, 5);   // 粘了整段邀请链接/文字也能抽出房号
      if (rm.length !== 5) { toast('请输入 5 位房号', 'error'); return; }
      if (rm !== roomIn.value) roomIn.value = rm;   // 回写规整值，让玩家看见实际加入的房号
      const nm = (name.value || '').trim() || '玩家';
      try { localStorage.setItem(key + ':netname', nm); } catch (e) {}
      create.disabled = joinB.disabled = true;
      await enter(rm, nm, false);
      create.disabled = joinB.disabled = false;
    });
    start.addEventListener('click', () => { sfxTap(); if (cfg.onStart) cfg.onStart(); });
    addBot.addEventListener('click', () => { sfxTap(); addBotToDoc(); });
    lv.addEventListener('click', () => { sfxTap(); leave(false); });

    root.appendChild(form); root.appendChild(lobby);
    buildAvatarUI(form);   // 必须在 form 入文档后再建：定制器构建/boot 全按 root 查询（detached 树上 querySelector 全空）
    renderLobby();
    return root;
  }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderLobby() {
    if (!root) return;
    const onNet = NETMODE && joined && NDOC;
    root.querySelector('.pn-form').hidden = onNet;
    root.querySelector('.pn-lobby').hidden = !onNet;
    if (!onNet) return;
    root.querySelector('.pn-code-b').textContent = NDOC.room;
    const pl = root.querySelector('.pn-players');
    pl.innerHTML = '';
    NDOC.players.forEach((p, i) => {   // DOM 建：img 断网裂图要能回落首字母圆（innerHTML 串没法挂 onerror）
      const off = Date.now() - (p.lastSeen || 0) > NET_STALE_GRAY_MS;
      const rowEl = el('div', 'pn-prow');
      const uri = avatarUri(p.av);
      if (uri) {
        const img = document.createElement('img'); img.alt = ''; img.src = uri;
        img.onerror = () => { const fb = el('span', 'pn-avfb', escHtml((p.name || '?')[0])); img.replaceWith(fb); };
        rowEl.appendChild(img);
      } else rowEl.appendChild(el('span', 'pn-avfb', escHtml((p.name || '?')[0])));
      rowEl.appendChild(el('span', off ? 'off' : '', escHtml(p.name) + (p.id === myId ? '（我）' : '') + (i === 0 ? ' 👑' : '') + (p.bot ? ' 🤖' : '') + (off ? ' · 离线?' : '')));
      pl.appendChild(rowEl);
    });
    const host = isHost();
    const startB = root.querySelector('.pn-start');
    startB.hidden = !host || !cfg.onStart;
    startB.disabled = NDOC.started || NDOC.players.length < 2;
    const ab = root.querySelector('.pn-addbot');
    ab.hidden = !host || !cfg.allowBots || NDOC.started || NDOC.players.length >= maxPlayers;
  }
  function addBotToDoc() {
    if (!NDOC || NDOC.started || !isHost()) return;
    const n = NDOC.players.filter(p => p.bot).length + 1;
    mutate(nn => { nn.players.push({ id: 'bot:' + genId(), name: '机器人' + '甲乙丙丁'[Math.min(n - 1, 3)] || n, bot: true, av: makeRecipe(czPersonaStyle(), 'B' + czRandSeed(), pick(CZ_BGS)), micOn: false, micListen: true, lastSeen: Date.now() }); }, 'edit');   // bot 配方内联生成：禁拨宿主正在用的 cz（会把 pending 预览偷偷换掉）
  }

  /* ── 对外 API ── */
  return {
    key, prefix,
    mount, renderLobby,
    mutate, enter, leave, probeRoom,
    setStarted() { if (NDOC && !NDOC.started) { NDOC.started = true; NDOC.game = null; NDOC.writer = myId; NDOC.ts = Date.now(); NDOC.seq = (NDOC.seq || 0) + 1; link.publishState(NDOC); try { cfg.onState && cfg.onState(NDOC); } catch (e) {} } },
    addBot: addBotToDoc,
    doc: () => NDOC, myId, myAvatar, avatarUri, avatarName, presets: [],   // presets 已废（24 格时代遗物）；保留空数组键位防老宿主解构炸
    mode: () => NETMODE, joined: () => joined, isHost, seatOf,
    link: () => link,
    mic: {
      on: () => !!MIC.on, peers: () => MIC.peers.size,
      toggle: () => toggleMic(), toggleListen: () => toggleListen(), close: closeMic,
    },
  };
}
window.PartyNet = { create };
