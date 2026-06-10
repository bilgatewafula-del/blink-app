import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Upload, X, Play, MapPin,
  Globe, Users, Lock, CheckCircle, AlertCircle
} from 'lucide-react';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DURATION = 60; // 60 seconds
const MIN_DURATION = 5; // 5 seconds
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'];

const CATEGORIES = [
  { key: 'street', emoji: '🔥', label: 'Street Vibes' },
  { key: 'music', emoji: '🎵', label: 'Music Vibes' },
  { key: 'comedy', emoji: '😂', label: 'Comedy Vibes' },
  { key: 'dance', emoji: '💃', label: 'Dance Vibes' },
  { key: 'food', emoji: '🍲', label: 'Food Vibes' },
  { key: 'sports', emoji: '⚽', label: 'Sports Vibes' },
  { key: 'knowledge', emoji: '💡', label: 'Knowledge Vibes' },
  { key: 'faith', emoji: '🙏', label: 'Faith Vibes' },
];

const AUDIENCES = [
  { key: 'public', icon: Globe, label: 'Everyone', desc: 'Anyone on B-Link can see this' },
  { key: 'followers', icon: Users, label: 'Followers', desc: 'Only your followers can see this' },
  { key: 'private', icon: Lock, label: 'Only Me', desc: 'Only you can see this' },
];

