'use strict';
/* avatar-features.js — 2D 头像 → 3D 特征头 全链路（头像特征强相似轮，SPEC §1.14）
   【v4 发型轮草稿 .pw/lab-ava4-next.js：①hairMaskMetrics 形状度量 ②发型 5→11 类（buzz/fringe/
   spiky/flat/mohawk/curly/twin 新增，long/bun/afro 吃 hairLen/hairWid 连续参数）③guess 路径
   不再锁死 short（形状照测只猜颜色）④builder 新几何模板（锥刺/前帘/扁圆柱/矢状脊/凸包/侧球链）】
   ①extractFeatures: dcb/预设(位图差分钉扎·结构精确+像素否决权) + 像素聚类(颜色·轮廓) + 特例降级
   ②buildAvatarHead: monopoly/uno/tod 共用几何头（肤色/发色/发型11变体/眼镜(含墨镜)/胡子/嘴型/发茬壳）
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
  const isBg = (p) => p[3] < 128 || (bgc && dist3([p[0], p[1], p[2]], bgc) < 0.12);
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

/* 发掩码轮廓度量（v4 发型轮）：参考色=发簇色（有）否则顶带均值；形状信号与发色成败无关——
   guess（发色失败）路径照样量出轮廓分类，只有颜色用 guess。全部计数归一 /N，长度/剖面归一 /h。 */
function hairMaskMetrics(at, isBg, w, h, N, refCol) {
  if (!refCol) return null;
  const near = p => dist3([p[0], p[1], p[2]], refCol) < 0.13;
  const m = { N, topMass: 0, maxRowW: 0, dropJaw: 0, bunBlob: 0, bunW: 0, bunJag: 0, fringe: 0, centerBias: 0, sideMass: 0, twinL: 0, twinR: 0, twinMid: 0, hairLen: 0, edgeJag: 0, peaks: 0, flatTop: false };
  const tProf = new Float32Array(w).fill(-1);
  let upper = 0, run = 0;
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    let rw = 0;
    run = 0;
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (isBg(p) || !near(p)) { run = 0; continue; }
      const fx = x / w, ax = Math.abs(fx - 0.5);
      if (fy > m.hairLen) m.hairLen = fy;
      if (fy < 0.55 && (tProf[x] < 0 || fy < tProf[x])) tProf[x] = fy;
      rw++; run++;
      if (fy < 0.13 && run / w > m.bunW) m.bunW = run / w;   // 顶带最大连续行宽（丸子窄/夸发宽，visual C-1）
      if (fy < 0.30) m.topMass++;
      if (fy < 0.13 && fx >= 0.30 && fx < 0.70) m.bunBlob++;
      if (fy >= 0.33 && fy < 0.47 && fx >= 0.34 && fx < 0.66) m.fringe++;   // 眉眼带（短发发缘在 0.30h 上方，进不来）
      if (fy >= 0.25 && fy < 0.65 && ax >= 0.26 && ax < 0.48) m.sideMass++;
      if (fy < 0.50) { upper++; if (fx >= 0.40 && fx < 0.60) m.centerBias++; }
      if (fy >= 0.30 && fy < 0.72) { if (fx < 0.24) m.twinL++; else if (fx >= 0.76) m.twinR++; else if (ax < 0.10) m.twinMid++; }
      if (fy >= 0.68 && ax >= 0.24) m.dropJaw++;
    }
    if (fy < 0.45 && rw / w > m.maxRowW) m.maxRowW = rw / w;
  }
  m.topMass /= N; m.dropJaw /= N; m.bunBlob /= N; m.fringe /= N; m.sideMass /= N;
  m.twinL /= N; m.twinR /= N; m.twinMid /= N;
  m.centerBias = upper > 0.004 * N ? m.centerBias / upper : 0;
  // 顶缘剖面：edgeJag=平均绝对差（刺头锯齿）、peaks=显著峰数、flatTop=平顶宽带
  const x0 = Math.floor(0.08 * w), x1 = Math.floor(0.92 * w);
  let tSum = 0, tCnt = 0;
  for (let x = x0; x < x1; x++) if (tProf[x] >= 0) { tSum += tProf[x]; tCnt++; }
  if (tCnt > 0.35 * w) {
    const tMean = tSum / tCnt;
    let jagCnt = 0, flatN = 0, spanL = -1, spanR = -1, bjSum = 0, bjCnt = 0;
    for (let x = x0 + 1; x < x1; x++) {
      const a = tProf[x - 1], b = tProf[x];
      if (b < 0) continue;
      if (a >= 0) {
        m.edgeJag += Math.abs(b - a); jagCnt++;
        if (b < 0.16 && a < 0.16) { bjSum += Math.abs(b - a); bjCnt++; }   // 顶带剖面锯齿（丸子圆滑/夸发乱，visual C-1）
      }
      if (Math.abs(b - tMean) < 0.025) { flatN++; if (spanL < 0) spanL = x; spanR = x; }
    }
    m.edgeJag = jagCnt ? m.edgeJag / jagCnt : 0;
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const a = tProf[x - 1], b = tProf[x], c = tProf[x + 1];
      if (a >= 0 && b >= 0 && c >= 0 && b > a && b >= c && b - Math.min(a, c) > 0.035) m.peaks++;
    }
    m.bunJag = bjCnt ? bjSum / bjCnt : 0;
    m.flatTop = flatN > 0.22 * w && spanR - spanL > 0.34 * w;   // 放宽（visual C-4：open-peeps hi-top 曾漏）
  }
  return m;
}
/* 发型分类（度量→11 类）：特征性强者优先（mohawk/afro/long/twin/bun/spiky/flat/fringe），兜底 buzz/short。
   阈值域=hairMaskMetrics 的归一计数（/N）——**禁再乘 N**（两次归一=恒假，dist3 单位域同款教训）。
   pixel-art 系像素阶梯不是发丝锯齿：edgeJag/peaks 归零守卫（eng P1-3b）。 */
