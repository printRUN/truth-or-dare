
'use strict';
// ═══════════════════════════════════════════════════════════════
// 真心话大冒险 · 在线多人
// 联机方案：公共 MQTT broker（WebSocket, 免注册免 key, 实时推送）
//   - 房间状态 = topic `tod/v1/<房间号>/state`，retained 消息即房间最新状态
//   - 房间题库 = topic `tod/v1/<房间号>/pool`（单独一路，不随每次抽卡重发）
//   - 任何客户端修改状态后整体发布（Party 游戏规模下 last-write-wins + 自愈）
// 降级方案：BroadcastChannel + localStorage（同浏览器多标签）
// ═══════════════════════════════════════════════════════════════

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const MAX_PLAYERS = 16;
const HEARTBEAT_MS = 25000;
const STALE_MS = 90000;       // 超过 90s 无心跳视为掉线幽灵
const DRAWING_MAX_MS = 9000;  // 抽卡阶段最迟 9s 内必须出结果（后备机制）
const ANIM_DRAWING_MIN_MS = 2600; // 抽卡动画最短播放时长，保证各端节奏一致

const DEFAULT_PUNISHMENTS = {
  truth: [
    "你曾经做过的最尴尬的事情是什么？",
    "你暗恋过在场的人吗？",
    "你手机里最大的秘密是什么？",
    "你上次哭是什么时候，为什么？",
    "你最不想让谁知道的事情是什么？",
    "你说过最大的谎是什么？",
    "你最自卑的地方是什么？",
    "你偷偷喜欢过谁很久？",
    "你做过的最疯狂的事是什么？",
    "你手机相册里哪张照片最不想被看到？",
    "你心里对在场某人的真实看法是什么？",
    "你最害怕失去什么？",
    "你有没有对谁说过假话，说了什么？",
    "你小时候最害怕什么？",
    "你现在的真实感受是什么？"
  ],
  dare: [
    "模仿在场某人的标志性动作或口头禅",
    "给最近联系人发一条搞笑消息，然后展示回复",
    "用屁股写字写你的名字",
    "当场模仿最近火的一个短视频",
    "对你左边的人唱情歌",
    "做10个俯卧撑",
    "用三根手指倒立（或者尝试）",
    "当场给某人说一句土味情话",
    "模仿在场你最不熟悉的人的说话方式",
    "用一张纸巾做一个创意造型展示",
    "当场学一种动物的叫声持续10秒",
    "对你的手机语音助手说\"我爱你\"并展示反应",
    "做鬼脸拍照发朋友圈（不设分组）",
    "当场模仿一个emoji的表情",
    "对在场的每个人说一句赞美的话"
  ]
};

// ───────────────────────────── utils ─────────────────────────────
const $ = id => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function genId() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }
function roomCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
// 本地确定性头像：鹅鸭杀风小鸟 × 文艺手账配色（纯 SVG data-URI，零网络依赖）
const P_PLUME = [
  ['#fbf7ef', '#ded1bb'], ['#eef0f6', '#c2c8d9'], ['#f8e8d3', '#dcb793'], ['#f8dfe3', '#dbb0b8'],
  ['#e6eddf', '#b8ccb5'], ['#eae3f4', '#bfb0da'], ['#e0ebf2', '#adc7da'],
];
const P_BEAK = [['#f2a83e', '#cf7d24'], ['#f7c95f', '#dda32f'], ['#e78d6b', '#c05d3f'], ['#efbba7', '#ce8d76']];
const P_BG = [
  ['#f7eeda', '#e4cfa8', '#7a5c37'], ['#e3ece7', '#b5cec2', '#48685c'], ['#ece2f2', '#c4b1de', '#5a4379'],
  ['#dee9f3', '#accae0', '#3c6079'], ['#f7e3dd', '#e0afa5', '#84504a'], ['#f1ebda', '#d2c299', '#6d6039'],
  ['#e7e7ef', '#bfc1d6', '#4e4f6b'], ['#eaebeb', '#bec6c6', '#4c5656'],
];
const P_ACC = ['#c6706f', '#88a079', '#7a6ba7', '#d7a441', '#5f8aa8', '#bd7a9c', '#a8794f'];

