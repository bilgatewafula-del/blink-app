// src/context/AuthContext.js
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

// Was a module-level `let _profileCache` — outside React's data flow
// entirely, shared across every AuthProvider instance in the same JS
// realm. In practice AuthProvider mounts once for the app's lifetime
// so this rarely bit anyone, but it's a fragile pattern (breaks under
// HMR during dev, under multiple provider instances in tests, and is
// generally the kind of implicit global state that's easy to get
// wrong later). A ref scoped to the provider instance gives the same
// "avoid duplicate fetch" benefit without living outside React.
const PROFILE_FIELDS = `
  id, username, display_name, avatar_url, bio, country,
  is_verified, verified_at, role, is_banned, is_restricted,
  suspended_until, followers_count, following_count, posts_count,
  subscription_plan, subscription_expires_at,
  coins_balance, is_business,
  posts_today, posts_today_date,
  username_changed_at, display_name_changed_at
`.trim();

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const profileCacheRef = useRef(null);
  const fetchingRef     = useRef(false);
  const mountedRef       = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchProfile = useCallback(async (uid, { silent = false } = {}) => {
    if (!uid) {
      if (mountedRef.current) { setProfile(null); profileCacheRef.current = null; setLoading(false); }
      return;
    }
    if (profileCacheRef.current?.id === uid && !silent) {
      if (mountedRef.current) { setProfile(profileCacheRef.current); setLoading(false); }
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (silent && mountedRef.current) setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('users')
        .select(PROFILE_FIELDS)
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        if (error.message?.includes('JWT') || error.code === 'PGRST301') {
          console.warn('[Auth] Invalid session token — signing out');
          await supabase.auth.signOut();
          if (mountedRef.current) { setUser(null); setProfile(null); profileCacheRef.current = null; }
          return;
        }
        throw error;
      }

      if (data && mountedRef.current) {
        profileCacheRef.current = data;
        setProfile(data);
      }
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err.message);
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

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
        if (mountedRef.current) setUser(u);
        if (u) {
          fetchProfile(u.id).then(() => clearTimeout(hardTimeout));
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;
        const u = session?.user ?? null;
        setUser(u);

        if (event === 'SIGNED_OUT' || !u) {
          // Explicitly clear on every path that could mean "a
          // different identity might load next" — this is the actual
          // guarantee against stale cross-user data the review asked
          // for; it was already present here, just re-confirmed with
          // the ref-based cache instead of the module-level one.
          profileCacheRef.current = null;
          if (mountedRef.current) { setProfile(null); setLoading(false); }
          clearTimeout(hardTimeout);
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          profileCacheRef.current = null;
        }

        if (u) {
          await fetchProfile(u.id);
        }
        clearTimeout(hardTimeout);
      }
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(hardTimeout);
    };
  }, [fetchProfile]);

  // Global presence heartbeat — replaces ChatRoom's old per-chat
// is_online toggle. "Online" now means "actively using the app
// anywhere," not "currently has one specific chat open."
useEffect(() => {
  if (!user?.id) return;

  const HEARTBEAT_MS = 60000; // matches ONLINE_THRESHOLD_MS/2 in ChatList/ChatRoom's staleness check

  const goOnline = () => {
    supabase.from('users').update({
      is_online: true,
      last_seen: new Date().toISOString(),
    }).eq('id', user.id).then(() => {});
  };

  const goOffline = () => {
    // navigator.sendBeacon isn't usable for a Supabase PostgREST call
    // directly, so this is best-effort — if the tab is force-closed
    // rather than backgrounded, last_seen simply goes stale and the
    // 2-minute threshold in ChatList/ChatRoom's isOnline() check
    // naturally treats it as offline shortly after, which is the
    // correct fallback behavior for an unclean disconnect anyway.
    supabase.from('users').update({
      is_online: false,
      last_seen: new Date().toISOString(),
    }).eq('id', user.id).then(() => {});
  };

  goOnline();
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') goOnline();
  }, HEARTBEAT_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') goOnline();
    else goOffline();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', goOffline);

  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', goOffline);
    goOffline();
  };
}, [user?.id]);

  // Keeps the CURRENT user's own profile fresh automatically whenever
  // their row changes — another tab, an admin action against them, a
  // coin purchase webhook, a follow that changes their counts, etc.
  // Previously the only way `profile` ever updated was an explicit
  // refreshProfile() call from wherever a mutation happened, which
  // meant anything that forgot to call it (or any change that
  // originated outside the current tab entirely) left
  // followers_count/posts_count/coins_balance/subscription/
  // verification silently stale until the next token refresh or
  // manual navigation-triggered refetch. This is the actual fix for
  // that class of bug, not just a patch on individual call sites.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel('auth:self-profile:' + user.id)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: 'id=eq.' + user.id },
        (payload) => {
          if (!mountedRef.current) return;
          profileCacheRef.current = payload.new;
          setProfile(prev => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const refreshProfile = useCallback(() => {
    if (user?.id) {
      profileCacheRef.current = null;
      return fetchProfile(user.id, { silent: true });
    }
    return Promise.resolve();
  }, [user?.id, fetchProfile]);

  const signOut = useCallback(async () => {
    profileCacheRef.current = null;
    if (mountedRef.current) { setProfile(null); setUser(null); }
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshing, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}