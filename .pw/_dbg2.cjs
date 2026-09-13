const fs = require('fs');
const f = 'D:/myidea/truth-or-dare/.pw/probe-pan.cjs';
let s = fs.readFileSync(f, 'utf8');
const a = `    // 镜像：回扫 tx-back
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));`;
if (!s.includes(a)) { console.error('anchor missing'); process.exit(1); }
s = s.replace(a, `    // 镜像：回扫 tx-back
    await A.evaluate(() => {
      window.__log = [];
      const orig = window.queueSceneEnter;
      window.queueSceneEnter = function (...a2) { window.__log.push(['qse', ...a2, 'overlay:' + (() => { const o = document.getElementById('loading-overlay'); return !!o && o.isConnected && !o._hid; })()]); return orig.apply(this, a2); };
      const origRS = window.renderScreen;
      window.renderScreen = function (...a2) { try { return origRS.apply(this, a2); } catch (e) { window.__log.push(['rs-throw', e.message]); throw e; } };
    });
    await A.evaluate(() => mutate(n => { n.gameStarted = false; }));
    const qlog = await A.evaluate(() => window.__log);
    log('[镜像debug] qlog:', JSON.stringify(qlog));`);
fs.writeFileSync(f, s);
console.log('ok');
