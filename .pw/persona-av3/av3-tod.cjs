// av3-tod.cjs — A 组 tod.html 真实玩家模拟取证（端口 9141，分支 feat/3d-avatars）
// 6 个特征鲜明头像（深/浅肤、秃头、黑长发+眼镜、络腮胡、粉发、丸子头）→ 本地模式 6 标签真实对局流 →
// 自然全景/揭晓近景截图 + 仪摄每角色正面/斜 55° 头部特写（贴图脸贴纸感取证）。
// 只读取证：不改任何仓库现有文件；截图与脚本都在 A 组自建目录。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 9141;
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
fs.mkdirSync(SHOTS, { recursive: true });

const CAST = [
  { name: '阿泽',   recipe: 'dcb:{"s":"adventurer","d":"Zoe"}',  feat: '深肤+浅蓝长发' },
  { name: '老白',   recipe: 'dcb:{"s":"micah","d":"Felix"}',     feat: '浅肤+秃头+胡茬' },
  { name: '眼镜妹', recipe: 'dcb:{"s":"miniavs","d":"Felix"}',   feat: '黑长发+圆眼镜' },
  { name: '络腮胡', recipe: 'dcb:{"s":"avataaars","d":"Mika"}',  feat: '深肤+红络腮胡' },
  { name: '粉毛',   recipe: 'dcb:{"s":"personas","d":"Jack"}',   feat: '粉短发' },
  { name: '丸奶奶', recipe: 'dcb:{"s":"open-peeps","d":"Mika"}', feat: '灰白丸子头+眼镜' },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, MIME[path.extname(f)] || 'application/octet-stream'); res.end(d); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const log = (...a) => console.log('[tod-av3]', ...a);

