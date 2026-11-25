import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import VerifyCode from '../../components/auth/VerifyCode';
import { Spinner } from '../../components/ui';

// Second step of sign-in for accounts that turned on two-step verification
export default function Verify2FA() {
  const navigate = useNavigate();
  const { user, loading, needsMfa, refreshMfa, signOut } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { replace: true });
    else if (!needsMfa) navigate('/', { replace: true });
  }, [loading, user, needsMfa, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      const f = (data?.totp || [])[0];
      if (error || !f) setFailed(true); else setFactorId(f.id);
    });
  }, [user]);

  if (failed) {
    return (
      <div className="min-h-screen bg-[#F1F3F9] flex flex-col items-center justify-center px-6 text-center gap-4">
        <p className="text-[#111827] font-bold text-lg">Could not start two-step verification</p>
        <button onClick={signOut} className="bg-[#7C3AED] text-white font-bold rounded-full px-6 py-2.5">Sign out</button>
      </div>
    );
  }
  if (!factorId) return <div className="min-h-screen bg-[#F1F3F9] flex items-center justify-center text-[#6D28D9]"><Spinner size={26} /></div>;

  return (
    <div className="min-h-screen bg-[#F1F3F9]" style={{ maxWidth: 480, margin: '0 auto' }}>
      <VerifyCode
        kind="totp"
        title="Two-step verification"
        hint="Open your authenticator app and enter the 6-digit code for"
        target="B-Link"
        onVerify={async (code) => {
          const res = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
          if (!res.error) { await refreshMfa(); navigate('/', { replace: true }); }
          return res.error ? { error: { code: 'otp_expired', message: 'incorrect' } } : res;
        }}
        onBack={signOut}
        backLabel="Sign out"
      />
    </div>
  );
}
