let currentCustomer = null;
let currentOrderDescription = '';
let currentRequestedTasteTags = [];
let availableIngredients = [];
let availableGifts = [];
let currentDrinkIngredients = [];
let currentGift = null;
let dayTimerId = null;
let customerTimerId = null;
let remainingSeconds = 90;
let customerWaitSeconds = 25;
let dayEnded = false;
let gamePaused = false;
let dayStarted = false;
let isTransitioning = false;
let customerBuffSatisfaction = 0;
let gummyStarBonus = 0;
let futureHintCount = 0;
const DAY_SECONDS = 90;
const CUSTOMER_WAIT_SECONDS = 25;
const GAME_STATE_KEY = 'monsterCafeGameState';
const PENDING_TUTORIAL_KEY = 'monsterCafePendingTutorialChoice';
const ACTIVE_TUTORIAL_KEY = 'monsterCafeTutorialActive';
const INITIAL_REWARD_SHOWN_KEY = 'monsterCafeInitialRewardShown';
const LOADING_TIPS = [
  '和怪兽打好关系，可能会有意想不到的惊喜喔～',
  '甜味不一定万能，但 Momo 大概率会很开心。',
  '库存见底时先补货，老板的从容来自货架。',
  '有些小怪兽嘴上挑剔，其实只是想被认真记住。',
  '星光标签适合夜晚，也适合一点点仪式感。',
  '等待太久的顾客会闹脾气，暂停不算等待时间。',
  '礼物不是必需品，但送对了会让关系升温。',
  '苦味和热饮经常很搭，成熟顾客会点头。',
  '气泡饮品会让杯子看起来更热闹。',
  '成就奖励需要手动领取，别让奖励躺在图鉴里。',
  '新的一天开始前，先看一眼背包会更稳。',
  '讨厌的口味要避开，满意度会诚实地扣分。',
  '满分订单一定有解，关键是先准备好原料。',
  '补货状态会暂停营业，不会偷偷流失时间。',
  '怪兽故事读完后，图鉴上的小红点就会消失。'
];
const dayStats = {
  customersServed: 0,
  totalIncome: 0,
  totalIngredientCost: 0,
  totalSatisfaction: 0,
  totalXp: 0,
  badReviews: 0,
  departedCustomers: 0,
  reviews: [],
  targetCustomers: 3
};

async function fetchJson(url, options = {}) {
  const selectedSave = localStorage.getItem('monsterCafeSelectedSave');
  const headers = {
    ...(options.headers || {})
  };
  if (selectedSave) {
    headers['X-Save-Id'] = selectedSave;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch (error) {
      message = `请求失败：${response.status}`;
    }
    throw new Error(message);
  }

  return response.json();
}

function isExternalLoadingPage() {
  return !document.querySelector('.game-page') && !document.body.classList.contains('title-screen');
}

