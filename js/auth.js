// js/auth.js
import { supabase, getCurrentUser, getUserProfile } from './supabase-client.js'

// DOM 元素
const btnGoogleLogin = document.getElementById('btn-google-login')
const btnEmailLogin = document.getElementById('btn-email-login')
const btnEmailSignup = document.getElementById('btn-email-signup')
const inputEmail = document.getElementById('input-email')
const inputPassword = document.getElementById('input-password')
const loginError = document.getElementById('login-error')
const loginLoading = document.getElementById('login-loading')
const myTripsSection = document.getElementById('my-trips-section')
const loginCard = document.querySelector('.login-card')
const tripsList = document.getElementById('trips-list')
const adminSection = document.getElementById('admin-section')

// ==================== 初始化 ====================
async function init() {
  // 檢查是否已登入
  const user = await getCurrentUser()
  if (user) {
    await showTrips(user)
  }

  // 監聽 Auth 狀態變化
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await showTrips(session.user)
    } else if (event === 'SIGNED_OUT') {
      showLoginForm()
    }
  })
}

// ==================== 登入方法 ====================

// Google 登入
btnGoogleLogin?.addEventListener('click', async () => {
  setLoading(true)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/index.html'
    }
  })
  if (error) showError(error.message)
  setLoading(false)
})

// Email 登入
btnEmailLogin?.addEventListener('click', async () => {
  const email = inputEmail.value.trim()
  const password = inputPassword.value
  if (!email || !password) return showError('請輸入電子郵件和密碼')
  
  setLoading(true)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) showError('登入失敗：' + error.message)
  setLoading(false)
})

// Email 註冊
btnEmailSignup?.addEventListener('click', async () => {
  const email = inputEmail.value.trim()
  const password = inputPassword.value
  if (!email || !password) return showError('請輸入電子郵件和密碼')
  if (password.length < 6) return showError('密碼至少需要 6 個字元')
  
  setLoading(true)
  const { error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      emailRedirectTo: window.location.origin + '/index.html'
    }
  })
  if (error) {
    showError('註冊失敗：' + error.message)
  } else {
    showError('✅ 註冊成功！請檢查電子郵件進行驗證', 'success')
  }
  setLoading(false)
})

// ==================== 顯示行程列表 ====================
async function showTrips(user) {
  // 隱藏登入表單，顯示行程列表
  loginCard.style.display = 'none'
  myTripsSection.style.display = 'block'

  // 取得 profile
  const profile = await getUserProfile(user.id)
  
  // Platform Admin 顯示管理功能
  if (profile?.is_platform_admin) {
    adminSection.style.display = 'block'
  }

  // 載入我的行程
  await loadMyTrips(user.id)
}

async function loadMyTrips(userId) {
  tripsList.innerHTML = '<div class="loading-text">載入中...</div>'

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
        status,
        cover_image_url,
        theme_color
      )
    `)
    .eq('user_id', userId)
    .in('trips.status', ['upcoming', 'active'])
    .order('trips(start_date)', { ascending: true })

  if (error || !data?.length) {
    tripsList.innerHTML = '<div class="empty-state">尚無行程<br><small>等待管理員邀請你加入</small></div>'
    return
  }

  tripsList.innerHTML = data.map(({ trips: trip }) => {
    if (!trip) return ''
    const statusLabel = { upcoming: '即將出發', active: '進行中', completed: '已結束' }
    const statusClass = { upcoming: 'status-upcoming', active: 'status-active', completed: 'status-done' }
    
    return `
      <a href="trip.html?id=${trip.id}" class="trip-card" style="--trip-color: ${trip.theme_color || '#667eea'}">
        <div class="trip-card-header" style="background: ${trip.theme_color || '#667eea'}">
          ${trip.cover_image_url 
            ? `<img src="${trip.cover_image_url}" alt="${trip.name}">` 
            : `<div class="trip-card-icon">✈️</div>`
          }
          <span class="trip-status ${statusClass[trip.status]}">${statusLabel[trip.status]}</span>
        </div>
        <div class="trip-card-body">
          <h3>${trip.name}</h3>
          <p>📍 ${trip.destination}</p>
          <p>📅 ${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}</p>
        </div>
      </a>
    `
  }).join('')
}

// ==================== 工具函式 ====================
function setLoading(show) {
  loginLoading.style.display = show ? 'flex' : 'none'
  btnGoogleLogin && (btnGoogleLogin.disabled = show)
  btnEmailLogin && (btnEmailLogin.disabled = show)
}

function showError(msg, type = 'error') {
  loginError.textContent = msg
  loginError.className = type === 'success' ? 'success-msg' : 'error-msg'
  loginError.style.display = 'block'
  setTimeout(() => { loginError.style.display = 'none' }, 5000)
}

function showLoginForm() {
  loginCard.style.display = 'block'
  myTripsSection.style.display = 'none'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth()+1}/${d.getDate()}`
}

// 啟動
init()

