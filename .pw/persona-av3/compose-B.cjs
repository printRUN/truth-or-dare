// compose-B.cjs — 2D 头像 vs 3D 头并排合成图（report-B 证据，端口 9143）
// 输入：mono-meta.json / uno-meta.json + .pw/shots/av3-persona/ 下的原始截图
// 输出：b-sbs-mono-<i>.png / b-sbs-uno-<seat>.png（左=2D 头像原图，右=3D 头近景裁切）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9143;
const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const HERE = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mono = JSON.parse(fs.readFileSync(path.join(HERE, 'mono-meta.json'), 'utf8'));
  const uno = JSON.parse(fs.readFileSync(path.join(HERE, 'uno-meta.json'), 'utf8'));
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(`http://127.0.0.1:${PORT}/dicebear-local.js`, { waitUntil: 'domcontentloaded' });   // 同源页面：canvas 不被污染

  const compose = async job => {
    const dataUrl = await page.evaluate(async job => {
      const cv = document.createElement('canvas');
      cv.width = job.w; cv.height = job.h;
      const c = cv.getContext('2d');
      c.fillStyle = '#141225'; c.fillRect(0, 0, job.w, job.h);
      const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img fail ' + src.slice(0, 40))); im.src = src; });
      // 左：2D 头像
      const av = await load(job.avUri);
      c.fillStyle = '#1d1836'; c.fillRect(20, 20, 340, 460);
      c.drawImage(av, 40, 40, 300, 300);
      c.fillStyle = '#fff'; c.font = '20px sans-serif';
      c.fillText(job.title, 40, 380);
      c.fillStyle = '#9ca3af'; c.font = '14px sans-serif';
      c.fillText(job.sub1, 40, 406);
      c.fillText(job.sub2, 40, 426);
      c.fillText('↑ 玩家在表单选的 2D 头像', 40, 456);
      // 右：3D 截图裁切
      const shot = await load(job.shotUri);
      c.fillStyle = '#1d1836'; c.fillRect(380, 20, 500, 460);
      c.drawImage(shot, job.crop.x, job.crop.y, job.crop.w, job.crop.h, 400, 40, 460, 423);
      c.fillStyle = '#fff'; c.font = '15px sans-serif';
      c.fillText('↑ 牌桌 3D 头（近景裁切，原始截图 ' + job.shotFile + '）', 400, 490);
      const out = cv.toDataURL('image/png');
      return out;
    }, job);
    fs.writeFileSync(path.join(SHOTS, job.out), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', job.out);
  };

  for (const p of mono.players) {
    const cx = Math.round(p.screen.x), cy = Math.round(p.screen.y) - 10;
    await compose({
      w: 900, h: 500,
      avUri: p.uri,
      title: `monopoly · ${p.name}（${p.style}/${p.seed}）`,
      sub1: `2D 特征：${p.tag}`,
      sub2: `3D faces().hair = ${p.face && p.face.hair}${p.face && p.face.fb ? ' (fb)' : ''}` +
        `（回采样诊断：本地 dicebear SVG drawImage 全透明 → 空采样 → NaN → #000000）`,
      shotUri: `http://127.0.0.1:${PORT}/.pw/shots/av3-persona/${p.shot}`,
      shotFile: p.shot,
      crop: { x: Math.max(0, cx - 180), y: Math.max(0, cy - 230), w: 360, h: 420 },
      out: `b-sbs-mono-${p.i}.png`,
    });
  }
  for (const p of uno.players) {
    const cx = Math.round(p.screen.x), cy = Math.round(p.screen.y) - 10;
    await compose({
      w: 900, h: 500,
      avUri: p.uri,
      title: `uno · ${p.name}（${p.style}/${p.seed}）`,
      sub1: `2D 特征：${p.tag}`,
      sub2: `3D avatars().hair = ${p.hair}（发色提取 NaN → 全员 #000000）`,
      shotUri: `http://127.0.0.1:${PORT}/.pw/shots/av3-persona/${p.shot}`,
      shotFile: p.shot,
      crop: { x: Math.max(0, cx - 200), y: Math.max(0, cy - 240), w: 400, h: 450 },
      out: `b-sbs-uno-${p.seat}.png`,
    });
  }
  await browser.close();
  server.close();
  console.log('COMPOSE DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
