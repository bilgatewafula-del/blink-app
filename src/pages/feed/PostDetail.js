import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatNumber } from '../../utils/formatNumber';
import {
  ArrowLeft, MoreHorizontal, Send, Bookmark,
  Share2, Repeat2, ChevronLeft, ChevronRight,
  Flag, UserX, Trash2, Edit3, X, AtSign,
  Pin, MessageCircle, TrendingUp, Eye,
  Users, History, ZoomIn, Download,
  Globe, Lock, ChevronDown
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import ReportModal from '../../components/ReportModal';

const REACTIONS = [
  { emoji: '👍', type: 'like',    label: 'Like'  },
  { emoji: '❤️', type: 'love',    label: 'Love'  },
  { emoji: '😂', type: 'haha',    label: 'Haha'  },
  { emoji: '😮', type: 'wow',     label: 'Wow'   },
  { emoji: '😢', type: 'sad',     label: 'Sad'   },
  { emoji: '🔥', type: 'fire',    label: 'Fire'  },
  { emoji: '👏', type: 'clap',    label: 'Clap'  },
  { emoji: '💯', type: 'hundred', label: '100'   },
];

const COMMENT_REACTIONS = [
  { emoji: '👍', type: 'like' },
  { emoji: '❤️', type: 'love' },
  { emoji: '😂', type: 'haha' },
  { emoji: '😮', type: 'wow'  },
  { emoji: '🔥', type: 'fire' },
  { emoji: '👏', type: 'clap' },
];

const COMMENT_SORT = [
  { key: 'relevant', label: 'Most Relevant' },
  { key: 'newest',   label: 'Newest'        },
  { key: 'oldest',   label: 'Oldest'        },
  { key: 'liked',    label: 'Most Liked'    },
  { key: 'creator',  label: "Creator's Replies" },
];

const REPORT_REASONS = ['Spam', 'Harassment', 'Fake Account', 'Violence', 'Misinformation', 'Sexual Content', 'Hate Speech', 'Other'];

const SAVE_COLLECTIONS = ['Saved Posts', 'Business', 'Technology', 'News', 'Favorites', 'Entertainment'];

const EMOJI_LIST = [
  '😀','😂','😍','🥰','😎','🤔','😢','😡','👍','❤️','🔥','🎉',
  '💯','🙏','😭','🤣','😊','🥳','😏','🤗','👏','💪','✌️','🤞',
  '🌍','🇰🇪','💃','🕺','🎵','🏆','💎','🚀','⭐','🌟','💫','✨',
];

const flagMap = {
  KE:'🇰🇪',NG:'🇳🇬',GH:'🇬🇭',UG:'🇺🇬',
  TZ:'🇹🇿',ZA:'🇿🇦',ET:'🇪🇹',RW:'🇷🇼',
  GB:'🇬🇧',US:'🇺🇸',CA:'🇨🇦',
};

const getBadge = (user) => {
  if (user?.badge_type === 'verified') return <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓ Verified</span>;
  if (user?.badge_type === 'creator')  return <span className="bg-[#FFD700] text-black text-[8px] px-1.5 py-0.5 rounded-full font-bold">⭐ Creator</span>;
  if (user?.badge_type === 'business') return <span className="bg-[#7B2FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">🏢 Business</span>;
  if (user?.is_verified) return <span className="bg-[#1E6FFF] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">✓</span>;
  return null;
};

const getAudienceBadge = (audience) => {
  if (audience === 'private')   return <span className="text-[#6B7280] text-[10px] flex items-center gap-0.5"><Lock size={9} /> Private</span>;
  if (audience === 'followers') return <span className="text-[#6B7280] text-[10px] flex items-center gap-0.5"><Users size={9} /> Followers</span>;
  return <span className="text-[#6B7280] text-[10px] flex items-center gap-0.5"><Globe size={9} /> Public</span>;
};

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const commentInputRef = useRef();
  const longPressTimer  = useRef();

  const [post, setPost]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [comments, setComments]     = useState([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo]       = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [commentSort, setCommentSort] = useState('relevant');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Post reactions
  const [userReaction, setUserReaction]     = useState(null);
  const [reactionCounts, setReactionCounts] = useState({});
  const [totalReactions, setTotalReactions] = useState(0);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showReactionModal, setShowReactionModal]   = useState(false);
  const [reactionModalTab, setReactionModalTab]     = useState('all');
  const [reactionUsers, setReactionUsers]   = useState([]);
  const [topLikers, setTopLikers]           = useState([]);

  // Comment reactions
  const [commentReactions, setCommentReactions]   = useState({});
  const [showCommentReact, setShowCommentReact]   = useState(null);
  const [userCommentReactions, setUserCommentReactions] = useState({});

  // Post state
  const [saved, setSaved]           = useState(false);
  const [saveCollection, setSaveCollection] = useState('Saved Posts');
  const [showSaveMenu, setShowSaveMenu]     = useState(false);
  const [showPostMenu, setShowPostMenu]     = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget]     = useState({ type: 'post', id });
  const [imageIdx, setImageIdx]     = useState(0);
  const [showEmoji, setShowEmoji]   = useState(false);
  const [commentLikes, setCommentLikes] = useState(new Set());

  // Media analytics
  const [mediaStats, setMediaStats] = useState({ opens: 0, zooms: 0, downloads: 0 });

  // Mention suggestions
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [showMentions, setShowMentions]             = useState(false);

  // Analytics
  const [engagementRate, setEngagementRate] = useState(0);

  useEffect(() => {
    fetchPost();
    fetchComments();
    checkSaved();
    recordViewAndReach();
  }, [id]);

  useEffect(() => {
    const ch = supabase.channel('comments:' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: 'post_id=eq.' + id }, () => fetchComments())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  useEffect(() => {
  const input = commentInputRef.current;
  if (!input) return;
  const onFocus = () => window.dispatchEvent(new Event('blink:comments:open'));
  const onBlur  = () => window.dispatchEvent(new Event('blink:comments:close'));
  input.addEventListener('focus', onFocus);
  input.addEventListener('blur',  onBlur);
  return () => {
    input.removeEventListener('focus', onFocus);
    input.removeEventListener('blur',  onBlur);
  };
}, []);

  // ── Record view + reach ──────────────────────────────────────────
  const recordViewAndReach = async () => {
    if (!user) return;
    // Views (can repeat)
    const { data: pv } = await supabase.from('posts').select('views_count').eq('id', id).maybeSingle();
    if (pv) await supabase.from('posts').update({ views_count: (pv.views_count || 0) + 1 }).eq('id', id);

    // Reach (unique)
    const { error } = await supabase.from('post_reach').upsert(
      { post_id: id, viewer_id: user.id },
      { onConflict: 'post_id,viewer_id' }
    );
    if (!error) {
      const { count } = await supabase.from('post_reach').select('id', { count: 'exact', head: true }).eq('post_id', id);
      await supabase.from('posts').update({ reach_count: count || 0 }).eq('id', id);
    }
  };

  // ── Track media event ────────────────────────────────────────────
  const trackMedia = async (eventType, mediaUrl = null) => {
    await supabase.from('media_analytics').insert({
      post_id: id, user_id: user?.id, event_type: eventType, media_url: mediaUrl,
    });
    setMediaStats((prev) => ({
      ...prev,
      opens:     eventType === 'open'     ? prev.opens + 1     : prev.opens,
      zooms:     eventType === 'zoom'     ? prev.zooms + 1     : prev.zooms,
      downloads: eventType === 'download' ? prev.downloads + 1 : prev.downloads,
    }));
  };

  // ── Fetch post ───────────────────────────────────────────────────
  const fetchPost = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, users(id,username,display_name,avatar_url,country,is_verified,badge_type)')
      .eq('id', id).maybeSingle();
    setPost(data);
    setLoading(false);

    if (data) {
      // Load reactions
      const { data: likes } = await supabase
        .from('likes')
        .select('reaction_type, user_id, users:user_id(id,display_name,avatar_url,username,badge_type,is_verified)')
        .eq('post_id', id);

      if (likes) {
        const counts = likes.reduce((acc, l) => {
          acc[l.reaction_type] = (acc[l.reaction_type] || 0) + 1;
          return acc;
        }, {});
        setReactionCounts(counts);
        setTotalReactions(likes.length);
        const mine = likes.find((l) => l.user_id === user?.id);
        if (mine) setUserReaction(mine.reaction_type);
        setTopLikers(likes.slice(0, 2).map((l) => l.users?.display_name).filter(Boolean));
        setReactionUsers(likes.map((l) => l.users).filter(Boolean));
      }

      // Engagement rate
      const reach = data.reach_count || 1;
      const eng = ((data.likes_count || 0) + (data.comments_count || 0) + (data.shares_count || 0) + (data.reposts_count || 0)) / reach * 100;
      setEngagementRate(Math.min(eng, 100).toFixed(1));

      // Media analytics summary
      if (data.media_urls?.length > 0) {
        const { data: ma } = await supabase.from('media_analytics').select('event_type').eq('post_id', id);
        if (ma) {
          setMediaStats({
            opens:     ma.filter((m) => m.event_type === 'open').length,
            zooms:     ma.filter((m) => m.event_type === 'zoom').length,
            downloads: ma.filter((m) => m.event_type === 'download').length,
          });
        }
      }
    }
  };

  // ── Fetch comments ───────────────────────────────────────────────
  const fetchComments = async () => {
    let q = supabase
      .from('comments')
      .select('*, users(id,username,display_name,avatar_url,is_verified,badge_type,country)')
      .eq('post_id', id)
      .is('parent_id', null);

    if (commentSort === 'newest')  q = q.order('created_at', { ascending: false });
    else if (commentSort === 'oldest') q = q.order('created_at', { ascending: true });
    else if (commentSort === 'liked')  q = q.order('likes_count', { ascending: false });
    else if (commentSort === 'creator') q = q.eq('user_id', post?.user_id || '').order('created_at', { ascending: false });
    else q = q.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });

    const { data } = await q.limit(50);
    setComments(data || []);

    // Comment likes
    const { data: liked } = await supabase.from('comment_likes').select('comment_id').eq('user_id', user.id);
    if (liked) setCommentLikes(new Set(liked.map((l) => l.comment_id)));

    // Comment reactions
    if (data?.length > 0) {
      const ids = data.map((c) => c.id);
      const { data: cr } = await supabase.from('comment_reactions').select('*').in('comment_id', ids);
      if (cr) {
        const byComment = cr.reduce((acc, r) => {
          if (!acc[r.comment_id]) acc[r.comment_id] = {};
          acc[r.comment_id][r.reaction_type] = (acc[r.comment_id][r.reaction_type] || 0) + 1;
          return acc;
        }, {});
        setCommentReactions(byComment);
        const myReactions = cr.filter((r) => r.user_id === user.id).reduce((acc, r) => {
          acc[r.comment_id] = r.reaction_type;
          return acc;
        }, {});
        setUserCommentReactions(myReactions);
      }
    }
  };

  const checkSaved = async () => {
    const { data } = await supabase.from('saved_posts').select('id,collection').eq('post_id', id).eq('user_id', user.id).maybeSingle();
    if (data) { setSaved(true); setSaveCollection(data.collection || 'Saved Posts'); }
  };

  // ── Post reaction ────────────────────────────────────────────────
  const handleReaction = async (type) => {
    setShowReactionPicker(false);
    if (userReaction === type) {
      setUserReaction(null);
      setTotalReactions((c) => Math.max(0, c - 1));
      setReactionCounts((prev) => ({ ...prev, [type]: Math.max(0, (prev[type] || 1) - 1) }));
      await supabase.from('likes').delete().eq('post_id', id).eq('user_id', user.id);
      await supabase.from('posts').update({ likes_count: Math.max(0, (post?.likes_count || 1) - 1) }).eq('id', id);
    } else {
      const wasReacted = !!userReaction;
      if (!wasReacted) {
        setTotalReactions((c) => c + 1);
        await supabase.from('posts').update({ likes_count: (post?.likes_count || 0) + 1 }).eq('id', id);
        if (post?.users?.id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post?.users?.id, from_user_id: user.id, type: 'like',
            message: 'reacted to your post',
            preview_text: post?.caption?.slice(0, 80) || null,
            preview_image: post?.media_urls?.[0] || null,
            ref_id: id, is_read: false,
          });
        }
      }
      if (wasReacted) setReactionCounts((prev) => ({ ...prev, [userReaction]: Math.max(0, (prev[userReaction] || 1) - 1) }));
      setUserReaction(type);
      setReactionCounts((prev) => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
      await supabase.from('likes').upsert(
        { post_id: id, user_id: user.id, reaction_type: type },
        { onConflict: 'post_id,user_id' }
      );
    }
  };

  // ── Comment reaction ─────────────────────────────────────────────
  const handleCommentReaction = async (commentId, type) => {
    setShowCommentReact(null);
    const current = userCommentReactions[commentId];
    if (current === type) {
      await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id);
      setUserCommentReactions((prev) => { const n = { ...prev }; delete n[commentId]; return n; });
      setCommentReactions((prev) => ({
        ...prev,
        [commentId]: { ...prev[commentId], [type]: Math.max(0, (prev[commentId]?.[type] || 1) - 1) },
      }));
    } else {
      if (current) {
        setCommentReactions((prev) => ({
          ...prev,
          [commentId]: { ...prev[commentId], [current]: Math.max(0, (prev[commentId]?.[current] || 1) - 1) },
        }));
      }
      await supabase.from('comment_reactions').upsert(
        { comment_id: commentId, user_id: user.id, reaction_type: type },
        { onConflict: 'comment_id,user_id' }
      );
      setUserCommentReactions((prev) => ({ ...prev, [commentId]: type }));
      setCommentReactions((prev) => ({
        ...prev,
        [commentId]: { ...prev[commentId], [type]: (prev[commentId]?.[type] || 0) + 1 },
      }));
    }
  };

  // ── Comment submit ───────────────────────────────────────────────
  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    const body = commentText.trim();

    if (editingComment) {
      const newHistory = [...(editingComment.edit_history || []), { body: editingComment.body, editedAt: new Date().toISOString() }];
      await supabase.from('comments').update({ body, edited: true, edited_at: new Date().toISOString(), edit_history: newHistory }).eq('id', editingComment.id);
      setComments((prev) => prev.map((c) => c.id === editingComment.id ? { ...c, body, edited: true } : c));
      setEditingComment(null); setCommentText(''); setSubmitting(false); return;
    }

    const { data } = await supabase.from('comments').insert({
      post_id: id, user_id: user.id, body,
      parent_id: replyTo?.id || null,
    }).select('*, users(id,username,display_name,avatar_url,is_verified,badge_type,country)').single();

    if (data) {
      if (!replyTo) setComments((prev) => [data, ...prev]);
      await supabase.from('posts').update({ comments_count: (post?.comments_count || 0) + 1 }).eq('id', id);

      // Notify post owner
      if (post?.users?.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post?.users?.id, from_user_id: user.id, type: 'comment',
          message: 'commented on your post',
          preview_text: body.slice(0, 80),
          preview_image: post?.media_urls?.[0] || null,
          ref_id: id, is_read: false,
        });
      }

      // Mention notifications
      const mentions = body.match(/@(\w+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const uname = mention.slice(1);
          const { data: mentioned } = await supabase.from('users').select('id').eq('username', uname).maybeSingle();
          if (mentioned && mentioned.id !== user.id) {
            await supabase.from('notifications').insert({
              user_id: mentioned.id, from_user_id: user.id, type: 'mention',
              message: 'mentioned you in a comment: "' + body.slice(0, 50) + '"',
              ref_id: id, is_read: false,
            });
          }
        }
      }
    }
    setCommentText(''); setReplyTo(null); setShowEmoji(false); setSubmitting(false);
  };

  // ── Mention autocomplete ─────────────────────────────────────────
  const handleCommentInput = async (val) => {
    setCommentText(val);
    const match = val.match(/@(\w+)$/);
    if (match && match[1].length >= 1) {
      const { data } = await supabase.from('users').select('id,username,display_name,avatar_url').ilike('username', match[1] + '%').limit(5);
      setMentionSuggestions(data || []);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (username) => {
    setCommentText((t) => t.replace(/@\w+$/, '@' + username + ' '));
    setShowMentions(false);
    commentInputRef.current?.focus();
  };

  // ── Comment like ─────────────────────────────────────────────────
  const handleCommentLike = async (commentId, currentLikes) => {
    if (commentLikes.has(commentId)) {
      const nl = Math.max(0, currentLikes - 1);
      await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id);
      await supabase.from('comments').update({ likes_count: nl }).eq('id', commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likes_count: nl } : c));
      setCommentLikes((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
    } else {
      const nl = currentLikes + 1;
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
      await supabase.from('comments').update({ likes_count: nl }).eq('id', commentId);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, likes_count: nl } : c));
      setCommentLikes((prev) => new Set([...prev, commentId]));
    }
  };

  const handleDeleteComment = async (commentId) => {
    await supabase.from('comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    await supabase.from('posts').update({ comments_count: Math.max(0, (post?.comments_count || 1) - 1) }).eq('id', id);
  };

  const handlePinComment = async (commentId, isPinned) => {
    await supabase.from('comments').update({ is_pinned: !isPinned }).eq('id', commentId);
    fetchComments();
  };

  // ── Save ─────────────────────────────────────────────────────────
  const handleSave = async (collection = 'Saved Posts') => {
    setShowSaveMenu(false);
    if (saved) {
      setSaved(false);
      await supabase.from('saved_posts').delete().eq('post_id', id).eq('user_id', user.id);
    } else {
      setSaved(true); setSaveCollection(collection);
      await supabase.from('saved_posts').upsert(
        { post_id: id, user_id: user.id, collection },
        { onConflict: 'post_id,user_id' }
      );
      // Increment saves count
      await supabase.from('posts').update({ saves_count: (post?.saves_count || 0) + 1 }).eq('id', id);
      // Save milestone notification
      const newSaves = (post?.saves_count || 0) + 1;
      if ([10, 50, 100, 500, 1000].includes(newSaves) && post?.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post?.user_id, from_user_id: user.id, type: 'milestone',
          message: '🔖 Your post was saved ' + newSaves + ' times!',
          ref_id: id, is_read: false,
        });
      }
    }
  };

  // ── Repost ───────────────────────────────────────────────────────
  const handleRepost = async () => {
    await supabase.from('posts').insert({
      user_id: user.id, caption: '',
      quoted_post_id: id, audience: 'public',
      is_draft: false, is_repost: true,
    });
    await supabase.from('posts').update({ reposts_count: (post?.reposts_count || 0) + 1 }).eq('id', id);
    if (post?.users?.id !== user.id) {
      await supabase.from('notifications').insert({
        user_id: post?.users?.id, from_user_id: user.id, type: 'repost',
        message: 'reposted your post',
        preview_text: post?.caption?.slice(0, 80) || null,
        ref_id: id, is_read: false,
      });
    }
    alert('🔁 Reposted to your followers!');
  };

  // ── Pin post ─────────────────────────────────────────────────────
  const handlePinPost = async () => {
    setShowPostMenu(false);
    const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_pinned', true);
    if (!post?.is_pinned && (count || 0) >= 3) {
      alert('You can only pin up to 3 posts. Unpin one first.'); return;
    }
    await supabase.from('posts').update({ is_pinned: !post?.is_pinned }).eq('id', id);
    setPost((p) => ({ ...p, is_pinned: !p?.is_pinned }));
    alert(post?.is_pinned ? 'Post unpinned' : '📌 Post pinned to your profile!');
  };

  // ── Share ────────────────────────────────────────────────────────
  const handleShare = async (method) => {
    setShowShareSheet(false);
    const url = window.location.origin + '/post/' + id;
    if (method === 'copy')      { navigator.clipboard.writeText(url); alert('Link copied! 🔗'); }
    else if (method === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent('Check this on B-Link 👇 ' + url));
    else if (method === 'twitter')  window.open('https://twitter.com/intent/tweet?url=' + encodeURIComponent(url));
    else if (method === 'facebook') window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url));
    else if (method === 'telegram') window.open('https://t.me/share/url?url=' + encodeURIComponent(url));
    else if (method === 'email')    window.open('mailto:?body=' + encodeURIComponent(url));
    else if (method === 'native' && navigator.share) navigator.share({ url });
    await supabase.from('posts').update({ shares_count: (post?.shares_count || 0) + 1 }).eq('id', id);
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', id);
    navigate(-1);
  };

  const getReactionEmoji = (type) => REACTIONS.find((r) => r.type === type)?.emoji || '👍';

  const topReactionTypes = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type]) => type);

  const likeText = () => {
    if (totalReactions === 0) return null;
    if (topLikers.length === 0) return formatNumber(totalReactions) + ' reactions';
    if (topLikers.length === 1 && totalReactions === 1) return topLikers[0];
    if (topLikers.length === 1) return topLikers[0] + ' and ' + formatNumber(totalReactions - 1) + ' others';
    return topLikers[0] + ', ' + topLikers[1] + (totalReactions > 2 ? ' and ' + formatNumber(totalReactions - 2) + ' others' : '');
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center gap-3">
      <p className="text-5xl">🔍</p>
      <p className="text-white font-bold">Post not found</p>
      <button onClick={() => navigate(-1)} className="text-[#1E6FFF] text-sm">Go back</button>
    </div>
  );

  const author  = post.users;
  const isOwner = author?.id === user?.id;
  const images  = post.media_urls || [];
  const isTrending = post.is_trending || (post.views_count || 0) > 1000;

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col pb-6"
      onClick={() => { setShowPostMenu(false); setShowReactionPicker(false); setShowSortMenu(false); setShowCommentReact(null); }}>

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/95 backdrop-blur-md border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white"><ArrowLeft size={22} /></button>
        <div className="flex items-center gap-2">
          {isTrending && <span className="bg-[#FF6B35]/20 text-[#FF6B35] text-xs font-bold px-2.5 py-1 rounded-full">🔥 Trending</span>}
          {post.is_pinned && <span className="text-[#6B7280] text-xs flex items-center gap-0.5"><Pin size={11} /> Pinned</span>}
          <span className="text-white font-bold text-base">Post</span>
        </div>
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowPostMenu(!showPostMenu); }} className="text-[#6B7280] hover:text-white">
            <MoreHorizontal size={22} />
          </button>
          {showPostMenu && (
            <div className="absolute right-0 top-9 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-52 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {isOwner ? (
                <>
                  <button onClick={() => { navigate('/post/' + id + '/edit'); setShowPostMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                    <Edit3 size={14} className="text-[#6B7280]" /> Edit Post
                  </button>
                  <button onClick={handlePinPost} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                    <Pin size={14} className="text-[#6B7280]" /> {post.is_pinned ? 'Unpin Post' : 'Pin Post'}
                  </button>
                  {post.edited && (
                    <button onClick={() => { setShowEditHistory(true); setShowPostMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                      <History size={14} className="text-[#6B7280]" /> View Edit History
                    </button>
                  )}
                  <button onClick={handleDeletePost} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 text-sm">
                    <Trash2 size={14} /> Delete Post
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setReportTarget({ type: 'post', id }); setShowReportModal(true); setShowPostMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm border-b border-white/5">
                    <Flag size={14} className="text-[#6B7280]" /> Report Post
                  </button>
                  <button onClick={() => setShowPostMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/5 text-sm">
                    <UserX size={14} className="text-[#6B7280]" /> Block @{author?.username}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── AUTHOR ── */}
        <div className="flex items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/profile/' + author?.username)}>
            <Avatar url={author?.avatar_url} name={author?.display_name} size={12} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => navigate('/profile/' + author?.username)} className="text-white font-bold text-base hover:underline">{author?.display_name}</button>
              {getBadge(author)}
              <span>{flagMap[author?.country] || '🌍'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[#6B7280] text-xs">@{author?.username} · {formatTime(post.created_at)}</p>
              {getAudienceBadge(post.audience)}
              {post.edited && (
                <button onClick={() => setShowEditHistory(true)} className="text-[#6B7280] text-xs flex items-center gap-0.5 hover:text-white">
                  <History size={10} /> Edited
                </button>
              )}
            </div>
            {post.location && <p className="text-[#6B7280] text-xs">📍 {post.location}</p>}
          </div>
          {!isOwner && (
            <button className="text-[#1E6FFF] border border-[#1E6FFF]/40 px-4 py-1.5 rounded-full text-sm font-bold hover:bg-[#1E6FFF]/10 transition-colors">
              Follow
            </button>
          )}
        </div>

        {/* ── CONTENT ── */}
        {post.caption && (
          <div className={!images.length && post.bg_color ? 'mx-4 mb-3 rounded-2xl py-10 px-6 text-center' : 'px-4 mb-3'}
            style={{ background: !images.length && post.bg_color ? post.bg_color : 'transparent' }}>
            <p className={'leading-relaxed break-words ' + (!images.length && post.bg_color ? 'text-white font-bold text-xl' : 'text-white/90 text-base')}>
              {post.caption}
            </p>
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.hashtags.map((tag) => (
                  <button key={tag} onClick={() => navigate('/hashtag/' + tag)} className="text-[#1E6FFF] text-sm font-medium hover:underline">
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── IMAGES with analytics ── */}
        {images.length > 0 && (
          <div className="relative mb-3">
            <div className="aspect-square overflow-hidden bg-[#111827] cursor-pointer"
              onClick={() => trackMedia('open', images[imageIdx])}>
              <img
                src={images[imageIdx]} alt="post"
                className="w-full h-full object-cover"
                onClick={() => trackMedia('open', images[imageIdx])}
              />
            </div>
            <div className="absolute top-2 right-2 flex gap-1">
              <button onClick={() => trackMedia('zoom', images[imageIdx])} className="bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70">
                <ZoomIn size={14} />
              </button>
              {isOwner && (
                <button onClick={() => trackMedia('download', images[imageIdx])} className="bg-black/50 text-white p-1.5 rounded-full hover:bg-black/70">
                  <Download size={14} />
                </button>
              )}
            </div>
            {images.length > 1 && (
              <>
                {imageIdx > 0 && (
                  <button onClick={() => { setImageIdx((i) => i - 1); trackMedia('swipe'); }} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-2">
                    <ChevronLeft size={18} className="text-white" />
                  </button>
                )}
                {imageIdx < images.length - 1 && (
                  <button onClick={() => { setImageIdx((i) => i + 1); trackMedia('swipe'); }} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 rounded-full p-2">
                    <ChevronRight size={18} className="text-white" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setImageIdx(i)} className={'rounded-full transition-all ' + (i === imageIdx ? 'bg-white w-4 h-1.5' : 'bg-white/40 w-1.5 h-1.5')} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ENGAGEMENT STATISTICS ── */}
        <div className="px-4 py-3 border-y border-white/5">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => { setShowReactionModal(true); setReactionModalTab('all'); }} className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {topReactionTypes.map((type) => (
                  <div key={type} className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-xs border border-[#0A1628]">
                    {getReactionEmoji(type)}
                  </div>
                ))}
              </div>
              {totalReactions > 0 && <span className="text-white/70 text-sm">{likeText()}</span>}
            </button>
            <div className="flex items-center gap-3">
              {(post.comments_count || 0) > 0 && <span className="text-[#6B7280] text-xs">{formatNumber(post.comments_count)} comments</span>}
              {(post.reposts_count || 0) > 0 && <span className="text-[#6B7280] text-xs">{formatNumber(post.reposts_count)} reposts</span>}
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Eye size={14} className="text-[#1E6FFF]" />
              <div>
                <p className="text-white font-bold text-sm">{formatNumber(post.views_count || 0)}</p>
                <p className="text-[#6B7280] text-[10px]">Views</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Users size={14} className="text-[#7B2FFF]" />
              <div>
                <p className="text-white font-bold text-sm">{formatNumber(post.reach_count || 0)}</p>
                <p className="text-[#6B7280] text-[10px]">Reach</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp size={12} className="text-[#2ECC71]" />
              <span className="text-[#2ECC71] text-xs font-bold">{engagementRate}% engagement</span>
            </div>
            {(post.shares_count || 0) > 0 && <span className="text-[#6B7280] text-xs">📤 {formatNumber(post.shares_count)} shares</span>}
            {(post.saves_count || 0) > 0 && <span className="text-[#6B7280] text-xs">🔖 {formatNumber(post.saves_count)} saves</span>}
          </div>

          {/* Media analytics for owner */}
          {isOwner && images.length > 0 && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
              <span className="text-[#6B7280] text-xs">📷 {mediaStats.opens} opens</span>
              <span className="text-[#6B7280] text-xs">🔍 {mediaStats.zooms} zooms</span>
              <span className="text-[#6B7280] text-xs">⬇ {mediaStats.downloads} downloads</span>
            </div>
          )}
        </div>

        {/* ── ACTION BAR ── */}
        <div className="flex items-center border-b border-white/5">
          {/* React */}
          <div className="flex-1 relative">
            {showReactionPicker && (
              <div className="absolute -top-14 left-2 bg-[#111827] border border-white/10 rounded-full px-2 py-2 flex gap-1 z-30 shadow-2xl" style={{ animation: 'slideUp 0.2s ease-out' }} onClick={(e) => e.stopPropagation()}>
                {REACTIONS.map((r) => (
                  <button key={r.type} onClick={() => handleReaction(r.type)} title={r.label}
                    className={'text-xl transition-all hover:scale-125 hover:-translate-y-1 w-9 h-9 flex items-center justify-center rounded-full ' + (userReaction === r.type ? 'bg-[#1E6FFF]/20' : 'hover:bg-white/10')}>
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => userReaction ? handleReaction(userReaction) : setShowReactionPicker(!showReactionPicker)}
              onMouseDown={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
              onMouseUp={() => clearTimeout(longPressTimer.current)}
              onTouchStart={() => { longPressTimer.current = setTimeout(() => setShowReactionPicker(true), 500); }}
              onTouchEnd={() => clearTimeout(longPressTimer.current)}
              className={'flex items-center justify-center gap-1.5 py-3 w-full transition-colors ' + (userReaction ? 'text-[#1E6FFF]' : 'text-[#6B7280] hover:text-[#1E6FFF]')}
            >
              <span className="text-lg">{userReaction ? getReactionEmoji(userReaction) : '👍'}</span>
              <span className="text-xs font-semibold">{userReaction ? REACTIONS.find((r) => r.type === userReaction)?.label : 'React'}</span>
            </button>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <button onClick={() => commentInputRef.current?.focus()} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[#6B7280] hover:text-[#1E6FFF] transition-colors">
            <MessageCircle size={17} />
            <span className="text-xs font-semibold">Comment</span>
          </button>
          <div className="w-px h-8 bg-white/10" />
          <button onClick={handleRepost} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[#6B7280] hover:text-[#2ECC71] transition-colors">
            <Repeat2 size={17} />
            <span className="text-xs font-semibold">Repost</span>
          </button>
          <div className="w-px h-8 bg-white/10" />
          <button onClick={() => setShowShareSheet(true)} className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[#6B7280] hover:text-[#00D4C8] transition-colors">
            <Share2 size={17} />
            <span className="text-xs font-semibold">Share</span>
          </button>
          <div className="w-px h-8 bg-white/10" />
          <div className="relative flex-1">
            <button onClick={() => setShowSaveMenu(!showSaveMenu)}
              className={'flex items-center justify-center gap-1.5 py-3 w-full transition-colors ' + (saved ? 'text-[#FFD700]' : 'text-[#6B7280] hover:text-[#FFD700]')}>
              <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
              <span className="text-xs font-semibold">Save</span>
            </button>
            {showSaveMenu && !saved && (
              <div className="absolute bottom-12 right-0 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-30 w-44 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <p className="text-[#6B7280] text-xs font-bold px-4 py-2 border-b border-white/5">Save to collection</p>
                {SAVE_COLLECTIONS.map((col) => (
                  <button key={col} onClick={() => handleSave(col)} className="w-full text-left px-4 py-3 text-white/80 text-sm hover:bg-white/5 border-b border-white/5 last:border-0">
                    {col}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── COMMENTS ── */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold text-base">Comments ({formatNumber(post.comments_count || 0)})</h3>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }} className="flex items-center gap-1 text-[#6B7280] text-xs hover:text-white">
                {COMMENT_SORT.find((s) => s.key === commentSort)?.label}
                <ChevronDown size={13} />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-6 bg-[#111827] border border-white/10 rounded-xl overflow-hidden z-30 w-44 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  {COMMENT_SORT.map((s) => (
                    <button key={s.key} onClick={() => { setCommentSort(s.key); setShowSortMenu(false); fetchComments(); }}
                      className={'w-full text-left px-4 py-3 text-sm border-b border-white/5 last:border-0 ' + (commentSort === s.key ? 'text-[#1E6FFF] font-bold bg-[#1E6FFF]/10' : 'text-white/80 hover:bg-white/5')}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {comments.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-2">💬</p>
              <p className="text-white/60 text-sm">No comments yet. Be the first!</p>
            </div>
          ) : (
            <div className="mb-6 space-y-0">
              {comments.map((c) => {
                const isLikedComment = commentLikes.has(c.id);
                const isMineComment  = c.user_id === user?.id;
                const isAuthor       = c.user_id === post.user_id;
                const cReactions     = commentReactions[c.id] || {};
                const myCommentReact = userCommentReactions[c.id];
                const topCReactions  = Object.entries(cReactions).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,3);

                return (
                  <div key={c.id} className="group py-3 border-b border-white/5 last:border-0">
                    <div className="flex gap-3">
                      <button onClick={() => navigate('/profile/' + c.users?.username)}>
                        <Avatar url={c.users?.avatar_url} name={c.users?.display_name} size={9} />
                      </button>
                      <div className="flex-1 min-w-0">
                        {c.is_pinned && (
                          <div className="flex items-center gap-1 mb-1">
                            <Pin size={10} className="text-[#1E6FFF]" />
                            <span className="text-[#1E6FFF] text-[10px] font-bold">Pinned by creator</span>
                          </div>
                        )}
                        <div className="bg-white/5 rounded-2xl rounded-tl-none px-3 py-2.5 inline-block max-w-full">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <button onClick={() => navigate('/profile/' + c.users?.username)} className="text-white font-bold text-sm hover:underline">
                              {c.users?.display_name}
                            </button>
                            {getBadge(c.users)}
                            {isAuthor && (
                              <span className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
                                👑 Author
                              </span>
                            )}
                          </div>
                          <p className="text-white/85 text-sm leading-relaxed break-words">
                            {c.body.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith('@')
                                ? <button key={i} onClick={() => navigate('/profile/' + part.slice(1))} className="text-[#1E6FFF] font-semibold hover:underline">{part}</button>
                                : <span key={i}>{part}</span>
                            )}
                          </p>
                          {c.edited && <p className="text-[#6B7280] text-[10px] mt-1">edited</p>}
                        </div>

                        {/* Comment reactions display */}
                        {topCReactions.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {topCReactions.map(([type, count]) => (
                              <button key={type} onClick={() => handleCommentReaction(c.id, type)}
                                className={'flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border transition-colors ' + (myCommentReact === type ? 'bg-[#1E6FFF]/20 border-[#1E6FFF]/40 text-[#1E6FFF]' : 'bg-white/5 border-white/10 text-white/70')}>
                                <span>{COMMENT_REACTIONS.find((r) => r.type === type)?.emoji}</span>
                                <span>{count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Comment actions */}
                        <div className="flex items-center gap-3 mt-1.5 px-1 flex-wrap">
                          <span className="text-[#6B7280] text-xs">{formatTime(c.created_at)}</span>
                          <button onClick={() => handleCommentLike(c.id, c.likes_count || 0)}
                            className={'text-xs font-bold transition-colors ' + (isLikedComment ? 'text-red-400' : 'text-[#6B7280] hover:text-red-400')}>
                            {isLikedComment ? '❤️' : '🤍'} {c.likes_count > 0 ? formatNumber(c.likes_count) : 'Like'}
                          </button>
                          {/* Comment react button */}
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowCommentReact(showCommentReact === c.id ? null : c.id); }}
                              className="text-[#6B7280] text-xs hover:text-[#FFD700]"
                            >
                              React
                            </button>
                            {showCommentReact === c.id && (
                              <div className="absolute bottom-6 left-0 bg-[#111827] border border-white/10 rounded-full px-2 py-1.5 flex gap-1 z-30 shadow-2xl" style={{ animation: 'slideUp 0.15s ease-out' }} onClick={(e) => e.stopPropagation()}>
                                {COMMENT_REACTIONS.map((r) => (
                                  <button key={r.type} onClick={() => handleCommentReaction(c.id, r.type)}
                                    className={'text-lg hover:scale-125 transition-transform w-7 h-7 flex items-center justify-center rounded-full ' + (myCommentReact === r.type ? 'bg-[#1E6FFF]/20' : 'hover:bg-white/10')}>
                                    {r.emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setReplyTo(c); setCommentText('@' + c.users?.username + ' '); commentInputRef.current?.focus(); }}
                            className="text-[#6B7280] text-xs font-bold hover:text-[#1E6FFF]">
                            Reply
                          </button>
                          {isOwner && (
                            <button onClick={() => handlePinComment(c.id, c.is_pinned)} className="text-[#6B7280] text-xs hover:text-[#1E6FFF] opacity-0 group-hover:opacity-100 transition-all">
                              {c.is_pinned ? 'Unpin' : 'Pin'}
                            </button>
                          )}
                          {isMineComment ? (
                            <>
                              <button onClick={() => { setEditingComment(c); setCommentText(c.body); commentInputRef.current?.focus(); }} className="text-[#6B7280] text-xs hover:text-[#1E6FFF] opacity-0 group-hover:opacity-100 transition-all">Edit</button>
                              <button onClick={() => handleDeleteComment(c.id)} className="text-[#6B7280] text-xs hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">Delete</button>
                            </>
                          ) : (
                            <button onClick={() => { setReportTarget({ type: 'comment', id: c.id }); setShowReportModal(true); }} className="text-[#6B7280] text-xs hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                              Report
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── EMOJI ROW ── */}
      {showEmoji && (
        <div className="flex-shrink-0 flex gap-2 px-4 py-2 overflow-x-auto bg-[#111827] border-t border-white/10" style={{ scrollbarWidth: 'none' }}>
          {EMOJI_LIST.map((e) => (
            <button key={e} onMouseDown={(ev) => { ev.preventDefault(); setCommentText((t) => t + e); }}
              className="text-xl flex-shrink-0 hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>
      )}

      {/* ── MENTION SUGGESTIONS ── */}
      {showMentions && mentionSuggestions.length > 0 && (
        <div className="flex-shrink-0 bg-[#111827] border-t border-white/10 max-h-36 overflow-y-auto">
          {mentionSuggestions.map((u) => (
            <button key={u.id} onClick={() => insertMention(u.username)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
              <Avatar url={u.avatar_url} name={u.display_name} size={8} />
              <div className="text-left">
                <p className="text-white text-sm font-semibold">{u.display_name}</p>
                <p className="text-[#6B7280] text-xs">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── REPLY / EDIT BANNER ── */}
      {(replyTo || editingComment) && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-[#111827] border-t border-white/10">
          <div className="w-0.5 h-10 bg-[#1E6FFF] rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[#1E6FFF] text-xs font-bold">
              {editingComment ? 'Editing comment' : 'Replying to @' + replyTo?.users?.username}
            </p>
            <p className="text-[#6B7280] text-xs truncate">
              {editingComment ? editingComment.body : replyTo?.body}
            </p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditingComment(null); setCommentText(''); }} className="text-[#6B7280] hover:text-white"><X size={16} /></button>
        </div>
      )}

      {/* ── COMMENT INPUT ── */}
      <div style={{
        flexShrink: 0, background: '#0d1f3c',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 10px',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', width: '100%' }}>
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={9} />
          <div style={{
            flex: '1 1 auto', minWidth: 0,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '20px', padding: '8px 12px',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxSizing: 'border-box', overflow: 'hidden',
          }}>
            <input
              ref={commentInputRef}
              type="text"
              value={commentText}
              onChange={(e) => handleCommentInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComment()}
              placeholder={editingComment ? 'Edit comment...' : replyTo ? 'Reply to @' + replyTo.users?.username + '...' : 'Write a comment...'}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px', fontFamily: 'inherit' }}
            />
            <button onMouseDown={(e) => { e.preventDefault(); setShowEmoji(!showEmoji); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', color: showEmoji ? '#FFD700' : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
              😊
            </button>
          </div>
          <button onClick={handleComment} disabled={submitting || !commentText.trim()}
            style={{
              width: '38px', height: '38px', minWidth: '38px', borderRadius: '50%', flexShrink: 0,
              background: (submitting || !commentText.trim()) ? 'rgba(30,111,255,0.4)' : 'linear-gradient(135deg, #1E6FFF, #7B2FFF)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Send size={15} style={{ color: 'white', marginLeft: '1px' }} />
          </button>
        </div>
      </div>

      {/* ── SHARE SHEET ── */}
      {showShareSheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowShareSheet(false)}>
          <div className="w-full max-w-[620px] mx-auto bg-[#0d1f3c] border-t border-white/15 rounded-t-3xl p-5" style={{ animation: 'slideUp 0.25s ease-out' }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-5" />
            <h3 className="text-white font-bold text-lg mb-4">Share Post</h3>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { icon: '💬', label: 'Chat',     action: 'chat'     },
                { icon: '🔗', label: 'Copy Link', action: 'copy'    },
                { icon: '📱', label: 'WhatsApp', action: 'whatsapp' },
                { icon: '📘', label: 'Facebook', action: 'facebook' },
                { icon: '🐦', label: 'X / Twitter', action: 'twitter' },
                { icon: '✈️', label: 'Telegram', action: 'telegram' },
                { icon: '📧', label: 'Email',    action: 'email'    },
                { icon: '↗️', label: 'More',     action: 'native'   },
              ].map((item) => (
                <button key={item.label} onClick={() => handleShare(item.action)} className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-center text-2xl hover:bg-white/15 transition-colors active:scale-95">
                    {item.icon}
                  </div>
                  <span className="text-white/70 text-xs">{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowShareSheet(false)} className="w-full py-3 bg-white/8 rounded-2xl text-white font-semibold border border-white/10">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── REACTION MODAL ── */}
      {showReactionModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowReactionModal(false)}>
          <div className="w-full max-w-[620px] mx-auto bg-[#0d1f3c] border-t border-white/15 rounded-t-3xl" style={{ animation: 'slideUp 0.25s ease-out', maxHeight: '70dvh' }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mt-3 mb-2" />
            <h3 className="text-white font-bold text-base px-5 pb-3">Reactions</h3>
            <div className="flex overflow-x-auto px-4 border-b border-white/10 gap-1" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setReactionModalTab('all')} className={'px-3 py-2.5 text-xs font-bold border-b-2 flex-shrink-0 ' + (reactionModalTab === 'all' ? 'border-[#1E6FFF] text-[#1E6FFF]' : 'border-transparent text-[#6B7280]')}>
                All {totalReactions}
              </button>
              {REACTIONS.filter((r) => (reactionCounts[r.type] || 0) > 0).map((r) => (
                <button key={r.type} onClick={() => setReactionModalTab(r.type)} className={'px-3 py-2.5 text-xs font-bold border-b-2 flex-shrink-0 ' + (reactionModalTab === r.type ? 'border-[#1E6FFF] text-[#1E6FFF]' : 'border-transparent text-[#6B7280]')}>
                  {r.emoji} {reactionCounts[r.type]}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto p-4 space-y-3" style={{ maxHeight: '50dvh' }}>
              {reactionUsers.map((u, i) => (
                <button key={i} onClick={() => { setShowReactionModal(false); navigate('/profile/' + u?.username); }} className="w-full flex items-center gap-3 hover:bg-white/5 rounded-xl p-2 transition-colors">
                  <Avatar url={u?.avatar_url} name={u?.display_name} size={10} />
                  <div className="flex-1 text-left">
                    <p className="text-white font-semibold text-sm">{u?.display_name}</p>
                    <p className="text-[#6B7280] text-xs">@{u?.username}</p>
                  </div>
                  <button className="text-[#1E6FFF] border border-[#1E6FFF]/40 px-3 py-1 rounded-full text-xs font-bold">Follow</button>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT HISTORY MODAL ── */}
      {showEditHistory && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowEditHistory(false)}>
          <div className="w-full max-w-[620px] mx-auto bg-[#0d1f3c] border-t border-white/15 rounded-t-3xl p-5" style={{ animation: 'slideUp 0.25s ease-out', maxHeight: '60dvh' }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><History size={18} /> Edit History</h3>
            <div className="overflow-y-auto space-y-3" style={{ maxHeight: '40dvh' }}>
              {/* Current version */}
              <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-xl p-3">
                <p className="text-[#1E6FFF] text-xs font-bold mb-1">Current version</p>
                <p className="text-white/85 text-sm">{post.caption}</p>
              </div>
              {/* Previous versions */}
              {(post.edit_history || []).reverse().map((version, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <p className="text-[#6B7280] text-xs mb-1">Version {(post.edit_history.length - i)} · {formatTime(version.editedAt)}</p>
                  <p className="text-white/70 text-sm">{version.body}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setShowEditHistory(false)} className="w-full mt-4 py-3 bg-white/8 rounded-2xl text-white font-semibold border border-white/10">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {showReportModal && (
        <ReportModal
          target={reportTarget}
          onClose={() => setShowReportModal(false)}
          userId={user.id}
        />
      )}
    </div>
  );
}