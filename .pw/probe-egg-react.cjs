// 探针：2026-09-17 轮验收（8881 端口）——趣味1 表情包气泡 / 趣味2 扔鸡蛋 / Bug2 免答牌重抽
// 断言：大厅仍走 DOM 表情雨 / 牌桌 3D 表情挂小人头顶（无 DOM 雨）/ 🥚 初始 1 颗·瞄准投掷·目标端糊屏·0 颗拦截 /
//       免答牌触发 reback→refly→fly 重抽动画且题面翻回 shown / 完成挑战鸡蛋 +1 / 无页面错误
// 用法: node probe-egg-react.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8881;
const log = (...a) => console.log('[egg-react]', ...a);
const errors = [];
let fails = 0;
function ok(cond, name, detail) {
  if (cond) log('  ✅', name, detail ? JSON.stringify(detail) : '');
  else { fails++; log('  ❌', name, detail ? JSON.stringify(detail) : ''); }
}

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const mk = async (nm, av) => {
    const q = await ctx.newPage();
    q.on('pageerror', e => errors.push(nm + ' pageerror: ' + e.message));
    q.on('console', m => { if (m.type() === 'error') errors.push(nm + ' console: ' + m.text()); });
    await q.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 }).catch(() => {});
    await q.fill('#input-name', nm);
    await q.click('details.adv summary');
    await q.click('#chk-local');
    await q.click(`.avatar-option >> nth=${av}`);
    return q;
  };
  const A = await mk('阿泽', 0);
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  const room = (await A.textContent('#share-room')).trim();
  const B = await mk('小雨', 1);
  await B.fill('#input-room', room);
  await B.click('#btn-join');
  await A.waitForFunction(() => S.players.length >= 2, null, { timeout: 15000 });
  await A.waitForTimeout(600);

  // ── ① 大厅：表情雨照旧（没有 3D 小人，DOM 雨兜底）──
  await A.click('#react-fab');
  await A.click('[data-react="👏"]');
  const bLobbyRain = await B.waitForSelector('.react-rain', { timeout: 4000 }).then(() => true).catch(() => false);
  ok(bLobbyRain, 'lobby: DOM react rain still delivered to peer');
  await A.waitForTimeout(2800);   // 等大厅雨清场，别污染牌桌计数

  // ── ② 开局到牌桌 ──
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 8000 });
  await A.waitForTimeout(1500);
  const eggs0 = await A.evaluate(() => ({ a: document.getElementById('egg-left').textContent, b: (S.players.find(p => p.id !== myId).eggs ?? 1) }));
  ok(eggs0.a === '1' && String(eggs0.b) === '1', 'each player starts with 1 egg', eggs0);

  // ── ③ 牌桌表情 → 3D 小人气泡，不再出 DOM 雨 ──
  await B.click('#react-fab');
  await B.click('[data-react="😂"]');
  const bub = await A.waitForFunction(() => window.__three && window.__three.fxState && window.__three.fxState().bubbles > 0, null, { timeout: 4000 }).then(() => true).catch(() => false);
  ok(bub, 'game: reaction becomes 3D bubble above sender char');
  const domRain = await A.evaluate(() => document.querySelectorAll('.react-rain').length);
  ok(domRain === 0, 'game: no DOM rain spawned in three3d', domRain);
  await A.screenshot({ path: 'shots/eggfx-bubble.png' });

  // ── ③b 说话声波：paintVoice 钩子喂 voice → 绿光身+点头+脚下外扩波环 ──
  const bid2 = await A.evaluate(() => S.players.find(p => p.id !== myId).id);
  const hookOk = await A.evaluate(pid => { paintVoice(pid, 0.9, true); const ch = window.__three.chars.get(pid); return ch ? ch.userData.voice : -1; }, bid2);
  ok(hookOk > 0.4, 'paintVoice hook feeds RMS into 3D char voice', hookOk);
  await A.evaluate(pid => { window.__three.chars.get(pid).userData.voice = 0.85; }, bid2);   // 直驱视觉（探针无麦，避开 MIC 节询写零）
  await A.waitForTimeout(700);
  const vfx = await A.evaluate(pid => {
    const T = window.__three;
    const ch = T.chars.get(pid);
    if (!ch) return { waves: 0, nod: 0, glow: 0, dbg: { pid: String(pid || '').slice(-4), keys: [...T.chars.keys()].map(k => k.slice(-4)), canvas: !!document.getElementById('three-canvas'), active: document.getElementById('screen-game').className } };
    const u = ch.userData;
    return { waves: window.__three.fxState().voiceWaves, nod: +Math.abs(u.head.rotation.x).toFixed(3), glow: +u.torso.material.emissive.g.toFixed(3) };
  }, bid2);
  ok(vfx.waves >= 1 && vfx.glow > 0.02, 'speaking spawns expanding voice waves + green body glow', vfx);
  ok(vfx.nod > 0.005, 'head nods while speaking', vfx);
  await A.screenshot({ path: 'shots/voicewave.png' });
  await A.evaluate(pid => { paintVoice(pid, 0, false); window.__three.chars.get(pid).userData.voice = 0; }, bid2);
  await A.waitForTimeout(1300);
  const vstop = await A.evaluate(() => window.__three.fxState().voiceWaves);
  ok(vstop === 0, 'voice waves stop after speaking ends', vstop);

  // ── ④ 扔鸡蛋：瞄准 → 点名牌 → 全场飞蛋 + 被砸端糊屏 ──
  const bid = await A.evaluate(() => S.players.find(p => p.id !== myId).id);
  await A.click('#btn-egg');
  ok(await A.evaluate(() => document.body.classList.contains('egg-aim')), 'egg aim mode armed');
  await A.click(`#game-players-grid .player-card[data-pid="${bid}"]`);
  await A.waitForTimeout(350);
  const inFlight = await A.evaluate(() => ({ eggs: window.__three.fxState().eggs, aim: document.body.classList.contains('egg-aim'), left: document.getElementById('egg-left').textContent }));
  ok(inFlight.eggs >= 1, 'thrower sees 3D egg in flight', inFlight);
  ok(inFlight.aim === false && inFlight.left === '0', 'aim disarmed and egg count 0 after throw', inFlight);
  const bInFlight = await B.evaluate(() => window.__three.fxState().eggs >= 1).catch(() => false);   // 必须在落地前采样：命中即删
  ok(bInFlight, 'target also sees incoming egg (toward own camera)');
  // 壳屑只在命中后 ~0.95s 内在场：等待必须放在命中窗口内（B 截图等耗时会把窗口耗完）
  const shellsOk = await A.waitForFunction(() => window.__three.fxState().shells >= 1, null, { timeout: 3000 }).then(() => true).catch(() => false);
  ok(shellsOk, 'shell burst at impact (onlooker view)');
  const splat = await B.waitForSelector('.egg-splat', { state: 'attached', timeout: 4000 }).catch(() => null);
  ok(!!splat, 'target screen gets egg splat overlay');
  ok(await B.evaluate(() => { const s = document.querySelector('.egg-splat'); return !!s && !!s.querySelector('.blob') && !!s.querySelector('.yolk'); }), 'splat has blob+yolk');
  const faceOk = await A.waitForFunction(() => window.__three.fxState().faceSplats >= 1, null, { timeout: 4000 }).then(() => true).catch(() => false);
  ok(faceOk, 'face splat stuck on target char (onlooker view)');
  await A.waitForTimeout(2600);   // 等壳屑落定（950ms 生命周期）再留证：蛋液仍在小人脸上
  await A.screenshot({ path: 'shots/eggfx-break.png' });
  const splatGone = await B.waitForSelector('.egg-splat', { state: 'detached', timeout: 7000 }).then(() => true).catch(() => false);
  ok(splatGone, 'splat cleans itself up (~5s)');
  const faceCleared = await A.waitForFunction(() => window.__three.fxState().faceSplats === 0, null, { timeout: 6000 }).then(() => true).catch(() => false);
  ok(faceCleared, 'face splat on target char fades out (~4.5s)');
  await A.waitForFunction(() => window.__three.fxState().eggs === 0, null, { timeout: 4000 }).catch(() => {});
  const bEggs = await B.evaluate(() => document.getElementById('egg-left').textContent);
  ok(bEggs === '1', "target's own eggs unaffected", bEggs);

  // ── ⑤ 0 颗拦截 ──
  await A.click('#btn-egg');
  await A.click(`#game-players-grid .player-card[data-pid="${bid}"]`);
  await A.waitForTimeout(500);
  const blocked = await A.evaluate(() => ({ left: document.getElementById('egg-left').textContent, toast: (document.querySelector('.toast') || {}).textContent || '' }));
  ok(blocked.left === '0' && /鸡蛋用完/.test(blocked.toast), '0 eggs throw is blocked with toast', blocked);

  // ── ⑥ 免答牌 = 收牌重抽（reback→refly→fly→flip→shown）──
  let chooser = null;
  for (const t of [A, B]) { try { if (await t.evaluate(() => S.turn.chooserId === myId)) { chooser = t; break; } } catch (e) {} }
  if (!chooser) { log('❌ no chooser tab'); process.exit(1); }
  await chooser.evaluate(() => choose(Math.random() < 0.5 ? 'truth' : 'dare'));   // 选卡路径 feel 探针已覆盖，这里走直调
  await chooser.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 20000 });
  await chooser.waitForFunction(() => window.__three.fxState().cardPhase === 'shown', null, { timeout: 12000 });
  await chooser.waitForTimeout(400);
  const passes0 = await chooser.evaluate(() => me().passes ?? 2);
  // 采样器必须先于点击安装：evaluate 往返本身要耗 1-2 帧，装晚了对 720ms 的 reback/refly 是整段盲区
  await chooser.evaluate(() => {
    window.__phases = []; window.__xs = [];
    const tick = () => {
      try { const T = window.__three, fx = T.fxState(); window.__phases.push(fx.cardPhase); window.__xs.push(fx.cardPos.x); } catch (e) {}
      if (window.__xs.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await chooser.click('#btn-pass');
  // 软渲下主线程被 WebGL 阻塞：rAF 逐帧采样（与应用帧循环同拍），判据取「本质」：牌曾离桌（x>0.5 在牌堆）且终态回桌心（|x|<0.05）+ 相位 shown
  await chooser.waitForTimeout(5300);
  const ph = await chooser.evaluate(() => window.__phases || []);
  const xs = await chooser.evaluate(() => window.__xs || []);
  const wentToDeck = xs.some(x => x > 0.5);   // 收回牌堆（deck 本地 x≈1.12；rest x≈0）
  const backToRest = Math.abs(xs[xs.length - 1]) < 0.05;
  ok(wentToDeck && backToRest, 'pass card replays re-deal: card left table and returned to rest', { phases: ph.filter((v, i, a) => a[i - 1] !== v), wentToDeck, backToRest });
  ok(ph[ph.length - 1] === 'shown', 're-deal settles back to shown', ph.slice(-4));
  // 防劫持回归锁：refly 交棒 fly 后 flip 准入门不得把飞行中的卡原地翻面——终态必须在桌心 rest（x≈0），不是牌堆（x≈1.12）
  const flyAfterRefly = (() => { const i = ph.lastIndexOf('refly'); return i >= 0 && ph.slice(i).includes('fly'); })();
  const cardEnd = await chooser.evaluate(() => window.__three.fxState().cardPos);
  ok(flyAfterRefly && Math.abs(cardEnd.x) < 0.05, 're-deal actually re-flies: card settles at table rest (not hijacked at deck)', { flyAfterRefly, cardEnd });
  const passes1 = await chooser.evaluate(() => me().passes ?? 2);
  ok(passes1 === passes0 - 1, 'passes decremented once', [passes0, passes1]);
  await chooser.screenshot({ path: 'shots/eggfx-redeal.png' });

  // ── ⑥b 揭晓阶段点 3D 小人本体也能扔（GL raycast 路径；此前瞄准态只认名牌，近景点人没反应——用户实测反馈）──
  const spec2 = chooser === A ? B : A;
  await spec2.evaluate(() => mutate(n => { const p = n.players.find(x => x.id === myId); if (p) p.eggs = 2; }));   // 正路补蛋（本地 hack 会被对端心跳整文档覆盖）
  await spec2.waitForTimeout(900);
  const cid = await chooser.evaluate(() => myId);
  await spec2.click('#btn-egg');
  ok(await spec2.evaluate(() => document.body.classList.contains('egg-aim')), 'egg aim armed in revealed stage');
  const pt = await spec2.evaluate(pid2 => {
    const ch = window.__three.chars.get(pid2);
    const v = ch.userData.head.getWorldPosition(new THREE.Vector3());   // 头球心：任何 lean/走位姿态下射线都必然命中本体
    v.project(window.__three.camera);
    return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - (v.y + 1) / 2) * innerHeight), vis: ch.visible };
  }, cid);
  ok(pt.vis && pt.x > 2 && pt.x < 898 && pt.y > 2 && pt.y < 898, 'chooser char on screen in revealed close-up', pt);
  await spec2.mouse.click(pt.x, pt.y);
  const specEggs = await spec2.evaluate(() => eggsOf(me()));
  ok(specEggs === 1, 'clicking 3D char body throws in revealed stage (raycast path)', specEggs);
  const specSplat = await chooser.waitForSelector('.egg-splat', { state: 'attached', timeout: 4000 }).then(() => true).catch(() => false);
  ok(specSplat, 'target gets splat from body-click throw');
  await spec2.evaluate(() => setEggAim(false));

  // ── ⑦ 完成挑战 = 赢家鸡蛋 +1 ──
  const before = await chooser.evaluate(() => ({ eggs: document.getElementById('egg-left').textContent, p: me().eggs ?? 1 }));
  await chooser.click('#btn-accept');
  await chooser.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 12000 });
  await chooser.waitForTimeout(700);
  const after = await chooser.evaluate(() => ({ eggs: document.getElementById('egg-left').textContent, p: me().eggs ?? 1 }));
  ok(Number(after.p) === Number(before.p) + 1 && after.eggs === String(Number(before.p) + 1), 'winner gains +1 egg on accept', [before, after]);

  log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors ✅');
  log(fails === 0 && errors.length === 0 ? 'ALL EGG/REACT CHECKS PASSED ✅' : `FAILURES: ${fails}`);
  await browser.close();
  server.close();
  process.exitCode = (fails || errors.length) ? 1 : 0;
})().catch(e => { console.error('[egg-react] fatal', e); process.exit(1); });
