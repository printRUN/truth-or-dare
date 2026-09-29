// 招2 补丁（续）：party-net.js 与 bombcat.html —— 池体插入锚点与 tod 不同，单独处理
'use strict';
const fs = require('fs');
const ROOT = 'D:/myidea/truth-or-dare/';
const srcTod = fs.readFileSync(ROOT + 'tod.html', 'utf8');
// 从已打补丁的 tod.html 里截出池体与 warmup 文本（保证三份逐字一致）
const POOL = srcTod.slice(srcTod.indexOf('\nconst SharedLinks = {'), srcTod.indexOf('const BROKERS =', srcTod.indexOf('const SharedLinks = {')));
const WARMUP = srcTod.slice(srcTod.indexOf('\nRoomLink.warmup = function'), srcTod.indexOf('// ───────────────────────────── 加入 / 退出', srcTod.indexOf('RoomLink.warmup = function'))).replace(/\n$/, '\n');
// WARMUP 截到 class 后下一个分节注释前可能不准，直接按大括号配平截取
{
  const start = srcTod.indexOf('\nRoomLink.warmup = function');
  let i = srcTod.indexOf('{', start), depth = 0, end = -1;
  for (; i < srcTod.length; i++) {
    if (srcTod[i] === '{') depth++;
    else if (srcTod[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const warm = srcTod.slice(start, end + 1);
  global.__WARMUP = warm;
}

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

const POOL_TXT = srcTod.slice(srcTod.indexOf('// ═══ 共享链路池'), srcTod.indexOf('// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口')).replace(/\n$/, '');
const WARM_TXT = global.__WARMUP;

// party-net.js 可能是 CRLF：先归一 LF（项目约定），再打补丁
{
  const p = ROOT + 'party-net.js';
  const rawP = fs.readFileSync(p, 'utf8');
  if (rawP.includes('\r\n')) fs.writeFileSync(p, rawP.replace(/\r\n/g, '\n'));
}

patch('party-net.js', rep => {
  rep('class RoomLink {\n  constructor(room, prefix, keyPrefix) {', POOL_TXT + '\n\nclass RoomLink {\n  constructor(room, prefix, keyPrefix) {', '池体插入');
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
}` + '\n' + WARM_TXT, 'warmup 追加');
  rep(`    } catch (e) {}
    return root;
  }
  function escHtml(s)`, `    } catch (e) {}
    if (!cfg.localOnly) RoomLink.warmup(key + '-');   // 加入表挂好就预拨三台 broker（2026-09-24 加载提速轮）
    return root;
  }
  function escHtml(s)`, 'mount warmup');
});

patch('bombcat.html', rep => {
  rep("const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];",
    "const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];\n" + POOL_TXT, '池体插入');
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
}` + '\n' + WARM_TXT, 'warmup 追加');
});
