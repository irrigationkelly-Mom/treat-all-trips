// js/auth.js
import { supabase } from './supabase-client.js';

// ===== DOM 元素 =====
const btnGoogleLogin  = document.getElementById('btn-google-login');
const btnEmailLogin   = document.getElementById('btn-email-login');
const btnEmailSignup  = document.getElementById('btn-email-signup');
const inputEmail      = document.getElementById('input-email');
const inputPassword   = document.getElementById('input-password');
const loginError      = document.getElementById('login-error');
const loginLoading    = document.getElementById('login-loading');
const loginCard       = document.querySelector('.login-card');
const myTripsSection  = document.getElementById('my-trips-section');
const tripsList       = document.getElementById('trips-list');
const adminSection    = document.getElementById('admin-section');

// ===== 工具函式 =====
function showError(msg, isSuccess = false) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
  loginError.style.color       = isSuccess ? '#22c55e' : '#e53e3e';
  loginError.style.background  = isSuccess ? '#f0fff4' : '#fff5f5';
  loginError.style.borderColor = isSuccess ? '#9ae6b4' : '#fed7d7';
}

function hideError() {
  loginError.style.display = 'none';
}

function showLoading(msg = '處理中...') {
  loginLoading.querySelector('span').textContent = msg;
  loginLoading.style.display = 'flex';
  // 停用所有按鈕
  [btnGoogleLogin, btnEmailLogin, btnEmailSignup].forEach(b => b.disabled = true);
}

function hideLoading() {
  loginLoading.style.display = 'none';
  // 恢復所有按鈕
  [btnGoogleLogin, btnEmailLogin, btnEmailSignup].forEach(b => b.disabled = false);
}

// ===== Google 登入 =====
btnGoogleLogin.addEventListener('click', async () => {
  hideError();
  showLoading('跳轉至 Google...');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://irrigationkelly-mom.github.io/treat-all-trips/'
    }
  });

  if (error) {
    hideLoading();
    showError('Google 登入失敗：' + error.message);
  }
  // 成功會自動跳轉，不需要 hideLoading
});

// ===== Email 登入 =====
btnEmailLogin.addEventListener('click', async () => {
  hideError();
  const email    = inputEmail.value.trim();
  const password = inputPassword.value;

  if (!email || !password) {
    showError('請輸入電子郵件和密碼');
    return;
  }

  showLoading('登入中...');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  hideLoading();

  if (error) {
    // 常見錯誤翻譯
    if (error.message.includes('Invalid login credentials')) {
      showError('電子郵件或密碼錯誤');
    } else if (error.message.includes('Email not confirmed')) {
      showError('請先去信箱確認你的帳號');
    } else {
      showError('登入失敗：' + error.message);
    }
  }
});

// ===== Email 註冊 =====
btnEmailSignup.addEventListener('click', async () => {
  hideError();
  const email    = inputEmail.value.trim();
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
      emailRedirectTo: 'https://irrigationkelly-mom.github.io/treat-all-trips/'
    }
  });

  hideLoading();

  if (error) {
    if (error.message.includes('already registered')) {
      showError('此電子郵件已註冊，請直接登入');
    } else {
      showError('註冊失敗：' + error.message);
    }
  } else {
    showError('✅ 註冊成功！請去信箱點擊確認連結再登入', true);
    inputEmail.value    = '';
    inputPassword.value = '';
  }
});

// ===== Enter 鍵支援 =====
[inputEmail, inputPassword].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnEmailLogin.click();
  });
});

// ===== 格式化日期 =====
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ===== 取得行程狀態 =====
function getTripStatus(startDate, endDate) {
  const now   = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end   = endDate   ? new Date(endDate)   : null;

  if (!start) return { label: '規劃中', cls: 'status-planning' };
  if (now < start) return { label: '即將出發', cls: 'status-planning' };
  if (end && now > end) return { label: '已結束', cls: 'status-done' };
  return { label: '進行中', cls: 'status-ongoing' };
}

// ===== 載入行程列表 =====
async function loadTrips(userId) {
  tripsList.innerHTML = `
    <div class="loading-placeholder">載入行程中...</div>
  `;

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
    .eq('user_id', userId)
    .order('trip_id');

  if (error) {
    tripsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>載入失敗，請重新整理</p>
      </div>
    `;
    return;
  }

  if (!data || data.length === 0) {
    tripsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <p>還沒有行程</p>
        <p class="empty-sub">等待管理員邀請你加入旅行吧！</p>
      </div>
    `;
    return;
  }

  tripsList.innerHTML = data.map(({ trips: trip }) => {
    const status = getTripStatus(trip.start_date, trip.end_date);
    const dateText = trip.start_date
      ? `${formatDate(trip.start_date)}${trip.end_date ? ' ～ ' + formatDate(trip.end_date) : ''}`
      : '日期未定';

    return `
      <a href="trip.html?id=${trip.id}" class="trip-card">
        <div class="trip-card-emoji">${trip.cover_emoji || '✈️'}</div>
        <div class="trip-card-info">
          <div class="trip-card-name">${trip.name}</div>
          <div class="trip-card-dest">${trip.destination || '目的地未填'}</div>
          <div class="trip-card-date">📅 ${dateText}</div>
        </div>
        <div class="trip-card-right">
          <span class="trip-arrow">›</span>
          <span class="status-badge ${status.cls}">${status.label}</span>
        </div>
      </a>
    `;
  }).join('');
}

// ===== 登入後顯示行程 =====
async function showTrips(user) {
  loginCard.style.display     = 'none';
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

  await loadTrips(user.id);
}

// ===== 監聽登入狀態 =====
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth event:', event);

  if (session?.user) {
    await showTrips(session.user);
  } else {
    loginCard.style.display      = 'block';
    myTripsSection.style.display = 'none';
    adminSection.style.display   = 'none';
    hideLoading();
  }
});

// ===== 登出按鈕 =====
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}
