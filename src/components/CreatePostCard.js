// src/components/CreatePostCard.js — "Create a post" composer card on Home.
// White, clean and professional, with violet accents. It only routes into the existing
// /create page (the one real post-creation flow); Photo and Video ask that page to open
// its own file picker, so uploads, limits and Cloudinary logic stay in one place.
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
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3">
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={11} />
          <button
            onClick={() => navigate('/create')}
            aria-label="Create a post"
            className={'flex-1 min-w-0 text-left bg-[#F1F5F9] hover:bg-[#EDE9FE] border border-[#E2E8F0] rounded-full px-4 py-3 transition-colors active:scale-[0.99] ' + ring}
          >
            <span className="block text-[#64748B] text-[15px] truncate">
              What's happening? Share with B-Link...
            </span>
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-[#EEF1F8] grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/create?attach=photo')}
            className={'flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F5F3FF] text-[#6D28D9] font-semibold text-[14px] hover:bg-[#EDE9FE] active:scale-95 transition-all ' + ring}
          >
            <ImagePlus size={19} /> Photo
          </button>
          <button
            onClick={() => navigate('/create?attach=video')}
            className={'flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F5F3FF] text-[#6D28D9] font-semibold text-[14px] hover:bg-[#EDE9FE] active:scale-95 transition-all ' + ring}
          >
            <Clapperboard size={19} /> Video
          </button>
        </div>
      </div>
    </section>
  );
}
