import { supabase } from './supabase-client.js';

let currentUser = null;
let currentTripId = null;

// 初始化
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = '/treat-all-trips/';
    return;
  }

  currentUser = session.user;

  // 確認是 Platform Admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin, display_name')
    .eq('id', currentUser.id)
    .single();

  if (!profile?.is_platform_admin) {
    alert('你沒有管理員權限');
    window.location.href = '/treat-all-trips/';
    return;
  }

  setupEventListeners();
  loadTrips();
}

// 綁定事件
function setupEventListeners() {
  // 建立旅行表單
  document.getElementById('createTripForm')
    .addEventListener('submit', handleCreateTrip);

  // 登出
  document.getElementById('logoutBtn')
    .addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/treat-all-trips/';
    });

  // Modal 關閉
  document.getElementById('closeModal')
    .addEventListener('click', closeModal);
  document.getElementById('modalOverlay')
    .addEventListener('click', closeModal);

  // 生成邀請連結
  document.getElementById('generateInviteBtn')
    .addEventListener('click', generateInviteLink);

  // 複製連結
  document.getElementById('copyInviteLink')
    .addEventListener('click', copyInviteLink);
}

// 建立旅行
async function handleCreateTrip(e) {
  e.preventDefault();

  const name = document.getElementById('tripName').value.trim();
  const emoji = document.getElementById('tripEmoji').value.trim() || '✈️';
  const destination = document.getElementById('tripDestination').value.trim();
  const startDate = document.getElementById('tripStartDate').value;
  const endDate = document.getElementById('tripEndDate').value;
  const currency = document.getElementById('tripCurrency').value;
  const description = document.getElementById('tripDescription').value.trim();

  if (!name) return;

  const msgEl = document.getElementById('createTripMessage');
  showMessage(msgEl, '建立中...', 'info');

  try {
    // 生成唯一 trip_code
    const tripCode = generateTripCode();

    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        name,
        emoji,
        destination,
        start_date: startDate || null,
        end_date: endDate || null,
        base_currency: currency,
        description,
        trip_code: tripCode,
        created_by: currentUser.id
      })
      .select()
      .single();

    if (error) throw error;

    // 將 Admin 加入為成員（擁有全部權限）
    await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: currentUser.id,
      display_name: '管理員',
      can_view_itinerary: true,
      can_view_expense: true,
      can_view_shopping: true,
      can_view_info: true,
      can_view_tools: true,
      can_view_memo: true,
      can_view_packing: true,
      can_view_private_expense: true,
      joined_at: new Date().toISOString()
    });

    showMessage(msgEl, `✅ 旅行「${name}」建立成功！`, 'success');
    document.getElementById('createTripForm').reset();
    loadTrips();

  } catch (err) {
    console.error(err);
    showMessage(msgEl, `❌ 建立失敗：${err.message}`, 'error');
  }
}

// 載入旅行列表
async function loadTrips() {
  const listEl = document.getElementById('tripsList');
  listEl.innerHTML = '<div class="loading-placeholder">載入中...</div>';

  try {
    const { data: trips, error } = await supabase
      .from('trips')
      .select(`
        *,
        trip_members(count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!trips || trips.length === 0) {
      listEl.innerHTML = '<p class="empty-state">還沒有旅行，建立第一個吧！</p>';
      return;
    }

    listEl.innerHTML = trips.map(trip => `
      <div class="trip-card" data-trip-id="${trip.id}">
        <div class="trip-card-header">
          <span class="trip-emoji">${trip.emoji || '✈️'}</span>
          <div class="trip-card-info">
            <h3 class="trip-card-name">${trip.name}</h3>
            <p class="trip-card-meta">
              ${trip.destination ? `📍 ${trip.destination}` : ''}
              ${trip.start_date ? `📅 ${formatDate(trip.start_date)}` : ''}
            </p>
            <p class="trip-card-meta">
              💰 ${trip.base_currency} 
              · 🔑 ${trip.trip_code}
            </p>
          </div>
        </div>
        <div class="trip-card-actions">
          <button 
            class="btn btn-secondary btn-sm"
            onclick="openTripPage('${trip.trip_code}')"
          >
            開啟旅行
          </button>
          <button 
            class="btn btn-primary btn-sm"
            onclick="openInviteModal('${trip.id}', '${trip.name}')"
          >
            邀請成員
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p class="error-state">載入失敗</p>';
  }
}

// 開啟旅行頁面
window.openTripPage = function(tripCode) {
  window.location.href = `/treat-all-trips/trip.html?code=${tripCode}`;
};

// 開啟邀請 Modal
window.openInviteModal = function(tripId, tripName) {
  currentTripId = tripId;
  document.querySelector('.modal-title').textContent = `🔗 邀請加入「${tripName}」`;
  document.getElementById('inviteLinkResult').classList.add('hidden');
  document.getElementById('inviteModal').classList.remove('hidden');
};

// 關閉 Modal
function closeModal() {
  document.getElementById('inviteModal').classList.add('hidden');
  currentTripId = null;
}

// 生成邀請連結
async function generateInviteLink() {
  if (!currentTripId) return;

  const inviteeName = document.getElementById('inviteeName').value.trim();
  const expiryHours = parseInt(document.getElementById('inviteExpiry').value);

  const permissions = {
    can_view_itinerary: document.getElementById('perm_itinerary').checked,
    can_view_expense: document.getElementById('perm_expense').checked,
    can_view_shopping: document.getElementById('perm_shopping').checked,
    can_view_info: document.getElementById('perm_info').checked,
    can_view_tools: document.getElementById('perm_tools').checked,
    can_view_memo: document.getElementById('perm_memo').checked,
    can_view_packing: document.getElementById('perm_packing').checked,
    can_view_private_expense: document.getElementById('perm_private_expense').checked
  };

  try {
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    const { error } = await supabase
      .from('invite_links')
      .insert({
        trip_id: currentTripId,
        token,
        invitee_name: inviteeName || null,
        expires_at: expiresAt.toISOString(),
        created_by: currentUser.id,
        ...permissions
      });

    if (error) throw error;

    const inviteUrl = `https://irrigationkelly-mom.github.io/treat-all-trips/join.html?token=${token}`;
    
    document.getElementById('inviteLinkText').textContent = inviteUrl;
    document.getElementById('inviteLinkResult').classList.remove('hidden');

  } catch (err) {
    console.error(err);
    alert(`生成失敗：${err.message}`);
  }
}

// 複製邀請連結
async function copyInviteLink() {
  const link = document.getElementById('inviteLinkText').textContent;
  try {
    await navigator.clipboard.writeText(link);
    document.getElementById('copyInviteLink').textContent = '✅ 已複製';
    setTimeout(() => {
      document.getElementById('copyInviteLink').textContent = '📋 複製';
    }, 2000);
  } catch {
    alert('請手動複製連結');
  }
}

// 工具函數
function generateTripCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-TW');
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove('hidden');
  if (type === 'success') {
    setTimeout(() => el.classList.add('hidden'), 3000);
  }
}

// 啟動
init();
