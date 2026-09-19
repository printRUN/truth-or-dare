// E2E: av: 短索引协议体检（2026-09-18 预设 UI 退役后保留下来的兼容面）——
//      遗留 av:P## 仍能本地展开成 svg data-URI、avKeyOf 回映射、DiceBear 本地生成零外网请求
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');

(async () => {
  const url = 'file:///' + path.resolve(__dirname, '..', 'index.html?game=tod').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const ext = [];
  page.on('pageerror', e => errs.push(String(e)));
  // 头像生成必须零外网（DiceBear 官方 API 严禁触碰）；字体是历史既有依赖（离线自动降级系统字体），单独归类
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) ext.push(u.slice(0, 80)); });
  await page.goto(url);
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});

  const res = await page.evaluate(() => {
    ensureAvMaps();
    const uri15 = resolveAvatar('av:P15');   // 预设时代的「问心」（shapes 假面）
    const back = uri15 ? avKeyOf(uri15) : '';
    const presetCount = AVATAR_PRESETS.length;
    const stCounts = AVATAR_PRESETS.reduce((m, x) => (m[x.st] = (m[x.st] || 0) + 1, m), {});
    return {
      presetCount, pixel: stCounts['pixel-art'], shapes: stCounts.shapes,
      uriOk: uri15.startsWith('data:image/svg+xml,') && uri15.length > 800,
      uriLen: uri15.length, roundtrip: back,
      dcbWorks: resolveAvatar(makeRecipe('adventurer', 'zz1234', 'f7eeda')).startsWith('data:image/svg+xml,'),
    };
  });
  console.log(JSON.stringify(res));
  if (res.presetCount !== 24 || res.pixel !== 14 || res.shapes !== 10) console.log('FAIL 预设表配比', res);
  else if (!res.uriOk) console.log('FAIL av:P15 未展开成本地 svg', res.uriLen);
  else if (res.roundtrip !== 'av:P15') console.log('FAIL avKeyOf 回映射失败 →', res.roundtrip);
  else if (!res.dcbWorks) console.log('FAIL dcb: 配方展开失败');
  else console.log('OK av: 遗留协议 + dcb: 配方全部本地展开（av:P15 → ' + res.uriLen + 'B）');
  console.log(ext.length ? 'WARN 外网请求: ' + ext.join(' | ') : 'OK 零外网请求（file:// 离线）');
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no pageerror');
  await browser.close();
})();
