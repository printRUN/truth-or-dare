# -*- coding: utf-8 -*-
# 随机惩罚模式补丁：tod.html（评审 SHIP WITH FIXES 后定稿版）
s = open('tod.html', encoding='utf8', newline='').read()
assert '\r' not in s

def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, 'anchor x%d (want %d): %r' % (s.count(old), cnt, old[:60])
    s = s.replace(old, new)

# ═══ 1. 题库数据（DEFAULT_PUNISHMENTS 之后）═══
rep("const DEFAULT_PUNISHMENTS = JSON.parse(JSON.stringify(PACKS.party));",
"""const DEFAULT_PUNISHMENTS = JSON.parse(JSON.stringify(PACKS.party));
// 🎲 随机惩罚模式题库（S.challenge 开启时替换「大冒险」抽题）：[形式, 题面, 参考答案?]
// 红线：『形式』+题面 全角 ≤40 字（3D 牌面 5 行容量悬崖，probe-challenge 有断言）；条目本轮不可编辑（题库编辑器只管 truth/dare）
const CHALLENGE_POOL = [
  ['成语接龙', '以「一心一意」开头，接力 3 个成语'], ['成语接龙', '以「守株待兔」开头，接力 3 个成语'],
  ['成语接龙', '以「马到成功」开头，接力 3 个成语'], ['成语接龙', '以「井底之蛙」开头，接力 3 个成语'],
  ['成语接龙', '以「画蛇添足」开头，接力 3 个成语'], ['成语接龙', '以「亡羊补牢」开头，接力 3 个成语'],
  ['成语接龙', '以「雪中送炭」开头，接力 3 个成语'], ['成语接龙', '以「九牛一毛」开头，接力 3 个成语'],
  ['成语接龙', '以「天长地久」开头，接力 3 个成语'], ['成语接龙', '以「走马观花」开头，接力 3 个成语'],
  ['成语接龙', '以「水滴石穿」开头，接力 3 个成语'], ['成语接龙', '以「出人头地」开头，接力 3 个成语'],
  ['古诗接句', '「床前明月光」的下一句是？', '疑是地上霜'], ['古诗接句', '「春眠不觉晓」的下一句是？', '处处闻啼鸟'],
  ['古诗接句', '「谁知盘中餐」的下一句是？', '粒粒皆辛苦'], ['古诗接句', '「欲穷千里目」的下一句是？', '更上一层楼'],
  ['古诗接句', '「海内存知己」的下一句是？', '天涯若比邻'], ['古诗接句', '「野火烧不尽」的下一句是？', '春风吹又生'],
  ['古诗接句', '「但愿人长久」的下一句是？', '千里共婵娟'], ['古诗接句', '「会当凌绝顶」的下一句是？', '一览众山小'],
  ['脑筋急转弯', '什么东西越洗越脏？', '水'], ['脑筋急转弯', '小明的妈妈有三个孩子，大毛、二毛，第三个叫什么？', '小明'],
  ['脑筋急转弯', '什么车寸步难行？', '风车'], ['脑筋急转弯', '什么门永远关不上？', '球门'],
  ['脑筋急转弯', '什么布剪不断？', '瀑布'], ['脑筋急转弯', '一年四季都盛开的花是什么花？', '塑料花'],
  ['脑筋急转弯', '什么东西越热越爱出来？', '汗'], ['脑筋急转弯', '什么鸡没有翅膀？', '田鸡'],
  ['绕口令', '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮，连念三遍'], ['绕口令', '四是四，十是十，十四是十四，四十是四十，连念三遍'],
  ['绕口令', '红凤凰，粉凤凰，红粉凤凰花凤凰，连念三遍'], ['绕口令', '黑化肥发灰，灰化肥发黑，连念三遍'],
  ['绕口令', '八百标兵奔北坡，炮兵并排北边跑，连念三遍'], ['绕口令', '牛郎恋刘娘，刘娘念牛郎，连念三遍'],
  ['三连快答', '10 秒内说出 3 个带「马」字的成语'], ['三连快答', '10 秒内说出 3 个带「州」字的城市'],
  ['三连快答', '10 秒内说出 3 种水果'], ['三连快答', '10 秒内说出 3 个三国人物'],
  ['三连快答', '10 秒内说出 3 种乐器'], ['三连快答', '10 秒内说出 3 种运动'],
  ['三连快答', '10 秒内说出 3 个《西游记》人物'], ['三连快答', '10 秒内说出 3 个带「花」字的成语'],
  ['24 点', '用 3、3、8、8 凑出 24，加减乘除随便用', '8÷(3−8÷3)=24'], ['24 点', '用 1、5、5、5 凑出 24', '5×(5−1÷5)=24'],
  ['24 点', '用 3、3、7、7 凑出 24', '(3+3÷7)×7=24'], ['24 点', '用 4、4、10、10 凑出 24', '(10×10−4)÷4=24'],
  ['24 点', '用 2、4、6、8 凑出 24，四个数都要用', '6×8÷(4−2)=24'], ['24 点', '用 1、2、3、4 凑出 24', '1×2×3×4=24'],
  ['模仿秀', '模仿一种动物叫声，让大伙 30 秒内猜出来'], ['模仿秀', '模仿一位在场玩家的口头禅或招牌动作，被模仿者猜中才算过'],
  ['模仿秀', '模仿古装剧里的告老还乡式哭戏，坚持 15 秒'], ['模仿秀', '用哑剧表演「早上闹钟响了又赖床」，不许出声'],
  ['模仿秀', '模仿一位明星唱歌，大伙猜出是谁才算过'], ['模仿秀', '扮演导游，用一段话把客厅介绍成 5A 景区'],
  ['故事接龙', '以「那天深夜，门铃突然响了…」开头，即兴讲 30 秒'], ['故事接龙', '以「我捡到一个会说话的钱包…」开头，编 30 秒'],
  ['故事接龙', '把今天在场三个人的名字编进一个 30 秒故事里'], ['故事接龙', '以「外星人降落在我家阳台…」开头即兴发挥 30 秒'],
  ['故事接龙', '悬疑开头+喜剧结尾，讲一个 30 秒小故事'],
  ['猜谜语', '五个兄弟，住在一起，名字不同，高矮不齐。（打一人体部位）', '手指'], ['猜谜语', '千条线，万条线，掉到水里看不见。（打一自然现象）', '雨'],
  ['猜谜语', '一个小姑娘，坐在水中央，身穿粉红袄，阵阵放清香。（打一植物）', '荷花'], ['猜谜语', '小小诸葛亮，独坐军中帐，摆下八卦阵，专捉飞来将。（打一动物）', '蜘蛛'],
  ['猜谜语', '有面没有口，有脚没有手，虽有四只脚，自己不会走。（打一家具）', '桌子'], ['猜谜语', '白白一身裘，爱往水里游，憋气憋得久，转身吐泡泡。（打一动物）', '鸭子'],
  ['反口令', '和任意一人玩 15 秒反口令：喊举左手必须举右手，错三次算输'], ['反口令', '15 秒反口令：喊「蹲下」必须站直，喊「起立」必须蹲下'],
].map(function (t) { return { f: t[0], x: t[1], a: t[2] || '' }; });""")

