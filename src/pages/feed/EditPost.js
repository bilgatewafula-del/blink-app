import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Save } from 'lucide-react';
import { POST_AUDIENCES } from '../../utils/constants';

const EditPost = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const post = location.state?.post;

  const [caption, setCaption] = useState(post?.caption || '');
  const [audience, setAudience] = useState(post?.audience || 'public');
  const [location_, setLocation_] = useState(post?.location || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!post) {
    navigate(-1);
    return null;
  }

  const extractHashtags = (text) => {
    const matches = text.match(/#[\w]+/g);
    return matches ? matches.map((h) => h.toLowerCase()) : [];
  };

  const handleSave = async () => {
    if (!caption.trim()) {
      setError('Caption cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');

    const hashtags = extractHashtags(caption);

    const { error } = await supabase
      .from('posts')
      .update({
        caption: caption.trim(),
        hashtags,
        audience,
        location: location_.trim(),
        edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', post.id)
      .eq('user_id', user.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    // Update hashtags table
    for (const tag of hashtags) {
      await supabase.from('hashtags').upsert(
        { tag, post_count: 1 },
        { onConflict: 'tag', ignoreDuplicates: false }
      );
    }

    navigate(-1);
  };

  const renderCaption = (text) => {
    return text.split(/(\s+)/).map((word, i) => {
      if (word.startsWith('#'))
        return <span key={i} className="text-[#FF5A1F]">{word}</span>;
      if (word.startsWith('@'))
        return <span key={i} className="text-[#FFB020]">{word}</span>;
      return word;
    });
  };

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Edit Post</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Post images preview */}
        {post.media_urls?.length > 0 && (
          <div className={
            'grid gap-1 ' +
            (post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2')
          }>
            {post.media_urls.slice(0, 4).map((url, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Caption */}
        <div>
          <label className="text-[#8E8C88] text-xs mb-2 block font-semibold uppercase tracking-wide">Caption</label>
          <div
            style={{ background: !post.media_urls?.length && post.bg_color ? post.bg_color : 'transparent' }}
            className="relative rounded-2xl overflow-hidden"
          >
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write something..."
              maxLength={500}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F] transition-colors resize-none"
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[#8E8C88] text-xs">{caption.length}/500</p>
            <div className="flex flex-wrap gap-1">
              {extractHashtags(caption).map((tag) => (
                <span key={tag} className="bg-[#FF5A1F]/20 text-[#FF5A1F] text-xs px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Caption preview */}
        {caption && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-[#8E8C88] text-xs mb-2 font-semibold uppercase tracking-wide">Preview</p>
            <p className="text-white/90 text-sm leading-relaxed">
              {renderCaption(caption)}
            </p>
          </div>
        )}

        {/* Location */}
        <div>
          <label className="text-[#8E8C88] text-xs mb-2 block font-semibold uppercase tracking-wide">Location</label>
          <input
            type="text"
            value={location_}
            onChange={(e) => setLocation_(e.target.value)}
            placeholder="Add or edit location..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F] transition-colors"
          />
        </div>

        {/* Audience */}
        <div>
          <label className="text-[#8E8C88] text-xs mb-2 block font-semibold uppercase tracking-wide">Audience</label>
          <div className="space-y-2">
            {POST_AUDIENCES.map((a) => (
              <button
                key={a.value}
                onClick={() => setAudience(a.value)}
                className={
                  'w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ' +
                  (audience === a.value
                    ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                    : 'border-white/10 bg-white/5')
                }
              >
                <span className="text-xl">{a.icon}</span>
                <span className="text-white text-sm font-semibold">{a.label}</span>
                {audience === a.value && (
                  <span className="ml-auto text-[#FF5A1F] font-bold">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Edited notice */}
        {post.edited && (
          <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl p-3">
            <p className="text-[#FFD700] text-xs">
              ✏️ This post was previously edited on{' '}
              {new Date(post.edited_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold py-4 rounded-2xl disabled:opacity-50 shadow-lg shadow-[#FF5A1F]/30"
        >
          {saving ? 'Saving changes...' : '💾 Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default EditPost;