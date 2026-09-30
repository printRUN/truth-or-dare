// 一次性探针 v2b：3D 牌面分帧定格 + 名牌近景取证（运行时 staging，不改游戏文件）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8968;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots';
const shot = n => path.join(SHOTS, `vis-${n}.png`);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});
const log = console.log;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 640, height: 520 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => log('PAGEERROR', String(e).slice(0, 200)));
  await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await p.evaluate(() => { perfWatch = () => {}; });
  await p.evaluate(() => {
    document.getElementById('adv-box').open = true;
    document.getElementById('skip-handoff').checked = true;
  });
  await p.click('#btn-start');
  await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
  await sleep(1500);

  // ── 1. 定格 3D 牌面（用游戏自己的 setCardFace 材质 + 摆 pose）──
  const cardInfo1 = await p.evaluate(() => {
    setCardFace('chance', CARDS.chance[0].text);   // 🎉 生日快乐！向每位玩家收 ¥500
    cardPivot.visible = true;
    cardPivot.rotation.x = 0;                      // 盖着（游戏 revealCard 起始 pose）
    cardMesh.material.opacity = 1;
    rig.token++; rig.autoDist = false;
    rig.az = 0.5; rig.elev = 32 * D2R; rig.dist = nearDist() * 0.92; rig.focusK = 1;
    rig.tgt = { x: 0, y: 0.3, z: 0 };
    camApply();
    return {
      hasMap: !!cardMesh.material.map, mapW: cardMesh.material.map ? cardMesh.material.map.image.width : 0,
      opacity: cardMesh.material.opacity, visible: cardPivot.visible,
      pivotPos: cardPivot.position.toArray().map(v => +v.toFixed(2)),
      meshWorld: cardMesh.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(2)),
      side: cardMesh.material.side, transparent: cardMesh.material.transparent,
    };
  });
  log('staged card:', JSON.stringify(cardInfo1));
  await p.screenshot({ path: shot('x1-card-staged-covered') });
  // 顶视验证「盖着到底显示什么」
  await p.evaluate(() => { rig.elev = 80 * D2R; rig.dist = 3.2; camApply(); });
  await sleep(150);
  await p.screenshot({ path: shot('x2-card-staged-covered-topdown') });
  // 翻开中途 90°（竖立面向镜头）
  await p.evaluate(() => { cardPivot.rotation.x = Math.PI / 2; rig.elev = 32 * D2R; rig.dist = nearDist() * 0.92; camApply(); });
  await sleep(150);
  await p.screenshot({ path: shot('x3-card-staged-midflip') });
  // 翻开完成（rot=π，游戏读牌期 pose）32° 机位 + 顶视
  await p.evaluate(() => { cardPivot.rotation.x = Math.PI; camApply(); });
  await sleep(150);
  await p.screenshot({ path: shot('x4-card-staged-open') });
  await p.evaluate(() => { rig.elev = 62 * D2R; rig.dist = 3.4; camApply(); });
  await sleep(150);
  await p.screenshot({ path: shot('x5-card-staged-open-high') });
  // 复位
  await p.evaluate(() => { cardPivot.visible = false; rig.autoDist = true; rig.elev = 42 * D2R; rig.dist = baseDist(); rig.tgt = { x: 0, y: 0.3, z: 0 }; camApply(); });

  // ── 2. 名牌近景（棋子+名牌同时入画）──
  const plateInfo = await p.evaluate(() => {
    __mono.forcePos(0, 2);              // 小巷集市（南边）
    layoutPlates();
    const sp = plateSprites[0], grp = pawnObjs[0];
    rig.token++; rig.autoDist = false;
    rig.az = Math.atan2(grp.position.x, grp.position.z);
    rig.elev = 38 * D2R;                // 压低仰角让竖向空间入画
    rig.dist = 3.4;
    rig.tgt = { x: grp.position.x * 0.8, y: 0.55, z: grp.position.z * 0.8 };   // 抬高注视点容纳名牌
    camApply();
    const v = sp.position.clone().project(camera);
    const pxH = (0.215 / camera.position.distanceTo(sp.position)) * (innerHeight / (2 * Math.tan(camera.fov * D2R / 2)));
    return {
      plateVisible: sp.visible, platePos: sp.position.toArray().map(x => +x.toFixed(2)),
      pawnPos: grp.position.toArray().map(x => +x.toFixed(2)),
      projY: +v.y.toFixed(2), projPxH: Math.round(pxH),
    };
  });
  log('plate near:', JSON.stringify(plateInfo));
  await sleep(250);
  await p.screenshot({ path: shot('x6-plate-closeup') });
  // 名牌在格面上的对照（把相机压向牌面出格子的边界）
  await p.evaluate(() => {
    const sp = plateSprites[0], grp = pawnObjs[0];
    rig.az = Math.atan2(grp.position.x, grp.position.z) + 0.35;
    rig.elev = 30 * D2R; rig.dist = 2.6;
    rig.tgt = { x: grp.position.x * 0.9, y: 0.5, z: grp.position.z * 0.9 };
    camApply();
  });
  await sleep(200);
  await p.screenshot({ path: shot('x7-plate-lowangle') });

  // ── 3. 侧颜：格子侧壁/顶面细节（俯角近景扫南排）──
  await p.evaluate(() => {
    rig.az = 0.15; rig.elev = 24 * D2R; rig.dist = 4.2;
    rig.tgt = { x: 1.0, y: 0.2, z: 2.6 };
    camApply();
  });
  await sleep(200);
  await p.screenshot({ path: shot('x8-tiles-lowangle') });

  await browser.close();
  server.close();
  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
