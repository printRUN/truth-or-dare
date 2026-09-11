// 背景音乐 + 抽卡/翻牌点击反馈 E2E：BGM 开关与持久化 / 按下回弹 + 涟漪 / 翻牌扫光
// 用法: node test-audio.cjs   （本地模式双标签，端口 8803）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8803;
const URL = `http://127.0.0.1:${PORT}/index.html`;

let fails = 0;
const log = (...a) => console.log('[audio]', ...a);
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
  await p.click(`.avatar-option >> nth=${idx}`);
  return p;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {}
  });
  try {
    const A = await boot(ctx, { name: '阿泽', idx: 0, tag: 'A' });
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    const room = (await A.textContent('#share-room')).trim();
    const B = await boot(ctx, { name: '小雨', idx: 1, tag: 'B' });
    await B.fill('#input-room', room);
    await B.click('#btn-join');
    for (const p of [A, B]) await p.waitForSelector(`#players-grid .player-card .player-name:text-is("小雨")`, { timeout: 25000 });
    await A.waitForTimeout(700);
    ok(true, `组0 双人入房 OK（房间 ${room}）`);

    // ═══ 组 1：背景音乐默认关 + 开关持久化 ═══
    const def = await A.evaluate(() => ({ on: BGM.on, ls: localStorage.getItem('tod:bgm'), label: document.getElementById('btn-bgm-lobby').textContent, guide: document.getElementById('btn-bgm-guide').textContent }));
    ok(def.on === false && def.ls === null && /背景音乐/.test(def.label) && /关/.test(def.guide), `组1 BGM 默认关（${JSON.stringify(def)}）`);

    await A.click('#btn-bgm-lobby');
    await A.waitForTimeout(1700);
    const on = await A.evaluate(() => ({
      on: BGM.on, ls: localStorage.getItem('tod:bgm'), playing: BGM.playing,
      hasNode: !!BGM.node, gain: BGM.node ? +BGM.node.gain.value.toFixed(4) : -1,
      ctx: SFX.ctx ? SFX.ctx.state : 'none',
      label: document.getElementById('btn-bgm-lobby').textContent,
    }));
    ok(on.on === true && on.ls === 'on' && /🎵/.test(on.label), `组1 BGM 开启并持久化（${JSON.stringify({ ls: on.ls, label: on.label })}）`);
    ok(on.playing && on.hasNode, '组1 BGM 已开始播放且挂上音乐增益节点');
    ok(on.ctx === 'running' && on.gain > 0.05, `组1 音乐增益缓入生效（ctx=${on.ctx}, gain=${on.gain}）`);

    await A.click('#btn-bgm-lobby');   // 再点一次关闭
    const off = await A.evaluate(() => ({ on: BGM.on, ls: localStorage.getItem('tod:bgm'), playing: BGM.playing }));
    ok(off.on === false && off.ls === 'off' && !off.playing, `组1 再点关闭并停播（${JSON.stringify(off)}）`);

    // 弹窗未展开时按钮在弹层里，直接调用 toggle 验证同一入口与标签同步
    const guideToggle = await A.evaluate(() => { BGM.toggle(); return { on: BGM.on, guide: document.getElementById('btn-bgm-guide').textContent }; });
    ok(guideToggle.on === true && /开/.test(guideToggle.guide), `组1 指南弹层开关同步标签（${JSON.stringify(guideToggle)}）`);
    await A.evaluate(() => BGM.toggle());   // 复位为关

    // ═══ 组 2：新增音效名不抛错 ═══
    const sfxSafe = await A.evaluate(() => { try { SFX.ensure(); ['tap', 'draw', 'spark'].forEach(n => SFX.play(n)); return true; } catch (e) { return String(e); } });
    ok(sfxSafe === true, `组2 tap/draw/spark 音效不抛错（${sfxSafe}）`);

    // ═══ 组 3：开局 → 抽卡/翻牌点击反馈 ═══
    await A.click('#mode-pick .mode-opt[data-mode="turn"]');
    await A.click('#btn-start');
    for (const p of [A, B]) await p.waitForSelector('#screen-game.active', { timeout: 20000 });
    await A.waitForTimeout(1300);

    const dealTap = await A.evaluate(() => {
      const el = document.getElementById('card-truth');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 }));
      return { tapped: el.classList.contains('tapped'), rings: document.querySelectorAll('.tap-ring').length };
    });
    ok(dealTap.tapped && dealTap.rings >= 1, `组3 选卡（抽卡）按下回弹 + 涟漪（${JSON.stringify(dealTap)}）`);

    const flipTap = await A.evaluate(() => {
      const el = document.getElementById('flip-card');
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 40, pointerId: 2 }));
      return { tapped: el.classList.contains('tapped'), rings: document.querySelectorAll('.tap-ring').length };
    });
    ok(flipTap.tapped && flipTap.rings >= 1, `组3 翻牌卡按下回弹 + 涟漪（${JSON.stringify(flipTap)}）`);

    const glint = await A.evaluate(() => { flipGlint(); return document.querySelectorAll('.flip-glint').length; });
    ok(glint >= 1, `组3 翻牌扫光元素生成（${glint}）`);

    // 涟漪自动清理，不留 DOM
    await A.waitForTimeout(900);
    const left = await A.evaluate(() => document.querySelectorAll('.tap-ring, .flip-glint').length);
    ok(left === 0, `组3 点击/翻牌粒子自动清理（残留 ${left}）`);

    ok(errors.length === 0, `全程零 JS 报错${errors.length ? '：' + errors.slice(0, 4).join(' | ') : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
  log(fails ? `❌ ${fails} 条断言失败` : '\n✅ 背景音乐与点击反馈全部通过');
  process.exitCode = fails ? 1 : 0;
})();
