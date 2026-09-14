// E2E: 3D 舞台与运镜（透视/平面化、换屏运镜、开局机位、3D 座次与命中测试、抽卡推镜、REDUCED 瞬时）
// 用法: node test-3d.cjs   （工作目录 D:/myidea/truth-or-dare/.pw；静态服务器端口 8801）
//
// 只读 index.html，不改动被测实现。测试侧的两个环境预设（不改变被测逻辑，只为去掉环境噪声）：
//   tod:guide=1  → 抑制首进引导弹窗（否则遮挡点击）
//   tod:perf=full→ 钉在「全效」档：headless 软件光栅下 perfWatch 可能实测掉帧并自动打开省电模式
//                  （LOWPERF 会把 rx/ry/rz 归零、z 打四折），那会让运镜断言变成环境抖动而非实现问题
//   另：外网字体请求用空 CSS 满足（非被测依赖），避免离线时网络错误混入“控制台零报错”断言
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8801;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = 'shots';

// ─────────────────────────── 断言收集 ───────────────────────────
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  const fine = ok === true;
  if (fine) passed++; else failed++;
  console.log(`${fine ? 'PASS' : 'FAIL'} · ${name}`);
  if (!fine) console.log(`       ↳ 实际: ${detail}`);
  return fine;
}
const errors = [];   // 全程 pageerror / console.error
function watch(p, tag) {
  p.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}

// ─────────────────────────── 静态服务器 ───────────────────────────
function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        res.end(data);
      });
    });
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}

// ─────────────────────────── 页面工具 ───────────────────────────
async function openPage(ctx, tag) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => {
    const o = document.getElementById('loading-overlay');
    return !o || o.classList.contains('hide') || getComputedStyle(o).pointerEvents === 'none';
  }, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return p;
}

// 本地模式：高级选项里的复选框；details 未展开时不可见，必须先点 summary
async function ensureLocal(p) {
  const isOpen = await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open);
  if (!isOpen) await p.click('details.adv summary');
  await p.check('#chk-local');
}

async function joinLocal(p, { name, room = '' }) {
  await ensureLocal(p);
  await p.fill('#input-name', name);
  if (room) await p.fill('#input-room', room);
  await p.locator('.avatar-option:visible').first().click();
  await p.click('#btn-join');
}

// 取 #world3d 内联 transform（Cam 每次 apply 都写这一行）
const worldT = p => p.evaluate(() => document.getElementById('world3d').style.transform);

