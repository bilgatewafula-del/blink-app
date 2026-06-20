import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Image, Video, MapPin, Globe,
  Users, Lock, X, SmilePlus,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import SmartEmojiPicker from '../../components/SmartEmojiPicker';

const MAX_CHARS    = 500;
const MAX_IMAGES   = 4;
const MAX_VID_SECS = 300;   // 5 min
const MIN_VID_SECS = 10;    // 10 s

const AUDIENCE_OPTIONS = [
  { value: 'public',    label: 'Everyone',  icon: Globe,  color: '#2ECC71' },
  { value: 'followers', label: 'Followers', icon: Users,  color: '#1E6FFF' },
  { value: 'private',   label: 'Only me',   icon: Lock,   color: '#6B7280' },
];

/* ── SVG character-count ring ──────────────────── */
function CharRing({ value, max }) {
  const pct    = value / max;
  const danger = pct >= 1;
  const warn   = pct >= 0.9;
  const size   = 26;
  const stroke = 2.6;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = circ * Math.min(pct, 1);
  const color  = danger ? '#EF4444' : warn ? '#FF6B35' : '#1E6FFF';
  const remaining = max - value;
  if (value === 0) return null;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.15s ease, stroke 0.15s ease' }} />
      </svg>
      {remaining <= 30 && remaining >= 0 && (
        <span className="absolute text-[9px] font-bold" style={{ color }}>{remaining}</span>
      )}
    </div>
  );
}

