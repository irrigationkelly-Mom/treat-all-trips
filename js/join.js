/**
 * js/join.js
 * Invite acceptance flow for Treat All Trips.
 *
 * Flow:
 *  1. Parse ?token= from URL
 *  2. Validate token against invite_links table
 *  3. If user is signed in  → attempt immediate join
 *  4. If user is signed out → show email input → send magic link
 *     • Magic link redirects back to join.html?token=... (PKCE flow)
 *     • On return (session present + token present) → complete join
 */

import { supabase, getCurrentUser, sendMagicLink, onAuthStateChange, waitForSession } from './auth.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function showState(id) {
  document.querySelectorAll('.state-panel').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function setStatus(msg, type = 'error') {
  const el = document.getElementById('join-status');
  if (!el) return;
  el.innerHTML = msg
    ? `<div class="status-msg ${type}">${msg}</div>`
    : '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch { return dateStr; }
}

function getInitial(nameOrEmail) {
  if (!nameOrEmail) return '?';
  return nameOrEmail.trim().charAt(0).toUpperCase();
}

// ─── Token from URL ──────────────────────────────────────────────────────────

function getToken() {
  return new URLSearchParams(window.location.search).get('token');
}

// ─── Validate Invite Link ─────────────────────────────────────────────────────

async function validateInvite(token) {
  const { data, error } = await supabase
    .from('invite_links')
    .select(`
      id,
      trip_id,
      expires_at,
      max_uses,
      use_count,
      is_active,
      trips (
        id,
        name,
        description,
        destination,
        start_date,
        end_date
      )
    `)
    .eq('token', token)
    .single();

  if (error || !data) {
    return { valid: false, reason: 'This invite link does not exist or has been removed.' };
  }

  if (!data.is_active) {
    return { valid: false, reason: 'This invite link has been deactivated by the trip organiser.' };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, reason: 'This invite link has expired. Please ask the organiser for a new one.' };
  }

  if (data.max_uses !== null && data.use_count >= data.max_uses) {
    return { valid: false, reason: 'This invite link has reached its maximum number of uses.' };
  }

  return { valid: true, invite: data };
}

// ─── Check Existing Membership ────────────────────────────────────────────────

async function checkMembership(tripId, userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && data !== null;
}

// ─── Join Trip ────────────────────────────────────────────────────────────────

async function joinTrip(inviteId, tripId, userId) {
  // 1. Insert member row (default permissions — organiser can adjust later)
  const { error: memberError } = await supabase
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: userId,
      // Default permission set — all standard features enabled
      can_view_itinerary: true,
      can_edit_itinerary: false,
      can_add_expense: true,
      can_view_expenses: true,
      can_manage_shopping: true,
      can_view_info: true,
      can_edit_memos: true,
      can_manage_packing: true,
      can_view_private_expenses: false,
    });

  if (memberError) {
    // Unique constraint → already a member race condition
    if (memberError.code === '23505') return { success: true, alreadyMember: true };
    return { success: false, error: memberError.message };
  }

  // 2. Increment use_count
  const { error: countError } = await supabase.rpc('increment_invite_use_count', {
    invite_id: inviteId,
  });

  // Non-fatal if RPC fails — member was already inserted
  if (countError) {
    console.warn('Could not increment invite use_count:', countError.message);
  }

  return { success: true };
}

// ─── Render Trip Preview ──────────────────────────────────────────────────────

function renderTripPreview(trip) {
  document.getElementById('preview-trip-name').textContent = trip.name || 'Unnamed Trip';

  const descEl = document.getElementById('preview-trip-desc');
  descEl.textContent = trip.description || '';

  const datesEl = document.getElementById('preview-trip-dates');
  if (trip.start_date || trip.end_date) {
    datesEl.innerHTML = `📅 ${formatDate(trip.start_date)}${trip.end_date ? ' → ' + formatDate(trip.end_date) : ''}`;
  }

  const destEl = document.getElementById('preview-trip-dest');
  if (trip.destination) {
    destEl.innerHTML = `📍 ${trip.destination}`;
  }
}

// ─── Render Auth Area (signed in) ────────────────────────────────────────────

function renderSignedInArea(user, profile) {
  const name = profile?.display_name || user.email;
  const email = user.email;
  const initial = getInitial(name);

  const area = document.getElementById('join-auth-area');
  area.innerHTML = `
    <div class="user-badge">
      <div class="avatar">${initial}</div>
      <div class="user-info">
        <div class="name">${name}</div>
        <div class="email">${email}</div>
      </div>
    </div>
    <button class="btn-primary" id="btn-join-now">Join This Trip</button>
    <div class="divider">or</div>
    <button class="btn-secondary" id="btn-join-different">Join with different account</button>
  `;
}

// ─── Render Auth Area (signed out) ───────────────────────────────────────────

function renderSignedOutArea() {
  const area = document.getElementById('join-auth-area');
  area.innerHTML = `
    <div class="auth-section">
      <label for="join-email">Enter your email to join</label>
      <input
        type="email"
        id="join-email"
        placeholder="you@example.com"
        autocomplete="email"
        autofocus
      />
    </div>
    <button class="btn-primary" id="btn-send-magic">Send Magic Link</button>
  `;
}

// ─── Start redirect countdown ─────────────────────────────────────────────────

function startRedirectCountdown(tripId, seconds = 4) {
  const btn = document.getElementById('btn-go-trip-success');
  const note = document.getElementById('redirect-countdown');

  const href = `trip.html?id=${tripId}`;
  if (btn) btn.onclick = () => { window.location.href = href; };

  let remaining = seconds;
  note.textContent = `Redirecting in ${remaining}s…`;

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      window.location.href = href;
    } else {
      note.textContent = `Redirecting in ${remaining}s…`;
    }
  }, 1000);
}

