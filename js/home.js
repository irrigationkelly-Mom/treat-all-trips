// js/home.js
import {
  supabase,
  waitForSession,
  onAuthStateChange,
  sendMagicLink,
  signOut,
  isValidEmail,
} from './auth.js';

// ─── 常數 ───────────────────────────────────────────────────
const ADMIN_UUID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb';

// ─── DOM 元素 ────────────────────────────────────────────────
const pageLoading     = document.getElementById('page-loading');
const authSection     = document.getElementById('auth-section');
const appSection      = document.getElementById('app-section');
const emailInput      = document.getElementById('email-input');
const sendBtn         = document.getElementById('send-magic-link');
const authMsg         = document.getElementById('auth-message');
const signOutBtn      = document.getElementById('sign-out-btn');
const tripsContainer  = document.getElementById('trips-container');
const userEmailEl     = document.getElementById('user-email');

// ─── UI 切換 ─────────────────────────────────────────────────
function showPage(page) {
  pageLoading.classList.add('hidden');
  if (page === 'auth') {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
  } else {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
  }
}

// ─── 取得使用者 Profile ──────────────────────────────────────
async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// ─── 載入行程 ─────────────────────────────────────────────────
async function loadTrips(userId, isAdmin) {
  let query;
  if (isAdmin) {
    query = supabase.from('trips').select('*').order('start_date', { ascending: true });
  } else {
    query = supabase
      .from('trip_members')
      .select('trip_id, trips(*)')
      .eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('loadTrips error:', error);
    return [];
  }

  if (isAdmin) return data;
  return data.map((row) => row.trips).filter(Boolean);
}

// ─── Countdown 計算 ──────────────────────────────────────────
function getCountdown(startDate, endDate) {
  const now   = new Date();
  const start = new Date(startDate);
  const end   = new Date(endDate);

  if (now < start) {
    const days = Math.ceil((start - now) / 86400000);
    if (days <= 7)  return { label: `${days}天後出發`, cls: 'countdown-soon' };
    return { label: `${days}天後`, cls: 'countdown-future' };
  }
  if (now <= end) {
    return { label: '旅行中 ✈️', cls: 'countdown-active' };
  }
  return { label: '已結束', cls: 'countdown-past' };
}

// ─── 渲染單張行程卡 ──────────────────────────────────────────
function createTripCard(trip) {
  const cd   = getCountdown(trip.start_date, trip.end_date);
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.innerHTML = `
    <div class="trip-card-header">
      <span class="countdown-badge ${cd.cls}">${cd.label}</span>
    </div>
    <h3 class="trip-title">${trip.name}</h3>
    <p class="trip-dates">${trip.start_date} ～ ${trip.end_date}</p>
  `;
  card.addEventListener('click', () => {
    window.location.href = `trip.html?id=${trip.id}`;
  });
  return card;
}

// ─── 渲染行程列表 ─────────────────────────────────────────────
function renderTrips(trips) {
  tripsContainer.innerHTML = '';
  if (!trips.length) {
    tripsContainer.innerHTML = `
      <div class="empty-state">
        <p>目前還沒有行程</p>
      </div>`;
    return;
  }
  trips.forEach((t) => tripsContainer.appendChild(createTripCard(t)));
}

// ─── 已登入流程 ──────────────────────────────────────────────
async function handleSignedIn(session) {
  const userId  = session.user.id;
  const isAdmin = userId === ADMIN_UUID;

  if (userEmailEl) userEmailEl.textContent = session.user.email;

  showPage('app');

  const trips = await loadTrips(userId, isAdmin);
  renderTrips(trips);
}

// ─── Magic Link 送出 ─────────────────────────────────────────
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim();
  if (!isValidEmail(email)) {
    authMsg.textContent = '請輸入正確的 Email';
    authMsg.className   = 'auth-message error';
    return;
  }

  sendBtn.disabled    = true;
  authMsg.textContent = '發送中...';
  authMsg.className   = 'auth-message';

  const { error } = await sendMagicLink(email);

  if (error) {
    authMsg.textContent = `發送失敗：${error.message}`;
    authMsg.className   = 'auth-message error';
    sendBtn.disabled    = false;
  } else {
    authMsg.textContent = '✅ 已發送！請檢查你的信箱';
    authMsg.className   = 'auth-message success';
  }
});

// ─── 登出 ─────────────────────────────────────────────────────
signOutBtn?.addEventListener('click', async () => {
  await signOut();
  showPage('auth');
});

// ─── 初始化 ──────────────────────────────────────────────────
async function init() {
  const session = await waitForSession();

  if (session) {
    await handleSignedIn(session);
  } else {
    showPage('auth');
  }

  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await handleSignedIn(session);
    } else if (event === 'SIGNED_OUT') {
      showPage('auth');
    }
  });
}

init();
