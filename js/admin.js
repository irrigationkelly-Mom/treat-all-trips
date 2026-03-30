import { supabase, waitForSession } from './auth.js'

let currentUser = null
let currentTripId = null

// ── 頁面載入 ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth()
  await loadTrips()
  bindEvents()
})

// ── 驗證身份 ─────────────────────────────────────────────
async function checkAuth() {
  const session = await waitForSession()

  if (!session) {
    window.location.href = 'index.html'
    return
  }

  currentUser = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin, display_name, full_name')
    .eq('id', currentUser.id)
    .single()

  if (!profile?.is_platform_admin) {
    alert('⛔ 你沒有管理員權限')
    window.location.href = 'index.html'
    return
  }

  console.log('✅ 管理員登入：', profile.display_name || profile.full_name)
}

// ── 載入旅行列表 ──────────────────────────────────────────
async function loadTrips() {
  const container = document.getElementById('tripsList')

  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    container.innerHTML = `<div class="message error">載入失敗：${error.message}</div>`
    return
  }

  if (!trips || trips.length === 0) {
    container.innerHTML = `<div class="empty-state">還沒有旅行，快建立第一個！🌍</div>`
    return
  }

  container.innerHTML = trips.map(trip => renderTripCard(trip)).join('')

  trips.forEach(trip => {
    const inviteBtn = document.getElementById(`invite-${trip.id}`)
    const goBtn = document.getElementById(`go-${trip.id}`)

    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => openInviteModal(trip.id, trip.name))
    }
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        window.location.href = `trip.html?id=${trip.id}`
      })
    }
  })
}

// ── 渲染旅行卡片 ──────────────────────────────────────────
function renderTripCard(trip) {
  const emoji = trip.emoji || '✈️'
  const start = trip.start_date ? formatDate(trip.start_date) : '未設定'
  const end = trip.end_date ? formatDate(trip.end_date) : '未設定'
  const dest = trip.destination || '目的地未設定'

  return `
    <div class="trip-card">
      <div class="trip-card-header">
        <span class="trip-emoji">${emoji}</span>
        <div class="trip-info">
          <div class="trip-name">${escapeHtml(trip.name)}</div>
          <div class="trip-meta">${escapeHtml(dest)}</div>
          <div class="trip-meta">📅 ${start} ~ ${end}</div>
          <div class="trip-meta">💱 ${trip.base_currency || 'TWD'}</div>
        </div>
      </div>
      <div class="trip-card-actions">
        <button id="invite-${trip.id}" class="btn btn-secondary btn-sm">
          🔗 邀請
        </button>
        <button id="go-${trip.id}" class="btn btn-primary btn-sm">
          → 進入
        </button>
      </div>
    </div>
  `
}

// ── 建立旅行 ──────────────────────────────────────────────
async function createTrip(e) {
  e.preventDefault()

  const name = document.getElementById('tripName').value.trim()
  const emoji = document.getElementById('tripEmoji').value.trim() || '✈️'
  const destination = document.getElementById('tripDestination').value.trim()
  const startDate = document.getElementById('tripStartDate').value
  const endDate = document.getElementById('tripEndDate').value
  const currency = document.getElementById('tripCurrency').value
  const description = document.getElementById('tripDescription').value.trim()

  if (!name) {
    showMessage('createTripMessage', '⚠️ 請輸入旅行名稱', 'warning')
    return
  }

  const submitBtn = document.querySelector('#createTripForm button[type="submit"]')
  submitBtn.disabled = true
  submitBtn.textContent = '建立中...'

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({
      name,
      emoji,
      destination: destination || null,
      start_date: startDate || null,
      end_date: endDate || null,
      base_currency: currency,
      description: description || null,
      created_by: currentUser.id
    })
    .select()
    .single()

  submitBtn.disabled = false
  submitBtn.textContent = '✨ 建立旅行'

  if (error) {
    showMessage('createTripMessage', `❌ 建立失敗：${error.message}`, 'error')
    return
  }

  // ✅ 自動將自己加入為成員（欄位名稱全部正確）
  const { error: memberError } = await supabase
    .from('trip_members')
    .insert({
      trip_id: trip.id,
      user_id: currentUser.id,
      can_view_it*
