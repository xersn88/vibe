const express = require('express');
const { all, get, run } = require('../database');

const router = express.Router();

const SUPPORTED_TASTE_TAGS = ['甜', '苦', '冰', '热', '奶', '气泡', '星光', '辣'];

const TASTE_ALIASES = {
  甜味: '甜',
  甜: '甜',
  苦味: '苦',
  苦: '苦',
  冰凉: '冰',
  清爽: '冰',
  冰: '冰',
  温热: '热',
  暖: '热',
  热: '热',
  顺滑: '奶',
  奶香: '奶',
  奶: '奶',
  冒泡: '气泡',
  气泡: '气泡',
  闪亮: '星光',
  星光: '星光',
  辛辣: '辣',
  火辣: '辣',
  辣: '辣'
};

const TASTE_PHRASES = {
  甜: ['甜甜的', '像糖霜一样轻快的', '喝完会开心一点的'],
  苦: ['带一点成熟苦味的', '像深夜可可一样微苦的', '苦得很有精神的'],
  冰: ['冰冰的', '像晨雾一样清凉的', '喝起来凉丝丝的'],
  热: ['热乎乎的', '能把爪尖暖起来的', '冒着温柔热气的'],
  奶: ['奶香浓浓的', '口感软绵绵的', '像云朵一样顺滑的'],
  气泡: ['会冒泡的', '咕噜咕噜跳舞的', '有小气泡在杯子里转圈的'],
  星光: ['闪着星光的', '像夜空一样亮晶晶的', '会发出小小光点的'],
  辣: ['带一点辣味的', '喝完会精神一振的', '像小火花一样热烈的']
};

const ORDER_OPENINGS = [
  '我想要一杯',
  '老板，请给我一杯',
  '今天想喝一杯',
  '可以帮我调一杯'
];

const ORDER_ENDINGS = [
  '饮品。',
  '怪兽特调。',
  '小杯惊喜。',
  '招牌饮品。'
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function splitTasteTags(value) {
  return String(value || '')
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeTasteTag(value) {
  if (!value) {
    return '甜';
  }

  const rawTags = splitTasteTags(value);
  for (const rawTag of rawTags) {
    if (TASTE_ALIASES[rawTag]) {
      return TASTE_ALIASES[rawTag];
    }

    const matchedTag = SUPPORTED_TASTE_TAGS.find((tag) => rawTag.includes(tag));
    if (matchedTag) {
      return matchedTag;
    }
  }

  return '甜';
}

function normalizeTasteTags(value) {
  const tags = splitTasteTags(value)
    .map((tag) => TASTE_ALIASES[tag] || SUPPORTED_TASTE_TAGS.find((supported) => tag.includes(supported)))
    .filter(Boolean);

  return [...new Set(tags)];
}

function buildRecommendedTasteTags(monster) {
  const likedTags = normalizeTasteTags(monster.liked_taste);
  const dislikedTags = normalizeTasteTags(monster.disliked_taste);
  const likedTag = likedTags[0] || normalizeTasteTag(monster.liked_taste);
  const optionalTags = SUPPORTED_TASTE_TAGS.filter(
    (tag) => !likedTags.includes(tag) && !dislikedTags.includes(tag)
  );

  const recommendedTags = [likedTag];
  while (recommendedTags.length < 3 && optionalTags.length > 0) {
    const nextTag = pickRandom(optionalTags);
    if (!recommendedTags.includes(nextTag)) {
      recommendedTags.push(nextTag);
    }
    optionalTags.splice(optionalTags.indexOf(nextTag), 1);
  }

  return recommendedTags;
}

function getIngredientTasteTags(ingredient) {
  return normalizeTasteTags(ingredient.taste_tags || ingredient.tag);
}

function getSafeIngredientOptions(ingredients, dislikedTag, requireStock = true) {
  const dislikedTags = Array.isArray(dislikedTag) ? dislikedTag : [dislikedTag];
  return ingredients
    .map((ingredient) => ({
      ...ingredient,
      normalized_tags: getIngredientTasteTags(ingredient)
    }))
    .filter((ingredient) => (
      ingredient.unlocked &&
      (!requireStock || ingredient.stock > 0) &&
      !ingredient.normalized_tags.some((tag) => dislikedTags.includes(tag))
    ));
}

function canMonsterGetPerfectOrder(monster, ingredients) {
  const likedTags = normalizeTasteTags(monster.liked_taste);
  const dislikedTags = normalizeTasteTags(monster.disliked_taste);
  const safeIngredients = getSafeIngredientOptions(ingredients, dislikedTags, false);

  return safeIngredients.some((ingredient) => ingredient.normalized_tags.some((tag) => likedTags.includes(tag)));
}

function buildFeasibleTasteTags(monster, ingredients) {
  const likedTags = normalizeTasteTags(monster.liked_taste);
  const dislikedTags = normalizeTasteTags(monster.disliked_taste);
  const likedTag = likedTags[0] || normalizeTasteTag(monster.liked_taste);
  const safeIngredients = getSafeIngredientOptions(ingredients, dislikedTags, false);
  const likedIngredients = safeIngredients.filter((ingredient) => ingredient.normalized_tags.some((tag) => likedTags.includes(tag)));
  const selectedIngredients = [];

  if (likedIngredients.length > 0) {
    selectedIngredients.push(pickRandom(likedIngredients));
  }

  const remainingIngredients = safeIngredients.filter(
    (ingredient) => !selectedIngredients.some((selected) => selected.id === ingredient.id)
  );

  while (selectedIngredients.length < 3 && remainingIngredients.length > 0) {
    const nextIngredient = pickRandom(remainingIngredients);
    selectedIngredients.push(nextIngredient);
    remainingIngredients.splice(remainingIngredients.indexOf(nextIngredient), 1);
  }

  const possibleTags = [
    ...new Set(
      selectedIngredients
        .flatMap((ingredient) => ingredient.normalized_tags)
        .filter((tag) => !dislikedTags.includes(tag))
    )
  ];

  if (!possibleTags.includes(likedTag) && likedIngredients.length > 0) {
    possibleTags.unshift(likedTag);
  }

  const targetCount = Math.min(possibleTags.length, possibleTags.length >= 3 ? 3 : 2);
  const requiredTags = possibleTags.includes(likedTag) ? [likedTag] : [];
  const optionalTags = possibleTags.filter((tag) => tag !== likedTag);

  while (requiredTags.length < targetCount && optionalTags.length > 0) {
    const nextTag = pickRandom(optionalTags);
    requiredTags.push(nextTag);
    optionalTags.splice(optionalTags.indexOf(nextTag), 1);
  }

  if (requiredTags.length === 0) {
    return buildRecommendedTasteTags(monster);
  }

  return requiredTags;
}

function buildOrderDescription(recommendedTags) {
  const opening = pickRandom(ORDER_OPENINGS);
  const ending = pickRandom(ORDER_ENDINGS);
  const phraseParts = recommendedTags.map((tag) => pickRandom(TASTE_PHRASES[tag]));

  return `${opening}${phraseParts.join('、')}、很适合我的${ending}`;
}

function buildDrinkName(monster, ingredientTags) {
  const tags = [...new Set(ingredientTags)].slice(0, 3);
  if (tags.length === 0) {
    return `${monster.name}的空杯子`;
  }

  return `${monster.name}的${tags.join('')}特调`;
}

function buildFeedbackText(satisfaction, monster) {
  if (satisfaction >= 90) {
    return `${monster.name}开心得眼睛都亮了：“这杯太棒了，我要把它写进我的怪兽日记！”`;
  }
  if (satisfaction >= 70) {
    return `${monster.name}满意地点点头：“味道很接近我想要的感觉，老板真可靠！”`;
  }
  if (satisfaction >= 45) {
    return `${monster.name}捧着杯子想了想：“还不错，不过下次可以更贴近我的口味。”`;
  }
  if (satisfaction >= 20) {
    return `${monster.name}小声说：“谢谢老板，但这杯好像有一点偏离我的愿望。”`;
  }

  return `${monster.name}皱起小脸：“呜，这杯可能更适合别的怪兽。”`;
}

function calculateSatisfaction(monster, ingredients) {
  return calculateDrinkScore(monster, ingredients);
}

function calculateDrinkScore(monster, ingredients, requestedTasteTags = []) {
  const likedTags = normalizeTasteTags(monster.liked_taste);
  const dislikedTags = normalizeTasteTags(monster.disliked_taste);
  const likedTag = likedTags[0] || normalizeTasteTag(monster.liked_taste);
  const ingredientTags = ingredients.flatMap((ingredient) => getIngredientTasteTags(ingredient));
  const uniqueTags = [...new Set(ingredientTags)];
  const targetTags = requestedTasteTags.length > 0
    ? [...new Set(requestedTasteTags.map((tag) => normalizeTasteTag(tag)))]
    : [likedTag];
  const matchedTargetTags = targetTags.filter((tag) => uniqueTags.includes(tag));
  const likedHits = ingredientTags.filter((tag) => likedTags.includes(tag)).length;
  const dislikedHits = ingredientTags.filter((tag) => dislikedTags.includes(tag)).length;
  const coverageScore = targetTags.length > 0
    ? Math.round((matchedTargetTags.length / targetTags.length) * 65)
    : 0;
  const baseScore = 10;
  const likedBonus = uniqueTags.some((tag) => likedTags.includes(tag)) ? 8 : 0;
  const dislikedPenalty = dislikedHits * 25;
  const comboBonus = ingredients.length >= 1 && ingredients.length <= 3 ? 10 : 0;
  const diversityBonus = Math.min(Math.max(uniqueTags.length - targetTags.length, 0) * 2, 6);
  const noDislikedBonus = dislikedHits === 0 ? 15 : 0;
  const tooManyPenalty = ingredients.length > 3 ? (ingredients.length - 3) * 8 : 0;
  const rawScore = baseScore + coverageScore + likedBonus + comboBonus + diversityBonus + noDislikedBonus - dislikedPenalty - tooManyPenalty;

  return {
    satisfaction: clamp(rawScore, 0, 100),
    likedHits,
    dislikedHits,
    comboBonus,
    likedBonus,
    coverageScore,
    dislikedPenalty,
    diversityBonus,
    noDislikedBonus,
    tooManyPenalty,
    targetTags,
    matchedTargetTags,
    ingredientTags
  };
}

function getUnlockCost(ingredient) {
  return ingredient.price * 5;
}

function getStars(value, thresholds) {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value >= thresholds[index]) {
      return 5 - index;
    }
  }

  return value > 0 ? 1 : 0;
}

