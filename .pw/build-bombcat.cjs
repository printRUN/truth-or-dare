// 组装 bombcat.html：bc-src-a.html 骨架 + three.js r128 UMD 内联体 + 四段主脚本
// 用法: node build-bombcat.cjs   （在 .pw/ 下运行；产物写到仓库根 bombcat.html）
'use strict';
const fs = require('fs');
const path = require('path');
const here = __dirname;
const root = path.join(here, '..');
const read = f => fs.readFileSync(path.join(here, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

const skeleton = read('bc-src-a.html');
const three = read('three-r128.blob.js');
const main = ['bc-main-1.js', 'bc-main-2.js', 'bc-main-3.js', 'bc-main-4.js'].map(read).join('\n');

if (!skeleton.includes('/*__THREE_UMD__*/') || !skeleton.includes('/*__BC_MAIN__*/')) {
  console.error('BUILD FAIL: skeleton placeholders missing');
  process.exit(1);
}
const out = skeleton
  .replace('/*__THREE_UMD__*/', () => three)
  .replace('/*__BC_MAIN__*/', () => main);
write('bombcat.html', out);
console.log('bombcat.html built:', Buffer.byteLength(out), 'bytes');
