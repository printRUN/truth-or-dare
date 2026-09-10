// 逐个实测候选的公共 TURN 服务：能不能拿到 relay 候选
// 用法: node probe-turn2.cjs [编号]   (from .pw/)   不带参数 = 全跑
const PW = 'C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright';
const { chromium } = require(PW);

const CANDIDATES = {
  'metered-global': [
    { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:443', 'turn:global.relay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  'peerjs': [
    { urls: ['turn:0.peerjs.com:3478', 'turn:0.peerjs.com:9274'], username: 'peerjs', credential: 'peerjsp' },
  ],
  'stunprotocol': [
    { urls: ['turn:turn.stunprotocol.org:3478'], username: 'test', credential: 'test' },
  ],
};

async function relayTypes(browser, servers) {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const out = await page.evaluate(async iceServers => {
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 0 });
    pc.addTransceiver('audio', { direction: 'sendrecv' });   // 没有 m-line 就不会收集候选
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(r => {
      const t = setTimeout(r, 12000);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } };
    });
    const list = [];
    const st = await pc.getStats();
    st.forEach(s => { if (s.type === 'local-candidate') list.push(s.candidateType + '@' + (s.address || '?') + ':' + (s.port || '?') + '/' + (s.protocol || '') + (s.relayProtocol ? '(' + s.relayProtocol + ')' : '')); });
    pc.close();
    return list;
  }, servers);
  await page.close();
  return out;
}

(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] });
  for (const [name, servers] of Object.entries(CANDIDATES)) {
    if (only && only !== name) continue;
    const types = await relayTypes(browser, servers);
    const relay = types.filter(t => t.startsWith('relay'));
    console.log(`${name.padEnd(14)} → ${relay.length ? 'RELAY ✅ ' + relay.join(', ') : 'no relay ❌'}  (all: ${types.join(' | ') || 'none'})`);
  }
  await browser.close();
})();
