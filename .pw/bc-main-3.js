'use strict';
/* ═══ 炸弹猫 · 第三部分：应用管线 + UI 渲染 ═══
   主机权威：只有 host 跑引擎；非主机一切动作走 act（重试闭环）/ up（私密敏感载荷）。
   私密手牌经 p/<pid> 下发；hello 重试直到收到。客户端 state 按 seq 单调去重。 */

let myId = sessionStorage.getItem('cat:tab-id') || '';
if (!myId) { myId = genId(); try { sessionStorage.setItem('cat:tab-id', myId); } catch {} }
let link = null, engine = null;
let S = null;                       // 公共态镜像
let PRIV = { hand: [], peek: null, pendingPeek: false };
let isHost = false;
let screenName = 'join';
let sel = new Set();                // 选中的手牌下标
let pendActs = new Map();           // mid → {obj, n, t0, seq0}（act 重试闭环）
let seenEv = new Set();
let overShown = false, tipDismissed = localStorage.getItem('cat:tip') === '1';
let helloTimer = null, tickTimer = null, retryTimer = null, nopeTimer = null, hintTimer = null;
let lastSeq = 0;

const urlRoom = extractRoom();
if (urlRoom) { const ri = $('#in-room'); if (ri && !ri.value) ri.value = urlRoom; }

/* ── 换屏 ── */
function showScreen(name) {
  screenName = name;
  for (const sc of document.querySelectorAll('.screen')) sc.classList.toggle('active', sc.id === 'screen-' + name);
  if (name === 'game') initScene();
}

/* ── 网络状态灯 ── */
function netStatus(st, host) {
  const dot = $('.conn-dot'), txt = $('#net-txt');
  if (!dot) return;
  dot.className = 'conn-dot' + (st === 'online' ? ' online' : st === 'syncing' ? ' syncing' : '');
  txt.textContent = st === 'online' ? ('已连接 · ' + (host || '')) : st === 'syncing' ? '同步中…' : '未连接';
}

/* ── 加入 ── */
async function doJoin() {
  const btn = $('#btn-join');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const name = ($('#in-name').value || '').trim() || ('猫猫' + Math.floor(Math.random() * 90 + 10));
    const room = ($('#in-room').value || '').trim().toUpperCase() || roomCode();
    const av = pickedAv;
    localStorage.setItem('cat:me', JSON.stringify({ name, av }));
    link = new RoomLink(room);
    link.statusCb = netStatus;
    link.on('state', applyState);
    link.on('act', onActMsg);
    link.on('priv', onPrivMsg);
    link.on('up', onUpMsg);
    link.on('react', onReactMsg);
    if ($('#chk-local').checked) { link.localOnly = true; link.useLocal(); }
    await link.open();
    link.addPrivTopic(link.pfx + myId);
    await sleep(300);                      // 等 retained state
    if (!S) {
      // 没有房间 → 我是创建者兼房主
      becomeHost(room);
      engine.join(myId, name, av);
      hostPublish('创建房间');
    } else {
      sendAct({ t: 'join', name, av });
      // 手牌补发/在场心跳统一由 startTimers 的 15s hello 循环接管（此前这里的 1.5s 循环会被 startTimers 当场清掉）
    }
    startTimers();
    if (S && S.stage === 'turn') { showScreen('game'); renderGame(); }   // 局中进入 → 观战视图
    else { showScreen('lobby'); renderLobby(); }
  } finally { btn.disabled = false; }
}

function deliverPriv(pid, obj) {
  if (pid === myId) onPrivMsg(obj);            // 本地模式：非 retained 私密包不过传输（channel 自滤、storage 不落盘）
  else link.publishPriv(pid, obj);
}
function becomeHost(room) {
  engine = CAT.create({ room, hostId: myId, selfPid: myId });
  engine._sendPriv = (pid, extra) => { deliverPriv(pid, Object.assign(engine.privateFor(pid), extra || {})); };
  isHost = true;
  hostWatchUpTopics();
}
function hostWatchUpTopics() {
  if (!engine) return;
  for (const p of engine.G.players) link.addPrivTopic(link.pfx + p.id + '/up');
}

