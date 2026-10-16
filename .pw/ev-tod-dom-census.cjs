#!/usr/bin/env node
/* ev-tod-dom-census.cjs — 选卡态信息元素 DOM 普查（遮桌根因定位），端口 9129。
   3 人局 → 桌面 1280×800 + 竖屏 390×844 两档，dump 每个信息元素的 rect/position/offsetParent/visibility，
   以及 3D 锚定元素（choiceTip/词牌）的实际落点。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 9129;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CENSUS = () => {
  const ids = ['turn-info', 'pick-tip', 'choice-hint', 'choice-section', 'ghost-bar', 'deck-section', 'card-section', 'stage-actions', 'bet-box', 'stake-row', 'card-actions'];
  const rows = [];
  const dump = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || (r.width < 2 && r.height < 2)) return;
    rows.push({ sel: (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).join('.') : ''), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], pos: cs.position, op: cs.opacity, vis: cs.visibility, z: cs.zIndex, parent: el.parentElement && (el.parentElement.id || el.parentElement.className || '').toString().slice(0, 24) });
  };
  ids.forEach(id => { const el = document.getElementById(id); if (el) dump(el); });
  document.querySelectorAll('.choice-tip, .stat-chip, .player-card, .word-plate, #cam > *').forEach(dump);
  return rows;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => console.log('ERR', e.message));
  await p1.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local');
    await p.fill('#input-name', name);
    if (room) { await p.fill('#input-room', room); }
    await p.click('.avatar-option >> nth=0');
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
  };
  await join(p1, '阿泽', '');
  const room = (await p1.textContent('#share-room')).trim();
  for (const n of ['老白', '默认仔']) { const q = await ctx.newPage(); await q.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' }); await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {}); await join(q, n, room); }
  await p1.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
  await p1.click('#btn-start');
  await p1.waitForSelector('#screen-game.active', { timeout: 20000 });
  await p1.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
  await p1.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; });
  await sleep(3800);

  for (const vp of [{ w: 1280, h: 800, tag: 'land' }, { w: 390, h: 844, tag: 'por' }]) {
    await p1.setViewportSize({ width: vp.w, height: vp.h });
    await sleep(1500);
    const rows = await p1.evaluate(CENSUS);
    console.log(`\n══ ${vp.tag} ${vp.w}×${vp.h} ══`);
    rows.filter(r => r.rect[1] > vp.h * 0.18 && r.rect[1] < vp.h * 0.62).forEach(r => console.log(`  中带 ${JSON.stringify(r.rect)} ${r.pos} z${r.z} op${r.op} [${r.sel}] "${r.txt}" parent=${r.parent}`));
    rows.filter(r => r.sel.includes('choice') || r.sel.includes('turn') || r.sel.includes('pick') || r.sel.includes('ghost') || r.sel.includes('deck-sec') || r.sel.includes('card-sec')).forEach(r => console.log(`  关键 ${JSON.stringify(r.rect)} ${r.pos} z${r.z} op${r.op} [${r.sel}] "${r.txt}" parent=${r.parent}`));
  }
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
