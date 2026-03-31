// js/admin.js
import { supabase, getBaseUrl, requireAdmin, getUserProfile } from './auth.js';

// ── 常數 ──────────────────────────────────────────────────────────────────────
const PLATFORM_ADMIN_ID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb';

const PERMISSION_FIELDS = [
  'can_view_itinerary',
  'can_edit_itinerary',
  'can_view_expense',
  'can_edit_expense',
  'can_view_shopping',
  'can_edit_shopping',
  'can_view_info',
  'can_edit_info',
  'can_view_tools',
  'can_edit_tools',
  'can_use_memo',
  'can_use_packing',
  'can_use_private_expense',
];

// ── 狀態 ──────────────────────────────────────────────────────────────────────
let currentUser       = null;
let currentTripId     = null;
let selectedCoverFile = null;
let editingTripId     = null; // 目前編輯的 trip（null = 新建模式）

// ── DOM 快取 ──────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = {
  logoutBtn:               $('logoutBtn'),
  createTripForm:          $('createTripForm'),
  createTripBtn:           $('createTripBtn'),
  createTripMessage:       $('createTripMessage'),
  tripsList:               $('tripsList'),
  formTitle:               $('formTitle'),          // h2 inside form panel

  // Cover image
  coverUploadArea:         $('coverUploadArea'),
  coverImageInput:         $('coverImageInput'),
  coverPreview:            $('coverPreview'),
  coverUploadPlaceholder:  $('coverUploadPlaceholder'),
  removeCoverBtn:          $('removeCoverBtn'),

  // Invite modal
  inviteModal:             $('inviteModal'),
  closeModalBtn:           $('closeModal'),
  generateInviteBtn:       $('generateInviteBtn'),
  inviteLinkResult:        $('inviteLinkResult'),
  inviteLinkText:          $('inviteLinkText'),
  copyInviteLink:          $('copyInviteLink'),

  // Members modal
  membersModal:            $('membersModal'),
  closeMembersModalBtn:    $('closeMembersModal'),
  membersList:             $('membersList'),

  // Edit trip modal
  editTripModal:           $('editTripModal'),
  closeEditModalBtn:       $('closeEditModal'),
  editTripForm:            $('editTripForm'),
  editTripMessage:         $('editTripMessage'),
  saveTripBtn:             $('saveTripBtn'),
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────
function showMsg(elRef, text, type = 'info') {
  elRef.textContent = text;
  elRef.className   = `message message-${type}`;
  elRef.classList.remove('hidden');
}

function hideMsg(elRef) {
  elRef.classList.add('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function isValidImageType(file) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
}

// ── 封面圖片處理 ──────────────────────────────────────────────────────────────
function initCoverUpload() {
  el.coverUploadArea.addEventListener('click', () => el.coverImageInput.click());

  el.coverImageInput.addEventListener('change', (e) => {
    handleCoverFile(e.target.files[0]);
  });

  el.removeCoverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearCoverPreview();
  });

  el.coverUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.coverUploadArea.classList.add('drag-over');
  });

  el.coverUploadArea.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    el.coverUploadArea.classList.remove('drag-over');
  });

  el.coverUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.coverUploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleCoverFile(file);
  });
}

function handleCoverFile(file) {
  if (!file) return;

  if (!isValidImageType(file)) {
    showMsg(el.createTripMessage, '僅支援 JPG、PNG、WebP、GIF 格式', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showMsg(el.createTripMessage, '圖片大小不能超過 5MB', 'error');
    return;
  }

  selectedCoverFile = file;
  const url = URL.createObjectURL(file);
  el.coverPreview.src = url;
  el.coverPreview.classList.remove('hidden');
  el.coverUploadPlaceholder.classList.add('hidden');
  el.removeCoverBtn.classList.remove('hidden');
}

function clearCoverPreview() {
  selectedCoverFile         = null;
  el.coverImageInput.value  = '';
  el.coverPreview.src       = '';
  el.coverPreview.classList.add('hidden');
  el.coverUploadPlaceholder.classList.remove('hidden');
  el.removeCoverBtn.classList.add('hidden');
}

async function uploadCoverImage(tripId, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${tripId}/cover.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('trip-covers')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('trip-covers')
    .getPublicUrl(path);

  // Cache-bust so updated cover shows immediately
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ── 認證 ──────────────────────────────────────────────────────────────────────
async function init() {
  // requireAdmin redirects automatically if not admin
  const auth = await requireAdmin('/index.html');
  if (!auth) return;

  currentUser = auth.session.user;
  await loadTrips();
}

// ── 登出 ──────────────────────────────────────────────────────────────────────
el.logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.href = `${getBaseUrl()}/index.html`;
});

