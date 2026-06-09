import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/cloudinary';
import {
  ArrowLeft, Image, MapPin, Users, Eye,
  X, FileText, Send, ChevronDown
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { POST_AUDIENCES } from '../../utils/constants';
import { sendMentionNotifications } from '../../hooks/useNotifications';

const BG_COLORS = [
  'linear-gradient(135deg, #1E6FFF, #7B2FFF)',
  'linear-gradient(135deg, #FF6B35, #FFD700)',
  'linear-gradient(135deg, #00D4C8, #1E6FFF)',
  'linear-gradient(135deg, #7B2FFF, #FF6B35)',
  'linear-gradient(135deg, #2ECC71, #00D4C8)',
  'linear-gradient(135deg, #FF6B35, #7B2FFF)',
  'linear-gradient(135deg, #FFD700, #2ECC71)',
];

const CreatePost = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef();

  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [audience, setAudience] = useState('public');
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [showAudience, setShowAudience] = useState(false);
  const [bgColor, setBgColor] = useState(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');

  const extractHashtags = (text) => {
    const matches = text.match(/#[\w]+/g);
    return matches ? matches.map((h) => h.toLowerCase()) : [];
  };

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > 6) {
      setError('Maximum 6 images allowed.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const urls = await Promise.all(
        files.map((file) => uploadToCloudinary(file, 'posts'))
      );
      setImages((prev) => [...prev, ...urls]);
    } catch {
      setError('Failed to upload image. Try again.');
    }
    setUploading(false);
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async (isDraft = false) => {
    if (!caption.trim() && images.length === 0) {
      setError('Write something or add an image.');
      return;
    }
    setPublishing(true);
    setError('');

    const hashtags = extractHashtags(caption);

    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      caption: caption.trim(),
      media_urls: images,
      hashtags,
      location: location.trim(),
      audience,
      is_draft: isDraft,
      bg_color: images.length === 0 ? bgColor : null,
    });

    if (error) {
      setError(error.message);
      setPublishing(false);
      return;
    }

    if (!isDraft) {
      await supabase
        .from('users')
        .update({ post_count: (profile?.post_count || 0) + 1 })
        .eq('id', user.id);
    }

   for (const tag of hashtags) {
  await supabase.from('hashtags').upsert(
    { tag, post_count: 1 },
    { onConflict: 'tag', ignoreDuplicates: false }
  );
}

/* =========================
   MENTION NOTIFICATIONS
========================= */
if (!isDraft) {
  const mentions = caption.match(/@[\w]+/g);

  if (mentions) {
    try {
      const { sendMentionNotifications } = await import(
        '../../hooks/useNotifications'
      );

      const { data: newPost } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (newPost) {
        await sendMentionNotifications({
          caption,
          fromUserId: user.id,
          refId: newPost.id,
        });
      }
    } catch (err) {
      console.error('Mention notification error:', err);
    }
  }
}

navigate(isDraft ? '/profile' : '/');

    navigate(isDraft ? '/profile' : '/');
  };

  const selectedAudience = POST_AUDIENCES.find((a) => a.value === audience);

  const renderCaption = (text) => {
    return text.split(/(\s+)/).map((word, i) => {
      if (word.startsWith('#'))
        return <span key={i} className="text-[#1E6FFF]">{word}</span>;
      if (word.startsWith('@'))
        return <span key={i} className="text-[#00D4C8]">{word}</span>;
      return word;
    });
  };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">New Post</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handlePublish(true)}
            disabled={publishing}
            className="text-[#6B7280] text-sm hover:text-white transition-colors"
          >
            Draft
          </button>
          <button
            onClick={() => setPreview(!preview)}
            className="text-[#00D4C8] text-sm font-semibold"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {!preview ? (
        <div className="px-4 py-4 space-y-4">
          {/* User info */}
          <div className="flex items-center gap-3">
            <Avatar url={profile?.avatar_url} name={profile?.display_name} size={10} />
            <div>
              <p className="text-white font-semibold text-sm">{profile?.display_name}</p>
              <button
                onClick={() => setShowAudience(!showAudience)}
                className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-0.5 mt-0.5"
              >
                <span className="text-xs text-white/70">
                  {selectedAudience?.icon} {selectedAudience?.label}
                </span>
                <ChevronDown size={10} className="text-white/50" />
              </button>
            </div>
          </div>

          {/* Audience picker */}
          {showAudience && (
            <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
              {POST_AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  onClick={() => { setAudience(a.value); setShowAudience(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${
                    audience === a.value ? 'text-[#1E6FFF]' : 'text-white/80'
                  }`}
                >
                  <span>{a.icon}</span>
                  <span className="text-sm">{a.label}</span>
                  {audience === a.value && <span className="ml-auto text-[#1E6FFF]">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* Caption input */}
          <div
            style={{ background: images.length === 0 && bgColor ? bgColor : 'transparent' }}
            className="relative rounded-2xl overflow-hidden p-0.5"
          >
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's on your mind? Use #hashtags and @mentions..."
              maxLength={500}
              rows={images.length > 0 ? 3 : 6}
              style={{
                background: images.length === 0 && bgColor ? 'rgba(0,0,0,0.2)' : 'transparent',
              }}
              className="w-full text-white placeholder-white/40 text-sm focus:outline-none resize-none leading-relaxed p-3 rounded-2xl"
            />
          </div>

          {/* Character count + hashtag pills */}
          <div className="flex justify-between items-center">
            <p className="text-[#6B7280] text-xs">{caption.length}/500</p>
            {caption.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {extractHashtags(caption).map((tag) => (
                  <span key={tag} className="bg-[#1E6FFF]/20 text-[#1E6FFF] text-xs px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Background colors — text only */}
          {images.length === 0 && (
            <div>
              <p className="text-[#6B7280] text-xs mb-2">Background color</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setBgColor(null)}
                  className={`w-8 h-8 rounded-full bg-[#111827] border-2 ${!bgColor ? 'border-white' : 'border-transparent'}`}
                />
                {BG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setBgColor(color)}
                    style={{ background: color }}
                    className={`w-8 h-8 rounded-full border-2 ${bgColor === color ? 'border-white' : 'border-transparent'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Image previews */}
          {images.length > 0 && (
            <div className={`grid gap-1 ${
              images.length === 1 ? 'grid-cols-1' :
              images.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
            }`}>
              {images.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-1"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
              {images.length < 6 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center hover:border-[#1E6FFF] transition-colors"
                >
                  <span className="text-[#6B7280] text-2xl">+</span>
                </button>
              )}
            </div>
          )}

          {/* Location input */}
          {showLocation && (
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-[#1E6FFF] hover:opacity-80 transition-opacity"
              >
                <Image size={20} />
                <span className="text-xs">
                  {uploading ? 'Uploading...' : images.length > 0 ? `${images.length}/6` : 'Photo'}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />

              <button
                onClick={() => setShowLocation(!showLocation)}
                className={`flex items-center gap-1.5 hover:opacity-80 transition-opacity ${
                  showLocation ? 'text-[#FF6B35]' : 'text-[#6B7280]'
                }`}
              >
                <MapPin size={20} />
                <span className="text-xs">Location</span>
              </button>

              <button
                onClick={() => setShowAudience(!showAudience)}
                className="flex items-center gap-1.5 text-[#6B7280] hover:opacity-80 transition-opacity"
              >
                <Users size={20} />
                <span className="text-xs">Audience</span>
              </button>

              <button
                onClick={() => setPreview(true)}
                className="flex items-center gap-1.5 text-[#6B7280] hover:opacity-80 transition-opacity"
              >
                <Eye size={20} />
                <span className="text-xs">Preview</span>
              </button>
            </div>

            <button
              onClick={() => handlePublish(false)}
              disabled={publishing || uploading}
              className="flex items-center gap-2 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity shadow-lg shadow-[#1E6FFF]/30"
            >
              <Send size={16} />
              {publishing ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        /* Preview mode */
        <div className="px-4 py-4">
          <p className="text-[#6B7280] text-xs text-center mb-4">This is how your post will look</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Post header */}
            <div className="flex items-center p-4 gap-3">
              <Avatar url={profile?.avatar_url} name={profile?.display_name} size={10} />
              <div>
                <p className="text-white font-semibold text-sm">{profile?.display_name}</p>
                <p className="text-[#6B7280] text-xs">@{profile?.username} · Just now</p>
              </div>
            </div>

            {/* Caption with bg color */}
            {caption && (
              <div
                style={{
                  background: images.length === 0 && bgColor ? bgColor : 'transparent',
                }}
                className={`text-sm leading-relaxed
                  ${images.length === 0 && bgColor
                    ? 'py-10 text-center text-white font-semibold text-lg px-4 mx-4 mb-3 rounded-2xl'
                    : 'px-4 pb-3 text-white/90'
                  }`}
              >
                {renderCaption(caption)}
              </div>
            )}

            {/* Images */}
            {images.length > 0 && (
              <div className={`grid gap-0.5 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {images.slice(0, 4).map((url, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {i === 3 && images.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white font-bold text-xl">+{images.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Location */}
            {location && (
              <div className="flex items-center gap-1.5 px-4 py-2">
                <MapPin size={12} className="text-[#FF6B35]" />
                <span className="text-[#6B7280] text-xs">{location}</span>
              </div>
            )}

            {/* Reaction bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <div className="flex items-center gap-4">
                <span className="text-[#6B7280] text-sm">❤️ 0</span>
                <span className="text-[#6B7280] text-sm">💬 0</span>
                <span className="text-[#6B7280] text-sm">🔁 0</span>
              </div>
              <span className="text-[#6B7280] text-sm">🔖</span>
            </div>
          </div>

          <button
            onClick={() => handlePublish(false)}
            disabled={publishing}
            className="w-full mt-4 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 shadow-lg shadow-[#1E6FFF]/30"
          >
            {publishing ? 'Publishing...' : '🚀 Publish Post'}
          </button>
          <button
            onClick={() => handlePublish(true)}
            disabled={publishing}
            className="w-full mt-2 bg-white/5 border border-white/10 text-white py-3 rounded-xl font-semibold text-sm"
          >
            <FileText size={14} className="inline mr-2" />
            Save as Draft
          </button>
        </div>
      )}
    </div>
  );
};

export default CreatePost;