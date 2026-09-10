// E2E: 房间内刷新 → 自动回房 + 身份复用（不出现两个一样的自己）+ 主动退出后不再自动回房
// 用法: node test-rejoin.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8736;
const URL = `http://localhost:${PORT}/index.html`;

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
const log = (...a) => console.log('[rejoin]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const names = page => page.evaluate(() => S ? S.players.map(p => p.name) : []);

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });   // 抑制首进引导弹窗（引导本体在 test-host.cjs 里专测），避免遮挡点击
  let A, B, room;
  try {
    // 1) A 创建房间（本地模式）
    A = await ctx.newPage(); watch(A, 'A');
    await A.goto(URL, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
    await A.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
await A.click('#chk-local');
    await A.fill('#input-name', '小A');
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    room = await A.evaluate(() => S.room);
    log('room:', room);

    // 2) B 加入
    B = await ctx.newPage(); watch(B, 'B');
    await B.goto(URL, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
    await B.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
await B.click('#chk-local');
    await B.fill('#input-name', '小B');
    await B.fill('#input-room', room);
    await B.click('#btn-join');
    await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    await sleep(1200);
    let listA = await names(A);
    if (listA.length !== 2) throw new Error('expect 2 players, got ' + JSON.stringify(listA));
    log('both in room:', JSON.stringify(listA));

    // 3) A 刷新页面 → 应自动回房（无任何点击）
    const idBefore = await A.evaluate(() => myId);
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    await sleep(1500);
    const idAfter = await A.evaluate(() => myId);
    if (idBefore !== idAfter) throw new Error(`identity rotated on refresh: ${idBefore} -> ${idAfter}`);
    log('auto-rejoin ok, identity reused:', idAfter);

    // 4) 关键断言：两边视角都只有 2 人，且“小A”只出现一次（无重复的自己）
    listA = await names(A);
    const listB = await names(B);
    const dupA = listA.filter(n => n === '小A').length;
    const dupB = listB.filter(n => n === '小A').length;
    if (dupA !== 1 || dupB !== 1 || listA.length !== 2 || listB.length !== 2) {
      throw new Error(`duplicate self! A sees ${JSON.stringify(listA)}, B sees ${JSON.stringify(listB)}`);
    }
    await A.screenshot({ path: 'shots/rejoin-lobby.png' });
    log('no duplicate self on both sides:', JSON.stringify(listB));

    // 4.5) 主持人刷新回房 → 让位给还在场的玩家，且 👑主持人徽章跟着移交
    const handoff = await A.evaluate(() => {
      const cards = [...document.querySelectorAll('#players-grid .player-card')];
      return {
        hostId: S.hostId, myId,
        tags: cards.map(c => [c.querySelector('.player-name').textContent.trim(), !!c.querySelector('.host-tag')]),
        startTxt: document.getElementById('btn-start').textContent,
      };
    });
    if (handoff.hostId === handoff.myId) throw new Error('host did not abdicate after refresh');
    const tagB = handoff.tags.find(t => t[0] === '小B');
    const tagA = handoff.tags.find(t => t[0] === '小A');
    if (!tagB || !tagB[1]) throw new Error('new host B missing 👑 badge: ' + JSON.stringify(handoff.tags));
    if (tagA && tagA[1]) throw new Error('old host A still wearing 👑 badge');
    if (!handoff.startTxt.includes('等待主持人')) throw new Error('ex-host start button not gated: ' + handoff.startTxt);
    await B.waitForFunction(() => S.hostId === myId, null, { timeout: 10000 });   // 让位也要同步到全场
    log('host abdicated on refresh: now 小B, badges follow hostId ✓');

    // 5) A 再刷一次（连续刷新也不能冒幽灵）
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    await sleep(1500);
    listA = await names(A);
    if (listA.filter(n => n === '小A').length !== 1) throw new Error('dup after 2nd refresh: ' + JSON.stringify(listA));
    log('second refresh still clean:', JSON.stringify(listA));

    // 6) A 主动退出 → 刷新后不应自动回房，停在加入页
    await A.click('#btn-leave');
    await A.waitForSelector('#screen-join.active', { timeout: 10000 });
    await sleep(800);
    const listB2 = await names(B);
    if (listB2.includes('小A')) throw new Error('B still sees A after leave: ' + JSON.stringify(listB2));
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
    await sleep(3500);   // 若误自动回房，早已切到 lobby
    const onJoin = await A.evaluate(() => !joined && !link);
    if (!onJoin) throw new Error('auto-rejoined after manual leave!');
    log('no auto-rejoin after manual leave ✓');

    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    console.log('[rejoin] ALL REJOIN E2E PASSED ✅');
  } catch (e) {
    try { await A.screenshot({ path: 'shots/rejoin-fail.png' }); } catch {}
    console.error('[rejoin] FAILED ❌', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
