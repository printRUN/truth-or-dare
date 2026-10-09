// 语法门禁：五个游戏页的内联 <script> 逐块过 new Function（编译不执行）；外置共享件做 sha256 锁。
// 2026-09-24 加载优化轮改版：three.js r128 与 DiceBear 不再内联进页面——
//   three.r128.js（五页引用）与 dicebear-local.js（tod/index/monopoly/uno 引用）是唯一母本，
//   本门禁改为「页面必须带 src 引用 + 页面内不得残留内联体 + 外置件 sha256 锁内容防漂移」。
// 用法: node check-syntax.cjs   (from .pw/)
const fs = require('fs');
const crypto = require('crypto');
const ROOT = 'D:/myidea/truth-or-dare';
// 硬编码白名单（禁改成读目录）：tod.html=tod 本体；index.html=游戏中心（仍载 tod 应用副本供深链回退）；
// monopoly/uno=街机页；bombcat.html 自包含（three 走 src 引用，由 check-syntax-bc.cjs 另管）。
const FILES = [
  'index.html', 'tod.html', 'monopoly.html', 'uno.html', 'bombcat.html',
];
const NEED_THREE = ['index.html', 'tod.html', 'monopoly.html', 'uno.html', 'bombcat.html'];
const NEED_DICEBEAR = ['index.html', 'tod.html', 'monopoly.html', 'uno.html'];
const NEED_FEAT = ['monopoly.html', 'uno.html', 'tod.html'];   // 头像特征轮（SPEC §1.14）：3 页接入；index 深链回退副本保留旧贴片脸（punParts 先例的显式降级）；bombcat=bc: 猫脸协议不走提取器
// sha256 记录值（LF 归一后整文件字节）：换内容必须连这里一起改
const SHA_EXPECT = {
  'three.r128.js': '9274bbcec8d96168',
  'dicebear-local.js': 'cab07a03ec0a1048',
  'avatar-features.js': '68ff8336404dfaff',
};
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(`${ROOT}/${f}`, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
let bad = 0, total = 0;
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

// ── 1. 五页内联脚本逐块语法扫描 ──
for (const f of FILES) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  let m, i = 0;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    i++; total++;
    const code = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    try { new Function(code); console.log(`${f} script #${i} (line ${line}, ${code.length}B) OK`); }
    catch (e) { bad++; console.log(`${f} script #${i} (line ${line}) SYNTAX ERROR: ${e.message}`); }
  }
  console.log(`${f}: ${i} inline script block(s) scanned`);
}

// ── 2. three.r128.js：五页必须 src 引用、页面不得残留内联体、外置件语法+sha 锁 ──
for (const f of NEED_THREE) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  if (!src.includes('<script src="three.r128.js"></script>')) { bad++; console.log(`${f}: 缺 <script src="three.r128.js"> 引用`); }
  if (src.includes('Copyright 2010-2021 Three.js Authors')) { bad++; console.log(`${f}: 残留内联 three（应只经 three.r128.js 引用）`); }
}
try {
  const s = fs.readFileSync(`${ROOT}/three.r128.js`, 'utf8');
  new Function(s); total++;
  const h = sha256('three.r128.js');
  if (!h.startsWith(SHA_EXPECT['three.r128.js'])) { bad++; console.log(`three.r128.js sha256 漂移！现 ${h.slice(0, 16)}… 记录 ${SHA_EXPECT['three.r128.js']}…（有意升级就同步改门禁记录值）`); }
  else console.log(`three.r128.js OK（sha 锁一致 ${h.slice(0, 16)}…，${Math.round(s.length / 1024)}KB）`);
} catch (e) { bad++; console.log('three.r128.js SYNTAX ERROR: ' + e.message); }

// ── 3. dicebear-local.js：四页 src 引用、tod/index 无内联残留、外置件语法+sha 锁+纯 LF ──
for (const f of NEED_DICEBEAR) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  if (!src.includes('<script src="dicebear-local.js"></script>')) { bad++; console.log(`${f}: 缺 <script src="dicebear-local.js"> 引用`); }
  if (src.includes('var DiceBearLocal=(()=>{')) { bad++; console.log(`${f}: 残留内联 DiceBear bundle（应只经 dicebear-local.js 引用）`); }
}
try {
  const dbSrc = fs.readFileSync(`${ROOT}/dicebear-local.js`, 'utf8');
  new Function(dbSrc); total++;
  const h = sha256('dicebear-local.js');
  if (!h.startsWith(SHA_EXPECT['dicebear-local.js'])) { bad++; console.log(`dicebear-local.js sha256 漂移！现 ${h.slice(0, 16)}… 记录 ${SHA_EXPECT['dicebear-local.js']}…`); }
  else if (dbSrc.includes('\r')) { bad++; console.log('dicebear-local.js 混入 CRLF（必须纯 LF）'); }
  else console.log(`dicebear-local.js OK（sha 锁一致 ${h.slice(0, 16)}…，${Math.round(dbSrc.length / 1024)}KB）`);
} catch (e) { bad++; console.log('dicebear-local.js SYNTAX ERROR: ' + e.message); }

