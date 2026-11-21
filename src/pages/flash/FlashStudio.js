// src/pages/flash/FlashStudio.js
// B-Flash Studio: record or pick a video, then trim it, add a filter, text, sound
// and frame changes, choose a cover, and publish. Also makes Duets and Stitches
// (open with ?remix=<video id>&type=duet|stitch).
//
// The edits are applied by Cloudinary when the video is delivered (trim, colour
// filter, text, volume, crop), so nothing heavy runs on the phone and your original
// file is never altered. Before publishing, the edited video is test-loaded; if it
// can't be produced, you can retry or publish the original.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  X, Scissors, Sparkles, Type, Volume2, VolumeX, Crop, Image as ImageIcon, Camera, SwitchCamera, Images,
  Check, Play, Pause, Trash2, Plus, Globe, Users, Lock, Columns2, Combine, ChevronLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { CLOUDINARY_CLOUD_NAME } from '../../lib/cloudinary';
import MentionTextarea from '../../components/MentionTextarea';
import { Spinner } from '../../components/ui';

const ACCENT = '#FF5A1F';
const MAX_LEN = 180;           // seconds
const MIN_LEN = 1;
const MAX_MB = 100;
const MAX_TEXTS = 4;
const TEXT_COLORS = ['#FFFFFF', '#FFD23F', '#FF5A1F', '#4DB6FF', '#34D6A0', '#FF4D6D', '#000000'];
const TAG_IDEAS = ['kenya', 'nairobi', 'comedy', 'music', 'dance', 'fashion', 'tech', 'sports', 'food', 'travel', 'education', 'business'];

const FILTERS = [
  { key: 'none',   label: 'Original',  css: '',                                                  cld: [] },
  { key: 'vivid',  label: 'Vivid',     css: 'saturate(1.5) contrast(1.08)',                      cld: ['e_saturation:45', 'e_contrast:10'] },
  { key: 'warm',   label: 'Warm',      css: 'sepia(.25) saturate(1.2)',                          cld: ['e_sepia:25', 'e_saturation:15'] },
  { key: 'cool',   label: 'Cool',      css: 'saturate(1.1) hue-rotate(14deg) brightness(1.03)',  cld: ['e_hue:20', 'e_saturation:10'] },
  { key: 'glow',   label: 'Soft glow', css: 'brightness(1.08) contrast(.94) saturate(1.1)',      cld: ['e_brightness:8', 'e_contrast:-6', 'e_saturation:10'] },
  { key: 'fade',   label: 'Fade',      css: 'contrast(.85) brightness(1.1) saturate(.8)',        cld: ['e_contrast:-15', 'e_brightness:10', 'e_saturation:-20'] },
  { key: 'cinema', label: 'Cinema',    css: 'contrast(1.15) saturate(.9) brightness(.95)',       cld: ['e_contrast:15', 'e_saturation:-10', 'e_vignette:35'] },
  { key: 'mono',   label: 'Mono',      css: 'grayscale(1)',                                       cld: ['e_grayscale'] },
  { key: 'noir',   label: 'Noir',      css: 'grayscale(1) contrast(1.35) brightness(.92)',        cld: ['e_grayscale', 'e_contrast:35', 'e_brightness:-8'] },
];
const FRAMES = [
  { key: 'orig',   label: 'Original', sub: 'Keep as is' },
  { key: 'fill',   label: '9:16 fill', sub: 'Crop to fill' },
  { key: 'fit',    label: '9:16 fit',  sub: 'Blurred sides' },
  { key: 'square', label: 'Square',    sub: '1:1' },
];
const AUDIENCES = [
  { key: 'public', icon: Globe, label: 'Everyone' },
  { key: 'followers', icon: Users, label: 'Followers' },
  { key: 'private', icon: Lock, label: 'Only me' },
];
const TOOLS = [
  { key: 'trim', icon: Scissors, label: 'Trim' },
  { key: 'filter', icon: Sparkles, label: 'Filters' },
  { key: 'text', icon: Type, label: 'Text' },
  { key: 'sound', icon: Volume2, label: 'Sound' },
  { key: 'frame', icon: Crop, label: 'Frame' },
  { key: 'cover', icon: ImageIcon, label: 'Cover' },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (s) => { const t = Math.max(0, s || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
const filterOf = (k) => FILTERS.find((f) => f.key === k) || FILTERS[0];

/* ── upload one file to Cloudinary (same unsigned preset as the rest of B-Link) ── */
function uploadAsset(file, resourceType, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'blink_uploads');
  formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload');
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (data && data.secure_url) resolve(data);
      else if (xhr.status === 413) reject(new Error('That file is too large to upload.'));
      else reject(new Error((data && data.error && data.error.message) || 'Upload failed. Please try again.'));
    };
    xhr.ontimeout = () => reject(new Error('Upload timed out. Check your connection.'));
    xhr.timeout = 10 * 60 * 1000;
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

/* ── Cloudinary URL for the edited video ── */
const encodeLayerText = (t) => encodeURIComponent(t)
  .replace(/%2C/g, '%252C').replace(/%2F/g, '%252F')
  .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

const frameBox = (frame, meta) => {
  if (frame === 'fill' || frame === 'fit') return { w: 720, h: 1280 };
  if (frame === 'square') return { w: 720, h: 720 };
  const s = Math.min(720 / (meta.w || 720), 1280 / (meta.h || 1280), 1);
  return { w: Math.round((meta.w || 720) * s), h: Math.round((meta.h || 1280) * s) };
};

function buildEditUrl(url, e) {
  if (!url.includes('/video/upload/')) return url;
  const parts = [];
  if (e.trim.start > 0.05 || e.trim.end < e.meta.duration - 0.05) parts.push('so_' + e.trim.start.toFixed(2) + ',eo_' + e.trim.end.toFixed(2));
  filterOf(e.filter).cld.forEach((c) => parts.push(c));
  if (e.volume === 0) parts.push('e_volume:mute');
  else if (e.volume !== 100) parts.push('e_volume:' + (e.volume - 100));
  if (e.frame === 'fill') parts.push('c_fill,w_720,h_1280');
  else if (e.frame === 'fit') parts.push('b_blurred:400:15,c_pad,w_720,h_1280');
  else if (e.frame === 'square') parts.push('c_fill,w_720,h_720');
  else parts.push('c_limit,w_720,h_1280');
  const H = frameBox(e.frame, e.meta).h;
  e.texts.filter((t) => t.text.trim()).forEach((t) => {
    const size = Math.max(14, Math.round(t.size * H));
    const bg = t.bg ? ',b_rgb:000000A6' : '';
    parts.push('l_text:Arial_' + size + '_bold:' + encodeLayerText(t.text.trim()) + ',co_rgb:' + t.color.slice(1) + bg);
    const dx = t.x - 0.5, dy = t.y - 0.5;
    parts.push('fl_layer_apply,g_center' + (Math.abs(dx) > 0.001 ? ',x_' + dx.toFixed(3) : '') + (Math.abs(dy) > 0.001 ? ',y_' + dy.toFixed(3) : ''));
  });
  parts.push('q_auto,f_mp4,vc_h264');
  return url.replace('/upload/', '/upload/' + parts.join('/') + '/').replace(/\.\w+$/, '.mp4');
}

// Does the edited video actually load? (first delivery of a new edit can take a moment)
function verifyPlayable(url, tries = 5) {
  const once = () => new Promise((resolve) => {
    const v = document.createElement('video');
    let done = false;
    const end = (ok) => { if (done) return; done = true; clearTimeout(t); v.removeAttribute('src'); v.load(); resolve(ok); };
    const t = setTimeout(() => end(false), 25000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => end(true);
    v.onerror = () => end(false);
    v.src = url;
  });
  return (async () => {
    for (let i = 0; i < tries; i++) {
      if (await once()) return true;
      await new Promise((r) => setTimeout(r, 4000));
    }
    return false;
  })();
}

/* ── still frame (with the chosen filter) for the cover ── */
function captureCover(objUrl, time, filterCss, frame, meta) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    const fail = () => reject(new Error('cover'));
    const timer = setTimeout(fail, 12000);
    v.onerror = fail;
    v.onloadedmetadata = () => { v.currentTime = clamp(time, 0, Math.max(0, (v.duration || 1) - 0.05)); };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const box = frameBox(frame, meta);
        const W = 540, H = Math.round((box.h / box.w) * W);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        if (filterCss) ctx.filter = filterCss;
        const vw = v.videoWidth || W, vh = v.videoHeight || H;
        const cover = frame === 'fill' || frame === 'square' || frame === 'orig';
        const s = cover ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
        const dw = vw * s, dh = vh * s;
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        c.toBlob((b) => (b ? resolve(new File([b], 'cover.jpg', { type: 'image/jpeg' })) : fail()), 'image/jpeg', 0.85);
      } catch { fail(); }
    };
    v.src = objUrl;
  });
}

