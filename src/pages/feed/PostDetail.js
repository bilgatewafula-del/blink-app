import { useState, useEffect, useRef, useCallback } from 'react';
import VerifiedBadge from '../../components/VerifiedBadge';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { CommentsPanel } from '../../components/post/Comments';
import { toggleSave } from '../../lib/posts';
import TextPost, { isColoredTextPost } from '../../components/post/TextPost';
import { ShareSheet, InsightsSheet } from '../../components/post/Sheets';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, Heart, MessageCircle, Repeat2, Share2,
  MoreHorizontal, Bookmark, BarChart2, Trash2, Flag,
  UserX, Volume2, VolumeX, Play, X, Send, SmilePlus, Quote,
  ChevronDown,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import SmartEmojiPicker from '../../components/SmartEmojiPicker';
import { goBack } from '../../lib/nav';

const POST_SELECT = `
  id, caption, media_urls, video_url, video_duration, video_thumbnail,
  post_type, hashtags, location, bg_color, audience, status, is_draft,
  is_repost, quoted_post_id, likes_count, comments_count, reposts_count,
  views_count, shares_count, created_at, user_id,
  users!posts_user_id_fkey (
    id, username, display_name, avatar_url, country, is_verified, role, badge_type
  )
`.trim();

// reaction_count is now maintained server-side by a trigger (see
// 28_relationship_and_postdetail_rpcs.sql) instead of being computed
// client-side from a second query that pulled every reaction row for
// every comment on the post.
const COMMENT_SELECT = `
  id, body, parent_id, post_id, user_id, created_at, status,
  reaction_count, reply_count,
  users!comments_user_id_fkey (
    id, username, display_name, avatar_url, is_verified, country
  )
`.trim();

const COMMENTS_PAGE_SIZE = 30;

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

const REACTIONS = [
  { emoji:'❤️', type:'like',  color:'#EF4444' },
  { emoji:'😂', type:'haha',  color:'#FFD700' },
  { emoji:'😮', type:'wow',   color:'#7C3AED' },
  { emoji:'😢', type:'sad',   color:'#64748B' },
  { emoji:'😡', type:'angry', color:'#EF4444' },
  { emoji:'🔥', type:'fire',  color:'#7C3AED' },
];

const COMMENT_REACTIONS = ['❤️','😂','😮','😢','🔥','👍'];

