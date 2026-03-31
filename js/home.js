// js/home.js
import {
  supabase,
  getMagicLinkRedirect,
  sendMagicLink,
  waitForSession,
  signOut,
  onAuthStateChange   // ✅ 補上這個
} from './auth.js';

// ═══════════════════════════════════════════════════
// DOM 元素
// ═══════════════════════════════════════════════════
const $ = id => document.getElementById(id)

const pageLoading   = $('page-loading')
const authScreen    = $('auth-screen')
const homeScreen    = $('home-screen')

const emailInput    = $('auth-email')
const sendBtn       = $('send-magic-link-btn')
const authMessage   = $('auth-message')
const magicForm     = $('magic-link-form')
const magicSent     = $('magic-link-sent')
const sentEmailDisp = $('sent-email-display')
const resendBtn     = $('resend-btn')

const adminBtn      = $('admin-btn')
const logoutBtn     = $('logout-btn')
const userEmailDisp = $('user-email-display')

const tripsLoading  = $('trips-loading')
const tripsEmpty    = $('trips-empty')
const tripsList     = $('trips-list')

// ═══════════════════════════════════════════════════
// 狀態
// ═══════════════════════════════════════════════════
let homeShown = false

// ═══════════════════════════════════════════════════
// 畫面切換輔助
// ═══════════════════════════════════════════════════

function hideLoading() {
  pageLoading?.classList.add('hidden')
}

function showAuth() {
  hideLoading()
  authScreen?.classList.remove('hidden')
  homeScreen?.classList.add('hidden')
}

async function showHome(user) {
  if (homeShown) return
  homeShown = true

  hideLoading()
  authScreen?.classList.add('hidden')
  homeScreen?.classList.remove('hidden')

  if (userEmailDisp) userEmailDisp.textContent = user.email ?? ''
  adminBtn?.classList.add('hidden')

  // ✅ 使用本地定義的 getUserProfile
  const profile = await getUserProfile(user.id)

  if (profile?.is_platform_admin) {
    adminBtn?.classList.remove('hidden')
  }

  await loadTrips(user.id, profile?.is_platform_admin ?? false)
}

// ═══════════════════════════════════════════════════
// ✅ getUserProfile — 直接用已 import 的 supabase
// ═══════════════════════════════════════════════════
async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_platform_admin')
      .eq('id', userId)
      .single()

    if (error) {
      // PGRST116 = 查無此筆，屬正常（新用戶尚無 profile）
      if (error.code !== 'PGRST116') {
        console.warn('[home] getUserProfile 錯誤:', error.message)
      }
      return null
    }

    return data
  } catch (err) {
    console.error('[home] getUserProfile 例外:', err)
    return null
  }
}

// ═══════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════
async function init() {
  console.log('[home] init() 開始')

  const session = await waitForSession()
  console.log('[home] session:', session?.user?.email ?? '無')

  if (session?.user) {
    await showHome(session.user)
  } else {
    showAuth()
  }

  // ✅ onAuthStateChange 現在已正確 import
  onAuthStateChange(async (event, newSession) => {
    console.log('[home] Auth event:', event, newSession?.user?.email ?? '—')

    if (event === 'SIGNED_IN' && newSession?.user) {
      await showHome(newSession.user)
    } else if (event === 'SIGNED_OUT') {
      homeShown = false
      showAuth()
    }
  })
}

// ═══════════════════════════════════════════════════
// 載入旅行列表
// ═══════════════════════════════════════════════════
async function loadTrips(userId, isAdmin) {
  tripsLoading?.classList.remove('hidden')
  tripsEmpty?.classList.add('hidden')
  tripsList?.classList.add('hidden')
  if (tripsList) tripsList.innerHTML = ''

  try {
    let trips = []

    if (isAdmin) {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: true })

      if (error) throw error
      trips = data ?? []

    } else {
      const { data, error } = await supabase
        .from('trip_members')
        .select(`
          trip_id,
          role,
          trips (
            id, name, destination, cover_emoji,
            start_date, end_date, currency, status
          )
        `)
        .eq('user_id', userId)

      if (error) throw error

      trips = (data ?? [])
        .map(row => row.trips)
        .filter(Boolean)
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    }

    tripsLoading?.classList.add('hidden')

    if (trips.length === 0) {
      tripsEmpty?.classList.remove('hidden')
    } else {
      tripsList?.classList.remove('hidden')
      renderTrips(trips)
    }

  } catch (err) {
    console.error('[home] 載入旅行失敗:', err.message ?? err)
    tripsLoading?.classList.add('hidden')
    tripsEmpty?.classList.remove('hidden')
  }
}

// ═══════════════════════════════════════════════════
// 渲染旅行卡片
// ═══════════════════════════════════════════════════
function renderTrips(trips) {
  if (!tripsList) return
  tripsList.innerHTML = ''
  trips.forEach(trip => tripsList.appendChild(createTripCard(trip)))
}

