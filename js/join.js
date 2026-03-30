// js/join.js
import { supabase, getCurrentUser, sendMagicLink } from './auth.js';

// ── 從 URL 取得 token ─────────────────────────────
const params = new URLSearchParams(location.search);
const token  = params.get('token');

// ── DOM 元素 ──────────────────────────────────────
const joinLoading     = document.getElementById('join-loading');
const joinConfirm     = document.getElementById('join-confirm');
const joinAlready     = document.getElementById('join-already');
const joinError       = document.getElementById('join-error');

const joinTripEmoji   = document.getElementById('join-trip-emoji');
const joinTripName    = document.getElementById('join-trip-name');
const joinTripDest    = document.getElementById('join-trip-dest');
const joinTripDates   = document.getElementById('join-trip-dates');

const joinNeedAuth    = document.getElementById('join-need-auth');
const joinLoggedIn    = document.getElementById('join-logged-in');
const joinEmailInput  = document.getElementById('join-email');
const joinSendBtn     = document.getElementById('join-send-magic-link');
const joinAuthMsg     = document.getElementById('join-auth-message');
const joinConfirmBtn  = document.getElementById('join-confirm-btn');
const joinGoTrip      = document.getElementById('join-go-trip');
const joinAlreadyDesc = document.getElementById('join-already-desc');
const joinErrorDesc   = document.getElementById('join-error-desc');

// ── 初始化 ────────────────────────────────────────
async function init() {
  if (!token) {
    showError('缺少邀請 token，請確認連結是否完整');
    return;
  }

  // ── 查詢邀請資訊（使用正確的資料表 invite_links）──
  const { data: invite, error: inviteError } = await supabase
    .from('invite_links')
    .select(`
      id,
      trip_id,
      token,
      expires_at,
      used_count,
      max_uses,
      perm_itinerary,
      perm_expense,
      perm_shopping,
      perm_info,
      perm_tools,
      perm_memo,
      perm_packing,
      trips (
        id,
        name,
        destination,
        start_date,
        end_date,
        cover_emoji
      )
    `)
    .eq('token', token)
    .single();

  if (inviteError || !invite) {
    console.error('[join] 查詢邀請失敗:', inviteError?.message);
    showError('找不到此邀請連結，可能已失效或被刪除');
    return;
  }

  // ── 檢查是否已過期 ─────────────────────────────
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    showError('此邀請連結已過期，請聯絡旅行管理者重新產生');
    return;
  }

  // ── 檢查是否超過使用上限 ───────────────────────
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    showError('此邀請連結已達使用上限');
    return;
  }

  // ── 顯示旅行資訊 ───────────────────────────────
  const trip = invite.trips;
  if (!trip) {
    showError('找不到對應的旅行資訊');
    return;
  }

  showTripInfo(trip);

  // ── 檢查登入狀態 ───────────────────────────────
  const user = await getCurrentUser();

  if (!user) {
    // 未登入 → 顯示 Magic Link 表單
    showAuthSection(false);
    setupMagicLinkFlow();
  } else {
    // 已登入 → 檢查是否已是成員
    const { data: existing } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('user_id', user.id)
      .maybeSingle();               // 用 maybeSingle 避免 no rows 報錯

    if (existing) {
      // 已是成員 → 顯示「已加入」畫面
      if (joinAlreadyDesc) {
        joinAlreadyDesc.textContent = `您已是「${trip.name}」的成員`;
      }
      if (joinGoTrip) {
        joinGoTrip.onclick = () => {
          location.href = buildTripUrl(trip.id);
        };
      }
      showState('already');
      return;
    }

    // 尚未加入 → 顯示確認加入按鈕
    showAuthSection(true);
    joinConfirmBtn?.addEventListener('click', () => joinTrip(user.id, trip, invite));
  }

  showState('confirm');
}

// ── 顯示 / 隱藏登入區塊 ───────────────────────────
function showAuthSection(isLoggedIn) {
  if (joinNeedAuth) joinNeedAuth.style.display = isLoggedIn ? 'none' : 'block';
  if (joinLoggedIn) joinLoggedIn.style.display = isLoggedIn ? 'block' : 'none';
}

