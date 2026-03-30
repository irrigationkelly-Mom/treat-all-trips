import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase 初始化 ───────────────────────────────
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcwNjYsImV4cCI6MjA5MDI3MzA2Nn0.Jmb_MAvaZpCy1jCwgTPlD0Slpb3i55UJQ823wOXkaBc';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// ── 防止重複執行 showHome ─────────────────────────
let homeShown = false;

// ── 初始化 ────────────────────────────────────────
async function init() {
  // 先用 getSession 直接判斷（比 onAuthStateChange 更可靠）
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user) {
    await showHome(session.user);
  } else {
    showAuth();
  }

  // 同時監聽後續的狀態變化（如 Magic Link 回調）
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', event, session?.user?.email);
    
    if (event === 'SIGNED_IN') {
      if (session?.user && !homeShown) {
        await showHome(session.user);
      }
    } else if (event === 'SIGNED_OUT') {
      homeShown = false;
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
  homeShown = true;
  pageLoading.style.display = 'none';
  authScreen.style.display = 'none';
  homeScreen.style.display = 'block';

  // 重設 admin-btn（避免重複顯示）
  adminBtn.style.display = 'none';

  // 取得 Profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('取得 Profile 失敗:', profileError);
  }

  // 顯示管理員按鈕
  if (profile?.is_platform_admin) {
    adminBtn.style.display = 'flex';
  }

  // 載入旅行列表
  await loadTrips(user.id, profile?.is_platform_admin ?? false);
}

// ── 載入旅行列表 ──────────────────────────────────
async function loadTrips(userId, isAdmin) {
  tripsLoading.style.display = 'flex';
  tripsEmpty.style.display = 'none';
  tripsList.style.display = 'none';
  tripsList.innerHTML = '';

  try {
    let trips = [];

    if (isAdmin) {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('created_by', userId)
        .order('start_date', { ascending: true });

      if (error) throw error;
      trips = data || [];
    } else {
      const { data, error } = await supabase
        .from('trip_members')
        .select('trip_id, trips(*)')
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
    tripsList.appendChild(createTripCard(trip));
  });
}

// ── 建立旅行卡片 ──────────────────────────────────
function createTripCard(trip) {
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const countdownText  = getCountdown(trip.start_date, trip.end_date);
  const countdownClass = getCountdownClass(trip.start_date, trip.end_date);
  const dateText       = formatDateRange(trip.start_date, trip.end_date);

  card.innerHTML = `
    <div class="trip-card-header">
      <span class="trip-card-emoji">${trip.cover_emoji || '✈️'}</span>
      <div class="trip-card-countdown ${countdownClass}">
        ${countdownText}
      </div>
    </div>
    <div class="trip-card-body">
      <h3 class="trip-card-name">${escapeHtml(trip.name)}</h3>
      <p class="trip-card-dest">📍 ${escapeHtml(trip.destination || '')}</p>
      <div class="trip-card-meta">
        <span class="trip-card-date">📅 ${dateText}</span>
      </div>
    </div>
  `;

  const go = () => { location.href = `trip.html?id=${trip.id}`; };
  card.addEventListener('click', go);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') go();
  });

  return card;
}

// ── 計算倒數天數 ──────────────────────────────────
function getCountdown(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end   = new Date(endDate);   end.setHours(0, 0, 0, 0);

  const diffStart = Math.ceil((start - today) / 86400000);
  const diffEnd   = Math.ceil((end - today) / 86400000);

  if (diffStart > 0) return `還有 ${diffStart} 天`;
  if (diffEnd >= 0)  return '旅行中 🎉';
  return `已結束`;
}

// ── 倒數樣式 class ────────────────────────────────
function getCountdownClass(startDate, endDate) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end   = new Date(endDate);   end.setHours(0, 0, 0, 0);

  const diffStart = Math.ceil((start - today) / 86400000);
  const diffEnd   = Math.ceil((end - today) / 86400000);

  if (diffStart > 30) return 'countdown-future';
  if (diffStart > 0)  return 'countdown-soon';
  if (diffEnd >= 0)   return 'countdown-active';
  return 'countdown-past';
}

// ── 格式化日期範圍 ────────────────────────────────
function formatDateRange(startDate, endDate) {
  if (!startDate) return '日期未定';
  const start = new Date(startDate);
  const end   = endDate ? new Date(endDate) : null;
  const fmt   = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const year  = start.getFullYear();
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

// ── 事件：發送 Magic Link ─────────────────────────
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim();
  if (!email)               return showAuthMessage('請輸入電子郵件', 'error');
  if (!isValidEmail(email)) return showAuthMessage('請輸入有效的電子郵件格式', 'error');

  sendBtn.disabled    = true;
  sendBtn.textContent = '發送中⋯';

  const redirectTo = `${location.origin}${location.pathname.replace(/\/[^/]*$/, '')}/index.html`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });

  sendBtn.disabled    = false;
  sendBtn.textContent = '發送登入連結';

  if (error) {
    showAuthMessage('發送失敗：' + error.message, 'error');
  } else {
    sentEmailDisp.textContent = email;
    magicForm.style.display   = 'none';
    magicSent.style.display   = 'block';
  }
});

// ── 事件：重新發送 ────────────────────────────────
resendBtn?.addEventListener('click', () => {
  magicSent.style.display = 'none';
  magicForm.style.display = 'block';
  emailInput.value = '';
  emailInput.focus();
});

// ── 事件：Enter 鍵 ────────────────────────────────
emailInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn?.click();
});

// ── 事件：管理後台 ────────────────────────────────
adminBtn?.addEventListener('click', () => {
  location.href = 'admin.html';
});

// ── 事件：登出 ────────────────────────────────────
logoutBtn?.addEventListener('click', async () => {
  if (!confirm('確定要登出嗎？')) return;
  await supabase.auth.signOut();
  location.reload();
});

// ── 顯示訊息 ──────────────────────────────────────
function showAuthMessage(msg, type = 'info') {
  if (!authMessage) return;
  authMessage.textContent = msg;
  authMessage.className   = `auth-message auth-message-${type}`;
  authMessage.style.display = 'block';
}

// ── Email 格式驗證 ────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── 啟動 ─────────────────────────────────────────
init();
