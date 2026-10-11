#!/usr/bin/env node
/* persona-ava4-uno.cjs — 4 玩家头像可区分性走查（端口 9161，可复跑）：
   ① UNO 本地链路 4 人局：4 张 2D 发型差异极大的头像（adventurer/Maria 长直发、avataaars/Mason 刺头、
      big-smile/Liam 丸子、personas/Jill 蓬松卷），逐座位半身像投影近截 + 全景 + 提取特征向量落点
   ② tod 本地房间 4 人局：同样 4 配方，3D 近景头逐个投影近截 + 全景 + 揭晓态一截
   只读运行时（不改游戏代码）；断言从宽，证据为先。结果数据落 .pw/persona-ava4-data.json。 */
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9161;   // 专用端口（在册最高 9149，勿与其他探针共用）
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.pw', 'shots');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const ct = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }[path.extname(p)] || 'application/octet-stream';
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': ct }); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { uno: {}, tod: {} };

/* 4 张发型差异极大的 2D 头像（同底色 e3ece7，只靠发型/发色区分） */
const AVA = [
  { tag: 'long',  name: '阿琅',  style: 'adventurer', seed: 'Maria',  expect2d: '金色长直发过肩' },
  { tag: 'spiky', name: '刺头哥', style: 'avataaars',  seed: 'Mason',  expect2d: '红色刺头（尖刺向上）' },
  { tag: 'bun',   name: '丸子姐', style: 'big-smile',  seed: 'Liam',   expect2d: '棕色丸子头（顶髻）' },
  { tag: 'afro',  name: '卷卷',  style: 'personas',   seed: 'Jill',   expect2d: '橙色蓬松大卷发' },
];
const recipeOf = a => 'dcb:' + JSON.stringify({ s: a.style, d: a.seed, b: 'e3ece7' });

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const errs = [];

  /* ══════════ ① UNO 4 人局（同一 context 本地链路）══════════ */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pages = [];
    for (let i = 0; i < 4; i++) {
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push('uno-p' + i + ': ' + e.message));
      const a = AVA[i];
      await p.addInitScript(av => { try { localStorage.setItem('uno:avatar', av); } catch (e) {} }, recipeOf(a));
      pages.push(p);
    }
    const url = (q, role, name) => `http://127.0.0.1:${PORT}/uno.html?autotest=1&net=1&localnet=1&room=74117&q=${q}&role=${role}` + (name ? `&name=${encodeURIComponent(name)}` : '');
    for (let i = 0; i < 4; i++) {
      await pages[i].goto(url('p' + i, i === 0 ? 'host' : 'join', i === 0 ? '' : AVA[i].name), { waitUntil: 'domcontentloaded' });
      await pages[i].waitForFunction(() => window.__uno && window.__uno.net() && window.__uno.net().joined, null, { timeout: 20000 });
      if (i > 0) await pages[0].waitForFunction(n => window.__uno.net().doc.players.length === n, i + 1, { timeout: 15000 });
    }
    const docAvs = await pages[0].evaluate(() => window.__uno.net().doc.players.map(p => ({ name: p.name, av: p.av })));
    out.uno.docAvs = docAvs;
    console.log('[uno] 房间文档头像:', JSON.stringify(docAvs.map((d, i) => ({ i, name: d.name, ok: d.av === recipeOf(AVA[i]) }))));

    await pages[0].evaluate(() => window.__uno.net().start({}));
    for (let i = 0; i < 4; i++) {
      await pages[i].waitForFunction(() => window.__uno.net().doc.started && window.__uno.state.players.length === 4, null, { timeout: 15000 });
      await pages[i].waitForFunction(() => { const a = window.__uno.avatars(); return a.seats.length === 3 && a.seats.every(s => s.loaded && !s.fb); }, null, { timeout: 20000 });
    }
    await sleep(2200);   // 发牌动画落定

    // 逐页：bust 映射（busts 数组序=玩家序去南位）+ 半身像包围盒投影到屏幕
    const shootPage = async (i, cropAll) => {
      const pg = pages[i];
      const info = await pg.evaluate(() => {
        scene.updateMatrixWorld(true);   // autotest 冻连续渲染：投影前强制全图矩阵刷新（否则 avHead 矩阵滞后=投影落屏心）
        const south = southOwner();
        const order = G.players.map((p, k) => k).filter(k => k !== south);
        const v = new THREE.Vector3();
        const proj = obj => {
          const box = new THREE.Box3().setFromObject(obj);
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
            v.set(cx, cy, cz).project(camera);
            const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        };
        return {
          south,
          seats: seatAva.busts.map((g, k) => {
            const f = g.userData.feats || {};
            return {
              playerIdx: order[k], name: G.players[order[k]].name, colorIdx: g.userData.colorIdx,
              style: f.style || null, hair: f.hair || null, skin: f.skin || null, glasses: !!f.glasses, beard: !!f.beard,
              pos: { x: +g.position.x.toFixed(2), z: +g.position.z.toFixed(2) },
              bustBox: proj(g), headBox: proj(g.userData.avHead),
            };
          }),
        };
      });
      await pg.bringToFront();
      await pg.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
      await pg.screenshot({ path: path.join(SHOTS, `persona-ava4-uno-p${i}-full.png`) });
      console.log(`[uno] p${i} 全景完成（south=${info.south}，bust ${info.seats.length} 座）`);
      if (cropAll) {
        for (const s of info.seats) {
          const m = 12;
          const clip = {
            x: Math.max(0, Math.floor(s.bustBox.x - m)), y: Math.max(0, Math.floor(s.bustBox.y - m)),
            width: Math.min(1280 - Math.max(0, Math.floor(s.bustBox.x - m)), Math.ceil(s.bustBox.w + 2 * m)),
            height: Math.min(800 - Math.max(0, Math.floor(s.bustBox.y - m)), Math.ceil(s.bustBox.h + 2 * m)),
          };
          if (clip.width < 8 || clip.height < 8) { console.log(`[uno] 跳过越界 crop p${i}/${s.name}`); continue; }
          await pg.evaluate(() => window.__uno.forceRender && window.__uno.forceRender());
          s.cropFile = `bust-${s.playerIdx}-${AVA[s.playerIdx].tag}.png`;
          await pg.screenshot({ path: path.join(SHOTS, 'persona-ava4-uno-' + s.cropFile), clip });
          await sleep(80);
        }
      }
      return info;
    };
    out.uno.p0 = await shootPage(0, true);
    out.uno.p1 = await shootPage(1, true);
    out.uno.p2 = await shootPage(2, false);
    out.uno.p3 = await shootPage(3, false);

    // 2D 对照基准图（同一批配方 320px 大图）
    const ref = await ctx.newPage();
    await ref.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&q=ref`, { waitUntil: 'domcontentloaded' });
    await ref.waitForFunction(() => typeof P !== 'undefined' && P && P.avatarUri, null, { timeout: 15000 });
    const refHtml = await ref.evaluate(AVA => '<body style="margin:0;background:#fff;font:14px sans-serif;display:flex;gap:18px;padding:14px">' + AVA.map(a =>
      `<div style="text-align:center"><img src="${P.avatarUri('dcb:' + JSON.stringify({ s: a.style, d: a.seed, b: 'e3ece7' }))}" width="300" height="300" style="display:block;border-radius:12px"><b>${a.name}</b> ${a.style}/${a.seed}<br><span style="color:#666">${a.expect2d}</span></div>`).join('') + '</body>', AVA);
    await ref.setContent(refHtml);
    await ref.waitForTimeout(700);
    await ref.screenshot({ path: path.join(SHOTS, 'persona-ava4-uno-2d-ref.png'), fullPage: true });
    console.log('[uno] 2D 对照基准图完成');
    await ctx.close();
  }

  /* ══════════ ② tod 4 人局（新 context 本地房间）══════════ */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pages = [];
    for (let i = 0; i < 4; i++) {
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push('tod-p' + i + ': ' + e.message));
      await p.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch (e) {} });
      pages.push(p);
    }
    const openTab = async i => {
      const p = pages[i];
      await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 25000 }).catch(() => {});
      await sleep(300);
      return p;
    };
    const join = async (p, name, room) => {
      const adv = await p.$('details.adv');
      if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
      await p.click('#chk-local');
      await p.fill('#input-name', name);
      if (room) { await p.click('#input-room'); await p.fill('#input-room', room); }
      await p.click('.avatar-option >> nth=0');
      await p.click('#btn-join');
      await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    };
    const host = await openTab(0);
    await join(host, AVA[0].name, '');
    const room = (await host.textContent('#share-room')).trim();
    console.log('[tod] 房号', room);
    for (let i = 1; i < 4; i++) {
      const p = await openTab(i);
      await join(p, AVA[i].name, room);
      await host.waitForFunction(n => S && S.players && S.players.length === n, i + 1, { timeout: 25000 });
    }
    await host.click('#btn-start');
    for (const p of pages) await p.waitForSelector('#screen-game.active', { timeout: 25000 });
    await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 15000 });
    for (const p of pages) await p.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
    await sleep(3200);   // 入场运镜落定

    // 注入 4 配方（ev-avatars-tod 样板：mutate 改运行时状态）
    await host.evaluate(recipes => mutate(s => { s.players.forEach((p, i) => { if (recipes[i]) p.avatar = recipes[i]; }); }), AVA.map(recipeOf));
    await host.waitForFunction(() => window.__three && window.__three.avFeats && window.__three.avFeats().length === 4 && window.__three.avFeats().every(a => a.hasFeat && a.style), null, { timeout: 25000 });
    const feats = await host.evaluate(() => {
      const names = S.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
      return window.__three.avFeats().map(f => { const n = names.find(x => x.id === f.pid) || {}; return { ...f, name: n.name, avatar: n.avatar }; });
    });
    out.tod.feats = feats;
    console.log('[tod] 特征落点:', JSON.stringify(feats.map(f => ({ name: f.name, style: f.style, glasses: f.glasses, head: f.headColor }))));

    const grabTod = async (pg, tag, crops, cropSuffix) => {
      const info = await pg.evaluate(() => {
        window.__three.scene.updateMatrixWorld(true);   // 投影前强制全图矩阵刷新
        const cam = window.__three.camera;
        const v = new THREE.Vector3();
        const proj = obj => {
          const box = new THREE.Box3().setFromObject(obj);
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
            v.set(cx, cy, cz).project(cam);
            const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        };
        return [...window.__three.chars.entries()].map(([pid, ch]) => {
          const n = S.players.find(p => p.id === pid) || {};
          return { pid, name: n.name, headBox: proj(ch.userData.head), anyBox: proj(ch) };
        });
      });
      await pg.bringToFront();
      await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await pg.screenshot({ path: path.join(SHOTS, `persona-ava4-tod-${tag}-full.png`) });
      console.log(`[tod] ${tag} 全景完成`);
      if (crops) {
        for (const s of info) {
          const m = 16;
          const clip = {
            x: Math.max(0, Math.floor(s.headBox.x - m)), y: Math.max(0, Math.floor(s.headBox.y - m)),
            width: Math.min(1280 - Math.max(0, Math.floor(s.headBox.x - m)), Math.ceil(s.headBox.w + 2 * m)),
            height: Math.min(800 - Math.max(0, Math.floor(s.headBox.y - m)), Math.ceil(s.headBox.h + 2 * m)),
          };
          if (clip.width < 8 || clip.height < 8) { console.log(`[tod] 跳过越界 crop ${s.name}`); continue; }
          await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          const tag2 = (AVA.find(a => a.name === (s.name || '')) || {}).tag || 'x';
          s.cropFile = `head-${tag2}${cropSuffix || ''}.png`;
          await pg.screenshot({ path: path.join(SHOTS, 'persona-ava4-tod-' + s.cropFile), clip });
          await sleep(80);
        }
      }
      return info;
    };
    out.tod.view0 = await grabTod(host, 'p0', true, '');
    out.tod.view1 = await grabTod(pages[1], 'p1', true, '-alt');   // p1 视角：阿琅（房主）在此页是正面（p0 只能看到自己后脑勺）

    // 揭晓近景：轮到谁谁抽卡（choose 在抽卡者本机点）
    try {
      const chooserIdx = await Promise.race([
        (async () => {
          for (let t = 0; t < 40; t++) {
            for (let i = 0; i < 4; i++) {
              const mine = await pages[i].evaluate(() => !!(S && S.turn && S.turn.chooserId === myId && !S.turn.card));
              if (mine) return i;
            }
            await sleep(500);
          }
          return -1;
        })(),
        sleep(22000).then(() => -1),
      ]);
      if (chooserIdx >= 0) {
        console.log('[tod] 抽卡者 p' + chooserIdx);
        await pages[chooserIdx].evaluate(() => choose('truth'));
        await sleep(5600);   // drawing 动画 + 翻牌
        const revealed = await host.evaluate(() => !!document.querySelector('#screen-game.stage-revealed'));
        out.tod.revealed = revealed;
        await host.bringToFront();
        await host.screenshot({ path: path.join(SHOTS, 'persona-ava4-tod-reveal.png') });
        console.log('[tod] 揭晓态截图完成（stage-revealed=' + revealed + '）');
      } else console.log('[tod] 22s 内没有出现抽卡回合，跳过揭晓截图');
    } catch (e) { console.log('[tod] 揭晓流程异常（不影响其余证据）:', e.message); }
    await ctx.close();
  }

  fs.writeFileSync(path.join(ROOT, '.pw', 'persona-ava4-data.json'), JSON.stringify(out, null, 2));
  console.log('\nDATA → .pw/persona-ava4-data.json');

  /* ══════════ ③ 对照拼板：上排 2D 原图（本机生成 dataURI），下排 3D 近截 ×3 放大 ══════════ */
  const buildSheet = async (game, rows) => {
    const uriPage = await browser.newPage();
    await uriPage.goto(`http://127.0.0.1:${PORT}/uno.html?autotest=1&q=sheet`, { waitUntil: 'domcontentloaded' });
    await uriPage.waitForFunction(() => typeof P !== 'undefined' && P && P.avatarUri, null, { timeout: 15000 });
    const uris = await uriPage.evaluate(AVA => AVA.map(a => P.avatarUri('dcb:' + JSON.stringify({ s: a.style, d: a.seed, b: 'e3ece7' }))), AVA);
    await uriPage.close();
    let h = '<body style="margin:0;background:#14141f;font:13px sans-serif;color:#eee;padding:10px"><table cellpadding="6" cellspacing="0"><tr>';
    h += '<td valign="middle" style="opacity:.7">2D<br>原图</td>';
    for (let i = 0; i < 4; i++) h += `<td align="center" width="380"><img src="${uris[i]}" width="230" height="230" style="border-radius:10px"><br><b>${AVA[i].name}</b> ${AVA[i].style}/${AVA[i].seed}</td>`;
    h += '</tr><tr><td valign="middle" style="opacity:.7">3D<br>近截</td>';
    for (let i = 0; i < 4; i++) h += `<td align="center"><img src="${rows[i] || 'nope.png'}" width="370" style="border:1px solid #333;border-radius:6px"><br>${rows[i] ? '' : '(缺)'}</td>`;
    h += '</tr></table></body>';
    const sheetPath = path.join(SHOTS, 'persona-ava4-sheet-tmp.html');
    fs.writeFileSync(sheetPath, h);
    const sheet = await browser.newPage({ viewport: { width: 1620, height: 700 } });
    await sheet.goto('file:///' + sheetPath.replace(/\\/g, '/'));
    await sheet.waitForTimeout(800);
    await sheet.screenshot({ path: path.join(SHOTS, `persona-ava4-${game}-compare.png`) });
    await sheet.close();
    fs.unlinkSync(sheetPath);
    console.log(`[sheet] persona-ava4-${game}-compare.png 完成`);
  };
  await buildSheet('uno', [
    'persona-ava4-uno-bust-0-long.png', 'persona-ava4-uno-bust-1-spiky.png', 'persona-ava4-uno-bust-2-bun.png', 'persona-ava4-uno-bust-3-afro.png',
  ]);
  await buildSheet('tod', [
    'persona-ava4-tod-head-long-alt.png', 'persona-ava4-tod-head-spiky.png', 'persona-ava4-tod-head-bun.png', 'persona-ava4-tod-head-afro.png',
  ]);

  console.log('pageerror:', errs.length ? errs.slice(0, 5).join(' | ') : 'clean');
  await browser.close();
  server.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
