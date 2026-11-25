// src/components/ExploreCards.js — the asymmetrical "Explore B-Link" dashboard on Home.
// Every card is a real, existing route. Colours follow the B-Link feature colours:
// B-Flash = violet→rose, Discover = emerald, Chats = blue. (Posting lives in CreatePostCard.)
import { useNavigate } from 'react-router-dom';
import { Zap, Play, Compass, MessageCircle, ArrowRight, Film } from 'lucide-react';

function ArrowChip() {
  return (
    <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
      <ArrowRight size={16} className="text-white" strokeWidth={2.4} />
    </span>
  );
}

export default function ExploreCards() {
  const navigate = useNavigate();
  const focus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 focus-visible:ring-offset-[#EEF1F8]';

  return (
    <section className="px-3 pt-6" aria-label="Explore B-Link">
      <div className="flex items-end justify-between mb-2.5 px-1">
        <h2 className="text-[#111827] font-bold text-[19px] leading-none">Explore B-Link</h2>
        <button
          onClick={() => navigate('/discover')}
          className="text-[#7C3AED] text-[13px] font-semibold inline-flex items-center gap-1 active:opacity-70"
        >
          See more <ArrowRight size={14} />
        </button>
      </div>

      {/* Prominent B-Flash card */}
      <button
        onClick={() => navigate('/flash')}
        aria-label="Open B-Flash"
        className={'relative w-full overflow-hidden rounded-[20px] p-4 text-left text-white active:scale-[0.99] transition-transform shadow-sm ' + focus}
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #E11D48 100%)', minHeight: 136 }}
      >
        <Film size={104} strokeWidth={1.4} className="absolute -right-3 -bottom-3 text-white/20" aria-hidden="true" />
        <div className="relative flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <Zap size={24} className="text-white" fill="white" />
          </span>
          <div>
            <p className="font-extrabold text-[24px] leading-none tracking-tight">B-Flash</p>
            <p className="text-[14px] font-medium mt-1 text-white">Moments worth sharing</p>
          </div>
        </div>
        <span className="relative mt-4 inline-flex items-center gap-1.5 bg-white text-[#7C3AED] font-bold text-[14px] rounded-xl px-4 py-2">
          Watch now <Play size={14} fill="#7C3AED" />
        </span>
      </button>

      {/* Asymmetrical supporting cards: wide Discover + narrow Chats */}
      <div className="grid grid-cols-5 gap-3 mt-3">
        <button
          onClick={() => navigate('/discover')}
          aria-label="Open Discover"
          className={'relative col-span-3 overflow-hidden rounded-[20px] p-4 text-left text-white flex flex-col justify-between active:scale-[0.98] transition-transform shadow-sm ' + focus}
          style={{ background: '#047857', minHeight: 132 }}
        >
          <Compass size={96} strokeWidth={1.4} className="absolute -right-5 -top-3 text-white/15" aria-hidden="true" />
          <span className="relative w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <Compass size={24} className="text-white" />
          </span>
          <div className="relative mt-3">
            <p className="font-extrabold text-[20px] leading-tight">Discover</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-[13px] font-medium text-white leading-snug">Find new people, posts and hashtags</p>
              <ArrowChip />
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/chats')}
          aria-label="Open chats"
          className={'relative col-span-2 overflow-hidden rounded-[20px] p-3.5 text-left text-white flex flex-col justify-between active:scale-[0.98] transition-transform shadow-sm ' + focus}
          style={{ background: '#0284C7', minHeight: 132 }}
        >
          <MessageCircle size={26} className="text-white" />
          <div>
            <p className="font-extrabold text-[18px] leading-tight">Chats</p>
            <div className="mt-1 flex items-end justify-between gap-1.5">
              <p className="text-[12px] font-medium text-white leading-snug">Catch up with friends</p>
              <ArrowChip />
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
