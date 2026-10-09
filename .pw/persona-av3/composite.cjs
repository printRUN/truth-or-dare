// composite.cjs — A 组 2D vs 3D 并排对比图生成（复用 A 组端口 9141 静态服务）
// 在 tod.html / bombcat.html 页面里用游戏自己的 resolveAvatar/resolveAv 生成 2D 参照，
// 与仪摄 3D 特写、自然全景/揭晓照拼成一张对比图。不改任何仓库现有文件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 9141;
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
const REL = '.pw/shots/av3-persona';   // 报告用相对路径前缀

const TOD_CAST = [
  { name: '阿泽',   recipe: 'dcb:{"s":"adventurer","d":"Zoe"}',  feat: '深肤+浅蓝长发' },
  { name: '老白',   recipe: 'dcb:{"s":"micah","d":"Felix"}',     feat: '浅肤+秃头+胡茬' },
  { name: '眼镜妹', recipe: 'dcb:{"s":"miniavs","d":"Felix"}',   feat: '黑长发+圆眼镜' },
  { name: '络腮胡', recipe: 'dcb:{"s":"avataaars","d":"Mika"}',  feat: '深肤+红络腮胡' },
  { name: '粉毛',   recipe: 'dcb:{"s":"personas","d":"Jack"}',   feat: '粉短发' },
  { name: '丸奶奶', recipe: 'dcb:{"s":"open-peeps","d":"Mika"}', feat: '灰白丸子头+眼镜' },
];
const BC_CAST = [
  { name: '橘胖',   av: 'bc:18:5',    feat: '橘猫·圆眼' },
  { name: '雪球',   av: 'bc:42:205',  feat: '奶黄·细眼' },
  { name: '抹茶',   av: 'bc:95:79',   feat: '绿猫·圆眼' },
  { name: '薄荷',   av: 'bc:160:341', feat: '青猫·细眼' },
  { name: '蓝精灵', av: 'bc:200:607', feat: '蓝猫·圆眼' },
  { name: '芋泥',   av: 'bc:320:889', feat: '粉猫·圆眼' },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, MIME[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  const build = async (pageUrl, cast, resolverExpr, files, out) => {
    const page = await browser.newPage({ viewport: { width: 1620, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/${pageUrl}`, { waitUntil: 'domcontentloaded' });
    await sleep(1200);
    await page.evaluate(({ cast, resolverExpr, files, REL }) => {
      const uris = cast.map(c => {
        try { return eval(resolverExpr.replace('AV', JSON.stringify(c.av || c.recipe))); } catch (e) { return ''; }
      });
      const headF = (i, k) => `${files.headPrefix}-${i}-${k}.png`;
      let o = document.getElementById('av3comp');
      if (o) o.remove();
      o = document.createElement('div');
      o.id = 'av3comp';
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#101020;padding:14px 18px;overflow:hidden;font-family:sans-serif;';
      const crop = f => `<div style="width:150px;height:150px;overflow:hidden;flex:none;border-radius:12px;background:#222"><img src="${REL}/${f}" style="width:480px;height:300px;margin-left:-165px;margin-top:-75px"></div>`;
      const full = (f, w) => `<img src="${REL}/${f}" style="width:${w}px;border-radius:10px;display:block">`;
      o.innerHTML =
        `<div style="color:#9ef;font:800 20px sans-serif;margin-bottom:8px">${files.title}</div>` +
        `<div style="display:flex;gap:12px;margin-bottom:12px">` +
        `<div>${full(files.wide, 680)}<div style="color:#ccc;font:13px sans-serif;margin-top:4px">自然全景（对局实拍）</div></div>` +
        `<div>${full(files.extra, 680)}<div style="color:#ccc;font:13px sans-serif;margin-top:4px">${files.extraLabel}</div></div>` +
        `</div>` +
        `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">` +
        cast.map((c, i) =>
          `<div style="background:#1a1a30;border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center">` +
          `<div style="text-align:center;flex:none"><img src="${uris[i]}" style="width:130px;height:130px;border-radius:12px;background:#243"><div style="color:#ffd;font:700 12px sans-serif;margin-top:4px">2D 头像</div></div>` +
          `<div style="text-align:center;flex:none">${crop(headF(i, 'front'))}<div style="color:#ffd;font:700 12px sans-serif;margin-top:4px">3D 正面特写</div></div>` +
          `<div style="text-align:center;flex:none">${crop(headF(i, 'oblique'))}<div style="color:#ffd;font:700 12px sans-serif;margin-top:4px">3D 斜 55° 特写</div></div>` +
          `<div style="color:#fff;font:13px sans-serif;line-height:1.5;width:86px;flex:none">${i}. <b>${c.name}</b><br><span style="color:#9ab">${c.feat}</span></div>` +
          `</div>`).join('') +
        `</div>`;
      document.body.appendChild(o);
    }, { cast, resolverExpr, files, REL });
    await sleep(2500);
    await page.screenshot({ path: path.join(SHOTS, out) });
    console.log('composite saved:', out);
    await page.close();
  };

  await build('tod.html', TOD_CAST,
    'resolveAvatar(AV)',
    {
      title: 'tod.html · 2D 头像 → 3D 头像 相似度对照（A 组模拟员，2026-10-08）',
      wide: 'tod-av3-wide.png',
      extra: 'tod-av3-reveal.png',
      extraLabel: '揭晓近景实拍（持麦人自己视角——卡面为主，脸不在画面）',
      headPrefix: 'tod-av3-head',
    },
    'composite-tod.png');

  await build('bombcat.html', BC_CAST,
    'resolveAv(AV)',
    {
      title: 'bombcat.html · 2D 猫头像 → 3D 头像 相似度对照（A 组模拟员，2026-10-08）',
      wide: 'bc-av3-wide.png',
      extra: 'bc-av3-head-4-oblique.png',
      extraLabel: '斜 55° 特写放大示例（蓝精灵）：贴纸感/颜色走样最直观',
      headPrefix: 'bc-av3-head',
    },
    'composite-bombcat.png');

  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
