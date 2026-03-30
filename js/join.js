import { supabase, getCurrentUser, sendMagicLink, onAuthStateChange, waitForSession } from './auth.js';

const getBaseUrl = () => {
  const path = window.location.pathname;
  const base = path.substring(0, path.lastIndexOf('/'));
  return base || '';
};

async function getInviteInfo(token) {
  const { data, error } = await supabase
    .from('invite_links')
    .select(`
      *,
      trips (
        id,
        name,
        destination,
        cover_image_url,
        start_date,
        end_date
      )
    `)
    .eq('token', token)
    .single();

  if (error) return { data: null, error };
  return { data, error: null };
}

async function validateInvite(invite) {
  if (!invite.is_active) {
    return { valid: false, reason: '此邀請連結已停用' };
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { valid: false, reason: '此邀請連結已過期' };
  }
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    return { valid: false, reason: '此邀請連結已達使用上限' };
  }
  return { valid: true };
}

async function checkAlreadyMember(tripId, userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single();

  return !!data && !error;
}

async function joinTrip(invite, userId) {
  // 寫入 trip_members（使用 can_ 欄位）
  const { error: insertError } = await supabase
    .from('trip_members')
    .insert({
      trip_id: invite.trip_id,
      user_id: userId,
      can_view_itinerary: true,
      can_edit_itinerary: false,
      can_view_expense: true,
      can_edit_expense: false,
      can_view_shopping: true,
      can_edit_shopping: false,
      can_view_info: true,
      can_edit_info: false,
      can_view_tools: true,
      can_edit_tools: false,
      can_use_private_expense: false,
      can_use_memo: false,
      can_use_packing: false
    });

  if (insertError) return { success: false, error: insertError };

  // 更新邀請連結使用次數
  await supabase
    .from('invite_links')
    .update({ use_count: (invite.use_count || 0) + 1 })
    .eq('id', invite.id);

  return { success: true };
}

function showError(message) {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('invite-screen').classList.add('hidden');
  document.getElementById('email-screen').classList.add('hidden');
  document.getElementById('success-screen').classList.add('hidden');
  
  const errorScreen = document.getElementById('error-screen');
  errorScreen.classList.remove('hidden');
  document.getElementById('error-message').textContent = message;
}

function showInviteInfo(invite) {
  document.getElementById('loading-screen').classList.add('hidden');
  
  const trip = invite.trips;
  document.getElementById('trip-name').textContent = trip.name;
  document.getElementById('trip-destination').textContent = trip.destination || '';
  
  if (trip.start_date && trip.end_date) {
    const start = new Date(trip.start_date).toLocaleDateString('zh-TW');
    const end = new Date(trip.end_date).toLocaleDateString('zh-TW');
    document.getElementById('trip-dates').textContent = `${start} － ${end}`;
  }

  if (trip.cover_image_url) {
    document.getElementById('trip-cover').src = trip.cover_image_url;
    document.getElementById('trip-cover').classList.remove('hidden');
  }

  document.getElementById('invite-screen').classList.remove('hidden');
}

function showEmailForm() {
  document.getElementById('invite-screen').classList.add('hidden');
  document.getElementById('email-screen').classList.remove('hidden');
}

function showSuccess(tripId) {
  document.getElementById('email-screen').classList.add('hidden');
  document.getElementById('invite-screen').classList.add('hidden');
  document.getElementById('success-screen').classList.remove('hidden');
  
  // 3秒後自動跳轉
  setTimeout(() => {
    window.location.href = `${getBaseUrl()}/trip.html?id=${tripId}`;
  }, 3000);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showError('無效的邀請連結：缺少 token');
    return;
  }

  // 儲存 token 供 Magic Link 回調使用
  sessionStorage.setItem('invite_token', token);

  // 取得邀請資訊
  const { data: invite, error } = await getInviteInfo(token);
  if (error || !invite) {
    showError('找不到此邀請連結，可能已失效');
    return;
  }

  // 驗證邀請
  const validation = await validateInvite(invite);
  if (!validation.valid) {
    showError(validation.reason);
    return;
  }

  // 顯示邀請資訊
  showInviteInfo(invite);

  // 檢查用戶是否已登入
  const user = await getCurrentUser();

  if (user) {
    // 已登入：檢查是否已是成員
    const alreadyMember = await checkAlreadyMember(invite.trip_id, user.id);
    
    if (alreadyMember) {
      showSuccess(invite.trip_id);
      return;
    }

    // 顯示確認加入按鈕
    document.getElementById('btn-join-now').classList.remove('hidden');
    document.getElementById('btn-need-login').classList.add('hidden');
    
    document.getElementById('btn-join-now').addEventListener('click', async () => {
      const result = await joinTrip(invite, user.id);
      if (result.success) {
        showSuccess(invite.trip_id);
      } else {
        showError('加入旅程失敗，請稍後再試');
      }
    });
  } else {
    // 未登入：顯示 Email 輸入
    document.getElementById('btn-need-login').classList.remove('hidden');
    document.getElementById('btn-join-now').classList.add('hidden');
    
    document.getElementById('btn-need-login').addEventListener('click', () => {
      showEmailForm();
    });

    // Email 表單送出
    document.getElementById('email-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email-input').value.trim();
      
      if (!email) return;

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = '發送中...';

      // Magic Link 的 redirectTo 要指向 join.html 並帶 token
      const redirectTo = `${window.location.origin}${getBaseUrl()}/join.html?token=${token}`;
      
      const { error: magicError } = await sendMagicLink(email, redirectTo);
      
      if (magicError) {
        submitBtn.disabled = false;
        submitBtn.textContent = '發送 Magic Link';
        document.getElementById('email-error').textContent = '發送失敗，請檢查 Email 是否正確';
        document.getElementById('email-error').classList.remove('hidden');
      } else {
        // 顯示已發送提示
        document.getElementById('email-form').classList.add('hidden');
        document.getElementById('email-sent').classList.remove('hidden');
      }
    });
  }

  // 監聽 Auth 狀態變化（Magic Link 回調）
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      const storedToken = sessionStorage.getItem('invite_token');
      if (!storedToken) return;

      // 重新取得邀請資訊
      const { data: freshInvite } = await getInviteInfo(storedToken);
      if (!freshInvite) return;

      const alreadyMember = await checkAlreadyMember(freshInvite.trip_id, session.user.id);
      if (alreadyMember) {
        sessionStorage.removeItem('invite_token');
        showSuccess(freshInvite.trip_id);
        return;
      }

      const result = await joinTrip(freshInvite, session.user.id);
      sessionStorage.removeItem('invite_token');
      
      if (result.success) {
        showSuccess(freshInvite.trip_id);
      } else {
        showError('加入旅程失敗：' + (result.error?.message || '未知錯誤'));
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
