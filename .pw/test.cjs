// E2E: 两个"玩家"（两个标签页）完整游戏流程，覆盖两种模式（轮流制/自由对决）× 两种传输（LOCAL/MQTT）
// 用法: node test.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8731;
const URL = `http://localhost:${PORT}/index.html`;

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res.end(data);
      });
    });
    s.listen(PORT, () => resolve(s));
  });
}

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}
const log = (...a) => console.log('[test]', ...a);

async function joinTab(ctx, { name, room, local, tag }) {
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  if (local) {
    await page.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
    await page.click('#chk-local');
  }
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=' + (tag === 'A' ? 0 : 1));
  await page.click('#btn-join');
  return page;
}

async function waitLobbyBoth(a, b, names) {
  for (const [p] of [[a], [b]]) {
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    for (const n of names) await p.waitForSelector(`#players-grid .player-card .player-name:text-is("${n}")`, { timeout: 25000 });
  }
}

const expectToast = (p, s) => p.waitForFunction(t => {
  const el = document.getElementById('toast');
  return el && el.classList.contains('show') && el.textContent.includes(t);
}, s, { timeout: 8000 });

const waitPunishmentReady = p => p.waitForFunction(
  () => document.getElementById('punishment-text').textContent.length > 5 &&
        document.getElementById('punishment-text').textContent === S.turn.punishment,
  null, { timeout: 25000 });

async function runTurnRound(local, ctx) {
  const label = local ? 'TURN-LOCAL' : 'TURN-MQTT';
  log(`===== ${label} =====`);
  const a = await joinTab(ctx, { name: '小A', local, tag: 'A' });
  await a.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = await a.textContent('#share-room');
  log('room:', room);
  const b = await joinTab(ctx, { name: '小B', room, local, tag: 'B' });
  await waitLobbyBoth(a, b, ['小A', '小B']);
  log('both see lobby with 2 players');

  // 模式选择按钮可切换（先切 free 再切回 turn）
  await a.click('#mode-pick .mode-opt[data-mode="free"]');
  await a.waitForSelector('#mode-pick .mode-opt[data-mode="free"].sel', { timeout: 5000 });
  await a.click('#mode-pick .mode-opt[data-mode="turn"]');
  await a.waitForSelector('#mode-pick .mode-opt[data-mode="turn"].sel', { timeout: 5000 });
  await a.screenshot({ path: `shots/${label}-lobby.png` });

  await a.click('#btn-start');
  await a.waitForSelector('#screen-game.active', { timeout: 15000 });
  await b.waitForSelector('#screen-game.active', { timeout: 15000 });
  for (const p of [a, b]) await p.waitForFunction(() => document.getElementById('mode-chip').textContent.includes('轮流'), null, { timeout: 10000 });
  log('game started, mode chip = 轮流');

  const chooserOf = p => p.evaluate(() => S.turn.chooserId === myId);
  const first = (await chooserOf(a)) ? a : b;
  const other = first === a ? b : a;
  const firstName = first === a ? '小A' : '小B';
  log('chooser:', firstName);
  await other.waitForSelector(`#turn-info:text("轮到「${firstName}」")`, { timeout: 15000 });
  await first.waitForSelector('#choice-section:not([hidden]) >> #card-truth:not(.disabled)', { timeout: 15000 });
  await other.waitForSelector('#choice-section:not([hidden]) >> #card-truth.disabled', { timeout: 15000 });

  // 非当前玩家抢点 → 被守卫拦截，状态不变
  await other.evaluate(() => choose('truth'));
  await expectToast(other, '还没轮到你');
  if (await chooserOf(other)) throw new Error(`${label}: non-chooser stole the turn`);
  if (!(await chooserOf(first))) throw new Error(`${label}: guard corrupted chooser state`);
  log('turn-mode guard: non-chooser blocked');

  // === 回合1: 真心话 → 全体同步看到抽卡与惩罚 ===
  await first.click('#card-truth');
  await first.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });
  await other.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });
  await first.screenshot({ path: `shots/${label}-drawing.png` });
  await first.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await other.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await waitPunishmentReady(first);
  await waitPunishmentReady(other);
  const pa = await first.textContent('#punishment-text');
  const pb = await other.textContent('#punishment-text');
  if (!pa || pa !== pb) throw new Error(`${label}: punishment mismatch "${pa}" vs "${pb}"`);
  log('revealed punishment synced:', pa.slice(0, 24) + '…');
  await first.waitForTimeout(1600);
  await first.screenshot({ path: `shots/${label}-revealed.png` });
  if (await other.locator('#btn-accept').isVisible()) throw new Error(`${label}: non-chooser sees accept button`);
  if (!(await first.locator('#btn-accept').isVisible())) throw new Error(`${label}: chooser missing accept button`);

  await first.click('#btn-accept');
  await first.waitForSelector('#choice-section:not([hidden])', { timeout: 15000 });
  await other.waitForSelector('#choice-section:not([hidden])', { timeout: 15000 });
  log('turn 1 passed');

  // === 回合2: 轮转 → 对方大冒险 → 跳过 ===
  if (!(await chooserOf(other))) {
    const cid = await other.evaluate(() => ({ c: S.turn.chooserId, m: myId }));
    throw new Error(`${label}: turn did not rotate: ${JSON.stringify(cid)}`);
  }
  await other.waitForSelector('#card-dare:not(.disabled)', { timeout: 15000 });
  await other.click('#card-dare');
  await other.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await first.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await waitPunishmentReady(other);
  await other.click('#btn-skip');
  await first.waitForFunction(() => (S.stats.skips || 0) === 1, null, { timeout: 15000 });
  await other.waitForFunction(() => (S.stats.skips || 0) === 1 && S.turn.stage === 'choosing', null, { timeout: 15000 });
  log('skip recorded & turn rotated');

  const ta = await first.textContent('#stat-truth');
  const da = await first.textContent('#stat-dare');
  if (ta !== '1' || da !== '1') throw new Error(`${label}: stats wrong truth=${ta} dare=${da}`);
  log('stats ok: truth=1 dare=1 skip=1');

  // === B 退出 → 留在房间的一端看到玩家消失 ===
  await b.click('#btn-leave-game').catch(() => b.click('#btn-leave'));
  await a.waitForFunction(() => S && S.players.length === 1, null, { timeout: 15000 });
  log('leave propagated');

  await a.close(); await b.close();
  return room;
}

