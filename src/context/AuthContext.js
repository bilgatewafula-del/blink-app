import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Avoid redundant re-renders if user id hasn't actually changed
        setUser((prev) => {
          const newId = session?.user?.id ?? null;
          const prevId = prev?.id ?? null;
          if (newId === prevId) return prev; // no-op, prevents re-render
          return session?.user ?? null;
        });

        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) { console.warn('Profile fetch error:', error.message); setProfile(null); }
      else setProfile(data);
    } catch (err) {
      console.warn('fetchProfile failed:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time profile updates (follower count etc)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('profile:' + user.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: 'id=eq.' + user.id,
      }, (payload) => {
        setProfile(payload.new);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // ── KEY FIX: memoize the context value ──
  // Only creates a new object when user, profile, or loading actually change
  const value = useMemo(
    () => ({ user, profile, loading, signOut, fetchProfile }),
    [user, profile, loading, signOut, fetchProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);