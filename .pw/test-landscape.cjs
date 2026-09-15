// E2E: 横屏支持（真·横屏自适应 + 手机端手动切换）
// 用法: node test-landscape.cjs   （工作目录 .pw；静态服务器端口 8813）
//
// 覆盖：
//   1) 844×390 真·横屏：join/lobby/game/revealed/result 五个屏的主要 CTA 都在首屏内可点、
//      无横向溢出、3D 命中测试不回归、工具栏内容不横向溢出
//   2) 横屏弹层（设置/怎么玩）与押注面板的可见性
//   3) 740×360 小机器的 join 首屏
//   4) 390×844 竖屏：不点按钮时旧竖屏布局原样（无 landui/landforce），#btn-land 可见
//   5) 手动切换：点 #btn-land → body 旋转铺满物理视口（landforce+landui、--lvw/--lvh 互换）、
//      逻辑坐标下 CTA 可见可点、旋转坐标系里 elementFromPoint 命中自身；再点一次完整还原
// 只读 index.html，不改动被测实现。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8813;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

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
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(PORT, '127.0.0.1', () => res(s));
  });
}

async function openPage(ctx, tag) {
  const p = await ctx.newPage();
  watch(p, tag);
  await p.route('**fonts.googleapis.com**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('**fonts.gstatic.com**', r => r.abort());
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#screen-join.active', { timeout: 30000 });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(150);
  return p;
}

// 进房（本地模式），B 用 A 的房间号加入
async function joinBoth(A, B, tag) {
  await A.fill('#input-name', tag + 'A');
  await A.click('.avatar-option >> nth=0');
  await A.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
  await A.click('#btn-join');
  await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await A.waitForFunction(() => typeof S !== 'undefined' && !!(S && S.room), null, { timeout: 15000 });
  const room = await A.evaluate(() => S.room);
  await B.fill('#input-name', tag + 'B');
  await B.click('.avatar-option >> nth=1');
  await B.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
  await B.fill('#input-room', room);
  await B.click('#btn-join');
  await B.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  await A.waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length === 2, null, { timeout: 15000 });
}
async function startGame(A, B) {
  await A.click('#btn-start');
  await A.waitForSelector('#screen-game.active', { timeout: 15000 });
  await B.waitForSelector('#screen-game.active', { timeout: 15000 });
  await A.waitForTimeout(1200);   // 等开局运镜收敛
}
const trial = async (p, sel) => {
  try { await p.locator(sel).click({ trial: true, timeout: 3000 }); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e.message).split('\n').filter(l => l.trim()).slice(-3).join(' | ').slice(0, 240) }; }
};
const chooserOf = async (A, B) => (await A.evaluate(() => document.getElementById('choice-section').classList.contains('mine'))) ? A : B;

