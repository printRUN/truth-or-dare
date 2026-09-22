// 一次性：uno.html script#2 括号平衡扫描（跳过字符串/模板/注释），输出深度突变行 —— 跑完即删
const fs = require('fs');
const src = fs.readFileSync('D:/myidea/truth-or-dare/uno.html', 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, code = '', base = 0;
while ((m = re.exec(src))) {
  i++;
  if (i === 2) { code = m[1]; base = src.slice(0, m.index).split('\n').length; }
}
const stack = [];
let inS = null, inTpl = false, inLine = false, inBlock = false, esc = false;
const lines = code.split('\n');
for (let ln = 0; ln < lines.length; ln++) {
  const L = lines[ln];
  for (let c = 0; c < L.length; c++) {
    const ch = L[c], nx = L[c + 1];
    if (inLine) break;
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; c++; } continue; }
    if (inS) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === inS) inS = null; continue; }
    if (inTpl) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '`') inTpl = false; continue; }
    if (ch === '/' && nx === '/') { inLine = true; break; }
    if (ch === '/' && nx === '*') { inBlock = true; c++; continue; }
    if (ch === "'" || ch === '"') { inS = ch; continue; }
    if (ch === '`') { inTpl = true; continue; }
    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line: base + ln, col: c });
    if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      const want = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (!top || top.ch !== want) {
        console.log(`不匹配 @ 文件行 ${base + ln} 列 ${c}: 收到 ${ch}，栈顶=`, top || '空', top ? `@ 文件行 ${top.line}` : '');
        process.exit(0);
      }
    }
  }
  inLine = false;
}
if (stack.length) {
  console.log('未闭合（栈顶 5 个）:');
  stack.slice(-5).forEach(s => console.log(`  ${s.ch} @ 文件行 ${s.line} 列 ${s.col}: ${lines[s.line - base].slice(Math.max(0, s.col - 30), s.col + 40)}`));
} else console.log('平衡 ✅');
