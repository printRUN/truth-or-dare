// 一次性补丁：saveNow 钩子 + A12 调用 —— 跑完即删
const fs = require('fs');
let g = fs.readFileSync('D:/myidea/truth-or-dare/uno.html', 'utf8');
const og = `    handoff: () => { if (!$('handoff').hidden) $('btn-handoff-go').click(); },`;
const ng = [
  `    handoff: () => { if (!$('handoff').hidden) $('btn-handoff-go').click(); },`,
  `    saveNow: () => saveGame(),`,
].join('\n');
if (g.split(og).length - 1 !== 1) { console.error('hook match ' + g.split(og).length); process.exit(1); }
g = g.replace(og, () => ng);
fs.writeFileSync('D:/myidea/truth-or-dare/uno.html', g);

let s = fs.readFileSync('D:/myidea/truth-or-dare/.pw/probe-uno.cjs', 'utf8');
const o2 = `    await p.evaluate(() => { __uno.state.cur = 'g'; __uno.state.discard = [cd('g', '5')]; __uno.forceHand(0, [cd('g', '7'), cd('y', '3')]); __uno.forceHand(1, [cd('b', '2'), cd('r', '6'), cd('w', 'W4')]); });`;
const n2 = o2 + ` __uno.saveNow();`;
// 注意：上面拼法会把 saveNow 放进同一 evaluate —— 改为独立调用
const n2b = o2 + `
    await p.evaluate(() => __uno.saveNow());`;
if (s.split(o2).length - 1 !== 1) { console.error('probe match ' + s.split(o2).length); process.exit(1); }
s = s.replace(o2, () => n2b);
fs.writeFileSync('D:/myidea/truth-or-dare/.pw/probe-uno.cjs', s);
console.log('saveNow hook + probe call OK');