// ── 建立 / 更新旅行 ───────────────────────────────────────────────────────────
el.createTripForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg(el.createTripMessage);

  const name = $('tripName').value.trim();
  if (!name) {
    showMsg(el.createTripMessage, '請輸入旅行名稱', 'error');
    return;
  }

  el.createTripBtn.disabled     = true;
  el.createTripBtn.textContent  = editingTripId ? '儲存中...' : '建立中...';

  const tripData = {
    name,
    emoji:           $('tripEmoji').value.trim()       || '✈️',
    destination:     $('tripDestination').value.trim() || null,
    start_date:      $('tripStartDate').value          || null,
    end_date:        $('tripEndDate').value            || null,
    base_currency:   $('tripCurrency').value,
    description:     $('tripDescription').value.trim() || null,
  };

  try {
    if (editingTripId) {
      // ── 更新旅行 ──────────────────────────────────────────
      const { error } = await supabase
        .from('trips')
        .update(tripData)
        .eq('id', editingTripId);

      if (error) throw error;

      if (selectedCoverFile) {
        try {
          const url = await uploadCoverImage(editingTripId, selectedCoverFile);
          await supabase.from('trips').update({ cover_image_url: url }).eq('id', editingTripId);
        } catch (imgErr) {
          console.warn('封面更新失敗：', imgErr.message);
        }
      }

      showMsg(el.createTripMessage, `✅ 旅行「${name}」已更新！`, 'success');
      resetForm();
      await loadTrips();

    } else {
      // ── 新建旅行 ──────────────────────────────────────────
      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({ ...tripData, created_by: currentUser.id, status: 'upcoming' })
        .select()
        .single();

      if (tripErr) throw tripErr;

      // 上傳封面
      if (selectedCoverFile) {
        try {
          const url = await uploadCoverImage(trip.id, selectedCoverFile);
          await supabase.from('trips').update({ cover_image_url: url }).eq('id', trip.id);
        } catch (imgErr) {
          console.warn('封面上傳失敗，旅行已建立：', imgErr.message);
        }
      }

      // 建立者自動加入為全權限成員
      const { error: memberErr } = await supabase
        .from('trip_members')
        .insert({
          trip_id:  trip.id,
          user_id:  currentUser.id,
          nickname: '管理員',
          ...Object.fromEntries(PERMISSION_FIELDS.map(p => [p, true])),
        });

      if (memberErr) throw memberErr;

      showMsg(el.createTripMessage, `✅ 旅行「${name}」建立成功！`, 'success');
      resetForm();
      await loadTrips();
    }

  } catch (err) {
    console.error('[admin] submit error:', err);
    showMsg(el.createTripMessage, `❌ ${editingTripId ? '更新' : '建立'}失敗：${err.message}`, 'error');
  } finally {
    el.createTripBtn.disabled    = false;
    el.createTripBtn.textContent = editingTripId ? '💾 儲存變更' : '✨ 建立旅行';
  }
});

// 重置表單至新建模式
function resetForm() {
  editingTripId = null;
  el.createTripForm.reset();
  clearCoverPreview();
  if (el.formTitle) el.formTitle.textContent = '✨ 建立新旅行';
  el.createTripBtn.textContent = '✨ 建立旅行';
  hideMsg(el.createTripMessage);
}

// ── 載入旅行列表 ──────────────────────────────────────────────────────────────
async function loadTrips() {
  el.tripsList.innerHTML = '<div class="loading-placeholder">載入中...</div>';

  // Single query: trips + member count via aggregate
  const { data: trips, error } = await supabase
    .from('trips')
    .select(`
      id, name, emoji, destination,
      start_date, end_date, status,
      cover_image_url, base_currency, created_at,
      trip_members(count)
    `)
    .eq('created_by', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    el.tripsList.innerHTML = `<p class="error-text">載入失敗：${error.message}</p>`;
    return;
  }

  if (!trips?.length) {
    el.tripsList.innerHTML = '<p class="empty-text">還沒有旅行，快去建立第一個吧！</p>';
    return;
  }

  el.tripsList.innerHTML = trips.map(renderTripCard).join('');
}

