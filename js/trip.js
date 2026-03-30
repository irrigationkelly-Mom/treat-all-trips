// js/trip.js
import { supabase, waitForSession } from './auth.js';

// ==========================================
// 全域狀態
// ==========================================
let currentUser = null;
let currentTrip = null;
let tripMembers = [];
let memberProfiles = {};
let isAdmin = false;
let canEditMap = {};
let tripId = null;

// ==========================================
// 初始化
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  // 取得 trip ID
  const params = new URLSearchParams(window.location.search);
  tripId = params.get('id');

  if (!tripId) {
    showUnauth();
    return;
  }

  // 等待 session
  const session = await waitForSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = session.user;

  try {
    await loadTripData();
    setupTabs();
    showLoading(false);
    document.getElementById('trip-screen').classList.remove('hidden');
  } catch (err) {
    console.error('載入旅遊資料失敗:', err);
    showUnauth();
  }
});

// ==========================================
// 載入旅遊資料
// ==========================================
async function loadTripData() {
  // 1. 載入旅遊基本資訊
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (tripError || !trip) throw new Error('旅遊不存在');
  currentTrip = trip;

  // 2. 確認是否為成員或創建者
  const { data: memberData } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', currentUser.id)
    .single();

  const isCreator = trip.created_by === currentUser.id;

  if (!memberData && !isCreator) {
    throw new Error('無權限');
  }

  // 3. 確認平台管理員身份
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', currentUser.id)
    .single();

  isAdmin = profile?.is_platform_admin || isCreator;

  // 4. 設定權限
  if (memberData) {
    canEditMap = {
      itinerary: memberData.can_edit_itinerary,
      expense: memberData.can_edit_expense,
      shopping: memberData.can_edit_shopping,
      info: memberData.can_edit_info,
      memo: memberData.can_use_memo,
      packing: memberData.can_edit_tools,
    };
  } else {
    // 創建者擁有全部權限
    canEditMap = {
      itinerary: true, expense: true, shopping: true,
      info: true, memo: true, packing: true,
    };
  }

  // 5. 載入所有成員
  const { data: members } = await supabase
    .from('trip_members')
    .select(`
      *,
      profiles (id, display_name, avatar_url, email)
    `)
    .eq('trip_id', tripId);

  tripMembers = members || [];

  // 建立 memberProfiles 查找表
  tripMembers.forEach(m => {
    if (m.profiles) {
      memberProfiles[m.user_id] = m.profiles;
    }
  });

  // 也加入創建者
  if (isCreator && !memberProfiles[currentUser.id]) {
    memberProfiles[currentUser.id] = {
      id: currentUser.id,
      display_name: currentUser.email?.split('@')[0],
      avatar_url: null,
      email: currentUser.email,
    };
  }

  // 6. 渲染頁面
  renderTripCover();
  renderMembersBar();
  showAdminButtons();

  // 7. 載入預設頁籤（行程表）
  await loadItinerary();
}

// ==========================================
// 渲染封面
// ==========================================
function renderTripCover() {
  document.title = `${currentTrip.name} - Treat All Trips`;
  document.getElementById('trip-name').textContent = currentTrip.name;

  const dest = document.getElementById('trip-destination');
  dest.textContent = currentTrip.destination ? `📍 ${currentTrip.destination}` : '';

  const dates = document.getElementById('trip-dates');
  if (currentTrip.start_date && currentTrip.end_date) {
    dates.textContent = `${formatDate(currentTrip.start_date)} ～ ${formatDate(currentTrip.end_date)}`;
  }

  // 封面圖片
  const cover = document.getElementById('trip-cover');
  if (currentTrip.cover_image_url) {
    cover.style.backgroundImage = `url(${currentTrip.cover_image_url})`;
  }
}