function startTimers() {
  clearInterval(tickTimer); clearInterval(retryTimer); clearInterval(helloTimer);
  tickTimer = setInterval(() => {
    if (isHost && engine) {
      engine.tick();
      if (engine.consumeDirty()) hostPublish();   // tick 内结算（nope 窗关闭/超时兜底/代抽）必须广播出去
      // 心跳：≥5s 没发布就刷一次 ver —— 否则安静回合 20s 后全端误判 hostLost 弹回大厅
      if (engine.G.stage !== 'lobby' && Date.now() - (engine.G.ver || 0) > 5000) hostPublish();
      // 大厅清人：90s 没 hello 的玩家移出（对局中不动，交给看门狗/主动离开）
      if (engine.G.stage === 'lobby') {
        const now = Date.now();
        const before = engine.G.players.length;
        engine.G.players = engine.G.players.filter(p => p.id === myId || (now - (p.lastSeen || 0)) < 90000);
        if (engine.G.players.length !== before) { hostPublish(); }
      }
    }
    // hostLost 看门狗（每端）：12s 无 state 更新且 pending 已过期 → 本地判死局（心跳 5s 一发，12s 足够宽）
    if (S && S.stage === 'turn' && !isHost && Date.now() - (S.ver || 0) > 12000) {
      const pd = S.turn && S.turn.pending;
      if (!pd || Date.now() > (pd.deadline || 0) + 4000) {
        toast('主持人失联，本局作废', 'error', 4000);
        S.hostLost = true; showScreen('lobby'); renderLobby();
      }
    }
  }, 1000);
  retryTimer = setInterval(() => {
    const now = Date.now();
    for (const [mid, p] of [...pendActs]) {
      if (S && S.seq > p.seq0) { pendActs.delete(mid); continue; }
      if (now - p.t0 > 4000 * (p.n + 1)) {
        if (p.n >= 3) { pendActs.delete(mid); toast('同步失败，请重试', 'error'); continue; }
        p.n++; link.publishAct(p.obj);
      }
    }
  }, 1200);
  if (!helloTimer) helloTimer = setInterval(() => {
    if (S && S.players && S.players.some(p => p.id === myId) && S.stage !== 'lobby') sendAct({ t: 'hello' });
    else if (S && S.players && S.players.some(p => p.id === myId)) sendAct({ t: 'hello' });   // 大厅也当 presence
  }, 15000);
}

/* ── 动作发送 ── */
function sendAct(a, viaUp) {
  const msg = { from: myId, mid: genId(), a };
  if (isHost) { hostOnAct(msg); return; }
  pendActs.set(msg.mid, { obj: msg, n: 0, t0: Date.now(), seq0: S ? S.seq : 0 });
  if (viaUp) link.publishUp(myId, msg); else link.publishAct(msg);
}
function sendUp(a) { sendAct(a, true); }

/* ── 主机侧：处理动作（本地或网络）── */
function hostOnAct(msg) {
  if (!engine) return;
  const from = msg.from;
  const r = engine.act(msg);
  if (r && r.priv) { deliverPriv(from, r.priv); return; }
  if (r && r.dup) return;   // 幂等命中：storage 重放/3 broker 重复投递——绝不重发布（否则发布风暴）
  if (r && !r.ok) { link.publishPriv(from, { err: r.err }); if (from === myId) toast(r.err, 'error'); return; }
  if (!r || !r.ok) return;
  hostPublish();
}
function hostPublish(reason) {
  if (!engine) return;
  engine.syncCounts();
  engine.G.ver = Date.now(); engine.G.seq = (lastSeq || 0) + 1; lastSeq = engine.G.seq;
  link.publishState(engine.G);
  // 私密包：发给所有活人（对局期）——手牌可能因偷/给/抽变化
  if (engine.G.stage === 'turn' || engine.G.stage === 'over') {
    for (const p of engine.G.players) if (p.alive && !p.left) engine._sendPriv(p.id, {});
  }
  applyState(engine.G, true);
  hostWatchUpTopics();
}

/* ── 状态应用 ── */
function applyState(next, selfSrc) {
  if (!next || next.v !== 1) return;
  if (!selfSrc) {
    if (isHost) return;                                  // 主机忽略入站 retained 回声
    if (S && next.seq <= S.seq) return;                  // seq 单调去重（3 broker 各投一次）
  }
  const prevStage = S && S.stage;
  S = next; lastSeq = Math.max(lastSeq, next.seq || 0);
  isHost = !!(engine && S.hostId === myId);
  // 事件 → 音效/演出
  for (const e of (S.events || [])) {
    if (seenEv.has(e.id)) continue;
    seenEv.add(e.id);
    if (seenEv.size > 512) { const it = seenEv.values(); for (let i = 0; i < 128; i++) seenEv.delete(it.next().value); }
    onGameEvent(e);
  }
  if (S.hostLost && screenName !== 'join') { showScreen('lobby'); renderLobby(); toast('主持人离开了，本局作废', 'error', 4000); return; }
  if (S.stage === 'over') {
    if (!overShown) {
      overShown = true;
      showScreen('result'); renderResult();   // 结算屏常驻，等房主手动「再来一局」（over 局有人加入会唤醒回大厅）
    }
    renderLobbyLight();
    return;
  } else overShown = false;
  if (S.stage === 'lobby') { if (screenName !== 'lobby') showScreen('lobby'); renderLobby(); return; }
  if (S.stage === 'turn') {
    if (screenName !== 'game') showScreen('game');
    renderGame();
    syncPrivAfterState();
  }
}
function renderLobbyLight() { /* over 态下大厅人数仍可刷新（省略） */ }

