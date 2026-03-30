// js/supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co// ← 替換這裡
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcwNjYsImV4cCI6MjA5MDI3MzA2Nn0.Jmb_MAvaZpCy1jCwgTPlD0Slpb3i55UJQ823wOXkaBc// ← 替換這裡

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// 取得目前登入的使用者
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 取得使用者的 profile（含 is_platform_admin）
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
}

// 取得使用者在某個 trip 的權限
export async function getTripMember(tripId, userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single()
  
  if (error) return null
  return data
}

// 全域錯誤處理
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // 清除本地快取
    localStorage.removeItem('currentTripId')
  }
})