function hairStyleOf(mm, style) {
  if (!mm) return 'short';
  let jag = mm.edgeJag, peaks = mm.peaks;
  if (style === 'pixel-art' || style === 'pixel-art-neutral') { jag = 0; peaks = 0; }
  if (mm.centerBias > 0.60 && mm.sideMass < 0.012 && mm.maxRowW < 0.55 && peaks >= 2 && mm.bunBlob < 0.008) return 'mohawk';   // +脊起伏/窄顶双证（visual C-2 治发带假莫霍克）
  if (mm.maxRowW > 0.65) return 'afro';
  if (mm.dropJaw > 0.012) return 'long';
  if (mm.hairLen > 0.85 && mm.sideMass > 0.012) return 'long';   // 贴颊垂发（visual C-5：big-smile 紧侧长发）
  if (Math.min(mm.twinL, mm.twinR) > 0.008 && mm.twinMid < 0.005 && mm.dropJaw < 0.010) return 'twin';
  if (mm.flatTop && mm.maxRowW > 0.40) return 'flat';   // flat 提到 bun 前（visual C-4：open-peeps hi-top）
  if (mm.bunBlob > 0.012 && mm.bunW < 0.30 && mm.bunJag < 0.020 && mm.maxRowW < 0.55) return 'bun';   // 丸子窄而圆滑（visual C-1 治夸发/乱发假丸）
  if (peaks >= 5 && jag > 0.026) return 'spiky';   // 剖面锯齿门（visual C-3 治光头噪声峰；v2 实测重校准：劈分后 mm 参照色已变、原 topMass 门口径失效——真刺头 jag 0.065-0.109 / 光头 0.017，micah D4-3 光头 0.017 恒出不去）
  if ((mm.fringe > 0.008 && mm.maxRowW < 0.62) || (mm.fringe > 0.006 && mm.sideMass < 0.020)) return 'fringe';   // 侧分刘海豁免（visual C-6）
  if (mm.topMass < 0.014 && mm.maxRowW < 0.42) return 'buzz';   // 收窄（visual C-6：有发髻/盘发不再漏入）
  return 'short';
}
/* guess 兜底发色：#4a382c 深棕 + seed 哈希色相微抖 ±0.02（visual P2-4：同房多 guess 不再同色同形） */
function guessHairCol(seed) {
  let hsh = 5381; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) hsh = ((hsh << 5) + hsh + s.charCodeAt(i)) | 0;
  const c = new THREE.Color('#4a382c');
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL((hsl.h + ((Math.abs(hsh) % 100) / 100 - 0.5) * 0.04 + 1) % 1, hsl.s, hsl.l);
  return '#' + c.getHexString();
}
/* 脸部部件检测（eng P0-1 结构外提）：眼镜/嘴/胡子统一入口，hair/guess/bald 三分支都调——
   bald 不再吞墨镜（personas 大墨镜+光头案例）；函数内 hairC 判空守卫原样保留（bald 时 hairC=null 安全）。 */
