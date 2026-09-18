// 基线取证：改版前的加入页默认头像行为（预设 tab 选中 / avatarSel=av:P01）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8872;
function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, d) => { if (err) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
    });
    s.listen(PORT, () => res(s));
  });
}
(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 });
  const snap = await p.evaluate(() => ({
    tabSel: document.querySelector('.av-tab.sel') && document.querySelector('.av-tab.sel').id,
    sel: { rep: avatarSel.rep, tab: avatarSel.tab },
    presetTiles: document.querySelectorAll('#avatar-selector .avatar-option').length,
    panelPresetHidden: document.getElementById('av-panel-preset').hidden,
    panelCustomHidden: document.getElementById('av-panel-custom').hidden,
  }));
  console.log('[baseline]', JSON.stringify(snap));
  await p.locator('#grp-avatar').screenshot({ path: 'shots/base-join-avatar-before.png' });
  await browser.close(); server.close();
})().catch(e => { console.error('fatal:', e); process.exit(1); });