const UploadVibe = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef();
  const videoPreviewRef = useRef();

  const [step, setStep] = useState(1); // 1=upload, 2=details, 3=uploading
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [category, setCategory] = useState('street');
  const [location, setLocation] = useState('');
  const [audience, setAudience] = useState('public');
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [audioTitle, setAudioTitle] = useState('Original Sound');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const validateVideo = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Please upload MP4, MOV, WebM, or 3GP video.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'Video too large. Maximum size is 50MB. Current: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB';
    }
    return null;
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setError('');

    const validationError = validateVideo(file);
    if (validationError) { setError(validationError); return; }

    setVideoFile(file);
    setVideoSize(file.size);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);

    // Get video metadata
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const dur = video.duration;
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });

      if (dur < MIN_DURATION) {
        setError('Video too short. Minimum duration is ' + MIN_DURATION + ' seconds.');
        setVideoFile(null);
        setVideoPreviewUrl(null);
        URL.revokeObjectURL(url);
        return;
      }
      if (dur > MAX_DURATION) {
        setError('Video too long. Maximum duration is ' + MAX_DURATION + ' seconds. Your video is ' + Math.round(dur) + 's.');
        setVideoFile(null);
        setVideoPreviewUrl(null);
        URL.revokeObjectURL(url);
        return;
      }
      setVideoDuration(dur);

      // Generate thumbnail
      video.currentTime = Math.min(1, dur * 0.1);
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          setThumbnail(blob);
        }, 'image/jpeg', 0.85);
      };
    };
    video.src = url;
    setStep(2);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const uploadToCloudinaryDirect = async (file, resourceType = 'video') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'blink_uploads');
    formData.append('folder', 'vibes');
    formData.append('resource_type', resourceType);

    if (resourceType === 'video') {
      formData.append('quality', 'auto');
      formData.append('fetch_format', 'auto');
    }

    const res = await fetch(
      'https://api.cloudinary.com/v1_1/' + process.env.REACT_APP_CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload',
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.secure_url;
  };

  const handlePublish = async () => {
    if (!videoFile) return;
    setStep(3);
    setError('');
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 2, 90));
      }, 500);

      // Upload video
      const videoUrl = await uploadToCloudinaryDirect(videoFile, 'video');
      setUploadProgress(85);

      // Upload thumbnail
      let thumbnailUrl = null;
      if (thumbnail) {
        thumbnailUrl = await uploadToCloudinaryDirect(thumbnail, 'image');
      }

      setUploadProgress(95);
      clearInterval(progressInterval);

      // Parse hashtags
      const parsedHashtags = hashtags
        .split(/[\s,#]+/)
        .filter((h) => h.trim().length > 0)
        .map((h) => h.toLowerCase().replace(/^#/, ''));

      // Save to Supabase
      const { data, error: dbError } = await supabase.from('vibes').insert({
        user_id: user.id,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption.trim(),
        hashtags: parsedHashtags,
        category,
        location: location.trim() || null,
        country: profile?.country || 'KE',
        duration: Math.round(videoDuration),
        width: videoDimensions.width,
        height: videoDimensions.height,
        file_size: videoSize,
        audio_title: audioTitle || 'Original Sound — ' + profile?.display_name,
        allow_duet: allowDuet,
        allow_stitch: allowStitch,
        allow_download: allowDownload,
        audience,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        fires_count: 0,
        comments_count: 0,
        shares_count: 0,
        views_count: 0,
      }).select().single();

      if (dbError) throw new Error(dbError.message);

      // Update user post count
      await supabase.from('users')
        .update({ post_count: (profile?.post_count || 0) + 1 })
        .eq('id', user.id);

      // Upsert hashtags
      for (const tag of parsedHashtags) {
        await supabase.from('hashtags').upsert(
          { tag, post_count: 1 },
          { onConflict: 'tag' }
        );
      }

      setUploadProgress(100);
      setSuccess(true);

      setTimeout(() => navigate('/vibes'), 2000);

    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setStep(2);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
  };

  const getVideoQualityLabel = (width, height) => {
    if (height >= 1080 || width >= 1080) return '🔵 1080p Full HD';
    if (height >= 720 || width >= 720) return '🟢 720p HD';
    if (height >= 480 || width >= 480) return '🟡 480p SD';
    return '🔴 Low quality';
  };

  // Step 3: Uploading
  if (step === 3) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex flex-col items-center justify-center px-6">
        {success ? (
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2ECC71] to-[#00D4C8] flex items-center justify-center mx-auto mb-6 shadow-xl">
              <CheckCircle size={40} className="text-white" />
            </div>
            <h2 className="text-white font-bold text-2xl mb-2">Vibe Posted! 🔥</h2>
            <p className="text-[#6B7280] text-sm">Your Vibe is live and will disappear in 7 days</p>
            <p className="text-[#6B7280] text-xs mt-2">Redirecting to Vibes feed...</p>
          </div>
        ) : (
          <div className="w-full max-w-sm text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FF6B35] via-[#FFD700] to-[#1E6FFF] flex items-center justify-center mx-auto mb-6 shadow-xl animate-pulse">
              <Upload size={36} className="text-white" />
            </div>
            <h2 className="text-white font-bold text-xl mb-2">Uploading your Vibe...</h2>
            <p className="text-[#6B7280] text-sm mb-6">Please keep this screen open</p>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-3 mb-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] via-[#FFD700] to-[#1E6FFF] transition-all duration-500"
                style={{ width: uploadProgress + '%' }}
              />
            </div>
            <p className="text-[#1E6FFF] font-bold text-lg">{uploadProgress}%</p>

            {/* Specs being processed */}
            <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-2">
              <p className="text-[#6B7280] text-xs">⚙️ Processing video...</p>
              <p className="text-[#6B7280] text-xs">🗜️ Compressing for African networks...</p>
              <p className="text-[#6B7280] text-xs">📡 Uploading to CDN...</p>
              <p className="text-[#6B7280] text-xs">🌍 Making it available Africa-wide...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => step === 2 ? setStep(1) : navigate(-1)} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">
          {step === 1 ? 'New Vibe 🔥' : 'Vibe Details'}
        </h1>
        {step === 2 && (
          <button
            onClick={handlePublish}
            disabled={!videoFile}
            className="bg-gradient-to-r from-[#FF6B35] to-[#FFD700] text-white font-bold px-5 py-2 rounded-full text-sm disabled:opacity-50 shadow-lg"
          >
            Post
          </button>
        )}
        {step === 1 && <div className="w-16" />}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="px-4 py-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Upload zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={
              'border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all mb-6 ' +
              (isDragging
                ? 'border-[#FF6B35] bg-[#FF6B35]/10 scale-[1.02]'
                : 'border-white/20 hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/5')
            }
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FFD700] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-[#FF6B35]/30">
              <Upload size={32} className="text-white" />
            </div>
            <h3 className="text-white font-bold text-xl mb-2">Upload your Vibe</h3>
            <p className="text-[#6B7280] text-sm mb-4">Tap to select or drag & drop your video</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                '📱 MP4, MOV, WebM, 3GP',
                '⏱ 5 to 60 seconds',
                '📦 Max 50MB',
                '📺 Vertical 9:16 recommended',
                '🗑 Auto-deleted after 7 days',
              ].map((spec) => (
                <span key={spec} className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/70">
                  {spec}
                </span>
              ))}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/3gpp"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files[0])}
          />

          {/* Requirements */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <p className="text-white font-bold text-sm mb-2">📋 Vibe Requirements</p>
            {[
              { label: 'Duration', value: '5 – 60 seconds', icon: '⏱' },
              { label: 'Max file size', value: '50MB', icon: '📦' },
              { label: 'Formats', value: 'MP4, MOV, WebM, 3GP', icon: '🎬' },
              { label: 'Recommended', value: 'Vertical 1080×1920px (9:16)', icon: '📱' },
              { label: 'Quality', value: 'Min 480p, Max 1080p', icon: '🎯' },
              { label: 'Auto-delete', value: '7 days after posting', icon: '🗑' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[#6B7280] text-sm">{r.icon} {r.label}</span>
                <span className="text-white text-xs font-semibold">{r.value}</span>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div className="mt-4 bg-gradient-to-r from-[#FF6B35]/10 to-[#FFD700]/10 border border-[#FF6B35]/20 rounded-2xl p-4">
            <p className="text-[#FF6B35] font-bold text-sm mb-2">💡 Tips for Viral Vibes</p>
            <div className="space-y-1.5 text-xs text-[#6B7280]">
              <p>✅ Film vertically (portrait mode)</p>
              <p>✅ Good lighting = more views</p>
              <p>✅ Hook viewers in first 3 seconds</p>
              <p>✅ Add trending hashtags</p>
              <p>✅ Use original African sounds</p>
              <p>✅ Post between 6pm-10pm EAT for max reach</p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && videoPreviewUrl && (
        <div className="px-4 py-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-start gap-3">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Video preview + metadata */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="relative aspect-[9/16] bg-black max-h-64 overflow-hidden">
              <video
                ref={videoPreviewRef}
                src={videoPreviewUrl}
                className="w-full h-full object-contain"
                controls
                playsInline
              />
            </div>
            <div className="p-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Duration', value: Math.round(videoDuration) + 's' },
                { label: 'Size', value: formatFileSize(videoSize) },
                { label: 'Quality', value: videoDimensions.height >= 720 ? 'HD' : 'SD' },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className="text-white font-bold text-sm">{m.value}</p>
                  <p className="text-[#6B7280] text-xs">{m.label}</p>
                </div>
              ))}
            </div>
            {/* Quality indicator */}
            <div className="px-3 pb-3">
              <p className="text-xs text-center text-[#6B7280]">
                {getVideoQualityLabel(videoDimensions.width, videoDimensions.height)}
                {' · '}{videoDimensions.width}×{videoDimensions.height}px
              </p>
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Describe your Vibe... what's the story? 🔥"
              maxLength={300}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#FF6B35] resize-none transition-colors"
            />
            <p className="text-[#6B7280] text-xs text-right mt-1">{caption.length}/300</p>
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Hashtags</label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#gengetone #nairobi #kenya #viral"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={
                    'flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all ' +
                    (category === cat.key
                      ? 'border-[#FF6B35] bg-[#FF6B35]/15'
                      : 'border-white/10 bg-white/5')
                  }
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className={'text-[9px] font-bold ' + (category === cat.key ? 'text-[#FF6B35]' : 'text-[#6B7280]')}>
                    {cat.label.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Location (optional)</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Nairobi, Kenya"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#FF6B35] transition-colors"
              />
            </div>
          </div>

          {/* Audio title */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">🎵 Sound Name</label>
            <input
              type="text"
              value={audioTitle}
              onChange={(e) => setAudioTitle(e.target.value)}
              placeholder={'Original Sound — ' + profile?.display_name}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>

          {/* Audience */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Audience</label>
            <div className="space-y-2">
              {AUDIENCES.map(({ key, icon: Icon, label, desc }) => (
                <button
                  key={key}
                  onClick={() => setAudience(key)}
                  className={
                    'w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ' +
                    (audience === key
                      ? 'border-[#FF6B35] bg-[#FF6B35]/10'
                      : 'border-white/10 bg-white/5')
                  }
                >
                  <Icon size={18} className={audience === key ? 'text-[#FF6B35]' : 'text-[#6B7280]'} />
                  <div className="flex-1 text-left">
                    <p className={'font-semibold text-sm ' + (audience === key ? 'text-white' : 'text-white/80')}>{label}</p>
                    <p className="text-[#6B7280] text-xs">{desc}</p>
                  </div>
                  {audience === key && <CheckCircle size={18} className="text-[#FF6B35]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 block">Allow Others To</label>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {[
                { label: '👥 Duet with your Vibe', key: 'duet', value: allowDuet, setter: setAllowDuet },
                { label: '✂️ Stitch your Vibe', key: 'stitch', value: allowStitch, setter: setAllowStitch },
                { label: '⬇️ Download your Vibe', key: 'download', value: allowDownload, setter: setAllowDownload },
              ].map((item, idx, arr) => (
                <div key={item.key} className={'flex items-center justify-between px-4 py-4 ' + (idx < arr.length - 1 ? 'border-b border-white/5' : '')}>
                  <span className="text-white/80 text-sm">{item.label}</span>
                  <button
                    onClick={() => item.setter(!item.value)}
                    className={'w-12 h-6 rounded-full transition-all ' + (item.value ? 'bg-[#FF6B35]' : 'bg-white/20')}
                  >
                    <div className={'w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ' + (item.value ? 'translate-x-6' : 'translate-x-0')} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Expiry notice */}
          <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-2xl p-4">
            <p className="text-[#FFD700] text-xs font-bold mb-1">🗑 Auto-Delete Policy</p>
            <p className="text-[#6B7280] text-xs">
              This Vibe will automatically be deleted 7 days after posting to save space and keep the feed fresh. Make it count! 🔥
            </p>
          </div>

          {/* Post button */}
          <button
            onClick={handlePublish}
            className="w-full bg-gradient-to-r from-[#FF6B35] via-[#FFD700] to-[#FF6B35] text-white font-bold py-4 rounded-2xl text-base shadow-xl shadow-[#FF6B35]/30 active:scale-[0.98] transition-all"
            style={{ backgroundSize: '200% 100%', animation: 'gradientShift 3s ease infinite' }}
          >
            🔥 Post Vibe to Africa
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadVibe;