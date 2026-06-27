const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'monster_cafe.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('连接 SQLite 数据库失败：', error.message);
    return;
  }

  console.log(`SQLite 数据库已连接：${dbPath}`);
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

async function getColumnNames(tableName) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.map((column) => column.name);
}

async function ensureColumn(tableName, columnName, columnSql) {
  const columns = await getColumnNames(tableName);
  if (!columns.includes(columnName)) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
}

async function initDatabase() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '咖啡馆老板',
      coins INTEGER NOT NULL DEFAULT 500,
      business_days INTEGER NOT NULL DEFAULT 0,
      shop_level INTEGER NOT NULL DEFAULT 1,
      total_satisfaction INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monsters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      species TEXT NOT NULL,
      liked_taste TEXT NOT NULL,
      disliked_taste TEXT NOT NULL,
      description TEXT NOT NULL,
      dialogue TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      taste_tags TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      price INTEGER NOT NULL DEFAULT 10,
      unlocked INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monster_id INTEGER NOT NULL,
      request_text TEXT NOT NULL,
      selected_ingredients TEXT NOT NULL,
      satisfaction INTEGER NOT NULL,
      coin_reward INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monster_id INTEGER NOT NULL UNIQUE,
      visit_count INTEGER NOT NULL DEFAULT 0,
      best_satisfaction INTEGER NOT NULL DEFAULT 0,
      unlocked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dev_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      ai_summary TEXT NOT NULL,
      manual_change TEXT NOT NULL,
      run_result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS day_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_number INTEGER NOT NULL,
      customers_served INTEGER NOT NULL DEFAULT 0,
      total_income INTEGER NOT NULL DEFAULT 0,
      total_ingredient_cost INTEGER NOT NULL DEFAULT 0,
      profit INTEGER NOT NULL DEFAULT 0,
      avg_satisfaction INTEGER NOT NULL DEFAULT 0,
      profit_stars INTEGER NOT NULL DEFAULT 0,
      customer_stars INTEGER NOT NULL DEFAULT 0,
      satisfaction_stars INTEGER NOT NULL DEFAULT 0,
      overall_stars INTEGER NOT NULL DEFAULT 0,
      xp_gained INTEGER NOT NULL DEFAULT 0,
      coin_bonus INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward_coins INTEGER NOT NULL DEFAULT 0,
      reward_xp INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS player_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      achievement_id INTEGER NOT NULL UNIQUE,
      unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_name TEXT NOT NULL DEFAULT '一号存档',
      player_id INTEGER NOT NULL DEFAULT 1,
      coins INTEGER NOT NULL DEFAULT 500,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      business_days INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monster_affinity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL DEFAULT 1,
      monster_id INTEGER NOT NULL,
      affinity INTEGER NOT NULL DEFAULT 0,
      relationship_level TEXT NOT NULL DEFAULT '陌生',
      read_stories TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(save_id, monster_id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monster_id INTEGER NOT NULL,
      gift_name TEXT NOT NULL,
      effect_description TEXT NOT NULL,
      satisfaction_bonus INTEGER NOT NULL DEFAULT 20,
      tip_min REAL NOT NULL DEFAULT 0.2,
      tip_max REAL NOT NULL DEFAULT 0.5,
      UNIQUE(monster_id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS player_gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL DEFAULT 1,
      monster_id INTEGER NOT NULL,
      gift_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(save_id, gift_id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id),
      FOREIGN KEY (gift_id) REFERENCES gifts(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS level_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level INTEGER NOT NULL UNIQUE,
      unlock_content TEXT NOT NULL,
      reward_content TEXT NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL DEFAULT 1,
      monster_id INTEGER,
      monster_name TEXT NOT NULL,
      satisfaction INTEGER NOT NULL DEFAULT 0,
      review_text TEXT NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0,
      used_gift INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS save_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      unlocked INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(save_id, ingredient_id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS save_collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      monster_id INTEGER NOT NULL,
      visit_count INTEGER NOT NULL DEFAULT 0,
      best_satisfaction INTEGER NOT NULL DEFAULT 0,
      unlocked INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(save_id, monster_id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS save_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      achievement_id INTEGER NOT NULL,
      current_progress INTEGER NOT NULL DEFAULT 0,
      target_progress INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      claimed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      claimed_at TEXT,
      UNIQUE(save_id, achievement_id),
      FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS backpack_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon_text TEXT NOT NULL DEFAULT '?'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS save_backpack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(save_id, item_id),
      FOREIGN KEY (item_id) REFERENCES backpack_items(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS save_level_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER NOT NULL,
      level_reward_id INTEGER NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT,
      UNIQUE(save_id, level_reward_id),
      FOREIGN KEY (level_reward_id) REFERENCES level_rewards(id)
    )
  `);

  await migrateOldSkeletonTables();
  await seedInitialData();
}

async function migrateOldSkeletonTables() {
  await ensureColumn('players', 'business_days', 'business_days INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('players', 'shop_level', 'shop_level INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('players', 'total_satisfaction', 'total_satisfaction INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('players', 'xp', 'xp INTEGER NOT NULL DEFAULT 0');

  const playerColumns = await getColumnNames('players');
  if (playerColumns.includes('day')) {
    await run('UPDATE players SET business_days = day WHERE business_days IS NULL OR business_days = 1');
  }
  await run("UPDATE players SET name = '咖啡馆老板' WHERE name = 'Cafe Owner'");

  await ensureColumn('monsters', 'species', "species TEXT NOT NULL DEFAULT '小怪兽'");
  await ensureColumn('monsters', 'liked_taste', "liked_taste TEXT NOT NULL DEFAULT '甜味'");
  await ensureColumn('monsters', 'disliked_taste', "disliked_taste TEXT NOT NULL DEFAULT '苦味'");
  await ensureColumn('monsters', 'dialogue', "dialogue TEXT NOT NULL DEFAULT '老板，今天也请给我一杯好喝的饮品！'");
  await ensureColumn('monsters', 'tag', "tag TEXT NOT NULL DEFAULT '普通顾客'");
  await ensureColumn('monsters', 'unlock_level', 'unlock_level INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('monsters', 'is_special', 'is_special INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('monsters', 'appearance_rate', 'appearance_rate REAL NOT NULL DEFAULT 1');
  await ensureColumn('monsters', 'special_effect', "special_effect TEXT NOT NULL DEFAULT ''");

  await ensureColumn('ingredients', 'taste_tags', "taste_tags TEXT NOT NULL DEFAULT '甜味'");
  await ensureColumn('ingredients', 'unlocked', 'unlocked INTEGER NOT NULL DEFAULT 1');

  await ensureColumn('orders', 'request_text', "request_text TEXT NOT NULL DEFAULT '想喝一杯符合口味的饮品。'");
  await ensureColumn('orders', 'selected_ingredients', "selected_ingredients TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('orders', 'coin_reward', 'coin_reward INTEGER NOT NULL DEFAULT 0');

  await ensureColumn('dev_logs', 'prompt', "prompt TEXT NOT NULL DEFAULT '初始化项目'");
  await ensureColumn('dev_logs', 'ai_summary', "ai_summary TEXT NOT NULL DEFAULT '创建项目基础结构'");
  await ensureColumn('dev_logs', 'manual_change', "manual_change TEXT NOT NULL DEFAULT '暂无'");
  await ensureColumn('dev_logs', 'run_result', "run_result TEXT NOT NULL DEFAULT '可运行'");

  const devLogColumns = await getColumnNames('dev_logs');
  if (devLogColumns.includes('title')) {
    await run("UPDATE dev_logs SET title = COALESCE(NULLIF(title, ''), substr(prompt, 1, 40), '开发日志') WHERE title IS NULL OR title = ''");
  }
  if (devLogColumns.includes('content')) {
    await run("UPDATE dev_logs SET content = COALESCE(NULLIF(content, ''), prompt || char(10) || ai_summary || char(10) || manual_change || char(10) || run_result, '开发日志内容') WHERE content IS NULL OR content = ''");
  }
  if (devLogColumns.includes('summary')) {
    await run("UPDATE dev_logs SET summary = COALESCE(NULLIF(summary, ''), ai_summary, '暂无摘要') WHERE summary IS NULL OR summary = ''");
  }

  await ensureColumn('achievements', 'category', "category TEXT NOT NULL DEFAULT '经营'");
  await ensureColumn('achievements', 'reward_type', "reward_type TEXT NOT NULL DEFAULT 'coins_xp'");
  await ensureColumn('achievements', 'reward_content', "reward_content TEXT NOT NULL DEFAULT ''");
  await ensureColumn('achievements', 'hidden', 'hidden INTEGER NOT NULL DEFAULT 0');

  await ensureColumn('player_achievements', 'save_id', 'save_id INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('player_achievements', 'current_progress', 'current_progress INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('player_achievements', 'completed', 'completed INTEGER NOT NULL DEFAULT 1');

  await ensureColumn('saves', 'tutorial_prompted', 'tutorial_prompted INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('saves', 'tutorial_completed', 'tutorial_completed INTEGER NOT NULL DEFAULT 0');
}

async function seedInitialData() {
  const player = await get('SELECT id FROM players LIMIT 1');
  if (!player) {
    await run(
      'INSERT INTO players (name, coins, business_days, shop_level, total_satisfaction) VALUES (?, ?, ?, ?, ?)',
      ['咖啡馆老板', 500, 0, 1, 0]
    );
  }

  await seedIngredients();
  await seedMonsters();
  await seedCollection();
  await seedSaves();
  await seedAffinityAndGifts();
  await seedLevelRewards();
  await seedAchievements();
  await seedBackpackItems();
  await seedSaveScopedData();
  await seedDevLogs();
}

async function seedIngredients() {
  const columns = await getColumnNames('ingredients');
  const hasLegacyTag = columns.includes('tag');

  await run(`
    DELETE FROM ingredients
    WHERE name IN ('Moon Milk', 'Star Sugar', 'Ember Cocoa', 'Mint Slime')
  `);

  const ingredients = [
    ['月光牛奶', '奶,甜', 8, 12, 1, '带着淡淡月光香气的牛奶，适合制作温柔甜饮。'],
    ['星星糖霜', '甜,星光', 10, 8, 1, '入口会轻轻发亮的糖霜，是甜味饮品的常用原料。'],
    ['熔岩可可', '热,苦', 6, 15, 1, '暖呼呼的可可粉，适合喜欢热饮和微苦风味的顾客。'],
    ['薄荷冰晶', '冰,气泡', 7, 10, 1, '冰凉的薄荷晶块，放进杯中会冒出细小气泡。'],
    ['云朵奶油', '奶,甜', 5, 14, 1, '像云朵一样轻盈的奶油，能让饮品变得柔软顺滑。'],
    ['黑曜咖啡豆', '苦,热', 6, 13, 1, '烘得很深的咖啡豆，苦味清晰，香气沉稳。'],
    ['泡泡泉水', '气泡,冰', 8, 11, 1, '来自怪兽山谷的泉水，倒进杯子会咕噜咕噜冒泡。'],
    ['星光果冻', '星光,甜', 6, 16, 1, '会发出小小光点的果冻，是夜晚限定风味。'],
    ['火椒糖浆', '辣,热', 5, 18, 1, '入口微甜，回味带一点小火花般的辣。'],
    ['苦瓜霜粉', '苦,冰', 5, 12, 1, '冰冰凉凉的苦味粉末，适合成熟口味的顾客。']
  ];

  for (const item of ingredients) {
    if (hasLegacyTag) {
      await run(
        'INSERT OR IGNORE INTO ingredients (name, tag, taste_tags, stock, price, unlocked, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item[0], item[1], item[1], item[2], item[3], item[4], item[5]]
      );
      await run(
        'UPDATE ingredients SET tag = ?, taste_tags = ?, price = ?, description = ? WHERE name = ?',
        [item[1], item[1], item[3], item[5], item[0]]
      );
    } else {
      await run(
        'INSERT OR IGNORE INTO ingredients (name, taste_tags, stock, price, unlocked, description) VALUES (?, ?, ?, ?, ?, ?)',
        item
      );
      await run(
        'UPDATE ingredients SET taste_tags = ?, price = ?, description = ? WHERE name = ?',
        [item[1], item[3], item[5], item[0]]
      );
    }
  }

}

async function seedMonsters() {
  const columns = await getColumnNames('monsters');
  const hasLegacyPreferenceTag = columns.includes('preference_tag');
  const hasLegacyFavoriteDrink = columns.includes('favorite_drink');
  const hasLegacyUnlocked = columns.includes('unlocked');

  const monsters = [
    ['Momo', '圆滚滚兽', '甜', '苦', '总是抱着小杯子的圆滚滚小怪兽，喜欢甜甜的饮品。', '老板，我想要一杯甜甜的，喝完会开心转圈的那种！'],
    ['Brulo', '小火苗兽', '热', '冰', '害羞的小火苗怪兽，靠热饮维持明亮火光。', '请给我一杯暖暖的饮品，太冰的话我的火苗会打喷嚏。'],
    ['Lili', '叶芽兽', '冰', '苦', '头顶长着小叶子的顾客，偏爱轻盈清爽的味道。', '今天想喝清清爽爽的饮品，最好像晨风一样轻。'],
    ['Nana', '云朵兽', '奶', '辣', '睡眼惺忪的云朵小怪兽，喜欢柔软顺滑的口感。', '我想要软绵绵的口感，喝完就能继续打起精神。'],
    ['Bibi', '泡泡兽', '气泡', '苦', '肚子里总是咕噜咕噜冒泡的小怪兽，喜欢热闹的口感。', '老板，可以给我一杯会在杯子里跳舞的饮品吗？'],
    ['Kuro', '影角兽', '苦', '甜', '披着小斗篷的影角兽，觉得微苦的饮品最有精神。', '今天想喝成熟一点的味道，不要太甜哦。'],
    ['Stella', '星尘兽', '星光', '辣', '尾巴会洒下亮晶晶星尘的夜行顾客。', '我想要一杯像夜空一样闪闪发亮的饮品。'],
    ['Pipi', '小辣椒兽', '辣', '奶', '精力旺盛的小辣椒兽，喜欢带一点刺激感的特调。', '来一杯有小火花的饮品吧，越精神越好！'],
    ['Gulu', '冰牙兽', '冰', '热', '来自雪柜山的小怪兽，最喜欢冰凉口感。', '请给我一杯冰冰的饮品，最好能让我打个冷嗝。'],
    ['Mira', '奶油蘑菇兽', '奶', '苦', '软乎乎的蘑菇兽，喜欢奶香和绵密泡沫。', '今天想喝一杯奶香浓浓、温柔一点的饮品。']
  ];

  for (const item of monsters) {
    if (hasLegacyPreferenceTag || hasLegacyFavoriteDrink || hasLegacyUnlocked) {
      const insertColumns = ['name', 'species', 'liked_taste', 'disliked_taste', 'description', 'dialogue'];
      const insertValues = [...item];

      if (hasLegacyPreferenceTag) {
        insertColumns.push('preference_tag');
        insertValues.push(item[2]);
      }
      if (hasLegacyFavoriteDrink) {
        insertColumns.push('favorite_drink');
        insertValues.push('待发现');
      }
      if (hasLegacyUnlocked) {
        insertColumns.push('unlocked');
        insertValues.push(['Momo', 'Brulo'].includes(item[0]) ? 1 : 0);
      }

      const placeholders = insertColumns.map(() => '?').join(', ');
      await run(
        `INSERT OR IGNORE INTO monsters (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        insertValues
      );
    } else {
      await run(
        'INSERT OR IGNORE INTO monsters (name, species, liked_taste, disliked_taste, description, dialogue) VALUES (?, ?, ?, ?, ?, ?)',
        item
      );
    }

    await run(
      'UPDATE monsters SET species = ?, liked_taste = ?, disliked_taste = ?, description = ?, dialogue = ? WHERE name = ?',
      [item[1], item[2], item[3], item[4], item[5], item[0]]
    );
  }

  const specialMonsters = [
    ['金色虾球', '闪金币虾球', '甜,星光,奶', '苦,辣', '传说中喜欢收集闪亮金币的龙虾球，只要喝到满意的饮品，就会付出远超常人的小费。', '老板，钱不是问题，我只要一杯能闪闪发光的饮品！', '一掷千金', 5, 0.08, '饮品金币价值变为 300%'],
    ['小熊软糖', '春风软糖熊', '奶,甜,热,星光', '辣,苦', '带来温柔气息的可爱小熊，它来过之后，整间咖啡馆都会变得更加甜蜜。', '这里的气味很温柔，我想喝一杯像春风一样的饮品。', '如沐春风', 10, 0.06, '服务成功后当天后续顾客满意度 +5，结算满意度星级 +0.5'],
    ['飞盘小狗', '慢时钟小狗', '热,奶,苦', '气泡,冰', '叼着时钟当飞盘的小狗，是不是叼错了啊喂！', '不用急，慢慢来，时间会等一等好喝的饮品。', '慢悠悠', 12, 0.05, '服务成功后当天剩余工作时间 +25 秒'],
    ['命运占星师', '星盘占卜兽', '星光,苦,气泡', '甜,辣', '会用星星占卜饮品味道的神秘怪兽，总能提前知道下一位顾客想喝什么。', '我看见了杯中的星河，也看见了下一位顾客的愿望。', '预见未来', 15, 0.04, '服务成功后接下来 3 位顾客显示一个口味提示']
  ];

  for (const item of specialMonsters) {
    const insertColumns = [
      'name',
      'species',
      'liked_taste',
      'disliked_taste',
      'description',
      'dialogue',
      'tag',
      'unlock_level',
      'is_special',
      'appearance_rate',
      'special_effect'
    ];
    const insertValues = [item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], 1, item[8], item[9]];

    if (hasLegacyPreferenceTag) {
      insertColumns.push('preference_tag');
      insertValues.push(item[2]);
    }
    if (hasLegacyFavoriteDrink) {
      insertColumns.push('favorite_drink');
      insertValues.push('特殊饮品');
    }
    if (hasLegacyUnlocked) {
      insertColumns.push('unlocked');
      insertValues.push(0);
    }

    await run(
      `INSERT OR IGNORE INTO monsters (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertValues
    );
    await run(
      `
        UPDATE monsters
        SET
          species = ?,
          liked_taste = ?,
          disliked_taste = ?,
          description = ?,
          dialogue = ?,
          tag = ?,
          unlock_level = ?,
          is_special = 1,
          appearance_rate = ?,
          special_effect = ?
        WHERE name = ?
      `,
      [item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9], item[0]]
    );
  }
}

async function seedCollection() {
  const monsters = await all('SELECT id, name FROM monsters ORDER BY id ASC');

  for (const monster of monsters) {
    await run(
      'INSERT OR IGNORE INTO collection (monster_id, visit_count, best_satisfaction, unlocked) VALUES (?, ?, ?, ?)',
      [monster.id, 0, 0, 0]
    );
  }
}

async function seedSaves() {
  const saveCount = await get('SELECT COUNT(*) AS total FROM saves');
  if (!saveCount || Number(saveCount.total || 0) === 0) {
    return;
  }

  await run("UPDATE saves SET business_days = 0 WHERE business_days < 0");
}

async function seedAffinityAndGifts() {
  const monsters = await all('SELECT id, name FROM monsters ORDER BY id ASC');
  const giftMap = {
    Momo: ['糖心铃铛', '摇起来会让甜味更圆润，饮品满意度 +20'],
    Brulo: ['温凉火种', '让火焰变得柔和，饮品满意度 +20'],
    Lili: ['晨风叶片', '带着清晨香气的小叶片，饮品满意度 +20'],
    Nana: ['云朵围巾', '摸起来像奶泡一样柔软，饮品满意度 +20'],
    Bibi: ['泡泡徽章', '会让杯中气泡跳得更开心，饮品满意度 +20'],
    Kuro: ['黑森林孢子瓶', '收藏着神秘森林气息的小瓶子，饮品满意度 +20'],
    Stella: ['星尾铃铛', '摇动时会发出星光声响，饮品满意度 +20'],
    Pipi: ['南瓜恶作剧徽章', '会让饮品多一点惊喜口感，饮品满意度 +20'],
    Gulu: ['极地冰晶', '永远不会融化的小冰晶，饮品满意度 +20'],
    Mira: ['月羽书签', '带有月光香气的羽毛书签，饮品满意度 +20'],
    金色虾球: ['金光钱袋', '使用后满意度 +20，并额外增加小费概率'],
    小熊软糖: ['春芽护符', '使用后满意度 +20，并让咖啡馆更温柔'],
    飞盘小狗: ['慢时钟发条', '使用后满意度 +20，并让时间慢一点'],
    命运占星师: ['星盘碎片', '使用后满意度 +20，并显示下一位顾客提示']
  };

  for (const monster of monsters) {
    await run(
      'INSERT OR IGNORE INTO monster_affinity (save_id, monster_id, affinity, relationship_level) VALUES (1, ?, 0, ?)',
      [monster.id, '陌生']
    );

    const gift = giftMap[monster.name] || [`${monster.name}的纪念贴纸`, '只对这位怪兽生效，饮品满意度 +20'];
    await run(
      `
        INSERT OR IGNORE INTO gifts (monster_id, gift_name, effect_description, satisfaction_bonus, tip_min, tip_max)
        VALUES (?, ?, ?, 20, 0.2, 0.5)
      `,
      [monster.id, gift[0], gift[1]]
    );
  }
}

async function seedLevelRewards() {
  const rewards = [
    [1, '初始营业', '金币 100，基础原料各 5'],
    [2, '解锁商店', '金币 80，糖浆 +3'],
    [3, '解锁怪兽图鉴详情', '冰块 +5，牛奶 +5'],
    [4, '解锁评价便签墙', '金币 120'],
    [5, '解锁特殊顾客：金色虾球', '金币 150，星光粉末 +3'],
    [6, '解锁新原料：月光奶油', '月光奶油 +5'],
    [7, '解锁新顾客：幽灵布丁', '魔法泡泡 +5'],
    [8, '解锁成就奖励展示', '金币 180'],
    [9, '解锁新原料：薄荷霜晶', '薄荷霜晶 +4'],
    [10, '解锁特殊顾客：小熊软糖', '金币 250，随机稀有原料 +3'],
    [11, '解锁顾客故事系统', '咖啡豆 +8'],
    [12, '解锁特殊顾客：飞盘小狗', '金币 300'],
    [13, '解锁饮品命名系统', '任意原料补货券 ×1'],
    [14, '解锁高级订单提示', '星光粉末 +5'],
    [15, '解锁特殊顾客：命运占星师', '金币 500，稀有礼物券 ×1']
  ];

  for (const reward of rewards) {
    await run(
      'INSERT OR IGNORE INTO level_rewards (level, unlock_content, reward_content) VALUES (?, ?, ?)',
      reward
    );
    await run(
      'UPDATE level_rewards SET unlock_content = ?, reward_content = ? WHERE level = ?',
      [reward[1], reward[2], reward[0]]
    );
  }
}

async function seedAchievements() {
  const achievements = [
    ['first_day', '初次营业', '完成第 1 天营业。', 100, 0, '经营类', '金币 +100'],
    ['three_days', '小店开张', '累计完成 3 天营业。', 0, 50, '经营类', '经验 +50'],
    ['five_customers', '忙碌柜台', '一天内服务至少 5 位顾客。', 25, 30, '经营类', '金币 +25 / 经验 +30'],
    ['no_bad_review_day', '今日无差评', '当天没有任何差评。', 100, 30, '经营类', '经验 +30，金币 +100'],
    ['five_star_day', '五星营业日', '日结算综合评分达到五星。', 250, 0, '经营类', '金币 +250，随机礼物券 ×1'],
    ['first_drink', '第一杯魔法饮品', '第一次成功制作饮品。', 0, 20, '饮品制作类', '经验 +20'],
    ['perfect_drink', '完美调配师', '第一次做出 100 满意度饮品。', 0, 0, '饮品制作类', '星光粉末 +5'],
    ['over_full_score', '超越满分', '第一次做出 120 满意度饮品。', 0, 0, '饮品制作类', '稀有礼物券 ×1'],
    ['stable_five', '稳定发挥', '连续 5 杯满意度不低于 70。', 120, 0, '饮品制作类', '金币 +120'],
    ['monster_friends', '怪兽朋友', '解锁 3 个怪兽图鉴。', 0, 40, '顾客图鉴类', '经验 +40'],
    ['rare_guest', '稀客来访', '第一次遇到特殊顾客。', 200, 0, '顾客图鉴类', '金币 +200'],
    ['gold_shrimp', '一掷千金', '服务金色虾球并满意度不低于 90。', 500, 0, '顾客图鉴类', '金币 +500'],
    ['first_affinity_100', '第一次被记住', '任意怪兽好感达到 100。', 0, 0, '好感度类', '对应怪兽礼物 ×1'],
    ['old_friend', '老朋友', '任意怪兽好感达到 500。', 0, 0, '好感度类', '解锁该怪兽特殊头像框'],
    ['gift_user', '心意满满', '使用礼物制作 10 杯饮品。', 250, 0, '好感度类', '金币 +250'],
    ['quick_drink', '手速不错', '在 10 秒内完成一杯满意度不低于 80 的饮品。', 0, 50, '时间操作类', '经验 +50'],
    ['last_second', '极限出杯', '在最后 3 秒完成一杯满意度不低于 80 的饮品。', 200, 0, '时间操作类', '金币 +200'],
    ['calm_owner', '冷静老板', '顾客心情下降后仍做出不低于 90 满意度。', 0, 0, '时间操作类', '稀有原料 +3'],
    ['level_2', '小有名气', '店铺等级达到 2 级。', 40, 40, '等级类', '金币 +40 / 经验 +40'],
    ['profit_100', '金币叮当响', '单日利润达到 100 金币。', 60, 50, '经营类', '金币 +60 / 经验 +50']
  ];

  for (const item of achievements) {
    await run(
      'INSERT OR IGNORE INTO achievements (code, title, description, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?)',
      [item[0], item[1], item[2], item[3], item[4]]
    );
    await run(
      `
        UPDATE achievements
        SET
          title = ?,
          description = ?,
          reward_coins = ?,
          reward_xp = ?,
          category = ?,
          reward_content = ?
        WHERE code = ?
      `,
      [item[1], item[2], item[3], item[4], item[5], item[6], item[0]]
    );
  }
}

async function seedBackpackItems() {
  const ingredients = await all('SELECT id, name, description FROM ingredients ORDER BY id ASC');
  for (const ingredient of ingredients) {
    await run(
      `
        INSERT OR IGNORE INTO backpack_items (code, name, description, icon_text)
        VALUES (?, ?, ?, ?)
      `,
      [`ingredient_${ingredient.id}`, ingredient.name, ingredient.description || '可用于调配饮品的原料。', ingredient.name.slice(0, 1)]
    );
    await run(
      'UPDATE backpack_items SET name = ?, description = ?, icon_text = ? WHERE code = ?',
      [ingredient.name, ingredient.description || '可用于调配饮品的原料。', ingredient.name.slice(0, 1), `ingredient_${ingredient.id}`]
    );
  }

  const gifts = await all('SELECT id, gift_name, effect_description FROM gifts ORDER BY id ASC');
  for (const gift of gifts) {
    await run(
      `
        INSERT OR IGNORE INTO backpack_items (code, name, description, icon_text)
        VALUES (?, ?, ?, ?)
      `,
      [`gift_${gift.id}`, gift.gift_name, gift.effect_description || '怪兽专属礼物。', gift.gift_name.slice(0, 1)]
    );
  }
}

async function seedSaveScopedData() {
  const saves = await all('SELECT id FROM saves ORDER BY id ASC');
  const ingredients = await all('SELECT id, unlocked FROM ingredients ORDER BY id ASC');
  const monsters = await all('SELECT id, name FROM monsters ORDER BY id ASC');
  const achievements = await all('SELECT id, code FROM achievements ORDER BY id ASC');

  const targetMap = {
    three_days: 3,
    five_customers: 5,
    stable_five: 5,
    monster_friends: 3,
    gift_user: 10
  };

  for (const save of saves) {
    for (const ingredient of ingredients) {
      await run(
        `
          INSERT OR IGNORE INTO save_ingredients (save_id, ingredient_id, stock, unlocked)
          VALUES (?, ?, ?, ?)
        `,
        [save.id, ingredient.id, ingredient.unlocked ? 2 : 0, ingredient.unlocked ? 1 : 0]
      );
    }

    for (const monster of monsters) {
      await run(
        `
          INSERT OR IGNORE INTO save_collection (save_id, monster_id, visit_count, best_satisfaction, unlocked)
          VALUES (?, ?, ?, 0, ?)
        `,
        [save.id, monster.id, 0, 0]
      );
    }

    for (const achievement of achievements) {
      await run(
        `
          INSERT OR IGNORE INTO save_achievements (save_id, achievement_id, target_progress)
          VALUES (?, ?, ?)
        `,
        [save.id, achievement.id, targetMap[achievement.code] || 1]
      );
    }
  }
}

async function seedDevLogs() {
  const log = await get('SELECT id FROM dev_logs LIMIT 1');
  if (!log) {
    await run(
      `
        INSERT INTO dev_logs (prompt, ai_summary, manual_change, run_result)
        VALUES (?, ?, ?, ?)
      `,
      [
        '创建 Monster Café 项目骨架，并实现 SQLite 数据库。',
        '完成 Express 服务、静态页面托管、数据库初始化函数和默认数据。',
        '将页面展示文案改为中文，并保留 Monster Café 与怪兽名称。',
        '启动服务时会自动创建数据表并插入默认怪兽与原料。'
      ]
    );
  } else {
    await run(
      `
        UPDATE dev_logs
        SET
          prompt = COALESCE(NULLIF(prompt, ''), '创建 Monster Café 项目骨架，并实现 SQLite 数据库。'),
          ai_summary = COALESCE(NULLIF(ai_summary, ''), '完成 Express 服务、静态页面托管、数据库初始化函数和默认数据。'),
          manual_change = COALESCE(NULLIF(manual_change, ''), '将页面展示文案改为中文，并保留 Monster Café 与怪兽名称。'),
          run_result = COALESCE(NULLIF(run_result, ''), '启动服务时会自动创建数据表并插入默认怪兽与原料。')
      `
    );
  }

  await run(`
    UPDATE dev_logs
    SET
      prompt = REPLACE(prompt, 'Monster Cafe', 'Monster Café'),
      ai_summary = REPLACE(ai_summary, 'Monster Cafe', 'Monster Café'),
      manual_change = REPLACE(manual_change, 'Monster Cafe', 'Monster Café'),
      run_result = REPLACE(run_result, 'Monster Cafe', 'Monster Café')
  `);
}

module.exports = {
  db,
  initDatabase,
  run,
  all,
  get
};
