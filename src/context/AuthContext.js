// src/context/AuthContext.js
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

let _profileCache = null;

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef  = useRef(false);
  const mountedRef   = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchProfile = useCallback(async (uid) => {
    if (!uid) {
      if (mountedRef.current) { setProfile(null); _profileCache = null; setLoading(false); }
      return;
    }
    // Return cached immediately
    if (_profileCache?.id === uid) {
      if (mountedRef.current) { setProfile(_profileCache); setLoading(false); }
      return;
    }
    // Prevent duplicate concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;


    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id, username, display_name, avatar_url, bio, country,
          is_verified, verified_at, role, is_banned, is_restricted,
          suspended_until, followers_count, posts_count,
          subscription_plan, subscription_expires_at,
          coins_balance, is_business,
          posts_today, posts_today_date,
          username_changed_at, display_name_changed_at
        `)
        .eq('id', uid)
        .maybeSingle();


      if (error) {
        // Cause #4: expired/invalid JWT — sign out cleanly instead of hanging
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          console.warn('[Auth] Invalid session token — signing out');
          await supabase.auth.signOut();
          if (mountedRef.current) { setUser(null); setProfile(null); _profileCache = null; }
          return;
        }
        throw error;
      }

      if (data && mountedRef.current) {
        _profileCache = data;
        setProfile(data);
      }
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err.message);
      // Don't block loading on a profile fetch error — show app anyway
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {

    // Hard 6s timeout — loading MUST resolve regardless of network
    const hardTimeout = setTimeout(() => {
      if (mountedRef.current) {
        console.warn('[Auth] Hard timeout reached — forcing loading=false');
        setLoading(false);
      }
    }, 6000);

    // Check existing session first (avoids loading flicker on refresh)
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {

        if (error) {
          console.error('[Auth] getSession error:', error.message);
          clearTimeout(hardTimeout);
          if (mountedRef.current) setLoading(false);
          return;
        }
        const u = session?.user ?? null;
        if (mountedRef.current) setUser(u);
        if (u) {
          fetchProfile(u.id).then(() => {
            clearTimeout(hardTimeout);
          });
        } else {
          clearTimeout(hardTimeout);
          if (mountedRef.current) setLoading(false);
        }
      })
      .catch(err => {
        console.error('[Auth] getSession threw:', err.message);
        clearTimeout(hardTimeout);
        if (mountedRef.current) setLoading(false);
      });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {

        if (!mountedRef.current) return;
        const u = session?.user ?? null;
        setUser(u);

        if (event === 'SIGNED_OUT' || !u) {
          _profileCache = null;
          if (mountedRef.current) { setProfile(null); setLoading(false); }
          clearTimeout(hardTimeout);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          // Silent re-fetch profile on token refresh
          _profileCache = null;
        }

        // IMPORTANT: never `await` a Supabase call inside this callback.
        // supabase-js holds an internal auth lock while it runs this
        // callback, and fetchProfile() makes a Supabase request that
        // needs that same lock — so on session RESTORE (app reopened with
        // a saved login) it deadlocks and the app hangs on a blank screen
        // until site data is cleared. Deferring the call lets the
        // callback return first and release the lock.
        if (u) {
          setTimeout(() => {
            fetchProfile(u.id).finally(() => clearTimeout(hardTimeout));
          }, 0);
        } else {
          clearTimeout(hardTimeout);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(hardTimeout);
    };
  }, [fetchProfile]);

  // getSession() hung identically to the posts query — same
  // tab-backgrounding/throttling suspect. If the initial auth check
  // is still stuck (no user resolved, still loading) by the time the
  // tab regains focus, retry it automatically instead of leaving the
  // person stuck forever unless they happen to open DevTools.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (loading && !user) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          const u = session?.user ?? null;
          if (mountedRef.current) setUser(u);
          if (u) fetchProfile(u.id);
          else if (mountedRef.current) setLoading(false);
        }).catch(() => { if (mountedRef.current) setLoading(false); });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loading, user, fetchProfile]);

  const refreshProfile = useCallback(() => {
    if (user?.id) {
      _profileCache = null;
      fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const signOut = useCallback(async () => {
    _profileCache = null;
    if (mountedRef.current) { setProfile(null); setUser(null); }
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}