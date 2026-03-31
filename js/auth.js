// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================
// Configuration
// ============================================================
const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NDI4NTYsImV4cCI6MjA2NTExODg1Nn0.3aaX7lKFGMNnk5RiqbPuisTFwDrdOCZ5AJcHQGaG5nc'
const PLATFORM_ADMIN_ID = 'e8f65f02-5726-4b52-baca-ba0359efd1eb'

// ============================================================
// Supabase Client
// ============================================================
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================================
// Path Utilities (GitHub Pages subdirectory compatibility)
// ============================================================

/**
 * Joins path segments, preventing double slashes
 * @param {...string} parts
 * @returns {string}
 */
export function joinPath(...parts) {
  return parts
    .map((part, i) => {
      if (i === 0) return part.replace(/\/+$/, '')
      return part.replace(/^\/+/, '').replace(/\/+$/, '')
    })
    .filter(Boolean)
    .join('/')
}

/**
 * Returns the base URL for this deployment
 * e.g. https://irrigationkelly-mom.github.io/treat-all-trips
 */
export function getBaseUrl() {
  const { protocol, host, pathname } = window.location
  // pathname could be /treat-all-trips/some/page.html
  // We want just /treat-all-trips
  const segments = pathname.split('/').filter(Boolean)
  const repoSegment = segments.length > 0 ? `/${segments[0]}` : ''
  return `${protocol}//${host}${repoSegment}`
}

/**
 * Builds the redirect URL for magic link emails
 * Points to /auth/callback so Supabase can process the token
 */
export function getMagicLinkRedirect() {
  return joinPath(getBaseUrl(), 'auth/callback.html')
}

// ============================================================
// Validation Utilities
// ============================================================

/**
 * Validates an email address format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim()
  // Standard email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

// ============================================================
// Session Management
// ============================================================

/**
 * Waits for Supabase session with 8s timeout
 * Prioritises onAuthStateChange events, falls back to getSession()
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export function waitForSession() {
  return new Promise((resolve) => {
    let resolved = false
    let subscription = null

    const done = (session) => {
      if (resolved) return
      resolved = true
      if (subscription) {
        subscription.unsubscribe()
      }
      resolve(session)
    }

    // Timeout fallback after 8 seconds
    const timeout = setTimeout(async () => {
      if (resolved) return
      console.warn('[auth] waitForSession timeout — falling back to getSession()')
      try {
        const { data } = await supabase.auth.getSession()
        done(data?.session ?? null)
      } catch {
        done(null)
      }
    }, 8000)

    // Primary: listen for auth state change
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        clearTimeout(timeout)
        done(session)
      } else if (event === 'SIGNED_OUT') {
        clearTimeout(timeout)
        done(null)
      }
    })

    subscription = data?.subscription

    // Immediate fallback: getSession() in case event already fired
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!resolved && sessionData?.session) {
        clearTimeout(timeout)
        done(sessionData.session)
      }
    })
  })
}

// ============================================================
// Profile Utilities
// ============================================================

/**
 * Fetches the profile row for the given user ID
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[auth] getUserProfile error:', error.message)
      return null
    }
    return data
  } catch (err) {
    console.error('[auth] getUserProfile exception:', err)
    return null
  }
}

// ============================================================
// Route Guards
// ============================================================

/**
 * Ensures a valid session exists, otherwise redirects to home
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireAuth() {
  const session = await waitForSession()
  if (!session) {
    window.location.href = joinPath(getBaseUrl(), 'index.html')
    // Return a never-resolving promise to halt further execution
    return new Promise(() => {})
  }
  return session
}

/**
 * Ensures the current user is the platform admin
 * Redirects to home if not authenticated or not admin
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.id !== PLATFORM_ADMIN_ID) {
    console.warn('[auth] requireAdmin: access denied for', session.user.id)
    window.location.href = joinPath(getBaseUrl(), 'index.html')
    return new Promise(() => {})
  }
  return session
}

/**
 * Signs the current user out and redirects to home
 */
export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = joinPath(getBaseUrl(), 'index.html')
}
