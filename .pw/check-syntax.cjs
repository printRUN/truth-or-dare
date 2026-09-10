// 语法门禁：把 index.html 里每个内联 <script> 抽出来过一遍 new Function
// 用法: node check-syntax.cjs   (from .pw/)
const fs = require('fs');
const src = fs.readFileSync('D:/myidea/truth-or-dare/index.html', 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(src))) {
  i++;
  const code = m[1];
  const line = src.slice(0, m.index).split('\n').length;
  try { new Function(code); console.log(`script #${i} (line ${line}, ${code.length}B) OK`); }
  catch (e) { bad++; console.log(`script #${i} (line ${line}) SYNTAX ERROR: ${e.message}`); }
}
console.log(bad ? `FAILED: ${bad} script block(s) with syntax errors` : `ALL ${i} SCRIPT BLOCKS PARSE ✅`);
process.exitCode = bad ? 1 : 0;
