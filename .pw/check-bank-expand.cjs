// 题库扩充校验：长度红线（≤40 全角字）、查重（草稿内部 + 对现有库）、档位齐全、统计
const fs = require('fs');
const html = fs.readFileSync('D:/myidea/truth-or-dare/tod.html', 'utf8');
const draft = require('./bank-expand-draft.js');

// 从 tod.html 抠出现有 PACKS 块并求值
const s = html.indexOf('const PACKS = {');
const e = html.indexOf('};', html.indexOf('office: {', s));
const existing = eval('(' + html.slice(s + 'const PACKS = '.length, e + 1) + ')');

let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg + (cond || extra === undefined ? '' : '  ' + JSON.stringify(extra))); if (!cond) fail++; };
const chars = x => [...String(x)];
const norm = x => String(x).replace(/\s+/g, '');

// 1) 草稿条目：形状 / 档位 / 长度
const badShape = [], badLen = [];
for (const pk of Object.keys(draft)) for (const ty of ['truth', 'dare']) for (const tier of ['mild', 'normal', 'hot']) {
  for (const x of draft[pk][ty][tier]) {
    if (typeof x !== 'string' || !x.trim()) badShape.push(`${pk}.${ty}.${tier}: ${x}`);
    if (chars(x).length > 40) badLen.push(`${chars(x).length}字 ${x}`);
  }
}
ok(badShape.length === 0, '草稿条目形状/非空', badShape);
ok(badLen.length === 0, '草稿全部 ≤40 全角字（3D 牌面红线余量）', badLen);

// 草稿（按档位分组）摊平成与现有库同构的 { truth: [...], dare: [...] }
const flat = {};
for (const pk of Object.keys(draft)) {
  flat[pk] = {};
  for (const ty of ['truth', 'dare']) flat[pk][ty] = ['mild', 'normal', 'hot'].flatMap(tier => draft[pk][ty][tier].map(x => ({ x, t: tier })));
}

// 2) 查重：草稿内部 + 对现有库（以及现有库自身的基线健康）
const seen = new Map(); const dup = [];
for (const src of [{ tag: 'draft', packs: flat }, { tag: 'existing', packs: existing }]) {
  for (const pk of Object.keys(src.packs)) for (const ty of ['truth', 'dare']) {
    for (const it of src.packs[pk][ty]) {
      const key = pk + '|' + ty + '|' + norm(it.x ?? it);
      if (seen.has(key)) dup.push(`${key}  ←  ${seen.get(key)} vs ${src.tag}`);
      else seen.set(key, src.tag);
    }
  }
}
ok(dup.length === 0, '全库零重复（草稿×内部、草稿×现有）', dup);

// 3) 跨类目近重复粗查：不同 pack 同文（party/couple/office 串味会出戏）
const cross = [];
const byText = new Map();
for (const src of [{ tag: 'draft', packs: flat }, { tag: 'existing', packs: existing }]) {
  for (const pk of Object.keys(src.packs)) for (const ty of ['truth', 'dare']) {
    for (const it of src.packs[pk][ty]) {
      const key = ty + '|' + norm(it.x ?? it);
      if (byText.has(key) && byText.get(key).pk !== pk) cross.push(`${key}: ${byText.get(key).pk} vs ${pk} (${src.tag})`);
      else if (!byText.has(key)) byText.set(key, { pk, tag: src.tag });
    }
  }
}
ok(cross.length === 0, '跨套装零同文串味', cross);

// 4) 统计：每套每类每档 现有/新增/合计
let total = { before: 0, add: 0 };
const rows = [];
for (const pk of Object.keys(draft)) for (const ty of ['truth', 'dare']) {
  const per = { mild: 0, normal: 0, hot: 0 };
  for (const tier of ['mild', 'normal', 'hot']) {
    const before = existing[pk][ty].filter(i => i.t === tier).length;
    const add = draft[pk][ty][tier].length;
    per[tier] = `${before}+${add}=${before + add}`;
    total.before += before; total.add += add;
  }
  rows.push(`${pk}.${ty}: 总 ${existing[pk][ty].length}+${draft[pk][ty].mild.length + draft[pk][ty].normal.length + draft[pk][ty].hot.length}=${existing[pk][ty].length + draft[pk][ty].mild.length + draft[pk][ty].normal.length + draft[pk][ty].hot.length}  (温和 ${per.mild} / 普通 ${per.normal} / 刺激 ${per.hot})`);
}
console.log(rows.join('\n'));
console.log(`合计：${total.before} → ${total.before + total.add}（新增 ${total.add}）`);

// 5) 现有库基线也应零重复、≤40 字（防历史遗留让「零重复」结论失真）
const exBadLen = [];
for (const pk of Object.keys(existing)) for (const ty of ['truth', 'dare']) for (const it of existing[pk][ty]) if (chars(it.x).length > 40) exBadLen.push(it.x);
ok(exBadLen.length === 0, '现有库 ≤40 字基线', exBadLen);
ok(existing.party.truth.every(i => ['mild', 'normal', 'hot'].includes(i.t)), '现有库档位枚举基线');

process.exit(fail ? 1 : 0);
