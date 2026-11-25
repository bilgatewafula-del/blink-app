import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, ImagePlus, Clapperboard, MapPin, Hash, Camera,
  X, Globe, Users, Lock, ChevronDown,
  Loader, CheckCircle, Ban, Type } from 'lucide-react';
import { STORY_BACKGROUNDS, bgCss, textSizeFor } from '../../lib/storyPalette';
import Avatar from '../../components/Avatar';
import MentionTextarea from '../../components/MentionTextarea';
import { uploadToCloudinary } from '../../lib/upload';
import { DAILY_POST_LIMIT } from '../../utils/usernameValidation';
import { goBack } from '../../lib/nav';

/* ── Image compression — unchanged, already solid ── */
async function compressImage(file, maxW = 1920, maxH = 1920, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Reads a video's length and grabs a still frame for the feed thumbnail
function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const done = (r) => { URL.revokeObjectURL(url); resolve(r); };
    const timer = setTimeout(() => done({ duration: 0, poster: null }), 8000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth || 720, v.videoHeight || 720));
        const c = document.createElement('canvas');
        c.width = Math.round((v.videoWidth || 720) * scale); c.height = Math.round((v.videoHeight || 405) * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => done({ duration: v.duration || 0, poster: b ? new File([b], 'poster.jpg', { type: 'image/jpeg' }) : null }), 'image/jpeg', 0.8);
      } catch { done({ duration: v.duration || 0, poster: null }); }
    };
    v.onerror = () => { clearTimeout(timer); done({ duration: 0, poster: null }); };
    v.src = url;
  });
}

// Fallback thumbnail when Cloudinary's eager transform isn't
// configured on the upload preset — Cloudinary can derive a still
// frame from a video by swapping the delivery extension to an image
// format, a standard trick that needs no extra upload-time config.
function deriveVideoThumbnail(videoUrl) {
  if (!videoUrl) return null;
  return videoUrl.replace(/\.\w+$/, '.jpg');
}

const AUDIENCES = [
  { key:'public',    icon: Globe,  label:'Everyone'         },
  { key:'followers', icon: Users,  label:'Followers only'   },
  { key:'private',   icon: Lock,   label:'Only me'          },
];

const HASHTAG_SUGGESTIONS = [
  '#Kenya','#Nigeria','#Africa','#GenZ','#Nairobi','#Lagos',
  '#Music','#Fashion','#Food','#Business','#Tech','#Sports',
];

