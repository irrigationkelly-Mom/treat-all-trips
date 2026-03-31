// js/home.js — import getMagicLinkRedirect
import { 
  supabase, 
  getBaseUrl,
  getMagicLinkRedirect,  // ← add this
  sendMagicLink, 
  waitForSession, 
  getAuthContext, 
  signOut 
} from './auth.js';

// ── Magic Link 發送處理 ────────────────────────────────────────────────────────
async function handleSendMagicLink() {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput?.value?.trim() ?? '';
  
  if (!email) {
    showAuthMessage('請輸入電子郵件地址', 'error');
    return;
  }

  const btn = document.getElementById('send-magic-link-btn');
  setButtonLoading(btn, true, '發送中⋯');

  // ✅ Use getMagicLinkRedirect() — matches whitelisted URL exactly
  const { error } = await sendMagicLink(email, getMagicLinkRedirect());

  setButtonLoading(btn, false, '發送登入連結');

  if (error) {
    showAuthMessage(`發送失敗：${error.message}`, 'error');
    return;
  }

  // Show "sent" state
  const sentEmailDisplay = document.getElementById('sent-email-display');
  if (sentEmailDisplay) sentEmailDisplay.textContent = email;
  
  document.getElementById('magic-link-form')?.classList.add('hidden');
  document.getElementById('magic-link-sent')?.classList.remove('hidden');
}


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

/** 隱藏載入遮罩 */
function hideLoading() {
  pageLoading?.classList.add('hidden')
}

/** 顯示登入畫面 */
function showAuth() {
  hideLoading()
  authScreen?.classList.remove('hidden')
  homeScreen?.classList.add('hidden')
}

/** 顯示主頁畫面 */
async function showHome(user) {
  if (homeShown) return   // ← 防止重複執行
  homeShown = true

  hideLoading()
  authScreen?.classList.add('hidden')
  homeScreen?.classList.remove('hidden')

  // 顯示用戶 Email
  if (userEmailDisp) userEmailDisp.textContent = user.email ?? ''

  // 預設隱藏管理按鈕
  adminBtn?.classList.add('hidden')

  // 取得 Profile
  const profile = await getUserProfile(user.id)

  if (profile?.is_platform_admin) {
    adminBtn?.classList.remove('hidden')
  }

  await loadTrips(user.id, profile?.is_platform_admin ?? false)
}

// ═══════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════
async function init() {
  console.log('[home] init() 開始')

  // waitForSession 處理 Magic Link 回調與 localStorage session
  const session = await waitForSession()
  console.log('[home] waitForSession 完成，user:', session?.user?.email ?? '無')

  if (session?.user) {
    await showHome(session.user)
  } else {
    showAuth()
  }

  // 監聽後續狀態變化
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
  // 顯示載入狀態
  tripsLoading?.classList.remove('hidden')
  tripsEmpty?.classList.add('hidden')
  tripsList?.classList.add('hidden')
  if (tripsList) tripsList.innerHTML = ''

  try {
    let trips = []

    if (isAdmin) {
      // 管理員：顯示所有旅行
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

/**
 * 顯示登入表單的錯誤 / 成功訊息
 * @param {string} msg
 * @param {'info'|'success'|'error'} type
 */
function showAuthMessage(msg, type = 'info') {
  if (!authMessage) return
  authMessage.textContent = msg
  // 先移除所有狀態 class，再加入對應的
  authMessage.className = `auth-message auth-message-${type}`

  if (msg) {
    authMessage.classList.remove('hidden')
  } else {
    authMessage.classList.add('hidden')
  }
}

// ═══════════════════════════════════════════════════
// 事件監聽
// ═══════════════════════════════════════════════════

// 發送 Magic Link
sendBtn?.addEventListener('click', async () => {
  const email = emailInput?.value?.trim() ?? ''

  if (!email)               return showAuthMessage('請輸入電子郵件', 'error')
  if (!isValidEmail(email)) return showAuthMessage('請輸入有效的電子郵件格式', 'error')

  sendBtn.disabled    = true
  sendBtn.textContent = '發送中⋯'
  showAuthMessage('', 'info')

  // 使用 auth.js 封裝的 sendMagicLink（內建 redirectTo 計算）
  const { error } = await sendMagicLink(email)

  sendBtn.disabled    = false
  sendBtn.textContent = '發送登入連結'

  if (error) {
    showAuthMessage('發送失敗：' + error.message, 'error')
    return
  }

  // 切換到「已發送」狀態
  if (sentEmailDisp) sentEmailDisp.textContent = email
  magicForm?.classList.add('hidden')
  magicSent?.classList.remove('hidden')
})

// Enter 鍵觸發
emailInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn?.click()
})

// 重新發送（回到輸入表單）
resendBtn?.addEventListener('click', () => {
  magicSent?.classList.add('hidden')
  magicForm?.classList.remove('hidden')
  if (emailInput) {
    emailInput.value = ''
    emailInput.focus()
  }
})

// 管理後台
adminBtn?.addEventListener('click', () => {
  location.href = 'admin.html'
})

// 登出（使用 auth.js 封裝，會自動跳轉）
logoutBtn?.addEventListener('click', async () => {
  if (!confirm('確定要登出嗎？')) return
  await signOut()
})

// ═══════════════════════════════════════════════════
// 啟動
// ═══════════════════════════════════════════════════
init()
