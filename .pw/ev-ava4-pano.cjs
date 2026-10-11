#!/usr/bin/env node
/* ev-ava4-pano.cjs — 验收线3（value expert）：全景档行动者棋子恒入画（cy ∈ [0, vh−40]）。
   autotest 热座档（与 ev-avatars-mono 热座段同路径，避开真机 UI 慢启动的 loperf 干扰）；
   GO 聚集（开局全员 pos=0）是最恶劣构型，量它。端口 9221。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9221;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': '.html' === path.extname(f) ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mono && window.__mono.faces && window.__mono.faces().length >= 2, null, { timeout: 30000 });
  await page.waitForFunction(() => { const f = window.__mono && window.__mono.faces(); return f && f.length >= 2 && f.every(x => !x.fb && x.loaded); }, null, { timeout: 30000 });   // monopoly 无 three3d 类（那是 tod 的）——以特征头落位为 GL 前提
  await sleep(3200);   // 入场运镜 + 全景档（focusPawn back=OV_TGT_K/OV_DIST_ADD 偏移）落定
  // 探针挂投影量测（只读）：pawn 世界坐标 → 相机投影
  const meas = await page.evaluate(() => {
    const M = window.__mono;
    const cam = M.camPos();
    const out = { vh: innerHeight, vw: innerWidth, turn: M.state.turn, rig: M.rigSnap(), pawns: [] };
    const v = new THREE.Vector3();
    M.pawnWorld().forEach((w, i) => {
      v.set(w[0], w[1], w[2]).project ? null : null;
      out.pawns.push({ i, w });
    });
    return out;
  }).catch(() => null);
  // pawnWorld 只给世界坐标；投影用 THREE 在页内现算（cam 由 camPos 反推不够——直接用 __mono.rigSnap 不行，走页内 THREE）
  const meas2 = await page.evaluate(() => {
    const M = window.__mono;
    const pr = M.camPr ? M.camPr() : null;
    if (!pr) return null;
    const mW = new THREE.Matrix4().fromArray(pr.i);
    const mP = new THREE.Matrix4().fromArray(pr.p);
    const v = new THREE.Vector3();
    const out = { vh: innerHeight, vw: innerWidth, turn: M.state.turn, rig: M.rigSnap ? M.rigSnap() : null, anchor: M.distAnchor ? M.distAnchor() : null, pawns: [] };
    M.pawnWorld().forEach((w, i) => {
      v.set(w[0], w[1] + 0.2, w[2]).applyMatrix4(mW).applyMatrix4(mP);
      out.pawns.push({ i, cx: Math.round((v.x * 0.5 + 0.5) * innerWidth), cy: Math.round((-v.y * 0.5 + 0.5) * innerHeight) });
    });
    return out;
  });
  ok(!!meas2, '3D 场景相机在位（投影可算）');
  if (meas2) {
    console.log('  [pano]', JSON.stringify(meas2));
    const vh = meas2.vh, vw = meas2.vw;
    const inF = meas2.pawns.filter(q => q.cy > 0 && q.cy < vh - 40 && q.cx > 30 && q.cx < vw - 30);
    ok(inF.length === meas2.pawns.length, `GO 聚集档全景四子全入画（${inF.length}/${meas2.pawns.length}，cy=${meas2.pawns.map(q => q.cy).join(',')}，阈值 <${vh - 40}）`);
    const actor = meas2.pawns.find(q => q.i === meas2.turn) || meas2.pawns[0];
    ok(actor.cy > 0 && actor.cy < vh - 40 && actor.cx > 30 && actor.cx < vw - 30, `行动者（turn=${meas2.turn}）棋子 100% 画内（cx=${actor.cx}, cy=${actor.cy}）`);
  }
  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 2).join(' | ') || 'clean'}）`);
  console.log(`RESULT: ${pass} pass / ${fail} fail`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
