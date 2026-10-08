// stage-loaders.cjs — 加载动画轮分拣：从 HEAD 重建「只含本人加载重设计」的索引版（并行 W6/W2 WIP 不入索引）
const fs = require('fs');
const { execSync } = require('child_process');
const wt = f => fs.readFileSync(f, 'utf8');
const head = f => execSync(`git show HEAD:${f}`, { encoding: 'utf8', maxBuffer: 1e8 });
function rep(s, from, to, tag) {
  if (!s.includes(from)) throw new Error('[' + tag + '] anchor missing: ' + from.slice(0, 60));
  return s.replace(from, to);
}
function between(s, a, b) {
  const i = s.indexOf(a), j = s.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('between not found: ' + a.slice(0, 40));
  return s.slice(i, j + b.length);
}

// ── monopoly ──
let mo = head('monopoly.html');
const mw = wt('monopoly.html');
{
  const nw = between(mw, '  /* 加载重设计（加载动画轮）：双骰 3D 翻滚 + 射灯背景 + 精修进度条；REDUCED/loperf 静态退路在 REDUCED 块 */', '  .loader-bar i { display: block; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, var(--accent-cyan), var(--primary)); box-shadow: 0 0 12px rgba(34,211,238,0.6); transition: width 0.3s ease; }');
  const ho = between(mo, '  .loader-box { text-align: center; }', '  .loader-bar i { display: block; height: 100%; width: 0; border-radius: 2px; background: linear-gradient(90deg, var(--accent-cyan), var(--primary)); transition: width 0.3s ease; }');
  mo = mo.replace(ho, nw);
}
mo = rep(mo, '    <div class="loader-ico">🎲</div>', `    <div class="dice-stage" aria-hidden="true">
      <div class="die d1"><div class="f f1 p1"></div><div class="f f2 p6"></div><div class="f f3 p3"></div><div class="f f4 p4"></div><div class="f f5 p5"></div><div class="f f6 p2"></div></div>
      <div class="die d2"><div class="f f1 p5"></div><div class="f f2 p2"></div><div class="f f3 p6"></div><div class="f f4 p3"></div><div class="f f5 p1"></div><div class="f f6 p4"></div></div>
      <div class="dice-shadow"></div>
    </div>`, 'mono-markup');
mo = rep(mo, '    .loader-ico, .pchip.active,', '    .die, .dice-shadow, .loader-box p, .pchip.active,', 'mono-reduced');
mo = rep(mo, '    .pchip.active { box-shadow: 0 0 0 1.5px var(--accent-cyan); }', '    .die, .dice-shadow, .loader-box p { animation: none !important; }\n    .die.d1 { transform: translate(-26px, 4px) rotateX(-18deg) rotateY(16deg); }\n    .die.d2 { transform: translate(26px, 4px) rotateY(-22deg) rotateX(12deg); }   /* REDUCED 静态定帧：双骰分立成静物 */\n    .pchip.active { box-shadow: 0 0 0 1.5px var(--accent-cyan); }', 'mono-reduced-pose');
mo = rep(mo, '  body.loperf .loader-box.warp-in { animation: none; transform: none; }   /* warp-in 退路：loperf 不挂（JS 同门禁，双保险） */', `  body.loperf .loader-box.warp-in { animation: none; transform: none; }   /* warp-in 退路：loperf 不挂（JS 同门禁，双保险） */
  body.loperf .die, body.loperf .dice-shadow, body.loperf .loader-box p { animation: none; }
  body.loperf .die.d1 { transform: translate(-26px, 4px) rotateX(-18deg) rotateY(16deg); }
  body.loperf .die.d2 { transform: translate(26px, 4px) rotateY(-22deg) rotateX(12deg); }`, 'mono-loperf');

