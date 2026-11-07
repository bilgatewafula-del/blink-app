import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Spinner } from '../../components/ui';
import { checkPassword, friendlyAuthError } from '../../lib/authSecurity';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading, recovery, clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const check = checkPassword(password);

  // Only reachable through a real recovery (emailed link / verified code)
  useEffect(() => {
    if (loading || done) return;
    if (!user) navigate('/forgot-password', { replace: true });
    else if (!recovery) navigate('/', { replace: true });
  }, [loading, user, recovery, done, navigate]);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    if (!check.ok) { setError(check.error); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(friendlyAuthError(err).message); setBusy(false); return; }
    setDone(true);
    // a password reset must end every other login of this account
    try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* best effort */ }
    clearRecovery();
    setTimeout(() => navigate('/', { replace: true }), 1400);
  };

  if (loading || (!user && !done)) {
    return <div className="min-h-screen bg-[#0D0C0B] flex items-center justify-center text-[#FF5A1F]"><Spinner size={28} /></div>;
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#0D0C0B] flex flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 size={56} className="text-[#2ECC71] mb-4" />
        <h1 className="text-white font-black text-2xl">Password updated</h1>
        <p className="text-[#8E8C88] text-sm mt-2">Other devices have been signed out. Taking you in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0C0B] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="px-6 pt-14 pb-6">
        <h1 className="text-white font-black text-2xl">Choose a new password</h1>
        <p className="text-[#8E8C88] text-sm mt-2">Use at least 8 characters with letters and numbers.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 px-5">
        <div className="relative">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="New password" autoComplete="new-password"
            className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-12 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
          <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8C88]">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        {password && (
          <div className="-mt-1 px-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= check.score ? (check.score >= 3 ? '#2ECC71' : '#FFB020') : 'rgba(255,255,255,0.12)' }} />)}
            </div>
            <p className="text-[11px] mt-1" style={{ color: check.ok ? '#8E8C88' : '#FF8A5C' }}>{check.ok ? (check.score >= 3 ? 'Strong password' : 'Good. Longer is stronger.') : check.error}</p>
          </div>
        )}
        <div className="relative">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
          <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            placeholder="Confirm new password" autoComplete="new-password"
            className="w-full bg-white/[0.07] border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={busy}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
          {busy ? <><Spinner size={18} /> Saving…</> : 'Update password'}
        </button>
      </form>
    </div>
  );
}
