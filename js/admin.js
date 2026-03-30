import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── 初始化 ──────────────────────────────────────────────
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcwNjYsImV4cCI6MjA5MDI3MzA2Nn0.Jmb_MAvaZpCy1jCwgTPlD0Slpb3i55UJQ823wOXkaBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let currentTripId = null  // 邀請 modal 用

// ── 頁面載入 ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth()
  await loadTrips()
  bindEvents()
})

// ── 驗證身份 ─────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = 'index.html'
    return
  }

  currentUser = session.user

  // 確認是 Platform Admin
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

  // 綁定每張卡片的按鈕
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

  // 自動將自己加入為 admin
  await supabase.from('trip_members').insert({
    trip_id: trip.id,
    user_id: currentUser.id,
    role: 'admin',
    can_view_itinerary: true,
    can_view_expense: true,
    can_view_shopping: true,
    can_view_info: true,
    can_view_tools: true,
    can_view_memo: true,
    can_view_packing: true,
    can_view_private_expense: true
  })

  showMessage('createTripMessage', '✅ 旅行建立成功！', 'success')
  document.getElementById('createTripForm').reset()
  document.getElementById('tripEmoji').value = ''

  // 重新載入列表
  await loadTrips()
}

// ── 邀請 Modal ────────────────────────────────────────────
function openInviteModal(tripId, tripName) {
  currentTripId = tripId
  document.querySelector('.modal-title').textContent = `🔗 邀請成員 - ${tripName}`
  document.getElementById('inviteModal').classList.remove('hidden')
  document.getElementById('inviteLinkResult').classList.add('hidden')
  document.getElementById('inviteeName').value = ''
}

function closeInviteModal() {
  document.getElementById('inviteModal').classList.add('hidden')
  currentTripId = null
}

// ── 生成邀請連結 ──────────────────────────────────────────
async function generateInviteLink() {
  if (!currentTripId) return

  const inviteeName = document.getElementById('inviteeName').value.trim()
  const expiryHours = parseInt(document.getElementById('inviteExpiry').value)

  const permissions = {
    can_view_itinerary: document.getElementById('perm_itinerary').checked,
    can_view_expense: document.getElementById('perm_expense').checked,
    can_view_shopping: document.getElementById('perm_shopping').checked,
    can_view_info: document.getElementById('perm_info').checked,
    can_view_tools: document.getElementById('perm_tools').checked,
    can_view_memo: document.getElementById('perm_memo').checked,
    can_view_packing: document.getElementById('perm_packing').checked,
    can_view_private_expense: document.getElementById('perm_private_expense').checked
  }

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + expiryHours)

  // 生成唯一 token
  const token = generateToken()

  const { error } = await supabase.from('invite_links').insert({
    trip_id: currentTripId,
    token,
    created_by: currentUser.id,
    invitee_name: inviteeName || null,
    expires_at: expiresAt.toISOString(),
    ...permissions
  })

  if (error) {
    alert(`❌ 生成失敗：${error.message}`)
    return
  }

  // 顯示連結
  const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '')
  const inviteUrl = `https://irrigationkelly-mom.github.io/treat-all-trips/join.html?token=${token}`;

  document.getElementById('inviteLinkText').textContent = inviteUrl
  document.getElementById('inviteLinkResult').classList.remove('hidden')
}

// ── 複製連結 ──────────────────────────────────────────────
async function copyInviteLink() {
  const text = document.getElementById('inviteLinkText').textContent
  try {
    await navigator.clipboard.writeText(text)
    const btn = document.getElementById('copyInviteLink')
    btn.textContent = '✅ 已複製！'
    setTimeout(() => { btn.textContent = '📋 複製' }, 2000)
  } catch {
    alert('請手動複製連結')
  }
}

// ── 登出 ──────────────────────────────────────────────────
async function logout() {
  await supabase.auth.signOut()
  window.location.href = 'index.html'
}

// ── 綁定事件 ──────────────────────────────────────────────
function bindEvents() {
  document.getElementById('createTripForm')
    .addEventListener('submit', createTrip)

  document.getElementById('logoutBtn')
    .addEventListener('click', logout)

  document.getElementById('closeModal')
    .addEventListener('click', closeInviteModal)

  document.getElementById('inviteModal')
    .addEventListener('click', (e) => {
      if (e.target === document.getElementById('inviteModal')) closeInviteModal()
    })

  document.getElementById('generateInviteBtn')
    .addEventListener('click', generateInviteLink)

  document.getElementById('copyInviteLink')
    .addEventListener('click', copyInviteLink)
}

// ── 工具函式 ──────────────────────────────────────────────
function generateToken() {
  const array = new Uint8Array(24)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function showMessage(elementId, text, type = 'info') {
  const el = document.getElementById(elementId)
  if (!el) return
  el.textContent = text
  el.className = `message ${type}`
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 4000)
}