const STATUS_LABEL = { upcoming: '即將出發', ongoing: '進行中', completed: '已結束' };
const STATUS_CLASS = { upcoming: 'status-upcoming', ongoing: 'status-ongoing', completed: 'status-completed' };

function renderTripCard(trip) {
  // trip_members returns [{ count: N }] from the aggregate
  const count      = trip.trip_members?.[0]?.count ?? 0;
  const coverStyle = trip.cover_image_url
    ? `background-image:url('${trip.cover_image_url}');background-size:cover;background-position:center;`
    : '';

  return `
    <div class="trip-card" data-id="${trip.id}">
      <div class="trip-card-cover" style="${coverStyle}">
        ${!trip.cover_image_url
          ? `<span class="trip-card-emoji">${trip.emoji || '✈️'}</span>`
          : ''}
        <span class="trip-status-badge ${STATUS_CLASS[trip.status] || ''}">
          ${STATUS_LABEL[trip.status] || trip.status}
        </span>
      </div>

      <div class="trip-card-body">
        <div class="trip-card-title">
          ${trip.cover_image_url ? `<span>${trip.emoji || '✈️'}</span>` : ''}
          <strong>${escapeHtml(trip.name)}</strong>
        </div>
        ${trip.destination
          ? `<div class="trip-card-meta">📍 ${escapeHtml(trip.destination)}</div>`
          : ''}
        ${trip.start_date
          ? `<div class="trip-card-meta">📅 ${formatDate(trip.start_date)}${trip.end_date ? ' ～ ' + formatDate(trip.end_date) : ''}</div>`
          : ''}
        <div class="trip-card-meta">👥 ${count} 位成員・${trip.base_currency}</div>
      </div>

      <div class="trip-card-actions">
        <button class="btn btn-sm btn-primary"
                data-action="open" data-id="${trip.id}">🗺️ 開啟</button>
        <button class="btn btn-sm btn-secondary"
                data-action="invite" data-id="${trip.id}">🔗 邀請</button>
        <button class="btn btn-sm btn-ghost"
                data-action="members" data-id="${trip.id}">👥 成員</button>
        <button class="btn btn-sm btn-ghost"
                data-action="edit" data-id="${trip.id}"
                data-trip='${JSON.stringify(trip)}'>✏️ 編輯</button>
        <button class="btn btn-sm btn-danger"
                data-action="delete" data-id="${trip.id}"
                data-name="${escapeHtml(trip.name)}">🗑️ 刪除</button>
      </div>
    </div>
  `;
}

// ── 事件委派：取代 window.xxx 全域函式 ───────────────────────────────────────
el.tripsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id: tripId, name: tripName } = btn.dataset;

  switch (action) {
    case 'open':
      location.href = `${getBaseUrl()}/trip.html?id=${tripId}`;
      break;

    case 'invite':
      openInviteModal(tripId);
      break;

    case 'members':
      await openMembersModal(tripId);
      break;

    case 'edit': {
      const trip = JSON.parse(btn.dataset.trip);
      loadTripIntoForm(trip);
      break;
    }

    case 'delete':
      await deleteTrip(tripId, tripName);
      break;
  }
});

