/* ══════════ Three.js 真 3D 场景（第三人称牌桌，body.three3d） ══════════
   混合架构：WebGL 画布（#three-canvas，#cam 最底层）渲染房间/桌子/3D 人物——
   人物头戴玩家头像（CircleGeometry 脸贴图）；DOM UI（HUD/名牌/选卡/题面/押注）叠加其上。
   一镜到底相机：挂 Cam.apply 钩子，Cam.cur 姿态实时映射 three 相机——既有运镜编排零改动复用。
   门禁：THREE 存在 + WebGL 可用才启用（body.three3d）；loperf/页面隐藏自动不渲染，回退 CSS 路径。 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;
  try {
    const t = document.createElement('canvas');
    if (!(t.getContext('webgl') || t.getContext('experimental-webgl'))) return;
  } catch (e) { return; }
  if (document.body.classList.contains('loperf')) return;   // 省电档维持 CSS 路径

  const camEl = document.getElementById('cam');
  const canvas = document.createElement('canvas');
  canvas.id = 'three-canvas';
  camEl.insertBefore(canvas, camEl.firstChild);

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
  catch (e) { return; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 2, 0.1, 80);
  function size() {
    const w = camEl.clientWidth || 1, h = camEl.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  // ── 灯光：桌面吊灯（暖）+ 环境 + 冷色补光 ──
  scene.add(new THREE.AmbientLight(0x8890c0, 0.9));
  const lamp = new THREE.PointLight(0xffe2b8, 1.15, 20); lamp.position.set(0, 4.4, 0); scene.add(lamp);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.32); fill.position.set(-4, 3, 6); scene.add(fill);

  const MAT = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  // ── 地面 ──
  const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 48), MAT(0x110a24, 0.95));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // ── 桌子：桌面 + 毡面 + 围边 + 单柱脚；桌心牌堆 ──
  const TABLE_R = 2.05, TABLE_H = 0.92, SEAT_R = TABLE_R + 0.66;
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.26, TABLE_R + 0.26, 0.09, 44), MAT(0x2a1548, 0.6));
  top.position.y = TABLE_H;
  const felt = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R, 44), MAT(0x4c2a8f, 0.95));
  felt.rotation.x = -Math.PI / 2; felt.position.y = TABLE_H + 0.05;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.1, 0.09, 10, 44), MAT(0x1c0e33, 0.5));
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_H;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, TABLE_H - 0.04, 18), MAT(0x1c0e33, 0.55));
  leg.position.y = (TABLE_H - 0.04) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 0.07, 24), MAT(0x150826, 0.6));
  foot.position.y = 0.035;
  table.add(top, felt, rim, leg, foot);
  scene.add(table);
  const deck = new THREE.Group();
  const dk1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.64), MAT(0x6d3ae0, 0.4)); dk1.rotation.y = 0.12;
  const dk2 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.64), MAT(0x8b5cf6, 0.4)); dk2.rotation.y = -0.08; dk2.position.y = 0.05;
  deck.add(dk1, dk2); deck.position.set(0.1, TABLE_H + 0.09, 0.1);
  scene.add(deck);

  // ── 3D 人物：凳 + 身体（chrHue 身份色）+ 头 + 头像脸盘（戴头像）──
  const chars = new Map();
  const texCache = new Map();
  function chrColor(id, l) { const c = new THREE.Color(); try { c.setStyle('hsl(' + chrHue(id) + ', 66%, ' + l + '%)'); } catch (e) { c.set(0x8b5cf6); } return c; }
  function avatarTexture(pid, uri) {
    let e = texCache.get(pid);
    if (e && e.uri === uri) return e.tex;
    const tex = new THREE.Texture();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const g = c.getContext('2d');
      g.fillStyle = '#241235'; g.fillRect(0, 0, 160, 160);
      try { g.drawImage(img, 0, 0, 160, 160); } catch (err) {}
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
    stool.position.y = 0.44;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.62, 14), MAT(c2, 0.75));
    torso.position.y = 0.82;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.195, 0.16, 14), MAT(c1, 0.7));
    chest.position.y = 1.03;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), MAT(0xe8b98c, 0.65));
    head.position.y = 1.33;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshBasicMaterial({ transparent: true }));
    face.position.set(0, 1.33, 0.168);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.207, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT(c1, 0.8));
    hair.position.y = 1.345;
    g.add(stool, torso, chest, head, face, hair);
    g.userData = { pid: p.id, torso, hair, phase: Math.random() * 6.28, voice: 0, lean: 0 };
    return g;
  }
  function syncPlayers() {
    if (typeof S === 'undefined' || !S || !S.players || !document.getElementById('screen-game').classList.contains('active')) return;
    const seen = new Set();
    for (const p of S.players) {
      seen.add(p.id);
      let ch = chars.get(p.id);
      if (!ch) { ch = buildChar(p); chars.set(p.id, ch); scene.add(ch); }
      const aCss = (window.__seatAngleByPid || {})[p.id];
      if (aCss != null) {
        const a3 = aCss - Math.PI;
        ch.position.set(Math.sin(a3) * SEAT_R, 0, Math.cos(a3) * SEAT_R);
        ch.rotation.y = Math.atan2(-ch.position.x, -ch.position.z);
      }
      const uri = resolveAvatar(p.avatar);
      if (uri) {
        const tex = avatarTexture(p.id, uri);
        const f = ch.userData;
        if (f.face.material.map !== tex) { f.face.material.map = tex; f.face.material.needsUpdate = true; }
      }
    }
    for (const [pid, ch] of chars) if (!seen.has(pid)) { scene.remove(ch); chars.delete(pid); }
  }

  // ── 钩子：renderPlayers（名单变化 → 同步人物）、paintVoice（音量 → 摆动幅度）、Cam.apply（相机）──
  try {
    const _rp = renderPlayers;
    renderPlayers = function (a, b) { const r = _rp(a, b); try { syncPlayers(); } catch (e) {} return r; };
    const _pv = paintVoice;
    paintVoice = function (pid, level, speaking) {
      _pv(pid, level, speaking);
      const ch = chars.get(pid);
      if (ch) ch.userData.voice = speaking ? Math.min(1, level * 1.8) : 0;
    };
    const _ap = Cam.apply.bind(Cam);
    Cam.apply = function () { _ap(); syncCam(); };
  } catch (e) {}

  // ── 相机：Cam.cur（CSS 姿态）→ three 相机 ──
  function syncCam() {
    const c = Cam.cur;
    camera.position.set(c.x * 0.02, 2.55 + (c.rx - 19) * 0.018, 4.9 + (-56 - c.z) * 0.03);
    camera.lookAt(c.x * 0.006, 0.72, 0);
    camera.rotateY(-(c.ry || 0) * Math.PI / 180);
    camera.rotateZ(-(c.rz || 0) * Math.PI / 180);
  }

  // ── 名牌投影：人物头顶 → 屏幕坐标，DOM 名牌跟随（z 序按深度）──
  const V = new THREE.Vector3();
  function updatePlates() {
    const grid = document.getElementById('game-players-grid');
    if (!grid) return;
    const cr = camEl.getBoundingClientRect();
    grid.querySelectorAll('.player-card').forEach(card => {
      const ch = chars.get(card.dataset.pid);
      if (!ch) return;
      V.set(ch.position.x, 1.72, ch.position.z).project(camera);
      const sx = (V.x + 1) / 2 * cr.width + cr.left;
      const sy = (1 - (V.y + 1) / 2) * cr.height + cr.top;
      card.style.left = sx.toFixed(1) + 'px';
      card.style.top = sy.toFixed(1) + 'px';
      card.style.zIndex = String(600 - Math.round(V.z * 300));
    });
  }

  // ── 主循环 ──
  const t0 = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    if (document.body.classList.contains('loperf') || document.body.classList.contains('paused')) return;
    const sec = (t - t0) / 1000;
    let goId = null;
    try {
      const onStage = S.gameStarted && !S.finished && (S.turn.stage === 'drawing' || S.turn.stage === 'revealed');
      goId = onStage ? (S.turn.chooserId || activePlayerId()) : null;
    } catch (e) {}
    for (const [pid, ch] of chars) {
      const u = ch.userData;
      u.torso.scale.y = 1 + 0.03 * Math.sin(sec * 2.2 + u.phase);                                  // 呼吸
      u.torso.rotation.z = Math.sin(sec * 3.1 + u.phase) * 0.05 * (0.25 + u.voice);                // 说话摇摆
      const isGo = pid === goId;
      u.lean += ((isGo ? 0.4 : 0) - u.lean) * 0.08;                                                // 离座探身
      u.torso.rotation.x = -u.lean;
      u.hair.position.y = 1.345 + 0.01 * Math.sin(sec * 2.2 + u.phase);
    }
    updatePlates();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
