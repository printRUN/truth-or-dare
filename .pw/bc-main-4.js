'use strict';
/* ═══ 炸弹猫 · 第四部分：Three.js 真 3D 牌桌 ═══
   借 tod 视觉 DNA（FogExp2/ACES+sRGB/吊灯暖光/事件驱动阴影/球面脸贴片/turnRing），
   独立精简实现：固定过肩机位+视差、DOM 投影名牌（无 offset 链——本文件无嵌套 transform）、
   墙钟 smoothstep 动画、loperf 翻转 → retireScene() 全量退役。无 WebGL → 纯 DOM 可玩。 */

const CARD_W = 0.62, CARD_L = 0.9, CARD_T = 0.014;
const TABLE_R = 2.05, TABLE_H = 0.92, FELT_Y = TABLE_H + 0.05, SEAT_R = TABLE_R + 0.66;

let __scene = null;
function sceneReady() { return !!__scene && !document.body.classList.contains('loperf'); }

function initScene() {
  if (__scene || typeof THREE === 'undefined') return;
  try { const t = document.createElement('canvas'); if (!(t.getContext('webgl') || t.getContext('experimental-webgl'))) return; } catch (e) { return; }
  if (document.body.classList.contains('loperf')) return;

  const canvas = $('#gl-canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { return; }
  document.body.classList.add('three3d');   // GL 激活：画布显示、DOM 玩家栏让位给 3D 名牌
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // 事件驱动阴影（稳态零阴影 pass）

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a1a, 0.042);
  const camera = new THREE.PerspectiveCamera(46, 2, 0.1, 120);
  const CAM_BASE = { x: 0, y: 3.55, z: 6.35, tx: 0, ty: 0.85, tz: 0 };

  function size() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6, Math.sqrt(2.3e6 / Math.max(1, w * h)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  size();
  const onResize = () => size();
  window.addEventListener('resize', onResize);

  /* ── 灯光：可见吊灯 + 暖点光 + Hemisphere + 冷补光 + 阴影平行光 ── */
  scene.add(new THREE.HemisphereLight(0x7078b8, 0x2a1840, 0.7));
  const lampG = new THREE.Group();
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2a1a10, side: THREE.DoubleSide }));
  shade.position.y = 2.62;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd9a8 }));
  bulb.position.y = 2.48;
  lampG.add(shade, bulb);
  scene.add(lampG);
  const lamp = new THREE.PointLight(0xffc890, 1.3, 10);
  lamp.position.set(0, 2.5, 0); scene.add(lamp);
  const rim = new THREE.DirectionalLight(0x6a7dff, 0.24); rim.position.set(-3, 2, 4); scene.add(rim);
  const sun = new THREE.DirectionalLight(0xffe2b8, 0.85);
  sun.position.set(-1.7, 6, 1.3); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4; sun.shadow.camera.right = 4; sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
  scene.add(sun);
  let shadowDirty = true;
  const markShadow = () => { shadowDirty = true; };

  /* ── 桌子：炭火红毡面圆桌 ── */
  const MAT = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.7 : r });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 40), MAT(0x0d0b16, 0.95));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, TABLE_H, 14), MAT(0x1c0e10, 0.6));
  leg.position.y = TABLE_H / 2; leg.castShadow = true; scene.add(leg);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.26, TABLE_R + 0.26, 0.09, 44), MAT(0x2a1210, 0.6));
  top.position.y = TABLE_H - 0.045; top.castShadow = true; scene.add(top);
  const felt = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R, 44), MAT(0x4a1512, 0.92));
  felt.rotation.x = -Math.PI / 2; felt.position.y = FELT_Y; felt.receiveShadow = true; scene.add(felt);
  const feltRing = new THREE.Mesh(new THREE.RingGeometry(TABLE_R - 0.09, TABLE_R, 44),
    new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.35 }));
  feltRing.rotation.x = -Math.PI / 2; feltRing.position.y = FELT_Y + 0.004; scene.add(feltRing);
  // 桌心徽记
  (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.font = '130px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.globalAlpha = 0.16; x.fillText('💣', 128, 132);
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = FELT_Y + 0.006; scene.add(m);
  })();

  /* ── 牌堆 / 弃牌堆（GL）── */
  const backTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 180;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 128, 180);
    g.addColorStop(0, '#3b1a5e'); g.addColorStop(1, '#191030');
    x.fillStyle = g; x.fillRect(0, 0, 128, 180);
    x.strokeStyle = 'rgba(251,191,36,0.5)'; x.lineWidth = 6; x.strokeRect(8, 8, 112, 164);
    x.font = '44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('💣', 64, 92);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
  })();
  const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_L);
  const deckGroup = new THREE.Group(); deckGroup.position.set(0, FELT_Y, -0.72); scene.add(deckGroup);
  const discGroup = new THREE.Group(); discGroup.position.set(1.32, FELT_Y, -0.1); scene.add(discGroup);
  const deckVisual = [], discVisual = [];
  function mkCard(faceTex, faceUp) {
    const side = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.8 });
    const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.75 });
    const face = new THREE.MeshStandardMaterial({ map: faceTex || backTex, roughness: 0.75 });
    const top = (faceUp && faceTex) ? face : back;   // 牌堆/弃牌堆：顶面朝上；规则=打出的牌面朝下，弃牌堆顶翻明
    const bottom = back;
    // BoxGeometry 材质面序：+x,-x,+y,-y,+z,-z —— 大面是 +y/-y
    const m = new THREE.Mesh(cardGeo, [side, side, top, bottom, side, side]);
    m.castShadow = true;
    return m;
  }
  function syncPiles() {
    const n = S ? S.deckN : 0, dn = Math.max(1, Math.min(10, Math.ceil(n / 6)));
    let changed = false;
    while (deckVisual.length < dn) { const c = mkCard(); c.position.y = deckVisual.length * CARD_T + CARD_T / 2; deckGroup.add(c); deckVisual.push(c); changed = true; }
    while (deckVisual.length > dn) { const m = deckVisual.pop(); m.material.forEach(mt => mt.dispose()); deckGroup.remove(m); changed = true; }
    const dn2 = Math.min(8, S ? S.discard.length : 0);
    while (discVisual.length < dn2) {
      const idx = discVisual.length;
      const id = S.discard[S.discard.length - 1 - idx];
      // 视觉栈底=最早打的：0 号是栈顶（最新），只有栈顶翻明
      const c = mkCard(texForCard(id), idx === 0);
      c.rotation.y = (idx % 2 ? 0.14 : -0.1);
      c.position.y = (dn2 - 1 - idx) * CARD_T + CARD_T / 2;
      discGroup.add(c); discVisual.push(c); changed = true;
    }
    while (discVisual.length > dn2) { const m = discVisual.pop(); m.material.forEach(mt => mt.dispose()); discGroup.remove(m); changed = true; }
    if (changed) markShadow();   // 数量没变就不标（syncPiles 每帧被调，恒真会让事件驱动阴影失效）
  }
  const texCache = new Map();
  function texForCard(id) {
    const kind = CAT.kindOf(id);
    if (texCache.has(kind)) return texCache.get(kind);
    const cv = cardFaceCanvas(id);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.minFilter = THREE.LinearFilter;
    texCache.set(kind, t);
    return t;
  }

  /* ── 人物（移植 tod buildChar：凳+lean 组+躯干+头+球面脸+发壳）── */
  const chars = new Map();
  function chrColor(id, l) { const h = hashStr(id) % 360; return `hsl(${h},58%,${l}%)`; }
  function buildChar(p) {
    const g = new THREE.Group();
    const c1 = new THREE.Color(chrColor(p.id, 58)), c2 = new THREE.Color(chrColor(p.id, 34));
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 12), MAT(0x1c0e10, 0.6));
    stool.position.y = 0.44; stool.castShadow = true;
    const lean = new THREE.Group(); lean.position.y = 0.52;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.62, 14), new THREE.MeshStandardMaterial({ color: c2, roughness: 0.75 }));
    torso.position.y = 0.30; torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.195, 0.16, 14), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.7 }));
    chest.position.y = 0.51; chest.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), MAT(0xe8b98c, 0.65));
    head.position.y = 0.81; head.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 20, 14, Math.PI / 2 - 0.7, 1.4, Math.PI / 2 - 0.7, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xe8b98c, transparent: true, alphaTest: 0.5 })
    );
    face.position.set(0, 0.81, 0);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.207, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: c1, roughness: 0.8 }));
    hair.position.y = 0.825;
    lean.add(torso, chest, head, face, hair);
    g.add(stool, lean);
    g.userData = { pid: p.id, torso, chest, head, face, hair, lean, phase: Math.random() * 6.28, deadT: 0 };
    scene.add(g);
    markShadow();
    return g;
  }
  function avatarTexture(pid, avKey) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    const img = new Image();
    const src = resolveAv(avKey);
    // 猫脸图已是方形 canvas 导出：直接整图入画 + squircle 蒙版
    const paint = () => {
      x.clearRect(0, 0, 256, 256);
      try { x.drawImage(img, 4, 4, 248, 248); } catch (e) {}
      x.globalCompositeOperation = 'destination-in';
      x.beginPath();
      if (x.roundRect) x.roundRect(5, 5, 246, 246, 76); else x.rect(5, 5, 246, 246);
      x.fillStyle = '#fff'; x.fill();
      x.globalCompositeOperation = 'source-over';
      tex.image = cv; tex.needsUpdate = true;
    };
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    img.onload = paint;
    img.src = src;
    if (img.complete) paint();
    return tex;
  }
  function seatAngle(pid) {
    if (!S) return Math.PI;
    const n = S.players.length; if (!n) return Math.PI;
    const i = S.players.findIndex(p => p.id === pid);
    const me = S.players.findIndex(p => p.id === myId);
    const rel = ((i - me) % n + n) % n;      // 我恒 0 号=正南
    return Math.PI + rel * Math.PI * 2 / n;  // a=PI → sin=0, cos=-1 → z=-R？见下：+Z 朝相机
  }
  function seatPos(pid, v) {
    const a = seatAngle(pid);
    //tod 约定：sx=sin(a)*R, sz=cos(a)*R；a=PI → sz=-R。我要在南（+z，靠相机），故用 a-=PI 修正：
    const a2 = a - Math.PI;
    v.set(Math.sin(a2) * SEAT_R, 0, Math.cos(a2) * SEAT_R);
    return v;
  }
  function syncChars() {
    if (!S) return;
    const seen = new Set();
    for (const p of S.players) {
      seen.add(p.id);
      let ch = chars.get(p.id);
      if (!ch) { ch = buildChar(p); chars.set(p.id, ch); seatPos(p.id, ch.position); ch.rotation.y = Math.atan2(-ch.position.x, -ch.position.z); }
      const u = ch.userData;
      const key = p.av || '';
      if (u.avKey !== key) {
        u.avKey = key;
        const oldTex = u.face.material.map;
        const tex = avatarTexture(p.id, key);
        u.face.material.map = tex; u.face.material.color.set(0xffffff); u.face.material.needsUpdate = true;
        if (oldTex && oldTex !== tex) oldTex.dispose();
      }
      const dead = !p.alive || p.left;
      if (dead && !u.dead) { u.dead = true; u.deadT = performance.now(); markShadow(); }
      if (!dead && u.dead) { u.dead = false; ch.rotation.x = 0; ch.position.y = 0; markShadow(); }
    }
    for (const [pid, ch] of chars) if (!seen.has(pid)) { scene.remove(ch); chars.delete(pid); markShadow(); }
  }

  /* ── 当前回合呼吸环（turnRing DNA）── */
  const turnRing = (() => {
    const grp = new THREE.Group();
    const mk = (rIn, rOut, op, col) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
      return m;
    };
    const inner = mk(0.42, 0.5, 0.8, 0xfbbf24), outer = mk(0.56, 0.578, 0.38, 0xfbbf24);
    grp.add(inner, outer); grp.visible = false; scene.add(grp);
    return grp;
  })();

  /* ── DOM 名牌（投影；本文件无嵌套 transform 容器，直接写视口坐标）── */
  const plates = new Map();
  function ensurePlates() {
    if (!S) return;
    for (const p of S.players) {
      if (!plates.has(p.id)) {
        const el = document.createElement('div');
        el.className = 'nplate';
        el.style.cssText = 'position:fixed;z-index:12;transform:translate(-50%,-100%);pointer-events:none;background:rgba(10,10,26,0.78);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:3px 10px;font-size:13px;white-space:nowrap;display:none;';
        document.body.appendChild(el);
        plates.set(p.id, el);
      }
    }
    for (const [pid, el] of plates) if (!S.players.some(p => p.id === pid)) { el.remove(); plates.delete(pid); }
  }
  const V = new THREE.Vector3();
  function updatePlates() {
    if (!S) return;
    ensurePlates();
    const w = window.innerWidth, h = window.innerHeight;
    for (const p of S.players) {
      const el = plates.get(p.id); const ch = chars.get(p.id);
      if (!el) continue;
      if (!ch) { el.style.display = 'none'; continue; }
      ch.getWorldPosition(V); V.y += 1.32;
      V.project(camera);
      if (V.z > 1 || V.x < -1.15 || V.x > 1.15 || V.y < -1.15 || V.y > 1.15) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = ((V.x * 0.5 + 0.5) * w) + 'px';
      el.style.top = ((-V.y * 0.5 + 0.5) * h) + 'px';
      const dead = !p.alive || p.left;
      const isTurn = S.turn && S.turn.pid === p.id && S.stage === 'turn';
      // 签名边沿重绘（禁每帧 innerHTML——重绘纪律同 tod qSig）
      const sig = `${isTurn ? 1 : 0}|${dead ? 1 : 0}|${p.cnt != null ? p.cnt : '?'}|${p.name}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = `${isTurn ? '▶ ' : ''}${esc(p.name)} <b style="color:${dead ? '#94a3b8' : '#fbbf24'}">${dead ? '💀' : '🃏' + (p.cnt != null ? p.cnt : '?')}</b>`;
      }
      el.style.borderColor = isTurn ? 'rgba(251,191,36,0.65)' : 'rgba(255,255,255,0.18)';
    }
  }

  /* ── 动画队列（墙钟 smoothstep）── */
  const anims = [];
  const IS_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function flyCard(mesh, from, to, dur, opts) {
    opts = opts || {};
    mesh.position.copy(from);
    scene.add(mesh);
    anims.push({ mesh, from: from.clone(), to: to.clone(), t0: performance.now(), dur: Math.max(1, dur), arc: opts.arc || 0.5, spin: opts.spin || 0, done: opts.done });
    return mesh;
  }
  function smooth(k) { return k * k * (3 - 2 * k); }

  /* ── 演出钩子（scene 不可用时 no-op）── */
  function seatTop(pid) { const v = new THREE.Vector3(); const ch = chars.get(pid); if (ch) { ch.getWorldPosition(v); v.y = FELT_Y + CARD_T; } else seatPos(pid, v); return v; }
  window.__bcScene = {
    boom(pid) {
      const p0 = seatTop(pid);
      const n = IS_REDUCED ? 0 : 22;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 6, 5),
          new THREE.MeshBasicMaterial({ color: [0xef4444, 0xf97316, 0xfbbf24][i % 3] }));
        m.position.copy(p0); m.position.y += 0.6;
        scene.add(m);
        const v = new THREE.Vector3((Math.random() - 0.5) * 3.4, 1.6 + Math.random() * 2.6, (Math.random() - 0.5) * 3.4);
        anims.push({ mesh: m, vel: v, grav: -6.5, t0: performance.now(), dur: 1100 + Math.random() * 500, burst: true, done: mesh => scene.remove(mesh) });
      }
      shakeT = performance.now();
      flashEl.style.opacity = '0.5';
      setTimeout(() => flashEl.style.opacity = '0', 60);
      markShadow();
    },
    nope(pid) {
      const from = seatTop(pid).clone(); from.y += 0.8;
      const to = discGroup.position.clone(); to.y += 0.1 + discVisual.length * CARD_T;
      flyCard(mkCard(texForCard('nope:0')), from, to, IS_REDUCED ? 0 : 620, { arc: 0.8, spin: 5, done: () => syncPiles() });
    },
    steal(toPid, fromPid) {
      if (IS_REDUCED) return;
      const from = seatTop(fromPid).clone(); from.y += 0.9;
      const to = seatTop(toPid).clone(); to.y += 0.9;
      const c = mkCard(); c.rotation.x = Math.PI / 2;
      flyCard(c, from, to, 1000, { arc: 1.1, spin: 2, done: mesh => scene.remove(mesh) });
    },
    draw(pid) {
      const from = deckGroup.position.clone(); from.y += 0.1;
      const to = seatTop(pid).clone(); to.y += 0.85;
      flyCard(mkCard(), from, to, IS_REDUCED ? 0 : 760, { arc: 0.7, spin: 3, done: mesh => scene.remove(mesh) });
    },
    shuffle() {
      if (IS_REDUCED) return;
      const t0 = performance.now();
      anims.push({ wiggle: deckGroup, t0, dur: 800, done: () => {} });
    },
    sync() { syncPiles(); syncChars(); },
    cameraShake: () => { shakeT = performance.now(); },
  };

  /* ── 爆炸红闪 DOM ── */
  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;background:radial-gradient(ellipse at center, rgba(239,68,68,0.55), rgba(120,10,10,0.25) 70%);opacity:0;transition:opacity 0.5s;';
  document.body.appendChild(flashEl);

  /* ── 帧循环 ── */
  let shakeT = 0, raf = 0, lastCharsSync = 0, px = 0, py = 0;
  function onPointer(e) { px = (e.clientX / window.innerWidth - 0.5); py = (e.clientY / window.innerHeight - 0.5); }
  window.addEventListener('pointermove', onPointer, { passive: true });

  function frame() {
    raf = requestAnimationFrame(frame);
    if (document.body.classList.contains('loperf')) { retireScene(); return; }
    if (document.hidden) return;
    const now = performance.now();
    syncPiles();
    if (now - lastCharsSync > 600) { syncChars(); lastCharsSync = now; }
    // 相机：固定机位 + 指针视差 + 爆炸 shake
    let sx = 0;
    if (now - shakeT < 380) { const k = 1 - (now - shakeT) / 380; sx = Math.sin(now * 0.09) * 0.09 * k; }
    camera.position.set(CAM_BASE.x + px * 0.55 + sx, CAM_BASE.y - py * 0.35, CAM_BASE.z);
    camera.lookAt(CAM_BASE.tx, CAM_BASE.ty, CAM_BASE.tz);
    // 动画
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = Math.min(1, (now - a.t0) / a.dur);
      if (a.burst) {
        a.vel.y += a.grav * 0.016;
        a.mesh.position.addScaledVector(a.vel, 0.016);
        if (a.mesh.position.y < FELT_Y + 0.05) { a.mesh.position.y = FELT_Y + 0.05; a.vel.y *= -0.3; a.vel.x *= 0.7; a.vel.z *= 0.7; }
        if (k >= 1) { a.done && a.done(a.mesh); anims.splice(i, 1); }
        continue;
      }
      if (a.wiggle) {
        const g = a.wiggle;
        g.rotation.z = Math.sin(k * Math.PI * 6) * 0.06 * (1 - k);
        g.position.x = Math.sin(k * Math.PI * 9) * 0.05 * (1 - k);
        if (k >= 1) { g.rotation.z = 0; g.position.x = 0; a.done && a.done(); anims.splice(i, 1); }
        continue;
      }
      const e = smooth(k);
      a.mesh.position.lerpVectors(a.from, a.to, e);
      a.mesh.position.y += Math.sin(e * Math.PI) * (a.arc || 0);
      if (a.spin) a.mesh.rotation.y = a.spin * e;
      if (k >= 1) { if (a.done) a.done(a.mesh); else scene.remove(a.mesh); anims.splice(i, 1); markShadow(); }
    }
    // turnRing
    const ringOn = S && S.stage === 'turn' && S.turn && S.turn.pid;
    if (ringOn) {
      const ch = chars.get(S.turn.pid);
      if (ch) {
        turnRing.visible = true;
        turnRing.position.set(ch.position.x, FELT_Y + 0.012, ch.position.z);
        const b = 1 + Math.sin(now * 0.0067) * 0.07;
        turnRing.scale.set(b, 1, b);
      } else turnRing.visible = false;
    } else turnRing.visible = false;
    updatePlates();
    // 人物呼吸 / 出局躺倒
    for (const [pid, ch] of chars) {
      const u = ch.userData;
      const p = S && S.players.find(x => x.id === pid);
      if (u.dead && p) {
        const k = Math.min(1, (now - u.deadT) / 600);
        ch.rotation.x = -smooth(k) * Math.PI / 2 * 0.9;
        ch.position.y = -smooth(k) * 0.18;
      } else {
        ch.rotation.x = 0;
        u.torso.scale.y = 1 + Math.sin(now * 0.0032 + u.phase) * 0.035;
      }
    }
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
  }
  frame();

  __scene = {
    renderer, scene, camera,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
      renderer.dispose();
      for (const [, el] of plates) el.remove();
      plates.clear();
      flashEl.remove();
    }
  };
  syncPiles(); syncChars();
}

function retireScene() {
  if (__scene) { __scene.dispose(); __scene = null; }
  document.body.classList.remove('three3d');
}
/* 场景钩子的无 GL 兜底：sceneReady 为假时是 no-op */
function sceneBoom(pid) { if (sceneReady()) window.__bcScene.boom(pid); }
function sceneNope(pid) { if (sceneReady()) window.__bcScene.nope(pid); }
function sceneSteal(to, from) { if (sceneReady()) window.__bcScene.steal(to, from); }
function sceneDraw(pid) { if (sceneReady()) window.__bcScene.draw(pid); }
function sceneShuffle() { if (sceneReady()) window.__bcScene.shuffle(); }
setInterval(() => { if (sceneReady()) window.__bcScene.sync(); }, 900);
