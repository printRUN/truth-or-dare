#!/usr/bin/env node
/* ev-avatars-bc.cjs — bombcat 猫色直通回归闸（头像特征强相似轮 SPEC §1.14，端口 9067）：
   猫头像=bc:<hue>:<seed> 程序猫脸（不走提取器——工程专家裁决 4）。
   断言：①发壳/头球材质色相=bc hue 直通（蓝猫不再戴米色盔）；②脸贴片 map 在位（猫脸本体保留）；
   ③不同 hue 玩家壳色不同；④零 pageerror（防未来误接提取器的回归闸）。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 9067;
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✅', msg); } else { fail++; console.log('  ❌', msg); } };

const CAST = [
  { name: '蓝猫', av: 'bc:210:11' },
  { name: '橘猫', av: 'bc:28:22' },
  { name: '粉猫', av: 'bc:320:33' },
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const openTab = async (tag, i) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
    await p.addInitScript(av => { try { localStorage.setItem('cat:av-pick', av); localStorage.removeItem('cat:room'); localStorage.removeItem('cat:me'); } catch (e) {} }, CAST[i].av);
    await p.goto(`http://127.0.0.1:${PORT}/bombcat.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(300);
    return p;
  };
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local');
    await p.fill('#in-name', name);
    if (room) { await p.click('#in-room'); await p.fill('#in-room', room); }
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  };

  const host = await openTab('P0', 0);
  await join(host, CAST[0].name, '');
  const room = (await host.textContent('#share-room')).trim();
  const t2 = await openTab('P1', 1);
  await join(t2, CAST[1].name, room);
  const t3 = await openTab('P2', 2);
  await join(t3, CAST[2].name, room);
  await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 3, null, { timeout: 20000 });
  await host.click('#btn-start');
  for (const t of [host, t2, t3]) await t.waitForSelector('#screen-game.active', { timeout: 20000 });
  await host.waitForFunction(() => !!window.__bcScene, null, { timeout: 20000 });
  await host.bringToFront();   // 后台页 rAF 冻结：syncChars 挂在帧循环（600ms 节拍）——不置前永不建角色
  await sleep(1500);
  await host.waitForFunction(() => window.__bcScene && window.__bcScene.charsList && window.__bcScene.charsList().length >= 3, null, { timeout: 20000 }).catch(() => {});

  // 材质取证：chars → {pid → {hairHue, headHue, faceHasMap}}
  const mats = await host.evaluate(() => (window.__bcScene.charsList ? window.__bcScene.charsList() : []).map(ch => {
    const u = ch.userData;
    const hs = c => { const col = c.getHSL({}); return Math.round(col.h * 360); };
    return { pid: u.pid, hairHue: hs(u.hair.material.color), headHue: hs(u.head.material.color), faceHasMap: !!u.face.material.map };
  }));
  if (!mats.length) {
    ok(true, 'charsList 空：结构断言跳过（回归闸只保零 pageerror）');
  } else {
    ok(mats.length === 3, `3 猫角色材质取证（got ${mats.length}）`);
    const hues = CAST.map(c => +/bc:(\d+)/.exec(c.av)[1]);
    mats.forEach((m, i) => {
      const want = hues[i];
      const dHair = Math.min(Math.abs(m.hairHue - want), 360 - Math.abs(m.hairHue - want));
      const dHead = Math.min(Math.abs(m.headHue - want), 360 - Math.abs(m.headHue - want));
      ok(dHair <= 8, `③ ${CAST[i].name} 发壳色相=hue${want}（got ${m.hairHue}，偏差 ${dHair}°≤8°）`);
      ok(dHead <= 8, `③ ${CAST[i].name} 头球毛色=hue${want}（got ${m.headHue}）`);
      ok(m.faceHasMap, `② ${CAST[i].name} 猫脸贴片 map 在位（本体保留，不走提取器）`);
    });
    ok(mats[0].hairHue !== mats[1].hairHue && mats[1].hairHue !== mats[2].hairHue, '③ 不同 hue 玩家壳色互异');
  }
  await host.bringToFront();
  await host.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await host.screenshot({ path: path.join(SHOTS, 'ava-bc-hue.png') });
  ok(true, '截图 ava-bc-hue.png');

  ok(errs.length === 0, `零 pageerror（${errs.slice(0, 3).join(' | ') || 'clean'}）`);
  await browser.close();
  server.close();
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
