// stage-avatars.cjs — 头像轮 hunk 分拣提交辅助：从 HEAD 重建「只含本人改动」的索引版
// （并行会话 WIP 的 fallTok/fallAndFade/resultFx 等不入索引；我嵌在其内的 3 行 faceMat 随其 WIP 留工作树）
const fs = require('fs');
const { execSync } = require('child_process');

const wt = f => fs.readFileSync(f, 'utf8');
const head = f => execSync(`git show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 1e8 });

function between(s, from, toIncl) {   // 取 from 起点到 toIncl（含）的文本
  const a = s.indexOf(from);
  if (a < 0) throw new Error('anchor not found: ' + from.slice(0, 60));
  const b = s.indexOf(toIncl, a);
  if (b < 0) throw new Error('end not found: ' + toIncl.slice(0, 60));
  return s.slice(a, b + toIncl.length);
}
function mustReplace(s, from, to, tag) {
  if (!s.includes(from)) throw new Error('replace anchor missing [' + tag + ']: ' + from.slice(0, 70));
  return s.replace(from, to);
}

// ── monopoly ──
let m = head('monopoly.html');
const mw = wt('monopoly.html');
// 1. 函数块（取工作树终稿，剥掉并行会话加的 fallInFlight 守卫——该函数属对方 W3）
let block = between(mw, '/* ═══ 玩家头像 3D 化', 'function syncPawnFacesFrame() {');
block = block.slice(0, block.lastIndexOf('function syncPawnFacesFrame() {'));   // between 含尾锚：剥掉，防双声明
block += `function syncPawnFacesFrame() {   // 每帧 yaw-only billboard：脸贴片始终朝相机（idle 环绕/走位跟随/快照回景全活）；只写子组不碰 grp.rotation（W3 倒地写 grp.rotation 互不干扰）
  if (!camera) return;
  for (let i = 0; i < pawnObjs.length; i++) {
    const grp = pawnObjs[i];
    if (!grp || !grp.visible || !grp.userData.headGrp) continue;
    grp.userData.headGrp.rotation.y = Math.atan2(camera.position.x - grp.position.x, camera.position.z - grp.position.z);
  }
}
`;
m = m.replace('function buildPawns() {', block + 'function buildPawns() {');
// 2. buildPawns 头部段（无对方 userData.mat 行——HEAD 本就没有）
m = mustReplace(m, `    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), mat);
    head.position.y = 0.4; head.castShadow = true;
    grp.add(body, head);
    scene.add(grp); pawnObjs[i] = grp;`, `    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), mat);
    head.castShadow = true;
    const headGrp = new THREE.Group();   // 头+脸独立组（头像轮）：billboard yaw 写这里
    headGrp.position.y = 0.4;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.102, 20, 14, Math.PI / 2 - 0.7, 1.4, Math.PI / 2 - 0.7, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5 }));   // 同心贴片 r=头×1.075（tod 月牙边终值）；map 由 syncPawnFaces 挂（挂图后 color 白=map×color 不染）
    headGrp.add(head, face);
    grp.add(body, headGrp);
    grp.userData.headGrp = headGrp; grp.userData.faceMat = face.material; grp.userData.faceKey = '';   // 头像锚（破产淡出/复位的材质同步锚）
    scene.add(grp); pawnObjs[i] = grp;`, 'head-section');
// 3. 名牌块
m = mustReplace(m, `    const tex = mkTex(256, 64, (ctx, w, h) => {
      // 深色玻璃胶囊 + 玩家色描边（精美化 S5：裸白字在浅毡上对比脆弱，终审/取证 vis-x6/x7）
      const pc = PLAYER_COLORS[p.colorIdx];
      ctx.fillStyle = 'rgba(10,8,20,0.78)';
      roundRectPath(ctx, 3, 6, w - 6, h - 12, 24); ctx.fill();
      ctx.strokeStyle = pc; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.5;
      roundRectPath(ctx, 3, 6, w - 6, h - 12, 24); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pc;
      ctx.beginPath(); ctx.arc(22, h / 2, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(22, h / 2, 9, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 30px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncate(p.name, 4), 38, h / 2 + 1);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(0.86, 0.215, 1);
    scene.add(sp); plateSprites[i] = sp;`, `    const tex = mkTex(256, 64, (ctx, w, h) => paintPlate(ctx, w, h, p, null));   // 头像轮：名牌绘制提取为 paintPlate（syncPawnFaces 重绘同源）
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(0.86, 0.215, 1);
    sp.userData.avaKey = '';
    scene.add(sp); plateSprites[i] = sp;`, 'plate-block');
// 4. buildPawns 尾自愈
m = mustReplace(m, `  layoutPlates();
}
function placePawn`, `  layoutPlates();
  syncPawnFaces();   // 重建自愈：换局/快照重建完立即重挂脸+名牌头像（纹理缓存存活，不等下一次 updateHUD）
}
function placePawn`, 'buildpawns-tail');
// 5. updateHUD 尾
m = mustReplace(m, `  applyCashStacks();   // W2② 棋子钞堆：updateHUD 末尾对 cash 镜像 diff 增减层（纯视觉层，评审 #11）
}`, `  applyCashStacks();   // W2② 棋子钞堆：updateHUD 末尾对 cash 镜像 diff 增减层（纯视觉层，评审 #11）
  syncPawnFaces();   // 头像轮：棋子脸贴片+名牌头像 diff（keyed 幂等：常态零工作）
}`, 'updatehud-tail');
// 6. tick 行
m = mustReplace(m, `  if (G.gl && scene && !TURBO) syncCashStacksFrame();   // W2② 钞堆每帧锚位跟随棋子（变换唯一写入点；turbo 不画不推）
`, `  if (G.gl && scene && !TURBO) syncCashStacksFrame();   // W2② 钞堆每帧锚位跟随棋子（变换唯一写入点；turbo 不画不推）
  if (G.gl && !TURBO) syncPawnFacesFrame();   // 头像轮：棋子脸 billboard 朝相机（turbo 不渲染早退；REDUCED/bodyLo 保留=朝向不是动画）
