// 语法门禁：把 index.html / monopoly.html 里每个内联 <script> 抽出来过一遍 new Function（编译不执行）。
// 附加断言：monopoly.html 内联的 three.js UMD 必须与 index.html 的那份字节一致（防单边升级造成双版本漂移）。
// 用法: node check-syntax.cjs   (from .pw/)
const fs = require('fs');
const crypto = require('crypto');
// 硬编码白名单（禁改成读目录）：bombcat.html 在别的分支，合入后再议扩四方
const FILES = ['D:/myidea/truth-or-dare/index.html', 'D:/myidea/truth-or-dare/monopoly.html', 'D:/myidea/truth-or-dare/uno.html'];
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
if (Object.keys(threeHashes).length === 3) {
  const hs = Object.values(threeHashes);
  if (new Set(hs).size === 1) console.log(`three.js 内联段 sha256 一致 ✅ ${hs[0].slice(0, 16)}…`);
  else { bad++; console.log(`three.js 内联段 sha256 不一致！${JSON.stringify(threeHashes).slice(0, 200)}`); }
} else {
  console.log(`three.js 内联段检出 ${Object.keys(threeHashes).length} 份（必须 index+monopoly+uno 三份）`);
  bad++;
}
// party-net.js 公共组件也必须过 new Function 门禁
try { new Function(fs.readFileSync('D:/myidea/truth-or-dare/party-net.js','utf8')); total++; console.log('party-net.js OK'); }
catch (e) { bad++; console.log('party-net.js SYNTAX ERROR: ' + e.message); }
// dicebear-local.js（头像本地生成器，index.html 内联母本的抽取副本）同样过门禁，且内容不得与母本漂移：
// 比对走「EOL 归一后包含」——index.html 是 CRLF、抽取件是 LF，行尾差异合法，字符漂移不合法。
try {
  const dbSrc = fs.readFileSync('D:/myidea/truth-or-dare/dicebear-local.js', 'utf8');
  new Function(dbSrc); total++;
  const tod = fs.readFileSync('D:/myidea/truth-or-dare/index.html', 'utf8');
  const norm = s => s.replace(/\r\n/g, '\n');
  const a = tod.indexOf('var DiceBearLocal=(()=>{');
  const endTok = 'return n7(k8);})();';
  const bundle = a >= 0 ? tod.slice(a, tod.indexOf(endTok, a) + endTok.length) : '';
  const licStart = tod.indexOf('/*! Bundled license information:', a);
  const lic = licStart >= 0 ? tod.slice(licStart, tod.indexOf('\n*/', licStart) + 3) : '';
  if (!bundle || !lic) { bad++; console.log('dicebear-local 漂移检查失败：index.html 母本锚点没找到（内联段被改动？）'); }
  else if (!dbSrc.includes(norm(bundle)) || !dbSrc.includes(norm(lic))) { bad++; console.log('dicebear-local.js 与 index.html 内联母本漂移！改了母本就按 .pw/design-plan-avatar-component.md 重抽本文件'); }
  else if (dbSrc.includes('\r')) { bad++; console.log('dicebear-local.js 混入 CRLF（必须纯 LF）'); }
  else console.log(`dicebear-local.js OK（与 index.html 母本一致，${dbSrc.length}B）`);
} catch (e) { bad++; console.log('dicebear-local.js SYNTAX ERROR: ' + e.message); }
console.log(bad ? `FAILED: ${bad} problem(s)` : `ALL ${total} SCRIPT BLOCKS PARSE ✅`);
process.exitCode = bad ? 1 : 0;
