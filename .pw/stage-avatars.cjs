// stage-avatars.cjs（二阶版）— 头像轮二阶 hunk 分拣：从 HEAD(758f97c, 一阶) 重建「只含本人二阶改动」的索引版
// （并行会话 WIP 的 fallTok/fallAndFade/resultFx 等不入索引；嵌在其内的 headMats 淡出行随其 WIP 留工作树）
const fs = require('fs');
const { execSync } = require('child_process');

const wt = f => fs.readFileSync(f, 'utf8');
const head = f => execSync(`git show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 1e8 });

function between(s, from, toIncl) {
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
// 1. 函数块（含二阶 palette/几何头 + rework 的 syncPawnFaces；剥掉并行会话加的 fallInFlight 守卫）——替换 HEAD 的一阶块
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
{
  const a = m.indexOf('/* ═══ 玩家头像 3D 化');
  const b = m.indexOf('function buildPawns() {');
  if (a < 0 || b < 0 || b < a) throw new Error('HEAD 一阶块区间未找到');
  m = m.slice(0, a) + block + m.slice(b);   // 整段替换（一阶块尾正是 buildPawns 前）
}
// 2. buildPawns 头部段（一阶→二阶）
m = mustReplace(m, `    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), mat);
    head.castShadow = true;
    const headGrp = new THREE.Group();   // 头+脸独立组（头像轮）：billboard yaw 写这里
    headGrp.position.y = 0.4;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.102, 20, 14, Math.PI / 2 - 0.7, 1.4, Math.PI / 2 - 0.7, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5 }));   // 同心贴片 r=头×1.075（tod 月牙边终值）；map 由 syncPawnFaces 挂（挂图后 color 白=map×color 不染）
    headGrp.add(head, face);
    grp.add(body, headGrp);
    grp.userData.headGrp = headGrp; grp.userData.faceMat = face.material; grp.userData.faceKey = '';   // 头像锚（破产淡出/复位的材质同步锚）`, `    const headGrp = new THREE.Group();   // 头独立组（头像轮二阶）：billboard yaw 写这里；真 3D 几何处头（脸贴片退役，头像图只贡献发色，名牌圆头像 carry 真实头像）
    headGrp.position.y = 0.375;   // 头嵌锥顶（去棒棒糖间隙）
    const head = buildAvatarHead(0.1, p.colorIdx);
    headGrp.add(head.grp);
    grp.add(body, headGrp);
    grp.userData.headGrp = headGrp; grp.userData.hairMat = head.hairMat; grp.userData.headMats = head.mats; grp.userData.faceKey = '';   // 头像锚（palette 同步 + 淡出拍同步淡头）`, 'head-section');
// 3. __mono faces 访问器（一阶→二阶）
m = mustReplace(m, `    faces: () => pawnObjs.map((g, i) => {
      if (!g) return null;
      const e = faceTexCache.get(g.userData.faceKey);
      return { i, key: g.userData.faceKey || '', hasMap: !!(g.userData.faceMat && g.userData.faceMat.map), loaded: !!(e && e.loaded), fb: !!(e && e.fb), yaw: g.userData.headGrp ? +g.userData.headGrp.rotation.y.toFixed(3) : null, headY: g.userData.headGrp ? +g.userData.headGrp.position.y.toFixed(3) : null };
    }),   // 头像轮取证：占位纹理天生有 map，loaded/fb 才是真图/程序化脸判据`, `    faces: () => pawnObjs.map((g, i) => {
      if (!g) return null;
      const e = paletteCache.get(g.userData.faceKey);
      return { i, key: g.userData.faceKey || '', hair: g.userData.hairMat ? '#' + g.userData.hairMat.color.getHexString() : null, loaded: !!(e && e.loaded), fb: !!(e && e.fb), yaw: g.userData.headGrp ? +g.userData.headGrp.rotation.y.toFixed(3) : null };
    }),   // 头像轮二阶取证：头=真几何（loaded&&!fb=发色来自头像提取；fb=程序化发色），yaw=billboard`, '__mono-faces');

