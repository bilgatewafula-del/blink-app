// src/components/post/Sheets.js — share and insights sheets for posts
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link2, Share2, Send, Check, Eye, Heart, MessageCircle, Repeat2, Bookmark, Share, TrendingUp } from 'lucide-react';
import Avatar from '../Avatar';
import { Spinner } from '../ui';
import { formatNumber } from '../../utils/formatNumber';
import { fetchInsights, postLink, recordShare } from '../../lib/posts';

function BottomSheet({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/65 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1" />
        {children}
      </div>
    </div>
  );
}

export function ShareSheet({ post, onClose, onDone }) {
  const { user } = useAuth();
  const [chats, setChats] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const url = postLink(post.id);

  useEffect(() => { supabase.rpc('get_my_chats').then(({ data }) => setChats(data || [])); }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); recordShare(post.id); onDone('Link copied'); } catch { onDone("Couldn't copy the link"); }
  };
  const system = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Check this on B-Link', url }); recordShare(post.id); onDone(null); }
      else await copy();
    } catch { /* cancelled */ }
  };
  const sendChats = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    let ok = 0;
    for (const chatId of picked) {
      const { error } = await supabase.from('messages').insert({
        chat_id: chatId, sender_id: user.id, body: url, message_type: 'text',
        delivered_at: new Date().toISOString(), deleted_for: [], starred_by: [],
      });
      if (!error) ok += 1;
    }
    if (ok > 0) recordShare(post.id);
    setBusy(false);
    onDone(ok ? `Sent to ${ok} chat${ok === 1 ? '' : 's'}` : "Couldn't send. Try again.");
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="text-white font-bold text-[15px] px-5 pt-2 pb-3">Share post</p>
      <div className="flex gap-3 px-5 pb-3">
        {[[Link2, 'Copy link', copy, '#FF5A1F'], [Share2, 'More options', system, '#FF2D78']].map(([Icon, label, fn, color]) => (
          <button key={label} onClick={fn} className="flex-1 flex flex-col items-center gap-2 py-3.5 rounded-2xl bg-white/[0.05] active:bg-white/[0.09]">
            <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: color + '22', border: '1px solid ' + color + '44' }}><Icon size={20} color={color} /></span>
            <span className="text-white/85 text-[12px] font-semibold">{label}</span>
          </button>
        ))}
      </div>
      <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider px-5 pt-2 pb-1">Send in chat</p>
      {chats === null && <div className="flex justify-center py-6 text-[#FF5A1F]"><Spinner size={20} /></div>}
      {chats && chats.length === 0 && <p className="text-[#8E8C88] text-sm text-center py-5">No chats yet</p>}
      {(chats || []).map((c) => {
        const on = picked.includes(c.chat_id);
        return (
          <button key={c.chat_id} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.chat_id) : [...p, c.chat_id]))}
            className="w-full flex items-center gap-3 px-5 py-2.5 active:bg-white/[0.05]">
            <Avatar url={c.other_avatar_url} name={c.other_display_name} size={10} />
            <span className="flex-1 text-left text-white text-[15px] font-semibold truncate">{c.other_display_name}</span>
            <span className={'w-6 h-6 rounded-full border-2 flex items-center justify-center ' + (on ? 'bg-[#FF5A1F] border-[#FF5A1F]' : 'border-white/30')}>{on && <Check size={14} className="text-white" />}</span>
          </button>
        );
      })}
      {picked.length > 0 && (
        <div className="px-5 pt-3">
          <button onClick={sendChats} disabled={busy} className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF2D78)' }}>
            {busy ? <Spinner size={16} /> : <Send size={16} />} Send ({picked.length})
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

const REACTION_EMOJI = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡', fire: '🔥', clap: '👏' };

export function InsightsSheet({ post, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetchInsights(post.id).then((d) => live && setData(d)).catch((e) => {
      if (!live) return;
      // fallback: the numbers the post already carries
      setData({ views: post.views_count || 0, likes: post.likes_count || 0, comments: post.comments_count || 0, reposts: post.reposts_count || 0, shares: post.shares_count || 0, saves: null, reactions: {}, engagement: null, created_at: post.created_at });
      if (!/does not exist|could not find/i.test(e.message || '')) setError(e.message || '');
    });
    return () => { live = false; };
  }, [post]);

  const tiles = data ? [
    [Eye, 'Views', data.views, '#FF9B6A'], [Heart, 'Likes', data.likes, '#EF4444'], [MessageCircle, 'Comments', data.comments, '#FF5A1F'],
    [Repeat2, 'Reposts', data.reposts, '#2ECC71'], [Share, 'Shares', data.shares, '#FF2D78'], [Bookmark, 'Saves', data.saves, '#FFB020'],
  ] : [];

  return (
    <BottomSheet onClose={onClose}>
      <p className="text-white font-bold text-[15px] px-5 pt-2 pb-3 flex items-center gap-2"><TrendingUp size={17} className="text-[#FF5A1F]" /> Post insights</p>
      {!data ? <div className="flex justify-center py-12 text-[#FF5A1F]"><Spinner size={22} /></div> : (
        <>
          <div className="grid grid-cols-3 gap-2.5 px-5">
            {tiles.map(([Icon, label, value, color]) => (
              <div key={label} className="rounded-2xl bg-white/[0.05] border border-white/[0.07] py-3.5 flex flex-col items-center gap-1">
                <Icon size={18} color={color} />
                <p className="text-white font-black text-[20px] tabular-nums leading-none">{value == null ? '–' : formatNumber(value)}</p>
                <p className="text-[#8E8C88] text-[11px]">{label}</p>
              </div>
            ))}
          </div>
          {data.engagement != null && (
            <div className="px-5 mt-4">
              <div className="flex justify-between text-[12px] mb-1.5"><span className="text-[#8E8C88]">Engagement rate</span><span className="text-white font-bold">{data.engagement}%</span></div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(2, Math.min(100, data.engagement)) + '%', background: 'linear-gradient(90deg,#FF5A1F,#FF2D78)' }} /></div>
              <p className="text-[#8E8C88] text-[11px] mt-1.5">Likes, comments, reposts, shares and saves compared with views.</p>
            </div>
          )}
          {Object.keys(data.reactions || {}).length > 0 && (
            <div className="px-5 mt-4">
              <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-wider mb-2">Reactions</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.reactions).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <span key={k} className="bg-white/[0.07] rounded-full px-3 py-1.5 text-[13px] text-white">{REACTION_EMOJI[k] || '👍'} {formatNumber(n)}</span>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-xs px-5 mt-3">{error}</p>}
          <p className="text-[#8E8C88] text-[11px] px-5 mt-4">Posted {new Date(data.created_at || post.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        </>
      )}
    </BottomSheet>
  );
}
