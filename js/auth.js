console.log('[auth.js] 模組開始載入')
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGci••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
const ADMIN_UUID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export async function sendMagicLinkViaREST(email, redirectTo) {
export async function sendMagicLinkViaREST(email, redirectTo) {
  try {
    const response = await fetch(SUPABASE_URL + '/auth/v1/otp', {method: 'POST', body: JSON.stringify({email: email})})
    if (!response.ok) {return { error: '發送失敗' }}
    return { success: true }
  } catch (err) {return { error: err.message }}
}
export async function requireAdmin() {const session = await requireAuth(); if (!session) return null; if (!isAdmin(session.user.id)) {window.location.href = getBaseUrl() + '/index.html'; return null} return session}
export async function getCurrentUser() {const { data } = await supabase.auth.getUser(); return data?.user ?? null}
export async function sendMagicLink(email, redirectTo) {const { error } = await supabase.auth.signInWithOtp({email, options: { emailRedirectTo: redirectTo }}); return { error }}
export function onAuthStateChange(callback) {const { data: { subscription } } = supabase.auth.onAuthStateChange(callback); return subscription}
