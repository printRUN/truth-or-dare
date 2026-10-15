// 证据探针：版本检查（2026-10-15 缓存治理轮）决策表验证。
// 直接从 tod.html 抠出发布的 IIFE 源码（不复制副本），在 vm 沙箱注入假全局跑八种场景。
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('D:/myidea/truth-or-dare/tod.html', 'utf8');
const m = html.match(/window\.__BUILD__\s*=\s*'[^']+';([\s\S]*?)\(function \(\) \{([\s\S]*?)\}\)\(\);/);
if (!m) { console.log('FAIL  版本检查 IIFE 没抠到'); process.exit(1); }
const iife = '(function () {' + m[2] + '})();';

let fail = 0;
const ok = (cond, tag, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' · ' + tag + (cond ? '' : '  ' + JSON.stringify(extra || ''))); if (!cond) fail++; };

function runScene({ protocol, port, build, server, jumped, activeScreen, url, fetchOk }) {
  let replaced = null, toasted = null, fetched = 0, session = {};
  if (jumped) session['tod:vjump:/tod.html'] = jumped;   // 护栏票按页键（业务检查官终审修订后的键形）
  const sandbox = {
    window: { __BUILD__: build },
    location: {
      protocol, port, pathname: '/tod.html', hash: '', search: url || '',
      replace: u => { replaced = u; },
    },
    sessionStorage: {
      getItem: k => (k in session ? session[k] : null),
      setItem: (k, v) => { session[k] = v; },
    },
    document: { querySelector: () => (activeScreen ? { id: activeScreen } : null) },
    toast: t => { toasted = t; },
    URLSearchParams,
    Date,
    fetch: () => { fetched++; return fetchOk === false ? Promise.reject(new Error('net')) : Promise.resolve({ ok: true, json: () => Promise.resolve({ build: server }) }); },
  };
  sandbox.self = sandbox.window;
  try { vm.runInNewContext(iife, sandbox, { timeout: 2000 }); } catch (e) { return { replaced, toasted, fetched, session, err: e.message }; }
  // IIFE 内 fetch 链是微任务：flush 一下
  return Promise.resolve().then(() => new Promise(r => setImmediate(r))).then(() => ({ replaced, toasted, fetched, session }));
}

(async () => {
  // ① 版本一致：不 fetch 不跳（先短路在 protocol/port 守卫——这里 https 无端口会 fetch，断言无 replace）
  let r = await runScene({ protocol: 'https:', port: '', build: 'vA', server: 'vA', activeScreen: 'screen-join' });
  ok(r.replaced === null, '① 版本一致 → 不强刷', r);

  // ② 有新版 + join 屏 + 没跳过 → replace 带 v/nc 且保留既有 room 参数
  r = await runScene({ protocol: 'https:', port: '', build: 'vA', server: 'vB', activeScreen: 'screen-join', url: '?room=ABC12' });
  ok(r.replaced && r.replaced.includes('v=vB') && r.replaced.includes('room=ABC12') && r.replaced.includes('nc='), '② join 屏有新版 → 强刷且保留 room', r.replaced);
  ok(r.session['tod:vjump:/tod.html'] === 'vB', '② 护栏票已写（按页键）', r.session);

  // ③ 同一目标版本本会话已刷过 → 不再刷（死循环护栏）
  r = await runScene({ protocol: 'https:', port: '', build: 'vA', server: 'vB', jumped: 'vB', activeScreen: 'screen-join' });
  ok(r.replaced === null, '③ 已跳过同版本 → 不再刷', r);

  // ④ 对局中 → 不刷、只 toast
  r = await runScene({ protocol: 'https:', port: '', build: 'vA', server: 'vB', activeScreen: 'screen-game' });
  ok(r.replaced === null && /新版本/.test(r.toasted || ''), '④ 对局中 → 只提示不打断', r);

  // ⑤ http 带端口（探针/局域网）→ 检查整体短路，连 fetch 都不发
  r = await runScene({ protocol: 'http:', port: '8881', build: 'vA', server: 'vB', activeScreen: 'screen-join' });
  ok(r.fetched === 0 && r.replaced === null, '⑤ 带端口 → 短路零请求', r);

  // ⑥ file:// 下载版 → 短路
  r = await runScene({ protocol: 'file:', port: '', build: 'vA', server: 'vB', activeScreen: 'screen-join' });
  ok(r.fetched === 0 && r.replaced === null, '⑥ file:// → 短路零请求', r);

  // ⑦ fetch 失败 → 静默无动作不抛
  r = await runScene({ protocol: 'https:', port: '', build: 'vA', server: 'vB', activeScreen: 'screen-join', fetchOk: false });
  ok(r.replaced === null && !r.err, '⑦ fetch 失败 → 静默', r);

  // ⑧ 旧 URL 已带 v=old → 覆写成新 token
  r = await runScene({ protocol: 'https:', port: '', build: 'vOld', server: 'vNew', activeScreen: 'screen-arcade', url: '?v=vOld&room=ZZ9' });
  ok(r.replaced && r.replaced.includes('v=vNew') && !r.replaced.includes('v=vOld') && r.replaced.includes('room=ZZ9'), '⑧ 旧 v 参数 → 覆写为新 token 且保留 room', r.replaced);

  console.log(fail ? `\nFAILED: ${fail}` : '\nALL PASS · 版本检查决策表 8/8');
  process.exit(fail ? 1 : 0);
})();
