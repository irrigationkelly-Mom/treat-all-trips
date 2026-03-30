// js/auth.js
import { supabase } from './supabase-client.js';

// ===== DOM 元素 =====
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnEmailLogin = document.getElementById('btn-email-login');
const btnEmailSignup = document.getElementById('btn-email-signup');
const inputEmail = document.getElementById('input-email');
const inputPassword = document.getElementById('input-password');
const loginError = document.getElementById('login-error');
const loginLoading = document.getElementById('login-loading');
const loginCard = document.querySelector('.login-card');
const myTripsSection = document.getElementById('my-trips-section');
const tripsList = document.getElementById('trips-list');
const adminSection = document.getElementById('admin-section');

// ===== 工具函式 =====
function showError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

function hideError() {
  loginError.style.display = 'none';
}

function showLoading(msg = '處理中...') {
  loginLoading.querySelector('span').textContent = msg;
  loginLoading.style.display = 'flex';
}

function hideLoading() {
  loginLoading.style.display = 'none';
}

// ===== Google 登入 =====
btnGoogleLogin.addEventListener('click', async () => {
  hideError();
  showLoading('跳轉至 Google...');
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/treat-all-trips/'
    }
  });

  if (error) {
    hideLoading();
    showError('Google 登入失敗：' + error.message);
  }
});

// ===== Email 登入 =====
btnEmailLogin.addEventListener('click', async () => {
  hideError();
  const email = inputEmail.value.trim();
  const password = inputPassword.value;

  if (!email || !password) {
    showError('請輸入電子郵件和密碼');
    return;
  }

  showLoading('登入中...');

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  hideLoading();

  if (error) {
    showError('登入失敗：' + error.message);
  }
});

// ===== Email 註冊 =====
btnEmailSignup.addEventListener('click', async () => {
  hideError();
  const email = inputEmail.value.trim();
  const password = inputPassword.value;

  if (!email || !password) {
    showError('請輸入電子郵件和密碼');
    return;
  }

  if (password.length < 6) {
    showError('密碼至少需要 6 個字元');
    return;
  }

  showLoading('註冊中...');

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + '/treat-all-trips/'
    }
  });

  hideLoading();

  if (error) {
    showError('註冊失敗：' + error.message);
  } else {
    showError('✅ 註冊成功！請去信箱確認後再登入');
    loginError.style.color = '#22c55e';
  }
});

// ===== 登入後顯示行程列表 =====
async function showTrips(user) {
  loginCard.style.display = 'none';
  myTripsSection.style.display = 'block';

  // 檢查是否為 Platform Admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.is_platform_admin) {
    adminSection.style.display = 'block';
  }

  // 載入行程列表
  await loadTrips(user.id);
}

// ===== 載入行程 =====
async function loadTrips(userId) {
  tripsList.innerHTML = '<p class="loading-text">載入中...</p>';

  const { data, error } = await supabase
    .from('trip_members')
    .select(`
      trip_id,
      trips (
        id,
        name,
        destination,
        start_date,
        end_date,
        cover_emoji
      )
    `)
    .eq('user_id', userId);

  if (error || !data || data.length === 0) {
    tripsList.innerHTML = '<p class="empty-text">還沒有行程，等待管理員邀請你加入！</p>';
    return;
  }

  tripsList.innerHTML = data.map(({ trips: trip }) => `
    <a href="trip.html?id=${trip.id}" class="trip-card">
      <div class="trip-emoji">${trip.cover_emoji || '✈️'}</div>
      <div class="trip-info">
        <div class="trip-name">${trip.name}</div>
        <div class="trip-dest">${trip.destination || ''}</div>
        <div class="trip-date">
          ${trip.start_date ? formatDate(trip.start_date) : ''} 
          ${trip.end_date ? '～ ' + formatDate(trip.end_date) : ''}
        </div>
      </div>
    </a>
  `).join('');
}

// ===== 格式化日期 =====
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ===== 監聽登入狀態 =====
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    await showTrips(session.user);
  } else {
    loginCard.style.display = 'block';
    myTripsSection.style.display = 'none';
    adminSection.style.display = 'none';
  }
});

// ===== 登出按鈕（如果有的話）=====
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}
