// src/components/SplashScreen.js
// Shows on first load/refresh — replaces the white flash
export default function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0A1628]"
      style={{ animation: 'splashFadeOut 0.4s ease-out 1.2s forwards' }}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Logo */}
        <div
          className="w-20 h-20 rounded-[24px] flex items-center justify-center shadow-2xl shadow-[#1E6FFF]/50"
          style={{
            background: 'linear-gradient(135deg, #1E6FFF 0%, #7B2FFF 100%)',
            animation: 'splashLogoIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}
        >
          <span className="text-white font-black text-3xl">B</span>
        </div>

        {/* Name */}
        <div style={{ animation: 'splashTextIn 0.4s ease-out 0.2s both' }}>
          <p className="text-white font-black text-3xl tracking-tight">B-Link</p>
          <p className="text-white/40 text-xs text-center mt-0.5">Africa's GenZ Social Platform</p>
        </div>

        {/* Spinner */}
        <div
          className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin mt-4"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      <style>{`
        @keyframes splashLogoIn {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1);   }
        }
        @keyframes splashTextIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes splashFadeOut {
          from { opacity: 1; pointer-events: all; }
          to   { opacity: 0; pointer-events: none; }
        }
      `}</style>
    </div>
  );
}