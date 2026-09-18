const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
function rep(re, neu, tag) { if (!re.test(s)) throw new Error('missing: ' + tag); s = s.replace(re, neu); }

rep(/      \/\/ 伺服闭环：名牌 DOM 活在 \.world（每帧 transform）\+#cam（perspective）里，投影视口坐标不能直接当 left\/top 用——\r?\n      \/\/ 相机带 x\/y\/rx 时整体错位=「名牌漂移\/对不上人」。仿 anchorTpBack 的量测闭环：读渲染结果与目标的差，阻尼补回\r?\n      \/\/ left\/top，自动抵消链上全部变换（含透视）；静止 2-3 帧收敛到亚像素，运镜中轻微拖尾读作「名牌跟人」。\r?\n      if \(!card\.style\.left\) \{ card\.style\.left = \(wantX - og\[0\]\)\.toFixed\(1\) \+ 'px'; card\.style\.top = \(wantY - og\[1\]\)\.toFixed\(1\) \+ 'px'; \}\r?\n      else \{\r?\n        const r = card\.getBoundingClientRect\(\);\r?\n        if \(r\.width > 0\) \{\r?\n          card\.style\.left = \(parseFloat\(card\.style\.left\) \+ \(wantX - \(r\.left \+ r\.width \/ 2\)\) \* 0\.45\)\.toFixed\(1\) \+ 'px';\r?\n          card\.style\.top = \(parseFloat\(card\.style\.top\) \+ \(wantY - r\.top\) \* 0\.45\)\.toFixed\(1\) \+ 'px';\r?\n        \}\r?\n      \}/,
`      card.style.left = (wantX - og[0]).toFixed(1) + 'px';   // 直写投影（v7 同构）：实测即贴头；wantX/wantY 已是全屏画布视口坐标
      card.style.top = (wantY - og[1]).toFixed(1) + 'px';`, 'servo-revert');

rep(/wantY > chh \+ 20\)/, 'wantY > chh - 20)', 'cull');

rep(/(      card\.style\.zIndex = String\(600 - Math\.round\(V\.z \* 300\)\);\r?\n)(    \}\);\r?\n  \})/,
`$1      const rsV = parseFloat(card.style.getPropertyValue('--rs')) || 1;
      const mw = (64 / rsV).toFixed(0) + 'px';
      if (card.style.minWidth !== mw) card.style.minWidth = mw;   // 缩放补偿：渲染宽恒 ≥64px（远座可辨识契约）
$2`, 'minwidth');

fs.writeFileSync('index.html', s);
console.log('patched');
