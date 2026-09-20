// probe-avatar-picker.cjs — party-net 头像定制器组件化（v1.1）验收探针，端口 8933
// 覆盖 .pw/design-plan-avatar-component.md v2 终稿 + persona 验收清单：
//   表单默认落「🎨 定制」/ 31 chip 本机生成（data:svg）/ 所见即所得（风格/底色/🎲）/ 保存「我的」/ 刷新回填 /
//   删除两连点 + 删正用回落 / 遗留 av: 条目只读（无删除角标）/ 上传 / 入房 av=dcb + 大厅 data:svg /
//   机器人配方 / 390×844 默认折叠 + 首屏 / 1280×800 常开 + 首屏 / uno 同构。
// 用法: node probe-avatar-picker.cjs   （在 .pw/ 下跑）
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(PW);

const PORT = 8933;
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✅ ' + msg); } else { failed++; console.log('  ❌ ' + msg); } };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/html' });
    res.end(buf);
  });
});

// 1×1 红 PNG（上传用）
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const errors = [];

  // ═══ A. monopoly 表单交互（1280×800，全新 context = 全新 localStorage） ═══
  console.log('\n[A] monopoly 定制器交互');
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p1 = await ctxA.newPage();
  p1.on('pageerror', e => errors.push('mono-form:' + e.message));
  await p1.goto(`http://127.0.0.1:${PORT}/monopoly.html`, { waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });

  const t1 = await p1.evaluate(() => ({
    chips: document.querySelectorAll('.pn-cz-chip').length,
    bgs: document.querySelectorAll('.pn-cz-bg').length,
    tabs: document.querySelectorAll('.pn-avtab').length,
    customSel: document.querySelector('.pn-avtab-custom').getAttribute('aria-selected'),
    mineHidden: document.querySelector('.pn-avpanel-mine').hidden,
    legacyGrid: document.querySelectorAll('.pn-avgrid,.pn-av').length,
    chipLocal: document.querySelector('.pn-cz-chip img').src.startsWith('data:image/svg'),
    avname: document.querySelector('.pn-avname').textContent,
    rep: localStorage.getItem('mono:avatar') || '',
    emptyVisible: !document.querySelector('.pn-mine-empty').hidden,
  }));
  ok(t1.chips === 31 && t1.bgs === 9, `31 chip + 9 底色（${t1.chips}/${t1.bgs}）`);
  ok(t1.tabs === 2 && t1.customSel === 'true' && t1.mineHidden, '两标签，默认落「🎨 定制」');
  ok(t1.legacyGrid === 0, '旧 24 预设格已移除');
  ok(t1.chipLocal, 'chip 首图为本机生成（data:image/svg）');
  ok(t1.avname.startsWith('定制 · ') && t1.rep.startsWith('dcb:'), `开箱即用随机定制（"${t1.avname}" / rep=dcb:）`);
  const abs = ['identicon', 'icons', 'rings', 'glass', 'initials', 'shapes'];
  const bootStyle = JSON.parse(t1.rep.slice(4)).s;
  ok(!abs.includes(bootStyle), `随机风格不在抽象池（s=${bootStyle}）`);
  await p1.screenshot({ path: path.join(ROOT, '.pw/shots/pav-mono-form-1280.png') });

  // 所见即所得：拨风格
  const src0 = await p1.evaluate(() => document.querySelector('.pn-cz-img').src);
  await p1.click('.pn-cz-chip >> nth=0');   // 冒险者
  const t2 = await p1.evaluate(() => ({
    avname: document.querySelector('.pn-avname').textContent,
    sel: document.querySelector('.pn-cz-chip').classList.contains('sel'),
    src: document.querySelector('.pn-cz-img').src,
    rep: localStorage.getItem('mono:avatar') || '',
  }));
  ok(t2.avname === '定制 · 冒险者' && t2.sel, `拨风格即采用（"${t2.avname}"，chip 选中）`);
  ok(t2.src !== src0 && JSON.parse(t2.rep.slice(4)).s === 'adventurer', '预览与 rep 实时换到冒险者');

  // 拨底色
  const src1 = t2.src;
  await p1.click('.pn-cz-bg >> nth=2');
  const t3 = await p1.evaluate(() => ({
    src: document.querySelector('.pn-cz-img').src,
    chips: document.querySelectorAll('.pn-cz-chip').length,
    repBg: (JSON.parse((localStorage.getItem('mono:avatar') || 'dcb:{}').slice(4)).b) || '',
  }));
  ok(t3.src !== src1 && t3.chips === 31 && t3.repBg !== '', '拨底色即采用，chip 不丢');

  // 🎲：点过风格 chip 后只换脸不换风格
  const repBeforeRoll = await p1.evaluate(() => localStorage.getItem('mono:avatar'));
  await p1.click('.pn-cz-reroll');
  const t4 = await p1.evaluate(() => {
    const r = JSON.parse((localStorage.getItem('mono:avatar') || 'dcb:{}').slice(4));
    return { style: r.s, seed: r.d, src: document.querySelector('.pn-cz-img').src };
  });
  const rb = JSON.parse(repBeforeRoll.slice(4));
  ok(t4.style === rb.s && t4.seed !== rb.d, `🎲 只换脸不换风格（s=${t4.style} 保持，seed 变更）`);
  ok(t4.src !== t3.src, '🎲 后预览立即更新');

  // 💾 保存到我的
  await p1.click('.pn-cz-save');
  const t5 = await p1.evaluate(() => ({
    count: document.querySelector('.pn-mine-count').textContent,
    emptyHidden: document.querySelector('.pn-mine-empty').hidden,
    tiles: document.querySelectorAll('.pn-mine-selector .pn-mine-wrap').length,
    store: JSON.parse(localStorage.getItem('tod:avatars:v1') || '{"mine":[]}').mine.length,
    customOn: document.querySelector('.pn-avpanel-custom').hidden === false,
    rep: localStorage.getItem('mono:avatar') || '',
    firstStore: (JSON.parse(localStorage.getItem('tod:avatars:v1') || '{"mine":[]}').mine || [])[0] || '',
  }));
  ok(t5.count.trim() === '1', `「我的」计数徽标（"${t5.count}"）`);
  ok(t5.emptyHidden && t5.tiles === 1 && t5.store === 1, `空态收敛 + 格子 + 存储（hidden=${t5.emptyHidden} tiles=${t5.tiles} store=${t5.store}）`);
  ok(t5.customOn && t5.rep === t5.firstStore, '保存入库且留在定制页继续拨（存库≠切页）');
  await p1.screenshot({ path: path.join(ROOT, '.pw/shots/pav-mono-mine-1280.png') });

  // 拨了即用（v1.2）：零确认控件——「✓ 就用它」已删、「预览中」待确认态已删、预览格不可点
  const tNc = await p1.evaluate(() => ({
    useBtn: !!document.querySelector('.pn-cz-use'),
    pending: !!document.querySelector('.pn-cz-preview.pending'),
    previewTag: document.querySelector('.pn-cz-preview').tagName,
  }));
  ok(!tNc.useBtn && !tNc.pending && tNc.previewTag === 'DIV', '零确认控件（无「就用它」/无「预览中」/预览纯展示）');

  // 回到定制页再存一张（🎲 后再 💾）
  await p1.click('.pn-avtab-custom');
  await p1.click('.pn-cz-reroll');
  await p1.click('.pn-cz-save');
  const store2 = await p1.evaluate(() => JSON.parse(localStorage.getItem('tod:avatars:v1')).mine.length);
  ok(store2 === 2, '第二张入库（共 2 张）');

  // 刷新回填：rep 不变、定制器被回填、styleTouched 语义
  const repBefore = await p1.evaluate(() => localStorage.getItem('mono:avatar'));
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  const t6 = await p1.evaluate(() => ({
    rep: localStorage.getItem('mono:avatar'),
    avname: document.querySelector('.pn-avname').textContent,
    selStyle: (document.querySelector('.pn-cz-chip.sel') || {}).title || '',
    customSel: document.querySelector('.pn-avtab-custom').getAttribute('aria-selected'),
    count: document.querySelector('.pn-mine-count').textContent,
  }));
  ok(t6.rep === repBefore, '刷新后 rep 不变（下次还在）');
  ok(t6.avname === '定制头像' && t6.customSel === 'true', '刷新后仍选该配方（落在定制 tab）');
  ok(t6.selStyle === JSON.parse(repBefore.slice(4)).s, `定制器 chip 回填到原风格（sel=${t6.selStyle}）`);
  ok(t6.count.includes('2'), '「我的」计数跨刷新保持（2）');

  // 删除流程：先删不在用的一张 → 再删正用的一张（回落定制 + rep 重写）
  await p1.click('.pn-avtab-mine');
  ok(await p1.$$eval('.pn-mine-wrap .pn-avdel', els => els.length) === 2, '两张自存头像都有删除角标');
  await p1.click('.pn-mine-wrap:nth-of-type(2) .pn-avdel');   // 首点 ⚠（nth-of-type 对应第 2 张=更晚存的）
  const armed = await p1.evaluate(() => document.querySelectorAll('.pn-mine-wrap')[1].querySelector('.pn-avdel').classList.contains('armed'));
  ok(armed, '删除首点染红（两连点确认）');
  await p1.click('.pn-mine-wrap:nth-of-type(2) .pn-avdel');   // 再点真删（renderMine 已重建 DOM，重查选择器）
  const t7a = await p1.evaluate(() => JSON.parse(localStorage.getItem('tod:avatars:v1')).mine.length);
  ok(t7a === 1, '两连点后真删（剩 1）');
  await p1.click('.pn-mine-wrap:nth-of-type(1) .pn-avdel');
  await p1.click('.pn-mine-wrap:nth-of-type(1) .pn-avdel');   // 删正用着的（=选中那张，删后回落定制）
  const t7b = await p1.evaluate(() => ({
    store: JSON.parse(localStorage.getItem('tod:avatars:v1')).mine.length,
    rep: localStorage.getItem('mono:avatar') || '',
    avname: document.querySelector('.pn-avname').textContent,
    customOn: document.querySelector('.pn-avpanel-custom').hidden === false,
  }));
  ok(t7b.store === 0 && t7b.rep.startsWith('dcb:') && t7b.rep !== repBefore, '删正用头像 → 回落新随机定制且 rep 重写');
  ok(t7b.avname.startsWith('定制 · ') && t7b.customOn, '回落落在「🎨 定制」');

  // 遗留 av: 条目：只读渲染、无删除角标（F2）
  await p1.evaluate(() => { localStorage.setItem('tod:avatars:v1', JSON.stringify({ mine: ['av:P03'] })); });
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  await p1.click('.pn-avtab-mine');
  await p1.click('.pn-mine-selector .pn-avopt');   // 点选遗留条目 → 可选可发（av:P03 直进 mono:avatar）
  const t8 = await p1.evaluate(() => ({
    tileImg: document.querySelector('.pn-mine-selector .pn-avopt img') ? document.querySelector('.pn-mine-selector .pn-avopt img').src.startsWith('data:image/svg') : false,
    delBadge: document.querySelectorAll('.pn-mine-wrap .pn-avdel').length,
    avname: document.querySelector('.pn-avname').textContent,
  }));
  ok(t8.tileImg, '遗留 av:P03 本地渲染出图（data:svg）');
  ok(t8.delBadge === 0, '遗留 av: 条目无删除角标（tod 侧会复活）');
  ok(t8.avname === '小贝', `遗留条目名 correct（"${t8.avname}"）`);
  ok((await p1.evaluate(() => localStorage.getItem('mono:avatar'))) === 'av:P03', '遗留条目选中后 rep=av:P03（可选可发）');
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  const t8r = await p1.evaluate(() => ({
    rep: localStorage.getItem('mono:avatar'),
    avname: document.querySelector('.pn-avname').textContent,
    mineOn: document.querySelector('.pn-avpanel-mine').hidden === false,
  }));
  ok(t8r.rep === 'av:P03' && t8r.avname === '小贝' && t8r.mineOn, '遗留预设跨刷新恢复（P1 回归锁）');

  // 上传
  await p1.evaluate(() => localStorage.removeItem('tod:avatars:v1'));
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  await p1.setInputFiles('.pn-avatar-file', [{ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG }]);
  await p1.waitForTimeout(400);
  const t9 = await p1.evaluate(() => ({
    store: JSON.parse(localStorage.getItem('tod:avatars:v1') || '{"mine":[]}').mine.filter(x => x.startsWith('data:image/jpeg')).length,
    avname: document.querySelector('.pn-avname').textContent,
    mineOn: document.querySelector('.pn-avpanel-mine').hidden === false,
    rep: localStorage.getItem('mono:avatar') || '',
  }));
  ok(t9.store === 1 && t9.avname === '上传照片' && t9.mineOn, '上传 → 压成 JPEG 入「我的」并选中');
  ok(t9.rep.startsWith('data:image/jpeg'), '上传图 rep 直进选择（进房即 dataURL）');
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  const t11 = await p1.evaluate(() => ({
    rep: (localStorage.getItem('mono:avatar') || '').slice(0, 15),
    avname: document.querySelector('.pn-avname').textContent,
    mineOn: document.querySelector('.pn-avpanel-mine').hidden === false,
  }));
  ok(t11.rep.startsWith('data:image/') && t11.avname === '上传照片' && t11.mineOn, '上传头像跨刷新恢复（F5 dataURL 路）');
  await p1.evaluate(() => localStorage.setItem('mono:avatar', '3'));   // 旧版数字索引 → 应随机定制
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  const t12 = await p1.evaluate(() => ({
    rep: localStorage.getItem('mono:avatar') || '',
    avname: document.querySelector('.pn-avname').textContent,
    customOn: document.querySelector('.pn-avpanel-custom').hidden === false,
  }));
  ok(t12.rep.startsWith('dcb:') && !['identicon','icons','rings','glass','initials','shapes'].includes(JSON.parse(t12.rep.slice(4)).s) && t12.customOn,
    `旧数字索引迁移 → 随机人物向定制（s=${t12.rep.startsWith('dcb:') ? JSON.parse(t12.rep.slice(4)).s : '无'}）`);

  // ═══ B. 布局：390×844 折叠 / 1280×800 常开 ═══
  console.log('\n[B] 布局（折叠断点 + 首屏）');
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctxB.newPage();
  p2.on('pageerror', e => errors.push('mono-390:' + e.message));
  await p2.goto(`http://127.0.0.1:${PORT}/monopoly.html`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  await p2.waitForSelector('.pn-create', { state: 'visible', timeout: 10000 });   // setup 面板/loader 就绪后再量几何
  const b1 = await p2.evaluate(() => ({
    expandVisible: document.querySelector('.pn-cz-expand').getBoundingClientRect().width > 0,
    stylesHidden: getComputedStyle(document.querySelector('.pn-cz-styles')).display === 'none',
    createBottom: document.querySelector('.pn-create').getBoundingClientRect().bottom,
    noHOverflow: document.documentElement.scrollWidth <= window.innerWidth,
  }));
  ok(b1.expandVisible && b1.stylesHidden, '390×844：展开钮可见、chip 区默认折叠');
  ok(b1.createBottom <= 844, `创建按钮在首屏（bottom=${Math.round(b1.createBottom)} ≤ 844）`);
  ok(b1.noHOverflow, '无横向溢出');
  await p2.click('.pn-cz-expand');
  const b2 = await p2.evaluate(() => ({
    stylesShown: getComputedStyle(document.querySelector('.pn-cz-styles')).display !== 'none',
    expandText: document.querySelector('.pn-cz-expand').textContent,
  }));
  ok(b2.stylesShown && b2.expandText.includes('收起'), '点开后 chip 区展开、按钮文案切换');
  await p2.screenshot({ path: path.join(ROOT, '.pw/shots/pav-mono-form-390.png') });
  await p2.click('.pn-cz-expand');   // 还原折叠

  const b3 = await p1.evaluate(() => ({
    expandHidden: document.querySelector('.pn-cz-expand').getBoundingClientRect().width === 0,
    stylesShown: getComputedStyle(document.querySelector('.pn-cz-styles')).display !== 'none',
    createBottom: document.querySelector('.pn-create').getBoundingClientRect().bottom,
  }));
  ok(b3.expandHidden && b3.stylesShown, '1280×800：桌面常开、展开钮隐藏');
  ok(b3.createBottom <= 800, `1280×800 创建按钮在首屏（bottom=${Math.round(b3.createBottom)} ≤ 800）`);

  for (const [w, h, tag] of [[320, 698, '320×698 小屏'], [768, 1024, '768×1024 平板'], [740, 360, '740×360 手机横屏']]) {
    const pd = await ctxB.newPage();
    pd.on('pageerror', e => errors.push('mono-' + w + ':' + e.message));
    await pd.setViewportSize({ width: w, height: h });
    await pd.goto(`http://127.0.0.1:${PORT}/monopoly.html`, { waitUntil: 'domcontentloaded' });
    await pd.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
    await pd.waitForSelector('.pn-create', { state: 'visible', timeout: 10000 });
    const dv = await pd.evaluate(() => ({
      noHOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      formW: Math.round(document.querySelector('.pn-avatar-group').getBoundingClientRect().width),
      useBtnGone: !document.querySelector('.pn-cz-use'),
    }));
    ok(dv.noHOverflow && dv.formW > 0 && dv.useBtnGone, `${tag}：无横向溢出、表单正常（宽 ${dv.formW}px，无确认钮）`);
    await pd.close();
  }

  // ═══ C. 入房：头像配方进房间状态 + 大厅本机渲染 + 机器人配方（全新 context：上传 dataURL 不串场） ═══
  console.log('\n[C] monopoly 入房（localnet 自治链路）');
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p3 = await ctxC.newPage();
  p3.on('pageerror', e => errors.push('mono-net:' + e.message));
  await p3.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=42771&role=host`, { waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
  const c1 = await p3.evaluate(() => {
    const doc = window.__mono.net().doc;
    return {
      av: doc.players[0].av,
      rep: localStorage.getItem('mono:avatar'),
      lobbyImgs: document.querySelectorAll('.pn-players .pn-prow img').length,
      firstLobbyLocal: (document.querySelector('.pn-players .pn-prow img') || {}).src || '',
      formHidden: document.querySelector('.pn-form').hidden,
    };
  });
  ok(c1.av.startsWith('dcb:') && c1.av === c1.rep, '入房 players[0].av = 表单所选定制配方');
  ok(c1.formHidden && c1.lobbyImgs === 1 && c1.firstLobbyLocal.startsWith('data:image/svg'), '大厅行头像本机渲染（data:svg）');
  await p3.evaluate(() => document.querySelector('.pn-addbot').click());
  await p3.waitForFunction(() => window.__mono.net().doc.players.length === 2, null, { timeout: 8000 });
  const c2 = await p3.evaluate(() => {
    const bot = window.__mono.net().doc.players.find(p => p.bot);
    return { botAv: bot && bot.av, rows: document.querySelectorAll('.pn-players .pn-prow').length };
  });
  ok(c2.botAv && c2.botAv.startsWith('dcb:') && JSON.parse(c2.botAv.slice(4)).s, '机器人拿到随机人物向配方');
  ok(c2.rows === 2, '大厅两行成员');
  await p3.screenshot({ path: path.join(ROOT, '.pw/shots/pav-mono-lobby.png') });

  // ═══ D. uno 同构 ═══
  console.log('\n[D] uno 同构');
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p4 = await ctxD.newPage();
  p4.on('pageerror', e => errors.push('uno-form:' + e.message));
  await p4.goto(`http://127.0.0.1:${PORT}/uno.html`, { waitUntil: 'domcontentloaded' });
  await p4.waitForFunction(() => document.querySelectorAll('.pn-cz-chip').length === 31, null, { timeout: 10000 });
  const d1 = await p4.evaluate(() => ({
    chips: document.querySelectorAll('.pn-cz-chip').length,
    chipLocal: document.querySelector('.pn-cz-chip img').src.startsWith('data:image/svg'),
    customSel: document.querySelector('.pn-avtab-custom').getAttribute('aria-selected'),
    rep: localStorage.getItem('uno:avatar') || '',
    avname: document.querySelector('.pn-avname').textContent,
  }));
  ok(d1.chips === 31 && d1.chipLocal && d1.customSel === 'true', 'uno 表单 = 同一定制器（31 chip 本机生成，默认定制）');
  ok(d1.rep.startsWith('dcb:') && d1.avname.startsWith('定制 · '), 'uno 随机定制开箱即用');
  const p5 = await ctxD.newPage();
  p5.on('pageerror', e => errors.push('uno-net:' + e.message));
  await p5.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=42773&role=host`, { waitUntil: 'domcontentloaded' });
  await p5.waitForFunction(() => window.__uno && window.__uno.net().joined, null, { timeout: 15000 });
  const d2 = await p5.evaluate(() => {
    const doc = window.__uno.net().doc;
    const img = document.querySelector('.pn-players .pn-prow img');
    return { av: doc.players[0].av, rep: localStorage.getItem('uno:avatar'), imgLocal: img ? img.src.startsWith('data:image/svg') : false };
  });
  ok(d2.av.startsWith('dcb:') && d2.av === d2.rep && d2.imgLocal, 'uno 入房配方同步 + 大厅本机渲染');

  // ═══ 收官 ═══
  ok(errors.length === 0, `全程零 pageerror（${errors.length}）`);
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));
  console.log(`\n═══ probe-avatar-picker: ${passed} passed, ${failed} failed ═══`);
  await browser.close();
  server.close();
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
