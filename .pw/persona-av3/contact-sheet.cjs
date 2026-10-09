// contact-sheet.cjs — A 组选角 contact sheet：DiceBear 本地风格 × 种子网格截图，挑 6 个特征鲜明的 2D 头像
// 只新建本脚本与截图，不改任何现有文件。端口 9141（A 组专用）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 9141;
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, MIME[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1160 } });
  await page.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
  const styles = ['adventurer', 'avataaars', 'micah', 'personas', 'lorelei', 'open-peeps', 'miniavs', 'big-smile', 'dylan', 'notionists', 'pixel-art', 'toon-head'];
  const seeds = ['Felix', 'Aneka', 'Jack', 'Sarah', 'Kai', 'Nova', 'Remy', 'Mika', 'Zoe', 'Bao'];
  await page.evaluate(({ styles, seeds }) => {
    const wrap = document.createElement('div');
    wrap.id = 'sheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;padding:8px;overflow:hidden;';
    let html = '';
    for (const st of styles) {
      html += `<div style="color:#0f0;font:700 13px monospace;margin:6px 0 2px">${st}</div><div style="display:flex;gap:4px">`;
      for (const sd of seeds) {
        html += `<div style="width:126px;text-align:center"><img data-st="${st}" data-sd="${sd}" style="width:104px;height:104px;border-radius:10px;background:#243"><div style="color:#ccc;font:10px monospace">${st.slice(0,6)}:${sd}</div></div>`;
      }
      html += '</div>';
    }
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    const svgs = {};
    wrap.querySelectorAll('img').forEach(img => {
      try {
        const svg = DiceBearLocal.diceAvatar(img.dataset.st, { seed: img.dataset.sd }).toString();
        img.src = 'data:image/svg+xml,' + svg.replace(/%/g, '%25').replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/&/g, '%26').replace(/\s+/g, ' ');
        svgs[img.dataset.st + ':' + img.dataset.sd] = true;
      } catch (e) { svgs[img.dataset.st + ':' + img.dataset.sd] = String(e).slice(0, 40); }
    });
    window.__svgs = svgs;
  }, { styles, seeds });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOTS, 'sheet-1.png') });
  console.log('sheet-1 done');
  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
