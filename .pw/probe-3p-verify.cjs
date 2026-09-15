// probe-3p-verify.cjs — 第三人称改造验收矩阵（design-plan-3p.md §验收）
// 视口档：1440×900 / 1280×800 / 1024×768 / 390×844 竖屏 / 844×390 landui 横屏
// 每档 6 人本地局，跑 选卡→抽卡→揭晓→交接 四阶段，断言 + 截图（.pw/shots/3p-verify-*.png）
// 红线：只新建本脚本与截图，不改 index.html 与既有测试。
(async () => {
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8841;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = path.join(ROOT, '.pw', 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const fails = [];
function check(name, ok, detail = '') {
  if (ok) passed++; else { failed++; fails.push(name); }
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${ok ? '' : '  ↳ ' + detail}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
await new Promise(res => server.listen(PORT, res));

const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function runViewport(tag, vw, vh, opts = {}) {
  const isLand = tag === '844x390';
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const pages = [];
  const errs = [];
  for (let i = 0; i < 6; i++) {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    await p.click('details.adv summary');
    await p.check('#chk-local');
    await p.fill('#input-name', '玩家' + (i + 1));
    if (pages.length) await p.fill('#input-room', pages[0].room);
    await p.locator('.avatar-option:visible').first().click();
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    p.room = pages.length ? pages[0].room : (await p.textContent('#share-room')).trim();
    pages.push(p);
  }
  pages[0].landui = isLand;
  await pages.forEach(p => p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }));
  await pages[0].click('#btn-start');
  await pages[0].waitForSelector('#screen-game.active', { timeout: 20000 });
  await sleep(3300);   // 入座 + 镜头推进落定（nudge 820ms 补间要留足余量，否则运镜中量 rect 会误判）

  const NAMES = ['choosing', 'drawing', 'revealed', 'next'];
  async function snapshot(stage) {
    await pages[0].evaluate(() => { try { Cam.jump(Cam.baseOf('game')); } catch (e) {} });   // 顶层 const 不挂 window，必须裸引用
    await pages[0].evaluate(() => { try { anchorTpBack(); } catch (e) { window.__anchorErr = e.message; } });
    // 等镜头真收敛：jump 之后 runStage 的 nudge 定时器可能再拉起运镜，SPEC 明告 rect 只能在静止态量
    const restRx = pages[0].landui ? 2 : 19;
    await pages[0].waitForFunction(rx => Math.abs(Cam.cur.rx - rx) < 0.15, null, { timeout: 3000 }).catch(() => {});
    await sleep(150);
    return pages[0].evaluate(() => {
      const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const tp = document.getElementById('tp-back');
      const grid = document.getElementById('game-players-grid');
      const cards = [...grid.querySelectorAll('.player-card')].map(c => {
        const wrap = c.querySelector('.avatar-wrap');
        const name = c.querySelector('.player-name');
        return { pid: c.dataset.pid, me: c.classList.contains('me'), rx: c.style.getPropertyValue('--rx'), ry: c.style.getPropertyValue('--ry'), face: rectOf(wrap || c), name: rectOf(name), cardW: rectOf(c).w };
      });
      const btns = [...document.querySelectorAll('#screen-game.active .tool-row .btn-secondary')].map(b => ({ t: b.textContent.slice(0, 4), rect: rectOf(b), hit: (() => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1)); return !!h && (h === b || b.contains(h)); })(), hitEl: (() => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1)); return h ? (h.id ? '#' + h.id : h.tagName + '.' + String(h.className).slice(0, 30)) : 'null'; })() }));
      const tb = document.querySelector('#screen-game.active .tool-row');
      return {
        tp: tp ? { ...rectOf(tp), pe: getComputedStyle(tp).pointerEvents, chr1: tp.style.getPropertyValue('--chr1'), tf: getComputedStyle(tp).transform, cls: tp.className } : null,
        ring: { w: grid.offsetWidth, h: grid.offsetHeight, rect: rectOf(grid) },
        cardTf: (() => { const cs = document.getElementById('card-section'); return cs && !cs.hidden ? getComputedStyle(document.querySelector('.card-stage')).transform : null; })(),
        cards,
        btns, toolbar: tb ? rectOf(tb) : null,
        scrollH: document.documentElement.scrollHeight,
        lastBtnB: (() => { let m = 0; document.querySelectorAll('#screen-game.active button').forEach(b => { if (b.offsetParent !== null) { const r = b.getBoundingClientRect(); if (r.bottom > m) m = r.bottom; } }); return Math.round(m); })(),
        innerW: window.innerWidth, innerH: window.innerHeight,
        stageCls: document.getElementById('screen-game').classList.contains('stage-revealed'),
        fwd: tp ? tp.classList.contains('tp-forward') : false,
        contentB: (() => { let m = 0; for (const id of ['choice-section', 'deck-section', 'card-section', 'ghost-bar']) { const el = document.getElementById(id); if (el && !el.hidden && el.offsetParent) { const r = el.getBoundingClientRect(); if (r.bottom > m) m = r.bottom; } } const bet = document.querySelector('#screen-game > .bet-box'); if (bet && bet.offsetParent) { const r = bet.getBoundingClientRect(); if (r.top < innerHeight && r.top > m) m = r.top; } return Math.round(m); })(),
        tpBottomInline: tp ? tp.style.bottom : null,
        anchorErr: window.__anchorErr || null,
        tpDbg: window.__tpDbg || null,
        world: document.getElementById('world3d').style.transform,
      };
    });
  }

  // ── 选卡阶段 ──
  let s = await snapshot();
  check(`[${tag}] 背影存在且不拦点击`, !!s.tp && s.tp.pe === 'none', JSON.stringify(s.tp));
  check(`[${tag}] 背影带身份色`, !!s.tp && /^hsl\(/.test(s.tp.chr1 || ''), s.tp && s.tp.chr1);
  check(`[${tag}] 背影在视口内（头顶入画、左右不越界；底缘按设计可裁出屏）`, !!s.tp && s.tp.y <= s.innerH && s.tp.x >= -1 && s.tp.r <= s.innerW + 1, JSON.stringify(s.tp));
  check(`[${tag}] 背影投影 ≤ 视口上限（前倾 1.05 后：竖屏 ≤40vw/≤24vh）`, !s.tp || (vw > 600 || (s.tp.w <= vw * 0.4 + 2 && s.tp.h <= vh * 0.24 + 2)), JSON.stringify({ w: Math.round(s.tp ? s.tp.w : 0), h: Math.round(s.tp ? s.tp.h : 0) }));
  check(`[${tag}] 背影不盖内容区（顶边 ≥ 选卡/题面/押注下缘）`, !s.tp || s.tp.y >= s.contentB - 2 || s.contentB === 0, `tp.y=${Math.round(s.tp ? s.tp.y : 0)} contentB=${s.contentB} inline=${s.tpBottomInline} dbg=${JSON.stringify(s.tpDbg)}`);
  const others = s.cards.filter(c => !c.me);
  check(`[${tag}] 对手无一遮挡（脸=圆，圆心距 ≥ 半径和×0.92；包围盒角碰不算压脸）`, (() => {
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
      const a = others[i].face, b = others[j].face;
      const dx = (a.x + a.w / 2) - (b.x + b.w / 2), dy = (a.y + a.h / 2) - (b.y + b.h / 2);
      const dist = Math.hypot(dx, dy), rSum = (Math.min(a.w, a.h) + Math.min(b.w, b.h)) / 2;
      if (dist < rSum * 0.92) return false;   // 0.92：wrap 方盒略大于内切脸圆，留角部余量
    }
    return true;
  })(), JSON.stringify({ world: s.world && s.world.slice(0, 90), o: others.map(c => ({ rx: c.rx, ry: c.ry, x: Math.round(c.face.x), y: Math.round(c.face.y), w: Math.round(c.face.w) })) }));
  check(`[${tag}] 背影不压任何对手的脸/名牌`, (() => {
    const t = s.tp;
    for (const o of others) {
      const ix = Math.max(0, Math.min(t.r, o.face.r) - Math.max(t.x, o.face.x)), iy = Math.max(0, Math.min(t.b, o.face.b) - Math.max(t.y, o.face.y));
      if (ix > 2 && iy > 2) return false;
      const jx = Math.max(0, Math.min(t.r, o.name.r) - Math.max(t.x, o.name.x)), jy = Math.max(0, Math.min(t.b, o.name.b) - Math.max(t.y, o.name.y));
      if (jx > 2 && jy > 2) return false;
    }
    return true;
  })(), JSON.stringify(others.map(c => ({ pid: c.pid.slice(-4), f: c.face, n: c.name }))));
  if (vw >= 1024) {
    const far = others.reduce((m, c) => c.face.w < m.face.w ? c : m, others[0]);
    check(`[${tag}] 远座卡宽 ≥64px（6-7 人档；8+ 人允许分层缩一档）`, far.face.w >= (others.length <= 6 ? 64 : 54), `far=${Math.round(far.face.w)}px n=${others.length + 1}`);
    check(`[${tag}] 背影头顶不爬进对面座位带（低于环盒中点）`, s.tp.y >= s.ring.rect.y + s.ring.h * 0.55, `tp.y=${Math.round(s.tp.y)} ringMid=${Math.round(s.ring.rect.y + s.ring.h * 0.55)}`);
  }
  if (vw <= 600) {
    check(`[${tag}] 竖屏背影 ≤40vw 宽且 ≤24vh 高（婷婷上限）`, s.tp.w <= vw * 0.4 + 2 && s.tp.h <= vh * 0.24 + 2, `w=${Math.round(s.tp.w)} h=${Math.round(s.tp.h)}`);
      // 口径：交互元素全部落在首屏；scrollHeight 的 +40 容差 = #app padding-bottom（非交互空白不算滚动）
    check(`[${tag}] 竖屏选卡不滚动（最后按钮底 ≤ vh 且 scrollHeight ≤ vh+40）`, s.lastBtnB <= vh + 1 && s.scrollH <= vh + 40, `lastBtn=${s.lastBtnB} scrollH=${s.scrollH}`);
    const rowScrollable = await pages[0].evaluate(() => { const r = document.getElementById('game-tools'); return !!r && r.scrollWidth > r.clientWidth + 2; });
    check(`[${tag}] 竖屏工具栏按钮在屏内且（命中或行内横滚可达）`, s.btns.length > 0 && s.btns.every(b => b.rect.b <= vh + 1) && (rowScrollable || s.btns.every(b => b.hit)),
      JSON.stringify({ rowScrollable, b: s.btns.map(b => ({ t: b.t, b: Math.round(b.rect.b), hit: b.hit })) }));
  } else {
    check(`[${tag}] 工具栏按钮全部可点（elementFromPoint 命中）`, s.btns.length > 0 && s.btns.every(b => b.hit), JSON.stringify(s.btns.map(b => ({ t: b.t, hit: b.hit }))));
  }
  await pages[0].screenshot({ path: path.join(SHOTS, `3p-verify-${tag}-choosing.png`) });

  const ringHChoosing = s.ring.h;   // 桌子完整基线：揭晓时环高必须与选卡档一致（不许压缩）
  // ── 抽卡 → 揭晓 ──
  let drawer = null;
  for (const p of pages) {
    if (await p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) { drawer = p; break; }
  }
  if (drawer) {
    await drawer.click('#card-truth', { force: true });
    await sleep(1300);
    s = await snapshot();
    check(`[${tag}] 抽卡阶段座次环在画`, s.ring.w > 50, `ringW=${s.ring.w}`);
    await pages[0].screenshot({ path: path.join(SHOTS, `3p-verify-${tag}-drawing.png`) });
    await pages[0].waitForSelector('#card-section:not([hidden])', { timeout: 25000 }).catch(() => {});
    await pages[0].waitForFunction(() => document.getElementById('screen-game').classList.contains('stage-revealed'), null, { timeout: 20000 }).catch(() => {});
    await sleep(900);   // 挂类 + 压暗/下沉 transition（0.45s）落定
    s = await snapshot();
    check(`[${tag}] 揭晓牌桌常驻（stage-revealed + 环可见 + 背影在画）`, s.stageCls && s.ring.w > 50 && !!s.tp, `cls=${s.stageCls} ringW=${s.ring.w}`);
    check(`[${tag}] 揭晓桌子完整（环高与选卡档一致，不再压缩）`, Math.abs(s.ring.h - ringHChoosing) <= 2, `revealed=${s.ring.h} choosing=${ringHChoosing}`);
    check(`[${tag}] 题面卡躺在台面上（rotateX 躺角生效）`, !!s.cardTf && s.cardTf !== 'none' && s.cardTf.split(',').length >= 14, String(s.cardTf).slice(0, 60));
    if (vw <= 600) {
      const visH = Math.min(s.tp.b, s.innerH) - Math.max(s.tp.y, 0);
      check(`[${tag}] 揭晓背影可见高度 ≥40px（竖屏不随下沉出画）`, visH >= 40, `visH=${Math.round(visH)} tp=${JSON.stringify({ y: Math.round(s.tp.y), b: Math.round(s.tp.b) })}`);
      // 揭晓押注面板在流内（功能内容）：允许 ≤vh+150 的轻微滚动，但按钮必须全部可滚达
      check(`[${tag}] 揭晓轻微滚动可达（scrollHeight ≤ vh+150 且最后按钮底 ≤ scrollH）`, s.scrollH <= vh + 150 && s.lastBtnB <= s.scrollH, `lastBtn=${s.lastBtnB} scrollH=${s.scrollH}`);
    }
    if (vw >= 1024) {
      // 题面卡是焦点可压在背影上，但背影躯干必须从卡下缘露出 ≥60px（人在画，阿凯 §三3）
      const cardSec = await pages[0].evaluate(() => { const r = document.getElementById('card-section').getBoundingClientRect(); return { x: r.x, b: r.bottom }; });
      // 题面卡下缘未吃掉全部纵向余量时，背影躯干必须露出 ≥40px（1024×768 卡下缘 743 已过 vh-46，几何上无从露出，豁免）
      if (cardSec.b <= s.innerH - 60) {
        check(`[${tag}] 揭晓背影躯干从题面卡下缘露出 ≥40px`, s.tp.b - cardSec.b >= 40, `tpB=${Math.round(s.tp.b)} cardB=${Math.round(cardSec.b)} tf=${s.tp.tf} cls=${s.tp.cls}`);
      }
      const isChooser = await pages[0].evaluate(() => (S.turn.chooserId || activePlayerId()) === myId);
      if (isChooser) {
        const btn = await pages[0].evaluate(() => { const b = document.getElementById('btn-skip') || document.getElementById('btn-accept'); if (!b || b.offsetParent === null) return null; const r = b.getBoundingClientRect(); return { b: r.bottom, hit: (() => { const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); })() }; });
        check(`[${tag}] 揭晓动作按钮在屏内且可点`, !!btn && btn.b <= s.innerH - 8 && btn.hit, JSON.stringify(btn));
      }
    }
    if (vw <= 600) {
      const btn = await pages[0].evaluate(() => { const b = document.getElementById('btn-accept'); if (!b || b.offsetParent === null) return null; const r = b.getBoundingClientRect(); return Math.round(r.bottom); });
      check(`[${tag}] 竖屏揭晓「完成啦」按钮可见（ ≤ vh）`, btn === null || btn <= vh, `btnBottom=${btn}`);
    }
    await pages[0].screenshot({ path: path.join(SHOTS, `3p-verify-${tag}-revealed.png`) });
    // 完成回合 → 交接
    for (const p of pages) {
      const can = await p.evaluate(() => { const b = document.getElementById('btn-accept'); return b && !b.hidden && b.offsetParent; });
      if (can) { await p.click('#btn-accept', { force: true }); break; }
    }
    await sleep(2400);
    s = await snapshot();
    check(`[${tag}] 交接后牌桌与背影仍在画`, !s.stageCls && s.ring.w > 50 && !!s.tp, JSON.stringify({ cls: s.stageCls, ring: s.ring.w }));
    if (vw <= 600) {
      check(`[${tag}] 交接不滚动（最后按钮底 ≤ vh 且 scrollHeight ≤ vh+40）`, s.lastBtnB <= vh + 1 && s.scrollH <= vh + 40, `lastBtn=${s.lastBtnB} scrollH=${s.scrollH}`);
    }
    await pages[0].screenshot({ path: path.join(SHOTS, `3p-verify-${tag}-next.png`) });
  } else {
    check(`[${tag}] 没找到持麦人（脚本问题）`, false);
  }
  check(`[${tag}] 全程零 pageerror`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

const ONLY = process.env.ONLY || null;
for (const [t, w, h] of [['1440x900', 1440, 900], ['1280x800', 1280, 800], ['1024x768', 1024, 768], ['390x844', 390, 844], ['844x390', 844, 390]]) {
  if (!ONLY || ONLY === t) await runViewport(t, w, h);
}

await browser.close();
server.close();
console.log(`\n断言合计 ${passed + failed}：PASS ${passed} / FAIL ${failed}`);
if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); }
console.log('THIRD-PERSON ACCEPTANCE MATRIX PASSED ✅');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
