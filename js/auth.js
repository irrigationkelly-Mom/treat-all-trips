// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase 設定 ─────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTAyMTMsImV4cCI6MjA2NTQ2NjIxM30.ORNnMRMBMkPgGLvDEFYiCCHCjpDYCiZiB0ADaWSOXkaBc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage across page reloads
    persistSession: true,
    // Auto-refresh token before expiry
    autoRefreshToken: true,
    // Detect session from URL hash/query (handles Magic Link callback)
    detectSessionInUrl: true,
  },
});

// ── 內部：統一錯誤事件發送 ────────────────────────────────────────────────────
// UI layers can listen: window.addEventListener('auth:error', e => ...)
function emitAuthError(context, message) {
  console.error(`[auth:${context}]`, message);
  window.dispatchEvent(
    new CustomEvent('auth:error', { detail: { context, message } })
  );
}

// ── 輔助：取得正確的 Base URL ─────────────────────────────────────────────────
export function getBaseUrl() {
  const { origin, pathname } = location;

  // GitHub Pages: https://username.github.io/repo-name/...
  if (origin.includes('github.io')) {
    const repoName = pathname.split('/').filter(Boolean)[0];
    return repoName ? `${origin}/${repoName}` : origin;
  }

  // Local dev (localhost or 127.0.0.1) — no subdirectory
  return origin;
}

// ── Email 格式驗證 ────────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// ── 取得目前登入用戶 ──────────────────────────────────────────────────────────
// Uses getUser() which validates with Supabase server (more secure than getSession)
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    // 'Auth session missing' is expected when logged out — not a real error
    if (!error.message.includes('session')) {
      emitAuthError('getCurrentUser', error.message);
    }
    return null;
  }

  return user;
}

// ── 取得用戶 Profile（含 is_platform_admin）──────────────────────────────────
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
    // PGRST116 = no rows found — profile may not exist yet
    if (error.code === 'PGRST116') {
      console.warn('[auth] No profile found for userId:', userId);
    } else {
      emitAuthError('getUserProfile', error.message);
    }
    return null;
  }

  return data;
}

// ── 取得完整用戶資訊（user + profile 合併）────────────────────────────────────
// Convenience: returns { user, profile, isAdmin }
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
    options: {
      emailRedirectTo: redirectTo || defaultRedirect,
      // Do NOT create user if they don't exist yet
      // Remove this line if you want auto-registration:
      // shouldCreateUser: false,
    },
  });

  if (error) {
    emitAuthError('sendMagicLink', error.message);
  }

  return { error };
}

// ── 登出 ──────────────────────────────────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    emitAuthError('signOut', error.message);
    // Still redirect — local session is likely cleared even on error
  }

  // Small delay to let any cleanup finish
  await new Promise(r => setTimeout(r, 100));
  location.href = `${getBaseUrl()}/index.html`;
}

// ── Auth 狀態監聽（供各頁面使用）─────────────────────────────────────────────
// Returns unsubscribe function for cleanup
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

// ── 等待 Session 就緒 ─────────────────────────────────────────────────────────
// Handles both:
//   1. Already logged in (resolves immediately)
//   2. Magic Link callback in progress (waits for SIGNED_IN event)
export async function waitForSession(timeoutMs = 5000) {
  // First: check existing session (fast path)
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return existing;

  // Second: wait for auth state change (Magic Link / OAuth callback)
  return new Promise((resolve) => {
    let subscription = null; // declare before use to avoid closure issue

    const timer = setTimeout(() => {
      if (subscription) subscription.unsubscribe();
      console.warn('[auth] waitForSession: timed out after', timeoutMs, 'ms');
      resolve(null);
    }, timeoutMs);

    // Now assign — inside the same tick, no async gap
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve(session);
        }
      }
    );

    subscription = sub; // assign so timer callback can access it
  });
}

// ── 頁面守衛：未登入則跳轉 ────────────────────────────────────────────────────
// Usage: await requireAuth();  — add to top of any protected page
export async function requireAuth(redirectPath = '/index.html') {
  const session = await waitForSession(4000);

  if (!session) {
    location.href = `${getBaseUrl()}${redirectPath}`;
    return null;
  }

  return session;
}

// ── 頁面守衛：非 Admin 則跳轉 ────────────────────────────────────────────────
// Usage: await requireAdmin();
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
