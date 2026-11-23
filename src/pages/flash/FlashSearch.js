// src/pages/flash/FlashSearch.js
// Search inside B-Flash: videos (caption or hashtag), creators, and hashtags,
// plus trending tags and topic shortcuts when the box is empty.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, X, Clock, TrendingUp, Hash, Heart, Film } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { Spinner } from '../../components/ui';
import { formatNumber } from '../../utils/formatNumber';

const ACCENT = '#F97316';
const RKEY = 'blink_flash_search_v1';
const TOPICS = [
  ['Entertainment', 'entertainment'], ['Comedy', 'comedy'], ['Education', 'education'], ['Tech', 'tech'],
  ['Music & dance', 'music'], ['Sports', 'sports'], ['Lifestyle', 'lifestyle'], ['Business', 'business'],
  ['Fashion & beauty', 'fashion'], ['Travel & culture', 'travel'], ['Skills', 'skills'], ['News', 'news'],
];

const readRecents = () => { try { return JSON.parse(localStorage.getItem(RKEY)) || []; } catch { return []; } };
const saveRecent = (t) => {
  try { localStorage.setItem(RKEY, JSON.stringify([t, ...readRecents().filter((x) => x !== t)].slice(0, 8))); } catch { /* storage blocked */ }
};
const cleanTerm = (q) => q.trim().replace(/^[@#]+/, '').replace(/[^\p{L}\p{N}_ ]/gu, '').replace(/\s+/g, ' ').slice(0, 40);

// popular tags from the last two weeks of public videos (cached for 5 minutes)
let trendCache = { t: 0, list: [] };
async function loadTrending() {
  if (Date.now() - trendCache.t < 5 * 60 * 1000 && trendCache.list.length) return trendCache.list;
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data } = await supabase.from('posts').select('hashtags')
    .not('video_url', 'is', null).eq('audience', 'public').eq('is_draft', false).neq('status', 'deleted')
    .gte('created_at', since).limit(300);
  const counts = {};
  (data || []).forEach((r) => (r.hashtags || []).forEach((h) => { const k = String(h).toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; }));
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tag, n]) => ({ tag, n }));
  trendCache = { t: Date.now(), list };
  return list;
}

