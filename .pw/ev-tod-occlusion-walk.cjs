#!/usr/bin/env node
/* ev-tod-occlusion-walk.cjs — 「信息遮脸+遮桌」全流程走查取证（用户 2026-10-16：tod 还有信息遮玩家的脸和桌面），端口 9127。
   真实 3 人局驱动全状态：choosing（我选/别人选）→ drawing → revealed（持麦人/观众+押注面板）→ 桌面揭晓卡，
   视口：390×844 竖屏 / 849×825 方屏 / 844×390 横屏 / 1280×800 桌面。
   量化三张清单：heads（信息牌∩头圆，口径同 ev-hud）、cardZone（信息牌∩揭晓牌屏幕矩形）、felt（信息牌∩毡面外接矩形）。
   本探针先产出证据（JSON+截图），阈值判定在遮挡点定位后补。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9127;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, name) => { await p.screenshot({ path: path.join(SHOTS, name), fullPage: false }); console.log('  📸', name); };

// 页内量化：头圆（3D 投影 + .tp 头）与桌面两区（揭晓牌矩形 + 毡面外接矩形）vs 信息元素
const MEASURE = () => {
  const out = { heads: [], hitsHead: [], hitsCard: [], hitsFelt: [], cardZone: null, feltBox: null };
  const cv = document.getElementById('three-canvas');
  if (!cv || !window.__three || !__three.chars) return out;
  const cw = cv.clientWidth, chh = cv.clientHeight;
  const V = new THREE.Vector3();
  const proj = (x, y, z) => { V.set(x, y, z).project(__three.camera); return { x: (V.x + 1) / 2 * cw, y: (1 - (V.y + 1) / 2) * chh }; };
  // 头圆（⚠ myId 是页面 let 全局词法绑定，不在 window 上——必须裸引用）
  __three.chars.forEach((ch, pid) => {
    const c = ch.position;
    const ctr = proj(c.x, 1.33, c.z), top = proj(c.x, 1.56, c.z);
    out.heads.push({ pid, local: pid === myId, cx: ctr.x, cy: ctr.y, r: Math.max(6, Math.abs(ctr.y - top.y)) });
  });
  const tb = document.querySelector('#tp-back .tp-head');
  if (tb) { const r = tb.getBoundingClientRect(); if (r.width > 4) out.heads.push({ pid: '__me_tp__', cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: Math.max(r.width, r.height) / 2 }); }
  // 桌面两区：毡面外接框（TABLE_R=2.05 圆周 8 点）+ 揭晓牌区（牌位 (1.12,FELT_Y,0.60) ± 0.55 世界单位）
  const FELT_Y = 0.97, R = 2.05;
  const rim = [];
  for (let a = 0; a < 8; a++) rim.push(proj(Math.cos(a * Math.PI / 4) * R, FELT_Y, Math.sin(a * Math.PI / 4) * R));
  const bx = { x1: Math.min(...rim.map(p => p.x)), y1: Math.min(...rim.map(p => p.y)), x2: Math.max(...rim.map(p => p.x)), y2: Math.max(...rim.map(p => p.y)) };
  out.feltBox = [Math.round(bx.x1), Math.round(bx.y1), Math.round(bx.x2 - bx.x1), Math.round(bx.y2 - bx.y1)];
  const dk = [proj(1.12 - 0.55, FELT_Y, 0.60 - 0.38), proj(1.12 + 0.55, FELT_Y, 0.60 - 0.38), proj(1.12 + 0.55, FELT_Y, 0.60 + 0.38), proj(1.12 - 0.55, FELT_Y, 0.60 + 0.38)];
  const ck = { x1: Math.min(...dk.map(p => p.x)), y1: Math.min(...dk.map(p => p.y)), x2: Math.max(...dk.map(p => p.x)), y2: Math.max(...dk.map(p => p.y)) };
  out.cardZone = [Math.round(ck.x1), Math.round(ck.y1), Math.round(ck.x2 - ck.x1), Math.round(ck.y2 - ck.y1)];
  // 信息元素（信息与浮层控件；toast=弹窗豁免、choice-card=游戏物件豁免）
  const SEL = '#turn-info,#choice-hint,#pick-tip,#bet-box,#stake-row,#reveal-wait,#stage-actions,#card-actions,#btn-answer,.tool-row,#tools-fab,#tools-panel,.stat-chip,' +
    '.player-card .score-tag,.player-card .combo-tag,.player-card .host-tag,.player-card .skip-badge,.player-card .me-tag,.player-card .player-name,.player-card .active-badge';
  const els = [...document.querySelectorAll(SEL)];
  const saEl = document.getElementById('stage-actions');
  const inPanel = el => /tool-row|bet-box/.test((el.className || el.id || '').toString()) || !!(saEl && saEl.contains(el));   // 底部 HUD/交互浮窗族（stage-actions 桥接面板含 choice-hint/stake-row/卡组）
  const clipBox = el => {
    let r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        const x1 = Math.max(r.x, pr.x), x2 = Math.min(r.x + r.width, pr.x + pr.width);
        if (x2 - x1 < 4) return null;
        r = { x: x1, y: r.y, width: x2 - x1, height: r.height };
        break;
      }
      p = p.parentElement;
    }
    return r;
  };
  const inter = (r, b) => {
    const x1 = Math.max(r.x, b.x1), y1 = Math.max(r.y, b.y1), x2 = Math.min(r.x + r.width, b.x2), y2 = Math.min(r.y + r.height, b.y2);
    return x2 > x1 && y2 > y1 ? (x2 - x1) * (y2 - y1) : 0;
  };
  els.forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const r = clipBox(el);
    if (!r || r.width < 2 || r.height < 2) return;
    const tag = { cls: (el.className || el.id || '').toString().slice(0, 36), txt: (el.textContent || '').trim().slice(0, 12), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    out.heads.forEach(h => {
      const nx = Math.max(r.x, Math.min(h.cx, r.x + r.width)), ny = Math.max(r.y, Math.min(h.cy, r.y + r.height));
      const d = Math.hypot(h.cx - nx, h.cy - ny);
      if (d < h.r) {
        // 本地玩家 3D 分身的头对「底部 HUD + stage-actions 交互面板族」豁免：南座分身脸朝桌面、整头藏在
        // 不透明面板后（自己看到的是 DOM 背影，完整可见且受 --chin 保护）；持麦人选卡浮窗是必要交互面（弹窗族红线豁免）
        if (h.local && inPanel(el)) return;
        out.hitsHead.push({ head: h.pid, local: !!h.local, ...tag, deep: +Math.min(1, (h.r - d) / (2 * h.r)).toFixed(2) });
      }
    });
    const aCard = inter(r, ck);
    if (aCard > 40) out.hitsCard.push({ ...tag, coverPx: Math.round(aCard) });
    const aFelt = inter(r, bx);
    if (aFelt > 400) out.hitsFelt.push({ ...tag, coverPx: Math.round(aFelt) });
  });
  out.hitsHead.sort((a, b) => b.deep - a.deep);
  out.hitsCard.sort((a, b) => b.coverPx - a.coverPx);
  out.hitsFelt.sort((a, b) => b.coverPx - a.coverPx);
  return out;
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
  const openTab = async tag => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ':' + e.message));
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
  const report = {};
  const snap = async (tag, page) => {
    const m = await page.evaluate(MEASURE);
    report[tag] = m;
    await shot(page, `todwalk-${tag}.png`);
    return m;
  };
  const logHits = (tag, m) => {
    console.log(`  [${tag}] 头 ${m.heads.length} cardZone=${JSON.stringify(m.cardZone)} felt=${JSON.stringify(m.feltBox)}`);
    m.hitsHead.filter(h => h.deep >= 0.12).slice(0, 6).forEach(h => console.log(`    头压 [${h.head}] "${h.txt}"(${h.cls}) deep=${h.deep} @${h.box}`));
    m.hitsCard.slice(0, 6).forEach(h => console.log(`    牌压 "${h.txt}"(${h.cls}) ${h.coverPx}px @${h.box}`));
    m.hitsFelt.slice(0, 8).forEach(h => console.log(`    毡压 "${h.txt}"(${h.cls}) ${h.coverPx}px @${h.box}`));
  };

  const host = await openTab('H'); await join(host, '阿泽', '');
  const room = (await host.textContent('#share-room')).trim();
  const p1 = await openTab('P1'); await join(p1, '老白', room);
  const p2 = await openTab('P2'); await join(p2, '默认仔', room);
  await host.waitForFunction(() => typeof S !== 'undefined' && S.players.length === 3, null, { timeout: 20000 });
  await host.evaluate(() => mutate(s => { s.players[0].score = 33; s.players[1].score = 20; s.players[1].combo = 2; s.players[2].score = -5; }));
  await host.click('#btn-start');
  await host.waitForSelector('#screen-game.active', { timeout: 20000 });
  await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 12000 });
  for (const p of [host, p1, p2]) { await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {}); }
  await sleep(3600);
  await host.bringToFront();

  // ① 我（主持人=持麦人）选卡态 · 竖屏
  await snap('H-choosing-por', host);
  // ② 我选真心话 → 抽卡 → 揭晓（持麦人视角）
  await host.evaluate(() => { const b = document.querySelector('#card-truth'); if (b) b.click(); });
  await sleep(1500);
  await snap('H-drawing-por', host);
  await sleep(2600);
  await snap('H-revealed-por', host);
  // ③ 观众（老白）揭晓态：押注面板 + 等待药丸 + 桌面牌
  await p1.bringToFront();
  await sleep(700);
  await snap('P1-revealed-por', p1);
  // ④ P1 押注后（stake/计数变化）
  await p1.evaluate(() => { const b = document.getElementById('bet-accept'); if (b && !b.hidden) b.click(); }).catch(() => {});
  await sleep(900);
  await snap('P1-betted-por', p1);
  // ⑤ P1 工具 FAB 展开
  await p1.evaluate(() => { const f = document.getElementById('tools-fab'); if (f) f.click(); }).catch(() => {});
  await sleep(700);
  await snap('P1-tools-open-por', p1);
  await p1.evaluate(() => { const f = document.getElementById('tools-fab'); if (f) f.click(); }).catch(() => {});
  await sleep(400);
  // ⑥ P1 方屏 + 横屏（同一揭晓态）
  await p1.setViewportSize({ width: 849, height: 825 }); await sleep(1200);
  await snap('P1-revealed-sq', p1);
  await p1.setViewportSize({ width: 844, height: 390 }); await sleep(1200);
  await snap('P1-revealed-landui', p1);
  await p1.setViewportSize({ width: 390, height: 844 }); await sleep(1000);
  // ⑦ 桌面 1280×800：强制回到选卡态（拍桌上双卡+提示药丸），再真选一张拍揭晓
  await host.setViewportSize({ width: 1280, height: 800 }); await sleep(1200);
  await host.evaluate(() => mutate(n => { n.turn.stage = 'choosing'; n.turn.choice = null; n.turn.punishment = null; }));
  await sleep(1400);
  await snap('H-choosing-land', host);
  await host.evaluate(() => { const b = document.querySelector('#card-dare'); if (b) b.click(); });
  await sleep(4200);
  await snap('H-revealed-land', host);
  await p1.setViewportSize({ width: 1280, height: 800 }); await sleep(1200);
  await snap('P1-revealed-land', p1);

  fs.writeFileSync(path.join(SHOTS, 'tod-occlusion-walk.json'), JSON.stringify(report, null, 1));
  console.log('  errs:', errs.length ? errs : '无');
  console.log('■ 走查完成（证据在 .pw/shots/tod-occlusion-walk.json + todwalk-*.png）');
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
