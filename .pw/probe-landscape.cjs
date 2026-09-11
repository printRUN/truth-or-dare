// 只读探针：手机横屏（844×390 / 740×360 / 667×375）渲染与命中测量
// 用法: cd D:/myidea/truth-or-dare/.pw && node probe-landscape.cjs
// 不修改 index.html，产出 shots/landscape-*.png 与 shots/landscape-report.json
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8811;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = 'shots';
const VIEWPORTS = [[844, 390], [740, 360], [667, 375]];

const errors = [];
function watch(p, tag) {
  p.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
}

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

async function ensureLocal(p) {
  const open = await p.evaluate(() => !!(document.querySelector('details.adv') || {}).open);
  if (!open) await p.click('details.adv summary');
  await p.check('#chk-local');
}

// 页内统一测量：rect / 视口内外 / 溢出 px / elementFromPoint 命中
async function measure(p, sels) {
  return p.evaluate((sels) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const se = document.scrollingElement, de = document.documentElement;
    const round = n => +Number(n).toFixed(1);
    const rectOf = el => { const r = el.getBoundingClientRect(); return { l: round(r.left), t: round(r.top), r: round(r.right), b: round(r.bottom), w: round(r.width), h: round(r.height) }; };
    const elInfo = sel => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const centerInVp = r.width > 0 && r.height > 0 && cx >= 0 && cy >= 0 && cx < vw && cy < vh;
      const inVp = r.width > 0 && r.height > 0 && r.bottom <= vh && r.top >= 0 && r.right <= vw && r.left >= 0;
      const out = {
        above: round(Math.max(0, -r.top)), below: round(Math.max(0, r.bottom - vh)),
        leftOf: round(Math.max(0, -r.left)), rightOf: round(Math.max(0, r.right - vw)),
      };
      let hitSelf = null, hitAtCenter = null;
      if (centerInVp) {
        const h = document.elementFromPoint(cx, cy);
        hitSelf = !!(h && (h === el || el.contains(h)));
        hitAtCenter = h ? (h.id ? '#' + h.id : (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/).slice(0, 2).join('.') : h.tagName.toLowerCase())) : 'null';
      }
      return {
        sel, rect: rectOf(el), center: { x: round(cx), y: round(cy) },
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        pointerEvents: cs.pointerEvents, transform: cs.transform,
        hiddenAttr: el.hidden === true, disabled: !!el.disabled,
        inVp, centerInVp, out, hitSelf, hitAtCenter,
        scrollH: el.scrollHeight, clientH: el.clientHeight, scrollW: el.scrollWidth, clientW: el.clientWidth,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      };
    };
    const els = {};
    for (const [k, sel] of Object.entries(sels)) els[k] = elInfo(sel);
    const y0 = window.scrollY;
    window.scrollTo(0, 1e6);
    const maxY = window.scrollY;
    window.scrollTo(0, y0);
    const app = document.getElementById('app');
    return {
      env: {
        vw, vh, dpr: window.devicePixelRatio,
        docClientW: de.clientWidth, docClientH: de.clientHeight,
        seScrollH: se ? se.scrollHeight : -1, seClientH: se ? se.clientHeight : -1,
        seScrollW: se ? se.scrollWidth : -1, seClientW: se ? se.clientWidth : -1,
        hOverflow: se ? se.scrollWidth > se.clientWidth : null,
        vOverflow: se ? se.scrollHeight > vh : null,
        maxScrollY: maxY, scrollY: y0,
        coarse: matchMedia('(pointer:coarse)').matches,
        noHover: matchMedia('(hover:none)').matches,
        landscape: matchMedia('(orientation:landscape)').matches,
        soType: (screen.orientation && screen.orientation.type) || 'n/a',
        soLock: !!(screen.orientation && typeof screen.orientation.lock === 'function'),
        reqFs: typeof document.documentElement.requestFullscreen,
        vv: window.visualViewport ? {
          w: round(window.visualViewport.width), h: round(window.visualViewport.height),
          scale: +window.visualViewport.scale.toFixed(2),
          offTop: round(window.visualViewport.offsetTop), offLeft: round(window.visualViewport.offsetLeft),
        } : null,
      },
      app: app ? { scrollH: app.scrollHeight, clientH: app.clientHeight, rect: rectOf(app) } : null,
      els,
    };
  }, sels);
}