# ═══ 2. punParts + drawChallenge + drawPunishment 路由 ═══
rep("function drawPunishment(n, type) {",
"""// 随机惩罚串格式：『形式』题面[\\u0001参考答案]——\\u0001 只在 textContent/fillText 渲染前拆分，禁入 innerHTML
function punParts(p) {
  const str = String(p || '');
  const i = str.indexOf('\\u0001');
  return i < 0 ? { text: str, ans: '' } : { text: str.slice(0, i), ans: str.slice(i + 1) };
}
function drawChallenge(n) {   // 镜像 drawPunishment 的近期防重复；去重键带形式名防跨形式撞文本
  if (!n.recent) n.recent = { truth: [], dare: [] };
  n.recent.chal = n.recent.chal || [];
  let fresh = CHALLENGE_POOL.filter(function (it) { return !n.recent.chal.includes(it.f + '|' + it.x); });
  if (!fresh.length) { n.recent.chal.length = 0; fresh = CHALLENGE_POOL; }
  const it = pick(fresh);
  n.recent.chal.push(it.f + '|' + it.x);
  const cap = Math.max(1, Math.min(10, Math.floor(CHALLENGE_POOL.length * 0.6)));
  while (n.recent.chal.length > cap) n.recent.chal.shift();
  return '『' + it.f + '』' + it.x + (it.a ? '\\u0001' + it.a : '');
}
function drawPunishment(n, type) {
  if (type === 'dare' && n.challenge) return drawChallenge(n);   // 🎲 随机惩罚模式：大冒险位换成随机小游戏，真心话不受影响""")

