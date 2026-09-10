// node .pw/test-parse.cjs  → 用真实 AI 输出样例校验 parsePools
const fs = require('fs');
const src = fs.readFileSync('D:/myidea/truth-or-dare/index.html', 'utf8');
const code = src.slice(src.indexOf('// 分节标题判定'), src.indexOf('function updatePoolCount'));
const { parsePools } = new Function(code + '\nreturn { parsePools };')();

const SAMPLE = `## 真心话

### ✅ 轻度（安全款，新手首选）

1. 最近一次偷偷哭是什么时候，因为什么？1. 如果可以换一种性别，你愿意吗？

### ⚠️ 中度（有点八卦，熟人玩）

1. **你暗恋过在场的人吗？**
2. 你最尴尬的一次经历：说细节

## 大冒险

### ✅ 轻度（简单，不尴尬）

1. 模仿小猫叫三声。
1. 说说你暗恋过的
- 用屁股写自己的名字
> 引用式的一条

### ⚠️ 中度

1、对左边的人比心
① 学狗叫 10 秒`;

for (const [name, text] of [['用户样例', SAMPLE], ['无标题纯清单', '第一条\n第二条']]) {
  for (const fb of ['truth', 'dare']) {
    const r = parsePools(text, fb);
    console.log(`\n--- ${name} (fallback=${fb}) → 💬${r.truth.length} 🎯${r.dare.length}`);
    console.log('truth:', JSON.stringify(r.truth, null, 0));
    console.log('dare :', JSON.stringify(r.dare, null, 0));
  }
}
// 文档总标题 / 英文标题不应改变类别
console.log('\n--- 只含总标题 + 英文分节');
console.log(JSON.stringify(parsePools('# 真心话大冒险\n\n## Truth\n问一个问题\n## Dare\n跳个舞', 'dare')));