/* 加入 over 局 → 唤醒回大厅（引擎 join 在 over 态重置房间） */
function syncPrivAfterState() {
  const inPlayers = S.players && S.players.some(p => p.id === myId);
  if (!inPlayers) { renderSpectate(); return; }
  if (!PRIV.requested) { PRIV.requested = true; sendAct({ t: 'hello' }); }
}

/* ── 私密包 ── */
function onPrivMsg(obj) {
  if (!obj) return;
  if (obj.err) {
    toast(obj.err === 'spectate' ? '对局进行中，已为你进入观战' : obj.err, obj.err === 'spectate' ? '' : 'error');
    return;
  }
  if (Array.isArray(obj.hand)) PRIV.hand = obj.hand;
  if (obj.peek) { PRIV.peek = obj.peek; openStf(obj.peek); }
  PRIV.gotHand = true;
  if (screenName === 'game') renderHand();
}
function onUpMsg(msg) { if (isHost) hostOnAct(msg); }
function onActMsg(msg) { if (isHost) hostOnAct(msg); }

/* ── 事件 → 音效/演出钩子 ── */
function onGameEvent(e) {
  switch (e.t) {
    case 'deal': SFX.play('deal'); break;
    case 'ek': SFX.play('tick'); break;
    case 'defuse': SFX.play('tick'); break;
    case 'boom': SFX.play('boom'); sceneBoom(e.pid); break;
    case 'nope': SFX.play('nope'); sceneNope(e.pid); break;
    case 'shuffle': SFX.play('draw'); sceneShuffle(); break;
    case 'steal': SFX.play('pop'); sceneSteal(e.pid, e.from); break;
    case 'gave': SFX.play('pop'); sceneSteal(e.to, e.pid); break;
    case 'inserted': SFX.play('defuse'); sceneShuffle(); break;
    case 'win': SFX.play('win'); break;
    case 'drawcard': SFX.play('draw'); sceneDraw(e.pid); break;
    case 'afk': break;
  }
}

/* ── 大厅渲染 ── */
function renderLobby() {
  $('#share-room').textContent = S ? S.room : '';
  const box = $('#lobby-players');
  const meIn = S && S.players && S.players.some(p => p.id === myId);
  if (S && S.hostLost) { $('#lobby-tip').textContent = '主持人离开了，本局作废 —— 可以重新开始'; }
  else if (!meIn && S) { $('#lobby-tip').textContent = '对局进行中或你未入座 — 稍候自动同步'; }
  else $('#lobby-tip').textContent = '人齐后房主点「开始游戏」· 2-8 人 · 每人开局 1 拆除 + 4 张手牌 · 房主离开=本局作废';
  box.innerHTML = (S ? S.players : []).map(p =>
    `<div class="pchip${p.id === (S && S.hostId) ? ' turn' : ''}">${avImgHtml(p.av)}<span>${esc(p.name)}${p.id === myId ? '（我）' : ''}</span>${p.id === (S && S.hostId) ? '<span class="crown">👑</span>' : ''}</div>`
  ).join('') || '<div class="pchip">等待玩家…</div>';
  $('#btn-start').style.display = (S && S.hostId === myId && S.stage === 'lobby') ? '' : 'none';
  $('#btn-start').disabled = !S || !S.players || S.players.length < 2 || S.players.length > 8;
}

