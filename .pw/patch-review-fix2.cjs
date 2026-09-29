function patch(file, fn) {
  let s = fs.readFileSync(ROOT + file, 'utf8');
  const rep = (a, b, name, count = 1) => {
    const n = s.split(a).length - 1;
    if (n !== count) { console.error(`${file}: ${name} 出现 ${n} 次（应为 ${count}）`); process.exit(1); }
    s = s.replace(a, b);
  };
  fn(rep);
  fs.writeFileSync(ROOT + file, s);
  console.log(`${file}: 终审修复 ✔`);
}
// 终审修复补丁（2026-09-24 双检查官）：
//   P1 池并发竞态：entries.set 同步注册 + pend 分支前置（三份拷贝 + index 副本同步）
//   P2 refs 计费随 view 走（复用 view 不重复计费）
//   P3 doJoin 尾部 Promise.all 加 .catch 兜底
//   P4 「✅ 就绪...」文案挪进 dataTail 末尾（门等待期可见）
//   P5 warmup 门控：本地模式承诺「不联网」（tod/bombcat 首次输入交互才拨 + chk-local/票据拦截）
//   P6 index.html 池化三件套同步（防副本分叉；不加 warmup 调用——arcade 恒不进房）
'use strict';
const fs = require('fs');
const ROOT = 'D:/myidea/truth-or-dare/';

// ── P6 前置：index.html 先补完整池化（副本防分叉；不加 warmup 调用——arcade 恒不进房）──
patch('index.html', rep => {
  rep('// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker',
    fs.readFileSync(ROOT + 'tod.html', 'utf8').slice(
      fs.readFileSync(ROOT + 'tod.html', 'utf8').indexOf('// ═══ 共享链路池'),
      fs.readFileSync(ROOT + 'tod.html', 'utf8').indexOf('// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口')
    ) + '// ═══════════════════════════════════════════════════════════════\n// RoomLink：对外统一接口。内部「同时」连所有公共 broker', '池体插入');
  rep('    this._emptyRounds = 0;\n  }', '    this._emptyRounds = 0;\n    this._downFn = url => this._onDown(url);   // 池化：稳定回调身份，驱逐时按它反查持有者\n  }', '构造器 _downFn');
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
  rep(`    await sleep(400);   // 稍等 retained 消息送达`,
    `    // 旧版这里睡 400ms「等 retained」——实际订阅发生在 open() 返回之后（doJoin 里 link.subscribe
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
}`, `    this.cbs = { state: null, pool: null, mic: null, react: null };   // 池化后底层连接可能比 RoomLink 长寿：摘回调防迟到消息打进已退的房
  }
}
RoomLink.warmup = function (cidPrefix) {   // 进页预拨（2026-09-24）：填表期间把三台 broker 拨热，点加入时 _dial 直接领用近零耗时
  if (RoomLink._warmed) return;
  RoomLink._warmed = true;
  const noop = () => {};
  const held = BROKERS.map(url => SharedLinks.dial(url, cidPrefix, noop).catch(() => null));
  addEventListener('pagehide', () => { for (const p of held) p.then(v => { try { v && v.close(); } catch {} }); }, { once: true });   // 持 refs 防 idle 回收，离页才放
};`, 'warmup 追加');
  // 注：池体从 tod 复制时已是 P1+P2 修复后的新版 dial，无需再替换
});
patch('bombcat.html', rep => {
  rep(`RoomLink.warmup('cat-');   // 加入页预拨三台 broker：点「进入房间」时近零拨号耗时（2026-09-24 加载提速轮）`,
`(function armWarmup() {   // 加入页预拨三台 broker：点「进入房间」时近零拨号耗时（2026-09-24 加载提速轮）。
  // 「本地模式」承诺优先（终审 P5）：已勾选 chk-local → 不拨；带房号落地立即拨；其余等名字/房号框首次交互再拨。
  let ticketLocal = false;
  try { ticketLocal = !!(JSON.parse(localStorage.getItem('cat:room') || 'null') || {}).local; } catch (e) {}
  if (ticketLocal || $('#chk-local').checked) return;
  if ((new URLSearchParams(location.search).get('room') || '') !== '') { RoomLink.warmup('cat-'); return; }
  let done = false;
  const go = () => { if (done) return; done = true; if (!$('#chk-local').checked) RoomLink.warmup('cat-'); };
  for (const sel of ['#in-name', '#in-room']) { const el = $(sel); if (!el) continue; el.addEventListener('focus', go, { once: true }); el.addEventListener('keydown', go, { once: true }); }
})();`);
});
