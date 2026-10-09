'use strict';
/* av3-feat.js — 2D 头像 → 3D 头特征提取器（校验版 = 实施蓝本）
   三层：①钉扎差分（dcb/预设 style+seed 已知 → 眼镜/胡子/秃头精确判定）
        ②像素聚类（颜色：肤色/发色/衣服色；轮廓：长发/丸子/爆炸头）
        ③特例（-neutral 线稿 → 纸白肤黑发；非人脸/照片 → 降级）*/
const PIN_GLASSES = { adventurer: 'glasses', 'adventurer-neutral': 'glasses', 'big-smile': 'accessories', 'lorelei-neutral': 'glasses', micah: 'glasses', miniavs: 'glasses', notionists: 'glasses', 'notionists-neutral': 'glasses', 'open-peeps': 'accessories', 'pixel-art': 'glasses', 'pixel-art-neutral': 'glasses' };
const PIN_FACIAL = { avataaars: 'facialHair', croodles: 'beard', dylan: 'facialHair', lorelei: 'beard', miniavs: 'mustache', 'toon-head': 'beard' };
const PIN_HAIR = { adventurer: 'hair', avataaars: 'top', 'big-ears': 'hair', 'big-smile': 'hair', croodles: 'top', dylan: 'hair', lorelei: 'hair', micah: 'hair', miniavs: 'hair', notionists: 'hair', personas: 'hair', 'pixel-art': 'hair', 'toon-head': 'hair' };
const NON_PERSON = new Set(['bottts', 'bottts-neutral', 'fun-emoji', 'glass', 'icons', 'identicon', 'initials', 'rings', 'shapes', 'thumbs']);
const NEUTRAL_LINEART = new Set(['avataaars-neutral', 'big-ears-neutral', 'croodles-neutral', 'lorelei-neutral', 'notionists-neutral', 'pixel-art-neutral']);
const GLASSES_STYLES = new Set([...Object.keys(PIN_GLASSES), 'personas', 'toon-head']);
const FACIAL_STYLES = new Set([...Object.keys(PIN_FACIAL), 'micah', 'open-peeps', 'personas']);

function pinDiff(style, seed, key, values) {   // 钉扎=替换组件池：[] 清空（有则消失），[变体] 限定（概率门控下只有真戴者输出会变）→ 输出变化⇒组件存在
  try {
    const a = DiceBearLocal.diceAvatar(style, { seed }).toString();
    const b = DiceBearLocal.diceAvatar(style, { seed, [key]: values || [] }).toString();
    return a !== b;
  } catch (e) { return null; }
}
const PIN_GLASSES_NAMED = { avataaars: ['Kurt', 'Circle', 'Round', 'Sunglasses', 'SunglassAlt', 'Wayfarers', 'Prescription01', 'Prescription02'] };   // 具名镜框变体（accessories 键，概率门控）
function pinGlassesExact(style, seed) {
  const names = PIN_GLASSES_NAMED[style];
  if (names) return names.some(n => pinDiff(style, seed, 'accessories', [n]) === true);
  const key = PIN_GLASSES[style];
  return key ? pinDiff(style, seed, key) === true : null;
}
function qbin(r, g, b) { return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); }
function hexc(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.673; }   // 归一欧氏距离 [0,1]：全部阈值同域

