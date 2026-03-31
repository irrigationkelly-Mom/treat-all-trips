// js/home.js
import {
  supabase,
  waitForSession,
  isValidEmail,
  getUserProfile,
  getMagicLinkRedirect,
  joinPath,
  getBaseUrl,
  signOut
} from './auth.js'

// ============================================================
// DOM Helpers
// ============================================================

/** 取得 DOM 元素，找不到時 console.warn */
function $(id) {
  const el = document.getElementById(id)
  if (!el) console.warn(`[home] element #${id} not found`)
  return el
}

function showScreen(screenId) {
  const screens = ['screen-login', 'screen-sent', 'screen-home']
  screens.forEach((id) => {
    const el = $(id)
    if (el) el.classList.toggle('hidden', id !== screenId)
  })
}

function showLoading() {
  const el = $('page-loading')
  if (el) el.classList.remove('hidden')
}

function hideLoading() {
  const el = $('page-loading')
  if (el) el.classList.add('hidden')
}

function showToast(message, type = 'info') {
  // 若頁面有 toast 容器則使用，否則 fallback 到 alert
  const container = document.getElementById('toast-container')
  if (!container) {
    if (type === 'error') console.error(message)
    else console.log(message)
    return
  }

  const toast = document.createElement('div')
  toast.className = `toast toast--${type}`
  toast.textContent = message
  container.appendChild(toast)

  // 自動移除
  setTimeout(() => {
    toast.classList.add('toast--fade')
    setTimeout(() => toast.remove(), 400)
  }, 3000)
}

// ============================================================
// Login Screen
// ============================================================

function initLoginScreen() {
  const emailInput = $('input-email')
  const sendBtn = $('btn-send-magic-link')
  const errorMsg = $('login-error')

  if (!emailInput || !sendBtn) return

  // 清除錯誤訊息
  function clearError() {
    if (errorMsg) {
      errorMsg.textContent = ''
      errorMsg.classList.add('hidden')
    }
  }

  function setError(msg) {
    if (errorMsg) {
      errorMsg.textContent = msg
      errorMsg.classList.remove('hidden')
    }
  }

  function setButtonLoading(loading) {
    sendBtn.disabled = loading
    sendBtn.textContent = loading ? '傳送中…' : '傳送魔法連結'
  }

  sendBtn.addEventListener('click', async () => {
    clearError()
    const email = emailInput.value.trim()

    if (!isValidEmail(email)) {
      setError('請輸入有效的電子郵件地址')
      emailInput.focus()
      return
    }

    setButtonLoading(true)

    try {
      const redirectTo = getMagicLinkRedirect()
      console.log('[home] magic link redirect →', redirectTo)

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      })

      if (error) {
        console.error('[home] signInWithOtp error:', error.message)
        setError('傳送失敗，請稍後再試。')
        return
      }

      showScreen('screen-sent')
    } catch (err) {
      console.error('[home] unexpected error:', err)
      setError('發生未預期的錯誤，請重試。')
    } finally {
      setButtonLoading(false)
    }
  })

  // Enter 鍵觸發
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn.click()
  })
}

// ============================================================
// Sent Screen
// ============================================================

function initSentScreen() {
  const backBtn = $('btn-back-to-login')
  if (!backBtn) return

  backBtn.addEventListener('click', () => {
    showScreen('screen-login')
  })
}

// ============================================================
// Home Screen
// ============================================================

async function renderHome(session) {
  const profile = await getUserProfile(session.user.id)
  const displayName = profile?.display_name || session.user.email

  // 顯示使用者名稱
  const nameEl = $('user-display-name')
  if (nameEl) nameEl.textContent = displayName

  // 登出按鈕
  const signOutBtn = $('btn-sign-out')
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true
      signOutBtn.textContent = '登出中…'
      await signOut()
    })
  }

  // 載入行程列表
  await renderTripList(session.user.id)
}

async function renderTripList(userId) {
  const listEl = $('trip-list')
  const emptyEl = $('trip-list-empty')
  const loadingEl = $('trip-list-loading')

  if (!listEl) return

  // 顯示載入中狀態
  if (loadingEl) loadingEl.classList.remove('hidden')
  if (emptyEl) emptyEl.classList.add('hidden')
  listEl.innerHTML = ''

  try {
    // 取得使用者參與的所有行程
    const { data: memberships, error } = await supabase
      .from('trip_members')
      .select(`
        role,
        trips (
          id,
          title,
          destination,
          start_date,
          end_date,
          cover_image_url
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[home] renderTripList error:', error.message)
      showToast('無法載入行程，請重新整理', 'error')
      return
    }

    const trips = memberships?.map((m) => ({ ...m.trips, role: m.role })) ?? []

    if (trips.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden')
      return
    }

    // 渲染行程卡片
    trips.forEach((trip) => {
      const card = createTripCard(trip)
      listEl.appendChild(card)
    })
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden')
  }
}

function createTripCard(trip) {
  const baseUrl = getBaseUrl()
  const tripUrl = joinPath(baseUrl, `trip.html?id=${trip.id}`)

  const card = document.createElement('a')
  card.href = tripUrl
  card.className = 'trip-card'
  card.setAttribute('aria-label', trip.title)

  const dateText = formatDateRange(trip.start_date, trip.end_date)

  card.innerHTML = `
    <div class="trip-card__cover" style="${
      trip.cover_image_url
        ? `background-image: url('${trip.cover_image_url}')`
        : ''
    }">
      ${!trip.cover_image_url ? '<span class="trip-card__cover-icon">✈️</span>' : ''}
    </div>
    <div class="trip-card__body">
      <h3 class="trip-card__title">${escapeHtml(trip.title)}</h3>
      ${trip.destination ? `<p class="trip-card__destination">📍 ${escapeHtml(trip.destination)}</p>` : ''}
      ${dateText ? `<p class="trip-card__date">🗓 ${dateText}</p>` : ''}
      <span class="trip-card__role trip-card__role--${trip.role}">${formatRole(trip.role)}</span>
    </div>
  `

  return card
}

// ============================================================
// Utilities
// ============================================================

function formatDateRange(start, end) {
  if (!start) return ''
  const fmt = (d) =>
    new Date(d).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  if (!end) return fmt(start)
  return `${fmt(start)} – ${fmt(end)}`
}

function formatRole(role) {
  const map = {
    owner: '建立者',
    editor: '編輯者',
    viewer: '檢視者'
  }
  return map[role] ?? role
}

function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ============================================================
// Init
// ============================================================

async function init() {
  showLoading()

  try {
    // 初始化各畫面的事件監聽
    initLoginScreen()
    initSentScreen()

    // 等待 session
    const session = await waitForSession()

    if (session) {
      // 已登入 → 顯示首頁
      showScreen('screen-home')
      await renderHome(session)
    } else {
      // 未登入 → 顯示登入畫面
      showScreen('screen-login')
    }
  } catch (err) {
    console.error('[home] init error:', err)
    showScreen('screen-login')
    showToast('初始化失敗，請重新整理頁面', 'error')
  } finally {
    // 無論如何都要隱藏 loading overlay
    hideLoading()
  }
}

// 啟動
init()
