const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
function rep(re, neu, tag) { if (!re.test(s)) throw new Error('missing: ' + tag); s = s.replace(re, neu); }

// ── ① 头像：SVG dataURI 的 naturalWidth 可能为 0/无固有尺寸，cover 裁剪会退化成负源矩形 → 超大被裁剪；
//     SVG 改整图拉伸（矢量无损），位图保留 cover 居中 ──
rep(/      try \{   \/\/ cover 裁剪：短边居中，不拉伸\r?\n        const iw = img\.naturalWidth \|\| img\.width, ih = img\.naturalHeight \|\| img\.height;\r?\n        const s = Math\.min\(iw, ih\) \|\| 256;\r?\n        g\.drawImage\(img, \(iw - s\) \/ 2, \(ih - s\) \/ 2, s, s, 0, 0, 256, 256\);\r?\n      \} catch \(err\) \{\}/,
`      try {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) { g.drawImage(img, 0, 0, 256, 256); }   // SVG 无固有尺寸：整图拉伸（矢量无损；source-rect 会退化成超大裁剪）
        else { const s0 = Math.min(iw, ih); g.drawImage(img, (iw - s0) / 2, (ih - s0) / 2, s0, s0, 0, 0, 256, 256); }   // 位图 cover 居中
      } catch (err) { try { g.drawImage(img, 0, 0, 256, 256); } catch (e2) {} }`, 'avatar-draw');

// ── ② 脸盘收一档（0.19→0.165，头球保留边框感；rim √(0.165²+0.195²)=0.255 仍在球外）──
rep(/    \/\/ 脸盘必须在球面外（r0\.19\/z0\.206：rim 到球心 0\.28 > 0\.2）——v7 陷在球内被深度剔除=「头像没映射」真因\r?\n    const face = new THREE\.Mesh\(new THREE\.CircleGeometry\(0\.19, 24\), new THREE\.MeshBasicMaterial\(\{ transparent: true \}\)\);\r?\n    face\.position\.set\(0, 1\.33, 0\.206\);/,
`    // 脸盘必须在球面外（r0.165/z0.195：rim 到球心 0.255 > 0.2）——v7 陷在球内被深度剔除=「头像没映射」真因；0.165 让头球留出边框，头像不再占满整个头
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.165, 24), new THREE.MeshBasicMaterial({ transparent: true }));
    face.position.set(0, 1.33, 0.195);`, 'face');

// ── ③ 题面卡：归属头像改用已栅格化的 texCache canvas（SVG 同样安全），字号整体上调 ──
rep(/  function drawQuestion\(truth, name, text, avatarUri\) \{/, '  function drawQuestion(truth, name, text, avatarCanvas) {', 'sig');
rep(/    let by = 160;\r?\n    if \(avatarUri\) \{\r?\n      const img = new Image\(\);\r?\n      try \{ img\.src = avatarUri; \} catch \(e\) \{\}\r?\n      if \(img\.complete && img\.naturalWidth\) \{\r?\n        const s = Math\.min\(img\.naturalWidth, img\.naturalHeight\);\r?\n        g\.save\(\); g\.beginPath\(\); g\.arc\(256, by, 26, 0, Math\.PI \* 2\); g\.clip\(\);\r?\n        g\.drawImage\(img, \(img\.naturalWidth - s\) \/ 2, \(img\.naturalHeight - s\) \/ 2, s, s, 230, by - 26, 52, 52\);\r?\n        g\.restore\(\);\r?\n        by \+= 62;\r?\n      \}\r?\n    \}/,
`    if (avatarCanvas) {   // 直接复用 syncPlayers 栅格化好的 256px 头像 canvas（SVG 同源同修）
      g.save(); g.beginPath(); g.arc(256, by, 28, 0, Math.PI * 2); g.clip();
      g.drawImage(avatarCanvas, 228, by - 28, 56, 56);
      g.restore();
      by += 64;
    }`, 'qavatar');
rep(/          drawQuestion\(t2\.choice !== 'dare', ch && ch\.name, t2\.punishment, ch \? resolveAvatar\(ch\.avatar\) : ''\);/,
  `          const av = ch && texCache.get(ch.id);
          drawQuestion(t2.choice !== 'dare', ch && ch.name, t2.punishment, av && av.tex && av.tex.image && av.tex.image.width ? av.tex.image : null);`, 'qcall');
// 题干字号 44→56 起排（自动降级 50/44/38），底线 620→640；归属行 26→28
rep(/    let fs = 44;\r?\n    const wrap = \(size\) => \{/, '    let fs = 56;\n    const wrap = (size) => {', 'fs0');
rep(/    while \(lines === null && fs > 30\) \{ fs -= 6; lines = wrap\(fs\); \}/, '    while (lines === null && fs > 36) { fs -= 6; lines = wrap(fs); }', 'fsfloor');
rep(/    g\.font = '700 26px "ZCOOL KuaiLe", sans-serif';\r?\n    g\.fillText\('「' \+ \(name \|\| '\?\?\?'\) \+ '」抽到的题', 256, by\);/,
  '    g.font = \'700 28px "ZCOOL KuaiLe", sans-serif\';\n    g.fillText(\'「\' + (name || \'???\') + \'」抽到的题\', 256, by);', 'byline');

// ── ④ 自发光 0.55→0.85（暗房间白字可读）──
rep(/emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0\.55 \}\)/, 'emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.85 })', 'emissive');

