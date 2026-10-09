'use strict';
/* avatar-features.js — 2D 头像 → 3D 特征头 全链路（头像特征强相似轮，SPEC §1.14）
   ①extractFeatures: dcb/预设(位图差分钉扎·结构精确+像素否决权) + 像素聚类(颜色·轮廓) + 特例降级
   ②buildAvatarHead: monopoly/uno/tod 共用几何头（肤色/发色/发型4变体/眼镜(含墨镜)/胡子/嘴型/发茬壳）
   ③avMetaOf: 头像 rep → {style,seed}（钉扎元数据；dataURL/emoji → null）
   唯一母本；monopoly/uno/tod 引用同源（dicebear-local.js 先例），check-syntax sha 锁内容。
   视觉挑刺专家修订（expert-visual.md P0×7/P1×10）已全部并入：
   P0-1 背景四角多数派（边缘中点撞贴边发=假秃）/ P0-2 位图差分+像素否决权（micah 视觉无发变体假发盔）/
   P0-3 发色兜底 #4a382c + L 钳 [0.10,0.68] S≤0.60 / P0-4 肤色 S>0.55 否决+分层钳+深肤 L≥0.30 /
   P0-5 线稿风格免黑碗 / P0-7 FACIAL+notionists、胡茬 0.009N / P1 全套几何参数（金鱼眼/兜帽/331°颌壳等） */
/* ═══════════ ① 特征提取 ═══════════ */
const PIN_GLASSES = { adventurer: 'glasses', 'adventurer-neutral': 'glasses', 'big-smile': 'accessories', 'lorelei-neutral': 'glasses', micah: 'glasses', miniavs: 'glasses', notionists: 'glasses', 'notionists-neutral': 'glasses', 'open-peeps': 'accessories', 'pixel-art': 'glasses', 'pixel-art-neutral': 'glasses' };
const PIN_GLASSES_NAMED = { avataaars: ['Kurt', 'Circle', 'Round', 'Sunglasses', 'SunglassAlt', 'Wayfarers', 'Prescription01', 'Prescription02'] };
const PIN_FACIAL = { avataaars: 'facialHair', croodles: 'beard', dylan: 'facialHair', lorelei: 'beard', miniavs: 'mustache', notionists: 'facialHair', 'toon-head': 'beard' };
const PIN_HAIR = { adventurer: 'hair', avataaars: 'top', 'big-ears': 'hair', 'big-smile': 'hair', croodles: 'top', dylan: 'hair', lorelei: 'hair', micah: 'hair', miniavs: 'hair', notionists: 'hair', personas: 'hair', 'pixel-art': 'hair', 'toon-head': 'hair' };
const NON_PERSON = new Set(['bottts', 'bottts-neutral', 'fun-emoji', 'glass', 'icons', 'identicon', 'initials', 'rings', 'shapes', 'thumbs']);
const NEUTRAL_LINEART = new Set(['avataaars-neutral', 'big-ears-neutral', 'croodles-neutral', 'lorelei-neutral', 'notionists-neutral', 'pixel-art-neutral']);
const GLASSES_STYLES = new Set([...Object.keys(PIN_GLASSES), 'personas', 'toon-head']);
const FACIAL_STYLES = new Set([...Object.keys(PIN_FACIAL), 'micah', 'open-peeps', 'personas']);

function avMetaOf(rep) {   // 头像 rep → 钉扎元数据；dataURL/emoji/坏包 → null（纯像素路径）
  if (typeof rep !== 'string') return null;
  if (rep.startsWith('dcb:')) {
    try { const r = JSON.parse(rep.slice(4)); return (r && typeof r.s === 'string' && typeof r.d === 'string') ? { style: r.s, seed: r.d } : null; } catch (e) { return null; }
  }
  return null;   // av:P## 预设由宿主页经 P.avMeta 补（party-net presetOfAv）
}
function qbin(r, g, b) { return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); }
function hexc(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.673; }   // 归一欧氏 [0,1]：全部阈值同域

