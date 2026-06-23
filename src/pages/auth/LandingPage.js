import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const FEATURES = [
  { emoji: '🔥', title: 'Vibes',       desc: 'Short videos from across Africa' },
  { emoji: '💬', title: 'Chats',       desc: 'Real-time messaging with reactions' },
  { emoji: '📸', title: 'Status',      desc: 'Share moments that last 24 hours'  },
  { emoji: '🌍', title: 'Community',   desc: 'Connect with GenZ across the continent' },
  { emoji: '🔔', title: 'Real-time',   desc: 'Instant notifications for everything' },
  { emoji: '🛡️', title: 'Safe Space',  desc: 'Moderated, friendly, and secure'  },
];

export default function LandingPage() {
  const navigate     = useNavigate();
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);

  // If already logged in go straight to home
  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
    else setTimeout(() => setVisible(true), 100);
  }, [user, loading]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-2xl shadow-[#1E6FFF]/40 animate-pulse">
          <span className="text-white font-black text-2xl">B</span>
        </div>
        <div className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (user) return null;

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col overflow-x-hidden">

      {/* ── Animated background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #1E6FFF 0%, transparent 70%)', animation: 'float1 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #7B2FFF 0%, transparent 70%)', animation: 'float2 10s ease-in-out infinite' }} />
        <div className="absolute top-[40%] right-[20%] w-[30vw] h-[30vw] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #FF6B35 0%, transparent 70%)', animation: 'float3 7s ease-in-out infinite' }} />
      </div>

      {/* ── HERO ── */}
      <div
        className="flex flex-col items-center justify-center px-6 pt-16 pb-10 text-center relative z-10 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        {/* Logo */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-2xl shadow-[#1E6FFF]/50">
            <span className="text-white font-black text-4xl tracking-tight">B</span>
          </div>
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-[28px] border-2 border-[#1E6FFF]/30 scale-110 animate-ping" style={{ animationDuration: '3s' }} />
        </div>

        {/* App name */}
        <h1 className="text-white font-black text-5xl tracking-tight mb-2">
          B-Link
        </h1>
        <p className="text-transparent font-bold text-lg mb-2"
          style={{ background: 'linear-gradient(90deg, #1E6FFF, #FF6B35, #FFD700)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
          Africa's GenZ Social Platform
        </p>
        <p className="text-white/50 text-sm max-w-xs leading-relaxed">
          Connect, vibe, share and grow with millions of young Africans.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs mt-8">
          <button
            onClick={() => navigate('/signup')}
            className="w-full py-4 rounded-2xl font-bold text-white text-base shadow-xl active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #1E6FFF 0%, #7B2FFF 100%)', boxShadow: '0 8px 32px rgba(30,111,255,0.4)' }}
          >
            Get Started — It's Free
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-4 rounded-2xl font-bold text-white text-base border border-white/20 bg-white/[0.06] hover:bg-white/10 active:scale-95 transition-all"
          >
            Sign In
          </button>
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-2 mt-6">
          <div className="flex -space-x-2">
            {['🇰🇪','🇳🇬','🇬🇭','🇺🇬','🇹🇿'].map((flag, i) => (
              <div key={i} className="w-7 h-7 rounded-full bg-white/10 border-2 border-[#0A1628] flex items-center justify-center text-sm">
                {flag}
              </div>
            ))}
          </div>
          <p className="text-white/50 text-xs">Join thousands across Africa</p>
        </div>
      </div>

      {/* ── FEATURES GRID ── */}
      <div
        className="px-4 pb-6 relative z-10 transition-all duration-700 delay-200"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest text-center mb-4">
          Everything you need
        </p>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-start gap-3 transition-all duration-500"
              style={{ transitionDelay: (200 + i * 60) + 'ms', opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.95)' }}
            >
              <span className="text-2xl flex-shrink-0">{f.emoji}</span>
              <div className="min-w-0">
                <p className="text-white font-bold text-[13px]">{f.title}</p>
                <p className="text-white/40 text-[11px] leading-snug mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="mt-auto pb-10 px-6 text-center relative z-10">
        <p className="text-white/25 text-xs">
          Made with ❤️ for Africa · By Bilgate Mukhayo
        </p>
        <p className="text-white/15 text-[10px] mt-1">
          © 2025 B-Link. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(20px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
      `}</style>
    </div>
  );
}