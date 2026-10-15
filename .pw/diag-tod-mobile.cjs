#!/usr/bin/env node
/* diag-tod-mobile.cjs — 用户 2026-10-15 反馈诊断（端口 9093）：
   ① 手机 390×844 全流程按钮可见性/可点性扫描（join→lobby→choosing→revealed→🧰面板；3P 与 2P）
      —— 可见=rect 入视口且无覆盖（elementFromPoint 命中自身或后代）；另跑一档 auto 省电（不设 tod:perf）看 loperf 退役层。
   ② 2D 头像 vs 3D 特征头同框取证：dcb 三风格 → 2D 参考条 + 3D 头裁切。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9093;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCAN = sel => {
  const vw = innerWidth, vh = innerHeight;
  const els = [...document.querySelectorAll(sel)].filter(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  return els.map(el => {
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const hitOk = !!hit && (el === hit || el.contains(hit) || (hit && hit.contains(el)));
    const label = (el.textContent || '').trim().slice(0, 16) || el.id || el.className;
    return {
      id: el.id || el.className.toString().slice(0, 30), label,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      belowFold: r.y >= vh - 4, aboveFold: r.y + r.height <= 4,
      offside: r.x >= vw - 4 || r.x + r.width <= 4,
      covered: !hitOk,
      hitBy: hitOk ? '' : (hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 30) : 'null'),
    };
  });
};
const HEADS = () => {
  const cv = document.getElementById('three-canvas');
  if (!cv || !window.__three || !__three.chars) return [];
  const cw = cv.clientWidth, chh = cv.clientHeight;
  const V = new THREE.Vector3();
  const proj = (x, y, z) => { V.set(x, y, z).project(__three.camera); return { x: (V.x + 1) / 2 * cw, y: (1 - (V.y + 1) / 2) * chh }; };
  const out = [];
  __three.chars.forEach((ch, pid) => {
    const c = ch.position;
    const ctr = proj(c.x, 1.33, c.z), top = proj(c.x, 1.56, c.z);
    out.push({ pid, cx: Math.round(ctr.x), cy: Math.round(ctr.y), r: Math.max(14, Math.round(Math.abs(ctr.y - top.y) * 1.35)) });
  });
  return out;
};
const report = {};
const sweep = (p, sel, tag) => p.evaluate(SCAN, sel).then(list => { report[tag] = list; return list; });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  const openTab = async (ctx, tag, perfFull) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('  ⚠ pageerror', tag, e.message.slice(0, 120)));
    if (perfFull) await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
    else await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.removeItem('tod:perf'); } catch (e) {} });
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(250);
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
  const show = list => list.forEach(b => console.log(`    · ${b.id} "${b.label}" @${b.rect} ${b.belowFold ? 'BELOW-FOLD' : ''}${b.covered ? ' COVERED by ' + b.hitBy : ''}${b.offside ? ' OFFSIDE' : ''}`));

  const gameFlow = async (tag, perfFull) => {
    console.log(`\n════ ${tag}（perf=${perfFull ? 'full' : 'auto'}）════`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const host = await openTab(ctx, 'H', perfFull);
    // ① join 屏
    report[`${tag}_join`] = await sweep(host, '#screen-join button, #screen-join a, #screen-join .choice-card', `${tag}_join`);
    await host.screenshot({ path: path.join(SHOTS, `diag-mob-${tag}-join.png`) });
    await join(host, '阿泽', '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab(ctx, 'P1', perfFull); await join(t2, '老白', room);
    const t3 = await openTab(ctx, 'P2', perfFull); await join(t3, '默认仔', room);
    await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
    // ② lobby
    report[`${tag}_lobby`] = await sweep(host, '#screen-lobby button, #screen-lobby a', `${tag}_lobby`);
    await host.screenshot({ path: path.join(SHOTS, `diag-mob-${tag}-lobby.png`) });
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    if (perfFull) await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    await sleep(3600);
    await host.bringToFront();
    console.log('  body class:', await host.evaluate(() => document.body.className));
    // ③ choosing
    report[`${tag}_choosing`] = await sweep(host, '#stage-actions button, #stage-actions .choice-card, #tools-fab, #game-tools button, #bet-box button', `${tag}_choosing`);
    await host.screenshot({ path: path.join(SHOTS, `diag-mob-${tag}-choosing.png`) });
    show(report[`${tag}_choosing`]);
    // ④ revealed
    await host.evaluate(() => { const b = document.querySelector('#card-truth'); if (b) b.click(); });
    await sleep(2600);
    report[`${tag}_revealed`] = await sweep(host, '#stage-actions button, #tools-fab, #game-tools button', `${tag}_revealed`);
    await host.screenshot({ path: path.join(SHOTS, `diag-mob-${tag}-revealed.png`) });
    show(report[`${tag}_revealed`]);
    // ⑤ 🧰 面板展开
    const fab = await host.$('#tools-fab');
    if (fab) {
      const vis = await host.evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }, fab);
      if (vis) { await fab.click(); await sleep(500); }
      report[`${tag}_fabpanel`] = await sweep(host, '#game-tools button', `${tag}_fabpanel`);
      await host.screenshot({ path: path.join(SHOTS, `diag-mob-${tag}-fabpanel.png`) });
      show(report[`${tag}_fabpanel`]);
    }
    await ctx.close();
    return host;
  };

  /* ═══ A1 三人局 perf=full（three3d 主路径）═══ */
  await gameFlow('p3full', true);

  /* ═══ A2 三人局 perf=auto（手机真实档：可能翻 loperf 走 CSS 回退层）═══ */
  await gameFlow('p3auto', false);

  /* ═══ A3 2 人局 perf=full（players-2 分档）═══ */
  {
    console.log('\n════ 2P perf=full ════');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const host = await openTab(ctx, 'H', true);
    await join(host, '阿泽', '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab(ctx, 'P1', true); await join(t2, '老白', room);
    await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 2, null, { timeout: 20000 });
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    await sleep(3600);
    await host.bringToFront();
    report.p2_choosing = await sweep(host, '#stage-actions button, #stage-actions .choice-card, #tools-fab, #game-tools button', 'p2_choosing');
    await host.screenshot({ path: path.join(SHOTS, 'diag-mob-p2-choosing.png') });
    show(report.p2_choosing);
    await host.evaluate(() => { const b = document.querySelector('#card-truth'); if (b) b.click(); });
    await sleep(2600);
    report.p2_revealed = await sweep(host, '#stage-actions button, #tools-fab, #game-tools button', 'p2_revealed');
    await host.screenshot({ path: path.join(SHOTS, 'diag-mob-p2-revealed.png') });
    show(report.p2_revealed);
    await ctx.close();
  }

  /* ═══ B 2D vs 3D 头像同框 ═══ */
  console.log('\n════ 2D vs 3D 头像 ════');
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = await openTab(ctx, 'H', true);
    await join(host, '阿泽', '');
    const room = (await host.textContent('#share-room')).trim();
    const t2 = await openTab(ctx, 'P1', true); await join(t2, '老白', room);
    const t3 = await openTab(ctx, 'P2', true); await join(t3, '默认仔', room);
    await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
    const RECIPES = ['dcb:{"s":"adventurer","d":"Maria"}', 'dcb:{"s":"micah","d":"Felix"}', 'dcb:{"s":"avataaars","d":"Jill"}'];
    await host.evaluate(recipes => mutate(s => { s.players.forEach((p, i) => { if (recipes[i]) p.avatar = recipes[i]; }); }), RECIPES);
    await host.click('#btn-start');
    await host.waitForSelector('#screen-game.active', { timeout: 20000 });
    await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
    await host.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    await host.waitForFunction(() => {
      if (!window.__three) return false;
      const a = window.__three.avFeats();
      return a.length === 3 && a.every(x => x.hasFeat);
    }, null, { timeout: 25000 });
    console.log('  feats:', JSON.stringify(await host.evaluate(() => window.__three.avFeats())));
    await sleep(2800);
    await host.bringToFront();
    await host.screenshot({ path: path.join(SHOTS, 'diag-ava-3d-full.png') });
    const heads = await host.evaluate(HEADS);
    console.log('  heads:', JSON.stringify(heads));
    // 2D 参考条（同页注入固定条）
    await host.evaluate(uris => {
      document.getElementById('d2ref') && document.getElementById('d2ref').remove();
      const d = document.createElement('div'); d.id = 'd2ref';
      d.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff;display:flex;gap:6px;padding:6px;';
      uris.forEach(u => { const im = document.createElement('img'); im.src = u; im.style.cssText = 'width:140px;height:140px;object-fit:contain;background:#fff;'; d.appendChild(im); });
      document.body.appendChild(d);
    }, RECIPES.map(r => null));   // 占位：真实 URI 下一步取
    const uris = await host.evaluate(() => (typeof S !== 'undefined' ? S.players.map(p => (typeof resolveAvatar === 'function' ? resolveAvatar(p.avatar) : p.avatar)) : []));
    await host.evaluate(uris2 => {
      const d = document.getElementById('d2ref');
      [...d.children].forEach((im, i) => { if (uris2[i]) im.src = uris2[i]; });
    }, uris);
    await sleep(700);
    await host.screenshot({ path: path.join(SHOTS, 'diag-ava-2d-refs.png'), clip: { x: 0, y: 0, width: Math.min(1280, uris.length * 152 + 12), height: 152 } });
    for (const [i, h] of heads.entries()) {
      const x = Math.max(0, h.cx - h.r), y = Math.max(0, h.cy - h.r), w = Math.min(1280 - x, h.r * 2), hh = Math.min(800 - y, h.r * 2);
      try { execSync(`node "${path.join(__dirname, 'crop.cjs')}" "${path.join(SHOTS, 'diag-ava-3d-full.png')}" "${path.join(SHOTS, `diag-ava-3d-head${i}.png`)}" ${x} ${y} ${w} ${hh} 3`); } catch (e) { console.log('  crop fail', e.message.slice(0, 80)); }
    }
    await ctx.close();
  } catch (e) { console.log('  ❌ 头像取证失败:', e.message.slice(0, 200)); }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(SHOTS, 'diag-tod-mobile.json'), JSON.stringify(report, null, 1));
  console.log('\n■ 诊断完成，报告 .pw/shots/diag-tod-mobile.json');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