function pixelClusters(data, w, h) {
  const N = w * h;
  const at = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  // 背景采样：只用四角做 ≥3 多数派。带 b 参数的 DiceBear 背景是全出血方形 rect（四角必不透明）；
  // 圆角/透明设计的四角必透明 → bgc=null（alpha 通道本就排背景）。边缘中点会撞贴边头发/帽子
  // （open-peeps 爆炸头四边中点全黑 → 背景被判成黑色 → 整块头发被吃成假秃），永不采中点。
  const bgc = (() => {
    const cs = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => at(x, y)).filter(p => p[3] >= 128).map(p => [p[0], p[1], p[2]]);
    if (cs.length < 3) return null;
    for (let i = 0; i < cs.length; i++) {
      const grp = cs.filter(p => dist3(p, cs[i]) < 0.10);
      if (grp.length >= 3) return [0, 1, 2].map(k => grp.reduce((a, p) => a + p[k], 0) / grp.length);
    }
    return null;
  })();
  const isBg = (p) => p[3] < 128 || (bgc && dist3([p[0], p[1], p[2]], bgc) < 0.16);
  const bins = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    if (isBg(p)) continue;
    const k = qbin(p[0], p[1], p[2]);
    let e = bins.get(k);
    if (!e) { e = { n: 0, r: 0, g: 0, b: 0, topN: 0, cenN: 0, sideN: 0, lowN: 0, minx: w, maxx: 0, miny: h, maxy: 0 }; bins.set(k, e); }
    e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2];
    if (y < e.miny) e.miny = y; if (y > e.maxy) e.maxy = y;
    if (x < e.minx) e.minx = x; if (x > e.maxx) e.maxx = x;
    const fy = y / h, fx = x / w;
    if (fy < 0.34) e.topN++;
    if (fy >= 0.28 && fy < 0.66 && fx >= 0.26 && fx < 0.74) e.cenN++;
    if (fy >= 0.48 && fy < 0.94 && Math.abs(fx - 0.5) >= 0.26 && Math.abs(fx - 0.5) < 0.48) e.sideN++;
    if (fy >= 0.78) e.lowN++;
  }
  // 贪心合并近色 bin → 簇（治渐变/阴影拆族）
  const list = [...bins.values()].sort((a, b) => b.n - a.n).map(e => ({ n: e.n, r: e.r, g: e.g, b: e.b, topN: e.topN, cenN: e.cenN, sideN: e.sideN, lowN: e.lowN, minx: e.minx, maxx: e.maxx, miny: e.miny, maxy: e.maxy, mean: [e.r / e.n, e.g / e.n, e.b / e.n] }));
  const clusters = [];
  for (const e of list) {
    let hit = null;
    for (const c of clusters) { if (dist3(e.mean, c.mean) < 0.09) { hit = c; break; } }
    if (hit) { const t = hit.n + e.n; hit.r += e.r; hit.g += e.g; hit.b += e.b; hit.mean = [hit.r / t, hit.g / t, hit.b / t]; hit.n = t; hit.topN += e.topN; hit.cenN += e.cenN; hit.sideN += e.sideN; hit.lowN += e.lowN; hit.minx = Math.min(hit.minx, e.minx); hit.maxx = Math.max(hit.maxx, e.maxx); hit.miny = Math.min(hit.miny, e.miny); hit.maxy = Math.max(hit.maxy, e.maxy); }
    else clusters.push(e);
  }
  return { at, isBg, clusters, N, w, h };
}

