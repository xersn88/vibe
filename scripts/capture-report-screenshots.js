const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { chromium } = require('playwright');

const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'report_assets', 'screenshots');
const dbPath = path.join(rootDir, 'backend', 'data', 'monster_cafe.db');
const serverPort = 3135;
const baseUrl = `http://127.0.0.1:${serverPort}`;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

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
      // The local server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`等待服务超时：${url}`);
}

function openDb() {
  const db = new sqlite3.Database(dbPath);
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
          if (error) reject(error);
          else resolve(this);
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
          if (error) reject(error);
          else resolve(row);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
          if (error) reject(error);
          else resolve(rows);
        });
      });
    },
    close() {
      db.close();
    }
  };
}

async function prepareDemoSave() {
  await fetch(`${baseUrl}/api/saves`);
  const saveId = 1;
  const db = openDb();
  try {
    await db.run(
      `
        INSERT INTO saves (id, save_name, player_id, coins, level, xp, business_days, tutorial_prompted, tutorial_completed, updated_at)
        VALUES (1, ?, 1, 2761, 12, 1423, 7, 1, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id)
        DO UPDATE SET
          save_name = excluded.save_name,
          coins = excluded.coins,
          level = excluded.level,
          xp = excluded.xp,
          business_days = excluded.business_days,
          tutorial_prompted = excluded.tutorial_prompted,
          tutorial_completed = excluded.tutorial_completed,
          updated_at = CURRENT_TIMESTAMP
      `,
      ['报告演示的存档']
    );

    await db.run(
      'UPDATE save_ingredients SET stock = 4, unlocked = 1, updated_at = CURRENT_TIMESTAMP WHERE save_id = ?',
      [saveId]
    );

    const monsters = await db.all('SELECT id FROM monsters ORDER BY id ASC');
    for (let index = 0; index < monsters.length; index += 1) {
      const monster = monsters[index];
      const unlocked = index < 10 ? 1 : 0;
      const visits = unlocked ? index + 1 : 0;
      const best = unlocked ? Math.min(100, 72 + index * 3) : 0;
      const affinity = unlocked ? 120 + index * 45 : 0;
      const readStories = index < 2 ? '[]' : '[100]';
      await db.run(
        `
          UPDATE save_collection
          SET unlocked = ?, visit_count = ?, best_satisfaction = ?, updated_at = CURRENT_TIMESTAMP
          WHERE save_id = ? AND monster_id = ?
        `,
        [unlocked, visits, best, saveId, monster.id]
      );
      await db.run(
        `
          UPDATE monster_affinity
          SET affinity = ?, relationship_level = ?, read_stories = ?, updated_at = CURRENT_TIMESTAMP
          WHERE save_id = ? AND monster_id = ?
        `,
        [affinity, affinity >= 300 ? '熟客' : '点头之交', readStories, saveId, monster.id]
      );
    }

    const achievements = await db.all('SELECT id FROM achievements ORDER BY id ASC');
    for (let index = 0; index < achievements.length; index += 1) {
      const achievement = achievements[index];
      const targetRow = await db.get(
        'SELECT target_progress FROM save_achievements WHERE save_id = ? AND achievement_id = ?',
        [saveId, achievement.id]
      );
      const target = Number(targetRow?.target_progress || 1);
      let progress = Math.max(0, Math.floor(target / 2));
      let completed = 0;
      let claimed = 0;
      if (index < 4) {
        progress = target;
        completed = 1;
      } else if (index < 8) {
        progress = target;
        completed = 1;
        claimed = 1;
      }
      await db.run(
        `
          UPDATE save_achievements
          SET current_progress = ?, completed = ?, claimed = ?,
              completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
              claimed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
          WHERE save_id = ? AND achievement_id = ?
        `,
        [progress, completed, claimed, completed, claimed, saveId, achievement.id]
      );
    }

    const levelRewards = await db.all('SELECT id, level FROM level_rewards ORDER BY level ASC');
    for (const reward of levelRewards) {
      await db.run(
        `
          INSERT INTO save_level_rewards (save_id, level_reward_id, claimed, claimed_at)
          VALUES (?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
          ON CONFLICT(save_id, level_reward_id)
          DO UPDATE SET claimed = excluded.claimed, claimed_at = excluded.claimed_at
        `,
        [saveId, reward.id, reward.level <= 2 ? 1 : 0, reward.level <= 2 ? 1 : 0]
      );
    }

    const items = [
      ['story_star', '故事星砂', '阅读怪兽故事后获得的纪念物，可用于展示与怪兽的关系。', '星', 3],
      ['coupon_restock', '补货券', '等级奖励中获得的补给道具，代表一次额外进货机会。', '券', 2],
      ['lucky_pudding', '幸运布丁', '成就奖励中的特殊甜点，可以作为收藏物展示。', '布', 1]
    ];
    for (const [code, name, description, iconText, quantity] of items) {
      await db.run(
        'INSERT OR IGNORE INTO backpack_items (code, name, description, icon_text) VALUES (?, ?, ?, ?)',
        [code, name, description, iconText]
      );
      const item = await db.get('SELECT id FROM backpack_items WHERE code = ?', [code]);
      await db.run(
        `
          INSERT INTO save_backpack (save_id, item_id, quantity, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(save_id, item_id)
          DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP
        `,
        [saveId, item.id, quantity]
      );
    }

    await db.run('DELETE FROM reviews WHERE save_id = ?', [saveId]);
    const reviewMonsters = await db.all('SELECT id, name FROM monsters ORDER BY id ASC LIMIT 3');
    for (const monster of reviewMonsters) {
      await db.run(
        `
          INSERT INTO reviews (save_id, monster_id, monster_name, satisfaction, review_text, coins, used_gift)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [saveId, monster.id, monster.name, 92, `${monster.name}觉得这杯饮品非常适合今天的心情。`, 45, 0]
      );
    }
  } finally {
    db.close();
  }
  return saveId;
}

async function capture(browser, saveId, pagePath, fileName, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  await context.addInitScript((id) => {
    localStorage.setItem('monsterCafeSelectedSave', String(id));
    localStorage.setItem('monsterCafePlayerName', '报告演示');
    sessionStorage.setItem('monsterCafeSkipReturnTitleConfirm', '1');
  }, saveId);
  const page = await context.newPage();
  const targetPath = path.join(outputDir, fileName);
  try {
    if (options.beforeNavigate) {
      await page.goto(`${baseUrl}/start.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(options.beforeNavigate, options.beforeArg || {});
    }
    await page.goto(`${baseUrl}/${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(options.waitMs || 1800);
    if (options.afterLoad) {
      await page.evaluate(options.afterLoad);
      await page.waitForTimeout(options.afterWaitMs || 800);
    }
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), Number(options.scrollY || 0));
    await page.screenshot({ path: targetPath, fullPage: false });
  } finally {
    await context.close();
  }
  return targetPath;
}

async function main() {
  ensureDir(outputDir);

  const server = spawn(process.execPath, ['backend/server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(serverPort) },
    stdio: 'ignore',
    windowsHide: true
  });
  let browser;
  try {
    await waitForUrl(`${baseUrl}/api/health`);
    const saveId = await prepareDemoSave();
    browser = await chromium.launch({
      executablePath: edgePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-features=Vulkan,DefaultANGLEVulkan,DawnGraphite,UseSkiaRenderer'
      ]
    });

    const restockState = JSON.stringify({
      mode: 'restocking',
      remainingSeconds: 72,
      customerWaitSeconds: 18,
      dayEnded: false,
      dayStarted: true,
      customerBuffSatisfaction: 0,
      gummyStarBonus: 0,
      futureHintCount: 0,
      dayStats: {
        customersServed: 2,
        totalIncome: 90,
        totalIngredientCost: 24,
        totalSatisfaction: 174,
        totalXp: 40,
        badReviews: 0,
        departedCustomers: 0,
        reviews: [],
        targetCustomers: 5
      },
      currentCustomer: null,
      currentOrderDescription: '',
      currentRequestedTasteTags: [],
      currentDrinkIngredientIds: []
    });

    const screenshots = [];
    screenshots.push(await capture(browser, saveId, 'start.html', '01_start.png', { waitMs: 1000 }));
    screenshots.push(await capture(browser, saveId, 'start.html', '02_exit_game_modal.png', {
      waitMs: 1000,
      afterLoad: async () => {
        document.querySelector('[data-open-exit-game]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'saves.html', '02_saves.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'saves.html', '03_new_save_modal.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-open-new-save]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'saves.html', '04_delete_save_modal.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-delete-save]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'index.html', '03_home.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'index.html', '05_loading_overlay.png', {
      waitMs: 2600,
      afterLoad: async () => {
        const overlay = document.createElement('div');
        overlay.className = 'page-loading';
        overlay.innerHTML = `
          <div class="loading-card" role="status">
            <style>
              .report-pudding {
                width: 44px;
                height: 36px;
                display: inline-block;
                margin: 0 8px;
                border: 4px solid #32183f;
                border-radius: 10px 10px 14px 14px;
                background: linear-gradient(#ffcf61 0 34%, #fff2b2 34% 100%);
                box-shadow: 4px 4px 0 rgba(50, 24, 63, 0.22);
                animation: puddingPulse 1s ease-in-out infinite;
              }
              .report-pudding:nth-child(2) { animation-delay: .18s; }
              .report-pudding:nth-child(3) { animation-delay: .36s; }
              @keyframes puddingPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.2); }
              }
            </style>
            <div class="pudding-row" aria-hidden="true">
              <span class="report-pudding"></span>
              <span class="report-pudding"></span>
              <span class="report-pudding"></span>
            </div>
            <div class="loading-track"><div class="loading-fill" style="width: 72%"></div></div>
            <p>和怪兽打好关系，可能会有意想不到的惊喜喔～</p>
          </div>
        `;
        document.body.appendChild(overlay);
      }
    }));
    screenshots.push(await capture(browser, saveId, 'index.html', '06_tutorial_choice_modal.png', {
      waitMs: 2600,
      beforeNavigate: () => {
        localStorage.setItem('monsterCafePendingTutorialChoice', '1');
      }
    }));
    screenshots.push(await capture(browser, saveId, 'index.html', '07_home_tutorial_guide.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-tutorial-modal]')?.setAttribute('hidden', '');
        if (typeof startHomeTutorialGuide === 'function') {
          startHomeTutorialGuide();
        }
      }
    }));
    screenshots.push(await capture(browser, saveId, 'index.html', '08_return_title_modal.png', {
      waitMs: 2600,
      afterLoad: async () => {
        sessionStorage.removeItem('monsterCafeSkipReturnTitleConfirm');
        document.querySelector('[data-return-title]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '09_game_countdown.png', { waitMs: 900 }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '04_game_customer.png', { waitMs: 5200 }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=tutorial', '10_game_tutorial_guide.png', { waitMs: 5200 }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '05_game_result.png', {
      waitMs: 5200,
      afterLoad: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        [...document.querySelectorAll('[data-add-ingredient]:not([disabled])')].slice(0, 3).forEach((button) => button.click());
        await new Promise((resolve) => setTimeout(resolve, 300));
        document.querySelector('[data-make-drink-button]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '06_pause.png', {
      waitMs: 5200,
      afterLoad: async () => {
        document.querySelector('[data-pause-button]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '11_exit_day_confirm.png', {
      waitMs: 5200,
      afterLoad: async () => {
        document.querySelector('[data-pause-button]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        document.querySelector('[data-exit-day-button]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'game.html?mode=new', '12_day_settlement_modal.png', {
      waitMs: 5200,
      afterLoad: async () => {
        if (typeof renderDayModal === 'function') {
          renderDayModal({
            day_number: 8,
            summary: {
              customers_served: 5,
              bad_reviews: 0,
              total_income: 238,
              total_ingredient_cost: 54,
              profit: 184,
              avg_satisfaction: 91,
              profit_stars: 5,
              customer_stars: 4,
              satisfaction_stars: 5,
              overall_stars: 5,
              xp_gained: 110,
              coin_bonus: 50
            },
            achievements: [
              { title: '五星营业日', description: '获得一次五星结算', reward_coins: 80, reward_xp: 40 }
            ]
          });
        }
      }
    }));
    screenshots.push(await capture(browser, saveId, 'shop.html', '07_shop.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'shop.html?restock=1', '08_restock_shop.png', {
      waitMs: 2600,
      beforeNavigate: (state) => {
        localStorage.setItem('monsterCafeGameState:1', state);
      },
      beforeArg: restockState
    }));
    screenshots.push(await capture(browser, saveId, 'collection.html', '09_collection.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'collection.html', '15_collection_detail.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-monster-detail]')?.click();
      }
    }));
    screenshots.push(await capture(browser, saveId, 'collection.html', '16_story_reward_popup.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-monster-detail]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        document.querySelector('[data-read-story]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'achievements.html', '10_achievements.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'achievements.html', '17_achievement_reward_popup.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-achievement-id]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'level-rewards.html', '11_level_rewards.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'level-rewards.html', '18_level_reward_popup.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-level-reward-id]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'backpack.html', '12_backpack.png', {
      waitMs: 2600,
      afterLoad: async () => {
        document.querySelector('[data-backpack-list] article, [data-backpack-list] button')?.click();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }));
    screenshots.push(await capture(browser, saveId, 'logs.html', '13_logs_form.png', { waitMs: 2600 }));
    screenshots.push(await capture(browser, saveId, 'logs.html', '14_logs_list.png', { waitMs: 2600, scrollY: 720 }));

    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({
      saveId,
      baseUrl,
      screenshots
    }, null, 2), 'utf8');
    console.log(`已生成 ${screenshots.length} 张截图。`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
