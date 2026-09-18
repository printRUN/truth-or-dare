// 一次性补丁：test.cjs #deck-section 可见等待改双模式（three3d 下 .table-deck 整支 display:none，GL 牌堆替代）
const fs = require('fs');
let s = fs.readFileSync('test.cjs', 'utf8');
const helper = [
  'const waitDeckShown = p => p.evaluate(() => document.body.classList.contains(\'three3d\') && !document.body.classList.contains(\'loperf\'))',
  '  .then(is3d => is3d ? p.waitForFunction(() => S.turn && S.turn.stage === \'drawing\', null, { timeout: 15000 })',
  '                      : p.waitForSelector(\'#deck-section:not([hidden])\', { timeout: 15000 }));',
  '',
].join('\n');
if (!s.includes('const waitDeckShown')) s = s.replace('const domClick =', helper + 'const domClick =');
s = s.split("await first.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });").join('await waitDeckShown(first);');
s = s.split("await other.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });").join('await waitDeckShown(other);');
s = s.split("await b.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });").join('await waitDeckShown(b);');
s = s.split("await a.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });").join('await waitDeckShown(a);');
fs.writeFileSync('test.cjs', s);
console.log('remaining deck-section selectors:', (s.match(/#deck-section:not/g) || []).length);
