// 一次性探针：玩家模拟 · 多地图功能走查（只读取证，不改游戏文件）
// 产物：.pw/shots/persona-mono-maps-*.png + 布局度量 JSON（stdout）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8963;
const SHOTS = 'D:/myidea/truth-or-dare/.pw/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = n => path.join(SHOTS, `persona-mono-maps-${n}.png`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('no'); }
});

const log = (...a) => console.log(...a);

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ─────────────────────────────────────────────────────────────
  // A. SETUP 页走查（桌面 1280×860 + 竖屏 390×844）：默认联机 tab / 高级选项热座
  // ─────────────────────────────────────────────────────────────
  async function setupWalk(tag, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&localnet=1`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.waitForTimeout(600);
    // 默认 tab：联机表单
    await p.screenshot({ path: shot(`${tag}-1-setup-form.png`) });
    // 打开高级选项（本地热座）
    await p.evaluate(() => { document.getElementById('adv-box').open = true; });
    await p.waitForTimeout(300);
    await p.screenshot({ path: shot(`${tag}-2-setup-adv.png`) });
    // 布局度量
    const m = await p.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; };
      const panel = document.querySelector('#setup .panel');
      return {
        viewport: { w: innerWidth, h: innerHeight },
        panel: box('#setup .panel'),
        panelScrollH: panel ? panel.scrollHeight : -1,
        panelOverflow: panel ? panel.scrollHeight > panel.clientHeight : null,
        partyNet: box('#party-net'),
        pnForm: box('.pn-form'),
        advBox: box('#adv-box'),
        hotOpts: box('#hot-opts'),
        btnStart: box('#btn-start'),
        rulesBox: box('#rules-box'),
        seatRows: box('#seat-rows'),
        roundRow: box('.opt-row'),
      };
    });
    log(`[${tag}] setup 度量:`, JSON.stringify(m));
    await ctx.close();
    return m;
  }
  await setupWalk('a-desktop', { width: 1280, height: 860 });
  const mMob = await setupWalk('b-mobile', { width: 390, height: 844 });

  // ─────────────────────────────────────────────────────────────
  // B. 联机大厅走查（localnet BroadcastChannel，同 context 双页）
  // ─────────────────────────────────────────────────────────────
  async function lobbyWalk(tag, vp, withJoiner) {
    const ctx = await browser.newContext({ viewport: vp });
    const host = await ctx.newPage();
    await host.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&localnet=1`, { waitUntil: 'domcontentloaded' });
    await host.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await host.reload({ waitUntil: 'domcontentloaded' });
    await host.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await host.fill('.pn-name', '房主小张');
    await host.click('.pn-create');
    await host.waitForSelector('.pn-lobby:not([hidden])', { timeout: 15000 });
    const code = await host.textContent('.pn-code-b');
    if (withJoiner) {
      const joiner = await ctx.newPage();
      await joiner.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1&localnet=1`, { waitUntil: 'domcontentloaded' });
      await joiner.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
      await joiner.fill('.pn-name', '隔壁小红');
      await joiner.fill('.pn-room', code.trim());
      await joiner.click('.pn-join');
      await joiner.waitForSelector('.pn-lobby:not([hidden])', { timeout: 15000 });
      await host.waitForTimeout(800);
      await joiner.screenshot({ path: shot(`${tag}-lobby-joiner.png`) }).catch(() => {});
    } else {
      await host.click('.pn-addbot');
    }
    await host.waitForTimeout(600);
    await host.screenshot({ path: shot(`${tag}-3-lobby-host.png`) });
    const m = await host.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; };
      const panel = document.querySelector('#setup .panel');
      const extra = document.querySelector('.pn-lobby-extra');
      return {
        panel: box('#setup .panel'), panelScrollH: panel ? panel.scrollHeight : -1,
        lobby: box('.pn-lobby'), players: box('.pn-players'), extra: box('.pn-lobby-extra'),
        extraVisibleToAll: extra ? !extra.hidden : null,
        extraHtml: extra ? extra.innerHTML.slice(0, 120) : null,
        startBtn: box('.pn-start'), addBot: box('.pn-addbot'),
      };
    });
    log(`[${tag}] lobby 度量:`, JSON.stringify(m));
    // 房主开局 → 对局内大厅消失的证据（顺手）
    await ctx.close();
  }
  await lobbyWalk('c-desktop', { width: 1280, height: 860 }, true);
  await lobbyWalk('d-mobile', { width: 390, height: 844 }, false);

  // ─────────────────────────────────────────────────────────────
  // C. 对局内走查（桌面 1100×800，inspect 热座 2 人）
  // ─────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => {
      document.getElementById('adv-box').open = true;
      document.getElementById('skip-handoff').checked = true;
      document.getElementById('rules-box').open = false;
    });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    await p.waitForTimeout(1800);   // 等全景落定
    await p.screenshot({ path: shot('e1-game-overview.png') });
    const scene = await p.evaluate(() => ({
      info: __mono.sceneInfo(),
      tiles: TILES.map((t, i) => `${i}:${t.name}${t.kind === 'prop' ? '/¥' + t.price + '/' + GROUPS[t.group].color : ''}`),
    }));
    log('[e] scene:', JSON.stringify(scene.info));
    log('[e] tiles:', scene.tiles.join(' | '));
    // 买地弹窗（tile1 = 老城区）
    await p.evaluate(() => { __mono.resolveAt(0, 1); return null; });
    await p.waitForSelector('#buy-modal:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(400);
    await p.screenshot({ path: shot('e2-buy-modal.png') });
    const buy = await p.evaluate(() => ({
      colorChipBg: document.getElementById('buy-color').style.background,
      name: document.getElementById('buy-name').textContent,
      info: document.getElementById('buy-info').textContent,
    }));
    log('[e] buy modal:', JSON.stringify(buy));
    await p.evaluate(() => document.getElementById('btn-buy-yes').click());
    await p.waitForTimeout(900);
    await p.screenshot({ path: shot('e3-owned-tile-toast.png') });
    // 命运卡（tile3 = 机会）
    await p.evaluate(() => { __mono.resolveAt(0, 3); return null; });
    await p.waitForTimeout(3200);
    await p.screenshot({ path: shot('e4-card.png') });
    // 免费停车格现状文案（tile12）
    await p.evaluate(() => { __mono.resolveAt(0, 12); return null; });
    await p.waitForTimeout(900);
    const parkToast = await p.evaluate(() => document.getElementById('toast').textContent);
    log('[e] parking toast:', parkToast);
    // 结算屏
    await p.evaluate(() => {
      G.players[1].bankrupt = true; G.players[1].cash = 0;
      if (pawnObjs[1]) pawnObjs[1].visible = false;
      updateHUD(); afterResolve();
    });
    await p.waitForSelector('#result-overlay:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: shot('e5-result.png') });
    await ctx.close();
  }

  // ─────────────────────────────────────────────────────────────
  // D. 竖屏对局全景（390×844）：确认棋盘/HUD 是否装得下 + 玩家条占位
  // ─────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    await p.waitForTimeout(1800);
    await p.screenshot({ path: shot('f1-game-390.png') });
    const hud = await p.evaluate(() => {
      const bar = document.getElementById('players-bar').getBoundingClientRect();
      const chip = document.querySelector('.pchip').getBoundingClientRect();
      const bar2 = document.getElementById('action-bar');
      return { playersBarH: Math.round(bar.height), chipH: Math.round(chip.height), actionBarShown: bar2.classList.contains('show') };
    });
    log('[f] 390×844 HUD:', JSON.stringify(hud));
    await ctx.close();
  }

  // ─────────────────────────────────────────────────────────────
  // E. 2D 降级棋盘（禁 WebGL 启动）+ 存档继续弹窗
  // ─────────────────────────────────────────────────────────────
  {
    let browser2 = null;
    try {
      browser2 = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
      const ctx = await browser2.newContext({ viewport: { width: 800, height: 700 } });
      const p = await ctx.newPage();
      await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
      await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
      const glOff = await p.evaluate(() => document.body.classList.contains('gl-off'));
      log('[g] WebGL 禁用生效（body.gl-off）:', glOff);
      if (glOff) {
        await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
        await p.click('#btn-start');
        await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
        await p.waitForTimeout(500);
        await p.screenshot({ path: shot('g1-board2d.png') });
        const d2 = await p.evaluate(() => {
          const el = document.querySelector('#board2d .t2');
          return { t2Count: document.querySelectorAll('#board2d .t2').length, first: el ? el.textContent.slice(0, 40) : null, board2dDisplay: getComputedStyle(document.getElementById('board2d')).display };
        });
        log('[g] 2D 棋盘:', JSON.stringify(d2));
      }
      await ctx.close();
    } catch (e) { log('[g] 2D 降级档启动失败（跳过）:', e.message.split('\n')[0]); }
    if (browser2) await browser2.close();
  }

  // 存档「继续对局」弹窗（含地图一致性入口证据：弹窗只报轮次/领先者，不报地图）
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 620 } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?inspect=1`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 30000 });
    await p.evaluate(() => { document.getElementById('adv-box').open = true; document.getElementById('skip-handoff').checked = true; });
    await p.click('#btn-start');
    await p.waitForFunction(() => window.__mono && __mono.state.phase === 'AWAIT_ROLL', null, { timeout: 15000 });
    await p.waitForTimeout(400);
    // 买块地，让存档有内容
    await p.evaluate(() => { __mono.resolveAt(0, 1); return null; });
    await p.waitForSelector('#buy-modal:not([hidden])', { timeout: 8000 });
    await p.evaluate(() => document.getElementById('btn-buy-yes').click());
    await p.waitForTimeout(600);
    const saveRaw = await p.evaluate(() => localStorage.getItem('mono:save:v1'));
    log('[h] save 字段:', saveRaw ? Object.keys(JSON.parse(saveRaw)).join(',') : 'null');
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#gen-modal:not([hidden])', { timeout: 15000 });
    await p.waitForTimeout(400);
    await p.screenshot({ path: shot('h1-continue-modal.png') });
    const modalTxt = await p.evaluate(() => document.getElementById('gen-body').textContent);
    log('[h] continue modal 文案:', modalTxt);
    await p.evaluate(() => { document.querySelector('#gen-actions button:last-child').click(); });   // 弃局重来，清存档
    await ctx.close();
  }

  await browser.close();
  server.close();
  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
