const fs = require('fs');
const f = 'D:/myidea/truth-or-dare/.pw/probe-pan.cjs';
let s = fs.readFileSync(f, 'utf8');

// 窄屏段补一个陪玩页：单人房会在 ≤15s 被「清理掉线玩家」watchdog 收回大厅（index.html:4168，
// players.length<2 && gameStarted → false，符合设计）——前扫视后镜像 mutate 就变成 no-op 了
const a = `    await join(A, '阿窄');
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 8000 }).catch(() => {});
    await A.waitForTimeout(800);`;
if (!s.includes(a)) { console.error('anchor missing'); process.exit(1); }
s = s.replace(a, `    await join(A, '阿窄');
    const roomN = await A.evaluate(() => S.room);
    const B = await open(ctx, 'N2', { width: 390, height: 844 });
    await join(B, '阿陪', roomN);
    await A.waitForFunction(() => S.players.length === 2, null, { timeout: 20000 });
    await A.waitForFunction(() => !document.querySelector('.screen.entering') && !document.querySelector('.screen.leaving'), null, { timeout: 8000 }).catch(() => {});
    await A.waitForTimeout(800);`);

// 移除镜像段的调试噪声（qlog 包装与打点已完成任务）
const b = `    // 镜像：回扫 tx-back（先包一层记录，看 renderScreen/applyState/queueSceneEnter 各自看到了什么）
    await A.evaluate(() => {
      window.__qlog = [];
      const oq = window.queueSceneEnter;
      window.queueSceneEnter = function (...a2) { window.__qlog.push(['qse', ...a2]); return oq.apply(this, a2); };
      const ors = window.renderScreen;
      window.renderScreen = function (...a2) { const before = lastScreenName; const r = ors.apply(this, a2); window.__qlog.push(['rs', before, '->', lastScreenName, currentScreen()]); return r; };
      const oas = window.applyState;
      window.applyState = function (...a2) { window.__qlog.push(['as-in', 'gs=' + a2[0].gameStarted]); const r = oas.apply(this, a2); window.__qlog.push(['as-out']); return r; };
    });
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));
    const qlog = await A.evaluate(() => window.__qlog);
    log('[镜像debug] qlog:', JSON.stringify(qlog));`;
if (!s.includes(b)) { console.error('b missing'); process.exit(1); }
s = s.replace(b, `    // 镜像：回扫 tx-back
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));`);

// 移除前扫视 debug 打点
s = s.replace(`    const pt = await A.evaluate(() => ({ last: lastScreenName, gs: S && S.gameStarted, cur: Cam.curScreen }));
    log('[窄屏debug] 前扫视后:', JSON.stringify(pt));
`, '');
s = s.replace(`    const pt2 = await A.evaluate(() => ({ last: lastScreenName, gs: S && S.gameStarted }));
    log('[窄屏debug] 包装时:', JSON.stringify(pt2));
`, '');

fs.writeFileSync(f, s);
console.log('patched');
