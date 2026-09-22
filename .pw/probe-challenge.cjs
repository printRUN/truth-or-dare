// 随机惩罚模式探针（8951）：开关往返/同步、dare 抽题路由、答案拆分不泄漏（DOM+canvas fillText 双路）、
// 揭底交互+心跳免疫、pass/reroll 换题仍走挑战池、truth 不受影响、关掉恢复普通池、题库 40 字契约
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8951;
let fails = 0;
const errors = [];
const ok = (c, n, d) => { if (c) console.log('PASS ·', n, d !== undefined ? JSON.stringify(d).slice(0, 120) : ''); else { fails++; console.log('FAIL ·', n, d !== undefined ? JSON.stringify(d).slice(0, 160) : ''); } };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILL_SPY = () => {
  window.__fill = [];
  const o = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s) {
    try { if (typeof s === 'string' && s.length > 3) window.__fill.push(s); } catch (e) {}
    return o.apply(this, arguments);
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  await ctx.addInitScript(FILL_SPY);
  const mk = async (nm) => {
    const q = await ctx.newPage();
    q.on('pageerror', e => errors.push(nm + ' pageerror: ' + e.message));
    q.on('console', m => { if (m.type() === 'error') errors.push(nm + ' console: ' + m.text()); });
    await q.goto(`http://127.0.0.1:${PORT}/index.html?game=tod`, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    await q.fill('#input-name', nm);
    await q.click('details.adv summary');
    await q.click('#chk-local');
    await q.click('.avatar-option >> nth=0');
    return q;
  };

  // ── 开局 ──
  const A = await mk('阿泽');
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await mk('小雨');
  await B.fill('#input-room', room); await B.click('#btn-join');
  await A.waitForFunction(() => S.players.length >= 2, null, { timeout: 20000 });
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await sleep(2200);
  ok(true, '开局 two-tab local room');

  const pageOf = async pid => (await A.evaluate(() => myId)) === pid ? A : B;
  const chooserPage = async () => {
    for (const t of [A, B]) { try { if (await t.evaluate(() => S.turn.chooserId === myId)) return t; } catch (e) {} }
    return null;
  };
  const waitStage = async (st, ms) => {
    for (const t of [A, B]) await t.waitForFunction(s => S.turn.stage === s, st, { timeout: ms || 20000 }).catch(() => errors.push('waitStage ' + st));
  };
  const openSettings = async pg => {
    await pg.evaluate(() => { try { document.getElementById('btn-settings-game').click(); } catch (e) { openSettingsModal(); } });
    await pg.waitForSelector('#st-challenge', { timeout: 8000 });
  };
  const closeSettings = async pg => pg.evaluate(() => { const m = document.getElementById('modal-mask'); if (m && !m.hidden) m.click(); });

  // ── ① 开关：打开 + 双端同步 ──
  await openSettings(A);
  await A.click('#st-challenge');
  await sleep(400);
  const label = await A.evaluate(() => document.getElementById('st-challenge').textContent);
  ok(label.includes('开') && !label.includes('关'), '① 开关标签=开', label);
  ok(await A.evaluate(() => S.challenge === true) && await B.evaluate(() => S.challenge === true), '① S.challenge 双端同步 true');
  // 题库契约（页面侧直读全局词典）
  const contract = await A.evaluate(() => ({
    n: CHALLENGE_POOL.length,
    long: CHALLENGE_POOL.filter(it => ('『' + it.f + '』' + it.x).length > 40).map(it => it.f + it.x),
    forms: [...new Set(CHALLENGE_POOL.map(it => it.f))].length,
    ans: CHALLENGE_POOL.filter(it => it.a).length,
  }));
  ok(contract.n >= 60 && contract.forms >= 10 && contract.long.length === 0 && contract.ans >= 20, '① 题库契约（≥60 条/≥10 形式/≤40 字/带答案）', contract);
  await closeSettings(A);

  // ── 通用：抽一次 dare（挑战模式断言）──
  const drawDare = async (tag, { expectChallenge = true, usePass = false, reroll = false } = {}) => {
    await waitStage('choosing');
    const ch = await chooserPage();
    if (!ch) { ok(false, tag + ' chooser found'); return null; }
    await sleep(1200);
    await ch.evaluate(() => choose('dare'));
    await waitStage('revealed', 20000);
    await ch.waitForFunction(() => !revealAnim, null, { timeout: 30000 });
    await sleep(500);
    let st = await ch.evaluate(() => ({
      p: S.turn.punishment, dom: document.getElementById('punishment-text').textContent,
      rowHidden: document.getElementById('answer-row').hidden, btnHidden: document.getElementById('btn-answer').hidden,
      fill: window.__fill.filter(s2 => s2.includes('\u0001')).length,
    }));
    if (expectChallenge) {
      ok(/^『[^』]+』/.test(st.p), tag + ' 状态串带『形式』前缀', st.p && st.p.slice(0, 24));
      ok(!st.dom.includes('\u0001') && st.dom === punPartsStr(st.p), tag + ' DOM 牌面=拆分后文本（无分隔符）', st.dom.slice(0, 20));
      ok(st.fill === 0, tag + ' canvas fillText 无 \\u0001 泄漏');
      ok(st.rowHidden === !st.p.includes('\u0001'), tag + ' 揭底块显隐与答案存在性一致', { rowHidden: st.rowHidden, hasAns: st.p.includes('\u0001') });
    } else {
      ok(!/^『/.test(st.p), tag + ' 关闭后恢复普通题库（无前缀）', st.p && st.p.slice(0, 20));
      ok(st.rowHidden, tag + ' 揭底块隐藏');
    }
    // 揭底交互 + 心跳免疫
    if (expectChallenge && st.p.includes('\u0001')) {
      const ch2 = await chooserPage();
      const clicker = ch2 || ch;
      await clicker.evaluate(() => document.getElementById('btn-answer').click()).catch(async () => await clicker.evaluate(() => { document.getElementById('btn-answer').hidden = false; document.getElementById('btn-answer').click(); }));
      await sleep(300);
      let at = await clicker.evaluate(() => ({ h: document.getElementById('answer-text').hidden, t: document.getElementById('answer-text').textContent }));
      ok(!at.h && at.t === st.p.split('\u0001')[1], tag + ' 揭底显示参考答案', at.t);
      await sleep(1600);   // 跨一次心跳全量重渲染
      at = await clicker.evaluate(() => ({ h: document.getElementById('answer-text').hidden, t: document.getElementById('answer-text').textContent }));
      ok(!at.h && at.t === st.p.split('\u0001')[1], tag + ' 心跳重渲染不抹掉已揭底答案（lastAnsSig）', at.t);
    }
    if (reroll) {
      await A.waitForFunction(() => !document.getElementById('btn-reroll').hidden, null, { timeout: 8000 }).catch(() => {});
      await A.evaluate(() => document.getElementById('btn-reroll').click());
      await ch.waitForFunction(() => !revealAnim, null, { timeout: 30000 }).catch(() => {});
      await sleep(600);
      const st2 = await ch.evaluate(() => S.turn.punishment);
      ok(/^『[^』]+』/.test(st2) && st2 !== st.p, tag + ' 主持人换一题→仍是挑战题', st2 && st2.slice(0, 22));
    }
    if (usePass) {
      const passes0 = await ch.evaluate(() => me().passes ?? 2);
      await ch.evaluate(() => document.getElementById('btn-pass').click());
      await ch.waitForFunction(() => !revealAnim, null, { timeout: 30000 }).catch(() => {});
      await sleep(600);
      const st3 = await ch.evaluate(() => ({ p: S.turn.punishment, passes: me().passes ?? 2 }));
      ok(/^『[^』]+』/.test(st3.p) && st3.p !== st.p && st3.passes === passes0 - 1, tag + ' 免答牌换题→仍是挑战题且 -1', st3.p && st3.p.slice(0, 22));
    }
    // 完成收尾
    await ch.evaluate(() => { try { document.getElementById('btn-accept').click(); } catch (e) {} }).catch(() => {});
    await waitStage('choosing', 15000);
    return st.p;
  };
  // 页面域里的 punParts（探针内复用）
  function punPartsStr(p) { const i = p.indexOf('\u0001'); return i < 0 ? p : p.slice(0, i); }

  // ── ② 挑战抽题 ×3（覆盖不同形式/答案分支）──
  await drawDare('② dare#1');
  await drawDare('② dare#2');
  // ── ③ 真心话不受影响 ──
  {
    await waitStage('choosing');
    const ch = await chooserPage();
    await sleep(1200);
    await ch.evaluate(() => choose('truth'));
    await waitStage('revealed', 20000);
    await ch.waitForFunction(() => !revealAnim, null, { timeout: 30000 });
    await sleep(400);
    const st = await ch.evaluate(() => ({ p: S.turn.punishment, dom: document.getElementById('punishment-text').textContent, rowHidden: document.getElementById('answer-row').hidden }));
    ok(!/^『/.test(st.p), '③ truth 无『形式』前缀', st.p && st.p.slice(0, 20));
    ok(!st.dom.includes('\u0001') && st.rowHidden, '③ truth 牌面/揭底不受影响');
    await ch.evaluate(() => document.getElementById('btn-accept').click());
    await waitStage('choosing', 15000);
  }
  // ── ④ 换一题/免答仍走挑战池 ──
  await drawDare('④ reroll dare', { reroll: true });
  await drawDare('④ pass dare', { usePass: true });

  // ── ⑤ 关闭开关 → 恢复普通池 ──
  await openSettings(A);
  await A.click('#st-challenge');
  await sleep(400);
  ok(await A.evaluate(() => S.challenge !== true), '⑤ 关闭后 S.challenge=false');
  await closeSettings(A);
  await drawDare('⑤ dare after off', { expectChallenge: false });

  ok(errors.length === 0, '全程零 pageerror/console.error', errors.slice(0, 3));
  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