/* ── 牌局渲染 ── */
function renderSpectate() {
  $('#bc-hint').textContent = '👀 观战中（对局进行中，无法入座）';
  $('#bc-hand').innerHTML = '<div id="bc-empty-hand">观战中 · 下局再一起玩</div>';
  $('#btn-draw').disabled = true; $('#btn-play').disabled = true; $('#btn-endturn').hidden = true;
}
function renderGame() {
  if (!S || S.stage !== 'turn') return;
  const me = S.players.find(p => p.id === myId);
  const myTurn = !!(me && me.alive && !me.left && S.turn && S.turn.pid === myId);
  const pd = S.turn && S.turn.pending;
  // 顶栏
  $('#st-deck').textContent = S.deckN;
  $('#st-disc').textContent = S.discard.length;
  const tp = S.players.find(p => p.id === (S.turn && S.turn.pid));
  clearInterval(hintTimer);
  const hintBase = pd
    ? (pd.kind === 'nope' ? `🚫 等待休想…（${pd.nopeN} 张已打出）`
      : pd.kind === 'defuse' ? `✂️ ${esc(nameOfPid(pd.pid))} 正在安排炸弹…`
      : pd.kind === 'give' ? `🎁 等待 ${esc(nameOfPid(pd.pid))} 选牌…`
      : `🃏 等待 ${esc(nameOfPid(pd.pid))} 挑选…`)
    : `轮到 <b>${esc(tp ? tp.name : '?')}</b>${S.turn && S.turn.extra > 0 ? `（额外回合 ×${S.turn.extra + 1}）` : ''}`;
  $('#bc-hint').innerHTML = hintBase;
  if (pd && pd.deadline) {   // 等待类 pending 补倒计时（nope 横幅另有环形倒计时）
    hintTimer = setInterval(() => {
      const left = Math.max(0, Math.ceil(((pd.deadline || 0) - Date.now()) / 1000));
      const el = $('#bc-hint');
      if (!el || (S.turn && S.turn.pending) !== pd) { clearInterval(hintTimer); return; }
      el.innerHTML = hintBase + ` · 剩 ${left}s`;
      if (left <= 0) clearInterval(hintTimer);
    }, 400);
  }
  // 玩家 chips（DOM 退路 / 非 3D）
  $('#bc-players').innerHTML = S.players.map(p => {
    const dead = !p.alive || p.left;
    return `<div class="pchip${dead ? ' dead' : ''}${S.turn && S.turn.pid === p.id ? ' turn' : ''}">${avImgHtml(p.av)}<span>${esc(p.name)}</span><span class="cnt">${dead ? '💀 出局' : '🃏' + (handCountOf(p.id))}</span></div>`;
  }).join('');
  // 首回合速览（仅开局 60s 内显示，之后自动收起）
  $('#bc-tipfirst').hidden = tipDismissed || S.startedAt < Date.now() - 60000;
  // 手牌
  renderHand();
  // 按钮
  $('#btn-draw').disabled = !(myTurn && !pd && S.turn.attackQueued <= 0 && !S.turn.skipFlag);
  $('#btn-draw').style.display = myTurn || pd ? '' : 'none';
  $('#btn-endturn').hidden = !(myTurn && !pd && S.turn.attackQueued > 0);
  updatePlayButton(myTurn, pd);
  // nope 横幅
  renderNope(pd, myTurn);
  // pending 相关弹层（非本端或已消失 → 自动关）
  if (pd && pd.kind === 'defuse' && pd.pid === myId) openInsert();
  else if (pd && pd.kind === 'give' && pd.pid === myId) openGive();
  else if (pd && pd.kind === 'pick' && pd.pid === myId) openPick();
  else for (const id of ['ovl-insert', 'ovl-give', 'ovl-discard']) {
    const ovl = $(id);
    if (ovl && !ovl.hidden && ovl.dataset.open === '1') closeOvl(ovl);
  }
  // 日志
  $('#bc-log').innerHTML = (S.log || []).slice(-9).map(l => `<div>${esc(l.m)}</div>`).join('');
  // 2D 退路面板
  render2DBoard();
}
function nameOfPid(pid) { const p = S.players.find(x => x.id === pid); return p ? p.name : '?'; }
function handCountOf(pid) {
  if (pid === myId && PRIV.gotHand) return PRIV.hand.length;
  const p = S.players.find(x => x.id === pid);
  return p && p.cnt != null ? p.cnt : '?';
}
function render2DBoard() {
  const d = $('#b2d-discard');
  const top = S.discard && S.discard.length ? S.discard[S.discard.length - 1] : null;
  d.innerHTML = top ? `<img src="${cardFaceURL(top)}" alt=""><span>弃牌 ${S.discard.length}</span>` : `<span>弃牌堆</span><span>${S.discard.length} 张</span>`;
  $('#b2d-deck').style.height = '90px';
}

