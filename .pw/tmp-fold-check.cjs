// 一次性取证：模拟 design-default-avatar.md 落地后，390x844 加入页首屏几何
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8899;
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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  for (const [tag, vw, vh] of [['mobile-390', 390, 844], ['mobile-390-short', 390, 664]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#screen-join.active', { timeout: 20000 });
    await p.evaluate(() => { try { closeGuide(); } catch {} });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 8000 }).catch(() => {});
    await sleep(400);
    await p.fill('#input-name', '阿凯');

    const measure = () => p.evaluate(() => {
      const r = id => { const e = document.querySelector(id); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
      return {
        vh: innerHeight,
        btnJoin: r('#btn-join'),
        grpAvatar: r('#grp-avatar'),
        panelPreset: r('#av-panel-preset'),
        panelCustom: r('#av-panel-custom'),
        docH: document.documentElement.scrollHeight,
        ctaInFold: r('#btn-join') ? r('#btn-join').bottom <= innerHeight : null,
      };
    });

    const before = await measure();
    // 模拟设计落地：删预设标签+面板，定制 tab 默认选中展开
    await p.evaluate(() => {
      document.querySelector('#avtab-preset').remove();
      document.querySelector('#av-panel-preset').remove();
      const ct = document.querySelector('#avtab-custom');
      ct.classList.add('sel'); ct.setAttribute('aria-selected', 'true');
      document.querySelector('#av-panel-custom').hidden = false;
      document.querySelector('#grp-avatar label').textContent = '选个头像（🎨 全 31 风格定制 / 我的，下次访问还在）';
    });
    await sleep(300);
    const after = await measure();
    console.log(`[${tag}] vh=${before.vh}`);
    console.log('  before:', JSON.stringify(before));
    console.log('  after :', JSON.stringify(after));
    await p.screenshot({ path: `${ROOT}/.pw/shots/tmp-fold-${tag}-after.png`, fullPage: false });
    await ctx.close();
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
