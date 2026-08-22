// src/utils/securityUtils.js
// Frontend security hardening — companion to P0/P1 SQL fixes
// Import and use these across the app

import { supabase } from '../lib/supabaseClient';

/* ── F3: Server-side admin check ───────────────────────────────
   Never trust client-side role checks alone.
   Always verify against DB before showing admin UI or running
   admin actions. Call this at the top of every admin component.
─────────────────────────────────────────────────────────────── */
export async function verifyAdminServer() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error || !data) {
    console.warn('[Security] Admin check failed:', error?.message);
    return false;
  }
  return data === true;
}

/* ── F7: Block privileged field updates from frontend ──────────
   Never send these fields in any .update() call from client.
   The DB trigger will block them anyway, but defence in depth.
─────────────────────────────────────────────────────────────── */
const PRIVILEGED_FIELDS = [
  'role', 'is_verified', 'verified_at', 'is_business',
  'coins_balance', 'followers_count', 'posts_count',
  'subscription_plan', 'subscription_expires_at',
  'service_active', 'service_activated_at',
];

export function sanitiseUserUpdate(updates) {
  const safe = { ...updates };
  for (const field of PRIVILEGED_FIELDS) {
    if (field in safe) {
      console.warn(`[Security] Blocked privileged field in update: ${field}`);
      delete safe[field];
    }
  }
  return safe;
}

/* ── F15: Re-authentication before password change ─────────────
   Force user to confirm current password before changing it.
   Use inside SettingsPage ChangePasswordModal.
─────────────────────────────────────────────────────────────── */
export async function reAuthAndChangePassword(currentPassword, newPassword) {
  // Step 1: Re-authenticate with current password
  const { data: userData } = await supabase.auth.getUser();
  const email = userData?.user?.email;

  if (!email) throw new Error('Could not get current user email.');

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (signInErr) {
    throw new Error('Current password is incorrect. Please try again.');
  }

  // Step 2: Now change to new password
  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateErr) throw new Error(updateErr.message);
  return true;
}

/* ── F11: Generic error messages for auth failures ─────────────
   Never reveal whether email exists. Return the same message
   for both "email not found" and "wrong password".
─────────────────────────────────────────────────────────────── */
export function sanitiseAuthError(error) {
  if (!error) return null;
  const msg = error.message?.toLowerCase() || '';

  // These would reveal that the email exists
  if (
    msg.includes('invalid login') ||
    msg.includes('email not confirmed') ||
    msg.includes('user not found') ||
    msg.includes('invalid credentials') ||
    msg.includes('wrong password')
  ) {
    return 'Invalid email or password.'; // Generic — does not leak existence
  }

  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }

  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  return 'Something went wrong. Please try again.';
}

/* ── Input sanitisation — XSS prevention ───────────────────────
   Strip HTML tags from any user-supplied text before storing.
   Supabase parameterises queries so SQL injection is not the
   risk — XSS via stored content is.
─────────────────────────────────────────────────────────────── */
export function sanitiseText(input, maxLen = 500) {
  if (!input) return '';
  return String(input)
    .replace(/<[^>]*>/g, '')         // strip HTML tags
    .replace(/javascript:/gi, '')    // strip JS protocol
    .replace(/on\w+\s*=/gi, '')      // strip inline event handlers
    .trim()
    .slice(0, maxLen);
}

/* ── Content Security Policy headers (add to vercel.json) ──────
   CSP prevents XSS even if malicious content gets stored.
   The vercel.json already has the headers — this is a reminder
   of the exact values needed.

   "Content-Security-Policy": 
     "default-src 'self';
      script-src 'self' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https://res.cloudinary.com https://*.supabase.co;
      connect-src 'self' https://*.supabase.co wss://*.supabase.co;
      font-src 'self' data:;"
─────────────────────────────────────────────────────────────── */

/* ── Rate-limit guard for client-side actions ──────────────────
   Prevents rapid-fire button clicking on sensitive actions
   (report, block, payment submit) before the DB trigger fires.
─────────────────────────────────────────────────────────────── */
const actionTimestamps = {};

export function rateLimitAction(actionKey, limitMs = 3000) {
  const now = Date.now();
  const last = actionTimestamps[actionKey] || 0;
  if (now - last < limitMs) {
    throw new Error('Too fast. Please wait a moment before trying again.');
  }
  actionTimestamps[actionKey] = now;
  return true;
}