function createTripCard(trip) {
  const card = document.createElement('article')
  card.className = 'trip-card'
  card.setAttribute('role', 'button')
  card.setAttribute('tabindex', '0')

  const countdownText  = getCountdown(trip.start_date, trip.end_date)
  const countdownClass = getCountdownClass(trip.start_date, trip.end_date)
  const dateText       = formatDateRange(trip.start_date, trip.end_date)

  card.innerHTML = `
    <div class="trip-card-header">
      <span class="trip-card-emoji" aria-hidden="true">${trip.cover_emoji || '✈️'}</span>
      <span class="trip-card-countdown ${countdownClass}">${countdownText}</span>
    </div>
    <div class="trip-card-body">
      <h3 class="trip-card-name">${escapeHtml(trip.name)}</h3>
      <p class="trip-card-dest">📍 ${escapeHtml(trip.destination || '目的地未定')}</p>
      <div class="trip-card-meta">
        <span class="trip-card-date">📅 ${dateText}</span>
      </div>
    </div>
  `

  const navigate = () => { location.href = `trip.html?id=${trip.id}` }
  card.addEventListener('click', navigate)
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate()
    }
  })

  return card
}

// ═══════════════════════════════════════════════════
// 日期工具
// ═══════════════════════════════════════════════════
function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dateMidnight(str) {
  const d = new Date(str)
  d.setHours(0, 0, 0, 0)
  return d
}

function getCountdown(startDate, endDate) {
  if (!startDate) return '日期未定'
  const today     = todayMidnight()
  const start     = dateMidnight(startDate)
  const end       = endDate ? dateMidnight(endDate) : start
  const diffStart = Math.ceil((start - today) / 86_400_000)
  const diffEnd   = Math.ceil((end   - today) / 86_400_000)

  if (diffStart > 0)  return `還有 ${diffStart} 天`
  if (diffEnd   >= 0) return '旅行中 🎉'
  return '已結束'
}

function getCountdownClass(startDate, endDate) {
  if (!startDate) return 'countdown-future'
  const today     = todayMidnight()
  const start     = dateMidnight(startDate)
  const end       = endDate ? dateMidnight(endDate) : start
  const diffStart = Math.ceil((start - today) / 86_400_000)
  const diffEnd   = Math.ceil((end   - today) / 86_400_000)

  if (diffStart > 30) return 'countdown-future'
  if (diffStart > 0)  return 'countdown-soon'
  if (diffEnd   >= 0) return 'countdown-active'
  return 'countdown-past'
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return '日期未定'
  const start = new Date(startDate)
  const end   = endDate ? new Date(endDate) : null
  const fmt   = d => `${d.getMonth() + 1}/${d.getDate()}`
  return end
    ? `${start.getFullYear()} ${fmt(start)} – ${fmt(end)}`
    : `${start.getFullYear()} ${fmt(start)}`
}

// ═══════════════════════════════════════════════════
// 工具函數
// ═══════════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
}

function showAuthMessage(msg, type = 'info') {
  if (!authMessage) return
  authMessage.textContent = msg
  authMessage.className = `auth-message auth-message-${type}`
  authMessage.classList.toggle('hidden', !msg)
}

// ═══════════════════════════════════════════════════
// 事件監聽
// ═══════════════════════════════════════════════════

// ✅ 統一由這裡處理，移除重複的 handleSendMagicLink
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim() ?? ''

  if (!email)               return showAuthMessage('請輸入電子郵件', 'error')
  if (!isValidEmail(email)) return showAuthMessage('請輸入有效的電子郵件格式', 'error')

  sendBtn.disabled    = true
  sendBtn.textContent = '發送中⋯'
  showAuthMessage('', 'info')

  // getMagicLinkRedirect() 確保 redirectTo 與 Supabase 白名單完全一致
  const redirectTo = getMagicLinkRedirect()
  console.log('[home] Magic Link redirectTo:', redirectTo)

  const { error } = await sendMagicLink(email, redirectTo)

  sendBtn.disabled    = false
  sendBtn.textContent = '發送登入連結'

  if (error) {
    showAuthMessage('發送失敗：' + error.message, 'error')
    return
  }

  if (sentEmailDisp) sentEmailDisp.textContent = email
  magicForm?.classList.add('hidden')
  magicSent?.classList.remove('hidden')
})

emailInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn?.click()
})

resendBtn?.addEventListener('click', () => {
  magicSent?.classList.add('hidden')
  magicForm?.classList.remove('hidden')
  if (emailInput) {
    emailInput.value = ''
    emailInput.focus()
  }
})

adminBtn?.addEventListener('click', () => {
  location.href = 'admin.html'
})

logoutBtn?.addEventListener('click', async () => {
  if (!confirm('確定要登出嗎？')) return
  await signOut()
})

// ═══════════════════════════════════════════════════
// 啟動
// ═══════════════════════════════════════════════════
init()
