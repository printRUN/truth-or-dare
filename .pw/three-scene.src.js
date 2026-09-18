/* ══════════ Three.js 真 3D 场景（第三人称牌桌，body.three3d）v8 ══════════
   混合架构：WebGL 画布（body 层全屏，#bg-canvas 之上 #app 之下）渲染房间/桌子/牌堆/3D 人物与桌上卡；
   DOM UI（HUD/名牌/选卡按钮/押注）叠加其上。一镜到底相机：挂 Cam.apply 钩子 + 竖屏后撤 + 揭晓近景 overlay。
   v8（2026-09-16 优化轮，设计/评审档案 .pw/design-plan-3d-polish.md v3 + review-3d-polish-*.md）：
   · 全屏化修「裁剪」；loperf 翻转 → retire3D() 完整退役修「混合怪象」；dpr 动态封顶保帧预算
   · 头像脸盘出球面（修「头像没映射」真因：脸盘原陷在头球内被深度剔除）；cover 裁剪 + sRGB
   · 抽卡/出卡全程在桌面：走位→飞卡→远边枢轴翻面→题面 CanvasTexture 躺毡面；选卡双卡上桌 raycast
   · 揭晓近景机位（GL 独占 overlay，题干落屏 ≥16px）；名牌 offset 链修「贴错人」
   · 光有源（吊灯）+影落地（事件驱动阴影）+雾融地板；ACES+sRGB
   门禁：THREE 存在 + WebGL 可用才启用（body.three3d）；loperf → retire3D 全量还原 CSS 路径。 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;
  try {
    const t = document.createElement('canvas');
    if (!(t.getContext('webgl') || t.getContext('experimental-webgl'))) return;
  } catch (e) { return; }
  if (document.body.classList.contains('loperf')) return;   // 省电档维持 CSS 路径（boot 期判定）

  const IS_REDUCED = (typeof REDUCED !== 'undefined') && !!REDUCED;   // boot 快照，禁 live 监听（全文件同模式）
  let retired = false;

  // ── 画布：body 层全屏（#bg-canvas z0 之上、#app z1 之下），landforce 下 fixed 锚到被旋转的 body 盒=逻辑全屏 ──
  document.body.classList.add('three3d');
  const canvas = document.createElement('canvas');
  canvas.id = 'three-canvas';
  document.body.appendChild(canvas);

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { canvas.remove(); document.body.classList.remove('three3d'); return; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // 事件驱动：座次/阶段变化或走位中才重绘阴影（稳态零阴影 pass）

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a1a, 0.042);   // 远缘融进 CSS 星空（色=--bg，禁自选）
  const camera = new THREE.PerspectiveCamera(46, 2, 0.1, 120);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
  const V = new THREE.Vector3();
  const V2 = new THREE.Vector3();

  function size() {
    // 只量画布自身（fixed 全屏；禁 window.innerWidth——landforce 旋转下物理/逻辑互换必错）
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6, Math.sqrt(2.3e6 / Math.max(1, w * h)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  // ── 灯光：可见吊灯=唯一光源叙事；阴影平行光与吊灯自洽（影短投向右后、永不向镜头）；冷补光只作「我」的缘光 ──
  const hemi = new THREE.HemisphereLight(0x7078b8, 0x2a1840, 0.7); scene.add(hemi);
  const lamp = new THREE.PointLight(0xffd9a8, 1.25, 9); lamp.position.set(0, 2.58, 0); scene.add(lamp);
  const sun = new THREE.DirectionalLight(0xffedd0, 0.8);
  sun.position.set(-1.7, 6.0, 1.3); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4.5; sun.shadow.camera.right = 4.5;
  sun.shadow.camera.top = 4.5; sun.shadow.camera.bottom = -4.5;
  sun.shadow.camera.near = 2; sun.shadow.camera.far = 12;
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.24); fill.position.set(-4, 3, 6); scene.add(fill);
  function shadowDirty() { renderer.shadowMap.needsUpdate = true; }

  // ── 房间：大圆地板（雾融掉硬边）+ 桌下织物地毯圆 ──
  const MAT = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 48), MAT(0x110a24, 0.95));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), MAT(0x181030, 0.95));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.005; rug.receiveShadow = true; scene.add(rug);

  // ── 桌子：桌面 + 毡面（细噪纹理）+ 围边 + 单柱脚 ──
  const TABLE_R = 2.05, TABLE_H = 0.92, SEAT_R = TABLE_R + 0.66;
  const FELT_Y = TABLE_H + 0.05;
  const feltTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 128 + ((Math.random() * 20 - 10) | 0);
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      g.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    return t;
  })();
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x4c2a8f, roughness: 0.95, map: feltTex });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.26, TABLE_R + 0.26, 0.09, 44), MAT(0x2a1548, 0.6));
  top.position.y = TABLE_H; top.castShadow = true; top.receiveShadow = true;
  const felt = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R, 44), feltMat);
  felt.rotation.x = -Math.PI / 2; felt.position.y = FELT_Y; felt.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.1, 0.09, 10, 44), MAT(0x1c0e33, 0.5));
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_H; rim.castShadow = true;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, TABLE_H - 0.04, 18), MAT(0x1c0e33, 0.55));
  leg.position.y = (TABLE_H - 0.04) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 0.07, 24), MAT(0x150826, 0.6));
  foot.position.y = 0.035; foot.receiveShadow = true;
  table.add(top, felt, rim, leg, foot);
  scene.add(table);

  // ── 可见吊灯：吊线 + 灯罩（内壁自发光）+ 灯泡；点光挂罩内。罩摆 ±1.2°，光源位置恒定 ──
  const lampG = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 3.3, 6), MAT(0x0d0620, 0.9));
  cord.position.y = 4.42;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.30, 0.26, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1c0e33, roughness: 0.6, emissive: 0xffd9a8, emissiveIntensity: 0.9, side: THREE.DoubleSide })
  );
  shade.position.y = 2.62;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
  bulb.position.y = 2.55;
  lampG.add(cord, shade, bulb);
  scene.add(lampG);

  // ── 牌堆：挪位 (1.12, ·, 0.60) 给飞卡让出落点（评审 3.6 穿模修复）；牌背纹理与 DOM 牌背同语言 ──
  const DECK_POS = new THREE.Vector3(1.12, FELT_Y, 0.60);
  const backTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 512);
    gr.addColorStop(0, '#8b5cf6'); gr.addColorStop(1, '#f472b6');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 504);
    g.setLineDash([10, 8]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    g.strokeRect(14, 21, 228, 470);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = '700 92px "ZCOOL KuaiLe", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('♠', 128, 200); g.fillText('♥', 128, 330);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;   // NPOT 免疫 WebGL1 强制 resize
    return t;
  })();
  const deck = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.64), [
      MAT(0x7c3aed, 0.6), MAT(0x7c3aed, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: backTex }),
      MAT(0x7c3aed, 0.6), MAT(0x7c3aed, 0.6), MAT(0x7c3aed, 0.6),
    ]);
    slab.rotation.y = (Math.random() * 2 - 1) * 0.06;
    slab.position.set(0, 0.006 + i * 0.012, 0);
    slab.castShadow = true;
    slab.userData.base = { y: 0.006 + i * 0.012, rot: slab.rotation.y };   // 洗牌复位基准
    deck.add(slab);
  }
  deck.position.copy(DECK_POS);
  scene.add(deck);

  // ── 洗牌（2026-09-17 用户点名「洗牌动作不要少」）：CSS 层 .deck.shuffling 的 GL 等价——
  // 顶两张左右交叉互换+中层微位移+牌背亮度脉动，待抽的牌躺在牌堆顶跟着一起滑；drawing 边沿与免答重抽取牌时各跑一遍 ──
  const deckShuffle = { t0: 0, dur: 950, on: false };
  function startDeckShuffle(now) {
    if (IS_REDUCED) return 0;   // 降噪：静态退路（与 CSS REDUCED 的 animation:none 同哲学）
    deckShuffle.t0 = now; deckShuffle.on = true;
    return deckShuffle.dur;
  }
  function tickDeckShuffle(now) {
    if (!deckShuffle.on) return;
    const k = Math.min(1, (now - deckShuffle.t0) / deckShuffle.dur);
    const sl = deck.children, top = sl[4], second = sl[3];
    if (k >= 1) {   // 归位：两张的层位/随机转角互换（读作「牌序洗过了」），余牌回正
      deckShuffle.on = false;
      for (let i = 0; i < sl.length; i++) {
        const s = sl[i], b = s.userData.base;
        s.position.set(0, b.y, 0); s.rotation.y = b.rot;
        (Array.isArray(s.material) ? s.material : [s.material]).forEach(m => { if (m.emissive) m.emissive.setRGB(0, 0, 0); });
      }
      const by = top.userData.base.y; top.userData.base.y = second.userData.base.y; second.userData.base.y = by;
      const br = top.userData.base.rot; top.userData.base.rot = second.userData.base.rot; second.userData.base.rot = br;
      top.position.y = top.userData.base.y; second.position.y = second.userData.base.y;
      shadowDirty();
      return;
    }
    const sw = Math.sin(k * Math.PI * 2);   // 一来一回：顶两张左右交叉
    const hopT = Math.max(0, sw), hopS = Math.max(0, -sw);
    top.position.set(sw * 0.26, top.userData.base.y + hopT * 0.06, Math.sin(k * Math.PI * 2 + 0.6) * 0.05);
    top.rotation.y = top.userData.base.rot + sw * 0.5;
    second.position.set(-sw * 0.26, second.userData.base.y + hopS * 0.06, -Math.sin(k * Math.PI * 2 + 0.6) * 0.05);
    second.rotation.y = second.userData.base.rot - sw * 0.5;
    for (let i = 0; i < 3; i++) sl[i].position.x = Math.sin(k * Math.PI * 4 + i) * 0.018;   // 中层微位移
    const glow = 0.1 * Math.abs(Math.sin(k * Math.PI * 3));
    top.material[2].emissive.setRGB(glow, glow * 0.92, glow * 0.55);
    second.material[2].emissive.setRGB(glow, glow * 0.92, glow * 0.55);
    if (actionCard.visible) {   // 待抽的牌在堆顶跟着一起滑（洗的就是它）；位置摆幅经 RYm 折算（世界轴摆向与 deck 子牌一致），朝向由 dealRot 内含的 −φ 对齐堆面（终审 FIX-1）
      const wob = RYm(cardPlace.phi, sw * 0.26, Math.sin(k * Math.PI * 2 + 0.6) * 0.05);
      actionCard.position.set(cardPlace.deckL.x + wob.x, CARD_T / 2 + 0.06 + hopT * 0.06, cardPlace.deckL.z + wob.z);
      actionCard.rotation.y = (actionCard.userData.dealRot || 0) + sw * 0.5;
    }
    shadowDirty();
  }

  // ── 桌上卡系统：飞卡（deck→桌心北）→ 牌背脉动 → 远边枢轴翻面 → 题面躺毡面；选卡双卡平贴毡面 ──
  const CARD_W = 0.46, CARD_L = 0.64, CARD_T = 0.012;
  const REST = new THREE.Vector3(0, FELT_Y, -0.64);                               // 抽出的卡歇身处（桌心偏北）
  const PIVOT = new THREE.Vector3(0, FELT_Y + CARD_T / 2, REST.z - CARD_L / 2);   // 翻面枢轴=远边中点
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function cardTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  // 题面纹理：单实例复用，回合级重绘一次（评审豁免条款：禁逐帧、禁每回合新建、禁翻到一半才画）
  const qCanvas = document.createElement('canvas'); qCanvas.width = 512; qCanvas.height = 1024;
  const qTex = new THREE.CanvasTexture(qCanvas);
  qTex.encoding = THREE.sRGBEncoding; qTex.anisotropy = maxAniso;
  qTex.minFilter = THREE.LinearFilter; qTex.generateMipmaps = false;
  qTex.repeat.set(1, 680 / 1024); qTex.offset.set(0, 1 - 680 / 1024);   // 只采样上部内容区：卡面下段不再带空白黑带
  try { if (document.fonts && document.fonts.load) document.fonts.load('700 44px "ZCOOL KuaiLe"'); } catch (e) {}   // 提热，落时兜底 sans-serif
  function avCanvasOf(ch) {   // 已栅格化的 256px 头像 canvas（SVG/emoji 同源同修）
    const e = ch && texCache.get(ch.id);
    const img = e && e.tex && e.tex.image;
    return (img && img.width) ? img : null;
  }
  function drawQuestion(truth, name, text, avatarCanvas) {
    const g = qCanvas.getContext('2d');
    g.fillStyle = '#2d1a4a'; g.fillRect(0, 0, 512, 1024);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(10, 10, 492, 660);
    const label = truth ? '💬 真心话' : '🎯 大冒险';
    g.font = '700 30px "ZCOOL KuaiLe", sans-serif';
    const bw = g.measureText(label).width + 56;
    g.fillStyle = truth ? '#3b82f6' : '#f97316';
    rr(g, (512 - bw) / 2, 44, bw, 56, 28); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 256, 73);
    let by = 160;
    if (avatarCanvas) {   // 直接复用 syncPlayers 栅格化好的 256px 头像 canvas（SVG 同源同修）
      g.save(); g.beginPath(); g.arc(256, by, 28, 0, Math.PI * 2); g.clip();
      g.drawImage(avatarCanvas, 228, by - 28, 56, 56);
      g.restore();
      by += 64;
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '700 28px "ZCOOL KuaiLe", sans-serif';
    g.fillText('「' + (name || '???') + '」抽到的题', 256, by);
    let fs = 60;
    const wrap = (size) => {
      g.font = '700 ' + size + 'px "ZCOOL KuaiLe", sans-serif';
      const lines = []; let line = '';
      for (const chb of String(text || '')) {
        if (g.measureText(line + chb).width > 424) { lines.push(line); line = chb; if (lines.length > 5) return null; }
        else line += chb;
      }
      if (line) lines.push(line);
      return lines;
    };
    let lines = wrap(fs);
    while (lines === null && fs > 40) { fs -= 6; lines = wrap(fs); }
    g.fillStyle = '#fff';
    g.font = '700 ' + fs + 'px "ZCOOL KuaiLe", sans-serif';
    const lh = Math.round(fs * 1.42);
    const y0 = 400 - (Math.max(1, lines.length) - 1) * lh / 2;
    (lines || ['']).forEach((ln, i) => g.fillText(ln, 256, y0 + i * lh));
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.font = '700 24px "ZCOOL KuaiLe", sans-serif';
    g.fillText('— 真心话大冒险 —', 256, 620);
    qTex.needsUpdate = true;
  }
  const sideMat = MAT(0x7c3aed, 0.6);
  function cardMesh(w, l, mats) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, CARD_T, l), mats);
    m.castShadow = true;
    return m;
  }
  // 抽出的卡：枢轴组（远边）+ 卡体；+y 面=牌背，−y 面=题面（翻面后朝上）
  const flipG = new THREE.Group();
  flipG.rotation.order = 'YXZ';   // 偏航+翻转复合：先 Y（面向该回合玩家）后 X（绕已偏航的枢轴边翻面）；运行中绝不改 order（同角度会被重新解释）
  flipG.position.copy(PIVOT);
  const actionCard = cardMesh(CARD_W, CARD_L, [
    sideMat, sideMat,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: backTex }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, map: qTex, emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.85 }),   // 自发光：题面文字暗房间可读（婷婷硬5）
    sideMat, sideMat,
  ]);
  actionCard.position.set(0, 0, CARD_L / 2);
  actionCard.visible = false;   // 停选阶段不显示（待抽时它就是牌堆本体）
  flipG.add(actionCard);
  scene.add(flipG);
  // 选卡双卡：x=±0.78 平贴毡面（±0.62 的内缝与「我」躯干同宽会穿帮——评审 3.5）；枢轴=各自远边
  function choiceTexture(truth) {
    return cardTex(512, 1024, (g) => {
      g.fillStyle = truth ? '#1d4ed8' : '#c2410c';
      g.fillRect(0, 0, 512, 1024);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 10; g.strokeRect(16, 16, 480, 992);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '400 150px sans-serif';
      g.fillText(truth ? '💬' : '🎯', 256, 330);
      g.font = '700 116px "ZCOOL KuaiLe", sans-serif';
      g.fillText(truth ? '真心话' : '大冒险', 256, 590);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '700 34px "ZCOOL KuaiLe", sans-serif';
      g.fillText(truth ? '说实话的机会' : '接受小惩罚', 256, 700);
    });
  }
  function choiceCard(x, truth) {
    const g = new THREE.Group();
    g.position.set(x, FELT_Y + CARD_T / 2, -0.12 - 0.42);   // 枢轴在远边，卡体向近侧伸出
    const side = MAT(truth ? 0x1e40af : 0x9a3412, 0.6);
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: choiceTexture(truth), transparent: true });
    const mats = [side.clone(), side.clone(), faceMat, side.clone(), side.clone(), side.clone()];
    mats.forEach(mm => { mm.transparent = true; });   // 六面都透：压暗时侧缘同步（opacity 是 uniform，禁 needsUpdate）
    const m = cardMesh(0.60, 0.84, mats);
    m.position.set(0, 0, 0.42);
    g.add(m);
    scene.add(g);
    return { group: g, mesh: m, pick: 0, pickTarget: 0, hov: 0, press: 0, flash: 0 };
  }
  const cTruth = choiceCard(-0.78, true), cDare = choiceCard(0.78, false);
  const CARD_LOOK = new THREE.Vector3(0, FELT_Y + 0.05, REST.z - CARD_L);   // 翻面后卡心实际在 -1.28（远边枢轴北移一个卡长），取景对齐它
  const REVEAL_POS = new THREE.Vector3(CARD_LOOK.x - 0.9, CARD_LOOK.y + 2.08, CARD_LOOK.z + 1.14);   // 到卡 ≈2.5、仰角 56°；西侧出「我」巨头画外、抽卡人头肩留在框内同框（2026-09-18 起为 cardPlace 的 φ=0 初值/兜底，常态由 solvePlacement 随卡重算）

  // ── 题卡落点 = 该回合玩家面前（2026-09-18 用户点名「翻牌后的位置要到该回合的那个人面前」）──
  // 旧版写死桌心北：2p 局里牌正好躺在对面（非抽卡者）面前。现按 chooser 座位方向放牌：翻面前卡心
  // d̂·(R+0.64)（落在近抽卡者处，外缘 R+0.96 ≤1.98 < 毡缘 2.05），翻面后卡心 d̂·R，枢轴 = d̂·(R+0.32)
  // （翻面前卡的内缘），rotation.order='YXZ' 让 −π 翻转绕「已偏航的枢轴边」进行——卡向桌心翻、题面对
  // 抽卡者正读；近景机位 reveal = look + RY(φ)·(-0.9,2.08,+1.14)（φ=0 时与旧常量逐字节同构）。
  const cardPlace = { phi: 0, chooser: null, look: CARD_LOOK.clone(), reveal: REVEAL_POS.clone(),
    deckL: { x: DECK_POS.x - PIVOT.x, z: DECK_POS.z - PIVOT.z } };   // 初值=旧北位：任何未计算路径行为与历史一致
  function RYm(phi, x, z) { const c = Math.cos(phi), s = Math.sin(phi); return { x: x * c - z * s, z: x * s + z * c }; }   // 偏航 φ 的枢轴系：世界偏移→局部（=RY(−φ)；lx 里是减号，写反=牌堆顶悬幽灵位）
  function placeDirOf(pid) {   // 方向解析链：chars 座位（u.seat，绝不用 ch.position——drawing 期人正走向牌堆）→ layoutRing 角度（同步值）→ null=旧北位兜底
    const ch = chars.get(pid);
    if (ch) { const s2 = ch.userData.seat; if (s2 && s2.lengthSq() > 1e-6) { const l2 = Math.sqrt(s2.lengthSq()); return { x: s2.x / l2, z: s2.z / l2 }; } }   // 零向量守卫：normalize(0)=NaN 会把整卡连同阴影变没
    const a = (window.__seatAngleByPid || {})[pid];
    if (a != null) { const a3 = a - Math.PI; return { x: Math.sin(a3), z: Math.cos(a3) }; }
    return null;
  }
  const PLACE_OBST = [   // 圆近似障碍：牌堆 0.62（含洗牌横移 ±0.26 包络）/ 选卡双卡 0.55（drawing/revealed 期双卡仍在桌上，被选卡还保持抬升）
    { x: DECK_POS.x, z: DECK_POS.z, r: 0.62 },
    { x: -0.78, z: -0.12, r: 0.55 }, { x: 0.78, z: -0.12, r: 0.55 },
  ];
  function placeClear(cx, cz, phi2) {   // 翻面前后两个卡位都要避开障碍；翻面前卡的外缘（卡心+0.96）还要留在毡缘 2.05 之内（终审 FIX-2：守卫点必须是外缘而非卡心）
    const dx2 = Math.sin(phi2), dz2 = Math.cos(phi2);
    const ox2 = cx + dx2 * 0.96, oz2 = cz + dz2 * 0.96;   // 翻面前卡外缘点（毡面约束）
    const px2 = cx + dx2 * 0.64, pz2 = cz + dz2 * 0.64;   // 翻面前卡心（障碍约束；障碍半径已含卡半长包络）
    if (ox2 * ox2 + oz2 * oz2 > 2.05 * 2.05) return false;
    for (const o of PLACE_OBST) {
      if ((cx - o.x) * (cx - o.x) + (cz - o.z) * (cz - o.z) < o.r * o.r) return false;
      if ((px2 - o.x) * (px2 - o.x) + (pz2 - o.z) * (pz2 - o.z) < o.r * o.r) return false;
    }
    return true;
  }
  function solvePlacement(d) {   // 纯函数：给定座位方向求落点（不写任何状态）；placeDebug 探针访问器复用
    const basePhi = Math.atan2(d.x, d.z);
    const R0 = camera.aspect < 0.8 ? 0.92 : 1.02;   // 竖屏收一档：卡下缘离开前倾头顶带（挑刺 A#7）；外缘 0.92+0.96=1.88 < 2.05 仍成立
    const tang = { x: d.z, z: -d.x };   // 切向单位向量（侧移方向）
    let best = null, bestScore = -1;
    const score = (cx, cz, phi2) => {   // 全碰撞时的最小侵入解：最大「归一化障碍距离」，绝不跳回旧北位（=牌落对面面前，比斜 24° 更伤）
      let sc = 1e9;
      const dx2 = Math.sin(phi2), dz2 = Math.cos(phi2);
      const px2 = cx + dx2 * 0.64, pz2 = cz + dz2 * 0.64;
      for (const o of PLACE_OBST) sc = Math.min(sc, Math.hypot(cx - o.x, cz - o.z) / o.r, Math.hypot(px2 - o.x, pz2 - o.z) / o.r);
      if (sc > bestScore) { bestScore = sc; best = { cx, cz, phi: phi2 }; }
    };
    const tryR = (R2, shift, phi2) => {
      const cx = Math.sin(phi2) * R2 + tang.x * shift, cz = Math.cos(phi2) * R2 + tang.z * shift;
      if (placeClear(cx, cz, phi2)) return { cx, cz, phi: phi2 };
      score(cx, cz, phi2); return null;
    };
    let hit = null;
    for (const rc of [[R0, 0], [0.90, 0], [0.80, 0], [R0, 0.30], [R0, -0.30], [0.90, 0.30], [0.90, -0.30]]) {   // 径向优先→切向侧移：「在你面前偏一点」好过「转到斜前方」
      hit = tryR(rc[0], rc[1], basePhi); if (hit) break;
    }
    if (!hit) {   // 限角旋转殿后：上限随人数收紧（邻座间隔小，转多就读成别人的牌）
      const cap = Math.min(60, Math.max(24, 180 / Math.max(2, (S.players || []).length) - 8)) * Math.PI / 180;
      const steps = Math.ceil(cap / 0.12);
      outer: for (let k2 = 1; k2 <= steps; k2++) {
        for (const sg of [1, -1]) { hit = tryR(R0, 0, basePhi + sg * k2 * 0.12); if (hit) break outer; }
      }
    }
    if (!hit) hit = best;
    const px4 = hit.cx + Math.sin(hit.phi) * 0.32, pz4 = hit.cz + Math.cos(hit.phi) * 0.32;   // 枢轴 P = 翻面后卡心 + d̂·(L/2)
    hit.px = px4; hit.pz = pz4;
    hit.deckL = RYm(hit.phi, DECK_POS.x - px4, DECK_POS.z - pz4);
    return hit;
  }
  function ensurePlacement(pid) {   // 幂等：同 chooser 不重算（免答重抽/换一题落点稳定）；三时机调用=drawing 边沿 / 翻面入口 / reback 入口
    if (cardPlace.chooser === pid) return;
    cardPlace.chooser = pid;
    const d = placeDirOf(pid);
    if (!d) {   // 兜底=旧北位（chooser 身份都拿不到时保持历史行为，不猜错人）
      cardPlace.phi = 0; cardPlace.look.set(0, FELT_Y + 0.05, REST.z - CARD_L);
      cardPlace.reveal.copy(REVEAL_POS); cardPlace.deckL.x = DECK_POS.x - PIVOT.x; cardPlace.deckL.z = DECK_POS.z - PIVOT.z;
      flipG.position.copy(PIVOT); flipG.rotation.y = 0;
      return;
    }
    const hit = solvePlacement(d);
    cardPlace.phi = hit.phi;
    cardPlace.look.set(hit.cx, FELT_Y + 0.05, hit.cz);
    const rv = RYm(-hit.phi, -0.9, 1.14);   // 近景偏移转到世界系：RY(φ)·(-0.9, 2.08, +1.14) 的水平分量（锚 look 点，y 与旧值同构）
    cardPlace.reveal.set(cardPlace.look.x + rv.x, cardPlace.look.y + 2.08, cardPlace.look.z + rv.z);
    cardPlace.deckL = hit.deckL;   // solvePlacement 已按枢轴算好并随 hit 返回（placeDebug 同源，探针锁 RYm 旋向）
    flipG.position.set(hit.px, FELT_Y + CARD_T / 2, hit.pz);
    flipG.rotation.y = hit.phi;
  }

  // ── 选卡浮动文字提示 + 互动光效（2026-09-18 用户点名「选择模式在桌面上看不清：浮动文字提示、互动光效加强」）──
  // 三枚 Sprite 全程 billboard（reactBubble 同语言：fog/depthTest 关、renderOrder 6，不进 raycast 命中表）；
  // 透明度目标追踪、<0.012 钳 0 并 visible=false（不烧空 draw call）；文字纹理只在状态签名变化时重绘（回合级豁免，同 qSig）。
  // 光的静/动分线（挑刺 A#14）：呼吸脉动是「邀请」语义只给 iCanPick 客户端；旁观 0.10 恒静态纯指认。
  function labelTexture(truth) {
    const c = document.createElement('canvas'); c.width = 384; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,5,26,0.78)'; rr(g, 8, 8, 368, 144, 62); g.fill();
    g.strokeStyle = truth ? 'rgba(56,189,248,0.75)' : 'rgba(249,115,22,0.75)'; g.lineWidth = 5; rr(g, 8, 8, 368, 144, 62); g.stroke();
    const word = truth ? '真心话' : '大冒险', icon = truth ? '💬' : '🎯';
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.font = '400 74px sans-serif'; const iw = g.measureText(icon).width;
    g.font = '700 84px "ZCOOL KuaiLe", sans-serif'; const ww = g.measureText(word).width;
    const x0 = (384 - iw - 18 - ww) / 2;
    g.font = '400 74px sans-serif'; g.fillText(icon, x0, 86);
    g.font = '700 84px "ZCOOL KuaiLe", sans-serif'; g.fillText(word, x0 + iw + 18, 82);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  const hintCanvas = document.createElement('canvas'); hintCanvas.width = 704; hintCanvas.height = 112;
  const hintTex = new THREE.CanvasTexture(hintCanvas);
  hintTex.encoding = THREE.sRGBEncoding; hintTex.minFilter = THREE.LinearFilter; hintTex.generateMipmaps = false;
  const hintTip = { spr: null, kind: '', t0: 0 };
  function drawHint(kind, name) {
    const g = hintCanvas.getContext('2d');
    g.clearRect(0, 0, 704, 112);
    const me = kind === 'me';
    g.fillStyle = 'rgba(10,5,26,0.78)'; rr(g, 6, 6, 692, 100, 50); g.fill();
    g.strokeStyle = me ? 'rgba(103,232,249,0.8)' : 'rgba(255,255,255,0.4)'; g.lineWidth = 4; rr(g, 6, 6, 692, 100, 50); g.stroke();
    g.fillStyle = me ? '#67e8f9' : 'rgba(255,255,255,0.92)';
    g.font = '700 62px "ZCOOL KuaiLe", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(me ? '轮到你了 · 点一张' : '等待「' + name + '」选择…', 352, 58);
    hintTex.needsUpdate = true;
  }
  function makeTip(tex, w, h) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    spr.renderOrder = 6; spr.scale.set(w, h, 1); spr.visible = false;   // 材质默认 opacity=1：先 0+隐藏，防首个 choosing 帧闪满亮
    scene.add(spr); return spr;
  }
  function tipFade(spr, target, dt) {
    if (IS_REDUCED) { spr.material.opacity = target; spr.visible = target > 0; return; }
    if (target > 0 && !spr.visible) { spr.visible = true; spr.material.opacity = 0; }
    const o = spr.material.opacity + (target - spr.material.opacity) * (1 - Math.exp(-dt * 6));
    if (target === 0 && o < 0.012) { spr.material.opacity = 0; spr.visible = false; }
    else spr.material.opacity = o;
  }
  const glowTex = (() => {   // 卡下光池共用一张径向渐变白图，蓝/橙靠 material.color 染色
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 12, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  function makePool(color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; m.position.y = FELT_Y + 0.008;   // 涟漪 0.012 之下、毡面之上（16 位深度机型的 z-fight 余量）
    m.scale.set(1.5, 1.9, 1); m.visible = false;
    scene.add(m); return m;
  }
  cTruth.pool = makePool(0x38bdf8); cTruth.pool.position.set(-0.78, FELT_Y + 0.008, -0.12);   // 真心话青蓝：品牌蓝 0x3b82f6 在紫毡(色相258°)上被吞成「偏亮的紫」（挑刺 A#12）
  cDare.pool = makePool(0xf97316); cDare.pool.position.set(0.78, FELT_Y + 0.008, -0.12);
  cTruth.label = makeTip(labelTexture(true), 0.62, 0.26); cTruth.label.position.set(-0.78, FELT_Y + 0.80, -0.12);   // 抬到卡上沿空档，不盖卡面图标（挑刺 A#2）
  cDare.label = makeTip(labelTexture(false), 0.62, 0.26); cDare.label.position.set(0.78, FELT_Y + 0.80, -0.12);
  hintTip.spr = makeTip(hintTex, 1.42, 0.226);
  function tickChoiceFx(dt, sec, stage, canPickNow, hovName) {
    const choosing = stage === 'choosing';
    for (let i = 0; i < 2; i++) {
      const cc = i ? cDare : cTruth;
      const breathe = choosing && canPickNow && !IS_REDUCED ? 0.5 + 0.5 * Math.sin(sec * 3.4) : 0;   // 3.4Hz 与 turnRing 同拍
      const hovB = canPickNow && hovName === (i ? 'dare' : 'truth') ? 1.35 : 1;   // hover 增益只在能点时生效（⑫① 门禁同规）
      cc.pool.visible = choosing;
      cc.pool.material.opacity = choosing ? (canPickNow ? (0.34 + 0.16 * breathe) * hovB : 0.10) : 0;
      if (cc.flash <= 0) {   // 卡面自发光呼吸（uniform 直写；flash 白闪优先，不叠染色）
        const k = choosing ? (canPickNow ? 0.10 + 0.10 * breathe + 0.18 * cc.hov : 0.04) : 0;
        const tn = i ? [0.98, 0.45, 0.09] : [0.22, 0.74, 0.97];
        cc.mesh.material[2].emissive.setRGB(tn[0] * k, tn[1] * k, tn[2] * k);
      }
      tipFade(cc.label, choosing ? 1 : 0, dt);
    }
    let name = '', kind = '';
    if (choosing) {
      if (canPickNow) kind = 'me';   // 轮到我=持久指令（选卡者没有任何可操作提示是本轮的真痛点）
      else {
        kind = 'wait';
        try {
          const p2 = (S.players || []).find(p => p.id === S.turn.chooserId);
          name = (p2 && p2.name) || '??';
          if (name.length > 4) name = name.slice(0, 1) + '…';
        } catch (e) { name = '??'; }
      }
    }
    const sig = kind + '|' + name;
    if (sig !== hintTip.kind) {
      hintTip.kind = sig;
      if (kind) drawHint(kind, name);
      hintTip.t0 = performance.now();   // 旁观 4s 后淡出（挑刺 A#1 裁定）；轮到我无时限
    }
    tipFade(hintTip.spr, !choosing ? 0 : (kind === 'me' ? 1 : (performance.now() - hintTip.t0 < 4000 ? 1 : 0)), dt);
    if (hintTip.spr.visible) {   // 双卡近侧下方空带（桌面/竖屏同位，2026-09-18 实测定稿）：上方竖带被 turn-info 与词牌行带咬死塞不下（代码检查官 FIX-3），近侧毛毡带与两者天然解耦
      hintTip.spr.position.set(0, FELT_Y + 0.26, 1.28);
    }
  }

  // ── 3D 人物：凳 + 身体（chrHue 身份色）+ 头 + 头像脸盘（球面外，自亮不受光衰）──
  const chars = new Map();
  const texCache = new Map();
  // 摸牌走位参数：停点圈半径 = 桌缘外一站位（围边外缘 2.24 + 人体半径留量）；
  // 前倾上限 0.38rad 与该半径联算是「上身越台面高度带时仍在围边之外」的几何前提，别单边调
  const WALK_R = TABLE_R + 0.57, LEAN_MAX = 0.38;
  window.__three = { scene, camera, chars };   // 调试句柄（位置铁律：chars 声明之后；只许追加访问器）
  window.__three.tableCenterScreen = function () {   // 桌心上方 → 物理屏坐标（彩带炸点/探针用）
    if (retired || !document.getElementById('screen-game').classList.contains('active')) return null;
    V.set(0, TABLE_H + 0.35, 0).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (V.x + 1) / 2 * r.width + r.left, y: (1 - (V.y + 1) / 2) * r.height + r.top };
  };
  function chrColor(id, l) { const c = new THREE.Color(); try { c.setStyle('hsl(' + chrHue(id) + ', 66%, ' + l + '%)'); } catch (e) { c.set(0x8b5cf6); } return c; }
  function circleMask(g) {   // 圆角方章蒙版（squircle）：只削四角小弧，满幅头像几乎完整（drawQuestion 的圆裁剪不受影响）。
    g.globalCompositeOperation = 'destination-in';   // 旧圆形蒙版 + cover 裁中心会把头像四周整圈削掉（用户点名「头像被裁剪」真因）。
    g.beginPath();   // 四周留 5px 透明蚀刻边：脸贴片 r0.225 比头球 0.2 大，满幅不透明时侧座斜视角会在头轮廓外露出彩色月牙边
    if (g.roundRect) g.roundRect(5, 5, 246, 246, 76); else g.rect(5, 5, 246, 246);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  function avatarTexture(pid, uri) {
    let e = texCache.get(pid);
    if (e && e.uri === uri) return e.tex;
    const tex = new THREE.Texture();
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = maxAniso;
    if (!uri || !/^(data:|blob:|https?:)/i.test(uri)) {   // emoji 头像：直接画字，不发网络请求（img.src='🐵' 会被当成相对 URL 打到服务器上 404）
      const c0 = document.createElement('canvas'); c0.width = c0.height = 256;
      const g0 = c0.getContext('2d');
      g0.fillStyle = '#241235'; g0.fillRect(0, 0, 256, 256);
      g0.font = '170px sans-serif'; g0.textAlign = 'center'; g0.textBaseline = 'middle';
      g0.fillText(String(uri).slice(0, 4), 128, 132);
      circleMask(g0);
      tex.image = c0; tex.needsUpdate = true;
      e = { uri, tex }; texCache.set(pid, e);
      return e.tex;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#241235'; g.fillRect(0, 0, 256, 256);
      try {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) { g.drawImage(img, 0, 0, 256, 256); }   // SVG 无固有尺寸：整图拉伸（矢量无损）
        else { const s = Math.min(256 / iw, 256 / ih); g.drawImage(img, (256 - iw * s) / 2, (256 - ih * s) / 2, iw * s, ih * s); }   // contain：整张图入画，一张不裁
      } catch (err) { try { g.drawImage(img, 0, 0, 256, 256); } catch (e2) {} }
      circleMask(g);
      tex.image = c; tex.needsUpdate = true;
    };
    img.src = uri;
    e = { uri, tex }; texCache.set(pid, e);
    return e.tex;
  }
  function buildChar(p) {
    const g = new THREE.Group();
    const c1 = chrColor(p.id, 60), c2 = chrColor(p.id, 34);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 12), MAT(0x1c0e33, 0.6));
    stool.position.y = 0.44; stool.castShadow = true;
    // lean 组 = 髋部枢轴（y0.52）：摸牌前倾时上半身（躯干/胸/头/脸/发）整体探出，chest/head 不再留在原位脱节
    const lean = new THREE.Group();
    lean.position.y = 0.52;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.62, 14), MAT(c2, 0.75));
    torso.position.y = 0.30; torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.195, 0.16, 14), MAT(c1, 0.7));
    chest.position.y = 0.51; chest.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), MAT(0xe8b98c, 0.65));
    head.position.y = 0.81; head.castShadow = true;
    // 脸盘 = 头球同心球面贴片（r0.215，整体在头球 0.2 / 发壳 0.207 之外）：v8 的平贴片斜视角下
    // 视差错动半个头宽（用户实测「头像偏移/被裁剪」真因，z0.195→0.21 治不了）；曲面任何方位角都贴头。
    // 贴片矩形角对应头像画布四角（画布 squircle 蒙版见 circleMask）；r 曾 0.225，满幅蒙版下侧座
    // 斜视角会在头轮廓外露出彩色月牙边 → 收到 0.215 + 蒙版 5px 蚀刻边双保险（2026-09-17 走查 P1）
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 20, 14, Math.PI / 2 - 0.7, 1.4, Math.PI / 2 - 0.7, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xe8b98c, transparent: true, alphaTest: 0.5 })   // color=头球肤色：头像纹理未就绪/解析失败时读作裸脸，不是白片
    );
    face.position.set(0, 0.81, 0);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.207, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT(c1, 0.8));
    hair.position.y = 0.825;
    lean.add(torso, chest, head, face, hair);
    g.add(stool, lean);
    g.userData = { pid: p.id, torso, chest, head, face, hair, lean, phase: Math.random() * 6.28, voice: 0, go: 0, cheer: 0, waveT: 0, seat: new THREE.Vector3(), baseRotY: 0,
      moveFrom: new THREE.Vector3(), rotFrom: 0, moveT0: 0, scaleT0: 0, pending: null, seatInit: false };   // 换座滑移状态（syncPlayers 记账、帧循环消费，墙钟 0.7s）
    scene.add(g);
    return g;
  }
  function syncPlayers(now) {
    if (typeof S === 'undefined' || !S || !S.players || !document.getElementById('screen-game').classList.contains('active')) return;
    const seen = new Set();
    let changed = false;
    for (const p of S.players) {
      seen.add(p.id);
      let ch = chars.get(p.id);
      if (!ch) { ch = buildChar(p); chars.set(p.id, ch); changed = true; }
      const u = ch.userData;
      const aCss = (window.__seatAngleByPid || {})[p.id];
      if (aCss != null) {
        const a3 = aCss - Math.PI;
        const sx = Math.sin(a3) * SEAT_R, sz = Math.cos(a3) * SEAT_R;
        const ry = Math.atan2(-sx, -sz);
        // 只写基座数据；transform 由帧循环独占合成（走位/回座不被节询拽回）。
        // 换座平滑（2026-09-18 站位全环重排）：REDUCED 直接落位（信息无损）；首见=从座位外沿走入，
        // 但出生点水平距 base 相机 (0,·,5.4) <2.6 时改「原地放大入场」（0.42→1，DOM chr-in 同语言，
        // 免 13-16 人局近侧座巨物贴脸）；走位中（u.go，每回合 drawing/revealed 全程 ≈1）与揭晓近景
        // （revealK/revealTarget，情绪峰值画面）只记账 pending 不挪人，帧循环在安全帧消费；ε 门防
        // 600ms 节询同值重置在飞的 0.7s 滑移（否则链式加入永不收敛）。
        if (IS_REDUCED) {
          u.seatInit = true;
          u.seat.set(sx, 0, sz); u.baseRotY = ry;
        } else if (!u.seatInit) {
          u.seatInit = true;
          u.seat.set(sx, 0, sz); u.baseRotY = ry;
          const px = sx * (1 + 1.15 / SEAT_R), pz = sz * (1 + 1.15 / SEAT_R);
          if (Math.hypot(px, pz - 5.4) < 2.6) {
            ch.position.set(sx, 0, sz);
            u.scaleT0 = now;
          } else {
            ch.position.set(px, 0, pz);
            u.moveFrom.set(px, 0, pz); u.rotFrom = ry; u.moveT0 = now;
          }
        } else if (Math.abs(sx - u.seat.x) > 1e-4 || Math.abs(sz - u.seat.z) > 1e-4 || Math.abs(ry - u.baseRotY) > 1e-4) {
          if (u.go > 0.001 || revealK > 0.05 || revealTarget > 0) u.pending = { x: sx, z: sz, ry };
          else {
            u.moveFrom.copy(ch.position); u.rotFrom = ch.rotation.y; u.moveT0 = now;
            u.seat.set(sx, 0, sz); u.baseRotY = ry;
          }
        }
      }
      const uri = resolveAvatar(p.avatar);
      if (uri) {
        const tex = avatarTexture(p.id, uri);
        if (u.face.material.map !== tex) { u.face.material.map = tex; u.face.material.color.set(0xffffff); u.face.material.needsUpdate = true; }   // color 必须归白：material.color 会与 map 相乘，留着肤色兜底=全桌 3D 脸染土棕
      }
    }
    for (const [pid, ch] of chars) if (!seen.has(pid)) { scene.remove(ch); chars.delete(pid); changed = true; }
    if (changed) shadowDirty();
  }

  // ── 进行中提示：当前玩家（chooserId/轮次持麦人）脚下的呼吸光环——房间尺度里「这轮是谁」的第一眼信号 ──
  // additive+fog:false 保持亮色；depthWrite:false 不进深度写（名牌投影/拾取不受影响）；follows 走位每帧贴角色
  const turnRing = (() => {
    const grp = new THREE.Group();
    const mk = (rIn, rOut, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
      return m;
    };
    const inner = mk(0.42, 0.5, 0.8), outer = mk(0.56, 0.578, 0.38);
    grp.add(inner, outer);
    grp.visible = false; grp.position.y = 0.015;
    scene.add(grp);
    return { grp, inner };
  })();

  // ── 说话声波（连麦可视，2026-09-17 用户点名「开启说话的声波在3d里要有效果」）──
  // 与 DOM 头像环同一套语言（#4ade80 绿 / 1.1s 外扩淡出 / 0.55s 交错双环）：绿光身体+点头+脚下外扩波环；
  // three3d 下 DOM 头像环 visibility:hidden，原名牌只剩名字变绿——这里补上世界尺度的「谁在说话」
  const voicePool = [];
  const voiceWaveGeo = new THREE.RingGeometry(0.44, 0.485, 36);
  function voiceWave(pid, level) {
    let r = null;
    for (const o of voicePool) { if (!o.active) { r = o; break; } }
    if (!r) {
      if (voicePool.length >= 10) return;
      r = { mesh: new THREE.Mesh(voiceWaveGeo, new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), active: false, t0: 0, pid: null, level: 0 };
      r.mesh.rotation.x = -Math.PI / 2; r.mesh.renderOrder = 3; r.mesh.visible = false;
      voicePool.push(r); scene.add(r.mesh);
    }
    r.active = true; r.t0 = performance.now(); r.pid = pid; r.level = level;
    const ch = chars.get(pid);
    if (ch) r.mesh.position.set(ch.position.x, 0.02, ch.position.z);
    r.mesh.visible = true;
  }
  function tickVoiceWaves(now) {
    for (const r of voicePool) {
      if (!r.active) continue;
      const k = (now - r.t0) / 1100;   // DOM wave-out 同款 1.1s
      if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const s = 1 + k * 0.85;
      r.mesh.scale.set(s, s, 1);
      const ch = chars.get(r.pid);
      if (ch) r.mesh.position.set(ch.position.x, 0.02, ch.position.z);   // 跟随走位
      r.mesh.material.opacity = 0.65 * (1 - k) * (0.35 + 0.65 * (r.level || 0.5));
    }
  }

  // ── 钩子：paintVoice（音量 → 摆动幅度）、Cam.apply（相机）——retire 时还原 ──
  let _pv = null, _ap = null;
  try {
    _pv = paintVoice;
    paintVoice = function (pid, level, speaking) {
      _pv(pid, level, speaking);
      const ch = chars.get(pid);
      if (ch) ch.userData.voice = speaking ? Math.min(1, level * 1.8) : 0;
    };
    _ap = Cam.apply.bind(Cam);
    Cam.apply = function () { _ap(); syncCam(); };
  } catch (e) {}

  // ── 相机：Cam.cur 映射 + 竖屏后撤（aspect<0.8）+ 揭晓近景 overlay（GL 独占通道，CSS 机位不动）──
  let revealK = 0, revealTarget = 0;
  function syncCam() {
    const c = Cam.cur;
    const asp = camera.aspect || 1;
    const pt = asp < 0.8 ? Math.min(1, (0.8 - asp) / 0.34) : 0;
    let px = c.x * 0.02;
    let py = 3.75 + (c.rx - 19) * 0.03 + pt * 0.5;
    let pz = 5.4 + (-56 - c.z) * 0.035 + pt * 1.3;
    let lx = c.x * 0.006, ly = 0.35 - pt * 0.5, lz = 0;   // 俯角随竖屏系数加深：灯罩顶出 HUD（pt 在桌面恒 0 不影响既有构图）
    if (revealK > 0.0005) {   // 推近到卡面 ≈2.3 单位：同一位姿喂给名牌投影/拾取，禁缓存（look/reveal 随 placement 走=近景怼着「该回合玩家面前」的题卡拍）
      const rk = revealK * revealK * (3 - 2 * revealK);   // smoothstep：起收零速
      px += (cardPlace.reveal.x - px) * rk;
      py += (cardPlace.reveal.y - py) * rk;
      pz += (cardPlace.reveal.z - pz) * rk;
      lx += (cardPlace.look.x - lx) * rk;
      ly += (cardPlace.look.y - ly) * rk;
      lz += (cardPlace.look.z - lz) * rk;
    }
    camera.position.set(px, py, pz);
    camera.lookAt(lx, ly, lz);
    camera.rotateY(-(c.ry || 0) * Math.PI / 180);
    camera.rotateZ(-(c.rz || 0) * Math.PI / 180);
  }

  // ── 名牌投影：头顶世界坐标 → 画布像素 − offsetLeft/Top 链（禁 rect 差值，landforce 旋转下必错）──
  function offsetChain(el) { let x = 0, y = 0; while (el) { x += el.offsetLeft || 0; y += el.offsetTop || 0; el = el.offsetParent; } return [x, y]; }
  function updatePlates() {
    const grid = document.getElementById('game-players-grid');
    if (!grid) return;
    const og = offsetChain(grid);
    grid.querySelectorAll('.player-card').forEach(card => {
      const ch = chars.get(card.dataset.pid);
      if (!ch) return;
      if (!ch.visible) { card.style.visibility = 'hidden'; return; }   // 近景让镜被隐藏的角色，名牌一起收（否则浮空名牌）
      // 视空间深度先判：相机背后的点投影会镜像翻转，绝不写样式（绝对定位会把文档撑出上万 px 滚动区）
      V.set(ch.position.x, 1.72, ch.position.z);
      const vz = V2.set(ch.position.x, 1.72, ch.position.z).applyMatrix4(camera.matrixWorldInverse).z;   // V2 复用，8 人局不逐帧分配
      if (vz > -0.05) { card.style.visibility = 'hidden'; return; }
      V.project(camera);   // 渲染相机现算（揭晓推镜名牌不脱头）
      const cw = canvas.clientWidth, chh = canvas.clientHeight;
      const wantX = (V.x + 1) / 2 * cw, wantY = (1 - (V.y + 1) / 2) * chh;   // 视口目标点（头顶）
      if (wantX < -180 || wantX > cw + 60 || wantY < -80 || wantY > chh - 20) { card.style.visibility = 'hidden'; return; }   // 出屏不写
      card.style.visibility = '';
      card.style.left = (wantX - og[0]).toFixed(1) + 'px';   // 直写投影（v7 同构）：实测即贴头；wantX/wantY 已是全屏画布视口坐标
      card.style.top = (wantY - og[1]).toFixed(1) + 'px';
      card.style.zIndex = String(600 - Math.round(V.z * 300));
      const rsV = parseFloat(card.style.getPropertyValue('--rs')) || 1;
      const mw = (72 / rsV).toFixed(0) + 'px';   // 基数 72：留取整与文字折行余量（渲染宽恒 ≥72 ≥64）
      if (card.style.minWidth !== mw) {
        card.style.minWidth = mw;   // 缩放补偿：渲染宽恒 ≥64px（远座可辨识契约）
        const wrapEl = card.__wrapEl || (card.__wrapEl = card.querySelector('.avatar-wrap'));
        if (wrapEl) wrapEl.style.minWidth = mw;   // verify 量的是 wrap：只补 card 时 wrap 贴内容宽（远座 65px 贴 64 线，±1px 抖动即挂）
      }
    });
  }

  // ── DOM 桥：three3d 下把动作按钮 reparent 到 body 层 #stage-actions（记录原位，三时机归还）──
  const stageActions = document.createElement('div');
  stageActions.id = 'stage-actions';
  stageActions.style.display = 'none';
  document.body.appendChild(stageActions);
  const movedEls = [];
  let toolsMoved = null;   // .world 每帧写 transform → fixed 的包含块变成它；工具行钉底必须挂 body 层
  (function bridgeTools() {
    const t = document.getElementById('game-tools');
    if (!t) return;
    toolsMoved = { el: t, parent: t.parentElement, next: t.nextSibling, origDisplay: t.style.display || 'flex' };   // 记住 HTML 原始 inline display，retire 时归还（frame 可能写过 'none'）
    document.body.appendChild(t);
  })();
  // ── 窄屏工具收纳：🧰 浮标 + 玻璃面板（<768px 才有浮标；桌面工具行常驻照旧）──
  const mqToolsNarrow = window.matchMedia('(max-width: 767px)');
  let toolsOpen = !mqToolsNarrow.matches;   // 桌面常开；窄屏默认收起（不挡桌面）
  const toolsFab = document.createElement('button');
  toolsFab.id = 'tools-fab';
  toolsFab.type = 'button';
  toolsFab.textContent = '🧰';
  toolsFab.title = '游戏工具';
  toolsFab.setAttribute('aria-label', '游戏工具');
  toolsFab.setAttribute('aria-expanded', String(toolsOpen));
  toolsFab.style.display = 'none';
  document.body.appendChild(toolsFab);
  toolsFab.addEventListener('click', () => {
    toolsOpen = !toolsOpen;
    toolsFab.setAttribute('aria-expanded', String(toolsOpen));
  });
  // 面板点这些按钮即收起：扔蛋要瞄准桌面、战况/设置会开弹层、随机点名的反馈在桌上
  if (toolsMoved) toolsMoved.el.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && (b.id === 'btn-egg' || b.id === 'btn-stats' || b.id === 'btn-settings-game' || b.id === 'btn-pick-next')) {
      toolsOpen = false;
      toolsFab.setAttribute('aria-expanded', 'false');
    }
  });
  // 点面板外收起（capture：不怕谁 stopPropagation）；FAB 自己与面板内除外
  document.addEventListener('pointerdown', e => {
    if (retired || !toolsOpen || !mqToolsNarrow.matches) return;
    const t = e.target;
    if (!t || !(t.nodeType === 1)) return;
    if (toolsMoved && toolsMoved.el.contains(t)) return;
    if (t === toolsFab || toolsFab.contains(t)) return;
    toolsOpen = false;
    toolsFab.setAttribute('aria-expanded', 'false');
  }, true);
  // 押注面板同理上收 body：留在 #screen-game 里做 absolute 只能锚到内容盒（屏盒高度随内容），
  // 贴不到视口底；hidden 属性照常由 renderBetBox 管理，retire 时归还
  let betMoved = null;
  (function bridgeBet() {
    const b = document.getElementById('bet-box');
    if (!b) return;
    betMoved = { el: b, parent: b.parentElement, next: b.nextSibling };
    document.body.appendChild(b);
  })();
  function bridgeMove(el) {
    if (!el || !el.parentElement || el.parentElement === stageActions) return;
    movedEls.push({ el, parent: el.parentElement, next: el.nextSibling });
    stageActions.appendChild(el);
    stageActions.style.display = '';
  }
  function bridgeSync() {
    const g = document.getElementById('screen-game');
    if (g && g.classList.contains('leaving')) { bridgeRestore(); return; }   // 退场同步归还（评审 ③）
    const cs = document.getElementById('card-section');
    const sr = document.getElementById('stake-row');
    let stageNow = '';
    try { stageNow = S.turn.stage; } catch (e) {}
    const csOut = !!(cs && !cs.hidden && stageNow === 'revealed');   // dealFlyingCard 会提前取消 hidden：完成啦组只在 revealed 上桌
    const srOut = !!(sr && !sr.hidden && stageNow === 'choosing');   // 押注只属于选卡期，别一路挂到揭晓
    if (csOut) { bridgeMove(document.getElementById('card-actions')); bridgeMove(document.getElementById('btn-reroll')); }
    if (srOut) bridgeMove(sr);
    if (!csOut && !srOut) bridgeRestore();
  }
  function bridgeRestore() {
    if (!movedEls.length) { stageActions.style.display = 'none'; return; }
    for (let i = movedEls.length - 1; i >= 0; i--) {
      const m = movedEls[i];
      try { m.parent.insertBefore(m.el, m.next); } catch (e) {}
    }
    movedEls.length = 0;
    stageActions.style.display = 'none';
  }

  // ── 桌上选卡点击：document 级 raycast 转发（画布保持 pointer-events:none 红线不破）──
  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();
  let rayLatch = false;
  const REJECT_SEL = 'button,a,input,textarea,select,label,.choice-card,.player-card,#game-tools,#stage-actions,#bet-box,.modal-mask,.react-bar,.toast';
  function pickChoiceCard(cx, cy) {   // 屏幕 → NDC → 双卡命中；'truth' | 'dare' | null（三个 raycast 入口共用同一换算，landforce 换算禁分叉）
    const pk = (typeof landPick === 'function') ? landPick(cx, cy) : { x: cx, y: cy };
    mouseNdc.x = (pk.x / canvas.clientWidth) * 2 - 1;      // 画布固定全屏：逻辑尺寸直除（禁 rect 物理盒混 landPick 逻辑坐标，landforce 下必错）
    mouseNdc.y = -(pk.y / canvas.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, camera);
    const hit = raycaster.intersectObjects([cTruth.mesh, cDare.mesh], false)[0];
    return hit ? (hit.object === cTruth.mesh ? 'truth' : 'dare') : null;
  }
  // ── 桌面涟漪：点击反馈的 GL 版 tap-ring（单几何复用池，0.55s 自清；additive 在毡面上读作光斑）──
  const ripplePool = [];
  function feltRipple(x, z, color) {
    if (IS_REDUCED) return;
    let r = null;
    for (const o of ripplePool) { if (!o.active) { r = o; break; } }
    if (!r) {
      if (ripplePool.length >= 4) return;
      r = { mesh: new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.215, 36),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      ), active: false, t0: 0 };
      r.mesh.rotation.x = -Math.PI / 2; r.mesh.renderOrder = 3;
      ripplePool.push(r); scene.add(r.mesh);
    }
    r.mesh.material.color.set(color);
    r.mesh.position.set(x, FELT_Y + 0.012, z);
    r.active = true; r.t0 = performance.now(); r.mesh.visible = true;
  }

  // ── 表情包气泡（2026-09-17 用户点名「右上角的特效改为3d小人的表情包显示」）：互动表情挂到发送者小人头顶 ──
  // spawnReact 的 DOM 表情雨只服务大厅/loperf 回退；牌桌 3D 且发送者在场 ⇒ 这里返回 true，DOM 雨不再重复出
  const bubbles = [];
  const bubbleTex = new Map();
  function emojiTexture(e) {
    let t = bubbleTex.get(e);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(e), 64, 70);
    t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    bubbleTex.set(e, t);
    return t;
  }
  window.__three.reactBubble = function (pid, e) {
    if (retired) return false;
    const ch = chars.get(pid);
    if (!ch || !document.getElementById('screen-game').classList.contains('active')) return false;
    if (bubbles.length >= 8) { const old = bubbles.shift(); scene.remove(old.spr); old.spr.material.dispose(); }
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e), transparent: true, depthWrite: false, depthTest: false, fog: false }));
    spr.renderOrder = 6;
    spr.position.set(ch.position.x, 1.66, ch.position.z);
    spr.scale.set(0.001, 0.001, 1);
    scene.add(spr);
    bubbles.push({ spr, t0: performance.now(), pid });
    ch.userData.cheer = 1;   // 小人为表情开心蹦一下（帧循环衰减）
    return true;
  };

  // ── 🥚 飞蛋（2026-09-17 用户点名）：投掷者小人抛向目标；被砸端飞向本机镜头、前半程隐形临头才显形，糊屏由 DOM .egg-splat 承接 ──
  const eggs3d = [];
  const eggGeo = new THREE.SphereGeometry(0.085, 12, 10);
  eggGeo.scale(1, 1.28, 1);

  // ── 🥚 蛋碎表现（2026-09-17 用户反馈：旁观视角蛋砸到 3D 人脸上就消失、要优化碎裂）──
  // 命中 = 脸上糊一滩蛋液（billboard 挂人物组随走位、缓慢下淌、数秒后淡去）+ 蛋壳/蛋黄碎粒迸溅（重力弹地）+ 既有毡面白涟漪；
  // 被砸端本机镜头的糊屏仍由 DOM .egg-splat 承接（命中瞬间另加 Cam.shake）
  const eggSplatTex = (() => {
    let t = null;
    return function () {
      if (t) return t;
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const blob = (cx, cy, R, ph) => {   // 不规则蛋清团（半径按 3 瓣正弦扰动）
        g.beginPath();
        for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; const r = R * (0.78 + 0.24 * Math.sin(3 * a + ph)); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.82; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.closePath(); g.fill();
      };
      g.fillStyle = 'rgba(255,255,255,0.97)';
      blob(128, 104, 72, 0.6); blob(84, 132, 42, 2.1); blob(172, 130, 46, 4.4); blob(126, 150, 50, 1.3);
      g.fillStyle = 'rgba(255,255,255,0.85)';   // 下挂蛋液（读作往下流）
      g.fillRect(96, 150, 14, 66); g.fillRect(140, 146, 12, 84); g.fillRect(118, 160, 10, 46);
      const yolk = g.createRadialGradient(116, 96, 5, 128, 106, 33);
      yolk.addColorStop(0, '#fff3b0'); yolk.addColorStop(0.55, '#fbbf24'); yolk.addColorStop(1, '#f59e0b');
      g.fillStyle = yolk; g.beginPath(); g.ellipse(128, 106, 33, 29, 0.25, 0, Math.PI * 2); g.fill();
      t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      return t;
    };
  })();
  const faceSplats = [];
  function eggFaceSplat(pid) {
    const ch = chars.get(pid);
    if (!ch) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: eggSplatTex(), transparent: true, depthWrite: false, depthTest: false, fog: false }));
    spr.position.set(0, 1.3, 0);   // 头心（billboard 朝镜头；挂人物组=走位/点头都带着）
    spr.scale.set(0.001, 0.001, 1); spr.renderOrder = 5;
    ch.add(spr);
    faceSplats.push({ spr, t0: performance.now() });
    if (faceSplats.length > 6) { const old = faceSplats.shift(); if (old.spr.parent) old.spr.parent.remove(old.spr); old.spr.material.dispose(); }
  }
  function tickFaceSplats(now) {
    for (let i = faceSplats.length - 1; i >= 0; i--) {
      const s = faceSplats[i];
      const t = (now - s.t0) / 4500;
      if (t >= 1) { if (s.spr.parent) s.spr.parent.remove(s.spr); s.spr.material.dispose(); faceSplats.splice(i, 1); continue; }
      const pop = t < 0.08 ? (t / 0.08) * 1.18 : (t < 0.2 ? 1.18 - (t - 0.08) * 1.5 : 1);   // 砸上超冲→回落
      s.spr.scale.set(pop * 0.62, pop * 0.62, 1);
      s.spr.position.y = 1.3 - t * 0.14;   // 蛋液缓缓下淌
      s.spr.material.rotation = Math.sin(t * 9) * 0.05;
      s.spr.material.opacity = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
    }
  }
  const shellPool = [];
  const shellGeo = new THREE.SphereGeometry(0.03, 6, 5);
  function shellBurst(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      let p = null;
      for (const o of shellPool) { if (!o.active) { p = o; break; } }
      if (!p) {
        if (shellPool.length >= 26) break;
        p = { mesh: new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 1, fog: false })), active: false, vel: new THREE.Vector3(), spin: 0, t0: 0 };
        shellPool.push(p); scene.add(p.mesh);
      }
      p.active = true; p.t0 = performance.now(); p.mesh.visible = true; p.mesh.material.opacity = 1;
      const roll = Math.random();
      p.mesh.material.color.set(roll < 0.2 ? 0xfbbf24 : (roll < 0.6 ? 0xfff6e8 : 0xfffdf0));   // 少量蛋黄色混在壳屑里
      p.mesh.position.set(x + (Math.random() - 0.5) * 0.07, y + (Math.random() - 0.5) * 0.07, z + (Math.random() - 0.5) * 0.07);
      const a = Math.random() * Math.PI * 2;
      p.vel.set(Math.cos(a) * (0.45 + Math.random() * 0.95), 0.85 + Math.random() * 1.35, Math.sin(a) * (0.45 + Math.random() * 0.95));
      p.spin = (Math.random() - 0.5) * 14;
      const s = 0.65 + Math.random() * 0.95;
      p.mesh.scale.set(s, s * 0.62, s);
    }
  }
  function tickShells(dt, now) {
    for (const p of shellPool) {
      if (!p.active) continue;
      const t = (now - p.t0) / 950;
      if (t >= 1) { p.active = false; p.mesh.visible = false; continue; }
      p.vel.y -= 4.2 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.03 && p.vel.y < 0) { p.mesh.position.y = 0.03; p.vel.y *= -0.3; p.vel.x *= 0.62; p.vel.z *= 0.62; }   // 落毡面小弹跳
      p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.7 * dt;
      p.mesh.material.opacity = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    }
  }
  window.__three.eggFx = function (fromPid, toPid, isMe) {
    if (retired || !document.getElementById('screen-game').classList.contains('active')) return false;
    const fc = chars.get(fromPid);
    const from = fc ? new THREE.Vector3(fc.position.x, 1.15, fc.position.z) : new THREE.Vector3(DECK_POS.x, 1.0, DECK_POS.z);
    let to;
    if (isMe) to = camera.position.clone();   // 砸「我」=冲着本机镜头来
    else {
      const tc = chars.get(toPid);
      if (!tc) return false;   // 目标不在场且不是我：没得演（DOM 端同样不糊屏）
      to = new THREE.Vector3(tc.position.x, 1.02, tc.position.z);
    }
    const m = new THREE.Mesh(eggGeo, new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.45, transparent: true, opacity: isMe ? 0 : 1 }));
    scene.add(m);
    eggs3d.push({ m, from, to, t0: performance.now(), isMe, toPid });
    return true;
  };
  function tickFx(now) {   // 气泡/飞蛋逐帧推进（帧循环调用；池上限防刷屏）
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const k = (now - b.t0) / 1900;
      if (k >= 1) { scene.remove(b.spr); b.spr.material.dispose(); bubbles.splice(i, 1); continue; }
      const ch = chars.get(b.pid);
      if (ch) b.spr.position.set(ch.position.x, 1.66 + (IS_REDUCED ? 0 : k * 0.5), ch.position.z);   // 跟随走位+上浮
      const pop = k < 0.15 ? k / 0.15 : (k < 0.3 ? 1.2 - (k - 0.15) * 1.34 : 1);   // 弹出超冲→回落
      b.spr.scale.set(pop * 0.52, pop * 0.52, 1);
      b.spr.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    }
    for (let i = eggs3d.length - 1; i >= 0; i--) {
      const e = eggs3d[i];
      const k = Math.min(1, (now - e.t0) / 1150);
      const lift = Math.sin(Math.PI * k) * 0.9 + k * k * 0.35;
      e.m.position.set(e.from.x + (e.to.x - e.from.x) * k, e.from.y + (e.to.y - e.from.y) * k + lift, e.from.z + (e.to.z - e.from.z) * k);
      e.m.rotation.x += 0.16; e.m.rotation.z += 0.11;
      if (e.isMe) {   // 0~45% 全透明（「看不见」），45~75% 临头显形，一路放大顶到镜头
        e.m.material.opacity = Math.max(0, Math.min(1, (k - 0.45) / 0.3));
        const s = 0.7 + k * 1.6;
        e.m.scale.set(s, s, s);
      }
      if (k >= 1) {
        if (!e.isMe) {   // 旁观视角：蛋在小人身上砸碎——脸上糊蛋液+壳屑迸溅+毡面溅圈（此前只是蛋消失+涟漪=「砸到脸上就没」）
          eggFaceSplat(e.toPid);
          shellBurst(e.to.x, e.to.y, e.to.z, 12);
          feltRipple(e.to.x, e.to.z, 0xfff3e0);
        }
        scene.remove(e.m); e.m.material.dispose(); eggs3d.splice(i, 1);
      }
    }
  }
  // ── 悬停/按压态：hover=近侧探头 invitation、press=按下回弹；只在 choosing 生效（选中抬升优先，不叠）──
  // 互动语义只给「轮到我」的客户端：choose() 的回合校验在此前置，观众点卡不再有可点暗示/抬升/闩锁
  function iCanPick() {
    try {
      if (!joined || !S || S.turn.stage !== 'choosing') return false;
      if (S.mode === 'free') return !(S.turn.chooserId && S.turn.chooserId !== myId);   // 自由对决：麦没被抢谁都能点
      return S.turn.chooserId === myId;
    } catch (e) { return false; }
  }
  const ptr = { x: 0, y: 0, has: false };
  let hoverName = null, pressCard = null;
  document.addEventListener('pointermove', function (e) {
    if (retired) return;
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true;
  }, { passive: true });
  function onTableScreen() { const g = document.getElementById('screen-game'); return !!(g && g.classList.contains('active')); }   // 大厅默认 stage='choosing'：raycast 必须钉在牌桌屏上，否则大厅点击会误响/误 toast
  document.addEventListener('pointerdown', function (e) {
    if (retired || e.detail > 1 || !onTableScreen()) return;
    if (document.body.classList.contains('egg-aim')) return;   // 🥚 瞄准态：毡面/选卡 raycast 全部让位，误触不得烧掉回合
    if (e.target && e.target.closest && e.target.closest(REJECT_SEL)) return;
    let stg = ''; try { stg = S.turn.stage; } catch (err) { return; }
    if (!actionCard.visible && stg !== 'choosing') return;
    const pk = (typeof landPick === 'function') ? landPick(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
    mouseNdc.x = (pk.x / canvas.clientWidth) * 2 - 1;
    mouseNdc.y = -(pk.y / canvas.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, camera);
    const objs = stg === 'choosing' ? [cTruth.mesh, cDare.mesh] : [actionCard];
    const h0 = raycaster.intersectObjects(objs, false)[0];
    if (!h0) return;
    if (stg === 'choosing') {
      if (rayLatch || !iCanPick()) return;
      try { SFX.play('tap'); } catch (err) {}
      pressCard = h0.object === cTruth.mesh ? cTruth : cDare;   // 按压视觉由 tickChoice 衰减写出
    } else if (h0.object === actionCard) {
      try { SFX.play('tap'); } catch (err) {}
      feltRipple(h0.point.x, h0.point.z, 0xc4b5fd);   // 题面/牌背摸一下：纯触感反馈，无动作语义
    }
  }, { passive: true });
  function pressClear() { pressCard = null; }
  document.addEventListener('pointerup', pressClear, { passive: true });
  document.addEventListener('pointercancel', pressClear, { passive: true });
  window.__three.feelState = function () {   // 调试访问器（追加访问器约定）：悬停/按压/涟漪态，探针用
    return {
      hover: hoverName,
      press: pressCard === cTruth ? 'truth' : (pressCard === cDare ? 'dare' : null),
      ripples: ripplePool.filter(r => r.active).length,
    };
  };
  window.__three.fxState = function () {   // 调试访问器（追加访问器约定）：表情气泡/飞蛋/声波环/蛋碎/洗牌/出卡阶段，探针用
    return { bubbles: bubbles.length, eggs: eggs3d.length, cardPhase: st.phase, leanMax: LEAN_MAX,
      voiceWaves: voicePool.filter(r => r.active).length,
      shells: shellPool.filter(p => p.active).length, faceSplats: faceSplats.length, shuffling: deckShuffle.on,
      cardPos: { x: +actionCard.position.x.toFixed(2), z: +actionCard.position.z.toFixed(2) },   // 本地系：rest 恒 (0, ·, CARD_L/2)；被劫持/待抽时停在 |deckL|（旧值 1.12，placement 偏航后带符号）
      cardWorld: (function () { V.copy(actionCard.position); flipG.localToWorld(V); return { x: +V.x.toFixed(2), z: +V.z.toFixed(2) }; })(),   // 世界系：飞卡起点应 ≈DECK_POS（旁观端 φ≠0 的 deckL 旋向回归锁）
      revealK: +revealK.toFixed(2),   // 近景推进度（🥚 瞄准拉远回归锁用）
      place: { phi: +cardPlace.phi.toFixed(2), cx: +cardPlace.look.x.toFixed(2), cz: +cardPlace.look.z.toFixed(2) },   // 翻面后卡心（世界）：断言 ≈ chooser 座位方向 · R
      choiceFx: { hint: +hintTip.spr.material.opacity.toFixed(2), hintKind: hintTip.kind.split('|')[0], hintAge: +((performance.now() - hintTip.t0) / 1000).toFixed(1),
        labelT: +cTruth.label.material.opacity.toFixed(2), labelD: +cDare.label.material.opacity.toFixed(2),
        poolT: +cTruth.pool.material.opacity.toFixed(2), poolD: +cDare.pool.material.opacity.toFixed(2) } };
  };
  window.__three.placeDebug = function (dx, dz) {   // 调试访问器（追加访问器约定）：纯函数落点求解，探针测避障/锁 RYm 旋向不污染现场
    const h = solvePlacement({ x: dx, z: dz });
    return { phi: +h.phi.toFixed(3), cx: +h.cx.toFixed(2), cz: +h.cz.toFixed(2), px: +h.px.toFixed(2), pz: +h.pz.toFixed(2),
      deckL: { x: +h.deckL.x.toFixed(3), z: +h.deckL.z.toFixed(3) } };
  };
  window.__three.choiceTipRects = function () {   // 调试访问器：三枚提示 Sprite 的屏上包围盒（探针做遮挡断言；SVG 纹理同款投影换算）
    if (retired || !document.getElementById('screen-game').classList.contains('active')) return null;
    const r = canvas.getBoundingClientRect();
    const rectOf = (spr) => {
      V.set(spr.position.x, spr.position.y, spr.position.z);
      V2.copy(spr.position).applyMatrix4(camera.matrixWorldInverse);
      if (V2.z > -0.05) return null;
      V.project(camera);
      const ppu = r.height / (2 * (-V2.z) * Math.tan(camera.fov * Math.PI / 360));   // 方形像素：世界单位→像素
      const cx = (V.x + 1) / 2 * r.width, cy = (1 - (V.y + 1) / 2) * r.height;
      return { x: cx - spr.scale.x * ppu / 2, y: cy - spr.scale.y * ppu / 2, w: spr.scale.x * ppu, h: spr.scale.y * ppu };
    };
    return { hint: rectOf(hintTip.spr), truth: rectOf(cTruth.label), dare: rectOf(cDare.label) };
  };
  document.addEventListener('click', function (e) {
    const dbg = window.__rayDbg = { t: Date.now(), target: e.target && e.target.closest ? (e.target.id || e.target.className || e.target.tagName) : '?', detail: e.detail };   // 静默必须落日志（项目红线）
    if (retired || e.detail > 1 || !onTableScreen()) { dbg.stop = 'retired/multi/offtable'; return; }   // 双击缩放第二击不吞；非牌桌屏不 raycast
    const rejEl = e.target && e.target.closest && e.target.closest(REJECT_SEL);
    if (rejEl) { dbg.stop = 'rejected:' + (typeof rejEl.className === 'string' ? rejEl.className.split(' ')[0] : rejEl.tagName); return; }
    if (document.body.classList.contains('egg-aim')) {   // 🥚 瞄准态：点 3D 小人本体也能扔（任何阶段；近景/走位时名牌缩小或隐藏，只认名牌会「点人没反应」——用户实测反馈）
      dbg.stop = 'egg-aim';
      const pk = (typeof landPick === 'function') ? landPick(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
      mouseNdc.x = (pk.x / canvas.clientWidth) * 2 - 1;
      mouseNdc.y = -(pk.y / canvas.clientHeight) * 2 + 1;
      raycaster.setFromCamera(mouseNdc, camera);
      const groups = [];
      for (const [, ch] of chars) { if (ch.visible) groups.push(ch); }
      const eHits = raycaster.intersectObjects(groups, true);
      dbg.eggHits = eHits.length;
      const hit = eHits[0];
      if (!hit) return;
      let o = hit.object;
      while (o && !(o.userData && o.userData.pid)) o = o.parent;
      if (!o) { dbg.eggNoPid = true; return; }
      dbg.eggPid = o.userData.pid;
      try { SFX.play('tap'); } catch (err) {}
      feltRipple(hit.point.x, hit.point.z, 0xfbbf24);
      try { throwEgg(o.userData.pid); } catch (err) { dbg.eggErr = err.message; }
      return;
    }
    let stage = '';
    try { stage = S.turn.stage; } catch (err) { dbg.stop = 'no-S'; return; }
    dbg.stage = stage; dbg.latch = rayLatch;
    if (stage !== 'choosing' || rayLatch || !iCanPick()) { dbg.stop = 'stage/latch/turn'; return; }   // 阶段闩锁 + 回合门禁：一次选卡只认首击，非我回合不消费任何状态
    rayLatch = true;
    const picked = pickChoiceCard(e.clientX, e.clientY);
    dbg.hit = picked || 'miss';
    if (picked) {
      const truth = picked === 'truth';
      const cc = truth ? cTruth : cDare;
      cTruth.pickTarget = truth ? 1 : -1;
      cDare.pickTarget = truth ? -1 : 1;
      cc.flash = 1;   // 牌面白闪（tickChoice 衰减）
      feltRipple(cc.group.position.x, cc.group.position.z + 0.42, truth ? 0x3b82f6 : 0xf97316);   // 选中卡的毡面炸一圈
      try { choose(truth ? 'truth' : 'dare'); } catch (err) { dbg.chooseErr = err.message; }
    } else {
      rayLatch = false;   // 落空不闩：还能再点
    }
  });

  // ── 主循环 ──
  const t0 = performance.now();
  let wasActive = false, lastFrame = t0;
  const st = { phase: 'park', t0: 0, flyAt: 0 };   // park | waitfly | fly | pulse | flip | shown
  let qDrawn = false;
  const easeIO = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  function frame(t) {
    if (retired) return;   // 先查再排队：retire 后 rAF 不空转（代码终审 P2-2）
    requestAnimationFrame(frame);
    if (document.body.classList.contains('loperf')) { retire3D(); return; }   // 最顶检测：任何屏翻转都不漏
    const active = document.getElementById('screen-game').classList.contains('active');
    if (active && !wasActive) size();
    if (!active && wasActive) renderer.clear();   // 出牌桌清一次残帧，别垫在 lobby/result 底下
    wasActive = active;
    if (toolsMoved) {   // 已移出 .screen：非 active 屏时隐藏（必须先于早退，否则卡在 lobby 挡按钮）
      if (active && !wasActive && mqToolsNarrow.matches) toolsOpen = false;   // 重进牌桌：窄屏默认收起
      toolsMoved.el.style.display = active && (!mqToolsNarrow.matches || toolsOpen) ? 'flex' : 'none';
      toolsFab.style.display = active && mqToolsNarrow.matches ? 'flex' : 'none';
    }
    if (!active && (movedEls.length || stageActions.style.display !== 'none')) bridgeRestore();   // 退场归还必须在早退前（否则死按钮条浮在大厅/结算上拦点击——代码终审 P0-2）
    if (!active && betMoved && !betMoved.el.hidden) betMoved.el.hidden = true;   // 押注面板随屏隐藏（body 层不再吃 #screen-game 的 hidden 语境）
    if (active && betMoved && !betMoved.el.hidden) {   // 贴工具行上缘：折行行数随视口/字宽变，预测量时序不可靠 → 可见时帧内实测（仅变化才写）
      const tr = toolsMoved ? toolsMoved.el.getBoundingClientRect() : null;
      const bp = tr && tr.top > 0 ? Math.max(60, Math.round(window.innerHeight - tr.top + 10)) + 'px'
                                  : 'calc(env(safe-area-inset-bottom, 0px) + 68px)';   // 窄屏面板收起时量不到行：锚到 🧰 浮标上方
      if (betMoved.el.style.bottom !== bp) betMoved.el.style.bottom = bp;
      // 🎲 主持人旁观：押注浮窗与 #stage-actions 里的换一题同区叠放——#bet-box 会盖死换一题钮（走查实测 cov=#bet-box、rr=0）→ 让位到押注浮窗上方
      const rrEl = document.getElementById('btn-reroll');
      if (rrEl && !rrEl.hidden && rrEl.parentElement === stageActions) {
        const br = betMoved.el.getBoundingClientRect();
        const want = Math.max(60, Math.round(window.innerHeight - br.top + 10)) + 'px';
        if (stageActions.style.bottom !== want) stageActions.style.bottom = want;
      } else if (stageActions.style.bottom) stageActions.style.bottom = '';   // 押注收起/换题归位：还原默认锚点
    } else if (stageActions.style.bottom) stageActions.style.bottom = '';
    if (!active) {
      if (frame.cursor) { frame.cursor = ''; document.body.style.cursor = ''; }   // 出牌桌归还光标（悬停代码在早退之后，不补这条会顶着「手型」回大厅）
      return;
    }
    if (document.body.classList.contains('paused')) return;
    const now = performance.now();
    const dt = Math.min(0.2, (now - lastFrame) / 1000); lastFrame = now;   // 0.2：软渲 5fps 内推镜/走位仍按墙钟走（真机 ≥20fps 不触及）
    const sec = (t - t0) / 1000;

    if (t - (frame.lastSync || 0) > 600) {
      frame.lastSync = t;
      try { syncPlayers(now); } catch (e) { window.__syncErr = e.message; }
    }   // 名单/头像/座位节询（只写数据不写 transform）

    // 阶段与边沿
    let stage = '', goId = null;
    try {
      stage = S.turn.stage;
      const onStage = S.gameStarted && !S.finished && (stage === 'drawing' || stage === 'revealed');
      goId = onStage ? (S.turn.chooserId || activePlayerId()) : null;
    } catch (e) {}
    const inRound = stage === 'drawing' || stage === 'revealed';
    if (stage === 'drawing' && (st.phase === 'park' || st.phase === 'shown' || st.phase === 'flip' || st.phase === 'reback' || st.phase === 'refly')) {
      try { ensurePlacement(S.turn.chooserId || activePlayerId()); } catch (e) {}   // 落点先于一切卡位写入（含 REDUCED）：flipG.position/rotation.y 与 deckL 同帧就位
      st.phase = IS_REDUCED ? 'pulse' : 'waitfly';   // 降噪：牌直接出现在桌上（CSS 路径同哲学）
      st.flyAt = now + (IS_REDUCED ? 600 : 1050); st.t0 = now; qDrawn = false;   // 非降噪多留 450ms 给洗牌（fly 总 时点不变：原为 pulse 空窗）
      flipG.rotation.x = 0; actionCard.visible = true;
      if (IS_REDUCED) {
        actionCard.position.set(0, 0, CARD_L / 2); actionCard.rotation.y = 0;
      } else {   // 待抽的牌先躺上牌堆顶参与洗牌（旧版出现在桌心北、飞卡起点又瞬移回牌堆=隐性跳变，顺手修掉）
        actionCard.position.set(cardPlace.deckL.x, CARD_T / 2 + 0.06, cardPlace.deckL.z);
        actionCard.rotation.y = (Math.random() * 2 - 1) * 0.1 - cardPlace.phi;   // −φ 补偿 flipG 偏航：牌背世界朝向与牌堆子牌一致（dealRot 带着它，洗牌段不必再减）
        actionCard.userData.dealRot = actionCard.rotation.y;
        startDeckShuffle(now);
      }
      resetChoiceCards();
      shadowDirty();
    } else if (!inRound && st.phase !== 'park') {
      st.phase = 'park'; revealTarget = 0; rayLatch = false;
      cardPlace.chooser = null;   // 强制下回合重算落点（中途入座重排后跟随新座向）
      resetChoiceCards();
      actionCard.visible = false;   // 停选阶段不显示（牌堆本体就是「待抽」语言）
      flipG.rotation.x = 0; actionCard.scale.set(1, 1, 1);
      shadowDirty();
    }
    if (st.phase === 'waitfly' && now >= st.flyAt) { st.phase = 'fly'; st.t0 = now; }
    if (st.phase === 'fly') {   // 900ms：单正弦弧（顶 +0.5 单位）+ 飞行旋卡 ≤180°；落定 80ms 微弹由 pulse 起始承接
      const k = Math.min(1, Math.max(0, (now - st.t0) / 900));   // 免答重抽时 t0 含 950ms 洗牌窗，k 钳 0
      const sx = cardPlace.deckL.x, sz = cardPlace.deckL.z;                // deckLocal（枢轴本体系，placement 偏航已折算）
      const ex = 0, ez = CARD_L / 2;                                       // restLocal（枢轴系）
      actionCard.position.set(sx + (ex - sx) * k, CARD_T / 2 + 0.06 * (1 - k) + Math.sin(Math.PI * k) * 0.5, sz + (ez - sz) * k);
      actionCard.rotation.y = Math.sin(Math.PI * k) * 2.6 - cardPlace.phi * (1 - k);   // 起飞帧 −φ（对齐牌堆朝向）平滑过渡到 0（落定后世界 yaw=φ，题面对抽卡者正读）
      if (k >= 1) { st.phase = 'pulse'; st.t0 = now; actionCard.position.set(0, 0, CARD_L / 2); actionCard.rotation.y = 0; shadowDirty(); }
    }
    if (st.phase === 'pulse') {
      if (IS_REDUCED) { actionCard.scale.set(1, 1, 1); }
      else {
        const b = Math.max(0, 1 - (now - st.t0) / 80);   // 落弹
        const pl = 1 + 0.015 * Math.sin(sec * 3.9) + 0.02 * b;   // 抽取中呼吸脉动（治 1.1s 死气）
        actionCard.scale.set(pl, 1, pl);
      }
    }
    let flippedNow = false;
    try { flippedNow = document.getElementById('flip-card').classList.contains('flipped'); } catch (e) {}
    if (stage === 'revealed' && flippedNow && st.phase !== 'flip' && st.phase !== 'shown' && st.phase !== 'reback' && st.phase !== 'refly' && st.phase !== 'fly' && st.phase !== 'waitfly') {   // fly/waitfly 也排除：免答重抽交棒 fly 的下一帧 flippedNow 仍为 true（DOM .flipped 未摘），不排会把飞行中的卡当场劫持成原地翻面（代码终审 P0）
      try { ensurePlacement(S.turn.chooserId || activePlayerId()); } catch (e) {}   // revealed 期刷新从未经过 drawing 边沿：翻面入口兜底算落点（REDUCED 同享）
      if (!qDrawn) {   // 翻面前一次性画题面（回合级豁免逐帧红线）
        qDrawn = true;
        try {
          const t2 = S.turn;
          const ch = (S.players || []).find(p => p.id === t2.chooserId);
          drawQuestion(t2.choice !== 'dare', ch && ch.name, t2.punishment, avCanvasOf(ch));
        } catch (e) { try { drawQuestion(true, '', '真心话大冒险', ''); } catch (e2) {} }
      }
      st.phase = IS_REDUCED ? 'shown' : 'flip'; st.t0 = now;
      actionCard.visible = true;
      frame.qSig = (S.turn.punishment || '') + '#' + (S.turn.choice || '') + '#' + (S.turn.chooserId || '');
      if (IS_REDUCED) { flipG.rotation.x = -Math.PI; revealK = revealTarget = 1; }
      else revealTarget = document.body.classList.contains('egg-aim') ? 0 : 1;   // 🥚 瞄准中翻牌不推近（瞄准态全员要可见可点）
      shadowDirty();
    }
    if (st.phase === 'flip') {   // 650ms 三段：立起→拍下→回弹（远边枢轴 −180°，翻给全桌看）
      const k = Math.min(1, (now - st.t0) / 650);
      const th = k < 0.55 ? easeIO(k / 0.55) * 0.53 : 0.53 + easeIO(Math.min(1, (k - 0.55) / 0.37)) * 0.47;
      flipG.rotation.x = -Math.PI * th;
      if (k >= 1) { st.phase = 'shown'; flipG.rotation.x = -Math.PI; }
    }
    if (st.phase === 'reback') {   // 免答牌/换一题重抽①：题面翻回背面（用户点名「免牌时刷新牌要重新抽牌」）
      const k = Math.min(1, (now - st.t0) / 300);
      flipG.rotation.x = -Math.PI * (1 - easeIO(k));
      if (k >= 1) { st.phase = 'refly'; st.t0 = now; }
    }
    if (st.phase === 'refly') {   // 重抽②：牌收回牌堆顶（倒放飞卡弧线），洗一遍牌后无缝交给既有飞卡段重新发出
      const k = Math.min(1, (now - st.t0) / 420);
      const sx = cardPlace.deckL.x, sz = cardPlace.deckL.z;
      actionCard.position.set(sx * k, CARD_T / 2 + 0.06 * k + Math.sin(Math.PI * k) * 0.35, CARD_L / 2 + (sz - CARD_L / 2) * k);
      actionCard.rotation.y = Math.sin(Math.PI * k) * 2.2 - cardPlace.phi * k;   // 离开 shown 姿态（本地 0）→ 落回堆顶（本地 −φ，世界对齐牌堆），与 fly 起点连续
      if (k >= 1) { st.phase = 'fly'; st.t0 = now + startDeckShuffle(now); shadowDirty(); }
    }
    if (st.phase === 'shown') actionCard.scale.set(1, 1, 1);   // 题面躺定
    if (stage === 'revealed' && st.phase === 'shown') {   // 免答牌/换一题：题面签名边沿（逻辑终审 P0-1：否则玩家对旧题打完整轮）
      const sig = (S.turn.punishment || '') + '#' + (S.turn.choice || '') + '#' + (S.turn.chooserId || '');
      if (sig !== (frame.qSig || '')) {
        frame.qSig = sig;
        if (IS_REDUCED) {   // 降噪：题面瞬换（原行为）
          try {
            const ch = (S.players || []).find(p => p.id === S.turn.chooserId);
            drawQuestion(S.turn.choice !== 'dare', ch && ch.name, S.turn.punishment, avCanvasOf(ch));
          } catch (e) {}
        } else {   // 正常路径：收牌重抽——翻回背面→收回牌堆→重新飞出→重新翻面（翻面入口 qDrawn=false 会拿新题重画）
          try { ensurePlacement(S.turn.chooserId || activePlayerId()); } catch (e) {}   // revealed 期换人（host 转移/强跳）：落点与近景跟新 chooser，别把新人的题翻在旧人面前
          qDrawn = false;
          st.phase = 'reback'; st.t0 = now;
        }
      }
    }
    if (st.phase === 'shown' && inRound) revealTarget = document.body.classList.contains('egg-aim') ? 0 : 1;   // 🥚 瞄准态暂时拉远：近景机位随卡到抽卡者一侧后全员贴脸/出画没得点人（⑮「任何阶段可扔」），收瞄准镜头滑回近景
    const rStep = dt / (revealTarget > revealK ? 0.9 : 0.7);   // 墙钟定长推镜：慢帧率设备节奏不漂
    revealK += Math.sign(revealTarget - revealK) * Math.min(Math.abs(revealTarget - revealK), rStep);
    if (IS_REDUCED) revealK = revealTarget;

    syncCam();   // P0：近景/竖屏位姿逐帧现算——syncCam 不能只靠 Cam.apply 钩子，revealed 期无运镜时它永不被调（代码终审 P0-1）
    lampG.position.y = revealK * 3.2;   // 近景推进时吊灯过顶出画（滑移与推镜同一墙钟曲线）

    // 悬停/按压/涟漪：choosing 且轮到我且未闩锁才给「可点」语义；光标只随命中态切换（禁每帧无条件写样式）
    let hovName = null;
    if (stage === 'choosing' && !rayLatch && ptr.has && iCanPick()) hovName = pickChoiceCard(ptr.x, ptr.y);
    hoverName = hovName;
    const cur = hovName ? 'pointer' : '';
    if (frame.cursor !== cur) { frame.cursor = cur; document.body.style.cursor = cur; }
    for (const r of ripplePool) {
      if (!r.active) continue;
      const k = (now - r.t0) / 550;
      if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const es = 1 - (1 - k) * (1 - k);
      const s = 0.5 + es * 2.4;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.9 * (1 - k);
    }
    tickFx(now);   // 表情气泡 + 🥚 飞蛋/碎粒/脸贴蛋液
    tickVoiceWaves(now);   // 说话声波外扩环
    tickFaceSplats(now); tickShells(dt, now);   // 蛋碎：脸上蛋液下淌 + 壳屑弹地
    tickDeckShuffle(now);   // 🃏 牌堆洗牌（drawing 边沿/免答重抽各跑一遍）
    tickChoice(cTruth, dt, hovName === 'truth', pressCard === cTruth);
    tickChoice(cDare, dt, hovName === 'dare', pressCard === cDare);
    tickChoiceFx(dt, sec, stage, stage === 'choosing' && iCanPick(), hovName);   // 浮动提示 + 卡下光池/自发光呼吸（邀请语义只在能点时脉动）

    // 人物：呼吸/摇摆/走位合成（transform 只由这里写）
    let walking = false;
    for (const [pid, ch] of chars) {
      const u = ch.userData;
      if (!IS_REDUCED) {
        u.torso.scale.y = 1 + 0.03 * Math.sin(sec * 2.2 + u.phase);
        u.torso.rotation.z = Math.sin(sec * 3.1 + u.phase) * 0.05 * (0.25 + u.voice);
        u.hair.position.y = 0.825 + 0.01 * Math.sin(sec * 2.2 + u.phase);
      }
      // 说话声波可视：绿光身+点头+头组随音量微缩+脚下外扩波环（voice 由 paintVoice 钩子按 RMS 实时喂）
      const talk = u.voice;
      const glow = talk > 0.01 ? 0.045 + 0.15 * talk : 0;
      u.torso.material.emissive.setRGB(0, glow, glow * 0.28);
      u.chest.material.emissive.setRGB(0, glow * 1.1, glow * 0.3);
      const hs = 1 + 0.1 * talk;
      u.head.scale.set(hs, hs, hs); u.face.scale.set(hs, hs, hs); u.hair.scale.set(hs, hs, hs);
      u.head.rotation.x = !IS_REDUCED ? Math.sin(sec * 6.4 + u.phase) * 0.11 * talk : 0;
      if (!IS_REDUCED && talk > 0.06) {
        u.waveT += dt;
        if (u.waveT >= 0.55) { u.waveT = 0; voiceWave(pid, talk); }   // 0.55s 交错 → 恒 2 环在场，与 DOM w1/w2 同节奏
      } else u.waveT = 0;
      // 走位等「入场/换座滑移/放大入场」放完再出发（终审 P1：drawing 期刷新时首见走入账刚记下、
      // 同帧 isGo 就把人从 r3.86 钉到座位=单帧瞬移 1.15u）。走位是纯视觉，晚 ≤0.7s 无时序影响
      // （牌的飞行/洗牌时钟全由 st.phase 驱动）；REDUCED 下 moveT0/scaleT0 恒 0，门自动失效。
      const isGo = pid === goId && !(u.moveT0 && now - u.moveT0 < 700) && !(u.scaleT0 && now - u.scaleT0 < 500);
      const tgt = isGo ? 1 : 0;
      u.go += (tgt - u.go) * (1 - Math.exp(-dt * (isGo ? 2.6 : 3.2)));
      if (IS_REDUCED) u.go = tgt;
      if (Math.abs(u.go - tgt) > 0.01) walking = true;
      if (u.go > 0.001) {
        // 走位：座位 → 座位与牌堆连线上、桌缘圈（WALK_R）的停点——绝不上桌。
        // 旧版走全程 55% 终点 r≈1.67 深陷桌面内，躯干/胸直接插穿台面=「摸牌穿模」。
        // 停点方程 |seat+u·s|=WALK_R 的正根（牌堆本体在圈内 ⇒ 根必在射程内）；
        // 到位后髋部枢轴整体前倾 LEAN_MAX 探向牌堆——倾角与停点半径联算过：上身越过
        // 台面高度带（0.875~0.965）时水平位置仍在围边外缘（r2.24）之外，几何上无接触。
        const dx = DECK_POS.x - u.seat.x, dz = DECK_POS.z - u.seat.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        const ux = dx / dist, uz = dz / dist;
        const bq = u.seat.x * ux + u.seat.z * uz;
        const disc = bq * bq - (u.seat.x * u.seat.x + u.seat.z * u.seat.z - WALK_R * WALK_R);
        let s = dist;
        if (disc > 0) { const r1 = -bq - Math.sqrt(disc); if (r1 > 0.01 && r1 < s) s = r1; }
        const tx = u.seat.x + ux * s, tz = u.seat.z + uz * s;
        ch.position.set(u.seat.x + (tx - u.seat.x) * u.go, 0, u.seat.z + (tz - u.seat.z) * u.go);
        const face = Math.atan2(DECK_POS.x - tx, DECK_POS.z - tz);
        let d = face - u.baseRotY;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ch.rotation.y = u.baseRotY + d * u.go;
        u.lean.rotation.x = LEAN_MAX * u.go;   // 正角=上身探向本地 +Z（面向牌堆）；曾写成负角把人旋成后仰（用户点名「弯腰方向错了」）——数值 0.38 与 WALK_R 的联算不变
      } else {
        // 换座消费点：走位/揭晓期记账的 pending 在回到安全帧的此刻落地——moveFrom 恒取当下实际位置
        // （走位停点/滑移中途都一样），从它向新座位启 0.7s 墙钟 smoothstep 滑移（重排不瞬移）。
        // 消费侧同样要过揭晓门（终审 P2：与 syncPlayers 写侧对称，否则揭晓中途记账当帧就被消费）。
        // 只写 x/z：y 归下方 cheer 蹦跳独占。滑移期间置 walking 让事件驱动阴影跟随。
        if (u.pending && revealK <= 0.05 && revealTarget === 0) {
          u.moveFrom.copy(ch.position); u.rotFrom = ch.rotation.y; u.moveT0 = now;
          u.seat.set(u.pending.x, 0, u.pending.z); u.baseRotY = u.pending.ry;
          u.pending = null;
        }
        const mk = u.moveT0 ? (now - u.moveT0) / 700 : 1;
        if (mk >= 1 || IS_REDUCED) {
          u.moveT0 = 0;
          ch.position.x = u.seat.x; ch.position.z = u.seat.z;
          ch.rotation.y = u.baseRotY;
        } else {
          const k = mk * mk * (3 - 2 * mk);
          ch.position.x = u.moveFrom.x + (u.seat.x - u.moveFrom.x) * k;
          ch.position.z = u.moveFrom.z + (u.seat.z - u.moveFrom.z) * k;
          let d = u.baseRotY - u.rotFrom;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          ch.rotation.y = u.rotFrom + d * k;
          walking = true;
        }
        if (u.scaleT0) {   // 原地放大入场（近侧座出生点离相机太近的替代语言，0.42→1 与 DOM chr-in 同款）
          const sk = (now - u.scaleT0) / 500;
          if (sk >= 1) { u.scaleT0 = 0; ch.scale.set(1, 1, 1); }
          else { const sc = 0.42 + 0.58 * sk; ch.scale.set(sc, sc, sc); }
        }
        u.lean.rotation.x = 0;
      }
      if (u.cheer > 0) {   // 表情气泡触发的小蹦跳（1.1s 衰减；REDUCED 不跳，只留气泡）
        u.cheer = Math.max(0, u.cheer - dt / 1.1);
        if (!IS_REDUCED) ch.position.y = Math.abs(Math.sin(sec * 11 + u.phase)) * 0.075 * u.cheer;
      } else if (ch.position.y !== 0) ch.position.y = 0;
    }
    if (walking) shadowDirty();

    // 揭晓近景：贴脸角色让镜——REVEAL 机位就落在座位弧旁，相邻角色只剩半个头占画幅（用户实测「头像被裁剪」）。
    // 水平距相机 <2.05 单位的角色在推镜后段隐藏（此时他本已大半出画，弹现不显）；回座即还原
    let culled = false;
    if (revealK > 0.55) {
      const ccx = camera.position.x, ccz = camera.position.z;
      for (const [, ch] of chars) {
        const dx = ch.position.x - ccx, dz = ch.position.z - ccz;
        const want = dx * dx + dz * dz >= 4.2;
        if (ch.visible !== want) { ch.visible = want; culled = true; }
      }
    } else {
      for (const [, ch] of chars) { if (!ch.visible) { ch.visible = true; culled = true; } }
    }
    if (culled) shadowDirty();

    // 进行中光环：选卡/抽卡/揭晓全程跟随「正在进行的人」（含走到牌堆旁的位移）
    let ringPid = null;
    try {
      if (S.gameStarted && !S.finished && (stage === 'choosing' || stage === 'drawing' || stage === 'revealed'))
        ringPid = S.turn.chooserId || activePlayerId();
    } catch (e) {}
    const ringCh = ringPid ? chars.get(ringPid) : null;
    if (ringCh && ringCh.visible) {   // 让镜被剔除的角色不画光环（自己抽卡近景里脚下悬空圈）
      turnRing.grp.visible = true;
      turnRing.grp.position.x = ringCh.position.x;
      turnRing.grp.position.z = ringCh.position.z;
      if (!IS_REDUCED) {
        const pl = 1 + 0.07 * Math.sin(sec * 3.4);
        turnRing.grp.scale.set(pl, 1, pl);
        turnRing.inner.material.opacity = 0.55 + 0.25 * Math.sin(sec * 3.4);
      }
    } else if (turnRing.grp.visible) {
      turnRing.grp.visible = false;   // 空闲/结算熄灭
    }

    bridgeSync();
    updatePlates();
    renderer.render(scene, camera);
  }
  function resetChoiceCards() {
    cTruth.pickTarget = 0; cDare.pickTarget = 0; cTruth.pick = 0; cDare.pick = 0;
    cTruth.group.rotation.x = 0; cDare.group.rotation.x = 0;
    cTruth.group.position.y = FELT_Y + CARD_T / 2; cDare.group.position.y = FELT_Y + CARD_T / 2;
    [cTruth, cDare].forEach(cc => {
      [cc.mesh.material].flat().forEach(mm => { if (mm.opacity !== 1) { mm.opacity = 1; } });
      cc.hov = 0; cc.press = 0;
      cc.mesh.scale.set(1, 1, 1);
      // flash 不清：本地模式 choose() 同步翻转 drawing、reset 当帧执行——清了玩家就永远看不到选中白闪，交给 tickChoice 衰减
    });
    hoverName = null; pressCard = null;
  }
  function tickChoice(cc, dt, isHover, isPress) {
    cc.pick += (cc.pickTarget - cc.pick) * (1 - Math.exp(-dt * 6));
    if (IS_REDUCED) cc.pick = cc.pickTarget;
    const lift = Math.max(0, cc.pick);
    if (lift > 0.001) {
      cc.group.rotation.x = -65 * Math.PI / 180 * lift;   // 选中向镜头翘 65°
      cc.group.position.y = FELT_Y + CARD_T / 2 + 0.12 * lift;
    } else if (!IS_REDUCED) {
      // 悬停：近侧微探 + 轻抬（邀请可点）；按压：整卡回弹下压。都让位给选中抬升，不叠
      cc.hov += ((isHover ? 1 : 0) - cc.hov) * (1 - Math.exp(-dt * 10));
      cc.group.rotation.x = -0.2 * cc.hov;
      cc.group.position.y = FELT_Y + CARD_T / 2 + 0.045 * cc.hov;
      cc.press += ((isPress ? 1 : 0) - cc.press) * (1 - Math.exp(-dt * 16));
      const sc = 1 - 0.05 * cc.press;
      cc.mesh.scale.set(sc, 1, sc);
    } else {
      cc.group.rotation.x = 0;
      cc.group.position.y = FELT_Y + CARD_T / 2;
    }
    if (cc.flash > 0) {   // 选中白闪：emissive 是 uniform，直接写值衰减（禁 needsUpdate=重编译）
      cc.flash = Math.max(0, cc.flash - dt * 2.4);
      cc.mesh.material[2].emissive.setRGB(cc.flash, cc.flash, cc.flash);
    }
    const dim = cc.pick < -0.001 ? 0.3 : 1;   // 未选压暗（uniform 写值即可，禁 needsUpdate——会触发重编译）
    const mats = [cc.mesh.material].flat();
    mats.forEach(mm => { if (mm.transparent && mm.opacity !== dim) mm.opacity = dim; });
  }

  // ── retire：loperf 翻转/退役时全量还原（评审不可让步 #2，同一同步函数）──
  function retire3D() {
    if (retired) return;
    retired = true;
    try { document.body.style.cursor = ''; } catch (e) {}   // 悬停手型随 3D 一起退役
    try { bridgeRestore(); } catch (e) {}
    try { if (toolsMoved) { toolsMoved.el.style.display = toolsMoved.origDisplay; toolsMoved.parent.insertBefore(toolsMoved.el, toolsMoved.next); toolsMoved = null; } } catch (e) {}   // display 一并归还：loperf 若在进桌前翻转，frame 的显隐写入再也不会跑，残留 'none' 会让 CSS 回退局工具行整局不可见（sim-mobile 实测）
    try { toolsFab.remove(); } catch (e) {}   // 🧰 浮标只属于 3D 窄屏，随场景退役（CSS 回退层没有它）
    try { if (betMoved) { betMoved.parent.insertBefore(betMoved.el, betMoved.next); betMoved = null; } } catch (e) {}   // 押注面板归还 CSS 路径
    try { stageActions.remove(); } catch (e) {}
    document.body.classList.remove('three3d');
    bubbles.length = 0; eggs3d.length = 0; voicePool.length = 0; faceSplats.length = 0; shellPool.length = 0;   // 特效池随场景退役（mesh 已被下方 traverse dispose）
    try { window.removeEventListener('resize', size); } catch (e) {}
    try { if (_ap) Cam.apply = _ap; } catch (e) {}
    try { if (_pv) paintVoice = _pv; } catch (e) {}
    try {   // 名牌回归 layoutRing CSS 定位（inline 补偿一并归还，否则 CSS 回退层带着 3D 的 min-width 布局）
      document.querySelectorAll('#game-players-grid .player-card').forEach(c => {
        c.style.left = ''; c.style.top = ''; c.style.zIndex = '';
        c.style.visibility = ''; c.style.minWidth = '';
        const w = c.__wrapEl || c.querySelector('.avatar-wrap');
        if (w) w.style.minWidth = '';
      });
    } catch (e) {}
    try {
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    try { renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
    try { canvas.remove(); } catch (e) {}
  }

  requestAnimationFrame(frame);
})();
