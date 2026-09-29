// 一次性提取脚本（2026-09-24 加载优化轮招3）：
//   1. 从 tod.html 内联 three r128 块提取 three.r128.js（逐字节，行尾归一 LF）
//   2. tod/index/monopoly/uno/bombcat 的内联 three 块 → <script src="three.r128.js"></script>
//   3. tod/index 巨型脚本块中部的 DiceBear 内联段（注释+bundle+license）→ 块前插 <script src="dicebear-local.js"></script>
// 全部文件先归一 LF 再校验（与项目「动刀后保持 LF」约定一致），任何锚点不符立即失败退出。
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const ROOT = 'D:/myidea/truth-or-dare';
const readLF = f => fs.readFileSync(`${ROOT}/${f}`, 'utf8').replace(/\r\n/g, '\n');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

const files = ['tod.html', 'index.html', 'monopoly.html', 'uno.html', 'bombcat.html'];
const raw = {};
for (const f of files) raw[f] = readLF(f);

// ── 1. 提取 three.r128.js（以 tod.html 为母本）──
const threeRe = /<script>\n+\/\*\*\n[\s\S]*?Copyright 2010-2021 Three\.js Authors[\s\S]*?\n+<\/script>/;
const mTod = raw['tod.html'].match(threeRe);
if (!mTod) { console.error('FAIL: tod.html three 内联块没找到'); process.exit(1); }
// 块内容 = <script> 与 </script> 之间（含 license 头，首尾空行归一）
const threeCode = mTod[0].replace(/^<script>\n+/, '').replace(/\n+<\/script>$/, '');
fs.writeFileSync(`${ROOT}/three.r128.js`, threeCode + '\n');
const threeSha = sha(threeCode);
console.log(`three.r128.js 提取：${Buffer.byteLength(threeCode)}B  sha256=${threeSha.slice(0, 16)}…`);

// 其余三页的 three 块与母本一致；bombcat 允许差头注释（无头变体）
for (const f of ['index.html', 'monopoly.html', 'uno.html']) {
  const m = raw[f].match(threeRe);
  if (!m) { console.error(`FAIL: ${f} three 内联块没找到`); process.exit(1); }
  const code = m[0].replace(/^<script>\n+/, '').replace(/\n+<\/script>$/, '');
  if (sha(code) !== threeSha) { console.error(`FAIL: ${f} three 块与 tod 母本 sha 不一致`); process.exit(1); }
}
const bcRe = /<script>\n+!function\(t,e\)\{"object"==typeof exports[\s\S]*?\n+<\/script>/;
const mBc = raw['bombcat.html'].match(bcRe);
if (!mBc) { console.error('FAIL: bombcat.html three UMD 块没找到'); process.exit(1); }
const bcNoHead = mBc[0].replace(/^<script>\n+/, '').replace(/\n+<\/script>$/, '');
const threeNoHead = threeCode.replace(/^\/\*[\s\S]*?\*\/\n/, '');
if (sha(bcNoHead) !== sha(threeNoHead)) { console.error('FAIL: bombcat three 块（去头后）与母本不一致'); process.exit(1); }
console.log('五页 three 块校验一致（bombcat 为无 license 头变体，行为等价）');

// ── 2. 换 src 引用 ──
const TAG = '<script src="three.r128.js"></script>';
for (const f of files) {
  const re = f === 'bombcat.html' ? bcRe : threeRe;
  const m = raw[f].match(re);
  if (!raw[f].includes(m[0])) { console.error(`FAIL: ${f} three 块整体回找失败`); process.exit(1); }
  raw[f] = raw[f].replace(m[0], () => TAG);
  console.log(`${f}: three 内联 → src 引用`);
}

// ── 3. tod/index DiceBear 内联段摘除 + 块前插 src ──
const dbLines = readLF('dicebear-local.js').split('\n');
const dbBundle = dbLines[5];                  // 第 6 行 = 2MB bundle 单行
const dbLic = dbLines.slice(6, 24);           // 第 7-24 行 = license 块
for (const f of ['tod.html', 'index.html']) {
  const lines = raw[f].split('\n');
  const bi = lines.findIndex(l => l.startsWith('var DiceBearLocal=(()=>{'));
  if (bi < 0) { console.error(`FAIL: ${f} DiceBear bundle 行没找到`); process.exit(1); }
  if (lines[bi] !== dbBundle) { console.error(`FAIL: ${f} bundle 行与 dicebear-local.js 不一致（line ${bi + 1}）`); process.exit(1); }
  for (let k = 0; k < dbLic.length; k++) {
    if (lines[bi + 1 + k] !== dbLic[k]) { console.error(`FAIL: ${f} license 第 ${k + 1} 行不匹配（line ${bi + 2 + k}）`); process.exit(1); }
  }
  let cs = bi - 1;
  while (cs > 0 && lines[cs].startsWith('//')) cs--;
  cs++;
  if (!(lines[cs] || '').includes('默认头像 & 头像定制器')) { console.error(`FAIL: ${f} 段首注释锚点不符（line ${cs + 1}: ${(lines[cs] || '').slice(0, 60)}）`); process.exit(1); }
  let so = -1;
  for (let i = cs - 1; i >= 0; i--) { if (lines[i].trim() === '<script>') { so = i; break; } }
  if (so < 0) { console.error(`FAIL: ${f} 找不到前置 <script> 行`); process.exit(1); }
  const segLen = bi + 1 + dbLic.length - cs;
  lines.splice(cs, segLen);
  lines.splice(so, 0, '<script src="dicebear-local.js"></script>');
  raw[f] = lines.join('\n');
  console.log(`${f}: DiceBear 段（${segLen} 行）摘除，src 引用插于 line ${so + 1}`);
}

// ── 4. 落盘 ──
for (const f of files) fs.writeFileSync(`${ROOT}/${f}`, raw[f]);
console.log('\n落盘完成（全部 LF）。新大小：');
for (const f of files) console.log(`  ${f}: ${Math.round(Buffer.byteLength(raw[f]) / 1024)}KB`);
console.log(`  three.r128.js: ${Math.round(Buffer.byteLength(threeCode) / 1024)}KB`);