function createLoadingOverlay() {
  let overlay = document.querySelector('[data-page-loading]');
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.className = 'page-loading';
  overlay.dataset.pageLoading = 'true';
  overlay.innerHTML = `
    <div class="loading-card" role="status" aria-live="polite">
      <div class="pudding-row" aria-hidden="true">
        <span>🍮</span>
        <span>🍮</span>
        <span>🍮</span>
      </div>
      <div class="loading-track"><div class="loading-fill" data-loading-fill></div></div>
      <p data-loading-tip></p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function startPageLoading() {
  if (!isExternalLoadingPage()) {
    return null;
  }

  const overlay = createLoadingOverlay();
  const fill = overlay.querySelector('[data-loading-fill]');
  const tip = overlay.querySelector('[data-loading-tip]');
  let progress = 8;
  let tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
  overlay.hidden = false;
  fill.style.width = `${progress}%`;
  tip.textContent = LOADING_TIPS[tipIndex];

  const progressTimer = setInterval(() => {
    progress = Math.min(88, progress + Math.max(1, (90 - progress) * 0.08));
    fill.style.width = `${progress}%`;
  }, 120);

  const tipTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
    tip.textContent = LOADING_TIPS[tipIndex];
  }, 1500);

  return {
    finish() {
      clearInterval(progressTimer);
      clearInterval(tipTimer);
      fill.style.width = '100%';
      setTimeout(() => {
        overlay.hidden = true;
      }, 180);
    }
  };
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function renderList(selector, items, renderItem) {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }

  if (!items.length) {
    element.innerHTML = '<p class="empty-note">暂无数据。</p>';
    return;
  }

  element.innerHTML = items.map(renderItem).join('');
}

function renderTasteTags(tags) {
  return tags.map((tag) => `<span class="tag">${tag}</span>`).join('');
}

function getUnlockCost(ingredient) {
  return ingredient.price * 5;
}

function resetDayStats() {
  dayStats.customersServed = 0;
  dayStats.totalIncome = 0;
  dayStats.totalIngredientCost = 0;
  dayStats.totalSatisfaction = 0;
  dayStats.totalXp = 0;
  dayStats.badReviews = 0;
  dayStats.departedCustomers = 0;
  dayStats.reviews = [];
  dayStats.targetCustomers = getTargetCustomers();
  customerBuffSatisfaction = 0;
  gummyStarBonus = 0;
  futureHintCount = 0;
  updateCustomerCounter();
}

function getTargetCustomers() {
  const day = Number(document.querySelector('[data-current-day]')?.textContent || 1);
  if (day >= 8) return 5;
  if (day >= 4) return 4;
  return 3;
}

function updateCustomerCounter() {
  setText('[data-served-count]', dayStats.customersServed + dayStats.departedCustomers);
  setText('[data-target-count]', dayStats.targetCustomers);
}

function renderStars(count) {
  const fullStars = Math.floor(Number(count || 0));
  const halfStar = Number(count || 0) % 1 >= 0.5 ? '⯨' : '';
  return '★'.repeat(fullStars) + halfStar + '☆'.repeat(Math.max(0, 5 - fullStars - (halfStar ? 1 : 0)));
}

function getSettlementStars(value, thresholds) {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value >= thresholds[index]) {
      return 5 - index;
    }
  }

  return value > 0 ? 1 : 0;
}

function calculateLocalDaySummary() {
  const customersServed = dayStats.customersServed;
  const badReviews = dayStats.badReviews || 0;
  const reviewedCustomers = customersServed + badReviews;
  const totalIncome = dayStats.totalIncome;
  const totalIngredientCost = dayStats.totalIngredientCost;
  const totalXp = dayStats.totalXp || 0;
  const profit = totalIncome - totalIngredientCost;
  const avgSatisfaction = reviewedCustomers
    ? Math.round(dayStats.totalSatisfaction / reviewedCustomers)
    : 0;
  const profitStars = getSettlementStars(profit, [100, 70, 40, 15]);
  const customerStars = getSettlementStars(reviewedCustomers, [8, 6, 4, 2]);
  const satisfactionStars = getSettlementStars(avgSatisfaction, [90, 75, 60, 40]);
  const overallStars = reviewedCustomers > 0
    ? Math.max(1, Math.round((profitStars + customerStars + satisfactionStars) / 3))
    : 0;

  return {
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
    overall_stars: Math.min(5.5, overallStars + gummyStarBonus),
    gummy_star_bonus: gummyStarBonus,
    drink_xp: totalXp,
    settlement_xp: Math.max(0, Math.round(customersServed * 10 + avgSatisfaction * 0.45 + Math.max(profit, 0) * 0.35 + overallStars * 8 - badReviews * 12)),
    xp_gained: totalXp + Math.max(0, Math.round(customersServed * 10 + avgSatisfaction * 0.45 + Math.max(profit, 0) * 0.35 + overallStars * 8 - badReviews * 12)),
    coin_bonus: overallStars * 10
  };
}

function setTimerText() {
  setText('[data-day-timer]', remainingSeconds);
}

function isGamePage() {
  return Boolean(document.querySelector('.game-page'));
}

function isShopPage() {
  return Boolean(document.querySelector('.shop-page'));
}

function isHomePage() {
  return Boolean(document.querySelector('.home-page'));
}

function getGameMode() {
  return new URLSearchParams(window.location.search).get('mode') || localStorage.getItem('monsterCafeNextGameMode') || 'new';
}

function clearGameIntervals() {
  clearInterval(dayTimerId);
  clearInterval(customerTimerId);
  dayTimerId = null;
  customerTimerId = null;
}

function setMainNavigationLocked(locked) {
  const header = document.querySelector('[data-main-header]');
  if (header) {
    header.classList.toggle('is-navigation-locked', locked);
  }
}

function getSavedGameState() {
  try {
    return JSON.parse(localStorage.getItem(getSaveStateKey()) || 'null');
  } catch (error) {
    return null;
  }
}

function getSaveStateKey() {
  return `${GAME_STATE_KEY}:${localStorage.getItem('monsterCafeSelectedSave') || '1'}`;
}

function saveGameState(mode = 'saved-day') {
  const state = {
    mode,
    remainingSeconds,
    customerWaitSeconds,
    dayEnded,
    dayStarted,
    customerBuffSatisfaction,
    gummyStarBonus,
    futureHintCount,
    dayStats: { ...dayStats },
    currentCustomer,
    currentOrderDescription,
    currentRequestedTasteTags,
    currentDrinkIngredientIds: currentDrinkIngredients.map((ingredient) => ingredient.id)
  };

  localStorage.setItem(getSaveStateKey(), JSON.stringify(state));
}

function clearSavedGameState() {
  localStorage.removeItem(getSaveStateKey());
}

function clearLoginState() {
  const selectedSave = localStorage.getItem('monsterCafeSelectedSave');
  if (selectedSave) {
    localStorage.removeItem(`${GAME_STATE_KEY}:${selectedSave}`);
  }
  localStorage.removeItem('monsterCafeSelectedSave');
  localStorage.removeItem('monsterCafePlayerName');
  localStorage.removeItem('monsterCafeNextGameMode');
  localStorage.removeItem(PENDING_TUTORIAL_KEY);
  localStorage.removeItem(ACTIVE_TUTORIAL_KEY);
  localStorage.removeItem(INITIAL_REWARD_SHOWN_KEY);
}

function requestReturnTitle() {
  if (sessionStorage.getItem('monsterCafeSkipReturnTitleConfirm') === '1') {
    confirmReturnTitle();
    return;
  }

  const modal = document.querySelector('[data-return-title-modal]');
  if (modal) {
    modal.hidden = false;
  }
}

function confirmReturnTitle() {
  const skip = document.querySelector('[data-skip-return-title-confirm]');
  if (skip && skip.checked) {
    sessionStorage.setItem('monsterCafeSkipReturnTitleConfirm', '1');
  }
  clearLoginState();
  window.location.href = 'start.html';
}

function restoreDayStats(savedStats = {}) {
  dayStats.customersServed = Number(savedStats.customersServed || 0);
  dayStats.totalIncome = Number(savedStats.totalIncome || 0);
  dayStats.totalIngredientCost = Number(savedStats.totalIngredientCost || 0);
  dayStats.totalSatisfaction = Number(savedStats.totalSatisfaction || 0);
  dayStats.totalXp = Number(savedStats.totalXp || 0);
  dayStats.badReviews = Number(savedStats.badReviews || 0);
  dayStats.departedCustomers = Number(savedStats.departedCustomers || 0);
  dayStats.reviews = savedStats.reviews || [];
  dayStats.targetCustomers = Number(savedStats.targetCustomers || getTargetCustomers());
  updateCustomerCounter();
}

function setCustomerWaitText() {
  const box = document.querySelector('[data-wait-box]');
  const timeElement = document.querySelector('[data-customer-wait-time]');
  const fill = document.querySelector('[data-customer-wait-fill]');
  const note = document.querySelector('[data-customer-wait-note]');

  if (!box || !timeElement || !fill || !note) {
    return;
  }

  if (!currentCustomer || dayEnded) {
    box.hidden = true;
    return;
  }

  box.hidden = false;
  timeElement.textContent = customerWaitSeconds;
  fill.style.width = `${Math.max(0, (customerWaitSeconds / CUSTOMER_WAIT_SECONDS) * 100)}%`;
  fill.classList.toggle('is-warning', customerWaitSeconds <= 10);
  fill.classList.toggle('is-danger', customerWaitSeconds <= 5);

  const mood = getCurrentCustomerMood();

  if (mood === 'angry') {
    note.textContent = '顾客快要等不住了，再不制作就会离开。';
  } else if (mood === 'impatient') {
    note.textContent = '顾客心情变差了一档，正在焦急地看着柜台。';
  } else {
    note.textContent = '心情稳定，正在期待饮品。';
  }

  const moodElement = document.querySelector('[data-customer-mood]');
  if (moodElement) {
    moodElement.textContent = getMoodLabel(mood);
  }
}

function getCurrentCustomerMood() {
  if (!currentCustomer) return 'normal';
  if (customerWaitSeconds <= 5) return 'angry';
  if (customerWaitSeconds <= 12) return 'impatient';
  return 'normal';
}

function getMoodLabel(mood) {
  if (mood === 'angry') return '生气';
  if (mood === 'impatient') return '不耐烦';
  if (mood === 'happy') return '开心';
  return '普通';
}

function runGameTimers() {
  clearGameIntervals();
  if (!isGamePage() || isTutorialMode() || dayEnded || gamePaused || !dayStarted || isTransitioning) {
    return;
  }

  dayTimerId = setInterval(() => {
    remainingSeconds -= 1;
    setTimerText();

    if (remainingSeconds <= 0) {
      endDay();
    }
  }, 1000);

  customerTimerId = setInterval(() => {
    if (!currentCustomer || dayEnded || gamePaused) {
      return;
    }

    customerWaitSeconds -= 1;
    setCustomerWaitText();

    if (customerWaitSeconds <= 0) {
      handleCustomerTimeout();
    }
  }, 1000);
}

function startDayTimer() {
  const timerElement = document.querySelector('[data-day-timer]');
  if (!timerElement) {
    return;
  }

  clearGameIntervals();
  remainingSeconds = DAY_SECONDS;
  customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
  dayEnded = false;
  gamePaused = false;
  dayStarted = true;
  resetDayStats();
  setTimerText();
  setCustomerWaitText();
  runGameTimers();
}

async function playCountdown(finalText = '开始！') {
  const overlay = document.querySelector('[data-countdown-overlay]');
  const text = document.querySelector('[data-countdown-text]');
  if (!overlay || !text) {
    return;
  }

  overlay.hidden = false;
  const steps = ['3', '2', '1', finalText];
  for (const step of steps) {
    text.textContent = step;
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  overlay.hidden = true;
}

async function beginNewDay() {
  if (!isGamePage() || dayStarted || isTransitioning) {
    return;
  }

  isTransitioning = true;
  clearSavedGameState();
  clearGameIntervals();
  await playCountdown(isTutorialMode() ? '教程开始！' : (getGameMode() === 'resume' ? '继续！' : '开始！'));
  startDayTimer();
  if (isTutorialMode()) {
    loadTutorialCustomer();
    runGameTutorialGuide();
  } else {
    await loadNextCustomer();
  }
  isTransitioning = false;
  runGameTimers();
}

function pauseGame(showModal = true) {
  if (dayEnded || !dayStarted) {
    return;
  }

  if (gamePaused) {
    return;
  }

  if (!dayStarted || isTransitioning) {
    return;
  }

  gamePaused = true;
  clearGameIntervals();

  const modal = document.querySelector('[data-pause-modal]');
  if (modal && showModal) {
    modal.hidden = false;
  }
  renderIngredientButtons();
}

function resumeGame() {
  if (dayEnded) {
    return;
  }

  gamePaused = false;
  const pauseModal = document.querySelector('[data-pause-modal]');
  const exitModal = document.querySelector('[data-exit-modal]');
  if (pauseModal) pauseModal.hidden = true;
  if (exitModal) exitModal.hidden = true;
  renderIngredientButtons();
  runGameTimers();
}

function goRestockFromGame() {
  pauseGame(false);
  saveGameState('restocking');
  window.location.href = 'shop.html?restock=1';
}

function finishRestock() {
  const state = getSavedGameState();
  if (state && state.mode === 'restocking') {
    state.mode = 'resume-from-restock';
    localStorage.setItem(getSaveStateKey(), JSON.stringify(state));
  }

  window.location.href = 'game.html';
}

function setupRestockShopMode() {
  const banner = document.querySelector('[data-restock-banner]');
  const finishButton = document.querySelector('[data-finish-restock-button]');
  const state = getSavedGameState();
  const isRestocking = Boolean(state && state.mode === 'restocking');

  if (!banner || !finishButton || !isRestocking) {
    return;
  }

  banner.hidden = false;
  setMainNavigationLocked(true);
  finishButton.addEventListener('click', finishRestock);
}

function showExitConfirm() {
  const pauseModal = document.querySelector('[data-pause-modal]');
  const exitModal = document.querySelector('[data-exit-modal]');
  if (pauseModal) pauseModal.hidden = true;
  if (exitModal) exitModal.hidden = false;
}

function saveAndExitDay() {
  pauseGame(false);
  saveGameState('saved-day');
  window.location.href = 'index.html';
}

function discardAndExitDay() {
  pauseGame(false);
  clearSavedGameState();
  window.location.href = 'index.html';
}

function restoreSavedGameState(autoRun = true) {
  const state = getSavedGameState();
  if (!state || !['saved-day', 'restocking', 'resume-from-restock'].includes(state.mode)) {
    return false;
  }

  remainingSeconds = Number(state.remainingSeconds || DAY_SECONDS);
  customerWaitSeconds = Number(state.customerWaitSeconds || CUSTOMER_WAIT_SECONDS);
  dayEnded = Boolean(state.dayEnded);
  dayStarted = Boolean(state.dayStarted);
  customerBuffSatisfaction = Number(state.customerBuffSatisfaction || 0);
  gummyStarBonus = Number(state.gummyStarBonus || 0);
  futureHintCount = Number(state.futureHintCount || 0);
  gamePaused = false;
  restoreDayStats(state.dayStats);
  currentCustomer = state.currentCustomer || null;
  currentOrderDescription = state.currentOrderDescription || '';
  currentRequestedTasteTags = state.currentRequestedTasteTags || [];
  currentDrinkIngredients = (state.currentDrinkIngredientIds || [])
    .map((id) => availableIngredients.find((ingredient) => ingredient.id === id))
    .filter(Boolean);

  setTimerText();
  renderCurrentDrink();
  renderReviewWall();

  if (currentCustomer) {
    renderCustomer({
      monster: currentCustomer,
      order_description: currentOrderDescription,
      recommended_taste_tags: currentRequestedTasteTags
    });
  }

  setCustomerWaitText();
  renderIngredientButtons();
  clearSavedGameState();
  if (dayStarted && autoRun) {
    runGameTimers();
  }
  return true;
}

function showShopMessage(message, type = 'ok') {
  const messagePanel = document.querySelector('[data-shop-message]');
  if (!messagePanel) {
    return;
  }

  messagePanel.innerHTML = `<p class="${type === 'error' ? 'shop-error' : 'shop-ok'}">${message}</p>`;
}

function getMoodText(monster) {
  if (!monster) {
    return '等待中';
  }
  if (monster.best_satisfaction >= 80) {
    return '超级期待';
  }
  if (monster.visit_count > 0) {
    return '熟客安心';
  }
  if (!monster.unlocked) {
    return '有点害羞';
  }

  return '期待点单';
}

async function loadPlayerStatus() {
  try {
    const player = await fetchJson('/api/player');
    setText('[data-player-name]', player.name);
    setText('[data-home-player-name]', player.name || localStorage.getItem('monsterCafePlayerName') || '咖啡馆老板');
    setText('[data-player-coins]', player.coins);
    setText('[data-business-days]', player.business_days);
    setText('[data-current-day]', Number(player.business_days || 0) + 1);
    setText('[data-shop-level]', player.shop_level);
    setText('[data-total-satisfaction]', player.total_satisfaction);
    setText('[data-player-xp]', player.xp || 0);
    renderHomeXpProgress(player);
  } catch (error) {
    console.error(error);
  }
}

function renderHomeXpProgress(player) {
  const xpProgress = document.querySelector('[data-xp-progress]');
  const nextLevelXp = document.querySelector('[data-next-level-xp]');
  if (!xpProgress || !nextLevelXp || !player) {
    return;
  }

  const level = Number(player.shop_level || 1);
  const xp = Number(player.xp || 0);
  const currentLevelStart = (level - 1) * 120;
  const nextLevel = level * 120;
  const progress = Math.max(0, Math.min(100, ((xp - currentLevelStart) / 120) * 100));
  nextLevelXp.textContent = nextLevel;
  xpProgress.style.width = `${progress}%`;
}

async function loadIngredients() {
  try {
    const ingredients = await fetchJson('/api/ingredients');
    availableIngredients = ingredients;

    if (document.querySelector('[data-shop]')) {
      renderShop();
      return;
    }

    if (document.querySelector('.ingredient-button-grid')) {
      renderIngredientButtons();
      return;
    }

    renderList('[data-ingredients]', ingredients, (item) => `
      <article class="card ingredient-card">
        <h3>${item.name}</h3>
        <p><span class="tag">口味：${item.taste_tags}</span></p>
        <p>${item.description}</p>
        <p>库存：${item.stock} ｜ 价格：${item.price} 金币</p>
        <p>状态：${item.unlocked ? '已解锁' : '未解锁'}</p>
      </article>
    `);
  } catch (error) {
    console.error(error);
  }
}

function renderShop() {
  const shopPanel = document.querySelector('[data-shop]');
  if (!shopPanel) {
    return;
  }

  if (!availableIngredients.length) {
    shopPanel.innerHTML = '<p class="empty-note">商店暂时没有原料。</p>';
    return;
  }

  shopPanel.innerHTML = availableIngredients.map((item) => {
    const unlockCost = getUnlockCost(item);
    return `
      <article class="shop-card ${item.unlocked ? '' : 'shop-card-locked'}">
        <div class="shop-card-head">
          <h3>${item.name}</h3>
          <span class="tag">${item.unlocked ? '已解锁' : '未解锁'}</span>
        </div>
        <p><span class="tag">口味：${item.taste_tags}</span></p>
        <p>${item.description}</p>
        <div class="shop-stats">
          <span>价格：${item.price} 金币</span>
          <span>库存：${item.stock}</span>
          <span>解锁：${unlockCost} 金币</span>
        </div>
        <div class="shop-actions">
          ${
            item.unlocked
              ? `<button class="button" type="button" data-buy-ingredient="${item.id}">购买 1 份</button>`
              : `<button class="button" type="button" data-unlock-ingredient="${item.id}">解锁原料</button>`
          }
        </div>
      </article>
    `;
  }).join('');

  shopPanel.querySelectorAll('[data-buy-ingredient]').forEach((button) => {
    button.addEventListener('click', () => buyIngredient(Number(button.dataset.buyIngredient), 'buy'));
  });

  shopPanel.querySelectorAll('[data-unlock-ingredient]').forEach((button) => {
    button.addEventListener('click', () => buyIngredient(Number(button.dataset.unlockIngredient), 'unlock'));
  });
}

async function buyIngredient(ingredientId, action) {
  showShopMessage('正在和供货小精灵结算。');

  try {
    const result = await fetchJson('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ingredientId,
        action,
        quantity: 1
      })
    });

    showShopMessage(`${result.message} 花费 ${result.cost} 金币。`);
    await loadPlayerStatus();
    await loadIngredients();
  } catch (error) {
    console.error(error);
    showShopMessage('购买失败，可能是金币不足或原料尚未解锁。', 'error');
  }
}

async function loadGiftsForCustomer(monsterId) {
  availableGifts = [];
  if (!monsterId) {
    renderIngredientButtons();
    return;
  }

  try {
    availableGifts = await fetchJson(`/api/gifts/${monsterId}`);
  } catch (error) {
    console.error(error);
    availableGifts = [];
  }

  renderIngredientButtons();
}

function renderIngredientButtons() {
  const grid = document.querySelector('[data-ingredients]');
  if (!grid) {
    return;
  }

  if (!availableIngredients.length) {
    grid.innerHTML = '<p class="empty-note">暂无可用原料。</p>';
    return;
  }

  const giftButtons = availableGifts
    .filter((gift) => gift.quantity > 0)
    .map((gift) => `
      <button
        class="ingredient-button gift-button ${currentGift && currentGift.id === gift.id ? 'is-selected' : ''}"
        type="button"
        data-add-gift="${gift.id}"
        ${gamePaused || dayEnded || !currentCustomer ? 'disabled' : ''}
      >
        <em class="stock-badge gift-badge">加成</em>
        <strong>${gift.gift_name}</strong>
        <span>${gift.effect_description}</span>
        <small>库存 ${gift.quantity} ｜ 本杯最多 1 个礼物</small>
      </button>
    `);

  const ingredientButtons = availableIngredients.map((item) => {
    const selected = currentDrinkIngredients.some((ingredient) => ingredient.id === item.id);
    const outOfStock = item.stock <= 0;
    const disabled = !item.unlocked || selected || outOfStock || gamePaused || dayEnded || !currentCustomer;
    return `
      <button
        class="ingredient-button ${selected ? 'is-selected' : ''} ${outOfStock ? 'is-out-of-stock' : ''}"
        type="button"
        data-add-ingredient="${item.id}"
        ${disabled ? 'disabled' : ''}
      >
        ${outOfStock ? '<em class="stock-badge">缺货</em>' : ''}
        <strong>${item.name}</strong>
        <span>${item.taste_tags}</span>
        <small>库存 ${item.stock}</small>
      </button>
    `;
  });

  grid.innerHTML = [...giftButtons, ...ingredientButtons].join('');

  grid.querySelectorAll('[data-add-gift]').forEach((button) => {
    button.addEventListener('click', () => addGiftToDrink(Number(button.dataset.addGift)));
  });

  grid.querySelectorAll('[data-add-ingredient]').forEach((button) => {
    button.addEventListener('click', () => addIngredientToDrink(Number(button.dataset.addIngredient)));
  });
}

function addGiftToDrink(giftId) {
  if (!currentCustomer || gamePaused || dayEnded) {
    return;
  }

  const gift = availableGifts.find((item) => item.id === giftId && item.quantity > 0);
  if (!gift) {
    return;
  }

  currentGift = currentGift && currentGift.id === giftId ? null : gift;
  renderCurrentDrink();
  renderIngredientButtons();
}

function addIngredientToDrink(ingredientId) {
  const ingredient = availableIngredients.find((item) => item.id === ingredientId);
  if (!ingredient || !ingredient.unlocked || ingredient.stock <= 0 || gamePaused || dayEnded) {
    return;
  }

  if (!currentDrinkIngredients.some((item) => item.id === ingredientId)) {
    currentDrinkIngredients.push(ingredient);
  }

  renderCurrentDrink();
  renderIngredientButtons();
}

function removeIngredientFromDrink(ingredientId) {
  currentDrinkIngredients = currentDrinkIngredients.filter((item) => item.id !== ingredientId);
  renderCurrentDrink();
  renderIngredientButtons();
}

function clearCurrentDrink() {
  currentDrinkIngredients = [];
  currentGift = null;
  renderCurrentDrink();
  renderIngredientButtons();
}

function renderCurrentDrink() {
  const panel = document.querySelector('[data-current-drink]');
  if (!panel) {
    return;
  }

  if (!currentDrinkIngredients.length && !currentGift) {
    panel.innerHTML = '<p class="empty-note">点击右侧原料加入饮品。</p>';
    return;
  }

  panel.innerHTML = `
    <div class="drink-chip-list">
      ${currentDrinkIngredients.map((item) => `
        <button class="drink-chip" type="button" data-remove-ingredient="${item.id}">
          ${item.name}
        </button>
      `).join('')}
      ${currentGift ? `<button class="drink-chip gift-chip" type="button" data-remove-gift>${currentGift.gift_name}</button>` : ''}
    </div>
    <p class="empty-note">再次点击饮品中的原料可移除。</p>
  `;

  panel.querySelectorAll('[data-remove-ingredient]').forEach((button) => {
    button.addEventListener('click', () => removeIngredientFromDrink(Number(button.dataset.removeIngredient)));
  });
  panel.querySelectorAll('[data-remove-gift]').forEach((button) => {
    button.addEventListener('click', () => {
      currentGift = null;
      renderCurrentDrink();
      renderIngredientButtons();
    });
  });
}

function renderReviewWall() {
  const wall = document.querySelector('[data-review-wall]');
  if (!wall) {
    return;
  }

  if (!dayStats.reviews.length) {
    wall.innerHTML = `
      <div class="pin"></div>
      <article class="sticky-note empty-sticky">
        <strong>今日还没有评价</strong>
        <p>完成第一杯饮品后，顾客评价会贴在这里。</p>
      </article>
    `;
    return;
  }

  wall.innerHTML = `
    <div class="pin"></div>
    ${dayStats.reviews.slice(-5).reverse().map((review, index) => `
      <article class="sticky-note" style="--note-index:${index};">
        <strong>${review.monsterName}</strong>
        <p>满意度：${review.satisfaction}</p>
        <p>${review.text}</p>
        <p>金币：${review.coins}${review.usedGift ? ' ｜ 使用礼物' : ''}</p>
      </article>
    `).join('')}
  `;
}

async function loadMonsters() {
  try {
    const monsters = await fetchJson('/api/monsters');
    renderList('[data-monsters]', monsters, (item) => `
      <article class="card">
        <h3>${item.unlocked ? '★' : '？'} ${item.name}</h3>
        <p><span class="tag">种族：${item.species}</span></p>
        <p>喜欢：${item.liked_taste} ｜ 讨厌：${item.disliked_taste}</p>
        <p>${item.description}</p>
        <p>台词：${item.dialogue}</p>
        <p>来店次数：${item.visit_count} ｜ 最高满意度：${item.best_satisfaction}</p>
      </article>
    `);
  } catch (error) {
    console.error(error);
  }
}

function getReadStories(monster) {
  try {
    const value = typeof monster.read_stories === 'string'
      ? JSON.parse(monster.read_stories || '[]')
      : monster.read_stories || [];
    return Array.isArray(value) ? value.map((item) => Number(item)) : [];
  } catch (error) {
    return [];
  }
}

function hasUnreadUnlockedStory(monster) {
  if (!monster || !Number(monster.unlocked || 0)) {
    return false;
  }

  const affinity = Number(monster.affinity || 0);
  const readStories = getReadStories(monster);
  return [100, 300, 500].some((threshold) => affinity >= threshold && !readStories.includes(threshold));
}

function renderCollectionNavBubble(hasTodo) {
  document.querySelectorAll('[data-collection-nav-bubble]').forEach((bubble) => {
    bubble.hidden = !hasTodo;
  });
}

async function loadCollectionTodoSummary() {
  if (!localStorage.getItem('monsterCafeSelectedSave')) {
    renderCollectionNavBubble(false);
    return;
  }

  try {
    const result = await fetchJson('/api/collection/todos');
    renderCollectionNavBubble(Boolean(result.has_todo));
  } catch (error) {
    console.error(error);
    renderCollectionNavBubble(false);
  }
}

async function loadCollection() {
  const collectionPanel = document.querySelector('[data-collection]');
  if (!collectionPanel) {
    return;
  }

  try {
    const collection = await fetchJson('/api/collection');
    if (!collection.length) {
      collectionPanel.innerHTML = '<p class="empty-note">图鉴里暂时没有怪兽档案。</p>';
      renderCollectionNavBubble(false);
      return;
    }

    renderCollectionNavBubble(collection.some((item) => hasUnreadUnlockedStory(item)));

    collectionPanel.innerHTML = collection.map((item) => {
      if (!item.unlocked) {
        return `
          <article class="collection-card locked-card">
            <div class="collection-portrait locked-portrait">?</div>
            <h3>未知怪兽</h3>
            <p class="empty-note">档案未解锁</p>
            <p>继续营业，等待这位顾客现身。</p>
          </article>
        `;
      }

      const hasStoryTodo = hasUnreadUnlockedStory(item);
      return `
        <article class="collection-card" data-monster-detail="${item.monster_id}">
          ${hasStoryTodo ? '<span class="todo-bubble">!</span>' : ''}
          <div class="collection-portrait">${item.monster_name.slice(0, 1)}</div>
          <h3>${item.monster_name}</h3>
          <p><span class="tag">${item.species}</span> <span class="tag">${item.tag || '普通顾客'}</span></p>
          <p>${item.description}</p>
          <div class="collection-stats">
            <span>来店次数：${item.visit_count}</span>
            <span>最高满意度：${item.best_satisfaction}</span>
            <span>好感度：${item.affinity || 0}</span>
          </div>
        </article>
      `;
    }).join('');

    collectionPanel.querySelectorAll('[data-monster-detail]').forEach((card) => {
      card.addEventListener('click', () => {
        const monster = collection.find((item) => String(item.monster_id) === card.dataset.monsterDetail);
        showCollectionDetail(monster);
      });
    });
  } catch (error) {
    console.error(error);
    collectionPanel.innerHTML = '<p class="empty-note">图鉴读取失败，请稍后再试。</p>';
  }
}

function showCollectionDetail(monster) {
  const modal = document.querySelector('[data-collection-detail-modal]');
  const detail = document.querySelector('[data-collection-detail]');
  if (!modal || !detail || !monster) {
    return;
  }

  const stories = [
    { threshold: 100, title: '第一段故事', text: '这位怪兽开始记住 Monster Café 的香气。' },
    { threshold: 300, title: '第二段故事', text: '它把咖啡馆当成了熟悉的休息处。' },
    { threshold: 500, title: '第三段故事', text: '它成为老朋友，即使等待太久也不会留下差评。' }
  ];
  const readStories = getReadStories(monster);

  detail.innerHTML = `
    <h2>${monster.monster_name}</h2>
    <div class="collection-detail-grid">
      <div class="collection-portrait">${monster.monster_name.slice(0, 1)}</div>
      <div>
        <p><span class="tag">${monster.species}</span> <span class="tag">${monster.tag || '普通顾客'}</span></p>
        <p>喜欢：${monster.liked_taste} ｜ 讨厌：${monster.disliked_taste}</p>
        <p>来店次数：${monster.visit_count} ｜ 最高满意度：${monster.best_satisfaction}</p>
        <p>当前好感度：${monster.affinity || 0} ｜ 关系等级：${monster.relationship_level || '陌生'}</p>
        <p>已获得礼物：${monster.gift_name || '暂无'} × ${monster.gift_quantity || 0}</p>
        ${monster.special_effect ? `<p class="shop-ok">特殊效果：${monster.special_effect}</p>` : ''}
      </div>
    </div>
    <h3>故事列表</h3>
    <div class="story-list">
      ${stories.map((story) => `
        <article class="card ${Number(monster.affinity || 0) >= story.threshold ? '' : 'locked-card'}">
          <h3>${Number(monster.affinity || 0) >= story.threshold ? story.title : '未解锁故事'}</h3>
          <p>${Number(monster.affinity || 0) >= story.threshold ? story.text : `好感度达到 ${story.threshold} 后解锁。`}</p>
          ${
            Number(monster.affinity || 0) >= story.threshold
              ? `<button class="button small-button" type="button" data-read-story="${story.threshold}">${readStories.includes(story.threshold) ? '已读' : '标记已读'}</button>`
              : ''
          }
        </article>
      `).join('')}
    </div>
  `;
  modal.hidden = false;

  detail.querySelectorAll('[data-read-story]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (button.textContent === '已读') return;
      await markStoryRead(monster.monster_id, Number(button.dataset.readStory));
      button.textContent = '已读';
    });
  });
}

async function markStoryRead(monsterId, threshold) {
  try {
    const result = await fetchJson(`/api/collection/${monsterId}/read-story`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ threshold })
    });
    await loadCollection();
    await loadCollectionTodoSummary();
    showRewardPopup(result.rewards || []);
  } catch (error) {
    console.error(error);
  }
}

async function loadAchievements() {
  const panel = document.querySelector('[data-achievements]');

  if (!localStorage.getItem('monsterCafeSelectedSave')) {
    renderAchievementSummary([]);
    if (panel) {
      panel.innerHTML = '<p class="empty-note">请先读取或新建一个存档。</p>';
    }
    return;
  }

  try {
    const achievements = (await fetchJson('/api/achievements')).map((item) => ({
      ...item,
      completed: Boolean(Number(item.completed || 0)),
      claimed: Boolean(Number(item.claimed || 0)),
      current_progress: Number(item.current_progress || 0),
      target_progress: Number(item.target_progress || 1)
    })).sort((a, b) => {
      const rank = (item) => {
        if (item.completed && !item.claimed) return 0;
        if (!item.completed) return 1;
        return 2;
      };
      return rank(a) - rank(b) || a.id - b.id;
    });
    renderAchievementSummary(achievements);
    if (!panel) {
      return;
    }

    panel.innerHTML = achievements.map((item) => {
      const canClaim = item.completed && !item.claimed;
      return `
      <article class="achievement-card ${item.claimed ? 'is-completed' : ''}" data-achievement-id="${item.id}">
        ${canClaim ? '<span class="todo-bubble">!</span>' : ''}
        <span class="tag">${item.category || '成就'}</span>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
        <p>${item.claimed ? '已完成' : `进度：${item.current_progress || 0}/${item.target_progress || 1}`}</p>
        <p class="empty-note">奖励：${item.reward_content || `${item.reward_coins || 0} 金币 / ${item.reward_xp || 0} 经验`}</p>
      </article>
    `;
    }).join('');
    panel.querySelectorAll('[data-achievement-id]').forEach((card) => {
      card.addEventListener('click', () => claimAchievement(Number(card.dataset.achievementId)));
    });
  } catch (error) {
    console.error(error);
    if (panel) {
      panel.innerHTML = '<p class="empty-note">成就读取失败。</p>';
    }
  }
}

async function claimAchievement(achievementId) {
  try {
    const result = await fetchJson(`/api/achievements/${achievementId}/claim`, { method: 'POST' });
    showRewardPopup(result.rewards || []);
    await loadAchievements();
    await loadPlayerStatus();
  } catch (error) {
    if (!String(error.message || '').includes('尚未完成') && !String(error.message || '').includes('已领取')) {
      console.error(error);
    }
  }
}

function renderAchievementSummary(achievements) {
  const normalizedAchievements = achievements.map((item) => ({
    ...item,
    completed: Boolean(Number(item.completed || 0)),
    claimed: Boolean(Number(item.claimed || 0))
  }));
  const done = normalizedAchievements.filter((item) => item.claimed).length;
  const total = achievements.length;
  setText('[data-achievement-done]', done);
  setText('[data-achievement-total]', total);

  const fill = document.querySelector('[data-achievement-progress]');
  if (fill) {
    fill.style.width = `${total ? (done / total) * 100 : 0}%`;
  }

  document.querySelectorAll('[data-achievement-nav-bubble]').forEach((bubble) => {
    bubble.hidden = !normalizedAchievements.some((item) => item.completed && !item.claimed);
  });
}

function renderLevelRewardNavBubble(hasTodo) {
  document.querySelectorAll('[data-level-reward-nav-bubble]').forEach((bubble) => {
    bubble.hidden = !hasTodo;
  });
}

async function loadLevelRewardSummary() {
  if (!localStorage.getItem('monsterCafeSelectedSave')) {
    renderLevelRewardNavBubble(false);
    return;
  }

  try {
    const result = await fetchJson('/api/level-rewards');
    renderLevelRewardNavBubble(Boolean(result.has_todo));
    setText('[data-level-reward-current]', result.player_level || 1);
  } catch (error) {
    console.error(error);
    renderLevelRewardNavBubble(false);
  }
}

async function loadLevelRewards() {
  const panel = document.querySelector('[data-level-rewards]');
  if (!panel) {
    return loadLevelRewardSummary();
  }

  if (!localStorage.getItem('monsterCafeSelectedSave')) {
    renderLevelRewardNavBubble(false);
    panel.innerHTML = '<p class="empty-note">请先读取或新建一个存档。</p>';
    return;
  }

  try {
    const result = await fetchJson('/api/level-rewards');
    setText('[data-level-reward-current]', result.player_level || 1);
    renderLevelRewardNavBubble(Boolean(result.has_todo));
    panel.innerHTML = result.rewards.map((item) => {
      const claimed = Boolean(Number(item.claimed || 0));
      const canClaim = Boolean(Number(item.can_claim || 0));
      const unlocked = Boolean(Number(item.unlocked || 0));
      return `
        <article class="achievement-card ${claimed ? 'is-completed' : ''}" data-level-reward-id="${item.id}">
          ${canClaim ? '<span class="todo-bubble">!</span>' : ''}
          <span class="tag">Lv.${item.level}</span>
          <h3>${item.unlock_content}</h3>
          <p>${item.reward_content}</p>
          <p>${claimed ? '已领取' : unlocked ? '可领取' : `未解锁：需要 Lv.${item.level}`}</p>
        </article>
      `;
    }).join('');

    panel.querySelectorAll('[data-level-reward-id]').forEach((card) => {
      card.addEventListener('click', () => claimLevelReward(Number(card.dataset.levelRewardId)));
    });
  } catch (error) {
    console.error(error);
    panel.innerHTML = `<p class="empty-note">等级奖励读取失败：${error.message}</p>`;
  }
}

async function claimLevelReward(rewardId) {
  try {
    const result = await fetchJson(`/api/level-rewards/${rewardId}/claim`, { method: 'POST' });
    showRewardPopup(result.rewards || []);
    await loadLevelRewards();
    await loadPlayerStatus();
  } catch (error) {
    if (!String(error.message || '').includes('等级不足') && !String(error.message || '').includes('已领取')) {
      console.error(error);
    }
  }
}

async function loadBackpack() {
  const list = document.querySelector('[data-backpack-list]');
  if (!list) return;
  const detail = document.querySelector('[data-backpack-detail]');
  try {
    const items = await fetchJson('/api/backpack');
    if (!items.length) {
      list.innerHTML = '<p class="empty-note">背包里暂时没有物品。</p>';
      return;
    }
    list.innerHTML = items.map((item, index) => `
      <button class="backpack-item" type="button" data-backpack-index="${index}">
        <span>${item.icon_text || '?'}</span>
        <em>${item.quantity}</em>
      </button>
    `).join('');
    list.querySelectorAll('[data-backpack-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items[Number(button.dataset.backpackIndex)];
        if (!detail || !item) return;
        detail.innerHTML = `
          <h2>${item.name}</h2>
          <p>已获得数量：${item.quantity}</p>
          <p>物品简介：${item.description || '这个物品可以用于 Monster Café 的经营与调饮。'}</p>
        `;
      });
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<p class="empty-note">背包读取失败：${error.message}</p>`;
  }
}

