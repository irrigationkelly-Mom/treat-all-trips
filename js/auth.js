// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase 設定 ──────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTAyMTMsImV4cCI6MjA2NTQ2NjIxM30.ORNnMRMBMkPgGLvDEFYiCCHCjpDYCiZiB0ADaWSOXkaBc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
  },
});

// ── 內部：統一錯誤事件發送 ────────────────────────────────────────────────────
function emitAuthError(context, message) {
  console.error(`[auth:${context}]`, message);
  window.dispatchEvent(
    new CustomEvent('auth:error', { detail: { context, message } })
  );
}

// ── 輔助：取得正確的 Base URL ──────────────────────────────────────────────────
export function getBaseUrl() {
  const { origin, pathname } = location;
  if (origin.includes('github.io')) {
    const repoName = pathname.split('/').filter(Boolean)[0];
    return repoName ? `${origin}/${repoName}` : origin;
  }
  return origin;
}

// ── Email 格式驗證 ────────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// ── 取得目前登入用戶 ──────────────────────────────────────────────────────────
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    if (!error.message.includes('session')) {
      emitAuthError('getCurrentUser', error.message);
    }
    return null;
  }
  return user;
}

// ── 取得用戶 Profile ──────────────────────────────────────────────────────────
export async function getUserProfile(userId) {
  if (!userId) {
    console.warn('[auth] getUserProfile: userId is required');
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.warn('[auth] No profile found for userId:', userId);
    } else {
      emitAuthError('getUserProfile', error.message);
    }
    return null;
  }
  return data;
}

// ── 取得完整用戶資訊 ──────────────────────────────────────────────────────────
export async function getAuthContext() {
  const user = await getCurrentUser();
  if (!user) return { user: null, profile: null, isAdmin: false };
  const profile = await getUserProfile(user.id);
  const isAdmin = profile?.is_platform_admin === true;
  return { user, profile, isAdmin };
}

// ── 發送 Magic Link ───────────────────────────────────────────────────────────
export async function sendMagicLink(email, redirectTo) {
  const trimmedEmail = String(email || '').trim();
  if (!isValidEmail(trimmedEmail)) {
    const message = '請輸入有效的電子郵件地址';
    emitAuthError('sendMagicLink', message);
    return { error: new Error(message) };
  }

  const defaultRedirect = `${getBaseUrl()}/index.html`;
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { emailRedirectTo: redirectTo || defaultRedirect },
  });

  if (error) emitAuthError('sendMagicLink', error.message);
  return { error };
}

// ── 登出 ──────────────────────────────────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) emitAuthError('signOut', error.message);
  await new Promise(r => setTimeout(r, 100));
  location.href = `${getBaseUrl()}/index.html`;
}

// ── Auth 狀態監聽 ─────────────────────────────────────────────────────────────
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ── 取得目前 Session ──────────────────────────────────────────────────────────
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    emitAuthError('getSession', error.message);
    return null;
  }
  return session;
}

// ── 等待 Session 就緒（修復競態條件）─────────────────────────────────────────
// ✅ 關鍵修復：先註冊監聽，再檢查現有 session
// 確保不會錯過 Supabase 在初始化時觸發的 INITIAL_SESSION 事件
export async function waitForSession(timeoutMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false;
    let subscription = null;

    const done = (session) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      // 用 setTimeout 確保 unsubscribe 在 resolve 之後執行
      setTimeout(() => subscription?.unsubscribe(), 0);
      resolve(session);
    };

    // ✅ Step 1: 先註冊監聽，捕獲所有後續事件（包含 INITIAL_SESSION）
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[auth] onAuthStateChange:', event, !!session);

        // INITIAL_SESSION: Supabase 初始化完成時觸發（有或沒有 session 都會觸發）
        // SIGNED_IN: Magic Link 回調、已有 session 重新整理
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          done(session);  // session 可能是 null（未登入）或 session 物件（已登入）
        }
      }
    );
    subscription = sub;

    // ✅ Step 2: 同步設定 timeout（不用 await，不會有競態）
    const timer = setTimeout(() => {
      console.warn('[auth] waitForSession: timed out after', timeoutMs, 'ms');
      done(null);
    }, timeoutMs);

    // ✅ Step 3: 非同步補撈（以防 INITIAL_SESSION 在我們監聽前就已觸發）
    // 這是最後的 fallback，正常情況下 Step 1 的監聽器會先 resolve
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!resolved) {
        console.log('[auth] waitForSession: fallback getSession:', !!session);
        done(session);
      }
    });
  });
}

// ── 頁面守衛：未登入則跳轉 ────────────────────────────────────────────────────
export async function requireAuth(redirectPath = '/index.html') {
  const session = await waitForSession(6000);
  if (!session) {
    location.href = `${getBaseUrl()}${redirectPath}`;
    return null;
  }
  return session;
}

// ── 頁面守衛：非 Admin 則跳轉 ────────────────────────────────────────────────
export async function requireAdmin(redirectPath = '/index.html') {
  const session = await requireAuth(redirectPath);
  if (!session) return null;

  const profile = await getUserProfile(session.user.id);
  if (!profile?.is_platform_admin) {
    console.warn('[auth] Access denied: not a platform admin');
    location.href = `${getBaseUrl()}${redirectPath}`;
    return null;
  }
  return { session, profile };
}
