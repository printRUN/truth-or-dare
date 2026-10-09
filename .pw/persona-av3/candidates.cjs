// candidates.cjs — 2D 头像候选 contact sheet（report-B 选型用，端口 9143）
// 只读仓库文件 + 写 .pw/shots/av3-persona/，不改任何现有文件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9143;
const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

const STYLES = ['avataaars', 'open-peeps', 'micah', 'personas', 'adventurer', 'big-smile', 'lorelei', 'dylan', 'notionists', 'miniavs'];
const SEEDS = Array.from({ length: 12 }, (_, i) => 'b' + String(i + 1).padStart(2, '0'));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)));
  for (const st of STYLES) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222"><div id="g"></div>
<script src="http://127.0.0.1:${PORT}/dicebear-local.js"></script>`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.DiceBearLocal !== 'undefined', null, { timeout: 10000 });
    await page.evaluate((arg) => {
      const { st, seeds } = arg;
      const g = document.getElementById('g');
      const svgUri = svg => 'data:image/svg+xml,' + svg.replace(/%/g, '%25').replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/&/g, '%26').replace(/\s+/g, ' ');
      for (const sd of seeds) {
        const box = document.createElement('div');
        box.style.cssText = 'display:inline-block;margin:4px;text-align:center;font:10px monospace;color:#fff';
        let uri = '';
        try { uri = svgUri(DiceBearLocal.diceAvatar(st, { seed: sd }).toString()); } catch (e) { uri = ''; }
        const img = document.createElement('img');
        img.width = 128; img.height = 128;
        if (uri) img.src = uri; else { img.style.background = '#900'; }
        box.appendChild(img);
        const cap = document.createElement('div'); cap.textContent = sd; box.appendChild(cap);
        g.appendChild(box);
      }
    }, { st, seeds: SEEDS });
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
    await page.screenshot({ path: path.join(SHOTS, `sheet-${st}.png`), fullPage: true });
    console.log('sheet-' + st + '.png done');
  }
  await browser.close();
  server.close();
  console.log('ALL DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