function pixelClusters(data, w, h) {
  const N = w * h;
  const at = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  // 背景采样（P0-1）：只用四角做 ≥3 多数派。带 b 参数的 DiceBear 背景是全出血方形 rect（四角必不透明）；
  // 圆角/透明设计的四角必透明 → bgc=null（alpha 通道本就排背景）。边缘中点会撞贴边头发/帽子
  // （open-peeps 爆炸头四边中点全黑 → 背景被判成黑色 → 整簇头发被吃成假秃），永不采中点。
  const cs = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => at(x, y)).filter(p => p[3] >= 128).map(p => [p[0], p[1], p[2]]);
  let bgc = null;
  if (cs.length >= 3) {
    for (let i = 0; i < cs.length && !bgc; i++) {
      const grp = cs.filter(p => dist3(p, cs[i]) < 0.10);
      if (grp.length >= 3) bgc = [0, 1, 2].map(k => grp.reduce((a, p) => a + p[k], 0) / grp.length);
    }
  }
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

function extractFeatures(data, size, style, seed, pinDiff) {
  // pinDiff(style,seed,key,values) → true|false|null：位图差分钩子（makePinHooksAsync 的同步消费形态，
  //   由 extractAvatarFeatures 预跑后注入；null/缺省=无钉扎，纯像素路径）
  const f = { person: false, skin: null, hair: null, hairGuess: false, style: 'short', glasses: false, beard: false, mouth: 'smile', clothes: null };
  if (!data) return f;
  if (style && NON_PERSON.has(style)) return f;
  let pinGlasses = null, pinFacial = null, pinBald = null;
  if (style && seed != null && typeof pinDiff === 'function') {
    if (PIN_GLASSES[style] || PIN_GLASSES_NAMED[style]) {
      const names = PIN_GLASSES_NAMED[style];
      pinGlasses = names ? names.some(n => pinDiff(style, seed, 'accessories', [n]) === true) : pinDiff(style, seed, PIN_GLASSES[style]);
    }
    if (PIN_FACIAL[style]) pinFacial = pinDiff(style, seed, PIN_FACIAL[style]);
    if (PIN_HAIR[style]) pinBald = pinDiff(style, seed, PIN_HAIR[style]) === false;   // false=钉了没变化→组件不存在→光头候选
  }
  if (style && NEUTRAL_LINEART.has(style)) {   // 线稿特例：透明脸内+单色描边 → 纸白肤；眉须色留 #181418；无发碗（P0-5 反转修正）
    f.person = true; f.skin = '#f7ece2'; f.hair = '#181418'; f.style = 'bald';
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
    return f;
  }
  const { at, isBg, clusters, N, w, h } = pixelClusters(data, size, size);
  const hueOf = c => { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let hh; if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh /= 6; return hh < 0 ? hh + 1 : hh; };
  const satOf = c => { const mx = Math.max(c[0], c[1], c[2]) / 255, mn = Math.min(c[0], c[1], c[2]) / 255; return mx ? (mx - mn) / mx : 0; };
  // 肤色：中心窗计数高、顶带占比低（发壳包脸额——纯 cenN 会抓到棕发）；拒绿青蓝紫 + 高饱和软惩罚（红发重压、avataaars 棕肤保留，P0-4）
  let skinC = null, skinScore = -Infinity;   // 分数只排序不设门槛（门槛=cenN 下限+守卫；惩罚后负分也参选）
  for (const c of clusters) {
    if (c.cenN < 0.024 * N) continue;
    const L = (c.mean[0] + c.mean[1] + c.mean[2]) / 765;
    if (L < 0.14) continue;
    const hh = hueOf(c.mean), ss = satOf(c.mean);
    if (ss > 0.30 && hh > 0.22 && hh < 0.86) continue;
    const score = c.cenN - 1.2 * c.topN - Math.max(0, ss - 0.55) * N * 0.6;   // 高饱和软惩罚：红发(S≈0.99)重压、avataaars 棕肤(S 0.78)保留
    if (score <= skinScore) continue;
    skinC = c; skinScore = score;
  }
  if (!skinC || skinScore < 0) {   // 第二机会：小脸双色调（skinScore<0=第一通道赢家弱，允许推翻）——低阈+中心包围盒+总量守卫
    for (const c of clusters) {
      if (c.cenN < 0.007 * N || c.n < 0.02 * N) continue;
      const L = (c.mean[0] + c.mean[1] + c.mean[2]) / 765;
      if (L < 0.14 || L > 0.93) continue;   // 0.93 上限：白眼球不是肤
      const hh = hueOf(c.mean), ss = satOf(c.mean);
      if (ss > 0.30 && hh > 0.22 && hh < 0.86) continue;
      const cx = (c.minx + c.maxx) / 2 / w, cy = (c.miny + c.maxy) / 2 / h;
      if (cx < 0.30 || cx > 0.70 || cy < 0.25 || cy > 0.72) continue;
      const score = c.cenN - 1.2 * c.topN - Math.max(0, ss - 0.55) * N * 0.6;
      if (score <= skinScore) continue;
      skinC = c; skinScore = score;
    }
  }
  if (!skinC) return f;
  f.person = true; f.skin = hexc(skinC.mean);
  let hairC = null;
  for (const c of clusters) {
    if (c === skinC || c.topN < 0.008 * N) continue;
    if (dist3(c.mean, skinC.mean) < 0.07) continue;   // 0.07：金发 vs 浅肤同族（dist 0.09）也要能当发——真发顶带 topN 会压过同族阴影簇
    if (!hairC || c.topN > hairC.topN) hairC = c;
  }
  const faceW = Math.max(4, skinC.maxx - skinC.minx);
  // 顶带非肤质量：像素否决权与取色拯救共用一次扫描（P0-2）
  let tn = 0, tr = 0, tg = 0, tb = 0;
  for (let y = 0; y < 0.30 * h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    if (isBg(p)) continue;
    if (dist3([p[0], p[1], p[2]], skinC.mean) < 0.10) continue;
    tn++; tr += p[0]; tg += p[1]; tb += p[2];
  }
  const topMass = tn / N;
  if ((!hairC || hairC.n <= 0.012 * N) && pinBald === false && topMass > 0.012) {   // 拯救：钉扎+像素都说有发但色难分 → 顶带取色重建
    const tm = [tr / tn, tg / tn, tb / tn];
    let tSide = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      if (dist3([p[0], p[1], p[2]], tm) >= 0.10) continue;
      const fy = y / h, fx = x / w;
      if (fy >= 0.48 && fy < 0.94 && Math.abs(fx - 0.5) >= 0.26 && Math.abs(fx - 0.5) < 0.48) tSide++;
    }
    hairC = { n: tn, mean: tm, topN: tn, cenN: 0, sideN: tSide, lowN: 0, minx: 0, maxx: w, miny: 0, maxy: Math.floor(0.3 * h) };
  }
  const pixelVetoBald = pinBald === false && topMass < 0.008;   // 像素否决权（P0-2）：micah 发池含视觉无发变体——顶带没发就别给发盔
  const pinSaysHair = pinBald === false && !pixelVetoBald;
  const pixelHasHair = !!(hairC && hairC.n > 0.012 * N);
  if (pixelHasHair || (pinSaysHair && hairC)) {
    f.hair = hexc(hairC.mean);
    // 发型轮廓：过颌线还有发=long（真垂发），宽而不过颌=afro（爆炸头），再丸子/短发
    let bunN = 0, maxRow = 0, lowMass = 0;
    for (let y = 0; y < 0.13 * h; y++) for (let x = 0.30 * w; x < 0.70 * w; x++) { const p = at(x, y); if (isBg(p)) continue; if (dist3([p[0], p[1], p[2]], hairC.mean) < 0.13) bunN++; }
    for (let y = Math.floor(hairC.miny); y < Math.min(hairC.maxy, 0.42 * h); y++) { let rw = 0; for (let x = 0; x < w; x++) { const p = at(x, y); if (isBg(p)) continue; if (dist3([p[0], p[1], p[2]], hairC.mean) < 0.13) rw++; } if (rw > maxRow) maxRow = rw; }
    for (let y = Math.floor(0.68 * h); y < h; y++) for (let x = 0; x < w; x++) { if (Math.abs(x / w - 0.5) < 0.24) continue; const p = at(x, y); if (isBg(p)) continue; if (dist3([p[0], p[1], p[2]], hairC.mean) < 0.13) lowMass++; }
    if (maxRow / w > 0.65) f.style = 'afro';   // 超宽发主导画幅（open-peeps/Leo 验收=afro）
    else if (lowMass > 0.012 * N) f.style = 'long';   // 过颌线还有发=真垂发
    else if (bunN > 0.012 * N && maxRow / w < 0.60) f.style = 'bun';
    else f.style = 'short';
    // 眼镜：钉扎优先；像素兜底检出均值 L<0.25 → 'dark'（墨镜/眼罩——3D 渲染镜片盘且不生成眼球，P1-6）
    if (pinGlasses != null) f.glasses = pinGlasses;
    else if (!style || GLASSES_STYLES.has(style)) {
      const bandN = [];
      let darkSum = 0, darkCnt = 0;
      const scanBand = (x0, x1) => { let n = 0; for (let y = Math.floor(0.32 * h); y < 0.55 * h; y++) for (let x = Math.floor(x0 * w); x < Math.min(Math.ceil(x1 * w), w); x++) { const p = at(x, y); if (isBg(p)) continue; const rgb = [p[0], p[1], p[2]]; if (dist3(rgb, skinC.mean) < 0.20 || (hairC && dist3(rgb, hairC.mean) < 0.16)) continue; const L = (p[0] + p[1] + p[2]) / 765; const mx = Math.max(p[0], p[1], p[2]) / 255, mn = Math.min(p[0], p[1], p[2]) / 255; const S = mx ? (mx - mn) / mx : 0; if (L < 0.62 || S > 0.35) { n++; if (L < 0.25) { darkSum += L; darkCnt++; } } } return n; };
      bandN.push(scanBand(0.26, 0.48));
      bandN.push(scanBand(0.52, 0.74));
      if (Math.min(bandN[0], bandN[1]) > 0.0045 * N) f.glasses = darkCnt > 0.6 * (bandN[0] + bandN[1]) ? 'dark' : true;
    } else f.glasses = false;
    // 嘴簇先测（胡子扫描要排除嘴簇包围盒——嘴本身是暗色线，不排会把嘴当胡茬，Ivy 假胡子教训）
    let mC = null;
    for (const c of clusters) {
      if (c === skinC || c === hairC) continue;
      const cy = (c.miny + c.maxy) / 2 / h, cx = (c.minx + c.maxx) / 2 / w;
      if (cy < 0.55 || cy > 0.78 || cx < 0.36 || cx > 0.64 || c.n < 0.004 * N) continue;
      if (dist3(c.mean, skinC.mean) < 0.13) continue;
      if (!mC || c.n > mC.n) mC = c;
    }
    if (mC) {
      const mw = (mC.maxx - mC.minx) / w, mh = (mC.maxy - mC.miny) / h;
      f.mouth = mh > 0.055 ? 'open' : (mw > 0.045 ? 'smile' : 'flat');
      if (f.mouth === 'open' && mw > 0.12) f.mouthWide = true;   // 张嘴大笑加牙（P2-7）
    }
    // 胡子：钉扎优先；像素兜底（窗 x0.38-0.62 / y0.60-0.78，跳过嘴簇盒；非肤非发暗像素=胡茬，阈 0.009N，P0-7）
    if (pinFacial != null) f.beard = pinFacial;
    else if (!style || FACIAL_STYLES.has(style)) {
      const mx0 = mC ? mC.minx - 1 : -1, mx1 = mC ? mC.maxx + 1 : -1, my0 = mC ? mC.miny - 1 : -1, my1 = mC ? mC.maxy + 1 : -1;
      let bn2 = 0;
      for (let y = Math.floor(0.68 * h); y < 0.78 * h; y++) for (let x = Math.floor(0.44 * w); x < 0.56 * w; x++) {
        if (mC && x >= mx0 && x <= mx1 && y >= my0 && y <= my1) continue;   // 下巴核心盒：真胡子盖满下巴可检出；侧卷发/嘴线都够不着（Ivy 假胡子终修）
        const p = at(x, y);
        if (isBg(p)) continue;
        const rgb = [p[0], p[1], p[2]];
        if (dist3(rgb, skinC.mean) < 0.13) continue;
        const L = (p[0] + p[1] + p[2]) / 765;
        if ((hairC && dist3(rgb, hairC.mean) < 0.13) || L < 0.45) bn2++;
      }
      f.beard = bn2 > 0.009 * N;
    } else f.beard = false;
  } else if (pinSaysHair) {
    // 钉扎(过像素否决)有发但颜色找不到（浅发浅肤同化+拯救未过）：固定自然深棕兜底，绝不渲染秃头、绝不用玩家亮色（P0-3）
    f.style = 'short'; f.hairGuess = true; f.hair = '#4a382c';
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
  } else {
    f.style = 'bald';
    f.glasses = pinGlasses === true; f.beard = pinFacial === true;
  }
  let cc = null;
  for (const c of clusters) { if (c.lowN < 0.02 * N) continue; if (dist3(c.mean, skinC.mean) < 0.12) continue; if (!cc || c.lowN > cc.lowN) cc = c; }
  if (cc) f.clothes = hexc(cc.mean);
  return f;
}
/* 无尺寸 SVG 注入 width/height：Chromium 对无尺寸 SVG 的光栅是猜测式且可部分（同输入两次提取一短一秃的根因），
   定尺寸后确定。位图 dataURL 原样返回。 */
