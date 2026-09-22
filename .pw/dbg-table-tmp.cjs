const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = 'D:/myidea/truth-or-dare';
const server = http.createServer((req, res) => { const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, {'Content-Type':'text/html'}); res.end(d); } }); });
(async () => {
  await new Promise(r => server.listen(8855, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });
  const pages = [];
  for (let i = 0; i < 6; i++) {
    const p = await ctx.newPage();
    await p.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.route('**://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    await p.goto('http://127.0.0.1:8855/index.html?game=tod', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => { const o = document.getElementById('loading-overlay'); return !o || o.classList.contains('hide'); }, null, { timeout: 20000 });
    await p.click('details.adv summary'); await p.check('#chk-local');
    await p.fill('#input-name', '玩家' + (i + 1));
    if (i) await p.fill('#input-room', pages[0].room);
    await p.locator('.avatar-option:visible').first().click();
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 25000 });
    p.room = i ? pages[0].room : (await p.textContent('#share-room')).trim();
    pages.push(p);
  }
  await pages[0].click('#btn-start');
  await pages[0].waitForSelector('#screen-game.active', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 3400));
  const dbg = await pages[0].evaluate(() => {
    const r = el => { const x = el.getBoundingClientRect(); return el && !el.hidden ? [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)] : null; };
    const plate = document.querySelector('#game-players-grid .player-card');
    return {
      three3d: document.body.classList.contains('three3d'),
      cvPos: getComputedStyle(document.getElementById('three-canvas')).position,
      cvRuleCheck: (() => { for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (r.selectorText && r.selectorText.includes('#three-canvas')) return r.cssText.slice(0, 120); } } catch (e) {} } return 'rule-not-found'; })(),
      canvas: r(document.getElementById('three-canvas')),
      cam: r(document.getElementById('cam')),
      choice: r(document.getElementById('choice-section')),
      plate0: plate ? { left: plate.style.left, top: plate.style.top, z: plate.style.zIndex, rect: r(plate) } : null,
      chars: (function () { try { return (window.__seatAngleByPid || {}) && Object.keys(window.__seatAngleByPid || {}).length; } catch (e) { return String(e); } })(),
      camPose: document.getElementById('world3d').style.transform,
      syncLog: window.__syncLog || null,
      rpLog: window.__rpLog || null,
      frameDbg: window.__frameDbg || null,
      syncErr: window.__syncErr || null,
      fn: (() => { try { return { type: typeof renderPlayers, name: renderPlayers.name, isWrapper: renderPlayers.toString().includes('__rpLog'), global: window.renderPlayers === renderPlayers }; } catch (e) { return String(e); } })(),
      camHook: (() => { try { return Cam.apply.toString().includes('syncCam'); } catch (e) { return String(e); } })(),
      sceneDump: (() => { try { const out = []; __three.scene.children.forEach(c => out.push(c.type + ':' + (c.userData && c.userData.pid ? c.userData.pid : c.type))); const cs = []; __three.chars.forEach((ch, pid) => { const r = new THREE.Vector3(); ch.getWorldPosition(r); cs.push(pid.slice(0, 4) + '@' + [r.x, r.y, r.z].map(n => n.toFixed(2)).join(',')); }); return { n: __three.scene.children.length, out: out.slice(0, 8), chars: cs, vis: [...__three.chars.values()].filter(c => c.visible).length }; } catch (e) { return String(e); } })(),
    };
  });
  console.log('DBG:', JSON.stringify(dbg));
  await pages[0].screenshot({ path: 'D:/myidea/truth-or-dare/.pw/shots/dbg-table-choosing.png' });
  // 抽卡到揭晓
  let drawer = pages[0];
  for (const p of pages) { if (await p.evaluate(() => !!document.querySelector('#card-truth:not(.disabled)'))) { drawer = p; break; } }
  await drawer.click('#card-truth', { force: true });
  await drawer.waitForSelector('#card-section:not([hidden])', { timeout: 25000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3200));
  await pages[0].screenshot({ path: 'D:/myidea/truth-or-dare/.pw/shots/dbg-table-revealed.png' });
  await b.close(); server.close();
})();
