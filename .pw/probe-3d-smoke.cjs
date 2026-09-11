// 冒烟探针：3D 舞台/镜头是否真的生效 + 界面能走完一轮（截图存 shots/3d-*.png）
// 用法: node probe-3d-smoke.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8791;
const log = (...a) => console.log('[3d-smoke]', ...a);
const errors = [];

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1600);

  const stage = await p.evaluate(() => {
    const app = document.getElementById('app');
    const world = document.getElementById('world3d');
    return {
      appPerspective: getComputedStyle(app).perspective,
      worldPreserve: getComputedStyle(world).transformStyle,
      worldTransform: world.style.transform,
      joinTransform: getComputedStyle(document.getElementById('screen-join')).transform,
    };
  });
  log('stage:', JSON.stringify(stage));
  await p.screenshot({ path: 'shots/3d-join.png' });

  // 建房 + 第二人
  await p.fill('#input-name', '阿泽');
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.click('.avatar-option >> nth=0');
  await p.click('#btn-join');
  await p.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await p.textContent('#share-room')).trim();
  const q = await ctx.newPage();
  q.on('pageerror', e => errors.push('B pageerror: ' + e.message));
  q.on('console', m => { if (m.type() === 'error') errors.push('B console: ' + m.text()); });
  await q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await q.fill('#input-name', '小雨');
  await q.click('details.adv summary');
  await q.click('#chk-local');
  await q.click('#input-room');
  await q.fill('#input-room', room);
  await q.click('.avatar-option >> nth=1');
  await q.click('#btn-join');
  await p.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'shots/3d-lobby.png' });

  await p.click('#btn-start');
  await p.waitForSelector('#screen-game.active', { timeout: 15000 });
  await p.waitForTimeout(1500);
  const ring = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#game-players-grid .player-card')];
    return {
      table: !!document.querySelector('.table3d'),
      count: cards.length,
      pos: cards.map(c => ({ rx: c.style.getPropertyValue('--rx'), ry: c.style.getPropertyValue('--ry'), rs: c.style.getPropertyValue('--rs'), z: c.style.zIndex })),
      worldTransform: document.getElementById('world3d').style.transform,
      reactBar: !document.getElementById('react-bar').hidden,
      stakeVisible: !document.getElementById('stake-row').hidden,
    };
  });
  log('ring:', JSON.stringify(ring));
  await p.screenshot({ path: 'shots/3d-game.png' });

  // 抽卡一轮
  const mine = await p.evaluate(() => S.turn.chooserId === myId);
  const chooser = mine ? p : q;
  const other = mine ? q : p;
  await chooser.click('#card-dare');
  await other.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await chooser.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await chooser.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
  await chooser.waitForTimeout(600);
  await chooser.screenshot({ path: 'shots/3d-revealed.png' });
  const after = await chooser.evaluate(() => ({ cam: document.getElementById('world3d').style.transform, stakeBadge: !document.getElementById('stake-badge').hidden }));
  log('after reveal:', JSON.stringify(after));
  await chooser.click('#btn-accept');
  await other.waitForTimeout(1600);
  await other.screenshot({ path: 'shots/3d-turn2.png' });

  // 表情雨（本地双标签互推）—— 浮窗默认收起：先点右上角浮标
  await p.click('#react-fab');
  await p.click('#react-bar button[data-react="🔥"]');
  await p.waitForTimeout(400);
  const rain = await q.evaluate(() => document.querySelectorAll('.react-rain').length);
  log('reaction rain on other tab:', rain);
  await q.screenshot({ path: 'shots/3d-react.png' });

  // 音效开关
  const sfx = await p.evaluate(() => ({ on: SFX.on, hasCtx: !!SFX.ctx }));
  log('sfx:', JSON.stringify(sfx));

  log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
  await browser.close();
  server.close();
  process.exitCode = errors.length ? 1 : 0;
})();