// ── Magic Link 流程設定 ───────────────────────────
function setupMagicLinkFlow() {
  joinSendBtn?.addEventListener('click', async () => {
    const email = joinEmailInput?.value?.trim();

    if (!email || !isValidEmail(email)) {
      showJoinMessage('請輸入有效的電子郵件地址', 'error');
      return;
    }

    joinSendBtn.disabled    = true;
    joinSendBtn.textContent = '發送中⋯';

    // 登入後重新導向回同一個 join.html?token=xxx
    const redirectTo = buildJoinRedirectUrl(token);
    const { error }  = await sendMagicLink(email, redirectTo);

    joinSendBtn.disabled    = false;
    joinSendBtn.textContent = '發送登入連結並加入旅行';

    if (error) {
      showJoinMessage('發送失敗：' + error.message, 'error');
    } else {
      showJoinMessage(
        `登入連結已發送至 ${email}，請查收信件後點擊連結即可自動加入旅行 ✉️`,
        'success'
      );
      joinSendBtn.style.display = 'none'; // 避免重複點擊
    }
  });
}

// ── 確認加入旅行 ──────────────────────────────────
async function joinTrip(userId, trip, invite) {
  if (!joinConfirmBtn) return;

  joinConfirmBtn.disabled    = true;
  joinConfirmBtn.textContent = '加入中⋯';

  try {
    // ── 新增 trip_members 記錄，使用邀請中的權限設定 ──
    const { error: insertError } = await supabase
      .from('trip_members')
      .insert({
        trip_id:           trip.id,
        user_id:           userId,
        // ── 依 admin.js 建立邀請時寫入的欄位名稱 ──────
        perm_itinerary:    invite.perm_itinerary    ?? false,
        perm_expense:      invite.perm_expense      ?? false,
        perm_shopping:     invite.perm_shopping     ?? false,
        perm_info:         invite.perm_info         ?? false,
        perm_tools:        invite.perm_tools        ?? false,
        perm_memo:         invite.perm_memo         ?? false,
        perm_packing:      invite.perm_packing      ?? false,
        // private_expense 預設 false（不對外開放）
        perm_private_expense: false,
      });

    if (insertError) throw insertError;

    // ── 更新邀請使用次數 ───────────────────────────
    await supabase
      .from('invite_links')
      .update({ used_count: (invite.used_count || 0) + 1 })
      .eq('id', invite.id);

    // ── 成功 → 跳轉到旅行頁面 ─────────────────────
    location.href = buildTripUrl(trip.id);

  } catch (err) {
    console.error('[join] 加入旅行失敗:', err);
    joinConfirmBtn.disabled    = false;
    joinConfirmBtn.textContent = '確認加入旅行 🎉';
    showJoinMessage('加入失敗，請稍後再試。若問題持續請聯絡管理者', 'error');
  }
}

// ── 顯示旅行資訊卡片 ──────────────────────────────
function showTripInfo(trip) {
  if (joinTripEmoji) joinTripEmoji.textContent = trip.cover_emoji || '✈️';
  if (joinTripName)  joinTripName.textContent  = trip.name;
  if (joinTripDest)  joinTripDest.textContent  = trip.destination
                                                   ? `📍 ${trip.destination}`
                                                   : '';
  if (joinTripDates) joinTripDates.textContent = formatDateRange(
    trip.start_date,
    trip.end_date
  );
}

// ── 切換顯示區塊狀態 ──────────────────────────────
function showState(state) {
  if (joinLoading) joinLoading.style.display = 'none';
  if (joinConfirm) joinConfirm.style.display = state === 'confirm' ? 'block' : 'none';
  if (joinAlready) joinAlready.style.display = state === 'already' ? 'block' : 'none';
  if (joinError)   joinError.style.display   = state === 'error'   ? 'block' : 'none';
}

function showError(msg) {
  if (joinErrorDesc) joinErrorDesc.textContent = msg;
  showState('error');
}

function showJoinMessage(msg, type = 'info') {
  if (!joinAuthMsg) return;
  joinAuthMsg.textContent = msg;
  joinAuthMsg.className   = `auth-message auth-message-${type}`;
  joinAuthMsg.style.display = 'block';
}

// ── URL 輔助函式 ──────────────────────────────────
function buildJoinRedirectUrl(tkn) {
  // 確保 Magic Link 登入後回到同一個 join.html?token=xxx
  const base = location.origin + location.pathname; // .../join.html
  return `${base}?token=${tkn}`;
}

function buildTripUrl(tripId) {
  const base = location.origin + location.pathname.replace('join.html', '');
  return `${base}trip.html?id=${tripId}`;
}

// ── 日期格式化 ────────────────────────────────────
function formatDateRange(startDate, endDate) {
  if (!startDate) return '日期未定';
  const fmt = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  return endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : fmt(startDate);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── 啟動 ──────────────────────────────────────────
init();
