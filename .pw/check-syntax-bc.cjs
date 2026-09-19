// 炸弹猫语法门禁：抽出内联 <script>（src= 除外）逐块 new Function 验语法
// 用法: node check-syntax-bc.cjs [bombcat.html]   （路径相对仓库根；独立命名，不动 arcade 会话的 check-syntax.cjs）
'use strict';
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || 'bombcat.html';
const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(src))) {
  i++;
  const code = m[1];
  const startLine = src.slice(0, m.index).split('\n').length;
  try { new Function(code); console.log(`block #${i} ok (${Buffer.byteLength(code)} B, line ${startLine})`); }
  catch (e) { bad++; console.error(`block #${i} FAIL (line ${startLine}): ${e.message}`); }
}
console.log(bad ? `FAIL: ${bad} bad block(s)` : `ALL ${i} script block(s) OK`);
process.exit(bad ? 1 : 0);
