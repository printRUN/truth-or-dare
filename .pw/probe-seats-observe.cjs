// 观察探针：座位分布现状（多人围桌均匀性 + 有人中途加入时的重排表现）
// ① 3 人局截图看分布；② 中途 +2 人，采样 3D 人物 seat 变化（瞬移 or 渐变）+ 截图
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8879;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
function mkP(id, name) {
  return { id, name, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() };
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.fill('#input-name', '测座');
  await p.click('details.adv summary'); await p.click('#chk-local'); await p.click('.avatar-option >> nth=0'); await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  // 3 人局：我 + 2 人
  await p.evaluate(() => {
    mutate(s => s.players.push(mkP2('zz0', '小雨'), mkP2('zz1', '阿豪')));
    function mkP2(id, name) { return { id, name, avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() }; }
  });
  await p.click('#mode-pick .mode-opt[data-mode="free"]');
  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 20000 });
  await p.waitForTimeout(4500);
  const dumpSeats = () => p.evaluate(() => {
    const out = { n: S.players.length, stage: S.turn.stage, angles: {}, seats: {} };
    for (const [pid, ch] of window.__three.chars) {
      out.angles[pid] = (window.__seatAngleByPid || {})[pid];
      out.seats[pid] = { x: +ch.position.x.toFixed(3), z: +ch.position.z.toFixed(3) };
    }
    return out;
  });
  const s3 = await dumpSeats();
  console.log('[3p]', JSON.stringify(s3));
  await p.screenshot({ path: 'shots/seats-3p.png' });

  // 中途加入 2 人（间隔 1.2s，模拟真实先后加入）
  const samples = [];
  await p.evaluate(() => {
    window.__seatSamples = [];
    const t0 = performance.now();
    window.__sampleTimer = setInterval(() => {
      const row = { t: Math.round(performance.now() - t0), seats: {} };
      for (const [pid, ch] of window.__three.chars) row.seats[pid] = [+ch.position.x.toFixed(2), +ch.position.z.toFixed(2)];
      window.__seatSamples.push(row);
    }, 120);
  });
  await p.evaluate(() => mutate(s => s.players.push({ id: 'zz2', name: '婷婷', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })));
  await p.waitForTimeout(1400);
  await p.evaluate(() => { mutate(s => s.players.push({ id: 'zz3', name: '大飞', avatar: '😀', isHost: false, ready: true, micOn: false, online: true, skips: 0, draws: 0, truth: 0, dare: 0, score: 0, passes: 2, lastSeen: Date.now(), joinedAt: Date.now() })); });
  await p.waitForTimeout(3500);
  const s5 = await dumpSeats();
  console.log('[5p]', JSON.stringify(s5));
  await p.screenshot({ path: 'shots/seats-5p.png' });
  const raw = await p.evaluate(() => window.__seatSamples);
  // 判定瞬移：相邻采样点同 pid 位移 > 0.5 单位即视为跳变
  const jumps = [];
  for (let i = 1; i < raw.length; i++) {
    for (const pid in raw[i].seats) {
      const a = raw[i - 1].seats[pid], b = raw[i].seats[pid];
      if (!a) continue;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0.5) jumps.push({ t: raw[i].t, pid, d: +d.toFixed(2), from: a, to: b });
    }
  }
  console.log('[jumps>0.5u]', JSON.stringify(jumps));
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors ✅');
  await browser.close(); server.close();
})();
