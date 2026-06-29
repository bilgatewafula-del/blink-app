import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Image, Video, MapPin, Hash,
  X, Globe, Users, Lock, ChevronDown,
  Loader, CheckCircle,
} from 'lucide-react';
import Avatar from '../../components/Avatar';

/* ── Image compression ───────────────────────
   Compresses image to target quality/size using
   an offscreen canvas before uploading.
─────────────────────────────────────────────── */
async function compressImage(file, maxW = 1920, maxH = 1920, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      // Scale down if larger than max
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // Sharpen pass
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          // Use compressed only if smaller
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

/* ── Upload a single file to Cloudinary ─────── */
async function uploadToCloudinary(file, resourceType = 'image', onProgress) {
  const cloud  = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
  const preset = 'blink_uploads';
  const formData = new FormData();
  formData.append('file',           file);
  formData.append('upload_preset',  preset);
  formData.append('cloud_name',     cloud);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText);
      if (data.secure_url) resolve(data);
      else reject(new Error(data.error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

/* ── Audience options ── */
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

  const fileInputRef  = useRef();
  const videoInputRef = useRef();
  const textareaRef   = useRef();

  const [caption,       setCaption]       = useState('');
  const [location,      setLocation]      = useState('');
  const [audience,      setAudience]      = useState('public');
  const [hashtags,      setHashtags]      = useState([]);
  const [showHashtags,  setShowHashtags]  = useState(false);
  const [showAudience,  setShowAudience]  = useState(false);
  const [mediaFiles,    setMediaFiles]    = useState([]); // [{file, preview, type}]
  const [uploadProgress,setUploadProgress]= useState({}); // {idx: pct}
  const [compressing,   setCompressing]   = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitPhase,   setSubmitPhase]   = useState(''); // compressing|uploading|saving
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState(false);

  const charLimit = 500;
  const hasMedia  = mediaFiles.length > 0;

  /* Load post for editing */
  useEffect(() => {
    if (!editPostId) return;
    (async () => {
      const { data } = await supabase.from('posts')
        .select('*').eq('id', editPostId).eq('user_id', user.id).maybeSingle();
      if (data) {
        setCaption(data.caption || '');
        setAudience(data.audience || 'public');
        setHashtags(data.hashtags || []);
        setLocation(data.location || '');
      }
    })();
  }, [editPostId]);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 10 - mediaFiles.length;
    const selected  = files.slice(0, remaining);
    const previews  = selected.map(f => ({
      file:    f,
      preview: URL.createObjectURL(f),
      type:    'image',
      size:    f.size,
    }));
    setMediaFiles(prev => [...prev, ...previews]);
    e.target.value = '';
  };

  const handleVideoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError('Video must be under 100 MB.'); return; }
    setMediaFiles(prev => [
      ...prev,
      { file, preview: URL.createObjectURL(file), type: 'video', size: file.size },
    ]);
    e.target.value = '';
  };

  const removeMedia = (idx) => {
    const updated = mediaFiles.filter((_, i) => i !== idx);
    setMediaFiles(updated);
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

  const extractHashtags = (text) => {
    const matches = text.match(/#(\w+)/g) || [];
    return matches.map(h => h.slice(1));
  };

  const handleSubmit = async () => {
    if (!caption.trim() && !hasMedia) { setError('Add a caption or media.'); return; }
    if (caption.length > charLimit)   { setError(`Caption too long (max ${charLimit} chars).`); return; }

    setSubmitting(true); setError('');

    try {
      let mediaUrls  = [];
      let videoUrl   = null;
      let videoDuration = null;
      let videoThumb = null;
      const postType = mediaFiles.some(m => m.type === 'video') ? 'video' : hasMedia ? 'image' : 'text';

      if (hasMedia) {
        /* ── Phase 1: compress images ── */
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

        /* ── Phase 2: upload ── */
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
            videoThumb    = result.eager?.[0]?.secure_url || null;
          } else {
            mediaUrls.push(result.secure_url);
          }
        }
      }

      /* ── Phase 3: save to DB ── */
      setSubmitPhase('saving');
      const allHashtags = [...new Set([...hashtags, ...extractHashtags(caption)])];

      if (editPostId) {
        // Editing existing post
        const { error: dbErr } = await supabase.from('posts').update({
          caption:   caption.trim(),
          audience,
          hashtags:  allHashtags,
          location:  location.trim() || null,
          ...(hasMedia && mediaUrls.length > 0 ? { media_urls: mediaUrls, post_type: postType } : {}),
          ...(videoUrl ? { video_url: videoUrl, video_duration: videoDuration, video_thumbnail: videoThumb, post_type:'video' } : {}),
        }).eq('id', editPostId).eq('user_id', user.id);
        if (dbErr) throw new Error(dbErr.message);
      } else {
        // New post
        const { error: dbErr } = await supabase.from('posts').insert({
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
          likes_count:     0,
          comments_count:  0,
          reposts_count:   0,
          views_count:     0,
          shares_count:    0,
        });
        if (dbErr) throw new Error(dbErr.message);

        // Update user post count
        await supabase.from('users').update({ posts_count: (profile?.posts_count||0)+1 }).eq('id', user.id);
      }

      setSuccess(true);
      setTimeout(() => navigate('/'), 800);

    } catch (err) {
      console.error('CreatePost error:', err.message);
      setError(err.message || 'Post failed. Try again.');
    }

    setSubmitting(false);
    setSubmitPhase('');
    setUploadProgress({});
  };

  const aud = AUDIENCES.find(a => a.key === audience) || AUDIENCES[0];

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-[15px]">
          {editPostId ? 'Edit Post' : 'Create Post'}
        </h1>
        <button
          onClick={handleSubmit}
          disabled={submitting || (!caption.trim() && !hasMedia)}
          className="flex items-center gap-1.5 bg-[#1E6FFF] text-white text-sm font-bold px-4 py-2 rounded-full disabled:opacity-50 active:scale-95 transition-all"
          style={{ boxShadow: '0 4px 16px rgba(30,111,255,0.35)' }}
        >
          {submitting
            ? <><Loader size={14} className="animate-spin" /> {submitPhase === 'compressing' ? 'Compressing...' : submitPhase === 'uploading' ? 'Uploading...' : 'Saving...'}</>
            : success
              ? <><CheckCircle size={14} /> Posted!</>
              : editPostId ? 'Save' : 'Post'
          }
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">

        {/* Author */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={10} />
          <div>
            <p className="text-white font-bold text-[14px]">{profile?.display_name}</p>
            {/* Audience selector */}
            <button
              onClick={() => setShowAudience(!showAudience)}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-full mt-0.5 transition-colors"
            >
              <aud.icon size={11} className="text-white/60" />
              <span className="text-white/70 text-[11px] font-semibold">{aud.label}</span>
              <ChevronDown size={11} className="text-white/40" />
            </button>
          </div>
        </div>

        {/* Audience dropdown */}
        {showAudience && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden mb-4 shadow-xl">
            {AUDIENCES.map(a => (
              <button
                key={a.key}
                onClick={() => { setAudience(a.key); setShowAudience(false); }}
                className={'w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors ' +
                  (audience === a.key ? 'bg-[#1E6FFF]/10' : '')}
              >
                <a.icon size={16} className={audience === a.key ? 'text-[#1E6FFF]' : 'text-[#6B7280]'} />
                <span className={`text-[14px] font-medium ${audience === a.key ? 'text-[#1E6FFF]' : 'text-white/80'}`}>{a.label}</span>
                {audience === a.key && <CheckCircle size={14} className="text-[#1E6FFF] ml-auto" />}
              </button>
            ))}
          </div>
        )}

        {/* Caption */}
        <textarea
          ref={textareaRef}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="What's on your mind? Use # for hashtags, @ to mention..."
          rows={5}
          maxLength={charLimit + 50}
          className="w-full bg-transparent text-white text-[17px] placeholder-[#6B7280] focus:outline-none resize-none leading-relaxed mb-2"
          style={{ minHeight: 120 }}
        />
        <div className="flex justify-end mb-3">
          <span className={`text-xs font-semibold ${caption.length > charLimit ? 'text-red-400' : caption.length > charLimit * 0.85 ? 'text-orange-400' : 'text-[#6B7280]'}`}>
            {caption.length}/{charLimit}
          </span>
        </div>

        {/* Media preview */}
        {mediaFiles.length > 0 && (
          <div className="mb-4">
            <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : mediaFiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
              {mediaFiles.map((m, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                  {m.type === 'video'
                    ? <video src={m.preview} className="w-full object-cover" style={{ maxHeight:200, aspectRatio:'16/9' }} muted playsInline />
                    : <img src={m.preview} alt="" className="w-full object-cover" style={{ maxHeight: mediaFiles.length === 1 ? 300 : 180, aspectRatio:'1/1' }} />
                  }
                  {/* Upload progress */}
                  {uploadProgress[i] !== undefined && uploadProgress[i] < 100 && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                      <div className="w-3/4 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1E6FFF] rounded-full transition-all duration-300" style={{ width: uploadProgress[i] + '%' }} />
                      </div>
                      <p className="text-white text-xs font-bold">{uploadProgress[i]}%</p>
                    </div>
                  )}
                  {/* File size badge */}
                  <div className="absolute bottom-1.5 left-1.5 bg-black/60 rounded-full px-2 py-0.5">
                    <p className="text-white/70 text-[10px]">{(m.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/70 transition-colors"
                  >
                    <X size={14} color="white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compressing indicator */}
        {submitting && submitPhase === 'compressing' && (
          <div className="mb-4 flex items-center gap-3 bg-[#1E6FFF]/10 border border-[#1E6FFF]/20 rounded-xl px-4 py-3">
            <Loader size={16} className="text-[#1E6FFF] animate-spin flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-bold">Optimising media...</p>
              <p className="text-[#6B7280] text-xs">Compressing images for best quality & speed</p>
            </div>
          </div>
        )}

        {/* Location */}
        {location !== undefined && (
          <div className="flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 mb-3">
            <MapPin size={14} className="text-[#6B7280] flex-shrink-0" />
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Add location..."
              className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none"
            />
            {location && (
              <button onClick={() => setLocation('')} className="text-[#6B7280] hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Hashtag suggestions */}
        {showHashtags && (
          <div className="mb-3">
            <p className="text-[#6B7280] text-[11px] font-bold uppercase tracking-wider mb-2">Popular Hashtags</p>
            <div className="flex flex-wrap gap-2">
              {HASHTAG_SUGGESTIONS.map(tag => {
                const clean = tag.replace('#','');
                const active = hashtags.includes(clean);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleHashtag(tag)}
                    className={'px-3 py-1.5 rounded-full text-xs font-bold border transition-all ' +
                      (active ? 'bg-[#1E6FFF] text-white border-[#1E6FFF]' : 'bg-white/5 text-white/60 border-white/15 hover:bg-white/10')}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[620px] mx-auto bg-[#0d1f3c] border-t border-white/[0.08]"
        style={{ paddingBottom:'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-1 px-4 py-2">

          {/* Photo */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-white/60 hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10 transition-all disabled:opacity-40"
          >
            <Image size={20} />
            <span className="text-sm font-semibold">Photo</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />

          {/* Video */}
          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={submitting || mediaFiles.some(m => m.type === 'video')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-white/60 hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10 transition-all disabled:opacity-40"
          >
            <Video size={20} />
            <span className="text-sm font-semibold">Video</span>
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />

          {/* Hashtag */}
          <button
            onClick={() => setShowHashtags(!showHashtags)}
            disabled={submitting}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all disabled:opacity-40 ${showHashtags ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-white/60 hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10'}`}
          >
            <Hash size={20} />
            <span className="text-sm font-semibold">Tags</span>
          </button>

          {/* Location */}
          <button
            onClick={() => { textareaRef.current?.focus(); }}
            disabled={submitting}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-white/60 hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10 transition-all disabled:opacity-40"
          >
            <MapPin size={20} />
            <span className="text-sm font-semibold">Location</span>
          </button>

          {/* Media count */}
          {mediaFiles.length > 0 && (
            <div className="ml-auto bg-[#1E6FFF]/20 px-2.5 py-1 rounded-full">
              <p className="text-[#1E6FFF] text-[12px] font-bold">{mediaFiles.length}/10</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}