/* ── nope 横幅 ── */
function renderNope(pd, myTurn) {
  const bn = $('#bc-nope');
  clearInterval(nopeTimer);
  const iHaveNope = PRIV.hand && PRIV.hand.some(c => CAT.kindOf(c) === 'nope');
  const show = pd && pd.kind === 'nope' && iHaveNope && !pd.nopeBy.includes(myId);
  if (!show) { bn.hidden = true; return; }
  bn.hidden = false;
  const cardsTxt = pd.cards.map(c => `【${CAT.nameOf(c)}】`).join('+');
  $('#nope-txt').innerHTML = `<b>${esc(nameOfPid(pd.pid))}</b> 打出了 ${cardsTxt}${pd.eff && pd.eff.target ? ' → ' + esc(nameOfPid(pd.eff.target)) : ''}<br>要休想吗？（已有 ${pd.nopeN} 张休想）`;
  $('#btn-nope').onclick = () => { sendAct({ t: 'nope' }); SFX.play('nope'); };
  const total = Math.max(1, (pd.deadline || 0) - (pd.t0 || 0));
  nopeTimer = setInterval(() => {
    const left = Math.max(0, (pd.deadline || 0) - Date.now());
    $('#nope-sec').textContent = Math.ceil(left / 1000);
    $('#nope-ring').style.setProperty('--p', (100 * left / total) + '%');
    if (left <= 0) { bn.hidden = true; clearInterval(nopeTimer); }
  }, 200);
}

/* ── 手牌 ── */
function renderHand() {
  const box = $('#bc-hand');
  const me = S && S.players.find(p => p.id === myId);
  if (!me || !me.alive || me.left) { box.innerHTML = '<div id="bc-empty-hand">' + (me ? '你已出局，观战中 💀' : '等待手牌…') + '</div>'; return; }
  if (!PRIV.gotHand) { box.innerHTML = '<div id="bc-empty-hand">同步手牌中…</div>'; return; }
  box.innerHTML = PRIV.hand.map((c, i) =>
    `<button class="hcard${sel.has(i) ? ' sel' : ''}" data-i="${i}"><img src="${cardFaceURL(c)}" alt="${esc(CAT.nameOf(c))}"></button>`
  ).join('');
  box.querySelectorAll('.hcard').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.i;
      if (sel.has(i)) sel.delete(i); else sel.add(i);
      SFX.play('tap');
      renderHand();
      const pd = S && S.turn && S.turn.pending;
      updatePlayButton(!!(S && S.turn && S.turn.pid === myId && me.alive), pd);
    };
  });
}
function selCards() { return [...sel].sort((a, b) => a - b).map(i => PRIV.hand[i]); }
function comboShape(cards) {
  if (!cards.length) return null;
  const titles = cards.map(CAT.titleOf);
  if (cards.length === 1) {
    const k = titles[0];
    if (['attack', 'skip', 'shuffle', 'stf'].includes(k)) return { k, label: '打出【' + CAT.nameOf(k + ':0') + '】' };
    if (k === 'favor') return { k, label: '打出【恩惠】', needTarget: true };
    return null;
  }
  if (cards.length === 2 && titles[0] === titles[1]) return { k: 'combo2', label: '组合：抽走 1 张', needTarget: true };
  if (cards.length === 3 && titles[0] === titles[1] && titles[1] === titles[2]) return { k: 'combo3', label: '组合：点名要牌', needTarget: true, needName: true };
  if (cards.length === 5 && new Set(titles).size === 5) {
    if (!S || !S.discard.length) return { k: 'combo5', label: '组合：弃牌堆是空的', dead: true };
    return { k: 'combo5', label: '组合：捡 1 张弃牌' };
  }
  return null;
}
function updatePlayButton(myTurn, pd) {
  const btn = $('#btn-play');
  const shape = (!myTurn || pd) ? null : comboShape(selCards());
  btn.disabled = !shape || shape.dead;
  btn.textContent = shape ? shape.label : '打出选中';
}