// ── uno ──
let un = head('uno.html');
const uw = wt('uno.html');
{
  const nw = between(uw, '  /* 加载重设计（加载动画轮）：三卡扇洗牌 + 射灯背景 + 精修进度条；REDUCED/loperf 静态退路在 REDUCED 块 */', '  .loader-bar i { display: block; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, var(--accent-cyan), var(--primary)); box-shadow: 0 0 12px rgba(34,211,238,0.6); transition: width 0.3s ease; }');
  const ho = between(un, '  .loader-box { text-align: center; }', '  .loader-bar i { display: block; height: 100%; width: 0; border-radius: 2px; background: linear-gradient(90deg, var(--accent-cyan), var(--primary)); transition: width 0.3s ease; }');
  un = un.replace(ho, nw);
}
un = rep(un, '    <div class="loader-ico">🃏</div>', `    <div class="fan-stage" aria-hidden="true">
      <div class="fan-card c1"></div>
      <div class="fan-card c2"></div>
      <div class="fan-card c3"></div>
    </div>`, 'uno-markup');
un = rep(un, '    .loader-ico, .pchip.active,', '    .fan-card, .loader-box p, .pchip.active,', 'uno-reduced');
un = rep(un, '    .pchip.active { box-shadow: 0 0 0 1.5px var(--accent-cyan); }', '    .fan-card, .loader-box p { animation: none !important; }\n    .fan-card.c1 { transform: rotate(-17deg) translateX(-9px); }\n    .fan-card.c2 { transform: rotate(0deg); }\n    .fan-card.c3 { transform: rotate(17deg) translateX(9px); }   /* REDUCED 静态定帧：三卡成扇 */\n    .pchip.active { box-shadow: 0 0 0 1.5px var(--accent-cyan); }', 'uno-reduced-pose');
un = rep(un, '  body.loperf .loader-box.warp-in, html.turbo .loader-box.warp-in { animation: none; }   /* warp-in 低性能/探针档静态退路 */', `  body.loperf .loader-box.warp-in, html.turbo .loader-box.warp-in { animation: none; }   /* warp-in 低性能/探针档静态退路 */
  body.loperf .fan-card, body.loperf .loader-box p { animation: none; }
  body.loperf .fan-card.c1 { transform: rotate(-17deg) translateX(-9px); }
  body.loperf .fan-card.c2 { transform: rotate(0deg); }
  body.loperf .fan-card.c3 { transform: rotate(17deg) translateX(9px); }`, 'uno-loperf');

// ── tod ──
let td = head('tod.html');
const tw = wt('tod.html');
{
  const nw = between(tw, '    .loading-overlay { position: fixed; inset: 0; background: rgba(10,10,26,0.95); z-index: 1000;', '    @keyframes loader-sweep { from { transform: translateX(-110%); } to { transform: translateX(360%); } }');
  const ho = between(td, '    .loading-overlay { position: fixed; inset: 0; background: rgba(10,10,26,0.95); z-index: 1000;', '    @keyframes loader-sweep { from { transform: translateX(-110%); } to { transform: translateX(360%); } }');
  td = td.replace(ho, nw);
}
td = rep(td, `  <div class="loader-stage">
    <div class="loader-orbit"><i></i><i></i><i></i></div>
    <div class="loader-card">🎭</div>
  </div>`, `  <div class="loader-stage">
    <div class="loader-echo el"></div>
    <div class="loader-echo er"></div>
    <div class="loader-orbit"><i></i><i></i><i></i></div>
    <div class="loader-card">🎭</div>
    <div class="loader-sheen"></div>
  </div>`, 'tod-markup');
td = rep(td, '      .loader-card, .loader-orbit, .player-card.speaking .wave, .punishment-text.typing,', '      .loader-card, .loader-orbit, .loader-echo, .loader-sheen, .loading-text, .player-card.speaking .wave, .punishment-text.typing,', 'tod-reduced');
td = rep(td, `    body.loperf .loader-stage.warp-in { animation: none !important; transform: none !important; }
    body.loperf .loader-stage.warp-in::after { content: none !important; }`, `    body.loperf .loader-stage.warp-in { animation: none !important; transform: none !important; }
    body.loperf .loader-stage.warp-in::after { content: none !important; }
    body.loperf .loader-echo, body.loperf .loader-sheen, body.loperf .loading-text { animation: none !important; }`, 'tod-loperf');
td = rep(td, "o.innerHTML = '<div class=\"loader-stage\"><div class=\"loader-orbit\"><i></i><i></i><i></i></div><div class=\"loader-card\">🎭</div></div><div class=\"loading-text\"></div><div class=\"loader-progress\"><i></i></div>';",
  "o.innerHTML = '<div class=\"loader-stage\"><div class=\"loader-echo el\"></div><div class=\"loader-echo er\"></div><div class=\"loader-orbit\"><i></i><i></i><i></i></div><div class=\"loader-card\">🎭</div><div class=\"loader-sheen\"></div></div><div class=\"loading-text\"></div><div class=\"loader-progress\"><i></i></div>';", 'tod-jsbuilder');