function svgWithSize(dataUri, w, h) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/svg')) return dataUri;
  try {
    const comma = dataUri.indexOf(',');
    const body = decodeURIComponent(dataUri.slice(comma + 1));
    if (/width=/.test(body.slice(0, 200))) return dataUri;
    return dataUri.slice(0, comma) + ',' + encodeURIComponent(body.replace('<svg ', '<svg width="' + w + '" height="' + h + '" '));
  } catch (e) { return dataUri; }
}
function loadRaster(dataUri, size) {   // 提取专用光栅：SVG 注尺寸重载 + 预热双画；位图走 img 兜底由调用方处理
  const uri = svgWithSize(dataUri, size, size);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  return new Promise(res => {
    img.onload = () => {
      avatarImageData(img, size);
      requestAnimationFrame(() => requestAnimationFrame(() => res(avatarImageData(img, size))));
    };
    img.onerror = () => res(null);
    img.src = uri;
  });
}
/* img → ImageData（128²，空光栅重试一次：并行高负载下 SVG 光栅瞬态部分渲染的兜底） */
function avatarImageData(img, size) {
  const S = size || 128;
  const tryDraw = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, S, S);
    try {
      const d = g.getImageData(0, 0, S, S).data;
      let op = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] >= 128) op++;
      return op >= 0.02 * S * S ? d : null;
    } catch (e) { return null; }   // 画布污染（CDN 回退跨域）
  };
  return tryDraw() || null;
}
async function avatarImageDataRetry(img, size) {   // 预热画一枪（可能部分）→ rAF 两帧 → 重画取完整帧。
  // 实测：负载下 Chromium 对 SVG img 的首次 drawImage 可能部分路径未画（肤色区缺失→误判非人），
  // 双画+rAF 后稳定；对位图 dataURL 无害。空光栅（污染/解码失败）照旧返回 null。
  avatarImageData(img, size);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const d = avatarImageData(img, size);
  if (d) return d;
  try { await img.decode(); } catch (e) {}
  return avatarImageData(img, size);
}
/* ═══════════ ② 特征化 3D 头（monopoly r0.1 / uno r0.16 / tod r0.2 同源）═══════════ */
/* 参数全部来自视觉挑刺专家 P1 清单（expert-visual.md §八），勿单独回调单页数值 */
function clampColor(hex, loL, hiL, maxS) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(maxS || 0.75, hsl.s), Math.max(loL, Math.min(hiL, hsl.l)));
  return '#' + c.getHexString();
}
function skinClamp(hex) {   // 肤色分层饱和钳（P0-4）：浅肤 0.42 / 中肤 0.55 / 深肤 0.60 + L∈[0.30,0.88]
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  const L = hsl.l;
  const maxS = L >= 0.72 ? 0.42 : (L < 0.45 ? 0.60 : 0.55);
  c.setHSL(hsl.h, Math.min(maxS, hsl.s), Math.max(0.30, Math.min(0.88, L)));
  return '#' + c.getHexString();
}
function browClamp(hex) {   // 眉/髭色：L 钳 [0.16,0.62]，超界向 0x3a332e 混 50%（白发眉在浅肤上要有灰度读数，P1-2）
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  if (hsl.l > 0.62 || hsl.l < 0.16) {
    const out = c.clone().lerp(new THREE.Color(0x3a332e), 0.5);
    const h2 = {};
    out.getHSL(h2);
    out.setHSL(h2.h, h2.s, Math.max(0.16, Math.min(0.62, h2.l)));
    return out;
  }
  return c;
}
function buildAvatarHead(r, colorIdx, feats, fallbackHair) {   // +z 脸朝向；feats=extractFeatures 产物；返回 {grp,hairMat,skin,mats,parts,hairMeshes}
  const F = feats || {};
  const g = new THREE.Group();
  const skinCol = F.person && F.skin ? skinClamp(F.skin) : 0xe9bb90;
  const hairCol = (F.person && F.hair) ? clampColor(F.hair, 0.10, 0.68, 0.60) : (F.hairGuess ? '#4a382c' : (fallbackHair ? fallbackHair(colorIdx) : '#4a382c'));
  const skin = new THREE.MeshStandardMaterial({ color: skinCol, roughness: F.style === 'bald' ? 0.75 : 0.55 });   // P1-8：秃头哑光防「头灯」高光
  const hairMat = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.8 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), skin);
  skull.castShadow = true;
  skull.userData.avSkull = true;   // tod 复用 u.head 当颅骨时按此标记摘除 builder 颅球（材质与耳/鼻共享，只 dispose 几何）
  g.add(skull);
  const hairMeshes = [];
  const extraMats = [];
  if (F.style === 'bald' && r >= 0.16) {   // 发茬壳（肤调压暗=青茬阴影不是头发）；monopoly r0.1 不做（28px 不可读）
    const stubMat = new THREE.MeshStandardMaterial({ color: clampColor(skinCol, 0.30, 0.88, 0.60), roughness: 0.9 });
    const stub = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.34), stubMat);
    g.add(stub); extraMats.push(stubMat);
  }
  if (F.style !== 'bald') {
    const afro = F.style === 'afro';
    const wide = afro ? 1.36 : 1;
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(r * 1.045 * wide, 24, 10, 0, Math.PI * 2, 0, Math.PI * (afro ? 0.30 : 0.31)), hairMat);   // 发缘下压到眉上（0.31π）
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(r * 1.04, 24, 14, Math.PI * 0.72, Math.PI * 1.56, Math.PI * 0.2 * (afro ? 0.6 : 1), Math.PI * (afro ? 0.70 : 0.38)), hairMat);   // short 0.38π 收到耳垂，治兜帽化
    if (afro) { hairTop.scale.y = 1.12; hairBack.scale.set(1.18, 1.15, 1.18); }
    hairTop.castShadow = hairBack.castShadow = true;
    g.add(hairTop, hairBack); hairMeshes.push(hairTop, hairBack);
    if (F.style === 'long') {   // 侧垂发锁：贴颊后、外倾 8°、过颌线（P1-5）
      [-1, 1].forEach(s => {
        const lock = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 12, 12), hairMat);
        lock.scale.set(0.80, 2.05, 0.78);
        lock.position.set(s * r * 0.88, -r * 0.42, -r * 0.10);
        lock.rotation.z = -s * 0.14;
        lock.castShadow = true;
        g.add(lock); hairMeshes.push(lock);
      });
    }
    if (F.style === 'bun') {   // 顶后丸子 0.36r（28px 凸包可读下限，P1-5）
      const bun = new THREE.Mesh(new THREE.SphereGeometry(r * 0.36, 12, 10), hairMat);
      bun.position.set(0, r * 0.98, -r * 0.30);
      bun.castShadow = true;
      g.add(bun); hairMeshes.push(bun);
    }
  }
  const earGeo = new THREE.SphereGeometry(r * 0.16, 10, 8);
  [-1, 1].forEach(s => { const ear = new THREE.Mesh(earGeo, skin); ear.position.set(s * r * 0.98, r * 0.16, 0); ear.scale.set(0.55, 1, 0.8); g.add(ear); });
  const dark = F.glasses === 'dark';   // 墨镜/眼罩：深色镜片盘 + 不生成眼球（P1-6）
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.3 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.25 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePos = [-1, 1].map(s => [s * r * 0.30, r * 0.48, r * 0.74]);
  if (!dark) [-1, 1].forEach((s, i) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.125, 14, 12), eyeWhite);   // P1-1 金鱼眼修正
    eye.position.set(eyePos[i][0], eyePos[i][1], eyePos[i][2]);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.052, 10, 8), iris);
    pupil.position.set(0, 0, r * 0.085);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.03, 6, 6), glint);
    dot.position.set(-r * 0.026, r * 0.04, r * 0.12);
    eye.add(pupil, dot);
    g.add(eye);
  });
  const browMat = new THREE.MeshStandardMaterial({ color: browClamp(hairCol), roughness: 0.8 });   // 眉独立材质（P1-2 防「眉=发色」白发眉消失）
  [-1, 1].forEach(s => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 0.26, r * 0.045, r * 0.04), browMat);
    brow.position.set(s * r * 0.27, r * 0.58, r * 0.80);
    brow.rotation.z = -s * 0.12;
    g.add(brow);
  });
  let glassesMat = null, lensMat = null;
  if (F.glasses) {   // 普通框=双环+梁+腿；墨镜=深色镜片盘+粗框（P1-6）
    glassesMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.35, metalness: 0.3 });
    [-1, 1].forEach((s, i) => {
      if (dark) {
        if (!lensMat) lensMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.24, 16), lensMat);
        lens.position.set(eyePos[i][0], eyePos[i][1], r * 0.88);
        g.add(lens);
      } else {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.26, r * 0.034, 8, 20), glassesMat);
        rim.position.set(eyePos[i][0], eyePos[i][1], r * 0.90);
        g.add(rim);
      }
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.025, r * 0.025, r * 0.82, 6), glassesMat);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(s * r * 0.55, r * 0.50, r * 0.44);
      g.add(leg);
    });
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.025, r * 0.025, r * 0.32, 6), glassesMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, r * 0.50, r * 0.92);
    g.add(bridge);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(r * 0.095, r * 0.24, 10), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, r * 0.2, r * 0.955);
  g.add(nose);
  const skinC3 = new THREE.Color(skinCol);
  const skinHSL = {};
  skinC3.getHSL(skinHSL);
  const mouthDark = skinHSL.l < 0.42;   // 嘴色深肤分档（P2-6）：深肤上 0x8a4a3a 不可见
  const mouthCol = F.mouth === 'open' ? new THREE.MeshBasicMaterial({ color: mouthDark ? 0x3d1d18 : 0x5a2620 }) : new THREE.MeshBasicMaterial({ color: mouthDark ? 0x3d1d18 : 0x8a4a3a });
  let mouth;
  if (F.mouth === 'open') {
    mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 12, 10), mouthCol);
    mouth.scale.set(1, 0.62, 0.35);
    mouth.position.set(0, -r * 0.18, r * 0.94);
  } else if (F.mouth === 'flat') {
    mouth = new THREE.Mesh(new THREE.BoxGeometry(r * 0.30, r * 0.035, r * 0.03), mouthCol);
    mouth.position.set(0, -r * 0.14, r * 0.985);
  } else {
    mouth = new THREE.Mesh(new THREE.TorusGeometry(r * 0.17, r * 0.028, 8, 18, Math.PI * 0.75), mouthCol);
    mouth.rotation.z = Math.PI * 1.125;
    mouth.position.set(0, -r * 0.12, r * 0.975);
  }
  g.add(mouth);
  if (F.mouth === 'open' && F.mouthWide) {   // 张嘴大笑加白牙（P2-7）
    const teethMat = new THREE.MeshBasicMaterial({ color: 0xf5f2ea });
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(r * 0.20, r * 0.05, r * 0.02), teethMat);
    teeth.position.set(0, -r * 0.13, r * 0.965);
    g.add(teeth); extraMats.push(teethMat);
  }
  if (F.beard) {   // 胡子：正面 ±62° 颌壳（从下唇下起步，治 331° 包裹）+ 双半髭条（P1-4）
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 12, Math.PI * 0.16, Math.PI * 0.68, Math.PI * 0.60, Math.PI * 0.32), hairMat);
    g.add(jaw);
    const moMat = new THREE.MeshStandardMaterial({ color: browClamp(hairCol), roughness: 0.8 });
    extraMats.push(moMat);
    [-1, 1].forEach(s => {
      const mo = new THREE.Mesh(new THREE.BoxGeometry(r * 0.16, r * 0.07, r * 0.05), moMat);
      mo.position.set(s * r * 0.09, r * 0.02, r * 1.0);
      mo.rotation.y = s * 0.15;
      g.add(mo);
    });
  }
  return { grp: g, hairMat, skin, mats: [skin, hairMat, eyeWhite, iris, glint, browMat, mouthCol].concat(glassesMat ? [glassesMat] : []).concat(dark && lensMat ? [lensMat] : []).concat(extraMats), parts: { skull: 1, hair: hairMeshes.length, eyes: dark ? 0 : 2, brows: 2, ears: 2, nose: 1, mouth: 1, glasses: F.glasses ? (dark ? 4 : 5) : 0, beard: F.beard ? 3 : 0, stubble: F.style === 'bald' && r >= 0.16 ? 1 : 0 }, hairMeshes };
}
/* ═══════════ ③ 钉扎：64² 位图差分（P0-2）═══════════ */
/* 字符串相同=未变（快速路，跳光栅）；不同则两张 64² 光栅逐像素比，>0.5% 变化=组件存在。
   micah hair 池含视觉无发变体——字符串差了像素没差，纯字符串差分会给秃头扣假发盔（特征反转）。 */
