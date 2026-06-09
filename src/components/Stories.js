import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../lib/cloudinary';
import {
  X, Plus, Image, Type, Trash2,
  ChevronLeft, ChevronRight, Eye, Send
} from 'lucide-react';
import Avatar from './Avatar';

// ── Story Viewer ──────────────────────────────────────────────────
export const StoryViewer = ({ stories, initialIndex = 0, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState(initialIndex);
  const [currentStory, setCurrentStory] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);
  const progressTimer = useRef();
  const inputRef = useRef();
  const STORY_DURATION = 5000;

  const allUserStories = stories[currentUser]?.stories || [];
  const currentAuthor = stories[currentUser]?.user;
  const story = allUserStories[currentStory];
  const isMyStory = story?.user_id === user?.id;

  useEffect(() => {
    if (!story) return;
    startProgress();
    markViewed();
    setReplySent(false);
    setReplyText('');
    return () => clearInterval(progressTimer.current);
  }, [currentUser, currentStory]);

  const startProgress = () => {
    clearInterval(progressTimer.current);
    setProgress(0);
    const start = Date.now();
    progressTimer.current = setInterval(() => {
      if (paused) return;
      const elapsed = Date.now() - start;
      const pct = (elapsed / STORY_DURATION) * 100;
      if (pct >= 100) {
        clearInterval(progressTimer.current);
        handleNext();
      } else {
        setProgress(pct);
      }
    }, 50);
  };

  const markViewed = async () => {
    if (!story || !user) return;
    // Insert into story_views table
    await supabase.from('story_views').upsert(
      { story_id: story.id, viewer_id: user.id },
      { onConflict: 'story_id,viewer_id' }
    );
    // Update view_count on story
    const { data: viewData } = await supabase
      .from('story_views')
      .select('id', { count: 'exact', head: true })
      .eq('story_id', story.id);
  };

  const fetchViewers = async () => {
    const { data } = await supabase
      .from('story_views')
      .select('viewer:viewer_id(id, username, display_name, avatar_url)')
      .eq('story_id', story.id)
      .order('viewed_at', { ascending: false });
    setViewers(data?.map((v) => v.viewer) || []);
  };

  const handleNext = () => {
    clearInterval(progressTimer.current);
    if (currentStory < allUserStories.length - 1) {
      setCurrentStory((s) => s + 1);
    } else if (currentUser < stories.length - 1) {
      setCurrentUser((u) => u + 1);
      setCurrentStory(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    clearInterval(progressTimer.current);
    if (currentStory > 0) {
      setCurrentStory((s) => s - 1);
    } else if (currentUser > 0) {
      setCurrentUser((u) => u - 1);
      setCurrentStory(0);
    }
  };

  const handleDeleteStory = async () => {
    if (!window.confirm('Delete this story?')) return;
    await supabase.from('stories').delete().eq('id', story.id);
    handleNext();
  };

  const handleReply = async () => {
    if (!replyText.trim() || !currentAuthor) return;
    // Find or create chat
    const { data: existingChats } = await supabase
      .from('chats')
      .select('id, participants')
      .contains('participants', [user.id]);
    const existing = existingChats?.find((c) => c.participants.includes(currentAuthor.id));
    let chatId = existing?.id;

    if (!chatId) {
      const { data: newChat } = await supabase
        .from('chats')
        .insert({ participants: [user.id, currentAuthor.id] })
        .select().single();
      chatId = newChat?.id;
    }

    if (chatId) {
      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: user.id,
        body: '↩ Replied to story: ' + replyText.trim(),
        message_type: 'text',
        delivered_at: new Date().toISOString(),
        deleted_for: [],
        starred_by: [],
      });
      await supabase.from('chats').update({
        last_message: '↩ Replied to story',
        last_message_at: new Date().toISOString(),
      }).eq('id', chatId);
    }

    setReplySent(true);
    setReplyText('');
    setPaused(false);
    startProgress();
  };

  const handleInputFocus = () => {
    setPaused(true);
    clearInterval(progressTimer.current);
  };

  const handleInputBlur = () => {
    if (!replyText.trim()) {
      setPaused(false);
      startProgress();
    }
  };

  if (!story) return null;

  const timeLeft = Math.max(0, Math.ceil((new Date(story.expires_at) - new Date()) / 3600000));

  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
      <div className="relative w-full max-w-[420px] bg-black flex flex-col" style={{ height: '100dvh' }}>

        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-2">
          {allUserStories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width: i < currentStory ? '100%' : i === currentStory ? progress + '%' : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-5 left-0 right-0 z-20 flex items-center gap-3 px-3">
          <button onClick={() => navigate('/profile/' + currentAuthor?.username)}>
            <Avatar url={currentAuthor?.avatar_url} name={currentAuthor?.display_name} size={9} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">{currentAuthor?.display_name}</p>
            <p className="text-white/60 text-xs">{timeLeft}h left</p>
          </div>
          {isMyStory && (
            <button onClick={handleDeleteStory} className="text-white/60 hover:text-white p-1">
              <Trash2 size={18} />
            </button>
          )}
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <X size={22} />
          </button>
        </div>

        {/* Story content */}
        <div
          className="flex-1 flex items-center justify-center"
          onMouseDown={() => { setPaused(true); clearInterval(progressTimer.current); }}
          onMouseUp={() => { if (!inputRef.current?.matches(':focus')) { setPaused(false); startProgress(); } }}
          onTouchStart={() => { setPaused(true); clearInterval(progressTimer.current); }}
          onTouchEnd={() => { if (!inputRef.current?.matches(':focus')) { setPaused(false); startProgress(); } }}
        >
          {story.story_type === 'image' ? (
            <img src={story.media_url} alt="story" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div
              style={{ background: story.bg_color || 'linear-gradient(135deg, #1E6FFF, #7B2FFF)' }}
              className="w-full h-full flex items-center justify-center p-8"
            >
              <p className="text-white font-bold text-2xl text-center leading-relaxed">{story.caption}</p>
            </div>
          )}
        </div>

        {/* Caption for image stories */}
        {story.caption && story.story_type === 'image' && (
          <div className="absolute bottom-28 left-0 right-0 px-4 z-20">
            <p className="text-white text-sm text-center font-semibold bg-black/50 backdrop-blur-sm px-4 py-3 rounded-2xl">
              {story.caption}
            </p>
          </div>
        )}

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-8 pt-3 bg-gradient-to-t from-black/60 to-transparent">
          {isMyStory ? (
            <button
              onClick={() => { fetchViewers(); setShowViewers(true); setPaused(true); clearInterval(progressTimer.current); }}
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <Eye size={18} />
              <span className="text-sm font-semibold">{viewers.length || 0} views</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {replySent ? (
                <div className="flex-1 bg-[#2ECC71]/20 border border-[#2ECC71]/30 rounded-full px-4 py-3 flex items-center gap-2">
                  <span className="text-[#2ECC71] text-sm">✓ Reply sent!</span>
                </div>
              ) : (
                <>
                  <div className="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2.5">
                    <input
                      ref={inputRef}
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                      placeholder={'Reply to ' + currentAuthor?.display_name + '...'}
                      className="flex-1 bg-transparent text-white placeholder-white/50 text-sm focus:outline-none"
                    />
                  </div>
                  {replyText.trim() && (
                    <button
                      onClick={handleReply}
                      className="w-10 h-10 bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] rounded-full flex items-center justify-center shadow-lg"
                    >
                      <Send size={16} className="text-white" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Tap zones */}
        <button className="absolute left-0 top-16 w-1/3 h-2/3 z-10" onClick={handlePrev} />
        <button className="absolute right-0 top-16 w-1/3 h-2/3 z-10" onClick={handleNext} />

        {/* Nav arrows */}
        {currentUser > 0 && (
          <button className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 rounded-full p-2" onClick={handlePrev}>
            <ChevronLeft size={20} className="text-white" />
          </button>
        )}
        {currentUser < stories.length - 1 && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 rounded-full p-2" onClick={handleNext}>
            <ChevronRight size={20} className="text-white" />
          </button>
        )}
      </div>

      {/* Viewers modal */}
      {showViewers && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-end justify-center">
          <div className="w-full max-w-[420px] bg-[#0d1f3c] rounded-t-3xl p-5 max-h-[60vh] overflow-y-auto slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Viewers · {viewers.length}</h3>
              <button
                onClick={() => { setShowViewers(false); setPaused(false); startProgress(); }}
                className="text-[#6B7280]"
              >
                <X size={20} />
              </button>
            </div>
            {viewers.length === 0 ? (
              <p className="text-[#6B7280] text-sm text-center py-6">No views yet</p>
            ) : (
              <div className="space-y-3">
                {viewers.map((v) => (
                  <div key={v.id} className="flex items-center gap-3">
                    {v.avatar_url ? (
                      <img src={v.avatar_url} alt={v.display_name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold">
                        {v.display_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-white font-semibold text-sm">{v.display_name}</p>
                      <p className="text-[#6B7280] text-xs">@{v.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Story Creator ─────────────────────────────────────────────────
export const StoryCreator = ({ onClose, onCreated }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState('choose');
  const [image, setImage] = useState(null);
  const [textCaption, setTextCaption] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [bgColor, setBgColor] = useState('linear-gradient(135deg, #1E6FFF, #7B2FFF)');
  const [fontSize, setFontSize] = useState('text-2xl');
  const [textAlign, setTextAlign] = useState('center');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  const BG_COLORS = [
    'linear-gradient(135deg, #1E6FFF, #7B2FFF)',
    'linear-gradient(135deg, #FF6B35, #FFD700)',
    'linear-gradient(135deg, #00D4C8, #1E6FFF)',
    'linear-gradient(135deg, #7B2FFF, #FF6B35)',
    'linear-gradient(135deg, #2ECC71, #00D4C8)',
    'linear-gradient(135deg, #FF6B35, #7B2FFF)',
    'linear-gradient(135deg, #0A1628, #1E6FFF)',
    'linear-gradient(135deg, #FFD700, #2ECC71)',
    'linear-gradient(135deg, #EF4444, #7B2FFF)',
    'linear-gradient(135deg, #10B981, #1E6FFF)',
  ];

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadToCloudinary(file, 'stories');
    setImage(url);
    setUploading(false);
    setMode('image_preview');
  };

  const handlePublish = async () => {
    if (mode === 'text' && !textCaption.trim()) return;
    if ((mode === 'image_preview') && !image) return;
    setUploading(true);
    await supabase.from('stories').insert({
      user_id: user.id,
      story_type: mode === 'text' ? 'text' : 'image',
      media_url: mode === 'text' ? 'text_story' : image,
      caption: mode === 'text' ? textCaption : (imageCaption || null),
      bg_color: mode === 'text' ? bgColor : null,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      views: [],
    });
    setUploading(false);
    onCreated?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-end"
      style={{ background: 'rgba(0,0,0,0.9)' }}
    >
      <div
        className="w-full max-w-[420px] bg-[#0A1628] flex flex-col rounded-t-3xl overflow-hidden"
        style={{ height: '95dvh' }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <button onClick={onClose} className="text-[#6B7280] hover:text-white">
            <X size={24} />
          </button>
          <h2 className="text-white font-bold text-lg">
            {mode === 'choose' ? 'New Story' : mode === 'text' ? 'Text Story' : 'Photo Story'}
          </h2>
          {mode !== 'choose' ? (
            <button
              onClick={handlePublish}
              disabled={uploading || (mode === 'text' && !textCaption.trim())}
              className="bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold px-4 py-2 rounded-full text-sm disabled:opacity-50"
            >
              {uploading ? 'Sharing...' : 'Share'}
            </button>
          ) : <div className="w-16" />}
        </div>

        {/* Choose mode */}
        {mode === 'choose' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 overflow-y-auto">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-3xl">B</div>
            <h3 className="text-white font-bold text-2xl">Share a Story</h3>
            <p className="text-[#6B7280] text-sm text-center">Stories disappear after 24 hours</p>
            <div className="w-full space-y-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-colors"
              >
                <div className="w-14 h-14 bg-[#1E6FFF]/20 rounded-2xl flex items-center justify-center">
                  <Image size={26} className="text-[#1E6FFF]" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-base">Photo Story</p>
                  <p className="text-[#6B7280] text-sm">Share a photo from your gallery</p>
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <button
                onClick={() => setMode('text')}
                className="w-full flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 transition-colors"
              >
                <div className="w-14 h-14 bg-[#7B2FFF]/20 rounded-2xl flex items-center justify-center">
                  <Type size={26} className="text-[#7B2FFF]" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-base">Text Story</p>
                  <p className="text-[#6B7280] text-sm">Share a thought with colorful background</p>
                </div>
              </button>
            </div>
            <p className="text-[#6B7280] text-xs text-center">🔒 Visible to followers for 24 hours</p>
          </div>
        )}

        {/* Text story */}
        {mode === 'text' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              style={{ background: bgColor }}
              className="flex-1 flex items-center justify-center p-6 cursor-text min-h-[200px]"
              onClick={() => document.getElementById('story-text-input')?.focus()}
            >
              {textCaption ? (
                <p className={
                  'text-white font-bold leading-relaxed ' + fontSize + ' ' +
                  (textAlign === 'center' ? 'text-center' : textAlign === 'left' ? 'text-left' : 'text-right')
                }>
                  {textCaption}
                </p>
              ) : (
                <p className="text-white/40 text-xl font-bold text-center">Tap to write...</p>
              )}
            </div>
            <div className="flex-shrink-0 bg-[#0d1f3c] border-t border-white/10 p-4 space-y-3">
              <div className="flex gap-2">
                {['text-lg', 'text-2xl', 'text-4xl'].map((size, i) => (
                  <button key={size} onClick={() => setFontSize(size)}
                    className={'flex-1 py-2 rounded-xl text-white font-bold transition-all ' + (fontSize === size ? 'bg-[#1E6FFF]' : 'bg-white/10')}
                    style={{ fontSize: ['14px', '18px', '24px'][i] }}>Aa</button>
                ))}
                {['left', 'center', 'right'].map((align) => (
                  <button key={align} onClick={() => setTextAlign(align)}
                    className={'flex-1 py-2 rounded-xl text-white text-sm font-bold transition-all ' + (textAlign === align ? 'bg-[#1E6FFF]' : 'bg-white/10')}>
                    {align === 'left' ? '⬅' : align === 'center' ? '⬛' : '➡'}
                  </button>
                ))}
              </div>
              <textarea id="story-text-input" value={textCaption}
                onChange={(e) => setTextCaption(e.target.value)}
                placeholder="What's on your mind?" maxLength={200} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] resize-none" />
              <div>
                <p className="text-[#6B7280] text-xs mb-2 font-semibold">Background</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {BG_COLORS.map((color) => (
                    <button key={color} onClick={() => setBgColor(color)} style={{ background: color }}
                      className={'w-9 h-9 rounded-full flex-shrink-0 border-2 transition-all ' + (bgColor === color ? 'border-white scale-110' : 'border-transparent')} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image story */}
        {mode === 'image_preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 relative bg-black flex items-center justify-center min-h-[200px]">
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
                  <p className="text-white/60 text-sm">Uploading...</p>
                </div>
              ) : (
                <img src={image} alt="story preview" className="w-full h-full object-contain max-h-[400px]" />
              )}
              {imageCaption && (
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="text-white text-center font-semibold bg-black/50 backdrop-blur-sm px-4 py-2 rounded-2xl text-sm">
                    {imageCaption}
                  </p>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 bg-[#0d1f3c] border-t border-white/10 p-4 space-y-3">
              <input type="text" value={imageCaption} onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Add a caption (optional)..." maxLength={150}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF]" />
              <div className="flex gap-3">
                <button onClick={() => { setImage(null); setMode('choose'); }}
                  className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl">
                  Change
                </button>
                <button onClick={handlePublish} disabled={uploading}
                  className="flex-1 bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold py-3 rounded-xl disabled:opacity-50 shadow-lg">
                  {uploading ? 'Sharing...' : '🚀 Share Story'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Stories Row ────────────────────────────────────────────────────
const Stories = () => {
  const { user, profile } = useAuth();
  const [stories, setStories] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [hasMyStory, setHasMyStory] = useState(false);

  useEffect(() => { fetchStories(); }, []);

  const fetchStories = async () => {
    const { data } = await supabase
      .from('stories')
      .select('*, users(id, username, display_name, avatar_url, is_verified)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (!data) return;

    const grouped = data.reduce((acc, story) => {
      const uid = story.user_id;
      if (!acc[uid]) acc[uid] = { user: story.users, stories: [] };
      acc[uid].stories.push(story);
      return acc;
    }, {});

    const list = Object.values(grouped);
    const mine = list.find((s) => s.user?.id === user?.id);
    setHasMyStory(!!mine);

    const others = list
      .filter((s) => s.user?.id !== user?.id)
      .sort((a, b) => {
        const aViewed = a.stories.every((s) => s.views?.includes(user?.id));
        const bViewed = b.stories.every((s) => s.views?.includes(user?.id));
        return aViewed - bViewed;
      });

    setStories(mine ? [mine, ...others] : others);
  };

  const isViewed = (sg) => sg.stories.every((s) => s.views?.includes(user?.id));

  const handleOpenStory = (sg) => {
    const idx = stories.findIndex((s) => s.user?.id === sg.user?.id);
    setViewingIndex(idx >= 0 ? idx : 0);
  };

  return (
    <>
      <div className="flex gap-4 px-4 py-3 overflow-x-auto border-b border-white/5 bg-[#0A1628]" style={{ scrollbarWidth: 'none' }}>
        {/* Add story */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setShowCreator(true)} className="relative">
            <div className={'w-[60px] h-[60px] rounded-full overflow-hidden border-2 ' + (hasMyStory ? 'border-[#1E6FFF]' : 'border-dashed border-white/30')}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="me" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl">
                  {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#1E6FFF] rounded-full flex items-center justify-center border-2 border-[#0A1628]">
              <Plus size={11} className="text-white" />
            </div>
          </button>
          <p className="text-white/60 text-[10px] font-medium text-center w-16 truncate">
            {hasMyStory ? 'My story' : 'Add story'}
          </p>
        </div>

        {/* Other stories */}
        {stories.filter((s) => s.user?.id !== user?.id).map((sg) => {
          const viewed = isViewed(sg);
          return (
            <div key={sg.user?.id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <button onClick={() => handleOpenStory(sg)} className="relative">
                <div className={'w-[60px] h-[60px] rounded-full overflow-hidden border-2 ' + (!viewed ? 'border-[#1E6FFF] story-ring-pulse' : 'border-white/20')}>
                  {sg.user?.avatar_url ? (
                    <img src={sg.user.avatar_url} alt={sg.user.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl">
                      {sg.user?.display_name?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              </button>
              <p className="text-white/60 text-[10px] font-medium text-center w-16 truncate">
                {sg.user?.display_name?.split(' ')[0]}
              </p>
            </div>
          );
        })}

        {/* View my own story */}
        {hasMyStory && (
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <button onClick={() => handleOpenStory(stories.find((s) => s.user?.id === user?.id))} className="relative">
              <div className="w-[60px] h-[60px] rounded-full overflow-hidden border-2 border-[#2ECC71]">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="me" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl">
                    {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#2ECC71] rounded-full flex items-center justify-center border-2 border-[#0A1628]">
                <Eye size={10} className="text-white" />
              </div>
            </button>
            <p className="text-white/60 text-[10px] font-medium">View mine</p>
          </div>
        )}
      </div>

      {showCreator && (
        <StoryCreator onClose={() => setShowCreator(false)} onCreated={fetchStories} />
      )}

      {viewingIndex !== null && (
        <StoryViewer
          stories={stories}
          initialIndex={viewingIndex}
          onClose={() => { setViewingIndex(null); fetchStories(); }}
        />
      )}
    </>
  );
};

export default Stories;