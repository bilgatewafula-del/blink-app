// src/components/post/Sheets.js — share and insights sheets for posts
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link2, Share2, Send, Check, Eye, Heart, MessageCircle, Repeat2, Bookmark, Share, TrendingUp, Facebook, Twitter, Linkedin, Mail, MessageSquare } from 'lucide-react';
import Avatar from '../Avatar';
import { Spinner } from '../ui';
import { formatNumber } from '../../utils/formatNumber';
import { fetchInsights, postLink, recordShare } from '../../lib/posts';

function BottomSheet({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/65 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-[#E2E8F0] mx-auto mt-2.5 mb-1" />
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

  const isVideo = !!post.video_url;
  const text = isVideo ? 'Watch this video on B-Link' : 'Check this post on B-Link';
  const enc = encodeURIComponent;
  const copy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(url);
      else { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      recordShare(post.id); onDone('Link copied');
    } catch { onDone("Couldn't copy the link"); }
  };
  // the phone's own share menu (every app that accepts links), when this device offers it
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const system = async () => {
    try { await navigator.share({ title: 'B-Link', text, url }); recordShare(post.id); onDone(null); } catch { /* cancelled */ }
  };
  const open = (href) => { recordShare(post.id); window.open(href, '_blank', 'noopener,noreferrer'); onDone(null); };
  const TARGETS = [
    { label: 'WhatsApp', Icon: MessageCircle, bg: '#25D366', go: () => open('https://wa.me/?text=' + enc(text + ' ' + url)) },
    { label: 'Telegram', Icon: Send, bg: '#229ED9', go: () => open('https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text)) },
    { label: 'Facebook', Icon: Facebook, bg: '#1877F2', go: () => open('https://www.facebook.com/sharer/sharer.php?u=' + enc(url)) },
    { label: 'X', Icon: Twitter, bg: '#111827', go: () => open('https://twitter.com/intent/tweet?url=' + enc(url) + '&text=' + enc(text)) },
    { label: 'LinkedIn', Icon: Linkedin, bg: '#0A66C2', go: () => open('https://www.linkedin.com/sharing/share-offsite/?url=' + enc(url)) },
    { label: 'SMS', Icon: MessageSquare, bg: '#64748B', go: () => open('sms:?&body=' + enc(text + ' ' + url)) },
    { label: 'Email', Icon: Mail, bg: '#64748B', go: () => open('mailto:?subject=' + enc('B-Link') + '&body=' + enc(text + '\n' + url)) },
  ];
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
      <p className="text-[#202938] font-bold text-[15px] px-5 pt-2 pb-3">{isVideo ? 'Share video' : 'Share post'}</p>
      <div className="flex gap-4 px-5 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button onClick={copy} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 active:scale-95 transition-transform">
          <span className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#202938]"><Link2 size={22} /></span>
          <span className="text-[#202938] text-[11px] font-semibold">Copy link</span>
        </button>
        {TARGETS.map(({ label, Icon, bg, go }) => (
          <button key={label} onClick={go} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 active:scale-95 transition-transform">
            <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: bg }}><Icon size={22} /></span>
            <span className="text-[#202938] text-[11px] font-semibold">{label}</span>
          </button>
        ))}
        {canNativeShare && (
          <button onClick={system} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 active:scale-95 transition-transform">
            <span className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#202938]"><Share2 size={22} /></span>
            <span className="text-[#202938] text-[11px] font-semibold">More</span>
          </button>
        )}
      </div>
      <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider px-5 pt-2 pb-1">Send in chat</p>
      {chats === null && <div className="flex justify-center py-6 text-[#EA580C]"><Spinner size={20} /></div>}
      {chats && chats.length === 0 && <p className="text-[#64748B] text-sm text-center py-5">No chats yet</p>}
      {(chats || []).map((c) => {
        const on = picked.includes(c.chat_id);
        return (
          <button key={c.chat_id} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.chat_id) : [...p, c.chat_id]))}
            className="w-full flex items-center gap-3 px-5 py-2.5 active:bg-[#F8FAFC]">
            <Avatar url={c.other_avatar_url} name={c.other_display_name} size={10} />
            <span className="flex-1 text-left text-[#202938] text-[15px] font-semibold truncate">{c.other_display_name}</span>
            <span className={'w-6 h-6 rounded-full border-2 flex items-center justify-center ' + (on ? 'bg-[#F97316] border-[#F97316]' : 'border-[#E2E8F0]')}>{on && <Check size={14} className="text-[#202938]" />}</span>
          </button>
        );
      })}
      {picked.length > 0 && (
        <div className="px-5 pt-3">
          <button onClick={sendChats} disabled={busy} className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2"
            style={{ background: '#F97316' }}>
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
    [Eye, 'Views', data.views, '#FF9B6A'], [Heart, 'Likes', data.likes, '#EF4444'], [MessageCircle, 'Comments', data.comments, '#F97316'],
    [Repeat2, 'Reposts', data.reposts, '#2ECC71'], [Share, 'Shares', data.shares, '#F97316'], [Bookmark, 'Saves', data.saves, '#FFB020'],
  ] : [];

  return (
    <BottomSheet onClose={onClose}>
      <p className="text-[#202938] font-bold text-[15px] px-5 pt-2 pb-3 flex items-center gap-2"><TrendingUp size={17} className="text-[#EA580C]" /> Post insights</p>
      {!data ? <div className="flex justify-center py-12 text-[#EA580C]"><Spinner size={22} /></div> : (
        <>
          <div className="grid grid-cols-3 gap-2.5 px-5">
            {tiles.map(([Icon, label, value, color]) => (
              <div key={label} className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] py-3.5 flex flex-col items-center gap-1">
                <Icon size={18} color={color} />
                <p className="text-[#202938] font-black text-[20px] tabular-nums leading-none">{value == null ? '–' : formatNumber(value)}</p>
                <p className="text-[#64748B] text-[11px]">{label}</p>
              </div>
            ))}
          </div>
          {data.engagement != null && (
            <div className="px-5 mt-4">
              <div className="flex justify-between text-[12px] mb-1.5"><span className="text-[#64748B]">Engagement rate</span><span className="text-white font-bold">{data.engagement}%</span></div>
              <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.max(2, Math.min(100, data.engagement)) + '%', background: '#F97316' }} /></div>
              <p className="text-[#64748B] text-[11px] mt-1.5">Likes, comments, reposts, shares and saves compared with views.</p>
            </div>
          )}
          {Object.keys(data.reactions || {}).length > 0 && (
            <div className="px-5 mt-4">
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider mb-2">Reactions</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.reactions).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <span key={k} className="bg-[#F1F5F9] rounded-full px-3 py-1.5 text-[13px] text-[#202938]">{REACTION_EMOJI[k] || '👍'} {formatNumber(n)}</span>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-red-600 text-xs px-5 mt-3">{error}</p>}
          <p className="text-[#64748B] text-[11px] px-5 mt-4">Posted {new Date(data.created_at || post.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        </>
      )}
    </BottomSheet>
  );
}
