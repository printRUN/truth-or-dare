const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
function rep(re, neu, tag) { if (!re.test(s)) throw new Error('missing: ' + tag); s = s.replace(re, neu); }

// ── 逻辑终审 P0-1：免答牌/换一题后 3D 题卡必须重绘（否则玩家对旧题打完整轮）──
// 1) 辅助函数：取已栅格化的头像 canvas
rep(/(  function drawQuestion\(truth, name, text, avatarCanvas\) \{)/,
`  function avCanvasOf(ch) {   // 已栅格化的 256px 头像 canvas（SVG/emoji 同源同修）
    const e = ch && texCache.get(ch.id);
    const img = e && e.tex && e.tex.image;
    return (img && img.width) ? img : null;
  }
$1`, 'avhelper');
// 2) shown 期题面签名边沿 → 重绘
rep(/(    if \(st\.phase === 'shown'\) actionCard\.scale\.set\(1, 1, 1\);[^\r\n]*\r?\n)/,
`$1    if (stage === 'revealed' && st.phase === 'shown') {   // 免答牌/换一题：题面签名边沿 → 回合级重绘（逻辑终审 P0-1：否则玩家对旧题打完整轮）
      const sig = (S.turn.punishment || '') + '#' + (S.turn.choice || '') + '#' + (S.turn.chooserId || '');
      if (sig !== (frame.qSig || '')) {
        frame.qSig = sig;
        try {
          const ch = (S.players || []).find(p => p.id === S.turn.chooserId);
          drawQuestion(S.turn.choice !== 'dare', ch && ch.name, S.turn.punishment, avCanvasOf(ch));
        } catch (e) {}
      }
    }
`, 'p0-1sig');
// 3) 飞卡起始绘制处：统一用 avCanvasOf + 记签名
rep(/          const av = ch && texCache\.get\(ch\.id\);\r?\n          drawQuestion\(t2\.choice !== 'dare', ch && ch\.name, t2\.punishment, av && av\.tex && av\.tex\.image && av\.tex\.image\.width \? av\.tex\.image : null\);/,
`          drawQuestion(t2.choice !== 'dare', ch && ch.name, t2.punishment, avCanvasOf(ch));`, 'qcall');
rep(/(      st\.phase = IS_REDUCED \? 'shown' : 'flip'; st\.t0 = now;\r?\n      actionCard\.visible = true;\r?\n)(      if \(IS_REDUCED\))/,
`$1      frame.qSig = (S.turn.punishment || '') + '#' + (S.turn.choice || '') + '#' + (S.turn.chooserId || '');
$2`, 'qsig-init');

// ── 逻辑终审 P1-2：远边枢轴翻面后卡体落在 z=-1.28，取景中心对齐它 ──
rep(/  const CARD_LOOK = new THREE\.Vector3\(0, FELT_Y \+ 0\.05, REST\.z\);/,
  '  const CARD_LOOK = new THREE.Vector3(0, FELT_Y + 0.05, REST.z - CARD_L);   // 翻面后卡心实际在 -1.28（远边枢轴北移一个卡长），取景对齐它', 'cardlook');

// ── 逻辑终审 P1-3：按钮搬运按阶段准入 ──
rep(/    const csOut = !!\(cs && !cs\.hidden\);\r?\n    const srOut = !!\(sr && !sr\.hidden\);/,
`    let stageNow = '';
    try { stageNow = S.turn.stage; } catch (e) {}
    const csOut = !!(cs && !cs.hidden && stageNow === 'revealed');   // dealFlyingCard 会提前取消 hidden：完成啦组只在 revealed 上桌
    const srOut = !!(sr && !sr.hidden && stageNow === 'choosing');   // 押注只属于选卡期，别一路挂到揭晓`, 'bridge');

// ── 逻辑终审 P1-4：CSS 揭晓压暗罩在 three3d 下压住 GL 题卡——隐藏 ──
rep(/(    body\.three3d:not\(\.loperf\) #card-section \{ display: none !important; \})/,
`$1
    body.three3d:not(.loperf) .players-grid.ring3d::after { display: none; }   /* CSS 揭晓压暗罩是给 DOM 卡的：3D 里它会把题卡/名牌压暗一整层（逻辑终审 P1-4） */`, 'after');

// ── verify 回归修复：远座名牌缩放后仍 ≥64px（rs≈0.81 → min-width 80）──
rep(/@media \(min-width: 768px\) \{ body\.three3d:not\(\.loperf\) #game-players-grid \.player-card \.player-name \{ min-width: 72px; \} \}/,
  '@media (min-width: 768px) { body.three3d:not(.loperf) #game-players-grid .player-card .player-name { min-width: 80px; } }', 'minwidth');

// ── 工具行折行策略：桌面折行（全部可点），仅 <768px 单行横滚（900px 上限会裁掉尾按钮）──
rep(/(body\.three3d:not\(\.loperf\) #game-tools \{ position: fixed; left: 50%; transform: translateX\(-50%\); bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 8px\); margin: 0 !important; z-index: 40;) flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; width: min\(96vw, 900px\); justify-content: flex-start; \}/,
'$1 width: min(96vw, 1100px); }   /* 桌面折行（全部可点）；<768px 见下：单行横滚 */\n    @media (max-width: 767px) { body.three3d:not(.loperf) #game-tools { flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; justify-content: flex-start; } }', 'tools');

fs.writeFileSync('index.html', s);
console.log('final fixes patched');