/* ── 出牌流程 ── */
$('#btn-play') && ($('#btn-play').onclick = () => {
  const shape = comboShape(selCards());
  if (!shape || shape.dead) return;
  if (shape.needTarget) { openTarget(shape); return; }
  sendAct({ t: 'play', idxs: [...sel] });
  sel.clear();
  SFX.play('flip');
});
function openTarget(shape) {
  const ovl = $('#ovl-target');
  $('#tgt-title').textContent = shape.k === 'favor' ? '把恩惠送给谁？' : '对谁出组合？';
  $('#tgt-sub').textContent = shape.k === 'combo3' ? '选人后要点一张牌的名字' : '';
  $('#tgt-list').innerHTML = S.players
    .filter(p => p.alive && !p.left && p.id !== myId && (handCountOf(p.id) !== 0))
    .map(p => `<button class="tgt" data-pid="${p.id}">${avImgHtml(p.av)}<span>${esc(p.name)}</span><span class="cnt">🃏${handCountOf(p.id)}</span></button>`).join('');
  $('#tgt-list').querySelectorAll('.tgt').forEach(b => {
    b.onclick = () => {
      const pid = b.dataset.pid;
      if (shape.needName) { openName(shape, pid); }
      else { sendAct({ t: 'play', idxs: [...sel], target: pid }); sel.clear(); SFX.play('flip'); closeOvl(ovl); }
    };
  });
  ovl.hidden = false;
  ovl.querySelector('[data-close]').onclick = () => closeOvl(ovl);
}
function openName(shape, pid) {
  const ovl = $('#ovl-name');
  $('#name-list').innerHTML = [...CAT.NAMEABLE].map(k =>
    `<button class="pickcard" data-k="${k}"><img src="${cardFaceURL(k + ':0')}" alt="${esc(CAT.nameOf(k + ':0'))}"></button>`).join('');
  $('#name-list').querySelectorAll('.pickcard').forEach(b => {
    b.onclick = () => {
      sendAct({ t: 'play', idxs: [...sel], target: pid, namePick: b.dataset.k });
      sel.clear(); SFX.play('flip'); closeOvl(ovl);
    };
  });
  ovl.hidden = false;
  ovl.querySelector('[data-close]').onclick = () => { closeOvl(ovl); };
}
function openGive() {
  const ovl = $('#ovl-give');
  if (ovl.dataset.open === '1') return;
  ovl.dataset.open = '1';
  $('#give-sub').textContent = `${nameOfPid(S.turn && S.turn.pending && S.turn.pending.to)} 在等你的恩惠`;
  $('#give-list').innerHTML = PRIV.hand.map((c, i) =>
    `<button class="pickcard" data-i="${i}"><img src="${cardFaceURL(c)}" alt=""></button>`).join('');
  $('#give-list').querySelectorAll('.pickcard').forEach(b => {
    b.onclick = () => { sendUp({ t: 'give', idx: +b.dataset.i }); closeOvl(ovl); };
  });
  ovl.hidden = false;
}
function openPick() {
  const ovl = $('#ovl-discard');
  if (ovl.dataset.open === '1') return;
  ovl.dataset.open = '1';
  $('#disc-sub').textContent = '挑一张加入手牌（超时自动拿最上面一张）';
  $('#disc-list').innerHTML = (S.discard || []).slice().reverse().slice(0, 24).map(c =>
    `<button class="pickcard" data-id="${c}"><img src="${cardFaceURL(c)}" alt="${esc(CAT.nameOf(c))}"></button>`).join('');
  $('#disc-list').querySelectorAll('.pickcard').forEach(b => {
    b.onclick = () => { sendAct({ t: 'pickDiscard', cardId: b.dataset.id }); closeOvl(ovl); };
  });
  ovl.hidden = false;
}
function openStf(peek) {
  const ovl = $('#ovl-stf');
  $('#stf-list').innerHTML = peek.map(c => `<img class="pickcard" style="pointer-events:none" src="${cardFaceURL(c)}" alt="">`).join('');
  ovl.hidden = false;
  ovl.querySelector('[data-close]').onclick = () => { closeOvl(ovl); PRIV.peek = null; };
  SFX.play('flip');
}
function openInsert() {
  const ovl = $('#ovl-insert');
  if (ovl.dataset.open === '1') return;
  ovl.dataset.open = '1';
  const n = S.deckN;
  $('#ins-n').textContent = n;
  const slider = $('#ins-slider');
  slider.max = n; slider.value = 0;
  const vis = $('#ins-vis');
  const drawVis = () => {
    const pos = +slider.value;
    $('#ins-pos').textContent = pos;
    vis.innerHTML = Array.from({ length: Math.min(n + 1, 24) }, (_, i) => {
      const at = Math.round(i * n / Math.min(n + 1, 23));
      return `<i class="${at === pos ? 'bomb' : ''}"></i>`;
    }).join('');
  };
  slider.oninput = drawVis;
  drawVis();
  $('#ins-ok').onclick = () => { sendUp({ t: 'insert', pos: +slider.value }); closeOvl(ovl); };
  ovl.hidden = false;
}
function closeOvl(ovl) { ovl.hidden = true; delete ovl.dataset.open; }

