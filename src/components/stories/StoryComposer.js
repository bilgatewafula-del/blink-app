// src/components/stories/StoryComposer.js — new status: text (coloured background) or photo
import { useState, useRef, useEffect } from 'react';
import { X, Type, Image as ImageIcon, Camera, Send, Palette, Users } from 'lucide-react';
import useViewport from '../../lib/useViewport';
import { STORY_BACKGROUNDS, bgCss, textSizeFor } from '../../lib/storyPalette';
import { createTextStory, createImageStory } from '../../lib/stories';
import { Spinner } from '../ui';

const MAX_TEXT = 300;
const MAX_CAPTION = 150;
const MAX_MB = 15;

export default function StoryComposer({ onClose, onCreated }) {
  const vp = useViewport();
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [bgIdx, setBgIdx] = useState(() => Math.floor(Math.random() * STORY_BACKGROUNDS.length));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (mode === 'text') setTimeout(() => taRef.current?.focus(), 150); }, [mode]);
  useEffect(() => {
    const el = taRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [text, mode]);

  const bg = STORY_BACKGROUNDS[bgIdx];

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please choose a photo. Videos are coming later.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`Photo must be under ${MAX_MB}MB.`); return; }
    setError('');
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const canSend = mode === 'text' ? text.trim().length > 0 : !!file;

  const send = async () => {
    if (busy || !canSend) return;
    setBusy(true); setError('');
    try {
      if (mode === 'text') await createTextStory(text.trim(), bg.key);
      else await createImageStory(file, caption.trim());
      onCreated?.();
      onClose();
    } catch (err) {
      const m = (err.message || '').toLowerCase();
      setError(m.includes('does not exist') || m.includes('could not find') ? 'Status updates need the latest database update. Ask the admin to run status-system.sql.'
        : m.includes('limit') ? "You've reached today's status limit."
        : m.includes('cannot post') ? 'Your account cannot post a status right now.'
        : m.includes('timed out') || m.includes('fetch') ? 'Upload failed. Check your connection and try again.'
        : err.message || 'Could not post your status.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed left-0 right-0 z-[70] flex flex-col bg-black" style={{ top: vp.top, height: vp.h }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0 z-10">
        <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white"><X size={22} /></button>
        <div className="flex items-center gap-1.5 text-white/80 text-[12px] font-semibold bg-black/40 rounded-full px-3 py-1.5">
          <Users size={13} /> Friends only · 24 hours
        </div>
        {mode === 'text' ? (
          <button onClick={() => setBgIdx((i) => (i + 1) % STORY_BACKGROUNDS.length)} aria-label="Change background"
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white"><Palette size={20} /></button>
        ) : <span className="w-10" />}
      </div>

      {/* stage */}
      <div className="flex-1 min-h-0 relative">
        {mode === 'text' ? (
          <div className="absolute inset-0 flex items-center justify-center px-7" style={{ background: bg.css }}
            onClick={() => taRef.current?.focus()}>
            <textarea
              ref={taRef} value={text} maxLength={MAX_TEXT} rows={1} placeholder="Type a status"
              onChange={(e) => { setText(e.target.value); setError(''); }}
              className="w-full bg-transparent text-white text-center font-extrabold outline-none resize-none placeholder-white/55"
              style={{ fontSize: textSizeFor(text.length), lineHeight: 1.25, maxHeight: '70%', overflow: 'hidden', textShadow: '0 2px 12px rgba(0,0,0,.18)' }}
            />
            <span className="absolute bottom-3 right-4 text-white/70 text-[12px] font-semibold">{text.length}/{MAX_TEXT}</span>
          </div>
        ) : !preview ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 bg-[#11152E]">
            <button onClick={() => galleryRef.current?.click()}
              className="w-full max-w-[300px] rounded-3xl border border-white/20 bg-white/10 py-6 flex flex-col items-center gap-2 active:scale-[0.98]">
              <ImageIcon size={30} className="text-[#C4B5FD]" />
              <span className="text-white font-bold">Choose from gallery</span>
            </button>
            <button onClick={() => cameraRef.current?.click()}
              className="w-full max-w-[300px] rounded-3xl border border-white/20 bg-white/10 py-6 flex flex-col items-center gap-2 active:scale-[0.98]">
              <Camera size={30} className="text-[#C4B5FD]" />
              <span className="text-white font-bold">Take a photo</span>
            </button>
            <p className="text-white/70 text-xs text-center">Photos are fitted to the screen, never stretched.</p>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-black">
            <img src={preview} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-60" />
            <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-contain" />
            <button onClick={() => { setFile(null); setPreview(''); }} aria-label="Choose another photo"
              className="absolute top-2 right-3 text-white text-xs font-bold bg-black/55 rounded-full px-3 py-1.5">Change</button>
          </div>
        )}
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      </div>

      {/* bottom controls */}
      <div className="flex-shrink-0 bg-black px-3 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {error && <p className="text-red-400 text-[13px] text-center mb-2">{error}</p>}

        {mode === 'text' && (
          <div className="flex gap-2.5 overflow-x-auto pb-3 px-1" style={{ scrollbarWidth: 'none' }}>
            {STORY_BACKGROUNDS.map((b, i) => (
              <button key={b.key} onClick={() => setBgIdx(i)} aria-label={`Background ${b.key}`}
                className="w-8 h-8 rounded-full flex-shrink-0 transition-transform"
                style={{ background: b.css, border: i === bgIdx ? '2.5px solid #fff' : '2px solid rgba(255,255,255,.25)', transform: i === bgIdx ? 'scale(1.12)' : 'none' }} />
            ))}
          </div>
        )}

        {mode === 'photo' && preview && (
          <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))} placeholder="Add a caption"
            className="w-full bg-white/[0.09] rounded-full px-4 py-3 text-white text-[15px] outline-none placeholder-white/60 mb-3" />
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex bg-white/[0.09] rounded-full p-1">
            {[['text', 'Text', Type], ['photo', 'Photo', ImageIcon]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => { setMode(k); setError(''); }}
                className={'px-4 py-2 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 transition-colors ' + (mode === k ? 'bg-white text-black' : 'text-white/70')}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          <button onClick={send} disabled={!canSend || busy} aria-label="Post status"
            className="h-12 px-5 rounded-full text-white font-bold text-[14px] inline-flex items-center gap-2 disabled:opacity-40 active:scale-95 transition-transform"
            style={{ background: '#7C3AED', boxShadow: '0 6px 20px rgba(124,58,237,.4)' }}>
            {busy ? <><Spinner size={16} /> Posting</> : <><Send size={17} /> Post</>}
          </button>
        </div>
      </div>
    </div>
  );
}
