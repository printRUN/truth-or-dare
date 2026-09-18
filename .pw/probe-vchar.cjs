// 虚拟角色冒烟：两人本地建房开局 → 牌桌截图（选卡/离座抽卡/揭晓三态）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8765;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  // 本地模式靠 localStorage retained 状态同步：两个玩家必须共用同一个 browser context（同浏览器多标签）
  const ctx = await b.newContext();

  async function makePlayer(name, viewport, room) {
    const p = await ctx.newPage();
    await p.setViewportSize(viewport);
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });   // 模拟老用户：首进大厅不自动弹玩法说明
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
    await p.waitForSelector('#screen-join.active');
    await p.click('details.adv summary');
    await p.click('#chk-local');
    if (room) await p.fill('#input-room', room);
    await p.fill('#input-name', name);
    await p.click('.avatar-option >> nth=0');
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 30000 }).catch(async () => {
      const toast = await p.evaluate(() => (document.getElementById('toast') || {}).textContent);
      const joinCls = await p.evaluate(() => document.getElementById('screen-join').className);
      const btnDisabled = await p.evaluate(() => (document.getElementById('btn-join') || {}).disabled);
      console.log(`JOIN-FAIL[${name}] toast=«${toast}» joinClass=«${joinCls}» btnDisabled=${btnDisabled}`);
      await p.screenshot({ path: `shots/join-fail-${name}.png` });
      throw new Error('join failed for ' + name);
    });
    await p.waitForTimeout(700);   // 越过 renderLobby 的 450ms openGuide 延时，兜底关掉
    await p.evaluate(() => { try { closeGuide(); } catch (e) {} });
    return { ctx, p, errs };
  }

  const A = await makePlayer('小A', { width: 390, height: 844 });
  const room = await A.p.textContent('#share-room');
  console.log('room:', room);
  const B = await makePlayer('小B', { width: 430, height: 900 }, room);
  await A.p.waitForTimeout(1200);
  const cnt = await A.p.evaluate(() => document.querySelectorAll('#lobby-players-grid .player-card, #players-grid .player-card').length);
  console.log('lobby player cards (A sees):', cnt);
  const chr = await A.p.evaluate(() => {
    const c = document.querySelector('#players-grid .player-card');
    return { body: !!c.querySelector('.chr-body'), chr1: c.style.getPropertyValue('--chr1'), name: c.querySelector('.player-name').textContent };
  });
  console.log('chr-body rendered:', JSON.stringify(chr));

  // 开局
  await A.p.click('#btn-start');
  await A.p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.p.waitForTimeout(2600);

  // 几何断言：角色身体接在头像下方、名牌不溢出卡片
  const geom = await A.p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#game-players-grid .player-card').forEach(c => {
      const ring = c.querySelector('.avatar-ring').getBoundingClientRect();
      const body = c.querySelector('.chr-body').getBoundingClientRect();
      const name = c.querySelector('.player-name').getBoundingClientRect();
      const card = c.getBoundingClientRect();
      out.push({
        name: c.querySelector('.player-name').textContent,
        bodyW: Math.round(body.width), bodyH: Math.round(body.height),
        bodyOverlapsAvatar: body.top < ring.bottom && body.bottom > ring.bottom - 20,   // margin-top:-11px → 应与头像底部重叠
        bodyCenteredX: Math.abs((body.left + body.width / 2) - (ring.left + ring.width / 2)) < 3,
        nameInsideCard: name.left >= card.left - 1 && name.right <= card.right + 1,
        seatShadow: getComputedStyle(c.querySelector('.chr-body'), '::before').content !== 'none'
      });
    });
    return out;
  });
  console.log('chr geometry:', JSON.stringify(geom));
  const bad = geom.filter(g => g.bodyW < 30 || g.bodyH < 10 || !g.bodyOverlapsAvatar || !g.bodyCenteredX || !g.nameInsideCard || !g.seatShadow);
  if (bad.length) { console.error('GEOM-FAIL', JSON.stringify(bad)); process.exit(1); }

  await A.p.screenshot({ path: 'shots/chr-1-choosing.png' });

  const chooserName = await A.p.evaluate(() => (S.players.find(p => p.id === (S.turn.chooserId || activePlayerId())) || {}).name);
  console.log('chooser:', chooserName);
  const chooserPage = chooserName === '小A' ? A : B;

  // 选卡 → drawing 状态截图（角色离座）。注意：evaluate 闭包变量不进浏览器上下文，必须作为参数传入
  await chooserPage.p.evaluate((t) => { try { choose(t); } catch (e) { console.log('choose err', e.message); } }, chooserName === '小A' ? 'truth' : 'dare');

  // 飞行克隆体：fa-head + fa-tag 结构完整，且位置随时间移动（走路动画）
  await A.p.waitForTimeout(300);
  const fly1 = await A.p.evaluate(() => {
    const f = document.querySelector('.fly-avatar');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { head: !!f.querySelector('.fa-head img'), tag: (f.querySelector('.fa-tag') || {}).textContent, x: Math.round(r.left), y: Math.round(r.top), pe: getComputedStyle(f).pointerEvents };
  });
  await A.p.waitForTimeout(200);
  const fly2 = await A.p.evaluate(() => {
    const f = document.querySelector('.fly-avatar');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  console.log('fly clone:', JSON.stringify({ fly1, moved: fly1 && fly2 && (fly1.x !== fly2.x || fly1.y !== fly2.y) }));
  if (!fly1 || !fly1.head || !fly1.tag || fly1.pe !== 'none' || !fly2 || (fly1.x === fly2.x && fly1.y === fly2.y)) { console.error('FLY-FAIL'); process.exit(1); }

  await A.p.waitForTimeout(300);
  const away = await A.p.evaluate(() => {
    const c = document.querySelector('#game-players-grid .player-card.away');
    return c ? { name: c.querySelector('.player-name').textContent, status: (c.querySelector('.chr-status') || {}).textContent, bodyOp: getComputedStyle(c.querySelector('.chr-body')).opacity } : null;
  });
  console.log('away character:', JSON.stringify(away));
  await A.p.screenshot({ path: 'shots/chr-2-drawing.png' });

  // 等揭晓（飞行850ms + 洗牌1400ms + 发牌1500ms + 揭晓动画，总留 5.5s，已耗 ~1s）
  await A.p.waitForTimeout(3800);
  const owner = await A.p.evaluate(() => ({ html: document.getElementById('card-owner').innerHTML.slice(0, 120), revealed: !document.getElementById('card-section').hidden }));
  console.log('card owner:', JSON.stringify(owner));
  await A.p.screenshot({ path: 'shots/chr-3-revealed.png' });
  console.log('pageerrors:', A.errs.length, B.errs.length, (A.errs[0] || '') + (B.errs[0] || ''));

  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
