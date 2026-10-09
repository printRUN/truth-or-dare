// av3-bombcat.cjs — A 组 bombcat.html 真实玩家模拟取证（端口 9141）
// 6 个不同色相/表情的猫头像（localStorage cat:av-pick 表单流注入）→ 本地模式 6 标签真实建房/开局 →
// 自然全景 + 仪摄每角色正面/斜 55° 头部特写（角色在桌外；球面贴图脸贴纸感取证）。
// 相机/角色经只读原型钩子捕获（Scene.prototype.add / PerspectiveCamera.prototype.updateMatrixWorld，
// addInitScript 在页面脚本前注入）——不改任何仓库文件。
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 9141;
const SHOTS = path.join(ROOT, '.pw', 'shots', 'av3-persona');
fs.mkdirSync(SHOTS, { recursive: true });

// 猫头像池：色相 × 表情种子（bc:HUE:variant）——橘/黄/绿/青/蓝/粉，眼睛大小各异
const CAST = [
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
const errors = [];
const log = (...a) => console.log('[bc-av3]', ...a);

async function shoot(tab, name) {
  await tab.bringToFront();
  await tab.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (tab === null) {}
  await tab.evaluate(() => { if (window.__bcScene && window.__bcScene.forceRender) window.__bcScene.forceRender(); });
  await sleep(140);
  await tab.screenshot({ path: path.join(SHOTS, name) });
  log('📸', name);
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const openTab = async (tag, i, instrument) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
    // 头像走真实表单状态：localStorage cat:av-pick 在页面脚本前写入（doJoin 读 pickedAv）
    await p.addInitScript(av => { try { localStorage.setItem('cat:av-pick', av); localStorage.removeItem('cat:room'); localStorage.removeItem('cat:me'); } catch {} }, CAST[i].av);
    if (instrument) {
      // 只读取证钩子：捕获 THREE scene 与相机（页面脚本运行前挂原型）
      await p.addInitScript(() => {
        const hook = () => {
          if (window.THREE && !window.__av3hooked) {
            window.__av3hooked = true;
            const oAdd = THREE.Object3D.prototype.add;
            THREE.Object3D.prototype.add = function (...os) {
              if (os[0] && !window.__av3scene) { let r = this; while (r.parent) r = r.parent; window.__av3scene = r; }
              return oAdd.apply(this, os);
            };
            const PC = THREE.PerspectiveCamera;
            const Wrapped = function (...a) { const c = new PC(...a); window.__av3cam = c; return c; };
            Wrapped.prototype = PC.prototype;
            THREE.PerspectiveCamera = Wrapped;
          } else if (!window.THREE) { setTimeout(hook, 0); }
        };
        hook();
      });
    }
    await p.goto(`http://127.0.0.1:${PORT}/bombcat.html?r=${i}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelector('#btn-join') && !document.querySelector('#btn-join').disabled, null, { timeout: 15000 });
    return p;
  };
  const join = async (p, name, room) => {
    const adv = await p.$('details.adv');
    if (adv && !(await p.evaluate(el => el.open, adv))) await p.click('details.adv summary');
    await p.click('#chk-local');
    await p.fill('#in-name', name);
    if (room) { await p.click('#in-room'); await p.fill('#in-room', room); }
    await p.click('#btn-join');
    await p.waitForSelector('#screen-lobby.active', { timeout: 15000 });
  };

  // ── 1. 建房 + 5 人加入（本地模式多标签，真实表单流）──
  const tabs = [];
  const host = await openTab('P0', 0, true);
  await join(host, CAST[0].name, '');
  const room = (await host.textContent('#share-room')).trim();
  log('room =', room);
  tabs.push(host);
  for (let i = 1; i < 6; i++) {
    const t = await openTab('P' + i, i, false);
    await join(t, CAST[i].name, room);
    tabs.push(t);
    await sleep(250);
  }
  await host.waitForFunction(() => document.querySelectorAll('#lobby-players .pchip').length >= 6, null, { timeout: 20000 });
  log('6 猫到齐');

  // ── 2. 开局 ──
  await host.click('#btn-start');
  for (const t of tabs) await t.waitForSelector('#screen-game.active', { timeout: 20000 });
  await host.waitForFunction(() => !!window.__bcScene, null, { timeout: 20000 });
  await sleep(4200);   // 等发牌/入场演出落定

  const roster = await host.evaluate(() => window.__cat.S.players.map((p, i) => ({ i, id: p.id, name: p.name, av: p.av })));
  log('roster:', JSON.stringify(roster));

  // 场景/相机/角色就位确认（经原型钩子捕获）
  const ready = await host.evaluate(() => {
    if (!window.__av3scene || !window.__av3cam) return { ok: false };
    const found = {};
    window.__av3scene.traverse(o => {
      if (o.userData && o.userData.pid && o.userData.head) {
        const pid = o.userData.pid;
        if (!found[pid]) found[pid] = [];
        found[pid].push({ attached: !!o.parent, inScene: (() => { let r = o, hops = 0; while (r.parent && hops < 20) { r = r.parent; hops++; } return r === window.__av3scene; })(), headY: +o.userData.head.getWorldPosition(new THREE.Vector3()).y.toFixed(2) });
      }
    });
    return { ok: true, sceneChildren: window.__av3scene.children.length, nCameras: (() => { let n = 0; window.__av3scene.traverse(o => { if (o.isCamera) n++; }); return n; })(), camParent: !!window.__av3cam.parent, found };
  });
  log('instrument ready:', JSON.stringify(ready).slice(0, 900));
  if (!ready.ok) throw new Error('scene/camera hook failed');

  // ── 3. 2D 参考照（页面内 resolveAv 真实渲染网格）──
  await host.evaluate(() => {
    let o = document.getElementById('av3-2dref');
    if (o) o.remove();
    o = document.createElement('div');
    o.id = 'av3-2dref';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#151527;display:flex;gap:14px;padding:22px;';
    o.innerHTML = window.__cat.S.players.map((p, i) =>
      `<div style="width:180px;text-align:center"><img src="${resolveAv(p.av)}" style="width:150px;height:150px;border-radius:16px;background:#243"><div style="color:#fff;font:700 15px sans-serif;margin-top:6px">${i}. ${p.name}</div></div>`
    ).join('');
    document.body.appendChild(o);
  });
  await sleep(700);
  await host.bringToFront();
  await sleep(200);
  await (await host.$('#av3-2dref')).screenshot({ path: path.join(SHOTS, 'bc-av3-2d-reference.png') });
  log('📸 bc-av3-2d-reference.png');
  await host.evaluate(() => { const o = document.getElementById('av3-2dref'); if (o) o.remove(); });

  // ── 4. 自然全景（固定机位 + 指针视差归零）──
  await shoot(host, 'bc-av3-wide.png');

  // ── 5. 仪摄：每角色正面 0.62 + 斜 55° 0.72 头部特写（冻结帧循环相机接管）──
  const frozen = await host.evaluate(() => {
    const cam = window.__av3cam;
    if (!cam.__frz) {
      cam.__frz = true;
      cam.__opos = cam.position.set; cam.__ola = cam.lookAt;
      cam.position.set = () => {}; cam.lookAt = () => {};
    }
    return true;
  });
  log('camera frozen =', frozen);
  const chars = await host.evaluate(() => {
    const m = new Map();
    window.__av3scene.traverse(o => { if (o.userData && o.userData.pid && o.userData.head) m.set(o.userData.pid, o); });
    return window.__cat.S.players.map(p => p.id).map(id => !!m.get(id));
  });
  for (let i = 0; i < roster.length; i++) {
    const pid = roster[i].id;
    const aim = await host.evaluate(([pid, ang, dist]) => {
      const cam = window.__av3cam;
      let ch = null;
      window.__av3scene.traverse(o => { if (o.userData && o.userData.pid === pid && o.userData.head) ch = o; });
      if (!ch) return 'nochar';
      const head = ch.userData.head.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(-head.x, 0, -head.z).normalize();   // 脸朝桌心
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang * Math.PI / 180);
      const eye = head.clone().addScaledVector(dir, dist);
      eye.y = head.y + 0.02;
      cam.position.copy(eye);
      const m = new THREE.Matrix4().lookAt(eye, head, new THREE.Vector3(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
      window.__bcScene.forceRender();
      return 'ok';
    }, [pid, 0, 0.62]).catch(e => 'err:' + e.message);
    if (aim !== 'ok') { log('aim fail', i, aim); continue; }
    const dbg = await host.evaluate(([pid]) => {
      const cam = window.__av3cam;
      let ch = null;
      window.__av3scene.traverse(o => { if (o.userData && o.userData.pid === pid && o.userData.head) ch = o; });
      const head = ch.userData.head.getWorldPosition(new THREE.Vector3());
      const pr = head.clone().project(cam);
      const mw = ch.matrixWorld.elements;
      return {
        camPos: cam.position.toArray().map(v => +v.toFixed(2)),
        chPos: ch.position.toArray().map(v => +v.toFixed(2)),
        leanPos: ch.userData.lean.position.toArray().map(v => +v.toFixed(2)),
        mwT: [mw[12], mw[13], mw[14]].map(v => +v.toFixed(2)),
        autoUp: ch.matrixAutoUpdate,
        headW: head.toArray().map(v => +v.toFixed(2)),
        headScreen: [Math.round((pr.x + 1) / 2 * 1280), Math.round((1 - (pr.y + 1) / 2) * 800)],
        visible: ch.visible,
        scale: +ch.scale.x.toFixed(2),
      };
    }, [pid]).catch(e => ({ err: e.message }));
    log('shot', i, JSON.stringify(dbg));
    await shoot(host, `bc-av3-head-${i}-front.png`);
    await host.evaluate(([pid, ang, dist]) => {
      const cam = window.__av3cam;
      let ch = null;
      window.__av3scene.traverse(o => { if (o.userData && o.userData.pid === pid && o.userData.head) ch = o; });
      const head = ch.userData.head.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(-head.x, 0, -head.z).normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang * Math.PI / 180);
      const eye = head.clone().addScaledVector(dir, dist);
      eye.y = head.y + 0.03;
      cam.position.copy(eye);
      const m = new THREE.Matrix4().lookAt(eye, head, new THREE.Vector3(0, 1, 0));
      cam.quaternion.setFromRotationMatrix(m);
      window.__bcScene.forceRender();
    }, [pid, 55, 0.72]);
    await shoot(host, `bc-av3-head-${i}-oblique.png`);
  }
  // 解冻
  await host.evaluate(() => {
    const cam = window.__av3cam;
    if (cam.__frz) { cam.position.set = cam.__opos; cam.lookAt = cam.__ola; cam.__frz = false; }
  });

  // ── 6. 材质取证：发壳色/头球色/脸贴图 ──
  const mats = await host.evaluate(() => {
    const out = [];
    window.__av3scene.traverse(o => {
      if (o.userData && o.userData.pid && o.userData.head) {
        const u = o.userData;
        const p = window.__cat.S.players.find(q => q.id === u.pid);
        out.push({ name: p ? p.name : u.pid, hair: '#' + u.hair.material.color.getHexString(), headColor: '#' + u.head.material.color.getHexString(), faceMap: !!u.face.material.map });
      }
    });
    return out;
  });
  log('materials:', JSON.stringify(mats));
  fs.writeFileSync(path.join(ROOT, '.pw', 'persona-av3', 'bc-materials.json'), JSON.stringify({ roster, mats }, null, 2));

  log(errors.length ? 'PAGE ERRORS:\n' + errors.slice(0, 6).join('\n') : 'no page errors ✅');
  await browser.close();
  server.close();
  console.log('BOMBCAT AV3 PROBE DONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