// ─────────────────────────────── 主流程 ───────────────────────────────
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    // ══════════ 主 context：正常动效，本地模式双标签 ══════════
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const A = await openPage(ctx, 'A');

    // ───── 1) 透视与平面化（join 屏静态检查 + 命中测试防回归） ─────
    const g1 = await A.evaluate(() => {
      const app = document.getElementById('app');
      const world = document.getElementById('world3d');
      const btn = document.getElementById('btn-join');
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        appPerspective: getComputedStyle(app).perspective,
        transformStyle: getComputedStyle(world).transformStyle,
        worldInline: world.style.transform,
        screens: [...document.querySelectorAll('.screen')].map(s => ({ id: s.id, tr: getComputedStyle(s).transform })),
        btnCenter: { cx, cy, inView: r.top >= 0 && r.bottom <= innerHeight },
        hit: hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase() + '.' + hit.className) : null,
        hitInBtn: !!(hit && (hit === btn || btn.contains(hit))),
        hitInJoin: !!(hit && hit.closest('#screen-join')),
        loperf: document.body.classList.contains('loperf'),
        reduced: REDUCED,
        curScreen: Cam.curScreen,
      };
    });
    check('#app 透视 = 1400px', g1.appPerspective === '1400px', `实际 ${g1.appPerspective}`);
    check('#world3d transformStyle = flat（防 3D 命中回归锁）', g1.transformStyle === 'flat', `实际 ${g1.transformStyle}`);
    check('world 内联 transform = translate3d + rotateX/Y/Z + scale',
      /^translate3d\(.+?\) rotateX\(.+?\) rotateY\(.+?\) rotateZ\(.+?\) scale\(.+?\)$/.test(g1.worldInline), `实际 ${g1.worldInline}`);
    const badScreens = g1.screens.filter(s => s.tr !== 'none');
    check('每个 .screen 自身 transform = none', badScreens.length === 0, JSON.stringify(badScreens));
    check('#btn-join 中心 elementFromPoint 命中自身（落在 join 屏内）', g1.hitInBtn && g1.hitInJoin,
      `中心=${JSON.stringify(g1.btnCenter)} 命中=${g1.hit} inJoin=${g1.hitInJoin}`);
    check('前置条件：全效档（无自动省电模式把运镜平面化）', !g1.loperf, 'body.loperf 已开启');
    check('前置条件：非 REDUCED 环境', g1.reduced === false, `REDUCED=${g1.reduced}`);
    check('初始 curScreen = join', g1.curScreen === 'join', `实际 ${g1.curScreen}`);
    await A.screenshot({ path: `${SHOTS}/3d-join.png` });

    // ───── 2) 换屏运镜 join → lobby ─────
    // 填名字 + 勾本地模式（页面结构变动完成后再量机位）
    await ensureLocal(A);
    await A.fill('#input-name', '阿泽');
    await A.locator('.avatar-option:visible').first().click();
    await A.waitForTimeout(300);
    const t0 = await worldT(A);
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    const s1 = await A.evaluate(() => ({ screen: Cam.curScreen, w: document.getElementById('world3d').style.transform }));
    check('加入后 Cam.curScreen: join → lobby', g1.curScreen === 'join' && s1.screen === 'lobby', `之前=join 之后=${s1.screen}`);
    check('换屏时 world transform 字符串发生变化（Cam.enter 生效）', s1.w !== t0 && !!s1.w, `之前=${t0}\n    之后=${s1.w}`);
    await A.waitForTimeout(1500);
    const conv = await A.evaluate(() => ({ ...Cam.cur }));
    check('1.5s 后 Cam.cur 收敛到 lobby 常态机位（rx≈0, z≈0, s≈1）',
      Math.abs(conv.rx) < 0.3 && Math.abs(conv.z) < 0.5 && Math.abs(conv.s - 1) < 0.02, JSON.stringify(conv));

    // 第二人入房（本地模式：同一 context 两个 page）
    const room = (await A.textContent('#share-room')).trim();
    const B = await openPage(ctx, 'B');
    await joinLocal(B, { name: '小雨', room });
    await B.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
    const lobbyHit = await A.evaluate(() => {
      const btn = document.getElementById('btn-start');
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { disabled: btn.disabled, hit: hit ? (hit.id || hit.className) : null, ok: !!(hit && (hit === btn || btn.contains(hit))) };
    });
    check('#btn-start 中心 elementFromPoint 命中自身', lobbyHit.ok, JSON.stringify(lobbyHit));
    await A.screenshot({ path: `${SHOTS}/3d-lobby.png` });
    // 第三人称 .tp 类只允许出现在牌桌网格：大厅 me 卡必须保持正面（泄漏 = 回归）
    const lobbyMe = await A.evaluate(() => {
      const me = document.querySelector('#players-grid .player-card.me');
      const ava = me && me.querySelector('.avatar-ring');
      return { hasTp: !!me && me.classList.contains('tp'), avaVisible: !!ava && getComputedStyle(ava).visibility === 'visible' };
    });
    check('大厅 me 卡无 .tp 泄漏且头像可见（背影只属于牌桌网格）',
      !lobbyMe.hasTp && lobbyMe.avaVisible, JSON.stringify(lobbyMe));

    // ───── 3) 开局机位 ─────
    await A.click('#btn-start');
    await A.waitForSelector('#screen-game.active', { timeout: 20000 });
    await B.waitForSelector('#screen-game.active', { timeout: 20000 });
    const g3a = await A.evaluate(() => ({
      screen: Cam.curScreen,
      camPerspective: getComputedStyle(document.getElementById('cam')).perspective,
      hasTable: !!document.querySelector('#cam .table3d'),
    }));
    check('开局后 Cam.curScreen = game', g3a.screen === 'game', `实际 ${g3a.screen}`);
    check('#cam 透视 = 900px 且 #cam .table3d 存在', g3a.camPerspective === '900px' && g3a.hasTable, JSON.stringify(g3a));
    await A.waitForTimeout(1500);
    const g3b = await A.evaluate(() => {
      const t = document.querySelector('#cam .table3d').getBoundingClientRect();
      return { rxA: Cam.cur.rx, w: t.width, h: t.height };
    });
    const rxB = await B.evaluate(() => Cam.cur.rx);
    check('1.5s 后 game 常态过肩俯视 |rx - 19| < 0.6（第三人称俯角；world 收敛，只约束主动页 A；被动页 B 的扫视晚一个状态包到达）',
      Math.abs(g3b.rxA - 19) < 0.6,
      `A.rx=${g3b.rxA.toFixed(3)} B.rx=${rxB.toFixed(3)}`);
    check('.table3d 可见且宽高 > 100px', g3b.w > 100 && g3b.h > 100, `宽=${g3b.w.toFixed(1)} 高=${g3b.h.toFixed(1)}`);

    // ───── 4) 3D 座次 + 每张卡的命中测试 ─────
    const ring = await A.evaluate(async () => {
      const grid = document.getElementById('game-players-grid');
      grid.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 250));   // 等 left/top/scale 过渡停稳
      const cards = [...grid.querySelectorAll('.player-card')].map(c => {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const hitCard = hit && hit.closest ? hit.closest('.player-card') : null;
        return {
          pid: c.dataset.pid,
          rx: parseFloat(c.style.getPropertyValue('--rx')),
          ry: parseFloat(c.style.getPropertyValue('--ry')),
          rs: parseFloat(c.style.getPropertyValue('--rs')),
          z: c.style.zIndex,
          center: [Math.round(cx), Math.round(cy)],
          inside: r.top >= 0 && r.bottom <= innerHeight,
          hitPid: hitCard ? hitCard.dataset.pid : null,
        };
      });
      return { ring3d: grid.classList.contains('ring3d'), cards };
    });
    const cards = ring.cards;
    check('#game-players-grid 有 ring3d 且 2 张卡的 --rx/--ry/--rs/zIndex 均已写入',
      ring.ring3d && cards.length === 2 &&
      cards.every(c => Number.isFinite(c.rx) && Number.isFinite(c.ry) && Number.isFinite(c.rs) && /^\d+$/.test(c.z || '')),
      JSON.stringify(ring));
    const front = cards.slice().sort((a, b) => b.ry - a.ry)[0];
    const back = cards.slice().sort((a, b) => a.ry - b.ry)[0];
    check('前排（--ry 更大）--rs 也更大，前后排 --rs 差 ≥ 0.15',
      front.ry > back.ry && front.rs > back.rs && front.rs - back.rs >= 0.15,
      `前排 ry=${front.ry} rs=${front.rs} / 后排 ry=${back.ry} rs=${back.rs}`);
    check('zIndex 随前后排分层（前排更大）', Number(front.z) > Number(back.z), `前排 z=${front.z} 后排 z=${back.z}`);
    const hitBad = cards.filter(c => c.hitPid !== c.pid);
    check('两张玩家卡中心 elementFromPoint 各自命中自己（closest(.player-card).dataset.pid）',
      hitBad.length === 0 && cards.length === 2,
      `未命中=${JSON.stringify(hitBad)} 全部=${JSON.stringify(cards.map(c => ({ pid: c.pid, hit: c.hitPid, inside: c.inside })))}`);
    await A.screenshot({ path: `${SHOTS}/3d-ring.png` });
    // 第三人称背影化身：存在、在视口内、不拦点击、me 卡正面已藏
    const tp = await A.evaluate(() => {
      const el = document.getElementById('tp-back');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const me = document.querySelector('#game-players-grid .player-card.me');
      const meAva = me && me.querySelector('.avatar-ring');
      return {
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        pe: getComputedStyle(el).pointerEvents,
        meAvaHidden: !!meAva && getComputedStyle(meAva).visibility === 'hidden',
        inView: r.top <= innerHeight && r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 40,   // 顶边入画；底缘按设计裁出屏（投影容差 40px）
        chr1: el.style.getPropertyValue('--chr1'),
      };
    });
    check('第三人称背影 #tp-back 存在、头顶入画、左右不越界、pointer-events:none（底缘按设计裁出屏）',
      !!tp && tp.inView && tp.pe === 'none', JSON.stringify(tp));
    check('背影带本机身份色（--chr1 由 chrHue 写入）且 me 卡正面已隐藏',
      !!tp && /^hsl\(/.test(tp.chr1 || '') && tp.meAvaHidden, JSON.stringify(tp));

    // ───── 5) 抽卡推镜 → revealed ─────
    const whoA = await A.evaluate(() => S.turn.chooserId === myId);
    const whoB = await B.evaluate(() => S.turn.chooserId === myId);
    const chooser = whoA ? A : (whoB ? B : null);
    check('轮流模式决出唯一抽卡人（S.turn.chooserId === myId）', !!chooser && !(whoA && whoB), `A=${whoA} B=${whoB}`);
    if (chooser) {
      const tag = whoA ? 'A' : 'B';
      await chooser.waitForSelector('#choice-section:not([hidden])', { timeout: 15000 });
      await chooser.waitForSelector('#card-truth:not(.disabled)', { timeout: 15000 });
      const pre = await chooser.evaluate(() => ({ ...Cam.cur }));
      // 前置校验：点击前镜头必在两个合法起点之一——home(-56) 或 runStage 已 nudge 到持麦人座位的推近档(-76)。
      // （nudge 与 focus 的 z 增量同为 -20，所以「点击前就已在 -76」是设计内行为；落点判据由下面的 settled 断言承担）
      check(`点击选卡前镜头处于合法起点（home -56 或持麦人推近档 -76）`,
        Math.abs(pre.z + 56) < 1 || Math.abs(pre.z + 76) < 1,
        `pre.z=${pre.z.toFixed(2)}`);
      const clickAt = Date.now();
      await chooser.click('#card-truth');
      let pushSeen = true;
      try {
        await chooser.waitForFunction(() => Math.abs(Cam.cur.z + 56) > 5, null, { timeout: 1000 });
      } catch { pushSeen = false; }
      const post = await chooser.evaluate(() => ({ ...Cam.cur }));
      check(`抽卡后 1s 内 Cam.cur.z 脱离 game 常态(-56) 超过 5（${tag} 端推近卡堆）`,
        pushSeen && Math.abs(post.z + 56) > 5, `超时未达成；pre.z=${pre.z.toFixed(2)} post.z=${post.z.toFixed(2)}`);
      await chooser.waitForTimeout(Math.max(0, 1200 - (Date.now() - clickAt)));   // 等 focusCam(#deck) 的 950ms 补间收尾
      const settled = await chooser.evaluate(() => ({ ...Cam.cur }));
      check('推镜到达牌堆聚焦档（focusCam(#deck): z≈-76, s≈1.05）',
        Math.abs(settled.z + 76) < 1 && Math.abs(settled.s - 1.05) < 0.01,
        `z=${settled.z.toFixed(2)} s=${settled.s.toFixed(3)}`);
      await chooser.screenshot({ path: `${SHOTS}/3d-drawing.png` });

      await chooser.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
      await chooser.waitForFunction(() => {
        const el = document.getElementById('punishment-text');
        return el.textContent.length > 5 && el.textContent === S.turn.punishment;
      }, null, { timeout: 25000 });
      const rev = await chooser.evaluate(() => ({
        stage: S.turn.stage, p: S.turn.punishment,
        text: document.getElementById('punishment-text').textContent,
        hidden: document.getElementById('card-section').hidden,
        z: Cam.cur.z,
      }));
      check('revealed：#card-section 可见且 #punishment-text === S.turn.punishment',
        rev.stage === 'revealed' && rev.hidden === false && rev.text === rev.p && rev.text.length > 5,
        JSON.stringify({ stage: rev.stage, hidden: rev.hidden, same: rev.text === rev.p, len: rev.text.length }));
      check('revealed 镜头仍在推近档（|z + 56| > 5）', Math.abs(rev.z + 56) > 5, `z=${rev.z.toFixed(2)}`);
      await chooser.screenshot({ path: `${SHOTS}/3d-revealed.png` });
      // 揭晓态牌桌常驻（旧版此处整环 display:none 消失）+ 动作按钮完整落在首屏
      const revScene = await chooser.evaluate(() => {
        const grid = document.getElementById('game-players-grid');
        const btn = document.getElementById('btn-skip') || document.getElementById('btn-accept');
        const br = btn ? btn.getBoundingClientRect() : null;
        const sc = document.getElementById('screen-game');
        return {
          ringW: grid.offsetWidth, ringH: grid.offsetHeight,
          stageCls: sc.classList.contains('stage-revealed'),
          btnBottom: br ? Math.round(br.bottom) : null, innerH: innerHeight,
        };
      });
      check('revealed 座次环仍可见（stage-revealed 挂类 + 环宽 >0，牌桌不退场）',
        revScene.stageCls && revScene.ringW > 50 && revScene.ringH > 50, JSON.stringify(revScene));
      check('revealed 动作按钮完整在视口内（短窗桌面不折行不溢出）',
        revScene.btnBottom !== null && revScene.btnBottom <= revScene.innerH - 8,
        `btnBottom=${revScene.btnBottom} innerH=${revScene.innerH}`);
    }

    // ───── 6) REDUCED：Cam.to 瞬时到位 + 换屏不抛错 ─────
    const ctxR = await browser.newContext({ viewport: { width: 420, height: 900 }, reducedMotion: 'reduce' });
    await ctxR.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
    const RA = await openPage(ctxR, 'RA');
    const rf = await RA.evaluate(() => ({
      reduced: REDUCED,
      mq: matchMedia('(prefers-reduced-motion: reduce)').matches,
      world: getComputedStyle(document.getElementById('world3d')).transform,
    }));
    check('REDUCED 环境生效（matchMedia reduce → 全局 REDUCED=true）', rf.reduced === true && rf.mq === true, JSON.stringify(rf));
    check('REDUCED：#world3d computed transform = none（降噪下不动镜头）', rf.world === 'none', `实际 ${rf.world}`);
    await joinLocal(RA, { name: '降噪A' });
    await RA.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    const room2 = (await RA.textContent('#share-room')).trim();
    const RB = await openPage(ctxR, 'RB');
    await joinLocal(RB, { name: '降噪B', room: room2 });
    await RA.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 25000 });
    const rLobby = await RA.evaluate(() => Cam.curScreen);
    await RA.click('#btn-start');
    await RA.waitForSelector('#screen-game.active', { timeout: 20000 });
    await RB.waitForSelector('#screen-game.active', { timeout: 20000 });
    const rGame = await RA.evaluate(() => Cam.curScreen);
    check('REDUCED 下换屏 join→lobby→game 正常且 curScreen=game', rLobby === 'lobby' && rGame === 'game', `lobby=${rLobby} game=${rGame}`);
    const inst = await RA.evaluate(() => { Cam.to({ x: 41 }, 500); return { x: Cam.cur.x, curScreen: Cam.curScreen }; });
    check('REDUCED 下 Cam.to({x:41},500) 同一 tick 瞬时到位（Cam.cur.x === 41）', inst.x === 41, `实际 Cam.cur.x=${inst.x}`);
    check('REDUCED 期间零 pageerror / console.error', errors.filter(e => /^\[R[AB]\]/.test(e)).length === 0,
      errors.filter(e => /^\[R[AB]\]/.test(e)).join(' | '));
    await RA.screenshot({ path: `${SHOTS}/3d-reduced.png` });

    // ───── 7) 全程控制台零报错 ─────
    check('全程 pageerror / console.error 为 0', errors.length === 0, errors.join(' | '));
  } catch (e) {
    failed++;
    console.log(`FAIL · 测试脚本自身异常: ${e.message}`);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n断言合计 ${passed + failed}：PASS ${passed} / FAIL ${failed}`);
  process.exitCode = failed ? 1 : 0;
})();