// ── ⑤ 揭晓近景：更近更俯（减少透视压缩，题干有效高度 +35%）──
rep(/const REVEAL_POS = new THREE\.Vector3\(CARD_LOOK\.x - 1\.2, CARD_LOOK\.y \+ 1\.8, CARD_LOOK\.z \+ 1\.1\);[^\r\n]*/,
  'const REVEAL_POS = new THREE.Vector3(CARD_LOOK.x - 0.9, CARD_LOOK.y + 2.35, CARD_LOOK.z + 0.75);   // 到卡 ≈2.6 单位、仰角 62°：透视压缩小、题干更大（视觉硬标准 ≥16px）', 'revealpos');

// ── ⑥ 名牌伺服闭环：投影目标 vs 渲染结果的误差补回 left/top——自动抵消 .world/#cam 全部变换（含透视），推镜不漂 ──
rep(/      \/\/ 视空间深度先判：相机背后的点投影会镜像翻转，绝不写样式（绝对定位会把文档撑出上万 px 滚动区）\r?\n      V\.set\(ch\.position\.x, 1\.72, ch\.position\.z\);\r?\n      const vz = V\.clone\(\)\.applyMatrix4\(camera\.matrixWorldInverse\)\.z;\r?\n      if \(vz > -0\.05\) \{ card\.style\.visibility = 'hidden'; return; \}\r?\n      V\.project\(camera\);   \/\/ 渲染相机现算（揭晓推镜名牌不脱头）\r?\n      const cw = canvas\.clientWidth, chh = canvas\.clientHeight;\r?\n      const sx = \(V\.x \+ 1\) \/ 2 \* cw - og\[0\];\r?\n      const sy = \(1 - \(V\.y \+ 1\) \/ 2\) \* chh - og\[1\];\r?\n      if \(sx < -180 \|\| sx > cw \+ 60 \|\| sy < -80 \|\| sy > chh \+ 60\) \{ card\.style\.visibility = 'hidden'; return; \}   \/\/ 出屏不写\r?\n      card\.style\.visibility = '';\r?\n      card\.style\.left = sx\.toFixed\(1\) \+ 'px';\r?\n      card\.style\.top = sy\.toFixed\(1\) \+ 'px';\r?\n      card\.style\.zIndex = String\(600 - Math\.round\(V\.z \* 300\)\);/,
`      // 视空间深度先判：相机背后的点投影会镜像翻转，绝不写样式（绝对定位会把文档撑出上万 px 滚动区）
      V.set(ch.position.x, 1.72, ch.position.z);
      const vz = V.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (vz > -0.05) { card.style.visibility = 'hidden'; return; }
      V.project(camera);   // 渲染相机现算（揭晓推镜名牌不脱头）
      const cw = canvas.clientWidth, chh = canvas.clientHeight;
      const wantX = (V.x + 1) / 2 * cw, wantY = (1 - (V.y + 1) / 2) * chh;   // 视口目标点（头顶）
      if (wantX < -180 || wantX > cw + 60 || wantY < -80 || wantY > chh + 60) { card.style.visibility = 'hidden'; return; }   // 出屏不写
      card.style.visibility = '';
      // 伺服闭环：名牌 DOM 活在 .world（每帧 transform）+#cam（perspective）里，投影视口坐标不能直接当 left/top 用——
      // 相机带 x/y/rx 时整体错位=「名牌漂移/对不上人」。仿 anchorTpBack 的量测闭环：读渲染结果与目标的差，阻尼补回
      // left/top，自动抵消链上全部变换（含透视）；静止 2-3 帧收敛到亚像素，运镜中轻微拖尾读作「名牌跟人」。
      if (!card.style.left) { card.style.left = (wantX - og[0]).toFixed(1) + 'px'; card.style.top = (wantY - og[1]).toFixed(1) + 'px'; }
      else {
        const r = card.getBoundingClientRect();
        if (r.width > 0) {
          card.style.left = (parseFloat(card.style.left) + (wantX - (r.left + r.width / 2)) * 0.45).toFixed(1) + 'px';
          card.style.top = (parseFloat(card.style.top) + (wantY - r.top) * 0.45).toFixed(1) + 'px';
        }
      }
      card.style.zIndex = String(600 - Math.round(V.z * 300));`, 'servo');

fs.writeFileSync('index.html', s);
console.log('user-feedback fixes patched');
