// E2E: DiceBear 默认头像体检 —— 选择器 24 预设、shapes 假面格、av:P## 短索引、本地生成零外网请求
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');

(async () => {
  const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const ext = [];
  page.on('pageerror', e => errs.push(String(e)));
  // 头像生成必须零外网（DiceBear 官方 API 严禁触碰）；字体是历史既有依赖（离线自动降级系统字体），单独归类
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) ext.push(u.slice(0, 80)); });
  await page.goto(url);

  await page.waitForFunction(() => document.querySelectorAll('.avatar-option').length >= 25, null, { timeout: 8000 });
  const tiles = await page.locator('.avatar-option').count();
  console.log('tiles =', tiles);

  // 每张预设 tile 都真长出了像素/图形（img src 为本地生成的 svg data-URI）
  const tileCheck = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#avatar-selector .avatar-option img')];
    return imgs.slice(0, 24).map(i => i.src.startsWith('data:image/svg+xml,')).every(Boolean);
  });
  console.log(tileCheck ? 'OK 24 张预设全部本地生成' : 'FAIL 有预设格没图');

  // 点「问心」（第 15 格 = shapes 假面），校验名字读数
  await page.click('.avatar-option[data-name="问心"]');
  console.log('avatar-name =', await page.textContent('#avatar-name'));

  // 本地模式加入
  await page.click('details.adv summary');
  await page.check('#chk-local');
  await page.fill('#input-name', '假面测试');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 9000 });

  const res = await page.evaluate(() => {
    const p = S.players[0];
    const kinds = AVATAR_PRESETS.reduce((m, x) => (m[x.st] = (m[x.st] || 0) + 1, m), {});
    const img = document.querySelector('#players-grid .player-card .avatar-inner img');
    return {
      avatar: p && p.avatar, name: p && p.name,
      pixel: kinds['pixel-art'], shapes: kinds.shapes, total: AVATAR_PRESETS.length,
      imgOk: !!img && img.src.startsWith('data:image/svg+xml,') && img.getBoundingClientRect().width > 10,
      uriLen: resolveAvatar(p.avatar).length,
    };
  });
  console.log(JSON.stringify(res));
  if (res.avatar !== 'av:P15') console.log('FAIL 问心应为 av:P15，实际', res.avatar);
  else if (res.pixel !== 14 || res.shapes !== 10 || res.total !== 24) console.log('FAIL 预设配比', res);
  else if (!res.imgOk) console.log('FAIL 大厅头像 img 未渲染');
  else if (res.uriLen < 800) console.log('FAIL 展开的 data-URI 过短', res.uriLen);
  else console.log('OK av:P## 短索引 + 渲染端展开（' + res.uriLen + 'B）');
  console.log(ext.length ? 'WARN 外网请求: ' + ext.join(' | ') : 'OK 零外网请求（file:// 离线）');
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no pageerror');
  await browser.close();
})();