// ==========================================
// 渲染成員頭像列
// ==========================================
function renderMembersBar() {
  const container = document.getElementById('members-avatars');
  container.innerHTML = '';

  const allMemberIds = tripMembers.map(m => m.user_id);
  if (!allMemberIds.includes(currentTrip.created_by)) {
    allMemberIds.unshift(currentTrip.created_by);
  }

  allMemberIds.forEach(uid => {
    const profile = memberProfiles[uid];
    if (!profile) return;

    const avatar = document.createElement('div');
    avatar.className = 'member-avatar';
    avatar.title = profile.display_name || profile.email;

    if (profile.avatar_url) {
      avatar.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(profile.display_name || '')}" />`;
    } else {
      const initial = (profile.display_name || profile.email || '?')[0].toUpperCase();
      avatar.textContent = initial;
      avatar.style.background = stringToColor(uid);
    }

    container.appendChild(avatar);
  });
}

// ==========================================
// 顯示管理員按鈕
// ==========================================
function showAdminButtons() {
  if (isAdmin) {
    document.getElementById('edit-trip-btn').classList.remove('hidden');
    document.getElementById('invite-btn').classList.remove('hidden');
  }

  // 各功能新增按鈕
  if (canEditMap.itinerary) document.getElementById('add-day-btn').classList.remove('hidden');
  if (canEditMap.expense) document.getElementById('add-expense-btn').classList.remove('hidden');
  if (canEditMap.shopping) document.getElementById('add-shopping-btn').classList.remove('hidden');
  if (canEditMap.packing) document.getElementById('add-packing-btn').classList.remove('hidden');
  if (canEditMap.memo) document.getElementById('add-memo-btn').classList.remove('hidden');
  if (isAdmin) document.getElementById('add-info-btn').classList.remove('hidden');
}

// ==========================================
// 頁籤切換
// ==========================================
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;

      // 更新按鈕狀態
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 切換面板
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${tab}`).classList.remove('hidden');

      // 載入資料
      await loadTabData(tab);
    });
  });
}

async function loadTabData(tab) {
  switch (tab) {
    case 'itinerary': await loadItinerary(); break;
    case 'expenses': await loadExpenses(); break;
    case 'shopping': await loadShopping(); break;
    case 'packing': await loadPacking(); break;
    case 'memos': await loadMemos(); break;
    case 'info': await loadInfo(); break;
  }
}

// ==========================================
// 行程表
// ==========================================
async function loadItinerary() {
  const { data: days, error } = await supabase
    .from('itinerary_days')
    .select(`
      *,
      itinerary_items (*)
    `)
    .eq('trip_id', tripId)
    .order('day_number', { ascending: true });

  if (error) { console.error(error); return; }

  const container = document.getElementById('itinerary-list');

  if (!days || days.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🗺️</span>
        <p>尚未新增行程</p>
      </div>`;
    return;
  }

  container.innerHTML = days.map(day => renderDayCard(day)).join('');
}

