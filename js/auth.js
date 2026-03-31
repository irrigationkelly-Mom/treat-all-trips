console.log('[auth.js] 模組開始載入')

// ============================
// 設定
// ============================
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcwNjYsImV4cCI6MjA5MDI3MzA2Nn0.Jmb_MAvaZpCy1jCwgTPlD0Slpb3i55UJQ823wOXkaBc' // ← 填入你的 anon key
const ADMIN_UUID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb'

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================
// URL 工具
// ============================
export function getBaseUrl() {
  const origin = window.location.origin
  const pathname = window.location.pathname
  const base = pathname.split('/').slice(0, 2).join('/')
  return origin + base
}

export function joinPath(...parts) {
  return parts.map(p => p.replace(/^\/|\/$/g, '')).join('/')
}

export function getMagicLinkRedirect() {
  return getBaseUrl() + '/auth/callback.html'
}

// ============================
// 驗證工具
// ============================
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// ============================
// 使用者資料
// ============================
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.warn('[auth] getUserProfile 失敗:', error.message)
    return null
  }
  return data
}

export function isAdmin(userId) {
  return userId === ADMIN_UUID
}

// ============================
// Session 等待
// ============================
export function waitForSession() {
  return new Promise((resolve) => {
    let settled = false

    const settle = (session) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsub?.()
      console.log('[auth] session 確定:', session ? session.user.email : 'null')
      resolve(session)
    }

    // timeout 保底
    const timer = setTimeout(async () => {
      console.warn('[auth] timeout，嘗試 getSession fallback')
      const { data } = await supabase.auth.getSession()
      settle(data?.session ?? null)
    }, 8000)

    // 監聽 auth 狀態
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] onAuthStateChange:', event)
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        settle(session)
      } else if (event === 'SIGNED_OUT') {
        settle(null)
      }
    })

    const unsub = () => subscription.unsubscribe()
  })
}

// ============================
// Route Guards
// ============================
export async function requireAuth() {
  const { data } = await supabase.auth.getSession()
  if (!data?.session) {
    window.location.href = getBaseUrl() + '/index.html'
    return null
  }
  return data.session
}

export async function requireAdmin() {
  const session = await requireAuth()
  if (!session) return null
  if (!isAdmin(session.user.id)) {
    window.location.href = getBaseUrl() + '/index.html'
    return null
  }
  return session
}