function showRewardPopup(rewards = [], onClose = null) {
  if (!rewards.length) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop reward-popup-backdrop';
  backdrop.innerHTML = `
    <section class="day-modal reward-popup" role="dialog" aria-modal="true">
      <h2>获得奖励</h2>
      <div class="reward-grid">
        ${rewards.map((item) => `
          <div class="reward-item">
            <span>${item.icon_text || item.name.slice(0, 1)}</span>
            <em>${item.quantity}</em>
            <strong>${item.name}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    }
  });
  document.body.appendChild(backdrop);
}

async function getInitialRewards() {
  const rewards = [{ name: '金币', quantity: 500, icon_text: '金', description: '新手启动资金。' }];
  try {
    const ingredients = await fetchJson('/api/ingredients');
    ingredients
      .filter((item) => Number(item.unlocked || 0) === 1)
      .forEach((item) => {
        rewards.push({
          name: item.name,
          quantity: 2,
          icon_text: String(item.name || '?').slice(0, 1),
          description: item.description || '初始已解锁原料。'
        });
      });
  } catch (error) {
    console.error(error);
  }
  return rewards;
}

async function showInitialRewardPopup(onClose = null) {
  if (localStorage.getItem(INITIAL_REWARD_SHOWN_KEY) === '1') {
    if (typeof onClose === 'function') onClose();
    return;
  }

  localStorage.setItem(INITIAL_REWARD_SHOWN_KEY, '1');
  showRewardPopup(await getInitialRewards(), onClose);
}

