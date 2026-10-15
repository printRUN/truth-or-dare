// 终态校验：tod.html 最终 PACKS（280 条/零重复/≤40 字/档位枚举/分组连续/无危险字符）
const fs = require('fs');
const html = fs.readFileSync('D:/myidea/truth-or-dare/tod.html', 'utf8');
const s = html.indexOf('const PACKS = {');
const e = html.indexOf('};', html.indexOf('office: {', s));
const packs = eval('(' + html.slice(s + 'const PACKS = '.length, e + 1) + ')');
let fail = 0, total = 0; const seen = new Set(); const TIERS = ['mild', 'normal', 'hot'];
const order = { mild: 0, normal: 1, hot: 2 };
for (const pk of Object.keys(packs)) for (const ty of ['truth', 'dare']) {
  const arr = packs[pk][ty]; total += arr.length;
  const per = { mild: 0, normal: 0, hot: 0 }; let last = -1;
  for (const it of arr) {
    if (!it.x || typeof it.x !== 'string' || !TIERS.includes(it.t)) { console.log('FAIL 形状', pk, ty); fail++; }
    if ([...it.x].length > 40) { console.log('FAIL 超长', it.x); fail++; }
    if (seen.has(pk + '|' + ty + '|' + it.x)) { console.log('FAIL 重复', it.x); fail++; }
    seen.add(pk + '|' + ty + '|' + it.x); per[it.t]++;
    if (/['\\`]/.test(it.x)) { console.log('FAIL 危险字符', it.x); fail++; }
    if (order[it.t] < last) { console.log('FAIL 分组乱序', pk, ty, it.x); fail++; }
    last = order[it.t];
  }
  console.log(`${pk}.${ty}: ${arr.length} (M${per.mild}/N${per.normal}/H${per.hot})`);
}
console.log('合计: ' + total + (total === 280 ? '（预期280）✅' : ' ≠280 ❌'));
process.exit(fail || total !== 280 ? 1 : 0);
