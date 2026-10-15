#!/usr/bin/env node
/* diag-ava-leak.cjs — B1 脸心泄漏否决数据门（端口 9094）：
   加载 .pw/lab-ava-b1.js（=真源码+B1 试实施+调试出口），跑全部金值夹具 + 实验室 116 案例，
   输出：①夹具级 feats 对比（改前/改后）②泄漏分布③分类直方图 vs before 基线。放行门：
   micah/Felix 必翻 bald；miniavs/Felix、adventurer/avaprobeU、avataaars|adventurer avaprobeB、
   adventurer/Maria、personas/Maria 等真发/真劈分案例不许翻。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9094;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.js': 'text/javascript' }[path.extname(f)] || 'text/plain'); res.end(d); } });
});
const FIXTURES = [
  ['micah', 'Felix'], ['micah', 'A1-0'], ['micah', 'D4-3'], ['micah', 'Jill'],
  ['adventurer', 'Maria'], ['avataaars', 'Jill'], ['miniavs', 'Felix'], ['personas', 'Maria'],
  ['adventurer', 'Felix'], ['open-peeps', 'Maria'], ['pixel-art', 'TOD-P00'],
];
(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('⚠', e.message.slice(0, 140)));
  await page.goto(`http://127.0.0.1:${PORT}/.pw/blank.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const threeJs = fs.readFileSync(path.join(ROOT, 'three.r128.js'), 'utf8');
  const diceJs = fs.readFileSync(path.join(ROOT, 'dicebear-local.js'), 'utf8');
  const b1Js = fs.readFileSync(path.join(ROOT, '.pw', 'lab-ava-b1.js'), 'utf8');
  await page.setContent('<html><body></body></html>').catch(() => {});
  await page.addScriptTag({ content: threeJs });
  await page.addScriptTag({ content: diceJs });
  await page.addScriptTag({ content: b1Js });
  const out = await page.evaluate(async FIXTURES => {
    const mkUri = (st, sd, bg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(DiceBearLocal.diceAvatar(st, bg ? { seed: sd, backgroundColor: [bg] } : { seed: sd }).toString());
    const run = async (st, sd, bg) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = mkUri(st, sd, bg); });
      return AV3.extractAvatarFeatures(img, { style: st, seed: sd });
    };
    window.__AVA_LEAKS = [];
    const rows = [];
    for (const [st, sd] of FIXTURES) {
      const f = await run(st, sd, 'f7eeda');
      await run(st, sd, 'e3ece7');
      await run(st, sd, 'ece2f2');
      await run(st, sd, 'dee9f3');
      rows.push({ style: st, seed: sd, skin: f.skin, hair: f.hair, styleOut: f.style, guess: f.hairGuess });
    }
    // 116 实验室案例（复制 lab-avatars.html buildCases）
    const POPULAR = ['adventurer','avataaars','big-smile','lorelei','micah','miniavs','notionists','open-peeps','personas','croodles','dylan','toon-head','pixel-art','big-ears'];
    const SEEDS = ['TOD-A1','TOD-B2','TOD-C3','TOD-D4'];
    const PRESET_BGS = { 'pixel-art': ['f7eeda','e3ece7','ece2f2','dee9f3','f7e3dd','f1ebda','e7e7ef','eaebeb','f7eeda','e3ece7','ece2f2','dee9f3','f7e3dd','f1ebda'] };
    const BGS = ['f7eeda','e3ece7','ece2f2','dee9f3'];
    const cases = [];
    for (let i = 0; i < 14; i++) cases.push({ style: 'pixel-art', seed: 'TOD-P' + String(i).padStart(2, '0'), bg: PRESET_BGS['pixel-art'][i] });
    for (let i = 14; i < 24; i++) cases.push({ style: 'shapes', seed: 'TOD-S' + String(i).padStart(2, '0'), bg: ['e7e7ef','eaebeb','f7eeda','e3ece7','ece2f2','dee9f3','f7e3dd','f1ebda','e7e7ef','eaebeb'][i - 14] });
    for (const st of POPULAR) for (let k = 0; k < SEEDS.length; k++) cases.push({ style: st, seed: SEEDS[k] + '-' + k, bg: BGS[k] });
    for (const st of ['adventurer', 'toon-head', 'dylan', 'big-ears', 'avataaars', 'open-peeps']) ['ZZ-A7', 'ZZ-K3', 'ZZ-Q9', 'ZZ-M2', 'ZZ-T4', 'ZZ-B8'].forEach((sd, k) => cases.push({ style: st, seed: sd + '-' + st.slice(0, 2) + k, bg: BGS[k % 4] }));
    const hist = {};
    const sigs = new Map();
    let collide = 0;
    const clampHex = c => AV3.clampColor(c, 0.10, 0.68, 0.70);
    window.__AVA_LEAKS.length = 0;
    for (const c of cases) {
      const f = await run(c.style, c.seed, c.bg);
      const st3 = f.style === 'curly' ? 'afro' : f.style === 'twin' ? 'long' : f.style;
      hist[st3] = (hist[st3] || 0) + 1;
      const hairCol = (f.person && f.hair) ? clampHex(f.hair) : (f.hairGuess || st3 === 'bald' ? AV3.clampColor('#4a382c', 0.10, 0.68, 0.70) : '#4a382c');
      const sig = [st3, f.glasses ? 1 : 0, f.beard ? 1 : 0, hairCol].join('|');
      if (f.person) { if (sigs.has(sig)) collide++; else sigs.set(sig, c.style + '/' + c.seed); }
    }
    return { rows, leaks: window.__AVA_LEAKS.slice(), hist, distinct: sigs.size, collide };
  }, FIXTURES);
  console.log('── 夹具（B1 后）──');
  for (const r of out.rows) console.log(JSON.stringify(r));
  console.log('── 劈分案例泄漏账（leak/N, splitDist, veto）──');
  for (const l of out.leaks) console.log(JSON.stringify(l));
  console.log('── 116 案例分类直方图（B1 后）──', JSON.stringify(out.hist));
  console.log('distinct:', out.distinct, 'collide:', out.collide);
  await browser.close();
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
