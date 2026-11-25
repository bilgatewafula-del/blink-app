// src/pages/flash/MyVideos.js
// Creator hub: your posted videos with real numbers, quick actions, and the videos you saved.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Heart, MessageCircle, Share2, Film, Pin, Link2, Trash2, X, Globe, Users, Lock, EyeOff, Plus, MessageSquareOff, Bookmark } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { goBack } from '../../lib/nav';
import { postLink } from '../../lib/posts';
import { EmptyState, Spinner } from '../../components/ui';
import { formatNumber } from '../../utils/formatNumber';

const ORANGE = '#E11D48';
const FIELDS = 'id, caption, video_thumbnail, video_duration, audience, status, is_pinned, comments_disabled, likes_count, comments_count, shares_count, views_count, created_at, user_id, users!posts_user_id_fkey(username, display_name)';
const AUD = { public: Globe, followers: Users, private: Lock };
const dur = (s) => { const t = Math.round(s || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] py-3 px-2 text-center">
      <Icon size={16} className="mx-auto text-[#64748B] mb-1" />
      <p className="text-[#111827] font-extrabold text-[17px] leading-tight">{formatNumber(value || 0)}</p>
      <p className="text-[#64748B] text-[11px] font-semibold">{label}</p>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[560px] bg-white rounded-t-3xl border-t border-[#E2E8F0] pb-[max(16px,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pl-5 pr-1.5 pt-2">
          <p className="text-[#111827] font-bold text-[16px] py-3 truncate">{title}</p>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center text-[#64748B]"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left active:bg-[#F8FAFC]">
      <Icon size={20} color={danger ? '#DC2626' : '#111827'} />
      <span className="flex-1 text-[15px] font-semibold" style={{ color: danger ? '#DC2626' : '#111827' }}>{label}</span>
      {value && <span className="text-[13px] text-[#64748B]">{value}</span>}
    </button>
  );
}

export default function MyVideos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('posted');
  const [mine, setMine] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);                 // video whose actions are open
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState('');
  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2200); }, []);

  const loadMine = useCallback(async () => {
    setError('');
    const { data, error: e } = await supabase.from('posts').select(FIELDS)
      .eq('user_id', user.id).not('video_url', 'is', null)
      .neq('status', 'deleted').neq('status', 'archived')
      .order('created_at', { ascending: false }).limit(200);
    if (e) { setError('Couldn’t load your videos.'); setMine([]); return; }
    setMine(data || []);
  }, [user.id]);

  const loadSaved = useCallback(async () => {
    const { data: ids } = await supabase.from('saved_posts').select('post_id').eq('user_id', user.id).limit(300);
    const list = (ids || []).map((r) => r.post_id);
    if (!list.length) { setSaved([]); return; }
    const { data } = await supabase.from('posts').select(FIELDS)
      .in('id', list).not('video_url', 'is', null).eq('audience', 'public')
      .neq('status', 'deleted').neq('status', 'hidden').order('created_at', { ascending: false });
    setSaved(data || []);
  }, [user.id]);

  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => { if (tab === 'saved' && saved === null) loadSaved(); }, [tab, saved, loadSaved]);

  const open = (v) => navigate('/flash?v=' + v.id);
  const patch = async (v, fields, msg) => {
    const { error: e } = await supabase.from('posts').update(fields).eq('id', v.id).eq('user_id', user.id);
    if (e) { say('Couldn’t save that change'); return; }
    setMine((arr) => arr.map((x) => (x.id === v.id ? { ...x, ...fields } : x)));
    setMenu(null); say(msg);
  };
  const copy = async (v) => {
    try { await navigator.clipboard.writeText(postLink(v.id)); say('Link copied'); } catch { say('Couldn’t copy the link'); }
    setMenu(null);
  };
  const del = async (v) => {
    setConfirmDel(null); setMenu(null);
    const { error: e } = await supabase.rpc('delete_own_post', { p_post_id: v.id });
    if (e) { say('Couldn’t delete: ' + (e.message || 'try again')); return; }
    setMine((arr) => arr.filter((x) => x.id !== v.id)); say('Video deleted');
  };

  const sum = (k) => (mine || []).reduce((n, v) => n + (v[k] || 0), 0);
  const best = (mine || []).reduce((b, v) => (!b || (v.views_count || 0) > (b.views_count || 0) ? v : b), null);
  const list = tab === 'posted' ? mine : saved;

  return (
    <div className="min-h-screen bg-[#F1F3F9] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] px-2 py-2 flex items-center gap-1">
        <button onClick={() => goBack(navigate, '/flash')} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft size={22} /></button>
        <p className="flex-1 text-white font-extrabold text-[18px]">My videos</p>
        <button onClick={() => navigate('/flash/create')} className="h-10 px-4 rounded-full text-white text-[14px] font-bold flex items-center gap-1.5" style={{ background: ORANGE }}><Plus size={17} /> New</button>
      </div>

      <div className="max-w-[620px] mx-auto px-4">
        <div className="flex gap-2 pt-3">
          {[['posted', 'Posted', Film], ['saved', 'Saved', Bookmark]].map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
              className="flex-1 h-11 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 border"
              style={tab === k ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : { background: '#F8FAFC', borderColor: '#E2E8F0', color: '#111827' }}>
              <Icon size={16} /> {l}
            </button>
          ))}
        </div>

        {tab === 'posted' && mine && mine.length > 0 && (
          <div className="pt-3">
            <div className="flex gap-2">
              <Stat icon={Film} label="Videos" value={mine.length} />
              <Stat icon={Eye} label="Views" value={sum('views_count')} />
              <Stat icon={Heart} label="Likes" value={sum('likes_count')} />
              <Stat icon={MessageCircle} label="Comments" value={sum('comments_count')} />
            </div>
            {best && (best.views_count || 0) > 0 && (
              <button onClick={() => open(best)} className="w-full mt-2 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex items-center gap-3 text-left active:bg-[#F1F5F9]">
                <span className="w-10 h-14 rounded-lg bg-[#E2E8F0] overflow-hidden flex-shrink-0">{best.video_thumbnail && <img src={best.video_thumbnail} alt="" className="w-full h-full object-cover" />}</span>
                <span className="min-w-0">
                  <span className="block text-[#BE123C] text-[11px] font-bold uppercase tracking-wide">Most watched</span>
                  <span className="block text-[#111827] text-[14px] font-semibold truncate">{best.caption || 'Untitled video'}</span>
                  <span className="block text-[#64748B] text-[12px]">{formatNumber(best.views_count)} views · {formatNumber(best.likes_count || 0)} likes</span>
                </span>
              </button>
            )}
          </div>
        )}

        {list === null && <div className="flex justify-center py-16 text-[#BE123C]"><Spinner size={26} /></div>}
        {error && <p className="text-center text-[#64748B] py-10">{error}</p>}
        {list && list.length === 0 && !error && (
          <EmptyState icon={tab === 'posted' ? Film : Bookmark}
            title={tab === 'posted' ? 'No videos yet' : 'No saved videos'}
            text={tab === 'posted' ? 'Share your first video on B-Flash.' : 'Tap the bookmark on any B-Flash video to keep it here.'}>
            {tab === 'posted' && <button onClick={() => navigate('/flash/create')} className="px-6 py-2.5 rounded-xl text-white font-bold" style={{ background: ORANGE }}>Post a video</button>}
          </EmptyState>
        )}

        {list && list.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 pt-3">
            {list.map((v) => {
              const AudIcon = AUD[v.audience] || Globe;
              return (
                <div key={v.id} className="relative">
                  <button onClick={() => open(v)} aria-label="Play video" className="block w-full aspect-[9/16] rounded-xl overflow-hidden bg-[#F1F5F9] active:scale-[.98] transition-transform">
                    {v.video_thumbnail ? <img src={v.video_thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-[#64748B]"><Film size={22} /></span>}
                    <span className="absolute inset-x-0 bottom-0 px-1.5 pt-6 pb-1.5 text-left" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent)' }}>
                      <span className="flex items-center gap-1 text-white text-[11px] font-bold"><Eye size={11} /> {formatNumber(v.views_count || 0)}</span>
                      <span className="flex items-center gap-1 text-white/90 text-[10px]"><Heart size={10} fill="currentColor" /> {formatNumber(v.likes_count || 0)}</span>
                    </span>
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold">{dur(v.video_duration)}</span>
                  </button>
                  {tab === 'posted' && (
                    <>
                      <span className="absolute top-1.5 left-1.5 flex items-center gap-1">
                        {v.is_pinned && <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center"><Pin size={11} color={ORANGE} /></span>}
                        {v.audience && v.audience !== 'public' && <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center"><AudIcon size={11} color="#111827" /></span>}
                        {v.status === 'hidden' && <span className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center"><EyeOff size={11} color="#DC2626" /></span>}
                      </span>
                      <button onClick={() => setMenu(v)} aria-label="Video options" className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center text-[16px] font-bold leading-none">⋯</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menu && (
        <Sheet title={menu.caption || 'Your video'} onClose={() => setMenu(null)}>
          {menu.status === 'hidden' && <p className="mx-5 mb-2 rounded-xl bg-[#FEF2F2] text-[#B91C1C] text-[13px] px-3 py-2">This video was hidden by B-Link moderators.</p>}
          <Row icon={Film} label="Open in B-Flash" onClick={() => open(menu)} />
          <Row icon={Link2} label="Copy link" onClick={() => copy(menu)} />
          <Row icon={Pin} label={menu.is_pinned ? 'Unpin from profile' : 'Pin to profile'} onClick={() => patch(menu, { is_pinned: !menu.is_pinned }, menu.is_pinned ? 'Unpinned' : 'Pinned to your profile')} />
          <Row icon={menu.comments_disabled ? MessageCircle : MessageSquareOff} label={menu.comments_disabled ? 'Turn comments on' : 'Turn comments off'}
            onClick={() => patch(menu, { comments_disabled: !menu.comments_disabled }, menu.comments_disabled ? 'Comments on' : 'Comments off')} />
          <Row icon={Share2} label="Who can watch" value={menu.audience === 'followers' ? 'Followers' : menu.audience === 'private' ? 'Only me' : 'Everyone'}
            onClick={() => patch(menu, { audience: menu.audience === 'public' ? 'followers' : menu.audience === 'followers' ? 'private' : 'public' }, 'Visibility updated')} />
          <Row icon={Trash2} label="Delete video" danger onClick={() => setConfirmDel(menu)} />
        </Sheet>
      )}
      {confirmDel && (
        <Sheet title="Delete this video?" onClose={() => setConfirmDel(null)}>
          <p className="px-5 pb-3 text-[#64748B] text-[14px] leading-snug">It will be removed for everyone, with its likes and comments. This can’t be undone.</p>
          <div className="px-5 flex flex-col gap-2.5">
            <button onClick={() => del(confirmDel)} className="h-12 rounded-xl bg-[#DC2626] text-white font-bold">Delete video</button>
            <button onClick={() => setConfirmDel(null)} className="h-12 rounded-xl bg-[#F1F5F9] text-[#111827] font-bold">Cancel</button>
          </div>
        </Sheet>
      )}
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[90] bg-[#111827] text-white text-[13px] font-semibold px-4 py-2 rounded-full">{toast}</div>}
    </div>
  );
}