const top = async p => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200); };

// 滚动到元素中心后做 elementFromPoint 命中测试 + react-bar 遮挡判断（不改状态）
async function probeHit(p, sel) {
  const data = await p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const vw = window.innerWidth, vh = window.innerHeight, round = n => +Number(n).toFixed(1);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inVp = cx >= 0 && cy >= 0 && cx < vw && cy < vh;
    let hitAt = null, hitSelf = null;
    if (inVp) {
      const h = document.elementFromPoint(cx, cy);
      hitSelf = !!(h && (h === el || el.contains(h)));
      hitAt = h ? (h.id ? '#' + h.id : (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/)[0] : h.tagName.toLowerCase())) : 'null';
    }
    const rb = document.getElementById('react-bar');
    const rr = rb && !rb.hidden ? rb.getBoundingClientRect() : null;
    return {
      sel, scrollY: round(window.scrollY), rect: { l: round(r.left), t: round(r.top), b: round(r.bottom), w: round(r.width), h: round(r.height) },
      center: { x: round(cx), y: round(cy) }, inVp, hitSelf, hitAt,
      reactBarCoversCenter: !!(rr && cx >= rr.left && cx <= rr.right && cy >= rr.top && cy <= rr.bottom),
      reactBarCoversBottom: !!(rr && Math.min(r.bottom, rr.bottom) > Math.max(r.top, rr.top) && Math.min(r.right, rr.right) > Math.max(r.left, rr.left)),
    };
  }, sel);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(150);
  return data;
}

// Playwright trial click：走完整“可见/未被遮挡/可接收事件”检查但不真的点
async function trialClick(p, sel) {
  const from = await p.evaluate(() => window.scrollY);
  try {
    await p.locator(sel).click({ trial: true, timeout: 4000 });
    const to = await p.evaluate(() => window.scrollY);
    return { sel, ok: true, from, to };
  } catch (e) {
    return { sel, ok: false, from, err: String(e.message).split('\n')[0] };
  }
}

