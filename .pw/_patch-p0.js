const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
function rep(re, neu, tag) { if (!re.test(s)) throw new Error('missing: ' + tag); s = s.replace(re, neu); }

// P0-2：#stage-actions/.leaving 归还分支在 frame 早退之后=死代码；非 active 屏先归还再退
rep(/(    if \(toolsMoved\) toolsMoved\.el\.style\.display = active \? 'flex' : 'none';[^\r\n]*\r?\n)(    if \(!active\) return;)/,
'$1    if (!active && (movedEls.length || stageActions.style.display !== \'none\')) bridgeRestore();   // 退场归还必须在早退前（否则死按钮条浮在大厅/结算上拦点击——代码终审 P0-2）\n$2', 'p0-2');

// P1-1：raycast NDC 用画布逻辑尺寸（禁 rect 物理盒混 landPick 逻辑坐标）
rep(/    const r = canvas\.getBoundingClientRect\(\);\r?\n    const pk = \(typeof landPick === 'function'\) \? landPick\(e\.clientX, e\.clientY\) : \{ x: e\.clientX, y: e\.clientY \};\r?\n    mouseNdc\.x = \(\(pk\.x - r\.left\) \/ r\.width\) \* 2 - 1;\r?\n    mouseNdc\.y = -\(\(pk\.y - r\.top\) \/ r\.height\) \* 2 \+ 1;/,
`    const pk = (typeof landPick === 'function') ? landPick(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
    mouseNdc.x = (pk.x / canvas.clientWidth) * 2 - 1;      // 画布固定全屏：逻辑尺寸直除（禁 rect 物理盒混 landPick 逻辑坐标，landforce 下必错）
    mouseNdc.y = -(pk.y / canvas.clientHeight) * 2 + 1;`, 'p1-1');

// P1-2：REDUCED 档牌背脉动停（静态退路）
rep(/(    if \(st\.phase === 'pulse'\) \{\r?\n      const b = Math\.max\(0, 1 - \(now - st\.t0\) \/ 80\);   \/\/ 落弹\r?\n      const pl = 1 \+ 0\.015 \* Math\.sin\(sec \* 3\.9\) \+ 0\.02 \* b;   \/\/ 抽取中呼吸脉动（治 1\.1s 死气）\r?\n      actionCard\.scale\.set\(pl, 1, pl\);\r?\n    \})/,
`    if (st.phase === 'pulse') {
      if (IS_REDUCED) { actionCard.scale.set(1, 1, 1); }
      else {
        const b = Math.max(0, 1 - (now - st.t0) / 80);   // 落弹
        const pl = 1 + 0.015 * Math.sin(sec * 3.9) + 0.02 * b;   // 抽取中呼吸脉动（治 1.1s 死气）
        actionCard.scale.set(pl, 1, pl);
      }
    }`, 'p1-2');

// P1-3：retire 清名牌 visibility（出屏裁剪过的名牌在 CSS 回退路径不能永久隐身）
rep(/(        c\.style\.left = ''; c\.style\.top = ''; c\.style\.zIndex = '';\r?\n)(      \}\);)/,
'$1        c.style.visibility = \'\';\n$2', 'p1-3');

// P2-2：rAF 僵尸循环（retire 后先查再排队）
rep(/  function frame\(t\) \{\r?\n    requestAnimationFrame\(frame\);\r?\n    if \(retired\) return;\r?\n    if \(document\.body\.classList\.contains\('loperf'\)\)/,
`  function frame(t) {
    if (retired) return;   // 先查再排队：retire 后 rAF 不空转（代码终审 P2-2）
    requestAnimationFrame(frame);
    if (document.body.classList.contains('loperf'))`, 'p2-2');

// P2-3：名牌深度判定复用向量，不每帧 clone
rep(/      const vz = V\.clone\(\)\.applyMatrix4\(camera\.matrixWorldInverse\)\.z;/,
'      const vz = V2.set(ch.position.x, 1.72, ch.position.z).applyMatrix4(camera.matrixWorldInverse).z;   // V2 复用，8 人局不逐帧分配', 'p2-3');
rep(/  const V = new THREE\.Vector3\(\);/,
'  const V = new THREE.Vector3();\n  const V2 = new THREE.Vector3();', 'V2decl');

fs.writeFileSync('index.html', s);
console.log('P0/P1/P2 patched');