function birdAvatar(o) {
  const G = o.sil === 1;                        // 1 = 鹅（长脖） · 0 = 鸭（圆胖）
  const [p1, p2] = P_PLUME[o.plume % 7], [b1, b2] = P_BEAK[o.beak % 4];
  const [g1, g2, ink] = P_BG[o.bg % 8], acc = P_ACC[o.col % 7];
  const hy = G ? 32 : 44, hr = G ? 14.5 : 20, ex = G ? 6.5 : 9;
  const ey = G ? 30 : 41, by = G ? 38.5 : 50, ny = G ? 52 : 57, fy = G ? 84 : 82, ty = hy - hr;
  const L = 50 - ex, R = 50 + ex;

  // 背景纹样：月夜 / 远山 / 圆相 / 落瓣 / 云纹 / 芦苇
  const motif = [
    `<circle cx="79" cy="19" r="9.5" fill="#fdf3dd"/><path d="M74 11a9.5 9.5 0 000 17 11 11 0 010-17z" fill="${g2}"/><g fill="${ink}" opacity=".5"><circle cx="18" cy="26" r="1.7"/><circle cx="25" cy="16" r="1.2"/><circle cx="14" cy="40" r="1.2"/></g>`,
    `<circle cx="74" cy="24" r="10" fill="${ink}" opacity=".1"/><path d="M0 100 18 68 33 85 51 60 69 87 84 71 100 93v7z" fill="${ink}" opacity=".12"/>`,
    `<circle cx="50" cy="50" r="35" fill="none" stroke="${ink}" stroke-width="3.5" opacity=".14" stroke-dasharray="200 22" stroke-linecap="round"/>`,
    `<g fill="${ink}" opacity=".15"><ellipse cx="19" cy="23" rx="5" ry="2.8" transform="rotate(-28 19 23)"/><ellipse cx="84" cy="33" rx="4.5" ry="2.5" transform="rotate(24 84 33)"/><ellipse cx="73" cy="14" rx="4" ry="2.3" transform="rotate(-12 73 14)"/><ellipse cx="27" cy="82" rx="4.6" ry="2.6" transform="rotate(40 27 82)"/></g>`,
    `<path d="M12 28q5-8 12-3 7-5 12 3-6 6-12 3-7 3-12-3z" fill="${ink}" opacity=".12"/><path d="M68 42q4-6 9-2 5-4 9 2-5 5-9 2-5 3-9-2z" fill="${ink}" opacity=".1"/>`,
    `<g stroke="${ink}" stroke-width="1.8" fill="none" opacity=".18" stroke-linecap="round"><path d="M14 96c3-14-2-25 2-36"/><path d="M16 62c-6-3-7-9-4-13"/><path d="M16 68c6-2 8-7 7-11"/></g><ellipse cx="18" cy="53" rx="3" ry="6" fill="${ink}" opacity=".16" transform="rotate(14 18 53)"/>`,
  ][o.motif % 6];

  // 眼睛（同一函数生成左右眼）
  const EYES = [
    x => `<circle cx="${x}" cy="${ey}" r="4.6" fill="#332c40"/><circle cx="${x + 1.5}" cy="${ey - 1.7}" r="1.7" fill="#fff"/>`,
    x => `<path d="M${x - 4} ${ey + 1.2}q4-5.4 8 0" stroke="#332c40" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    x => `<circle cx="${x}" cy="${ey}" r="4.4" fill="#fff"/><circle cx="${x}" cy="${ey + .8}" r="2.8" fill="#332c40"/><path d="M${x - 4.7} ${ey - 2.2}q4.7 1.4 9.4 0" stroke="${p2}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    x => `<circle cx="${x}" cy="${ey}" r="4.4" fill="#332c40"/><circle cx="${x + 1.4}" cy="${ey - 1.6}" r="1.6" fill="#fff"/><path d="M${x - 4} ${ey - 5}q4-2.6 8 0" stroke="#332c40" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  ];
  const eye = EYES[o.eye % 4], wink = o.eye % 4 === 3;
  const eyes = eye(L) + (wink ? EYES[1](R) : eye(R));

  // 喙（微张时露出内膛）
  const bw = G ? 6.5 : 8.5, bh = G ? 6.5 : 5.5, open = o.beak % 4 === 2;
  const bill = `<path d="M${50 - bw} ${by}Q50 ${by - bh * .6} ${50 + bw} ${by}Q${50 + bw * .7} ${by + bh} 50 ${by + bh}Q${50 - bw * .7} ${by + bh} ${50 - bw} ${by}z" fill="${b1}"/>`
    + (open ? `<ellipse cx="50" cy="${by + bh - 1.2}" rx="${bw - 2}" ry="1.8" fill="${b2}"/>`
            : `<path d="M${50 - bw + 1.5} ${by + 1.6}q${bw - 1.5} 2 ${2 * bw - 3} 0" stroke="${b2}" stroke-width="1.3" fill="none" opacity=".75"/>`);

  // 配饰：无 / 贝雷帽 / 圆框镜 / 围巾 / 耳后花 / 嫩芽 / 领结
  const WEAR = [
    () => '',
    () => `<g transform="rotate(-8 50 ${ty})" fill="${acc}"><path d="M${50 - hr + 1} ${ty + 3}a${hr - 1} ${hr - 1} 0 0 1 ${2 * hr - 2} 0z"/><ellipse cx="50" cy="${ty + 3.4}" rx="${hr - 1}" ry="2.4"/><circle cx="50" cy="${ty - 3.5}" r="1.9"/></g>`,
    () => `<g fill="none" stroke="${acc}" stroke-width="1.9" opacity=".92"><circle cx="${L}" cy="${ey}" r="${ex + 3}"/><circle cx="${R}" cy="${ey}" r="${ex + 3}"/><path d="M${L - ex - 3} ${ey}h-3"/><path d="M${R + ex + 3} ${ey}h3"/></g>`,
    () => `<g fill="${acc}"><path d="M${50 - 13} ${ny}q13 6.5 26 0l1.8 6q-14 6.6-29 0z"/><path d="M56 ${ny + 5.4}l4.6 11q.6 2.4-2 2.4t-3.4-2l-2.4-10.6z"/></g>`,
    () => `<g transform="translate(${50 + hr - 1} ${hy + 1})" fill="${acc}"><circle cy="-3.4" r="2.3"/><circle cx="3.2" cy="-1" r="2.3"/><circle cx="2" cy="2.8" r="2.3"/><circle cx="-2" cy="2.8" r="2.3"/><circle cx="-3.2" cy="-1" r="2.3"/></g><circle cx="${50 + hr - 1}" cy="${hy + 1}" r="1.8" fill="#fdf3d8"/>`,
    () => `<path d="M50 ${ty + 1}v-9" stroke="${acc}" stroke-width="1.9" stroke-linecap="round"/><path d="M50 ${ty - 5}q7-5.5 9.5.5-6.5 3.5-9.5-.5z" fill="${acc}"/><path d="M50 ${ty - 2}q-7-5.5-9.5.5 6.5 3.5 9.5-.5z" fill="${acc}" opacity=".8"/>`,
    () => `<g fill="${acc}"><path d="M50 ${ny}l-8.5-4.5v9z"/><path d="M50 ${ny}l8.5-4.5v9z"/></g><circle cx="50" cy="${ny}" r="2.4" fill="${b1}"/>`,
  ];

  const body = G
    ? `<ellipse cx="50" cy="69" rx="23.5" ry="17.5"/><rect x="43.5" y="30" width="13" height="30" rx="6.5"/><circle cx="50" cy="${hy}" r="${hr}"/>`
    : `<ellipse cx="50" cy="58" rx="26.5" ry="27"/><circle cx="50" cy="${hy}" r="${hr}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="s" cx="30%" cy="22%" r="90%"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></radialGradient><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="26" y1="${ty}" x2="74" y2="${fy + 6}"><stop offset="0" stop-color="${p1}"/><stop offset="1" stop-color="${p2}"/></linearGradient></defs><rect width="100" height="100" fill="url(#s)"/>${motif}<ellipse cx="50" cy="${fy + 6}" rx="24" ry="4" fill="${ink}" opacity=".1"/><g fill="url(#f)">${body}</g><g fill="${b1}"><path d="M41 ${fy}q-7 5-3.5 6.5H50q.5-4-4-6.5z"/><path d="M59 ${fy}q7 5 3.5 6.5H50q-.5-4 4-6.5z"/></g><ellipse cx="50" cy="${G ? 72 : 65}" rx="${G ? 12 : 14}" ry="${G ? 9 : 11}" fill="#fff" opacity=".28"/>${G ? `<path d="M29 62c6 1 10 6 10 14-7 1-12-4-13-11z" fill="${p2}" opacity=".9"/>` : `<path d="M26 52c7 2 11 7 11 16-8 1-13-5-14-13z" fill="${p2}" opacity=".9"/>`}<g fill="#ef8f9c" opacity=".32"><ellipse cx="${L - 5.5}" cy="${ey + 5.5}" rx="4.2" ry="2.6"/><ellipse cx="${R + 5.5}" cy="${ey + 5.5}" rx="4.2" ry="2.6"/></g><path d="M47 ${ty}q3-6 7-7-1.5 4.5-7 7z" fill="${p2}"/>${eyes}${bill}${WEAR[o.wear % 7]()}</svg>`;
  return svgUri(svg);
}

// 「抽象假面」系列：左半脸沉色＝真心话（诚实），右半脸亮色＝大冒险（捣蛋），一面两相。
// 视觉语言参考 DiceBear shapes/rings（CC0）与 Boring Avatars bauhaus/ring（MIT），路径全原创手制，保持零依赖离线生成
const M_PAL = [
  { d: '#3b4266', l: '#f4ecdb', k: '#d0708c' },
  { d: '#5c4376', l: '#f0e6f2', k: '#d7a441' },
  { d: '#2f5d5a', l: '#eaf2e6', k: '#e07a5f' },
  { d: '#6e4a3a', l: '#f7ead9', k: '#7a6ba7' },
  { d: '#44455f', l: '#eceef5', k: '#c6706f' },
  { d: '#31506b', l: '#e9f0f3', k: '#bd7a9c' },
];
const M_BASE = [
  'M50 19a31 31 0 1 0 0 62 31 31 0 1 0 0-62z',
  'M22 40Q22 20 42 20h16Q78 20 78 40v20Q78 80 58 80H42Q22 80 22 60z',
  'M50 17 78 33 78 65 50 81 22 65 22 33Z',
  'M50 16c17 0 30 11 30 28 0 20-13 34-30 40-17-6-30-20-30-40 0-17 13-28 30-28z',
];
const M_SPLIT = [
  'M0 0h50v100H0z',
  'M0 0h50c-14 26 14 52 0 100H0z',
  'M0 0h50C38 22 62 44 50 66c-7 13-3 22 0 34H0z',
  'M0 0h50l-11 20 11 20-11 20 11 20H0z',
];
function maskAvatar(o) {
  const pal = M_PAL[o.pal % 6], dc = pal.d, lc = '#f8f3e7', ac = pal.k;
  const [g1, g2] = P_BG[o.bg % 8];
  const EX = 37.5, EX2 = 62.5, EY = 45;
  // 双眼成对：诚实眼（亮色，压在沉色半脸）× 捣蛋眼（沉色，压在亮色半脸）
  const EYE = [
    `<circle cx="${EX}" cy="${EY}" r="4.7" fill="${lc}"/><circle cx="${EX + 1.2}" cy="${EY - 1.2}" r="2" fill="${dc}"/><path d="M${EX2 - 4.5} ${EY - 4.5}l9 9M${EX2 + 4.5} ${EY - 4.5}l-9 9" stroke="${dc}" stroke-width="3" stroke-linecap="round"/>`,
    `<circle cx="${EX}" cy="${EY}" r="4.6" fill="none" stroke="${lc}" stroke-width="2.4"/><circle cx="${EX}" cy="${EY}" r="1.5" fill="${lc}"/><path d="M${EX2 - 4.5} ${EY + 1}q4.5-6.5 9 0" stroke="${dc}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M${EX - 3.5} ${EY - 4.5}l7.5 4.5-7.5 4.5z" fill="${lc}"/><circle cx="${EX2}" cy="${EY}" r="4.6" fill="#fff" opacity=".85"/><circle cx="${EX2 + 2}" cy="${EY}" r="2.3" fill="${dc}"/>`,
    `<path d="M${EX - 2.8} ${EY - 6}a3.4 3.4 0 016.2 2c-.7 1.8-3.1 2-3.1 4.2" fill="none" stroke="${lc}" stroke-width="2.3" stroke-linecap="round"/><circle cx="${EX}" cy="${EY + 5.5}" r="1.4" fill="${lc}"/><path d="M${EX2} ${EY - 6.5}v7" stroke="${dc}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${EX2}" cy="${EY + 4.8}" r="1.6" fill="${dc}"/>`,
  ];
  // 嘴：坦白一条线 / 谎话波浪 / 守口拉链 / 倒吸一口气
  const MO = [
    `<path d="M42 62h16" stroke="${ac}" stroke-width="3.2" stroke-linecap="round"/>`,
    `<path d="M41 62q3.5-5 7 0t7 0 7 0" stroke="${ac}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M40 62h20M44 59.5v5M48 59.5v5M52 59.5v5M56 59.5v5" stroke="${ac}" stroke-width="2.2" stroke-linecap="round"/><rect x="57.5" y="57.6" width="5.5" height="8.8" rx="1.6" fill="${ac}"/>`,
    `<ellipse cx="50" cy="62.5" rx="5" ry="6.2" fill="${dc}"/><path d="M46.2 65.5a3.8 2.8 0 007.6 0z" fill="${ac}"/>`,
  ];
  // 顶饰：无 / 问号天线 / 小丑铃 / 额心方块 / 唇边朱痣 / 悬心
  const DECO = [
    '',
    `<path d="M46.6 5.4a3.6 3.6 0 016.9 1.6c-.6 2.2-3.4 2.3-3.5 4.6" fill="none" stroke="${ac}" stroke-width="2.2" stroke-linecap="round"/><circle cx="50" cy="14.6" r="1.4" fill="${ac}"/>`,
    `<g stroke="${dc}" stroke-width="3" stroke-linecap="round"><path d="M26 28 14 14"/><path d="M74 28 86 14"/></g><circle cx="12.5" cy="12.5" r="4" fill="${ac}"/><circle cx="87.5" cy="12.5" r="4" fill="${ac}"/>`,
    `<path d="M50 27l6.5 7.5L50 42l-6.5-7.5z" fill="${ac}"/>`,
    `<circle cx="60" cy="70" r="2.1" fill="${ac}"/>`,
    `<path d="M50 5.5c1.6-4 8.8-3.3 8.8 1.1 0 3.5-4.9 6.3-8.8 9-3.9-2.7-8.8-5.5-8.8-9 0-4.4 7.2-5.1 8.8-1.1z" fill="${ac}"/>`,
  ];
  // 背景：同心圆波纹 / 星屑 / 包豪斯色块 / 派对纸屑
  const MBG = [
    `<circle cx="50" cy="50" r="43" fill="none" stroke="${dc}" stroke-width="2" opacity=".16"/><circle cx="50" cy="50" r="47.5" fill="none" stroke="${dc}" stroke-width="1.3" opacity=".1" stroke-dasharray="42 16"/>`,
    `<g fill="${ac}" opacity=".5"><circle cx="15" cy="20" r="2"/><circle cx="87" cy="30" r="1.6"/><circle cx="20" cy="84" r="1.5"/></g><g fill="${dc}" opacity=".35"><circle cx="80" cy="80" r="2.2"/><circle cx="10" cy="55" r="1.4"/></g>`,
    `<circle cx="84" cy="15" r="12" fill="${ac}" opacity=".2"/><path d="M2 98 24 62 46 98z" fill="${dc}" opacity=".1"/>`,
    `<g fill="${ac}" opacity=".5"><path d="M12 26l5.5 9h-11z" transform="rotate(24 14 30)"/><path d="M84 68l5.5 9h-11z" transform="rotate(-18 86 72)"/><path d="M80 22l4.5 8h-9z" transform="rotate(36 82 26)" opacity=".7"/><path d="M16 74l4.5 8h-9z" transform="rotate(-10 18 78)" opacity=".7"/></g>`,
  ];
  const face = M_BASE[o.base % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="s" cx="30%" cy="22%" r="90%"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></radialGradient><clipPath id="c"><path d="${M_SPLIT[o.split % 4]}"/></clipPath></defs><rect width="100" height="100" fill="url(#s)"/>${MBG[o.bg % 4]}<ellipse cx="50" cy="88" rx="24" ry="3.6" fill="${dc}" opacity=".1"/><path d="${face}" fill="${pal.l}"/><g clip-path="url(#c)"><path d="${face}" fill="${dc}"/></g><path d="${face}" fill="none" stroke="${dc}" stroke-width="2.6" stroke-linejoin="round"/><g fill="${ac}" opacity=".38"><ellipse cx="30" cy="57" rx="4.4" ry="2.7"/><ellipse cx="70" cy="57" rx="4.4" ry="2.7"/></g>${EYE[o.eye % 4]}${MO[o.mouth % 4]}${DECO[o.deco % 6]}</svg>`;
  return svgUri(svg);
}
// 预设分派：小鸟 or 假面
function presetUri(p) { return p.fam === 'mask' ? maskAvatar(p) : birdAvatar(p); }
// 比 encodeURIComponent 省 ~35%：头像会随房间状态走 MQTT，越短越好
function svgUri(svg) {
  return 'data:image/svg+xml,' + svg
    .replace(/%/g, '%25').replace(/"/g, "'").replace(/#/g, '%23')
    .replace(/</g, '%3C').replace(/>/g, '%3E').replace(/&/g, '%26')
    .replace(/\s+/g, ' ');
}

// 任意 seed → 稳定的一只小鸟（保留旧接口）
function avatarUrl(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return birdAvatar({
    sil: h % 2, plume: (h >>> 1) % 7, beak: (h >>> 4) % 4, bg: (h >>> 6) % 8,
    motif: (h >>> 9) % 6, eye: (h >>> 12) % 4, col: (h >>> 14) % 7, wear: (h >>> 17) % 7,
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer = null;
function toast(msg, type = '', duration = 2800) {
  const el = $('toast');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function burst(x, y, n = 35) {
  const c = $('burst-container');
  const cols = ['#8b5cf6', '#f472b6', '#22d3ee', '#f97316', '#3b82f6', '#fbbf24'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'burst-particle';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.background = cols[i % cols.length];
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 130;
    p.style.setProperty('--tx', Math.cos(a) * d + 'px');
    p.style.setProperty('--ty', Math.sin(a) * d + 'px');
    c.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}

let twTimer = null;
function typewriter(el, text, speed = 30, done) {
  clearTimeout(twTimer);
  el.textContent = '';
  el.classList.add('typing');
  let i = 0;
  (function step() {
    if (i < text.length) { el.textContent += text[i++]; twTimer = setTimeout(step, speed); }
    else { el.classList.remove('typing'); if (done) done(); }
  })();
}

function avatarImgHtml(p) {
  return `<img src="${esc(p.avatar)}" alt="" data-fallback />`;
}
// 头像加载失败 → 兜底 emoji
document.addEventListener('error', e => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.fallback !== undefined) {
    t.dataset.fallback = '';
    t.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='80' font-size='80'%3E%F0%9F%A4%96%3C/text%3E%3C/svg%3E";
  }
}, true);

// ═══════════════════════════════════════════════════════════════
// 极简 MQTT 客户端（hand-rolled, 已在 EMQX/HiveMQ/Mosquitto 验证）
// ═══════════════════════════════════════════════════════════════
class MiniMqtt {
  constructor({ url, clientId, keepalive = 60, onStatus }) {
    this.url = url;
    this.clientId = clientId;
    this.keepalive = keepalive;
    this.onStatus = onStatus || (() => {});
    this.subs = new Map();          // topic -> cb
    this.buf = [];
    this.nextPid = 1;
    this.pubacks = new Map();       // pid -> resolve
    this.ws = null;
    this.closed = false;
    this.pingTimer = null;
  }
  // 连接：resolve(true)=CONNACK 成功  resolve(false)=失败
  connect(timeoutMs = 6000) {
    return new Promise(resolve => {
      let settled = false;
      const finish = ok => { if (!settled) { settled = false; settled = true; this.onStatus(ok ? 'online' : 'offline'); resolve(ok); } };
      let ws;
      try { ws = new WebSocket(this.url, ['mqtt']); } catch { return finish(false); }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const to = setTimeout(() => { try { ws.close(); } catch {} finish(false); }, timeoutMs);
      ws.onopen = () => ws.send(this._pkt([0x10], this._connectBody()));
      ws.onmessage = ev => {
        this.buf.push(...new Uint8Array(ev.data));
        this._drain();
        if (this._connack && !settled) { clearTimeout(to); finish(true); }
      };
      ws.onerror = () => { clearTimeout(to); finish(false); };
      ws.onclose = () => {
        clearTimeout(to);
        clearInterval(this.pingTimer);
        if (!settled) finish(false);
        else if (!this.closed) this.onStatus('offline');
      };
      this._connack = false;
    });
  }
  _connectBody() {
    const cp = enc.encode(this.clientId);
    return [0x00, 0x04, ...enc.encode('MQTT'), 0x04, 0x02, (this.keepalive >> 8) & 255, this.keepalive & 255,
      (cp.length >> 8) & 255, cp.length & 255, ...cp];
  }
  static _varint(n) { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; }
  _pkt(flagsByte, body) { return new Uint8Array([flagsByte, ...MiniMqtt._varint(body.length), ...body]); }
  _str(s) { const b = enc.encode(s); return [(b.length >> 8) & 255, b.length & 255, ...b]; }
  _send(bytes) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(bytes); }

  _drain() {
    while (this.buf.length >= 2) {
      let mul = 1, len = 0, i = 1, digit;
      do {
        if (i >= this.buf.length) return;      // 头不完整，等下一帧
        digit = this.buf[i++];
        len += (digit & 127) * mul; mul *= 128;
      } while (digit & 128);
      if (this.buf.length < i + len) return;   // 体不完整
      const type = this.buf[0] >> 4, flags = this.buf[0] & 15;
      const body = Uint8Array.from(this.buf.slice(i, i + len));
      this.buf = this.buf.slice(i + len);
      this._handle(type, flags, body);
    }
  }
  _handle(type, flags, body) {
    if (type === 2) {          // CONNACK
      this._connack = body[1] === 0;
      if (this._connack) {
        this.pingTimer = setInterval(() => this._send(this._pkt(0xc0, [])), this.keepalive * 1000 / 2);
        for (const topic of this.subs.keys()) this._subscribe(topic);
      }
    } else if (type === 3) {   // PUBLISH
      const qos = (flags >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.slice(2, 2 + tlen));
      let off = 2 + tlen;
      if (qos > 0) off += 2;
      const payload = body.slice(off);
      if (qos === 1) { const pid = (body[2 + tlen] << 8) | body[3 + tlen]; this._send(this._pkt(0x40, [(pid >> 8) & 255, pid & 255])); }
      const cb = this.subs.get(topic);
      if (cb) cb(payload);
    } else if (type === 4) {   // PUBACK
      const pid = (body[0] << 8) | body[1];
      const fn = this.pubacks.get(pid);
      if (fn) { this.pubacks.delete(pid); fn(); }
    }
    // 9 SUBACK / 13 PINGRESP: 无需处理
  }
  _subscribe(topic) {
    const pid = this.nextPid++;
    this._send(this._pkt(0x82, [(pid >> 8) & 255, pid & 255, ...this._str(topic), 0x01]));
  }
  subscribe(topic, cb) {
    this.subs.set(topic, cb);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this._subscribe(topic);
  }
  publish(topic, bytes, { retain = true, qos1 = true, timeout = 5000 } = {}) {
    return new Promise(resolve => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return resolve(false);
      let pid = 0;
      const head = qos1 ? 0x30 | (1 << 1) | (retain ? 1 : 0) : 0x30 | (retain ? 1 : 0);
      const varhdr = this._str(topic);
      if (qos1) { pid = this.nextPid++; varhdr.push((pid >> 8) & 255, pid & 255); }
      this._send(this._pkt(head, [...varhdr, ...bytes]));
      if (!qos1) return resolve(true);
      const to = setTimeout(() => { this.pubacks.delete(pid); resolve(false); }, timeout);
      this.pubacks.set(pid, () => { clearTimeout(to); resolve(true); });
    });
  }
  close() { this.closed = true; clearInterval(this.pingTimer); try { this.ws && this.ws.close(); } catch {} }
}

// ═══════════════════════════════════════════════════════════════
// 本地传输（BroadcastChannel + localStorage retained 模拟，支持多 topic）
// ═══════════════════════════════════════════════════════════════
class LocalTransport {
  constructor(room, topics) {
    this.tab = genId();
    this.subs = new Map();               // topic -> cb
    this.keys = new Map();               // topic -> localStorage key（首个 topic 沿用旧 key，不丢历史房间）
    (topics || []).forEach((t, i) => this.keys.set(t, 'tod:room:' + room + (i === 0 ? '' : ':' + t.split('/').pop())));
    this.channel = ('BroadcastChannel' in window) ? new BroadcastChannel('tod-' + room) : null;
    if (this.channel) this.channel.onmessage = e => { const d = e.data; if (d && d.tab !== this.tab) this._emit(d.topic); };
    window.addEventListener('storage', e => { if (e.key && e.key.indexOf('tod:room:' + room) === 0) this._emit(); });
  }
  _emit(topic) {
    for (const t of (topic ? [topic] : [...this.subs.keys()])) {
      const cb = this.subs.get(t); if (!cb) continue;
      const s = localStorage.getItem(this.keys.get(t));
      if (s) cb(enc.encode(s));
    }
  }
  connect() { this._emit(); return Promise.resolve(true); }
  subscribe(topic, cb) {
    this.subs.set(topic, cb);
    const s = localStorage.getItem(this.keys.get(topic));
    if (s) cb(enc.encode(s));
  }
  publish(topic, bytes, opts) {
    const key = this.keys.get(topic);
    if (key) { if (bytes && bytes.length) localStorage.setItem(key, dec.decode(bytes)); else localStorage.removeItem(key); }
    if (this.channel) this.channel.postMessage({ tab: this.tab, topic });
    return Promise.resolve(true);
  }
  close() { this.channel && this.channel.close(); }
}

// ═══════════════════════════════════════════════════════════════
// RoomLink：对外统一接口，内部 MQTT 优先、自动重连、失败降级本地
// ═══════════════════════════════════════════════════════════════
class RoomLink {
  constructor(room) {
    this.room = room;
    this.topic = `tod/v1/${room}/state`;
    this.poolTopic = `tod/v1/${room}/pool`;   // 题库单独一路：不随每次抽卡重发，状态包小很多
    this.micTopic = `tod/v1/${room}/mic`;     // 连麦信令（WebRTC offer/answer/ice，非点对点广播）
    this.client = null;
    this.kind = 'online';
    this.stateCb = () => {};
    this.poolCb = () => {};
    this.micCb = () => {};
    this.statusCb = () => {};
    this._brokerIdx = 0;
    this._reconnecting = false;
  }
  _wire(c) {   // 新连接/重连都要把三路订阅上（信令解析失败静默丢弃，不阻断消息循环）
    c.subscribe(this.topic, bytes => this.stateCb(JSON.parse(dec.decode(bytes))));
    c.subscribe(this.poolTopic, bytes => this.poolCb(JSON.parse(dec.decode(bytes))));
    c.subscribe(this.micTopic, bytes => { try { this.micCb(JSON.parse(dec.decode(bytes))); } catch {} });
    return c;
  }
  async open() {
    this.statusCb('connecting', '');
    for (let round = 0; round < BROKERS.length; round++) {
      const url = BROKERS[this._brokerIdx % BROKERS.length]; this._brokerIdx++;
      const c = this._wire(new MiniMqtt({ url, clientId: 'tod-' + genId(), onStatus: s => this._netStatus(s) }));
      const ok = await c.connect(5000);
      if (ok) {
        this.client = c;
        // 稍等 retained 消息送达
        await sleep(400);
        this.kind = 'mqtt'; this.statusCb('online', this._host(url));
        return 'mqtt';
      }
      c.close();
    }
    return this._fallbackLocal('所有在线服务器不可用，已切换到本地模式（同浏览器多标签）');
  }
  _fallbackLocal(msg) {
    if (msg) toast(msg, 'error', 4000);
    this.client = this._wire(new LocalTransport(this.room, [this.topic, this.poolTopic, this.micTopic]));
    this.kind = 'local'; this.statusCb('online', '本地');
    return 'local';
  }
  _netStatus(s) { if (this.kind === 'mqtt') this.statusCb(s === 'online' ? 'online' : 'syncing', this.currentHost); }
  get currentHost() { const i = (this._brokerIdx - 1 + BROKERS.length) % BROKERS.length; return this._host(BROKERS[i]); }
  _host(url) { try { return new URL(url).hostname.replace('broker.', '').replace('test.', ''); } catch { return url; } }
  subscribe(cb) { this.stateCb = cb; this.client && this.client.subscribe(this.topic, bytes => cb(JSON.parse(dec.decode(bytes)))); }
  subscribePool(cb) { this.poolCb = cb; this.client && this.client.subscribe(this.poolTopic, bytes => cb(JSON.parse(dec.decode(bytes)))); }
  subscribeMic(cb) { this.micCb = cb; this.client && this.client.subscribe(this.micTopic, bytes => { try { cb(JSON.parse(dec.decode(bytes))); } catch {} }); }
  resubscribe() { if (this.client) this._wire(this.client); }
  async publishState(obj) { return this._pub(this.topic, obj); }
  async publishPool(obj) { return this._pub(this.poolTopic, obj); }
  publishMic(obj) {   // 信令即发即忘：不 retained、不重发，错过就靠重协商补
    return this.client ? this.client.publish(this.micTopic, enc.encode(JSON.stringify(obj)), { retain: false, qos1: false }) : Promise.resolve(false);
  }
  clearPool() {   // 空零长度 retained = 从 broker 上擦除房间题库
    return this.client ? this.client.publish(this.poolTopic, new Uint8Array(0), { retain: true }) : Promise.resolve(false);
  }
  async _pub(topic, obj) {
    if (!this.client) return false;
    const ok = await this.client.publish(topic, enc.encode(JSON.stringify(obj)), { retain: true });
    if (!ok && this.kind === 'mqtt' && !this._reconnecting) this._tryReconnect();
    return ok;
  }
  async _tryReconnect() {
    this._reconnecting = true;
    this.statusCb('syncing', '重连中');
    for (let i = 0; i < 4; i++) {
      await sleep(1500 * (i + 1));
      const url = BROKERS[this._brokerIdx % BROKERS.length]; this._brokerIdx++;
      const c = this._wire(new MiniMqtt({ url, clientId: 'tod-' + genId(), onStatus: s => this._netStatus(s) }));
      if (await c.connect(4000)) {
        this.client && this.client.close();
        this.client = c;
        this.statusCb('online', this._host(url));
        this._reconnecting = false;
        return;
      }
      c.close();
    }
    this._reconnecting = false;
    this.client.close();
    this._fallbackLocal('连接中断且重连失败，切换到本地模式');
  }
  close() { this.client && this.client.close(); }
}

// ═══════════════════════════════════════════════════════════════
// 全局应用状态
// ═══════════════════════════════════════════════════════════════
let myId = null;
let link = null;            // RoomLink
let S = null;               // 服务端权威状态（含所有玩家）
let lastAppliedSeq = -1;    // 动画去重
let joined = false;
let firstApply = true;
let stageTimers = [];
let hbTimer = null, pruneTimer = null;
let pendingRevealTimer = null, drawingEnterTs = 0;
let cardDealt = false, revealAnim = false;   // 动画锁：落牌后心跳重渲染不回退卡堆；翻牌/打字期间禁止提前绘制答案（防“闪出”）

// 惩罚库：本地副本 + 房间共享副本（SPool 走独立 topic，不随抽卡重发）
let localPunishments = JSON.parse(JSON.stringify(DEFAULT_PUNISHMENTS));
let SPool = null;                 // 房间共享题库 { truth, dare, ts, expiresAt }
let poolTs = 0;                   // last-write-wins 护栏
const POOL_TTL_MS = 30 * 60 * 1000;
let editedPools = new Set(); // 'truth' / 'dare'
let currentImportTab = 'truth';
let pickedMode = 'turn';   // 开局前在大厅选择的模式（开始游戏后以房间状态为准）

function freshState(room) {
  return {
    v: 1, room, ver: Date.now(), ts: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000,
    players: [], gameStarted: false, startedAt: 0, turnIndex: 0, mode: 'turn',
    turn: { stage: 'choosing', chooserId: null, choice: null, punishment: null, seq: 0, ts: Date.now(), by: null },
    stats: { truth: 0, dare: 0, skips: 0, rounds: 0 }
  };
}

// 房间题库（独立 retained topic）
function setPool(doc) {
  if (!doc || !Array.isArray(doc.truth) || !Array.isArray(doc.dare)) return;
  if (doc.expiresAt && doc.expiresAt < Date.now()) return;      // 过期房间号被复用时不沿旧库
  if ((doc.ts || 0) < poolTs) return;                           // 旧快照不回退
  poolTs = doc.ts || 0;
  SPool = { truth: doc.truth, dare: doc.dare };
  updatePoolCount();
}
async function publishPool() {
  if (!link || !SPool) return false;
  SPool.ts = Date.now(); SPool.expiresAt = SPool.ts + POOL_TTL_MS;
  poolTs = SPool.ts;
  return link.publishPool(SPool);
}

// 回合重置（离房/掉线/结束时调用）：轮流制轮转，自由对决释放麦克风
function resetTurnStage(n) {
  n.turn.stage = 'choosing';
  n.turn.choice = null;
  n.turn.punishment = null;
  if (n.mode === 'free') {
    n.turn.chooserId = null;
  } else {
    n.turnIndex = n.players.length ? n.turnIndex % n.players.length : 0;
    n.turn.chooserId = n.players.length ? n.players[n.turnIndex].id : null;
  }
  n.turn.seq += 1;
}

function me() { return joined ? S?.players.find(p => p.id === myId) : null; }
function oldestClient() {
  if (!S || !S.players.length) return null;
  return [...S.players].sort((a, b) => a.joinedAt - b.joinedAt)[0].id;
}

function setNet(dot, text) {
  $('net-dot').className = 'conn-dot ' + dot;
  $('net-text').textContent = text;
}

// 加载动画：启动预加载与加入房间过程复用同一层 3D 抽卡 overlay
function ensureOverlay() {
  let o = $('loading-overlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'loading-overlay';
    o.className = 'loading-overlay';
    o.innerHTML = '<div class="loader-stage"><div class="loader-orbit"><i></i><i></i><i></i></div><div class="loader-card">🎭</div></div><div class="loading-text"></div><div class="loader-progress"><i></i></div>';
    document.body.appendChild(o);
  }
  return o;
}
function showLoading(text) {
  const o = ensureOverlay();
  o.classList.remove('hide');
  if (text) o.querySelector('.loading-text').textContent = text;
}
function setLoadingText(text) { const o = $('loading-overlay'); if (o) o.querySelector('.loading-text').textContent = text; }
function hideLoading() {
  const o = $('loading-overlay');
  if (!o) return;
  o.classList.add('hide');
  setTimeout(() => o.remove(), 520);
}

// 修改状态：先本地应用（保证发起端无回显的本地模式也同步生效），再发布
async function mutate(fn) {
  if (!S || !link) return;
  const next = JSON.parse(JSON.stringify(S));
  fn(next);
  next.ts = Date.now();
  next.expiresAt = Date.now() + 30 * 60 * 1000;
  applyState(next);
  let ok = await link.publishState(next);
  if (!ok && link.kind === 'mqtt') { await sleep(1500); ok = await link.publishState(next); }
  if (!ok) toast('状态已本地更新，正在重连同步...', 'error');
}

// ───────────────────────────── 状态应用 + 动画编排 ─────────────────────────────
function applyState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.players) || !s.turn) return;
  // 兼容旧版客户端：它们还把题库放在状态里，没收到独立题库时用这份
  if (s.punishments && Array.isArray(s.punishments.truth) && Array.isArray(s.punishments.dare) && !SPool) {
    setPool({ truth: s.punishments.truth, dare: s.punishments.dare, ts: 0 });
  }
  if (S) {
    // 只接受同房间的文档
    if (joined && s.room !== S.room) return;
    // seq 回退保护：同一代文档里，旧 seq 一律丢弃，并让最后操作者重发修复 retained
    if (s.ver === S.ver && s.turn.seq < S.turn.seq) { scheduleFixup(); return; }
  }
  const sameDoc = S && S.ver === s.ver;
  const prevIds = sameDoc ? S.players.map(p => p.id) : [];
  const prevSeq = sameDoc ? S.turn.seq : -1;
  S = s;

  // 我仍在房间？（发布竞争导致丢失时自愈重加）
  if (joined && myId && !S.players.some(p => p.id === myId)) selfHealJoin();

  // 新玩家加入提示（排除自己 & 首次加载）
  if (!firstApply) {
    for (const p of S.players) if (!prevIds.includes(p.id) && p.id !== myId) toast(`🎉 ${p.name} 加入了！`, 'success');
  }

  // seq 变化 → 播放对应阶段动画；首次加载 → 静态呈现。
  // 关键：在 renderScreen 绘帧之前上动画锁，否则 revealed 答案会被静态渲染抢先画出来（“闪出答案”）
  const turnChanged = S.gameStarted && S.turn.seq !== prevSeq;
  if (turnChanged && !firstApply) {
    clearStageTimers();
    if (S.turn.stage === 'revealed') revealAnim = true;
    else { revealAnim = false; cardDealt = false; }
  }
  renderScreen();
  // 连麦对账：开麦名单变化时增删 WebRTC 链路
  const micSig = S.players.filter(p => p.micOn).map(p => p.id).join(',') + '|' + (MIC.on ? 1 : 0);
  if (micSig !== MIC.sig) { MIC.sig = micSig; syncMicPeers(); renderMicUI(); }
  if (turnChanged) {
    if (firstApply) renderStageStatic();
    else runStage(S.turn.stage);
  }
  firstApply = false;
}

let healInProgress = false;
async function selfHealJoin() {
  if (healInProgress || !link) return;
  healInProgress = true;
  await sleep(700);
  if (S && myId && !S.players.some(p => p.id === myId)) {
    await mutate(n => {
      if (!n.players.some(p => p.id === myId)) n.players.push({ ...myPlayerTemplate(), lastSeen: Date.now() });
    });
  }
  healInProgress = false;
}

// 收到旧 seq 时（说明 broker 上的 retained 被过期写覆盖），由最后操作者重发当前状态
let fixupLast = 0;
function scheduleFixup() {
  if (!joined || !S || !link) return;
  if (S.turn.by !== myId && oldestClient() !== myId) return;
  setTimeout(async () => {
    if (Date.now() - fixupLast < 3000 || !S) return;
    fixupLast = Date.now();
    const cur = JSON.parse(JSON.stringify(S));
    cur.ts = Date.now();
    await link.publishState(cur);
  }, 1500);
}

function myPlayerTemplate() {
  return { id: myId, name: myName, avatar: myAvatar, joinedAt: myJoinedAt };
}
let myName = '', myAvatar = '', myJoinedAt = 0;

// ───────────────────────────── 渲染 ─────────────────────────────
function currentScreen() {
  if (!joined) return 'join';
  return S && S.gameStarted ? 'game' : 'lobby';
}
function renderScreen() {
  const name = currentScreen();
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'lobby') renderLobby();
  if (name === 'game') renderGameStatic();
  $('room-chip').style.display = joined && S ? '' : 'none';
  if (S) $('room-chip').textContent = '#' + S.room;
}

function renderPlayers(gridId, showActive) {
  const grid = $(gridId);
  const keepIds = [...grid.children].map(c => c.dataset.pid);
  const nowIds = S.players.map(p => p.id);
  // 结构变化才重绘（避免动画重放）
  if (keepIds.join(',') !== nowIds.join(',')) {
    grid.innerHTML = '';
    S.players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.dataset.pid = p.id;
      card.style.animationDelay = (i * 0.07) + 's';
      card.innerHTML = `
        <div class="avatar-wrap">
          <span class="wave w1"></span><span class="wave w2"></span>
          <div class="avatar-ring">
            <div class="avatar-inner">${avatarImgHtml(p)}</div>
          </div>
          ${p.id === myId ? '<span class="me-tag">你</span>' : ''}
          ${p.skips ? `<span class="skip-badge">⏭${p.skips}</span>` : ''}
          <span class="mic-badge">🎤</span>
        </div>
        <div class="player-name">${esc(p.name)}</div>
      `;
      grid.appendChild(card);
    });
  }
  if (showActive) {
    const activeId = activePlayerId();
    grid.querySelectorAll('.player-card').forEach(c => {
      const ring = c.querySelector('.avatar-ring');
      const nameEl = c.querySelector('.player-name');
      const isActive = c.dataset.pid === activeId;
      ring.classList.toggle('active', isActive);
      nameEl.classList.toggle('active-name', isActive);
      let badge = c.querySelector('.active-badge');
      if (isActive && !badge) { badge = document.createElement('div'); badge.className = 'active-badge'; badge.textContent = '当前'; c.appendChild(badge); }
      if (!isActive && badge) badge.remove();
    });
  }
  if ($('player-count')) $('player-count').textContent = `(${S.players.length})`;
  updateMicBadges();
}

function activePlayerId() {
  if (!S || !S.players.length) return null;
  // 持麦/当前玩家优先；自由对决开放时无人高亮
  if (S.turn.chooserId && S.players.some(p => p.id === S.turn.chooserId)) return S.turn.chooserId;
  if (S.mode === 'free') return null;
  const i = S.turnIndex % S.players.length;
  return S.players[i]?.id;
}

function renderLobby() {
  renderPlayers('players-grid', false);
  const btn = $('btn-start');
  if (S.players.length >= 2) { btn.disabled = false; btn.textContent = '开始游戏 🚀'; }
  else { btn.disabled = true; btn.textContent = `至少需要 2 名玩家（还差 ${2 - S.players.length} 人）`; }
  $('share-room').textContent = S.room;
  $('share-url').style.display = isFilePage() ? 'none' : '';
  if (!isFilePage()) $('share-url').textContent = shareUrl();
  $('share-tip').textContent = isFilePage()
    ? `🎉 各自打开下载好的 index.html，输入房间号 ${S.room} 即可联机（经公共服务器同步）`
    : '🎉 把下面的链接或房间号发给朋友，进入同一房间即可联机！';
  $('copy-link-btn').textContent = copyBtnLabel();
}

function renderGameStatic() {
  renderPlayers('game-players-grid', true);
  const isFree = S.mode === 'free';
  $('mode-chip').textContent = isFree ? '🎤 自由' : '🔄 轮流';
  $('stat-turn').textContent = isFree ? (S.stats.rounds || 0) : (S.turnIndex % Math.max(S.players.length, 1)) + 1;
  $('stat-truth').textContent = S.stats.truth;
  $('stat-dare').textContent = S.stats.dare;
  $('stat-skip').textContent = S.stats.skips || 0;
  const stage = S.turn.stage;
  // 各区块可见性
  const chooserId = S.turn.chooserId || activePlayerId();
  const chooser = S.players.find(p => p.id === chooserId);
  if (stage === 'choosing') {
    $('choice-section').hidden = false; $('deck-section').hidden = true; $('card-section').hidden = true;
    $('flip-card').classList.remove('flipped');
    $('card-truth').classList.remove('picked'); $('card-dare').classList.remove('picked');
    if (isFree && !S.turn.chooserId) {
      $('turn-info').textContent = '🎤 自由对决 · 抢麦抽卡！';
      $('choice-hint').textContent = '麦克风开放，谁先点谁先抽～';
      setChoiceEnabled(true);
    } else if (chooserId === myId) { $('turn-info').textContent = '🎭 轮到你了！'; $('choice-hint').textContent = '选择一项：'; setChoiceEnabled(true); }
    else { $('turn-info').textContent = `轮到「${chooser?.name || '???'}」了`; $('choice-hint').textContent = '等待对方选择...'; setChoiceEnabled(false); }
  } else if (stage === 'drawing') {
    if (cardDealt) return;   // 牌已飞向中央：中途任何重渲染都不该把画面拽回卡堆
    $('choice-section').hidden = true; $('deck-section').hidden = false; $('card-section').hidden = true;
    $('turn-info').textContent = `「${chooser?.name || '???'}」正在抽卡...`;
    $('drawing-note').textContent = S.turn.choice === 'truth' ? '💬 真心话卡已锁定' : '🎯 大冒险卡已锁定';
  } else if (stage === 'revealed') {
    if (revealAnim) return;  // 本地翻牌/打字动画进行中：答案由动画自己绘制，不能提前上屏
    $('choice-section').hidden = true; $('deck-section').hidden = true; $('card-section').hidden = false;
    const t = S.turn;
    const front = $('card-front');
    front.className = 'card-face card-front ' + (t.choice === 'truth' ? 'truth' : 'dare') + '-type';
    $('type-badge').textContent = t.choice === 'truth' ? '💬 真心话' : '🎯 大冒险';
    $('card-owner').textContent = `——「${chooser?.name || '???'}」的惩罚`;
    $('punishment-text').textContent = t.punishment || '';
    $('flip-card').classList.add('flipped');
    $('reveal-wait').style.display = chooserId === myId ? 'none' : '';
    $('reveal-wait').textContent = `等待「${chooser?.name || '???'}」完成惩罚或跳过`;
    $('card-actions').style.display = chooserId === myId ? '' : 'none';
    $('turn-info').textContent = `「${chooser?.name || '???'}」收到了惩罚！`;
  }
}

function setChoiceEnabled(on) {
  $('card-truth').classList.toggle('disabled', !on);
  $('card-dare').classList.toggle('disabled', !on);
  $('choice-section').classList.toggle('mine', !!on);   // 轮到自己：双卡悬浮 + 流光，强化“该你了”信号
}

function renderStageStatic() {
  const fc = $('flip-card');   // 中途加入的直接呈现终态：瞬时到位，不要重放 0.85s 翻牌过渡
  fc.style.transition = 'none';
  renderGameStatic();
  void fc.offsetWidth;
  fc.style.transition = '';
  resetCam();
}

function clearStageTimers() {
  stageTimers.forEach(t => clearTimeout(t));
  stageTimers = [];
  clearTimeout(pendingRevealTimer);
  clearTimeout(twTimer);   // 旧打字机若还在写，会在新回合里对着隐藏元素补 burst(0,0)
  const pt = $('punishment-text');
  if (pt) pt.classList.remove('typing');
}

// ───────────────────────────── 一镜到底动画编排 ─────────────────────────────
async function runStage(stage) {
  if (stage === 'choosing') {
    resetCam();
    cardDealt = false; revealAnim = false;
    document.querySelectorAll('.deck-card.gone').forEach(c => c.classList.remove('gone'));   // 上一局被抽走的牌归队
    renderGameStatic();
    $('deck').classList.remove('shuffling');
    $('card-truth').classList.remove('picked');
    $('card-dare').classList.remove('picked');
    // 交接脉冲：新当前玩家弹跳
    const grid = $('game-players-grid');
    const activeCard = grid.querySelector(`.player-card[data-pid="${CSS.escape(activePlayerId() || '')}"] .avatar-ring`);
    if (activeCard) { activeCard.classList.remove('pass'); void activeCard.offsetWidth; activeCard.classList.add('pass'); }
    return;
  }
  if (stage === 'drawing') {
    // 以状态发布时间为统一时间轴，多端动画节奏对齐（一镜到底不跳帧）
    const docTs = S.turn.ts || Date.now();
    drawingEnterTs = (docTs > Date.now() + 3000) ? Date.now() : docTs;
    cardDealt = false; revealAnim = false;
    renderGameStatic();
    focusCam($('deck'));
    // 1) 当前玩家头像飞向卡堆
    flyAvatarToDeck(activePlayerId());
    // 2) 卡堆洗牌
    $('deck').classList.add('shuffling');
    stageTimers.push(setTimeout(() => $('deck').classList.remove('shuffling'), 1400));
    // 3) 抽卡结果飞向中央
    stageTimers.push(setTimeout(() => dealFlyingCard(), 1500));
    // 4) 由执行者（或后备者）在动画节奏点发布 reveal
    const t = S.turn;
    if ((t.chooserId === myId || oldestClient() === myId) && !t.punishment) scheduleReveal();
    return;
  }
  if (stage === 'revealed') {
    // 保证 drawing 动画至少播够时长，多端节奏一致（一镜到底不跳帧）
    const wait = Math.max(0, drawingEnterTs + ANIM_DRAWING_MIN_MS - Date.now());
    stageTimers.push(setTimeout(() => {
      clearTimeout(pendingRevealTimer);
      playReveal();
    }, wait));
    return;
  }
}

function flyAvatarToDeck(pid) {
  const p = S.players.find(x => x.id === pid);
  const ring = document.querySelector(`#game-players-grid .player-card[data-pid="${CSS.escape(pid || '')}"] .avatar-ring`);
  if (!p || !ring || !p.avatar.startsWith('data:') && !p.avatar.startsWith('http')) return;
  const r1 = ring.getBoundingClientRect(), r2 = $('deck').getBoundingClientRect();
  const clone = document.createElement('div');
  clone.className = 'fly-avatar';
  clone.style.left = r1.left + 'px'; clone.style.top = r1.top + 'px';
  clone.style.width = r1.width + 'px'; clone.style.height = r1.height + 'px';   // 跟随实际头像尺寸（窄屏下更小）
  clone.innerHTML = `<img src="${esc(p.avatar)}" alt="" />`;
  document.body.appendChild(clone);
  const dx = (r2.left + r2.width / 2) - (r1.left + r1.width / 2);
  const dy = (r2.top + r2.height / 2) - (r1.top + r1.height / 2);
  clone.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.25) rotate(8deg)`, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.9) rotate(360deg)`, opacity: 0.95 },
  ], { duration: 850, easing: 'cubic-bezier(0.34,1.2,0.4,1)' }).onfinish = () => {
    // 头像"钻进"卡堆：缩没
    clone.animate([{ opacity: 0.95, transform: `translate(${dx}px, ${dy}px) scale(0.9)` },
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.1)` }], { duration: 250, fill: 'forwards' })
      .onfinish = () => clone.remove();
  };
}

function dealFlyingCard() {
  const deck = $('deck');
  const cards = [...deck.querySelectorAll('.deck-card')];
  const idx = Math.floor(Math.random() * cards.length);
  cards.forEach((c, i) => { if (i !== idx) c.classList.add('gone'); });
  const src = cards[idx];
  const r1 = src.getBoundingClientRect();
  const cs = $('card-section'), ds = $('deck-section');
  // 旧 bug：card-section 还 hidden 时量 rect 全是 0 → 飞牌飞向左上角缩没。
  // 现在先在目标布局（卡堆退、中央卡牌进）下量落点再恢复，同一帧内完成不会闪烁
  const prevDeck = ds.hidden;
  ds.hidden = true; cs.hidden = false; $('flip-card').classList.remove('flipped');
  const r2 = cs.getBoundingClientRect();
  ds.hidden = prevDeck; cs.hidden = true;
  const fc = document.createElement('div');
  fc.className = 'flying-card';
  fc.textContent = '🎴';
  fc.style.left = r1.left + 'px'; fc.style.top = r1.top + 'px';
  document.body.appendChild(fc);
  const dx = (r2.left + r2.width / 2) - (r1.left + r1.width / 2);
  const dy = (r2.top + r2.height / 2) - (r1.top + r1.height / 2);
  fc.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.4 - 40}px) scale(1.35) rotate(10deg)`, opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${r2.width / r1.width}) rotate(0deg)`, opacity: 1 },
  ], { duration: 700, easing: 'cubic-bezier(0.3,1.1,0.4,1)' }).onfinish = () => {
    fc.remove();
    // 落牌即亮出牌背：镜头缓推到中央，“抽取中…”呼吸到翻牌一刻，中段不再空窗
    cardDealt = true;
    $('choice-section').hidden = true; $('deck-section').hidden = true; cs.hidden = false;
    focusCam(cs);
  };
}

function scheduleReveal() {
  clearTimeout(pendingRevealTimer);
  pendingRevealTimer = setTimeout(async () => {
    if (!S || S.turn.stage !== 'drawing' || S.turn.punishment) return;
    if (S.turn.chooserId !== myId && oldestClient() !== myId) return;
    await publishReveal();
  }, DRAWING_MAX_MS);
  // 正常路径：动画节奏点（约 2.6s）就出结果，更快同步
  stageTimers.push(setTimeout(async () => {
    if (!S || S.turn.stage !== 'drawing' || S.turn.punishment) return;
    if (S.turn.chooserId !== myId && oldestClient() !== myId) return;
    await publishReveal();
  }, 1800));
}

async function publishReveal() {
  clearTimeout(pendingRevealTimer);
  const type = S.turn.choice;
  await mutate(n => {
    n.turn.punishment = pickPunishment(type);
    n.turn.stage = 'revealed';
    n.turn.seq += 1;
    n.turn.ts = Date.now();
    n.turn.by = myId;
  });
}

async function playReveal() {
  $('choice-section').hidden = true;
  $('deck-section').hidden = true;
  $('card-section').hidden = false;
  $('deck').classList.remove('shuffling');
  const t = S.turn;
  const front = $('card-front');
  front.className = 'card-face card-front ' + (t.choice === 'truth' ? 'truth' : 'dare') + '-type';
  $('type-badge').textContent = t.choice === 'truth' ? '💬 真心话' : '🎯 大冒险';
  const chooser = S.players.find(p => p.id === (t.chooserId || activePlayerId()));
  $('card-owner').textContent = `——「${chooser?.name || '???'}」的惩罚`;
  $('card-actions').style.display = t.chooserId === myId ? '' : 'none';
  $('reveal-wait').style.display = t.chooserId === myId ? 'none' : '';
  $('reveal-wait').textContent = `等待「${chooser?.name || '???'}」完成惩罚或跳过`;
  $('punishment-text').textContent = '';
  const flip = $('flip-card');
  // 无条件从牌背起步：瞬间归位不走 0.85s 过渡，避免“先闪答案再翻回去”
  flip.style.transition = 'none';
  flip.classList.remove('flipped');
  void flip.offsetWidth;
  flip.style.transition = '';
  focusCam($('card-section'));   // 牌已在中央的场合这里补上推镜（直连 revealed / 错过落牌动画）

  // 蓄势：牌被“捏起”微抬回弹，随即翻面 → 打字机揭晓
  flip.animate([
    { transform: 'scale(1) translateY(0) rotate(0deg)' },
    { transform: 'scale(1.05) translateY(-10px) rotate(-2deg)' },
    { transform: 'scale(1) translateY(0) rotate(0deg)' },
  ], { duration: 240, easing: 'ease-out' });
  stageTimers.push(setTimeout(() => {
    flip.classList.add('flipped');
    stageTimers.push(setTimeout(() => {
      typewriter($('punishment-text'), t.punishment || '（空）', 32, () => {
        revealAnim = false;   // 动画谢幕，后续心跳重渲染直接画终态即可
        renderGameStatic();   // 补一次同步绘制：turn-info/按钮状态不能等到下一次心跳才更新
        const r = $('card-section').getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2);
      });
    }, 450));
  }, 240));
}

// 相机聚焦（内层 cam 位移缩放，不干扰外层）
function focusCam(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const dx = (window.innerWidth / 2 - (r.left + r.width / 2)) * 0.12;
  const dy = (window.innerHeight / 2 - (r.top + r.height / 2)) * 0.10;
  $('cam').style.transform = `translate(${Math.max(-40, Math.min(40, dx))}px, ${Math.max(-30, Math.min(30, dy))}px) scale(1.03)`;
}
function resetCam() { $('cam').style.transform = 'translate(0,0) scale(1)'; }

// ───────────────────────────── 玩家动作 ─────────────────────────────
function pickPunishment(type) {
  const pool = (SPool || localPunishments)[type];
  if (!pool || !pool.length) return type === 'truth' ? '运气真好！这局没有真心话，免罚～' : '运气真好！这局没有大冒险，免罚～';
  return pick(pool);
}

async function choose(type) {
  if (!joined || !S || S.turn.stage !== 'choosing') { toast('现在不是抽卡时机', 'error'); return; }
  if (S.mode === 'free') {
    if (S.turn.chooserId && S.turn.chooserId !== myId) { toast('🎤 麦被别人抢了！', 'error'); return; }
  } else if (S.turn.chooserId !== myId) { toast('还没轮到你哦', 'error'); return; }
  $('card-' + type).classList.add('picked');
  setChoiceEnabled(false);
  await mutate(n => {
    n.turn.stage = 'drawing';
    n.turn.chooserId = myId;
    n.turn.choice = type;
    n.turn.punishment = null;
    n.turn.seq += 1;
    n.turn.ts = Date.now();
    n.turn.by = myId;
    n.stats[type] = (n.stats[type] || 0) + 1;
    n.stats.rounds = (n.stats.rounds || 0) + 1;
  });
}

async function finishTurn(skipped) {
  if (!S || S.turn.stage !== 'revealed' || S.turn.chooserId !== myId) return;
  await mutate(n => {
    if (skipped) {
      n.stats.skips = (n.stats.skips || 0) + 1;
      const p = n.players.find(x => x.id === myId);
      if (p) p.skips = (p.skips || 0) + 1;
    }
    if (n.mode === 'free') {
      // 自由对决：释放麦克风，谁都可以抢
      n.turnIndex = Math.max(n.players.findIndex(p => p.id === myId), 0);
      n.turn.stage = 'choosing';
      n.turn.choice = null; n.turn.punishment = null;
      n.turn.chooserId = null;
      n.turn.seq += 1; n.turn.ts = Date.now(); n.turn.by = myId;
    } else {
      n.turnIndex = (n.turnIndex + 1) % Math.max(n.players.length, 1);
      n.turn.stage = 'choosing';
      n.turn.choice = null;
      n.turn.punishment = null;
      n.turn.chooserId = n.players[n.turnIndex] ? n.players[n.turnIndex].id : null;
      n.turn.seq += 1;
      n.turn.ts = Date.now();
      n.turn.by = myId;
    }
  });
  if (!skipped) { const r = $('btn-accept').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 20); }
}

async function startGame() {
  if (!S || S.players.length < 2) { toast('至少需要 2 名玩家！', 'error'); return; }
  await mutate(n => {
    n.gameStarted = true;
    n.startedAt = Date.now();
    n.mode = pickedMode;
    n.turnIndex = Math.floor(Math.random() * n.players.length);
    n.stats = { truth: 0, dare: 0, skips: 0, rounds: 0 };
    n.turn.stage = 'choosing';
    // 轮流制随机先手；自由对决开局即开放麦克风
    n.turn.chooserId = pickedMode === 'free' ? null : n.players[n.turnIndex].id;
    n.turn.choice = null; n.turn.punishment = null;
    n.turn.seq += 1;
    n.turn.ts = Date.now(); n.turn.by = myId;
  });
  burst(window.innerWidth / 2, window.innerHeight / 2, 50);
  toast('游戏开始！🎉', 'success');
}

async function endGame() {
  await mutate(n => {
    n.gameStarted = false;
    n.turnIndex = 0;
    n.turn.stage = 'choosing';
    n.turn.chooserId = null; n.turn.choice = null; n.turn.punishment = null;
    n.turn.seq += 1;
    n.turn.ts = Date.now(); n.turn.by = myId;
  });
}

function shareUrl() {
  const base = location.href.split('?')[0].split('#')[0];
  return `${base}?room=${S ? S.room : ''}`;
}
const isFilePage = () => location.protocol === 'file:';   // file:// 地址发给别人无效，分享降级为房间号邀请
function inviteText() {
  const code = S ? S.room : '';
  return isFilePage()
    ? `来玩真心话大冒险！房间号 ${code}：打开 index.html，在加入界面输入房间号 ${code} 即可`
    : shareUrl();
}
function copyBtnLabel() { return isFilePage() ? '📋 复制房间号邀请' : '📋 复制链接'; }

// 邀请文本 → 房间号：支持 ?room= 链接、「房间号 XXXXX」邀请文字和裸房间号三种形态
function extractRoom(text) {
  if (!text) return '';
  const t = String(text);
  let m = t.match(/[?&]room=([A-Za-z0-9]{3,8})/i);
  if (!m) m = t.match(/房间号\s*[:：]?\s*([A-Za-z0-9]{3,8})/);
  if (!m) m = t.match(/^\s*([A-Za-z0-9]{3,8})\s*$/);
  return m ? m[1].toUpperCase() : '';
}
async function pasteRoom(auto) {   // auto=true：静默自动尝试（切回页面时），无权限失败不打扰
  if (joined || !('clipboard' in navigator)) return;
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { if (!auto) toast('读取剪贴板失败，请手动输入房间号', 'error'); return; }
  const code = extractRoom(text);
  if (!code) { if (!auto) toast('剪贴板里没有房间号或邀请链接', 'error'); return; }
  if (code === $('input-room').value.trim().toUpperCase()) return;
  $('input-room').value = code;
  toast(`已从剪贴板识别房间号 ${code} 📋`, 'success');
}

// ───────────────────────────── 加入 / 退出 ─────────────────────────────
async function doJoin(name, avatar, roomInput, forceLocal) {
  const input = roomInput.trim();
  let room = '';
  if (input) {
    try { const u = new URL(input); room = (u.searchParams.get('room') || '').toUpperCase(); } catch {}
    if (!room) room = extractRoom(input);   // 整段邀请文字粘进了输入框：抽出其中的房间号
    if (!room) room = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  const creating = !room;
  if (creating) room = roomCode();

  // 标签页身份：同一标签页重进同一房间（刷新后自动回房）沿用旧 id，
  // 否则刷新前的幽灵记录会被当成“另一个人”，出现房间里两个一样的自己
  let ident = null;
  try { ident = JSON.parse(sessionStorage.getItem('tod:tab') || 'null'); } catch {}
  myName = name; myAvatar = avatar;
  if (ident && ident.id && ident.room === room && Date.now() - (ident.ts || 0) < 30 * 60 * 1000) {
    myId = ident.id; myJoinedAt = ident.joinedAt || Date.now();
  } else {
    myId = genId(); myJoinedAt = Date.now();
  }

  // 重置上一次会话
  stopTimers();
  closeMic(true);
  if (link) { link.close(); link = null; }
  S = null; firstApply = true; joined = false; clearStageTimers();

  const btn = $('btn-join');
  btn.disabled = true; btn.textContent = '连接中...';
  setNet('syncing', '连接中...');
  showLoading(creating ? '🃏 创建房间...' : '🃏 进入房间...');

  link = new RoomLink(room);
  link.statusCb = (st, host) => {
    if (st === 'online') setNet('online', link.kind === 'local' ? '本地模式（同浏览器多标签）' : `已连接 ${host}`);
    else if (st === 'syncing') setNet('syncing', '同步中...');
    else setNet('', '离线');
  };
  let sawState = false, sawPool = false;
  const onState = s => { sawState = true; applyState(s); };
  const onPool = p => { sawPool = true; setPool(p); };
  try {
    if (forceLocal) {
      link.kind = 'local';
      link.client = link._wire(new LocalTransport(room, [link.topic, link.poolTopic, link.micTopic]));
      link.statusCb('online', '本地');
    } else {
      setLoadingText('📡 连接同步服务器...');
      await link.open();
    }
    // 事无巨细订阅一次：retained 会重新投递，保证两个回调都拿到房间现状
    link.subscribe(onState);
    link.subscribePool(onPool);
    link.subscribeMic(onMicMsg);
  } catch (e) {
    btn.disabled = false; btn.textContent = '加入游戏 🎮';
    hideLoading();
    try { sessionStorage.removeItem('tod:tab'); } catch {}
    setNet('', '离线'); toast('连接失败，请检查网络', 'error'); return;
  }

  // 等待房间当前状态（retained）到达
  setLoadingText('🔍 同步房间状态...');
  const waitUntil = Date.now() + (creating ? 1800 : 3200);
  while (!sawState && Date.now() < waitUntil) await sleep(150);

  if (!creating && !sawState) {
    link.close(); link = null;
    btn.disabled = false; btn.textContent = '加入游戏 🎮';
    hideLoading();
    try { sessionStorage.removeItem('tod:tab'); } catch {}
    setNet('', '离线');
    toast('房间不存在或已过期，请确认房间号', 'error', 3500);
    return;
  }

  const myPlayer = () => ({ id: myId, name: myName, avatar: myAvatar, joinedAt: myJoinedAt, lastSeen: Date.now(), skips: 0 });

  if (sawState && S && S.players.length && S.expiresAt > Date.now()) {
    // 加入已有房间（若是“新建”但撞上同号房间，则并入）
    if (creating) toast(`房间号 ${room} 已存在，直接加入！`, 'success');
    joined = true;
    await mutate(n => {
      const now = Date.now();
      n.players = n.players.filter(p => p.id !== myId && now - (p.lastSeen || p.joinedAt) < STALE_MS * 3);
      n.players.push(myPlayer());
      if (n.players.length === 1) { n.gameStarted = false; n.turn.stage = 'choosing'; n.turn.chooserId = null; }
    });
  } else {
    // 新房间 / 旧房间已过期
    const st = freshState(room);
    st.players.push(myPlayer());
    if (st.players.length > MAX_PLAYERS) { toast('房间已满', 'error'); }
    joined = true; firstApply = true;
    applyState(st);
    await link.publishState(st);
  }

  // 题库同步（独立 topic）：加入已有房间才需要等 retained 到达 → 并入本地编辑 → 只在有变化时发布
  setLoadingText('📋 载入房间题库...');
  if (sawState) for (let i = 0; i < 8 && !sawPool; i++) await sleep(150);
  let poolDirty = !SPool;
  if (!SPool) SPool = JSON.parse(JSON.stringify(localPunishments));
  for (const t of editedPools) {
    const arr = SPool[t] || (SPool[t] = []);
    for (const line of localPunishments[t]) if (!arr.includes(line)) { arr.push(line); poolDirty = true; }
  }
  if (poolDirty) await publishPool();
  updatePoolCount();

  // 加入校验：确保自己真的在房间里（发布竞争丢失时自愈）
  setLoadingText('🎭 落座中...');
  for (let i = 0; i < 3; i++) {
    await sleep(900);
    if (S && S.players.some(p => p.id === myId)) break;
    await mutate(n => { if (!n.players.some(p => p.id === myId)) n.players.push(myPlayer()); });
  }

  btn.disabled = false; btn.textContent = '加入游戏 🎮';
  hideLoading();
  renderScreen();
  renderMicUI();
  try { localStorage.setItem('tod:me', JSON.stringify({ name: myName, avatar: myAvatar.startsWith('data:') ? '' : myAvatar })); } catch {}
  if (myAvatar.startsWith('data:')) { try { localStorage.setItem('tod:me:avatar', myAvatar); } catch {} }
  const n = S ? S.players.length : 1;
  toast(n > 1 ? `加入成功！当前 ${n} 人 🎉` : `房间已创建：${room}，分享链接开玩吧！`, 'success', 3500);
  startTimers();
  updatePoolCount();
  try { history.replaceState(null, '', shareUrl()); } catch {}   // 部分浏览器禁止 file:// 改地址栏参数，忽略即可
  // 写入本标签页回房凭据：刷新后自动回房 + 重进时沿用 id 与身份（sessionStorage 天然按标签页隔离，多开不串号；
  // 名字/头像必须随票保存，否则本地模式多标签会互相覆盖 localStorage 里的 tod:me）
  try {
    sessionStorage.setItem('tod:tab', JSON.stringify({ id: myId, room, name: myName, avatar: myAvatar, joinedAt: myJoinedAt, local: !!forceLocal, ts: Date.now() }));
  } catch {
    try { sessionStorage.setItem('tod:tab', JSON.stringify({ id: myId, room, name: myName, joinedAt: myJoinedAt, local: !!forceLocal, ts: Date.now() })); } catch {}   // 自定义头像超配额时降级存精简票
  }
}

async function doLeave() {
  if (!joined) return;
  try { sessionStorage.removeItem('tod:tab'); } catch {}   // 主动退出后刷新不再自动回房
  closeMic(true);
  try {
    if (S && link) {
      const next = JSON.parse(JSON.stringify(S));
      next.players = next.players.filter(p => p.id !== myId);
      if (!next.players.some(p => p.id === next.turn.chooserId)) resetTurnStage(next);
      next.ts = Date.now();
      if (!next.players.length) { next.expiresAt = Date.now(); next.gameStarted = false; }
      await link.publishState(next);
      if (!next.players.length) await link.clearPool();   // 房间空了：顺带擦掉 retained 题库
    }
  } catch {}
  SPool = null; poolTs = 0;
  stopTimers();
  link && link.close(); link = null;
  joined = false; S = null; firstApply = true; lastAppliedSeq = -1;
  clearStageTimers();
  renderScreen();
  setNet('', '未连接');
  $('room-chip').style.display = 'none';
  try { history.replaceState(null, '', location.href.split('?')[0].split('#')[0]); } catch {}
  toast('已退出房间');
}

// 幽灵清理 + 心跳
function startTimers() {
  stopTimers();
  hbTimer = setInterval(async () => {
    if (!joined || !S) return;
    const p = S.players.find(x => x.id === myId);
    if (!p) return;
    if (Date.now() - (p.lastSeen || 0) > HEARTBEAT_MS - 5000) {
      await mutate(n => { const q = n.players.find(x => x.id === myId); if (q) q.lastSeen = Date.now(); });
    }
  }, HEARTBEAT_MS);
  pruneTimer = setInterval(async () => {
    if (!joined || !S || oldestClient() !== myId) return;
    const now = Date.now();
    const dead = S.players.filter(p => p.id !== myId && now - (p.lastSeen || p.joinedAt) > STALE_MS);
    if (!dead.length) return;
    await mutate(n => {
      n.players = n.players.filter(p => !dead.includes(p));
      if (!n.players.some(p => p.id === n.turn.chooserId)) resetTurnStage(n);
      if (n.players.length < 2 && n.gameStarted) n.gameStarted = false;
      toast(`👻 清理掉线玩家：${dead.map(p => p.name).join('、')}`, '', 3000);
    });
  }, 15000);
}
function stopTimers() { clearInterval(hbTimer); clearInterval(pruneTimer); hbTimer = pruneTimer = null; }

// ═══════════════════════════════════════════════════════════
// 连麦：WebRTC 网状语音 + 房间信令 topic（MQTT / 本地模式都复用同一条链路）
//   - 开关麦写入玩家 micOn（随状态同步），两端各自按 clientId 字典序决定谁发 offer，避免冲水
//   - 音量不经过网络同步：每端用 AnalyserNode 就地分析自己收到的音轨，驱动头像波动
//   - 公网 NAT 下依赖 STUN；无 TURN 时跨运营商网络可能连不通，属公共演示服务的已知限制
// ═══════════════════════════════════════════════════════════
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const VOICE_OPEN = 0.045;      // RMS 门槛：超过即认为在说话
const VOICE_HOLD_MS = 320;     // 短暂停顿不熄灭“正在说话”
const MIC_SIGNAL_TTL = 15000;  // 本地模式 localStorage 会回放旧信令：超龄丢弃

const MIC = {
  on: false, stream: null, ctx: null, analyser: null, tmp: null,
  peers: new Map(),   // pid -> { pc, el, src, analyser, tmp, ice[], remoteSet, level, hold }
  seen: new Set(),    // 信令 mid 去重
  localLevel: 0, hold: 0, raf: 0, sig: '',
};

function rmsLevel(analyser, tmp) {
  analyser.getByteTimeDomainData(tmp);
  let sum = 0;
  for (let i = 0; i < tmp.length; i++) { const d = (tmp[i] - 128) / 128; sum += d * d; }
  return Math.sqrt(sum / tmp.length);
}
function voiceSpeaking(st, lvl) {
  if (lvl > VOICE_OPEN) st.hold = Date.now() + VOICE_HOLD_MS;
  return Date.now() < st.hold;
}

async function toggleMic() {
  if (!joined || !link) { toast('先进入房间才能连麦', 'error'); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') { toast('当前浏览器不支持连麦（WebRTC）', 'error'); return; }
  if (MIC.on) { closeMic(); return; }
  try {
    MIC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch { toast('麦克风权限被拒绝，无法连麦', 'error'); return; }
  try {
    MIC.ctx = MIC.ctx || new (window.AudioContext || window.webkitAudioContext)();
    await MIC.ctx.resume();
    MIC.analyser = MIC.ctx.createAnalyser(); MIC.analyser.fftSize = 512;
    MIC.tmp = new Uint8Array(MIC.analyser.fftSize);
    MIC.ctx.createMediaStreamSource(MIC.stream).connect(MIC.analyser);
  } catch { /* 分析器建不起来不阻断通话，仅头像不波动 */ }
  MIC.on = true;
  startMicMeter();
  renderMicUI();
  await mutate(n => { const p = n.players.find(x => x.id === myId); if (p) p.micOn = true; });
  toast('🎙️ 连麦已开启，说话时头像会波动', 'success');
}

function closeMic(silent) {
  const was = MIC.on;
  MIC.on = false;
  for (const pid of [...MIC.peers.keys()]) {
    if (was && !silent && link) { try { link.publishMic({ from: myId, to: pid, kind: 'bye', mid: genId(), t: Date.now() }); } catch {} }
    destroyPeer(pid);
  }
  MIC.stream && MIC.stream.getTracks().forEach(t => t.stop());
  MIC.stream = null; MIC.analyser = null;
  stopMicMeter();
  if (was && !silent && joined && link) mutate(n => { const p = n.players.find(x => x.id === myId); if (p) p.micOn = false; });
  renderMicUI();
}

function destroyPeer(pid) {
  const pr = MIC.peers.get(pid);
  if (!pr) return;
  MIC.peers.delete(pid);
  try { pr.pc.close(); } catch {}
  if (pr.el) { pr.el.pause(); pr.el.srcObject = null; pr.el.remove(); }
  try { pr.src && pr.src.disconnect(); pr.analyser && pr.analyser.disconnect(); } catch {}
}

function makePeer(pid) {
  if (MIC.peers.has(pid)) return MIC.peers.get(pid);
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const pr = { pc, el: null, src: null, analyser: null, tmp: null, ice: [], remoteSet: false, level: 0, hold: 0 };
  pc.ontrack = e => attachRemote(pid, pr, e.streams[0]);
  pc.onconnectionstatechange = () => {
    // 链路断了：只有发起端（字典序小的一方）重建，避免双方轮流重连
    if (!MIC.on || !MIC.peers.get(pid) || pr.pc !== pc) return;
    if (pc.connectionState === 'failed' && myId < pid) { destroyPeer(pid); createPeerTo(pid); }
  };
  if (MIC.stream) MIC.stream.getAudioTracks().forEach(t => pc.addTrack(t, MIC.stream));
  MIC.peers.set(pid, pr);
  return pr;
}

// 非 trickle：等 ICE 收集完再发整份 SDP，本地模式（localStorage 单槽位）也不丢候选
function whenGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    const chk = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', chk); res(); } };
    pc.addEventListener('icegatheringstatechange', chk);
  });
}
async function sendLocalSdp(pid, pr, kind) {
  await Promise.race([whenGatheringComplete(pr.pc), sleep(6000)]);
  if (MIC.peers.get(pid) !== pr || !pr.pc.localDescription || !link) return;
  try { link.publishMic({ from: myId, to: pid, kind, sdp: pr.pc.localDescription, mid: genId(), t: Date.now() }); } catch {}
}
async function createPeerTo(pid) {
  const pr = makePeer(pid);
  try {
    const offer = await pr.pc.createOffer();
    await pr.pc.setLocalDescription(offer);
    sendLocalSdp(pid, pr, 'offer');
    // 信令丢失兑底：9s 还没成链且对方状态里是开麦的，重来一次
    setTimeout(() => {
      if (MIC.peers.get(pid) === pr && !pr.remoteSet && MIC.on && myId < pid && S && S.players.some(p => p.id === pid && p.micOn)) {
        destroyPeer(pid); createPeerTo(pid);
      }
    }, 9000);
  } catch {}
}

function attachRemote(pid, pr, stream) {
  if (!stream || pr.el) return;
  pr.el = document.createElement('audio');
  pr.el.autoplay = true; pr.el.style.display = 'none';
  pr.el.srcObject = stream;
  document.body.appendChild(pr.el);
  pr.el.play().catch(() => {});
  try {
    pr.src = MIC.ctx.createMediaStreamSource(stream);
    pr.analyser = MIC.ctx.createAnalyser(); pr.analyser.fftSize = 512;
    pr.tmp = new Uint8Array(pr.analyser.fftSize);
    pr.src.connect(pr.analyser);   // 只接分析器不外放，声音由 audio 元素播
  } catch {}
}

// 玩家列表 / micOn 变化时对账网状网：新开麦的建链，关麦/退房的拆链
function syncMicPeers() {
  const want = new Set(MIC.on && S ? S.players.filter(p => p.id !== myId && p.micOn).map(p => p.id) : []);
  for (const pid of [...MIC.peers.keys()]) if (!want.has(pid)) destroyPeer(pid);
  if (!MIC.on) return;
  for (const pid of want) {
    if (MIC.peers.has(pid)) continue;
    if (myId < pid) createPeerTo(pid);   // 发起端：主动 offer
    else makePeer(pid);                  // 响应端：先挂好回调等 offer
  }
}

async function onMicMsg(m) {
  if (!m || !m.from || !m.kind || m.from === myId || !joined) return;
  if (m.to !== myId && m.to !== '*') return;
  if (typeof m.t === 'number' && Date.now() - m.t > MIC_SIGNAL_TTL) return;   // 旧信令回放丢弃
  if (m.mid) {
    if (MIC.seen.has(m.mid)) return;
    if (MIC.seen.size > 500) MIC.seen.clear();
    MIC.seen.add(m.mid);
  }
  if (!MIC.on) return;
  if (m.kind === 'bye') { destroyPeer(m.from); return; }
  if (m.kind === 'offer') {
    if (myId < m.from) return;   // 双方都发 offer 的冲突兑底：字典序小的那方只应自己发
    const pr = makePeer(m.from);
    if (pr.remoteSet) return;
    try {
      await pr.pc.setRemoteDescription(m.sdp);
      pr.remoteSet = true;
      for (const c of pr.ice.splice(0)) pr.pc.addIceCandidate(c).catch(() => {});
      const ans = await pr.pc.createAnswer();
      await pr.pc.setLocalDescription(ans);
      sendLocalSdp(m.from, pr, 'answer');
    } catch {}
  } else if (m.kind === 'answer') {
    const pr = MIC.peers.get(m.from);
    if (pr && !pr.remoteSet) {
      try {
        await pr.pc.setRemoteDescription(m.sdp);
        pr.remoteSet = true;
        for (const c of pr.ice.splice(0)) pr.pc.addIceCandidate(c).catch(() => {});
      } catch {}
    }
  } else if (m.kind === 'ice') {
    const pr = MIC.peers.get(m.from);
    if (!pr || !m.c) return;
    if (pr.remoteSet) pr.pc.addIceCandidate(m.c).catch(() => {});
    else pr.ice.push(m.c);
  }
}

// 音量仪表：本地 + 每个远端音轨就地 RMS → 写 --voice / speaking 到头像卡片
function paintVoice(pid, level, speaking) {
  const cards = document.querySelectorAll(`.player-card[data-pid="${CSS.escape(pid)}"]`);
  for (const c of cards) {
    c.classList.toggle('speaking', speaking);
    const ring = c.querySelector('.avatar-ring');
    if (ring) ring.style.setProperty('--voice', speaking ? Math.min(1, level * 1.8).toFixed(3) : '0');
  }
}
function resetVoice() {
  document.querySelectorAll('.player-card.speaking').forEach(c => { c.classList.remove('speaking'); c.querySelector('.avatar-ring')?.style.setProperty('--voice', '0'); });
  document.querySelectorAll('.mic-btn').forEach(b => b.style.setProperty('--voice', '0'));
}
function startMicMeter() {
  if (MIC.raf) return;
  const loop = () => {
    MIC.raf = 0;
    let any = false;
    if (MIC.on && MIC.analyser) {
      const raw = rmsLevel(MIC.analyser, MIC.tmp);
      MIC.localLevel += (raw - MIC.localLevel) * 0.35;
      const sp = voiceSpeaking(MIC, MIC.localLevel);
      paintVoice(myId, MIC.localLevel, sp);
      const lv = sp ? Math.min(1, MIC.localLevel * 1.8) : 0;
      document.querySelectorAll('.mic-btn').forEach(b => b.style.setProperty('--voice', lv.toFixed(3)));
      any = true;
    } else {
      paintVoice(myId, 0, false);
    }
    for (const [pid, pr] of MIC.peers) {
      if (pr.analyser) {
        const raw = rmsLevel(pr.analyser, pr.tmp);
        pr.level += (raw - pr.level) * 0.35;
        paintVoice(pid, pr.level, voiceSpeaking(pr, pr.level));
      }
      any = true;
    }
    if (any) MIC.raf = requestAnimationFrame(loop);
    else { resetVoice(); renderMicUI(); }
  };
  MIC.raf = requestAnimationFrame(loop);
}
function stopMicMeter() { if (MIC.raf) cancelAnimationFrame(MIC.raf); MIC.raf = 0; resetVoice(); }

function renderMicUI() {
  const n = S ? S.players.filter(p => p.micOn).length : 0;
  document.querySelectorAll('.js-mic-btn').forEach(b => {
    b.classList.toggle('live', MIC.on);
    const label = b.querySelector('.mic-label');
    if (label) label.textContent = MIC.on ? (n > 1 ? `连麦中 · ${n} 人` : '连麦中 · 等待开麦') : '连麦';
  });
}
function updateMicBadges() {
  if (!S) return;
  const on = new Set(S.players.filter(p => p.micOn).map(p => p.id));
  document.querySelectorAll('.player-card').forEach(c => c.classList.toggle('mic-on', on.has(c.dataset.pid)));
}

// ═══════════════════════════════════════════════════════════════
// 头像选择
// ═══════════════════════════════════════════════════════════════
// 24 张手选头像 = 14 小鸟 + 10 抽象假面（fam:'mask'）：小鸟 sil 0鸭/1鹅 · plume 羽色 · beak 喙 · bg 底色 · motif 背景纹样 · eye 眼神 · wear 配饰
const AVATAR_PRESETS = [
  { n: '月白', sil: 1, plume: 0, beak: 0, bg: 3, motif: 0, eye: 0, col: 4, wear: 0 },
  { n: '拾翠', sil: 0, plume: 4, beak: 1, bg: 1, motif: 5, eye: 1, col: 1, wear: 0 },
  { n: '小贝', sil: 1, plume: 1, beak: 0, bg: 2, motif: 2, eye: 0, col: 0, wear: 1 },
  { n: '书呆', sil: 0, plume: 2, beak: 1, bg: 0, motif: 4, eye: 0, col: 6, wear: 2 },
  { n: '围炉', sil: 1, plume: 0, beak: 2, bg: 4, motif: 1, eye: 2, col: 0, wear: 3 },
  { n: '栀子', sil: 0, plume: 0, beak: 1, bg: 5, motif: 3, eye: 0, col: 3, wear: 4 },
  { n: '嫩芽', sil: 1, plume: 4, beak: 0, bg: 1, motif: 5, eye: 3, col: 1, wear: 5 },
  { n: '绅士', sil: 0, plume: 1, beak: 0, bg: 6, motif: 2, eye: 0, col: 2, wear: 6 },
  { n: '宿雾', sil: 1, plume: 1, beak: 3, bg: 7, motif: 4, eye: 2, col: 5, wear: 0 },
  { n: '栖霞', sil: 0, plume: 3, beak: 2, bg: 4, motif: 0, eye: 1, col: 5, wear: 1 },
  { n: '竹月', sil: 1, plume: 6, beak: 1, bg: 3, motif: 3, eye: 0, col: 1, wear: 2 },
  { n: '浮玉', sil: 0, plume: 5, beak: 3, bg: 2, motif: 1, eye: 3, col: 5, wear: 4 },
  { n: '远黛', sil: 1, plume: 3, beak: 0, bg: 0, motif: 1, eye: 1, col: 6, wear: 3 },
  { n: '听雪', sil: 0, plume: 0, beak: 3, bg: 6, motif: 3, eye: 2, col: 1, wear: 5 },
  // 🎭 抽象假面：一面两相，真心话 vs 大冒险
  { n: '问心', fam: 'mask', pal: 0, base: 0, split: 1, eye: 3, mouth: 0, deco: 1, bg: 0 },
  { n: '两面', fam: 'mask', pal: 3, base: 1, split: 2, eye: 1, mouth: 2, deco: 4, bg: 1 },
  { n: '戏面', fam: 'mask', pal: 1, base: 2, split: 3, eye: 0, mouth: 1, deco: 2, bg: 3 },
  { n: '窥真', fam: 'mask', pal: 4, base: 0, split: 0, eye: 2, mouth: 3, deco: 3, bg: 2 },
  { n: '挑灯', fam: 'mask', pal: 2, base: 3, split: 1, eye: 0, mouth: 0, deco: 5, bg: 0 },
  { n: '虚实', fam: 'mask', pal: 5, base: 1, split: 2, eye: 1, mouth: 3, deco: 0, bg: 1 },
  { n: '恶面', fam: 'mask', pal: 1, base: 2, split: 0, eye: 0, mouth: 1, deco: 2, bg: 2 },
  { n: '照妖', fam: 'mask', pal: 0, base: 3, split: 3, eye: 3, mouth: 2, deco: 1, bg: 3 },
  { n: '羞月', fam: 'mask', pal: 3, base: 0, split: 1, eye: 1, mouth: 0, deco: 4, bg: 0 },
  { n: '惊心', fam: 'mask', pal: 4, base: 2, split: 2, eye: 2, mouth: 3, deco: 5, bg: 1 },
];
let customAvatar = null;
const showAvatarName = name => { const el = $('avatar-name'); if (el) el.textContent = name || ''; };

// 自定义上传头像占位格（懒创建，永远插在「📷 上传」格之前）
function ensureCustomTile() {
  const el = $('avatar-selector');
  let tile = el.querySelector('.avatar-option.custom');
  if (tile) return tile;
  tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'avatar-option custom';
  tile.title = '自定义';
  tile.setAttribute('aria-label', '自定义头像');
  tile.appendChild(document.createElement('img'));
  tile.addEventListener('click', () => { selectAvatar(tile); showAvatarName('自定义'); });
  el.insertBefore(tile, el.querySelector('.avatar-option:last-of-type') || el.lastElementChild);
  return tile;
}

function buildAvatarSelector() {
  const el = $('avatar-selector');
  el.innerHTML = '';
  AVATAR_PRESETS.forEach((p, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'avatar-option' + (i === 0 ? ' selected' : '');
    d.dataset.avatar = presetUri(p);
    d.dataset.name = p.n;
    d.title = p.n;
    d.setAttribute('aria-label', '头像 ' + p.n);
    const img = document.createElement('img');
    img.src = d.dataset.avatar; img.alt = ''; img.dataset.fallback = '';
    d.appendChild(img);
    d.addEventListener('click', () => { selectAvatar(d); showAvatarName(p.n); });
    d.addEventListener('mouseenter', () => showAvatarName(p.n));
    d.addEventListener('focus', () => showAvatarName(p.n));
    el.appendChild(d);
  });
  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'avatar-option';
  up.textContent = '📷';
  up.title = '上传图片';
  up.setAttribute('aria-label', '上传自定义头像');
  up.addEventListener('click', () => $('avatar-file').click());
  el.appendChild(up);
  showAvatarName(AVATAR_PRESETS[0].n);
}
function selectAvatar(d) {
  $('avatar-selector').querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
  d.classList.add('selected');
}
$('avatar-file').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const size = 96;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    customAvatar = cv.toDataURL('image/jpeg', 0.82);
    const tile = ensureCustomTile();
    tile.dataset.avatar = customAvatar;
    tile.querySelector('img').src = customAvatar;
    selectAvatar(tile);
    showAvatarName('自定义');
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
  e.target.value = '';
});
function selAvatar() {
  const s = $('avatar-selector').querySelector('.avatar-option.selected');
  return s ? s.dataset.avatar : birdAvatar(AVATAR_PRESETS[0]);
}

// ═══════════════════════════════════════════════════════════════
// 惩罚库导入（粘贴 AI 生成的 Markdown 会自动分类）
// ═══════════════════════════════════════════════════════════════
// 分节标题判定：「## 真心话」/「## 大冒险」（兼容 #~###### 与 **粗体**，以及英文 truth/dare）
// 两个词都出现（如「# 真心话大冒险」文档总标题）则不改类别，只当噪声丢弃
function classifyHeading(t) {
  const hasT = /真心话|truth/i.test(t), hasD = /大冒险|dare/i.test(t);
  return hasT && !hasD ? 'truth' : (hasD && !hasT ? 'dare' : null);
}
// 把粘贴文本拆成 { truth, dare }：靠标题切段，顺便剔掉序号/bullet/粗体/引用等装饰
function parsePools(text, fallback) {
  const out = { truth: [], dare: [] };
  const seen = new Set();
  let cur = fallback === 'dare' ? 'dare' : 'truth';
  // AI 有时把多条挤在同一行（「…？1. 如果可以…」）→ 句子结束符后紧跟序号的先拆行
  const lines = String(text || '').replace(/([？。！?!；;])\s*\d+\s*[.、)．]\s*/g, '$1\n');
  for (const raw of lines.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,6}\s*(.*)$/) || line.match(/^\*{2,3}([^*]+)\*{2,3}$/);
    if (h) {
      const c = classifyHeading(h[1].replace(/[*_`>#]/g, ' ').trim());
      if (c) cur = c;
      continue;
    }
    line = line.replace(/^>\s*/, '')                                  // 引用
      .replace(/^(?:[-*+·•]|\d+\s*[.、)．]|[①-⑳])\s*/, '')      // bullet / 序号 / 带圈数字
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`/g, '')   // 粗体 / 行内代码
      .replace(/^[：:；;]\s*|[：:；;]\s*$/g, '')                      // 残缺冒号
      .trim();
    if (!line || !/[\p{L}\p{N}]/u.test(line) || seen.has(line)) continue;
    seen.add(line);
    out[cur].push(line);
  }
  return out;
}
function updatePoolCount() {
  const p = SPool || localPunishments;
  $('pool-count').textContent = `当前题库：💬${p.truth.length} · 🎯${p.dare.length}（${SPool && joined ? '房间共享' : joined ? '本地待同步' : '本地'}）`;
}
function importPools(parsed) {
  let n = 0;
  for (const t of ['truth', 'dare']) {
    const added = parsed[t].filter(l => !localPunishments[t].includes(l));
    if (added.length) { localPunishments[t].push(...added); editedPools.add(t); n += added.length; }
  }
  updatePoolCount();
  return n;
}

document.querySelectorAll('.import-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentImportTab = tab.dataset.tab;
    document.querySelectorAll('.import-tab').forEach(t => t.classList.toggle('active', t === tab));
  });
});

$('btn-import').addEventListener('click', async () => {
  const parsed = parsePools($('import-text').value, currentImportTab);
  const n = importPools(parsed);
  if (!n) { toast('没有可导入的新内容', 'error'); return; }
  $('import-text').value = '';
  if (!joined) { toast(`已加入本地题库 ${n} 条（建房/加入房间时并入）`, 'success'); return; }
  if (!SPool) SPool = JSON.parse(JSON.stringify(localPunishments));
  for (const t of ['truth', 'dare']) {
    const arr = SPool[t] || (SPool[t] = []);
    for (const l of parsed[t]) if (!arr.includes(l)) arr.push(l);
  }
  const ok = await publishPool();
  updatePoolCount();   // 本地模式不会回射自己的发布，需主动刷新计数
  toast(ok ? `导入 ${n} 条，已同步到房间！` : `导入 ${n} 条，房间同步未成功（已本地保留）`, ok ? 'success' : 'error');
});

// ═══════════════════════════════════════════════════════════════
// 背景粒子
// ═══════════════════════════════════════════════════════════════
function buildBg() {
  const c = $('bg-canvas');
  const cols = ['#8b5cf6', '#f472b6', '#22d3ee', '#f97316', '#3b82f6', '#fbbf24', '#a78bfa'];
  for (let i = 0; i < 26; i++) {
    const n = document.createElement('div');
    n.className = 'confetti';
    n.style.left = Math.random() * 100 + '%';
    n.style.background = pick(cols);
    n.style.animationDuration = (8 + Math.random() * 12) + 's';
    n.style.animationDelay = (-Math.random() * 20) + 's';
    n.style.width = (4 + Math.random() * 5) + 'px';
    n.style.height = (4 + Math.random() * 5) + 'px';
    n.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    c.appendChild(n);
  }
}

// ═══════════════════════════════════════════════════════════════
// 事件绑定
// ═══════════════════════════════════════════════════════════════
$('btn-join').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  if (!name) { toast('请输入名字！', 'error'); return; }
  await doJoin(name, selAvatar(), $('input-room').value, $('chk-local').checked);
});
$('btn-paste-room').addEventListener('click', () => pasteRoom(false));
$('input-room').addEventListener('paste', e => {   // 邀请文字直接粘进输入框：当场抽取房间号回填
  const raw = ((e.clipboardData || (window.clipboardData)) || { getData: () => '' }).getData('text');
  const code = extractRoom(raw);
  if (code && code !== raw.trim().toUpperCase()) { e.preventDefault(); $('input-room').value = code; toast(`已从邀请提取房间号 ${code} 📋`, 'success'); }
});
// 从聊天窗口切回本页面时，自动读一次剪贴板（浏览器可能弹粘贴授权，拒绝则静默跳过）
document.addEventListener('visibilitychange', () => { if (!document.hidden && !joined && !$('input-room').value.trim()) pasteRoom(true); });
document.querySelectorAll('#mode-pick .mode-opt').forEach(b => b.addEventListener('click', () => {
  pickedMode = b.dataset.mode;
  document.querySelectorAll('#mode-pick .mode-opt').forEach(x => x.classList.toggle('sel', x === b));
}));
$('input-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-start').addEventListener('click', startGame);
$('btn-leave').addEventListener('click', doLeave);
$('btn-leave-game').addEventListener('click', doLeave);
$('btn-end-game').addEventListener('click', endGame);
$('card-truth').addEventListener('click', () => choose('truth'));
$('card-dare').addEventListener('click', () => choose('dare'));
document.querySelectorAll('.js-mic-btn').forEach(b => b.addEventListener('click', toggleMic));
$('btn-accept').addEventListener('click', () => finishTurn(false));
$('btn-skip').addEventListener('click', () => finishTurn(true));
$('btn-resync').addEventListener('click', async () => {
  if (!link) return;
  setNet('syncing', '同步中...');
  // 重新订阅：MQTT 会重新投递 retained（状态 + 题库两路），本地模式直接重读 localStorage
  link.resubscribe();
  await sleep(900);
  setNet('online', link.kind === 'local' ? '本地模式（同浏览器多标签）' : `已连接 ${link.currentHost}`);
  toast('已同步！', 'success');
});
$('copy-link-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(inviteText()).then(() => {
    const b = $('copy-link-btn');
    b.textContent = '✅ 已复制！'; b.classList.add('copied');
    setTimeout(() => { b.textContent = copyBtnLabel(); b.classList.remove('copied'); }, 2000);
  }).catch(() => toast('复制失败，请把房间号手动发给朋友', 'error'));
});
window.addEventListener('pagehide', () => {
  // 尽力而为：离开页面时把自己移出房间
  try {
    if (joined && S && link && link.client) {
      const next = JSON.parse(JSON.stringify(S));
      next.players = next.players.filter(p => p.id !== myId);
      next.ts = Date.now();
      if (!next.players.length) next.expiresAt = Date.now();
      if (!next.players.some(p => p.id === next.turn.chooserId)) resetTurnStage(next);
      link.client.publish(link.topic, enc.encode(JSON.stringify(next)), { retain: true, qos1: false });
      if (link.kind === 'local') { /* localStorage 已即时写入，无需处理 */ }
    }
  } catch {}
});

// ═══════════════════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════════════════
buildBg();
buildAvatarSelector();
updatePoolCount();

function applyIdentity(name, avatar) {   // 把名字+头像回填到加入页（票/存档优先）
  if (!name) return;
  $('input-name').value = name;
  if (!avatar) return;
  const match = [...$('avatar-selector').children].find(d => d.dataset && d.dataset.avatar === avatar);
  if (match) { selectAvatar(match); return; }
  if (avatar.startsWith('data:')) {
    customAvatar = avatar;
    const tile = ensureCustomTile();
    tile.dataset.avatar = avatar; tile.querySelector('img').src = avatar; selectAvatar(tile); showAvatarName('自定义');
  }
}
try {
  const saved = JSON.parse(localStorage.getItem('tod:me') || 'null');
  const savedAvatar = saved && saved.avatar ? saved.avatar : (localStorage.getItem('tod:me:avatar') || '');
  applyIdentity(saved && saved.name, savedAvatar);   // 若保存的头像匹配预设则选中对应项；若是上传的 dataURL 则重建自定义 tile
} catch {}

const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

// 房间内刷新 → 自动回房：本标签页有回房凭据就直接重新加入（id/名字/头像均取自票，不会出现重复或串号的“自己”）
let tabTicket = null;
try { tabTicket = JSON.parse(sessionStorage.getItem('tod:tab') || 'null'); } catch {}
const rejoinName = tabTicket && tabTicket.id && tabTicket.room && Date.now() - (tabTicket.ts || 0) < 30 * 60 * 1000
  ? (tabTicket.name || $('input-name').value.trim()) : '';
if (rejoinName) {
  applyIdentity(rejoinName, tabTicket.avatar);
  $('input-room').value = tabTicket.room;
  $('chk-local').checked = !!tabTicket.local;
  setLoadingText(`🔁 欢迎回来！自动回到房间 ${tabTicket.room}...`);
  setTimeout(() => { if (!joined && !link) doJoin(rejoinName, tabTicket.avatar || selAvatar(), tabTicket.room, !!tabTicket.local); }, 1350);
} else if (urlRoom) {
  $('input-room').value = urlRoom;
  setLoadingText(`发现房间 ${urlRoom}，输入名字即可加入...`);
} else {
  setTimeout(() => pasteRoom(true), 1500);   // 打开就带着邀请在剪贴板里：静默自动填入
}

// 启动过场：分阶段文案 + 抽卡加载动画，给玩家一个“入场”的仪式感
const bootSteps = (urlRoom || rejoinName) ? [] : ['🃏 洗混卡牌...', '✨ 点亮灯光...'];
let bootIdx = 0;
const bootTimer = setInterval(() => {
  if (bootIdx >= bootSteps.length) { clearInterval(bootTimer); return; }
  setLoadingText(bootSteps[bootIdx++]);
}, 340);
setTimeout(() => {
  clearInterval(bootTimer);
  hideLoading();
  setNet('', (urlRoom || rejoinName) ? '待加入' : '未连接');
}, 1200);
