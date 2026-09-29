// 招2 补丁：共享 broker 链路池 + warmup 预拨 + open() 摘 400ms 固定税
// 三份同构拷贝一起改：tod.html（'tod-'）、party-net.js（key + '-'）、bombcat.html（'cat-'）
// 每个锚点断言恰好出现一次，防半套改动。
'use strict';
const fs = require('fs');
const ROOT = 'D:/myidea/truth-or-dare/';

// ═══ 共享池源码（三份一致；依赖各文件作用域里的 MiniMqtt / genId / BROKERS）═══
const POOL = `
// ═══ 共享链路池（2026-09-24 加载提速轮）═══════════════════════════
// 每台 broker 一条 WebSocket，页面内所有 RoomLink 共乘：enter/probeRoom/warmup 不再各拨各的
// （旧形态下加入者要付两轮拨号+两轮 retained 宽限）。规则：
//   · 逻辑 subscribe 在池层多路分发（MiniMqtt 单回调 Map 之上叠 Map<topic, Set<cb>>），view 按 topic
//     去重替换自己的回调（重订阅语义与单回调时代一致）；且每次逻辑 subscribe 都重发一次 MQTT
//     SUBSCRIBE → broker 重投 retained（重复投递对 tod/party-net/bombcat 的状态应用均幂等）；
//   · RoomLink 的 close/_retire 经 view 只摘引用（refs--、摘回调），物理连接只归池的 idle 定时器
//     （refs==0 宽限 45s 再关）；broker 掉线由池驱逐并回调所有持有者（各自摘 slot/刷状态/降级）；
//   · LocalTransport（url=''）不入池，仍随 RoomLink 私有。
const SharedLinks = {
  entries: new Map(),   // url -> { t, sets:Map<topic,Set>, refs, idle, dead, pend, holders:Map<fn,{v,onDown}> }
  async dial(url, cidPrefix, onDown) {
    let e = this.entries.get(url);
    if (e && !e.dead) { e.refs++; clearTimeout(e.idle); e.idle = null; return this.view(e, onDown); }
    if (e && e.pend) { const ok = await e.pend; return ok ? (e.refs++, this.view(e, onDown)) : null; }
    e = { sets: new Map(), refs: 1, idle: null, dead: false, holders: new Map() };
    const entry = e;
    entry.t = new MiniMqtt({ url, clientId: cidPrefix + genId(), onStatus: st => { if (st !== 'online') this.evict(url); } });
    entry.pend = (async () => {
      let ok = false;
      try { ok = await entry.t.connect(5000); } catch { ok = false; }
      entry.pend = null;
      if (!ok || entry.dead) { try { entry.t.close(); } catch {} if (this.entries.get(url) === entry) this.entries.delete(url); return false; }
      this.entries.set(url, entry);
      return true;
    })();
    const ok = await entry.pend;
    if (!ok) return null;
    return this.view(entry, onDown);
  },
  view(e, onDown) {
    const self = this;
    const has = e.holders.get(onDown);
    if (has) return has.v;   // 同一 RoomLink 重复 dial 同一 url（keeper 补连）：复用同一 view
    const mine = new Map();   // topic -> 本 view 当前回调（重订阅=替换，不堆积）
    const v = {
      subscribe(topic, cb) {
        const prev = mine.get(topic);
        if (prev === cb) return;
        if (prev) { const ps = e.sets.get(topic); if (ps) ps.delete(prev); }
        mine.set(topic, cb);
        let set = e.sets.get(topic);
        if (!set) { set = new Set(); e.sets.set(topic, set); }
        set.add(cb);
        e.t.subscribe(topic, bytes => { for (const f of [...set]) { try { f(bytes); } catch {} } });   // 重发 SUBSCRIBE → retained 重投
      },
      publish(topic, bytes, opts) { return e.t.publish(topic, bytes, opts); },
      close() {
        e.holders.delete(onDown);
        for (const [tp, cb] of mine) { const set = e.sets.get(tp); if (set) set.delete(cb); }
        mine.clear();
        self.release(e);
      },
    };
    e.holders.set(onDown, { v, onDown });
    return v;
  },
  release(e) {
    e.refs--;
    if (e.refs <= 0 && !e.idle) e.idle = setTimeout(() => { e.dead = true; try { e.t.close(); } catch {} }, 45000);   // 无主连接宽限 45s 再物理关
  },
  evict(url) {
    const e = this.entries.get(url);
    if (!e || e.dead) return;
    e.dead = true;
    clearTimeout(e.idle);
    this.entries.delete(url);
    try { e.t.close(); } catch {}
    for (const h of [...e.holders.values()]) { try { h.onDown(url); } catch {} }   // 持有者各自摘 slot + 刷新状态/降级
  },
};
`;

