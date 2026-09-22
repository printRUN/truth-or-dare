// 「记住我」探针：同一浏览器再进同一房间，不该被当成 0 分新人。
//   D  本地模式回归：BroadcastChannel 多标签 = 多名玩家（uid 认领在本地模式必须不生效）
//   E  同标签页刷新回归：sessionStorage 票自动回房沿用旧 id（既有行为）
//   A  身份认领：崩溃式离开（stub 掉 pagehide 的退房发布，模拟断网/强杀）→ 同设备新页重进
//      → 沿用旧 id + 战绩接上 + 条目带设备 uid + 不幻影开麦（同 context 新 page = 同 localStorage 不同 sessionStorage）
//   B  快照恢复：局中正常关页（pagehide 尽力退房，条目被删）→ 重进同房 → 从本机 tod:myrec 接回战绩（新 id）
//   C  开局门禁：重新开局后 startedAt 变了 → 旧战绩不带过来（恢复的是新局的 0 分）
//   F  双标签合并：同设备两标签同房在线 → 并入同一身份（1 个条目，不是「两个自己」）
//   G  在线刷新：局中刷新页面 → 自动回房 + 战绩还在（认领或快照二选一接上）
//   H  活主机不摘帽：第二标签认领后主持权不变（mergedLive 与掉线判定同尺）
// D/E 放最前（轻量、无 broker），在线场景走真实公共 broker（emqx/mosquitto，±5s 抖动属正常）；
// node .pw/probe-remember-me.cjs <标签>
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const TAG = process.argv[2] || 'run';
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8931;
const URL_BASE = `http://127.0.0.1:${PORT}/index.html?game=tod`;

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function prep(page) {
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-join.active', { timeout: 20000 });
  await page.evaluate(() => { try { closeGuide(); } catch {} });
}

// 在线路径加入（不勾本地）；midGame=true 时房间已在局中，落的是 game 屏
async function joinOnline(page, name, room, midGame) {
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.click('#btn-join');
  await page.waitForSelector(midGame ? '#screen-game.active' : '#screen-lobby.active', { timeout: 30000 });
  await sleep(1500);   // 过掉加入期的 last-write-wins 抖动窗口（旁观者心跳覆盖 + 自愈重加）再让断言读数
}
// 本地模式加入（原生 checkbox 被自定义样式隐藏，用 evaluate 级 click）
async function joinLocal(page, name, room) {
  await page.fill('#input-name', name);
  if (room) await page.fill('#input-room', room);
  await page.evaluate(() => { const c = document.getElementById('chk-local'); if (c && !c.checked) c.click(); });
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await sleep(1200);
}

// 等到收敛：我在房间里、人数/分数到位（last-write-wins 抖动窗口：旁观者心跳整文档覆盖 + 自愈重加，
// 瞬时读数会撞上「自己短暂不在文档」的窗口，一切断言都先 settle 再读）
const settle = (page, want, timeout) => page.waitForFunction(w => {
  if (typeof joined === 'undefined' || !joined || typeof S === 'undefined' || !S) return false;
  const self = S.players.find(p => p.id === myId);
  if (!self) return false;
  if (w.players != null && S.players.length !== w.players) return false;
  if (w.score != null && (self.score || 0) !== w.score) return false;
  return true;
}, want, { timeout: timeout || 15000 });