const readMeta = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true;
  const done = (m) => { URL.revokeObjectURL(url); resolve(m); };
  const timer = setTimeout(() => done(null), 10000);
  v.onloadedmetadata = () => { clearTimeout(timer); done({ duration: v.duration || 0, w: v.videoWidth || 0, h: v.videoHeight || 0 }); };
  v.onerror = () => { clearTimeout(timer); done(null); };
  v.src = url;
});

/* ── trim bar with two drag handles ── */
function TrimBar({ duration, start, end, now, onChange, onScrub }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const toTime = (x) => {
    const r = ref.current.getBoundingClientRect();
    return clamp(((x - r.left) / r.width) * duration, 0, duration);
  };
  const down = (which) => (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = which; };
  const move = (e) => {
    if (!drag.current) return;
    const t = toTime(e.clientX);
    if (drag.current === 'start') {
      const s = clamp(t, Math.max(0, end - MAX_LEN), end - MIN_LEN);
      onChange({ start: s, end }); onScrub(s);
    } else {
      const en = clamp(t, start + MIN_LEN, Math.min(duration, start + MAX_LEN));
      onChange({ start, end: en }); onScrub(Math.max(start, en - 0.1));
    }
  };
  const up = () => { drag.current = null; };
  const pct = (t) => (t / duration) * 100 + '%';
  return (
    <div ref={ref} className="relative h-14 mx-5 select-none" style={{ touchAction: 'none' }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="absolute inset-x-0 top-2 bottom-2 rounded-lg bg-white/10" />
      <div className="absolute top-2 bottom-2 rounded-lg" style={{ left: pct(start), width: ((end - start) / duration) * 100 + '%', background: 'rgba(255,90,31,.28)', borderTop: '2px solid ' + ACCENT, borderBottom: '2px solid ' + ACCENT }} />
      {now >= start && now <= end && <div className="absolute top-1 bottom-1 w-0.5 bg-white pointer-events-none" style={{ left: pct(now) }} />}
      {[['start', start], ['end', end]].map(([k, t]) => (
        <button key={k} onPointerDown={down(k)} aria-label={k === 'start' ? 'Trim start' : 'Trim end'}
          className="absolute top-0 bottom-0 w-7 -ml-3.5 flex items-center justify-center" style={{ left: pct(t), touchAction: 'none' }}>
          <span className="w-2.5 h-full rounded-full" style={{ background: ACCENT }} />
        </button>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children, ariaLabel }) {
  return (
    <button onClick={onClick} aria-label={ariaLabel} aria-pressed={!!active}
      className="px-3.5 h-9 rounded-full text-[13px] font-bold flex-shrink-0 transition-colors"
      style={{ background: active ? ACCENT : 'rgba(255,255,255,.08)', color: '#fff' }}>{children}</button>
  );
}

export default function FlashStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const remixId = params.get('remix');
  const remixType = params.get('type') === 'stitch' ? 'stitch' : 'duet';

  const [step, setStep] = useState('pick');                       // pick | edit | details
  const [tool, setTool] = useState('trim');
  const [file, setFile] = useState(null);
  const [objUrl, setObjUrl] = useState('');
  const [meta, setMeta] = useState({ duration: 0, w: 0, h: 0 });
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [filter, setFilter] = useState('none');
  const [frame, setFrame] = useState(remixId && remixType === 'duet' ? 'fill' : 'orig');
  const [volume, setVolume] = useState(100);
  const [texts, setTexts] = useState([]);
  const [selText, setSelText] = useState(null);
  const [coverMode, setCoverMode] = useState('frame');            // frame | file
  const [coverT, setCoverT] = useState(0);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [facing, setFacing] = useState('user');
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState('public');
  const [commentsOn, setCommentsOn] = useState(true);
  const [allowRemix, setAllowRemix] = useState(true);
  const [clipEnd, setClipEnd] = useState(3);
  const [source, setSource] = useState(null);                     // the video being duetted / stitched
  const [sourceErr, setSourceErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState(false);                  // edited video could not be produced
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const vref = useRef(null);
  const sref = useRef(null);
  const wrapRef = useRef(null);
  const ownRef = useRef(null);
  const galleryRef = useRef(null);
  const camRef = useRef(null);
  const coverInputRef = useRef(null);
  const uploadRef = useRef(null);
  const coverCache = useRef(null);
  const dragText = useRef(null);
  const trimRef = useRef(trim);
  trimRef.current = trim;

  const duet = !!source && remixType === 'duet';
  const stitch = !!source && remixType === 'stitch';
  const sel = texts.find((t) => t.id === selText) || null;
  const trimLen = trim.end - trim.start;
  const hasEdits = trim.start > 0.05 || trim.end < meta.duration - 0.05 || filter !== 'none' || volume !== 100 || frame !== 'orig' || texts.some((t) => t.text.trim());

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2200); }, []);

  /* ── the video being remixed ── */
  useEffect(() => {
    if (!remixId) return;
    let alive = true;
    supabase.from('posts')
      .select('id, video_url, video_thumbnail, video_duration, allow_remix, audience, status, users!posts_user_id_fkey(username, display_name)')
      .eq('id', remixId).maybeSingle()
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e || !data || !data.video_url || data.status === 'deleted') { setSourceErr('That video isn’t available.'); return; }
        if (data.allow_remix === false) { setSourceErr('The creator turned off duets and stitches for this video.'); return; }
        setSource({ ...data, users: data['users!posts_user_id_fkey'] || data.users });
        setClipEnd(Math.min(3, Math.max(1, Math.floor(data.video_duration || 3))));
      });
    return () => { alive = false; };
  }, [remixId]);

  /* ── choosing a file ── */
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!f.type.startsWith('video/')) { setError('Please choose a video file.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError('That video is over ' + MAX_MB + ' MB. Trim it on your phone or pick a shorter one.'); return; }
    const m = await readMeta(f);
    if (!m || !m.duration) { setError('We couldn’t read that video. Try another file.'); return; }
    if (objUrl) URL.revokeObjectURL(objUrl);
    uploadRef.current = null; coverCache.current = null;
    setFile(f); setObjUrl(URL.createObjectURL(f)); setMeta(m);
    setTrim({ start: 0, end: Math.min(m.duration, MAX_LEN) });
    setCoverT(Math.min(0.5, m.duration / 2)); setCoverMode('frame'); setCoverFile(null); setCoverPreview('');
    setFilter('none'); setVolume(100); setTexts([]); setSelText(null); setPlaying(false);
    setFrame(remixId && remixType === 'duet' ? 'fill' : 'orig');
    setStep('edit'); setTool('trim');
  };
  useEffect(() => () => { if (objUrl) URL.revokeObjectURL(objUrl); }, [objUrl]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  /* ── preview box size follows the chosen frame ── */
  const ratio = duet ? 9 / 16 : frame === 'square' ? 1 : frame === 'orig' ? ((meta.w && meta.h) ? meta.w / meta.h : 9 / 16) : 9 / 16;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || step !== 'edit') return undefined;
    const calc = () => {
      const w = el.clientWidth - 16, h = el.clientHeight - 8;
      if (w <= 0 || h <= 0) return;
      const bw = Math.min(w, h * ratio);
      setBox({ w: bw, h: bw / ratio });
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', calc);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', calc); };
  }, [ratio, step, tool]);

  /* ── preview playback stays inside the trimmed part ── */
  const seek = (t) => { const v = vref.current; if (v) { try { v.currentTime = t; } catch { /* not ready */ } } setNow(t); };
  const onTime = () => {
    const v = vref.current;
    if (!v) return;
    setNow(v.currentTime);
    const tr = trimRef.current;
    if (v.currentTime >= tr.end - 0.05) {
      v.currentTime = tr.start;
      if (sref.current) sref.current.currentTime = 0;
    }
  };
  const togglePlay = () => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trim.start || v.currentTime >= trim.end - 0.05) v.currentTime = trim.start;
      v.play().then(() => { setPlaying(true); if (sref.current) { sref.current.currentTime = 0; sref.current.play().catch(() => {}); } }).catch(() => setPlaying(false));
    } else {
      v.pause(); setPlaying(false);
      if (sref.current) sref.current.pause();
    }
  };
  useEffect(() => { if (vref.current) vref.current.volume = clamp(volume / 100, 0, 1); }, [volume, objUrl]);
  useEffect(() => { // stop and show the first frame when the edit tab changes the cut
    if (vref.current && !playing) seek(tool === 'cover' && coverMode === 'frame' ? coverT : trim.start);
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── text overlays ── */
  const addText = () => {
    if (texts.length >= MAX_TEXTS) { say('Up to ' + MAX_TEXTS + ' texts'); return; }
    const id = Date.now() + '' + texts.length;
    setTexts((t) => [...t, { id, text: 'Your text', x: 0.5, y: 0.5, size: 0.055, color: '#FFFFFF', bg: false }]);
    setSelText(id);
  };
  const patchText = (id, v) => setTexts((arr) => arr.map((t) => (t.id === id ? { ...t, ...v } : t)));
  const textDown = (e, id) => {
    e.stopPropagation();
    setSelText(id); setTool('text');
    e.currentTarget.setPointerCapture(e.pointerId);
    dragText.current = { id, r: ownRef.current.getBoundingClientRect() };
  };
  const textMove = (e) => {
    const d = dragText.current;
    if (!d) return;
    const lo = duet ? 0.22 : 0.1, hi = duet ? 0.78 : 0.9;
    patchText(d.id, { x: clamp((e.clientX - d.r.left) / d.r.width, lo, hi), y: clamp((e.clientY - d.r.top) / d.r.height, 0.06, 0.94) });
  };
  const textUp = () => { dragText.current = null; };

  /* ── publish ── */
  const fileKey = file ? file.name + ':' + file.size + ':' + file.lastModified : '';
  const publish = async (opts = {}) => {
    if (busy || !file || !user) return;
    if (trimLen < MIN_LEN || trimLen > MAX_LEN + 0.5) { setError('Pick between 1 second and 3 minutes.'); return; }
    if (caption.length > 500) { setError('Caption is too long.'); return; }
    setError(''); setProblem(false); setBusy(true);
    try {
      let up = uploadRef.current;
      if (!up || up.key !== fileKey) {                         // upload once; retries reuse it
        setPhase('upload'); setProgress(0);
        const r = await uploadAsset(file, 'video', setProgress);
        up = { key: fileKey, url: r.secure_url, duration: r.duration || meta.duration };
        uploadRef.current = up;
      }

      let videoUrl = up.url;
      let duration = Math.round(up.duration);
      const useEdits = hasEdits && !opts.original;
      if (useEdits) {
        const edited = buildEditUrl(up.url, { trim, meta, filter, frame, volume, texts });
        setPhase('process');
        if (!(await verifyPlayable(edited))) { setProblem(true); setBusy(false); setPhase(''); return; }
        videoUrl = edited;
        duration = Math.round(trimLen);
      }

      const coverKey = JSON.stringify([coverMode, coverT, coverFile && coverFile.name, useEdits ? [filter, frame, trim.start] : 0]);
      let thumb = coverCache.current && coverCache.current.key === coverKey ? coverCache.current.url : null;
      if (!thumb) {
        setPhase('cover');
        try {
          const img = coverMode === 'file' && coverFile
            ? coverFile
            : await captureCover(objUrl, coverMode === 'frame' ? coverT : trim.start, useEdits ? filterOf(filter).css : '', useEdits ? frame : 'orig', meta);
          thumb = (await uploadAsset(img, 'image')).secure_url;
          coverCache.current = { key: coverKey, url: thumb };
        } catch { thumb = videoUrl.replace(/\.\w+$/, '.jpg'); }
      }

      setPhase('save');
      const tags = [...new Set((caption.match(/#(\w+)/g) || []).map((h) => h.slice(1)))].slice(0, 15);
      const payload = {
        user_id: user.id, caption: caption.trim(), audience, post_type: 'video', hashtags: tags,
        video_url: videoUrl, video_duration: duration, video_thumbnail: thumb,
        is_draft: false, status: 'active', comments_disabled: !commentsOn,
        allow_remix: audience === 'public' ? allowRemix : false,
      };
      if (source) { payload.remix_of = source.id; payload.remix_type = remixType; if (stitch) payload.remix_clip_end = clipEnd; }

      let { error: dbErr } = await supabase.from('posts').insert(payload);
      if (dbErr && !source && /allow_remix|comments_disabled/i.test(dbErr.message || '')) {   // older database
        delete payload.allow_remix; delete payload.comments_disabled;
        ({ error: dbErr } = await supabase.from('posts').insert(payload));
      }
      if (dbErr) throw new Error(dbErr.message);
      setDone(true);
      setTimeout(() => navigate('/flash', { replace: true }), 900);
    } catch (err) {
      const raw = err.message || '';
      if (raw.includes('Daily post limit')) setError('Daily post limit reached. Come back tomorrow!');
      else if (raw.includes('Duplicate post')) setError('You already posted this. Wait a bit before reposting the same content.');
      else if (raw.includes('too quickly')) setError('You are posting too fast. Wait a few seconds and try again.');
      else if (/remix_of|remix_type|remix_clip_end/i.test(raw) && /column|schema/i.test(raw)) setError('Duets and stitches need the Stage 3 database update first.');
      else setError(raw || 'Post failed. Try again.');
    }
    setBusy(false); setPhase('');
  };

  const back = () => {
    if (step === 'details') { setStep('edit'); return; }
    if (step === 'edit' && !busy) { setConfirmDiscard(true); return; }
    navigate(-1);
  };

  /* ───────────── screens ───────────── */
  const header = (
    <div className="flex items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))] pb-1 flex-shrink-0">
      <button onClick={back} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white">
        {step === 'pick' ? <X size={22} /> : <ChevronLeft size={24} />}
      </button>
      <p className="text-white font-extrabold text-[16px]">
        {step === 'pick' ? (source ? (stitch ? 'Stitch' : 'Duet') : 'New video') : step === 'edit' ? 'Edit' : 'Details'}
      </p>
      {step === 'edit' ? (
        <button onClick={() => { if (videoPause()) setStep('details'); }} className="h-9 px-4 rounded-full text-white text-[14px] font-bold" style={{ background: ACCENT }}>Next</button>
      ) : step === 'details' ? (
        <button onClick={() => publish()} disabled={busy} className="h-9 px-4 rounded-full text-white text-[14px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>Post</button>
      ) : <span className="w-11" />}
    </div>
  );
  const videoPause = () => { if (vref.current) vref.current.pause(); if (sref.current) sref.current.pause(); setPlaying(false); return true; };

  if (remixId && sourceErr) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0D0C0B] flex flex-col">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-white font-semibold">{sourceErr}</p>
          <button onClick={() => navigate('/flash')} className="h-11 px-6 rounded-full text-white font-bold" style={{ background: ACCENT }}>Back to B-Flash</button>
        </div>
      </div>
    );
  }

  /* pick */
  if (step === 'pick') {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0D0C0B] flex flex-col overflow-y-auto">
        {header}
        <div className="flex-1 px-5 pt-4 pb-8 flex flex-col gap-4 max-w-[520px] w-full mx-auto">
          {source && (
            <div className="flex items-center gap-3 rounded-2xl p-3 bg-white/[0.06] border border-white/10">
              <div className="w-14 h-20 rounded-xl bg-black overflow-hidden flex-shrink-0">
                {source.video_thumbnail && <img src={source.video_thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-[15px] flex items-center gap-2">{stitch ? <Combine size={17} /> : <Columns2 size={17} />}{stitch ? 'Stitch with' : 'Duet with'} @{source.users && source.users.username}</p>
                <p className="text-[#8E8C88] text-[13px] leading-snug mt-1">
                  {stitch ? 'Viewers see the first seconds of their video, then yours.' : 'Their video plays next to yours. Their name is shown on your video.'}
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {[['user', 'Front camera'], ['environment', 'Back camera']].map(([k, l]) => (
              <button key={k} onClick={() => setFacing(k)} aria-pressed={facing === k}
                className="flex-1 h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2"
                style={{ background: facing === k ? ACCENT : 'rgba(255,255,255,.07)', color: '#fff' }}>
                <SwitchCamera size={16} /> {l}
              </button>
            ))}
          </div>
          <button onClick={() => camRef.current && camRef.current.click()}
            className="h-28 rounded-3xl flex flex-col items-center justify-center gap-2 text-white font-extrabold text-[16px] active:scale-[.98] transition-transform"
            style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF2D78)' }}>
            <Camera size={32} strokeWidth={1.8} /> Record with camera
          </button>
          <button onClick={() => galleryRef.current && galleryRef.current.click()}
            className="h-20 rounded-3xl flex items-center justify-center gap-3 text-white font-bold text-[15px] bg-white/[0.07] border border-white/10 active:scale-[.98] transition-transform">
            <Images size={24} strokeWidth={1.8} /> Choose from gallery
          </button>
          <p className="text-[#8E8C88] text-[12px] text-center leading-snug">Up to {MAX_MB} MB. You can trim to 3 minutes. Your original video is never changed.</p>
          {error && <p className="text-[#FF6B6B] text-[13px] text-center">{error}</p>}
        </div>
        <input ref={galleryRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
        <input ref={camRef} type="file" accept="video/*" capture={facing} className="hidden" onChange={onFile} />
      </div>
    );
  }

  const fcss = filterOf(filter).css;
  const objFit = frame === 'fill' || duet ? 'cover' : 'contain';
  const ownStyle = duet ? { position: 'absolute', top: 0, bottom: 0, left: '50%', width: '50%' } : { position: 'absolute', inset: 0 };

  /* details */
  if (step === 'details') {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0D0C0B] flex flex-col">
        {header}
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-10 max-w-[560px] w-full mx-auto">
          {source && (
            <p className="text-[13px] font-bold mb-3 flex items-center gap-2" style={{ color: ACCENT }}>
              {stitch ? <Combine size={16} /> : <Columns2 size={16} />}{stitch ? 'Stitch of' : 'Duet with'} @{source.users && source.users.username}
            </p>
          )}
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 mb-1">
            <MentionTextarea value={caption} onChange={setCaption} rows={4} maxLength={500} hashtagIdeas={TAG_IDEAS}
              placeholder="Write a caption… use # for hashtags and @ to mention" className="text-[16px] leading-snug" />
          </div>
          <p className="text-right text-[11px] text-[#8E8C88] mb-3">{caption.length}/500</p>

          <p className="text-[12px] font-bold uppercase tracking-wide text-[#8E8C88] mb-2">Who can watch</p>
          <div className="flex gap-2 mb-4">
            {AUDIENCES.map((a) => (
              <button key={a.key} onClick={() => setAudience(a.key)} aria-pressed={audience === a.key}
                className="flex-1 h-12 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2"
                style={{ background: audience === a.key ? ACCENT : 'rgba(255,255,255,.07)', color: '#fff' }}>
                <a.icon size={16} /> {a.label}
              </button>
            ))}
          </div>

          {[
            ['Allow comments', 'People can comment on your video.', commentsOn, setCommentsOn, false],
            ['Allow duets & stitches', audience === 'public' ? 'Others can make a duet or stitch with your video. You’re always credited.' : 'Only available for public videos.', audience === 'public' && allowRemix, setAllowRemix, audience !== 'public'],
          ].map(([l, d, on, set, off]) => (
            <button key={l} onClick={() => !off && set(!on)} disabled={off} role="switch" aria-checked={on}
              className="w-full flex items-center gap-3 py-3 text-left disabled:opacity-50">
              <span className="flex-1 min-w-0">
                <span className="block text-white text-[15px] font-semibold">{l}</span>
                <span className="block text-[#8E8C88] text-[12px] mt-0.5 leading-snug">{d}</span>
              </span>
              <span className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors" style={{ background: on ? ACCENT : 'rgba(255,255,255,.18)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
              </span>
            </button>
          ))}

          <div className="mt-3 rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 text-[13px] text-[#B8B6B2] leading-snug">
            {hasEdits ? 'Your edits are applied when your video is processed: ' : 'No edits: your video is posted as it is. '}
            {hasEdits && [
              (trim.start > 0.05 || trim.end < meta.duration - 0.05) && 'trimmed to ' + Math.round(trimLen) + 's',
              filter !== 'none' && filterOf(filter).label + ' filter',
              volume !== 100 && (volume === 0 ? 'sound off' : 'sound ' + volume + '%'),
              frame !== 'orig' && FRAMES.find((f) => f.key === frame).label,
              texts.filter((t) => t.text.trim()).length > 0 && texts.filter((t) => t.text.trim()).length + ' text',
            ].filter(Boolean).join(' · ')}
          </div>
          {error && <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><p className="text-red-400 text-sm">{error}</p></div>}
        </div>
        {renderBusy()}
      </div>
    );
  }

  /* edit */
  function renderBusy() {
    if (!busy && !problem && !done) return null;
    return (
      <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center px-8">
        <div className="w-full max-w-[340px] rounded-3xl bg-[#171614] border border-white/10 p-6 text-center">
          {done ? (
            <>
              <span className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: ACCENT }}><Check size={28} color="#fff" /></span>
              <p className="text-white font-bold">Posted to B-Flash</p>
            </>
          ) : problem ? (
            <>
              <p className="text-white font-bold mb-1">Your edits couldn’t be made</p>
              <p className="text-[#8E8C88] text-[13px] leading-snug mb-4">The edited video didn’t load. You can try again, or post your original video without the edits.</p>
              <div className="flex flex-col gap-2.5">
                <button onClick={() => publish()} className="h-11 rounded-xl text-white font-bold" style={{ background: ACCENT }}>Try again</button>
                <button onClick={() => publish({ original: true })} className="h-11 rounded-xl text-white font-bold bg-white/10">Post original</button>
                <button onClick={() => setProblem(false)} className="h-10 text-[#8E8C88] font-semibold">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-center text-white mb-3"><Spinner size={28} /></div>
              <p className="text-white font-bold">
                {phase === 'upload' ? 'Uploading… ' + progress + '%' : phase === 'process' ? 'Applying your edits…' : phase === 'cover' ? 'Saving your cover…' : 'Publishing…'}
              </p>
              {phase === 'upload' && (
                <div className="h-1.5 rounded-full bg-white/10 mt-3 overflow-hidden"><div className="h-full rounded-full" style={{ width: progress + '%', background: ACCENT }} /></div>
              )}
              <p className="text-[#8E8C88] text-[12px] mt-3">Keep this screen open.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const tools = stitch ? [...TOOLS, { key: 'clip', icon: Combine, label: 'Clip' }] : TOOLS;
  return (
    <div className="fixed inset-0 z-[60] bg-[#0D0C0B] flex flex-col">
      {header}

      <div ref={wrapRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div className="relative rounded-2xl overflow-hidden bg-black"
          style={{ width: box.w, height: box.h, background: frame === 'fit' ? 'linear-gradient(135deg,#1d1c1a,#2b2926)' : '#000' }}>
          {duet && source && (
            <video ref={sref} src={source.video_url} muted loop playsInline preload="metadata" poster={source.video_thumbnail || undefined}
              className="absolute top-0 bottom-0 left-0 w-1/2 object-cover" />
          )}
          <div style={ownStyle}>
            <video ref={vref} src={objUrl} playsInline loop={false} preload="auto" onTimeUpdate={onTime}
              onLoadedMetadata={() => seek(coverT)}
              className="absolute inset-0 w-full h-full" style={{ objectFit: objFit, filter: fcss || undefined }} />
            <div className="absolute inset-0" ref={ownRef} onClick={togglePlay} role="button" aria-label={playing ? 'Pause' : 'Play'}>
              {texts.map((t) => (
                <div key={t.id} onPointerDown={(e) => textDown(e, t.id)} onPointerMove={textMove} onPointerUp={textUp} onPointerCancel={textUp}
                  className="absolute select-none font-extrabold text-center whitespace-nowrap rounded-md"
                  style={{
                    left: t.x * 100 + '%', top: t.y * 100 + '%', transform: 'translate(-50%,-50%)', touchAction: 'none',
                    fontSize: Math.max(10, t.size * box.h), color: t.color, padding: t.bg ? '2px 8px' : 0,
                    background: t.bg ? 'rgba(0,0,0,.65)' : 'transparent', fontFamily: 'Arial, Helvetica, sans-serif',
                    outline: t.id === selText && tool === 'text' ? '2px dashed rgba(255,255,255,.8)' : 'none', outlineOffset: 3,
                    textShadow: t.bg ? 'none' : '0 1px 4px rgba(0,0,0,.6)',
                  }}>{t.text || ' '}</div>
              ))}
            </div>
          </div>
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-14 h-14 rounded-full bg-black/45 flex items-center justify-center"><Play size={26} color="#fff" fill="#fff" /></span>
            </div>
          )}
          {duet && source && (
            <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-bold">@{source.users && source.users.username}</span>
          )}
        </div>
      </div>

      {/* tool panel */}
      <div className="flex-shrink-0 bg-[#171614] border-t border-white/10" style={{ minHeight: 150 }}>
        <div className="pt-3 pb-2 min-h-[112px]">
          {tool === 'trim' && (
            <>
              <TrimBar duration={meta.duration} start={trim.start} end={trim.end} now={now} onChange={setTrim} onScrub={seek} />
              <div className="flex items-center justify-between px-5 text-[12px] text-[#B8B6B2]">
                <span>Start {fmt(trim.start)}</span>
                <span className="font-bold text-white">{Math.round(trimLen)}s selected</span>
                <span>End {fmt(trim.end)}</span>
              </div>
              {meta.duration > MAX_LEN && <p className="px-5 pt-1 text-[11px] text-[#8E8C88]">This video is {fmt(meta.duration)} long. B-Flash videos can be up to 3 minutes.</p>}
            </>
          )}
          {tool === 'filter' && (
            <div className="flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <span className="block w-14 h-14 rounded-xl" style={{ background: 'linear-gradient(135deg,#f6c177,#c4a7e7 55%,#31748f)', filter: f.css || undefined, outline: filter === f.key ? '2px solid ' + ACCENT : '2px solid transparent', outlineOffset: 2 }} />
                  <span className="text-[11px] font-semibold" style={{ color: filter === f.key ? ACCENT : '#B8B6B2' }}>{f.label}</span>
                </button>
              ))}
            </div>
          )}
          {tool === 'text' && (
            <div className="px-5">
              <div className="flex items-center gap-2 mb-2.5">
                <button onClick={addText} className="h-9 px-3.5 rounded-full text-white text-[13px] font-bold flex items-center gap-1.5 flex-shrink-0" style={{ background: ACCENT }}><Plus size={15} /> Add text</button>
                {sel && (
                  <>
                    <input value={sel.text} onChange={(e) => patchText(sel.id, { text: e.target.value.slice(0, 40) })} aria-label="Text"
                      className="flex-1 min-w-0 h-9 rounded-full bg-white/[0.08] px-4 text-white outline-none" style={{ fontSize: 16 }} />
                    <button onClick={() => { setTexts((a) => a.filter((t) => t.id !== sel.id)); setSelText(null); }} aria-label="Delete text" className="w-9 h-9 flex items-center justify-center text-[#FF6B6B] flex-shrink-0"><Trash2 size={18} /></button>
                  </>
                )}
              </div>
              {sel ? (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {TEXT_COLORS.map((c) => (
                      <button key={c} onClick={() => patchText(sel.id, { color: c })} aria-label={'Colour ' + c}
                        className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: c, outline: sel.color === c ? '2px solid ' + ACCENT : '2px solid rgba(255,255,255,.25)', outlineOffset: 2 }} />
                    ))}
                    <Pill active={sel.bg} onClick={() => patchText(sel.id, { bg: !sel.bg })}>Box</Pill>
                  </div>
                  <input type="range" min="3" max="10" step="0.5" value={sel.size * 100} onChange={(e) => patchText(sel.id, { size: Number(e.target.value) / 100 })}
                    aria-label="Text size" className="w-full" style={{ accentColor: ACCENT }} />
                </>
              ) : <p className="text-[12px] text-[#8E8C88]">Add text, then drag it on the video to place it. It shows for the whole video.</p>}
            </div>
          )}
          {tool === 'sound' && (
            <div className="px-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setVolume(volume === 0 ? 100 : 0)} aria-label={volume === 0 ? 'Turn original sound on' : 'Mute original sound'}
                  className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white flex-shrink-0">{volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
                <input type="range" min="0" max="150" step="5" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Original sound volume" className="flex-1" style={{ accentColor: ACCENT }} />
                <span className="w-12 text-right text-white text-[13px] font-bold">{volume}%</span>
              </div>
              <p className="text-[11px] text-[#8E8C88] mt-2 leading-snug">Changes the original sound of your video. The preview can’t play louder than 100%.</p>
            </div>
          )}
          {tool === 'frame' && (
            <div className="grid grid-cols-4 gap-2 px-4">
              {FRAMES.map((f) => (
                <button key={f.key} onClick={() => !duet && setFrame(f.key)} disabled={duet} aria-pressed={frame === f.key}
                  className="flex flex-col items-center gap-1 py-2 rounded-xl disabled:opacity-50"
                  style={{ background: frame === f.key ? 'rgba(255,90,31,.18)' : 'rgba(255,255,255,.06)', border: '1px solid ' + (frame === f.key ? ACCENT : 'transparent') }}>
                  <span className="block border-2 rounded-sm" style={{ borderColor: frame === f.key ? ACCENT : '#B8B6B2', width: f.key === 'square' ? 22 : f.key === 'orig' ? 26 : 16, height: f.key === 'orig' ? 18 : f.key === 'square' ? 22 : 28 }} />
                  <span className="text-[12px] font-bold text-white">{f.label}</span>
                  <span className="text-[10px] text-[#8E8C88]">{f.sub}</span>
                </button>
              ))}
            </div>
          )}
          {tool === 'cover' && (
            <div className="px-5">
              <div className="flex gap-2 mb-2.5">
                <Pill active={coverMode === 'frame'} onClick={() => { setCoverMode('frame'); seek(coverT); }}>Pick a frame</Pill>
                <Pill active={coverMode === 'file'} onClick={() => coverInputRef.current && coverInputRef.current.click()}>Upload image</Pill>
                {coverMode === 'file' && coverPreview && <img src={coverPreview} alt="Your cover" className="h-9 w-7 rounded object-cover ml-auto" />}
              </div>
              {coverMode === 'frame' && (
                <input type="range" min={trim.start} max={Math.max(trim.start + 0.1, trim.end - 0.1)} step="0.1" value={clamp(coverT, trim.start, trim.end)}
                  onChange={(e) => { const t = Number(e.target.value); setCoverT(t); seek(t); }} aria-label="Cover frame" className="w-full" style={{ accentColor: ACCENT }} />
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0]; e.target.value = '';
                  if (!f) return;
                  if (!f.type.startsWith('image/') || f.size > 8 * 1024 * 1024) { say('Choose an image under 8 MB'); return; }
                  setCoverFile(f); setCoverMode('file'); setCoverPreview(URL.createObjectURL(f));
                }} />
            </div>
          )}
          {tool === 'clip' && stitch && (
            <div className="px-5">
              <p className="text-white text-[14px] font-bold mb-1">Show {clipEnd}s of @{source.users && source.users.username}’s video first</p>
              <input type="range" min="1" max={Math.min(5, Math.max(1, Math.floor(source.video_duration || 5)))} step="1" value={clipEnd}
                onChange={(e) => setClipEnd(Number(e.target.value))} aria-label="Clip length" className="w-full" style={{ accentColor: ACCENT }} />
              <p className="text-[11px] text-[#8E8C88] mt-1 leading-snug">Viewers see this clip from the start of their video, then your video. Clips are 1 to 5 seconds.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-around px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-1 border-t border-white/[0.06]">
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="w-11 h-11 flex items-center justify-center text-white">
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          {tools.map((t) => (
            <button key={t.key} onClick={() => { setTool(t.key); if (t.key === 'text' && !texts.length) addText(); }} aria-pressed={tool === t.key}
              className="flex flex-col items-center gap-1 py-1 w-12">
              <t.icon size={21} strokeWidth={1.9} color={tool === t.key ? ACCENT : '#fff'} />
              <span className="text-[10px] font-bold" style={{ color: tool === t.key ? ACCENT : '#B8B6B2' }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {confirmDiscard && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end justify-center" onClick={() => setConfirmDiscard(false)}>
          <div className="w-full max-w-[520px] bg-[#171614] border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-bold text-[16px] mb-1">Discard this video?</p>
            <p className="text-[#8E8C88] text-[13px] leading-snug mb-4">Your edits will be lost. Your original video on your phone is not affected.</p>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => { setConfirmDiscard(false); setStep('pick'); setFile(null); }} className="h-12 rounded-xl bg-[#E5484D] text-white font-bold">Discard</button>
              <button onClick={() => setConfirmDiscard(false)} className="h-12 rounded-xl bg-white/10 text-white font-bold">Keep editing</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[95] bg-black/85 text-white text-[13px] font-semibold px-4 py-2 rounded-full">{toast}</div>}
      {renderBusy()}
    </div>
  );
}
