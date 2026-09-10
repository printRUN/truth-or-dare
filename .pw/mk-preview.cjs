// 从 index.html 里抽出头像生成函数（纯字符串逻辑，无 DOM 依赖），生成预览页
// 用法: node .pw/mk-preview.cjs
const fs = require('fs');
const src = fs.readFileSync('D:/myidea/truth-or-dare/index.html', 'utf8');

const grab = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error(`marker not found: ${from} .. ${to}`);
  return src.slice(a, b);
};

const code = grab('const P_PLUME', 'function sleep(ms)') + grab('const AVATAR_PRESETS', 'let customAvatar');
const { birdAvatar, maskAvatar, presetUri, avatarUrl, AVATAR_PRESETS } = new Function(code + '\nreturn { birdAvatar, maskAvatar, presetUri, avatarUrl, AVATAR_PRESETS };')();

const cells = AVATAR_PRESETS.map(p => `<figure><img src="${presetUri(p)}" alt=""><figcaption>${p.n}</figcaption></figure>`);
const random = ['a', 'b', 'zz', 'room7x', 'hi', 'q9', 'bob', 'kai', 'sana', 'xxx'].map(s => `<img class="r" src="${avatarUrl(s)}" alt="">`);
const maxLen = Math.max(...AVATAR_PRESETS.map(p => presetUri(p).length));
const birdMax = Math.max(...AVATAR_PRESETS.filter(p => !p.fam).map(p => birdAvatar(p).length));
const maskMax = Math.max(...AVATAR_PRESETS.filter(p => p.fam === 'mask').map(p => maskAvatar(p).length));

fs.writeFileSync('D:/myidea/truth-or-dare/.pw/preview.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0a0a1a;font-family:"Microsoft YaHei",sans-serif;padding:22px}
h3{color:#8b5cf6;margin:0 0 14px;font-size:14px;letter-spacing:2px}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:16px 10px}
figure{margin:0;text-align:center}
img{width:108px;height:108px;border-radius:50%;background:#12122a;display:block;margin:0 auto}
figcaption{color:#22d3ee;font-size:13px;margin-top:5px;letter-spacing:2px}
.r{width:74px;height:74px;display:inline-block;margin:14px 6px 0}
</style></head><body>
<h3>预设 ${AVATAR_PRESETS.length} 张：14 小鸟 + 10 假面（data-uri 最长 ${maxLen}，小鸟 ${birdMax} / 假面 ${maskMax} 字符）</h3>
<div class="grid">${cells.join('')}</div>
<h3 style="margin-top:26px">avatarUrl(seed) 随机</h3><div>${random.join('')}</div>
</body></html>`);
console.log('preview.html written, max data-uri =', maxLen, 'chars (bird', birdMax, '/ mask', maskMax, ')');