const me = page => page.evaluate(() => ({
  id: myId, uid: myUid, score: (S.players.find(p => p.id === myId) || {}).score || 0,
  uidOnEntry: (S.players.find(p => p.id === myId) || {}).uid || '',
  micOn: !!(S.players.find(p => p.id === myId) || {}).micOn,
  n: S.players.length, names: S.players.map(p => p.name),
  gameStarted: !!S.gameStarted,
}));
const setScore = (page, score, draws) => page.evaluate(async ([sc, dr]) => {
  await mutate(n => { const p = n.players.find(p => p.id === myId); p.score = sc; p.draws = dr || 0; });
}, [score, draws]);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  console.log(`probe-remember-me [${TAG}] http://127.0.0.1:${PORT}`);
  const browser = await chromium.launch();
  try {
    // ── 两个「设备」：ctxMain（被记住的主人公）与 ctxB（旁观/接棒主持人）storage 互相独立 ──
    const ctxMain = await browser.newContext();
    const ctxB = await browser.newContext();

    // ── D 本地模式回归：多标签 = 多名玩家（轻量，先跑）──
    const pageL1 = await ctxMain.newPage();
    await prep(pageL1);
    await joinLocal(pageL1, '本地甲', '');
    const lRoom = await pageL1.evaluate(() => S.room);
    const pageL2 = await ctxMain.newPage();
    await prep(pageL2);
    await joinLocal(pageL2, '本地乙', lRoom);
    await settle(pageL1, { players: 2 });
    const mL1 = await me(pageL1);
    check('D1/本地两标签 = 两个独立玩家', mL1.n === 2, `n=${mL1.n} names=${JSON.stringify(mL1.names)}`);

    // ── E 同标签页刷新回归：sessionStorage 票自动回房沿用旧 id ──
    const l1Before = mL1.id;
    await pageL1.reload({ waitUntil: 'domcontentloaded' });
    await pageL1.waitForFunction(() => typeof joined !== 'undefined' && joined && S && S.players.length === 2, null, { timeout: 25000 });
    const mL1b = await me(pageL1);
    check('E1/刷新自动回房沿用旧 id', mL1b.id === l1Before, `before=${l1Before} after=${mL1b.id}`);
    await pageL1.close(); await pageL2.close();

    // ── 准备：阿凯建房（在线），小美（另一设备）进来旁观，房间始终非空 ──
    const page1 = await ctxMain.newPage();
    await prep(page1);
    await joinOnline(page1, '阿凯', '');
    const room = await page1.evaluate(() => S.room);
    check('准备/建房成功（在线）', !!room, `room=${room}`);
    const pageB = await ctxB.newPage();
    await prep(pageB);
    await joinOnline(pageB, '小美', room);
    await settle(pageB, { players: 2 });
    check('准备/小美加入', (await me(pageB)).n === 2);

    // ── A 身份认领：阿凯攒了战绩+开麦态后「崩溃式」离开（发布被掐断=条目幸存），同设备新页重进 ──
    await setScore(page1, 30, 3);
    await settle(page1, { players: 2, score: 30 });
    await page1.evaluate(async () => { await mutate(n => { n.players.find(p => p.id === myId).micOn = true; }); });   // 种入幻影开麦态
    await settle(page1, { players: 2, score: 30 });
    await page1.waitForFunction(room => {
      try { const a = JSON.parse(localStorage.getItem('tod:myrec') || 'null'); return !!(a && a.rooms && a.rooms[room] && a.rooms[room].rec.score === 30); } catch { return false; }
    }, room, { timeout: 8000 }).catch(() => {});
    const id1 = (await me(page1)).id;
    const uidMain = await page1.evaluate(() => localStorage.getItem('tod:uid'));
    await page1.evaluate(() => {   // 崩溃：pagehide 的退房发布（publishNow）与重连发布全部掐断，条目幸存
      RoomLink.prototype.publishNow = function () {};
      RoomLink.prototype.publishState = async () => true;
    });
    await page1.close();
    await sleep(500);
    const page2 = await ctxMain.newPage();
    await prep(page2);
    await joinOnline(page2, '阿凯', room);
    await settle(page2, { players: 2, score: 30 });
    const m2 = await me(page2);
    check('A1/认领旧 id', m2.id === id1, `old=${id1} new=${m2.id}`);
    check('A2/战绩接上（30 分）', m2.score === 30, `score=${m2.score}`);
    check('A3/条目带设备 uid', m2.uidOnEntry === uidMain, `entry.uid=${m2.uidOnEntry}`);
    check('A4/房间仍 2 人（没多出「另一个自己」）', m2.n === 2, JSON.stringify(m2.names));
    // 滞后快照覆盖可能把 micOn=true 短暂写回；心跳随写实时值，最迟 25s 自愈
    await page2.waitForFunction(() => { const p = S.players.find(p => p.id === myId); return p && p.micOn === false; }, null, { timeout: 30000 })
      .then(() => check('A5/认领重进不幻影开麦（实时态落回）', true))
      .catch(async () => check('A5/认领重进不幻影开麦（实时态落回）', false, `micOn=${(await me(page2)).micOn}`));

    // ── B 快照恢复：开局（startedAt≠0；大厅期快照按门禁一律不恢复）→ 正常关页（条目被删）→ 重进 ──
    const p2IsHost = await page2.evaluate(() => isHost());
    if (p2IsHost) console.log('ℹ️ B0/认领主机条目未凉，保留主持（mergedLive）');
    else console.log('ℹ️ B0/page2 非主机（认领条目已凉让位），改由小美开局');
    const hostPage = p2IsHost ? page2 : pageB;
    await hostPage.evaluate(() => startGame());
    await settle(page2, { players: 2 }, 10000);
    await setScore(page2, 45, 5);
    await settle(page2, { players: 2, score: 45 });
    await page2.close();   // 正常关闭：pagehide 会把自己移出房间
    await sleep(1500);
    const page3 = await ctxMain.newPage();
    await prep(page3);
    await joinOnline(page3, '阿凯', room, true);   // 局中重进：落 game 屏
    await settle(page3, { players: 2, score: 45 });
    const m3 = await me(page3);
    check('B1/关页重进，战绩从快照接上（45 分）', m3.score === 45, `score=${m3.score}`);
    check('B2/新 id（旧条目已不在，走快照路径）', m3.id !== id1, `id=${m3.id}`);
    check('B3/uid 一致（同设备）', m3.uid === uidMain, `uid=${m3.uid}`);

    // ── C 开局门禁：重新开局（startedAt 变了）→ 旧 45 分不带过来 ──
    // 阿凯（page2 的身份）关页后 hostId 悬空 → normState 顺延给最早加入者小美
    const bIsHost = await pageB.evaluate(() => isHost());
    check('C0/主持权顺延给小美', bIsHost, `hostId=${await pageB.evaluate(() => S.hostId)}`);
    const hostPage2 = bIsHost ? pageB : page3;
    await hostPage2.evaluate(() => startGame());
    await settle(pageB, { players: 2 }, 10000);
    await settle(page3, { players: 2, score: 0 });
    check('C1/开局重置：page3 归零', (await me(page3)).score === 0 && (await me(page3)).gameStarted);
    await page3.evaluate(() => doLeave());
    await sleep(1500);
    const page4 = await ctxMain.newPage();
    await prep(page4);
    await joinOnline(page4, '阿凯', room, true);   // 局中重进：落 game 屏
    await settle(page4, { players: 2, score: 0 });
    const m4 = await me(page4);
    check('C2/新局重进：恢复的是新局的 0 分，不是旧局 45 分', m4.score === 0, `score=${m4.score}`);
    check('C3/uid 依旧（跨会话稳定）', m4.uid === uidMain, `uid=${m4.uid}`);
    await page3.close();

    // ── G 在线刷新：局中刷新页面 → 自动回房 + 战绩还在（认领或快照二选一接上）──
    await setScore(page4, 77, 2);
    await settle(page4, { players: 2, score: 77 });
    await page4.reload({ waitUntil: 'domcontentloaded' });
    await page4.waitForFunction(() => typeof joined !== 'undefined' && joined && S, null, { timeout: 30000 });
    await settle(page4, { players: 2, score: 77 });
    const g = await me(page4);
    check('G1/刷新回房：战绩还在（77 分）', g.score === 77, `score=${g.score}`);
    check('G2/刷新回房：身份不变', g.id === m4.id, `id=${g.id}`);
    await page4.close();   // 用完即关：每页一个 WebGL 软渲上下文，攒多了新页面会加载退化

    // ── F 双标签合并：同设备两标签同房在线 → 同一身份 ──
    const pageF1 = await ctxMain.newPage();
    await prep(pageF1);
    await joinOnline(pageF1, '双开甲', '');
    const room2 = await pageF1.evaluate(() => S.room);
    const pageF2 = await ctxMain.newPage();
    await prep(pageF2);
    await joinOnline(pageF2, '双开甲', room2);
    await settle(pageF1, { players: 1 });
    const f1 = await me(pageF1), f2 = await me(pageF2);
    check('F1/第二标签并入同一身份（1 条目）', f1.n === 1 && f1.id === f2.id,
      `n=${f1.n} id1=${f1.id} id2=${f2.id}`);
    await pageF1.close(); await pageF2.close();

    // ── H 活主机不摘帽：小美的第二标签认领后主持权不变 ──
    const hostBeforeH = await pageB.evaluate(() => S.hostId);
    const pageB2 = await ctxB.newPage();
    await prep(pageB2);
    await joinOnline(pageB2, '小美', room, true);
    await settle(pageB2, { players: 2, score: 0 });
    const hostAfterH = await pageB.evaluate(() => S.hostId);
    check('H1/第二标签认领不摘活主机', hostAfterH === hostBeforeH, `${hostBeforeH} -> ${hostAfterH}`);
    await pageB2.close(); await pageB.close();
  } catch (e) {
    check('探针异常', false, String(e && e.stack || e).slice(0, 300));
  } finally {
    await browser.close().catch(() => {});
    server.close(() => {});
  }
  const fails = results.filter(r => !r.ok);
  console.log(`\n=== remember-me [${TAG}] ${results.length - fails.length}/${results.length} passed ===`);
  process.exit(fails.length ? 1 : 0);
})();
