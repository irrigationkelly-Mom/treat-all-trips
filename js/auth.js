// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── 取得 Magic Link Redirect URL ───────────────────────────
export function getMagicLinkRedirect() {
  const base = 'https://irrigationkelly-mom.github.io/treat-all-trips';
  return `${base}/index.html`;
}

// ─── 等待 Session 確認（初始載入用）────────────────────────
export function waitForSession() {
  return new Promise((resolve) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolve(session);
    });
  });
}

// ─── 監聽 Auth 狀態變化 ─────────────────────────────────────
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ─── 發送 Magic Link ────────────────────────────────────────
export async function sendMagicLink(email) {
  const redirectTo = getMagicLinkRedirect();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return { error };
}

// ─── 登出 ───────────────────────────────────────────────────
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

// ─── Email 格式驗證 ─────────────────────────────────────────
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