/* ── 结算 ── */
function renderResult() {
  const w = S.winner && S.players.find(p => p.id === S.winner);
  $('#res-box').innerHTML = w
    ? `${avImgHtml(w.av, 'win-face')}<h2>🏆 ${esc(w.name)} 活到了最后！</h2>
       <div class="res-line">${S.players.map(p => `${(!p.alive || p.left) ? '💀' : '😺'} ${esc(p.name)}`).join(' · ')}<br>炸弹猫 ${Math.max(1, S.players.length - 1)} 只埋伏 · 开局 ${S.players.length} 人 · 存活 1 猫</div>`
    : '<h2>💥 全员爆炸</h2><div class="res-line">无人幸免，友谊还在</div>';
}

/* ── 再来一局（房主）── */
function hostRestart() {
  if (!isHost) return;
  const oldPlayers = (engine ? engine.G.players : S.players) || [];
  const seqBase = (S && S.seq) || 0;
  engine = CAT.create({ room: S.room, hostId: myId, seed: undefined });
  engine._sendPriv = (pid, extra) => { link.publishPriv(pid, Object.assign(engine.privateFor(pid), extra || {})); };
  engine.G.seq = seqBase + 1000; lastSeq = engine.G.seq;
  for (const p of oldPlayers) engine.join(p.id, p.name, p.av);
  overShown = false;
  hostPublish('再来一局');
  toast('新的一局，回大厅啦');
}
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'btn-again' && isHost) hostRestart();
  else if (e.target && e.target.id === 'btn-again') toast('等房主开新局', 'error');
});

/* ── 通用按钮绑定 ── */
$('#btn-copy').onclick = async () => {
  const room = $('#share-room').textContent || '';
  const url = location.origin + location.pathname + '?room=' + room;
  try { await navigator.clipboard.writeText(url); toast('邀请链接已复制'); }
  catch (e) { toast('复制失败，房号：' + room, 'error', 4000); }
};
$('#btn-join').onclick = doJoin;
$('#in-name').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
$('#in-room').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
$('#btn-start').onclick = () => { sendAct({ t: 'start' }); SFX.play('deal'); };
$('#btn-leave').onclick = () => { sendAct({ t: 'leave' }); leaveRoom(); };
$('#btn-draw').onclick = () => { sendAct({ t: 'draw' }); SFX.play('draw'); };
$('#btn-endturn').onclick = () => { sendAct({ t: 'end' }); };
$('#btn-guide').onclick = () => { $('#ovl-guide').hidden = false; };
$('#btn-guide2').onclick = () => { $('#ovl-guide').hidden = false; };
$('#tip-x').onclick = () => { tipDismissed = true; localStorage.setItem('cat:tip', '1'); $('#bc-tipfirst').hidden = true; };
document.querySelectorAll('.ovl [data-close]').forEach(b => {
  b.addEventListener('click', () => { const ovl = b.closest('.ovl'); closeOvl(ovl); if (ovl.id === 'ovl-guide') return; });
});
function leaveRoom() {
  clearInterval(tickTimer); clearInterval(retryTimer); clearInterval(helloTimer);
  if (link) { link.close(); link = null; }
  engine = null; S = null; isHost = false; PRIV = { hand: [], peek: null };
  retireScene();
  showScreen('join');
}
window.addEventListener('pagehide', () => {
  if (link && S && S.players && S.players.some(p => p.id === myId)) {
    link.publishNow(link.tAct, { from: myId, mid: genId(), a: { t: 'leave' } }, { retain: false, qos1: false });
  }
});

