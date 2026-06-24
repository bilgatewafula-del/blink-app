import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

let _profileCache = null;

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const fetchProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); _profileCache = null; setLoading(false); return; }
    if (_profileCache?.id === uid) { setProfile(_profileCache); setLoading(false); return; }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data } = await supabase
        .from('users')
        .select('id,username,display_name,avatar_url,bio,country,is_verified,role,is_banned,is_restricted,suspended_until,followers_count,posts_count')
        .eq('id', uid)
        .maybeSingle();
      if (data) { _profileCache = data; setProfile(data); }
    } catch (_) {}
    fetchingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    // Hard timeout — loading MUST resolve within 5s no matter what
    const hardTimeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) fetchProfile(u.id);
      else { setLoading(false); clearTimeout(hardTimeout); }
    }).catch(() => { setLoading(false); clearTimeout(hardTimeout); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) { await fetchProfile(u.id); }
        else { _profileCache = null; setProfile(null); setLoading(false); }
        clearTimeout(hardTimeout);
      }
    );

    return () => { subscription.unsubscribe(); clearTimeout(hardTimeout); };
  }, [fetchProfile]);

  const refreshProfile = useCallback(() => {
    if (user?.id) { _profileCache = null; fetchProfile(user.id); }
  }, [user?.id, fetchProfile]);

  const signOut = useCallback(async () => {
    _profileCache = null; setProfile(null);
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