// 取证探针：大富翁 镜头随流程定位 + 棋子是否移动（真实渲染，不带 loperf）
// 采样 pawnObjs 世界坐标 / rig 镜头参数 / phase / bodyLo + 定期截图
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8931;
const URL = `http://127.0.0.1:${PORT}/monopoly.html?autotest=1`;
const SHOTS = "D:/myidea/truth-or-dare/.pw/shots/ev-mono-desk";
fs.mkdirSync(SHOTS, { recursive: true });

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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });   // 手机竖屏档
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('unhandledrejection', e => errs.push('REJ:' + String(e && e.reason).slice(0, 160)));

  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
  await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 30000 });

  // 安装采样器：120ms 一次
  await p.evaluate(() => {
    window.__EV = [];
    window.__evOn = true;
    const snap = () => {
      if (!window.__evOn) return;
      try {
        const G = __mono.state;
        const info = __mono.sceneInfo();
          const rig = __mono.rigSnap ? __mono.rigSnap() : null;
          window.__EV.push({
            t: Date.now(), ph: G.phase, turn: G.turn,
            pos: G.players.map(x => x.pos),
            world: (__mono.pawnWorld ? __mono.pawnWorld() : []),
            rig, bodyLo: !!info.bodyLo,
          });
      } catch (e) { window.__EV.push({ t: Date.now(), err: String(e).slice(0, 80) }); }
      setTimeout(snap, 120);
    };
    snap();
  });

  // 驱动 30s：真人回合自动掷骰，买地弹窗点「买」，其余交给机器人
  const t0 = Date.now();
  let shotI = 0;
  while (Date.now() - t0 < 30000) {
    const st = await p.evaluate(() => ({
      ph: __mono.state.phase, modal: !document.getElementById('buy-modal').hidden,
      gen: !document.getElementById('gen-modal').hidden,
      handoff: !document.getElementById('handoff').hidden,
    })).catch(() => ({ dead: true }));
    if (st.dead) break;
    if (st.modal) await p.evaluate(() => __mono.buy(true));
    else if (st.gen) await p.evaluate(() => { const b = document.querySelector('#gen-actions button'); if (b) b.click(); });
    else if (st.handoff) await p.evaluate(() => __mono.handoff());
    else if (st.ph === 'AWAIT_ROLL') await p.evaluate(() => __mono.step());
    await p.waitForTimeout(300);
    if ((Date.now() - t0) / 1500 > shotI) {
      shotI++;
      try { await p.screenshot({ path: `${SHOTS}/s${String(shotI).padStart(2, '0')}.png` }); } catch (e) {}
    }
  }
  await p.evaluate(() => { window.__evOn = false; });

  // 汇总：每 1s 打一行相位/坐标/镜头
  const ev = await p.evaluate(() => window.__EV);
  let last = 0;
  console.log('=== 时间线（1s 粒度） ===');
  for (const e of ev) {
    if (e.t - last < 1000) continue;
    last = e.t;
    const w = (e.world || []).map(v => v.map(n => +n.toFixed(2)).join(',')).join(' | ');
    const r = e.rig ? `az=${(e.rig.az * 57.3).toFixed(0)}° elev=${(e.rig.elev * 57.3).toFixed(0)}° d=${e.rig.dist.toFixed(1)} fk=${e.rig.focusK.toFixed(2)} tgt=(${e.rig.tgt.x.toFixed(2)},${e.rig.tgt.z.toFixed(2)})` : 'rig?';
    console.log(`t=${((e.t - ev[0].t) / 1000).toFixed(1)}s ${e.ph} turn=${e.turn} pos=[${e.pos}] lo=${e.bodyLo ? 1 : 0} ${r}`);
    console.log(`    pawn:[${w}]`);
  }
  const hops = [];
  for (let i = 1; i < ev.length; i++) {
    const a = ev[i - 1], b = ev[i];
    if (!a.world || !b.world || a.world.length !== b.world.length) continue;
    b.world.forEach((w, j) => {
      const aw = a.world[j]; if (!aw) return;
      const d = Math.hypot(w[0] - aw[0], w[2] - aw[2]);
      if (d > 0.05) hops.push({ t: b.t - ev[0].t, who: j, ph: b.ph, d: +d.toFixed(2) });
    });
  }
  console.log(`=== 位移事件（>0.05 单位）共 ${hops.length} 次，相位分布 ===`);
  const byPh = {};
  hops.forEach(h => { byPh[h.ph] = (byPh[h.ph] || 0) + 1; });
  console.log(JSON.stringify(byPh));
  console.log('=== JS 错误 ===');
  console.log(errs.length ? errs.join('\n') : '(无)');
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