function extractFeatures(data, size, style, seed) {
  const f = { person: false, skin: null, hair: null, hairGuess: false, style: 'short', glasses: false, beard: false, mouth: 'smile', clothes: null };
  if (!data) return f;
  if (style && NON_PERSON.has(style)) return f;
  // ── 结构：钉扎差分（style+seed 已知时精确）──
  let pinGlasses = null, pinFacial = null, pinBald = null;
  if (style && seed != null) {
    if (PIN_GLASSES[style] || PIN_GLASSES_NAMED[style]) pinGlasses = pinGlassesExact(style, seed);
    if (PIN_FACIAL[style]) pinFacial = pinDiff(style, seed, PIN_FACIAL[style]);
    if (PIN_HAIR[style]) pinBald = !pinDiff(style, seed, PIN_HAIR[style]);
  }
  // ── neutral 线稿特例：透明脸内+单色描边 → 纸白肤+黑发（adventurer-neutral 有真肤色，走像素）──
  if (style && NEUTRAL_LINEART.has(style)) {
    f.person = true; f.skin = '#f7ece2'; f.hair = '#181418';
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
    return f;
  }
  const { at, isBg, clusters, N, w, h } = pixelClusters(data, size, size);
  // 肤色：中心窗计数高、顶带占比低的簇（发壳包脸+额——纯 cenN 最大会抓到棕发）；色相卫兵拒绿青蓝紫
  const hueOf = c => { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let hh; if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh /= 6; return hh < 0 ? hh + 1 : hh; };
  const satOf = c => { const mx = Math.max(c[0], c[1], c[2]) / 255, mn = Math.min(c[0], c[1], c[2]) / 255; return mx ? (mx - mn) / mx : 0; };
  let skinC = null, skinScore = 0;
  for (const c of clusters) {
    if (c.cenN < 0.024 * N) continue;
    const L = (c.mean[0] + c.mean[1] + c.mean[2]) / 765;
    if (L < 0.14) continue;
    const hh = hueOf(c.mean), ss = satOf(c.mean);
    if (ss > 0.30 && hh > 0.22 && hh < 0.86) continue;
    const score = c.cenN - 1.2 * c.topN;
    if (score <= skinScore) continue;
    skinC = c; skinScore = score;
  }
  if (!skinC) {   // 第二机会：光照分双色调的小脸（personas Ivy 型）——低阈+中心包围盒+总量守卫
    for (const c of clusters) {
      if (c.cenN < 0.007 * N || c.n < 0.02 * N) continue;
      const L = (c.mean[0] + c.mean[1] + c.mean[2]) / 765;
      if (L < 0.14) continue;
      const hh = hueOf(c.mean), ss = satOf(c.mean);
      if (ss > 0.30 && hh > 0.22 && hh < 0.86) continue;
      const cx = (c.minx + c.maxx) / 2 / w, cy = (c.miny + c.maxy) / 2 / h;
      if (cx < 0.30 || cx > 0.70 || cy < 0.25 || cy > 0.72) continue;
      const score = c.cenN - 1.2 * c.topN;
      if (score <= skinScore) continue;
      skinC = c; skinScore = score;
    }
  }
  if (!skinC) return f;
  f.person = true; f.skin = hexc(skinC.mean);
  // 发色：顶带最大非肤簇
  let hairC = null;
  for (const c of clusters) {
    if (c === skinC || c.topN < 0.008 * N) continue;
    if (dist3(c.mean, skinC.mean) < 0.07) continue;   // 0.07：金发vs浅肤同族（0.09）也要能当发——真发的顶带 topN 会压过同族阴影簇
    if (!hairC || c.topN > hairC.topN) hairC = c;
  }
  const faceW = Math.max(4, skinC.maxx - skinC.minx);
  // 拯救路径：钉扎说有发但像素 hairC 缺失/过小（深肤近黑发/浅发大脸合簇）→ 顶带取色重建
  if ((!hairC || hairC.n <= 0.012 * N) && pinBald === false) {
    let tr = 0, tg = 0, tb = 0, tn = 0, tSide = 0;
    for (let y = 0; y < 0.30 * h; y++) for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      if (dist3([p[0], p[1], p[2]], skinC.mean) < 0.10) continue;
      tr += p[0]; tg += p[1]; tb += p[2]; tn++;
    }
    if (tn > 0.012 * N) {
      const tm = [tr / tn, tg / tn, tb / tn];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = at(x, y);
        if (isBg(p)) continue;
        if (dist3([p[0], p[1], p[2]], tm) >= 0.10) continue;
        const fy = y / h, fx = x / w;
        if (fy >= 0.48 && fy < 0.94 && Math.abs(fx - 0.5) >= 0.26 && Math.abs(fx - 0.5) < 0.48) tSide++;
      }
      hairC = { n: tn, mean: tm, topN: tn, cenN: 0, sideN: tSide, lowN: 0, minx: 0, maxx: w, miny: 0, maxy: Math.floor(0.3 * h) };
    }
  }
  const pinSaysHair = pinBald === false;   // 钉扎确切有发（13 风格精确）
  const pixelHasHair = !!(hairC && hairC.n > 0.012 * N);
  if (pixelHasHair || (pinSaysHair && hairC)) {
    f.hair = hexc(hairC.mean);
    // 发型轮廓：侧垂发/顶丸子/超宽爆炸/短发
    let bunN = 0, maxRow = 0;
    for (let y = 0; y < 0.13 * h; y++) for (let x = 0.30 * w; x < 0.70 * w; x++) { const p = at(x, y); if (isBg(p)) continue; if (dist3([p[0], p[1], p[2]], hairC.mean) < 0.13) bunN++; }
    for (let y = Math.floor(hairC.miny); y < Math.min(hairC.maxy, 0.42 * h); y++) { let rw = 0; for (let x = 0; x < w; x++) { const p = at(x, y); if (isBg(p)) continue; if (dist3([p[0], p[1], p[2]], hairC.mean) < 0.13) rw++; } if (rw > maxRow) maxRow = rw; }
    if (hairC.sideN > 0.020 * N) f.style = 'long';
    else if (bunN > 0.012 * N && maxRow / w < 0.60) f.style = 'bun';
    else if (maxRow > faceW * 1.30) f.style = 'afro';
    else f.style = 'short';
    // 眼镜：钉扎优先；像素兜底（personas/toon-head/上传图）眼带对称框形像素
    if (pinGlasses != null) f.glasses = pinGlasses;
    else if (!style || GLASSES_STYLES.has(style)) {
      const eyeBand = (x0, x1) => { let n = 0; for (let y = Math.floor(0.32 * h); y < 0.55 * h; y++) for (let x = Math.floor(x0 * w); x < Math.min(Math.ceil(x1 * w), w); x++) { const p = at(x, y); if (isBg(p)) continue; const rgb = [p[0], p[1], p[2]]; if (dist3(rgb, skinC.mean) < 0.20 || (hairC && dist3(rgb, hairC.mean) < 0.16)) continue; const L = (p[0] + p[1] + p[2]) / 765; const mx = Math.max(p[0], p[1], p[2]) / 255, mn = Math.min(p[0], p[1], p[2]) / 255; const S = mx ? (mx - mn) / mx : 0; if (L < 0.62 || S > 0.35) n++; } return n; };
      f.glasses = Math.min(eyeBand(0.26, 0.48), eyeBand(0.52, 0.74)) > 0.0045 * N;
    } else f.glasses = false;
    // 胡子：钉扎优先；像素兜底（micah/open-peeps/personas/上传图）口鼻下方与发同族色块
    if (pinFacial != null) f.beard = pinFacial;
    else if (!style || FACIAL_STYLES.has(style)) {
      let bn2 = 0;
      for (let y = Math.floor(0.58 * h); y < 0.80 * h; y++) for (let x = Math.floor(0.30 * w); x < 0.70 * w; x++) { const p = at(x, y); if (isBg(p)) continue; const rgb = [p[0], p[1], p[2]]; if (dist3(rgb, skinC.mean) < 0.13) continue; if (hairC && dist3(rgb, hairC.mean) < 0.13) bn2++; }
      f.beard = bn2 > 0.016 * N;
    } else f.beard = false;
    // 嘴型：嘴区非肤非发最大簇高宽
    let mC = null;
    for (const c of clusters) {
      if (c === skinC || c === hairC) continue;
      const cy = (c.miny + c.maxy) / 2 / h, cx = (c.minx + c.maxx) / 2 / w;
      if (cy < 0.55 || cy > 0.78 || cx < 0.36 || cx > 0.64 || c.n < 0.004 * N) continue;
      if (dist3(c.mean, skinC.mean) < 0.13) continue;
      if (!mC || c.n > mC.n) mC = c;
    }
    if (mC) { const mw = (mC.maxx - mC.minx) / w, mh = (mC.maxy - mC.miny) / h; f.mouth = mh > 0.055 ? 'open' : (mw > 0.045 ? 'smile' : 'flat'); }
  } else if (pinSaysHair) {
    // 钉扎有发但颜色完全找不到（浅发浅肤同化）：绝不渲染秃头——发色留给 3D 层默认兜底
    f.style = 'short'; f.hairGuess = true;
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
  } else {
    f.style = 'bald';
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
  }
  // 衣服色：底带最大非肤簇
  let cc = null;
  for (const c of clusters) { if (c.lowN < 0.02 * N) continue; if (dist3(c.mean, skinC.mean) < 0.12) continue; if (!cc || c.lowN > cc.lowN) cc = c; }
  if (cc) f.clothes = hexc(cc.mean);
  return f;
}
if (typeof window !== 'undefined') window.extractFeatures = extractFeatures;
