// js/home.js
import { supabase, waitForSession, onAuthStateChange } from './auth.js'

// ── DOM 元素 ──────────────────────────────────────
const pageLoading   = document.getElementById('page-loading')
const authScreen    = document.getElementById('auth-screen')
const homeScreen    = document.getElementById('home-screen')

const emailInput    = document.getElementById('auth-email')
const sendBtn       = document.getElementById('send-magic-link-btn')
const authMessage   = document.getElementById('auth-message')
const magicForm     = document.getElementById('magic-link-form')
const magicSent     = document.getElementById('magic-link-sent')
const sentEmailDisp = document.getElementById('sent-email-display')
const resendBtn     = document.getElementById('resend-btn')

const adminBtn      = document.getElementById('admin-btn')
const logoutBtn     = document.getElementById('logout-btn')
const userEmailDisp = document.getElementById('user-email-display')

const tripsLoading  = document.getElementById('trips-loading')
const tripsEmpty    = document.getElementById('trips-empty')
const tripsList     = document.getElementById('trips-list')

// ── 防止重複執行 showHome ─────────────────────────
let homeShown = false

// ═══════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════
async function init() {
  // waitForSession 處理 Magic Link 回調 & localStorage session
  const session = await waitForSession()

  if (session?.user) {
    await showHome(session.user)
  } else {
    showAuth()
  }

  // 監聽後續狀態變化
  onAuthStateChange(async (event, session) => {
    console.log('[home] Auth event:', event, session?.user?.email ?? '—')

    if (event === 'SIGNED_IN' && session?.user) {
      if (!homeShown) {
        await showHome(session.user)
      }
    } else if (event === 'SIGNED_OUT') {
      homeShown = false
      showAuth()
    }
  })
}

// ═══════════════════════════════════════════════════
// 畫面切換
// ═══════════════════════════════════════════════════
function showAuth() {
  pageLoading.style.display = 'none'
  authScreen.style.display  = 'flex'
  homeScreen.style.display  = 'none'
}

async function showHome(user) {
  homeShown = true

  pageLoading.style.display = 'none'
  authScreen.style.display  = 'none'
  homeScreen.style.display  = 'block'

  if (userEmailDisp) {
    userEmailDisp.textContent = user.email ?? ''
  }

  adminBtn.style.display = 'none'

  // ── 取得 Profile ──────────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, is_platform_admin')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[home] 取得 Profile 失敗:', profileError.message)
  }

  if (profile?.is_platform_admin) {
    adminBtn.style.display = 'flex'
  }

  await loadTrips(user.id, profile?.is_platform_admin ?? false)
}

// ═══════════════════════════════════════════════════
// 載入旅行列表
// ═══════════════════════════════════════════════════
async function loadTrips(userId, isAdmin) {
  tripsLoading.style.display = 'flex'
  tripsEmpty.style.display   = 'none'
  tripsList.style.display    = 'none'
  tripsList.innerHTML        = ''

  try {
    let trips = []

    if (isAdmin) {
      // 管理員：顯示所有旅行（不限 created_by）
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: true })

      if (error) throw error
      trips = data ?? []

    } else {
      // 一般成員：透過 trip_members 關聯取得
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
        .map(m => m.trips)
        .filter(Boolean)
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    }

    tripsLoading.style.display = 'none'

    if (trips.length === 0) {
      tripsEmpty.style.display = 'flex'
    } else {
      tripsList.style.display = 'grid'
      renderTrips(trips)
    }

  } catch (err) {
    console.error('[home] 載入旅行失敗:', err.message ?? err)
    tripsLoading.style.display = 'none'
    tripsEmpty.style.display   = 'flex'
  }
}

// ═══════════════════════════════════════════════════
// 渲染旅行卡片
// ═══════════════════════════════════════════════════
function renderTrips(trips) {
  tripsList.innerHTML = ''
  trips.forEach(trip => tripsList.appendChild(createTripCard(trip)))
}

