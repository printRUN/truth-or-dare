// 修复：armWarmup 引用了未初始化的 tabTicket（let TDZ）→ 启动脚本中断、揭幕定时器没注册。
// 挪到 urlRoom/tabTicket 都已初始化之后（boot 揭幕块之前），并复用已算好的 urlRoom。
'use strict';
const fs = require('fs');
const ROOT = 'D:/myidea/truth-or-dare/';
let s = fs.readFileSync(ROOT + 'tod.html', 'utf8');

const block = `(function armWarmup() {   // 加入页预拨三台 broker：点「加入」时近零拨号耗时（2026-09-24 加载提速轮）。
  // 「本地模式：不联网」承诺优先（终审 P5）：本地回房票据/已勾选 chk-local → 不拨；
  // 带房号落地（?room= 进房意图明确）立即拨；其余等名字/房号框首次交互再拨（点勾选框不算交互，勾选后再交互会被拦）。
  if ((tabTicket && tabTicket.local) || $('chk-local').checked) return;
  if ((new URLSearchParams(location.search).get('room') || '').toUpperCase()) { RoomLink.warmup('tod-'); return; }
  let done = false;
  const go = () => { if (done) return; done = true; if (!$('chk-local').checked) RoomLink.warmup('tod-'); };
  for (const id of ['input-name', 'input-room']) { const el = $(id); if (!el) continue; el.addEventListener('focus', go, { once: true }); el.addEventListener('keydown', go, { once: true }); }
})();
`;
const n = s.split(block).length - 1;
if (n !== 1) { console.error('旧块锚点出现 ' + n + ' 次'); process.exit(1); }
s = s.replace(block, '');

const anchor = `const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();`;
if (s.split(anchor).length - 1 !== 1) { console.error('urlRoom 锚点异常'); process.exit(1); }
const moved = `(function armWarmup() {   // 加入页预拨三台 broker：点「加入」时近零拨号耗时（2026-09-24 加载提速轮）。
  // 「本地模式：不联网」承诺优先（终审 P5）：本地回房票据/已勾选 chk-local → 不拨；
  // 带房号落地（?room= 进房意图明确）立即拨；其余等名字/房号框首次交互再拨（点勾选框不算交互，勾选后再交互会被拦）。
  // 位置注意：必须在 tabTicket/urlRoom 初始化之后（let TDZ——放前面会在启动脚本里抛 ReferenceError）。
  if ((tabTicket && tabTicket.local) || $('chk-local').checked) return;
  if (urlRoom) { RoomLink.warmup('tod-'); return; }
  let done = false;
  const go = () => { if (done) return; done = true; if (!$('chk-local').checked) RoomLink.warmup('tod-'); };
  for (const id of ['input-name', 'input-room']) { const el = $(id); if (!el) continue; el.addEventListener('focus', go, { once: true }); el.addEventListener('keydown', go, { once: true }); }
})();
`;
s = s.replace(anchor, anchor + '\n' + moved);
fs.writeFileSync(ROOT + 'tod.html', s);
console.log('armWarmup 挪至 urlRoom/tabTicket 初始化之后 ✔');

// 顺带核查 bombcat 的 armWarmup 是否也有同类 TDZ/顺序问题（它引用的全是 DOM/localStorage，应安全）
const b = fs.readFileSync(ROOT + 'bombcat.html', 'utf8');
const bi = b.indexOf('(function armWarmup');
if (bi < 0) { console.error('bombcat armWarmup 丢失'); process.exit(1); }
const seg = b.slice(bi, b.indexOf('})();', bi));
for (const danger of ['tabTicket', 'urlRoom', 'rejoinName']) {   // 只查 tod 侧的外层 let/const（TDZ 风险源）
  if (seg.includes(danger)) { console.log('bombcat armWarmup 引用了外层变量 ' + danger + '（需人工核查顺序）'); process.exit(1); }
}
console.log('bombcat armWarmup 无 TDZ 风险 ✔');
