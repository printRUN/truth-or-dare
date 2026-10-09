// sim-B-uno.cjs — 真实玩家模拟 B 组 · uno.html（brief-av3-sim，端口 9143）
// 4 真人联机（host=南位 + 3 join 各带特征头像）→ 全景 + 逐对手半身像截图 + 元数据落盘。
// AUTOTEST 下 bodyLo 冻连续渲染：每张截图前 __uno.forceRender()（brief 纪律）。
// 只读取证 + 只写 .pw/persona-av3/ 与 .pw/shots/av3-persona/；不改仓库任何现有文件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9143;
const ROOM = '91432';
const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const HERE = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// host=南位（3D 不建自己 bust，只有 HUD）；3 个 join=北弧半身像
const PLAYERS = [
  { name: '阿凯', style: 'micah',      seed: 'b10', bg: 'fde68a', tag: '深肤·金棕长发·方框眼镜（南位=自己，仅 HUD）' },
  { name: '粉毛', style: 'avataaars',  seed: 'b07', bg: 'fbcfe8', tag: '浅肤·粉色长发' },
  { name: '小丸', style: 'adventurer', seed: 'b11', bg: 'bbf7d0', tag: '浅肤·金发双丸子头（与 monopoly 同头像，跨游戏对比）' },
  { name: '光头', style: 'avataaars',  seed: 'b05', bg: 'fed7aa', tag: '浅肤·秃头' },
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
    watch(pg, 'u' + i);
    const av = rep(PLAYERS[i]);
    await pg.addInitScript(av => { try { localStorage.setItem('uno:avatar', av); } catch (e) {} }, av);
    const role = i === 0 ? 'host' : 'join';
    const url = `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=${ROOM}&q=ub${i}&role=${role}&name=${encodeURIComponent(PLAYERS[i].name)}`;
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await pg.evaluate(() => { try { if (typeof window.setBodyLo === 'function') { const real = window.setBodyLo; window.setBodyLo = on => { if (!on) real(false); }; } } catch (e) {} }).catch(() => {});
    await pg.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 20000 });
    pages.push(pg);
    console.log('u' + i, PLAYERS[i].name, 'joined');
  }
  await pages[0].waitForFunction(() => window.__uno.net().doc.players.length === 4, null, { timeout: 15000 });

  await pages[0].evaluate(() => window.__uno.net().start({}));
  for (let i = 0; i < 4; i++) {
    await pages[i].waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 4, null, { timeout: 20000 });
  }
  await pages[0].waitForFunction(() => { const a = window.__uno.avatars(); return a.seats.length === 3 && a.seats.every(s => s.loaded && !s.fb && /^#[0-9a-f]{6}$/.test(s.hair)); }, null, { timeout: 20000 });
  console.log('started, 3 busts loaded');

  const docPlayers = await pages[0].evaluate(() => window.__uno.net().doc.players.map(p => ({ name: p.name, av: p.av })));
  console.log('doc:', JSON.stringify(docPlayers));
  const seats = await pages[0].evaluate(() => window.__uno.avatars());
  console.log('seats:', JSON.stringify(seats.seats));

  await sleep(800);
  await pages[0].evaluate(() => window.__uno.forceRender());
  await pages[0].screenshot({ path: path.join(SHOTS, 'b-uno-overview.png') });
  console.log('overview done');

  const bodyLo0 = await pages[0].evaluate(() => window.__uno.camInfo().lo);
  const meta = { game: 'uno', room: ROOM, bodyLoAfterBoot: bodyLo0, docPlayers, seats: seats.seats, players: [] };
  for (let k = 0; k < seats.seats.length; k++) {
    const s = seats.seats[k];
    const seatIdx = k + 1;   // busts 按 seat 顺序跳过 south：seats[0]=seat1
    const info = await pages[0].evaluate(([k, s]) => {
      // uno camApply 的相机位置=从原点出发的 (d·cosE·sinAz, d·sinE, d·cosE·cosAz)，与 tgt 无关：
      // 想把相机放到 bust 正南方 L 处平视脸（bust 恒朝南），必须反解 az/elev/focusK。
      const tgt = { x: s.x, y: s.y + 0.595 + 0.02, z: s.z };
      const camY = tgt.y + 0.62, L = 1.15;   // 抬高 0.62：越过座位铭牌（牌顶≈0.97，正面机位下会被它遮死）
      const baseD = Math.max(6.4, 4.6 / (Math.tan(21 * Math.PI / 180) * (innerWidth / innerHeight)), (5.4 * Math.sin(46 * Math.PI / 180)) / Math.tan(21 * Math.PI / 180) * 0.92);
      const az = Math.atan2(tgt.x, tgt.z + L);
      const rad = Math.hypot(tgt.x, tgt.z + L);
      const d = Math.hypot(rad, camY);
      window.camTo({ az, elev: Math.asin(camY / d), focusK: d / baseD, tgt }, 400);
      const eye = { x: tgt.x, y: camY, z: tgt.z + L };
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(eye.x, eye.y, eye.z), new THREE.Vector3(tgt.x, tgt.y, tgt.z), new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3(tgt.x - eye.x, tgt.y - eye.y, tgt.z - eye.z).applyMatrix4(m.clone().invert());
      const halfV = Math.tan(21 * Math.PI / 180);
      const sx = (v.x / (-v.z * halfV * (innerWidth / innerHeight)) * 0.5 + 0.5) * innerWidth;
      const sy = (-v.y / (-v.z * halfV) * 0.5 + 0.5) * innerHeight;
      return { screen: { x: sx, y: sy }, tgt, cam: { az, elev: Math.asin(camY / d), focusK: d / baseD } };
    }, [k, s]);
    await sleep(700);
    await pages[0].evaluate(() => window.__uno.forceRender());
    const shot = `b-uno-face-${seatIdx}.png`;
    await pages[0].screenshot({ path: path.join(SHOTS, shot) });
    const uri = s.key.split('|').slice(1).join('|');   // uno net() 无 av 钩子；faceKey 本身=色座|解析后URI
    meta.players.push({ seat: seatIdx, k, ...PLAYERS[seatIdx], av: rep(PLAYERS[seatIdx]), uri, hair: s.hair, pos: { x: s.x, y: s.y, z: s.z }, screen: info.screen, shot });
    console.log(`face-${seatIdx} ${PLAYERS[seatIdx].name} hair=${s.hair} screen=${Math.round(info.screen.x)},${Math.round(info.screen.y)}`);
  }
  meta.pageErrors = errs;
  fs.writeFileSync(path.join(HERE, 'uno-meta.json'), JSON.stringify(meta, null, 2));
  console.log('meta written. pageErrors:', JSON.stringify(errs));

  await browser.close();
  server.close();
  console.log('UNO DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