const PIN_RASTER_CACHE = new Map();   // svg 签名 → 64² ImageData（LRU 96：一个头像最多 ~20 张钉扎图）
function strHash(v) { let h = 5381; for (let i = 0; i < v.length; i++) h = ((h << 5) + h + v.charCodeAt(i)) | 0; return h; }
function rasterSvg64(svg) {
  const key = svg.length + '|' + strHash(svg);
  let d = PIN_RASTER_CACHE.get(key);
  if (d) return Promise.resolve(d);
  const uri = svgWithSize('data:image/svg+xml;utf8,' + encodeURIComponent(svg), 64, 64);
  const img = new Image();
  return new Promise(res => {
    img.onload = () => {
      avatarImageData(img, 64);   // 预热双画（定尺寸后本应确定，防御留层）
      requestAnimationFrame(() => requestAnimationFrame(() => res(avatarImageData(img, 64))));
    };
    img.onerror = () => res(null);
    img.src = uri;
  }).then(d2 => {
    if (!d2) return null;   // 失败光栅不入缓存（inspector-biz P2：null 永久缓存=该头像钉扎永久降级）
    if (PIN_RASTER_CACHE.size >= 96) PIN_RASTER_CACHE.delete(PIN_RASTER_CACHE.keys().next().value);
    PIN_RASTER_CACHE.set(key, d2);
    return d2;
  });
}
function bmpDiffRatio(a, b) {
  if (!a || !b) return 0;
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 4) {
    if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24 || Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
  }
  return n / (len / 4);
}
function makePinJobs(style, seed) {   // 组装本头像全部钉扎任务（一次预跑，extractFeatures 同步消费）
  if (typeof DiceBearLocal === 'undefined' || !DiceBearLocal || typeof DiceBearLocal.diceAvatar !== 'function') return null;
  const gen = (key, values) => key ? DiceBearLocal.diceAvatar(style, { seed, [key]: values || [] }).toString() : DiceBearLocal.diceAvatar(style, { seed }).toString();
  const jobs = [];
  const add = (tag, key, values) => {
    const a = gen(null);
    const b = gen(key, values);
    if (a === b) { jobs.push({ tag, result: Promise.resolve(false) }); return; }   // 快速路：同字节=组件不存在
    jobs.push({ tag, result: Promise.all([rasterSvg64(a), rasterSvg64(b)]).then(([da, db]) => (da && db ? bmpDiffRatio(da, db) > 0.005 : null)) });
  };
  if (PIN_GLASSES[style]) add('glasses', PIN_GLASSES[style]);
  else if (PIN_GLASSES_NAMED[style]) PIN_GLASSES_NAMED[style].forEach(n => add('glasses:' + n, 'accessories', [n]));
  if (PIN_FACIAL[style]) add('facial', PIN_FACIAL[style]);
  if (PIN_HAIR[style]) add('hair', PIN_HAIR[style]);
  return jobs;
}
async function extractAvatarFeatures(img, meta) {   // 页面入口：img 已 onload；meta={style,seed}|null（avMetaOf/P.avMeta）
  let data = img && img.src ? await loadRaster(img.src, 128) : null;
  if (!data && img) data = await avatarImageDataRetry(img, 128);   // 兜底（位图/异常 URI）
  if (!data) return null;
  let pinDiff = null;
  if (meta && meta.style && meta.seed != null) {
    const jobs = makePinJobs(meta.style, meta.seed);
    if (jobs) {
      const results = {};
      await Promise.all(jobs.map(j => j.result.then(v => { results[j.tag] = v; })));
      pinDiff = (style, seed, key, values) => {   // 同步消费预跑结果
        if (key === 'accessories' && values && values[0]) return results['glasses:' + values[0]];
        if (key === PIN_GLASSES[meta.style]) return results.glasses;
        if (key === PIN_FACIAL[meta.style]) return results.facial;
        if (key === PIN_HAIR[meta.style]) return results.hair;
        return null;
      };
      if (PIN_GLASSES_NAMED[meta.style]) pinDiff = (style, seed, key, values) => (key === 'accessories' && values && values[0] ? results['glasses:' + values[0]] : null);
    }
  }
  return extractFeatures(data, 128, meta ? meta.style : null, meta ? meta.seed : null, pinDiff);
}
if (typeof window !== 'undefined') { window.AV3 = { extractFeatures, extractAvatarFeatures, avMetaOf, avatarImageDataRetry, buildAvatarHead, clampColor, skinClamp, browClamp, makePinJobs, bmpDiffRatio }; }