function renderDayCard(day) {
  const items = day.itinerary_items || [];
  const sortedItems = items.sort((a, b) =>
    (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
  );

  const itemsHtml = sortedItems.map(item => renderItineraryItem(item)).join('');

  const addBtn = canEditMap.itinerary
    ? `<button class="btn-add-item" onclick="openAddItemModal('${day.id}')">+ 新增項目</button>`
    : '';

  return `
    <div class="itinerary-day-card">
      <div class="day-header" onclick="toggleDay('${day.id}')">
        <span class="day-number">Day ${day.day_number}</span>
        <div class="day-info">
          <p class="day-title">${escapeHtml(day.title || `第 ${day.day_number} 天`)}</p>
          ${day.date ? `<p class="day-date">${formatDate(day.date)}</p>` : ''}
        </div>
        <span class="day-toggle">▼</span>
      </div>
      <div class="day-items" id="day-items-${day.id}">
        ${itemsHtml}
        ${addBtn}
      </div>
    </div>`;
}

function renderItineraryItem(item) {
  const categoryIcons = {
    transport: '🚄', accommodation: '🏨', food: '🍜',
    attraction: '🎡', shopping: '🛍️', other: '📌'
  };
  const icon = categoryIcons[item.category] || '📌';

  const timeStr = item.start_time
    ? `${item.start_time.slice(0, 5)}${item.end_time ? `\n${item.end_time.slice(0, 5)}` : ''}`
    : '';

  const costStr = item.estimated_cost
    ? `<span class="item-cost">${formatCurrency(item.estimated_cost, item.currency)}</span>`
    : '';

  return `
    <div class="itinerary-item">
      <span class="item-time">${escapeHtml(timeStr)}</span>
      <span class="item-icon">${icon}</span>
      <div class="item-content">
        <p class="item-title">${escapeHtml(item.title)}</p>
        ${item.location ? `<p class="item-location">📍 ${escapeHtml(item.location)}</p>` : ''}
        ${costStr}
      </div>
    </div>`;
}

window.toggleDay = function(dayId) {
  const el = document.getElementById(`day-items-${dayId}`);
  el.style.display = el.style.display === 'none' ? '' : 'none';
};

// ==========================================
// 支出管理
// ==========================================
async function loadExpenses() {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', tripId)
    .order('expense_date', { ascending: false });

  if (error) { console.error(error); return; }

  // 更新摘要
  updateExpenseSummary(expenses || []);

  const container = document.getElementById('expenses-list');

  if (!expenses || expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>💴</span>
        <p>尚未新增支出</p>
      </div>`;
    return;
  }

  container.innerHTML = expenses.map(e => renderExpenseItem(e)).join('');
}

function updateExpenseSummary(expenses) {
  const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount_in_base || e.amount) || 0), 0);
  const memberCount = tripMembers.length || 1;

  document.getElementById('total-amount').textContent = formatCurrency(total, currentTrip.base_currency || 'JPY');
  document.getElementById('per-person-amount').textContent = formatCurrency(total / memberCount, currentTrip.base_currency || 'JPY');
}

function renderExpenseItem(expense) {
  const categoryIcons = {
    food: '🍜', transport: '🚄', accommodation: '🏨',
    shopping: '🛍️', attraction: '🎡', other: '📌'
  };
  const icon = categoryIcons[expense.category] || '📌';
  const paidBy = memberProfiles[expense.paid_by];
  const paidByName = paidBy ? (paidBy.display_name || paidBy.email) : '未知';

  return `
    <div class="expense-item">
      <span class="expense-icon">${icon}</span>
      <div class="expense-content">
        <p class="expense-title">${escapeHtml(expense.title)}</p>
        <p class="expense-meta">
          ${expense.expense_date ? formatDate(expense.expense_date) + ' · ' : ''}
          由 ${escapeHtml(paidByName)} 付款
        </p>
      </div>
      <div class="expense-amount">
        ${formatCurrency(expense.amount, expense.currency)}
        <span class="expense-currency">${expense.currency || ''}</span>
      </div>
    </div>`;
}

// ==========================================
// 結算計算
// ==========================================
window.openSettlementModal = async function() {
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', tripId);

  const settlement = calculateSettlement(expenses || []);
  renderSettlement(settlement);
  openModal('modal-settlement');
};

function calculateSettlement(expenses) {
  const balances = {};

  // 初始化所有成員餘額
  const allIds = tripMembers.map(m => m.user_id);
  allIds.forEach(id => { balances[id] = 0; });

  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount_in_base || expense.amount) || 0;
    const paidBy = expense.paid_by;
    if (!paidBy) return;

    if (expense.split_type === 'equal' || !expense.split_details) {
      // 平均分攤
      const share = amount / allIds.length;
      allIds.forEach(id => { balances[id] = (balances[id] || 0) - share; });
      balances[paidBy] = (balances[paidBy] || 0) + amount;
    } else if (expense.split_type === 'custom' && expense.split_details) {
      // 個別指定
      const details = expense.split_details;
      Object.entries(details).forEach(([uid, share]) => {
        balances[uid] = (balances[uid] || 0) - parseFloat(share);
      });
      balances[paidBy] = (balances[paidBy] || 0) + amount;
    }
  });

  // 計算最小轉帳次數
  const transfers = [];
  const pos = [], neg = [];

  Object.entries(balances).forEach(([id, bal]) => {
    if (bal > 0.5) pos.push({ id, amount: bal });
    if (bal < -0.5) neg.push({ id, amount: -bal });
  });

  while (pos.length && neg.length) {
    const p = pos[0], n = neg[0];
    const amount = Math.min(p.amount, n.amount);
    transfers.push({ from: n.id, to: p.id, amount });
    p.amount -= amount;
    n.amount -= amount;
    if (p.amount < 0.5) pos.shift();
    if (n.amount < 0.5) neg.shift();
  }

  return transfers;
}

function renderSettlement(transfers) {
  const container = document.getElementById('settlement-content');

  if (transfers.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#888;padding:20px">✅ 已結清，無需轉帳</p>';
    return;
  }

  container.innerHTML = transfers.map(t => {
    const from = memberProfiles[t.from];
    const to = memberProfiles[t.to];
    const fromName = from ? (from.display_name || from.email) : '?';
    const toName = to ? (to.display_name || to.email) : '?';
    return `
      <div class="settlement-item">
        <span>${escapeHtml(fromName)}</span>
        <span class="settlement-arrow">→</span>
        <span>${escapeHtml(toName)}</span>
        <span class="settlement-amount">
          ${formatCurrency(t.amount, currentTrip.base_currency || 'JPY')}
        </span>
      </div>`;
  }).join('');
}

// ==========================================
// 購物清單
// ==========================================
async function loadShopping() {
  const { data: items, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true });

  if (error) { console.error(error); return; }

  const container = document.getElementById('shopping-list');

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🛍️</span>
        <p>尚未新增購物項目</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => renderShoppingItem(item)).join('');
}

function renderShoppingItem(item) {
  const checkClass = item.is_purchased ? 'checked' : '';
  const nameClass = item.is_purchased ? 'strikethrough' : '';
  const itemClass = item.is_purchased ? 'purchased' : '';
  const assigned = item.assigned_to ? memberProfiles[item.assigned_to] : null;
  const assignedName = assigned ? (assigned.display_name || assigned.email) : '';
  const refundBadge = item.is_tax_refundable ? ' 🧾退稅' : '';

  return `
    <div class="shopping-item ${itemClass}" id="shopping-${item.id}">
      <div class="shopping-check ${checkClass}" onclick="toggleShopping('${item.id}', ${item.is_purchased})">
        ${item.is_purchased ? '✓' : ''}
      </div>
      <div class="shopping-content">
        <p class="shopping-name ${nameClass}">${escapeHtml(item.name)}${refundBadge}</p>
        <p class="shopping-meta">
          ${item.store ? escapeHtml(item.store) + ' · ' : ''}
          ${item.quantity > 1 ? `x${item.quantity} · ` : ''}
          ${assignedName ? escapeHtml(assignedName) : ''}
        </p>
      </div>
      ${item.price ? `<span class="shopping-price">${formatCurrency(item.price, item.currency)}</span>` : ''}
    </div>`;
}

window.toggleShopping = async function(itemId, currentState) {
  await supabase
    .from('shopping_items')
    .update({ is_purchased: !currentState })
    .eq('id', itemId);
  await loadShopping();
};

// ==========================================
// 打包清單
// ==========================================
async function loadPacking() {
  const { data: categories } = await supabase
    .from('packing_categories')
    .select(`
      *,
      packing_items (*)
    `)
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true });

  const container = document.getElementById('packing-list');

  if (!categories || categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>🎒</span>
        <p>尚未新增打包項目</p>
      </div>`;
    document.getElementById('packing-progress').classList.add('hidden');
    return;
  }

  // 計算進度
  let total = 0, packed = 0;
  categories.forEach(cat => {
    (cat.packing_items || []).forEach(item => {
      total++;
      if (item.is_packed) packed++;
    });
  });

  if (total > 0) {
    const progress = document.getElementById('packing-progress');
    progress.classList.remove('hidden');
    document.getElementById('progress-fill').style.width = `${(packed / total) * 100}%`;
    document.getElementById('progress-text').textContent = `${packed} / ${total}`;
  }

  container.innerHTML = categories.map(cat => {
    const items = (cat.packing_items || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    return `
      <div class="packing-category-section">
        <div class="packing-category-title">${escapeHtml(cat.name)}</div>
        ${items.map(item => renderPackingItem(item)).join('')}
      </div>`;
  }).join('');
}

function renderPackingItem(item) {
  const checkClass = item.is_packed ? 'checked' : '';
  const nameClass = item.is_packed ? 'packed' : '';

  return `
    <div class="packing-item">
      <div class="packing-check ${checkClass}" onclick="togglePacking('${item.id}', ${item.is_packed})">
        ${item.is_packed ? '✓' : ''}
      </div>
      <span class="packing-name ${nameClass}">${escapeHtml(item.name)}</span>
      ${item.quantity > 1 ? `<span class="packing-qty">x${item.quantity}</span>` : ''}
    </div>`;
}

window.togglePacking = async function(itemId, currentState) {
  await supabase
    .from('packing_items')
    .update({
      is_packed: !currentState,
      packed_by: !currentState ? currentUser.id : null,
      packed_at: !currentState ? new Date().toISOString() : null,
    })
    .eq('id', itemId);
  await loadPacking();
};

// ==========================================
// 備忘錄
// ==========================================
async function loadMemos() {
  const { data: memos, error } = await supabase
    .from('memos')
    .select('*')
    .eq('trip_id', tripId)
    .or(`is_private.eq.false,user_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }

  const container = document.getElementById('memos-list');

  if (!memos || memos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>📝</span>
        <p>尚未新增備忘錄</p>
      </div>`;
    return;
  }

  container.innerHTML = memos.map(memo => `
    <div class="memo-card ${memo.is_private ? 'private' : ''}">
      <div class="memo-header">
        <p class="memo-title">${escapeHtml(memo.title || '備忘錄')}</p>
        ${memo.is_private ? '<span class="memo-badge">🔒 私人</span>' : ''}
      </div>
      <p class="memo-content">${escapeHtml(memo.content || '')}</p>
    </div>`).join('');
}

// ==========================================
// 旅遊資訊
// ==========================================
async function loadInfo() {
  const { data: items, error } = await supabase
    .from('info_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true });

  if (error) { console.error(error); return; }

  const container = document.getElementById('info-list');

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>ℹ️</span>
        <p>尚未新增旅遊資訊</p>
      </div>`;
    return;
  }

  const categoryIcons = {
    flight: '✈️', hotel: '🏨', visa: '📄',
    insurance: '🛡️', emergency: '🆘', other: '📌'
  };

  // 按類別分組
  const grouped = {};
  items.forEach(item => {
    const cat = item.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  container.innerHTML = Object.entries(grouped).map(([cat, catItems]) => `
    <div class="info-category-section">
      <div class="info-category-title">
        ${categoryIcons[cat] || '📌'} ${getCategoryLabel(cat)}
      </div>
      ${catItems.map(item => `
        <div class="info-item-card">
          <p class="info-item-title">${escapeHtml(item.title)}</p>
          <p class="info-item-content">${escapeHtml(item.content || '')}</p>
        </div>`).join('')}
    </div>`).join('');
}

// ==========================================
// Modal 操作
// ==========================================
window.openAddDayModal = function() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('day-date').value = today;
  document.getElementById('day-title').value = '';
  document.getElementById('day-notes').value = '';
  openModal('modal-add-day');
};

window.submitAddDay = async function() {
  const date = document.getElementById('day-date').value;
  const title = document.getElementById('day-title').value.trim();
  const notes = document.getElementById('day-notes').value.trim();

  if (!date) { showToast('請選擇日期'); return; }

  // 計算 day_number
  const { data: existingDays } = await supabase
    .from('itinerary_days')
    .select('day_number')
    .eq('trip_id', tripId)
    .order('day_number', { ascending: false })
    .limit(1);

  const nextDayNum = existingDays?.length ? existingDays[0].day_number + 1 : 1;

  const { error } = await supabase
    .from('itinerary_days')
    .insert({
      trip_id: tripId,
      day_number: nextDayNum,
      date,
      title: title || null,
      notes: notes || null,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-day');
  showToast('✅ 已新增行程天');
  await loadItinerary();
};

window.openAddItemModal = function(dayId) {
  document.getElementById('item-day-id').value = dayId;
  document.getElementById('item-title').value = '';
  document.getElementById('item-location').value = '';
  document.getElementById('item-start-time').value = '';
  document.getElementById('item-end-time').value = '';
  document.getElementById('item-cost').value = '';
  document.getElementById('item-booking').value = '';
  document.getElementById('item-description').value = '';
  openModal('modal-add-item');
};

window.submitAddItem = async function() {
  const dayId = document.getElementById('item-day-id').value;
  const title = document.getElementById('item-title').value.trim();
  const category = document.getElementById('item-category').value;
  const location = document.getElementById('item-location').value.trim();
  const startTime = document.getElementById('item-start-time').value;
  const endTime = document.getElementById('item-end-time').value;
  const cost = document.getElementById('item-cost').value;
  const booking = document.getElementById('item-booking').value.trim();
  const description = document.getElementById('item-description').value.trim();

  if (!title) { showToast('請輸入名稱'); return; }

  const { error } = await supabase
    .from('itinerary_items')
    .insert({
      trip_id: tripId,
      day_id: dayId,
      title,
      category,
      location: location || null,
      start_time: startTime || null,
      end_time: endTime || null,
      estimated_cost: cost ? parseFloat(cost) : null,
      currency: currentTrip.base_currency || 'JPY',
      booking_code: booking || null,
      description: description || null,
      created_by: currentUser.id,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-item');
  showToast('✅ 已新增行程項目');
  await loadItinerary();
};

window.openAddExpenseModal = function() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expense-title').value = '';
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-date').value = today;
  document.getElementById('expense-notes').value = '';
  document.querySelector('input[name="split-type"][value="equal"]').checked = true;
  toggleSplitDetails('equal');

  // 填入付款人選項
  const paidBySelect = document.getElementById('expense-paid-by');
  paidBySelect.innerHTML = Object.entries(memberProfiles).map(([uid, p]) =>
    `<option value="${uid}" ${uid === currentUser.id ? 'selected' : ''}>
      ${escapeHtml(p.display_name || p.email)}
    </option>`
  ).join('');

  openModal('modal-add-expense');
};

window.toggleSplitDetails = function(type) {
  const equalInfo = document.getElementById('split-equal-info');
  const customDetail = document.getElementById('split-custom-detail');

  if (type === 'equal') {
    equalInfo.classList.remove('hidden');
    customDetail.classList.add('hidden');
  } else {
    equalInfo.classList.add('hidden');
    customDetail.classList.remove('hidden');

    // 產生各成員輸入欄
    customDetail.innerHTML = Object.entries(memberProfiles).map(([uid, p]) => `
      <div class="split-member-row">
        <span class="split-member-name">${escapeHtml(p.display_name || p.email)}</span>
        <input type="number" class="split-member-input" id="split-${uid}" placeholder="0" />
      </div>`).join('');
  }
};

window.submitAddExpense = async function() {
  const title = document.getElementById('expense-title').value.trim();
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const currency = document.getElementById('expense-currency').value;
  const category = document.getElementById('expense-category').value;
  const date = document.getElementById('expense-date').value;
  const paidBy = document.getElementById('expense-paid-by').value;
  const notes = document.getElementById('expense-notes').value.trim();
  const splitType = document.querySelector('input[name="split-type"]:checked').value;

  if (!title) { showToast('請輸入名稱'); return; }
  if (!amount || isNaN(amount)) { showToast('請輸入金額'); return; }

  let splitDetails = null;
  if (splitType === 'custom') {
    splitDetails = {};
    Object.keys(memberProfiles).forEach(uid => {
      const val = parseFloat(document.getElementById(`split-${uid}`)?.value || 0);
      if (val > 0) splitDetails[uid] = val;
    });
  }

  const { error } = await supabase
    .from('expenses')
    .insert({
      trip_id: tripId,
      title,
      amount,
      currency,
      amount_in_base: amount, // 暫不做匯率換算
      category,
      expense_date: date || null,
      paid_by: paidBy || null,
      split_type: splitType,
      split_details: splitDetails,
      notes: notes || null,
      created_by: currentUser.id,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-expense');
  showToast('✅ 已新增支出');
  await loadExpenses();
};

window.openAddShoppingModal = function() {
  document.getElementById('shopping-name').value = '';
  document.getElementById('shopping-store').value = '';
  document.getElementById('shopping-price').value = '';
  document.getElementById('shopping-qty').value = '1';
  document.getElementById('shopping-notes').value = '';
  document.getElementById('shopping-tax-refund').checked = false;

  const assignedSelect = document.getElementById('shopping-assigned');
  assignedSelect.innerHTML = `<option value="">不指定</option>` +
    Object.entries(memberProfiles).map(([uid, p]) =>
      `<option value="${uid}">${escapeHtml(p.display_name || p.email)}</option>`
    ).join('');

  openModal('modal-add-shopping');
};

window.submitAddShopping = async function() {
  const name = document.getElementById('shopping-name').value.trim();
  const store = document.getElementById('shopping-store').value.trim();
  const price = parseFloat(document.getElementById('shopping-price').value) || null;
  const currency = document.getElementById('shopping-currency').value;
  const qty = parseInt(document.getElementById('shopping-qty').value) || 1;
  const assignedTo = document.getElementById('shopping-assigned').value || null;
  const taxRefund = document.getElementById('shopping-tax-refund').checked;
  const notes = document.getElementById('shopping-notes').value.trim();

  if (!name) { showToast('請輸入名稱'); return; }

  const { error } = await supabase
    .from('shopping_items')
    .insert({
      trip_id: tripId,
      name,
      store: store || null,
      price,
      currency,
      quantity: qty,
      assigned_to: assignedTo,
      is_tax_refundable: taxRefund,
      notes: notes || null,
      created_by: currentUser.id,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-shopping');
  showToast('✅ 已新增購物項目');
  await loadShopping();
};

window.openAddPackingModal = async function() {
  document.getElementById('packing-name').value = '';
  document.getElementById('packing-qty').value = '1';
  document.getElementById('packing-notes').value = '';

  // 載入分類選項
  const { data: categories } = await supabase
    .from('packing_categories')
    .select('*')
    .eq('trip_id', tripId)
    .order('order_index', { ascending: true });

  const catSelect = document.getElementById('packing-category-id');
  catSelect.innerHTML = categories?.map(c =>
    `<option value="${c.id}">${escapeHtml(c.name)}</option>`
  ).join('') || '<option value="">無分類</option>';

  const assignedSelect = document.getElementById('packing-assigned');
  assignedSelect.innerHTML = `<option value="">不指定</option>` +
    Object.entries(memberProfiles).map(([uid, p]) =>
      `<option value="${uid}">${escapeHtml(p.display_name || p.email)}</option>`
    ).join('');

  openModal('modal-add-packing');
};

window.openAddPackingCategory = async function() {
  const name = prompt('請輸入分類名稱：');
  if (!name?.trim()) return;

  const { data, error } = await supabase
    .from('packing_categories')
    .insert({
      trip_id: tripId,
      name: name.trim(),
      created_by: currentUser.id,
    })
    .select()
    .single();

  if (error) { showToast('新增失敗'); return; }

  const catSelect = document.getElementById('packing-category-id');
  const option = document.createElement('option');
  option.value = data.id;
  option.textContent = data.name;
  catSelect.appendChild(option);
  catSelect.value = data.id;
  showToast('✅ 已新增分類');
};

window.submitAddPacking = async function() {
  const name = document.getElementById('packing-name').value.trim();
  const categoryId = document.getElementById('packing-category-id').value;
  const qty = parseInt(document.getElementById('packing-qty').value) || 1;
  const assignedTo = document.getElementById('packing-assigned').value || null;
  const notes = document.getElementById('packing-notes').value.trim();

  if (!name) { showToast('請輸入名稱'); return; }

  const { error } = await supabase
    .from('packing_items')
    .insert({
      trip_id: tripId,
      category_id: categoryId || null,
      name,
      quantity: qty,
      assigned_to: assignedTo,
      notes: notes || null,
      is_packed: false,
      created_by: currentUser.id,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-packing');
  showToast('✅ 已新增打包項目');
  await loadPacking();
};

window.openAddMemoModal = function() {
  document.getElementById('memo-title').value = '';
  document.getElementById('memo-content').value = '';
  document.getElementById('memo-private').checked = false;
  openModal('modal-add-memo');
};

window.submitAddMemo = async function() {
  const title = document.getElementById('memo-title').value.trim();
  const content = document.getElementById('memo-content').value.trim();
  const isPrivate = document.getElementById('memo-private').checked;

  if (!content) { showToast('請輸入內容'); return; }

  const { error } = await supabase
    .from('memos')
    .insert({
      trip_id: tripId,
      user_id: currentUser.id,
      title: title || null,
      content,
      is_private: isPrivate,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-memo');
  showToast('✅ 已新增備忘錄');
  await loadMemos();
};

window.openAddInfoModal = function() {
  document.getElementById('info-title').value = '';
  document.getElementById('info-content').value = '';
  openModal('modal-add-info');
};

window.submitAddInfo = async function() {
  const title = document.getElementById('info-title').value.trim();
  const content = document.getElementById('info-content').value.trim();
  const category = document.getElementById('info-category').value;

  if (!title) { showToast('請輸入標題'); return; }
  if (!content) { showToast('請輸入內容'); return; }

  const { error } = await supabase
    .from('info_items')
    .insert({
      trip_id: tripId,
      title,
      content,
      category,
      created_by: currentUser.id,
    });

  if (error) { showToast('新增失敗：' + error.message); return; }

  closeModal('modal-add-info');
  showToast('✅ 已新增旅遊資訊');
  await loadInfo();
};

// ==========================================
// 邀請連結
// ==========================================
window.openInviteModal = async function() {
  // 查詢現有有效連結
  const { data: existing } = await supabase
    .from('invite_links')
    .select('*')
    .eq('trip_id', tripId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (existing?.length) {
    setInviteLink(existing[0].token);
  } else {
    document.getElementById('invite-link-input').value = '請點擊「產生新連結」';
  }

  openModal('modal-invite');
};

window.generateInviteLink = async function() {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('invite_links')
    .insert({
      trip_id: tripId,
      token,
      created_by: currentUser.id,
      expires_at: expiresAt,
      max_uses: 50,
      use_count: 0,
      is_active: true,
    });

  if (error) { showToast('產生失敗：' + error.message); return; }

  setInviteLink(token);
  showToast('✅ 已產生邀請連結');
};

function setInviteLink(token) {
  const base = window.location.origin + window.location.pathname.replace('trip.html', '');
  const link = `${base}join.html?token=${token}`;
  document.getElementById('invite-link-input').value = link;
}

window.copyInviteLink = function() {
  const input = document.getElementById('invite-link-input');
  navigator.clipboard.writeText(input.value)
    .then(() => showToast('✅ 已複製連結'))
    .catch(() => {
      input.select();
      document.execCommand('copy');
      showToast('✅ 已複製連結');
    });
};

// ==========================================
// Modal 開關
// ==========================================
window.openModal = function(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeModal = function(id) {
  document.getElementById(id).classList.add('hidden');
  const anyOpen = document.querySelectorAll('.modal:not(.hidden)').length > 0;
  if (!anyOpen) {
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.body.style.overflow = '';
  }
};

window.closeAllModals = function() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
};

// ==========================================
// 工具函式
// ==========================================
function showLoading(show) {
  document.getElementById('loading-mask').style.display = show ? 'flex' : 'none';
}

function showUnauth() {
  showLoading(false);
  document.getElementById('unauth-screen').classList.remove('hidden');
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
}

function formatCurrency(amount, currency) {
  if (amount === null || amount === undefined) return '';
  const num = parseFloat(amount);
  if (isNaN(num)) return '';

  const symbols = { JPY: '¥', TWD: 'NT$', USD: '$', EUR: '€', KRW: '₩' };
  const symbol = symbols[currency] || (currency ? currency + ' ' : '');

  if (currency === 'JPY' || currency === 'KRW') {
    return `${symbol}${Math.round(num).toLocaleString()}`;
  }
  return `${symbol}${num.toFixed(0).toLocaleString()}`;
}

function getCategoryLabel(cat) {
  const labels = {
    flight: '航班', hotel: '飯店', visa: '簽證',
    insurance: '保險', emergency: '緊急聯絡', other: '其他'
  };
  return labels[cat] || cat;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function stringToColor(str) {
  const colors = [
    '#8b1a1a', '#3d5a3e', '#b8924a', '#5a3d6b',
    '#1a5a8b', '#8b6a1a', '#1a8b6a', '#6b1a5a'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

window.openEditTrip = function() {
  showToast('✏️ 編輯功能即將推出');
};
