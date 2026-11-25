// src/components/CreatePostCard.js — compact "Create a post" composer on Home.
// Prompt row + Photo / Video shortcuts in ONE small card. It only routes into the existing
// /create page (the one real post-creation flow); Photo and Video ask that page to open its
// own file picker, so uploads, limits and Cloudinary logic stay in one place.
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Clapperboard } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';

export default function CreatePostCard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const ring = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]';

  return (
    <section className="px-3 pt-3" aria-label="Create a post">
      <div
        className="rounded-2xl border border-[#CFC8F0] px-3.5 pt-3 pb-1.5 shadow-[0_2px_8px_rgba(17,21,46,0.08)]"
        style={{ background: 'linear-gradient(180deg, #F1EDFF 0%, #FFFFFF 100%)' }}
      >
        <div className="flex items-center gap-3">
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={11} />
          <button
            onClick={() => navigate('/create')}
            aria-label="Create a post"
            className={'flex-1 min-w-0 text-left bg-white hover:bg-[#EDE9FE] border border-[#DDD6FE] rounded-full px-4 py-2.5 transition-colors active:scale-[0.99] ' + ring}
          >
            <span className="block text-[#475569] text-[15px] truncate">What's happening? Share with B-Link...</span>
          </button>
        </div>

        <div className="mt-2 flex items-center">
          <button
            onClick={() => navigate('/create?attach=photo')}
            className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[#111827] font-semibold text-[14px] active:bg-[#EDE9FE] transition-colors ' + ring}
          >
            <ImagePlus size={20} className="text-[#7C3AED]" /> Photo
          </button>
          <span aria-hidden="true" className="w-px h-6 bg-[#CFC8F0]" />
          <button
            onClick={() => navigate('/create?attach=video')}
            className={'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[#111827] font-semibold text-[14px] active:bg-[#FFE4E6] transition-colors ' + ring}
          >
            <Clapperboard size={20} className="text-[#E11D48]" /> Video
          </button>
        </div>
      </div>
    </section>
  );
}
