import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark, Check, ChevronLeft, Heart, MessageCircle, MoreVertical,
  Play, Plus, Share2, Volume2, VolumeX,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/Avatar';
import { formatNumber } from '../../utils/formatNumber';
import { videoSrc } from '../../lib/imageUtils';
import { recordShare, requestPostState, toggleSave, patchPostState } from '../../lib/posts';

const PAGE_SIZE = 20;
const POST_SELECT = `
  id, caption, video_url, video_duration, video_thumbnail, likes_count,
  comments_count, shares_count, views_count, created_at, user_id,
  users!posts_user_id_fkey(id,username,display_name,avatar_url,is_verified,role)
`.trim();

const normalise = (post) => ({
  ...post,
  users: post['users!posts_user_id_fkey'] || post.users || {},
});

function VideoItem({ post, userId, onOpenComments }) {
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes_count || 0);
  const [shareCount, setShareCount] = useState(post.shares_count || 0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    requestPostState(userId, post.id).then((state) => {
      if (active) { setLiked(state.liked); setSaved(state.saved); }
    });
    return () => { active = false; };
  }, [post.id, userId]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); return; }
    video.play().then(() => setPlaying(true)).catch(() => setMessage('Tap again to play this video.'));
  }, [playing]);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      const video = videoRef.current;
      if (!video) return;
      if (!entry.isIntersecting) {
        video.pause();
        setPlaying(false);
      } else if (entry.intersectionRatio >= 0.75 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const dataSaver = localStorage.getItem('blink_prefs');
        if (!dataSaver?.includes('"data_saver":true')) {
          video.play().then(() => setPlaying(true)).catch(() => {});
        }
      }
    }, { threshold: [0.25, 0.75] });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pauseOnHidden = () => {
      if (document.hidden && videoRef.current) {
        videoRef.current.pause();
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', pauseOnHidden);
    return () => document.removeEventListener('visibilitychange', pauseOnHidden);
  }, []);

  const handleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    patchPostState(userId, post.id, { liked: next });
    const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: post.id, p_reaction_type: 'like' });
    if (error) {
      setLiked(!next);
      setLikeCount((count) => Math.max(0, count + (next ? -1 : 1)));
      patchPostState(userId, post.id, { liked: !next });
      setMessage('Like could not be updated.');
    } else if (data?.likes_count != null) {
      setLikeCount(data.likes_count);
    }
  };

  const handleSave = async () => {
    const next = !saved;
    setSaved(next);
    patchPostState(userId, post.id, { saved: next });
    try {
      const actual = await toggleSave(post.id, saved);
      setSaved(actual);
      patchPostState(userId, post.id, { saved: actual });
      setMessage(actual ? 'Saved to your library.' : 'Removed from your library.');
    } catch {
      setSaved(!next);
      patchPostState(userId, post.id, { saved: !next });
      setMessage('Save could not be updated.');
    }
  };

  const handleShare = async () => {
    await recordShare(post.id);
    setShareCount((count) => count + 1);
    const shareUrl = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'B-FLASH', text: post.caption || 'Watch this on B-FLASH', url: shareUrl });
      else await navigator.clipboard.writeText(shareUrl);
      setMessage(navigator.share ? 'Shared.' : 'Link copied.');
    } catch { /* cancelled share */ }
  };

  const creator = post.users || {};

  return (
    <article ref={cardRef} className="relative min-h-[calc(100dvh-144px)] snap-start overflow-hidden border-b border-white/10 bg-[#11100F]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(255,90,31,0.12),transparent_45%)]" />
      <div className="absolute inset-x-4 top-4 bottom-28 flex items-center justify-center rounded-[26px] bg-black overflow-hidden border border-white/10 shadow-2xl">
        <video
          ref={videoRef}
          src={videoSrc(post.video_url)}
          poster={post.video_thumbnail || undefined}
          muted={muted}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onClick={play}
          onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration * 100 : 0)}
          onEnded={() => setPlaying(false)}
        />
        {!playing && (
          <button onClick={play} aria-label="Play video" className="absolute w-16 h-16 rounded-full bg-black/60 backdrop-blur flex items-center justify-center border border-white/20 active:scale-95 transition-transform">
            <Play size={28} fill="white" className="text-white ml-1" />
          </button>
        )}
        <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3 h-1 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-[#FF5A1F] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <button onClick={(event) => { event.stopPropagation(); setMuted((value) => !value); }} aria-label={muted ? 'Unmute video' : 'Mute video'} className="absolute bottom-6 right-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white">
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <div className="absolute right-4 bottom-28 flex flex-col items-center gap-3 z-10">
        <button onClick={() => navigate(`/profile/${creator.username}`)} aria-label={`Open ${creator.display_name || 'creator'} profile`} className="w-12 h-12 rounded-full border-2 border-[#FF5A1F] overflow-hidden bg-[#262321]">
          <Avatar url={creator.avatar_url} name={creator.display_name} size={12} />
        </button>
        <ActionButton label={formatNumber(likeCount)} active={liked} onClick={handleLike} icon={Heart} />
        <ActionButton label={formatNumber(post.comments_count || 0)} onClick={onOpenComments} icon={MessageCircle} />
        <ActionButton label={saved ? 'Saved' : 'Save'} active={saved} onClick={handleSave} icon={Bookmark} />
        <ActionButton label={formatNumber(shareCount)} onClick={handleShare} icon={Share2} />
        <button aria-label="More video options" className="w-11 h-11 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white"><MoreVertical size={19} /></button>
      </div>

      <div className="absolute left-5 right-20 bottom-7 z-10">
        <button onClick={() => navigate(`/profile/${creator.username}`)} className="flex items-center gap-2 text-left">
          <span className="text-white font-bold text-[15px]">@{creator.username || 'creator'}</span>
          {creator.is_verified && <Check size={14} className="text-[#FF5A1F]" />}
        </button>
        <p className="text-white/85 text-sm leading-5 mt-2 line-clamp-2">{post.caption || 'More than watching. Experience it.'}</p>
        <div className="flex items-center gap-2 mt-2 text-white/50 text-[11px]"><span>FLASH VIDEO</span><span>·</span><span>{new Date(post.created_at).toLocaleDateString()}</span></div>
      </div>
      {message && <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[11px] text-white backdrop-blur">{message}</div>}
    </article>
  );
}

