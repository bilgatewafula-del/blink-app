import AuthBanner from '../../components/auth/AuthBanner';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { User, Globe, ChevronDown, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { validateUsername, validateDisplayName } from '../../utils/usernameValidation';
import { Spinner } from '../../components/ui';

const COUNTRIES = [
  { code: 'KE', name: 'Kenya' }, { code: 'NG', name: 'Nigeria' }, { code: 'GH', name: 'Ghana' }, { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' }, { code: 'ZA', name: 'South Africa' }, { code: 'ET', name: 'Ethiopia' }, { code: 'RW', name: 'Rwanda' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' }, { code: 'OTHER', name: 'Other' },
];

// Shown when someone is signed in but has no profile yet (for example a
// username that was taken, or a phone sign-in with no name).
export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, profile, loading, profileChecked, refreshProfile, signOut } = useAuth();
  const meta = user?.user_metadata || {};
  const [displayName, setDisplayName] = useState(meta.display_name || '');
  const [username, setUsername] = useState((meta.username || '').toLowerCase());
  const [country, setCountry] = useState(meta.country || 'KE');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { replace: true });
    else if (profile) navigate('/', { replace: true });
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (clean.length < 3 || validateUsername(clean)) { setStatus(null); return undefined; }
    let cancelled = false;
    setStatus('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('username_available', { p_username: clean });
      if (!cancelled) setStatus(data === false ? 'taken' : 'available');
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username]);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const nameErr = validateDisplayName(displayName); if (nameErr) { setError(nameErr); return; }
    const userErr = validateUsername(username); if (userErr) { setError(userErr); return; }
    if (status === 'taken') { setError('Username taken. Choose another.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.rpc('complete_profile', {
      p_username: username.trim().toLowerCase(), p_display_name: displayName.trim(), p_country: country,
    });
    if (err) {
      const m = (err.message || '').toLowerCase();
      setError(m.includes('taken') || m.includes('duplicate') ? 'Username taken. Choose another.'
        : m.includes('does not exist') ? 'Profile setup is not available yet. Please try again shortly.'
        : err.message || 'Could not save your profile.');
      setBusy(false);
      return;
    }
    await refreshProfile();
    navigate('/', { replace: true });
  };

  if (loading || !user || (!profileChecked && !profile)) {
    return <div className="min-h-screen bg-[#E6E9F6] flex items-center justify-center text-[#6D28D9]"><Spinner size={28} /></div>;
  }

  return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <AuthBanner title="Finish your profile" subtitle="One last step. Pick how people will find you." />
      <div className="h-5" />
      <form onSubmit={submit} className="flex flex-col gap-3 px-5">
        <div className="relative">
          <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
          <input value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(''); }} placeholder="Display name" maxLength={40}
            className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-11 pr-4 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60" />
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] font-bold pointer-events-none">@</span>
          <input value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(''); }} placeholder="username" maxLength={20} autoCapitalize="none"
            className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-9 pr-10 py-4 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60" />
          {status === 'checking' && <Spinner size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B]" />}
          {status === 'available' && <CheckCircle2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#10B981]" />}
          {status === 'taken' && <XCircle size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-red-600" />}
        </div>
        <div className="relative">
          <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none z-10" />
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl pl-11 pr-10 py-4 text-[#111827] text-[15px] focus:outline-none appearance-none" style={{ WebkitAppearance: 'none' }}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#FFFFFF' }}>{c.name}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={busy}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: '#7C3AED', boxShadow: '0 8px 24px rgba(124,58,237,0.35)' }}>
          {busy ? <><Spinner size={18} /> Saving…</> : 'Continue'}
        </button>
        <button type="button" onClick={signOut} className="text-[#64748B] text-sm font-semibold py-2">Sign out</button>
      </form>
    </div>
  );
}
