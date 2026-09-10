// Screenshot a local HTML file. Usage: node .pw/shot.cjs <file> <out.png> [fullPage]
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');

(async () => {
  const [,, target, out, full] = process.argv;
  const url = 'file:///' + path.resolve(target).replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, fullPage: !!full });
  console.log('shot ->', out, errs.length ? ('ERRORS: ' + errs.join(' | ')) : '(no pageerror)');
  await browser.close();
})();