`, 'tick-line');
// 7. __mono 访问器（我的 4 个；不含对方 pawnPose/plates/fallFxLog）
m = mustReplace(m, `    rigSnap: () => ({ az: rig.az, elev: rig.elev, dist: rig.dist, focusK: rig.focusK, autoDist: rig.autoDist, tgt: { x: rig.tgt.x, y: rig.tgt.y, z: rig.tgt.z } }),`, `    rigSnap: () => ({ az: rig.az, elev: rig.elev, dist: rig.dist, focusK: rig.focusK, autoDist: rig.autoDist, tgt: { x: rig.tgt.x, y: rig.tgt.y, z: rig.tgt.z } }),
    faces: () => pawnObjs.map((g, i) => {
      if (!g) return null;
      const e = faceTexCache.get(g.userData.faceKey);
      return { i, key: g.userData.faceKey || '', hasMap: !!(g.userData.faceMat && g.userData.faceMat.map), loaded: !!(e && e.loaded), fb: !!(e && e.fb), yaw: g.userData.headGrp ? +g.userData.headGrp.rotation.y.toFixed(3) : null, headY: g.userData.headGrp ? +g.userData.headGrp.position.y.toFixed(3) : null };
    }),   // 头像轮取证：占位纹理天生有 map，loaded/fb 才是真图/程序化脸判据
    platesAva: () => plateSprites.map(s => s ? s.userData.avaKey : null),   // 头像轮：名牌头像绘制键（'!ok' 后缀=已用 decode 完成的图重绘）
    camPos: () => camera.position.toArray(),
    remapPawns: () => buildPawns(),   // 纹理缓存跨重建存活断言用（acquireFaceTex 独占所有权守卫）`, '__mono');

// ── uno ──
let u = head('uno.html');
const uw = wt('uno.html');
// 1. mkTexMip
const mip = between(uw, 'function mkTexMip(w, h, draw) {', '  return t;\n}');
u = mustReplace(u, `  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}`, `  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
` + mip + `
`, 'uno-mktexmip');
// 2. seatAva 块（disposeLabel 之后、refreshSeatFx 之前）
const seatAvaBlock = between(uw, '/* ═══ 座位 3D 头像半身像', 'function refreshSeatFx() {');
const seatAvaCut = seatAvaBlock.slice(0, seatAvaBlock.lastIndexOf('function refreshSeatFx() {'));   // between 含尾锚：剥掉，防双声明
u = mustReplace(u, `}
function refreshSeatFx() {`, `}
` + seatAvaCut + `function refreshSeatFx() {`, 'uno-seatava');
// 3. updateHUD 尾
u = mustReplace(u, `  refreshSeatFx();
  refreshDeckStack();
}`, `  refreshSeatFx();
  refreshDeckStack();
  refreshSeatAvatars();   // 头像轮：座位 3D 半身像（独立系统，sig 幂等常态零成本）
}`, 'uno-updatehud');
// 4. __uno avatars 访问器（camInfo 后；不含对方 resultFx）
const avaAcc = between(uw, '    avatars: () => ({', '    }),');
u = mustReplace(u, `    camInfo: () => ({ pos: camera.position.toArray(), az: rig.az, elev: rig.elev, focusK: rig.focusK, tgt: { x: rig.tgt.x, y: rig.tgt.y, z: rig.tgt.z }, gl: G.gl, lo: document.body.classList.contains('loperf') }),`, `    camInfo: () => ({ pos: camera.position.toArray(), az: rig.az, elev: rig.elev, focusK: rig.focusK, tgt: { x: rig.tgt.x, y: rig.tgt.y, z: rig.tgt.z }, gl: G.gl, lo: document.body.classList.contains('loperf') }),
` + avaAcc, 'uno-__uno');

// ── 门禁：语法 + 对方符号悬空 ──
function syntaxCheck(name, html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m2 => m2[1]);
  blocks.forEach((b, i) => { try { new Function(b); } catch (e) { throw new Error(name + ' script#' + i + ' SYNTAX: ' + e.message); } });
  console.log(name + ': ' + blocks.length + ' script block(s) parse OK');
}
function danglingGate(name, html, symbols) {
  const hits = symbols.filter(sym => html.includes(sym));
  if (hits.length) throw new Error(name + ' 悬空对方符号: ' + hits.join(', '));
  console.log(name + ': 对方符号悬空门 OK（' + symbols.join(', ') + ' 均不在）');
}
syntaxCheck('monopoly(staged)', m);
syntaxCheck('uno(staged)', u);
danglingGate('monopoly(staged)', m, ['fallTok', 'fallInFlight', 'fallFxLog', 'FALL_GRAY', 'resetPawnPose', 'pawnPose', 'plates: () => plateSprites.map(s => s ? { vis']);
danglingGate('uno(staged)', u, ['resultFx', 'camBaseD', 'RESULT_PUSH_MS', '_resultShown']);

fs.writeFileSync(process.env.TEMP + '/mono-staged.html', m);
fs.writeFileSync(process.env.TEMP + '/uno-staged.html', u);
console.log('staged files written:', m.length, u.length);