async function loadLogs() {
  const panel = document.querySelector('[data-logs]');
  if (!panel) return;

  try {
    const logs = await fetchJson('/api/logs');
    renderList('[data-logs]', logs, (item) => `
      <article class="card">
        <div class="panel-title-row">
          <h3>提示词记录</h3>
          <button class="button danger-button small-button" type="button" data-delete-log="${item.id}">删除</button>
        </div>
        <p>提示词：${item.prompt}</p>
        <p>AI 返回摘要：${item.ai_summary}</p>
        <p>人工修改：${item.manual_change}</p>
        <p>运行结果：${item.run_result}</p>
      </article>
    `);
    panel.querySelectorAll('[data-delete-log]').forEach((button) => {
      button.addEventListener('click', () => deleteLog(Number(button.dataset.deleteLog)));
    });
  } catch (error) {
    console.error(error);
    panel.innerHTML = `<p class="empty-note">开发日志读取失败：${error.message}</p>`;
  }
}

function showLogMessage(message, type = 'ok') {
  const panel = document.querySelector('[data-log-message]');
  if (!panel) return;
  panel.innerHTML = `<p class="${type === 'error' ? 'shop-error' : 'shop-ok'}">${message}</p>`;
}

async function createLog(event) {
  event.preventDefault();
  const body = {
    prompt: document.querySelector('[data-log-prompt]')?.value.trim() || '',
    ai_summary: document.querySelector('[data-log-ai-summary]')?.value.trim() || '',
    manual_change: document.querySelector('[data-log-manual-change]')?.value.trim() || '',
    run_result: document.querySelector('[data-log-run-result]')?.value.trim() || ''
  };

  try {
    await fetchJson('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    document.querySelector('[data-log-form]')?.reset();
    showLogMessage('开发日志已新增。');
    await loadLogs();
  } catch (error) {
    console.error(error);
    showLogMessage(error.message || '新增日志失败。', 'error');
  }
}

async function deleteLog(logId) {
  if (!window.confirm('确认删除这条开发日志？')) {
    return;
  }

  try {
    await fetchJson(`/api/logs/${logId}`, { method: 'DELETE' });
    showLogMessage('开发日志已删除。');
    await loadLogs();
  } catch (error) {
    console.error(error);
    showLogMessage(error.message || '删除日志失败。', 'error');
  }
}

let activeTutorialStep = null;
let activeTutorialCleanup = null;

function isTutorialMode() {
  return getGameMode() === 'tutorial' || localStorage.getItem(ACTIVE_TUTORIAL_KEY) === '1';
}

function clearTutorialGuide() {
  if (activeTutorialCleanup) {
    activeTutorialCleanup();
    activeTutorialCleanup = null;
  }
  document.querySelectorAll('.tutorial-focus').forEach((element) => {
    element.classList.remove('tutorial-focus');
  });
  document.querySelector('[data-tutorial-guide]')?.remove();
  document.body.classList.remove('tutorial-active');
  activeTutorialStep = null;
}

function showTutorialStep({ target, title, text, buttonText = '下一步', requireClick = false, onNext = null }) {
  clearTutorialGuide();
  const targetElement = typeof target === 'string' ? document.querySelector(target) : target;
  if (!targetElement) {
    if (typeof onNext === 'function') onNext();
    return;
  }

  document.body.classList.add('tutorial-active');
  targetElement.classList.add('tutorial-focus');
  activeTutorialStep = { targetElement, requireClick, onNext };

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';
  overlay.dataset.tutorialGuide = 'true';
  overlay.innerHTML = `
    <div class="tutorial-dialog">
      <h3>${title}</h3>
      <p>${text}</p>
      ${requireClick ? '<p class="empty-note">请点击高亮区域继续。</p>' : `<button class="button" type="button" data-tutorial-next>${buttonText}</button>`}
    </div>
  `;
  document.body.appendChild(overlay);

  positionTutorialDialog(targetElement, overlay.querySelector('.tutorial-dialog'));

  const blockOtherClicks = (event) => {
    if (!activeTutorialStep) return;
    const dialog = document.querySelector('.tutorial-dialog');
    const clickedDialog = dialog && dialog.contains(event.target);
    const clickedTarget = activeTutorialStep.targetElement.contains(event.target);
    if (clickedDialog) return;
    if (activeTutorialStep.requireClick && clickedTarget) {
      const next = activeTutorialStep.onNext;
      event.preventDefault();
      event.stopPropagation();
      clearTutorialGuide();
      if (typeof next === 'function') next(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener('click', blockOtherClicks, true);
  window.addEventListener('resize', () => positionTutorialDialog(targetElement, overlay.querySelector('.tutorial-dialog')), { once: true });
  activeTutorialCleanup = () => {
    document.removeEventListener('click', blockOtherClicks, true);
  };

  const nextButton = overlay.querySelector('[data-tutorial-next]');
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const next = activeTutorialStep?.onNext;
      clearTutorialGuide();
      if (typeof next === 'function') next();
    });
  }
}

function positionTutorialDialog(targetElement, dialog) {
  if (!targetElement || !dialog) return;
  const rect = targetElement.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 180, Math.max(18, rect.top + window.scrollY + 8));
  const left = rect.right + 18 < window.innerWidth - 300
    ? rect.right + window.scrollX + 18
    : Math.max(18, rect.left + window.scrollX - 330);
  dialog.style.top = `${top}px`;
  dialog.style.left = `${left}px`;
}

