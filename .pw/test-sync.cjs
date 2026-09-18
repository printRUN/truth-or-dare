// 三个真实线上问题的回归测试：
//   1) 同房间号却互相看不见（客户端各落在不同 broker → 状态被网络分区）
//   2) 明明在线却显示掉线（整文档发布把别人心跳覆盖回旧值 + 跨设备时钟偏差）
//   3) 微信下载后是 content:// 私有地址，且非安全上下文里 navigator.clipboard 不存在，复制点了没反应
// 用法: node test-sync.cjs
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = 'D:/myidea/truth-or-dare';
const PORT = 8741;        // localhost：安全上下文
const PORT_LAN = 8742;    // 局域网 IP：非安全上下文（模拟微信 content:// 打开）
const log = (...a) => console.log('[sync]', ...a);
let fails = 0;
const ok = (cond, msg) => { log((cond ? '  ✅ ' : '  ❌ ') + msg); if (!cond) fails++; };

function serve(port, host) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    });
    s.listen(port, host, () => resolve(s));
  });
}

function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return '';
}

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) console.log('  · 资源加载失败', r.url().slice(0, 70), r.failure() && r.failure().errorText); });
  page.on('console', m => {
    // 资源加载失败（如 Google Fonts 在本地环境被 reset）不是页面 JS 报错，不计入回归
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${tag}] console.error: ${m.text()}`);
  });
}

async function join(page, { name, room, tag, offsetMs, local }) {
  watch(page, tag);
  if (offsetMs) {
    // 模拟对端手机时钟慢了 offsetMs（自动校时/手动设置都可能出现）
    await page.addInitScript(ms => {
      const real = Date.now.bind(Date);
      Date.now = () => real() - ms;
      window.__skew = ms;
    }, offsetMs);
  }
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.fill('#input-name', name);
  if (local) { await page.click('details.adv summary'); await page.click('#chk-local'); }
  if (room) await page.fill('#input-room', room);
  await page.click('.avatar-option >> nth=0');
  await page.click('#btn-join');
  await page.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  await page.evaluate(dismissGuide);
  return page;
}

// 首次进大厅 450ms 后会自动弹玩法说明（会拦截点击），等它出现再关
const dismissGuide = async () => {
  await new Promise(r => setTimeout(r, 900));
  closeGuide();
};

// 整文档 LWW 下，两边几乎同时入房时可能有一方的行被晚到的发布掉一下，
// selfHealJoin 会在 ~700ms 内自愈重加；这里轮询等名单对称
async function waitNames(pages, names, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const got = [];
    for (const p of pages) got.push(await p.locator('#players-grid .player-card .player-name').allTextContents());
    const good = got.every(list => names.every(n => list.includes(n)));
    if (good || Date.now() - t0 > ms) return got;
    await new Promise(r => setTimeout(r, 500));
  }
}

const cardOf = (page, name) =>
  page.evaluate(n => {
    const c = [...document.querySelectorAll('#players-grid .player-card')]
      .find(x => x.querySelector('.player-name')?.textContent.trim() === n);
    const p = (window.S || (typeof S !== 'undefined' ? S : null) || { players: [] }).players
      .find(x => x.name === n);
    return c ? { stale: c.classList.contains('stale'), seen: p ? p.lastSeen : null } : null;
  }, name);

(async () => {
  const ip = lanIp();
  const server = await serve(PORT, '127.0.0.1');
  const lanServer = ip ? await serve(PORT_LAN, ip) : null;
  const browser = await chromium.launch();

  // ── 1 & 2：B 的时钟慢 3 分钟（最恶劣的偏差方向），两人同房间 ────────────
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await join(a, { name: 'Alices', tag: 'A' });            // A 建房（留空即新建）
  const room = await a.evaluate(() => S.room);
  log(`房间 ${room}：A 正常时钟，B 时钟慢 3 分钟`);
  await join(b, { name: 'Bobskew', room, tag: 'B', offsetMs: 180000 });

  ok(a.url().includes('localhost'), 'A 已打开页面');
  const seen = await waitNames([a, b], ['Alices', 'Bobskew']);
  ok(seen.every(l => l.includes('Alices') && l.includes('Bobskew')), `双向名单对称（A:${seen[0]} B:${seen[1]}）`);

  const slotsA = await a.evaluate(() => link.slots.map(s => s.host));
  ok(slotsA.length >= 2, `A 同时连着 ${slotsA.length} 台 broker：${slotsA.join(' + ')}`);
  const pubAll = await a.evaluate(async () => {
    const before = link.slots.length;
    const rs = await Promise.all(link.slots.map(s => s.t.publish(link.topic, new TextEncoder().encode(JSON.stringify(S)), { retain: true })));
    return { before, ok: rs.filter(Boolean).length };
  });
  ok(pubAll.ok === pubAll.before, `状态写入 fan-out 到每台 broker（${pubAll.ok}/${pubAll.before}）`);

  // 心跳 25s / 灰化 40s：等 32s 让双方各发一轮心跳，再验在线状态
  log('等待 32s（两轮心跳窗口）……');
  await new Promise(r => setTimeout(r, 32000));

  const bOnA = await cardOf(a, 'Bobskew');
  const aOnB = await cardOf(b, 'Alices');
  ok(!!bOnA && !bOnA.stale, 'B 时钟慢 3 分钟，A 仍显示 B 在线（旧版此时必灰化「离线?」）');
  ok(!!aOnB && !aOnB.stale, 'A 在 B 侧同样显示在线');

  // 覆盖测试：A 侧看到的 B.lastSeen 只许向前
  const before = (await cardOf(a, 'Bobskew')).seen;
  for (let i = 0; i < 6; i++) {
    await a.evaluate(() => mutate(n => { n.stats.rounds = (n.stats.rounds || 0) + 1; }));   // A 连续发布整文档（心跳回写场景）
    await new Promise(r => setTimeout(r, 400));
  }
  const after = (await cardOf(a, 'Bobskew')).seen;
  ok(after >= before, `A 连发 6 帧整文档未把 B 的心跳写回去（${before} → ${after}）`);
  const bStillThere = await a.locator('#players-grid .player-card .player-name:text-is("Bobskew")').count();
  const aStillThere = await b.locator('#players-grid .player-card .player-name:text-is("Alices")').count();
  ok(bStillThere === 1 && aStillThere === 1, '名单仍然对称（没人被幽灵清理误删）');

  // ── 3：协议不是 http(s) 时（微信 content:// / file://）+ 非安全上下文无 clipboard API ────
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  watch(c, 'C-file');
  log('微信下载版等价场景：file:// 打开');
  await c.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html', { waitUntil: 'domcontentloaded' });
  await c.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await c.click('details.adv summary');
  await c.click('#chk-local');
  await c.fill('#input-name', 'Carol');
  await c.click('.avatar-option >> nth=0');
  await c.click('#btn-join');
  await c.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  await c.evaluate(dismissGuide);
  const cRoom = await c.evaluate(() => S.room);
  const inv0 = await c.evaluate(() => ({ local: isLocalPage(), url: shareUrl(), text: inviteText(), label: copyBtnLabel(), tip: document.getElementById('share-tip').textContent }));
  ok(inv0.local, `file:// 被识别为本地页（协议 ${await c.evaluate(() => location.protocol)}）`);
  ok(inv0.url === '', `本机地址不会被当成分享链接（shareUrl=${JSON.stringify(inv0.url)}）`);
  ok(inv0.text.includes(cRoom) && inv0.label.includes('房间号'), '邀请降级为房间号文案，按钮文案同步');
  ok(inv0.tip.includes(cRoom), '分享提示里直接给出房间号');
  await c.click('#copy-link-btn');
  await new Promise(r => setTimeout(r, 900));
  const c1 = await c.evaluate(() => ({
    label: document.getElementById('copy-link-btn').textContent,
    dialog: !document.getElementById('modal-mask').hidden && !!document.getElementById('copy-fallback'),
    clip: document.getElementById('copy-fallback') ? document.getElementById('copy-fallback').value : '',
  }));
  ok(c1.label.includes('已复制') || c1.dialog, `复制按钮不再静默失败（按钮「${c1.label}」/ 手动弹窗 ${c1.dialog}）`);
  if (c1.dialog) ok(c1.clip.includes(cRoom), '手动弹窗文本含房间号');
  // 记住过在线地址后，本地页也能给出可转发的在线链接
  const seeded = await c.evaluate(() => { try { localStorage.setItem('tod:home', 'https://example.com/tod/index.html'); return true; } catch { return false; } });
  if (seeded) {
    const inv1 = await c.evaluate(() => ({ url: shareUrl(), text: inviteText() }));
    ok(inv1.url === `https://example.com/tod/index.html?room=${cRoom}`, `用记下的在线地址拼邀请链接：${inv1.url}`);
    ok(inv1.text.includes(cRoom) && inv1.text.includes('https://example.com'), '邀请文案同时带链接与房间号');
  } else log('  ⚠️ file:// 下 localStorage 不可用，跳过在线地址记忆用例');

  let d = null;
  if (ip) {
    log(`非安全上下文验证：http://${ip}:${PORT_LAN}/index.html`);
    const ctxD = await browser.newContext();
    d = await ctxD.newPage();
    watch(d, 'D-lan');
    await d.goto(`http://${ip}:${PORT_LAN}/index.html?room=${room}`, { waitUntil: 'domcontentloaded' });
    await d.waitForSelector('#loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
    const env = await d.evaluate(() => ({ sec: window.isSecureContext, hasCb: !!navigator.clipboard, room: (new URLSearchParams(location.search).get('room') || '').toUpperCase() }));
    ok(!env.sec && !env.hasCb, `该环境确实没有 navigator.clipboard（isSecureContext=${env.sec}, clipboard=${env.hasCb}）`);
    ok(env.room === room, '?room= 参数在邀请链接里仍被识别');
    await d.fill('#input-name', 'Dave');
    await d.click('.avatar-option >> nth=0');
    await d.click('#btn-join');
    await d.waitForSelector('#screen-lobby.active', { timeout: 60000 });
    await d.evaluate(dismissGuide);
    const dSeen = await waitNames([d], ['Alices', 'Bobskew', 'Dave']);
    ok(dSeen[0].length === 3, `非安全上下文的第三端也能看到完整名单：${dSeen[0]}`);
    await d.click('#copy-link-btn');
    await new Promise(r => setTimeout(r, 900));
    const d1 = await d.evaluate(() => ({
      label: document.getElementById('copy-link-btn').textContent,
      dialog: !document.getElementById('modal-mask').hidden && !!document.getElementById('copy-fallback'),
    }));
    ok(d1.label.includes('已复制') || d1.dialog, `无 clipboard API 时复制走 execCommand/手动弹窗（「${d1.label}」/ ${d1.dialog}）`);
  } else {
    log('  ⚠️ 取不到局域网 IP，跳过非安全上下文用例');
  }

  // ── 4：所有 broker 连不上 → 本地模式，但后台 keeper 要能自动升回在线 ───────────
  const ctxE = await browser.newContext();
  const e = await ctxE.newPage();
  watch(e, 'E-outage');
  await e.addInitScript(() => {
    const Real = window.WebSocket;
    window.__blockWs = true;
    window.WebSocket = function (url, protos) {
      if (window.__blockWs && String(url).startsWith('wss://')) {
        const fake = {
          url: String(url), readyState: 0, binaryType: 'arraybuffer',
          onopen: null, onmessage: null, onerror: null, onclose: null,
          send() {}, close() { this.readyState = 3; },
        };
        setTimeout(() => { if (fake.onerror) fake.onerror(new Event('error')); if (fake.onclose) fake.onclose(new Event('close')); }, 0);
        return fake;
      }
      return protos ? new Real(url, protos) : new Real(url);
    };
    window.WebSocket.prototype = Real.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { window.WebSocket[k] = i; });
  });
  log('全 broker 不可达场景：加入后应降级本地模式，解禁后 keeper 自动补连');
  await e.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await e.waitForSelector('#loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await e.fill('#input-name', 'Eveoff');
  await e.click('.avatar-option >> nth=0');
  await e.click('#btn-join');
  await e.waitForSelector('#screen-lobby.active', { timeout: 60000 });
  await e.evaluate(dismissGuide);
  const outRoom = await e.evaluate(() => S.room);
  const degraded = await e.evaluate(() => ({ kind: link.kind, hosts: link.slots.map(s => s.host), tip: document.getElementById('share-tip').textContent }));
  ok(degraded.kind === 'local' && degraded.hosts.length === 1, `连不上时降级本地模式并告知用户：${JSON.stringify(degraded.hosts)}`);
  ok(degraded.tip.includes('连不上'), '大厅明确提示当前只有同浏览器多标签能互相看见');
  await e.evaluate(() => { window.__blockWs = false; });
  const upgraded = await e.waitForFunction(() => link.kind === 'mqtt' && link.alive, null, { timeout: 30000 })
    .then(() => e.evaluate(() => ({ kind: link.kind, hosts: link.slots.map(s => s.host) }))).catch(() => null);
  ok(!!upgraded, `网络恢复后不用刷新就自动升回在线：${upgraded ? upgraded.hosts.join(' + ') : '仍是本地模式'}`);
  // 升回在线后主动发一帧（等于下一次心跳），把本地期间的房间状态 fan-out 到各台 broker，新人才找得到
  await e.evaluate(async () => { await mutate(n => { n.stats.rounds = (n.stats.rounds || 0) + 1; }); });
  await new Promise(r => setTimeout(r, 800));
  const f = await ctxA.newPage();
  await join(f, { name: 'Fresh', room: outRoom, tag: 'F' });
  const fSeen = await waitNames([f], ['Eveoff', 'Fresh'], 25000);
  ok(fSeen[0].includes('Eveoff'), `断网期间建的房间恢复后别人能加入：${fSeen[0]}`);

  ok(errors.length === 0, `全程无 JS 报错${errors.length ? '\n' + errors.join('\n') : ''}`);

  await browser.close();
  server.close(); if (lanServer) lanServer.close();
  console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('❌ 测试异常:', e); process.exit(1); });