// warmup 追加在 class RoomLink 之后（三份一致）
const WARMUP = `
RoomLink.warmup = function (cidPrefix) {   // 进页预拨（2026-09-24）：填表期间把三台 broker 拨热，点加入时 _dial 直接领用近零耗时
  if (RoomLink._warmed) return;
  RoomLink._warmed = true;
  const noop = () => {};
  const held = BROKERS.map(url => SharedLinks.dial(url, cidPrefix, noop).catch(() => null));
  addEventListener('pagehide', () => { for (const p of held) p.then(v => { try { v && v.close(); } catch {} }); }, { once: true });   // 持 refs 防 idle 回收，离页才放
};
`;

function patch(file, fn) {
  let s = fs.readFileSync(ROOT + file, 'utf8');
  const rep = (a, b, name, count = 1) => {
    const n = s.split(a).length - 1;
    if (n !== count) { console.error(`${file}: ${name} 出现 ${n} 次（应为 ${count}）`); process.exit(1); }
    s = s.replace(a, b);
  };
  fn(rep);
  fs.writeFileSync(ROOT + file, s);
  console.log(`${file}: 池化补丁 ✔`);
}

// ── tod.html ──
patch('tod.html', rep => {
  // 1. 池体插在 RoomLink 横幅之前（横幅第一行注释锚定）
  rep('// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker',
    POOL + '// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker', '池体插入');
  // 2. 构造器钉死 _downFn（keeper 重拨不重复注册持有者）
  rep('    this._emptyRounds = 0;\n  }', '    this._emptyRounds = 0;\n    this._downFn = url => this._onDown(url);   // 池化：稳定回调身份，驱逐时按它反查持有者\n  }', '构造器 _downFn');
  // 3. _dial 走池
  rep(`  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    const c = new MiniMqtt({ url, clientId: 'tod-' + genId(), onStatus: st => { if (st !== 'online') this._onDown(url); } });
    let ok = false;
    try { ok = await c.connect(5000); } catch { ok = false; }
    this._dialing.delete(url);
    if (this._closing || !ok) { c.close(); return false; }
    this.kind = 'mqtt';   // 本地模式下补连成功 → 自动升回在线
    this._add(c, url);
    this._status();
    return true;
  }`, `  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    // 池化（2026-09-24）：连接全页面共享——warmup 预拨过就直接领用（近零耗时），没拨过才真拨；
    // 掉线由池统一驱逐（回调 this._downFn → _onDown 摘 slot），这里不再自建 MiniMqtt
    const c = await SharedLinks.dial(url, 'tod-', this._downFn);
    this._dialing.delete(url);
    if (this._closing) { try { c && c.close(); } catch {} return false; }
    if (!c) return false;
    this.kind = 'mqtt';   // 本地模式下补连成功 → 自动升回在线
    this._add(c, url);
    this._status();
    return true;
  }`, '_dial 池化');
  // 4. open() 摘 400ms 固定税
  rep(`    await sleep(400);   // 稍等 retained 消息送达`,
    `    // 旧版这里睡 400ms「等 retained」——实际订阅发生在 open() 返回之后（doJoin 里 link.subscribe
    // 会重发 SUBSCRIBE 触发 retained 重投），这 400ms 是纯固定税（2026-09-24 加载提速轮摘除）`, 'open 400ms');
  // 5. close() 摘回调（池化后连接可能比 RoomLink 长寿）
  rep(`  close() {
    this._closing = true;
    clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
  }`, `  close() {
    this._closing = true;
    clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }`, 'close 摘回调');
  // 6. warmup 追加到 class 结束后（close() 定义是类尾锚）
  rep(`    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}`,
    `    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}` + WARMUP, 'warmup 追加');
  // 7. boot 预拨
  rep(`setTimeout(() => perfWatch(), 2500);`, `RoomLink.warmup('tod-');   // 加入页预拨三台 broker：点「加入」时近零拨号耗时（2026-09-24 加载提速轮）
setTimeout(() => perfWatch(), 2500);`, 'boot warmup');
});

