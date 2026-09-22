// 一次性：正确重应用两个 null 守卫（含丢失的收尾 }）+ 解析验证 —— 跑完即删
const fs = require('fs');
const vm = require('vm');
let s = fs.readFileSync('D:/myidea/truth-or-dare/uno.html', 'utf8');
const pairs = [
  [`function hideActions() { $('action-bar').classList.remove('show'); $('btn-uno').classList.remove('show'); }`,
   `function hideActions() { $('action-bar').classList.remove('show'); const u = $('btn-uno'); if (u) u.classList.remove('show'); }   // 首次 showActions 前 btn-uno 不存在`],
  [`  const ub = $('btn-uno');
  if (ub && ub.classList.contains('show')) {
    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    ub.querySelector('.ring').style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;
  }`,
   `  const ub = $('btn-uno');
  const ring = ub && ub.querySelector('.ring');
  if (ub && ring && ub.classList.contains('show')) {
    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    ring.style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;
  }`],
];
let fail = 0;
for (const [o, n] of pairs) {
  const c = s.split(o).length - 1;
  if (c !== 1) { console.error('MATCH ' + c + 'x: ' + o.slice(0, 60).replace(/\n/g, '|')); fail++; continue; }
  s = s.replace(o, () => n);
}
if (fail) process.exit(1);
fs.writeFileSync('D:/myidea/truth-or-dare/uno.html', s);
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(s))) {
  i++;
  if (i === 2) {
    try { new vm.Script(m[1]); console.log('解析 OK ✅'); }
    catch (e) { console.log('仍报错: ' + e.message); process.exit(1); }
  }
}
