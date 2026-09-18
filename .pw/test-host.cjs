// E2E: 主持人闭环 + 题库升级 + 体验包（本地传输，两标签页）
// 覆盖：av:P## 短索引 / 主持门禁 / 点名 / 温和档过滤 / 换题 / 免答牌 / 代跳 /
//       轮数上限→结算颁奖屏 / 再来一局重置 / 二次确认 / 引导自动弹(独立上下文) / 导入分档
// 用法: node test-host.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8741;
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
const log = (...a) => console.log('[host]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const expectToast = (p, s) => p.waitForFunction(t => {
  const el = document.getElementById('toast');
  return el && el.classList.contains('show') && el.textContent.includes(t);
}, s, { timeout: 8000 });
// 等某端把当前 punishment 完整画到卡面上（打字机结束 / 静态渲染就位）
const waitReveal = p => p.waitForFunction(
  () => document.getElementById('punishment-text').textContent.length > 4 &&
        document.getElementById('punishment-text').textContent === S.turn.punishment,
  null, { timeout: 25000 });

async function joinTab(ctx, { name, room, tag }) {
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
  await page.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
await page.click('#chk-local');
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 30000 });
  return page;
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });   // 引导在末尾用干净上下文专测
  let A, B;
  try {
    // ── 1) 建房/加入 + 头像短索引 & 状态瘦身 ──
    A = await joinTab(ctx, { name: '小A', tag: 'A' });
    B = await joinTab(ctx, { name: '小B', room: await A.evaluate(() => S.room), tag: 'B' });
    for (const p of [A, B]) await p.waitForFunction(() => S && S.players.length === 2, null, { timeout: 25000 });
    const avCheck = await A.evaluate(() => ({
      avs: S.players.map(p => p.avatar),
      bytes: JSON.stringify(S).length,
      host: S.hostId === myId,
    }));
    if (!avCheck.avs.every(a => /^(av:P\d{2}|dcb:\{)/.test(a))) throw new Error('avatar not indexed: ' + avCheck.avs);
    if (avCheck.bytes > 2500) throw new Error('state doc too fat: ' + avCheck.bytes);
    if (!avCheck.host) throw new Error('creator not host');
    log('头像短表示入状态（av:遗留|dcb:配方），整帧文档', avCheck.bytes, 'B，主持人=建房者');

    // 头像渲染端能展开成可显示图
    await A.waitForSelector('#players-grid .player-card .avatar-inner img[src^="data:image/svg"]', { timeout: 5000 });
    log('渲染端按索引展开头像 OK');

    // ── 2) 非主持人开始游戏被拒 ──
    const startTxt = await B.textContent('#btn-start');
    if (!startTxt.includes('等待主持人')) throw new Error('non-host start btn text wrong: ' + startTxt);
    if (!(await B.locator('#btn-start').isDisabled())) throw new Error('start btn enabled for non-host');
    await B.evaluate(() => startGame());
    await expectToast(B, '主持人');
    if (await B.evaluate(() => S.gameStarted)) throw new Error('non-host bypassed host gate!');
    log('包2 主持门禁：非主持点开始/直接调用都被拒');

    // ── 3) 大厅设置弹层：换套装→温和档→(先不设轮数) ──
    await A.click('#btn-settings-lobby');
    await A.waitForSelector('#modal-mask:not([hidden])', { timeout: 5000 });
    const packs = await A.evaluate(() => [...document.querySelectorAll('#modal-body [data-pk]')].map(b => b.dataset.pk));
    if (packs.join(',') !== 'party,couple,office') throw new Error('pack list wrong: ' + packs);
    await A.click('#modal-body [data-pk="couple"]');
    await sleep(600);
    await A.click('#modal-body [data-lv="mild"]');
    await sleep(600);
    await A.click('#modal-close');
    const afterSet = await A.evaluate(() => ({ pack: SPool.pack, lv: S.level, t: SPool.truth.length, want: PACKS.couple.truth.length }));
    if (afterSet.pack !== 'couple' || afterSet.t !== afterSet.want) throw new Error('pack switch failed: ' + JSON.stringify(afterSet));
    if (afterSet.lv !== 'mild') throw new Error('level set failed');
    // 换回派对套（后面温和档断言用派对 mild 集合）
    await A.click('#btn-settings-lobby');
    await A.click('#modal-body [data-pk="party"]');
    await sleep(600);
    await A.click('#modal-close');
    log('包3 套装切换生效并同步，尺度=温和');

    // ── 4) 开局 → 点名把回合给 B ──
    await A.click('#btn-start');
    for (const p of [A, B]) await p.waitForSelector('#screen-game.active', { timeout: 15000 });
    let cid = await A.evaluate(() => S.turn.chooserId);
    const ids = await A.evaluate(() => S.players.map(p => [p.name, p.id]));
    const bId = ids.find(([n]) => n === '小B')[1];
    if (cid !== bId) {
      await A.click(`#game-players-grid .player-card[data-pid="${bId}"]`);   // 点头像点名
      await expectToast(A, '已点名');
    }
    for (const p of [A, B]) await p.waitForFunction((id) => S.turn.chooserId === id && S.turn.stage === 'choosing', bId, { timeout: 10000 });
    log('包2 主持人点头像点名 → B 持回合');

    // ── 5) B 抽真心话：温和档过滤 ──
    await B.click('#card-truth');
    for (const p of [A, B]) await p.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
    await waitReveal(B);
    const mildArr = await B.evaluate(() => PACKS.party.truth.filter(i => i.t === 'mild').map(i => i.x));
    const mildSet = new Set(mildArr);
    let pun = await B.evaluate(() => S.turn.punishment);
    if (!mildSet.has(pun)) throw new Error('mild filter leaked: ' + pun);
    log('包3 尺度过滤：温和档只出温和题「' + pun.slice(0, 14) + '」');

    // ── 6) 主持人换题（不计任何账） ──
    await A.waitForSelector('#btn-reroll:not([hidden])', { timeout: 5000 });   // A(host) 可见
    if (await B.locator('#btn-reroll').isVisible()) throw new Error('reroll visible to non-host');
    await A.click('#btn-reroll');
    await waitReveal(B);
    const pun2 = await B.evaluate(() => S.turn.punishment);
    const ledger = await B.evaluate(() => ({ sk: S.stats.skips, ps: S.players.find(p => p.name === '小B').passes }));
    if (!pun2 || pun2 === pun) throw new Error('reroll did not change card: ' + pun2);
    if (ledger.sk !== 0 || ledger.ps !== 2) throw new Error('reroll polluted ledger: ' + JSON.stringify(ledger));
    log('包2 局中换题 OK，账本无副作用');

    // ── 7) B 打免答牌：静默换题、不留跳过、张数-1 ──
    await B.waitForSelector('#btn-pass:not([hidden])', { timeout: 5000 });
    if (!(await B.locator('#btn-pass').textContent()).includes('×2')) throw new Error('pass count label wrong');
    await B.click('#btn-pass');
    await waitReveal(B);
    const pun3 = await B.evaluate(() => S.turn.punishment);
    const passState = await B.evaluate(() => {
      const p = S.players.find(x => x.name === '小B');
      return { passes: p.passes, skips: p.skips, statsSkips: S.stats.skips };
    });
    if (pun3 === pun2) throw new Error('pass did not reroll');
    if (passState.passes !== 1 || passState.skips !== 0 || passState.statsSkips !== 0) throw new Error('pass ledger wrong: ' + JSON.stringify(passState));
    log('包3 免答牌：×2→×1，跳过数保持 0，题已悄悄换掉');

    // ── 8) B 完成 → +10 分；领先 chip ──
    await B.click('#btn-accept');
    await B.waitForFunction(() => { const p = S.players.find(x => x.id === myId); return p.score === 10 && p.draws === 1; }, null, { timeout: 10000 });
    await A.waitForFunction(() => S.turn.chooserId === S.players.find(p => p.name === '小A').id && S.turn.stage === 'choosing', null, { timeout: 10000 });
    await sleep(300);
    const leadTxt = await A.textContent('#stat-leader');
    if (!leadTxt.includes('小B') || !leadTxt.includes('+10')) throw new Error('leader chip wrong: ' + leadTxt);
    log('包2 计分：完成 +10，领先chip=', leadTxt);

    // ── 9) 模拟 B 掉线卡回合 → 主持人代跳（-5 记账） ──
    // 在线与否现在看「本机收到对方心跳增长的时刻」（免疫跨设备时钟偏差），
    // 而改 lastSeen 字段已伪造不了掉线（会被心跳水位线抬回去，这正是防覆盖的目的）。
    // 所以：先停掉 B 的心跳定时器，再把 A 侧的到达水位拨旧 60s。
    await A.click(`#game-players-grid .player-card[data-pid="${bId}"]`);   // 先把回合点名交给 B
    await A.waitForFunction((id) => S.turn.chooserId === id, bId, { timeout: 8000 });
    await B.evaluate(() => stopTimers());
    const staleB = () => A.evaluate(bid => HbLocal.set(bid, Date.now() - 60000), bId);
    const staleBOff = () => A.evaluate(bid => HbLocal.set(bid, Date.now()), bId);
    for (let i = 0; i < 3; i++) {
      await staleB();
      try { await A.waitForSelector('#ghost-bar', { state: 'visible', timeout: 3000 }); break; }
      catch { if (i === 2) throw new Error('ghost bar never appeared'); }
    }
    if (await B.locator('#ghost-bar').isVisible()) throw new Error('ghost bar leaked to non-proxy client');
    await A.click('#btn-ghost-skip');
    await A.waitForFunction(() => {
      const b = S.players.find(p => p.name === '小B');
      return b.skips === 1 && b.score === 5 && S.stats.skips === 1;
    }, null, { timeout: 10000 });
    await A.waitForFunction(() => S.turn.chooserId === myId && S.turn.stage === 'choosing', null, { timeout: 10000 });
    await B.evaluate(() => startTimers());   // 恢复心跳，后续用例里 B 不该再被当成幽灵
    await staleBOff();
    log('包1 掉线灰化+代跳：B skips=1 score=10-5=5，回合解锁');

    // ── 10) 轮数上限 → 第 2 轮收束自动结算（先 UI 选 6 验证设置链路，再兜底改成 2） ──
    await A.click('#btn-settings-game');
    await A.waitForSelector('#modal-mask:not([hidden])', { timeout: 5000 });
    await A.selectOption('#st-rounds', '6');
    await sleep(600);
    await A.click('#modal-close');
    await B.waitForFunction(() => S.roundLimit === 6, null, { timeout: 8000 });   // ⚙️设置→状态→同步 全链路
    await A.evaluate(() => mutate(n => { n.roundLimit = 2; }));                    // 下拉没有 2，直接写状态：代跳不占轮数，B 抽 1 + A 抽 1 = 打满
    await B.waitForFunction(() => S.roundLimit === 2, null, { timeout: 8000 });
    await A.click('#card-dare');
    for (const p of [A, B]) await p.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
    await waitReveal(A);
    await A.click('#btn-accept');
    for (const p of [A, B]) await p.waitForSelector('#screen-result.active', { timeout: 15000 });
    const pods = await A.evaluate(() => [...document.querySelectorAll('#result-podium .pod')].map(x => ({ n: x.querySelector('.pname').textContent, s: x.querySelector('.pscore').textContent })));
    if (pods.length !== 2 || pods[0].n !== '小A' || pods[0].s !== '10 分' || pods[1].n !== '小B') throw new Error('podium wrong: ' + JSON.stringify(pods));
    const awards = await A.textContent('#result-awards');
    if (!awards.includes('本局冠军') || !awards.includes('最会坦白')) throw new Error('awards missing: ' + awards);
    log('包2 打满 2 轮自动进结算屏；冠军=', pods[0].n, pods[0].s, '亚军=', pods[1].n, pods[1].s);

    // 非主持人看不到结算操作，且直接调用被拒
    if (await B.locator('#btn-rematch').isVisible()) throw new Error('rematch visible to non-host');
    await B.evaluate(() => finishGame());
    await expectToast(B, '主持人');

    // ── 11) 再来一局：一切账目重置 ──
    await A.click('#btn-rematch');
    await A.waitForSelector('#screen-game.active', { timeout: 15000 });
    await B.waitForSelector('#screen-game.active', { timeout: 15000 });
    const reset = await A.evaluate(() => ({
      fin: S.finished, rounds: S.stats.rounds,
      b: S.players.find(p => p.name === '小B'), recent: S.recent.truth.length,
    }));
    if (reset.fin !== null || reset.rounds !== 0 || reset.b.score !== 0 || reset.b.skips !== 0 || reset.b.passes !== 2 || reset.recent !== 0) throw new Error('rematch reset wrong: ' + JSON.stringify(reset));
    log('包2/3 再来一局：finished/战绩/免答牌/防重历史全部归零');

    // ── 12) 主持人「回到大厅」需二次确认 ──
    await A.click('#btn-end-game');
    const armed = await A.evaluate(() => { const b = document.getElementById('btn-end-game'); return b.classList.contains('armed') && b.textContent.includes('再点一次'); });
    if (!armed) throw new Error('end-game not armed on first click');
    await A.click('#btn-end-game');
    for (const p of [A, B]) await p.waitForSelector('#screen-lobby.active', { timeout: 15000 });
    log('包4 破坏性操作二次确认：染红→再点才生效');

    // ── 13) 导入分档（parsePools 单元级） ──
    const parsed = await A.evaluate(() => parsePools('### 温和级\n1. 🟢 今天开心吗？\n🔴 大秘密\n## 大冒险\n做个俯卧撑', 'truth'));
    if (parsed.truth.length !== 2 || parsed.truth[0].t !== 'mild' || parsed.truth[1].t !== 'hot' || parsed.dare.length !== 1 || parsed.dare[0].t !== 'normal') {
      throw new Error('tier parsing wrong: ' + JSON.stringify(parsed));
    }
    log('包3 导入分档：🟢/🔴 行首标 + 「温和级」小标题 + 默认普通级 全部正确');

    // ── 14) 新手引导首进大厅自动弹一次（干净上下文） ──
    const ctx2 = await browser.newContext();
    const C = await ctx2.newPage();
    watch(C, 'C');
    await C.goto(URL, { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
    await C.click('details.adv summary');   // 展开高级选项（本地模式复选框收纳其中）
await C.click('#chk-local');
    await C.fill('#input-name', '小C');
    await C.click('#btn-join');
    await C.waitForSelector('#guide-mask:not([hidden])', { timeout: 8000 });
    await C.click('#btn-guide-ok');
    await C.waitForSelector('#guide-mask', { state: 'hidden', timeout: 5000 });
    const twice = await C.evaluate(() => localStorage.getItem('tod:guide'));
    if (!twice) throw new Error('guide flag not persisted');
    log('包4 新手引导：首进大厅自动弹出，可关闭且不再骚扰');

    await C.close(); await ctx2.close();
    await A.screenshot({ path: 'shots/host-final.png' });
    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    console.log('\n[host] ALL HOST-E2E PASSED ✅');
  } catch (e) {
    try { await A.screenshot({ path: 'shots/host-fail.png' }); } catch {}
    console.error('[host] FAILED ❌', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