// ── index ──
let ix = head('index.html');
const iw = wt('index.html');
{
  const nw = between(iw, '    .loading-overlay { position: fixed; inset: 0; background: rgba(10,10,26,0.95); z-index: 1000;', '    @keyframes loader-sweep { from { transform: translateX(-110%); } to { transform: translateX(360%); } }');
  const ho = between(ix, '    .loading-overlay { position: fixed; inset: 0; background: rgba(10,10,26,0.95); z-index: 1000;', '    @keyframes loader-sweep { from { transform: translateX(-110%); } to { transform: translateX(360%); } }');
  ix = ix.replace(ho, nw);
}
ix = rep(ix, `  <div class="loader-stage">
    <div class="loader-orbit"><i></i><i></i><i></i></div>
    <div class="loader-card">🎭</div>
  </div>`, `  <div class="loader-stage">
    <div class="loader-echo el"></div>
    <div class="loader-echo er"></div>
    <div class="loader-orbit"><i></i><i></i><i></i></div>
    <div class="loader-card">🎭</div>
    <div class="loader-sheen"></div>
  </div>`, 'index-markup');
ix = rep(ix, '      .loader-card, .loader-orbit, .player-card.speaking .wave, .punishment-text.typing,', '      .loader-card, .loader-orbit, .loader-echo, .loader-sheen, .loading-text, .player-card.speaking .wave, .punishment-text.typing,', 'index-reduced');
ix = rep(ix, '    body.loperf .ref-layer { animation: none !important; }', `    body.loperf .ref-layer { animation: none !important; }
    body.loperf .loader-echo, body.loperf .loader-sheen, body.loperf .loading-text { animation: none !important; }`, 'index-loperf');
ix = rep(ix, "o.innerHTML = '<div class=\"loader-stage\"><div class=\"loader-orbit\"><i></i><i></i><i></i></div><div class=\"loader-card\">🎭</div></div><div class=\"loading-text\"></div><div class=\"loader-progress\"><i></i></div>';",
  "o.innerHTML = '<div class=\"loader-stage\"><div class=\"loader-echo el\"></div><div class=\"loader-echo er\"></div><div class=\"loader-orbit\"><i></i><i></i><i></i></div><div class=\"loader-card\">🎭</div><div class=\"loader-sheen\"></div></div><div class=\"loading-text\"></div><div class=\"loader-progress\"><i></i></div>';", 'index-jsbuilder');
ix = rep(ix, `    @media (min-width: 1280px) {
      .loader-stage { width: 168px; height: 202px; }
      .loader-card { width: 116px; height: 154px; font-size: 3.4rem; }`, `    @media (min-width: 1280px) {
      .loader-stage { width: 168px; height: 202px; }
      .loader-card { width: 116px; height: 154px; font-size: 3.4rem; }
      .loader-echo { width: 112px; height: 150px; margin: -75px 0 0 -56px; }`, 'index-bigscreen');

// 门禁
for (const [name, s] of [['mono', mo], ['uno', un], ['tod', td], ['index', ix]]) {
  const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
  blocks.forEach((b, i) => { try { new Function(b); } catch (e) { throw new Error(name + '#' + i + ' SYNTAX: ' + e.message); } });
}
for (const [name, s, bad] of [
  ['mono', mo, ['loader-ico']], ['uno', un, ['loader-ico']],
  ['tod', td, []], ['index', ix, []],
]) {
  const hits = bad.filter(sym => s.includes(sym));
  if (hits.length) throw new Error(name + ' 残留: ' + hits.join(','));
}
fs.writeFileSync(process.env.TEMP + '/st-mono.html', mo);
fs.writeFileSync(process.env.TEMP + '/st-uno.html', un);
fs.writeFileSync(process.env.TEMP + '/st-tod.html', td);
fs.writeFileSync(process.env.TEMP + '/st-index.html', ix);
console.log('staged ok:', mo.length, un.length, td.length, ix.length);
