import { supabase, getCurrentUser, getUserProfile, sendMagicLink, signOut } from './auth.js';

// ── DOM 元素 ──────────────────────────────────────
const pageLoading   = document.getElementById('page-loading');
const authScreen    = document.getElementById('auth-screen');
const homeScreen    = document.getElementById('home-screen');

const emailInput    = document.getElementById('auth-email');
const sendBtn       = document.getElementById('send-magic-link-btn');
const authMessage   = document.getElementById('auth-message');
const magicForm     = document.getElementById('magic-link-form');
const magicSent     = document.getElementById('magic-link-sent');
const sentEmailDisp = document.getElementById('sent-email-display');
const resendBtn     = document.getElementById('resend-btn');

const adminBtn      = document.getElementById('admin-btn');
const logoutBtn     = document.getElementById('logout-btn');

const tripsLoading  = document.getElementById('trips-loading');
const tripsEmpty    = document.getElementById('trips-empty');
const tripsList     = document.getElementById('trips-list');

// ── 初始化 ────────────────────────────────────────
async function init() {
  // 監聽 Auth 狀態
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      if (session?.user) {
        await showHome(session.user);
      } else {
        showAuth();
      }
    } else if (event === 'SIGNED_OUT') {
      showAuth();
    }
  });
}

// ── 顯示登入畫面 ──────────────────────────────────
function showAuth() {
  pageLoading.style.display = 'none';
  authScreen.style.display = 'flex';
  homeScreen.style.display = 'none';
}

// ── 顯示首頁 ──────────────────────────────────────
async function showHome(user) {
  pageLoading.style.display = 'none';
  authScreen.style.display = 'none';
  homeScreen.style.display = 'block';

  // 檢查是否為 Platform Admin
  const profile = await getUserProfile(user.id);
  if (profile?.is_platform_admin) {
    adminBtn.style.display = 'flex';
  }

  // 載入旅行列表
  await loadTrips(user.id, profile?.is_platform_admin);
}

// ── 載入旅行列表 ──────────────────────────────────
async function loadTrips(userId, isAdmin) {
  tripsLoading.style.display = 'flex';
  tripsEmpty.style.display = 'none';
  tripsList.style.display = 'none';

  try {
    let trips = [];

    if (isAdmin) {
      // Admin：取得自己創建的所有旅行
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('created_by', userId)
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      trips = data || [];
    } else {
      // 一般成員：透過 trip_members 取得有權限的旅行
      const { data, error } = await supabase
        .from('trip_members')
        .select(`
          trip_id,
          trips (*)
        `)
        .eq('user_id', userId);
      
      if (error) throw error;
      trips = (data || []).map(m => m.trips).filter(Boolean);
      trips.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    }

    tripsLoading.style.display = 'none';

    if (trips.length === 0) {
      tripsEmpty.style.display = 'flex';
    } else {
      tripsList.style.display = 'grid';
      renderTrips(trips);
    }

  } catch (err) {
    console.error('載入旅行失敗:', err);
    tripsLoading.style.display = 'none';
    tripsEmpty.style.display = 'flex';
  }
}

// ── 渲染旅行卡片 ──────────────────────────────────
function renderTrips(trips) {
  tripsList.innerHTML = '';

  trips.forEach(trip => {
    const card = createTripCard(trip);
    tripsList.appendChild(card);
  });
}

// ── 建立旅行卡片 ──────────────────────────────────
function createTripCard(trip) {
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  // 計算天數倒數
  const countdownText = getCountdown(trip.start_date, trip.end_date);

  // 格式化日期
  const dateText = formatDateRange(trip.start_date, trip.end_date);

  // 取得成員數（之後可以改為實際查詢）
  const memberCount = trip.member_count || '—';

  card.innerHTML = `
    <div class="trip-card-header">
      <span class="trip-card-emoji">${trip.cover_emoji || '✈️'}</span>
      <div class="trip-card-countdown ${getCountdownClass(trip.start_date, trip.end_date)}">
        ${countdownText}
      </div>
    </div>
    <div class="trip-card-body">
      <h3 class="trip-card-name">${escapeHtml(trip.name)}</h3>
      <p class="trip-card-dest">📍 ${escapeHtml(trip.destination || '')}</p>
      <div class="trip-card-meta">
        <span class="trip-card-date">📅 ${dateText}</span>
        <span class="trip-card-members">👥 ${memberCount} 人</span>
      </div>
    </div>
  `;

  // 點擊進入旅行
  card.addEventListener('click', () => {
    location.href = `trip.html?id=${trip.id}`;
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      location.href = `trip.html?id=${trip.id}`;
    }
  });

  return card;
}

// ── 計算倒數天數 ──────────────────────────────────
function getCountdown(startDate, endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffToStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  const diffToEnd = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

  if (diffToStart > 0) {
    return `還有 ${diffToStart} 天`;
  } else if (diffToEnd >= 0) {
    return '旅行中 🎉';
  } else {
    return `已結束 ${Math.abs(diffToEnd)} 天前`;
  }
}

// ── 倒數樣式 class ────────────────────────────────
function getCountdownClass(startDate, endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffToStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  const diffToEnd = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

  if (diffToStart > 30) return 'countdown-future';
  if (diffToStart > 0) return 'countdown-soon';
  if (diffToEnd >= 0) return 'countdown-active';
  return 'countdown-past';
}

// ── 格式化日期範圍 ────────────────────────────────
function formatDateRange(startDate, endDate) {
  if (!startDate) return '日期未定';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const year = start.getFullYear();

  if (!end) return `${year} ${fmt(start)}`;
  return `${year} ${fmt(start)} – ${fmt(end)}`;
}

// ── 安全跳脫 HTML ─────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 事件綁定：發送 Magic Link ─────────────────────
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim();
  if (!email) {
    showAuthMessage('請輸入電子郵件', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showAuthMessage('請輸入有效的電子郵件格式', 'error');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '發送中⋯';

  const redirectTo = `${location.origin}${location.pathname.replace('index.html', '')}index.html`;
  const { error } = await sendMagicLink(email, redirectTo);

  sendBtn.disabled = false;
  sendBtn.textContent = '發送登入連結';

  if (error) {
    showAuthMessage('發送失敗：' + error.message, 'error');
  } else {
    sentEmailDisp.textContent = email;
    magicForm.style.display = 'none';
    magicSent.style.display = 'block';
  }
});

// ── 事件綁定：重新發送 ────────────────────────────
resendBtn?.addEventListener('click', () => {
  magicSent.style.display = 'none';
  magicForm.style.display = 'block';
  emailInput.value = '';
  emailInput.focus();
});

// ── 事件綁定：Enter 鍵送出 ───────────────────────
emailInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn?.click();
});

// ── 事件綁定：管理後台 ────────────────────────────
adminBtn?.addEventListener('click', () => {
  location.href = 'admin.html';
});

// ── 事件綁定：登出 ────────────────────────────────
logoutBtn?.addEventListener('click', async () => {
  if (confirm('確定要登出嗎？')) {
    await signOut();
  }
});

// ── 顯示 Auth 訊息 ────────────────────────────────
function showAuthMessage(msg, type = 'info') {
  if (!authMessage) return;
  authMessage.textContent = msg;
  authMessage.className = `auth-message auth-message-${type}`;
  authMessage.style.display = 'block';
}

// ── Email 驗證 ────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── 啟動 ─────────────────────────────────────────
init();
