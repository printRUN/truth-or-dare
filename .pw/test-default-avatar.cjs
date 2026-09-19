// E2E: 默认头像去除 → 默认定制头像 —— fresh boot 默认落在「🎨 定制」且预选 dcb: 配方 /
//      预设 UI 不存在 / live-follow 所见即所得 / 什么都不点直接加入 = 配方进状态 /
//      默认定制头像进 3D 牌桌 → 球面脸贴片就是它（GL 材质 canvas 像素比对）
// 用法: node test-default-avatar.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8874;
const URL = `http://localhost:${PORT}/index.html?game=tod`;
function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, d) => { if (err) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
    });
    s.listen(PORT, () => res(s));
  });
}
const log = (...a) => console.log('[dav]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
function watch(p, t) {
  p.on('pageerror', e => errors.push(`[${t}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${t}] console: ${m.text()}`); });
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  let A;
  try {
    // 1) fresh boot：默认定制 tab + 预选 dcb: 配方 + 预设 UI 不存在
    A = await ctx.newPage(); watch(A, 'A');
    await A.goto(URL, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 });
    const boot = await A.evaluate(() => ({
      tabSel: document.querySelector('.av-tab.sel') && document.querySelector('.av-tab.sel').id,
      rep: avatarSel.rep, tab: avatarSel.tab,
      presetGone: !document.getElementById('avtab-preset') && !document.getElementById('av-panel-preset'),
      customVisible: !document.getElementById('av-panel-custom').hidden,
      label: document.querySelector('#grp-avatar label').textContent,
      style: cz.style,
      styleOk: !['identicon', 'icons', 'rings', 'glass', 'initials', 'shapes'].includes(cz.style),
      selEqCz: avatarSel.rep === czRep(),
    }));
    if (boot.tabSel !== 'avtab-custom' || boot.tab !== 'custom') throw new Error('default tab not custom: ' + JSON.stringify(boot));
    if (!boot.rep.startsWith('dcb:')) throw new Error('default rep not dcb: ' + boot.rep);
    if (!boot.presetGone || !boot.customVisible) throw new Error('preset UI still present / custom panel hidden');
    if (!boot.label.includes('定制') || boot.label.includes('预设')) throw new Error('label copy wrong: ' + boot.label);
    if (!boot.styleOk) throw new Error('boot style is abstract: ' + boot.style);
    if (!boot.selEqCz) throw new Error('boot selection != customizer preview');
    log('fresh boot：默认定制 + 预选配方', boot.rep.slice(0, 34) + '…', '（风格', boot.style + '）');
    await A.locator('#grp-avatar').screenshot({ path: 'shots/dav-join-default.png' });

    // 2) live-follow：换风格 / 重掷 / 换底色 → 选中同步变（所见即所得）
    const rep0 = boot.rep;
    const chipIdx = await A.evaluate(() => {
      const i = DiceBearLocal.STYLES.indexOf(cz.style);
      return (i + 7) % DiceBearLocal.STYLES.length;   // 必拨到与当前不同的风格，避开随机重合
    });
    await A.click(`.cz-chip >> nth=${chipIdx}`);
    const rep1 = await A.evaluate(() => avatarSel.rep);
    if (rep1 === rep0 || rep1 !== await A.evaluate(() => czRep())) throw new Error('style switch not live-followed');
    await A.click('#cz-reroll');
    const rep2 = await A.evaluate(() => avatarSel.rep);
    if (rep2 === rep1) throw new Error('reroll not live-followed');
    log('live-follow：换风格/重掷实时改选中 ✓');

    // 3) 从「我的」选了别的之后回定制拨弄 → 选中不被抢走
    await A.click('#cz-save');           // 先存一张进我的（自动切到我的 tab 并选中）
    const mineSel = await A.evaluate(() => avatarSel.rep);
    await A.click('#avtab-custom');
    await A.click('#cz-reroll');
    const sel3 = await A.evaluate(() => avatarSel.rep);
    if (sel3 !== mineSel) throw new Error('customizer stole selection from mine');
    log('「我的」选中不被定制器拨弄抢走 ✓');

    // 4) 什么都不点直接加入 → 状态里是配方（live-follow 后那张）
    await A.click('#avtab-custom');
    const want = await A.evaluate(() => avatarSel.rep);
    await A.fill('#input-name', '默认定制君');
    await A.click('details.adv summary');
    await A.click('#chk-local');
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    const st = await A.evaluate(() => S.players[0].avatar);
    if (st !== want) throw new Error('state avatar mismatch: ' + st);
    log('直接加入 → 状态头像 =', st.slice(0, 34) + '…', '（~' + st.length + 'B 配方）');

    // 5) 开局 → 3D 牌桌：默认定制头像转化为 3D 脸贴片（材质 canvas 与 resolveAvatar 产物比对）
    const B = await ctx.newPage(); watch(B, 'B');   // 第二人进场才能开局；B 也是默认定制头像（两端随机种子天然不同）
    await B.goto(URL, { waitUntil: 'domcontentloaded' });
    await B.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 });
    await B.fill('#input-name', '同桌的她');
    await B.evaluate(() => { document.querySelector('details.adv summary').click(); document.getElementById('chk-local').click(); });
    await B.fill('#input-room', await A.evaluate(() => S.room));
    await B.click('#btn-join');
    await A.waitForFunction(() => S.players.length >= 2, null, { timeout: 15000 });
    const bRep = await B.evaluate(() => S.players[1].avatar);
    if (!bRep.startsWith('dcb:')) throw new Error('B default rep not dcb: ' + bRep);
    await A.click('#btn-start');
    await A.waitForSelector('#screen-game.active', { timeout: 15000 });
    await A.waitForFunction(() => window.__three && window.__three.chars && window.__three.chars.size >= 1, null, { timeout: 15000 });
    await A.waitForTimeout(1200);   // 纹理 img.onload → canvas 栅格化
    const col = await A.evaluate(() => {
      let white = 0, total = 0;
      for (const [, ch] of window.__three.chars) {
        total++;
        if (ch.userData.face.material.map && ch.userData.face.material.color.getHex() === 0xffffff) white++;   // color×map 相乘：非白=全桌脸被染色
      }
      return { white, total };
    });
    if (col.total < 2 || col.white !== col.total) throw new Error('face material color not white with map: ' + JSON.stringify(col));
    log('3D 脸贴片 color 归白不变量 ✓（' + col.white + '/' + col.total + '）');
    const cmp = await A.evaluate(() => {
      const me = S.players.find(p => p.name === '默认定制君') || S.players[0];
      const ch = window.__three.chars.get(me.id);
      const img = ch && ch.userData.face.material.map && ch.userData.face.material.map.image;
      if (!img || !img.width) return { ok: false, why: 'no face texture image' };
      const want = document.createElement('canvas'); want.width = want.height = 256;
      const g2 = want.getContext('2d');
      const src = new Image();
      const uri = resolveAvatar(me.avatar);
      return new Promise(res => {
        src.onload = () => {
          g2.fillStyle = '#241235'; g2.fillRect(0, 0, 256, 256);
          const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
          if (!iw || !ih) g2.drawImage(src, 0, 0, 256, 256);
          else { const s = Math.min(256 / iw, 256 / ih); g2.drawImage(src, (256 - iw * s) / 2, (256 - ih * s) / 2, iw * s, ih * s); }
          g2.globalCompositeOperation = 'destination-in';
          g2.beginPath(); if (g2.roundRect) g2.roundRect(5, 5, 246, 246, 76); else g2.rect(5, 5, 246, 246); g2.fill();
          const a = img.getContext('2d').getImageData(0, 0, 256, 256).data;
          const b = want.getContext('2d').getImageData(0, 0, 256, 256).data;
          let diff = 0;
          for (let i = 0; i < a.length; i += 40) { if (Math.abs(a[i] - b[i]) > 24 || Math.abs(a[i + 1] - b[i + 1]) > 24) diff++; }
          res({ ok: diff < 400, diff, why: 'pixel diff ' + diff });
        };
        src.onerror = () => res({ ok: false, why: 'resolveAvatar image failed' });
        src.src = uri;
      });
    });
    if (!cmp.ok) throw new Error('3D face texture mismatch: ' + cmp.why);
    log('3D 牌桌脸贴片 = 所选定制头像 ✓（采样差异', cmp.diff, '）');
    await A.screenshot({ path: 'shots/dav-3d-face.png' });

    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    console.log('\n[dav] ALL DEFAULT-AVATAR E2E PASSED ✅');
  } catch (e) {
    try { await A.screenshot({ path: 'shots/dav-fail.png' }); } catch {}
    console.error('[dav] FAILED ❌', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
