import { supabase, getCurrentUser, sendMagicLink } from './auth.js';

// ── 從 URL 取得 token ─────────────────────────────
const params = new URLSearchParams(location.search);
const token = params.get('token');

// ── DOM 元素 ──────────────────────────────────────
const joinLoading   = document.getElementById('join-loading');
const joinConfirm   = document.getElementById('join-confirm');
const joinAlready   = document.getElementById('join-already');
const joinError     = document.getElementById('join-error');

const joinTripEmoji = document.getElementById('join-trip-emoji');
const joinTripName  = document.getElementById('join-trip-name');
const joinTripDest  = document.getElementById('join-trip-dest');
const joinTripDates = document.getElementById('join-trip-dates');

const joinNeedAuth  = document.getElementById('join-need-auth');
const joinLoggedIn  = document.getElementById('join-logged-in');
const joinEmailInput = document.getElementById('join-email');
const joinSendBtn   = document.getElementById('join-send-magic-link');
const joinAuthMsg   = document.getElementById('join-auth-message');
const joinConfirmBtn = document.getElementById('join-confirm-btn');
const joinGoTrip    = document.getElementById('join-go-trip');
const joinAlreadyDesc = document.getElementById('join-already-desc');
const joinErrorDesc = document.getElementById('join-error-desc');

// ── 初始化 ────────────────────────────────────────
async function init() {
  if (!token) {
    showError('缺少邀請 token');
    return;
  }

  // 查詢邀請資訊
  const { data: invite, error } = await supabase
    .from('trip_invitations')
    .select(`
      *,
      trips (
        id, name, destination, start_date, end_date, cover_emoji
      )
    `)
    .eq('token', token)
    .single();

  if (error || !invite) {
    showError('找不到此邀請連結');
    return;
  }

  // 檢查是否已過期
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    showError('此邀請連結已過期');
    return;
  }

  // 顯示旅行資訊
  const trip = invite.trips;
  if (!trip) {
    showError('找不到對應的旅行');
    return;
  }

  showTripInfo(trip);

  // 檢查目前登入狀態
  const user = await getCurrentUser();

  if (!user) {
    // 未登入：顯示登入表單
    joinNeedAuth.style.display = 'block';
    joinLoggedIn.style.display = 'none';

    // 發送 Magic Link（帶上 token，登入後自動加入）
    joinSendBtn?.addEventListener('click', async () => {
      const email = joinEmailInput?.value?.trim();
      if (!email || !isValidEmail(email)) {
        showJoinMessage('請輸入有效的電子郵件', 'error');
        return;
      }

      joinSendBtn.disabled = true;
      joinSendBtn.textContent = '發送中⋯';

      const redirectTo = `${location.origin}${location.pathname.replace('join.html', '')}join.html?token=${token}`;
      const { error } = await sendMagicLink(email, redirectTo);

      joinSendBtn.disabled = false;
      joinSendBtn.textContent = '發送登入連結並加入旅行';

      if (error) {
        showJoinMessage('發送失敗：' + error.message, 'error');
      } else {
        showJoinMessage(`登入連結已發送至 ${email}，請查收信件後點擊連結`, 'success');
      }
    });

  } else {
    // 已登入：檢查是否已是成員
    const { data: existing } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      // 已是成員
      joinAlreadyDesc.textContent = `您已是「${trip.name}」的成員`;
      joinGoTrip.onclick = () => location.href = `trip.html?id=${trip.id}`;
      showState('already');
      return;
    }

    // 顯示確認按鈕
    joinNeedAuth.style.display = 'none';
    joinLoggedIn.style.display = 'block';

    joinConfirmBtn?.addEventListener('click', () => joinTrip(user.id, trip, invite));
  }

  showState('confirm');
}

// ── 顯示旅行資訊 ──────────────────────────────────
function showTripInfo(trip) {
  if (joinTripEmoji) joinTripEmoji.textContent = trip.cover_emoji || '✈️';
  if (joinTripName) joinTripName.textContent = trip.name;
  if (joinTripDest) joinTripDest.textContent = `📍 ${trip.destination || ''}`;
  if (joinTripDates) {
    joinTripDates.textContent = formatDateRange(trip.start_date, trip.end_date);
  }
}

// ── 確認加入旅行 ──────────────────────────────────
async function joinTrip(userId, trip, invite) {
  joinConfirmBtn.disabled = true;
  joinConfirmBtn.textContent = '加入中⋯';

  try {
    // 新增 trip_members 記錄
    const { error } = await supabase
      .from('trip_members')
      .insert({
        trip_id: trip.id,
        user_id: userId,
        // 使用邀請中設定的權限
        can_view_itinerary: invite.can_view_itinerary ?? true,
        can_edit_itinerary: invite.can_edit_itinerary ?? false,
        can_view_expense: invite.can_view_expense ?? true,
        can_edit_expense: invite.can_edit_expense ?? false,
        can_view_shopping: invite.can_view_shopping ?? true,
        can_edit_shopping: invite.can_edit_shopping ?? false,
        can_view_info: invite.can_view_info ?? true,
        can_edit_info: invite.can_edit_info ?? false,
      });

    if (error) throw error;

    // 更新邀請使用次數
    await supabase
      .from('trip_invitations')
      .update({ used_count: (invite.used_count || 0) + 1 })
      .eq('id', invite.id);

    // 跳轉到旅行頁面
    location.href = `trip.html?id=${trip.id}`;

  } catch (err) {
    console.error('加入旅行失敗:', err);
    joinConfirmBtn.disabled = false;
    joinConfirmBtn.textContent = '確認加入旅行 🎉';
    showJoinMessage('加入失敗，請稍後再試', 'error');
  }
}

// ── 切換顯示狀態 ──────────────────────────────────
function showState(state) {
  joinLoading.style.display = 'none';
  joinConfirm.style.display = state === 'confirm' ? 'block' : 'none';
  joinAlready.style.display = state === 'already' ? 'block' : 'none';
  joinError.style.display   = state === 'error'   ? 'block' : 'none';
}

function showError(msg) {
  if (joinErrorDesc) joinErrorDesc.textContent = msg;
  showState('error');
}

// ── 顯示加入頁訊息 ────────────────────────────────
function showJoinMessage(msg, type = 'info') {
  if (!joinAuthMsg) return;
  joinAuthMsg.textContent = msg;
  joinAuthMsg.className = `auth-message auth-message-${type}`;
  joinAuthMsg.style.display = 'block';
}

// ── 格式化日期範圍 ────────────────────────────────
function formatDateRange(startDate, endDate) {
  if (!startDate) return '日期未定';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const fmt = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  if (!end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── 啟動 ─────────────────────────────────────────
init();
