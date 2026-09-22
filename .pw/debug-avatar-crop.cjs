// 诊断：自定义方形头像在 3D 脸/2D 大厅格子里各被裁多少（真实三页加入）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8870;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = `http://127.0.0.1:${PORT}/index.html?game=tod`;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 20000 });
  await p.evaluate(() => {
    try { closeGuide(); } catch {}
    try { localStorage.setItem('tod:perf', 'full'); } catch {}
    // 画一张 512 方图：红底（最外层）+ 四角黄三角 + 中央青色圆脸黑眼——被裁立刻可读
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#ff3355'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#ffd76a';
    [[0, 0], [448, 0], [0, 448], [448, 448]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 64, y); g.lineTo(x, y + 64); g.fill(); });
    g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(256, 256, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b1a';
    g.beginPath(); g.arc(206, 226, 22, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(306, 226, 22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0b0b1a'; g.lineWidth = 14; g.beginPath(); g.arc(256, 296, 56, 0.2, Math.PI - 0.2); g.stroke();
    const url = cv.toDataURL('image/png');
    localStorage.setItem('tod:me', JSON.stringify({ name: '裁剪测试', avatar: '' }));
    localStorage.setItem('tod:me:avatar', url);
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 20000 });
  await p.evaluate(() => { try { closeGuide(); } catch {} });
  await sleep(600);
  await p.screenshot({ path: `${ROOT}/.pw/shots/avcrop-join.png` });
  await p.evaluate(() => { const c = document.getElementById('chk-local'); if (c && !c.checked) c.click(); });
  await p.fill('#input-name', '裁剪测试');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  await sleep(800);
  await p.screenshot({ path: `${ROOT}/.pw/shots/avcrop-lobby.png` });

  const room = await p.evaluate(() => S.room);
  const qobot = [];
  for (const nm of ['机器人甲', '机器人乙', '机器人丙']) {
    const q = await ctx.newPage();
    await q.goto(URL_, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#screen-join.active', { timeout: 20000 });
    await q.evaluate(() => { try { closeGuide(); } catch {} try { localStorage.setItem('tod:perf', 'full'); } catch {} });
    await q.evaluate(() => { const c = document.getElementById('chk-local'); if (c && !c.checked) c.click(); });
    await q.fill('#input-name', nm);
    await q.fill('#input-room', room);
    await q.click('#btn-join');
    await q.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    qobot.push(q);
  }
  await p.bringToFront();
  await sleep(800);
  await p.click('#btn-start', { force: true });
  await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g) g.hidden = true; });
  await p.waitForSelector('#screen-game.active', { timeout: 25000 });
  await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g) g.hidden = true; });
  await sleep(4000);
  await p.screenshot({ path: `${ROOT}/.pw/shots/avcrop-game.png` });
  const info = await p.evaluate(() => {
    const t = window.__three; if (!t) return { none: true };
    const out = [];
    const ents = t.chars instanceof Map ? [...t.chars.entries()] : Object.entries(t.chars || {});
    for (const [pid, ch] of ents) {
      const f = ch.userData && ch.userData.face;
      const m = f && f.material.map;
      const row = { pid, hasMap: !!m, hasImg: !!(m && m.image) };
      if (m && m.image && m.image.getContext) {
        const g2 = m.image.getContext('2d');
        const px = (x, y) => Array.from(g2.getImageData(x, y, 1, 1).data);
        row.center = px(128, 128); row.corner = px(4, 4); row.edgeMid = px(128, 4); row.diag45 = px(45, 20);
      }
      out.push(row);
    }
    return out;
  });
  console.log('faces=', JSON.stringify(info));
  await browser.close();
  server.close();
})().catch(e => { console.error(e.message); process.exit(1); });