function fmtEl(e) {
  if (!e) return '  (n/a)';
  if (e.missing) return `  ${e.sel}  == MISSING ==`;
  const r = e.rect;
  let s = `  ${e.sel} rect=[${r.l},${r.t} → ${r.b}] size=${r.w}x${r.h} inVp=${e.inVp}`;
  const o = Object.entries(e.out || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}px`);
  if (o.length) s += ` OUT{${o.join(',')}}`;
  s += ` hitSelf=${e.hitSelf}` + (e.hitAtCenter ? ` hitAt=${e.hitAtCenter}` : '');
  if (e.hiddenAttr) s += ' hidden';
  if (e.disabled) s += ' disabled';
  if (e.pointerEvents && e.pointerEvents !== 'auto') s += ` pe=${e.pointerEvents}`;
  if (e.scrollH > e.clientH) s += ` innerScroll=${e.scrollH}/${e.clientH}`;
  s += ` "${e.text}"`;
  return s;
}

const fmtClick = c => `  ${c.sel} trialClick=${c.ok ? 'OK' : 'FAIL'}${c.ok && c.to !== c.from ? ` (autoScroll ${c.from}→${c.to})` : ''}${c.err ? ' :: ' + c.err : ''}`;
const fmtHit = h => h.missing ? `  ${h.sel} MISSING` : `  ${h.sel} scrollTo=${h.scrollY} center=(${h.center.x},${h.center.y}) inVp=${h.inVp} hitSelf=${h.hitSelf} hitAt=${h.hitAt} reactBarCoversCenter=${h.reactBarCoversCenter}`;

async function runViewport(browser, W, H) {
  const tag = `${W}x${H}`;
  const out = { tag, join: null, lobby: null, game: null, revealed: null, clicks: {}, notes: [] };
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  try {
    const A = await openPage(ctx, `${tag}/A`);
    out.join = await measure(A, {
      joinBox: '.join-box', nameInput: '#input-name', avatarSelector: '#avatar-selector',
      btnJoin: '#btn-join', btnHowto: '#btn-howto-join', btnDonate: '#btn-donate',
    });
    await A.screenshot({ path: `${SHOTS}/landscape-join-${tag}.png` });
    await A.screenshot({ path: `${SHOTS}/landscape-join-${tag}-full.png`, fullPage: true }).catch(() => {});
    out.clicks.btnJoin = await trialClick(A, '#btn-join');
    out.clicks.hitJoin = await probeHit(A, '#btn-join');
    await top(A);

    await ensureLocal(A);
    await A.fill('#input-name', '阿泽');
    await A.locator('.avatar-option:visible').first().click({ timeout: 5000 }).catch(e => out.notes.push('A 头像: ' + e.message.split('\n')[0]));
    await A.click('#btn-join', { timeout: 10000 });
    await A.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    const room = (await A.textContent('#share-room')).trim();

    const B = await openPage(ctx, `${tag}/B`);
    await ensureLocal(B);
    await B.fill('#input-name', '小雨');
    await B.fill('#input-room', room);
    await B.locator('.avatar-option:visible').first().click({ timeout: 5000 }).catch(() => {});
    await B.click('#btn-join', { timeout: 10000 });
    await A.waitForSelector('#players-grid .player-card >> nth=1', { timeout: 20000 });
    await A.waitForFunction(() => { const b = document.getElementById('btn-start'); return b && !b.disabled; }, null, { timeout: 20000 })
      .catch(() => out.notes.push('btn-start 20s 内未启用'));
    await top(A);
    out.lobby = await measure(A, {
      shareBox: '.share-box', playersGrid: '#players-grid', modePick: '#mode-pick',
      btnStart: '#btn-start', btnLeave: '#btn-leave', lobbyRow2: '#btn-listen-lobby',
      reactBar: '#react-bar',
    });
    await A.screenshot({ path: `${SHOTS}/landscape-lobby-${tag}.png` });
    await A.screenshot({ path: `${SHOTS}/landscape-lobby-${tag}-full.png`, fullPage: true }).catch(() => {});
    out.clicks.btnStart = await trialClick(A, '#btn-start');
    out.clicks.hitStart = await probeHit(A, '#btn-start');
    await top(A);

    // 开局
    await A.click('#btn-start', { timeout: 10000 });
    await A.waitForSelector('#screen-game.active', { timeout: 15000 });
    const choosing = pg => pg.waitForFunction(
      () => typeof S !== 'undefined' && S && S.turn && S.turn.stage === 'choosing' && !!S.turn.chooserId,
      null, { timeout: 20000 });
    await Promise.all([choosing(A), choosing(B)]).catch(() => out.notes.push('choosing 阶段 20s 内未就绪'));
    const cardsOn = pg => pg.evaluate(() => {
      const c = document.getElementById('choice-section'), t = document.getElementById('card-truth');
      return !!(c && !c.hidden && t && !t.classList.contains('disabled'));
    });
    let chooser = null;
    for (let i = 0; i < 30 && !chooser; i++) {
      const [ea, eb] = await Promise.all([cardsOn(A), cardsOn(B)]);
      if (ea !== eb) chooser = ea ? A : B;
      else await A.waitForTimeout(300);
    }
    if (!chooser) out.notes.push('两页都没检出唯一持麦人');
    const mineA = await A.evaluate(() => typeof S !== 'undefined' && !!S.turn && S.turn.chooserId === myId);
    out.chooser = chooser ? (chooser === A ? 'A' : 'B') : '(未判定)';
    out.chooserByState = mineA ? 'A' : 'B';
    if (!chooser) chooser = mineA ? A : B;
    await chooser.waitForSelector('#choice-section:not([hidden])', { timeout: 15000 }).catch(() => out.notes.push('choice-section 未出现'));
    await chooser.waitForTimeout(1000);
    await top(chooser);
    out.game = await measure(chooser, {
      playersGrid: '#game-players-grid', cardTruth: '#card-truth', cardDare: '#card-dare',
      gameTools: '#screen-game > div:last-child', choiceSection: '#choice-section',
      cam: '#cam', reactBar: '#react-bar',
    });
    await chooser.screenshot({ path: `${SHOTS}/landscape-game-${tag}.png` });
    out.clicks.cardTruth = await trialClick(chooser, '#card-truth');
    out.clicks.hitTruth = await probeHit(chooser, '#card-truth');
    out.clicks.hitDare = await probeHit(chooser, '#card-dare');
    await top(chooser);

    // 点卡 → 抽卡 → revealed
    await chooser.click('#card-dare', { timeout: 15000 }).catch(e => out.notes.push('点 #card-dare 失败: ' + e.message.split('\n')[0]));
    const scrollAfterClick = await chooser.evaluate(() => window.scrollY);
    if (scrollAfterClick > 0) out.notes.push(`点 #card-dare 时 Playwright 把页面滚到了 Y=${scrollAfterClick}`);
    await chooser.waitForSelector('#card-section:not([hidden])', { timeout: 25000 });
    await chooser.waitForFunction(() => document.getElementById('punishment-text').textContent.length > 5, null, { timeout: 25000 });
    await chooser.waitForTimeout(1500);
    await top(chooser);
    out.revealed = await measure(chooser, {
      cardStage: '#card-section', flipCard: '#flip-card', cardFront: '#card-front',
      punishment: '#punishment-text', cardActions: '#card-actions',
      btnAccept: '#btn-accept', btnSkip: '#btn-skip',
      gameTools: '#screen-game > div:last-child', reactBar: '#react-bar',
    });
    await chooser.screenshot({ path: `${SHOTS}/landscape-card-${tag}.png` });
    await chooser.screenshot({ path: `${SHOTS}/landscape-card-${tag}-full.png`, fullPage: true }).catch(() => {});
    out.clicks.btnAccept = await trialClick(chooser, '#btn-accept');
    out.clicks.btnSkip = await trialClick(chooser, '#btn-skip');
    out.clicks.hitAccept = await probeHit(chooser, '#btn-accept');
    out.clicks.hitSkip = await probeHit(chooser, '#btn-skip');
    await top(chooser);
  } catch (e) {
    out.notes.push('FATAL: ' + String(e.message || e).split('\n')[0]);
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const [W, H] of VIEWPORTS) {
      const r = await runViewport(browser, W, H);
      results.push(r);
      const e = r.join && r.join.env;
      console.log(`\n${'═'.repeat(8)} ${r.tag} ${'═'.repeat(8)}`);
      if (e) {
        console.log(`env  inner=${e.vw}x${e.vh} dpr=${e.dpr} | docScrollH=${e.seScrollH} clientH=${e.seClientH} vOverflow=${e.vOverflow} maxScrollY=${e.maxScrollY} | scrollW=${e.seScrollW}/${e.seClientW} hOverflow=${e.hOverflow}`);
        console.log(`media coarse=${e.coarse} hoverNone=${e.noHover} landscapeMQ=${e.landscape} soType=${e.soType} soLockAPI=${e.soLock} requestFullscreen=${e.reqFs} visualViewport=${e.vv ? `${e.vv.w}x${e.vv.h}@${e.vv.scale}` : 'null'}`);
      }
      const app = r.join && r.join.app;
      if (app) console.log(`#app scrollH=${app.scrollH} clientH=${app.clientH} rect=[${app.rect.l},${app.rect.t},w=${app.rect.w},h=${app.rect.h}]`);
      for (const [screen, key] of [['JOIN', 'join'], ['LOBBY', 'lobby'], ['GAME', 'game'], ['REVEALED', 'revealed']]) {
        const m = r[key];
        if (!m) continue;
        console.log(`-- ${screen}` + (key === 'game' || key === 'revealed' ? ` (chooser=${r.chooser}, state=${r.chooserByState})` : ''));
        for (const k of Object.keys(m.els)) console.log(fmtEl(m.els[k]));
      }
      const cl = Object.values(r.clicks).filter(c => c && c.sel && !c.center && !c.missing);
      if (cl.length) console.log('-- trial clicks'); cl.forEach(c => console.log(fmtClick(c)));
      const hs = Object.values(r.clicks).filter(h => h && (h.center || h.missing));
      if (hs.length) console.log('-- 滚动命中测试'); hs.forEach(h => console.log(fmtHit(h)));
      if (r.notes.length) console.log('notes: ' + r.notes.join(' | '));
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(SHOTS, 'landscape-report.json'), JSON.stringify(results, null, 2));
  console.log('\n' + '═'.repeat(8) + ' JS 错误 ' + '═'.repeat(8));
  console.log(errors.length ? errors.join('\n') : '无 pageerror / console.error ✅');
  console.log('报告: shots/landscape-report.json');
  process.exitCode = errors.length ? 1 : 0;
})();
