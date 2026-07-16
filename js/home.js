console.log('[home.js] 模組開始載入')

import {
  supabase,
  waitForSession,
  getMagicLinkRedirect,
  isValidEmail,
  isAdmin,
  sendMagicLinkViaREST
} from './auth.js'

// ============================
// Loading 控制
// ============================
function showLoading() {
  const el = document.getElementById('page-loading')
  if (el) el.classList.remove('hidden')
}

function hideLoading() {
  const el = document.getElementById('page-loading')
  if (el) {
    el.classList.add('hidden')
    el.style.display = 'none'
  }
}

// ============================
// 畫面切換
// ============================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'))
  const target = document.getElementById(screenId)
  if (target) target.classList.remove('hidden')
  console.log('[home] 顯示畫面:', screenId)
}

// ============================
// 登入畫面
// ============================
function initLoginScreen() {
  const emailInput = document.getElementById('auth-email')
  const submitBtn = document.getElementById('send-magic-link-btn')
  const errorMsg = document.getElementById('auth-message')

  if (!submitBtn) return

    submitBtn.addEventListener('click', async (e) => {
    e.preventDefault()
    const email = emailInput?.value?.trim()

    if (!isValidEmail(email)) {
      if (errorMsg) errorMsg.textContent = '請輸入有效的電子郵件'
      return
    }

    if (errorMsg) errorMsg.textContent = ''

    const redirectTo = getMagicLinkRedirect()
    console.log('[home] 發送 magic link，redirect:', redirectTo)

    const { error } = await sendMagicLinkViaREST(email, redirectTo)

    if (error) {
      if (errorMsg) errorMsg.textContent = error
    } else {
      showScreen('magic-link-sent')
      const sentEmail = document.getElementById('sent-email-display')
      if (sentEmail) sentEmail.textContent = email
    }
  })

// ============================
// 已發送畫面
// ============================
function initSentScreen() {
  const btn = document.getElementById('resend-btn')
  if (!btn) return

  btn.addEventListener('click', () => {
    showScreen('auth-screen')
  })
}

// ============================
// 行程卡片
// ============================
function getCountdown(startDate, endDate) {
  const now = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (now < start) {
    const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24))
    if (days <= 7) return { label: '即將出發', class: 'soon' }
    return { label: `${days} 天後`, class: 'future' }
  } else if (now <= end) {
    return { label: '進行中', class: 'active' }
  } else {
    return { label: '已結束', class: 'past' }
  }
}

function renderTripCard(trip) {
  const countdown = getCountdown(trip.start_date, trip.end_date)
  return `
    <a href="trip.html?id=${trip.id}" class="trip-card">
      <div class="trip-card-header">
        <span class="countdown-badge ${countdown.class}">${countdown.label}</span>
      </div>
      <h3 class="trip-name">${trip.name}</h3>
      <p class="trip-dates">${trip.start_date} – ${trip.end_date}</p>
    </a>
  `
}

// ============================
// 載入行程
// ============================
async function loadTrips(userId) {
  if (isAdmin(userId)) {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('start_date', { ascending: false })
    if (error) throw error
    return data || []
  }

  const { data, error } = await supabase
    .from('trip_members')
    .select('trip_id, trips(*)')
    .eq('user_id', userId)
  if (error) throw error
  return (data || []).map(row => row.trips).filter(Boolean)
}

// ============================
// 渲染首頁
// ============================
async function renderHome(session) {
  const user = session.user
  const userId = user.id

  // 顯示 email
  const emailEl = document.getElementById('user-email-display')
  if (emailEl) emailEl.textContent = user.email

  // 管理員按鈕
  const adminBtn = document.getElementById('admin-btn')
  if (adminBtn) {
    adminBtn.style.display = isAdmin(userId) ? 'inline-flex' : 'none'
  }

  // 載入行程
  const tripList = document.getElementById('trips-list')
  if (tripList) {
    tripList.innerHTML = '<p class="loading-text">載入中...</p>'
    try {
      const trips = await loadTrips(userId)
      if (trips.length === 0) {
        tripList.innerHTML = '<p class="empty-text">目前沒有行程</p>'
      } else {
        tripList.innerHTML = trips.map(renderTripCard).join('')
      }
    } catch (err) {
      console.error('[home] 載入行程失敗:', err)
      tripList.innerHTML = '<p class="error-text">載入失敗，請重試</p>'
    }
  }

  // 登出按鈕
  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut()
      showScreen('auth-screen')
    })
  }
}

// ============================
// 主程式
// ============================
async function init() {
  console.log('[init] 開始')
  showLoading()

  try {
    initLoginScreen()
    initSentScreen()

    console.log('[init] 等待 session...')
    const session = await waitForSession()
    console.log('[init] session:', session ? session.user.email : 'null')

    if (session) {
      showScreen('home-screen')
      await renderHome(session)
    } else {
      showScreen('auth-screen')
    }
  } catch (err) {
    console.error('[init] 錯誤:', err)
    showScreen('auth-screen')
  } finally {
    console.log('[init] finally — 隱藏 loading')
    hideLoading()
  }
}

init()
