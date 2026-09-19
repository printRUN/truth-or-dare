'use strict';
/* ═══ 炸弹猫 · 第二部分：规则引擎（纯逻辑，仅主机运行）═══
   G（公共态）永不含手牌内容与牌库顺序——手牌只在 H（主机内存）。
   所有超时行为走统一 tick(now) 时钟 + 种子 RNG（mulberry32），setSeed/forceDeck 仅供测试。 */
const CAT = (() => {
  const DEFS = {
    ek:      { n: '炸弹猫',   i: '💥', band: '#ef4444', d: '抽到就爆炸…除非有拆除' },
    defuse:  { n: '拆除',     i: '✂️', band: '#22c55e', d: '拆弹并秘密放回牌库' },
    nope:    { n: '休想',     i: '🚫', band: '#64748b', d: '阻止任何行动' },
    attack:  { n: '攻击',     i: '⚔️', band: '#f97316', d: '下家多做1次回合' },
    skip:    { n: '略过',     i: '⏭️', band: '#38bdf8', d: '本回合不抽牌' },
    favor:   { n: '恩惠',     i: '🎁', band: '#a78bfa', d: '指定玩家给你一张牌' },
    shuffle: { n: '洗混',     i: '🔀', band: '#fbbf24', d: '重新洗混牌库' },
    stf:     { n: '预见未来', i: '🔮', band: '#22d3ee', d: '偷看牌库顶3张' },
    taco:    { n: '塔可猫',   i: '🌮', band: '#f59e0b', cat: true },
    potato:  { n: '土豆猫',   i: '🥔', band: '#a3e635', cat: true },
    melon:   { n: '西瓜猫',   i: '🍉', band: '#4ade80', cat: true },
    rainbow: { n: '彩虹猫',   i: '🌈', band: '#22d3ee', cat: true },
    beard:   { n: '胡子猫',   i: '🧔', band: '#94a3b8', cat: true },
  };
  const PER_DECK = { ek: 4, defuse: 6, nope: 5, attack: 4, skip: 4, favor: 4, shuffle: 4, stf: 5, taco: 4, potato: 4, melon: 4, rainbow: 4, beard: 4 };
  const CATKINDS = ['taco', 'potato', 'melon', 'rainbow', 'beard'];
  const NAMEABLE = ['ek', 'defuse', 'nope', 'attack', 'skip', 'favor', 'shuffle', 'stf', ...CATKINDS]; // 3 同点名清单

  const T = { nopeMs: 2500, nopeStep: 2000, nopeCap: 9000, quick: 800, favor: 10000, defuse: 15000, pick: 15000, turn: 30000, afk: 8000 };

  const kindOf = id => String(id).split(':')[0];
  const titleOf = id => kindOf(id);
  const nameOf = id => (DEFS[kindOf(id)] || {}).n || id;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* 发牌（定稿公式）：副数 d = n≤5?1:2；放回拆除 6d−n；放回爆炸猫 n−1；牌库 = 52d−4n−1 */
  function buildDeck(n, rnd) {
    const d = n <= 5 ? 1 : 2;
    const pool = [], ek = [], defuse = [];
    for (const k of Object.keys(PER_DECK)) {
      for (let i = 0; i < PER_DECK[k] * d; i++) {
        const id = k + ':' + i;
        if (k === 'ek') ek.push(id);
        else if (k === 'defuse') defuse.push(id);
        else pool.push(id);
      }
    }
    const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuf(pool); shuf(ek); shuf(defuse);
    const hands = {};
    for (let i = 0; i < n; i++) hands[i] = [defuse.pop()];        // 每人 1 拆除
    for (let c = 0; c < 4; c++) for (let i = 0; i < n; i++) hands[i].push(pool.pop());  // 每人再抽 4
    const deck = pool.concat(defuse.slice(0, 6 * d - n), ek.slice(0, n - 1));           // 多余拆除 + n−1 爆炸猫回库
    shuf(deck);
    return { d, deck, hands };
  }

    function create(opts) {
    const room = opts.room, hostId = opts.hostId, selfPid = opts.selfPid || hostId;
    let seed = (opts.seed != null ? opts.seed : (Math.random() * 1e9)) >>> 0;
    let rnd = mulberry32(seed);
    let forcedDeck = null;

    const G = {
      v: 1, room, hostId, ver: 0, seq: 0, stage: 'lobby', decks: 1,
      players: [], turn: null, deckN: 0, discard: [], winner: null,
      log: [], events: [], hostLost: false, startedAt: 0,
    };
    const H = { deck: [], hands: {}, ekPending: null };
    const seenMids = [];   // (from:mid) 幂等，容量 64
    let junkSeq = 0;       // 弃牌堆占位 id 计数（nope/defuse 用后即弃，保证确定性且不与真牌 id 撞）
    let dirty = false;     // 引擎被 tick（nope 窗结算/超时兜底/看门狗代抽）改过 → 宿主需要 publish

    const P = pid => G.players.find(p => p.id === pid);
    const alive = () => G.players.filter(p => p.alive && !p.left);
    const pidx = pid => G.players.findIndex(p => p.id === pid);
    function log(m) { G.log.push({ m, ts: Date.now() }); if (G.log.length > 30) G.log.splice(0, G.log.length - 30); dirty = true; }
    let evSeq = 0;
    function ev(t, pid, extra) { G.events.push(Object.assign({ t, pid, id: Date.now().toString(36) + '-' + (evSeq++), ts: Date.now() }, extra || {})); if (G.events.length > 8) G.events.splice(0, G.events.length - 8); dirty = true; }
    function bump() { G.seq++; G.ver = Date.now(); }
    function nextAliveAfter(pid) {
      const n = G.players.length, i0 = pidx(pid);
      for (let k = 1; k <= n; k++) { const p = G.players[(i0 + k) % n]; if (p.alive && !p.left) return p.id; }
      return null;
    }
    function othersHaveNope(pid) { return alive().some(p => p.id !== pid && (H.hands[p.id] || []).some(c => kindOf(c) === 'nope')); }
    function shuffleDeck() { for (let i = H.deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [H.deck[i], H.deck[j]] = [H.deck[j], H.deck[i]]; } }
    function checkWin() {
      const a = alive();
      if (G.stage === 'turn' && a.length <= 1) {
        G.stage = 'over'; G.winner = a.length ? a[0].id : null;
        log(G.winner ? `🏆 ${P(G.winner).name} 活到了最后！` : '💥 全员爆炸，无人幸免');
        ev('win', G.winner);
      }
    }

    /* ── 开局 ── */
    function start() {
      if (G.stage !== 'lobby') return { ok: false, err: '游戏已开始' };
      const n = G.players.length;
      if (n < 2) return { ok: false, err: '至少 2 人才能开局' };
      if (n > 8) return { ok: false, err: '最多 8 人（6 人以上自动用 2 副牌）' };
      const { d, deck, hands } = buildDeck(n, rnd);
      if (forcedDeck) { deck.length = 0; deck.push(...forcedDeck); }
      G.decks = d; H.deck = deck; H.hands = {};
      for (const p of G.players) H.hands[p.id] = hands[pidx(p.id)] || [];
      H.deckN = deck.length;
      G.deckN = deck.length; G.discard = []; G.winner = null;
      G.stage = 'turn'; G.startedAt = Date.now();
      G.turn = { pid: pickOf(alive().map(p => p.id), rnd), extra: 0, attackQueued: 0, skipFlag: false, acted: Date.now(), pending: null };
      log(`🎮 游戏开始！${d === 2 ? '（2 副牌）' : ''}先手：${P(G.turn.pid).name}`);
      ev('deal');
      return { ok: true };
    }

    /* ── 房间成员 ── */
    function join(id, name, av) {
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(id || ''))) return { ok: false, err: '非法身份' };   // id 进 DOM data 属性，先验形
      if (G.stage === 'over') {   // 上局已结束：唤醒房间回大厅，老玩家重新可用
        G.stage = 'lobby'; G.winner = null; G.turn = null; G.discard = []; G.deckN = 0;
        for (const p of G.players) { p.alive = true; p.left = false; p.afk = 0; }
        log('房间回到大厅');
      }
      if (G.stage !== 'lobby') return { ok: false, err: 'spectate' };   // 局中进入 → 观战
      if (P(id)) { P(id).name = name || P(id).name; return { ok: true }; }
      G.players.push({ id, name: name || '玩家', av: av || 'bc:0:x', joinedAt: Date.now(), alive: true, afk: 0, left: false, cnt: 0, lastSeen: Date.now() });
      log(`${name} 加入了房间`);
      return { ok: true };
    }
    function syncCounts() {
      for (const p of G.players) {
        p.cnt = (H.hands[p.id] || []).length;
        if (p.id === selfPid) p.lastSeen = Date.now();
      }
    }
    function leave(id) {
      const p = P(id); if (!p) return { ok: true };
      if (G.stage === 'lobby') {
        G.players.splice(pidx(id), 1);
        log(`${p.name} 离开了房间`);
        return { ok: true };
      }
      if (!p.alive || p.left) return { ok: true };
      p.alive = false; p.left = true;
      const hand = H.hands[id] || []; H.hands[id] = [];
      G.discard.push(...hand);
      G.deckN = H.deck.length;
      log(`👋 ${p.name} 离开了，手牌进弃牌堆`);
      ev('boom', id);
      // 正在等待 TA 的 pending → 兜底：pick 由死者持有会凭空收牌 → 取消；defuse 走 insert 兜底；
      // 恩惠的接收方（出牌者）离开：交出的牌会进已清空的手牌凭空蒸发 → 直接取消
      if (G.turn && G.turn.pending) {
        const pd0 = G.turn.pending;
        if (pd0.pid === id && pd0.kind === 'pick') { G.turn.pending = null; log(`👋 ${p.name} 离场，弃牌挑选取消`); }
        else if (pd0.pid === id) resolvePendingTimeout();
        if (G.turn && G.turn.pending && G.turn.pending.kind === 'give' && G.turn.pending.to === id) {
          G.turn.pending = null;
          log(`🎁 ${p.name} 离开，恩惠取消`);
        }
      }
      if (G.turn && G.turn.pid === id && !G.turn.pending) endTurn();
      checkWin();
      return { ok: true };
    }

    /* ── 出牌（进入 nope 窗口）── */
    function play(pid, idxs, target, namePick) {
      const p = P(pid);
      if (G.stage !== 'turn' || !G.turn || G.turn.pid !== pid) return { ok: false, err: '还没轮到你' };
      if (G.turn.pending) return { ok: false, err: '上一张牌还在结算中' };
      const hand = H.hands[pid] || [];
      if (!Array.isArray(idxs) || !idxs.length) return { ok: false, err: '没选牌' };
      const set = [...new Set(idxs)];
      if (set.some(i => !Number.isInteger(i) || i < 0 || i >= hand.length)) return { ok: false, err: '手牌不存在' };
      const cards = set.map(i => hand[i]);
      const titles = cards.map(titleOf);
      let eff = null;
      if (cards.length === 1) {
        const k = titles[0];
        if (k === 'nope') return { ok: false, err: '休想卡在别人出牌时打出' };
        if (k === 'ek') return { ok: false, err: '炸弹猫不能主动打' };
        if (k === 'defuse') return { ok: false, err: '拆除只在抽到炸弹时使用' };
        eff = { k };
        if (k === 'favor') {
          const tp = target && P(target);
          if (!tp || !tp.alive || tp.left || tp.id === pid) return { ok: false, err: '选一个存活的其他玩家' };
          if (!(H.hands[target] || []).length) return { ok: false, err: '对方没有手牌' };
          eff.target = target;
        }
      } else if (cards.length === 2) {
        if (titles[0] !== titles[1]) return { ok: false, err: '组合：2 张同名牌' };
        const tp = target && P(target);
        if (!tp || !tp.alive || tp.left || tp.id === pid) return { ok: false, err: '选一个存活的其他玩家' };
        if (!(H.hands[target] || []).length) return { ok: false, err: '对方没有手牌' };
        eff = { k: 'combo2', target };
      } else if (cards.length === 3) {
        if (!(titles[0] === titles[1] && titles[1] === titles[2])) return { ok: false, err: '组合：3 张同名牌' };
        const tp = target && P(target);
        if (!tp || !tp.alive || tp.left || tp.id === pid) return { ok: false, err: '选一个存活的其他玩家' };
        if (!(H.hands[target] || []).length) return { ok: false, err: '对方没有手牌' };
        if (!NAMEABLE.includes(namePick)) return { ok: false, err: '要点名一张牌' };
        eff = { k: 'combo3', target, namePick };
      } else if (cards.length === 5) {
        if (new Set(titles).size !== 5) return { ok: false, err: '组合：5 张不同名的牌' };
        if (!G.discard.length) return { ok: false, err: '弃牌堆是空的' };
        eff = { k: 'combo5' };
      } else return { ok: false, err: '不成立的组合' };

      set.sort((a, b) => b - a).forEach(i => hand.splice(i, 1));   // 从手牌移出（暂存 pending）
      const now = Date.now();
      G.turn.acted = now;   // nope 窗等待不计入出牌者的决策时钟
      G.turn.pending = {
        kind: 'nope', pid, cards, eff, target: eff.target || target || null, namePick: eff.namePick || null,
        nopeN: 0, nopeBy: [], t0: now,
        deadline: now + (othersHaveNope(pid) ? T.nopeMs : T.quick),
      };
      log(`${p.name} 打出了${cards.length > 1 ? '组合' : '【' + nameOf(cards[0]) + '】'}${eff.target ? ' → ' + P(eff.target).name : ''}${eff.namePick ? '（点名 ' + nameOf(eff.namePick + ':0') + '）' : ''}`);
      p.afk = 0;
      return { ok: true };
    }

    /* ── nope ── */
    function nope(from) {
      const pd = G.turn && G.turn.pending;
      if (G.stage !== 'turn' || !pd || pd.kind !== 'nope') return { ok: false, err: '现在没有可休想的行动' };
      if (pd.nopeBy.includes(from)) return { ok: false, err: '你已经休想过了' };
      const hand = H.hands[from] || [];
      const ni = hand.findIndex(c => kindOf(c) === 'nope');
      if (ni < 0) return { ok: false, err: '你没有休想卡' };
      hand.splice(ni, 1);
      G.discard.push('nope:j' + (junkSeq++));   // 休想牌用后即弃：占位唯一 id 供展示
      pd.nopeN++; pd.nopeBy.push(from);
      pd.deadline = Math.min(pd.t0 + T.nopeCap, Date.now() + T.nopeStep);
      log(`🚫 ${P(from).name} 打出了「休想」！`);
      ev('nope', from);
      P(from).afk = 0;
      return { ok: true };
    }

    /* ── 抽牌 ── */
    function draw(pid, force) {
      const p = P(pid);
      if (G.stage !== 'turn' || !G.turn || G.turn.pid !== pid) return { ok: false, err: '还没轮到你' };
      if (G.turn.pending) return { ok: false, err: '先等当前行动结算' };
      if (!force && G.turn.attackQueued > 0) return { ok: false, err: '已打出攻击，不能抽牌——点「结束回合」' };
      if (!force && G.turn.skipFlag) return { ok: false, err: '本回合已被略过' };
      if (!H.deck.length) { log('牌库空了，跳过抽牌'); endTurn(); return { ok: true }; }
      const card = H.deck.shift();
      G.deckN = H.deck.length;
      const hand = H.hands[pid] || [];
      if (kindOf(card) === 'ek') {
        log(`💣 ${p.name} 抽到了炸弹猫！`);
        ev('ek', pid);
        const di = hand.findIndex(c => kindOf(c) === 'defuse');
        if (di >= 0) {
          H.ekPending = card;
          G.turn.pending = { kind: 'defuse', pid, deadline: Date.now() + T.defuse, t0: Date.now() };
          log(`✂️ ${p.name} 打出拆除——正在安排炸弹的去处…`);
          ev('defuse', pid);
        } else {
          explode(pid, card);
          endTurn();
        }
      } else {
        hand.push(card);
        log(`${p.name} 抽了一张牌`);
        ev('drawcard', pid);
        endTurn();
      }
      if (!force) p.afk = 0;   // 代抽不清 afk（否则快进档永远到不了 2）
      return { ok: true };
    }

    function explode(pid, ekCard) {
      const p = P(pid);
      p.alive = false;
      const hand = H.hands[pid] || []; H.hands[pid] = [];
      G.discard.push(...hand, ekCard);
      G.deckN = H.deck.length;
      log(`💥 ${p.name} 被炸出局了！`);
      ev('boom', pid);
      checkWin();
    }

    /* ── 拆除插牌 ── */
    function insert(pid, pos) {
      const pd = G.turn && G.turn.pending;
      if (G.stage !== 'turn' || !pd || pd.kind !== 'defuse' || pd.pid !== pid) return { ok: false, err: '现在不是你的拆牌时间' };
      const hand = H.hands[pid] || [];
      const di = hand.findIndex(c => kindOf(c) === 'defuse');
      if (di < 0) return { ok: false, err: '你没有拆除卡' };
      hand.splice(di, 1);
      G.discard.push('defuse:j' + (junkSeq++));
      const posN = Math.max(0, Math.min(H.deck.length, pos | 0));
      H.deck.splice(posN, 0, H.ekPending || 'ek:auto');
      H.ekPending = null;
      G.deckN = H.deck.length;
      log(`🛠 ${P(pid).name} 把炸弹塞回了牌库（位置保密）`);
      ev('inserted', pid);
      G.turn.pending = null;
      endTurn();
      return { ok: true };
    }

    /* ── 恩惠给牌 / 弃牌挑选 / 点名 ── */
    function give(pid, idx) {
      const pd = G.turn && G.turn.pending;
      if (G.stage !== 'turn' || !pd || pd.kind !== 'give' || pd.pid !== pid) return { ok: false, err: '现在不用给牌' };
      const receiver = P(pd.to);
      if (!receiver || !receiver.alive || receiver.left) { G.turn.pending = null; log('🎁 恩惠接收方已离场，取消'); return { ok: true }; }
      const hand = H.hands[pid] || [];
      if (!Number.isInteger(idx) || idx < 0 || idx >= hand.length) return { ok: false, err: '没有这张牌' };
      const card = hand.splice(idx, 1)[0];
      (H.hands[pd.to] || []).push(card);
      log(`🤝 ${P(pid).name} 交出了一张牌`);
      ev('gave', pid, { to: pd.to });
      G.turn.pending = null;
      P(pid).afk = 0;
      return { ok: true };
    }
    function pickDiscard(pid, cardId) {
      const pd = G.turn && G.turn.pending;
      if (G.stage !== 'turn' || !pd || pd.kind !== 'pick' || pd.pid !== pid) return { ok: false, err: '现在不能挑弃牌' };
      const i = G.discard.indexOf(cardId);
      if (i < 0) return { ok: false, err: '弃牌堆里没有这张' };
      G.discard.splice(i, 1);
      (H.hands[pid] || []).push(cardId);
      log(`🃏 ${P(pid).name} 从弃牌堆捡回了【${nameOf(cardId)}】`);
      G.turn.pending = null;
      P(pid).afk = 0;
      return { ok: true };
    }

    /* ── nope 窗口结算 ── */
    function closeNopeWindow() {
      const pd = G.turn.pending;
      G.turn.pending = null;
      G.turn.acted = Date.now();   // 结算后行动权回到出牌者，决策时钟重新起算
      const actor = P(pd.pid);
      G.discard.push(...pd.cards);
      if (pd.nopeN % 2 === 1) {
        log(`⛔ 行动被休想了（${pd.nopeN} 张休想）`);
        ev('nopeDone');
        return;
      }
      const e = pd.eff;
      if (e.k === 'attack') { G.turn.attackQueued++; log(`⚔️ 下家要做额外的回合（当前累计 ${G.turn.attackQueued}）`); }
      else if (e.k === 'skip') { G.turn.skipFlag = true; log(`⏭️ ${actor.name} 略过了本回合（不用抽牌）`); endTurn(); }
      else if (e.k === 'shuffle') { shuffleDeck(); log(`🔀 牌库被洗混了`); ev('shuffle'); }
      else if (e.k === 'stf') {
        const peek = H.deck.slice(0, 3);
        api._sendPriv(pd.pid, { peek });
        log(`🔮 ${actor.name} 窥视了牌库顶`);
      }
      else if (e.k === 'favor') {
        G.turn.pending = { kind: 'give', pid: e.target, to: pd.pid, deadline: Date.now() + T.favor, t0: Date.now() };
        log(`🎁 ${P(e.target).name} 要选一张牌给 ${actor.name}`);
      }
      else if (e.k === 'combo2') {
        const th = H.hands[e.target] || [];
        if (th.length) {
          const i = Math.floor(rnd() * th.length);
          const card = th.splice(i, 1)[0];
          (H.hands[pd.pid] || []).push(card);
          log(`🃏 ${actor.name} 从 ${P(e.target).name} 手里抽走了一张牌`);
          ev('steal', pd.pid, { from: e.target });
        }
      }
      else if (e.k === 'combo3') {
        const th = H.hands[e.target] || [];
        const i = th.findIndex(c => titleOf(c) === e.namePick);
        if (i >= 0) {
          const card = th.splice(i, 1)[0];
          (H.hands[pd.pid] || []).push(card);
          log(`🎯 ${P(e.target).name} 有一张【${nameOf(e.namePick + ':0')}】，被交了出来`);
          ev('steal', pd.pid, { from: e.target });
        } else log(`空欢喜——${P(e.target).name} 没有【${nameOf(e.namePick + ':0')}】`);
      }
      else if (e.k === 'combo5') {
        G.turn.pending = { kind: 'pick', pid: pd.pid, deadline: Date.now() + T.pick, t0: Date.now() };
        log(`🃏 ${actor.name} 可以从弃牌堆挑一张`);
      }
    }

    function resolvePendingTimeout() {
      const pd = G.turn && G.turn.pending;
      if (!pd) return;
      if (pd.kind === 'nope') closeNopeWindow();
      else if (pd.kind === 'defuse') {
        const r = insert(pd.pid, Math.floor(rnd() * (H.deck.length + 1)));
        if (!r.ok) {   // 手牌已被清空（离场）等异常：炸弹随机回库并收尾，绝不悬挂 pending（P0 死锁回归锁）
          H.deck.splice(Math.floor(rnd() * (H.deck.length + 1)), 0, H.ekPending || 'ek:auto');
          H.ekPending = null; G.deckN = H.deck.length;
          G.turn.pending = null; log('✂️ 拆牌异常，炸弹已随机放回牌库');
          endTurn();
        }
      }
      else if (pd.kind === 'give') {
        const hand = H.hands[pd.pid] || [];
        if (hand.length) { const i = Math.floor(rnd() * hand.length); give(pd.pid, i); }
        else { G.turn.pending = null; log(`${P(pd.pid).name} 没有牌可给`); }
      }
      else if (pd.kind === 'pick') {
        if (G.discard.length) pickDiscard(pd.pid, G.discard[G.discard.length - 1]);
        else G.turn.pending = null;
      }
    }

    /* ── 回合收尾与转结 ── */
    function endTurn() {
      if (G.stage !== 'turn') return;
      if (alive().length <= 1) { checkWin(); return; }
      const cur = G.turn;
      const curP = P(cur.pid);
      let nid, nextra;
      if (cur.attackQueued > 0) {
        nid = nextAliveAfter(cur.pid);
        nextra = cur.attackQueued + cur.extra;
        if (nextra > 0) log(`⚔️ ${P(nid) ? P(nid).name : '?'} 要连续进行 ${nextra + 1} 个回合`);
      } else if (cur.extra > 0) {
        nid = cur.pid; nextra = cur.extra - 1;
      } else {
        nid = nextAliveAfter(cur.pid); nextra = 0;
      }
      if (!nid) { checkWin(); return; }
      G.turn = { pid: nid, extra: nextra, attackQueued: 0, skipFlag: false, acted: Date.now(), pending: null };
      api._sendPriv(nid, {});
    }

    /* ── 看门狗：唯一时钟（主机每秒调用）── */
    function tick(now) {
      now = now || Date.now();
      if (G.stage !== 'turn' || !G.turn) return;
      const pd = G.turn.pending;
      if (pd) {
        if (now >= pd.deadline) resolvePendingTimeout();
        return;
      }
      const p = P(G.turn.pid);
      if (!p || !p.alive || p.left) { endTurn(); return; }
      const limit = p.afk >= 2 ? T.afk : T.turn;
      if (now - G.turn.acted > limit) {
        p.afk++;
        ev('afk', p.id);
        if (G.turn.attackQueued > 0 || G.turn.skipFlag) {
          log(`⏰ 等 ${p.name} 超时，替 TA 结束回合（不抽牌）`);   // 攻击/略过回合不许代抽
          endTurn();
        } else {
          log(`⏰ 等 ${p.name} 超时，替 TA 抽牌（${p.afk} 次）`);
          draw(G.turn.pid, true);
        }
      }
    }

    /* ── 私密包 ── */
    function privateFor(pid) {
      return { ver: G.ver, seq: G.seq, hand: (H.hands[pid] || []).slice(), peek: null, ts: Date.now() };
    }
    function applyHello(pid) { return privateFor(pid); }

    /* ── 动作入口（主机校验 + 幂等）── */
    function act(msg) {
      if (!msg || typeof msg !== 'object') return { ok: false, err: 'bad act' };
      const key = (msg.from || '') + ':' + (msg.mid || '');
      if (msg.mid) {
        if (seenMids.includes(key)) return { ok: true, dup: true };
        seenMids.push(key); if (seenMids.length > 64) seenMids.shift();
      }
      const from = msg.from;
      const a = msg.a || {};
      switch (a.t) {
        case 'hello': {
          const p = P(from); if (p) p.lastSeen = Date.now();
          return { ok: true, priv: applyHello(from) };
        }
        case 'join': return join(from, a.name, a.av);
        case 'leave': return leave(from);
        case 'start': return G.hostId === from ? start() : { ok: false, err: '只有房主能开局' };
        case 'play': return play(from, a.idxs, a.target, a.namePick);
        case 'draw': return draw(from);
        case 'end': {
          if (G.stage !== 'turn' || !G.turn || G.turn.pid !== from) return { ok: false, err: '还没轮到你' };
          if (G.turn.pending) return { ok: false, err: '先等当前行动结算' };
          if (G.turn.attackQueued <= 0) return { ok: false, err: '还有抽牌没抽' };
          log(`${P(from).name} 结束了回合（不抽牌）`);
          P(from).afk = 0;
          endTurn();
          return { ok: true };
        }
        case 'nope': return nope(from);
        case 'insert': return insert(from, a.pos);
        case 'give': return give(from, a.idx);
        case 'pickDiscard': return pickDiscard(from, a.cardId);
        default: return { ok: false, err: '未知动作 ' + a.t };
      }
    }

    function touch(pid) { const p = P(pid); if (p && G.turn && G.turn.pid === pid) G.turn.acted = Date.now(); if (p) p.afk = 0; }

    const api = {
      G, DEFS, CATKINDS, NAMEABLE, kindOf, titleOf, nameOf,
      start, join, leave, play, draw, nope, insert, give, pickDiscard, endTurn, tick, act, touch,
      privateFor, checkWin, syncCounts, consumeDirty: () => { const d = dirty; dirty = false; return d; },
      _sendPriv: () => {},          // 宿主注入：定向私密包
      _rnd: () => rnd,
      _setSeed(s) { seed = s >>> 0; rnd = mulberry32(seed); },
      _forceDeck(ids) { forcedDeck = ids.slice(); },
      _T: T,
      _H: H,
    };
    return api;
  }

  return { DEFS, CATKINDS, NAMEABLE, PER_DECK, kindOf, titleOf, nameOf, mulberry32, create, T };
})();