async function shoot(tab, name) {
  await tab.bringToFront();
  await tab.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(160);
  await tab.screenshot({ path: path.join(SHOTS, name) });
  log('📸', name);
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tod:guide', '1'); localStorage.setItem('tod:perf', 'full'); } catch {} });

  const openTab = async tag => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/tod.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
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

  // ── 1. 建房 + 5 人加入（本地模式多标签，真实表单流）──
  const tabs = [];
  const host = await openTab('P0');
  await join(host, CAST[0].name, '');
  const room = (await host.textContent('#share-room')).trim();
  log('room =', room);
  tabs.push(host);
  for (let i = 1; i < 6; i++) {
    const t = await openTab('P' + i);
    await join(t, CAST[i].name, room);
    tabs.push(t);
    await sleep(250);
  }
  await host.waitForFunction(() => typeof S !== 'undefined' && S && S.players && S.players.length === 6, null, { timeout: 20000 });
  log('6 人到齐');

  // ── 2. 开局 ──
  await host.click('#btn-start');
  for (const t of tabs) await t.waitForSelector('#screen-game.active', { timeout: 20000 });
  await host.waitForFunction(() => document.body.classList.contains('three3d'), null, { timeout: 10000 });
  for (const t of tabs) await t.evaluate(() => { const g = document.getElementById('guide-mask'); if (g && !g.hidden) g.hidden = true; }).catch(() => {});
  await sleep(3200);   // 等入场运镜落定

  // ── 3. 注入 6 个定制头像配方（走 mutate = 状态正道，各端同步）──
  await host.evaluate(recipes => mutate(s => { s.players.forEach((p, i) => { if (recipes[i]) p.avatar = recipes[i]; }); }), CAST.map(c => c.recipe));
  await host.waitForFunction(() => {
    if (!window.__three) return false;
    for (const p of S.players) {
      const ch = window.__three.chars.get(p.id);
      if (!ch || !ch.userData.face.material.map) return false;
    }
    return true;
  }, null, { timeout: 15000 });
  const roster = await host.evaluate(() => S.players.map((p, i) => ({ i, id: p.id, name: p.name, av: (p.avatar || '').slice(0, 40) })));
  log('roster:', JSON.stringify(roster));

  // ── 4. 2D 参考照（页面内真实 resolveAvatar 渲染的网格）──
  await host.evaluate(names => {
    let o = document.getElementById('av3-2dref');
    if (o) o.remove();
    o = document.createElement('div');
    o.id = 'av3-2dref';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#151527;display:flex;flex-wrap:wrap;gap:14px;padding:22px;align-content:flex-start;';
    o.innerHTML = S.players.map((p, i) =>
      `<div style="width:180px;text-align:center"><img src="${resolveAvatar(p.avatar)}" style="width:150px;height:150px;border-radius:16px;background:#243"><div style="color:#fff;font:700 15px sans-serif;margin-top:6px">${i}. ${p.name}</div></div>`
    ).join('');
    document.body.appendChild(o);
  }, CAST.map(c => c.name + ' ' + c.feat));
  await sleep(900);
  await host.bringToFront();
  await sleep(200);
  await (await host.$('#av3-2dref')).screenshot({ path: path.join(SHOTS, 'tod-av3-2d-reference.png') });
  log('📸 tod-av3-2d-reference.png');
  await host.evaluate(() => { const o = document.getElementById('av3-2dref'); if (o) o.remove(); });

  // ── 5. 自然全景（choosing 常态机位）──
  await sleep(600);
  await shoot(host, 'tod-av3-wide.png');

  // ── 6. 自然揭晓近景：本回合持麦人 choose() 抽卡 → revealed+shown 推镜 ──
  const chooserIdx = await host.evaluate(() => S.players.findIndex(p => p.id === S.turn.chooserId));
  const chooserTab = tabs[chooserIdx] || host;
  log('chooser =', chooserIdx, CAST[chooserIdx].name);
  await chooserTab.evaluate(() => choose('truth'));   // three3d 下 DOM 卡不可点，走全局 choose（probe-persona-full 同款）
  await chooserTab.waitForFunction(() => S.turn.stage === 'revealed', null, { timeout: 30000 });
  await chooserTab.waitForFunction(() => window.__three && window.__three.fxState().cardPhase === 'shown', null, { timeout: 15000 }).catch(() => log('cardPhase shown timeout'));
  await sleep(1900);   // 等揭晓推镜(1.15s)落定
  await shoot(chooserTab, 'tod-av3-reveal.png');
  const specIdx = (chooserIdx + 2) % 6;
  await shoot(tabs[specIdx], 'tod-av3-reveal-spec.png');

  // ── 7. 收尾本回合 → 回 choosing，准备仪摄 ──
  await chooserTab.waitForSelector('#btn-accept', { state: 'visible', timeout: 10000 }).catch(() => log('btn-accept not visible'));
  await chooserTab.click('#btn-accept').catch(e => log('accept err', e.message));
  await chooserTab.waitForFunction(() => S.turn.stage === 'choosing', null, { timeout: 15000 }).catch(() => log('back to choosing timeout'));
  await sleep(1500);

  // ── 8. 仪摄：每角色正面 0.62 + 斜 55° 0.72 头部特写（冻结帧循环相机接管）──
  await host.evaluate(() => {
    const cam = window.__three.camera;
    if (!cam.__frz) {
      cam.__frz = true;
      cam.__opos = cam.position.set; cam.__ola = cam.lookAt; cam.__ory = cam.rotateY; cam.__orz = cam.rotateZ;
      cam.position.set = () => {}; cam.lookAt = () => {}; cam.rotateY = () => {}; cam.rotateZ = () => {};
    }
  });
  const pids = await host.evaluate(() => S.players.map(p => p.id));
  for (let i = 0; i < pids.length; i++) {
    const pid = pids[i];
    await host.evaluate(([pid, ang, dist]) => {
      const T = window.THREE || (window.__three.camera.position.constructor); // THREE 全局兜底
      const cam = window.__three.camera, ch = window.__three.chars.get(pid);
      const head = ch.userData.head.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(-head.x, 0, -head.z).normalize();   // 脸朝桌心
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang * Math.PI / 180);
      const eye = head.clone().addScaledVector(dir, dist);
      eye.y = head.y + 0.02;
      cam.position.copy(eye);
      const m = new THREE.Matrix4().lookAt(eye, head, new THREE.Vector3(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
    }, [pid, 0, 0.62]);
    await shoot(host, `tod-av3-head-${i}-front.png`);
    await host.evaluate(([pid, ang, dist]) => {
      const cam = window.__three.camera, ch = window.__three.chars.get(pid);
      const head = ch.userData.head.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(-head.x, 0, -head.z).normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang * Math.PI / 180);
      const eye = head.clone().addScaledVector(dir, dist);
      eye.y = head.y + 0.03;
      cam.position.copy(eye);
      const m = new THREE.Matrix4().lookAt(eye, head, new THREE.Vector3(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
    }, [pid, 55, 0.72]);
    await shoot(host, `tod-av3-head-${i}-oblique.png`);
  }
  // 解冻相机
  await host.evaluate(() => {
    const cam = window.__three.camera;
    if (cam.__frz) {
      cam.position.set = cam.__opos; cam.lookAt = cam.__ola; cam.rotateY = cam.__ory; cam.rotateZ = cam.__orz;
      cam.__frz = false;
    }
  });

  // ── 9. 附加取证：发型壳颜色 vs 头像发色（读 userData.hair 材质色 + 头球肤色）──
  const mats = await host.evaluate(() => {
    const out = [];
    for (const p of S.players) {
      const ch = window.__three.chars.get(p.id);
      if (!ch) continue;
      const u = ch.userData;
      out.push({
        name: p.name,
        hair: '#' + u.hair.material.color.getHexString(),
        headColor: '#' + u.head.material.color.getHexString(),
        faceMap: !!u.face.material.map,
        faceMapColor: '#' + u.face.material.color.getHexString(),
      });
    }
    return out;
  });
  log('materials:', JSON.stringify(mats));
  fs.writeFileSync(path.join(ROOT, '.pw', 'persona-av3', 'tod-materials.json'), JSON.stringify({ roster, mats }, null, 2));

  log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 6).join('\n') : 'no page errors ✅');
  await browser.close();
  server.close();
  console.log('TOD AV3 PROBE DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