# ═══ 3. lastAnsSig 声明 ═══
rep("let cardDealt = false, revealAnim = false;",
"let cardDealt = false, revealAnim = false;\nlet lastAnsSig = '';   // 揭底三件套只在「回合签名」变化时重置：心跳全量重渲染不得抹掉已点开的答案（评审 R2）")

# ═══ 4. revealed 分支：牌面文本拆分 + 揭底复位 ═══
rep("    $('punishment-text').textContent = t.punishment || '';",
"""    const pp = punParts(t.punishment);
    $('punishment-text').textContent = pp.text || '';
    const ansSig = (t.seq || 0) + '|' + (t.punishment || '');
    if (ansSig !== lastAnsSig) {
      lastAnsSig = ansSig;
      $('answer-row').hidden = !pp.ans;
      $('btn-answer').hidden = !pp.ans;
      $('answer-text').textContent = pp.ans || '';
      $('answer-text').hidden = true;
    }""")

# ═══ 5. 打字机喂 text 部分 ═══
rep("typewriter($('punishment-text'), t.punishment || '（空）', 32, () => {",
"typewriter($('punishment-text'), punParts(t.punishment).text || '（空）', 32, () => {")

# ═══ 6. drawQuestion 两处喂 text ═══
rep("drawQuestion(t2.choice !== 'dare', ch && ch.name, t2.punishment, avCanvasOf(ch));",
"drawQuestion(t2.choice !== 'dare', ch && ch.name, punParts(t2.punishment).text, avCanvasOf(ch));")
rep("drawQuestion(S.turn.choice !== 'dare', ch && ch.name, S.turn.punishment, avCanvasOf(ch));",
"drawQuestion(S.turn.choice !== 'dare', ch && ch.name, punParts(S.turn.punishment).text, avCanvasOf(ch));")

# ═══ 7. 3D 牌面字号安全带（评审 R1：40 字数据契约下的兜底）═══
rep("while (lines === null && fs > 40) { fs -= 6; lines = wrap(fs); }",
"while (lines === null && fs > 30) { fs -= 6; lines = wrap(fs); }   // 40 字题面（随机惩罚上限）在 fs30 有 5 行×14 字容量，空白卡不可能")

# ═══ 8. 揭底 DOM（card-actions 之后）═══
rep("""            <div class="card-actions" id="card-actions">
              <button class="btn-accept" id="btn-accept">完成啦 ✅</button>
              <button class="btn-pass" id="btn-pass" hidden>🃏 免答牌 <span id="pass-left"></span></button>
              <button class="btn-skip" id="btn-skip">这题先跳过</button>
            </div>""",
"""            <div class="card-actions" id="card-actions">
              <button class="btn-accept" id="btn-accept">完成啦 ✅</button>
              <button class="btn-pass" id="btn-pass" hidden>🃏 免答牌 <span id="pass-left"></span></button>
              <button class="btn-skip" id="btn-skip">这题先跳过</button>
            </div>
            <div class="answer-row" id="answer-row" hidden>
              <button class="btn-ans" id="btn-answer" type="button">💡 揭底</button>
              <div class="answer-text" id="answer-text" hidden></div>
            </div>""")