// 量：元素是否完整落在视口内 + 是否有溢出（强制旋转时把物理 rect 换算回逻辑横屏坐标）
async function measure(p, sels) {
  return p.evaluate((sels) => {
    const round = n => +Number(n).toFixed(1);
    const de = document.documentElement;
    const forced = document.body.classList.contains('landforce');
    const vw = window.innerWidth, vh = window.innerHeight;
    const vwL = forced ? vh : vw, vhL = forced ? vw : vh;
    const rectOf = el => {
      const r = el.getBoundingClientRect();
      if (!forced) return { l: round(r.left), t: round(r.top), r: round(r.right), b: round(r.bottom), w: round(r.width), h: round(r.height) };
      const W = window.innerWidth;   // 物理视口宽 → 逻辑坐标：Lx = Py, Ly = 视口宽 − Px
      return { l: round(r.top), t: round(W - r.right), r: round(r.bottom), b: round(W - r.left), w: round(r.height), h: round(r.width) };
    };
    const out = {
      vw, vh, vwL, vhL,
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      hOverflow: de.scrollWidth > de.clientWidth,
      appScrollH: document.getElementById('app').scrollHeight,
      appClientH: document.getElementById('app').clientHeight,
      bodyBB: { w: round(document.body.getBoundingClientRect().width), h: round(document.body.getBoundingClientRect().height) },
      landui: document.body.classList.contains('landui'),
      landforce: forced,
      lvw: document.documentElement.style.getPropertyValue('--lvw'),
      lvh: document.documentElement.style.getPropertyValue('--lvh'),
      els: {},
    };
    for (const [k, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      if (!el) { out.els[k] = { missing: true }; continue; }
      const v = rectOf(el);
      out.els[k] = Object.assign(v, {
        fitsV: v.t >= -1 && v.b <= vhL + 1,
        fitsH: v.l >= -1 && v.r <= vwL + 1,
        hidden: !!el.hidden || el.offsetParent === null && getComputedStyle(el).position !== 'fixed' && v.w === 0,
        scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth,
      });
    }
    return out;
  }, sels);
}
const fmt = m => Object.entries(m.els).map(([k, v]) => v.missing ? `      ${k}: MISSING`
  : `      ${k}: [${v.l},${v.t} → ${v.b}] ${v.w}x${v.h} fitsV=${v.fitsV} fitsH=${v.fitsH}${v.scrollH > v.clientH + 2 ? ` innerScroll=${v.scrollH}/${v.clientH}` : ''}`).join('\n');

// 互动浮窗：默认收成右上角一颗浮标；点开后 6 颗图标必须全在屏内且不压任何可交互元素
async function dockCheck(p, label) {
  const res = await p.evaluate(() => {
    const forced = document.body.classList.contains('landforce');
    const W = window.innerWidth, H = window.innerHeight;
    const box = el => {   // 强制旋转时换算回逻辑坐标
      const r = el.getBoundingClientRect();
      return forced ? { l: r.top, t: W - r.right, r: r.bottom, b: W - r.left } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const inter = [...document.querySelectorAll('button, input, select, textarea, .choice-card, .flip-card, .player-card, .copy-link-btn')]
      .filter(el => !el.closest('#react-bar'))
      .map(el => ({ el, r: box(el) }))
      .filter(o => o.r.r - o.r.l > 1 && o.r.b - o.r.t > 1);
    const hit = c => inter.filter(o => o.r.l < c.r && o.r.r > c.l && o.r.t < c.b && o.r.b > c.t)
      .map(o => o.el.id ? '#' + o.el.id : '.' + String(o.el.className).split(' ')[0]).slice(0, 4);
    const rv = el => { const b = box(el); return { l: Math.round(b.l), t: Math.round(b.t), r: Math.round(b.r), b: Math.round(b.b) }; };
    const fab = document.getElementById('react-fab');
    const btns = [...document.querySelectorAll('#react-pop button[data-react]')];
    return {
      open: document.getElementById('react-bar').classList.contains('open'),
      vwL: forced ? H : W, vhL: forced ? W : H,
      fab: rv(fab), fabHits: hit(box(fab)),
      icons: btns.map(b => ({ r: rv(b), hits: hit(box(b)) })),
    };
  });
  check(`${label}: 浮标不压任何可点的控件`, res.open && res.fabHits.length === 0, JSON.stringify(res.fab) + ' hits=' + JSON.stringify(res.fabHits));
  check(`${label}: 展开的 6 颗图标全在屏内且不压控件`, res.icons.length === 6 && res.icons.every(i => i.r.t >= 0 && i.r.b <= res.vhL && i.r.l >= 0 && i.r.r <= res.vwL && i.hits.length === 0),
    JSON.stringify(res.icons.map(i => Object.assign({}, i.r, { hits: i.hits }))));
}

// 表情包自检：按钮里就是那六个 emoji（文本即表情、字形渲染成非零盒子），浮标也有 emoji
async function emojiCheck(p, label) {
  const res = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#react-pop button[data-react]')];
    const glyph = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      items: btns.map(b => ({ t: b.textContent.trim(), e: b.dataset.react, box: glyph(b), color: getComputedStyle(b).borderColor })),
      fabText: (document.querySelector('#react-fab') || {}).textContent ? document.querySelector('#react-fab').textContent.trim() : '',
      fabBox: document.querySelector('#react-fab') ? glyph(document.querySelector('#react-fab')) : null,
    };
  });
  const items = res.items;
  check(`${label}: 六颗按钮就是六个 emoji（文本与 data-react 一致、渲染尺寸正常）`,
    items.length === 6 && items.every(i => i.t === i.e && i.t.length > 0 && i.box.w >= 30 && i.box.h >= 30 && i.t !== ''), JSON.stringify(items));
  check(`${label}: 浮标用 emoji 且可渲染`, res.fabText.length > 0 && res.fabBox && res.fabBox.w >= 34, JSON.stringify({ fab: res.fabText, box: res.fabBox }));
}