function detectFaceParts(f, at, isBg, clusters, N, w, h, skinC, hairC, pinGlasses, pinFacial, style) {
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
  // 顶带一趟三账扫描（v4，eng P0-1）：tAll=非bg 总量（pixelBanBald 用，与 skinC 无关）、tSkin=肤近色量
  // （融合劈分触发）、tn/tmA=非bg非肤量与均值（拯救/度量参照）。skinC 吞发（融合簇）时 tn 被毒化，
  // tSkin/tAll 是解毒参照——三个账同一趟循环，禁拆多次全图扫（耗时预算 eng P1-1）。
  let tn = 0, tr = 0, tg = 0, tb = 0, tAll = 0, tSkin = 0;
  for (let y = 0; y < 0.30 * h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    if (isBg(p)) continue;
    tAll++;
    if (dist3([p[0], p[1], p[2]], skinC.mean) < 0.10) { tSkin++; continue; }
    tn++; tr += p[0]; tg += p[1]; tb += p[2];
  }
  const topMass = tn / N;
  const tAllN = tAll / N, tSkinN = tSkin / N;
  const tmA = tn > 0 ? [tr / tn, tg / tn, tb / tn] : null;
  // 融合劈分（eng P0-1/P0-2 主修）：肤+发 dist3<贪心合并阈 0.09 时并成单簇（personas/Jill 0.064、
  // adventurer/Maria 0.044），skinC 均值被发像素拉偏，后续一切以 skinC 为参照的信号全部失真。
  // 对 skinC 族（dist<0.13）做确定性 2-means（种子=顶带族均值/中心带族均值，3 轮迭代），
  // 两心距 >0.030 才接受：肤←中心心、发←顶心合成簇。真秃脸（额颊同色）两心同距 → 不劈，bald 保全。
  if ((!hairC || hairC.n <= 0.012 * N) && pinBald !== true && tSkinN > 0.025) {   // 0.05→0.025 实测校准：adventurer/Maria 金发顶带占比 ~0.04
    const fam = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      const rgb = [p[0], p[1], p[2]];
      if (dist3(rgb, skinC.mean) < 0.13) fam.push([rgb[0], rgb[1], rgb[2], y / h]);
    }
    const bandMean = (y0, y1) => { let n = 0, r = 0, g = 0, b = 0; for (const q of fam) if (q[3] >= y0 && q[3] < y1) { n++; r += q[0]; g += q[1]; b += q[2]; } return n ? [r / n, g / n, b / n, n] : null; };
    const bTop = bandMean(0, 0.30), bCen = bandMean(0.28, 0.66);
    if (bTop && bCen && bTop[3] > 0.02 * N && bCen[3] > 0.02 * N) {
      let c1 = [bTop[0], bTop[1], bTop[2]], c2 = [bCen[0], bCen[1], bCen[2]];
      for (let it = 0; it < 3; it++) {
        const s1 = [0, 0, 0, 0], s2 = [0, 0, 0, 0];
        for (const q of fam) {
          if (dist3(q, c1) < dist3(q, c2)) { s1[0] += q[0]; s1[1] += q[1]; s1[2] += q[2]; s1[3]++; }
          else { s2[0] += q[0]; s2[1] += q[1]; s2[2] += q[2]; s2[3]++; }
        }
        if (s1[3]) c1 = [s1[0] / s1[3], s1[1] / s1[3], s1[2] / s1[3]];
        if (s2[3]) c2 = [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]];
      }
      if (dist3(c1, c2) > 0.030) {
        const topHeart = dist3(c1, bTop) < dist3(c2, bTop) ? c1 : c2;
        const cenHeart = topHeart === c1 ? c2 : c1;
        skinC = { n: skinC.n, mean: cenHeart, topN: skinC.topN, cenN: skinC.cenN, sideN: skinC.sideN, lowN: skinC.lowN, minx: skinC.minx, maxx: skinC.maxx, miny: skinC.miny, maxy: skinC.maxy };
        f.skin = hexc(cenHeart);   // 劈分后肤色改写（Maria：肤回 #f2d3b1 系）
        hairC = { n: tSkin, mean: topHeart, topN: tSkin, cenN: 0, sideN: 0, lowN: 0, minx: 0, maxx: w, miny: 0, maxy: Math.floor(0.30 * h) };   // 字段形态照抄 rescue 合成簇
      }
    }
  }
  if ((!hairC || hairC.n <= 0.012 * N) && pinBald !== true && topMass > 0.012) {   // 拯救：顶带取色重建（v4 去极性：pin 缺省同样放行——eng/visual/value 三家合议）
    const tm = tmA;
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
  const mm = hairMaskMetrics(at, isBg, w, h, N, hairC ? hairC.mean : tmA);   // 形状度量：发色成败都能量（v4）
  const pixelVetoBald = pinBald === false && topMass < 0.004;   // 像素否决权（上轮 P0-2 钉子保留；阈 0.008→0.004：micah A1-0 细笔画真发 0.0056 被误秃，visually-bald 微须 ~0.003 仍否决——lab 复测钉）
  const pixelBanBald = tAllN > 0.05;   // 第二道闸（eng P0-1）：顶带明明有大量非bg内容却没认定发色 = pin 失效/光栅失败静默秃暗道 → 禁判 bald
  const pinSaysHair = pinBald === false && !pixelVetoBald;
  const pixelHasHair = !!(hairC && hairC.n > 0.012 * N);
  if (pixelHasHair || (pinSaysHair && hairC)) {
    f.hair = hexc(hairC.mean);
    f.style = hairStyleOf(mm, style);   // v4：11 类轮廓分类（度量与发色无关）
    f.hairLen = mm ? Math.max(0, Math.min(1, (mm.hairLen - 0.62) / 0.33)) : 0;
    f.hairWid = mm ? Math.max(0, Math.min(1, (mm.maxRowW - 0.62) / 0.30)) : 0;
  } else if (pinSaysHair || (pixelBanBald && pinBald == null)) {
    // guess 路径（v4 双入口）：①钉扎(过像素否决)有发但颜色找不到（拯救未过）；②pixelBanBald 且钉扎
    // 缺席（pin 失效/光栅失败的静默秃暗道，eng P0-1；pin 明说无发=帽子/头巾，尊重钉仍走 bald）。
    // 形状照测（mm 与发色无关），颜色=深棕兜底+seed 哈希色相微抖（同房多 guess 不同色），
    // 绝不渲染秃头、绝不用玩家亮色（P0-3）
    f.style = hairStyleOf(mm, style);
    f.hairLen = mm ? Math.max(0, Math.min(1, (mm.hairLen - 0.62) / 0.33)) : 0;
    f.hairWid = mm ? Math.max(0, Math.min(1, (mm.maxRowW - 0.62) / 0.30)) : 0;
    f.hairGuess = true; f.hair = guessHairCol(seed);
  } else {
    f.style = 'bald';
    f.hairLen = 0; f.hairWid = 0;
  }
  detectFaceParts(f, at, isBg, clusters, N, w, h, skinC, hairC, pinGlasses, pinFacial, style);   // 三分支统一外提（eng P0-1 结构项：bald/guess 不再吞墨镜与胡子）
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
  let hh = hsl.h, ss = hsl.s;
  if (hsl.l < 0.06) { hh = 0.07; ss = Math.min(0.35, ss); }   // 近黑源钉暖棕相（visual P2-1：黑底噪声色相在灯下发橄榄绿）
  c.setHSL(hh, Math.min(maxS || 0.75, ss), Math.max(loL, Math.min(hiL, hsl.l)));
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
  const F0 = feats || {};
  const F = F0;   // 路由（value P2-1）：curly/twin 独立几何 0 真实样本验证，本轮映射到近亲类（度量分类保留，几何下轮验证后启用）
  const style = F.style === 'curly' ? 'afro' : F.style === 'twin' ? 'long' : F.style;
  const g = new THREE.Group();
  const skinCol = F.person && F.skin ? skinClamp(F.skin) : 0xe9bb90;
  const hairCol = (F.person && F.hair) ? clampColor(F.hair, 0.10, 0.68, 0.60) : (F.hairGuess || style === 'bald' ? '#4a382c' : (fallbackHair ? fallbackHair(colorIdx) : '#4a382c'));   // bald+须：颌壳/眉吃固定深棕不走座位色（visual P1-5）
  const skin = new THREE.MeshStandardMaterial({ color: skinCol, roughness: style === 'bald' ? 0.75 : 0.55 });   // P1-8：秃头哑光防「头灯」高光
  const hairMat = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.8 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), skin);
  skull.castShadow = true;
  skull.userData.avSkull = true;   // tod 复用 u.head 当颅骨时按此标记摘除 builder 颅球（材质与耳/鼻共享，只 dispose 几何）
  g.add(skull);
  const hairMeshes = [];
  const extraMats = [];
  if (style === 'bald' && r >= 0.16) {   // 发茬壳（肤调压暗=青茬阴影不是头发）；monopoly r0.1 不做（28px 不可读）
    const stubMat = new THREE.MeshStandardMaterial({ color: clampColor(skinCol, 0.22, 0.88, 0.60), roughness: 0.9 });   // loL 0.22（visual P2-2：深肤秃茬可见）
    const stub = new THREE.Mesh(new THREE.SphereGeometry(r * 1.012, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.34), stubMat);
    g.add(stub); extraMats.push(stubMat);
  }
  const buzzBig = style === 'buzz' && r >= 0.16;   // r<0.16 的 buzz 回退 short 满壳（visual P1-4：mono r0.1 薄帽 0.3px=读秃）
  if (style !== 'bald') {
    const afro = style === 'afro';
    const wide = afro ? 1.26 + 0.16 * (F.hairWid || 0) : 1;
    const shaved = style === 'mohawk';   // 莫霍克两侧剃青：无侧发壳
    const flat = style === 'flat', spiky = style === 'spiky';
    if (!shaved && !buzzBig) {
      const hairTop = flat
        ? new THREE.Mesh(new THREE.CylinderGeometry(r * 0.80 * wide, r * 0.83 * wide, r * 0.38, 18), hairMat)   // 近直筒微扩（visual B：倒锥读成桶帽）
        : new THREE.Mesh(new THREE.SphereGeometry(r * 1.045 * wide, 24, 10, 0, Math.PI * 2, 0, Math.PI * (afro ? 0.30 : (spiky ? 0.27 : 0.31))), hairMat);   // 发缘下压到眉上（0.31π）；刺头收 0.27π 给锥刺让位
      if (flat) hairTop.position.y = r * 0.92;   // 顶面抬到 1.11r，俯视更醒目
      const backLen = afro ? 0.70 : (style === 'long' ? 0.38 + 0.20 * (F.hairLen || 0) : (flat ? 0.30 : 0.38));   // flat 收 0.30π 杀前缘悬边（visual B）
      const hairBack = new THREE.Mesh(new THREE.SphereGeometry(r * 1.04, 24, 14, Math.PI * 0.72, Math.PI * 1.56, Math.PI * 0.2 * (afro ? 0.6 : 1), Math.PI * backLen), hairMat);   // short 0.38π 收到耳垂治兜帽化；long 随测得长度加深
      if (afro) { hairTop.scale.y = 1.12; hairBack.scale.set(1.18, 1.15, 1.18); }
      hairTop.castShadow = hairBack.castShadow = true;
      g.add(hairTop, hairBack); hairMeshes.push(hairTop, hairBack);
    }
    const spikeAt = (dir, geo, rad) => {   // 锥刺/凸包共通：+Y 对齐球面法线外倾
      const sp = new THREE.Mesh(geo, hairMat);
      sp.position.copy(dir).multiplyScalar(rad);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      sp.castShadow = true;
      g.add(sp); hairMeshes.push(sp);
    };
    if (spiky) {   // 刺头：12 根双环锥刺（外环7 el1.15 / 内环5 el0.90），前向 ±0.6rad 缩 0.85（visual P1-2）
      const spikeGeo = new THREE.ConeGeometry(r * 0.155, r * 0.60, 6);
      for (let i = 0; i < 12; i++) {
        const outer = i < 7;
        const az = (i / (outer ? 7 : 5)) * Math.PI * 2 + (outer ? 0.35 : 0.72);
        const el = outer ? 1.15 : 0.90;
        spikeAt(new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)), spikeGeo, r * 0.95);
        const dAz = Math.min(Math.abs(az), Math.PI * 2 - Math.abs(az));   // 正面=az 0（+Z 脸向）——锚 π/2 会缩到头侧（代码检查官 P1）
        if (Math.min(dAz, Math.PI * 2 - dAz) < 0.6) hairMeshes[hairMeshes.length - 1].scale.setScalar(0.85);
      }
    }
    if (shaved) {   // 莫霍克：矢状 7 锥脊（间距 0.30rad 治脊断裂，visual P1-3），两侧露肤
      const moGeo = new THREE.ConeGeometry(r * 0.19, r * 0.62, 6);
      for (let k = -3; k <= 3; k++) {
        const ph = Math.PI / 2 + k * 0.30;
        spikeAt(new THREE.Vector3(0, Math.sin(ph), Math.cos(ph)), moGeo, r * 0.92);
      }
    }
    if (buzzBig) {   // buzz 真类：只做薄帽（visual P0-1：满壳+薄帽=no-op 假类）
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * (1.03 + 0.01 * (F.hairLen || 0)), 24, 10, 0, Math.PI * 2, 0, Math.PI * (0.20 + 0.06 * (F.hairLen || 0))), hairMat);
      cap.castShadow = true;
      g.add(cap); hairMeshes.push(cap);
    }
    if (style === 'fringe') {   // 齐刘海：前帘 partial-sphere 压到额下（φLen 2.05 包到颞角、θ 0.08π/0.32π，visual B）
      const brim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 24, 10, Math.PI * 0.5 - 1.025, 2.05, 0.08 * Math.PI, Math.PI * 0.32), hairMat);
      brim.castShadow = true;
      g.add(brim); hairMeshes.push(brim);
    }
    if (style === 'long') {   // 侧垂发锁：贴颊后、过颌线（P1-5）；长度随 hairLen、外倾 0.22rad（eng P1-6 剪影级）
      const lenK = 0.95 + 0.30 * (F.hairLen || 0);
      [-1, 1].forEach(s => {
        const lock = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 12, 12), hairMat);
        lock.scale.set(0.80, 2.05 * lenK, 0.78);
        lock.position.set(s * r * 0.88, -r * (0.42 + 0.22 * (F.hairLen || 0)), -r * 0.10);
        lock.rotation.z = -s * 0.22;
        lock.castShadow = true;
        g.add(lock); hairMeshes.push(lock);
      });
    }
    if (style === 'bun') {   // 顶前丸子 0.34r 前移抬高（uno 南位俯视见弧，visual B/eng P1-6）
      const bun = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 12, 10), hairMat);
      bun.position.set(0, r * 1.02, -r * 0.12);
      bun.scale.set(0.92, 1, 0.92);
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
  return { grp: g, hairMat, skin, mats: [skin, hairMat, eyeWhite, iris, glint, browMat, mouthCol].concat(glassesMat ? [glassesMat] : []).concat(dark && lensMat ? [lensMat] : []).concat(extraMats), parts: { skull: 1, hair: hairMeshes.length, eyes: dark ? 0 : 2, brows: 2, ears: 2, nose: 1, mouth: 1, glasses: F.glasses ? (dark ? 4 : 5) : 0, beard: F.beard ? 3 : 0, stubble: style === 'bald' && r >= 0.16 ? 1 : 0 }, hairMeshes };
}
/* ═══════════ ③ 钉扎：64² 位图差分（P0-2）═══════════ */
/* 字符串相同=未变（快速路，跳光栅）；不同则两张 64² 光栅逐像素比，>0.5% 变化=组件存在。
   micah hair 池含视觉无发变体——字符串差了像素没差，纯字符串差分会给秃头扣假发盔（特征反转）。 */
const PIN_RASTER_CACHE = new Map();   // svg 签名 → 64² ImageData（LRU 96：一个头像最多 ~20 张钉扎图）
function strHash(v) { let h = 5381; for (let i = 0; i < v.length; i++) h = ((h << 5) + h + v.charCodeAt(i)) | 0; return h; }
function rasterSvg64(svg) {
  const key = svg;   // key 硬化（eng P1-2）：完整 svg 串作 key——32 位哈希碰撞=静默用错光栅=特征反转级故障；128 条 × ~40KB ≈ 4-5MB 可接受
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
    if (PIN_RASTER_CACHE.size >= 128) PIN_RASTER_CACHE.delete(PIN_RASTER_CACHE.keys().next().value);
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
if (typeof window !== 'undefined') { window.AV3 = { extractFeatures, extractAvatarFeatures, avMetaOf, avatarImageDataRetry, buildAvatarHead, clampColor, skinClamp, browClamp, makePinJobs, bmpDiffRatio, hairMaskMetrics, hairStyleOf }; }
