import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4MDY0MzksImV4cCI6MjA2NTM4MjQzOX0.b3stDzDuMBnGBDdsUlCqVBu7xMHDK-RbABFEOlMF5Jw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 取得目前登入用戶 ──────────────────────────────
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── 取得用戶 Profile（含 is_platform_admin）────────
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// ── 發送 Magic Link ───────────────────────────────
export async function sendMagicLink(email, redirectTo) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo || `${location.origin}/index.html`,
    },
  });
  return { error };
}

// ── 登出 ──────────────────────────────────────────
export async function signOut() {
  await supabase.auth.signOut();
  location.href = 'index.html';
}

// ── Auth 狀態監聽（供各頁面使用）─────────────────
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
