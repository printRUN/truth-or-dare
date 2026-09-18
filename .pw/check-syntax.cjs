// 语法门禁：把 index.html / monopoly.html 里每个内联 <script> 抽出来过一遍 new Function（编译不执行）。
// 附加断言：monopoly.html 内联的 three.js UMD 必须与 index.html 的那份字节一致（防单边升级造成双版本漂移）。
// 用法: node check-syntax.cjs   (from .pw/)
const fs = require('fs');
const crypto = require('crypto');
const FILES = ['D:/myidea/truth-or-dare/index.html', 'D:/myidea/truth-or-dare/monopoly.html'];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let bad = 0, total = 0;
const threeHashes = {};
for (const file of FILES) {
  const short = file.split('/').pop();
  if (!fs.existsSync(file)) { console.log(`MISSING: ${file}`); bad++; continue; }
  const src = fs.readFileSync(file, 'utf8');
  let m, i = 0;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    i++; total++;
    const code = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    try { new Function(code); console.log(`${short} script #${i} (line ${line}, ${code.length}B) OK`); }
    catch (e) { bad++; console.log(`${short} script #${i} (line ${line}) SYNTAX ERROR: ${e.message}`); }
    if (code.includes('Copyright 2010-2021 Three.js Authors')) {
      threeHashes[short] = crypto.createHash('sha256').update(code.trim()).digest('hex');   // trim：包裹换行不算漂移，UMD 本体必须一致
    }
  }
  console.log(`${short}: ${i} script block(s) scanned`);
}
if (Object.keys(threeHashes).length >= 2) {
  const hs = Object.values(threeHashes);
  if (new Set(hs).size === 1) console.log(`three.js 内联段 sha256 一致 ✅ ${hs[0].slice(0, 16)}…`);
  else { bad++; console.log(`three.js 内联段 sha256 不一致！${JSON.stringify(threeHashes).slice(0, 200)}`); }
} else {
  console.log(`three.js 内联段检出 ${Object.keys(threeHashes).length} 份（必须 index+monopoly 两份）`);
  bad++;
}
console.log(bad ? `FAILED: ${bad} problem(s)` : `ALL ${total} SCRIPT BLOCKS PARSE ✅`);
process.exitCode = bad ? 1 : 0;