// ── 3b. avatar-features.js（头像特征轮 SPEC §1.14）：三页 src 引用、无内联残留、外置件语法+sha 锁+纯 LF ──
for (const f of NEED_FEAT) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  if (!src.includes('<script src="avatar-features.js"></script>')) { bad++; console.log(`${f}: 缺 <script src="avatar-features.js"> 引用`); }
  if (src.includes('function extractFeatures(')) { bad++; console.log(`${f}: 残留内联特征提取器（应只经 avatar-features.js 引用）`); }
}
try {
  const ftSrc = fs.readFileSync(`${ROOT}/avatar-features.js`, 'utf8');
  new Function(ftSrc); total++;
  const h = sha256('avatar-features.js');
  if (!h.startsWith(SHA_EXPECT['avatar-features.js'])) { bad++; console.log(`avatar-features.js sha256 漂移！现 ${h.slice(0, 16)}… 记录 ${SHA_EXPECT['avatar-features.js']}…`); }
  else if (ftSrc.includes('\r')) { bad++; console.log('avatar-features.js 混入 CRLF（必须纯 LF）'); }
  else console.log(`avatar-features.js OK（sha 锁一致 ${h.slice(0, 16)}…，${Math.round(ftSrc.length / 1024)}KB）`);
} catch (e) { bad++; console.log('avatar-features.js SYNTAX ERROR: ' + e.message); }

// ── 4. party-net.js 公共组件语法 ──
try { new Function(fs.readFileSync(`${ROOT}/party-net.js`, 'utf8')); total++; console.log('party-net.js OK'); }
catch (e) { bad++; console.log('party-net.js SYNTAX ERROR: ' + e.message); }

// ── 5. tod↔index 孪生镜头区一致性（2026-09-22 镜头随流程轮加装）：只圈纯镜头四处 ──
// Cam 全块（nudge/focus/home 常量）、focusCam、choosing 回全景行、rStep（GL 揭晓近景墙钟）。
// 刻意不含 Cam→resetCam 全切片：index 的 tod 副本在挑战模式（punParts）上既有欠账，混进来会常红。
try {
  const grab = f => {
    const s = fs.readFileSync(`${ROOT}/${f}`, 'utf8').replace(/\r\n/g, '\n');
    const cut = (a, b) => { const i = s.indexOf(a); const j = i >= 0 ? s.indexOf(b, i) : -1; return i >= 0 && j > i ? s.slice(i, j) : ''; };
    const line = re => (s.match(re) || [])[0] || '';
    return {
      cam: cut('const Cam = {', '一镜到底动画编排'),
      focusCam: cut('function focusCam(el) {', 'function resetCam(instant)'),
      home: line(/if \(!fresh\) Cam\.home\(\d+\);[^\n]*/),
      rStep: line(/const rStep = dt \/ \(revealTarget > revealK \? [0-9.]+ : [0-9.]+\);[^\n]*/),
    };
  };
  const t = grab('tod.html'), x = grab('index.html');
  if (!t.cam || !x.cam || !t.focusCam || !x.focusCam || !t.home || !x.home || !t.rStep || !x.rStep) { bad++; console.log('tod↔index 孪生镜头区锚点没找到（Cam/focusCam/home/rStep 被改动？）'); }
  else if (JSON.stringify(t) !== JSON.stringify(x)) { bad++; console.log('tod.html 与 index.html 镜头区漂移！Cam/focusCam/home/rStep 必须两边同改'); }
  else console.log(`tod↔index 孪生镜头区一致 ✅（cam ${t.cam.length}B + focusCam + home + rStep）`);
} catch (e) { bad++; console.log('孪生镜头区检查异常: ' + e.message); }

console.log(bad ? `FAILED: ${bad} problem(s)` : `ALL ${total} SCRIPT BLOCKS PARSE ✅`);
process.exitCode = bad ? 1 : 0;
