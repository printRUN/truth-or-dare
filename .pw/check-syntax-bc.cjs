// 炸弹猫语法门禁：抽出内联 <script>（src= 除外）逐块 new Function 验语法
// 附加断言（2026-09-24 加载优化轮）：bombcat.html 的 three 必须走 src 引用，不得再内联 UMD——
// 否则 .pw/build-bombcat.cjs 之外的旧装配习惯会把 589KB three 静默塞回单文件。
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
if (!src.includes('<script src="three.r128.js"></script>')) { bad++; console.error('缺 <script src="three.r128.js"> 引用（three 必须走共享外置件）'); }
if (/!function\(t,e\)\{"object"==typeof exports/.test(src)) { bad++; console.error('残留内联 three UMD！'); }
console.log(bad ? `FAIL: ${bad} problem(s)` : `ALL ${i} inline script block(s) OK + three src 引用在位`);
process.exit(bad ? 1 : 0);
