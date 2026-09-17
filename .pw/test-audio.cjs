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

    // ═══ 组 1：背景音乐默认开 + 音量滑杆 + 开关持久化 ═══
    await A.waitForTimeout(1600);   // 首次手势已发生，等缓入完成
    const def = await A.evaluate(() => ({
      on: BGM.on, ls: localStorage.getItem('tod:bgm'), playing: BGM.playing,
      ctx: SFX.ctx ? SFX.ctx.state : 'none', gain: BGM.node ? +BGM.node.gain.value.toFixed(4) : -1,
      label: document.getElementById('btn-bgm-lobby').textContent,
      guide: document.getElementById('btn-bgm-guide').textContent,
      vol: BGM.vol, slider: document.getElementById('bgm-vol').value,
    }));
    ok(def.on === true && def.ls === null && /🎵/.test(def.label) && /开/.test(def.guide), `组1 BGM 默认开（${JSON.stringify({ ls: def.ls, label: def.label, guide: def.guide })}）`);
    ok(def.playing && def.ctx === 'running' && def.gain > 0.5, `组1 首次手势后自动出声并缓入到默认音量（ctx=${def.ctx}, gain=${def.gain}）`);
    ok(def.vol === 0.9 && def.slider === '90', `组1 默认音量 90%（vol=${def.vol}, slider=${def.slider}）`);

    // 音量滑杆：拉到 30% → 播放中即时平滑过渡 + 持久化
    await A.evaluate(() => { const el = document.getElementById('bgm-vol'); el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await A.waitForTimeout(420);
    const vol = await A.evaluate(() => ({ vol: BGM.vol, ls: localStorage.getItem('tod:bgm:vol'), gain: BGM.node ? +BGM.node.gain.value.toFixed(4) : -1, label: document.getElementById('bgm-vol-val').textContent }));
    ok(Math.abs(vol.vol - 0.3) < 1e-6 && vol.ls === '0.3' && vol.label === '30%', `组1 音量滑杆改到 30% 并持久化（${JSON.stringify({ vol: vol.vol, ls: vol.ls, label: vol.label })}）`);
    ok(vol.gain > 0.2 && vol.gain < 0.45, `组1 播放中调音量即时生效（gain=${vol.gain}）`);

    // 关闭 → 停播 + 持久化
    await A.click('#btn-bgm-lobby');
    const off = await A.evaluate(() => ({ on: BGM.on, ls: localStorage.getItem('tod:bgm'), playing: BGM.playing, label: document.getElementById('btn-bgm-lobby').textContent }));
    ok(off.on === false && off.ls === 'off' && !off.playing && /🔇/.test(off.label), `组1 关闭后停播并持久化（${JSON.stringify(off)}）`);

    // 弹窗未展开时按钮在弹层里，直接调用 toggle 验证同一入口与标签同步
    const guideToggle = await A.evaluate(() => { BGM.toggle(); return { on: BGM.on, guide: document.getElementById('btn-bgm-guide').textContent }; });
    ok(guideToggle.on === true && /开/.test(guideToggle.guide), `组1 指南弹层开关同步标签（${JSON.stringify(guideToggle)}）`);
    await A.evaluate(() => BGM.toggle());   // 复位为关

    // ═══ 组 2：新增音效名不抛错 ═══
    const sfxSafe = await A.evaluate(() => { try { SFX.ensure(); ['tap', 'draw', 'spark'].forEach(n => SFX.play(n)); return true; } catch (e) { return String(e); } });
    ok(sfxSafe === true, `组2 tap/draw/spark 音效不抛错（${sfxSafe}）`);

    // ═══ 组 2b：连麦只压低背景音乐，动作音效总线不受影响（直接驱动状态，不真的开麦） ═══
    const duck0 = await A.evaluate(() => ({ musicDuck: SFX.musicDuck, music: +SFX.music.gain.value.toFixed(4), sfx: +SFX.master.gain.value.toFixed(4), label: document.getElementById('btn-duck-guide').textContent }));
    ok(duck0.musicDuck === 1 && duck0.music > 0.15 && duck0.sfx > 0.15 && /开$/.test(duck0.label), `组2b 空闲时两条总线都满音量（music=${duck0.music}, sfx=${duck0.sfx}）`);

    await A.evaluate(() => { MIC.on = true; syncAudioDuck(); });   // 走 320ms 缓降
    const d1duck = await A.evaluate(() => SFX.musicDuck);
    await A.waitForTimeout(520);
    const d1 = await A.evaluate(() => ({ music: +SFX.music.gain.value.toFixed(4), sfx: +SFX.master.gain.value.toFixed(4) }));
    ok(Math.abs(d1duck - 0.14) < 1e-9 && d1.music > 0.02 && d1.music < 0.04 && d1.sfx > 0.15, `组2b 广播时只压音乐到 14%（music=${d1.music}, sfx=${d1.sfx}）`);

    // 仅收听：有活跃语音链路才压到 50%
    await A.evaluate(() => { MIC.on = false; MIC.peers.set('fake', { pc: { connectionState: 'new' } }); syncAudioDuck(); });
    const d2duck = await A.evaluate(() => SFX.musicDuck);
    await A.waitForTimeout(520);
    const d2 = await A.evaluate(() => ({ music: +SFX.music.gain.value.toFixed(4), sfx: +SFX.master.gain.value.toFixed(4) }));
    ok(Math.abs(d2duck - 0.5) < 1e-9 && d2.music > 0.08 && d2.music < 0.12 && d2.sfx > 0.15, `组2b 仅收听（有链路）时压到 50%（music=${d2.music}, sfx=${d2.sfx}）`);

    await A.evaluate(() => { MIC.peers.delete('fake'); MIC.listen = true; syncAudioDuck(); });   // 收听偏好开着但无链路 → 不压
    await A.waitForTimeout(520);
    const d2b = await A.evaluate(() => ({ musicDuck: SFX.musicDuck, music: +SFX.music.gain.value.toFixed(4) }));
    ok(d2b.musicDuck === 1 && d2b.music > 0.15, `组2b 无人说话时不无端压低（music=${d2b.music}）`);

    // 关掉自动压低 → 广播也满音量
    await A.evaluate(() => { document.getElementById('btn-duck-guide').click(); MIC.on = true; syncAudioDuck(); });
    await A.waitForTimeout(520);
    const d3 = await A.evaluate(() => ({ pref: duckPref, musicDuck: SFX.musicDuck, ls: localStorage.getItem('tod:duck'), label: document.getElementById('btn-duck-guide').textContent, music: +SFX.music.gain.value.toFixed(4) }));
    ok(d3.pref === false && d3.musicDuck === 1 && d3.ls === '0' && /关$/.test(d3.label) && d3.music > 0.15, `组2b 关掉自动压低后广播也满音量（${JSON.stringify({ pref: d3.pref, ls: d3.ls, music: d3.music })}）`);

    // 复原
    await A.evaluate(() => { document.getElementById('btn-duck-guide').click(); MIC.on = false; MIC.listen = true; syncAudioDuck(); });
    await A.waitForTimeout(520);
    const restored = await A.evaluate(() => ({ pref: duckPref, ls: localStorage.getItem('tod:duck'), gain: +SFX.master.gain.value.toFixed(4) }));
    ok(restored.pref === true && restored.ls === '1' && restored.gain > 0.15, `组2b 复原自动压低设置（${JSON.stringify(restored)}）`);

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

    // 涟漪自动清理，不留 DOM（软渲下主线程被 WebGL 阻塞，560/760ms 定时器可晚 ~0.5s 触发——轮询等清空，不卡单点）
    const left = await A.waitForFunction(() => document.querySelectorAll('.tap-ring, .flip-glint').length === 0, null, { timeout: 4000, polling: 150 }).then(() => 0).catch(async () => await A.evaluate(() => document.querySelectorAll('.tap-ring, .flip-glint').length));
    ok(left === 0, `组3 点击/翻牌粒子自动清理（残留 ${left}）`);

    ok(errors.length === 0, `全程零 JS 报错${errors.length ? '：' + errors.slice(0, 4).join(' | ') : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
  log(fails ? `❌ ${fails} 条断言失败` : '\n✅ 背景音乐与点击反馈全部通过');
  process.exitCode = fails ? 1 : 0;
})();