// ── uno ──
let u = head('uno.html');
const uw = wt('uno.html');
// 1. 撤一阶 mkTexMip（二阶无贴图管线）
u = mustReplace(u, `function mkTexMip(w, h, draw) {   // mipmap 变体（头像轮新增）：照片类连续色调要 mip（全景缩小必闪烁）——mkTex 本体禁 mip 契约（卡面/铭牌/骰面）不动
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}
`, '', 'uno-mktexmip-remove');
// 2. seatAva 块（一阶贴图管线→二阶 palette+几何头）——整段区间替换 HEAD 的一阶块
const seatAvaBlock = between(uw, '/* ═══ 座位 3D 头像半身像', 'function refreshSeatFx() {');
const seatAvaCut = seatAvaBlock.slice(seatAvaBlock.indexOf('const seatAva'), seatAvaBlock.lastIndexOf('function refreshSeatFx() {'));   // between 含尾锚：正文切到尾锚前（防双声明+悬括号）
const unoComment = `/* ═══ 座位 3D 头像半身像（SPEC §1.13 二阶）：独立系统不碰 refreshSeatFx（该函数正被并行改造）。
   av 源=NETMODE NDOC.players[i].av（G.players 来自 game 快照，无 av 字段）。基座钉桌面真实顶面 y=0.20
  （桌 Cylinder 中心−0.05+半高 0.25，行动环 y0.212 即既证），径向 seatPos×1.28（R2.6→3.33<桌 6.4）；
   真实 castShadow（seatFx 柔影 −0.042 埋桌里的教训不复制）；south 不建（自我中心渲染，与铭牌同语义）；
   脸朝南固定 yaw=0（uno 相机唯一且固定南侧，无 billboard 需求） ═══ */
`;
{
  const a = u.indexOf('/* ═══ 座位 3D 头像半身像');
  const b = u.indexOf('function refreshSeatFx() {');
  if (a < 0 || b < 0 || b < a) throw new Error('uno 一阶块区间未找到');
  u = u.slice(0, a) + unoComment + seatAvaCut + u.slice(b);
}
// 3. __uno avatars 访问器（一阶→二阶）
const avaAcc = between(uw, '    avatars: () => ({', '    }),');
u = mustReplace(u, `    avatars: () => ({   // 头像轮取证：占位纹理天生有 map，loaded/fb 才是真图/程序化脸判据
      sig: seatAva.sig,
      seats: seatAva.busts.map(g => {
        const e = g.userData.faceEntry;
        return { x: +g.position.x.toFixed(2), y: +g.position.y.toFixed(2), z: +g.position.z.toFixed(2), key: g.userData.faceKey, hasMap: !!(g.children[3] && g.children[3].material.map), loaded: !!(e && e.loaded), fb: !!(e && e.fb) };
      })
    }),`, avaAcc, 'uno-__uno');

// ── 门禁：语法 + 对方符号悬空 + 一阶残留 ──
function syntaxCheck(name, html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m2 => m2[1]);
  blocks.forEach((b, i) => { try { new Function(b); } catch (e) { throw new Error(name + ' script#' + i + ' SYNTAX: ' + e.message); } });
  console.log(name + ': ' + blocks.length + ' script block(s) parse OK');
}
function danglingGate(name, html, symbols) {
  const hits = symbols.filter(sym => html.includes(sym));
  if (hits.length) throw new Error(name + ' 悬空对方符号: ' + hits.join(', '));
  console.log(name + ': 符号门 OK（' + symbols.join(', ') + ' 均不在）');
}
syntaxCheck('monopoly(staged)', m);
syntaxCheck('uno(staged)', u);
danglingGate('monopoly(staged)', m, ['fallTok', 'fallInFlight', 'fallFxLog', 'FALL_GRAY', 'resetPawnPose', 'pawnPose', 'userData.faceMat']);
danglingGate('uno(staged)', u, ['resultFx', 'camBaseD', 'RESULT_PUSH_MS', '_resultShown', 'faceEntry', 'paintAva', 'acquireAvaTex', 'avaTexCache', 'mkTexMip']);

fs.writeFileSync(process.env.TEMP + '/mono-staged.html', m);
fs.writeFileSync(process.env.TEMP + '/uno-staged.html', u);
console.log('staged files written:', m.length, u.length);
