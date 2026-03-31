// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase 設定 ──────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTAyMTMsImV4cCI6MjA2NTQ2NjIxM30.ORNnMRMBMkPgGLvDEFYiCCHCjpDYCiZiB0ADaWSOXkaBc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
});

// ── 內部工具函式 ───────────────────────────────────────────────────────────────

/** 統一錯誤事件發送 */
function emitAuthError(context, message) {
  console.error(`[auth:${context}]`, message);
  window.dispatchEvent(
    new CustomEvent('auth:error', { detail: { context, message } })
  );
}

/** Email 格式驗證 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 安全拼接路徑（避免雙斜線）*/
function joinPath(base, path) {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

// ── 取得正確的 Base URL ────────────────────────────────────────────────────────
export function getBaseUrl() {
  const { origin, pathname } = location;

  // GitHub Pages: origin/repoName
  if (origin.includes('github.io')) {
    const parts = pathname.split('/').filter(Boolean);
    const repoName = parts[0] ?? '';
    return repoName ? `${origin}/${repoName}` : origin;
  }

  // Local dev: just origin
  return origin;
}

// ── 取得 Magic Link 的重定向 URL ──────────────────────────────────────────────
export function getMagicLinkRedirect() {
  return joinPath(getBaseUrl(), 'index.html');
}

// ── 發送 Magic Link ───────────────────────────────────────────────────────────
export async function sendMagicLink(email, redirectTo) {
  const trimmedEmail = String(email || '').trim();

  if (!isValidEmail(trimmedEmail)) {
    const message = '請輸入有效的電子郵件地址';
    emitAuthError('sendMagicLink', message);
    return { error: new Error(message) };
  }

  const finalRedirect = redirectTo || getMagicLinkRedirect();
  console.log('[auth] sendMagicLink → redirectTo:', finalRedirect);

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options: { emailRedirectTo: finalRedirect },
  });

  if (error) {
    emitAuthError('sendMagicLink', error.message);
    console.error('[auth] OTP error detail:', error);
  }

  return { error };
}

// ── 取得使用者 Profile ────────────────────────────────────────────────────────
export async function getUserProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // PGRST116 = 查無資料（非真正的錯誤）
    if (error.code !== 'PGRST116') {
      emitAuthError('getUserProfile', error.message);
    }
    return null;
  }

  return data;
}

// ── 登出 ──────────────────────────────────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) emitAuthError('signOut', error.message);
  await new Promise(r => setTimeout(r, 100));
  location.href = joinPath(getBaseUrl(), 'index.html');
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
export async function waitForSession(timeoutMs = 8000) {
  return new Promise((resolve) => {
    let resolved = false;
    let subscription = null;

    const done = (session) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      setTimeout(() => subscription?.unsubscribe(), 0);
      resolve(session);
    };

    // Step 1：先監聽，捕獲 INITIAL_SESSION 與 SIGNED_IN
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[auth] onAuthStateChange:', event, !!session);
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          done(session);
        }
      }
    );
    subscription = sub;

    // Step 2：設定 timeout
    const timer = setTimeout(() => {
      console.warn('[auth] waitForSession: timed out after', timeoutMs, 'ms');
      done(null);
    }, timeoutMs);

    // Step 3：fallback（防止事件已觸發過）
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
    location.href = joinPath(getBaseUrl(), redirectPath);
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
    location.href = joinPath(getBaseUrl(), redirectPath);
    return null;
  }

  return { session, profile };
}
