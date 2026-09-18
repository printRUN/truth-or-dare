'use strict';
/* ═══ 炸弹猫 · 第一部分：工具 / 音效 / 猫脸头像 / 传输（cat/v1 主题族）═══
   传输层移植自 index.html 的 MiniMqtt/LocalTransport/RoomLink（r128 同源仓库），
   差分：topic 前缀 cat/v1、新增 p/<pid>（下行私密）与 p/<pid>/up（上行私密，仅主机订阅）、
   act 通道（玩家→主机动作）、'tod' 硬编码全部改名 'cat'。 */

const enc = new TextEncoder(), dec = new TextDecoder();
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pickOf = (arr, rnd) => arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)];

function genId() { return Math.random().toString(36).slice(2, 10); }
function roomCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function toast(msg, kind, ms) {
  const box = $('#bc-toast'); if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast-in' + (kind === 'error' ? ' err' : '');
  t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), ms || 2600);
}

/* ── SFX：WebAudio 现场合成，零资源 ── */
const SFX = {
  ctx: null, on: localStorage.getItem('cat:sfx') !== 'off',
  ac() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
  tone(f, d, type, vol, slide) {
    const c = this.ac(); if (!c || !this.on) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), c.currentTime + d);
    g.gain.setValueAtTime(vol || 0.16, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d + 0.02);
  },
  noise(d, vol, freq) {
    const c = this.ac(); if (!c || !this.on) return;
    const n = c.sampleRate * d, buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = c.createGain(); g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(c.destination); src.start();
  },
  play(name) {
    switch (name) {
      case 'tap': this.tone(660, 0.06, 'triangle', 0.1); break;
      case 'draw': this.noise(0.18, 0.14, 2400); this.tone(320, 0.12, 'sine', 0.08, 220); break;
      case 'flip': this.tone(520, 0.1, 'triangle', 0.12, 760); break;
      case 'deal': this.noise(0.1, 0.1, 3000); break;
      case 'nope': this.tone(180, 0.16, 'square', 0.14, 90); this.noise(0.12, 0.16, 900); break;
      case 'boom': this.noise(0.6, 0.34, 420); this.tone(90, 0.5, 'sawtooth', 0.24, 36); break;
      case 'defuse': this.tone(392, 0.12, 'sine', 0.12); setTimeout(() => this.tone(523, 0.14, 'sine', 0.12), 110); setTimeout(() => this.tone(659, 0.2, 'sine', 0.12), 230); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.14), i * 130)); break;
      case 'tick': this.tone(880, 0.03, 'square', 0.05); break;
      case 'pop': this.tone(420, 0.07, 'sine', 0.1, 700); break;
    }
  }
};

