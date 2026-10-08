// ev-quit-buttons.cjs — 返回游戏中心按钮取证：4 游戏 × 2 视口 × 各界面截图 + 按钮矩形检测（端口 9071）
// 检测口径：document 内文本含「游戏中心」或 title/id 语义的按钮元素，getBoundingClientRect 判定
// 可见（尺寸>0）且在视口内（0 ≤ x/y，右/下缘 ≤ 视口）——越界=被裁剪。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9071;
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCAN = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  document.querySelectorAll('button, a').forEach(el => {
    const t = (el.textContent || '').trim();
    const ti = el.title || '';
    if (!(t.includes('游戏中心') || t.includes('中心') || ti.includes('游戏中心') || /btn-quit|btn-home|arcade-back|lnk-arcade|res-home|btn-home-lobby|btn-home-result/.test(el.id || ''))) return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const clipped = r.width < 4 || r.height < 4 || r.left < -2 || r.top < -2 || r.right > vw + 2 || r.bottom > vh + 2;
    out.push({ id: el.id || t.slice(0, 10), text: t.slice(0, 14), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), clipped, inView: r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw });
  });
  return { vw, vh, btns: out };
})()`;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const report = [];
  const shot = async (name, page) => { await page.screenshot({ path: path.join(SHOTS, name) }); };

  async function visit(file, qs, vp, tag, setup) {
    const ctx = await browser.newContext({ viewport: vp });
    const pg = await ctx.newPage();
    try {
      await pg.goto(`http://127.0.0.1:${PORT}/${file}${qs}`, { waitUntil: 'domcontentloaded' });
      await sleep(setup.wait);
      if (setup.act) { try { await setup.act(pg); } catch (e) { report.push(`${tag}: setup error ${e.message.slice(0, 60)}`); } }
      const scan = await pg.evaluate(SCAN);
      await shot(`quit-${tag}.png`, pg);
      report.push(`${tag} ${vp.width}x${vp.height}: ` + JSON.stringify(scan.btns.length ? scan.btns : 'NO-BUTTON'));
    } catch (e) {
      report.push(`${tag}: FATAL ${e.message.slice(0, 80)}`);
    }
    await ctx.close();
  }

  const V = { p: { width: 390, height: 844 }, l: { width: 740, height: 360 } };

  // monopoly：setup 屏 / 对局屏（autotest 自动开局）
  for (const [k, vp] of Object.entries(V)) {
    await visit('monopoly.html', '?autotest=1', vp, `mono-setup-${k}`, { wait: 2500, act: null });
    await visit('monopoly.html', '?autotest=1', vp, `mono-game-${k}`, { wait: 5000, act: null });
  }
  // uno：setup 屏 / 对局屏
  for (const [k, vp] of Object.entries(V)) {
    await visit('uno.html', '?autotest=1', vp, `uno-setup-${k}`, { wait: 2500, act: null });
    await visit('uno.html', '?autotest=1', vp, `uno-game-${k}`, { wait: 5500, act: null });
  }
  // tod：join 屏（arcade-nav 类=从游戏中心来）/ 大厅 / 对局
  for (const [k, vp] of Object.entries(V)) {
    await visit('tod.html', '', vp, `tod-join-${k}`, { wait: 3500, act: async pg => { await pg.evaluate(() => document.body.classList.add('arcade-nav')); await sleep(400); } });
  }
  // bombcat：加入屏 / 对局
  for (const [k, vp] of Object.entries(V)) {
    await visit('bombcat.html', '', vp, `bc-join-${k}`, { wait: 3000, act: null });
    await visit('bombcat.html', '?autotest=1&local=1', vp, `bc-game-${k}`, { wait: 5000, act: null });
  }

  console.log(report.join('\n'));
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
