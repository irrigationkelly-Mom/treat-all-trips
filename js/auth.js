console.log('[auth.js] 模組開始載入')
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGci••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
const ADMIN_UUID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export async function sendMagicLinkViaREST(email, redirectTo) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {method: 'POST', headers: {'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY}, body: JSON.stringify({email: email, data: {}})})
    if (!response.ok) {const error = await response.json(); return { error: error.message || '發送失敗' }}
    return { success: true }
  } catch (err) {console.error('[auth] REST API error:', err); return { error: err.message }}
}
export function getBaseUrl() {const origin = window.location.origin; const pathname = window.location.pathname; const base = pathname.split('/').slice(0, 2).join('/'); return origin + base}
export function joinPath(...parts) {return parts.map(p => p.replace(/^\/|\/$/g, '')).join('/')}
export function getMagicLinkRedirect() {return getBaseUrl() + '/auth/callback.html'}
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
export async function getUserProfile(userId) {const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single(); if (error) {console.warn('[auth] getUserProfile 失敗:', error.message); return null} return data}
export function isAdmin(userId) {return userId === ADMIN_UUID}
export function waitForSession() {return new Promise((resolve) => {let settled = false; let unsub; const settle = (session) => {if (settled) return; settled = true; clearTimeout(timer); if (unsub) unsub(); console.log('[auth] session 確定:', session ? session.user.email : 'null'); resolve(session)}; const timer = setTimeout(async () => {console.warn('[auth] timeout，嘗試 getSession fallback'); const { data } = await supabase.auth.getSession(); settle(data?.session ?? null)}, 8000); const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {console.log('[auth] onAuthStateChange:', event); if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {settle(session)} else if (event === 'SIGNED_OUT') {settle(null)}}); unsub = () => subscription.unsubscribe()})}
export async function requireAuth() {const { data } = await supabase.auth.getSession(); if (!data?.session) {window.location.href = getBaseUrl() + '/index.html'; return null} return data.session}
export async function requireAdmin() {const session = await requireAuth(); if (!session) return null; if (!isAdmin(session.user.id)) {window.location.href = getBaseUrl() + '/index.html'; return null} return session}
export async function getCurrentUser() {const { data } = await supabase.auth.getUser(); return data?.user ?? null}
export async function sendMagicLink(email, redirectTo) {const { error } = await supabase.auth.signInWithOtp({email, options: { emailRedirectTo: redirectTo }}); return { error }}
export function onAuthStateChange(callback) {const { data: { subscription } } = supabase.auth.onAuthStateChange(callback); return subscription}