function createTripCard(trip) {
  const card = document.createElement('div')
  card.className = 'trip-card'
  card.setAttribute('role', 'button')
  card.setAttribute('tabindex', '0')

  const countdownText  = getCountdown(trip.start_date, trip.end_date)
  const countdownClass = getCountdownClass(trip.start_date, trip.end_date)
  const dateText       = formatDateRange(trip.start_date, trip.end_date)

  card.innerHTML = `
    <div class="trip-card-header">
      <span class="trip-card-emoji">${trip.cover_emoji || '✈️'}</span>
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
// 日期工具函數
// ═══════════════════════════════════════════════════
function getCountdown(startDate, endDate) {
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const start     = new Date(startDate); start.setHours(0, 0, 0, 0)
  const end       = new Date(endDate);   end.setHours(0, 0, 0, 0)
  const diffStart = Math.ceil((start - today) / 86400000)
  const diffEnd   = Math.ceil((end   - today) / 86400000)

  if (diffStart > 0)  return `還有 ${diffStart} 天`
  if (diffEnd   >= 0) return '旅行中 🎉'
  return '已結束'
}

function getCountdownClass(startDate, endDate) {
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const start     = new Date(startDate); start.setHours(0, 0, 0, 0)
  const end       = new Date(endDate);   end.setHours(0, 0, 0, 0)
  const diffStart = Math.ceil((start - today) / 86400000)
  const diffEnd   = Math.ceil((end   - today) / 86400000)

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
  const year  = start.getFullYear()
  return end ? `${year} ${fmt(start)} – ${fmt(end)}` : `${year} ${fmt(start)}`
}

// ═══════════════════════════════════════════════════
// 工具函數
// ═══════════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function showAuthMessage(msg, type = 'info') {
  if (!authMessage) return
  authMessage.textContent   = msg
  authMessage.className     = `auth-message auth-message-${type}`
  authMessage.style.display = 'block'
}

// ── 計算 Magic Link redirectTo ────────────────────
function getMagicLinkRedirect() {
  const origin = location.origin
  if (origin.includes('github.io')) {
    const repo = location.pathname.split('/').filter(Boolean)[0] ?? ''
    return `${origin}/${repo}/index.html`
  }
  return `${origin}/index.html`
}

// ═══════════════════════════════════════════════════
// 事件監聽
// ═══════════════════════════════════════════════════

// 發送 Magic Link
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim()
  if (!email)               return showAuthMessage('請輸入電子郵件', 'error')
  if (!isValidEmail(email)) return showAuthMessage('請輸入有效的電子郵件格式', 'error')

  sendBtn.disabled    = true
  sendBtn.textContent = '發送中⋯'
  showAuthMessage('', 'info')

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: getMagicLinkRedirect() }
  })

  sendBtn.disabled    = false
  sendBtn.textContent = '發送登入連結'

  if (error) {
    showAuthMessage('發送失敗：' + error.message, 'error')
  } else {
    if (sentEmailDisp) sentEmailDisp.textContent = email
    magicForm.style.display = 'none'
    magicSent.style.display = 'block'
  }
})

// Enter 鍵觸發
emailInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn?.click()
})

// 重新發送
resendBtn?.addEventListener('click', () => {
  magicSent.style.display = 'none'
  magicForm.style.display = 'block'
  if (emailInput) {
    emailInput.value = ''
    emailInput.focus()
  }
})

// 管理後台
adminBtn?.addEventListener('click', () => {
  location.href = 'admin.html'
})

// 登出
logoutBtn?.addEventListener('click', async () => {
  if (!confirm('確定要登出嗎？')) return
  await supabase.auth.signOut()
  // 觸發 onAuthStateChange → SIGNED_OUT → showAuth()
})

// ═══════════════════════════════════════════════════
// 啟動
// ═══════════════════════════════════════════════════
init()
