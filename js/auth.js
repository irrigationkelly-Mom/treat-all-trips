// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Supabase 設定 ─────────────────────────────────
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTAyMTMsImV4cCI6MjA2NTQ2NjIxM30.ORNnMRMBMkPgGLvDEFYiCCHCjpDYCiZiB0ADaWSOXkaBc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 輔助：取得正確的 Base URL ─────────────────────
function getBaseUrl() {
  const origin = location.origin;
  const pathParts = location.pathname.split('/').filter(Boolean);

  if (origin.includes('github.io') && pathParts.length >= 1) {
    return `${origin}/${pathParts[0]}`;
  }

  return origin;
}

// ── 取得目前登入用戶 ──────────────────────────────
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.warn('[auth] getUser error:', error.message);
    return null;
  }
  return user;
}

// ── 取得用戶 Profile（含 is_platform_admin）────────
export async function getUserProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[auth] getUserProfile error:', error.message);
    return null;
  }
  return data;
}

// ── 發送 Magic Link ───────────────────────────────
export async function sendMagicLink(email, redirectTo) {
  const defaultRedirect = `${getBaseUrl()}/index.html`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo || defaultRedirect,
    },
  });

  if (error) {
    console.error('[auth] sendMagicLink error:', error.message);
  }

  return { error };
}

// ── 登出 ──────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.warn('[auth] signOut error:', error.message);
  }
  location.href = `${getBaseUrl()}/index.html`;
}

// ── Auth 狀態監聽（供各頁面使用）─────────────────
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// ── 取得目前 Session（比 getUser 更快，適合初始化）─
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[auth] getSession error:', error.message);
    return null;
  }
  return session;
}

// ── 等待 Session 就緒（適合頁面初始化 + Magic Link 回調）──
export async function waitForSession(timeoutMs = 5000) {
  return new Promise((resolve) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // 已有 session，直接回傳
      if (session) {
        resolve(session);
        return;
      }

      // 無 session → 監聽狀態變化（例如 Magic Link 剛完成驗證）
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        resolve(null); // 超時回傳 null
      }, timeoutMs);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (session) {
            clearTimeout(timer);
            subscription.unsubscribe();
            resolve(session);
          }
        }
      );
    });
  });
}
