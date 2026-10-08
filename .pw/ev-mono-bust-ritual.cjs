// ev-mono-bust-ritual.cjs — W2 全场 3D 感：monopoly 破产清算仪式 + 棋子钞堆 + 1.6e 备案清空（2026-10-02）
// 取证纪律（评审 #20）：禁用像素断言（软渲必假红）——全部走 window.__mono 的 AUTOTEST 门控只读访问器
//（ritual=清算克隆枚举 / stacks=钞堆层数+cash 镜像 / fx=重力·thump 计数·noteTex 尺寸）。
// A 段（autotest 3D）：克隆动线来源/目标、横幅后置、散钞并行、钞堆增减与 busy 池隔离、√SPEED、大额重拍。
// B 段（REDUCED）：跳过飞行直落横幅、钞堆静态摆放无动画。
// C 段（双标签 BroadcastChannel）：观战端 bust op 编译时携带 tiles 且同节奏演（克隆在飞采样 recorder）。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 8994;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, MIME[path.extname(p)] || 'application/octet-stream'); res.end(d); } });
});
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✅', msg, extra !== undefined ? '| ' + JSON.stringify(extra).slice(0, 160) : ''); } else { fail++; console.log('  ❌', msg, extra !== undefined ? '| ' + JSON.stringify(extra).slice(0, 160) : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  // ══ A：主页面（autotest 3D，SPEED=0.15）——仪式 + 钞堆 + 备案三项 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const gl = await p.evaluate(() => window.__mono.sceneInfo());
    ok('A0 3D 场景已建且未降档（克隆/钞堆动画前提）', gl.gl && gl.tiles === 24 && gl.pawns === 2 && gl.bodyLo === false, gl);

    // R7 noteTex 512×256（1.6e 备案：近景读清面额；flyNotes plane 2:1 不变直接换）
    const fx0 = await p.evaluate(() => window.__mono.fx());
    ok('R7 noteTex 升 512×256', fx0.tex.w === 512 && fx0.tex.h === 256, fx0.tex);
    ok('R8 散钞重力 ×√SPEED 生效', Math.abs(fx0.grav - 6.5 * Math.sqrt(fx0.speed)) < 1e-9, { grav: fx0.grav, speed: fx0.speed });

    // R3a 钞堆初始：¥10000 → 3 层，且不进 notePool（busy 池=航班/散钞专用）
    const s0 = await p.evaluate(() => window.__mono.stacks());
    ok('R3a 初始 ¥10000 → 3 层常驻', s0.perPlayer[0].want === 3 && s0.perPlayer[0].shown === 3, s0.perPlayer[0]);
    ok('R3a 钞堆不进 notePool（busy=0）', s0.notePoolBusy === 0, { busy: s0.notePoolBusy, pool: s0.notePoolSize, stacks: s0.pool });

    // R4/R5 破产清算仪式（真 charge 路径）：克隆在飞且来源=被收回地块、目标=BANK_POS；
    // 散钞并行不互斥；横幅挂「克隆全落地」后才亮（评审 #8）
    await p.evaluate(() => {
      const M = window.__mono;
      M.state.owners[3] = 0; M.state.owners[5] = 0;   // 玩家 0 名下两块地（将被清算收回）
      M.forceMoney(0, 100);
    });
    const rb = await p.evaluate(() => {
      const M = window.__mono;
      M.pay(0, 5000, null);   // 现金不足 → 破产清算仪式（统一入口 bustRitual）
      return Object.assign(M.ritual(), { tile3: M.tileXY(3), tile5: M.tileXY(5) });
    });
    ok('R4 克隆在飞且来源=被收回地块 3/5', rb.flying === 2 && rb.tiles.slice().sort().join() === '3,5'
      && rb.clones.every(c => {
        const tp = c.tile === 3 ? rb.tile3 : rb.tile5;
        return Math.abs(c.from.x - tp.x) < 1e-6 && Math.abs(c.from.z - tp.z) < 1e-6 && Math.abs(c.from.y - 0.381) < 1e-6;
      }), rb.clones.map(c => ({ tile: c.tile, from: c.from })));
    ok('R4 克隆目标=BANK_POS(0,0.62,0)', rb.clones.every(c => c.to.x === 0 && c.to.y === 0.62 && c.to.z === 0), rb.clones[0] && rb.clones[0].to);
    ok('R4 横幅后置（克隆未落地不亮幕）', !rb.bannerShown, { bannerShown: rb.bannerShown, flying: rb.flying });
    ok('R4 散钞与克隆并行不互斥（busy 束>0 且克隆在飞）', rb.scatterBusy > 0 && rb.flying > 0, { scatterBusy: rb.scatterBusy, flying: rb.flying });
    await p.waitForFunction(() => window.__mono.ritual().bannerShown, null, { timeout: 5000 });
    const rb2 = await p.evaluate(() => window.__mono.ritual());
    ok('R5 克隆计数归零后横幅才 show', rb2.bannerShown && rb2.flying === 0, { flying: rb2.flying, bannerShown: rb2.bannerShown });

    // R3b 钞堆随 cash 增减（买地/收租同路径的 forceMoney diff）+ 镜像同步 + busy 池零占用
    await p.evaluate(() => window.__mono.forceMoney(1, 20000));
    await p.waitForFunction(() => window.__mono.stacks().perPlayer[1].shown === 4, null, { timeout: 3000 });
    ok('R3b 加钱（¥20000）→ 4 层', true);
    await p.evaluate(() => window.__mono.forceMoney(1, 5000));
    await p.waitForFunction(() => window.__mono.stacks().perPlayer[1].shown === 2, null, { timeout: 3000 });
    const s1 = await p.evaluate(() => window.__mono.stacks());
    ok('R3b 减钱（¥5000）→ 2 层 + 镜像同步 + busy 池零占用', s1.mirror[1] === 5000 && s1.notePoolBusy === 0, { mirror: s1.mirror[1], busy: s1.notePoolBusy });

    // R6 大额重拍：≥1500 收租 → thump+jolt 各 +1；小额不触发（沿用 shaking 互斥判法，非 body.shaking）
    const beat = await p.evaluate(() => {
      const M = window.__mono, b = M.fx();
      M.pay(1, 2000, 0);   // 玩家 1 → 玩家 0 收租 ¥2000（≥BIG_MONEY）
      const a = M.fx();
      const big = { th: a.thumps - b.thumps, jo: a.jolts - b.jolts, joltClass: document.body.classList.contains('jolt'), shakingClass: document.body.classList.contains('shaking') };
      const b2 = M.fx();
      M.pay(1, 400, 0);   // 小额收租：不重拍
      const a2 = M.fx();
      return Object.assign(big, { smallTh: a2.thumps - b2.thumps });
    });
    ok('R6 ≥1500 收租 thump+jolt（且非 shaking）', beat.th === 1 && beat.jo === 1 && beat.joltClass && !beat.shakingClass, beat);
    ok('R6 小额（<1500）不重拍', beat.smallTh === 0, beat);

    // R9 破产清空钞堆（玩家 0 已在 R4 破产）
    await p.waitForFunction(() => window.__mono.stacks().perPlayer[0].want === 0 && window.__mono.stacks().perPlayer[0].shown === 0, null, { timeout: 3000 });
    ok('R9 破产清空钞堆', true);
    ok('A 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ B：REDUCED（prefers-reduced-motion）——跳过飞行直落横幅 + 钞堆静态摆放无动画 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${PORT}/monopoly.html?autotest=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loader', { state: 'detached', timeout: 25000 });
    await p.waitForFunction(() => window.__mono && window.__mono.state.phase === 'AWAIT_ROLL', null, { timeout: 25000 });
    const rred = await p.evaluate(() => {
      const M = window.__mono;
      M.state.owners[3] = 0;
      M.forceMoney(0, 100);
      M.forceMoney(1, 20000);   // REDUCED 钞堆静态摆放（fin 直写终态，无滑入动画）
      const st = M.stacks();
      M.pay(0, 5000, null);   // 破产清算：REDUCED 跳过飞行直落横幅
      return { st, ritual: M.ritual() };
    });
    ok('B1 REDUCED 破产：零克隆 + 横幅立即 show（跳飞行直切）', rred.ritual.flying === 0 && rred.ritual.bannerShown && rred.ritual.scatterBusy === 0, rred.ritual);
    ok('B2 REDUCED 钞堆静态摆放无动画（¥20000 → 4 层即时）', rred.st.perPlayer[1].want === 4 && rred.st.perPlayer[1].shown === 4, rred.st.perPlayer[1]);
    ok('B 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  // ══ C：观战端（双标签 BroadcastChannel）——bust op 编译时携带 tiles 且同节奏演 ══
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    const errs = [];
    const mk = async name => { const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(name + ':' + e.message)); return pg; };
    const host = await mk('host'), join = await mk('join');
    const url = q => `http://127.0.0.1:${PORT}/monopoly.html?autotest=1&net=1&localnet=1&room=89941&q=${q}`;
    await host.goto(url('host') + '&role=host', { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
    await join.goto(url('join') + '&role=join&name=小绿', { waitUntil: 'domcontentloaded' });
    await join.waitForFunction(() => window.__mono && window.__mono.net().joined, null, { timeout: 15000 });
    await host.evaluate(() => window.__mono.net().start({ roundLimit: 15 }));
    await join.waitForFunction(() => window.__mono.state.players.length === 2, null, { timeout: 10000 });

    // 第一拍：host 给玩家 0 两块地 + 打穷快照并发布 → join 的 prevOwners 记下归属（bust op 的 tiles 来源）
    await host.evaluate(() => { const M = window.__mono; M.state.owners[3] = 0; M.state.owners[5] = 0; M.forceMoney(0, 100); M.net().publish(); });
    await join.waitForFunction(() => window.__mono.state.owners[3] === 0 && window.__mono.state.players[0].cash === 100, null, { timeout: 10000 });
    // join 装 16ms 采样 recorder：抓克隆在飞窗口（SPEED=0.15 航时 ~105-180ms，rAF 轮询必踩中）
    await join.evaluate(() => {
      window.__rc = [];
      window.__ri = setInterval(() => {
        const r = window.__mono.ritual();
        if (r.flying > 0 || r.bannerShown) window.__rc.push({ flying: r.flying, tiles: r.tiles.slice(), banner: r.bannerShown, busy: r.scatterBusy });
      }, 16);
    });
    // 第二拍：host 破产（真 charge=统一仪式入口）+ 发布 → join 编译 bust op{tiles:[3,5]} 并同节奏演
    await host.evaluate(() => { const M = window.__mono; M.pay(0, 5000, null); M.net().publish(); });
    const hb = await host.waitForFunction(() => window.__mono.ritual().bannerShown, null, { timeout: 5000 }).then(() => true).catch(() => false);
    const jb = await join.waitForFunction(() => window.__mono.ritual().bannerShown, null, { timeout: 8000 }).then(() => true).catch(() => false);
    await join.evaluate(() => clearInterval(window.__ri));
    const rc = await join.evaluate(() => window.__rc);
    ok('C1 host 端仪式照常（散钞+克隆+横幅后置）', hb, { hb });
    ok('C2 观战端 bust op 携带 tiles=[3,5] 且克隆在飞（同节奏演）', rc.some(s => s.flying > 0 && s.tiles.includes(3) && s.tiles.includes(5)), rc.slice(0, 4));
    ok('C2b 观战端散钞同拍（busy 束>0 采样到）', rc.some(s => s.busy > 0), rc.slice(0, 4));
    ok('C3 观战端横幅最终 show（计数归零后）', jb, { jb });
    // 观战端钞堆同语言：玩家 0 破产 → 清空
    const js = await join.evaluate(() => window.__mono.stacks().perPlayer[0]);
    ok('C4 观战端破产玩家钞堆清空', js.want === 0 && js.shown === 0, js);
    ok('C 零 pageerror', errs.length === 0, errs.join(';'));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\nev-mono-bust-ritual: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
