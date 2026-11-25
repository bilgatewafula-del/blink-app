import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import VerifyCode from '../../components/auth/VerifyCode';
import { maskIdentifier } from '../../lib/authSecurity';

// Stand-alone verification page: /verify (state: { kind, target })
export default function OTPVerify() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const kind = state?.kind;
  const target = state?.target;

  useEffect(() => { if (!kind || !target) navigate('/login', { replace: true }); }, [kind, target, navigate]);
  if (!kind || !target) return null;

  return (
    <div className="min-h-screen bg-[#E6E9F6]" style={{ maxWidth: 480, margin: '0 auto' }}>
      <VerifyCode
        kind={kind}
        target={kind === 'email' ? maskIdentifier(target) : target}
        hint="Verify your account. We sent a 6-digit code to"
        onVerify={async (code) => {
          const res = await supabase.auth.verifyOtp(kind === 'email' ? { email: target, token: code, type: 'signup' } : { phone: target, token: code, type: 'sms' });
          if (!res.error) navigate('/', { replace: true });
          return res;
        }}
        onResend={() => supabase.auth.resend(kind === 'email' ? { type: 'signup', email: target } : { type: 'sms', phone: target })}
        onBack={() => navigate('/login')}
        backLabel="Back to sign in"
      />
    </div>
  );
}