// XSS 防護
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 編輯旅行（載入表單）─────────────────────────────────────────────────────
function loadTripIntoForm(trip) {
  editingTripId = trip.id;

  $('tripName').value        = trip.name        || '';
  $('tripEmoji').value       = trip.emoji       || '✈️';
  $('tripDestination').value = trip.destination || '';
  $('tripStartDate').value   = trip.start_date  || '';
  $('tripEndDate').value     = trip.end_date    || '';
  $('tripCurrency').value    = trip.base_currency || 'TWD';
  $('tripDescription').value = trip.description || '';

  // Show existing cover if any
  if (trip.cover_image_url) {
    el.coverPreview.src = trip.cover_image_url;
    el.coverPreview.classList.remove('hidden');
    el.coverUploadPlaceholder.classList.add('hidden');
    el.removeCoverBtn.classList.remove('hidden');
  } else {
    clearCoverPreview();
  }

  if (el.formTitle) el.formTitle.textContent = '✏️ 編輯旅行';
  el.createTripBtn.textContent = '💾 儲存變更';

  // Scroll form into view
  el.createTripForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 刪除旅行 ──────────────────────────────────────────────────────────────────
async function deleteTrip(tripId, tripName) {
  const confirmed = confirm(
    `⚠️ 確定要刪除旅行「${tripName}」？\n\n此操作無法復原，相關成員與邀請連結將一併刪除。`
  );
  if (!confirmed) return;

  // Double confirm for safety
  const reconfirmed = confirm(`再次確認：永久刪除「${tripName}」？`);
  if (!reconfirmed) return;

  try {
    // Delete in correct order (FK constraints)
    await supabase.from('invite_links').delete().eq('trip_id', tripId);
    await supabase.from('trip_members').delete().eq('trip_id', tripId);

    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (error) throw error;

    await loadTrips();

    // If we were editing this trip, reset the form
    if (editingTripId === tripId) resetForm();

  } catch (err) {
    console.error('[admin] deleteTrip error:', err);
    alert(`刪除失敗：${err.message}`);
  }
}

// ── 邀請 Modal ────────────────────────────────────────────────────────────────
function openInviteModal(tripId) {
  currentTripId = tripId;
  el.inviteLinkResult.classList.add('hidden');
  $('inviteeName').value  = '';
  $('inviteMaxUses').value = '0';
  // Reset all permission checkboxes to checked by default
  PERMISSION_FIELDS.forEach(p => {
    const checkbox = document.getElementById(`perm_${p.replace('can_', '')}`);
    if (checkbox) checkbox.checked = true;
  });
  el.inviteModal.classList.remove('hidden');
}

el.closeModalBtn.addEventListener('click', () => {
  el.inviteModal.classList.add('hidden');
});

el.inviteModal.addEventListener('click', (e) => {
  if (e.target === el.inviteModal) el.inviteModal.classList.add('hidden');
});

el.generateInviteBtn.addEventListener('click', async () => {
  if (!currentTripId) return;

  el.generateInviteBtn.disabled    = true;
  el.generateInviteBtn.textContent = '生成中...';

  try {
    const expiryHours = parseInt($('inviteExpiry').value) || 24;
    const expiresAt   = new Date(Date.now() + expiryHours * 3_600_000).toISOString();
    const maxUses     = parseInt($('inviteMaxUses').value) || 0;
    const inviteeName = $('inviteeName').value.trim() || null;
    const token       = generateToken();

    // Collect permissions from checkboxes
    const permissions = {};
    PERMISSION_FIELDS.forEach(field => {
      // Checkbox id format: perm_view_itinerary (strips "can_")
      const checkboxId = `perm_${field.replace('can_', '')}`;
      const checkbox   = document.getElementById(checkboxId);
      permissions[field] = checkbox ? checkbox.checked : false;
    });

    const { error } = await supabase.from('invite_links').insert({
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

    // Use getBaseUrl() — no hardcoded path!
    const link = `${getBaseUrl()}/join.html?token=${token}`;
    el.inviteLinkText.textContent = link;
    el.inviteLinkResult.classList.remove('hidden');

  } catch (err) {
    console.error('[admin] generateInvite error:', err);
    alert(`生成失敗：${err.message}`);
  } finally {
    el.generateInviteBtn.disabled    = false;
    el.generateInviteBtn.textContent = '🔗 生成邀請連結';
  }
});

el.copyInviteLink.addEventListener('click', async () => {
  const text = el.inviteLinkText.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, style: 'position:fixed;opacity:0',
    });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  el.copyInviteLink.textContent = '✅ 已複製！';
  setTimeout(() => { el.copyInviteLink.textContent = '📋 複製連結'; }, 2000);
});

// ── 成員 Modal ────────────────────────────────────────────────────────────────
async function openMembersModal(tripId) {
  currentTripId = tripId;
  el.membersList.innerHTML = '<div class="loading-placeholder">載入中...</div>';
  el.membersModal.classList.remove('hidden');

  const { data, error } = await supabase
    .from('trip_members')
    .select(`
      id, nickname, joined_at, user_id,
      ${PERMISSION_FIELDS.join(',')}
    `)
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  if (error) {
    el.membersList.innerHTML = `<p class="error-text">載入失敗：${error.message}</p>`;
    return;
  }

  if (!data?.length) {
    el.membersList.innerHTML = '<p class="empty-text">還沒有成員</p>';
    return;
  }

  el.membersList.innerHTML = data.map(renderMemberRow).join('');
}

function renderMemberRow(m) {
  const isAdmin    = m.user_id === PLATFORM_ADMIN_ID;
  const joinedDate = new Date(m.joined_at).toLocaleDateString('zh-TW');
  const initial    = m.nickname?.[0]?.toUpperCase() ?? '?';

  const permBadges = PERMISSION_FIELDS
    .filter(p => m[p])
    .map(p => `<span class="perm-badge">${p.replace('can_', '').replace(/_/g, ' ')}</span>`)
    .join('');

  return `
    <div class="member-row" data-member-id="${m.id}">
      <div class="member-avatar">${initial}</div>
      <div class="member-info">
        <div class="member-name">
          ${escapeHtml(m.nickname || '未命名')}
          ${isAdmin ? '<span class="badge badge-admin">管理員</span>' : ''}
        </div>
        <div class="member-meta">加入於 ${joinedDate}</div>
        <div class="member-perms">${permBadges}</div>
      </div>
      <div class="member-actions">
        ${!isAdmin ? `
          <button class="btn btn-sm btn-ghost"
                  data-action="edit-perms"
                  data-member='${JSON.stringify(m)}'>
            ⚙️ 權限
          </button>
          <button class="btn btn-sm btn-danger"
                  data-action="remove-member"
                  data-member-id="${m.id}"
                  data-trip-id="${currentTripId}">
            移除
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// 成員 Modal 內的事件委派
el.membersList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === 'remove-member') {
    const { memberId, tripId } = btn.dataset;
    await removeMember(memberId, tripId);
  }

  if (action === 'edit-perms') {
    const member = JSON.parse(btn.dataset.member);
    openPermissionsEditor(member);
  }
});

async function removeMember(memberId, tripId) {
  if (!confirm('確定要移除此成員？')) return;

  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    alert(`移除失敗：${error.message}`);
    return;
  }

  await openMembersModal(tripId || currentTripId);
  await loadTrips();
}

// ── 權限編輯器（成員 Modal 內展開）─────────────────────────────────────────
function openPermissionsEditor(member) {
  // Find the member row
  const row = el.membersList.querySelector(`[data-member-id="${member.id}"]`);
  if (!row) return;

  // Remove existing editor if any
  const existing = el.membersList.querySelector('.permissions-editor');
  if (existing) existing.remove();

  const editorHtml = `
    <div class="permissions-editor" data-for="${member.id}">
      <div class="perms-grid">
        ${PERMISSION_FIELDS.map(field => `
          <label class="perm-check-label">
            <input type="checkbox" name="${field}"
                   ${member[field] ? 'checked' : ''}>
            <span>${field.replace('can_', '').replace(/_/g, ' ')}</span>
          </label>
        `).join('')}
      </div>
      <div class="perms-actions">
        <button class="btn btn-sm btn-primary" id="savePermsBtn_${member.id}">
          💾 儲存權限
        </button>
        <button class="btn btn-sm btn-ghost" id="cancelPermsBtn_${member.id}">
          取消
        </button>
      </div>
    </div>
  `;

  row.insertAdjacentHTML('afterend', editorHtml);
  const editor = el.membersList.querySelector(`[data-for="${member.id}"]`);

  editor.querySelector(`#savePermsBtn_${member.id}`)
    .addEventListener('click', () => savePermissions(member.id, editor));

  editor.querySelector(`#cancelPermsBtn_${member.id}`)
    .addEventListener('click', () => editor.remove());
}

async function savePermissions(memberId, editorEl) {
  const updates = {};
  PERMISSION_FIELDS.forEach(field => {
    const checkbox = editorEl.querySelector(`[name="${field}"]`);
    if (checkbox) updates[field] = checkbox.checked;
  });

  const { error } = await supabase
    .from('trip_members')
    .update(updates)
    .eq('id', memberId);

  if (error) {
    alert(`儲存失敗：${error.message}`);
    return;
  }

  editorEl.remove();
  // Refresh to show updated permission badges
  await openMembersModal(currentTripId);
}

el.closeMembersModalBtn.addEventListener('click', () => {
  el.membersModal.classList.add('hidden');
});

el.membersModal.addEventListener('click', (e) => {
  if (e.target === el.membersModal) el.membersModal.classList.add('hidden');
});

// ── 取消編輯按鈕 ──────────────────────────────────────────────────────────────
const cancelEditBtn = $('cancelEditBtn');
if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', resetForm);
}

// ── 啟動 ──────────────────────────────────────────────────────────────────────
initCoverUpload();
init();