/* ── 表情 dock ── */
const REACTS = ['😹', '😱', '🔥', '💣', '🎉', '🙏'];
function buildReactDock() {
  const dock = $('#react-dock');
  dock.innerHTML = `<button class="rd-main">😀</button><div class="rd-list" hidden>${REACTS.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`;
  const main = dock.querySelector('.rd-main'), list = dock.querySelector('.rd-list');
  let autoHide = null;
  main.onclick = () => {
    list.hidden = !list.hidden;
    clearTimeout(autoHide);
    if (!list.hidden) autoHide = setTimeout(() => { list.hidden = true; }, 4000);
  };
  list.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      list.hidden = true;
      const e = b.dataset.e;
      reactFall(e);
      if (link) link.publishReact({ e, from: myId, mid: genId(), ts: Date.now() });
    };
  });
}
const reactSeen = new Set();
function onReactMsg(m) {
  if (!m || !m.e || reactSeen.has(m.mid) || Date.now() - (m.ts || 0) > 6000) return;
  reactSeen.add(m.mid);
  if (reactSeen.size > 256) { const it = reactSeen.values(); for (let i = 0; i < 64; i++) reactSeen.delete(it.next().value); }
  reactFall(m.e);
}
function reactFall(e) {
  SFX.play('pop');
  const el = document.createElement('div');
  el.className = 'react-fall';
  el.textContent = e;
  el.style.left = (20 + Math.random() * 60) + 'vw';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ── 猫头像选择 ── */
let pickedAv = localStorage.getItem('cat:av-pick') || ('bc:' + CAT_HUES[Math.floor(Math.random() * CAT_HUES.length)] + ':' + Math.floor(Math.random() * 9999));
function buildCatPicker() {
  const box = $('#cat-pick');
  const hues = CAT_HUES;
  box.innerHTML = hues.map((h, i) => {
    const key = 'bc:' + h + ':' + (i * 37 + 5);
    return `<button class="ctile" data-key="${key}"><img src="${makeCatFace(h, String(i * 37 + 5))}" alt="猫 ${i + 1}"></button>`;
  }).join('') + '<button class="ctile dice" title="随机一只">🎲</button>';
  box.querySelectorAll('.ctile').forEach(b => {
    b.onclick = () => {
      if (b.classList.contains('dice')) {
        pickedAv = 'bc:' + pickOf(CAT_HUES) + ':' + Math.floor(Math.random() * 9999);
      } else pickedAv = b.dataset.key;
      localStorage.setItem('cat:av-pick', pickedAv);
      syncCatPick();
      SFX.play('tap');
    };
  });
  syncCatPick();
}
function syncCatPick() {
  document.querySelectorAll('#cat-pick .ctile').forEach(b => b.classList.toggle('on', b.dataset.key === pickedAv));
}

/* ── 卡面渲染（DOM 手牌与 3D 纹理共用）── */
const faceCache = new Map();
function cardFaceCanvas(cardId) {
  const kind = CAT.kindOf(cardId);
  const def = CAT.DEFS[kind] || { n: kind, i: '❓', band: '#888', d: '' };
  const key = kind + (def.cat ? '' : '');
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 360;
  const x = cv.getContext('2d');
  x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, 256, 360);
  x.fillStyle = def.band; x.fillRect(0, 0, 256, 92);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 84, 256, 8);
  x.font = '64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(def.i, 128, 50);
  x.fillStyle = '#1c1420'; x.font = '700 34px "Noto Sans SC","Microsoft YaHei",sans-serif';
  x.fillText(def.n, 128, 150);
  x.fillStyle = 'rgba(28,20,32,0.55)'; x.font = '22px "Noto Sans SC","Microsoft YaHei",sans-serif';
  const d = def.d || (def.cat ? '组合用猫牌' : '');
  wrapText(x, d, 128, 210, 210, 30);
  x.strokeStyle = def.band; x.lineWidth = 10; x.strokeRect(5, 5, 246, 350);
  x.fillStyle = 'rgba(28,20,32,0.35)'; x.font = '18px sans-serif';
  x.fillText('💣 炸弹猫', 128, 335);
  faceCache.set(key, cv);
  return cv;
}
function wrapText(x, text, cx, y, maxW, lh) {
  const chars = [...String(text || '')];
  let line = '', lines = [];
  for (const ch of chars) {
    if (x.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => x.fillText(l, cx, y + i * lh));
}
function cardFaceURL(cardId) {
  const kind = CAT.kindOf(cardId);
  const key = 'u:' + kind;
  if (faceCache.has(key)) return faceCache.get(key);
  const url = cardFaceCanvas(cardId).toDataURL('image/png');
  faceCache.set(key, url);
  return url;
}

/* ── boot ── */
(function boot() {
  const saved = localStorage.getItem('cat:me');
  if (saved) { try { const o = JSON.parse(saved); $('#in-name').value = o.name || ''; pickedAv = o.av || pickedAv; } catch {} }
  buildCatPicker();
  buildReactDock();
  // 纸屑
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = ['#f97316', '#ef4444', '#fbbf24', '#22d3ee'][i % 4];
      c.style.animationDuration = (7 + Math.random() * 9) + 's';
      c.style.animationDelay = (Math.random() * 8) + 's';
      $('#bg').appendChild(c);
    }
  }
  if (urlRoom) toast('已带上房号 ' + urlRoom);
})();

/* ── 调试句柄（E2E 依赖）── */
window.__cat = {
  get S() { return S; },
  get hand() { return PRIV.hand; },
  get engine() { return engine; },
  get isHost() { return isHost; },
  get link() { return link; },
  myId,
  setTiming(o) { Object.assign(CAT.T, o || {}); },
  sendAct, hostOnAct, applyState,
  _sel: sel,
  _reset() { sel.clear(); PRIV = { hand: [], peek: null }; },
  scene: () => window.__bcScene || null,
};