function showPendingTutorialChoice() {
  if (!isHomePage() || localStorage.getItem(PENDING_TUTORIAL_KEY) !== '1') {
    return;
  }

  const modal = document.querySelector('[data-tutorial-modal]');
  if (modal) {
    modal.hidden = false;
  }
}

function startHomeTutorialGuide() {
  const steps = [
    {
      target: '[data-return-title]',
      title: '返回标题',
      text: '这里可以退出当前存档登录状态，回到 Monster Café 的标题界面。'
    },
    {
      target: '.nav a[href="collection.html"]',
      title: '怪兽图鉴',
      text: '这里会记录来过店的小怪兽。正式营业中服务过顾客后，图鉴才会逐步解锁。'
    },
    {
      target: '.nav a[href="achievements.html"]',
      title: '成就图鉴',
      text: '完成目标后这里会出现待领取奖励的小红点。领取后会计入当前存档。'
    },
    {
      target: '.nav a[href="level-rewards.html"]',
      title: '等级奖励',
      text: '店铺升级后可以在这里领取等级奖励。可领取时导航栏也会出现小红点。'
    },
    {
      target: '.nav a[href="backpack.html"]',
      title: '查看背包',
      text: '背包会展示你拥有的原料、礼物和其他物品。数量会显示在图标右下角。'
    },
    {
      target: '.nav a[href="shop.html"]',
      title: '原料商店',
      text: '原料不足时可以来这里补货。补货状态下营业会暂停，不会浪费顾客等待时间。'
    },
    {
      target: '.nav a[href="logs.html"]',
      title: '开发日志',
      text: '这里用于课程展示，记录 AI 协作开发过程和运行结果。'
    },
    {
      target: '[data-home-new-day]',
      title: '开始教程营业',
      text: '请点击“开始新的一天”。接下来会进入一段独立的新手模拟流程，不会影响正式收益、经验、好感或图鉴。',
      requireClick: true,
      onNext: () => {
        localStorage.setItem(ACTIVE_TUTORIAL_KEY, '1');
        localStorage.setItem('monsterCafeNextGameMode', 'tutorial');
        window.location.href = 'game.html?mode=tutorial';
      }
    }
  ];

  let index = 0;
  const next = () => {
    const step = steps[index];
    index += 1;
    showTutorialStep({
      ...step,
      onNext: step.onNext || next
    });
  };
  next();
}

