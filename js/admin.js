// js/admin.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── 初始化 ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4MTIzMjgsImV4cCI6MjA2NTM4ODMyOH0.hv4wRFEMaGPBLTfbxGKqaKxhMjWBSMlHOdvNGfixqEk';
const PLATFORM_ADMIN_ID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 狀態 ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentTripId = null;   // 目前正在操作哪個 trip（邀請/成員）
let selectedCoverFile = null;

// ── DOM 元素 ─────────────────────────────────────────────────────────────────
const logoutBtn          = document.getElementById('logoutBtn');
const createTripForm     = document.getElementById('createTripForm');
const createTripBtn      = document.getElementById('createTripBtn');
const createTripMessage  = document.getElementById('createTripMessage');
const tripsList          = document.getElementById('tripsList');

// 封面上傳
const coverUploadArea      = document.getElementById('coverUploadArea');
const coverImageInput      = document.getElementById('coverImageInput');
const coverPreview         = document.getElementById('coverPreview');
const coverUploadPlaceholder = document.getElementById('coverUploadPlaceholder');
const removeCoverBtn       = document.getElementById('removeCoverBtn');

// 邀請 Modal
const inviteModal          = document.getElementById('inviteModal');
const closeModalBtn        = document.getElementById('closeModal');
const generateInviteBtn    = document.getElementById('generateInviteBtn');
const inviteLinkResult     = document.getElementById('inviteLinkResult');
const inviteLinkText       = document.getElementById('inviteLinkText');
const copyInviteLink       = document.getElementById('copyInviteLink');

// 成員 Modal
const membersModal         = document.getElementById('membersModal');
const closeMembersModalBtn = document.getElementById('closeMembersModal');
const membersList          = document.getElementById('membersList');

// ── 工具函式 ──────────────────────────────────────────────────────────────────
function showMessage(el, text, type = 'info') {
  el.textContent = text;
  el.className = `message message-${type}`;
  el.classList.remove('hidden');
}

function hideMessage(el) {
  el.classList.add('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ── 封面圖片 ──────────────────────────────────────────────────────────────────
coverUploadArea.addEventListener('click', () => coverImageInput.click());

coverImageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // 大小限制 5MB
  if (file.size > 5 * 1024 * 1024) {
    alert('圖片大小不能超過 5MB');
    return;
  }

  selectedCoverFile = file;
  const url = URL.createObjectURL(file);
  coverPreview.src = url;
  coverPreview.classList.remove('hidden');
  coverUploadPlaceholder.classList.add('hidden');
  removeCoverBtn.classList.remove('hidden');
});

removeCoverBtn.addEventListener('click', () => {
  selectedCoverFile = null;
  coverImageInput.value = '';
  coverPreview.src = '';
  coverPreview.classList.add('hidden');
  coverUploadPlaceholder.classList.remove('hidden');
  removeCoverBtn.classList.add('hidden');
});

// 拖拉上傳
coverUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  coverUploadArea.classList.add('drag-over');
});
coverUploadArea.addEventListener('dragleave', () => {
  coverUploadArea.classList.remove('drag-over');
});
coverUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  coverUploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    coverImageInput.files = e.dataTransfer.files;
    coverImageInput.dispatchEvent(new Event('change'));
  }
});

async function uploadCoverImage(tripId, file) {
  const ext = file.name.split('.').pop();
  const path = `${tripId}/cover.${ext}`;

  const { error } = await supabase.storage
    .from('trip-covers')
    .upload(path, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage
    .from('trip-covers')
    .getPublicUrl(path);

  return data.publicUrl;
}

// ── 認證檢查 ──────────────────────────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = session.user;

  // 只有平台管理員能進這頁
  if (currentUser.id !== PLATFORM_ADMIN_ID) {
    alert('無管理員權限');
    window.location.href = 'index.html';
    return;
  }

  await loadTrips();
}