export default function FlashSearch({ onClose, searchVideos, onOpenVideo, onOpenCreator, onPickTag }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('videos');
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState([]);
  const [creators, setCreators] = useState([]);
  const [trending, setTrending] = useState(trendCache.list);
  const [recents, setRecents] = useState(readRecents);
  const [failed, setFailed] = useState(false);
  const reqRef = useRef(0);
  const inputRef = useRef(null);
  const term = cleanTerm(q);

  useEffect(() => { loadTrending().then(setTrending).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 120); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (!term) { reqRef.current += 1; setVideos([]); setCreators([]); setLoading(false); setFailed(false); return undefined; }
    const timer = setTimeout(async () => {
      const my = ++reqRef.current;
      setLoading(true); setFailed(false);
      try {
        const [v, c] = await Promise.all([
          searchVideos(term),
          supabase.from('users').select('id, username, display_name, avatar_url, is_verified, followers_count')
            .or('username.ilike."' + term + '%",display_name.ilike."%' + term + '%"').limit(20),
        ]);
        if (my !== reqRef.current) return;
        setVideos(v || []);
        setCreators(c.data || []);
      } catch {
        if (my === reqRef.current) setFailed(true);
      } finally {
        if (my === reqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term, searchVideos]);

  const remember = (t) => { if (t) { saveRecent(t); setRecents(readRecents()); } };
  const lower = term.toLowerCase().replace(/\s+/g, '');
  const tags = term
    ? [...new Set([lower, ...trending.map((t) => t.tag).filter((t) => t.includes(lower))])].filter(Boolean).slice(0, 15)
    : [];
  const countOf = (tag) => (trending.find((t) => t.tag === tag) || {}).n;

  return (
    <div className="absolute inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center gap-1 px-1 pt-[max(8px,env(safe-area-inset-top))] pb-2 flex-shrink-0">
        <button onClick={onClose} aria-label="Close search" className="w-11 h-11 flex items-center justify-center text-[#202938]"><ArrowLeft size={22} /></button>
        <div className="flex-1 h-11 rounded-full bg-[#F1F5F9] flex items-center gap-2 px-4 focus-within:ring-1 focus-within:ring-[#F97316]/60">
          <Search size={18} className="text-[#64748B] flex-shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))}
            onKeyDown={(e) => { if (e.key === 'Enter') remember(term); }}
            placeholder="Search videos, creators, #tags" aria-label="Search B-Flash" enterKeyHint="search"
            className="flex-1 min-w-0 bg-transparent text-[#202938] outline-none placeholder-[#94A3B8]" style={{ fontSize: 16 }} />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="text-[#64748B]"><X size={18} /></button>}
        </div>
      </div>

      {term ? (
        <>
          <div className="flex gap-2 px-4 pb-2 flex-shrink-0">
            {[['videos', 'Videos', videos.length], ['creators', 'Creators', creators.length], ['tags', 'Tags', tags.length]].map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className="h-9 px-4 rounded-full text-[13px] font-bold" style={{ background: tab === k ? ACCENT : '#F1F5F9', color: tab === k ? '#fff' : '#202938' }}>
                {l}{n > 0 && <span className="opacity-70"> {n}</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-6" style={{ overscrollBehavior: 'contain' }}>
            {loading && <div className="flex justify-center py-10 text-[#202938]"><Spinner size={24} /></div>}
            {!loading && failed && <p className="text-center text-[#64748B] text-[14px] py-10">Search isn’t working right now. Check your connection and try again.</p>}

            {!loading && !failed && tab === 'videos' && (
              videos.length === 0 ? (
                <p className="text-center text-[#64748B] text-[14px] py-10">No videos match “{term}”.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {videos.map((v) => (
                    <button key={v.id} onClick={() => { remember(term); onOpenVideo(v); }} aria-label={'Open video by ' + (v.users && v.users.username)}
                      className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[#F1F5F9] active:scale-[.97] transition-transform">
                      {v.video_thumbnail ? <img src={v.video_thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center text-[#64748B]"><Film size={22} /></span>}
                      <span className="absolute inset-x-0 bottom-0 px-1.5 pt-6 pb-1.5 text-left" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.8), transparent)' }}>
                        <span className="block text-[#202938] text-[11px] font-bold truncate">@{(v.users && v.users.username) || 'creator'}</span>
                        <span className="flex items-center gap-1 text-[#202938] text-[10px]"><Heart size={10} fill="currentColor" /> {formatNumber(v.likes_count || 0)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}

            {!loading && !failed && tab === 'creators' && (
              creators.length === 0 ? (
                <p className="text-center text-[#64748B] text-[14px] py-10">No creators match “{term}”.</p>
              ) : creators.map((c) => (
                <button key={c.id} onClick={() => { remember(term); onOpenCreator(c); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl active:bg-[#F8FAFC] text-left">
                  <Avatar url={c.avatar_url} name={c.display_name || c.username} size={11} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[#202938] font-bold text-[15px] truncate">{c.display_name || c.username}{c.is_verified && <VerifiedBadge size={14} />}</span>
                    <span className="block text-[#64748B] text-[13px] truncate">@{c.username}{c.followers_count ? ' · ' + formatNumber(c.followers_count) + ' followers' : ''}</span>
                  </span>
                </button>
              ))
            )}

            {!loading && !failed && tab === 'tags' && (
              tags.length === 0 ? (
                <p className="text-center text-[#64748B] text-[14px] py-10">No tags match “{term}”.</p>
              ) : tags.map((t) => (
                <button key={t} onClick={() => { remember(term); onPickTag(t); }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl active:bg-[#F8FAFC] text-left">
                  <span className="w-10 h-10 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#4DB6FF]"><Hash size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[#202938] font-bold text-[15px] truncate">#{t}</span>
                    {countOf(t) ? <span className="block text-[#64748B] text-[12px]">{countOf(t)} recent video{countOf(t) === 1 ? '' : 's'}</span> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8" style={{ overscrollBehavior: 'contain' }}>
          {recents.length > 0 && (
            <>
              <div className="flex items-center justify-between pt-2 pb-1">
                <p className="text-[12px] font-bold uppercase tracking-wide text-[#64748B]">Recent</p>
                <button onClick={() => { try { localStorage.removeItem(RKEY); } catch { /* storage blocked */ } setRecents([]); }} className="text-[12px] font-bold text-[#64748B]">Clear</button>
              </div>
              <div className="flex flex-wrap gap-2 pb-3">
                {recents.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="h-9 pl-3 pr-4 rounded-full bg-[#F1F5F9] text-[#202938] text-[13px] font-semibold flex items-center gap-1.5">
                    <Clock size={13} className="text-[#64748B]" /> {r}
                  </button>
                ))}
              </div>
            </>
          )}
          {trending.length > 0 && (
            <>
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#64748B] pt-2 pb-2 flex items-center gap-1.5"><TrendingUp size={14} /> Trending tags</p>
              <div className="flex flex-wrap gap-2 pb-3">
                {trending.map((t) => (
                  <button key={t.tag} onClick={() => onPickTag(t.tag)} className="h-9 px-3.5 rounded-full text-[13px] font-bold" style={{ background: 'rgba(77,182,255,.14)', color: '#4DB6FF' }}>#{t.tag}</button>
                ))}
              </div>
            </>
          )}
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#64748B] pt-2 pb-2">Explore topics</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map(([label, t]) => (
              <button key={t} onClick={() => setQ(t)} className="h-10 px-4 rounded-full text-[13px] font-bold text-[#202938]" style={{ background: 'rgba(255,90,31,.16)', border: '1px solid rgba(255,90,31,.35)' }}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
