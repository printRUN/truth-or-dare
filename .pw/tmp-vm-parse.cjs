// 一次性：用 vm filename 拿 uno.html script#2 的真实报错行号 —— 跑完即删
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('D:/myidea/truth-or-dare/uno.html', 'utf8');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(src))) {
  i++;
  if (i === 2) {
    try {
      new vm.Script(m[1], { filename: 'uno.html#s2' });
      console.log('解析 OK??');
    } catch (e) {
      console.log(e.stack.split('\n').slice(0, 3).join('\n'));
    }
  }
}