async function loadSaves() {
  const savePanel = document.querySelector('[data-save-list]');
  if (!savePanel) {
    return;
  }

  try {
    const saves = await fetchJson('/api/saves');
    savePanel.innerHTML = `
      ${saves.map((save) => `
        <article class="save-card save-slot" data-load-save="${save.id}">
          <button class="save-delete-button" type="button" data-delete-save="${save.id}" aria-label="删除存档">
            <span class="trash-icon" aria-hidden="true"></span>
          </button>
          <h3>${formatSaveName(save.save_name)}</h3>
          <p>已营业：${save.business_days} 天</p>
          <p>当前等级：Lv.${save.level}</p>
          <p>金币数量：${save.coins}</p>
          <p>已解锁怪兽：${save.unlocked_monsters || 0}</p>
          <p class="empty-note">最近游玩：${save.updated_at}</p>
        </article>
      `).join('')}
      <button class="new-save-strip" type="button" data-open-new-save>
        <span aria-hidden="true">+</span>
      </button>
    `;

    savePanel.querySelectorAll('[data-load-save]').forEach((card) => {
      card.addEventListener('click', () => loadSaveAndEnter(Number(card.dataset.loadSave)));
    });

    savePanel.querySelectorAll('[data-delete-save]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        requestDeleteSave(Number(button.dataset.deleteSave));
      });
    });

    const openNewSaveButton = savePanel.querySelector('[data-open-new-save]');
    if (openNewSaveButton) {
      openNewSaveButton.addEventListener('click', openNewSaveModal);
    }
  } catch (error) {
    console.error(error);
    savePanel.innerHTML = `<p class="empty-note">读取存档失败：${error.message}</p>`;
  }
}

async function loadSaveAndEnter(saveId, options = {}) {
  try {
    const result = await fetchJson(`/api/saves/${saveId}/load`, { method: 'POST' });
    localStorage.setItem('monsterCafeSelectedSave', String(saveId));
    localStorage.setItem('monsterCafePlayerName', result.player?.name || result.save?.save_name || '咖啡馆老板');
    if (options.newSave) {
      localStorage.setItem(PENDING_TUTORIAL_KEY, '1');
      localStorage.removeItem(INITIAL_REWARD_SHOWN_KEY);
    }
    window.location.href = 'intro.html';
  } catch (error) {
    console.error(error);
    alert(`读取存档失败：${error.message}`);
  }
}

let pendingDeleteSaveId = null;
let pendingTutorialSaveId = null;

function requestDeleteSave(saveId) {
  pendingDeleteSaveId = saveId;
  if (sessionStorage.getItem('monsterCafeSkipDeleteConfirm') === '1') {
    deleteSave(saveId);
    return;
  }

  const modal = document.querySelector('[data-delete-save-modal]');
  if (modal) {
    modal.hidden = false;
  }
}

async function deleteSave(saveId) {
  try {
    await fetchJson(`/api/saves/${saveId}`, { method: 'DELETE' });
    if (localStorage.getItem('monsterCafeSelectedSave') === String(saveId)) {
      clearLoginState();
    }
    pendingDeleteSaveId = null;
    const modal = document.querySelector('[data-delete-save-modal]');
    if (modal) modal.hidden = true;
    await loadSaves();
  } catch (error) {
    console.error(error);
    alert(`删除存档失败：${error.message}`);
  }
}

function openNewSaveModal() {
  const modal = document.querySelector('[data-new-save-modal]');
  const input = document.querySelector('[data-new-save-name]');
  if (input && !input.value.trim()) {
    input.value = getRandomNickname();
  }
  if (modal) {
    modal.hidden = false;
  }
}

function getRandomNickname() {
  const prefixes = ['星糖', '月羽', '泡泡', '薄荷', '烤云', '甜爪', '夜光', '暖杯'];
  const suffixes = ['老板', '调饮师', '店长', '小掌柜', '咖啡师', '招待员'];
  return `${pickBrowserRandom(prefixes)}${pickBrowserRandom(suffixes)}`;
}

function pickBrowserRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatSaveName(saveName) {
  const raw = String(saveName || '一号存档');
  if (raw.endsWith('的存档')) {
    return raw;
  }
  return `${raw.replace(/存档$/, '')}的存档`;
}

async function createNewSave() {
  const input = document.querySelector('[data-new-save-name]');
  const nickname = input ? input.value.trim() : '';
  if (!nickname) {
    alert('请输入昵称。');
    return;
  }

  try {
    const result = await fetchJson('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    const modal = document.querySelector('[data-new-save-modal]');
    if (modal) modal.hidden = true;
    await loadSaveAndEnter(result.save.id, { newSave: true });
  } catch (error) {
    console.error(error);
    alert(`新建存档失败：${error.message}`);
  }
}

function finishTutorialChoice(event) {
  const enterTutorial = Boolean(event?.currentTarget?.matches('[data-enter-tutorial]'));
  const modal = document.querySelector('[data-tutorial-modal]');
  if (modal) modal.hidden = true;
  localStorage.removeItem(PENDING_TUTORIAL_KEY);

  if (enterTutorial) {
    startHomeTutorialGuide();
    return;
  }

  showInitialRewardPopup();
}

function runIntroScene() {
  const line = document.querySelector('[data-intro-line]');
  if (!line) {
    return;
  }

  const steps = ['咖啡馆招牌亮起', '门铃响起', '今日营业准备完成'];
  let index = 0;
  const timer = setInterval(() => {
    index += 1;
    if (index >= steps.length) {
      clearInterval(timer);
      window.location.href = 'index.html';
      return;
    }
    line.textContent = steps[index];
  }, 900);
}

function renderCustomer(data) {
  const customerPanel = document.querySelector('[data-current-customer]');
  const orderPanel = document.querySelector('[data-current-order]');
  if (!customerPanel || !orderPanel) {
    return;
  }

  const monster = data.monster;
  customerPanel.innerHTML = `
    <article class="customer-card">
      <div class="monster-portrait" aria-hidden="true">${monster.name.slice(0, 1)}</div>
      <h3>${monster.name}</h3>
      <p><span class="tag">${monster.species}</span></p>
      <p>心情：<span data-customer-mood>${getMoodText(monster)}</span></p>
      <p class="dialogue-text">${monster.dialogue}</p>
    </article>
  `;

  orderPanel.innerHTML = `
    <p class="order-text">${data.order_description}</p>
    <div class="tag-list" aria-label="推荐口味标签">
      ${renderTasteTags(data.recommended_taste_tags)}
    </div>
    <p class="empty-note">喜欢：${monster.liked_taste} ｜ 讨厌：${monster.disliked_taste}</p>
  `;
}

function loadTutorialCustomer() {
  currentCustomer = {
    id: -1,
    name: 'Pudding',
    species: '布丁练习兽',
    liked_taste: '甜,奶',
    disliked_taste: '苦',
    description: '专门陪新老板练习调饮的小怪兽。',
    dialogue: '不用紧张，我们先做一杯甜甜的奶香饮品吧。',
    unlocked: 1,
    visit_count: 0,
    best_satisfaction: 0
  };
  currentOrderDescription = '请帮我做一杯甜甜的、奶香浓浓的练习饮品。';
  currentRequestedTasteTags = ['甜', '奶'];
  customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
  renderCustomer({
    monster: currentCustomer,
    order_description: currentOrderDescription,
    recommended_taste_tags: currentRequestedTasteTags
  });
  renderIngredientButtons();
  setCustomerWaitText();
}

function runGameTutorialGuide() {
  const steps = [
    {
      target: '[data-current-customer]',
      title: '怪兽顾客',
      text: '左侧会显示当前顾客的名字、种族、心情和台词。正式营业时，顾客会根据等待时间改变心情。'
    },
    {
      target: '[data-current-order]',
      title: '订单需求',
      text: '中间会显示顾客想要的口味标签。命中需求标签会提高满意度，碰到讨厌标签会扣分。'
    },
    {
      target: '[data-ingredients]',
      title: '选择原料',
      text: '请点击一个带有“甜”或“奶”的原料加入当前饮品。',
      requireClick: true,
      onNext: (event) => {
        const button = event.target.closest('[data-add-ingredient]');
        if (button) {
          addIngredientToDrink(Number(button.dataset.addIngredient));
        }
        setTimeout(() => {
          showTutorialStep({
            target: '[data-current-drink]',
            title: '当前饮品',
            text: '你选择的原料会进入这里。正式营业时，库存会在制作后扣除。',
            onNext: nextMakeStep
          });
        }, 80);
      }
    }
  ];

  let index = 0;
  const next = () => {
    const step = steps[index];
    index += 1;
    showTutorialStep({
      ...step,
      onNext: step.onNext || next
    });
  };
  const nextMakeStep = () => {
    showTutorialStep({
      target: '[data-make-drink-button]',
      title: '制作饮品',
      text: '点击制作饮品完成这杯练习特调。本次是教程模拟，不会产生正式收益或记录。',
      requireClick: true,
      onNext: () => makeDrink()
    });
  };
  next();
}

async function loadNextCustomer() {
  const customerPanel = document.querySelector('[data-current-customer]');
  const orderPanel = document.querySelector('[data-current-order]');
  const resultPanel = document.querySelector('[data-drink-result]');
  if (!customerPanel || !orderPanel) {
    return;
  }

  if (dayEnded) {
    return;
  }

  if (gamePaused) {
    return;
  }

  if (currentCustomer) {
    if (resultPanel) {
      resultPanel.innerHTML = '<p class="empty-note">请先为当前顾客制作饮品，或等待顾客离开后再迎接下一位。</p>';
    }
    return;
  }

  currentCustomer = null;
  currentOrderDescription = '';
  currentRequestedTasteTags = [];
  customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
  setCustomerWaitText();
  clearCurrentDrink();
  customerPanel.innerHTML = '<p class="empty-note">小怪兽正在推门进来。</p>';
  orderPanel.innerHTML = '<p class="empty-note">正在听取顾客需求。</p>';
  if (resultPanel) {
    resultPanel.innerHTML = '';
  }

  try {
    const data = await fetchJson('/api/game/next-customer');
    currentCustomer = data.monster;
    currentOrderDescription = data.order_description;
    currentRequestedTasteTags = data.recommended_taste_tags || [];
    customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
    renderCustomer(data);
    await loadGiftsForCustomer(currentCustomer.id);
    setCustomerWaitText();
    runGameTimers();
  } catch (error) {
    console.error(error);
    customerPanel.innerHTML = '<p class="empty-note">暂时没有生成顾客。</p>';
    orderPanel.innerHTML = `<p class="empty-note">订单生成失败：${error.message}。请确认已通过 npm start 启动后端服务。</p>`;
  }
}

async function makeDrink() {
  const resultPanel = document.querySelector('[data-drink-result]');
  if (!resultPanel) {
    return;
  }

  if (dayEnded) {
    resultPanel.innerHTML = '<p class="empty-note">今天已经结束，请先查看结算。</p>';
    return;
  }

  if (!dayStarted) {
    resultPanel.innerHTML = '<p class="empty-note">今天还没有开始营业，请先点击“开始新的一天”。</p>';
    return;
  }

  if (gamePaused) {
    resultPanel.innerHTML = '<p class="empty-note">营业暂停中，请先点击继续营业。</p>';
    return;
  }

  if (!currentCustomer) {
    resultPanel.innerHTML = '<p class="empty-note">还没有顾客，不能制作饮品。</p>';
    return;
  }

  if (currentDrinkIngredients.length === 0) {
    resultPanel.innerHTML = '<p class="empty-note">请至少选择一种原料。</p>';
    return;
  }

  resultPanel.innerHTML = '<p class="empty-note">正在调配饮品。</p>';

  if (isTutorialMode()) {
    finishTutorialDrink();
    return;
  }

  try {
    const result = await fetchJson('/api/game/make-drink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        monsterId: currentCustomer.id,
        selectedIngredients: currentDrinkIngredients.map((ingredient) => ingredient.id),
        requestedTasteTags: currentRequestedTasteTags,
        requestText: currentOrderDescription,
        customerMood: getCurrentCustomerMood(),
        giftId: currentGift ? currentGift.id : null,
        dailyBonus: customerBuffSatisfaction
      })
    });

    resultPanel.innerHTML = `
      <article class="drink-result">
        <h3>${result.drink_name}</h3>
        <p>满意度：${result.satisfaction}</p>
        <p>奖励金币：${result.coin_reward}</p>
        <p>获得经验：${result.xp_gained || 0}</p>
        <p>${result.feedback_text}</p>
      </article>
    `;

    dayStats.customersServed += 1;
    dayStats.totalIncome += Number(result.coin_reward || 0);
    dayStats.totalIngredientCost += Number(result.ingredient_cost || 0);
    dayStats.totalSatisfaction += Number(result.satisfaction || 0);
    dayStats.totalXp += Number(result.xp_gained || 0);
    dayStats.reviews.push({
      monsterName: currentCustomer.name,
      satisfaction: result.satisfaction,
      text: result.feedback_text,
      coins: result.coin_reward,
      usedGift: Boolean(result.used_gift)
    });
    updateCustomerCounter();
    renderReviewWall();

    if (currentCustomer.name === '小熊软糖' && result.satisfaction >= 70) {
      customerBuffSatisfaction = Math.max(customerBuffSatisfaction, 5);
      gummyStarBonus = Math.max(gummyStarBonus, 0.5);
    }
    if (currentCustomer.name === '飞盘小狗' && result.satisfaction >= 70) {
      remainingSeconds += 25;
      setTimerText();
    }
    if (currentCustomer.name === '命运占星师' && result.satisfaction >= 70) {
      futureHintCount = Math.max(futureHintCount, 3);
    }

    await loadPlayerStatus();
    await loadIngredients();
    await loadMonsters();
    currentCustomer = null;
    currentOrderDescription = '';
    currentRequestedTasteTags = [];
    customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
    setCustomerWaitText();
    clearCurrentDrink();
    await playCustomerExitAndContinue();
  } catch (error) {
    console.error(error);
    resultPanel.innerHTML = `<p class="empty-note">制作失败：${error.message}</p>`;
  }
}