export default function CreatePost() {
  const navigate         = useNavigate();
  const [searchParams]   = useSearchParams();
  const { user, profile } = useAuth();
  const editPostId       = searchParams.get('edit');
  const attachHint       = searchParams.get('attach'); // 'photo' | 'video' from the Home composer card

  const fileInputRef  = useRef();
  const videoInputRef = useRef();
  const camPhotoRef = useRef();
  const camVideoRef = useRef();
  const [camSheet, setCamSheet] = useState(false);
  
  const textareaRef   = useRef();
  const locationInputRef = useRef();
  const audienceMenuRef  = useRef();
  const hashtagMenuRef   = useRef();

  const [caption,       setCaption]       = useState('');
  const [location,      setLocation]      = useState('');
  const [showLocation,  setShowLocation]  = useState(false);
  const [audience,      setAudience]      = useState('public');
  const [bgStyle,       setBgStyle]       = useState('');
  const [hashtags,      setHashtags]      = useState([]);
  const [showHashtags,  setShowHashtags]  = useState(false);
  const [showAudience,  setShowAudience]  = useState(false);
  const [mediaFiles,    setMediaFiles]    = useState([]); // newly selected: [{file, preview, type, size}]
  const [existingMedia, setExistingMedia] = useState({ images: [], video: null, videoThumb: null }); // when editing
  const [uploadProgress,setUploadProgress]= useState({});
  const [submitting,    setSubmitting]    = useState(false);
  const [submitPhase,   setSubmitPhase]   = useState('');
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState(false);

  // Home's Photo / Video shortcuts: open the picker right away. Browsers may block this if the
  // tap's permission has lapsed — then the composer simply stays open and the normal buttons work.
  useEffect(() => {
    if (editPostId || !attachHint) return undefined;
    const t = setTimeout(() => {
      try {
        if (attachHint === 'photo') fileInputRef.current?.click();
        else if (attachHint === 'video') videoInputRef.current?.click();
      } catch (_) { /* fall back to the on-screen buttons */ }
    }, 150);
    return () => clearTimeout(t);
  }, [attachHint, editPostId]);

  const charLimit   = 500;
  const hasNewMedia = mediaFiles.length > 0;
  const textOnly = !hasNewMedia && existingMedia.images.length === 0 && !existingMedia.video && caption.trim().length > 0 && caption.length <= 220;
  const hasMedia    = hasNewMedia || existingMedia.images.length > 0 || !!existingMedia.video;
  const postsToday  = (profile?.posts_today_date === new Date().toISOString().slice(0,10))
    ? (profile?.posts_today || 0) : 0;
  const atDailyLimit = postsToday >= DAILY_POST_LIMIT;

  /* Load post for editing — now also restores existing media so the
     editor doesn't misleadingly look empty for a post that has images
     or video. */
  useEffect(() => {
    if (!editPostId) return;
    (async () => {
      const { data } = await supabase.from('posts')
        .select('*').eq('id', editPostId).eq('user_id', user.id).maybeSingle();
      if (data) {
        setCaption(data.caption || '');
        setAudience(data.audience || 'public');
        setBgStyle(data.bg_color || '');
        setHashtags(data.hashtags || []);
        setLocation(data.location || '');
        setShowLocation(!!data.location);
        setExistingMedia({
          images: data.media_urls || [],
          video: data.video_url || null,
          videoThumb: data.video_thumbnail || null,
        });
      }
    })();
  }, [editPostId, user.id]);

  // Unfinished posts survive leaving the screen (new posts only)
  useEffect(() => {
    if (editPostId) return;
    try {
      const d = JSON.parse(localStorage.getItem('blink_post_draft') || 'null');
      if (d?.caption) { setCaption(d.caption); setBgStyle(d.bgStyle || ''); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (editPostId) return undefined;
    const t = setTimeout(() => {
      try {
        if (caption.trim()) localStorage.setItem('blink_post_draft', JSON.stringify({ caption, bgStyle }));
        else localStorage.removeItem('blink_post_draft');
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [caption, bgStyle, editPostId]);

  // Object URLs from local previews must be revoked or they leak for
  // the life of the tab — previously never cleaned up on remove or
  // unmount.
  useEffect(() => {
    return () => { mediaFiles.forEach(m => URL.revokeObjectURL(m.preview)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-outside closes the audience/hashtag dropdowns — previously
  // the only way to close them was picking an option; tapping
  // anywhere else on the screen did nothing.
  useEffect(() => {
    const onClickOutside = (e) => {
      if (showAudience && audienceMenuRef.current && !audienceMenuRef.current.contains(e.target)) setShowAudience(false);
      if (showHashtags && hashtagMenuRef.current && !hashtagMenuRef.current.contains(e.target)) setShowHashtags(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showAudience, showHashtags]);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/') && f.size <= 25 * 1024 * 1024);
    if (!files.length) { e.target.value = ''; setError('Choose images under 25 MB.'); return; }
    const remaining = 10 - mediaFiles.length - existingMedia.images.length;
    const selected  = files.slice(0, Math.max(0, remaining));
    const previews  = selected.map(f => ({
      file: f, preview: URL.createObjectURL(f), type: 'image', size: f.size,
    }));
    setMediaFiles(prev => [...prev, ...previews]);
    e.target.value = '';
  };

  const handleVideoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('video/')) { setError('Please choose a video file.'); return; }
    if (file.size > 100 * 1024 * 1024) { setError('Video must be under 100 MB.'); return; }
    const meta = await probeVideo(file);
    if (meta.duration > 180) { setError('Videos can be up to 3 minutes long.'); return; }
    setError('');
    setMediaFiles(prev => [
      ...prev,
      { file, preview: URL.createObjectURL(file), type: 'video', size: file.size, poster: meta.poster },
    ]);
  };

  const removeMedia = (idx) => {
    setMediaFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const removeExistingImage = (idx) => {
    setExistingMedia(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const removeExistingVideo = () => {
    setExistingMedia(prev => ({ ...prev, video: null, videoThumb: null }));
  };

  const toggleHashtag = (tag) => {
    const clean = tag.replace('#', '');
    const exists = hashtags.includes(clean);
    if (exists) {
      setHashtags(h => h.filter(t => t !== clean));
      setCaption(c => c.replace(' #' + clean, '').replace('#' + clean, '').trim());
    } else {
      setHashtags(h => [...h, clean]);
      setCaption(c => (c ? c + ' ' : '') + '#' + clean);
      textareaRef.current?.focus();
    }
    setShowHashtags(false);
  };

  const handleLocationToggle = () => {
    setShowLocation(v => {
      const next = !v;
      if (next) setTimeout(() => locationInputRef.current?.focus(), 50);
      else setLocation('');
      return next;
    });
  };

  const extractHashtags = (text) => {
    const matches = text.match(/#(\w+)/g) || [];
    return matches.map(h => h.slice(1));
  };

  const handleSubmit = async () => {
    if (!caption.trim() && !hasMedia) { setError('Add a caption or media.'); return; }
    if (caption.length > charLimit)   { setError(`Caption too long (max ${charLimit} chars).`); return; }

    setSubmitting(true); setError('');

    try {
      let mediaUrls  = [...existingMedia.images];
      let videoUrl   = existingMedia.video;
      let videoDuration = null;
      let videoThumb = existingMedia.videoThumb;
      const newVideo = mediaFiles.find(m => m.type === 'video');
      const postType = (newVideo || videoUrl) ? 'video' : hasMedia ? 'image' : 'text';

      if (hasNewMedia) {
        setSubmitPhase('compressing');
        const ready = [];
        for (let i = 0; i < mediaFiles.length; i++) {
          const m = mediaFiles[i];
          if (m.type === 'image') {
            const compressed = await compressImage(m.file);
            ready.push({ ...m, file: compressed });
          } else {
            ready.push(m);
          }
        }

        setSubmitPhase('uploading');
        for (let i = 0; i < ready.length; i++) {
          const m = ready[i];
          const result = await uploadToCloudinary(
            m.file,
            m.type === 'video' ? 'video' : 'image',
            (pct) => setUploadProgress(prev => ({ ...prev, [i]: pct }))
          );
          if (m.type === 'video') {
            videoUrl      = result.secure_url;
            videoDuration = result.duration ? Math.round(result.duration) : null;
            videoThumb    = result.eager?.[0]?.secure_url || deriveVideoThumbnail(result.secure_url);
            if (m.poster) {
              try { videoThumb = (await uploadToCloudinary(m.poster, 'image')).secure_url; } catch { /* keep derived thumbnail */ }
            }
          } else {
            mediaUrls.push(result.secure_url);
          }
        }
      }

      setSubmitPhase('saving');
      const allHashtags = [...new Set([...hashtags, ...extractHashtags(caption)])];
      let createdPost = null;

      if (editPostId) {
        const { error: dbErr } = await supabase.from('posts').update({
          caption:   caption.trim(),
          audience,
          hashtags:  allHashtags,
          location:  location.trim() || null,
          media_urls: mediaUrls.length > 0 ? mediaUrls : null,
          video_url: videoUrl,
          video_duration: videoDuration,
          video_thumbnail: videoThumb,
          post_type: postType,
          bg_color: textOnly ? (bgStyle || null) : null,
        }).eq('id', editPostId).eq('user_id', user.id);
        if (dbErr) throw new Error(dbErr.message);
      } else {
        // .select().single() so we can hand the finished post straight
        // to Home.js for an optimistic insert — previously this just
        // fired the insert and navigated home with no post data, so
        // the feed's optimistic-insert path (added earlier) had
        // nothing to prepend and the user had to pull-to-refresh to
        // see their own post.
        const payload = {
          user_id:         user.id,
          caption:         caption.trim(),
          audience,
          post_type:       postType,
          hashtags:        allHashtags,
          location:        location.trim() || null,
          media_urls:      mediaUrls.length > 0 ? mediaUrls : null,
          video_url:       videoUrl,
          video_duration:  videoDuration,
          video_thumbnail: videoThumb,
          is_draft:        false,
          status:          'active',
          bg_color:        textOnly ? (bgStyle || null) : null,
        };
        let { data: inserted, error: dbErr } = await supabase.from('posts').insert(payload).select('*').single();
        if (dbErr && /bg_color/i.test(dbErr.message || '')) {          // older database without the column
          delete payload.bg_color;
          ({ data: inserted, error: dbErr } = await supabase.from('posts').insert(payload).select('*').single());
        }
        if (dbErr) throw new Error(dbErr.message);
        try { localStorage.removeItem('blink_post_draft'); } catch { /* ignore */ }

        // posts_count is now maintained by a DB trigger
        // (sync_user_posts_count) instead of this client-side
        // read-then-write, which raced under concurrent posting —
        // see 22_stories_createpost_rpcs.sql. No client call needed.

        createdPost = inserted
          ? { ...inserted, users: profile } // profile already has the author fields PostCard needs
          : null;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/', createdPost ? { state: { newPost: createdPost } } : undefined);
      }, 800);

    } catch (err) {
      console.error('CreatePost error:', err.message);
      const raw = err.message || '';
      if (raw.includes('Daily post limit')) {
        setError('Daily post limit reached (10 posts/day). Come back tomorrow!');
      } else if (raw.includes('Duplicate post')) {
        setError('You already posted this. Wait a bit before reposting the same content.');
      } else if (raw.includes('too quickly')) {
        setError('You are posting too fast. Please wait a few seconds and try again.');
      } else {
        setError(raw || 'Post failed. Try again.');
      }
    }

    setSubmitting(false);
    setSubmitPhase('');
    setUploadProgress({});
  };

  const aud = AUDIENCES.find(a => a.key === audience) || AUDIENCES[0];
  const totalMediaCount = mediaFiles.length + existingMedia.images.length + (existingMedia.video ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#E6E9F6] flex flex-col">

      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center justify-between">
        <button onClick={() => goBack(navigate, '/')} aria-label="Back" className="text-[#CBD5E1] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-white font-bold text-[15px]">
            {editPostId ? 'Edit Post' : 'Create Post'}
          </h1>
          {!editPostId && (
            <p className={`text-[11px] font-semibold ${
              atDailyLimit ? 'text-red-600' :
              postsToday >= DAILY_POST_LIMIT - 2 ? 'text-orange-700' :
              'text-[#CBD5E1]'
            }`}>
              {postsToday}/{DAILY_POST_LIMIT} posts today
            </p>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || (!caption.trim() && !hasMedia) || (atDailyLimit && !editPostId)}
          className="flex items-center gap-1.5 bg-[#7C3AED] text-white text-sm font-bold px-4 py-2 rounded-full disabled:opacity-50 active:scale-95 transition-all"
          style={{ boxShadow: '0 4px 16px rgba(124,58,237,0.35)' }}
        >
          {submitting
            ? <><Loader size={14} className="animate-spin" /> {submitPhase === 'compressing' ? 'Compressing...' : submitPhase === 'uploading' ? 'Uploading...' : 'Saving...'}</>
            : success
              ? <><CheckCircle size={14} /> Posted!</>
              : editPostId ? 'Save' : 'Post'
          }
        </button>
      </div>

      {atDailyLimit && !editPostId && (
        <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
          <Ban size={24} className="text-red-600 flex-shrink-0" />
          <div>
            <p className="text-red-600 font-bold text-sm">Daily post limit reached</p>
            <p className="text-red-600/70 text-xs mt-0.5">
              You've used all {DAILY_POST_LIMIT} posts for today. Come back tomorrow to post again. This keeps B-Link spam-free and professional.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">

        <div className="flex items-center gap-3 mb-4">
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={10} />
          <div>
            <p className="text-[#111827] font-bold text-[14px]">{profile?.display_name}</p>
            <div className="relative" ref={audienceMenuRef}>
              <button
                onClick={() => setShowAudience(!showAudience)}
                className="flex items-center gap-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] px-2.5 py-1 rounded-full mt-0.5 transition-colors"
              >
                <aud.icon size={11} className="text-[#64748B]" />
                <span className="text-[#64748B] text-[11px] font-semibold">{aud.label}</span>
                <ChevronDown size={11} className="text-[#94A3B8]" />
              </button>

              {showAudience && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xl z-30" style={{ minWidth: 200 }}>
                  {AUDIENCES.map(a => (
                    <button
                      key={a.key}
                      onClick={() => { setAudience(a.key); setShowAudience(false); }}
                      className={'w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-left transition-colors ' +
                        (audience === a.key ? 'bg-[#7C3AED]/10' : '')}
                    >
                      <a.icon size={16} className={audience === a.key ? 'text-[#6D28D9]' : 'text-[#64748B]'} />
                      <span className={`text-[14px] font-medium ${audience === a.key ? 'text-[#7C3AED]' : 'text-[#111827]'}`}>{a.label}</span>
                      {audience === a.key && <CheckCircle size={14} className="text-[#6D28D9] ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {bgStyle && textOnly ? (
          <div className="rounded-3xl px-6 py-8 mb-2 flex items-center justify-center" style={{ background: bgCss(bgStyle), minHeight: 220 }}>
            <textarea
              ref={textareaRef} value={caption} onChange={e => setCaption(e.target.value)} rows={4} maxLength={charLimit + 50}
              placeholder="Type something"
              className="w-full bg-transparent text-[#111827] text-center font-extrabold focus:outline-none resize-none placeholder-[#94A3B8]"
              style={{ fontSize: textSizeFor(caption.length), lineHeight: 1.25, textShadow: '0 2px 12px rgba(0,0,0,.18)' }}
            />
          </div>
        ) : (
          <MentionTextarea
            textareaRef={textareaRef}
            value={caption}
            onChange={setCaption}
            placeholder="What's on your mind? Use # for hashtags, @ to mention..."
            rows={5}
            maxLength={charLimit + 50}
            hashtagIdeas={HASHTAG_SUGGESTIONS}
            className="text-[17px] leading-relaxed"
          />
        )}
        {textOnly && (
          <div className="mb-3">
            <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Type size={12} /> Background</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setBgStyle('')} aria-label="No background"
                className="w-8 h-8 rounded-full flex-shrink-0 border-2 flex items-center justify-center text-[#64748B]"
                style={{ borderColor: !bgStyle ? '#fff' : '#E2E8F0' }}><X size={14} /></button>
              {STORY_BACKGROUNDS.map((b) => (
                <button key={b.key} onClick={() => setBgStyle(b.key)} aria-label={`Background ${b.key}`}
                  className="w-8 h-8 rounded-full flex-shrink-0 transition-transform"
                  style={{ background: b.css, border: bgStyle === b.key ? '2.5px solid #fff' : '2px solid #E2E8F0', transform: bgStyle === b.key ? 'scale(1.12)' : 'none' }} />
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end mb-3">
          <span className={`text-xs font-semibold ${caption.length > charLimit ? 'text-red-600' : caption.length > charLimit * 0.85 ? 'text-orange-700' : 'text-[#64748B]'}`}>
            {caption.length}/{charLimit}
          </span>
        </div>

        {/* Existing media (edit mode) — previously this was simply
            never loaded, so editing a post with images/video looked
            like it had none. Shown separately from newly-added local
            files since one's already uploaded and one isn't. */}
        {(existingMedia.images.length > 0 || existingMedia.video) && (
          <div className="mb-3">
            <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider mb-2">Current media</p>
            <div className="grid grid-cols-2 gap-2">
              {existingMedia.video && (
                <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-[#E2E8F0] col-span-2">
                  <video src={existingMedia.video} poster={existingMedia.videoThumb} className="w-full object-cover" style={{ maxHeight:200 }} muted playsInline />
                  <button onClick={removeExistingVideo} aria-label="Remove video"
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/70 transition-colors">
                    <X size={14} color="white" />
                  </button>
                </div>
              )}
              {existingMedia.images.map((url, i) => (
                <div key={url} className="relative rounded-2xl overflow-hidden bg-black/40 border border-[#E2E8F0]">
                  <img src={url} alt="" className="w-full object-cover" style={{ maxHeight:180, aspectRatio:'1/1' }} />
                  <button onClick={() => removeExistingImage(i)} aria-label="Remove image"
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/70 transition-colors">
                    <X size={14} color="white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {mediaFiles.length > 0 && (
          <div className="mb-4">
            {existingMedia.images.length > 0 && (
              <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider mb-2">New media</p>
            )}
            <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {mediaFiles.map((m, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-black/40 border border-[#E2E8F0]">
                  {m.type === 'video'
                    ? <video src={m.preview} className="w-full object-cover" style={{ maxHeight:200, aspectRatio:'16/9' }} muted playsInline />
                    : <img src={m.preview} alt="" className="w-full object-cover" style={{ maxHeight: mediaFiles.length === 1 ? 300 : 180, aspectRatio:'1/1' }} />
                  }
                  {uploadProgress[i] !== undefined && uploadProgress[i] < 100 && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                      <div className="w-3/4 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div className="h-full bg-[#7C3AED] rounded-full transition-all duration-300" style={{ width: uploadProgress[i] + '%' }} />
                      </div>
                      <p className="text-[#111827] text-xs font-bold">{uploadProgress[i]}%</p>
                    </div>
                  )}
                  <div className="absolute bottom-1.5 left-1.5 bg-black/60 rounded-full px-2 py-0.5">
                    <p className="text-[#64748B] text-[10px]">{(m.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button onClick={() => removeMedia(i)} aria-label="Remove"
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/70 transition-colors">
                    <X size={14} color="white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {submitting && submitPhase === 'compressing' && (
          <div className="mb-4 flex items-center gap-3 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-xl px-4 py-3">
            <Loader size={16} className="text-[#6D28D9] animate-spin flex-shrink-0" />
            <div>
              <p className="text-[#111827] text-sm font-bold">Optimising media...</p>
              <p className="text-[#64748B] text-xs">Compressing images for best quality & speed</p>
            </div>
          </div>
        )}

        {/* Location — was always rendered regardless of the toolbar
            button (which used to just focus the caption box instead
            of doing anything location-related). Now toggled by that
            button, matching the hashtag panel's pattern. */}
        {showLocation && (
          <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 mb-3">
            <MapPin size={14} className="text-[#64748B] flex-shrink-0" />
            <input
              ref={locationInputRef}
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add location..."
              className="flex-1 bg-transparent text-[#111827] text-sm placeholder-[#94A3B8] focus:outline-none"
            />
            <button onClick={handleLocationToggle} aria-label="Remove location" className="text-[#64748B] hover:text-[#111827]">
              <X size={14} />
            </button>
          </div>
        )}

        {showHashtags && (
          <div className="mb-3" ref={hashtagMenuRef}>
            <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider mb-2">Popular Hashtags</p>
            <div className="flex flex-wrap gap-2">
              {HASHTAG_SUGGESTIONS.map(tag => {
                const clean = tag.replace('#','');
                const active = hashtags.includes(clean);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleHashtag(tag)}
                    className={'px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                      (active ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] hover:bg-[#F1F5F9]')}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-[620px] mx-auto bg-white border-t border-[#E2E8F0]"
        style={{ paddingBottom:'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start gap-1 px-3 pt-2 pb-1">

          {[
            { key: 'photo', icon: ImagePlus, label: 'Photo', onClick: () => fileInputRef.current?.click(), off: submitting },
            { key: 'video', icon: Clapperboard, label: 'Video', onClick: () => videoInputRef.current?.click(), off: submitting || mediaFiles.some(m => m.type === 'video') || !!existingMedia.video },
            { key: 'camera', icon: Camera, label: 'Camera', onClick: () => setCamSheet(true), off: submitting },
            { key: 'tags', icon: Hash, label: 'Tags', onClick: () => setShowHashtags(!showHashtags), off: submitting, active: showHashtags },
            { key: 'place', icon: MapPin, label: 'Place', onClick: handleLocationToggle, off: submitting, active: showLocation },
          ].map(({ key, icon: Icon, label, onClick, off, active }) => (
            <button key={key} onClick={onClick} disabled={off} aria-label={label}
              className="flex-1 flex flex-col items-center gap-1.5 py-1 disabled:opacity-40 active:scale-95 transition-transform">
              <span className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-colors ${active ? 'bg-[#7C3AED]/15 border-[#7C3AED]/50 text-[#7C3AED]' : 'bg-[#F1F5F9] border-[#E2E8F0] text-[#111827]'}`}>
                <Icon size={22} strokeWidth={1.8} />
              </span>
              <span className={`text-[11px] font-semibold ${active ? 'text-[#7C3AED]' : 'text-[#64748B]'}`}>{label}</span>
            </button>
          ))}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
          <input ref={camPhotoRef} type="file" accept="image/*" capture className="hidden" onChange={handleImageSelect} />
          <input ref={camVideoRef} type="file" accept="video/*" capture className="hidden" onChange={handleVideoSelect} />

          {totalMediaCount > 0 && (
            <div className="ml-auto bg-[#7C3AED]/20 px-2.5 py-1 rounded-full">
              <p className="text-[#6D28D9] text-[12px] font-bold">{totalMediaCount}/10</p>
            </div>
          )}
        </div>
      </div>
      {camSheet && (
        <div className="fixed inset-0 z-[80] bg-black/65 flex items-end justify-center" onClick={() => setCamSheet(false)}>
          <div className="w-full max-w-[620px] bg-white border-t border-[#E2E8F0] rounded-t-3xl pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-[#E2E8F0] mx-auto mt-2.5 mb-2" />
            <p className="text-[#111827] font-bold text-[15px] px-5 pb-1">Camera</p>
            <button onClick={() => { setCamSheet(false); setTimeout(() => camPhotoRef.current?.click(), 50); }}
              className="w-full flex items-center gap-3.5 px-5 py-3.5 active:bg-[#F8FAFC] text-left">
              <Camera size={22} strokeWidth={1.8} className="text-[#111827]" /><span className="text-[#111827] text-[15px] font-semibold">Take a photo</span>
            </button>
            <button onClick={() => { setCamSheet(false); setTimeout(() => camVideoRef.current?.click(), 50); }}
              disabled={mediaFiles.some(m => m.type === 'video') || !!existingMedia.video}
              className="w-full flex items-center gap-3.5 px-5 py-3.5 active:bg-[#F8FAFC] text-left disabled:opacity-40">
              <Clapperboard size={22} strokeWidth={1.8} className="text-[#111827]" /><span className="text-[#111827] text-[15px] font-semibold">Record a video</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
