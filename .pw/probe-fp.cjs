// 第三人称牌桌几何冒烟：自己固定正前（两端各自）、座位在毡面上、牌堆常驻桌心、机位 rx≈19
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8767;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const fails = [];
const check = (name, ok, info) => { console.log(`${ok ? '✅' : '❌'} ${name}${info ? '  ' + info : ''}`); if (!ok) fails.push(name); };
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext();   // 本地模式：共享 context（localStorage retained 同步）
  // 环境预设必须在应用启动前写入（addInitScript）：后写会和 boot 读档竞速，headless 软渲染下
  // perfWatch 抖帧会自动开 loperf（rx 归零），运镜断言就变成环境抖动 —— 同 test-3d 的做法
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  async function join(name, viewport, room) {
    const p = await ctx.newPage();
    await p.setViewportSize(viewport);
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active');
    await p.click('details.adv summary');
    await p.click('#chk-local');
    if (room) await p.fill('#input-room', room);
    await p.fill('#input-name', name);
    await p.click('.avatar-option >> nth=0');
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    return { p, errs };
  }
  const A = await join('小A', { width: 390, height: 844 });
  const room = await A.p.textContent('#share-room');
  const B = await join('小B', { width: 1280, height: 800 }, room);
  await A.p.waitForTimeout(1000);

  await A.p.click('#btn-start');
  await A.p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.p.waitForTimeout(2600);   // 等机位收敛

  // 几何采样：座位变量、卡片矩形、毡面（ring::before 的覆盖范围 = ring 外扩 11%/37.5%）、牌堆矩形
  async function geom(page) {
    return page.evaluate(() => {
      const ring = document.querySelector('#game-players-grid');
      const rr = ring.getBoundingClientRect();
      const felt = { left: rr.left - rr.width * 0.11, right: rr.right + rr.width * 0.11, top: rr.top - rr.height * 0.375, bottom: rr.bottom + rr.height * 0.375 };
      const cards = [...ring.querySelectorAll('.player-card')].map(c => {
        const r = c.getBoundingClientRect();
        return { pid: c.dataset.pid, me: c.classList.contains('me'),
          rx: parseFloat(c.style.getPropertyValue('--rx')), ry: parseFloat(c.style.getPropertyValue('--ry')),
          rs: parseFloat(c.style.getPropertyValue('--rs')), z: +c.style.zIndex,
          cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
      });
      const deck = document.getElementById('deck');
      const dr = deck.getBoundingClientRect();
      const t3 = document.querySelector('#cam .table3d');
      const gEl = document.getElementById('game-players-grid');
      return { felt, ringC: { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 },
        cards, deck: { cx: dr.left + dr.width / 2, cy: dr.top + dr.height / 2, w: dr.width, visible: dr.width > 0 },
        anchor: { cx: gEl.offsetLeft + gEl.offsetWidth / 2, cy: gEl.offsetTop + gEl.offsetHeight / 2,
          t3L: parseFloat(t3.style.left), t3T: parseFloat(t3.style.top), h: gEl.offsetHeight }, rx: Cam.cur.rx, ringH: rr.height };
    });
  }

  const is3d = await A.p.evaluate(() => document.body.classList.contains('three3d'));
  for (const [tag, pl] of [['A(手机竖屏)', A], ['B(桌面宽屏)', B]]) {
    const g = await geom(pl.p);
    if (is3d) {
      const n3 = await pl.p.evaluate(() => (window.__three && window.__three.chars) ? window.__three.chars.size : -1);
      check(`[${tag}] 3D 模式：WebGL 人物数 = 玩家数`, n3 === g.cards.length, `chars=${n3}`);
      check(`[${tag}] 3D 模式：CSS 桌面/背影已隐藏（画布接管）`, await pl.p.evaluate(() => getComputedStyle(document.querySelector('.table3d')).display === 'none' && !!document.getElementById('three-canvas')));
      continue;   // CSS 毡面/牌堆锚定断言是 CSS 回退路径的语义，3D 模式跳过
    }
    const me = g.cards.find(c => c.me), other = g.cards.find(c => !c.me);
    check(`[${tag}] 自己的卡带 .me 且 --rs 全场最大`, me && other && me.rs > other.rs, `me.rs=${me && me.rs} other.rs=${other && other.rs}`);
    check(`[${tag}] 自己的卡在正前（--ry 最大、--rx 居中）`, me && other && me.ry > other.ry && Math.abs(me.rx - 50) < 1, `me(rx=${me && me.rx},ry=${me && me.ry}) other(ry=${other && other.ry})`);
    check(`[${tag}] 自己的卡 zIndex 全场最大`, me && other && me.z > other.z, `me.z=${me && me.z} other.z=${other && other.z}`);
    check(`[${tag}] 两张卡中心都落在毡面范围内`, g.cards.every(c => c.cx > g.felt.left && c.cx < g.felt.right && c.cy > g.felt.top && c.cy < g.felt.bottom),
      JSON.stringify(g.cards.map(c => ({ pid: c.pid.slice(-4), cx: Math.round(c.cx), cy: Math.round(c.cy) }))) + ` felt=[${Math.round(g.felt.left)},${Math.round(g.felt.top)},${Math.round(g.felt.right)},${Math.round(g.felt.bottom)}]`);
    // 第三人称：桌心向近侧（我的座位方向）偏 8% 环高——牌堆不被正对面玩家的卡压住
    const nearBias = g.anchor.h * 0.08;
    check(`[${tag}] 牌堆锚在桌心（环心偏近侧 8% 环高）且可见`, g.deck.visible && Math.abs(g.deck.cx - g.ringC.x) < 14 && Math.abs(g.deck.cy - (g.ringC.y + nearBias)) < 14,
      `deck=(${Math.round(g.deck.cx)},${Math.round(g.deck.cy)}) ringC+bias=(${Math.round(g.ringC.x)},${Math.round(g.ringC.y + nearBias)})`);
    check(`[${tag}] 桌下光池锚点 = 桌心（布局坐标，transform 前锚点即视觉中心）`, Math.abs(g.anchor.t3L - g.anchor.cx) < 2 && Math.abs(g.anchor.t3T - (g.anchor.cy + nearBias)) < 2,
      `t3(«${g.anchor.t3L}»,«${g.anchor.t3T}») ringCenter+bias=(${Math.round(g.anchor.cx)},${Math.round(g.anchor.cy + nearBias)})`);
    check(`[${tag}] 机位收敛 rx≈19`, Math.abs(g.rx - 19) < 0.6, `rx=${g.rx.toFixed(2)}`);
  }

  // 抽卡一镜到底：他人抽卡=头像克隆飞向桌心牌堆；我抽卡=背影 tp-away 起身（不再有克隆，避免「双我」）
  const chooserName = await A.p.evaluate(() => (S.players.find(p => p.id === (S.turn.chooserId || activePlayerId())) || {}).name);
  const chooserPage = chooserName === '小A' ? A : B;
  const chooserIsMe = await chooserPage.p.evaluate(() => (S.turn.chooserId || activePlayerId()) === myId);
  await chooserPage.p.evaluate((t) => { try { choose(t); } catch (e) {} }, 'truth');
  await A.p.waitForTimeout(350);
  if (chooserIsMe) {
    await chooserPage.p.waitForTimeout(400);   // 等状态回包触发 renderPlayers 挂类
    const tpAway = await chooserPage.p.evaluate(() => !!document.getElementById('tp-back').classList.contains('tp-away'));
    check('我抽卡：背影挂 tp-away（第三人称离座姿态，不飞头像克隆）', tpAway);
  } else {
    // 2026-09-14 用户反馈：抽卡不要任何飘动——头像克隆整体下线，离座用 .away 表达
    await A.p.waitForTimeout(400);
    const noFly = await A.p.evaluate(() => ({
      noClone: !document.querySelector('.fly-avatar'),
      away: !!document.querySelector('#game-players-grid .player-card.away'),
    }));
    check('他人抽卡：无飞行动画且抽卡者挂 .away（离座可读）', noFly.noClone && noFly.away, JSON.stringify(noFly));
  }
  await A.p.waitForTimeout(4300);
  const revealed = await A.p.evaluate(() => ({ revealed: !document.getElementById('card-section').hidden, deckStill: document.getElementById('deck').getBoundingClientRect().width > 0 }));
  check('揭晓正常且桌上牌堆仍在（被抽走的两张归位前，牌堆仍可见）', revealed.revealed && revealed.deckStill, JSON.stringify(revealed));
  console.log('pageerrors:', A.errs.length, B.errs.length, (A.errs[0] || '') + (B.errs[0] || ''));
  if (A.errs.length + B.errs.length) fails.push('pageerror');

  await A.p.screenshot({ path: 'shots/fp-choosing-A.png' });
  await B.p.screenshot({ path: 'shots/fp-choosing-B.png' });

  await b.close(); server.close();
  if (fails.length) { console.error('FAILED:', fails.join(' | ')); process.exit(1); }
  console.log('ALL THIRD-PERSON GEOMETRY PASSED ✅');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