function RichText({ text, onHashtag, onMention }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(#\w+|@\w+)/g).map((p, i) => {
        if (p.startsWith('#')) return <button key={i} onClick={() => onHashtag(p.slice(1))} className="text-[#6D28D9] hover:underline font-medium">{p}</button>;
        if (p.startsWith('@')) return <button key={i} onClick={() => onMention(p.slice(1))} className="text-[#6D28D9] hover:underline font-medium">{p}</button>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function MediaGrid({ images }) {
  if (!images?.length) return null;
  const n = images.length;
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-[#E2E8F0]">
      {n === 1 && <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight:500 }} loading="lazy" />}
      {n === 2 && <div className="grid grid-cols-2 gap-[2px]">{images.map((img,i) => <img key={i} src={img} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} loading="lazy" />)}</div>}
      {n === 3 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr' }}>
          <img src={images[0]} alt="" className="row-span-2 w-full h-full object-cover" style={{ aspectRatio:'1/2' }} loading="lazy" />
          <img src={images[1]} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} loading="lazy" />
          <img src={images[2]} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} loading="lazy" />
        </div>
      )}
      {n >= 4 && (
        <div className="grid grid-cols-2 gap-[2px]">
          {images.slice(0,4).map((img,i) => (
            <div key={i} className="relative">
              <img src={img} alt="" className="w-full object-cover" style={{ aspectRatio:'1/1' }} loading="lazy" />
              {i === 3 && n > 4 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-[#111827] font-bold text-2xl">+{n-4}</span></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One comment row, now able to show/load its own replies —
   previously the "Reply" button created a real child comment in the
   database that the UI then never fetched or displayed anywhere,
   under any circumstance. ──────────────────────────────────────── */
function CommentRow({ c, postAuthorId, currentUserId, onReply, onDelete, navigate, depth = 0 }) {
  const [showReactions, setShowReactions] = useState(false);
  const [myReaction,    setMyReaction]    = useState(c.my_reaction || null);
  const [reactionCount, setReactionCount] = useState(c.reaction_count || 0);
  const [replies,       setReplies]       = useState(null); // null = not loaded
  const [loadingReplies,setLoadingReplies]= useState(false);
  const longPressTimer = useRef();
  const pickerRef      = useRef();

  const cUser = c['users!comments_user_id_fkey'] || c.users || {};
  const isAuthor = c.user_id === postAuthorId;
  const isMine   = c.user_id === currentUserId;

  useEffect(() => {
    if (!showReactions) return;
    const h = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowReactions(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showReactions]);

  const handleReact = async (emoji) => {
    setShowReactions(false);
    const prevReaction = myReaction, prevCount = reactionCount;
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
    } catch (err) {
      setMyReaction(prevReaction); setReactionCount(prevCount);
      console.error('comment reaction:', err.message);
    }
  };

  const loadReplies = async () => {
    if (replies !== null) { setReplies(null); return; } // toggle closed
    setLoadingReplies(true);
    const { data } = await supabase.from('comments')
      .select(COMMENT_SELECT)
      .eq('parent_id', c.id)
      .neq('status', 'deleted')
      .order('created_at', { ascending: true });
    setReplies((data || []).map(r => ({ ...r, users: r['users!comments_user_id_fkey'] || r.users })));
    setLoadingReplies(false);
  };

  return (
    <div>
      <div className="flex gap-2.5 px-4 py-2.5 border-b border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors group" style={depth > 0 ? { paddingLeft: 16 + depth * 32 } : undefined}>
        <button onClick={() => navigate('/profile/' + cUser.username)} className="flex-shrink-0 mt-0.5">
          {cUser.avatar_url
            ? <img src={cUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            : <div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-white font-bold text-xs">{cUser.display_name?.[0]?.toUpperCase()}</div>
          }
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 flex-wrap">
            <button onClick={() => navigate('/profile/' + cUser.username)} className="text-[#111827] font-bold text-[13px] hover:underline">{cUser.display_name}</button>
            {cUser.is_verified && <VerifiedBadge size={14} />}
            {isAuthor && <span className="bg-[#7C3AED]/20 text-[#6D28D9] text-[9px] px-1.5 py-0.5 rounded-full font-bold">Author</span>}
            <span className="text-[#64748B] text-[12px]">@{cUser.username}</span>
            <span className="text-[#64748B] text-[12px]">·</span>
            <span className="text-[#64748B] text-[12px] whitespace-nowrap">{formatTime(c.created_at)}</span>
          </div>
          <p className="text-[#111827] text-[14px] leading-snug break-words mt-0.5">
            <RichText text={c.body} onHashtag={t => navigate('/hashtag/'+t)} onMention={u => navigate('/profile/'+u)} />
          </p>
          {reactionCount > 0 && <span className="text-[11px] text-[#64748B] mt-0.5 block">{myReaction || '❤️'} {reactionCount}</span>}
          <div className="flex items-center gap-1 mt-1 -ml-1.5">
            <button onClick={() => onReply(c)} className="flex items-center gap-1 text-[#64748B] text-[12px] hover:text-[#6D28D9] px-1.5 py-1 rounded-full hover:bg-[#7C3AED]/10 transition-all">
              <MessageCircle size={12} /> Reply
            </button>
            <div className="relative" ref={pickerRef}>
              {showReactions && (
                <div className="absolute bottom-8 left-0 bg-white border border-[#E2E8F0] rounded-full px-1.5 py-1.5 flex gap-1 z-30 shadow-2xl" style={{ minWidth:'max-content' }}>
                  {COMMENT_REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => handleReact(emoji)}
                      className={`text-base hover:scale-125 transition-transform w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#F1F5F9] ${myReaction === emoji ? 'bg-[#E2E8F0]':''}`}>
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
                style={{ color: myReaction ? '#EF4444' : '#64748B' }}>
                {myReaction ? <span className="text-[13px]">{myReaction}</span> : <Heart size={12} fill="none" />}
              </button>
            </div>
            {isMine && (
              <button onClick={() => onDelete(c.id)} className="text-[#64748B] hover:text-red-600 px-1.5 py-1 rounded-full hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all ml-1">
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {depth === 0 && c.reply_count > 0 && (
            <button onClick={loadReplies} className="flex items-center gap-1 text-[#6D28D9] text-[12px] font-semibold mt-1.5">
              <div className="w-6 h-px bg-[#E2E8F0]" />
              {loadingReplies ? 'Loading...' : replies === null
                ? `View ${c.reply_count} repl${c.reply_count === 1 ? 'y' : 'ies'}`
                : 'Hide replies'}
              <ChevronDown size={12} className={replies !== null ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
          )}
        </div>
      </div>

      {replies && replies.map(r => (
        <CommentRow key={r.id} c={r} postAuthorId={postAuthorId} currentUserId={currentUserId}
          onReply={onReply} onDelete={onDelete} navigate={navigate} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function PostDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();
  const [shareOpen, setShareOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(searchParams.get('tab') === 'insights');
  const { user, profile } = useAuth();

  const inputRef       = useRef();
  const emojiBtnRef    = useRef();
  const videoRef       = useRef();
  const longPressTimer = useRef();
  const viewRecordedRef = useRef(false); // guards against double-firing on re-render/strict-mode

  const [post,         setPost]        = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [fetchError,   setFetchError]  = useState('');
  const [comments,     setComments]    = useState([]);
  const [commentsPage, setCommentsPage]= useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(true);
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
  const [viewsCount,  setViewsCount] = useState(0);

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showRepostMenu,     setShowRepostMenu]     = useState(false);
  const [showQuoteModal,     setShowQuoteModal]     = useState(false);
  const [quoteText,          setQuoteText]          = useState('');
  const [showMenu,    setShowMenu]   = useState(false);
  const [showEmoji,   setShowEmoji]  = useState(false);
  const [playing,     setPlaying]    = useState(false);
  const [muted,       setMuted]      = useState(false);
  const [actionToast, setActionToast]= useState('');

  const showToast = (msg) => { setActionToast(msg); setTimeout(() => setActionToast(''), 2000); };

  useEffect(() => {
    viewRecordedRef.current = false;
    fetchPost();
    fetchComments(0, true);
    checkActions();
    recordView();
    return () => window.dispatchEvent(new Event('blink:comments:close'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const ch = supabase.channel('postdetail:' + id)
      .on('postgres_changes', { event:'*', schema:'public', table:'comments', filter:'post_id=eq.'+id },
        () => fetchComments(0, true))
      .subscribe();
    return () => supabase.removeChannel(ch); // was already correctly cleaned up
  }, [id]);

  // Was: read views_count, write views_count+1 — a lost-update race
  // under concurrent viewers, and re-firing on every remount/refresh
  // counted the same person's view repeatedly. Now one atomic RPC,
  // deduped per viewer at the database level (see post_views table +
  // record_post_view() in the SQL file), with a ref guard so React
  // 18 strict-mode's double-invoke in dev doesn't fire it twice.
  const recordView = async () => {
    if (!user || viewRecordedRef.current) return;
    viewRecordedRef.current = true;
    try {
      const { data } = await supabase.rpc('record_post_view', { p_post_id: id });
      if (typeof data === 'number') setViewsCount(data);
    } catch (_) { /* non-critical */ }
  };

  const fetchPost = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle();

      if (error) { setFetchError(error.message); setLoading(false); return; }
      if (!data)  { setFetchError('not_found'); setLoading(false); return; }

      const normalised = { ...data, users: data['users!posts_user_id_fkey'] || data.users || null };
      setPost(normalised);
      setLikesCount(normalised.likes_count || 0);
      setRepostCount(normalised.reposts_count || 0);
      setCommentCount(normalised.comments_count || 0);
      setViewsCount(normalised.views_count || 0);
    } catch (err) {
      setFetchError(err.message);
    }
    setLoading(false);
  };

  // Paginated — was capped at 200 but unpaginated, all loaded at once
  // regardless of how many there actually were.
  const fetchComments = async (page = 0, reset = false) => {
    const uid = user?.id;
    try {
      const from = page * COMMENTS_PAGE_SIZE;
      const to   = from + COMMENTS_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', id)
        .is('parent_id', null)
        .neq('status', 'deleted')
        .order('created_at', { ascending: true })
        .range(from, to);

      if (error) { console.error('Comments error:', error.message); return; }

      let rows = (data || []).map(c => ({ ...c, users: c['users!comments_user_id_fkey'] || c.users || {} }));

      // Single query for "my reaction" only — reaction_count is now a
      // maintained column, so the second query that used to pull
      // every reaction row across every comment (to count them
      // client-side) is gone entirely.
      if (uid && rows.length > 0) {
        const ids = rows.map(c => c.id);
        const { data: myR } = await supabase.from('comment_reactions').select('comment_id,emoji').eq('user_id', uid).in('comment_id', ids);
        const reactionMap = {};
        (myR || []).forEach(r => { reactionMap[r.comment_id] = r.emoji; });
        rows = rows.map(c => ({ ...c, my_reaction: reactionMap[c.id] || null }));
      }

      setComments(prev => reset ? rows : [...prev, ...rows]);
      setCommentsHasMore(rows.length === COMMENTS_PAGE_SIZE);
    } catch (err) {
      console.error('fetchComments:', err.message);
    }
  };

  const handleLoadMoreComments = () => {
    const next = commentsPage + 1;
    setCommentsPage(next);
    fetchComments(next);
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

  // All of the handlers below now call the exact same RPCs PostCard
  // uses (see 17_post_interaction_rpcs.sql) instead of PostDetail's
  // own separate copies of the same logic, which had the identical
  // read-then-write race PostCard's originally had. One source of
  // truth for post interactions instead of two places that could
  // drift apart.
  const handleLike = useCallback(async (type = 'like') => {
    setShowReactionPicker(false);
    const prevLiked = liked, prevReaction = reaction, prevCount = likesCount;
    const willUnlike = liked && reaction === type;
    setLiked(!willUnlike);
    setReaction(willUnlike ? null : type);
    setLikesCount(c => willUnlike ? Math.max(0, c - 1) : (liked ? c : c + 1));
    try {
      const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: id, p_reaction_type: type });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setLiked(row.liked); setReaction(row.reaction); setLikesCount(row.likes_count); }
    } catch (err) {
      setLiked(prevLiked); setReaction(prevReaction); setLikesCount(prevCount);
      showToast('Couldn\u2019t update like — try again');
    }
  }, [liked, reaction, likesCount, id]);

  const handleDirectRepost = async () => {
    setShowRepostMenu(false);
    const prevReposted = reposted, prevCount = repostCount;
    setReposted(!reposted);
    setRepostCount(c => reposted ? Math.max(0, c - 1) : c + 1);
    try {
      const { data, error } = await supabase.rpc('toggle_post_repost', { p_post_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) { setReposted(row.reposted); setRepostCount(row.reposts_count); }
    } catch (err) {
      setReposted(prevReposted); setRepostCount(prevCount);
      showToast('Couldn\u2019t update repost — try again');
    }
  };

  const handleQuotePost = async () => {
    if (!quoteText.trim()) return;
    setShowQuoteModal(false);
    const text = quoteText.trim();
    setQuoteText('');
    try {
      const { error } = await supabase.rpc('create_quote_post', { p_post_id: id, p_caption: text });
      if (error) throw error;
      setRepostCount(c => c + 1);
      showToast('✅ Quoted!');
    } catch (err) {
      showToast('Quote failed — try again');
    }
  };

  const handleSave = async () => {
    const prevSaved = saved;
    setSaved(!saved);
    try {
      setSaved(await toggleSave(id, prevSaved));
    } catch (err) {
      setSaved(prevSaved);
      showToast('Couldn\u2019t update — try again');
    }
  };

  const handleShare = () => setShareOpen(true);

  // Was a raw delete with no permission check beyond RLS and no
  // cleanup of dependent rows. Now the same delete_own_post RPC
  // AdminPanel/PostCard use.
  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      const { error } = await supabase.rpc('delete_own_post', { p_post_id: id });
      if (error) throw error;
      goBack(navigate, '/');
    } catch (err) {
      showToast('Delete failed — try again');
    }
  };

  const handleComment = async () => {
    const body = commentText.trim();
    if (!body || submitting) return;
    setSubmitting(true); setShowEmoji(false);
    const postUserId = post?.users?.id || post?.user_id;
    const parentId = replyTo?.id || null;
    try {
      const { data, error } = await supabase.from('comments')
        .insert({ post_id: id, user_id: user?.id, body, parent_id: parentId })
        .select(COMMENT_SELECT).single();
      if (error) throw error;

      if (data) {
        const row = { ...data, users: data['users!comments_user_id_fkey']||data.users||{}, my_reaction: null };
        if (!parentId) {
          // Top-level — append to the list as before.
          setComments(prev => [...prev, row]);
          setCommentCount(c => c + 1);
        } else {
          // Was: silently dropped from state entirely for any reply —
          // the comment existed in the database with no way to see it
          // without reloading. Now bumps the parent's reply_count
          // locally so "View N replies" shows up immediately; the
          // actual reply list lazy-loads when that's tapped (same as
          // any other comment's replies), which also means every
          // client doesn't need to eagerly fetch nested replies for
          // every comment on every page load.
          setComments(prev => prev.map(c => c.id === parentId ? { ...c, reply_count: (c.reply_count || 0) + 1 } : c));
        }

        if (postUserId && postUserId !== user?.id) {
          await supabase.from('notifications').insert({
            user_id: postUserId, from_user_id: user?.id, type:'comment',
            message: (parentId ? 'replied: "' : 'commented: "') + body.slice(0,60) + '"',
            ref_id: id, preview_text: body.slice(0,60), is_read: false,
          });
        }
        const mentions = body.match(/@(\w+)/g) || [];
        for (const m of mentions) {
          const { data: mu } = await supabase.from('users').select('id').eq('username', m.slice(1)).maybeSingle();
          if (mu && mu.id !== user?.id) {
            await supabase.from('notifications').insert({ user_id: mu.id, from_user_id: user?.id, type:'mention', message:'mentioned you: "'+body.slice(0,60)+'"', ref_id: id, is_read: false });
          }
        }
      }
    } catch (err) {
      console.error('comment error:', err.message);
      showToast('Couldn\u2019t post — try again');
    }
    setCommentText(''); setReplyTo(null); setSubmitting(false);
    window.dispatchEvent(new Event('blink:comments:close'));
  };

  // Was a raw delete with no permission validation beyond RLS. Now
  // routes through delete_post_comment(), which also allows the post
  // owner to remove comments on their own post (basic moderation
  // capability that didn't exist before at all) and cleans up that
  // comment's reactions.
  const handleDeleteComment = async (cid) => {
    try {
      const { error } = await supabase.rpc('delete_post_comment', { p_comment_id: cid });
      if (error) throw error;
      setComments(prev => prev.filter(c => c.id !== cid));
      setCommentCount(c => Math.max(0, c - 1));
    } catch (err) {
      showToast('Delete failed — try again');
    }
  };

  const handleReply = (c) => {
    setReplyTo(c);
    setCommentText('@' + (c.users?.username||'') + ' ');
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
      setTimeout(() => { el.focus(); el.setSelectionRange(start+emojiData.emoji.length, start+emojiData.emoji.length); }, 0);
    } else { setCommentText(t => t + emojiData.emoji); }
  }, [commentText]);

  const toggleVideo = () => {
    const v = videoRef.current; if (!v) return;
    if (playing) { v.pause(); setPlaying(false); } else v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const getReactionEmoji = () => REACTIONS.find(r => r.type === reaction)?.emoji || null;
  const getReactionColor = () => REACTIONS.find(r => r.type === reaction)?.color || '#64748B';

  if (loading) return (
    <div className="min-h-screen bg-[#E6E9F6] flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (fetchError === 'not_found' || !post) return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col items-center justify-center gap-3 px-6">
      <p className="text-5xl">🔍</p>
      <p className="text-[#111827] font-bold text-lg">Post not found</p>
      <p className="text-[#64748B] text-sm text-center">This post may have been deleted or is unavailable.</p>
      <button onClick={() => goBack(navigate, '/')} className="mt-2 text-[#6D28D9] font-semibold text-sm">← Go back</button>
    </div>
  );

  if (fetchError) return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col items-center justify-center gap-3 px-6">
      <p className="text-5xl">⚠️</p>
      <p className="text-[#111827] font-bold text-lg">Could not load post</p>
      <p className="text-[#64748B] text-sm text-center">{fetchError}</p>
      <button onClick={fetchPost} className="mt-2 bg-[#7C3AED] text-white px-5 py-2 rounded-full font-bold text-sm">Try again</button>
      <button onClick={() => goBack(navigate, '/')} className="text-[#64748B] text-sm">← Go back</button>
    </div>
  );

  const images   = post.media_urls || [];
  const isOwner  = (post.users?.id || post.user_id) === user?.id;

  return (
    <div className="min-h-screen bg-[#E6E9F6] pb-32">
      {actionToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-[#E2E8F0] backdrop-blur border border-[#E2E8F0] rounded-full px-5 py-2.5 pointer-events-none">
          <p className="text-[#111827] text-sm font-semibold whitespace-nowrap">{actionToast}</p>
        </div>
      )}

      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={() => setShowQuoteModal(false)}>
          <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowQuoteModal(false)} aria-label="Close" className="text-[#64748B] hover:text-[#111827]"><X size={20} /></button>
              <h3 className="text-[#111827] font-bold">Quote Post</h3>
              <button onClick={handleQuotePost} disabled={!quoteText.trim()}
                className="bg-[#7C3AED] text-white text-sm font-bold px-4 py-1.5 rounded-full disabled:opacity-40">Post</button>
            </div>
            <textarea autoFocus value={quoteText} onChange={e => setQuoteText(e.target.value)}
              placeholder="Add a comment..." maxLength={500} rows={3}
              className="w-full bg-transparent text-[#111827] text-[16px] placeholder-[#94A3B8] focus:outline-none resize-none leading-relaxed mb-3" />
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center justify-between">
        <button onClick={() => goBack(navigate, '/')} aria-label="Back" className="text-[#CBD5E1] hover:text-white transition-colors"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-[15px]">Post</h1>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} aria-label="Post options" className="text-[#CBD5E1] hover:text-white p-1"><MoreHorizontal size={20} /></button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-white/15 rounded-2xl overflow-hidden shadow-xl z-30" style={{ minWidth:180 }} onClick={e => e.stopPropagation()}>
              {isOwner ? (
                <button onClick={handleDeletePost} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-600 text-sm"><Trash2 size={15} /> Delete Post</button>
              ) : (
                <>
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F1F5F9] text-[#111827] text-sm"><Flag size={15} className="text-[#64748B]" /> Report Post</button>
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 text-red-600 text-sm"><UserX size={15} /> Block User</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/profile/' + post.users?.username)}><Avatar url={post.users?.avatar_url} name={post.users?.display_name} size={11} /></button>
          <div className="flex-1 min-w-0">
            <button onClick={() => navigate('/profile/' + post.users?.username)} className="flex items-center gap-1 flex-wrap text-left">
              <span className="text-[#111827] font-bold text-[15px]">{post.users?.display_name}</span>
              {post.users?.is_verified && <VerifiedBadge size={15} />}
              {post.users?.role === 'blink' && <span className="text-xs">👑</span>}
              {flagMap[post.users?.country] && <span className="text-xs">{flagMap[post.users.country]}</span>}
            </button>
            <p className="text-[#64748B] text-[13px]">@{post.users?.username}</p>
          </div>
        </div>

        {post.caption && isColoredTextPost(post) && (
          <div className="mb-3">
            <TextPost text={post.caption} bg={post.bg_color} onHashtag={t => navigate('/hashtag/'+t)} onMention={u => navigate('/profile/'+u)} />
          </div>
        )}
        {post.caption && !isColoredTextPost(post) && (
          <div className="mb-3">
            <p className="text-[#111827] text-[17px] leading-relaxed whitespace-pre-wrap break-words">
              <RichText text={post.caption} onHashtag={t => navigate('/hashtag/'+t)} onMention={u => navigate('/profile/'+u)} />
            </p>
          </div>
        )}

        {post.video_url && (
          <div className="relative rounded-2xl overflow-hidden bg-black mb-3 border border-[#E2E8F0]" style={{ aspectRatio:'16/9' }}>
            <video ref={videoRef} src={post.video_url} poster={post.video_thumbnail} muted={muted} playsInline className="w-full h-full object-cover" onEnded={() => setPlaying(false)} />
            <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleVideo}>
              {!playing && <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center"><Play size={30} color="white" fill="white" style={{ marginLeft:3 }} /></div>}
            </div>
            <button onClick={e => { e.stopPropagation(); setMuted(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'} className="absolute bottom-3 right-3 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center">
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

        <div className="flex flex-wrap items-center gap-x-2 mb-3 text-[#64748B] text-sm">
          <span>{new Date(post.created_at).toLocaleString('en-KE',{ hour:'2-digit', minute:'2-digit', month:'short', day:'numeric', year:'numeric' })}</span>
          {post.location && <><span>·</span><span>📍 {post.location}</span></>}
          {viewsCount > 0 && <><span>·</span><span>{formatNumber(viewsCount)} views</span></>}
        </div>

        {(repostCount > 0 || likesCount > 0 || commentCount > 0 || (post.shares_count||0) > 0) && (
          <div className="flex items-center gap-5 py-3 border-y border-[#E2E8F0] mb-1">
            {repostCount  > 0 && <div><span className="text-[#111827] font-bold">{formatNumber(repostCount)}</span><span className="text-[#64748B] text-sm ml-1">Reposts</span></div>}
            {likesCount   > 0 && <div><span className="text-[#111827] font-bold">{formatNumber(likesCount)}</span><span className="text-[#64748B] text-sm ml-1">Likes</span></div>}
            {commentCount > 0 && <div><span className="text-[#111827] font-bold">{formatNumber(commentCount)}</span><span className="text-[#64748B] text-sm ml-1">Replies</span></div>}
            {(post.shares_count||0) > 0 && <div><span className="text-[#111827] font-bold">{formatNumber(post.shares_count)}</span><span className="text-[#64748B] text-sm ml-1">Shares</span></div>}
          </div>
        )}

        <div className="flex items-center justify-between py-1 -mx-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Comment" className="text-[#64748B] hover:text-[#6D28D9] px-2 py-2 rounded-full hover:bg-[#7C3AED]/10 transition-all"><MessageCircle size={20} /></button>

          <div className="relative" onClick={e => e.stopPropagation()}>
            {showRepostMenu && (
              <div className="absolute bottom-12 left-0 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden z-30 shadow-2xl" style={{ minWidth:180 }}>
                <button onClick={handleDirectRepost} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-sm border-b border-[#E2E8F0]" style={{ color: reposted ? '#10B981':'#111827' }}>
                  <Repeat2 size={16} style={{ color: reposted?'#10B981':'#64748B' }} />{reposted?'Undo Repost':'Repost'}
                </button>
                <button onClick={() => { setShowRepostMenu(false); setShowQuoteModal(true); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-[#111827] text-sm">
                  <Quote size={16} className="text-[#64748B]" /> Quote
                </button>
              </div>
            )}
            <button onClick={() => { setShowRepostMenu(!showRepostMenu); setShowMenu(false); setShowReactionPicker(false); }} aria-label="Repost"
              className={'px-2 py-2 rounded-full transition-all '+(reposted?'text-[#10B981] hover:bg-[#10B981]/10':'text-[#64748B] hover:text-[#10B981] hover:bg-[#10B981]/10')}>
              <Repeat2 size={20} />
            </button>
          </div>

          <div className="relative" onClick={e => e.stopPropagation()}>
            {showReactionPicker && (
              <div className="absolute bottom-12 left-0 bg-white border border-[#E2E8F0] rounded-full px-2 py-2 flex gap-1.5 z-30 shadow-2xl" style={{ minWidth:'max-content' }}>
                {REACTIONS.map(r => <button key={r.type} onClick={() => handleLike(r.type)} className="text-xl hover:scale-125 transition-transform w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F1F5F9]">{r.emoji}</button>)}
              </div>
            )}
            <button
              onClick={() => handleLike(reaction||'like')}
              onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
              onMouseUp={() => clearTimeout(longPressTimer.current)}
              onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
              onTouchEnd={() => clearTimeout(longPressTimer.current)}
              aria-label="Like"
              className="px-2 py-2 rounded-full transition-all hover:bg-red-500/10"
              style={{ color: liked?getReactionColor():'#64748B' }}>
              {liked && reaction ? <span className="text-xl leading-none">{getReactionEmoji()}</span> : <Heart size={20} fill={liked?'currentColor':'none'} />}
            </button>
          </div>

          <button onClick={() => isOwner && setInsightsOpen(true)} aria-label="Views"
            className={'px-2 py-2 flex items-center gap-1 rounded-full ' + (isOwner ? 'text-[#64748B] hover:text-[#6D28D9] hover:bg-[#7C3AED]/10' : 'text-[#64748B] cursor-default')}>
            <BarChart2 size={20} />{viewsCount > 0 && <span className="text-[13px]">{viewsCount}</span>}
          </button>
          <button onClick={handleSave} aria-label={saved ? 'Remove from saved' : 'Save'} className={'px-2 py-2 rounded-full transition-all '+(saved?'text-[#6D28D9] hover:bg-[#7C3AED]/10':'text-[#64748B] hover:text-[#6D28D9] hover:bg-[#7C3AED]/10')}><Bookmark size={20} fill={saved?'currentColor':'none'} /></button>
          <button onClick={handleShare} aria-label="Share" className="text-[#64748B] hover:text-[#6D28D9] px-2 py-2 rounded-full hover:bg-[#7C3AED]/10 transition-all"><Share2 size={20} /></button>
        </div>
      </div>

        <div id="comments-section" className="border-t border-[#E2E8F0] mt-1">
          <CommentsPanel
            inline
            post={post}
            count={commentCount}
            onCountChange={(d) => setCommentCount((c) => Math.max(0, c + d))}
            onNavigate={navigate}
          />
        </div>
        {shareOpen && <ShareSheet post={post} onClose={() => setShareOpen(false)} onDone={(t) => { setShareOpen(false); if (t) showToast(t); }} />}
        {insightsOpen && <InsightsSheet post={post} onClose={() => setInsightsOpen(false)} />}
    </div>
  );
}