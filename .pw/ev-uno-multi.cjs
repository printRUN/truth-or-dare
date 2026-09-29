/* ev-uno-multi.cjs —— 多端 3D 手牌取证/验收探针(端口 8963,2026-09-24 去 2D 浮轮):
   手机 375×667 / 平板 768×1024 / PC 1100×800 / PC-L 1920×1080
   各视口下:10 张手牌扇形的每张屏幕宽度(cardScreenPos 相邻差)与整扇宽度,判定触达可用性。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8963;
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, f === '/' ? 'uno.html' : f);
  try {
    const data = fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
const CARD_PAIRS = [['r', '3'], ['b', '9'], ['g', 'S'], ['y', 'R'], ['r', 'D2'], ['w', 'W'], ['g', '6'], ['b', '2'], ['y', '8'], ['r', '7']];
(async () => {
  await new Promise(r => server.listen(PORT, r));
  fs.mkdirSync(path.join(ROOT, '.pw', 'shots'), { recursive: true });
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  for (const [tag, vp] of [['phone', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }], ['pc', { width: 1100, height: 800 }], ['pcl', { width: 1920, height: 1080 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log(`  [${tag} pageerror]`, e.message.slice(0, 100)));
    await p.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__uno && window.__uno.state.phase === 'AWAIT_ACTION', null, { timeout: 25000 });
    await p.bringToFront();
    await p.evaluate(cs => {
      window.__uno.forceHand(0, cs);
      window.__uno.state.cur = 'b';
      window.__uno.state.discard = [{ c: 'b', v: '5' }];
    }, CARD_PAIRS.map(([c, v]) => ({ c, v })));
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const ps = [];
      for (let k = 0; k < 10; k++) {
        const q = window.__uno.cardScreenPos(k);
        ps.push(q ? { x: Math.round(q.x), y: Math.round(q.y) } : null);
      }
      return ps;
    });
    const widths = [];
    for (let k = 0; k + 1 < m.length; k++) {
      if (m[k] && m[k + 1]) widths.push(Math.abs(m[k + 1].x - m[k].x));
    }
    const minW = Math.min(...widths), maxW = Math.max(...widths);
    const okFlag = m.every(Boolean);
    console.log(`  [${tag} ${vp.width}×${vp.height}] 邻牌中心距 ${minW}~${maxW}px(即每张露出条宽) 扇宽 ${m[m.length - 1].x - m[0].x}px`);
    await p.screenshot({ path: path.join(ROOT, '.pw', 'shots', `ev-multi-${tag}.png`) });
    console.log(`  📷 ev-multi-${tag}.png`);
    await ctx.close();
  }
  await browser.close(); server.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
