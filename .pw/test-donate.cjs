// Verify the donate modal: open page, click #btn-donate, check QR image decodes, screenshot.
const path = require('path');
const { chromium } = require('C:/Users/Admin/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright');

(async () => {
  const url = 'file:///' + path.resolve(__dirname, '../index.html?game=tod').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.click('#btn-donate');
  await page.waitForSelector('.donate-qr', { state: 'visible', timeout: 3000 });
  const maskVisible = await page.locator('#modal-mask').isVisible();
  const qr = await page.evaluate(() => {
    const img = document.querySelector('.donate-qr');
    return { complete: img.complete, naturalWidth: img.naturalWidth, srcHead: img.src.slice(0, 30) };
  });
  await page.screenshot({ path: path.join(__dirname, 'shots', 'donate.png') });
  console.log(JSON.stringify({ maskVisible, qr, errs }, null, 1));
  await browser.close();
})();
