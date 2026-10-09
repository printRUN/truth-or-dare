#!/usr/bin/env node
/* ev-avatars-tod.cjs — tod 特征几何头取证（头像特征强相似轮 SPEC §1.14，端口 9065）：
   ① person 头像（dcb）→ u.face 贴片退役 + 特征子树挂载 + 头球肤色迁移（金值断言）
   ② emoji 头像 → 贴片保留 + 无特征子树
   ③ person→emoji→person 双向翻转零 pageerror
   断言纪律：几何/状态断言为准，截图仅证据附件。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9065;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, 'Content-Type' in {} && { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });

  const openTab = async tag => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(300);
    return p;
  };
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local');
    await p.fill('#input-name', name);
    if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
    await p.click('.avatar-option >> nth=0');
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  };

  // ── 建房 3 人 + 开局 ──
  const host = await openTab('P0');
  await join(host, '阿泽', '');
  const room = (await host.textContent('#share-room')).trim();
  const t2 = await openTab('P1');
  await join(t2, '老白', room);
  const t3 = await openTab('P2');
  await join(t3, '默认仔', room);
  await host.waitForFunction(() => typeof S !== 'undefined' && S && S.players && S.players.length === 3, null, { timeout: 20000 });
  await host.click('#btn-start');
  for (const t of [host, t2, t3]) await t.waitForSelector('#screen-game.active', { timeout: 20000 });
  await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 10000 });
  for (const t of [host, t2, t3]) await t.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
  await sleep(2800);   // 入场运镜落定

  // ── ① 注入 2 个 dcb（特征头）+ 1 个 emoji（贴片保留）──
  const RECIPES = ['dcb:{"s":"micah","d":"Felix"}', 'dcb:{"s":"miniavs","d":"Felix"}', '🐵'];
  await host.evaluate(recipes => mutate(s => { s.players.forEach((p, i) => { if (recipes[i]) p.avatar = recipes[i]; }); }), RECIPES);
  await host.waitForFunction(() => {
    if (!window.__three) return false;
    const a = window.__three.avFeats();
    return a.length === 3 && a[0].hasFeat && a[0].style === 'short' && a[1].hasFeat && a[1].glasses === true && !a[2].hasFeat && a[2].faceVisible;   // 三角色特征全部落位（防断言竞态）
  }, null, { timeout: 25000 });
  const feats = await host.evaluate(() => window.__three.avFeats());
  console.log('  [debug]', JSON.stringify(feats));
  ok(feats.length === 3, `3 角色全部建角色（got ${feats.length}）`);
  ok(feats[0].hasFeat && !feats[0].faceVisible && feats[0].style === 'short', `① micah/Felix（老白）→ 特征头贴片退役 + 短发（位图钉扎判真有灰发簇；style=${feats[0].style} faceVisible=${feats[0].faceVisible}）`);
  ok(feats[0].headColor !== '#e8b98c', `① 头球肤色迁移（${feats[0].headColor} ≠ 默认 #e8b98c）`);
  ok(feats[1].hasFeat && !feats[1].faceVisible && feats[1].glasses === true, `② miniavs/Felix（眼镜妹）→ 特征头 + 眼镜（glasses=${feats[1].glasses}）`);
  ok(!feats[2].hasFeat && feats[2].faceVisible, `③ emoji（默认仔）→ 贴片保留无特征子树（faceVisible=${feats[2].faceVisible}）`);

  await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
  await t3.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await host.bringToFront();
  await host.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await host.screenshot({ path: path.join(SHOTS, 'ava-tod-feats.png') });
  ok(true, '截图 ava-tod-feats.png');

  // ── ④ 双向翻转：person→emoji→person ──
  await host.evaluate(() => mutate(s => { s.players[0].avatar = '🐧'; }));
  await host.waitForFunction(() => { const a = window.__three.avFeats(); return !a[0].hasFeat && a[0].faceVisible; }, null, { timeout: 15000 });
  ok(true, '④ person→emoji：特征子树卸载、贴片恢复');
  await host.evaluate(() => mutate(s => { s.players[0].avatar = 'dcb:{"s":"micah","d":"Felix"}'; }));
  await host.waitForFunction(() => { const a = window.__three.avFeats(); return a[0].hasFeat && !a[0].faceVisible; }, null, { timeout: 15000 });
  ok(true, '④ emoji→person：特征头重建');
  const after = await host.evaluate(() => window.__three.avFeats());
  ok(after[0].style === 'short' && after[0].headColor !== '#e8b98c', `④ 翻回后特征一致（style=${after[0].style} head=${after[0].headColor}）`);

  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 3).join(' | ') || 'clean'}）`);
  await browser.close();
  server.close();
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
