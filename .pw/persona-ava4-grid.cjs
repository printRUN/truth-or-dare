// persona-ava4-grid.cjs — 4 风格候选 seed 网格渲染（挑 4 张发型差异最大的 2D 头像，端口 9161）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9161;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const ct = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }[path.extname(p)] || 'application/octet-stream';
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': ct }); res.end(d); } });
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  await page.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&q=grid`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof P !== 'undefined' && P && P.avatarUri, null, { timeout: 15000 });
  const CAND = {
    
    
    
    
    adventurer: ['Maria'],
    avataaars: ['Mason'],
    'big-smile': ['Liam'],
    personas: ['Jill'],
  };
  const html = await page.evaluate(CAND => {
    let h = '<body style="margin:0;background:#fff;font:12px sans-serif"><table cellpadding="2" cellspacing="0">';
    for (const [st, seeds] of Object.entries(CAND)) {
      h += `<tr><td valign="top" style="font-weight:700;padding:4px">${st}</td>`;
      for (const sd of seeds) {
        const uri = P.avatarUri('dcb:' + JSON.stringify({ s: st, d: sd, b: 'e3ece7' }));
        h += `<td align="center"><img src="${uri}" width="140" height="140" style="display:block"><b>${sd}</b></td>`;
      }
      h += '</tr>';
    }
    return h + '</table></body>';
  }, CAND);
  await page.setContent(html);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'persona-ava4-2d-grid.png'), fullPage: true });
  console.log('grid shot done');
  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
