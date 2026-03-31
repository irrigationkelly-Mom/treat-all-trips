// js/auth.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bgmcqkrxifxxcevbvzwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnbWNxa3J4aWZ4eGNldmJ2endmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1NDI4NTYsImV4cCI6MjA2NTExODg1Nn0.3aaX7lKFGMNnk5RiqbPuisTFwDrdOCZ5AJcHQGaG5nc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function getMagicLinkRedirect() {
  const base = 'https://irrigationkelly-mom.github.io/treat-all-trips';
  return `${base}/index.html`;
}

export function waitForSession() {
  return new Promise((resolve) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolve(session);
    });
  });
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

export async function sendMagicLink(email) {
  const redirectTo = getMagicLinkRedirect();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return { error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