# ═══ 9. CSS（.btn-reroll:hover 之后；纯静态无 keyframes，REDUCED/loperf 零补）═══
rep("    .btn-reroll:hover { background: rgba(34,211,238,0.28); }",
"""    .btn-reroll:hover { background: rgba(34,211,238,0.28); }
    .answer-row { display: flex; flex-direction: column; gap: 6px; align-items: center; flex: none; }
    .btn-ans { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.45); padding: 8px 16px; border-radius: 12px; font-family: inherit; font-weight: 700; cursor: pointer; font-size: 0.88rem; }
    .btn-ans:hover { background: rgba(251,191,36,0.24); }
    .answer-text { color: #fcd34d; font-size: 0.95rem; font-weight: 700; line-height: 1.5; text-align: center; }
    body.landui .answer-row { gap: 4px; }
    body.landui .btn-ans { min-height: 36px; padding: 6px 14px; font-size: 0.84rem; }""")

# 3D 浮窗内按钮尺寸（原规则罩不到 .card-actions 外的 btn-answer）
rep("    #stage-actions .card-actions button { padding: 10px 20px; font-size: 0.92rem; border-radius: 13px; min-height: 42px; }",
"""    #stage-actions .card-actions button { padding: 10px 20px; font-size: 0.92rem; border-radius: 13px; min-height: 42px; }
    #stage-actions .answer-row button { padding: 10px 20px; font-size: 0.92rem; border-radius: 13px; min-height: 42px; }""")

# ═══ 10. bridgeSync：揭底块随 card-actions 上浮窗 ═══
rep("if (csOut) { bridgeMove(document.getElementById('card-actions')); bridgeMove(document.getElementById('btn-reroll')); }",
"if (csOut) { bridgeMove(document.getElementById('card-actions')); bridgeMove(document.getElementById('answer-row')); bridgeMove(document.getElementById('btn-reroll')); }")

# ═══ 11. 设置开关（st-scoring 同组）═══
rep("""<div class="mini-row"><button type="button" class="mini-opt${sc ? ' sel' : ''}" id="st-scoring">🏆 计分竞技：${sc ? '开' : '关'}</button></div>""",
"""<div class="mini-row"><button type="button" class="mini-opt${sc ? ' sel' : ''}" id="st-scoring">🏆 计分竞技：${sc ? '开' : '关'}</button><button type="button" class="mini-opt${S.challenge === true ? ' sel' : ''}" id="st-challenge">🎲 随机惩罚：${S.challenge === true ? '开' : '关'}</button></div>""")

rep("""  $('st-scoring').addEventListener('click', async () => {
    await mutate(n => { n.scoring = n.scoring === false; });
    openSettingsModal();
  });""",
"""  $('st-scoring').addEventListener('click', async () => {
    await mutate(n => { n.scoring = n.scoring === false; });
    openSettingsModal();
  });
  $('st-challenge').addEventListener('click', async () => {
    await mutate(n => { n.challenge = n.challenge !== true; });
    openSettingsModal();
    toast(S.challenge === true ? '🎲 随机惩罚已开启：大冒险将换成随机小游戏（成语接龙、古诗接句、脑筋急转弯…），真心话不变' : '🎲 随机惩罚已关闭：大冒险恢复普通题库', 'success');
  });""")

# ═══ 12. 揭底点击 ═══
rep("$('btn-skip').addEventListener('click', () => finishTurn(true));",
"""$('btn-skip').addEventListener('click', () => finishTurn(true));
$('btn-answer').addEventListener('click', () => {   // 💡 揭底：全员可点（答案=全场公证人）；本端 DOM 态，签名不变则不被心跳重置
  SFX.tap();
  $('btn-answer').hidden = true;
  $('answer-text').hidden = false;
});""")

open('tod.html', 'w', encoding='utf8', newline='\n').write(s)
print('tod.html patched:', len(s), 'bytes')