async function runFreeRound(local, ctx) {
  const label = local ? 'FREE-LOCAL' : 'FREE-MQTT';
  log(`===== ${label} =====`);
  const a = await joinTab(ctx, { name: '小A', local, tag: 'A' });
  await a.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  const room = await a.textContent('#share-room');
  log('room:', room);
  const b = await joinTab(ctx, { name: '小B', room, local, tag: 'B' });
  await waitLobbyBoth(a, b, ['小A', '小B']);

  // 选自由对决模式
  await a.click('#mode-pick .mode-opt[data-mode="free"]');
  await a.waitForSelector('#mode-pick .mode-opt[data-mode="free"].sel', { timeout: 5000 });
  await a.screenshot({ path: `shots/${label}-lobby.png` });

  await a.click('#btn-start');
  await a.waitForSelector('#screen-game.active', { timeout: 15000 });
  await b.waitForSelector('#screen-game.active', { timeout: 15000 });
  for (const p of [a, b]) {
    await p.waitForFunction(() => document.getElementById('mode-chip').textContent.includes('自由'), null, { timeout: 10000 });
    await p.waitForSelector('#turn-info:text("抢麦抽卡")', { timeout: 10000 });
    await p.waitForSelector('#choice-section:not([hidden]) >> #card-truth:not(.disabled)', { timeout: 10000 });
    await p.waitForSelector('#choice-section:not([hidden]) >> #card-dare:not(.disabled)', { timeout: 10000 });
  }
  await a.screenshot({ path: `shots/${label}-open-mic.png` });
  log('mic open: BOTH players can grab & choose');

  // === A 抢麦抽真心话 ===
  await a.click('#card-truth');
  await b.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });
  await b.waitForSelector('#turn-info:text("小A")', { timeout: 15000 });
  await a.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await b.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await waitPunishmentReady(a);
  await waitPunishmentReady(b);
  const holder = await b.evaluate(() => S.turn.chooserId === myId);
  if (holder) throw new Error(`${label}: B thinks it holds the mic`);
  if (!(await a.evaluate(() => S.turn.chooserId === myId))) throw new Error(`${label}: A lost the mic`);
  const pa = await a.textContent('#punishment-text');
  const pb = await b.textContent('#punishment-text');
  if (!pa || pa !== pb) throw new Error(`${label}: punishment mismatch "${pa}" vs "${pb}"`);
  if (await b.locator('#btn-accept').isVisible()) throw new Error(`${label}: non-holder sees accept button`);
  log('A grabbed mic & punishment synced:', pa.slice(0, 24) + '…');
  await a.click('#btn-accept');

  // 释放麦克风：双方重新可抢
  for (const p of [a, b]) {
    await p.waitForSelector('#turn-info:text("抢麦抽卡")', { timeout: 15000 });
    await p.waitForSelector('#choice-section:not([hidden]) >> #card-dare:not(.disabled)', { timeout: 15000 });
  }
  log('mic released, open again');

  // === B 抢麦抽大冒险 → 跳过 ===
  await b.click('#card-dare');
  await a.waitForSelector('#deck-section:not([hidden])', { timeout: 15000 });
  await a.waitForSelector('#turn-info:text("小B")', { timeout: 15000 });
  await a.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await b.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
  await waitPunishmentReady(b);
  await b.click('#btn-skip');

  for (const p of [a, b]) {
    await p.waitForFunction(() => S.stats.rounds === 2 && (S.stats.skips || 0) === 1 &&
      S.turn.stage === 'choosing' && !S.turn.chooserId && S.mode === 'free', null, { timeout: 15000 });
    const st = await p.textContent('#stat-turn');
    if (st !== '2') throw new Error(`${label}: stat-turn=${st}, expected 2 (rounds)`);
  }
  await a.screenshot({ path: `shots/${label}-after-skip.png` });
  log('rounds=2, skip=1, mic open again, stat-turn shows rounds');

  await a.close(); await b.close();
  return room;
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });   // 抑制首进引导弹窗（引导本体在 test-host.cjs 里专测），避免遮挡点击
  try {
    await runTurnRound(true, ctx);
    await runFreeRound(true, ctx);
    await runTurnRound(false, ctx);
    await runFreeRound(false, ctx);
    if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(e => console.log(' ', e)); process.exit(1); }
    console.log('\nALL TESTS PASSED');
  } catch (e) {
    console.error('\nTEST FAILED:', e.message);
    if (errors.length) { console.log('PAGE ERRORS:'); errors.forEach(x => console.log(' ', x)); }
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