async function playCustomerExitAndContinue() {
  if (!dayStarted || dayEnded) {
    return;
  }

  isTransitioning = true;
  clearGameIntervals();
  const customerPanel = document.querySelector('[data-current-customer]');
  const orderPanel = document.querySelector('[data-current-order]');
  if (customerPanel) {
    customerPanel.classList.add('is-leaving');
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (customerPanel) {
    customerPanel.classList.remove('is-leaving');
    customerPanel.innerHTML = '<p class="empty-note">门铃轻响，上一位顾客离开了。</p>';
  }
  if (orderPanel) {
    orderPanel.innerHTML = '<p class="empty-note">正在等待下一位顾客进店。</p>';
  }

  if (dayStats.customersServed + dayStats.departedCustomers >= dayStats.targetCustomers) {
    isTransitioning = false;
    await endDay();
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 650));
  isTransitioning = false;
  await loadNextCustomer();
}

function finishTutorialDrink() {
  const resultPanel = document.querySelector('[data-drink-result]');
  const satisfaction = currentDrinkIngredients.length > 0 ? 100 : 60;
  const feedbackText = 'Pudding开心地晃了晃小勺子：“这杯练习饮品完成得很好，正式营业也照这个思路来。”';

  if (resultPanel) {
    resultPanel.innerHTML = `
      <article class="drink-result">
        <h3>Pudding的奶甜练习特调</h3>
        <p>满意度：${satisfaction}</p>
        <p>教程收益：不计入正式存档</p>
        <p>${feedbackText}</p>
      </article>
    `;
  }

  dayStats.customersServed = 1;
  dayStats.totalIncome = 0;
  dayStats.totalIngredientCost = 0;
  dayStats.totalSatisfaction = satisfaction;
  dayStats.totalXp = 0;
  dayStats.reviews = [{
    monsterName: 'Pudding',
    satisfaction,
    text: feedbackText,
    coins: 0,
    usedGift: false
  }];
  updateCustomerCounter();
  renderReviewWall();
  currentCustomer = null;
  clearCurrentDrink();
  setTimeout(endDay, 600);
}

function handleCustomerTimeout() {
  if (!currentCustomer || dayEnded) {
    return;
  }

  const resultPanel = document.querySelector('[data-drink-result]');
  const orderPanel = document.querySelector('[data-current-order]');
  const customerPanel = document.querySelector('[data-current-customer]');
  const customerName = currentCustomer.name;
  const isOldFriend = Number(currentCustomer.affinity || 0) >= 500;

  if (!isOldFriend) {
    dayStats.badReviews += 1;
  }
  dayStats.departedCustomers += 1;
  currentCustomer = null;
  currentOrderDescription = '';
  currentRequestedTasteTags = [];
  customerWaitSeconds = 0;
  setCustomerWaitText();
  clearCurrentDrink();

  if (orderPanel) {
    orderPanel.innerHTML = '<p class="empty-note">这位顾客已经离开，请迎接下一位顾客。</p>';
  }

  if (customerPanel) {
    customerPanel.innerHTML = '<p class="empty-note">柜台前空了下来，下一位顾客还在路上。</p>';
  }

  if (resultPanel) {
    resultPanel.innerHTML = `
      <article class="drink-result ${isOldFriend ? '' : 'bad-review'}">
        <h3>${customerName} 等太久离开了</h3>
        <p>${isOldFriend ? '这位老朋友留下了中性评价：“这次可能太忙了吧，我下次再来。”' : '收到 1 条差评。今日结算时，满意度评分和经验收益都会受到影响。'}</p>
      </article>
    `;
  }

  updateCustomerCounter();
  playCustomerExitAndContinue();
}

async function endDay() {
  if (dayEnded) {
    return;
  }

  dayEnded = true;
  clearGameIntervals();
  clearSavedGameState();
  remainingSeconds = 0;
  setTimerText();
  setCustomerWaitText();

  if (isTutorialMode()) {
    renderTutorialCompleteModal();
    return;
  }

  try {
    const result = await fetchJson('/api/game/end-day', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...dayStats,
        gummyStarBonus
      })
    });

    renderDayModal(result);
    await loadPlayerStatus();
  } catch (error) {
    console.error(error);
    renderDayModal({
      day_number: Number(document.querySelector('[data-current-day]')?.textContent || 1),
      summary: calculateLocalDaySummary(),
      achievements: [],
      localOnly: true
    });
  }
}

function renderDayModal(result) {
  const modal = document.querySelector('[data-day-modal]');
  const summaryPanel = document.querySelector('[data-day-summary]');
  if (!modal || !summaryPanel) {
    return;
  }

  const summary = result.summary;
  const achievements = result.achievements || [];
  summaryPanel.innerHTML = `
    ${result.localOnly ? '<p class="shop-ok">已使用本地结算显示结果。重新启动后端后，经验、等级和成就会保存到数据库。</p>' : ''}
    <p class="day-bonus">第 ${result.day_number || Number(document.querySelector('[data-current-day]')?.textContent || 1)} 天结算</p>
    <div class="day-summary-grid">
      <div><strong>服务顾客</strong><span>${summary.customers_served} 位</span></div>
      <div><strong>差评离店</strong><span>${summary.bad_reviews || 0} 位</span></div>
      <div><strong>营业收入</strong><span>${summary.total_income} 金币</span></div>
      <div><strong>原料成本</strong><span>${summary.total_ingredient_cost} 金币</span></div>
      <div><strong>综合利润</strong><span>${summary.profit} 金币</span></div>
      <div><strong>平均满意度</strong><span>${summary.avg_satisfaction}</span></div>
      <div><strong>获得经验</strong><span>${summary.xp_gained}</span></div>
    </div>
    <div class="rating-list">
      <p>利润评分：<span>${renderStars(summary.profit_stars)}</span></p>
      <p>顾客数评分：<span>${renderStars(summary.customer_stars)}</span></p>
      <p>满意度评分：<span>${renderStars(summary.satisfaction_stars)}</span></p>
      <p>综合评级：<span>${renderStars(summary.overall_stars)}</span></p>
    </div>
    <p class="day-bonus">日结奖励：${summary.coin_bonus} 金币</p>
    ${
      achievements.length
        ? `<div class="achievement-list"><h3>新成就</h3>${achievements.map((item) => `
            <p><strong>${item.title}</strong>：${item.description}（奖励 ${item.reward_coins} 金币 / ${item.reward_xp} 经验）</p>
          `).join('')}</div>`
        : '<p class="empty-note">今天没有新成就，明天继续加油。</p>'
    }
  `;

  modal.hidden = false;
  const nextDayButton = modal.querySelector('[data-next-day-button]');
  if (nextDayButton) {
    nextDayButton.disabled = Boolean(result.localOnly);
    nextDayButton.classList.toggle('is-disabled', Boolean(result.localOnly));
    nextDayButton.textContent = result.localOnly ? '结算保存失败' : '进入下一天';
  }
}

function renderTutorialCompleteModal() {
  const modal = document.querySelector('[data-day-modal]');
  const summaryPanel = document.querySelector('[data-day-summary]');
  const actions = modal?.querySelector('.modal-actions');
  if (!modal || !summaryPanel || !actions) {
    return;
  }

  summaryPanel.innerHTML = `
    <div class="day-summary-grid">
      <div><strong>教程顾客</strong><span>1 位</span></div>
      <div><strong>练习满意度</strong><span>100</span></div>
      <div><strong>正式收益</strong><span>0 金币</span></div>
      <div><strong>正式经验</strong><span>0</span></div>
    </div>
    <div class="achievement-list">
      <h3>恭喜您完成新手教程</h3>
      <p>接下来就可以自己探索 Monster Café 的正式营业了。</p>
    </div>
  `;
  actions.innerHTML = '<button class="button" type="button" data-finish-tutorial-button>完成教程</button>';
  modal.hidden = false;

  actions.querySelector('[data-finish-tutorial-button]').addEventListener('click', () => {
    localStorage.removeItem(ACTIVE_TUTORIAL_KEY);
    localStorage.removeItem('monsterCafeNextGameMode');
    showInitialRewardPopup(() => {
      window.location.href = 'index.html';
    });
  });
}

