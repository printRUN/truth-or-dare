// 组装 bombcat.html：bc-src-a.html 骨架 + 四段主脚本
// （2026-09-24 起 three 不再内联：骨架直接引用 <script src="three.r128.js">，与全仓库五页同源）
// 用法: node build-bombcat.cjs   （在 .pw/ 下运行；产物写到仓库根 bombcat.html）
'use strict';
const fs = require('fs');
const path = require('path');
const here = __dirname;
const root = path.join(here, '..');
const read = f => fs.readFileSync(path.join(here, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

const skeleton = read('bc-src-a.html');
const main = ['bc-main-1.js', 'bc-main-2.js', 'bc-main-3.js', 'bc-main-4.js'].map(read).join('\n');

if (!skeleton.includes('<script src="three.r128.js"></script>') || !skeleton.includes('/*__BC_MAIN__*/')) {
  console.error('BUILD FAIL: skeleton 缺 three.r128.js 引用或 /*__BC_MAIN__*/ 占位');
  process.exit(1);
}
const out = skeleton.replace('/*__BC_MAIN__*/', () => main);
write('bombcat.html', out);
console.log('bombcat.html built:', Buffer.byteLength(out), 'bytes');
