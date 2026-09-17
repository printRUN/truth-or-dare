const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
function rep(re, neu, tag) { if (!re.test(s)) throw new Error('missing: ' + tag); s = s.replace(re, neu); }

// 近景机位再西移：(-0.9,·,0.11) 会把「我」的头（z+2.71）带进右缘；-1.25 后「我」离轴 ~62° 出画，抽卡人 16° 在框内
rep(/const REVEAL_POS = new THREE\.Vector3\(CARD_LOOK\.x - 0\.9, CARD_LOOK\.y \+ 2\.35, CARD_LOOK\.z \+ 0\.75\);[^\r\n]*/,
  'const REVEAL_POS = new THREE.Vector3(CARD_LOOK.x - 1.25, CARD_LOOK.y + 2.43, CARD_LOOK.z + 0.79);   // 到卡 ≈2.85、仰角 59°；西侧出「我」巨头画外，抽卡人头肩留在框内同框', 'revealpos');

// 题干起始字号 56→60（自动降级 54/48/42），匹配新机位距离
rep(/    let fs = 56;\r?\n    const wrap = \(size\) => \{/, '    let fs = 60;\n    const wrap = (size) => {', 'fs0');
rep(/    while \(lines === null && fs > 36\) \{ fs -= 6; lines = wrap\(fs\); \}/, '    while (lines === null && fs > 40) { fs -= 6; lines = wrap(fs); }', 'fsfloor');

fs.writeFileSync('index.html', s);
console.log('reveal pos tuned');