export default function CreatePost() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const textRef      = useRef();
  const imageInput   = useRef();
  const videoInput   = useRef();
  const emojiBtnRef  = useRef();      // trigger ref for SmartEmojiPicker

  const [caption,       setCaption]      = useState('');
  const [images,        setImages]       = useState([]);
  const [video,         setVideo]        = useState(null);
  const [videoError,    setVideoError]   = useState('');
  const [location,      setLocation]     = useState('');
  const [showLocation,  setShowLocation] = useState(false);
  const [audience,      setAudience]     = useState('public');
  const [showAudience,  setShowAudience] = useState(false);
  const [showEmoji,     setShowEmoji]    = useState(false);
  const [uploading,     setUploading]    = useState(false);
  const [uploadPct,     setUploadPct]    = useState(0);
  const [error,         setError]        = useState('');

  const charCount = caption.length;
  const overLimit = charCount > MAX_CHARS;
  const canPost   = (caption.trim() || images.length || video) && !overLimit && !uploading;

  /* auto-resize textarea */
  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = 'auto';
      textRef.current.style.height = textRef.current.scrollHeight + 'px';
    }
  }, [caption]);

  /* ── Image picker ── */
  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (video) { setError('Cannot mix images and video in one post.'); return; }
    const remaining = MAX_IMAGES - images.length;
    const picked = files.slice(0, remaining).map(file => ({
      file, preview: URL.createObjectURL(file),
    }));
    setImages(prev => [...prev, ...picked]);
    setError('');
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  /* ── Video picker ── */
  const handleVideoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length) { setError('Cannot mix images and video in one post.'); return; }
    setVideoError(''); setError('');
    const url = URL.createObjectURL(file);
    const el  = document.createElement('video');
    el.preload = 'metadata'; el.src = url;
    el.onloadedmetadata = () => {
      const dur = el.duration;
      if (dur < MIN_VID_SECS) { setVideoError(`Video too short. Minimum is ${MIN_VID_SECS}s.`); URL.revokeObjectURL(url); return; }
      if (dur > MAX_VID_SECS) { setVideoError(`Video too long. Maximum is ${MAX_VID_SECS / 60} minutes.`); URL.revokeObjectURL(url); return; }
      setVideo({ file, preview: url, duration: Math.round(dur) });
    };
    e.target.value = '';
  };

  const removeVideo = () => {
    if (video?.preview) URL.revokeObjectURL(video.preview);
    setVideo(null); setVideoError('');
  };

  /* ── Cloudinary upload ── */
  const uploadToCloudinary = async (file, resourceType = 'image') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'blink_uploads');
    formData.append('cloud_name', process.env.REACT_APP_CLOUDINARY_CLOUD_NAME);
    const xhr = new XMLHttpRequest();
    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        const res = JSON.parse(xhr.responseText);
        if (res.secure_url) resolve(res.secure_url);
        else reject(new Error(res.error?.message || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);
      xhr.send(formData);
    });
  };

  const extractHashtags = (text) =>
    [...new Set((text.match(/#(\w+)/g) || []).map(h => h.slice(1).toLowerCase()))];

  /* ── Submit ── */
  const handlePost = async () => {
    if (!canPost) return;
    setUploading(true); setUploadPct(0); setError('');
    try {
      let imageUrls = [], videoUrl = null, videoDuration = null, videoThumb = null;

      if (images.length) {
        for (let i = 0; i < images.length; i++) {
          const url = await uploadToCloudinary(images[i].file, 'image');
          imageUrls.push(url);
          setUploadPct(Math.round(((i + 1) / images.length) * 80));
        }
      }
      if (video) {
        setUploadPct(10);
        videoUrl      = await uploadToCloudinary(video.file, 'video');
        videoDuration = video.duration;
        videoThumb    = videoUrl.replace('/video/upload/', '/video/upload/so_0/').replace(/\.\w+$/, '.jpg');
        setUploadPct(90);
      }

      const hashtags = extractHashtags(caption);
      const postType = video ? 'video' : images.length ? 'image' : 'text';

      const { error: dbError } = await supabase.from('posts').insert({
        user_id: user.id, caption: caption.trim(),
        media_urls: imageUrls.length ? imageUrls : null,
        video_url: videoUrl, video_duration: videoDuration, video_thumbnail: videoThumb,
        post_type: postType,
        hashtags: hashtags.length ? hashtags : null,
        location: location.trim() || null,
        audience, is_draft: false,
        likes_count: 0, comments_count: 0, reposts_count: 0, views_count: 0, shares_count: 0,
      });

      if (dbError) throw dbError;
      setUploadPct(100);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to post. Please try again.');
      setUploading(false);
    }
  };

  /* ── Insert emoji at cursor ── */
  const insertEmoji = useCallback((emojiData) => {
    const el = textRef.current;
    if (el) {
      const start = el.selectionStart ?? caption.length;
      const end   = el.selectionEnd   ?? caption.length;
      const next  = caption.slice(0, start) + emojiData.emoji + caption.slice(end);
      setCaption(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length);
      }, 0);
    } else {
      setCaption(t => t + emojiData.emoji);
    }
  }, [caption]);

  const AudienceIcon  = AUDIENCE_OPTIONS.find(o => o.value === audience)?.icon  || Globe;
  const audienceColor = AUDIENCE_OPTIONS.find(o => o.value === audience)?.color || '#2ECC71';
  const audienceLabel = AUDIENCE_OPTIONS.find(o => o.value === audience)?.label || 'Everyone';

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-base">New Post</h1>

        <div className="flex items-center gap-2">
          {/* Audience picker */}
          <div className="relative">
            <button
              onClick={() => setShowAudience(!showAudience)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors"
              style={{ borderColor: audienceColor + '50', color: audienceColor, background: audienceColor + '15' }}
            >
              <AudienceIcon size={12} /> {audienceLabel}
            </button>
            {showAudience && (
              <div className="absolute right-0 top-9 bg-[#111827] border border-white/10 rounded-2xl overflow-hidden z-50 w-44 shadow-2xl">
                {AUDIENCE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setAudience(opt.value); setShowAudience(false); }}
                    className={'w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ' + (audience === opt.value ? 'bg-white/10' : 'hover:bg-white/5')}
                    style={{ color: audience === opt.value ? opt.color : 'white' }}>
                    <opt.icon size={15} style={{ color: opt.color }} /> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={handlePost} disabled={!canPost}
            className="bg-[#1E6FFF] text-white text-sm font-bold px-5 py-2 rounded-full disabled:opacity-40 hover:bg-[#1565cc] transition-colors shadow-lg shadow-[#1E6FFF]/30">
            {uploading ? (uploadPct < 100 ? uploadPct + '%' : 'Posting…') : 'Post'}
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="h-1 bg-white/10 flex-shrink-0">
          <div className="h-full bg-[#1E6FFF] transition-all duration-300" style={{ width: uploadPct + '%' }} />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-3 px-4 pt-4">
          <div className="flex-shrink-0">
            <Avatar url={profile?.avatar_url} name={profile?.display_name} size={11} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[15px] mb-2">{profile?.display_name}</p>

            {/* Caption textarea */}
            <textarea
              ref={textRef}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="What's happening?"
              className="w-full bg-transparent text-white text-[17px] placeholder-[#6B7280] focus:outline-none resize-none leading-relaxed min-h-[80px]"
              style={{ color: overLimit ? '#EF4444' : 'white' }}
              disabled={uploading}
            />

            {/* Image previews — Twitter grid */}
            {images.length > 0 && (
              <div className={
                'rounded-2xl overflow-hidden mb-3 ' +
                (images.length === 1 ? 'block' : 'grid grid-cols-2 gap-[2px]')
              }>
                {images.map((img, i) => (
                  <div key={i} className="relative"
                    style={images.length === 3 && i === 0 ? { gridRow: 'span 2' } : {}}>
                    <img src={img.preview} alt="" className="w-full h-full object-cover"
                      style={{
                        aspectRatio: images.length === 1 ? 'auto' : '1/1',
                        maxHeight: images.length === 1 ? 400 : undefined,
                      }} />
                    <button onClick={() => removeImage(i)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-black/90 transition-colors">
                      <X size={14} color="white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Video preview */}
            {video && (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 mb-3" style={{ aspectRatio: '16/9' }}>
                <video src={video.preview} className="w-full h-full object-cover" controls playsInline />
                <button onClick={removeVideo}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-black/90 transition-colors">
                  <X size={14} color="white" />
                </button>
                {video.duration && (
                  <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5">
                    <span className="text-white text-xs font-medium">
                      {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Errors */}
            {videoError && (
              <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{videoError}</p>
              </div>
            )}
            {error && (
              <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Location input */}
            {showLocation && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                <MapPin size={15} className="text-[#1E6FFF] flex-shrink-0" />
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Add location..." maxLength={80}
                  className="flex-1 bg-transparent text-white text-sm placeholder-[#6B7280] focus:outline-none" />
                {location && (
                  <button onClick={() => { setLocation(''); setShowLocation(false); }} className="text-[#6B7280] hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="border-t border-white/[0.07] mt-2" />

            {/* Toolbar */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-1 -ml-1">
                {/* Images */}
                <button onClick={() => imageInput.current?.click()}
                  disabled={!!video || images.length >= MAX_IMAGES || uploading}
                  className="text-[#1E6FFF] p-2 rounded-full hover:bg-[#1E6FFF]/10 transition-colors disabled:opacity-30" title="Add images">
                  <Image size={20} />
                </button>
                <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />

                {/* Video */}
                <button onClick={() => videoInput.current?.click()}
                  disabled={images.length > 0 || !!video || uploading}
                  className="text-[#1E6FFF] p-2 rounded-full hover:bg-[#1E6FFF]/10 transition-colors disabled:opacity-30" title="Add video (10s–5min)">
                  <Video size={20} />
                </button>
                <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={handleVideoPick} />

                {/* Location */}
                <button onClick={() => setShowLocation(!showLocation)}
                  className={'p-2 rounded-full transition-colors ' + (showLocation ? 'text-[#1E6FFF] bg-[#1E6FFF]/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}
                  title="Add location">
                  <MapPin size={20} />
                </button>

                {/* Emoji — trigger button, ref passed to SmartEmojiPicker */}
                <button
                  ref={emojiBtnRef}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setShowEmoji(v => !v); }}
                  className={'p-2 rounded-full transition-colors ' + (showEmoji ? 'text-[#FFD700] bg-yellow-400/10' : 'text-[#6B7280] hover:text-[#1E6FFF] hover:bg-[#1E6FFF]/10')}
                  title="Emoji"
                >
                  <SmilePlus size={20} />
                </button>
              </div>

              {/* Right: image count + char ring */}
              <div className="flex items-center gap-3">
                {images.length > 0 && (
                  <span className="text-[#6B7280] text-xs">{images.length}/{MAX_IMAGES}</span>
                )}
                {charCount > 0 && (
                  <>
                    <div className="w-px h-5 bg-white/10" />
                    <CharRing value={charCount} max={MAX_CHARS} />
                  </>
                )}
              </div>
            </div>

            {/* Hints */}
            <div className="pb-4">
              {!video && images.length === 0 && (
                <p className="text-[#6B7280] text-xs">📷 Up to {MAX_IMAGES} photos · 🎬 Video 10s–5min</p>
              )}
              {video && (
                <p className="text-[#2ECC71] text-xs">
                  ✓ Video ready ({Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')})
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Smart emoji picker — renders in a portal-like fixed position */}
      <SmartEmojiPicker
        open={showEmoji}
        onClose={() => setShowEmoji(false)}
        onEmojiClick={(emojiData) => { insertEmoji(emojiData); }}
        triggerRef={emojiBtnRef}
        width={300}
        height={350}
      />
    </div>
  );
}