// ── 登出 ───────────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ── 建立旅行 ───────────────────────────────────────────────────────────────────
createTripForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage(createTripMessage);

  const name = document.getElementById('tripName').value.trim();
  if (!name) {
    showMessage(createTripMessage, '請輸入旅行名稱', 'error');
    return;
  }

  createTripBtn.disabled = true;
  createTripBtn.textContent = '建立中...';

  try {
    // 1. 建立旅行記錄（先不含封面 URL）
    const tripData = {
      name,
      emoji:         document.getElementById('tripEmoji').value.trim() || '✈️',
      destination:   document.getElementById('tripDestination').value.trim() || null,
      start_date:    document.getElementById('tripStartDate').value || null,
      end_date:      document.getElementById('tripEndDate').value || null,
      base_currency: document.getElementById('tripCurrency').value,
      important_notes: document.getElementById('tripDescription').value.trim() || null,
      created_by:    currentUser.id,
      status:        'upcoming',
    };

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert(tripData)
      .select()
      .single();

    if (tripError) throw tripError;

    // 2. 上傳封面圖片（如果有）
    if (selectedCoverFile) {
      try {
        const coverUrl = await uploadCoverImage(trip.id, selectedCoverFile);
        await supabase
          .from('trips')
          .update({ cover_image_url: coverUrl })
          .eq('id', trip.id);
        trip.cover_image_url = coverUrl;
      } catch (imgErr) {
        console.warn('封面上傳失敗，但旅行已建立：', imgErr.message);
      }
    }

    // 3. 將建立者加入 trip_members（全部權限）
    const { error: memberError } = await supabase
      .from('trip_members')
      .insert({
        trip_id:                  trip.id,
        user_id:                  currentUser.id,
        nickname:                 '管理員',
        can_view_itinerary:       true,
        can_edit_itinerary:       true,
        can_view_expense:         true,
        can_edit_expense:         true,
        can_view_shopping:        true,
        can_edit_shopping:        true,
        can_view_info:            true,
        can_edit_info:            true,
        can_view_tools:           true,
        can_edit_tools:           true,
        can_use_memo:             true,
        can_use_packing:          true,
        can_use_private_expense:  true,
      });

    if (memberError) throw memberError;

    showMessage(createTripMessage, `✅ 旅行「${name}」建立成功！`, 'success');
    createTripForm.reset();
    removeCoverBtn.click(); // 清除封面預覽

    await loadTrips();

  } catch (err) {
    console.error(err);
    showMessage(createTripMessage, `❌ 建立失敗：${err.message}`, 'error');
  } finally {
    createTripBtn.disabled = false;
    createTripBtn.textContent = '✨ 建立旅行';
  }
});

