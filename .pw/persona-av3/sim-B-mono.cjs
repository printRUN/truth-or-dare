// sim-B-mono.cjs — 真实玩家模拟 B 组 · monopoly.html（brief-av3-sim，端口 9143）
// 4 真人联机（host+3 join，各带特征鲜明 dcb 头像）→ 全景 + 逐棋子近景截图 + 元数据落盘。
// 只读取证 + 只写 .pw/persona-av3/ 与 .pw/shots/av3-persona/；不改仓库任何现有文件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9143;
const ROOM = '91431';
const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const HERE = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 4 个特征鲜明头像（contact sheet 人工选型，覆盖：深肤+长发+眼镜 / 深肤+胡子 / 丸子头 / 蓝发+胡渣）
const PLAYERS = [
  { name: '阿凯', style: 'micah',      seed: 'b10', bg: 'fde68a', tag: '深肤·金棕长发·方框眼镜' },
  { name: '老周', style: 'miniavs',    seed: 'b11', bg: 'ddd6fe', tag: '深棕肤·短发·髭+山羊胡' },
  { name: '小丸', style: 'adventurer', seed: 'b11', bg: 'bbf7d0', tag: '浅肤·金发双丸子头' },
  { name: '蓝仔', style: 'dylan',      seed: 'b10', bg: 'bfdbfe', tag: '浅肤·蓝刺头·胡渣' },
];
const rep = p => 'dcb:' + JSON.stringify({ s: p.style, d: p.seed, b: p.bg });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const watch = (pg, tag) => pg.on('pageerror', e => errs.push(tag + ':' + e.message.slice(0, 120)));

  const pages = [];
  for (let i = 0; i < 4; i++) {
    const pg = await ctx.newPage();
    watch(pg, 'p' + i);
    const av = rep(PLAYERS[i]);
    await pg.addInitScript(av => { try { localStorage.setItem('mono:avatar', av); } catch (e) {} }, av);
    const role = i === 0 ? 'host' : 'join';
    const url = `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=${ROOM}&q=mb${i}&role=${role}&name=${encodeURIComponent(PLAYERS[i].name)}`;
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    // AUTOTEST 下慢窗会 setBodyLo(true) 永久冻渲染：哑化降级入口保住连续渲染（只影响本页面内存，非仓库文件）
    await pg.evaluate(() => { try { if (typeof window.setBodyLo === 'function') { const real = window.setBodyLo; window.setBodyLo = on => { if (!on) real(false); }; } } catch (e) {} }).catch(() => {});
    await pg.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 20000 });
    pages.push(pg);
    console.log('p' + i, PLAYERS[i].name, 'joined');
  }
  await pages[0].waitForFunction(() => window.__mono.net().doc.players.length === 4, null, { timeout: 15000 });

  await pages[0].evaluate(() => window.__mono.net().start({}));
  for (let i = 0; i < 4; i++) {
    await pages[i].waitForFunction(() => window.__mono.net().doc.started && window.__mono.state.players.length === 4, null, { timeout: 20000 });
  }
  await pages[0].waitForFunction(() => window.__mono.faces().length === 4 && window.__mono.faces().every(f => f && f.loaded && !f.fb && /^#[0-9a-f]{6}$/.test(f.hair)), null, { timeout: 20000 });
  console.log('started, 4 faces loaded');

  const docPlayers = await pages[0].evaluate(() => window.__mono.net().doc.players.map(p => ({ name: p.name, av: p.av })));
  console.log('doc:', JSON.stringify(docPlayers));

  // 摊开到四边中段（3/2 南边相邻、15/14 北边相邻）再拍全景 + 两两同框
  await pages[0].evaluate(() => { window.__mono.forcePos(0, 3); window.__mono.forcePos(1, 2); window.__mono.forcePos(2, 15); window.__mono.forcePos(3, 14); });
  await sleep(1000);
  await pages[0].screenshot({ path: path.join(SHOTS, 'b-mono-overview.png') });
  console.log('overview done');

  // 两两同框中景（相邻两子各占半幅，直接对比「是否一眼同一人」）
  for (const [a, b, tag] of [[0, 1, '01'], [2, 3, '23']]) {
    await pages[0].evaluate(([a, b]) => {
      const wa = window.__mono.pawnWorld()[a], wb = window.__mono.pawnWorld()[b];
      const tgt = { x: (wa[0] + wb[0]) / 2, y: 0.72, z: (wa[2] + wb[2]) / 2 };
      const az = Math.atan2(tgt.x, tgt.z);
      window.camTo({ az, elev: 12 * Math.PI / 180, dist: 1.9, tgt }, 700);
    }, [a, b]);
    await sleep(1300);
    await pages[0].screenshot({ path: path.join(SHOTS, `b-mono-pair-${tag}.png`) });
    console.log(`pair-${tag} done`);
  }

  // 近景：camTo（页面全局函数）逐棋子推近，头填画面；同步记录头投影屏幕坐标
  const bodyLo0 = await pages[0].evaluate(() => window.__mono.sceneInfo().bodyLo);
  const meta = { game: 'monopoly', room: ROOM, bodyLoAfterBoot: bodyLo0, players: [] };
  for (let i = 0; i < 4; i++) {
    const info = await pages[0].evaluate(i => {
      const w = window.__mono.pawnWorld()[i];
      const tgt = { x: w[0], y: w[1] + 0.375 + 0.02, z: w[2] };
      const az = Math.atan2(tgt.x, tgt.z), elev = 10 * Math.PI / 180, dist = 0.72;
      window.camTo({ az, elev, dist, tgt }, 700);
      // 投影头中心 → 屏幕像素（fov42，与页面相机同参）
      const eye = { x: tgt.x + dist * Math.cos(elev) * Math.sin(az), y: tgt.y + dist * Math.sin(elev), z: tgt.z + dist * Math.cos(elev) * Math.cos(az) };
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(eye.x, eye.y, eye.z), new THREE.Vector3(tgt.x, tgt.y, tgt.z), new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3(tgt.x - eye.x, tgt.y - eye.y, tgt.z - eye.z).applyMatrix4(m.clone().invert());
      const halfV = Math.tan(21 * Math.PI / 180);
      const sx = (v.x / (-v.z * halfV * (innerWidth / innerHeight)) * 0.5 + 0.5) * innerWidth;
      const sy = (-v.y / (-v.z * halfV) * 0.5 + 0.5) * innerHeight;
      return { tgt, screen: { x: sx, y: sy }, face: window.__mono.faces()[i], world: w };
    }, i);
    await sleep(1300);
    const shot = `b-mono-face-${i}.png`;
    await pages[0].screenshot({ path: path.join(SHOTS, shot) });
    const uri = await pages[0].evaluate(i => (window.__mono.net().av(i).match(/src="([^"]+)"/) || ['', ''])[1], i);
    meta.players.push({ i, ...PLAYERS[i], av: rep(PLAYERS[i]), uri, face: info.face, world: info.world, screen: info.screen, shot });
    console.log(`face-${i} ${PLAYERS[i].name} hair=${info.face && info.face.hair} screen=${Math.round(info.screen.x)},${Math.round(info.screen.y)}`);
  }
  meta.pageErrors = errs;
  fs.writeFileSync(path.join(HERE, 'mono-meta.json'), JSON.stringify(meta, null, 2));
  console.log('meta written. pageErrors:', JSON.stringify(errs));

  await browser.close();
  server.close();
  console.log('MONO DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
