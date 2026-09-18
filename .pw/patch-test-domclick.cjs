// 一次性补丁：test.cjs 选卡/动作按钮点击改双路径（three3d 下 pointer-events:none）
const fs = require('fs');
let s = fs.readFileSync('test.cjs', 'utf8');
const helper = [
  'const domClick = (p, sel) => p.evaluate(x => document.getElementById(x).click(), sel.slice(1));   // three3d：选卡/动作按钮 pointer-events:none 落到画布，evaluate click 双路径通用',
  '',
].join('\n');
if (!s.includes('const domClick')) s = s.replace('const waitCardShown = p =>', helper + 'const waitCardShown = p =>');
const pairs = [
  ["await first.click('#card-truth');", "await domClick(first, '#card-truth');"],
  ["await other.click('#card-dare');", "await domClick(other, '#card-dare');"],
  ["await a.click('#card-truth');", "await domClick(a, '#card-truth');"],
  ["await b.click('#card-dare');", "await domClick(b, '#card-dare');"],
  ["await first.click('#btn-accept');", "await domClick(first, '#btn-accept');"],
  ["await other.click('#btn-skip');", "await domClick(other, '#btn-skip');"],
  ["await a.click('#btn-accept');", "await domClick(a, '#btn-accept');"],
  ["await b.click('#btn-skip');", "await domClick(b, '#btn-skip');"],
];
for (const [a, b] of pairs) s = s.split(a).join(b);
fs.writeFileSync('test.cjs', s);
console.log('patched test.cjs');
