import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  MoreHorizontal, Bookmark, BarChart2, Trash2, Flag,
  UserX, Volume2, VolumeX, Play, X, Send, SmilePlus, Quote,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import SmartEmojiPicker from '../../components/SmartEmojiPicker';
import { Component } from 'react';

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

const REACTIONS = [
  { emoji:'❤️', type:'like',  color:'#EF4444' },
  { emoji:'😂', type:'haha',  color:'#FFD700' },
  { emoji:'😮', type:'wow',   color:'#FF6B35' },
  { emoji:'😢', type:'sad',   color:'#6B7280' },
  { emoji:'😡', type:'angry', color:'#EF4444' },
  { emoji:'🔥', type:'fire',  color:'#FF6B35' },
];

const COMMENT_REACTIONS = ['❤️','😂','😮','😢','🔥','👍'];

function RichText({ text, onHashtag, onMention }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(#\w+|@\w+)/g).map((p, i) => {
        if (p.startsWith('#')) return <button key={i} onClick={() => onHashtag(p.slice(1))} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@')) return <button key={i} onClick={() => onMention(p.slice(1))} className="text-[#1E6FFF] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function MediaGrid({ images }) {
  if (!images?.length) return null;
  const n = images.length;
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
      {n === 1 && <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight:500 }} />}
      {n === 2 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.map((img,i) => <img key={i} src={img} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} />)}
        </div>
      )}
      {n === 3 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr' }}>
          <img src={images[0]} alt="" className="row-span-2 w-full h-full object-cover" style={{ aspectRatio:'1/2' }} />
          <img src={images[1]} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} />
          <img src={images[2]} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} />
        </div>
      )}
      {n >= 4 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.slice(0,4).map((img,i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} />
              {i === 3 && n > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">+{n-4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({ c, postAuthorId, currentUserId, onReply, onDelete, navigate }) {
  const [showReactions, setShowReactions] = useState(false);
  const [myReaction,    setMyReaction]    = useState(c.my_reaction || null);
  const [reactionCount, setReactionCount] = useState(c.reaction_count || 0);
  const longPressTimer = useRef();
  const pickerRef      = useRef();
  const isAuthor = c.user_id === postAuthorId;
  const isMine   = c.user_id === currentUserId;

  useEffect(() => {
    if (!showReactions) return;
    const h = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowReactions(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showReactions]);

  const handleReact = async (emoji) => {
    setShowReactions(false);
    try {
      if (myReaction === emoji) {
        setMyReaction(null); setReactionCount(rc => Math.max(0, rc - 1));
        await supabase.from('comment_reactions').delete().eq('comment_id', c.id).eq('user_id', currentUserId);
      } else {
        if (!myReaction) setReactionCount(rc => rc + 1);
        setMyReaction(emoji);
        await supabase.from('comment_reactions').upsert(
          { comment_id: c.id, user_id: currentUserId, emoji },
          { onConflict: 'comment_id,user_id' }
        );
      }
    } catch (err) { console.error('comment reaction:', err.message); }
  };

  return (
    <div className="flex gap-2.5 px-4 py-2.5 border-b border-white/[0.05] hover:bg-white/[0.015] transition-colors group">
      <button onClick={() => navigate('/profile/' + c.users?.username)} className="flex-shrink-0 mt-0.5">
        {c.users?.avatar_url
          ? <img src={c.users.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xs">
              {c.users?.display_name?.[0]?.toUpperCase()}
            </div>
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap">
          <button onClick={() => navigate('/profile/' + c.users?.username)} className="text-white font-bold text-[13px] hover:underline">{c.users?.display_name}</button>
          {c.users?.is_verified && <span className="bg-[#1E6FFF] text-white text-[7px] px-1 py-0.5 rounded-full font-bold">✓</span>}
          {isAuthor && <span className="bg-[#1E6FFF]/20 text-[#1E6FFF] text-[9px] px-1.5 py-0.5 rounded-full font-bold">Author</span>}
          <span className="text-[#6B7280] text-[12px]">@{c.users?.username}</span>
          <span className="text-[#6B7280] text-[12px]">·</span>
          <span className="text-[#6B7280] text-[12px] whitespace-nowrap">{formatTime(c.created_at)}</span>
        </div>
        <p className="text-white/85 text-[14px] leading-snug break-words mt-0.5">
          <RichText text={c.body} onHashtag={t => navigate('/hashtag/'+t)} onMention={u => navigate('/profile/'+u)} />
        </p>
        {reactionCount > 0 && <span className="text-[11px] text-[#6B7280] mt-0.5 block">{myReaction || '❤️'} {reactionCount}</span>}
        <div className="flex items-center gap-1 mt-1 -ml-1.5">
          <button onClick={() => onReply(c)} className="flex items-center gap-1 text-[#6B7280] text-[12px] hover:text-[#1E6FFF] px-1.5 py-1 rounded-full hover:bg-[#1E6FFF]/10 transition-all">
            <MessageCircle size={12} /> Reply
          </button>
          <div className="relative" ref={pickerRef}>
            {showReactions && (
              <div className="absolute bottom-8 left-0 bg-[#111827] border border-white/10 rounded-full px-1.5 py-1.5 flex gap-1 z-30 shadow-2xl" style={{ minWidth:'max-content' }}>
                {COMMENT_REACTIONS.map(emoji => (
                  <button key={emoji} onClick={() => handleReact(emoji)}
                    className={`text-base hover:scale-125 transition-transform w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 ${myReaction === emoji ? 'bg-white/20' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => handleReact(myReaction || '❤️')}
              onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactions(true), 500); }}
              onMouseUp={() => clearTimeout(longPressTimer.current)}
              onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowReactions(true), 500); }}
              onTouchEnd={() => clearTimeout(longPressTimer.current)}
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-full hover:bg-red-500/10 transition-all"
              style={{ color: myReaction ? '#EF4444' : '#6B7280' }}>
              {myReaction ? <span className="text-[13px]">{myReaction}</span> : <Heart size={12} fill="none" />}
            </button>
          </div>
          {isMine && (
            <button onClick={() => onDelete(c.id)} className="text-[#6B7280] hover:text-red-400 px-1.5 py-1 rounded-full hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all ml-1">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { user, profile } = useAuth();

  const inputRef       = useRef();
  const emojiBtnRef    = useRef();
  const videoRef       = useRef();
  const longPressTimer = useRef();

  const [post,         setPost]        = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [comments,     setComments]    = useState([]);
  const [commentText,  setCommentText] = useState('');
  const [submitting,   setSubmitting]  = useState(false);
  const [replyTo,      setReplyTo]     = useState(null);
  const [commentCount, setCommentCount]= useState(0);

  const [liked,       setLiked]      = useState(false);
  const [reaction,    setReaction]   = useState(null);
  const [likesCount,  setLikesCount] = useState(0);
  const [saved,       setSaved]      = useState(false);
  const [reposted,    setReposted]   = useState(false);
  const [repostCount, setRepostCount]= useState(0);

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRepostMenu,     setShowRepostMenu]     = useState(false);
  const [showQuoteModal,     setShowQuoteModal]     = useState(false);
  const [quoteText,          setQuoteText]          = useState('');
  const [showMenu,    setShowMenu]   = useState(false);
  const [showEmoji,   setShowEmoji]  = useState(false);
  const [playing,     setPlaying]    = useState(false);
  const [muted,       setMuted]      = useState(false);

  useEffect(() => {
    fetchPost(); fetchComments(); checkActions(); recordView();
    return () => window.dispatchEvent(new Event('blink:comments:close'));
  }, [id]);

  useEffect(() => {
    const ch = supabase.channel('postdetail:' + id)
      .on('postgres_changes', { event:'*', schema:'public', table:'comments', filter:'post_id=eq.'+id }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  const recordView = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('posts').select('views_count').eq('id', id).maybeSingle();
      if (data != null) await supabase.from('posts').update({ views_count: (data.views_count||0)+1 }).eq('id', id);
    } catch (_) {}
  };

  const fetchPost = async () => {
    const { data } = await supabase.from('posts')
      .select('*, users(id,username,display_name,avatar_url,country,is_verified,badge_type)')
      .eq('id', id).maybeSingle();
    setPost(data);
    setLikesCount(data?.likes_count || 0);
    setRepostCount(data?.reposts_count || 0);
    setCommentCount(data?.comments_count || 0);
    setLoading(false);
  };

  const fetchComments = async () => {
    const uid = user?.id;
    const { data, error } = await supabase.from('comments')
      .select('*, users(id,username,display_name,avatar_url,is_verified,country)')
      .eq('post_id', id).is('parent_id', null)
      .order('created_at', { ascending: true }).limit(200);
    if (error || !data) return;

    let reactionMap = {}, countMap = {};
    if (uid && data.length > 0) {
      try {
        const ids = data.map(c => c.id);
        const { data: myR } = await supabase.from('comment_reactions').select('comment_id,emoji').eq('user_id', uid).in('comment_id', ids);
        const { data: allR } = await supabase.from('comment_reactions').select('comment_id').in('comment_id', ids);
        (myR  || []).forEach(r => { reactionMap[r.comment_id] = r.emoji; });
        (allR || []).forEach(r => { countMap[r.comment_id] = (countMap[r.comment_id] || 0) + 1; });
      } catch (_) {}
    }
    setComments(data.map(c => ({ ...c, my_reaction: reactionMap[c.id] || null, reaction_count: countMap[c.id] || 0 })));
    setCommentCount(data.length);
  };

  const checkActions = async () => {
    const uid = user?.id; if (!uid) return;
    try {
      const { data: ld } = await supabase.from('likes').select('reaction_type').eq('post_id', id).eq('user_id', uid).maybeSingle();
      if (ld) { setLiked(true); setReaction(ld.reaction_type); }
      const { data: sd } = await supabase.from('saved_posts').select('id').eq('post_id', id).eq('user_id', uid).maybeSingle();
      if (sd) setSaved(true);
      const { data: rd } = await supabase.from('posts').select('id').eq('user_id', uid).eq('quoted_post_id', id).eq('is_repost', true).maybeSingle();
      if (rd) setReposted(true);
    } catch (_) {}
  };

  const handleLike = useCallback(async (type = 'like') => {
    setShowReactionPicker(false);
    const uid = user?.id; if (!uid) return;
    if (liked && reaction === type) {
      setLiked(false); setReaction(null); setLikesCount(c => Math.max(0, c - 1));
      await supabase.from('likes').delete().eq('post_id', id).eq('user_id', uid);
      await supabase.from('posts').update({ likes_count: Math.max(0, likesCount - 1) }).eq('id', id);
    } else {
      if (!liked) {
        setLikesCount(c => c + 1);
        await supabase.from('posts').update({ likes_count: likesCount + 1 }).eq('id', id);
        if (post?.users?.id && post.users.id !== uid) {
          await supabase.from('notifications').upsert(
            { user_id: post.users.id, from_user_id: uid, type: 'like', message: 'liked your post', ref_id: id, is_read: false },
            { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
          );
        }
      }
      setLiked(true); setReaction(type);
      await supabase.from('likes').upsert({ post_id: id, user_id: uid, reaction_type: type }, { onConflict: 'post_id,user_id' });
    }
  }, [liked, reaction, likesCount, id, post, user]);

  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    const uid = user?.id; if (!uid) return;
    if (reposted) {
      setReposted(false); setRepostCount(c => Math.max(0, c - 1));
      await supabase.from('posts').delete().eq('user_id', uid).eq('quoted_post_id', id).eq('is_repost', true);
      await supabase.from('posts').update({ reposts_count: Math.max(0, repostCount - 1) }).eq('id', id);
    } else {
      setReposted(true); setRepostCount(c => c + 1);
      await supabase.from('posts').insert({ user_id: uid, caption: '', quoted_post_id: id, audience: 'public', is_draft: false, is_repost: true });
      await supabase.from('posts').update({ reposts_count: repostCount + 1 }).eq('id', id);
      if (post?.users?.id && post.users.id !== uid) {
        await supabase.from('notifications').upsert(
          { user_id: post.users.id, from_user_id: uid, type: 'repost', message: 'reposted your post', ref_id: id, is_read: false },
          { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
        );
      }
    }
  };

  const handleQuotePost = async () => {
    if (!quoteText.trim()) return;
    setShowQuoteModal(false);
    const uid = user?.id;
    await supabase.from('posts').insert({ user_id: uid, caption: quoteText.trim(), quoted_post_id: id, audience: 'public', is_draft: false, is_repost: false });
    await supabase.from('posts').update({ reposts_count: repostCount + 1 }).eq('id', id);
    setRepostCount(c => c + 1); setQuoteText('');
    if (post?.users?.id && post.users.id !== uid) {
      await supabase.from('notifications').upsert(
        { user_id: post.users.id, from_user_id: uid, type: 'repost', message: 'quoted your post', ref_id: id, is_read: false },
        { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
      );
    }
  };

  const handleSave = async () => {
    const uid = user?.id;
    if (saved) { setSaved(false); await supabase.from('saved_posts').delete().eq('post_id', id).eq('user_id', uid); }
    else { setSaved(true); await supabase.from('saved_posts').upsert({ post_id: id, user_id: uid, collection: 'Saved Posts' }, { onConflict: 'post_id,user_id' }); }
  };

  const handleShare = async () => {
    const url = window.location.origin + '/post/' + id;
    if (navigator.share) navigator.share({ title: 'B-Link Post', url });
    else { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    await supabase.from('posts').update({ shares_count: (post?.shares_count || 0) + 1 }).eq('id', id);
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    navigate(-1);
  };

  const handleComment = async () => {
    const body = commentText.trim();
    if (!body || submitting) return;
    setSubmitting(true); setShowEmoji(false);
    try {
      const { data } = await supabase.from('comments')
        .insert({ post_id: id, user_id: user?.id, body, parent_id: replyTo?.id || null })
        .select('*, users(id,username,display_name,avatar_url,is_verified,country)').single();
      if (data) {
        if (!replyTo) { setComments(prev => [...prev, { ...data, my_reaction: null, reaction_count: 0 }]); setCommentCount(c => c + 1); }
        if (post?.users?.id && post.users.id !== user?.id) {
          await supabase.from('notifications').upsert(
            { user_id: post.users.id, from_user_id: user?.id, type: 'comment', message: 'replied: "' + body.slice(0, 60) + '"', ref_id: id, is_read: false },
            { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
          );
        }
        const mentions = body.match(/@(\w+)/g) || [];
        for (const m of mentions) {
          const { data: mu } = await supabase.from('users').select('id').eq('username', m.slice(1)).maybeSingle();
          if (mu && mu.id !== user?.id) {
            await supabase.from('notifications').upsert(
              { user_id: mu.id, from_user_id: user?.id, type: 'mention', message: 'mentioned you: "' + body.slice(0, 60) + '"', ref_id: id, is_read: false },
              { onConflict: 'user_id,from_user_id,type,ref_id', ignoreDuplicates: true }
            );
          }
        }
      }
    } catch (err) { console.error('comment error:', err.message); }
    setCommentText(''); setReplyTo(null); setSubmitting(false);
    window.dispatchEvent(new Event('blink:comments:close'));
  };

  const handleDeleteComment = async (cid) => {
    await supabase.from('comments').delete().eq('id', cid);
    setComments(prev => prev.filter(c => c.id !== cid));
    setCommentCount(c => Math.max(0, c - 1));
  };

  const handleReply = (c) => {
    setReplyTo(c);
    setCommentText('@' + c.users?.username + ' ');
    setTimeout(() => inputRef.current?.focus(), 100);
    window.dispatchEvent(new Event('blink:comments:open'));
  };

  const insertEmoji = useCallback((emojiData) => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? commentText.length;
      const end   = el.selectionEnd   ?? commentText.length;
      const next  = commentText.slice(0, start) + emojiData.emoji + commentText.slice(end);
      setCommentText(next);
      setTimeout(() => { el.focus(); el.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length); }, 0);
    } else { setCommentText(t => t + emojiData.emoji); }
  }, [commentText]);

  const toggleVideo = () => {
    const v = videoRef.current; if (!v) return;
    if (playing) { v.pause(); setPlaying(false); } else v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const getReactionEmoji = () => REACTIONS.find(r => r.type === reaction)?.emoji || null;
  const getReactionColor = () => REACTIONS.find(r => r.type === reaction)?.color || '#6B7280';

  if (loading) return <div className="min-h-screen bg-[#0A1628] flex items-center justify-center"><div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" /></div>;
  if (!post)   return <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-3"><p className="text-5xl">🔍</p><p className="text-white font-bold text-lg">Post not found</p><button onClick={() => navigate(-1)} className="text-[#1E6FFF] text-sm">Go back</button></div>;

  const author  = post.users;
  const isOwner = author?.id === user?.id;
  const images  = post.media_urls || [];

  return (
    <div className="bg-[#0A1628] flex flex-col" style={{ minHeight:'100dvh' }}
      onClick={() => { setShowMenu(false); setShowReactionPicker(false); setShowRepostMenu(false); }}>

      {/* Quote modal */}
      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowQuoteModal(false)}>
          <div className="w-full max-w-[620px] bg-[#0d1f3c] border-t border-white/10 rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowQuoteModal(false)} className="text-[#6B7280] hover:text-white"><X size={20} /></button>
              <h3 className="text-white font-bold">Quote Post</h3>
              <button onClick={handleQuotePost} disabled={!quoteText.trim()} className="bg-[#1E6FFF] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40 hover:bg-[#1565cc] transition-colors">Post</button>
            </div>
            <textarea autoFocus value={quoteText} onChange={e => setQuoteText(e.target.value)} placeholder="Add a comment..." maxLength={500} rows={3} className="w-full bg-transparent text-white text-[16px] placeholder-[#6B7280] focus:outline-none resize-none leading-relaxed mb-3" />
            <div className="border border-white/15 rounded-2xl p-3 bg-white/[0.03]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-white font-bold text-[13px]">{author?.display_name}</span>
                <span className="text-[#6B7280] text-[12px]">@{author?.username}</span>
              </div>
              {post.caption && <p className="text-white/70 text-[13px] line-clamp-2">{post.caption}</p>}
              {images[0] && <img src={images[0]} alt="" className="w-full object-cover rounded-xl mt-2" style={{ maxHeight:80 }} />}
            </div>
            <div className="flex justify-end mt-2"><span className={`text-xs ${quoteText.length > 450 ? 'text-orange-400' : 'text-[#6B7280]'}`}>{quoteText.length}/500</span></div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-base">Post</h1>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 80 }}>

        <div className="px-4 pt-4 pb-0 border-b border-white/[0.07]">
          {/* Author */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/profile/' + author?.username)}>
                {author?.avatar_url
                  ? <img src={author.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-xl">{author?.display_name?.[0]?.toUpperCase()}</div>
                }
              </button>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => navigate('/profile/' + author?.username)} className="text-white font-bold text-[15px] hover:underline">{author?.display_name}</button>
                  {author?.is_verified && <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓</span>}
                </div>
                <p className="text-[#6B7280] text-sm">@{author?.username} {flagMap[author?.country] || ''}</p>
              </div>
            </div>
            <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowMenu(!showMenu)} className="text-[#6B7280] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"><MoreHorizontal size={20} /></button>
              {showMenu && (
                <div className="absolute right-0 top-9 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-44 shadow-2xl">
                  {isOwner
                    ? <button onClick={handleDeletePost} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm"><Trash2 size={14} /> Delete post</button>
                    : <>
                        <button onClick={() => setShowMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5"><Flag size={14} className="text-[#6B7280]" /> Report post</button>
                        <button onClick={() => setShowMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm"><UserX size={14} className="text-[#6B7280]" /> Block @{author?.username}</button>
                      </>
                  }
                </div>
              )}
            </div>
          </div>

          {/* Caption */}
          {post.caption && (
            <div className={!images.length && !post.video_url && post.bg_color ? 'rounded-2xl py-10 px-6 text-center mb-4' : 'mb-4'}
              style={{ background: !images.length && !post.video_url && post.bg_color ? post.bg_color : 'transparent' }}>
              <p className={'leading-relaxed break-words text-[17px] whitespace-pre-wrap ' + (!images.length && !post.video_url && post.bg_color ? 'text-white font-bold text-xl text-center' : 'text-white')}>
                <RichText text={post.caption} onHashtag={t => navigate('/hashtag/'+t)} onMention={u => navigate('/profile/'+u)} />
              </p>
            </div>
          )}

          {/* Video */}
          {post.video_url && (
            <div className="relative rounded-2xl overflow-hidden bg-black mb-4 border border-white/10" style={{ aspectRatio:'16/9' }}>
              <video ref={videoRef} src={post.video_url} poster={post.video_thumbnail} muted={muted} playsInline preload="metadata" loop className="w-full h-full object-cover" onEnded={() => setPlaying(false)} />
              <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleVideo}>
                {!playing && <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"><Play size={30} color="white" fill="white" style={{ marginLeft:3 }} /></div>}
              </div>
              <button onClick={e => { e.stopPropagation(); setMuted(!muted); }} className="absolute bottom-3 right-3 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center">
                {muted ? <VolumeX size={16} color="white" /> : <Volume2 size={16} color="white" />}
              </button>
              {post.video_duration && (
                <div className="absolute bottom-3 left-3 bg-black/60 rounded-full px-2.5 py-0.5">
                  <span className="text-white text-xs font-medium">{Math.floor(post.video_duration/60)}:{String(post.video_duration%60).padStart(2,'0')}</span>
                </div>
              )}
            </div>
          )}

          <MediaGrid images={images} />

          {/* Timestamp */}
          <div className="flex flex-wrap items-center gap-x-2 mb-3 text-[#6B7280] text-sm">
            <span>{new Date(post.created_at).toLocaleString('en-KE',{ hour:'2-digit', minute:'2-digit', month:'short', day:'numeric', year:'numeric' })}</span>
            {post.location && <><span>·</span><span>📍 {post.location}</span></>}
            {(post.views_count||0) > 0 && <><span>·</span><span>{formatNumber(post.views_count)} views</span></>}
          </div>

          {/* Engagement counts */}
          {(repostCount > 0 || likesCount > 0 || commentCount > 0 || (post.shares_count||0) > 0) && (
            <div className="flex items-center gap-5 py-3 border-y border-white/[0.07] mb-1">
              {repostCount  > 0 && <div><span className="text-white font-bold">{formatNumber(repostCount)}</span><span className="text-[#6B7280] text-sm ml-1">Reposts</span></div>}
              {likesCount   > 0 && <div><span className="text-white font-bold">{formatNumber(likesCount)}</span><span className="text-[#6B7280] text-sm ml-1">Likes</span></div>}
              {commentCount > 0 && <div><span className="text-white font-bold">{formatNumber(commentCount)}</span><span className="text-[#6B7280] text-sm ml-1">Replies</span></div>}
              {(post.shares_count||0) > 0 && <div><span className="text-white font-bold">{formatNumber(post.shares_count)}</span><span className="text-[#6B7280] text-sm ml-1">Shares</span></div>}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between py-1 -mx-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => { inputRef.current?.focus(); window.dispatchEvent(new Event('blink:comments:open')); }} className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all"><MessageCircle size={20} /></button>
            <div className="relative" onClick={e => e.stopPropagation()}>
              {showRepostMenu && (
                <div className="absolute bottom-12 left-0 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-30 shadow-2xl" style={{ minWidth:180 }}>
                  <button onClick={handleDirectRepost} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-sm border-b border-white/5" style={{ color: reposted ? '#2ECC71' : 'white' }}>
                    <Repeat2 size={16} style={{ color: reposted ? '#2ECC71' : '#6B7280' }} />{reposted ? 'Undo Repost' : 'Repost'}
                  </button>
                  <button onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-white text-sm">
                    <Quote size={16} className="text-[#6B7280]" /> Quote
                  </button>
                </div>
              )}
              <button onClick={() => { setShowRepostMenu(!showRepostMenu); setShowMenu(false); setShowReactionPicker(false); }}
                className={'px-2 py-2 rounded-full transition-all ' + (reposted ? 'text-[#2ECC71] hover:bg-[#2ECC71]/10' : 'text-[#6B7280] hover:text-[#2ECC71] hover:bg-[#2ECC71]/10')}>
                <Repeat2 size={20} />
              </button>
            </div>
            <div className="relative" onClick={e => e.stopPropagation()}>
              {showReactionPicker && (
                <div className="absolute bottom-12 left-0 bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1.5 z-30 shadow-2xl" style={{ minWidth:'max-content', animation:'slideUpPicker 0.15s ease-out' }}>
                  {REACTIONS.map(r => <button key={r.type} onClick={() => handleLike(r.type)} className="text-xl hover:scale-125 transition-transform w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10">{r.emoji}</button>)}
                </div>
              )}
              <button
                onClick={() => handleLike(reaction || 'like')}
                onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                onMouseUp={() => clearTimeout(longPressTimer.current)}
                onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
                className="px-2 py-2 rounded-full transition-all hover:bg-red-500/10"
                style={{ color: liked ? getReactionColor() : '#6B7280' }}>
                {liked && reaction ? <span className="text-xl leading-none">{getReactionEmoji()}</span> : <Heart size={20} fill={liked ? 'currentColor' : 'none'} />}
              </button>
            </div>
            <button className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all"><BarChart2 size={20} /></button>
            <button onClick={handleSave} className={'px-2 py-2 rounded-full transition-all ' + (saved ? 'text-[#1E6FFF] hover:bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}><Bookmark size={20} fill={saved ? 'currentColor' : 'none'} /></button>
            <button onClick={handleShare} className="text-[#6B7280] hover:text-[#1E6FFF] px-2 py-2 rounded-full hover:bg-[#1E6FFF]/10 transition-all"><Share2 size={20} /></button>
          </div>
        </div>

        {/* Comments */}
        {comments.length === 0
          ? <div className="text-center py-12 px-6"><p className="text-3xl mb-2">💬</p><p className="text-white font-bold">No replies yet</p><p className="text-[#6B7280] text-sm mt-1">Be the first to reply!</p></div>
          : comments.map(c => <CommentRow key={c.id} c={c} postAuthorId={post.user_id} currentUserId={user?.id} onReply={handleReply} onDelete={handleDeleteComment} navigate={navigate} />)
        }
      </div>

      {/* Fixed bottom input */}
      <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:'620px', zIndex:40, background:'#0d1f3c', borderTop:'1px solid rgba(255,255,255,0.1)' }}>
        {replyTo && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', background:'rgba(30,111,255,0.06)' }}>
            <div style={{ width:2, height:28, background:'#1E6FFF', borderRadius:2, flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:'#1E6FFF', fontSize:11, fontWeight:700 }}>Replying to @{replyTo.users?.username}</p>
              <p style={{ color:'#6B7280', fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{replyTo.body}</p>
            </div>
            <button onClick={() => { setReplyTo(null); setCommentText(''); }} style={{ color:'#6B7280', background:'none', border:'none', cursor:'pointer', padding:4 }}><X size={14} /></button>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', paddingBottom:'max(12px, env(safe-area-inset-bottom))' }}>
          <div style={{ flexShrink:0 }}><Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} /></div>
          <div style={{ flex:'1 1 auto', minWidth:0, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:22, padding:'9px 14px', display:'flex', alignItems:'center', gap:8 }}>
            <input
              ref={inputRef}
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleComment(); } }}
              onFocus={() => window.dispatchEvent(new Event('blink:comments:open'))}
              onBlur={() => setTimeout(() => { if (!showEmoji) window.dispatchEvent(new Event('blink:comments:close')); }, 250)}
              placeholder={replyTo ? 'Reply to @' + replyTo.users?.username + '...' : 'Post your reply...'}
              style={{ flex:1, minWidth:0, background:'transparent', border:'none', outline:'none', color:'white', fontSize:15, fontFamily:'inherit' }}
            />
            <button
              ref={emojiBtnRef}
              type="button"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setShowEmoji(v => !v); }}
              style={{ background:'none', border:'none', cursor:'pointer', flexShrink:0, padding:2, lineHeight:0 }}
            >
              <SmilePlus size={18} style={{ color: showEmoji ? '#FFD700' : 'rgba(255,255,255,0.4)', display:'block' }} />
            </button>
          </div>
          <button
            type="button" onClick={handleComment}
            disabled={submitting || !commentText.trim()}
            style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background: (!submitting && commentText.trim()) ? '#1E6FFF' : 'rgba(30,111,255,0.35)', border:'none', cursor: commentText.trim() ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' }}>
            <Send size={15} style={{ color:'white', marginLeft:1 }} />
          </button>
        </div>
      </div>

      {/* Smart emoji picker — positions itself dynamically */}
      <SmartEmojiPicker
        open={showEmoji}
        onClose={() => setShowEmoji(false)}
        onEmojiClick={insertEmoji}
        triggerRef={emojiBtnRef}
        width={300}
        height={350}
      />
    </div>
  );
}