// ── party-net.js ──
patch('party-net.js', rep => {
  rep('// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker',
    POOL + '// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker', '池体插入');
  rep('    this._emptyRounds = 0;\n  }', '    this._emptyRounds = 0;\n    this._downFn = url => this._onDown(url);   // 池化：稳定回调身份，驱逐时按它反查持有者\n  }', '构造器 _downFn');
  rep(`  async _dial(url) {
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
  }`, `  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    // 池化（2026-09-24）：连接全页面共享——warmup 预拨过就直接领用（近零耗时），没拨过才真拨；
    // 掉线由池统一驱逐（回调 this._downFn → _onDown 摘 slot），这里不再自建 MiniMqtt
    const c = await SharedLinks.dial(url, key + '-', this._downFn);
    this._dialing.delete(url);
    if (this._closing) { try { c && c.close(); } catch {} return false; }
    if (!c) return false;
    this.kind = 'mqtt';   // 本地模式下补连成功 → 自动升回在线
    this._add(c, url);
    this._status();
    return true;
  }`, '_dial 池化');
  rep(`    await sleep(400);   // 稍等 retained 消息送达`,
    `    // 旧版这里睡 400ms「等 retained」——实际订阅发生在 open() 返回之后（enter 里 link.subscribe
    // 会重发 SUBSCRIBE 触发 retained 重投），这 400ms 是纯固定税（2026-09-24 加载提速轮摘除）`, 'open 400ms');
  rep(`  close() {
    this._closing = true;
    clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
  }`, `  close() {
    this._closing = true;
    clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }`, 'close 摘回调');
  rep(`    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}`,
    `    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}` + WARMUP, 'warmup 追加');
  // mount() 尾部预拨（尊重 localOnly：本地热座/探针 localnet=1 不出公网）
  rep(`    } catch (e) {}
    return root;
  }
  function escHtml(s)`, `    } catch (e) {}
    if (!cfg.localOnly) RoomLink.warmup(key + '-');   // 加入表挂好就预拨三台 broker（2026-09-24 加载提速轮）
    return root;
  }
  function escHtml(s)`, 'mount warmup');
});

// ── bombcat.html ──
patch('bombcat.html', rep => {
  // 池体插在 class RoomLink 之前（BROKERS 定义之后）
  rep("const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];",
    "const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];" + POOL, '池体插入');
  rep('this._dialing = new Set(); this._keeper = null; this._closing = false; this._reconnecting = false; this._emptyRounds = 0;',
    'this._dialing = new Set(); this._keeper = null; this._closing = false; this._reconnecting = false; this._emptyRounds = 0;\n    this._downFn = url => this._onDown(url);   // 池化：稳定回调身份，驱逐时按它反查持有者', '构造器 _downFn');
  rep(`  async _dial(url) {
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
  }`, `  async _dial(url) {
    if (this._closing || this._dialing.has(url)) return false;
    if (this.slots.some(s => s.url === url)) return true;
    this._dialing.add(url);
    // 池化（2026-09-24）：连接全页面共享——warmup 预拨过就直接领用（近零耗时），没拨过才真拨；
    // 掉线由池统一驱逐（回调 this._downFn → _onDown 摘 slot），这里不再自建 MiniMqtt
    const c = await SharedLinks.dial(url, 'cat-', this._downFn);
    this._dialing.delete(url);
    if (this._closing) { try { c && c.close(); } catch {} return false; }
    if (!c) return false;
    this.kind = 'mqtt'; this._add(c, url); this._status();
    return true;
  }`, '_dial 池化');
  rep(`    await sleep(400);`,
    `    // 旧版这里睡 400ms「等 retained」——订阅发生在 open() 返回之后（subscribe 重发 SUBSCRIBE
    // 触发 retained 重投），这 400ms 是纯固定税（2026-09-24 加载提速轮摘除）`, 'open 400ms');
  rep(`  close() { this._closing = true; clearInterval(this._keeper); this._keeper = null; this.slots.slice().forEach(s => this._retire(s)); }`,
    `  close() {
    this._closing = true; clearInterval(this._keeper); this._keeper = null;
    this.slots.slice().forEach(s => this._retire(s));
    this.cbs = { state: null, act: null, react: null, priv: null, up: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }`, 'close 摘回调');
  rep(`    this.cbs = { state: null, act: null, react: null, priv: null, up: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}`, `    this.cbs = { state: null, act: null, react: null, priv: null, up: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}` + WARMUP, 'warmup 追加');
});
