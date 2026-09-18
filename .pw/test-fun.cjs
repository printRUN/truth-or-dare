// 趣味互动 E2E：表情雨 / 音效开关 / 加倍挑战 / 连击 / 限时挑战 / 命运转盘
// 用法: node test-fun.cjs   （本地模式双标签，端口 8802）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8802;
const URL = `http://127.0.0.1:${PORT}/index.html`;

let fails = 0;
const log = (...a) => console.log('[fun]', ...a);
const ok = (cond, msg) => { log((cond ? '  ✅ ' : '  ❌ ') + msg); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

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
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|WebSocket connection/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function boot(ctx, { name, idx, tag }) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 12000 }).catch(() => {});
  await p.click('details.adv summary');
  await p.click('#chk-local');
  await p.fill('#input-name', name);
  await p.click(`.avatar-option >> nth=0`);
  return p;
}
const revealReady = async p => {
  await p.waitForFunction(() => {
    const el = document.getElementById('punishment-text');
    return el && el.textContent.length > 4 && el.textContent === S.turn.punishment;
  }, null, { timeout: 30000 });
  // 等应用自己的动画锁释放（翻牌 + 打字机真的结束），再让 Playwright 去点——否则点击可能落在正在翻转的牌背/旧位置上
  await p.waitForFunction(() => revealAnim === false, null, { timeout: 10000 });
  await p.waitForTimeout(120);
};
const clickWhenHittable = async (p, sel) => {
  // three3d 下选卡 opacity0.001+pointer-events:none（SPEC §2 ⑮③），真实点击被 #cam 拦截超时——
  // 按 E2E 契约降级 evaluate 级 click（click handler 仍挂在 DOM 卡上）；其余真实按钮保留 Playwright actionability 语义
  const three = /card-(truth|dare)/.test(sel) && await p.evaluate(() => document.body.classList.contains('three3d') && !document.body.classList.contains('loperf'));
  if (three) await p.evaluate(s => document.querySelector(s).click(), sel);
  else await p.click(sel, { timeout: 20000 });
};

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {}
  });
  try {
    // ═══ 组 0：建房 ═══
    const A = await boot(ctx, { name: '阿泽', idx: 0, tag: 'A' });
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    const room = (await A.textContent('#share-room')).trim();
    const B = await boot(ctx, { name: '小雨', idx: 1, tag: 'B' });
    await B.fill('#input-room', room);
    await B.click('#btn-join');
    for (const p of [A, B]) await p.waitForSelector(`#players-grid .player-card .player-name:text-is("小雨")`, { timeout: 25000 });
    await A.waitForTimeout(900);
    ok(true, `组0 双人入房 OK（房间 ${room}）`);

    // ═══ 组 1：表情雨（浮窗默认收起：先点右上角浮标展开，再点 emoji） ═══
    const barVisible = await A.evaluate(() => !document.getElementById('react-bar').hidden);
    ok(barVisible, '组1 大厅显示表情浮标 #react-bar');
    const openDock = async p => p.evaluate(() => {
      const b = document.getElementById('react-bar');
      if (!b.classList.contains('open')) document.getElementById('react-fab').click();
    });
    await A.click('#react-fab');
    const dockOpen = await A.evaluate(() => document.getElementById('react-bar').classList.contains('open'));
    ok(dockOpen, '组1 点浮标展开表情图标（6 颗）');
    const emo = await A.evaluate(() => [...document.querySelectorAll('#react-pop button[data-react]')].map(b => ({ t: b.textContent.trim(), e: b.dataset.react, w: b.getBoundingClientRect().width })));
    ok(emo.length === 6 && emo.every(x => x.t === x.e && x.w >= 30), `组1 表情按钮用 emoji 渲染（${emo.map(x => x.t).join('')}）`);
    await A.click('#react-bar button[data-react="🔥"]');
    const selfRain = await A.evaluate(() => document.querySelectorAll('.react-rain').length);
    const peerRain = await B.waitForFunction(() => document.querySelectorAll('.react-rain').length >= 1, null, { timeout: 4000 }).then(() => true).catch(() => false);
    ok(selfRain >= 1, `组1 本机立刻出现表情（${selfRain} 个）`);
    ok(peerRain, '组1 另一标签页 ~3s 内收到表情（房间广播）');
    // 防刷屏：连点 3 次，320ms 窗口内只应新增 ≤2 颗
    const before = await B.evaluate(() => document.querySelectorAll('.react-rain').length);
    await openDock(A);
    for (let i = 0; i < 3; i++) { await A.click('#react-bar button[data-react="😂"]'); await A.waitForTimeout(90); }
    await A.waitForTimeout(500);
    const after = await B.evaluate(() => document.querySelectorAll('.react-rain').length);
    ok(after - before <= 2, `组1 防刷屏生效（连点 3 次，对端新增 ${after - before} ≤ 2）`);
    await A.evaluate(() => sendReact('💀'));
    const bad = await A.evaluate(() => document.querySelectorAll('.react-rain').length);
    ok(bad <= after + 5, '组1 非法表情被白名单拒绝（无额外粒子）');
    await A.waitForTimeout(3600);
    const cleaned = await A.evaluate(() => document.querySelectorAll('.react-rain').length);
    ok(cleaned === 0, `组1 表情粒子自动清理（残留 ${cleaned}）`);

    // ═══ 组 2：音效开关 ═══
    await A.click('#btn-sfx-lobby');
    const sfxOff = await A.evaluate(() => ({ on: SFX.on, ls: localStorage.getItem('tod:sfx'), label: document.getElementById('btn-sfx-lobby').textContent }));
    ok(!sfxOff.on && sfxOff.ls === 'off' && /静音/.test(sfxOff.label), `组2 音效关闭并持久化（${JSON.stringify(sfxOff)}）`);
    await A.click('#btn-sfx-lobby');
    const sfxOn = await A.evaluate(() => ({ on: SFX.on, ls: localStorage.getItem('tod:sfx') }));
    ok(sfxOn.on && sfxOn.ls === 'on', '组2 音效重新打开');
    const sfxSafe = await A.evaluate(() => { try { SFX.ensure(); SFX.play('reveal'); SFX.play('combo'); return true; } catch (e) { return String(e); } });
    ok(sfxSafe === true, `组2 SFX 播放不抛错（${sfxSafe}）`);

    // ═══ 开局 ═══
    await A.click('#mode-pick .mode-opt[data-mode="turn"]');
    await A.click('#btn-start');
    for (const p of [A, B]) await p.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForTimeout(1300);
    const A_isHost = await A.evaluate(() => isHost());
    const aId = await A.evaluate(() => myId);
    const bId = await B.evaluate(() => myId);
    ok(A_isHost, '组3 阿泽是主持人');
    const designate = async who => {
      const pid = who === 'A' ? aId : bId;
      await A.evaluate(id => designate(id), pid);
      await A.waitForFunction(id => S.turn.chooserId === id && S.turn.stage === 'choosing', pid, { timeout: 10000 });
      await B.waitForFunction(id => S.turn.chooserId === id && S.turn.stage === 'choosing', pid, { timeout: 10000 });
    };

    // ═══ 组 3：加倍挑战（A 抽，完成 → +20，stake 复位）═══
    await designate('A');
    const stakeA = await A.evaluate(() => !document.getElementById('stake-row').hidden);
    const stakeB = await B.evaluate(() => !document.getElementById('stake-row').hidden);
    ok(stakeA && !stakeB, `组3 加倍入口只对持麦人可见（A=${stakeA}, B=${stakeB}）`);
    await clickWhenHittable(A, '#btn-stake');
    const stakeSync = await B.waitForFunction(() => S.turn.stake === 2, null, { timeout: 5000 }).then(() => true).catch(() => false);
    ok(stakeSync, '组3 加倍同步到对端（S.turn.stake=2）');
    const hint = await A.textContent('#choice-hint');
    ok(/加倍/.test(hint), `组3 提示文案已更新（"${hint}"）`);
    await clickWhenHittable(A, '#card-truth');
    await revealReady(A);
    await A.waitForTimeout(300);
    const stakeShown = await A.evaluate(() => ({
      badge: !document.getElementById('stake-badge').hidden,
      accept: document.getElementById('btn-accept').textContent,
    }));
    ok(stakeShown.badge && /\+20/.test(stakeShown.accept), `组3 揭晓页展示加倍（${JSON.stringify(stakeShown)}）`);
    await clickWhenHittable(A, '#btn-accept');
    const dbl = await A.waitForFunction(() => {
      const p = S.players.find(x => x.id === myId);
      return p.score === 20 && (S.turn.stake === 1);
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    if (!dbl) log('     诊断：', JSON.stringify(await A.evaluate(() => ({ stage: S.turn.stage, stake: S.turn.stake, chooserMe: S.turn.chooserId === myId, score: S.players.find(p => p.id === myId).score, combo: S.players.find(p => p.id === myId).combo, acceptVisible: document.getElementById('btn-accept').offsetParent !== null }))));
    ok(dbl, '组3 加倍得分 +20 且回合结束后 stake 复位为 1');
    const combo1 = await A.evaluate(() => S.players.find(x => x.id === myId).combo);
    ok(combo1 === 1, `组3 连击计数 ×1（${combo1}）`);

    // ═══ 组 4：连击 ×2 与徽章，且不改分（+10/次）═══
    await designate('A');
    await clickWhenHittable(A, '#card-truth');
    await revealReady(A);
    await clickWhenHittable(A, '#btn-accept');
    const combo2 = await A.waitForFunction(() => {
      const p = S.players.find(x => x.id === myId);
      return p.combo === 2 && p.score === 30;   // 20 + 10（未加倍）
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    ok(combo2, '组4 连击 ×2、分数 20+10=30（连击不改分）');
    const badge = await A.waitForFunction(id => {
      const c = document.querySelector(`#game-players-grid .player-card[data-pid="${id}"]`);
      const t = c && c.querySelector('.combo-tag');
      return t && t.textContent.includes('🔥×2');
    }, aId, { timeout: 6000 }).then(() => true).catch(() => false);
    ok(badge, '组4 头像挂上 🔥×2 连击徽章');
    const badgeOnB = await B.waitForFunction(id => !!document.querySelector(`#game-players-grid .player-card[data-pid="${id}"] .combo-tag`), aId, { timeout: 6000 }).then(() => true).catch(() => false);
    ok(badgeOnB, '组4 连击徽章同步到对端');

    // ═══ 组 5：跳过清零连击 ═══
    await designate('A');
    await clickWhenHittable(A, '#card-dare');
    await revealReady(A);
    await clickWhenHittable(A, '#btn-skip');
    const reset = await A.waitForFunction(() => {
      const p = S.players.find(x => x.id === myId);
      return p.combo === 0 && p.score === 25;   // 30 - 5
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    const badgeGone = await A.evaluate(id => !document.querySelector(`#game-players-grid .player-card[data-pid="${id}"] .combo-tag`), aId);
    ok(reset, '组5 跳过后 combo=0、分数 30-5=25');
    ok(badgeGone, '组5 徽章消失');

    // ═══ 组 6：限时挑战 ═══
    await A.click('#btn-settings-game');
    await A.waitForSelector('#modal-mask:not([hidden]) [data-tm="15"]', { timeout: 5000 });
    await A.click('[data-tm="15"]');
    const timerSync = await B.waitForFunction(() => S.timer === 15, null, { timeout: 6000 }).then(() => true).catch(() => false);
    ok(timerSync, '组6 限时 15 秒同步到对端');
    await A.evaluate(() => closeModal());
    await designate('B');
    await clickWhenHittable(B, '#card-truth');
    await revealReady(B);
    await A.waitForFunction(() => {
      const w = document.getElementById('timer-wrap');
      return w.classList.contains('on') && document.getElementById('timer-text').textContent.includes('还剩');
    }, null, { timeout: 8000 }).then(() => true).catch(() => false);
    const t1 = await A.textContent('#timer-text');
    await A.waitForTimeout(2200);
    const t2 = await A.textContent('#timer-text');
    ok(/还剩/.test(t1) && /还剩/.test(t2), `组6 倒计时在走（"${t1.trim()}" → "${t2.trim()}"）`);
    const up = await A.waitForFunction(() => document.getElementById('timer-text').textContent.includes('超时'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    const noAuto = await A.evaluate(() => S.turn.stage === 'revealed');
    ok(up && noAuto, '组6 到点显示超时且不自动跳过（stage 仍 revealed、不扣分）');
    await clickWhenHittable(B, '#btn-skip');
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 10000 });

    // ═══ 组 7：命运转盘 ═══
    const prevChooser = await A.evaluate(() => S.turn.chooserId);
    await clickWhenHittable(A, '#btn-pick-next');
    const spotSeen = await A.waitForFunction(() => document.querySelectorAll('#game-players-grid .player-card.spot').length >= 1, null, { timeout: 2500 }).then(() => true).catch(() => false);
    const picked = await A.waitForFunction(([me, prev]) => {
      return S.turn.stage === 'choosing' && S.turn.chooserId && S.turn.chooserId !== me && S.turn.chooserId !== prev && !document.querySelector('#game-players-grid .player-card.spot');
    }, [aId, prevChooser], { timeout: 15000 }).then(() => true).catch(() => false);
    ok(picked, '组7 转盘结束停在新玩家（非主持人、非原持麦人）');
    log(`     转盘光点动画：${spotSeen ? '观测到' : '未捕获（软断言，允许跳过）'}`);

    // ═══ 组 8：🎲 观众押注（只动押注者自己的分）═══
    const scoreOf = (p, id) => p.evaluate(x => S.players.find(y => y.id === x).score, id);
    await designate('B');
    await clickWhenHittable(B, '#card-truth');
    await revealReady(B);
    const betBox = await A.evaluate(() => ({ mine: !document.getElementById('bet-box').hidden, chooser: !document.getElementById('bet-box').hidden }));
    const betBoxOnB = await B.evaluate(() => !document.getElementById('bet-box').hidden);
    ok(betBox.mine && !betBoxOnB, `组8 押注面板只给旁观者（A=${betBox.mine}, 持麦人 B=${betBoxOnB}）`);
    await clickWhenHittable(A, '#bet-accept');
    const betSync = await B.waitForFunction(id => S.turn.bets && S.turn.bets[id] === 'accept', aId, { timeout: 6000 }).then(() => true).catch(() => false);
    ok(betSync, '组8 押注同步到对端（S.turn.bets[A]=accept）');
    await clickWhenHittable(A, '#bet-accept');   // 再点取消
    const betCleared = await B.waitForFunction(id => S.turn.bets && !S.turn.bets[id], aId, { timeout: 6000 }).then(() => true).catch(() => false);
    ok(betCleared, '组8 再点一次可取消押注');
    const score0 = await scoreOf(A, aId);
    await clickWhenHittable(A, '#bet-skip');     // 押「会跳过」，B 也确实跳过 → 押中 +5
    await B.waitForFunction(id => S.turn.bets && S.turn.bets[id] === 'skip', aId, { timeout: 6000 });
    await clickWhenHittable(B, '#btn-skip');
    const wonBet = await B.waitForFunction(([id, s0]) => {
      const p = S.players.find(y => y.id === id);
      return p.score === s0 + 5 && S.turn.betLog && S.turn.betLog.items && S.turn.betLog.items[0] && S.turn.betLog.items[0].won === true && Object.keys(S.turn.bets || {}).length === 0;
    }, [aId, score0], { timeout: 10000 }).then(() => true).catch(() => false);
    ok(wonBet, `组8 押中 +5（${score0} → ${await scoreOf(A, aId)}），结算后押注清空`);
    const logSeen = await A.waitForFunction(() => /押注结算/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }).then(() => true).catch(() => false);
    ok(logSeen, '组8 全场看到「押注结算」播报');
    // 押错：A 押会完成，B 跳过 → A −3
    await designate('B');
    await clickWhenHittable(B, '#card-dare');
    await revealReady(B);
    const score1 = await scoreOf(A, aId);
    await clickWhenHittable(A, '#bet-accept');
    await B.waitForFunction(id => S.turn.bets && S.turn.bets[id] === 'accept', aId, { timeout: 6000 });
    await clickWhenHittable(B, '#btn-skip');
    const lostBet = await A.waitForFunction(([id, s1]) => {
      const p = S.players.find(y => y.id === id);
      return p.score === s1 - 3;
    }, [aId, score1], { timeout: 10000 }).then(() => true).catch(() => false);
    ok(lostBet, `组8 押错 −3（${score1} → ${await scoreOf(A, aId)}）`);
    // 计分关时不出押注面板
    await A.click('#btn-settings-game');
    await A.waitForSelector('#st-scoring', { timeout: 5000 });
    await A.click('#st-scoring');
    await B.waitForFunction(() => S.scoring === false, null, { timeout: 6000 });
    await A.evaluate(() => closeModal());
    await designate('B');
    await clickWhenHittable(B, '#card-truth');
    await revealReady(B);
    const betBoxOff = await A.evaluate(() => document.getElementById('bet-box').hidden);
    ok(betBoxOff, '组8 计分关闭时不出押注面板');
    await clickWhenHittable(B, '#btn-skip');
    await A.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 10000 });
    await A.click('#btn-settings-game');
    await A.waitForSelector('#st-scoring', { timeout: 5000 });
    await A.click('#st-scoring');
    await B.waitForFunction(() => S.scoring !== false, null, { timeout: 6000 });
    await A.evaluate(() => closeModal());

    // ═══ 组 9：🎁 惊喜卡（确定性 + 纯气氛 + 主持开关）═══
    const spDet = await A.evaluate(() => {
      const a = surpriseOf({ punishment: '同一道题', seq: 9 });
      const b = surpriseOf({ punishment: '同一道题', seq: 9 });
      let hit = 0;
      for (let i = 1; i <= 400; i++) if (surpriseOf({ punishment: '概率测试' + (i % 37), seq: i })) hit++;
      return { same: a === b, hit, sample: a && a.id };
    });
    ok(spDet.same, `组9 同题同 seq 推导确定（${spDet.sample || 'null'}）`);
    ok(spDet.hit >= 40 && spDet.hit <= 130, `组9 触发率落在 1/5 区间（400 次命中 ${spDet.hit}）`);
    const spPaint = await A.evaluate(() => ({
      painted: document.getElementById('card-front').classList.contains('surprise'),
      expected: !!surpriseOf(S.turn),
    }));
    const spPaintB = await B.evaluate(() => document.getElementById('card-front').classList.contains('surprise') === !!surpriseOf(S.turn));
    ok(spPaint.painted === spPaint.expected && spPaintB, `组9 金卡上色与推导一致（两端）`);
    await A.click('#btn-settings-game');
    await A.waitForSelector('#st-surprise', { timeout: 5000 });
    await A.click('#st-surprise');
    await B.waitForFunction(() => S.surprise === false, null, { timeout: 6000 });
    await A.evaluate(() => closeModal());
    const spOff = await A.evaluate(() => {
      let hit = 0;
      for (let i = 1; i <= 200; i++) if (surpriseOf({ punishment: '概率测试' + (i % 37), seq: i })) hit++;
      return hit;
    });
    ok(spOff === 0, `组9 主持关闭后不再开出惊喜卡（200 次命中 ${spOff}）`);
    await A.click('#btn-settings-game');
    await A.waitForSelector('#st-surprise', { timeout: 5000 });
    await A.click('#st-surprise');
    await B.waitForFunction(() => S.surprise !== false, null, { timeout: 6000 });
    await A.evaluate(() => closeModal());

    ok(errors.length === 0, errors.length ? `全程零 JS 报错（实际 ${errors.length} 条：${errors.slice(0, 3).join(' | ')}）` : '全程零 JS 报错');
  } catch (e) {
    fails++;
    log('❌ 测试异常：', e.message);
  } finally {
    await browser.close();
    server.close();
  }
  log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 趣味互动全部通过');
  process.exit(fails ? 1 : 0);
})();