function calculateLevelFromXp(xp) {
  return Math.max(1, Math.floor(xp / 120) + 1);
}

function getDrinkXp(satisfaction) {
  if (satisfaction >= 101) return 30;
  if (satisfaction === 100) return 25;
  if (satisfaction >= 90) return 18;
  if (satisfaction >= 80) return 12;
  if (satisfaction >= 70) return 8;
  if (satisfaction >= 50) return 5;
  return 2;
}

function getMoodModifier(customerMood) {
  if (customerMood === 'happy') return 5;
  if (customerMood === 'impatient') return -8;
  if (customerMood === 'angry') return -15;
  return 0;
}

function getRelationshipLevel(affinity) {
  if (affinity >= 500) return '老朋友';
  if (affinity >= 400) return '挚友';
  if (affinity >= 300) return '信赖';
  if (affinity >= 200) return '友好';
  if (affinity >= 100) return '熟悉';
  return '陌生';
}

function getAffinityGain(satisfaction) {
  if (satisfaction <= 80) return 0;
  const base = satisfaction - 80;
  const extra = satisfaction > 100 ? Math.floor((satisfaction - 100) / 2) : 0;
  return Math.min(30, base + extra);
}

function getRequestSaveId(req) {
  const saveId = Number(req.headers['x-save-id'] || 1);
  return Number.isInteger(saveId) && saveId > 0 ? saveId : 1;
}

async function ensureSaveScopedData(saveId) {
  const save = await get('SELECT id FROM saves WHERE id = ?', [saveId]);
  if (!save) {
    return false;
  }

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

  for (const ingredient of ingredients) {
    await run(
      `
        INSERT OR IGNORE INTO save_ingredients (save_id, ingredient_id, stock, unlocked)
        VALUES (?, ?, ?, ?)
      `,
      [saveId, ingredient.id, ingredient.unlocked ? 2 : 0, ingredient.unlocked ? 1 : 0]
    );
  }

  for (const monster of monsters) {
    await run(
      `
        INSERT OR IGNORE INTO save_collection (save_id, monster_id, visit_count, best_satisfaction, unlocked)
        VALUES (?, ?, ?, 0, ?)
      `,
      [saveId, monster.id, 0, 0]
    );
    await run(
      'INSERT OR IGNORE INTO monster_affinity (save_id, monster_id, affinity, relationship_level) VALUES (?, ?, 0, ?)',
      [saveId, monster.id, '陌生']
    );
  }

  for (const achievement of achievements) {
    await run(
      `
        INSERT OR IGNORE INTO save_achievements (save_id, achievement_id, target_progress)
        VALUES (?, ?, ?)
      `,
      [saveId, achievement.id, targetMap[achievement.code] || 1]
    );
  }

  await normalizeUntouchedSave(saveId);
  return true;
}