/* ── 猫脸头像：程序化生成（主题化、零依赖），avKey 'bc:h:s' ~16B 全端确定性 ── */
const CAT_HUES = [18, 42, 95, 160, 200, 260, 320, 350];
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const avCache = new Map();
function makeCatFace(hue, seed) {
  const key = 'bc:' + hue + ':' + seed;
  if (avCache.has(key)) return avCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d'), rnd = mulberry32(hashStr(key));
  const h = ((hue % 360) + 360) % 360;
  const dark = `hsl(${h},52%,38%)`, mid = `hsl(${h},60%,58%)`, lite = `hsl(${h},62%,74%)`;
  // 底
  x.fillStyle = `hsl(${h},34%,20%)`; x.fillRect(0, 0, 128, 128);
  x.fillStyle = `hsla(${h},60%,60%,0.12)`; x.beginPath(); x.arc(64, 60, 54, 0, 7); x.fill();
  // 耳朵
  x.fillStyle = dark;
  x.beginPath(); x.moveTo(24, 44); x.lineTo(34, 8); x.lineTo(56, 30); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(104, 44); x.lineTo(94, 8); x.lineTo(72, 30); x.closePath(); x.fill();
  x.fillStyle = `hsl(${h},62%,72%)`;
  x.beginPath(); x.moveTo(30, 38); x.lineTo(36, 16); x.lineTo(50, 30); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(98, 38); x.lineTo(92, 16); x.lineTo(78, 30); x.closePath(); x.fill();
  // 头
  x.fillStyle = mid; x.beginPath(); x.ellipse(64, 62, 44, 38, 0, 0, 7); x.fill();
  // 花纹
  x.fillStyle = dark;
  if (rnd() < 0.55) { x.beginPath(); x.ellipse(64, 34, 5, 12, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(52, 32, 4, 9, 0.4, 0, 7); x.fill(); x.beginPath(); x.ellipse(76, 32, 4, 9, -0.4, 0, 7); x.fill(); }
  if (rnd() < 0.4) { x.fillStyle = lite; x.beginPath(); x.ellipse(64, 78, 18, 14, 0, 0, 7); x.fill(); }
  // 眼睛
  const eh = 6 + rnd() * 3;
  x.fillStyle = '#fff';
  x.beginPath(); x.ellipse(47, 58, 8, eh, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(81, 58, 8, eh, 0, 0, 7); x.fill();
  x.fillStyle = '#1c1420';
  x.beginPath(); x.ellipse(47, 58, 3, eh * 0.82, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(81, 58, 3, eh * 0.82, 0, 0, 7); x.fill();
  // 鼻嘴
  x.fillStyle = `hsl(${h},70%,80%)`;
  x.beginPath(); x.moveTo(60, 70); x.lineTo(68, 70); x.lineTo(64, 75); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(20,12,24,0.7)'; x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(64, 75); x.quadraticCurveTo(60, 82, 54, 79); x.moveTo(64, 75); x.quadraticCurveTo(68, 82, 74, 79); x.stroke();
  // 胡须
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 1.4;
  for (const s2 of [-1, 1]) for (let i = 0; i < 3; i++) {
    x.beginPath(); x.moveTo(64 + s2 * 12, 72 + i * 2);
    x.quadraticCurveTo(64 + s2 * 34, 66 + i * 7, 64 + s2 * 52, 62 + i * 10); x.stroke();
  }
  const url = cv.toDataURL('image/png');
  avCache.set(key, url);
  return url;
}
function resolveAv(key) {
  if (typeof key !== 'string' || !key.startsWith('bc:')) return makeCatFace(CAT_HUES[0], 'x');
  const p = key.split(':');
  return makeCatFace(+p[1] || 0, p[2] || 'x');
}
function avImgHtml(key, cls) { return '<img class="' + (cls || '') + '" src="' + resolveAv(key) + '" alt="">'; }

/* ── MiniMqtt：MQTT-over-WebSocket 手写客户端（移植自 index.html，行为忠实）── */
class MiniMqtt {
  constructor({ url, clientId, keepalive = 60, onStatus }) {
    this.url = url; this.clientId = clientId; this.keepalive = keepalive;
    this.onStatus = onStatus || (() => {});
    this.subs = new Map(); this.buf = []; this.nextPid = 1;
    this.pubacks = new Map(); this.ws = null; this.closed = false; this.pingTimer = null;
  }
  connect(timeoutMs = 6000) {
    return new Promise(resolve => {
      let settled = false;
      const finish = ok => { if (!settled) { settled = true; this.onStatus(ok ? 'online' : 'offline'); resolve(ok); } };
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch { return finish(false); }
      this.ws = ws; ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { try { ws.close(); } catch {} finish(false); }, timeoutMs);
      ws.onopen = () => ws.send(this._pkt([0x10], this._connectBody()));
      ws.onmessage = ev => { this.buf.push(...new Uint8Array(ev.data)); this._drain(); if (this._connack && !settled) { clearTimeout(to); finish(true); } };
      ws.onerror = () => { clearTimeout(to); finish(false); };
      ws.onclose = () => { clearTimeout(to); clearInterval(this.pingTimer); if (!settled) finish(false); else if (!this.closed) this.onStatus('offline'); };
      this._connack = false;
    });
  }
  _connectBody() {
    const cp = enc.encode(this.clientId);
    return [0x00, 0x04, ...enc.encode('MQTT'), 0x04, 0x02, (this.keepalive >> 8) & 255, this.keepalive & 255, (cp.length >> 8) & 255, cp.length & 255, ...cp];
  }
  static _varint(n) { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; }
  _pkt(flagsByte, body) { return new Uint8Array([flagsByte, ...MiniMqtt._varint(body.length), ...body]); }
  _str(s) { const b = enc.encode(s); return [(b.length >> 8) & 255, b.length & 255, ...b]; }
  _send(bytes) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(bytes); }
  _drain() {
    while (this.buf.length >= 2) {
      let mul = 1, len = 0, i = 1, digit;
      do { if (i >= this.buf.length) return; digit = this.buf[i++]; len += (digit & 127) * mul; mul *= 128; } while (digit & 128);
      if (this.buf.length < i + len) return;
      const type = this.buf[0] >> 4, flags = this.buf[0] & 15;
      const body = Uint8Array.from(this.buf.slice(i, i + len));
      this.buf = this.buf.slice(i + len);
      this._handle(type, flags, body);
    }
  }
  _handle(type, flags, body) {
    if (type === 2) {
      this._connack = body[1] === 0;
      if (this._connack) {
        this.pingTimer = setInterval(() => this._send(this._pkt(0xc0, [])), this.keepalive * 1000 / 2);
        for (const topic of this.subs.keys()) this._subscribe(topic);
      }
    } else if (type === 3) {
      const qos = (flags >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.slice(2, 2 + tlen));
      let off = 2 + tlen;
      if (qos > 0) off += 2;
      const payload = body.slice(off);
      if (qos === 1) { const pid = (body[2 + tlen] << 8) | body[3 + tlen]; this._send(this._pkt(0x40, [(pid >> 8) & 255, pid & 255])); }
      const cb = this.subs.get(topic);
      if (cb) cb(payload);
    } else if (type === 4) {
      const pid = (body[0] << 8) | body[1];
      const fn = this.pubacks.get(pid);
      if (fn) { this.pubacks.delete(pid); fn(); }
    }
  }
  _subscribe(topic) {
    const pid = this.nextPid++;
    this._send(this._pkt(0x82, [(pid >> 8) & 255, pid & 255, ...this._str(topic), 0x01]));
  }
  subscribe(topic, cb) { this.subs.set(topic, cb); if (this.ws && this.ws.readyState === WebSocket.OPEN) this._subscribe(topic); }
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

/* ── LocalTransport：BroadcastChannel + localStorage retained 模拟（key 懒分配，支持动态私密 topic）── */
class LocalTransport {
  constructor(room) {
    this.tab = genId(); this.room = room;
    this.subs = new Map(); this.keys = new Map();
    this.channel = ('BroadcastChannel' in window) ? new BroadcastChannel('cat-' + room) : null;
    if (this.channel) this.channel.onmessage = e => {
      const d = e.data; if (!d || d.tab === this.tab) return;
      if (d.payload != null) { const cb = this.subs.get(d.topic); if (cb) cb(enc.encode(d.payload)); }   // 非 retained：载荷随 channel 直达
      else this._emit(d.topic);                                                                          // retained：从 localStorage 读
    };
    window.addEventListener('storage', e => { if (e.key && e.key.indexOf('cat:room:' + room) === 0) this._emit(); });
  }
  _key(topic) {
    if (!this.keys.has(topic)) {
      const short = topic.indexOf('/p/') >= 0 ? 'p-' + topic.split('/').slice(4).join('-') : topic.split('/').pop();
      this.keys.set(topic, 'cat:room:' + this.room + ':' + short);
    }
    return this.keys.get(topic);
  }
  _emit(topic) {
    for (const t of (topic ? [topic] : [...this.subs.keys()])) {
      const cb = this.subs.get(t); if (!cb) continue;
      const s = localStorage.getItem(this._key(t));
      if (s) cb(enc.encode(s));
    }
  }
  connect() { this._emit(); return Promise.resolve(true); }
  subscribe(topic, cb) { this.subs.set(topic, cb); const s = localStorage.getItem(this._key(topic)); if (s) cb(enc.encode(s)); }
  publish(topic, bytes, opts) {
    // retained 语义只给 state；act/priv/up/react 非 retained 不落盘（防 storage 重放风暴 + 手牌明文滞留），
    // 载荷随 BroadcastChannel 直达（storage 事件不带 payload，读盘会丢包）
    if (!(opts && opts.retain === false)) {
      const key = this._key(topic);
      if (bytes && bytes.length) localStorage.setItem(key, dec.decode(bytes)); else localStorage.removeItem(key);
    }
    if (this.channel) this.channel.postMessage({ tab: this.tab, topic, payload: bytes && bytes.length ? dec.decode(bytes) : null });
    return Promise.resolve(true);
  }
  close() { this.channel && this.channel.close(); }
}

/* ── RoomLink：三 broker 同连 fan-out + 动态私密主题 + 本地兜底 ── */
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
class RoomLink {
  constructor(room) {
    this.room = room;
    this.tState = `cat/v1/${room}/state`;
    this.tAct = `cat/v1/${room}/act`;     // 玩家→主机公共动作（非 retained）
    this.tReact = `cat/v1/${room}/react`; // 表情（非 retained）
    this.pfx = `cat/v1/${room}/p/`;       // p/<pid> 下行私密 · p/<pid>/up 上行私密（仅主机订阅）
    this.cbs = { state: null, act: null, react: null, priv: null, up: null };
    this.slots = []; this.kind = 'online';
    this.statusCb = () => {};
    this._privTopics = new Set();
    this._dialing = new Set(); this._keeper = null; this._closing = false; this._reconnecting = false; this._emptyRounds = 0;
  }
  get alive() { return this.slots.some(s => !s.dead); }
  _route(topic, bytes) {
    let v; try { v = JSON.parse(dec.decode(bytes)); } catch { return; }
    if (topic === this.tState) this.cbs.state && this.cbs.state(v);
    else if (topic === this.tAct) this.cbs.act && this.cbs.act(v);
    else if (topic === this.tReact) this.cbs.react && this.cbs.react(v);
    else if (topic.startsWith(this.pfx) && topic.endsWith('/up')) this.cbs.up && this.cbs.up(v);
    else if (topic.startsWith(this.pfx)) this.cbs.priv && this.cbs.priv(v);
  }
  _wire(t) {
    t.subscribe(this.tState, b => this._route(this.tState, b));
    t.subscribe(this.tAct, b => this._route(this.tAct, b));
    t.subscribe(this.tReact, b => this._route(this.tReact, b));
    for (const pt of this._privTopics) t.subscribe(pt, b => this._route(pt, b));
    return t;
  }
  _add(t, url) { const slot = { url, host: url ? this._host(url) : '本地', t, dead: false }; this.slots.push(slot); this._wire(t); return slot; }
  _retire(slot) { slot.dead = true; this.slots = this.slots.filter(x => x !== slot); try { slot.t.close(); } catch {} }
  async open() {
    this.statusCb('connecting', '');
    const allSettled = Promise.all(BROKERS.map(url => this._dial(url)));
    await Promise.race([
      (async () => { while (!this.alive && !this._closing) await sleep(50); })(),
      allSettled,
    ]);
    if (!this.alive) return this._fallbackLocal('所有在线服务器不可用，已切换到本地模式（同浏览器多标签）');
    await sleep(400);
    this.kind = 'mqtt'; this._status(); this._startKeeper();
    return 'mqtt';
  }
  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    const c = new MiniMqtt({ url, clientId: 'cat-' + genId(), onStatus: st => { if (st !== 'online') this._onDown(url); } });
    let ok = false;
    try { ok = await c.connect(5000); } catch { ok = false; }
    this._dialing.delete(url);
    if (this._closing || !ok) { c.close(); return false; }
    this.kind = 'mqtt'; this._add(c, url); this._status();
    return true;
  }
  _onDown(url) {
    const s = this.slots.find(x => x.url === url && !x.dead);
    if (s) this._retire(s);
    if (this.kind === 'mqtt') this._status();
  }
  _status() {
    const net = this.slots.filter(s => s.url).map(s => s.host);
    if (net.length) { this.currentHost = net.length > 1 ? `${net[0]} 等 ${net.length} 台` : net[0]; this.statusCb('online', this.currentHost); }
    else if (this.slots.length) { this.currentHost = '本地'; this.statusCb('online', '本地'); }
    else this.statusCb('syncing', '');
  }
  _startKeeper() {
    if (this._keeper) return;
    this._keeper = setInterval(async () => {
      if (this._closing) return;
      for (const url of BROKERS) if (!this.slots.some(s => s.url === url)) await this._dial(url);
      if (!this.alive && this.kind === 'mqtt') {
        if (++this._emptyRounds >= 3 && !this.slots.some(s => s.url === '')) this._fallbackLocal('与所有同步服务器的连接都断了，已临时切到本地模式');
        else this._status();
      } else this._emptyRounds = 0;
    }, 7000);
  }
  useLocal() {
    if (!this.slots.some(s => s.url === '')) this._add(new LocalTransport(this.room), '');
    this.kind = 'local'; this.currentHost = '本地'; this.statusCb('online', '本地');
    return 'local';
  }
  _fallbackLocal(msg) { if (msg) toast(msg, 'error', 4000); this.useLocal(); this._startKeeper(); return 'local'; }
  _host(url) { try { return new URL(url).hostname.replace('broker.', '').replace('test.', ''); } catch { return url; } }
  on(name, cb) { this.cbs[name] = cb; }
  _resubAll() { for (const s of this.slots) { try { this._wire(s.t); } catch {} } }
  addPrivTopic(topic) { this._privTopics.add(topic); for (const s of this.slots) { try { s.t.subscribe(topic, b => this._route(topic, b)); } catch {} } }
  async publishState(obj) { return this._pub(this.tState, obj, { retain: true }); }
  async publishAct(obj) { return this._pub(this.tAct, obj, { retain: false, qos1: false }); }
  async publishReact(obj) { return this._pub(this.tReact, obj, { retain: false, qos1: false }); }
  async publishPriv(pid, obj) { return this._pub(this.pfx + pid, obj, { retain: false, qos1: true }); }   // 主机→单玩家
  async publishUp(pid, obj) { return this._pub(this.pfx + pid + '/up', obj, { retain: false, qos1: true }); } // 玩家→主机
  publishNow(topic, obj, opts) {
    const bytes = enc.encode(JSON.stringify(obj));
    for (const s of this.slots) { try { s.t.publish(topic, bytes, opts || { retain: true, qos1: false }); } catch {} }
  }
  async _pub(topic, obj, opts) {
    if (!this.alive) { if (this.kind === 'mqtt' && !this._reconnecting) this.retryNow(); return false; }
    const bytes = enc.encode(JSON.stringify(obj));
    const rs = await Promise.all(this.slots.filter(s => !s.dead).map(s => s.t.publish(topic, bytes, opts).catch(() => false)));
    const ok = rs.some(Boolean);
    if (!ok && this.kind === 'mqtt' && !this._reconnecting) this.retryNow();
    return ok;
  }
  async retryNow() {
    if (this._reconnecting) return this.alive;
    this._reconnecting = true;
    if (!this.alive && this.kind === 'mqtt') this.statusCb('syncing', '重连中');
    await Promise.all(BROKERS.map(url => this._dial(url)));
    this._reconnecting = false;
    if (this.kind === 'mqtt') this._status();
    return this.alive;
  }
  close() { this._closing = true; clearInterval(this._keeper); this._keeper = null; this.slots.slice().forEach(s => this._retire(s)); }
}

function extractRoom() {
  const m1 = location.search.match(/[?&]room=([A-Za-z0-9]{3,8})/i);
  if (m1) return m1[1].toUpperCase();
  if (location.hash.length > 1) {
    const m2 = location.hash.match(/room=([A-Za-z0-9]{3,8})/i);
    if (m2) return m2[1].toUpperCase();
  }
  return '';
}