async function startNextDay() {
  const modal = document.querySelector('[data-day-modal]');
  if (modal) {
    modal.hidden = true;
  }

  clearGameIntervals();
  resetDayStats();
  dayStarted = false;
  dayEnded = false;
  gamePaused = false;
  isTransitioning = false;
  currentCustomer = null;
  currentOrderDescription = '';
  currentRequestedTasteTags = [];
  currentDrinkIngredients = [];
  currentGift = null;
  remainingSeconds = DAY_SECONDS;
  customerWaitSeconds = CUSTOMER_WAIT_SECONDS;
  setTimerText();
  setCustomerWaitText();
  renderReviewWall();
  renderCurrentDrink();
  await loadPlayerStatus();
  await loadIngredients();
  beginNewDay();
}

async function loadInitialPageData() {
  if (isGamePage()) {
    await loadPlayerStatus();
    await loadIngredients();
    return;
  }

  if (document.body.classList.contains('title-screen')) {
    return;
  }

  if (document.querySelector('[data-save-list]')) {
    await loadSaves();
    return;
  }

  if (isHomePage()) {
    await Promise.all([
      loadPlayerStatus(),
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (isShopPage()) {
    await Promise.all([
      loadPlayerStatus(),
      loadIngredients(),
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (document.querySelector('[data-collection]')) {
    await Promise.all([
      loadCollection(),
      loadAchievements(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (document.querySelector('[data-achievements]')) {
    await Promise.all([
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (document.querySelector('[data-level-rewards]')) {
    await Promise.all([
      loadLevelRewards(),
      loadAchievements(),
      loadCollectionTodoSummary()
    ]);
    return;
  }

  if (document.querySelector('[data-backpack-list]')) {
    await Promise.all([
      loadBackpack(),
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (document.querySelector('[data-logs]')) {
    await Promise.all([
      loadLogs(),
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
    return;
  }

  if (document.querySelector('.nav')) {
    await Promise.all([
      loadAchievements(),
      loadCollectionTodoSummary(),
      loadLevelRewardSummary()
    ]);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const loading = startPageLoading();
  try {
    await loadInitialPageData();
  } finally {
    if (loading) {
      loading.finish();
    }
  }
  runIntroScene();
  showPendingTutorialChoice();

  if (isGamePage()) {
    setMainNavigationLocked(true);
    renderCurrentDrink();
    renderReviewWall();
    updateCustomerCounter();
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    if (requestedMode === 'tutorial') {
      clearSavedGameState();
      dayStarted = false;
      clearGameIntervals();
      setTimerText();
      setCustomerWaitText();
      beginNewDay();
    } else if (requestedMode === 'new') {
      clearSavedGameState();
      dayStarted = false;
      clearGameIntervals();
      setTimerText();
      setCustomerWaitText();
      beginNewDay();
    } else if (requestedMode === 'resume') {
      const restored = restoreSavedGameState(false);
      if (restored) {
        clearGameIntervals();
        playCountdown('继续！').then(() => runGameTimers());
      } else {
        dayStarted = false;
        clearGameIntervals();
        setTimerText();
        setCustomerWaitText();
        beginNewDay();
      }
    } else {
      const restored = restoreSavedGameState();
      if (!restored) {
        dayStarted = false;
        clearGameIntervals();
        setTimerText();
        setCustomerWaitText();
      }
    }
  }

  if (isShopPage()) {
    setupRestockShopMode();
  }

  const logForm = document.querySelector('[data-log-form]');
  if (logForm) {
    logForm.addEventListener('submit', createLog);
  }

  const startDayButton = document.querySelector('[data-start-day-button]');
  if (startDayButton) {
    startDayButton.addEventListener('click', beginNewDay);
  }

  const makeDrinkButton = document.querySelector('[data-make-drink-button]');
  if (makeDrinkButton) {
    makeDrinkButton.addEventListener('click', makeDrink);
  }

  const nextDayButton = document.querySelector('[data-next-day-button]');
  if (nextDayButton) {
    nextDayButton.addEventListener('click', () => {
      if (nextDayButton.disabled) return;
      startNextDay();
    });
  }

  const pauseButton = document.querySelector('[data-pause-button]');
  if (pauseButton) {
    pauseButton.addEventListener('click', () => pauseGame(true));
  }

  const resumeButton = document.querySelector('[data-resume-button]');
  if (resumeButton) {
    resumeButton.addEventListener('click', resumeGame);
  }

  const restockButton = document.querySelector('[data-restock-button]');
  if (restockButton) {
    restockButton.addEventListener('click', goRestockFromGame);
  }

  const exitDayButton = document.querySelector('[data-exit-day-button]');
  if (exitDayButton) {
    exitDayButton.addEventListener('click', showExitConfirm);
  }

  const saveExitButton = document.querySelector('[data-save-exit-button]');
  if (saveExitButton) {
    saveExitButton.addEventListener('click', saveAndExitDay);
  }

  const discardExitButton = document.querySelector('[data-discard-exit-button]');
  if (discardExitButton) {
    discardExitButton.addEventListener('click', discardAndExitDay);
  }

  const cancelExitButton = document.querySelector('[data-cancel-exit-button]');
  if (cancelExitButton) {
    cancelExitButton.addEventListener('click', () => {
      const pauseModal = document.querySelector('[data-pause-modal]');
      const exitModal = document.querySelector('[data-exit-modal]');
      if (exitModal) exitModal.hidden = true;
      if (pauseModal) pauseModal.hidden = false;
    });
  }

  const closeCollectionDetailButton = document.querySelector('[data-close-collection-detail]');
  if (closeCollectionDetailButton) {
    closeCollectionDetailButton.addEventListener('click', () => {
      const modal = document.querySelector('[data-collection-detail-modal]');
      if (modal) modal.hidden = true;
    });
  }

  const homeNewDayButton = document.querySelector('[data-home-new-day]');
  if (homeNewDayButton) {
    homeNewDayButton.addEventListener('click', () => {
      if (getSavedGameState()) {
        const overwrite = window.confirm('已有保存的未完成工作进度，是否覆盖？');
        if (!overwrite) return;
        clearSavedGameState();
      }
      localStorage.setItem('monsterCafeNextGameMode', 'new');
      window.location.href = 'game.html?mode=new';
    });
  }

  const homeResumeButton = document.querySelector('[data-home-resume-day]');
  if (homeResumeButton) {
    homeResumeButton.disabled = !getSavedGameState();
    homeResumeButton.classList.toggle('is-disabled', !getSavedGameState());
    homeResumeButton.addEventListener('click', () => {
      if (!getSavedGameState()) {
        window.alert('无未完成的工作记录，请开始新的一天。');
        return;
      }
      localStorage.setItem('monsterCafeNextGameMode', 'resume');
      window.location.href = 'game.html?mode=resume';
    });
  }

  const openExitGameButton = document.querySelector('[data-open-exit-game]');
  if (openExitGameButton) {
    openExitGameButton.addEventListener('click', () => {
      const modal = document.querySelector('[data-exit-game-modal]');
      if (modal) modal.hidden = false;
    });
  }

  const returnTitleButton = document.querySelector('[data-return-title]');
  if (returnTitleButton) {
    returnTitleButton.addEventListener('click', requestReturnTitle);
  }

  const confirmReturnTitleButton = document.querySelector('[data-confirm-return-title]');
  if (confirmReturnTitleButton) {
    confirmReturnTitleButton.addEventListener('click', confirmReturnTitle);
  }

  const cancelReturnTitleButton = document.querySelector('[data-cancel-return-title]');
  if (cancelReturnTitleButton) {
    cancelReturnTitleButton.addEventListener('click', () => {
      const modal = document.querySelector('[data-return-title-modal]');
      if (modal) modal.hidden = true;
    });
  }

  const cancelExitGameButton = document.querySelector('[data-cancel-exit-game]');
  if (cancelExitGameButton) {
    cancelExitGameButton.addEventListener('click', () => {
      const modal = document.querySelector('[data-exit-game-modal]');
      if (modal) modal.hidden = true;
    });
  }

  const confirmExitGameButton = document.querySelector('[data-confirm-exit-game]');
  if (confirmExitGameButton) {
    confirmExitGameButton.addEventListener('click', () => {
      window.close();
      document.body.innerHTML = '<main class="page"><section class="panel"><h2>可以关闭页面了</h2><p class="lead">如果浏览器拦截了自动关闭，请手动关闭当前标签页。</p></section></main>';
    });
  }

  const randomNameButton = document.querySelector('[data-random-name]');
  if (randomNameButton) {
    randomNameButton.addEventListener('click', () => {
      const input = document.querySelector('[data-new-save-name]');
      if (input) input.value = getRandomNickname();
    });
  }

  const confirmNewSaveButton = document.querySelector('[data-confirm-new-save]');
  if (confirmNewSaveButton) {
    confirmNewSaveButton.addEventListener('click', createNewSave);
  }

  const cancelNewSaveButton = document.querySelector('[data-cancel-new-save]');
  if (cancelNewSaveButton) {
    cancelNewSaveButton.addEventListener('click', () => {
      const modal = document.querySelector('[data-new-save-modal]');
      if (modal) modal.hidden = true;
    });
  }

  const confirmDeleteSaveButton = document.querySelector('[data-confirm-delete-save]');
  if (confirmDeleteSaveButton) {
    confirmDeleteSaveButton.addEventListener('click', () => {
      const skip = document.querySelector('[data-skip-delete-confirm]');
      if (skip && skip.checked) {
        sessionStorage.setItem('monsterCafeSkipDeleteConfirm', '1');
      }
      if (pendingDeleteSaveId) {
        deleteSave(pendingDeleteSaveId);
      }
    });
  }

  const cancelDeleteSaveButton = document.querySelector('[data-cancel-delete-save]');
  if (cancelDeleteSaveButton) {
    cancelDeleteSaveButton.addEventListener('click', () => {
      pendingDeleteSaveId = null;
      const modal = document.querySelector('[data-delete-save-modal]');
      if (modal) modal.hidden = true;
    });
  }

  const enterTutorialButton = document.querySelector('[data-enter-tutorial]');
  if (enterTutorialButton) {
    enterTutorialButton.addEventListener('click', finishTutorialChoice);
  }

  const skipTutorialButton = document.querySelector('[data-skip-tutorial]');
  if (skipTutorialButton) {
    skipTutorialButton.addEventListener('click', finishTutorialChoice);
  }
});
