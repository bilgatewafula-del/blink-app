// src/components/auth/AuthBanner.js — shared navy banner for every sign-in / sign-up screen.
import { ArrowLeft } from 'lucide-react';

export default function AuthBanner({ title, subtitle, onBack, big = false }) {
  return (
    <div
      className="bg-[#11152E] rounded-b-[28px] px-6 pb-7"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
    >
      <div className="h-10 flex items-center">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="-ml-2 w-10 h-10 rounded-xl hover:bg-white/10 active:bg-white/15 flex items-center justify-center text-white transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
        )}
      </div>
      <div className={big ? 'flex flex-col items-center text-center pt-2' : 'pt-1'}>
        {big && (
          <div
            className="w-20 h-20 rounded-[24px] flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #5B21B6)' }}
          >
            <span className="text-white font-black text-[40px] leading-none italic">B</span>
          </div>
        )}
        <h1 className={'text-white font-extrabold tracking-tight ' + (big ? 'text-[30px]' : 'text-[26px]')}>{title}</h1>
        {subtitle && <p className="text-[#C4B5FD] text-[14px] font-medium mt-1.5 leading-snug">{subtitle}</p>}
      </div>
    </div>
  );
}