// ═══════════════════════════ 主流程 ═══════════════════════════
(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    // ══ A) 真·横屏 844×390：五个屏 + 弹层 ══
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const A = await openPage(ctx, '844/A'), B = await openPage(ctx, '844/B');

    let m = await measure(A, { joinBox: '.join-box', grpAvatar: '#grp-avatar', btnJoin: '#btn-join', importWrap: '#import-join-wrap', btnLand: '#btn-land' });
    console.log('\n―― 844×390 join ――\n' + fmt(m), `\n  landui=${m.landui} lvw=${m.lvw} lvh=${m.lvh} hOverflow=${m.hOverflow}`);
    check('844 join: 真横屏自动进横屏布局（landui + 逻辑尺寸 844/390）', m.landui && m.lvw === '844px' && m.lvh === '390px', JSON.stringify({ ui: m.landui, w: m.lvw, h: m.lvh }));
    check('844 join: 无横向溢出', !m.hOverflow, JSON.stringify(m));
    check('844 join: 加入按钮在首屏内', m.els.btnJoin.fitsV && m.els.btnJoin.fitsH, JSON.stringify(m.els.btnJoin));
    check('844 join: 头像墙在首屏内', m.els.grpAvatar.fitsV, JSON.stringify(m.els.grpAvatar));
    check('844 join: 真横屏下不显示横屏切换按钮', m.els.btnLand.w === 0 || m.els.btnLand.hidden, JSON.stringify(m.els.btnLand));
    const joinClick = await trial(A, '#btn-join');
    check('844 join: 加入按钮可点', joinClick.ok, joinClick.err);
    await A.screenshot({ path: `${SHOTS}/land-join-844.png` });

    await joinBoth(A, B, '844');
    m = await measure(A, { share: '.share-box', players: '#players-grid', btnStart: '#btn-start', tools: '#lobby-tools' });
    console.log('\n―― 844×390 lobby ――\n' + fmt(m), `\n  hOverflow=${m.hOverflow}`);
    check('844 lobby: 无横向溢出', !m.hOverflow);
    check('844 lobby: 开始按钮在首屏内', m.els.btnStart.w > 0 && m.els.btnStart.fitsV && m.els.btnStart.fitsH, JSON.stringify(m.els.btnStart));
    check('844 lobby: 玩家墙在首屏内', m.els.players.w > 0 && m.els.players.fitsV, JSON.stringify(m.els.players));
    const lobbyLast = await trial(A, '#btn-leave');
    check('844 lobby: 工具栏最后一颗按钮可点（退出房间）', lobbyLast.ok, lobbyLast.err);
    await A.click('#react-fab');
    await A.waitForTimeout(300);
    await dockCheck(A, '844 lobby 互动浮窗');
    await emojiCheck(A, '844 lobby 表情包');
    await A.keyboard.press('Escape');
    await A.waitForTimeout(150);
    check('844 lobby: Esc 收起互动浮窗', !(await A.evaluate(() => document.getElementById('react-bar').classList.contains('open'))));
    await A.screenshot({ path: `${SHOTS}/land-lobby-844.png` });

    await startGame(A, B);
    const G = await chooserOf(A, B);
    m = await measure(G, { ring: '#game-players-grid', truth: '#card-truth', dare: '#card-dare', tools: '#game-tools' });
    console.log('\n―― 844×390 game(choosing) ――\n' + fmt(m), `\n  hOverflow=${m.hOverflow}`);
    check('844 game: 无横向溢出', !m.hOverflow);
    check('844 game: 座次环完整在首屏内', m.els.ring.fitsV && m.els.ring.fitsH, JSON.stringify(m.els.ring));
    check('844 game: 真心话/大冒险双卡完整可见', m.els.truth.fitsV && m.els.truth.fitsH && m.els.dare.fitsV && m.els.dare.fitsH, JSON.stringify({ t: m.els.truth, d: m.els.dare }));
    const hit = await G.evaluate(() => {
      const el = document.getElementById('card-truth');
      const r = el.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { hitSelf: !!(h && (h === el || el.contains(h))), at: h ? String(h.className) : null };
    });
    check('844 game: 选卡 3D 命中自身（布局改动没吃掉点击）', hit.hitSelf, JSON.stringify(hit));
    const toolsFit = await trial(G, '#btn-leave-game');
    check('844 game: 工具栏最后一颗按钮可点（退出房间）', toolsFit.ok, toolsFit.err);
    const hostBtn = await trial(A, '#btn-end-game');
    check('844 game: 主持人专属按钮可点（结算）', hostBtn.ok, hostBtn.err);
    // landui 工具行按设计就是可横滑条（nowrap !important + overflow-x:auto）：超出宽度收在 3vw 内即算达标
    check('844 game: 工具栏为可横滑条（超出宽度 ≤ 3vw）', m.els.tools.scrollW - m.els.tools.clientW <= Math.round(m.vw * 0.03), JSON.stringify({ sw: m.els.tools.scrollW, cw: m.els.tools.clientW }));
    await G.click('#react-fab');
    await G.waitForTimeout(300);
    await dockCheck(G, '844 game 互动浮窗');
    await G.keyboard.press('Escape');
    await G.waitForTimeout(150);
    await G.screenshot({ path: `${SHOTS}/land-game-844.png` });

    // 弹层：设置 / 怎么玩（矮视口里必须整体落在屏内，内容自己滚）
    if (await A.locator('#btn-settings-game').isVisible()) {
      await A.click('#btn-settings-game');
      await A.waitForSelector('#modal-mask:not([hidden])', { timeout: 5000 });
      await A.waitForTimeout(400);   // 等 0.25s 入场动画走完再量（否则量到 translateY 中间帧）
      const mm = await measure(A, { box: '#modal-mask .modal-box' });
      console.log('\n―― 844×390 设置弹层 ――\n' + fmt(mm));
      check('844 弹层: 设置面板整体在屏内（内容内部滚动）', mm.els.box.fitsV && mm.els.box.fitsH, JSON.stringify(mm.els.box));
      await A.screenshot({ path: `${SHOTS}/land-settings-844.png` });
      await A.click('#modal-close');
      await A.waitForTimeout(250);
    } else {
      check('844 弹层: 设置入口可见', false, 'host 页看不到 #btn-settings-game');
    }
    await A.click('#btn-guide-lobby').catch(() => {});
    await A.waitForTimeout(200);

    // 押注面板（旁观者才有；面板要在屏内）
    const S2 = await chooserOf(A, B);
    const spectator = S2 === A ? B : A;
    await S2.click('#card-truth');
    await S2.waitForSelector('#card-section:not([hidden])', { timeout: 20000 });
    await S2.waitForTimeout(2800);
    m = await measure(S2, { card: '#card-section', front: '#card-front', accept: '#btn-accept', skip: '#btn-skip', bet: '#bet-box' });
    console.log('\n―― 844×390 revealed ――\n' + fmt(m), `\n  hOverflow=${m.hOverflow}`);
    check('844 revealed: 无横向溢出', !m.hOverflow);
    check('844 revealed: 完成/跳过按钮完整可见', m.els.accept.fitsV && m.els.accept.fitsH && m.els.skip.fitsV && m.els.skip.fitsH, JSON.stringify({ a: m.els.accept, s: m.els.skip }));
    check('844 revealed: 牌面内容不需要卡内滚动', m.els.front.scrollH <= m.els.front.clientH + 4, JSON.stringify({ sh: m.els.front.scrollH, ch: m.els.front.clientH }));
    check('844 revealed: 动作按钮在牌面内部（长题也不被推出卡外）', m.els.skip.b <= m.els.front.b + 1 && m.els.accept.b <= m.els.front.b + 1, JSON.stringify({ skipB: m.els.skip.b, acceptB: m.els.accept.b, frontB: m.els.front.b }));
    const mb = await measure(spectator, { bet: '#bet-box' });
    check('844 revealed: 旁观者押注面板在屏内', mb.els.bet.missing || (mb.els.bet.w > 0 && mb.els.bet.fitsV), JSON.stringify(mb.els.bet));
    await S2.screenshot({ path: `${SHOTS}/land-revealed-844.png` });

    // 结算屏
    await A.click('#btn-finish-game'); await A.waitForTimeout(150); await A.click('#btn-finish-game');
    await A.waitForSelector('#screen-result.active', { timeout: 10000 });
    await A.waitForTimeout(400);
    m = await measure(A, { box: '.result-box', podium: '#result-podium', list: '#result-list', rematch: '#btn-rematch', lobby: '#btn-result-lobby' });
    console.log('\n―― 844×390 result ――\n' + fmt(m), `\n  hOverflow=${m.hOverflow}`);
    check('844 result: 无横向溢出', !m.hOverflow);
    check('844 result: 颁奖台与战绩榜在首屏内', m.els.podium.fitsV && m.els.list.fitsV, JSON.stringify({ p: m.els.podium, l: m.els.list }));
    check('844 result: 再来一局/回大厅按钮在首屏内', m.els.rematch.fitsV && m.els.lobby.fitsV, JSON.stringify({ r: m.els.rematch, l: m.els.lobby }));
    await A.screenshot({ path: `${SHOTS}/land-result-844.png` });
    await ctx.close();

    // ══ B) 小机器 740×360 ══
    const ctx2 = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx2.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const C = await openPage(ctx2, '740/C');
    const m2 = await measure(C, { btnJoin: '#btn-join', grpAvatar: '#grp-avatar' });
    console.log('\n―― 740×360 join ――\n' + fmt(m2), `\n  hOverflow=${m2.hOverflow} appScroll=${m2.appScrollH}/${m2.appClientH}`);
    check('740 join: 无横向溢出', !m2.hOverflow);
    check('740 join: 加入按钮在首屏内可点', m2.els.btnJoin.fitsV && m2.els.btnJoin.fitsH, JSON.stringify(m2.els.btnJoin));
    check('740 join: 头像墙在首屏内', m2.els.grpAvatar.fitsV, JSON.stringify(m2.els.grpAvatar));
    await C.screenshot({ path: `${SHOTS}/land-join-740.png` });

    // 3 人局（740×360 更小的机器）：座次环里的玩家卡不能被环盒子裁掉，工具栏仍要在屏内
    const P3 = [C];
    for (let i = 1; i <= 2; i++) P3.push(await openPage(ctx2, `740/${'BC'[i - 1]}`));
    await P3[0].fill('#input-name', '三人局主');
    await P3[0].click('.avatar-option >> nth=0');
    await P3[0].evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    await P3[0].click('#btn-join');
    await P3[0].waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await P3[0].waitForFunction(() => typeof S !== 'undefined' && !!(S && S.room), null, { timeout: 15000 });
    const room3 = await P3[0].evaluate(() => S.room);
    for (let i = 1; i <= 2; i++) {
      await P3[i].fill('#input-name', 'P' + (i + 1));
      await P3[i].click(`.avatar-option >> nth=${i}`);
      await P3[i].evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
      await P3[i].fill('#input-room', room3);
      await P3[i].click('#btn-join');
      await P3[i].waitForSelector('#screen-lobby.active', { timeout: 20000 });
    }
    await P3[0].waitForFunction(() => document.querySelectorAll('#players-grid .player-card').length === 3, null, { timeout: 15000 });
    const lobby3 = await measure(P3[0], { players: '#players-grid', tools: '#lobby-tools', btnStart: '#btn-start' });
    check('740 三人局: 玩家墙/开始按钮/工具栏都在首屏内', lobby3.els.players.fitsV && lobby3.els.btnStart.fitsV && lobby3.els.tools.fitsV, fmt(lobby3));
    await P3[0].screenshot({ path: `${SHOTS}/land-lobby-740-3p.png` });
    await P3[0].click('#btn-start');
    await P3[0].waitForSelector('#screen-game.active', { timeout: 15000 });
    await P3[0].waitForTimeout(1400);
    const ringCheck = await P3[0].evaluate(() => {
      const grid = document.getElementById('game-players-grid');
      const g = grid.getBoundingClientRect();
      const cards = [...grid.querySelectorAll('.player-card')].map(c => { const r = c.getBoundingClientRect(); return { l: r.left - g.left, t: r.top - g.top, r: r.right - g.right, b: r.bottom - g.bottom }; });
      const vh = window.innerHeight;
      return { n: cards.length, worst: cards.reduce((a, c) => ({ l: Math.min(a.l, c.l), t: Math.min(a.t, c.t), r: Math.max(a.r, c.r), b: Math.max(a.b, c.b) }), { l: 0, t: 0, r: 0, b: 0 }), gridBottom: g.bottom, vh, tools: document.getElementById('game-tools').getBoundingClientRect().bottom };
    });
    console.log('  三人局座次环: ' + JSON.stringify(ringCheck));
    check('740 三人局: 玩家卡不越出座次环（四边 ≤ 24px 出血）', ringCheck.n === 3 && ringCheck.worst.l <= 24 && ringCheck.worst.t <= 24 && ringCheck.worst.r <= 24 && ringCheck.worst.b <= 24, JSON.stringify(ringCheck.worst));
    check('740 三人局: 前排卡不顶到工具栏（与工具栏不重叠）', ringCheck.gridBottom + ringCheck.worst.b <= ringCheck.tools + 1, JSON.stringify({ cardBottom: ringCheck.gridBottom + ringCheck.worst.b, tools: ringCheck.tools }));
    check('740 三人局: 座次环与工具栏都在屏内', ringCheck.gridBottom <= ringCheck.vh + 1 && ringCheck.tools <= ringCheck.vh + 24, JSON.stringify({ grid: ringCheck.gridBottom, tools: ringCheck.tools, vh: ringCheck.vh }));
    await P3[0].screenshot({ path: `${SHOTS}/land-game-740-3p.png` });
    await ctx2.close();

    // ══ C) 竖屏 390×844：旧布局原样 + 手动切换 ══
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx3.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
    const D = await openPage(ctx3, 'portrait/D');
    const before = await measure(D, { btnLand: '#btn-land', btnJoin: '#btn-join', box: '.join-box' });
    console.log('\n―― 390×844 竖屏（未切换）――\n' + fmt(before));
    check('竖屏: 不进横屏布局（旧竖屏布局不受影响）', !before.landui && !before.landforce, JSON.stringify({ ui: before.landui, f: before.landforce }));
    check('竖屏: 横屏切换按钮可见', before.els.btnLand.w > 0 && before.els.btnLand.h > 0, JSON.stringify(before.els.btnLand));
    check('竖屏: 逻辑尺寸变量为空（不干预旧布局）', !before.lvw && !before.lvh, `${before.lvw}|${before.lvh}`);

    await D.click('#btn-land');
    await D.waitForTimeout(700);
    const after = await measure(D, { btnLand: '#btn-land', btnJoin: '#btn-join', box: '.join-box', name: '#input-name' });
    console.log('\n―― 390×844 手动横屏（旋转兜底）――\n' + fmt(after), `\n  landui=${after.landui} landforce=${after.landforce} lvw=${after.lvw} lvh=${after.lvh} bodyBB=${after.bodyBB.w}x${after.bodyBB.h} hOverflow=${after.hOverflow}`);
    check('手动横屏: landforce + landui 双类生效', after.landforce && after.landui, JSON.stringify({ ui: after.landui, f: after.landforce }));
    check('手动横屏: 逻辑尺寸互换（--lvw=844px / --lvh=390px）', after.lvw === '844px' && after.lvh === '390px', `${after.lvw}/${after.lvh}`);
    check('手动横屏: body 旋转后铺满物理视口（390×844）', Math.abs(after.bodyBB.w - 390) < 1.5 && Math.abs(after.bodyBB.h - 844) < 1.5, JSON.stringify(after.bodyBB));
    check('手动横屏: 无横向溢出', !after.hOverflow, JSON.stringify(after));
    check('手动横屏: 加入按钮在首屏内', after.els.btnJoin.fitsV && after.els.btnJoin.fitsH, JSON.stringify(after.els.btnJoin));
    const forcedHit = await D.evaluate(() => {
      const el = document.getElementById('input-name');
      const r = el.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { hitSelf: !!(h && (h === el || el.contains(h))), at: h ? (h.id || String(h.className)) : null };
    });
    check('手动横屏: 旋转坐标系里命中测试正常（输入框可点）', forcedHit.hitSelf, JSON.stringify(forcedHit));
    const forcedClick = await trial(D, '#btn-join');
    check('手动横屏: 加入按钮可点', forcedClick.ok, forcedClick.err);
    await D.screenshot({ path: `${SHOTS}/land-join-forced.png` });

    await D.click('#btn-land');
    await D.waitForTimeout(500);
    const off = await measure(D, { btnLand: '#btn-land' });
    check('切回竖屏: landforce/landui 都已摘除', !off.landui && !off.landforce, JSON.stringify({ ui: off.landui, f: off.landforce }));
    check('切回竖屏: 物理尺寸复原（--lvw/--lvh 已清）', !off.lvw && !off.lvh, `${off.lvw}|${off.lvh}`);

    // 竖屏大厅：互动浮窗同样不能压到任何控件（单人也进大厅）
    await D.fill('#input-name', '竖屏镜检');
    await D.evaluate(() => { const c = document.getElementById('chk-local'); if (c) c.checked = true; });
    await D.click('#btn-join');
    await D.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    await D.click('#react-fab');
    await D.waitForTimeout(300);
    await dockCheck(D, '390 lobby 互动浮窗');
    await ctx3.close();

    // ══ D) PC / 平板：文档不得被 3D 牌桌投影撑宽，互动浮窗同样不能压控件 ══
    for (const [W, H, mobile, name] of [[1440, 900, false, 'PC 1440×900'], [1280, 800, false, 'PC 1280×800'], [1024, 768, true, '平板 1024×768']]) {
      const ctxP = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
      await ctxP.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
      const P1 = await openPage(ctxP, name + '/A'), P2 = await openPage(ctxP, name + '/B');
      await joinBoth(P1, P2, name);
      let mp = await measure(P1, { btnStart: '#btn-start', dock: '#react-bar' });
      check(`${name}: 大厅无横向溢出（文档宽 = 视口宽）`, !mp.hOverflow && mp.docScrollW === mp.docClientW, JSON.stringify({ sw: mp.docScrollW, cw: mp.docClientW }));
      check(`${name}: 开始按钮在首屏内`, mp.els.btnStart.w > 0 && mp.els.btnStart.fitsV, JSON.stringify(mp.els.btnStart));
      await P1.click('#react-fab');
      await P1.waitForTimeout(250);
      await dockCheck(P1, `${name} lobby 互动浮窗`);
      await emojiCheck(P1, `${name} 表情包`);
      await P1.keyboard.press('Escape');
      await P1.waitForTimeout(120);
      await startGame(P1, P2);
      const GP = await chooserOf(P1, P2);
      mp = await measure(GP, { ring: '#game-players-grid', truth: '#card-truth' });
      check(`${name}: 牌桌无横向溢出`, !mp.hOverflow && mp.docScrollW === mp.docClientW, JSON.stringify({ sw: mp.docScrollW, cw: mp.docClientW }));
      check(`${name}: 选卡可见`, mp.els.truth.fitsV, JSON.stringify(mp.els.truth));
      await GP.click('#react-fab');
      await GP.waitForTimeout(250);
      await dockCheck(GP, `${name} game 互动浮窗`);
      await GP.keyboard.press('Escape');
      await GP.waitForTimeout(120);
      await GP.click('#card-truth');
      await GP.waitForSelector('#card-section:not([hidden])', { timeout: 20000 });
      await GP.waitForTimeout(2800);
      mp = await measure(GP, { card: '#card-section', accept: '#btn-accept', skip: '#btn-skip' });
      check(`${name}: 揭晓页无横向溢出且完成/跳过可见`, !mp.hOverflow && mp.docScrollW === mp.docClientW && mp.els.accept.fitsV && mp.els.skip.fitsV,
        JSON.stringify({ sw: mp.docScrollW, cw: mp.docClientW, a: mp.els.accept, s: mp.els.skip }));
      await GP.screenshot({ path: `${SHOTS}/land-revealed-${W}.png` });
      await ctxP.close();
    }

    // ══ 收尾：零报错 ══
    check('全程零 JS 报错（pageerror / console.error）', errors.length === 0, errors.slice(0, 6).join(' || '));
    console.log(`\n== ${passed} passed, ${failed} failed ==`);
  } catch (e) {
    console.log('TEST ERROR:', e && e.message);
    if (errors.length) console.log(errors.join('\n'));
    failed++;
  } finally {
    await browser.close();
    server.close();
    process.exit(failed ? 1 : 0);
  }
})();
