// ev-quit-leaves-room.cjs — 手动退出=直接退房（2026-10-11 用户点名）取证：
// 客人点「返回游戏中心」→ ①导航落 index ②回房票据已清 ③主机端名册即时少一人（不等 90s 心跳超时/40s 灰化）。
// mono/uno 走组件 localnet（BroadcastChannel）+ ?net=1 自动入房；bombcat 双页 join；tod 侧由 probe-tod-home ④ 钉（票清+停 join 屏）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8977;   // 专用端口（勿与其他探针共用）
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { console.log(`${cond ? '✅' : '❌'} ${name}${detail !== undefined ? ' | ' + detail : ''}`); cond ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const BASE = `http://127.0.0.1:${PORT}`;

  async function freshCtx() {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const errs = [];
    const watch = p => p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    return { ctx, errs, watch };
  }

  /* ── 通用：客人在 pn 大厅点返回游戏中心（mono/uno）── */
  async function pnCase(file, handle, room, label, backSel) {
    const A = await freshCtx();
    const host = await A.ctx.newPage(); A.watch(host);
    const guest = await A.ctx.newPage(); A.watch(guest);
    const q = `net=1&room=${room}&localnet=1&autotest=1`;
    await host.goto(`${BASE}/${file}?${q}&role=host`, { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(h => window[h] && window[h].net && window[h].net().joined, handle, { timeout: 20000 });
    await guest.goto(`${BASE}/${file}?${q}&role=join&name=${encodeURIComponent('客人乙')}`, { waitUntil: 'domcontentloaded' });
    await guest.waitForFunction(h => window[h] && window[h].net && window[h].net().joined, handle, { timeout: 20000 });
    await host.waitForFunction(h => (window[h].net().doc.players || []).length === 2, handle, { timeout: 10000 });
    ok(`${label} 双人入房`, true);
    await guest.click(backSel);
    await guest.waitForURL('**/index.html', { timeout: 8000 });
    ok(`${label} 客人导航落 index`, true, guest.url().split('/').pop());
    const ticket = await guest.evaluate(() => Object.keys(sessionStorage).filter(k => k.endsWith(':netroom') || k.endsWith(':netname-tab')));
    ok(`${label} 客人回房票据已清`, ticket.length === 0, JSON.stringify(ticket));
    await host.waitForFunction(h => (window[h].net().doc.players || []).length === 1, handle, { timeout: 3000 });
    const names = await host.evaluate(h => (window[h].net().doc.players || []).map(p => p.name), handle);
    ok(`${label} 主机端名册即时摘除客人（<3s）`, names.length === 1 && !names.includes('客人乙'), JSON.stringify(names));
    ok(`${label} 零 pageerror`, A.errs.length === 0, A.errs.join('; '));
    await A.ctx.close();
  }

  // window.__mono / window.__uno 是各自宿主的联机调试把手
  await pnCase('monopoly.html', '__mono', '42701', '大富翁', '#btn-back-arcade');
  await pnCase('uno.html', '__uno', '42703', 'UNO', '#btn-back-arcade');

  /* ── bombcat：客人在大厅点右上「🎮 游戏中心」── */
  {
    const A = await freshCtx();
    const host = await A.ctx.newPage(); A.watch(host);
    const guest = await A.ctx.newPage(); A.watch(guest);
    await host.goto(`${BASE}/bombcat.html`, { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 20000 });
    await host.fill('#in-name', '甲');
    await host.click('#btn-join');
    await host.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    const room = (await host.textContent('#share-room')).trim();
    await guest.goto(`${BASE}/bombcat.html?room=${room}`, { waitUntil: 'domcontentloaded' });
    await guest.waitForFunction(r => document.querySelector('#in-room').value === r, room, { timeout: 8000 });
    await guest.fill('#in-name', '客人乙');
    await guest.click('#btn-join');
    await guest.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 2, null, { timeout: 15000 });
    ok('炸弹猫 双人入房', true);
    await guest.click('#lnk-arcade');
    await guest.waitForURL('**/index.html', { timeout: 8000 });
    ok('炸弹猫 客人导航落 index', true, guest.url().split('/').pop());
    const t = await guest.evaluate(() => localStorage.getItem('cat:room'));
    ok('炸弹猫 客人回房票 cat:room 已清', t === null, String(t));
    await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length === 1, null, { timeout: 3000 });
    ok('炸弹猫 主机端名册即时摘除客人（<3s）', true);
    ok('炸弹猫 零 pageerror', A.errs.length === 0, A.errs.join('; '));
    await A.ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n══ ev-quit-leaves-room 结果 ══\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(2); });
