#!/usr/bin/env node
/* diag-ava-feats.cjs — 提取器信号实测（端口 9095）：对目标 dcb 案例跑与游戏同源的 extractAvatarFeatures，
   输出 feats + hairMaskMetrics 关键账（topMass/bunW/maxRowW/fringe/sideMass/edgeJag/hairLen），供假发/假秃判别器定参。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9095;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.js': 'text/javascript' }[path.extname(f)] || 'text/plain'); res.end(d); } });
});
const CASES = [
  ['micah', 'Felix'], ['micah', 'A1-0'], ['micah', 'D4-3'], ['micah', 'Jill'],
  ['adventurer', 'Maria'], ['avataaars', 'Jill'], ['adventurer', 'Felix'], ['personas', 'Maria'],
  ['pixel-art', 'TOD-P00'], ['open-peeps', 'Maria'],
];
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('⚠', e.message.slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/.pw/lab-blank.html`, { waitUntil: 'domcontentloaded' }).catch(async () => {
    await page.setContent('<html><body></body></html>');
  });
  // 直接注入脚本源码（blank 页不存在时）
  const featsJs = fs.readFileSync(path.join(ROOT, 'avatar-features.js'), 'utf8');
  const diceJs = fs.readFileSync(path.join(ROOT, 'dicebear-local.js'), 'utf8');
  const threeJs = fs.readFileSync(path.join(ROOT, 'three.r128.js'), 'utf8');
  await page.addScriptTag({ content: threeJs });
  await page.addScriptTag({ content: diceJs });
  await page.addScriptTag({ content: featsJs });
  const out = await page.evaluate(async CASES => {
    const rows = [];
    for (const [style, seed] of CASES) {
      const svg = DiceBearLocal.diceAvatar(style, { seed }).toString();
      const uri = svg.startsWith('data:') ? svg : 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
      const img = new Image(); img.crossOrigin = 'anonymous';
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = uri; });
      let f = null;
      try { f = await AV3.extractAvatarFeatures(img, { style, seed }); } catch (e) { f = { err: e.message }; }
      if (!f) { rows.push({ style, seed, err: 'null' }); continue; }
      // 同源内部件直调：钉扎结果 + 顶带三账 + 候选簇表
      let pin = null, accts = null;
      try {
        const jobs = AV3.makePinJobs(style, seed);
        if (jobs) {
          pin = {};
          await Promise.all(jobs.map(j => j.result.then(v => { pin[j.tag] = v; })));
        }
      } catch (e) { pin = { err: e.message }; }
      try {
        const data = (typeof avatarImageDataRetry === 'function') ? await avatarImageDataRetry(img, 128) : null;
        if (data) {
          const { at, isBg, clusters, N, w, h } = pixelClusters(data, 128, 128);
          let tAll = 0, tSkin = 0;
          const skinMean = f.skin ? [parseInt(f.skin.slice(1, 3), 16), parseInt(f.skin.slice(3, 5), 16), parseInt(f.skin.slice(5, 7), 16)] : null;
          for (let y = 0; y < 0.30 * h; y++) for (let x = 0; x < w; x++) {
            const p = at(x, y);
            if (isBg(p)) continue;
            tAll++;
            if (skinMean && dist3([p[0], p[1], p[2]], skinMean) < 0.10) tSkin++;
          }
          accts = {
            tAllN: +(tAll / N).toFixed(4), tSkinN: +(tSkin / N).toFixed(4),
            clusters: clusters.slice(0, 6).map(c => ({ n: +(c.n / N).toFixed(4), mean: hexc ? hexc(c.mean) : c.mean.map(v => v | 0), topN: +(c.topN / N).toFixed(4), sideN: +(c.sideN / N).toFixed(4) })),
          };
        }
      } catch (e) { accts = { err: e.message }; }
      rows.push({ style, seed, person: f.person, skin: f.skin, hair: f.hair, guess: f.hairGuess, styleOut: f.style, glasses: f.glasses, beard: f.beard, mouth: f.mouth, hairLen: f.hairLen && +f.hairLen.toFixed(3), hairWid: f.hairWid && +f.hairWid.toFixed(3), pin, accts });
    }
    return rows;
  }, CASES);
  for (const r of out) console.log(JSON.stringify(r));
  await browser.close();
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