function ActionButton({ icon: Icon, label, active, onClick }) {
  return <button onClick={onClick} className="flex flex-col items-center gap-1 text-white" aria-label={label}>
    <span className={`w-11 h-11 rounded-full border border-white/10 bg-black/50 flex items-center justify-center transition-transform active:scale-90 ${active ? 'text-[#FF5A1F]' : 'text-white'}`}><Icon size={21} fill={active ? 'currentColor' : 'none'} /></span>
    <span className="text-[10px] font-semibold text-white/75 max-w-12 truncate">{label}</span>
  </button>;
}

export default function BFlash() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('for-you');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      let query = supabase.from('posts').select(POST_SELECT)
        .eq('is_draft', false).eq('audience', 'public').neq('status', 'deleted').neq('status', 'hidden')
        .not('video_url', 'is', null).order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (tab === 'following') {
        const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
        const ids = (follows || []).map((row) => row.following_id);
        query = ids.length ? query.in('user_id', ids) : query.eq('user_id', user.id);
      }
      const { data, error: queryError } = await query;
      if (!active) return;
      if (queryError) setError(queryError.message);
      setVideos((data || []).map(normalise));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [tab, user?.id]);

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-20">
      <header className="sticky top-0 z-30 bg-[#0D0C0B]/95 backdrop-blur-md border-b border-white/[0.07]">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/')} aria-label="Back to Home" className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/10"><ChevronLeft size={21} /></button>
          <div className="text-center"><p className="text-white font-black tracking-tight text-lg">B-FLASH</p><p className="text-[#FF5A1F] text-[9px] font-bold uppercase tracking-[0.2em]">More than watching</p></div>
          <button onClick={() => navigate('/create')} aria-label="Create a video post" className="w-9 h-9 rounded-xl flex items-center justify-center text-[#FF5A1F] hover:bg-white/10"><Plus size={21} /></button>
        </div>
        <div className="flex px-4 gap-6"><TabButton active={tab === 'for-you'} onClick={() => setTab('for-you')}>For You</TabButton><TabButton active={tab === 'following'} onClick={() => setTab('following')}>Following</TabButton></div>
      </header>

      {loading && <div className="min-h-[70dvh] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" /></div>}
      {!loading && error && <div className="mx-4 mt-8 rounded-2xl border border-red-400/20 bg-red-500/10 p-5"><p className="text-white font-bold">B-FLASH could not load</p><p className="text-red-200/70 text-sm mt-1">{error}</p></div>}
      {!loading && !error && videos.length === 0 && <div className="min-h-[70dvh] flex flex-col items-center justify-center px-8 text-center"><div className="w-16 h-16 rounded-3xl bg-[#FF5A1F]/15 flex items-center justify-center mb-5"><Play size={28} className="text-[#FF5A1F]" fill="currentColor" /></div><h1 className="text-white font-black text-2xl">Your next flash is waiting.</h1><p className="text-white/50 text-sm mt-2">No public videos are available here yet. Create the first one.</p><button onClick={() => navigate('/create')} className="mt-6 bg-[#FF5A1F] text-white rounded-full px-5 py-3 text-sm font-bold">Create a video</button></div>}
      {!loading && !error && videos.length > 0 && <main className="snap-y snap-mandatory overflow-y-auto">{videos.map((post) => <VideoItem key={post.id} post={post} userId={user.id} onOpenComments={() => navigate(`/post/${post.id}`)} />)}</main>}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return <button onClick={onClick} className={`relative py-2.5 text-sm font-bold ${active ? 'text-white' : 'text-white/45'}`}>{children}{active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#FF5A1F]" />}</button>;
}
