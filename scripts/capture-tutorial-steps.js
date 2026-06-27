const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'report_assets', 'screenshots');
const serverPort = 3136;
const baseUrl = `http://127.0.0.1:${serverPort}`;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const saveId = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`等待服务超时：${url}`);
}

async function newPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  await context.addInitScript((id) => {
    localStorage.setItem('monsterCafeSelectedSave', String(id));
    localStorage.setItem('monsterCafePlayerName', '报告演示');
    sessionStorage.removeItem('monsterCafeSkipReturnTitleConfirm');
  }, saveId);
  const page = await context.newPage();
  return { context, page };
}

async function screenshot(page, fileName) {
  await page.waitForTimeout(450);
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: false
  });
}

async function captureHomeTutorial(browser) {
  const { context, page } = await newPage(browser);
  try {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      document.querySelector('[data-tutorial-modal]')?.setAttribute('hidden', '');
      if (typeof startHomeTutorialGuide === 'function') startHomeTutorialGuide();
    });

    const names = [
      'tutorial_home_01_return_title.png',
      'tutorial_home_02_collection.png',
      'tutorial_home_03_achievements.png',
      'tutorial_home_04_level_rewards.png',
      'tutorial_home_05_backpack.png',
      'tutorial_home_06_shop.png',
      'tutorial_home_07_logs.png',
      'tutorial_home_08_start_day.png'
    ];

    for (let index = 0; index < names.length; index += 1) {
      await screenshot(page, names[index]);
      if (index < names.length - 1) {
        await page.click('[data-tutorial-next]');
        await page.waitForTimeout(350);
      }
    }
  } finally {
    await context.close();
  }
}

async function captureGameTutorial(browser) {
  const { context, page } = await newPage(browser);
  try {
    await page.goto(`${baseUrl}/game.html?mode=tutorial`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5200);
    await screenshot(page, 'tutorial_game_01_customer.png');
    await page.click('[data-tutorial-next]');
    await page.waitForTimeout(350);
    await screenshot(page, 'tutorial_game_02_order.png');
    await page.click('[data-tutorial-next]');
    await page.waitForTimeout(350);
    await screenshot(page, 'tutorial_game_03_ingredients.png');
    await page.click('[data-ingredients] [data-add-ingredient]:not([disabled])');
    await page.waitForTimeout(600);
    await screenshot(page, 'tutorial_game_04_current_drink.png');
    await page.click('[data-tutorial-next]');
    await page.waitForTimeout(350);
    await screenshot(page, 'tutorial_game_05_make_button.png');
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const server = spawn(process.execPath, ['backend/server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(serverPort) },
    stdio: 'ignore',
    windowsHide: true
  });
  let browser;
  try {
    await waitForUrl(`${baseUrl}/api/health`);
    browser = await chromium.launch({
      executablePath: edgePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-features=Vulkan,DefaultANGLEVulkan,DawnGraphite,UseSkiaRenderer'
      ]
    });
    await captureHomeTutorial(browser);
    await captureGameTutorial(browser);
    console.log('已生成新手教程逐步截图。');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
