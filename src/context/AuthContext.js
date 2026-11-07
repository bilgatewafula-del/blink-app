// src/context/AuthContext.js
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { markActive, isIdleTooLong, setAuthNotice, rememberAccount } from '../lib/authSecurity';

const AuthContext = createContext(null);

let _profileCache = null;

const PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country,
  is_verified, verified_at, role, is_banned, is_restricted,
  suspended_until, followers_count, posts_count,
  subscription_plan, subscription_expires_at,
  coins_balance, is_business,
  posts_today, posts_today_date,
  username_changed_at, display_name_changed_at
`;

export function AuthProvider({ children }) {
  const [user,           setUser]           = useState(null);
  const [profile,        setProfile]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [profileChecked, setProfileChecked] = useState(false); // true once we KNOW whether a profile exists
  const [recovery,       setRecovery]       = useState(false); // password-reset session in progress
  const fetchingRef = useRef(false);
  const mountedRef  = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* Ends the session on THIS device and leaves a one-time message for the
     sign-in screen (inactivity, suspension...). */
  const forceSignOut = useCallback(async (kind, extra) => {
    setAuthNotice(kind, extra);
    _profileCache = null;
    if (mountedRef.current) { setProfile(null); setUser(null); setProfileChecked(false); setLoading(false); }
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
  }, []);

  const fetchProfile = useCallback(async (uid, authUser) => {
    if (!uid) {
      if (mountedRef.current) { setProfile(null); _profileCache = null; setProfileChecked(false); setLoading(false); }
      return;
    }
    if (_profileCache?.id === uid) {
      if (mountedRef.current) { setProfile(_profileCache); setProfileChecked(true); setLoading(false); }
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const { data, error } = await supabase.from('users').select(PROFILE_FIELDS).eq('id', uid).maybeSingle();

      if (error) {
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          console.warn('[Auth] Invalid session token — signing out');
          await forceSignOut('expired');
          return;
        }
        throw error;
      }

      if (!mountedRef.current) return;

      if (!data) {
        // signed in, but no profile yet (e.g. phone sign-up) -> "complete your profile"
        _profileCache = null;
        setProfile(null);
        setProfileChecked(true);
        return;
      }

      // Server-side bans/suspensions also block new tokens; this is the instant client-side stop.
      if (data.is_banned) { await forceSignOut('banned'); return; }
      if (data.suspended_until && new Date(data.suspended_until) > new Date()) {
        await forceSignOut('suspended', data.suspended_until);
        return;
      }

      _profileCache = data;
      setProfile(data);
      setProfileChecked(true);

      // "Welcome back, <name>" card on the sign-in screen (never stores a password)
      const identifier = authUser?.email || authUser?.phone || '';
      if (identifier) rememberAccount({ id: data.id, identifier: authUser?.phone && !authUser?.email ? '+' + String(identifier).replace(/^\+/, '') : identifier, display_name: data.display_name, avatar_url: data.avatar_url });
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err.message);
      // Do not block the app on a profile fetch error
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [forceSignOut]);

  useEffect(() => {
    const hardTimeout = setTimeout(() => {
      if (mountedRef.current) {
        console.warn('[Auth] Hard timeout reached — forcing loading=false');
        setLoading(false);
      }
    }, 6000);

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('[Auth] getSession error:', error.message);
          clearTimeout(hardTimeout);
          if (mountedRef.current) setLoading(false);
          return;
        }
        const u = session?.user ?? null;

        // Away too long: sign in again with credentials (like Facebook)
        if (u && isIdleTooLong()) {
          clearTimeout(hardTimeout);
          forceSignOut('inactive');
          return;
        }

        if (mountedRef.current) setUser(u);
        if (u) {
          markActive();
          fetchProfile(u.id, u).then(() => clearTimeout(hardTimeout));
        } else {
          clearTimeout(hardTimeout);
          if (mountedRef.current) setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[Auth] getSession threw:', err.message);
        clearTimeout(hardTimeout);
        if (mountedRef.current) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;
      const u = session?.user ?? null;
      setUser(u);

      if (event === 'PASSWORD_RECOVERY') setRecovery(true);

      if (event === 'SIGNED_OUT' || !u) {
        _profileCache = null;
        setProfile(null); setProfileChecked(false); setRecovery(false); setLoading(false);
        clearTimeout(hardTimeout);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') markActive();
      if (event === 'TOKEN_REFRESHED') _profileCache = null;

      // IMPORTANT: never `await` a Supabase call inside this callback — it
      // holds supabase-js's auth lock and the call would deadlock on app
      // reopen. Defer so the callback returns first.
      setTimeout(() => {
        fetchProfile(u.id, u).finally(() => clearTimeout(hardTimeout));
      }, 0);
    });

    return () => { subscription.unsubscribe(); clearTimeout(hardTimeout); };
  }, [fetchProfile, forceSignOut]);

  /* ── keep the session alive while the app is used; end it after long idleness ── */
  useEffect(() => {
    if (!user?.id) return undefined;
    markActive();
    let last = Date.now();
    const bump = () => { const n = Date.now(); if (n - last > 30000) { last = n; markActive(); } };

    const keepFresh = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const s = data?.session;
        if (s?.expires_at && s.expires_at * 1000 - Date.now() < 90000) await supabase.auth.refreshSession();
      } catch { /* offline: try again next time */ }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (isIdleTooLong()) { forceSignOut('inactive'); return; }
      markActive();
      keepFresh();
    };

    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') markActive(); }, 5 * 60 * 1000);
    return () => {
      ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(iv);
    };
  }, [user?.id, forceSignOut]);

  // If the very first auth check hung (tab throttled), retry when the tab returns.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (loading && !user) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          const u = session?.user ?? null;
          if (mountedRef.current) setUser(u);
          if (u) fetchProfile(u.id, u);
          else if (mountedRef.current) setLoading(false);
        }).catch(() => { if (mountedRef.current) setLoading(false); });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loading, user, fetchProfile]);

  const refreshProfile = useCallback(() => {
    if (user?.id) { _profileCache = null; return fetchProfile(user.id, user); }
    return Promise.resolve();
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    _profileCache = null;
    if (mountedRef.current) { setProfile(null); setUser(null); setProfileChecked(false); setRecovery(false); }
    await supabase.auth.signOut();
  }, []);

  const startRecovery = useCallback(() => setRecovery(true), []);
  const clearRecovery = useCallback(() => setRecovery(false), []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileChecked, recovery, startRecovery, clearRecovery, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
