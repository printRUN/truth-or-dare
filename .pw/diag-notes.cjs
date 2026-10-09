/* diag-notes.cjs —— 大富翁纸币 3D 显示问题取证 v2（端口 9077，只观察不断言）
   rig 直写取景（autoDist=false），棋子摆到可见格位；①常驻钞堆 1/2/3/4 层特写；②干净飞行钞；③散钞。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 9077;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots', 'diag-notes'), { recursive: true });
  const browser = await require(PW).chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 20000 });
  await p.evaluate(() => {
    if (window.setBodyLo) try { setBodyLo(false); } catch (e) {}
    if (window.perfWatch) { try { window.perfWatch = function () {}; } catch (e) {} }
  });
  await p.evaluate(() => startGame({ players: [{ name: '我' }, { name: '乙', bot: true }, { name: '丙', bot: true }, { name: '丁', bot: true }], roundLimit: 30, skipHandoff: true }));
  await p.waitForTimeout(1200);
  await p.evaluate(() => { camTo = () => {}; approachTurn = () => {}; });   // 短路运镜补间：等待期全景档会把 rig 直写拽回全景

  // 棋子摆到四个可见边格，现金设四档 → 1/2/3/4 层钞堆
  await p.evaluate(() => {
    __mono.forcePos(0, 2); __mono.forcePos(1, 8); __mono.forcePos(2, 14); __mono.forcePos(3, 20);
    __mono.forceMoney(0, 800); __mono.forceMoney(1, 5000); __mono.forceMoney(2, 9000); __mono.forceMoney(3, 15000);
  });
  await p.waitForTimeout(900);
  const st = await p.evaluate(() => ({ stacks: __mono.stacks(), pawn: __mono.pawnWorld() }));
  console.log('stacks:', JSON.stringify(st.stacks));

  // 取景助手：rig 直写（tick 每帧从 rig 写相机，autoDist=false 后 dist 不回弹）
  const aim = (x, z, dist, elevDeg) => p.evaluate(([x, z, dist, elev]) => {
    const r = rig; r.autoDist = false; r.token++;
    r.tgt.x = x; r.tgt.y = 0.3; r.tgt.z = z;
    r.dist = dist; r.elev = elev * Math.PI / 180; r.az = 0; camApply();
  }, [x, z, dist, elevDeg]);

  // ① 钞堆特写：每玩家拍一张（锚点=stackAnchor 方向=棋子背桌心 0.55）
  for (let i = 0; i < 4; i++) {
    const w = st.pawn[i];
    const out = Math.atan2(w[0], w[2]);   // 桌心→格位朝向
    const sx = w[0] + Math.sin(out) * 0.55, sz = w[2] + Math.cos(out) * 0.55;
    await aim(sx, sz, 1.7, 38);
    await p.waitForTimeout(250);
    await p.screenshot({ path: ROOT + `/.pw/shots/diag-notes/10-stack-p${i}.png` });
  }

  // ② 干净飞行钞：0→1 支付 ¥1200（1000+100+100 三束），先给 0 充足现金
  await p.evaluate(() => { __mono.forceMoney(0, 5000); });
  await p.waitForTimeout(300);
  const w0 = st.pawn[0], w1 = st.pawn[1];
  await aim((w0[0] + w1[0]) / 2, (w0[2] + w1[2]) / 2, 3.2, 30);
  await p.waitForTimeout(200);
  await p.evaluate(() => __mono.pay(0, 1200, 1));
  await p.waitForTimeout(420);
  await p.screenshot({ path: ROOT + '/.pw/shots/diag-notes/11-flight-mid.png' });
  await p.waitForTimeout(500);
  await p.screenshot({ path: ROOT + '/.pw/shots/diag-notes/12-flight-late.png' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: ROOT + '/.pw/shots/diag-notes/13-flight-after.png' });

  // ③ 破产散钞（对准散钞区）
  const w2 = st.pawn[2];
  await aim(w2[0], w2[2], 2.6, 34);
  await p.waitForTimeout(200);
  await p.evaluate(() => { for (let k = 0; k < 6; k++) noteScatter(pawnNotePos(2), k); });
  await p.waitForTimeout(600);
  await p.screenshot({ path: ROOT + '/.pw/shots/diag-notes/14-scatter.png' });
  await p.waitForTimeout(1500);

  // 全景一张（rig 复位）
  await p.evaluate(() => { rig.autoDist = true; rig.tgt.x = 0; rig.tgt.z = 0; rig.dist = 7.2; rig.elev = 42 * Math.PI / 180; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: ROOT + '/.pw/shots/diag-notes/15-overview.png' });

  console.log('pageerrors:', errs.length ? errs : 'none');
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