// ─── Handle Immediate Join (user already signed in) ───────────────────────────

async function handleImmediateJoin(invite, user) {
  const { id: inviteId, trip_id: tripId, trips: trip } = invite;
  const btn = document.getElementById('btn-join-now');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Joining…';
    setStatus('');

    const alreadyMember = await checkMembership(tripId, user.id);
    if (alreadyMember) {
      showAlreadyMember(trip, tripId);
      return;
    }

    const result = await joinTrip(inviteId, tripId, user.id);

    if (!result.success) {
      btn.disabled = false;
      btn.textContent = 'Join This Trip';
      setStatus(result.error || 'Failed to join. Please try again.', 'error');
      return;
    }

    if (result.alreadyMember) {
      showAlreadyMember(trip, tripId);
      return;
    }

    // Success!
    document.getElementById('success-msg').textContent =
      `You've successfully joined "${trip.name}". Welcome aboard! 🎉`;
    showState('state-success');
    startRedirectCountdown(tripId);
  });

  // "Join with different account" → sign out → show email form
  const btnDiff = document.getElementById('btn-join-different');
  if (btnDiff) {
    btnDiff.addEventListener('click', async () => {
      await supabase.auth.signOut();
      renderSignedOutArea();
      attachMagicLinkHandler(invite);
    });
  }
}

// ─── Show Already Member state ────────────────────────────────────────────────

function showAlreadyMember(trip, tripId) {
  document.getElementById('already-member-msg').textContent =
    `You're already a member of "${trip.name}".`;
  const btn = document.getElementById('btn-go-trip-already');
  if (btn) btn.onclick = () => { window.location.href = `trip.html?id=${tripId}`; };
  showState('state-already-member');
}

// ─── Attach Magic Link Handler (user signed out) ──────────────────────────────

function attachMagicLinkHandler(invite) {
  const btn = document.getElementById('btn-send-magic');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const emailInput = document.getElementById('join-email');
    const email = emailInput?.value?.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    setStatus('');

    // Build redirect URL that includes the token so we can complete join on return
    const currentUrl = window.location.href.split('?')[0];
    const redirectTo = `${currentUrl}?token=${getToken()}`;

    const { error } = await sendMagicLink(email, redirectTo);

    if (error) {
      btn.disabled = false;
      btn.textContent = 'Send Magic Link';
      setStatus(error.message || 'Failed to send magic link. Please try again.', 'error');
      return;
    }

    document.getElementById('magic-sent-msg').textContent =
      `We sent a magic link to ${email}. Click it to join "${invite.trips.name}".`;
    showState('state-magic-sent');
  });
}

// ─── Complete Join After Magic Link Return ────────────────────────────────────

async function completeJoinAfterAuth(invite, user) {
  document.getElementById('loading-msg').textContent = 'Completing your membership…';
  showState('state-loading');

  const { id: inviteId, trip_id: tripId, trips: trip } = invite;

  const alreadyMember = await checkMembership(tripId, user.id);
  if (alreadyMember) {
    showAlreadyMember(trip, tripId);
    return;
  }

  const result = await joinTrip(inviteId, tripId, user.id);

  if (!result.success) {
    document.getElementById('error-title').textContent = 'Could Not Join';
    document.getElementById('error-body').textContent =
      result.error || 'Something went wrong. Please try the invite link again.';
    showState('state-error');
    return;
  }

  document.getElementById('success-msg').textContent =
    `You've successfully joined "${trip.name}". Welcome aboard! 🎉`;
  showState('state-success');
  startRedirectCountdown(tripId);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  const token = getToken();

  if (!token) {
    document.getElementById('error-title').textContent = 'No Invite Token';
    document.getElementById('error-body').textContent =
      'This URL is missing an invite token. Please use the full link from your invitation.';
    showState('state-error');
    return;
  }

  // 1. Validate token
  document.getElementById('loading-msg').textContent = 'Validating invite link…';
  const { valid, reason, invite } = await validateInvite(token);

  if (!valid) {
    document.getElementById('error-title').textContent = 'Invite Unavailable';
    document.getElementById('error-body').textContent = reason;
    showState('state-error');
    return;
  }

  // 2. Render trip preview (keep visible across join state)
  renderTripPreview(invite.trips);

  // 3. Check if returning from magic link (session just created)
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    const user = session.user;

    // Fetch profile for display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    // Detect if this is a fresh auth callback (hash contains access_token)
    // Supabase PKCE: after magic link, URL will have been processed automatically
    const isAuthCallback = window.location.hash.includes('access_token') ||
                           document.referrer.includes('supabase');

    if (isAuthCallback || sessionStorage.getItem('join_completing_auth') === token) {
      sessionStorage.removeItem('join_completing_auth');
      await completeJoinAfterAuth(invite, user);
      return;
    }

    // Regular visit while already signed in
    showState('state-join');
    renderSignedInArea(user, profile);
    handleImmediateJoin(invite, user);

  } else {
    // Not signed in
    showState('state-join');
    renderSignedOutArea();
    attachMagicLinkHandler(invite);

    // Mark session so on magic-link return we auto-complete
    sessionStorage.setItem('join_completing_auth', token);

    // Listen for auth state change (PKCE callback fires onAuthStateChange)
    onAuthStateChange(async (event, newSession) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && newSession?.user) {
        sessionStorage.removeItem('join_completing_auth');
        await completeJoinAfterAuth(invite, newSession.user);
      }
    });
  }
}

init();
