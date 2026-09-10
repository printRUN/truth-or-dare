// E2E: 头像定制器 + 持久化 —— 三标签 / 31 风格 / seed 重掷 / 底色 / 保存→重载仍在 /
//      dcb 配方跨端逐字节一致 / 上传→持久化 / 两连点删除 / 状态只传配方不传图
// 用法: node test-avatars.cjs   (from .pw/)
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8755;
const URL = `http://localhost:${PORT}/index.html`;
function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, d) => { if (err) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); });
    });
    s.listen(PORT, () => res(s));
  });
}
const log = (...a) => console.log('[av]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
function watch(p, t) {
  p.on('pageerror', e => errors.push(`[${t}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${t}] console: ${m.text()}`); });
}
async function openJoin(ctx, tag) {
  const p = await ctx.newPage(); watch(p, tag);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
  await p.click('details.adv summary');
  await p.click('#chk-local');
  return p;
}

(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); } catch {} });
  let A;
  try {
    // 1) 定制器基本盘
    A = await openJoin(ctx, 'A');
    await A.click('#avtab-custom');
    await A.waitForSelector('#av-panel-custom:not([hidden])', { timeout: 5000 });
    const nChips = await A.locator('.cz-chip').count();
    if (nChips !== 31) throw new Error('style chips = ' + nChips + ', want 31');
    const nBgs = await A.locator('.cz-bg').count();
    if (nBgs !== 9) throw new Error('bg swatches = ' + nBgs + ', want 8+1');
    const prev1 = await A.evaluate(() => document.getElementById('cz-preview').src);
    if (!prev1.startsWith('data:image/svg+xml,')) throw new Error('preview not local svg: ' + prev1.slice(0, 30));
    await A.screenshot({ path: 'shots/av-custom.png' });
    log('定制器 31 风格 × 9 底色渲染 OK');

    // 2) 换风格 / 重掷 / 换底色都会换图
    await A.click('.cz-chip >> nth=5');
    const prev2 = await A.evaluate(() => document.getElementById('cz-preview').src);
    if (prev2 === prev1) throw new Error('style switch did not change preview');
    await A.click('#cz-reroll');
    const prev3 = await A.evaluate(() => document.getElementById('cz-preview').src);
    if (prev3 === prev2) throw new Error('reroll did not change preview');
    const styleNow = await A.evaluate(() => cz.style);
    log('风格切换 / 🎲 重掷 生效（当前风格', styleNow + '）');

    // 3) 保存 → 「我的」出现该项 + localStorage 落盘
    await A.click('#cz-save');
    await A.waitForSelector('#av-panel-mine:not([hidden])', { timeout: 5000 });
    const mine1 = await A.locator('#mine-selector .avatar-option[data-avatar]').count();
    if (mine1 !== 1) throw new Error('mine tiles = ' + mine1);
    const rep1 = await A.evaluate(() => JSON.parse(localStorage.getItem('tod:avatars:v1')).mine[0]);
    if (!rep1.startsWith('dcb:')) throw new Error('saved rep not dcb: ' + rep1.slice(0, 20));
    const selIsRep = await A.evaluate(r => avatarSel.rep === r, rep1);
    if (!selIsRep) throw new Error('saved rep not auto-selected');
    log('保存定制 → 我的：', rep1.slice(0, 40));

    // 4) 刷新 → 持久化仍在且仍选中
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#loading-overlay', { state: 'detached', timeout: 10000 });
    const after = await A.evaluate(r => ({
      tiles: document.querySelectorAll('#mine-selector .avatar-option[data-avatar]').length,
      rep: JSON.parse(localStorage.getItem('tod:avatars:v1')).mine[0],
    }), rep1);
    if (after.tiles !== 1 || after.rep !== rep1) throw new Error('persistence lost after reload');
    log('刷新后「我的」仍在 ✓（下次访问可用）');

    // 5) 重新选中它再加入 → 状态里是配方不是图；跨端逐字节一致
    await A.click('#avtab-mine');
    await A.click('#mine-selector .avatar-option[data-avatar]');
    await A.fill('#input-name', '定制君');
    await A.click('#btn-join');
    await A.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    const st = await A.evaluate(() => ({ av: S.players[0].avatar, bytes: JSON.stringify(S).length }));
    if (st.av !== rep1) throw new Error('state avatar mismatch: ' + st.av);
    if (st.bytes > 2500) throw new Error('state too fat with recipe avatar: ' + st.bytes);
    const B = await openJoin(ctx, 'B');
    const sameUri = await Promise.all([A, B].map(p => p.evaluate(r => resolveAvatar(r), rep1)));
    if (sameUri[0] !== sameUri[1] || !sameUri[0].startsWith('data:image/svg+xml,'))
      throw new Error('recipe not deterministic across pages');
    log('进房状态只带 ~' + rep1.length + 'B 配方；双端展开逐字节一致 ✓（整帧', st.bytes, 'B）');

    // 退房回加入页（后续上传/删除操作要求面板可见）
    await A.click('#btn-leave');
    await A.waitForSelector('#screen-join.active', { timeout: 10000 });
    await A.click('#avtab-mine');

    // 6) 上传照片 → 持久化 + 选中
    await A.screenshot({ path: 'shots/test-upload.png' });   // 真 PNG 当上传素材
    await A.setInputFiles('#avatar-file', 'shots/test-upload.png');
    await A.waitForFunction(() => avatarStore.mine.length === 2, null, { timeout: 8000 });
    const upRep = await A.evaluate(() => avatarStore.mine[0]);
    if (!upRep.startsWith('data:image/jpeg')) throw new Error('upload not jpeg dataURL: ' + upRep.slice(0, 25));
    const selUp = await A.evaluate(r => avatarSel.rep === r, upRep);
    if (!selUp) throw new Error('upload not auto-selected');
    const upSize = await A.evaluate(r => r.length, upRep);
    log('上传已存进「我的」并选中（JPEG ' + Math.round(upSize / 1024) + 'KB）');

    // 7) 两连点删除：首点染红不删，再点才删；删非当前项不回落
    await A.hover('.mine-wrap:nth-child(2)');
    await A.click('.mine-wrap:nth-child(2) .av-del');
    const armed = await A.evaluate(() => document.querySelectorAll('.mine-wrap')[1].querySelector('.av-del').classList.contains('armed'));
    if (!armed) throw new Error('delete not armed on first tap');
    if (await A.evaluate(() => avatarStore.mine.length) !== 2) throw new Error('deleted on first tap!');
    await A.hover('.mine-wrap:nth-child(2)');
    await A.click('.mine-wrap:nth-child(2) .av-del');
    await sleep(200);
    const afterDel = await A.evaluate(() => ({ n: avatarStore.mine.length, first: avatarStore.mine[0] }));
    if (afterDel.n !== 1 || afterDel.first !== upRep) throw new Error('second tap did not delete recipe item: ' + JSON.stringify(afterDel));
    log('两连点删除 OK（配方项被删，上传项保留）');

    // 8) 删掉正在用的头像 → 回落预设
    await A.hover('.mine-wrap:nth-child(1)');
    await A.click('.mine-wrap:nth-child(1) .av-del');
    await A.click('.mine-wrap:nth-child(1) .av-del');
    await sleep(300);
    const fallback = await A.evaluate(() => ({ rep: avatarSel.rep, n: avatarStore.mine.length }));
    if (fallback.n !== 0 || fallback.rep !== 'av:P01') throw new Error('no fallback after deleting in-use avatar: ' + JSON.stringify(fallback));
    log('删除使用中头像 → 回落 av:P01 ✓');

    await A.screenshot({ path: 'shots/av-mine.png' });
    if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    console.log('\n[av] ALL AVATAR-E2E PASSED ✅');
  } catch (e) {
    try { await A.screenshot({ path: 'shots/av-fail.png' }); } catch {}
    console.error('[av] FAILED ❌', e.message);
    if (errors.length) console.error(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