// ── 載入旅行列表 ───────────────────────────────────────────────────────────────
async function loadTrips() {
  tripsList.innerHTML = '<div class="loading-placeholder">載入中...</div>';

  const { data: trips, error } = await supabase
    .from('trips')
    .select(`
      id, name, emoji, destination,
      start_date, end_date, status,
      cover_image_url, base_currency,
      created_at
    `)
    .eq('created_by', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    tripsList.innerHTML = `<p class="error-text">載入失敗：${error.message}</p>`;
    return;
  }

  if (!trips || trips.length === 0) {
    tripsList.innerHTML = '<p class="empty-text">還沒有旅行，快去建立第一個吧！</p>';
    return;
  }

  // 取得每個 trip 的成員數
  const memberCounts = await Promise.all(
    trips.map(t =>
      supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', t.id)
    )
  );

  tripsList.innerHTML = trips.map((trip, i) => {
    const count = memberCounts[i].count ?? 0;
    const statusLabel = { upcoming: '即將出發', ongoing: '進行中', completed: '已結束' };
    const statusClass = { upcoming: 'status-upcoming', ongoing: 'status-ongoing', completed: 'status-completed' };

    const coverStyle = trip.cover_image_url
      ? `background-image: url('${trip.cover_image_url}'); background-size: cover; background-position: center;`
      : '';

    return `
      <div class="trip-card" data-id="${trip.id}">
        <div class="trip-card-cover" style="${coverStyle}">
          ${!trip.cover_image_url ? `<span class="trip-card-emoji">${trip.emoji || '✈️'}</span>` : ''}
          <span class="trip-status-badge ${statusClass[trip.status] || ''}">${statusLabel[trip.status] || trip.status}</span>
        </div>
        <div class="trip-card-body">
          <div class="trip-card-title">
            ${trip.cover_image_url ? `<span>${trip.emoji || '✈️'}</span>` : ''}
            <strong>${trip.name}</strong>
          </div>
          ${trip.destination ? `<div class="trip-card-meta">📍 ${trip.destination}</div>` : ''}
          ${trip.start_date ? `<div class="trip-card-meta">📅 ${formatDate(trip.start_date)}${trip.end_date ? ' ~ ' + formatDate(trip.end_date) : ''}</div>` : ''}
          <div class="trip-card-meta">👥 ${count} 位成員 ・ ${trip.base_currency}</div>
        </div>
        <div class="trip-card-actions">
          <button class="btn btn-sm btn-primary" onclick="openTrip('${trip.id}')">
            🗺️ 開啟
          </button>
          <button class="btn btn-sm btn-secondary" onclick="openInviteModal('${trip.id}')">
            🔗 邀請
          </button>
          <button class="btn btn-sm btn-ghost" onclick="openMembersModal('${trip.id}')">
            👥 成員
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── 開啟旅行頁面 ───────────────────────────────────────────────────────────────
window.openTrip = function(tripId) {
  window.location.href = `trip.html?id=${tripId}`;
};

// ── 邀請 Modal ─────────────────────────────────────────────────────────────────
window.openInviteModal = function(tripId) {
  currentTripId = tripId;
  inviteLinkResult.classList.add('hidden');
  document.getElementById('inviteeName').value = '';
  document.getElementById('inviteMaxUses').value = '0';
  inviteModal.classList.remove('hidden');
};

closeModalBtn.addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

inviteModal.addEventListener('click', (e) => {
  if (e.target === inviteModal) inviteModal.classList.add('hidden');
});

generateInviteBtn.addEventListener('click', async () => {
  if (!currentTripId) return;

  generateInviteBtn.disabled = true;
  generateInviteBtn.textContent = '生成中...';

  try {
    const expiryHours = parseInt(document.getElementById('inviteExpiry').value);
    const expiresAt   = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    const maxUses     = parseInt(document.getElementById('inviteMaxUses').value) || 0;
    const inviteeName = document.getElementById('inviteeName').value.trim() || null;
    const token       = generateToken();

    // 收集權限
    const permissions = {
      can_view_itinerary:      document.getElementById('perm_itinerary').checked,
      can_edit_itinerary:      false,
      can_view_expense:        document.getElementById('perm_expense').checked,
      can_edit_expense:        false,
      can_view_shopping:       document.getElementById('perm_shopping').checked,
      can_edit_shopping:       false,
      can_view_info:           document.getElementById('perm_info').checked,
      can_edit_info:           false,
      can_view_tools:          document.getElementById('perm_tools').checked,
      can_edit_tools:          false,
      can_use_memo:            document.getElementById('perm_memo').checked,
      can_use_packing:         document.getElementById('perm_packing').checked,
      can_use_private_expense: document.getElementById('perm_private_expense').checked,
    };

    const { error } = await supabase
      .from('invite_links')
      .insert({
        trip_id:      currentTripId,
        token,
        created_by:   currentUser.id,
        expires_at:   expiresAt,
        max_uses:     maxUses,
        use_count:    0,
        is_active:    true,
        invitee_name: inviteeName,
        permissions,
      });

    if (error) throw error;

    // 顯示連結
    const link = `${window.location.origin}/treat-all-trips/join.html?token=${token}`;
    inviteLinkText.textContent = link;
    inviteLinkResult.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    alert(`生成失敗：${err.message}`);
  } finally {
    generateInviteBtn.disabled = false;
    generateInviteBtn.textContent = '🔗 生成邀請連結';
  }
});

copyInviteLink.addEventListener('click', async () => {
  const text = inviteLinkText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    copyInviteLink.textContent = '✅ 已複製！';
    setTimeout(() => { copyInviteLink.textContent = '📋 複製連結'; }, 2000);
  } catch {
    // fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    copyInviteLink.textContent = '✅ 已複製！';
    setTimeout(() => { copyInviteLink.textContent = '📋 複製連結'; }, 2000);
  }
});

// ── 成員 Modal ─────────────────────────────────────────────────────────────────
window.openMembersModal = async function(tripId) {
  currentTripId = tripId;
  membersList.innerHTML = '<div class="loading-placeholder">載入中...</div>';
  membersModal.classList.remove('hidden');

  const { data, error } = await supabase
    .from('trip_members')
    .select('id, nickname, joined_at, user_id')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  if (error) {
    membersList.innerHTML = `<p class="error-text">載入失敗：${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    membersList.innerHTML = '<p class="empty-text">還沒有成員</p>';
    return;
  }

  membersList.innerHTML = data.map(m => {
    const isAdmin = m.user_id === PLATFORM_ADMIN_ID;
    const joinedDate = new Date(m.joined_at).toLocaleDateString('zh-TW');
    return `
      <div class="member-row">
        <div class="member-avatar">${m.nickname ? m.nickname[0].toUpperCase() : '?'}</div>
        <div class="member-info">
          <div class="member-name">
            ${m.nickname || '未命名'}
            ${isAdmin ? '<span class="badge badge-admin">管理員</span>' : ''}
          </div>
          <div class="member-meta">加入於 ${joinedDate}</div>
        </div>
        ${!isAdmin ? `
          <button class="btn btn-sm btn-danger" onclick="removeMember('${m.id}', '${tripId}')">
            移除
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
};

window.removeMember = async function(memberId, tripId) {
  if (!confirm('確定要移除此成員？')) return;

  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    alert(`移除失敗：${error.message}`);
    return;
  }

  await openMembersModal(tripId);
  await loadTrips(); // 更新成員數
};

closeMembersModalBtn.addEventListener('click', () => {
  membersModal.classList.add('hidden');
});

membersModal.addEventListener('click', (e) => {
  if (e.target === membersModal) membersModal.classList.add('hidden');
});

// ── 啟動 ───────────────────────────────────────────────────────────────────────
checkAuth();
