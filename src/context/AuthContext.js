import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

/* ── Cache profile in memory across renders ── */
let _profileCache = null;

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(_profileCache);
  const [loading, setLoading] = useState(true);

  /* Fetch profile — cached so it never refetches unless user changes */
  const fetchProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); _profileCache = null; return; }

    // Return cached immediately then revalidate
    if (_profileCache?.id === uid) {
      setProfile(_profileCache);
    }

    const { data } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url,bio,country,is_verified,role,is_banned,is_restricted,suspended_until,followers_count,posts_count')
      .eq('id', uid)
      .maybeSingle();

    if (data) {
      _profileCache = data;
      setProfile(data);
    }
  }, []);

  useEffect(() => {
    /* Check existing session first (avoids loading flicker) */
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else setLoading(false);
    });

    /* Listen for auth changes */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          await fetchProfile(u.id);
        } else {
          _profileCache = null;
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  /* Expose a refresh function for EditProfile etc */
  const refreshProfile = useCallback(() => {
    if (user?.id) {
      _profileCache = null;
      fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const signOut = useCallback(async () => {
    _profileCache = null;
    setProfile(null);
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