async function normalizeUntouchedSave(saveId) {
  const save = await get('SELECT business_days, coins, xp, level FROM saves WHERE id = ?', [saveId]);
  if (
    !save ||
    Number(save.business_days || 0) !== 1 ||
    Number(save.coins || 0) !== 500 ||
    Number(save.xp || 0) !== 0 ||
    Number(save.level || 1) !== 1
  ) {
    return;
  }

  const reviewState = await get('SELECT COUNT(*) AS count FROM reviews WHERE save_id = ?', [saveId]);
  if (Number(reviewState?.count || 0) > 0) {
    return;
  }

  const collectionState = await get(
    `
      SELECT
        COUNT(CASE WHEN unlocked = 1 THEN 1 END) AS unlocked_count,
        COALESCE(SUM(visit_count), 0) AS visit_count,
        COALESCE(MAX(best_satisfaction), 0) AS best_satisfaction
      FROM save_collection
      WHERE save_id = ?
    `,
    [saveId]
  );

  if (
    Number(collectionState?.unlocked_count || 0) <= 2 &&
    Number(collectionState?.visit_count || 0) <= 2 &&
    Number(collectionState?.best_satisfaction || 0) === 0
  ) {
    await run('UPDATE saves SET business_days = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [saveId]);
    await run(
      'UPDATE save_collection SET visit_count = 0, best_satisfaction = 0, unlocked = 0, updated_at = CURRENT_TIMESTAMP WHERE save_id = ?',
      [saveId]
    );
    await run(
      'UPDATE save_achievements SET current_progress = 0, completed = 0, claimed = 0, completed_at = NULL, claimed_at = NULL WHERE save_id = ?',
      [saveId]
    );
  }
}

async function updateAchievementProgress(saveId, code, value, mode = 'max') {
  const achievement = await get('SELECT id FROM achievements WHERE code = ?', [code]);
  if (!achievement) return;
  await ensureSaveScopedData(saveId);
  const row = await get(
    'SELECT current_progress, target_progress, claimed FROM save_achievements WHERE save_id = ? AND achievement_id = ?',
    [saveId, achievement.id]
  );
  if (!row || row.claimed) return;
  const nextProgress = mode === 'add'
    ? Number(row.current_progress || 0) + value
    : Math.max(Number(row.current_progress || 0), value);
  const completed = nextProgress >= Number(row.target_progress || 1) ? 1 : 0;
  await run(
    `
      UPDATE save_achievements
      SET current_progress = ?, completed = ?, completed_at = CASE WHEN ? = 1 AND completed = 0 THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE save_id = ? AND achievement_id = ?
    `,
    [nextProgress, completed, completed, saveId, achievement.id]
  );
}

async function addBackpackReward(saveId, code, name, description, iconText, quantity = 1) {
  await run(
    `
      INSERT OR IGNORE INTO backpack_items (code, name, description, icon_text)
      VALUES (?, ?, ?, ?)
    `,
    [code, name, description, iconText]
  );
  const item = await get('SELECT id FROM backpack_items WHERE code = ?', [code]);
  if (!item) return null;
  await run(
    `
      INSERT INTO save_backpack (save_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(save_id, item_id)
      DO UPDATE SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
    `,
    [saveId, item.id, quantity, quantity]
  );
  return { name, quantity, icon_text: iconText, description };
}

function getStoryReward(monsterName, threshold) {
  const stageName = threshold >= 500 ? '挚友' : threshold >= 300 ? '熟客' : '初识';
  return {
    code: `story_${monsterName}_${threshold}`,
    name: `${monsterName}的${stageName}纪念章`,
    description: `阅读${monsterName}好感度 ${threshold} 的故事获得。用于收藏，也代表这位怪兽与你的关系更进一步。`,
    icon_text: String(monsterName || '?').slice(0, 1)
  };
}

function getLevelRewardPlan(level) {
  const plans = {
    1: [{ type: 'coins', name: '金币', quantity: 50, icon_text: '金', description: '等级奖励启动资金。' }],
    2: [{ type: 'coins', name: '金币', quantity: 80, icon_text: '金', description: '店铺小有名气奖励。' }],
    3: [{ type: 'xp', name: '经验', quantity: 40, icon_text: '经', description: '整理图鉴获得的经营经验。' }],
    4: [{ type: 'coins', name: '金币', quantity: 120, icon_text: '金', description: '评价墙人气奖励。' }],
    5: [{ type: 'item', code: 'rare_guest_ticket', name: '稀客邀请券', quantity: 1, icon_text: '券', description: '象征特殊顾客更愿意拜访 Monster Café。' }],
    6: [{ type: 'ingredient_tag', tag: '奶', quantity: 3 }],
    7: [{ type: 'ingredient_tag', tag: '气泡', quantity: 3 }],
    8: [{ type: 'coins', name: '金币', quantity: 180, icon_text: '金', description: '成就展台升级奖励。' }],
    9: [{ type: 'ingredient_tag', tag: '冰', quantity: 4 }],
    10: [{ type: 'item', code: 'lucky_spoon', name: '幸运调饮勺', quantity: 1, icon_text: '勺', description: '用于纪念十级店铺，暂作为收藏道具。' }],
    11: [{ type: 'ingredient_tag', tag: '苦', quantity: 5 }],
    12: [{ type: 'coins', name: '金币', quantity: 300, icon_text: '金', description: '慢时钟顾客解锁奖励。' }],
    13: [{ type: 'item', code: 'name_card_set', name: '饮品命名卡组', quantity: 1, icon_text: '卡', description: '未来可用于饮品命名系统。' }],
    14: [{ type: 'ingredient_tag', tag: '星光', quantity: 5 }],
    15: [{ type: 'coins', name: '金币', quantity: 500, icon_text: '金', description: '十五级店铺纪念奖励。' }]
  };
  return plans[level] || [{ type: 'coins', name: '金币', quantity: level * 20, icon_text: '金', description: `Lv.${level} 等级奖励。` }];
}

async function applyLevelReward(saveId, level) {
  const rewards = [];
  const plans = getLevelRewardPlan(level);
  for (const plan of plans) {
    if (plan.type === 'coins') {
      await run('UPDATE saves SET coins = coins + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [plan.quantity, saveId]);
      rewards.push(plan);
    } else if (plan.type === 'xp') {
      const save = await get('SELECT level, xp FROM saves WHERE id = ?', [saveId]);
      const nextXp = Number(save?.xp || 0) + plan.quantity;
      const nextLevel = Math.max(Number(save?.level || 1), calculateLevelFromXp(nextXp));
      await run('UPDATE saves SET xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextXp, nextLevel, saveId]);
      rewards.push(plan);
    } else if (plan.type === 'ingredient_tag') {
      const ingredients = await all(
        `
          SELECT ingredients.id, ingredients.name
          FROM ingredients
          JOIN save_ingredients ON save_ingredients.ingredient_id = ingredients.id AND save_ingredients.save_id = ?
          WHERE save_ingredients.unlocked = 1 AND ingredients.taste_tags LIKE ?
          ORDER BY ingredients.id ASC
          LIMIT 1
        `,
        [saveId, `%${plan.tag}%`]
      );
      const ingredient = ingredients[0];
      if (ingredient) {
        await run(
          'UPDATE save_ingredients SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND ingredient_id = ?',
          [plan.quantity, saveId, ingredient.id]
        );
        rewards.push({
          name: ingredient.name,
          quantity: plan.quantity,
          icon_text: ingredient.name.slice(0, 1),
          description: `等级奖励补充的${plan.tag}系原料。`
        });
      }
    } else if (plan.type === 'item') {
      const itemReward = await addBackpackReward(saveId, plan.code, plan.name, plan.description, plan.icon_text, plan.quantity);
      if (itemReward) rewards.push(itemReward);
    }
  }
  return rewards;
}

async function syncDefaultSave(player, saveId = 1) {
  const nickname = String(player.name || '咖啡馆老板').replace(/的?存档$/, '');
  await run(
    `
      INSERT OR IGNORE INTO saves (id, save_name, player_id, coins, level, xp, business_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [saveId, `${nickname}的存档`, player.id, player.coins, player.shop_level, player.xp || 0, player.business_days]
  );
  await run(
    `
      UPDATE saves
      SET coins = ?, level = ?, xp = ?, business_days = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [player.coins, player.shop_level, player.xp || 0, player.business_days, saveId]
  );
}

async function applyPlayerXp(playerId, xpGained, saveId = 1) {
  await ensureSaveScopedData(saveId);
  if (xpGained <= 0) {
    const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    const player = {
      id: playerId,
      name: save.save_name.replace(/的?存档$/, ''),
      coins: save.coins,
      business_days: save.business_days,
      shop_level: save.level,
      xp: save.xp,
      total_satisfaction: 0
    };
    return { player, level_up: false, rewards: [] };
  }

  const before = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
  const nextXp = (before.xp || 0) + xpGained;
  const nextLevel = Math.max(before.level, calculateLevelFromXp(nextXp));
  const rewards = [];

  await run('UPDATE saves SET xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextXp, nextLevel, saveId]);

  if (nextLevel > before.level) {
    const levelRewards = await all(
      'SELECT * FROM level_rewards WHERE level > ? AND level <= ? ORDER BY level ASC',
      [before.level, nextLevel]
    );
    for (const reward of levelRewards) {
      rewards.push({
        level: reward.level,
        unlock_content: reward.unlock_content,
        reward_content: reward.reward_content
      });
    }
  }

  const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
  const player = {
    id: playerId,
    name: save.save_name.replace(/的?存档$/, ''),
    coins: save.coins,
    business_days: save.business_days,
    shop_level: save.level,
    xp: save.xp,
    total_satisfaction: 0
  };
  return { player, level_up: nextLevel > before.level, rewards };
}

async function unlockAchievement(code) {
  const achievement = await get('SELECT * FROM achievements WHERE code = ?', [code]);
  if (!achievement) {
    return null;
  }

  const existing = await get(
    'SELECT id FROM player_achievements WHERE achievement_id = ?',
    [achievement.id]
  );
  if (existing) {
    return null;
  }

  await run('INSERT INTO player_achievements (achievement_id) VALUES (?)', [achievement.id]);
  await run(
    'UPDATE players SET coins = coins + ?, xp = xp + ? WHERE id = (SELECT id FROM players ORDER BY id ASC LIMIT 1)',
    [achievement.reward_coins, achievement.reward_xp]
  );

  return achievement;
}

async function getColumnNames(tableName) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.map((column) => column.name);
}

async function insertOrderRecord({
  monster,
  orderDescription,
  selectedIngredients,
  drinkName,
  satisfaction,
  coinReward
}) {
  const columns = await getColumnNames('orders');
  const insertColumns = [];
  const values = [];

  const addColumn = (columnName, value) => {
    if (columns.includes(columnName)) {
      insertColumns.push(columnName);
      values.push(value);
    }
  };

  const ingredientIds = selectedIngredients.map((ingredient) => ingredient.id);

  addColumn('monster_id', monster.id);
  addColumn('request_text', orderDescription);
  addColumn('selected_ingredients', JSON.stringify(ingredientIds));
  addColumn('satisfaction', satisfaction);
  addColumn('coin_reward', coinReward);

  addColumn('drink_name', drinkName);
  addColumn('ingredient_ids', JSON.stringify(ingredientIds));
  addColumn('reward', coinReward);

  const placeholders = insertColumns.map(() => '?').join(', ');
  await run(
    `INSERT INTO orders (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    values
  );
}

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Monster Café',
    message: '后端服务运行正常。'
  });
});

router.get('/saves', async (req, res, next) => {
  try {
    const existingSaves = await all('SELECT id FROM saves ORDER BY id ASC');
    for (const save of existingSaves) {
      await ensureSaveScopedData(save.id);
    }

    const saves = await all(`
      SELECT
        saves.id,
        saves.save_name,
        saves.coins,
        saves.level,
        saves.xp,
        saves.business_days,
        saves.updated_at,
        COUNT(CASE WHEN save_collection.unlocked = 1 THEN 1 END) AS unlocked_monsters
      FROM saves
      LEFT JOIN save_collection ON save_collection.save_id = saves.id
      GROUP BY saves.id
      ORDER BY saves.updated_at DESC
    `);

    res.json(saves);
  } catch (error) {
    next(error);
  }
});

router.post('/saves', async (req, res, next) => {
  try {
    const nickname = String(req.body.nickname || '').trim().slice(0, 16);
    if (!nickname) {
      res.status(400).json({
        error: '昵称不能为空',
        message: '请先输入玩家昵称。'
      });
      return;
    }

    const result = await run(
      `
        INSERT INTO saves (save_name, player_id, coins, level, xp, business_days, tutorial_prompted, tutorial_completed)
        VALUES (?, 1, 500, 1, 0, 0, 0, 0)
      `,
      [`${nickname}的存档`]
    );

    const save = await get('SELECT * FROM saves WHERE id = ?', [result.id]);
    await ensureSaveScopedData(save.id);
    res.json({ ok: true, save });
  } catch (error) {
    next(error);
  }
});

router.post('/saves/:id/load', async (req, res, next) => {
  try {
    const saveId = Number(req.params.id);
    const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    if (!save) {
      res.status(404).json({
        error: '存档不存在',
        message: '没有找到对应的存档。'
      });
      return;
    }
    await ensureSaveScopedData(saveId);

    await run(
      `
        UPDATE players
        SET
          name = ?,
          coins = ?,
          shop_level = ?,
          xp = ?,
          business_days = ?
        WHERE id = (SELECT id FROM players ORDER BY id ASC LIMIT 1)
      `,
      [save.save_name.replace(/的?存档$/, ''), save.coins, save.level, save.xp, save.business_days]
    );
    await run('UPDATE saves SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [saveId]);

    const player = await get('SELECT id, name, coins, business_days, shop_level, total_satisfaction, xp FROM players ORDER BY id ASC LIMIT 1');
    res.json({ ok: true, save, player });
  } catch (error) {
    next(error);
  }
});

router.delete('/saves/:id', async (req, res, next) => {
  try {
    const saveId = Number(req.params.id);

    await run('DELETE FROM save_ingredients WHERE save_id = ?', [saveId]);
    await run('DELETE FROM save_collection WHERE save_id = ?', [saveId]);
    await run('DELETE FROM save_achievements WHERE save_id = ?', [saveId]);
    await run('DELETE FROM save_backpack WHERE save_id = ?', [saveId]);
    await run('DELETE FROM save_level_rewards WHERE save_id = ?', [saveId]);
    await run('DELETE FROM monster_affinity WHERE save_id = ?', [saveId]);
    await run('DELETE FROM player_gifts WHERE save_id = ?', [saveId]);
    await run('DELETE FROM reviews WHERE save_id = ?', [saveId]);
    const result = await run('DELETE FROM saves WHERE id = ?', [saveId]);
    if (!result.changes) {
      res.status(404).json({
        error: '存档不存在',
        message: '没有找到要删除的存档。'
      });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/game/next-customer', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const save = await get('SELECT id, level FROM saves WHERE id = ?', [saveId]);
    const playerLevel = save ? save.level : 1;
    const monsters = await all(`
      SELECT
        monsters.id,
        monsters.name,
        monsters.species,
        monsters.liked_taste,
        monsters.disliked_taste,
        monsters.description,
        monsters.dialogue,
        monsters.tag,
        monsters.unlock_level,
        monsters.is_special,
        monsters.appearance_rate,
        monsters.special_effect,
        COALESCE(save_collection.visit_count, 0) AS visit_count,
        COALESCE(save_collection.best_satisfaction, 0) AS best_satisfaction,
        COALESCE(save_collection.unlocked, 0) AS unlocked,
        COALESCE(monster_affinity.affinity, 0) AS affinity,
        COALESCE(monster_affinity.relationship_level, '陌生') AS relationship_level
      FROM monsters
      LEFT JOIN save_collection ON save_collection.monster_id = monsters.id AND save_collection.save_id = ?
      LEFT JOIN monster_affinity ON monster_affinity.monster_id = monsters.id AND monster_affinity.save_id = ?
      WHERE monsters.unlock_level <= ?
      ORDER BY RANDOM()
    `, [saveId, saveId, playerLevel]);
    const ingredients = await all(`
      SELECT
        ingredients.id,
        ingredients.name,
        ingredients.taste_tags,
        COALESCE(save_ingredients.stock, 0) AS stock,
        ingredients.price,
        COALESCE(save_ingredients.unlocked, ingredients.unlocked) AS unlocked,
        ingredients.description
      FROM ingredients
      LEFT JOIN save_ingredients
        ON save_ingredients.ingredient_id = ingredients.id
        AND save_ingredients.save_id = ?
      WHERE COALESCE(save_ingredients.unlocked, ingredients.unlocked) = 1
    `, [saveId]);
    const feasibleMonsters = monsters.filter((monster) => canMonsterGetPerfectOrder(monster, ingredients));
    const specialCandidates = feasibleMonsters.filter((monster) => monster.is_special && Math.random() < Number(monster.appearance_rate || 0));
    const normalCandidates = feasibleMonsters.filter((monster) => !monster.is_special);
    const monster = pickRandom(
      specialCandidates.length > 0
        ? specialCandidates
        : (normalCandidates.length > 0 ? normalCandidates : feasibleMonsters.length > 0 ? feasibleMonsters : monsters)
    );

    if (!monster) {
      res.status(404).json({
        error: '暂无怪兽顾客',
        message: '数据库中还没有可用于生成订单的怪兽。'
      });
      return;
    }

    const recommendedTasteTags = buildFeasibleTasteTags(monster, ingredients);

    res.json({
      monster,
      order_description: buildOrderDescription(recommendedTasteTags),
      recommended_taste_tags: recommendedTasteTags,
      supported_taste_tags: SUPPORTED_TASTE_TAGS
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/make-drink', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const {
      monsterId,
      selectedIngredients,
      requestedTasteTags = [],
      requestText = '',
      customerMood = 'normal',
      giftId = null,
      dailyBonus = 0
    } = req.body;

    if (!monsterId || !Array.isArray(selectedIngredients) || selectedIngredients.length === 0) {
      res.status(400).json({
        error: '参数不完整',
        message: '请提供 monsterId 和 selectedIngredients 原料编号数组。'
      });
      return;
    }

    const ingredientIds = selectedIngredients
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (ingredientIds.length === 0) {
      res.status(400).json({
        error: '原料无效',
        message: '至少需要选择一个有效原料。'
      });
      return;
    }

    const monster = await get(`
      SELECT id, name, species, liked_taste, disliked_taste, description, dialogue,
        tag, unlock_level, is_special, appearance_rate, special_effect
      FROM monsters
      WHERE id = ?
    `, [Number(monsterId)]);

    if (!monster) {
      res.status(404).json({
        error: '怪兽不存在',
        message: '没有找到对应的怪兽顾客。'
      });
      return;
    }

    const placeholders = ingredientIds.map(() => '?').join(', ');
    const ingredients = await all(`
      SELECT
        ingredients.id,
        ingredients.name,
        ingredients.taste_tags,
        COALESCE(save_ingredients.stock, 0) AS stock,
        ingredients.price,
        COALESCE(save_ingredients.unlocked, ingredients.unlocked) AS unlocked,
        ingredients.description
      FROM ingredients
      LEFT JOIN save_ingredients
        ON save_ingredients.ingredient_id = ingredients.id
        AND save_ingredients.save_id = ?
      WHERE ingredients.id IN (${placeholders})
    `, [saveId, ...ingredientIds]);

    if (ingredients.length !== ingredientIds.length) {
      res.status(400).json({
        error: '原料不存在',
        message: '选择的原料中包含不存在的编号。'
      });
      return;
    }

    const lockedIngredient = ingredients.find((ingredient) => !ingredient.unlocked);
    if (lockedIngredient) {
      res.status(400).json({
        error: '原料未解锁',
        message: `${lockedIngredient.name} 还未解锁，不能加入饮品。`
      });
      return;
    }

    const emptyIngredient = ingredients.find((ingredient) => ingredient.stock <= 0);
    if (emptyIngredient) {
      res.status(400).json({
        error: '库存不足',
        message: `${emptyIngredient.name} 库存不足，请先去商店购买。`
      });
      return;
    }

    const scoring = calculateDrinkScore(monster, ingredients, requestedTasteTags);
    const moodModifier = getMoodModifier(customerMood);
    let gift = null;
    let giftBonus = 0;
    let giftTip = 0;
    let satisfactionCap = 100;

    if (giftId) {
      gift = await get(
        `
          SELECT
            gifts.id,
            gifts.monster_id,
            gifts.gift_name,
            gifts.satisfaction_bonus,
            gifts.tip_min,
            gifts.tip_max,
            COALESCE(player_gifts.quantity, 0) AS quantity
          FROM gifts
          LEFT JOIN player_gifts ON player_gifts.gift_id = gifts.id AND player_gifts.save_id = ?
          WHERE gifts.id = ? AND gifts.monster_id = ?
        `,
        [saveId, Number(giftId), monster.id]
      );

      if (!gift || gift.quantity <= 0) {
        res.status(400).json({
          error: '礼物不可用',
          message: '当前怪兽没有可使用的对应礼物。'
        });
        return;
      }

      giftBonus = Number(gift.satisfaction_bonus || 20);
      satisfactionCap = 120;
    }

    const baseSatisfaction = scoring.satisfaction;
    let finalSatisfaction = clamp(baseSatisfaction + moodModifier + giftBonus + Number(dailyBonus || 0), 0, satisfactionCap);
    const drinkName = buildDrinkName(monster, scoring.targetTags.length ? scoring.targetTags : scoring.ingredientTags);
    const specialMultiplier = monster.name === '金色虾球' ? 3 : 1;
    let coinReward = Math.floor(finalSatisfaction * 0.6 * specialMultiplier);
    const ingredientCost = ingredients.reduce((sum, ingredient) => sum + ingredient.price, 0);
    const orderDescription = requestText || buildOrderDescription(scoring.targetTags.length ? scoring.targetTags : buildRecommendedTasteTags(monster));
    if (gift) {
      const tipRate = Number(gift.tip_min) + Math.random() * (Number(gift.tip_max) - Number(gift.tip_min));
      giftTip = Math.max(1, Math.round(coinReward * tipRate));
      coinReward += giftTip;
      await run('UPDATE player_gifts SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND gift_id = ?', [saveId, gift.id]);
    }

    const feedbackText = buildFeedbackText(finalSatisfaction, monster);
    const drinkXp = getDrinkXp(finalSatisfaction);
    const affinityGain = getAffinityGain(finalSatisfaction);

    await insertOrderRecord({
      monster,
      orderDescription,
      selectedIngredients: ingredients,
      drinkName,
      satisfaction: finalSatisfaction,
      coinReward
    });

    for (const ingredient of ingredients) {
      await run('UPDATE save_ingredients SET stock = stock - 1, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND ingredient_id = ?', [saveId, ingredient.id]);
    }

    await run(
      'INSERT OR IGNORE INTO save_collection (save_id, monster_id, visit_count, best_satisfaction, unlocked) VALUES (?, ?, 0, 0, 1)',
      [saveId, monster.id]
    );
    await run(
      `
        UPDATE save_collection
        SET
          visit_count = visit_count + 1,
          best_satisfaction = CASE
            WHEN best_satisfaction < ? THEN ?
            ELSE best_satisfaction
          END,
          unlocked = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE save_id = ? AND monster_id = ?
      `,
      [finalSatisfaction, finalSatisfaction, saveId, monster.id]
    );

    await run(
      'INSERT OR IGNORE INTO monster_affinity (save_id, monster_id, affinity, relationship_level) VALUES (?, ?, 0, ?)',
      [saveId, monster.id, '陌生']
    );

    let updatedAffinity = null;
    if (affinityGain > 0) {
      const beforeAffinity = await get(
        'SELECT affinity FROM monster_affinity WHERE save_id = ? AND monster_id = ?',
        [saveId, monster.id]
      );
      const beforeValue = beforeAffinity ? beforeAffinity.affinity : 0;
      const nextAffinity = beforeValue + affinityGain;
      const relationship = getRelationshipLevel(nextAffinity);
      await run(
        `
          UPDATE monster_affinity
          SET affinity = ?, relationship_level = ?, updated_at = CURRENT_TIMESTAMP
          WHERE save_id = ? AND monster_id = ?
        `,
        [nextAffinity, relationship, saveId, monster.id]
      );

      const beforeGiftCount = Math.floor(beforeValue / 100);
      const nextGiftCount = Math.floor(nextAffinity / 100);
      if (nextGiftCount > beforeGiftCount) {
        const monsterGift = await get('SELECT id FROM gifts WHERE monster_id = ?', [monster.id]);
        if (monsterGift) {
          await run(
            `
              INSERT INTO player_gifts (save_id, monster_id, gift_id, quantity)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(save_id, gift_id)
              DO UPDATE SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            `,
            [saveId, monster.id, monsterGift.id, nextGiftCount - beforeGiftCount, nextGiftCount - beforeGiftCount]
          );
        }
      }
      updatedAffinity = { affinity: nextAffinity, relationship_level: relationship, gained: affinityGain };
    }

    await run(
      `
        INSERT INTO reviews (save_id, monster_id, monster_name, satisfaction, review_text, coins, used_gift)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [saveId, monster.id, monster.name, finalSatisfaction, feedbackText, coinReward, gift ? 1 : 0]
    );

    await updateAchievementProgress(saveId, 'first_drink', 1);
    if (finalSatisfaction >= 100) await updateAchievementProgress(saveId, 'perfect_drink', 1);
    if (finalSatisfaction >= 120) await updateAchievementProgress(saveId, 'over_full_score', 1);

    res.json({
      drink_name: drinkName,
      drinkName,
      satisfaction: finalSatisfaction,
      base_satisfaction: baseSatisfaction,
      mood_modifier: moodModifier,
      gift_bonus: giftBonus,
      coin_reward: coinReward,
      coinReward,
      ingredient_cost: ingredientCost,
      ingredientCost,
      xp_gained: drinkXp,
      affinity: updatedAffinity,
      used_gift: gift ? {
        id: gift.id,
        gift_name: gift.gift_name,
        bonus: giftBonus,
        tip: giftTip
      } : null,
      level_up: false,
      level_rewards: [],
      special_effect: monster.special_effect || '',
      special_customer: Boolean(monster.is_special),
      feedback_text: feedbackText,
      customerFeedback: feedbackText,
      score_detail: {
        liked_hits: scoring.likedHits,
        disliked_hits: scoring.dislikedHits,
        combo_bonus: scoring.comboBonus,
        liked_bonus: scoring.likedBonus,
        disliked_penalty: scoring.dislikedPenalty,
        diversity_bonus: scoring.diversityBonus,
        no_disliked_bonus: scoring.noDislikedBonus,
        too_many_penalty: scoring.tooManyPenalty,
        target_tags: scoring.targetTags,
        matched_target_tags: scoring.matchedTargetTags,
        ingredient_tags: scoring.ingredientTags
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/end-day', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const customersServed = Math.max(0, Number(req.body.customersServed || 0));
    const badReviews = Math.max(0, Number(req.body.badReviews || 0));
    const reviewedCustomers = customersServed + badReviews;
    const totalIncome = Math.max(0, Number(req.body.totalIncome || 0));
    const totalIngredientCost = Math.max(0, Number(req.body.totalIngredientCost || 0));
    const totalSatisfaction = Math.max(0, Number(req.body.totalSatisfaction || 0));
    const drinkXpTotal = Math.max(0, Number(req.body.totalXp || 0));
    const gummyStarBonus = Number(req.body.gummyStarBonus || 0);
    const avgSatisfaction = reviewedCustomers > 0
      ? Math.round(totalSatisfaction / reviewedCustomers)
      : 0;
    const profit = totalIncome - totalIngredientCost;

    await ensureSaveScopedData(saveId);
    const player = await get('SELECT id FROM players ORDER BY id ASC LIMIT 1');
    const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);

    if (!save || !player) {
      res.status(404).json({
        error: '存档不存在',
        message: '请先选择存档。'
      });
      return;
    }

    const profitStars = getStars(profit, [100, 70, 40, 15]);
    const customerStars = getStars(reviewedCustomers, [8, 6, 4, 2]);
    const satisfactionStars = getStars(avgSatisfaction, [90, 80, 65, 50]);
    const baseOverallStars = satisfactionStars;
    const overallStars = Math.min(5.5, baseOverallStars + gummyStarBonus);
    let xpGained = 0;
    if (overallStars >= 5) xpGained += 60;
    else if (overallStars >= 4) xpGained += 35;
    else if (overallStars >= 3) xpGained += 20;
    if (badReviews === 0 && reviewedCustomers > 0) xpGained += 30;
    if (customersServed >= 5) xpGained += 20;
    const coinBonus = Math.floor(overallStars * 10);
    const totalXpGained = drinkXpTotal + xpGained;
    const totalCoinGained = totalIncome + coinBonus;
    const nextXp = save.xp + totalXpGained;
    const nextLevel = Math.max(save.level, calculateLevelFromXp(nextXp));

    await run(
      `
        INSERT INTO day_results (
          day_number,
          customers_served,
          total_income,
          total_ingredient_cost,
          profit,
          avg_satisfaction,
          profit_stars,
          customer_stars,
          satisfaction_stars,
          overall_stars,
          xp_gained,
          coin_bonus
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        save.business_days + 1,
        customersServed,
        totalIncome,
        totalIngredientCost,
        profit,
        avgSatisfaction,
        profitStars,
        customerStars,
        satisfactionStars,
        overallStars,
        totalXpGained,
        coinBonus
      ]
    );

    await run(
      `
        UPDATE saves
        SET
          business_days = business_days + 1,
          coins = coins + ?,
          xp = xp + ?,
          level = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [totalCoinGained, totalXpGained, nextLevel, saveId]
    );

    const unlockedAchievements = [];
    await updateAchievementProgress(saveId, 'first_day', 1);
    await updateAchievementProgress(saveId, 'three_days', save.business_days + 1);
    if (customersServed >= 5) await updateAchievementProgress(saveId, 'five_customers', customersServed);
    if (badReviews === 0 && reviewedCustomers > 0) await updateAchievementProgress(saveId, 'no_bad_review_day', 1);
    if (overallStars >= 5) await updateAchievementProgress(saveId, 'five_star_day', 1);
    if (profit >= 100) await updateAchievementProgress(saveId, 'profit_100', 1);
    if (nextLevel >= 2) await updateAchievementProgress(saveId, 'level_2', 1);

    const updatedSave = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    const updatedPlayer = {
      id: saveId,
      name: updatedSave.save_name.replace(/的?存档$/, ''),
      coins: updatedSave.coins,
      business_days: updatedSave.business_days,
      shop_level: updatedSave.level,
      total_satisfaction: 0,
      xp: updatedSave.xp
    };

    res.json({
      ok: true,
      day_number: save.business_days + 1,
      next_day: updatedPlayer.business_days,
      summary: {
        customers_served: customersServed,
        bad_reviews: badReviews,
        reviewed_customers: reviewedCustomers,
        total_income: totalIncome,
        total_ingredient_cost: totalIngredientCost,
        profit,
        avg_satisfaction: avgSatisfaction,
        profit_stars: profitStars,
        customer_stars: customerStars,
        satisfaction_stars: satisfactionStars,
        overall_stars: overallStars,
        gummy_star_bonus: gummyStarBonus,
        drink_xp: drinkXpTotal,
        settlement_xp: xpGained,
        xp_gained: totalXpGained,
        coin_bonus: coinBonus,
        total_coin_gained: totalCoinGained
      },
      player: updatedPlayer,
      achievements: unlockedAchievements.map((achievement) => ({
        code: achievement.code,
        title: achievement.title,
        description: achievement.description,
        reward_coins: achievement.reward_coins,
        reward_xp: achievement.reward_xp
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/player', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    if (!save) {
      res.status(404).json({ error: '存档不存在', message: '请先选择或新建存档。' });
      return;
    }

    res.json({
      id: save.id,
      name: save.save_name.replace(/的?存档$/, ''),
      coins: save.coins,
      business_days: save.business_days,
      day: save.business_days,
      shop_level: save.level,
      total_satisfaction: 0,
      xp: save.xp,
      created_at: save.created_at
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ingredients', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const ingredients = await all(`
      SELECT
        ingredients.id,
        ingredients.name,
        ingredients.taste_tags,
        ingredients.taste_tags AS tag,
        COALESCE(save_ingredients.stock, 0) AS stock,
        ingredients.price,
        COALESCE(save_ingredients.unlocked, ingredients.unlocked) AS unlocked,
        ingredients.description
      FROM ingredients
      LEFT JOIN save_ingredients
        ON save_ingredients.ingredient_id = ingredients.id
        AND save_ingredients.save_id = ?
      ORDER BY unlocked DESC, ingredients.id ASC
    `, [saveId]);

    res.json(ingredients);
  } catch (error) {
    next(error);
  }
});

router.post('/shop/buy', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const ingredientId = Number(req.body.ingredientId);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const action = req.body.action === 'unlock' ? 'unlock' : 'buy';

    if (!Number.isInteger(ingredientId) || ingredientId <= 0) {
      res.status(400).json({
        error: '原料无效',
        message: '请提供正确的原料编号。'
      });
      return;
    }

    const ingredient = await get(
      `
        SELECT
          ingredients.id,
          ingredients.name,
          ingredients.taste_tags,
          COALESCE(save_ingredients.stock, 0) AS stock,
          ingredients.price,
          COALESCE(save_ingredients.unlocked, ingredients.unlocked) AS unlocked,
          ingredients.description
        FROM ingredients
        LEFT JOIN save_ingredients
          ON save_ingredients.ingredient_id = ingredients.id
          AND save_ingredients.save_id = ?
        WHERE ingredients.id = ?
      `,
      [saveId, ingredientId]
    );

    if (!ingredient) {
      res.status(404).json({
        error: '原料不存在',
        message: '没有找到对应的原料。'
      });
      return;
    }

    const save = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    if (!save) {
      res.status(404).json({
        error: '存档不存在',
        message: '请先选择存档。'
      });
      return;
    }

    let cost = ingredient.price * quantity;
    let message = `购买 ${quantity} 份${ingredient.name}成功。`;

    if (action === 'unlock') {
      if (ingredient.unlocked) {
        res.status(400).json({
          error: '原料已解锁',
          message: `${ingredient.name} 已经解锁，可以直接购买库存。`
        });
        return;
      }

      cost = getUnlockCost(ingredient);
      message = `成功解锁${ingredient.name}。`;
    } else if (!ingredient.unlocked) {
      res.status(400).json({
        error: '原料未解锁',
        message: `${ingredient.name} 还未解锁，无法购买库存。`
      });
      return;
    }

    if (save.coins < cost) {
      res.status(400).json({
        error: '金币不足',
        message: `金币不足，本次需要 ${cost} 金币。`
      });
      return;
    }

    await run('UPDATE saves SET coins = coins - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [cost, saveId]);

    if (action === 'unlock') {
      await run('UPDATE save_ingredients SET unlocked = 1, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND ingredient_id = ?', [saveId, ingredient.id]);
    } else {
      await run('UPDATE save_ingredients SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND ingredient_id = ?', [quantity, saveId, ingredient.id]);
    }

    const updatedSave = await get('SELECT * FROM saves WHERE id = ?', [saveId]);
    const updatedIngredient = await get(
      `
        SELECT ingredients.id, ingredients.name, ingredients.taste_tags, save_ingredients.stock, ingredients.price, save_ingredients.unlocked, ingredients.description
        FROM ingredients
        JOIN save_ingredients ON save_ingredients.ingredient_id = ingredients.id AND save_ingredients.save_id = ?
        WHERE ingredients.id = ?
      `,
      [saveId, ingredient.id]
    );

    res.json({
      ok: true,
      message,
      action,
      cost,
      player: {
        coins: updatedSave.coins,
        business_days: updatedSave.business_days,
        shop_level: updatedSave.level,
        xp: updatedSave.xp
      },
      ingredient: updatedIngredient
    });
  } catch (error) {
    next(error);
  }
});

router.get('/monsters', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const monsters = await all(`
      SELECT
        monsters.id,
        monsters.name,
        monsters.species,
        monsters.liked_taste,
        monsters.liked_taste AS preference_tag,
        monsters.disliked_taste,
        monsters.description,
        monsters.dialogue,
        COALESCE(save_collection.visit_count, 0) AS visit_count,
        COALESCE(save_collection.best_satisfaction, 0) AS best_satisfaction,
        COALESCE(save_collection.unlocked, 0) AS unlocked
      FROM monsters
      LEFT JOIN save_collection ON save_collection.monster_id = monsters.id AND save_collection.save_id = ?
      ORDER BY monsters.id ASC
    `, [saveId]);

    res.json(monsters);
  } catch (error) {
    next(error);
  }
});

router.get('/collection', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const collection = await all(`
      SELECT
        save_collection.id,
        save_collection.monster_id,
        monsters.name AS monster_name,
        monsters.species,
        monsters.liked_taste,
        monsters.disliked_taste,
        monsters.tag,
        monsters.is_special,
        monsters.special_effect,
        monsters.description,
        save_collection.visit_count,
        save_collection.best_satisfaction,
        save_collection.unlocked,
        COALESCE(monster_affinity.affinity, 0) AS affinity,
        COALESCE(monster_affinity.relationship_level, '陌生') AS relationship_level,
        COALESCE(monster_affinity.read_stories, '[]') AS read_stories,
        COALESCE(gifts.gift_name, '') AS gift_name,
        COALESCE(player_gifts.quantity, 0) AS gift_quantity,
        save_collection.updated_at
      FROM save_collection
      JOIN monsters ON monsters.id = save_collection.monster_id
      LEFT JOIN monster_affinity ON monster_affinity.monster_id = monsters.id AND monster_affinity.save_id = ?
      LEFT JOIN gifts ON gifts.monster_id = monsters.id
      LEFT JOIN player_gifts ON player_gifts.gift_id = gifts.id AND player_gifts.save_id = ?
      WHERE save_collection.save_id = ?
      ORDER BY save_collection.unlocked DESC, save_collection.id ASC
    `, [saveId, saveId, saveId]);

    res.json(collection);
  } catch (error) {
    next(error);
  }
});

router.get('/collection/todos', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const hasSave = await ensureSaveScopedData(saveId);
    if (!hasSave) {
      res.json({ has_todo: false, count: 0 });
      return;
    }

    const rows = await all(
      `
        SELECT
          save_collection.unlocked,
          COALESCE(monster_affinity.affinity, 0) AS affinity,
          COALESCE(monster_affinity.read_stories, '[]') AS read_stories
        FROM save_collection
        LEFT JOIN monster_affinity ON monster_affinity.monster_id = save_collection.monster_id AND monster_affinity.save_id = ?
        WHERE save_collection.save_id = ? AND save_collection.unlocked = 1
      `,
      [saveId, saveId]
    );
    let count = 0;
    for (const row of rows) {
      let readStories = [];
      try {
        readStories = JSON.parse(row.read_stories || '[]').map((item) => Number(item));
      } catch (error) {
        readStories = [];
      }
      const affinity = Number(row.affinity || 0);
      count += [100, 300, 500].filter((threshold) => affinity >= threshold && !readStories.includes(threshold)).length;
    }

    res.json({ has_todo: count > 0, count });
  } catch (error) {
    next(error);
  }
});

router.post('/collection/:monsterId/read-story', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const monsterId = Number(req.params.monsterId);
    const threshold = Number(req.body.threshold);

    if (!Number.isInteger(monsterId) || monsterId <= 0 || ![100, 300, 500].includes(threshold)) {
      res.status(400).json({
        error: '故事参数无效',
        message: '请选择一个已经解锁的怪兽故事。'
      });
      return;
    }

    await ensureSaveScopedData(saveId);
    const row = await get(
      `
        SELECT COALESCE(monster_affinity.affinity, 0) AS affinity,
               COALESCE(monster_affinity.read_stories, '[]') AS read_stories,
               monsters.name AS monster_name
        FROM monster_affinity
        JOIN monsters ON monsters.id = monster_affinity.monster_id
        WHERE save_id = ? AND monster_id = ?
      `,
      [saveId, monsterId]
    );

    if (!row || Number(row.affinity || 0) < threshold) {
      res.status(400).json({
        error: '故事尚未解锁',
        message: '好感度还没有达到这个故事的解锁条件。'
      });
      return;
    }

    let readStories = [];
    try {
      readStories = JSON.parse(row.read_stories || '[]');
    } catch (error) {
      readStories = [];
    }
    const alreadyRead = readStories.includes(threshold);
    const nextStories = [...new Set([...readStories, threshold])].sort((a, b) => a - b);
    await run(
      'UPDATE monster_affinity SET read_stories = ?, updated_at = CURRENT_TIMESTAMP WHERE save_id = ? AND monster_id = ?',
      [JSON.stringify(nextStories), saveId, monsterId]
    );

    const rewards = [];
    if (!alreadyRead) {
      const reward = getStoryReward(row.monster_name, threshold);
      const itemReward = await addBackpackReward(saveId, reward.code, reward.name, reward.description, reward.icon_text, 1);
      if (itemReward) rewards.push(itemReward);
    }

    res.json({ ok: true, read_stories: nextStories, rewards });
  } catch (error) {
    next(error);
  }
});

router.get('/achievements', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const hasSave = await ensureSaveScopedData(saveId);
    if (!hasSave) {
      res.json([]);
      return;
    }

    const achievements = await all(`
      SELECT
        achievements.id,
        achievements.code,
        achievements.title,
        achievements.description,
        achievements.category,
        achievements.reward_coins,
        achievements.reward_xp,
        achievements.reward_type,
        achievements.reward_content,
        COALESCE(save_achievements.current_progress, 0) AS current_progress,
        COALESCE(save_achievements.target_progress, 1) AS target_progress,
        COALESCE(save_achievements.completed, 0) AS completed,
        COALESCE(save_achievements.claimed, 0) AS claimed,
        save_achievements.completed_at,
        save_achievements.claimed_at
      FROM achievements
      LEFT JOIN save_achievements ON save_achievements.achievement_id = achievements.id AND save_achievements.save_id = ?
      ORDER BY achievements.category ASC, achievements.id ASC
    `, [saveId]);

    res.json(achievements);
  } catch (error) {
    next(error);
  }
});

router.post('/achievements/:id/claim', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const achievementId = Number(req.params.id);
    await ensureSaveScopedData(saveId);
    const row = await get(
      `
        SELECT
          save_achievements.*,
          achievements.title,
          achievements.reward_coins,
          achievements.reward_xp,
          achievements.reward_content
        FROM save_achievements
        JOIN achievements ON achievements.id = save_achievements.achievement_id
        WHERE save_achievements.save_id = ? AND save_achievements.achievement_id = ?
      `,
      [saveId, achievementId]
    );

    if (!row || !row.completed) {
      res.status(400).json({ error: '成就尚未完成', message: '该成就还不能领取奖励。' });
      return;
    }
    if (row.claimed) {
      res.status(400).json({ error: '奖励已领取', message: '该成就奖励已经领取过。' });
      return;
    }

    const save = await get('SELECT level, xp FROM saves WHERE id = ?', [saveId]);
    const rewardXp = Number(row.reward_xp || 0);
    const nextXp = Number(save?.xp || 0) + rewardXp;
    const nextLevel = Math.max(Number(save?.level || 1), calculateLevelFromXp(nextXp));
    await run(
      'UPDATE saves SET coins = coins + ?, xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [row.reward_coins || 0, nextXp, nextLevel, saveId]
    );
    await run(
      'UPDATE save_achievements SET claimed = 1, claimed_at = CURRENT_TIMESTAMP WHERE save_id = ? AND achievement_id = ?',
      [saveId, achievementId]
    );

    const rewards = [];
    if (row.reward_coins) rewards.push({ name: '金币', quantity: row.reward_coins, icon_text: '金', description: '成就奖励金币。' });
    if (row.reward_xp) rewards.push({ name: '经验', quantity: row.reward_xp, icon_text: '经', description: '成就奖励经验。' });

    res.json({ ok: true, achievement: row.title, rewards });
  } catch (error) {
    next(error);
  }
});

router.get('/level-rewards', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const hasSave = await ensureSaveScopedData(saveId);
    if (!hasSave) {
      res.json({ player_level: 1, has_todo: false, rewards: [] });
      return;
    }

    const save = await get('SELECT level FROM saves WHERE id = ?', [saveId]);
    const rewards = await all(
      `
        SELECT
          level_rewards.id,
          level_rewards.level,
          level_rewards.unlock_content,
          level_rewards.reward_content,
          COALESCE(save_level_rewards.claimed, 0) AS claimed,
          save_level_rewards.claimed_at
        FROM level_rewards
        LEFT JOIN save_level_rewards
          ON save_level_rewards.level_reward_id = level_rewards.id
          AND save_level_rewards.save_id = ?
        ORDER BY
          CASE WHEN COALESCE(save_level_rewards.claimed, 0) = 1 THEN 1 ELSE 0 END ASC,
          level_rewards.level ASC
      `,
      [saveId]
    );
    const playerLevel = Number(save?.level || 1);
    const normalizedRewards = rewards.map((reward) => ({
      ...reward,
      unlocked: playerLevel >= Number(reward.level || 0) ? 1 : 0,
      can_claim: playerLevel >= Number(reward.level || 0) && !Number(reward.claimed || 0) ? 1 : 0
    }));

    res.json({
      player_level: playerLevel,
      has_todo: normalizedRewards.some((reward) => reward.can_claim),
      rewards: normalizedRewards
    });
  } catch (error) {
    next(error);
  }
});

router.post('/level-rewards/:id/claim', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const rewardId = Number(req.params.id);
    const hasSave = await ensureSaveScopedData(saveId);
    if (!hasSave || !Number.isInteger(rewardId) || rewardId <= 0) {
      res.status(400).json({ error: '等级奖励无效', message: '请选择有效的等级奖励。' });
      return;
    }

    const row = await get(
      `
        SELECT
          level_rewards.*,
          saves.level AS player_level,
          COALESCE(save_level_rewards.claimed, 0) AS claimed
        FROM level_rewards
        JOIN saves ON saves.id = ?
        LEFT JOIN save_level_rewards
          ON save_level_rewards.level_reward_id = level_rewards.id
          AND save_level_rewards.save_id = ?
        WHERE level_rewards.id = ?
      `,
      [saveId, saveId, rewardId]
    );

    if (!row) {
      res.status(404).json({ error: '等级奖励不存在', message: '没有找到对应等级奖励。' });
      return;
    }
    if (Number(row.player_level || 1) < Number(row.level || 0)) {
      res.status(400).json({ error: '等级不足', message: `店铺达到 Lv.${row.level} 后才可以领取。` });
      return;
    }
    if (Number(row.claimed || 0)) {
      res.status(400).json({ error: '奖励已领取', message: '该等级奖励已经领取过。' });
      return;
    }

    const rewards = await applyLevelReward(saveId, Number(row.level));
    await run(
      `
        INSERT INTO save_level_rewards (save_id, level_reward_id, claimed, claimed_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(save_id, level_reward_id)
        DO UPDATE SET claimed = 1, claimed_at = CURRENT_TIMESTAMP
      `,
      [saveId, rewardId]
    );

    res.json({
      ok: true,
      level: row.level,
      title: row.unlock_content,
      rewards
    });
  } catch (error) {
    next(error);
  }
});

router.get('/backpack', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    await ensureSaveScopedData(saveId);
    const ingredientItems = await all(
      `
        SELECT
          ingredients.id AS source_id,
          'ingredient' AS type,
          ingredients.name,
          ingredients.description,
          ingredients.name AS icon_text,
          COALESCE(save_ingredients.stock, 0) AS quantity
        FROM ingredients
        JOIN save_ingredients
          ON save_ingredients.ingredient_id = ingredients.id
          AND save_ingredients.save_id = ?
        WHERE save_ingredients.unlocked = 1
      `,
      [saveId]
    );
    const giftItems = await all(
      `
        SELECT
          gifts.id AS source_id,
          'gift' AS type,
          gifts.gift_name AS name,
          gifts.effect_description AS description,
          gifts.gift_name AS icon_text,
          COALESCE(player_gifts.quantity, 0) AS quantity
        FROM gifts
        JOIN player_gifts
          ON player_gifts.gift_id = gifts.id
          AND player_gifts.save_id = ?
        WHERE player_gifts.quantity > 0
      `,
      [saveId]
    );
    const backpackItems = await all(
      `
        SELECT
          backpack_items.id AS source_id,
          'item' AS type,
          backpack_items.name,
          backpack_items.description,
          backpack_items.icon_text,
          COALESCE(save_backpack.quantity, 0) AS quantity
        FROM save_backpack
        JOIN backpack_items ON backpack_items.id = save_backpack.item_id
        WHERE save_backpack.save_id = ? AND save_backpack.quantity > 0
      `,
      [saveId]
    );

    res.json([...ingredientItems, ...giftItems, ...backpackItems].map((item) => ({
      ...item,
      icon_text: String(item.icon_text || '?').slice(0, 1)
    })));
  } catch (error) {
    next(error);
  }
});

router.get('/reviews', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const reviews = await all(`
      SELECT *
      FROM reviews
      WHERE save_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `, [saveId]);

    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

router.get('/gifts/:monsterId', async (req, res, next) => {
  try {
    const saveId = getRequestSaveId(req);
    const monsterId = Number(req.params.monsterId);
    const gifts = await all(
      `
        SELECT
          gifts.id,
          gifts.monster_id,
          gifts.gift_name,
          gifts.effect_description,
          gifts.satisfaction_bonus,
          COALESCE(player_gifts.quantity, 0) AS quantity
        FROM gifts
        LEFT JOIN player_gifts ON player_gifts.gift_id = gifts.id AND player_gifts.save_id = ?
        WHERE gifts.monster_id = ?
      `,
      [saveId, monsterId]
    );

    res.json(gifts);
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const orders = await all(`
      SELECT
        orders.id,
        orders.monster_id,
        monsters.name AS monster_name,
        orders.request_text,
        orders.selected_ingredients,
        orders.satisfaction,
        orders.coin_reward,
        orders.created_at
      FROM orders
      JOIN monsters ON monsters.id = orders.monster_id
      ORDER BY orders.created_at DESC
    `);

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const logs = await all(`
      SELECT
        id,
        prompt,
        ai_summary,
        manual_change,
        run_result
      FROM dev_logs
      ORDER BY id ASC
    `);

    res.json(logs);
  } catch (error) {
    next(error);
  }
});

router.post('/logs', async (req, res, next) => {
  try {
    const prompt = String(req.body.prompt || '').trim().slice(0, 1000);
    const aiSummary = String(req.body.ai_summary || '').trim().slice(0, 1000);
    const manualChange = String(req.body.manual_change || '').trim().slice(0, 1000);
    const runResult = String(req.body.run_result || '').trim().slice(0, 1000);

    if (!prompt || !aiSummary || !manualChange || !runResult) {
      res.status(400).json({
        error: '日志内容不完整',
        message: '提示词、AI 返回摘要、人工修改和运行结果都需要填写。'
      });
      return;
    }

    const columns = await getColumnNames('dev_logs');
    const insertColumns = ['prompt', 'ai_summary', 'manual_change', 'run_result'];
    const values = [prompt, aiSummary, manualChange, runResult];
    if (columns.includes('title')) {
      insertColumns.push('title');
      values.push(prompt.slice(0, 40));
    }
    if (columns.includes('content')) {
      insertColumns.push('content');
      values.push(`提示词：${prompt}\nAI 返回摘要：${aiSummary}\n人工修改：${manualChange}\n运行结果：${runResult}`);
    }
    if (columns.includes('summary')) {
      insertColumns.push('summary');
      values.push(aiSummary);
    }

    const result = await run(
      `
        INSERT INTO dev_logs (${insertColumns.join(', ')})
        VALUES (${insertColumns.map(() => '?').join(', ')})
      `,
      values
    );
    const log = await get('SELECT * FROM dev_logs WHERE id = ?', [result.id]);

    res.status(201).json({ ok: true, log });
  } catch (error) {
    next(error);
  }
});

router.delete('/logs/:id', async (req, res, next) => {
  try {
    const logId = Number(req.params.id);
    if (!Number.isInteger(logId) || logId <= 0) {
      res.status(400).json({
        error: '日志编号无效',
        message: '请选择有效的开发日志。'
      });
      return;
    }

    const result = await run('DELETE FROM dev_logs WHERE id = ?', [logId]);
    if (!result.changes) {
      res.status(404).json({
        error: '日志不存在',
        message: '没有找到要删除的开发日志。'
      });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
