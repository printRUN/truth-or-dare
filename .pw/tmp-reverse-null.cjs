// 一次性：逆向 null 补丁并解析验证 —— 跑完即删
const fs = require('fs');
const vm = require('vm');
let s = fs.readFileSync('D:/myidea/truth-or-dare/uno.html', 'utf8');
const pairs = [
  // 逆向 pair 1（hideActions）
  [`function hideActions() { $('action-bar').classList.remove('show'); const u = $('btn-uno'); if (u) u.classList.remove('show');   // 首次 showActions 前 btn-uno 不存在`,
   `function hideActions() { $('action-bar').classList.remove('show'); $('btn-uno').classList.remove('show'); }`],
  // 逆向 pair 2（tickUnoWindow ring 守卫）
  [`  const ub = $('btn-uno');
  const ring = ub && ub.querySelector('.ring');
  if (ub && ring && ub.classList.contains('show')) {
    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    ring.style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;
  }`,
   `  const ub = $('btn-uno');
  if (ub && ub.classList.contains('show')) {
    const frac = Math.max(0, w.remain / UNO_WIN_MS);
    ub.querySelector('.ring').style.background = \`conic-gradient(rgba(255,255,255,0.85) \${frac * 360}deg, transparent 0)\`;
    ub.style.opacity = frac < 0.25 ? 0.55 : 1;
  }`],
];
let fail = 0;
for (const [cur, orig] of pairs) {
  const c = s.split(cur).length - 1;
  if (c !== 1) { console.error('逆向 MATCH ' + c + 'x: ' + cur.slice(0, 60)); fail++; continue; }
  s = s.replace(cur, () => orig);
}
if (fail) process.exit(1);
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(s))) {
  i++;
  if (i === 2) {
    try { new vm.Script(m[1], { filename: 'reversed' }); console.log('逆向后解析 OK → 元凶确为 null 补丁'); }
    catch (e) { console.log('逆向后仍报错: ' + e.message); }
  }
}
