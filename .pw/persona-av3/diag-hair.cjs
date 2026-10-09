// diag-hair.cjs — 复刻 monopoly/uno hairFromImage 管线，诊断 4+2 头像的发色提取结果（端口 9143）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9143;
const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});

const AVS = [
  { tag: 'AV1 阿凯 micah b10', style: 'micah', seed: 'b10', bg: 'fde68a' },
  { tag: 'AV2 老周 miniavs b11', style: 'miniavs', seed: 'b11', bg: 'ddd6fe' },
  { tag: 'AV3 小丸 adventurer b11', style: 'adventurer', seed: 'b11', bg: 'bbf7d0' },
  { tag: 'AV4 蓝仔 dylan b10', style: 'dylan', seed: 'b10', bg: 'bfdbfe' },
  { tag: 'AV5 粉毛 avataaars b07', style: 'avataaars', seed: 'b07', bg: 'fbcfe8' },
  { tag: 'AV6 光头 avataaars b05', style: 'avataaars', seed: 'b05', bg: 'fed7aa' },
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<meta charset="utf-8"><script src="http://127.0.0.1:${PORT}/dicebear-local.js"></script>`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.DiceBearLocal !== 'undefined', null, { timeout: 10000 });
  const out = [];
  for (const av of AVS) {
    const r = await page.evaluate(av => {
      const svgUri = svg => 'data:image/svg+xml,' + svg.replace(/%/g, '%25').replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/&/g, '%26').replace(/\s+/g, ' ');
      const opts = { seed: av.seed };
      if (av.bg) opts.backgroundColor = [av.bg];
      const uri = svgUri(DiceBearLocal.diceAvatar(av.style, opts).toString());
      return new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const cv = document.createElement('canvas'); cv.width = cv.height = 16;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            const d = ctx.getImageData(0, 0, 16, 16).data;
            const at = (x, y) => { const i = (y * 16 + x) * 4; return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255]; };
            let br = 0, bg = 0, bb = 0, bn = 0;
            [[0, 0], [15, 0], [0, 15], [15, 15]].forEach(([x, y]) => { const p = at(x, y); if (p[3] < 128) return; br += p[0]; bg += p[1]; bb += p[2]; bn++; });
            const bgc = bn ? [br / bn, bg / bn, bb / bn] : null;
            const dist = p => bgc ? Math.hypot(p[0] - bgc[0], p[1] - bgc[1], p[2] - bgc[2]) : 1;
            const scan = (y0, y1) => { const o = []; for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) { const p = at(x, y); if (p[3] < 128 || dist(p) < 0.15) continue; o.push([p[0], p[1], p[2], (p[0] + p[1] + p[2]) / 3]); } return o; };
            let px = scan(0, 8); if (px.length < 8) px = scan(0, 16);
            const nat = img.naturalWidth + 'x' + img.naturalHeight;
            if (!px.length) { res({ tag: av.tag, nat, pxTop: 0, pxAll: 0, hair: '#000000(NaN,空采样)', bgc: bgc && bgc.map(v => v.toFixed(2)).join(',') }); return; }
            px.sort((a, b) => a[3] - b[3]);
            const take = px.slice(0, Math.max(3, Math.floor(px.length * 0.45)));
            let r2 = 0, g = 0, b2 = 0;
            take.forEach(p2 => { r2 += p2[0]; g += p2[1]; b2 += p2[2]; });
            res({ tag: av.tag, nat, pxTop: scan(0, 8).length, pxAll: px.length, bgc: bgc && bgc.map(v => v.toFixed(2)).join(','), rawAvg: [r2 / take.length, g / take.length, b2 / take.length].map(v => v.toFixed(3)).join(',') });
          } catch (e) { res({ tag: av.tag, err: e.message }); }
        };
        img.onerror = () => res({ tag: av.tag, err: 'img onerror' });
        img.src = uri;
      });
    }, av);
    console.log(JSON.stringify(r));
    out.push(r);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
