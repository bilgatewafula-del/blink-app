import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Camera, Check, Clock, X, Trash2, ImagePlus, Link2, CheckCircle2, XCircle } from 'lucide-react';
import { sanitiseUserUpdate } from '../../utils/securityUtils';
import { validateUsername, validateDisplayName, getNameChangeCooldownRemaining, NAME_CHANGE_COOLDOWN_DAYS } from '../../utils/usernameValidation';
import { compressImage, uploadImage, feedImageUrl } from '../../lib/imageUtils';
import Avatar from '../../components/Avatar';
import { Spinner } from '../../components/ui';

const COUNTRIES = [
  { code: 'KE', name: 'Kenya' }, { code: 'NG', name: 'Nigeria' }, { code: 'GH', name: 'Ghana' },
  { code: 'UG', name: 'Uganda' }, { code: 'TZ', name: 'Tanzania' }, { code: 'ZA', name: 'South Africa' },
  { code: 'ET', name: 'Ethiopia' }, { code: 'RW', name: 'Rwanda' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'CA', name: 'Canada' }, { code: 'OTHER', name: 'Other' },
];

const MAX_PICK_MB = 15;

function normaliseWebsite(v) {
  const t = (v || '').trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : 'https://' + t;
}
function validWebsite(v) {
  if (!v) return true;
  try { const u = new URL(v); return !!u.hostname.includes('.'); } catch { return false; }
}

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const avatarInput = useRef(null);
  const coverInput = useRef(null);

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [country, setCountry] = useState(profile?.country || 'KE');
  const [website, setWebsite] = useState('');
  const [original, setOriginal] = useState({ website: '' });
  const [websiteReady, setWebsiteReady] = useState(false);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || '');
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const [coverSupported, setCoverSupported] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');

  const [usernameState, setUsernameState] = useState('idle'); // idle | checking | free | taken
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Fresh values for fields the global profile object does not carry.
  // (The old screen assumed website was always empty, so every save
  // silently erased it.)
  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    supabase.from('users').select('website').eq('id', user.id).maybeSingle().then(({ data, error: e }) => {
      if (!live) return;
      if (!e) { setWebsite(data?.website || ''); setOriginal({ website: data?.website || '' }); setWebsiteReady(true); }
    });
    supabase.from('users').select('cover_url').eq('id', user.id).maybeSingle().then(({ data, error: e }) => {
      if (!live) return;
      if (!e) { setCoverSupported(true); setCoverUrl(data?.cover_url || ''); setCoverPreview(data?.cover_url ? feedImageUrl(data.cover_url, 900) : ''); }
    });
    return () => { live = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || '');
    setUsername(profile.username || '');
    setBio(profile.bio || '');
    setCountry(profile.country || 'KE');
    setAvatarPreview(profile.avatar_url || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const usernameCooldownDays = getNameChangeCooldownRemaining(profile?.username_changed_at);
  const displayNameCooldownDays = getNameChangeCooldownRemaining(profile?.display_name_changed_at);
  const usernameChanged = username.trim().toLowerCase() !== (profile?.username || '').toLowerCase();
  const displayNameChanged = displayName.trim() !== (profile?.display_name || '');

  // live username availability
  useEffect(() => {
    if (!usernameChanged || validateUsername(username)) { setUsernameState('idle'); return; }
    setUsernameState('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.from('users').select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
      setUsernameState(data ? 'taken' : 'free');
    }, 450);
    return () => clearTimeout(t);
  }, [username, usernameChanged]);

  const dirty = useMemo(() => (
    displayNameChanged || usernameChanged ||
    bio.trim() !== (profile?.bio || '') ||
    country !== (profile?.country || 'KE') ||
    (websiteReady && website.trim() !== original.website) ||
    !!avatarFile || avatarRemoved || !!coverFile
  ), [displayNameChanged, usernameChanged, bio, country, website, original.website, websiteReady, avatarFile, avatarRemoved, coverFile, profile]);

  const goBack = () => {
    if (dirty && !window.confirm('Discard your changes?')) return;
    navigate(-1);
  };

  const pickImage = async (e, kind) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (f.size > MAX_PICK_MB * 1024 * 1024) { setError(`Image must be under ${MAX_PICK_MB}MB.`); return; }
    setError('');
    // shrink right away: instant preview, tiny upload
    const small = await compressImage(f, kind === 'avatar'
      ? { maxSize: 640, square: true, quality: 0.86 }
      : { maxSize: 1280, square: false, quality: 0.82 });
    const url = URL.createObjectURL(small);
    if (kind === 'avatar') { setAvatarFile(small); setAvatarPreview(url); setAvatarRemoved(false); }
    else { setCoverFile(small); setCoverPreview(url); }
  };

  const removeAvatar = () => { setAvatarFile(null); setAvatarPreview(''); setAvatarRemoved(true); };

  const handleSave = async () => {
    if (saving) return;
    const displayErr = validateDisplayName(displayName);
    if (displayErr) { setError(displayErr); return; }
    const usernameErr = validateUsername(username);
    if (usernameErr) { setError(usernameErr); return; }
    if (usernameChanged && usernameCooldownDays > 0) { setError(`You can change your username again in ${usernameCooldownDays} day${usernameCooldownDays !== 1 ? 's' : ''}.`); return; }
    if (displayNameChanged && displayNameCooldownDays > 0) { setError(`You can change your display name again in ${displayNameCooldownDays} day${displayNameCooldownDays !== 1 ? 's' : ''}.`); return; }
    if (usernameChanged && usernameState === 'taken') { setError('Username already taken.'); return; }
    const site = normaliseWebsite(website);
    if (!validWebsite(site)) { setError('Enter a valid website, e.g. yourname.com'); return; }

    setSaving(true); setError('');
    try {
      const updates = {};
      if (displayNameChanged) updates.display_name = displayName.trim();
      if (usernameChanged) updates.username = username.trim().toLowerCase();
      if (bio.trim() !== (profile?.bio || '')) updates.bio = bio.trim() || null;
      if (country !== (profile?.country || 'KE')) updates.country = country;
      if (websiteReady && (site || '') !== original.website) updates.website = site;

      if (avatarFile) {
        setStage('Uploading photo…');
        updates.avatar_url = await uploadImage(avatarFile, 'avatars');
      } else if (avatarRemoved) {
        updates.avatar_url = null;
      }
      if (coverFile) {
        setStage('Uploading cover…');
        updates.cover_url = await uploadImage(coverFile, 'covers');
      }

      if (Object.keys(updates).length === 0) { navigate('/profile'); return; }

      setStage('Saving…');
      const { error: dbErr } = await supabase.from('users').update(sanitiseUserUpdate(updates)).eq('id', user.id);
      if (dbErr) {
        const msg = dbErr.message || '';
        if (msg.includes('not allowed') || msg.includes('once every') || msg.includes('reserved')) throw new Error(msg.replace(/^.*?:\s*/, ''));
        if (msg.includes('duplicate') || msg.includes('unique')) throw new Error('Username already taken.');
        throw new Error(msg);
      }

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => navigate('/profile'), 700);
    } catch (err) {
      console.error('Profile save failed:', err);
      setError(err.message || 'Save failed. Try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setStage('');
    setSaving(false);
  };

  const inputCls = 'w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 transition-all disabled:opacity-50';
  const labelCls = 'text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5';

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/95 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <button onClick={goBack} aria-label="Back" className="text-[#8E8C88] hover:text-white"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-[15px]">Edit Profile</h1>
        <button onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-1.5 bg-[#FF5A1F] text-white text-sm font-bold px-4 py-2 rounded-full disabled:opacity-40 active:scale-95 transition-all min-w-[70px] justify-center">
          {saving ? <Spinner size={16} /> : success ? <><Check size={14} /> Saved</> : 'Save'}
        </button>
      </div>

      {/* cover */}
      {coverSupported && (
        <div className="relative h-32 bg-white/[0.04] border-b border-white/[0.07]">
          {coverPreview && <img src={coverPreview} alt="" className="w-full h-full object-cover" />}
          <button onClick={() => coverInput.current?.click()}
            className="absolute inset-0 flex items-center justify-center gap-2 text-white/90 text-sm font-semibold bg-black/25 hover:bg-black/35 transition-colors">
            <ImagePlus size={18} /> {coverPreview ? 'Change cover photo' : 'Add cover photo'}
          </button>
          <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, 'cover')} />
        </div>
      )}

      {error && (
        <div className="sticky top-[57px] z-20 mx-4 mt-3 bg-red-500/95 text-white text-[13px] font-semibold rounded-xl px-4 py-3 shadow-xl">{error}</div>
      )}
      <div className="px-4 pt-6 space-y-5">
        {/* avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar url={avatarPreview} name={displayName || 'B'} size={24} />
            <button onClick={() => avatarInput.current?.click()} aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-[#FF5A1F] rounded-full flex items-center justify-center border-2 border-[#0D0C0B] shadow-lg hover:bg-[#d9480f] transition-colors">
              <Camera size={15} color="white" />
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <button onClick={() => avatarInput.current?.click()} className="text-[#FF5A1F] text-sm font-bold">Change photo</button>
            {avatarPreview && (
              <button onClick={removeAvatar} className="text-[#8E8C88] hover:text-red-400 text-sm font-semibold inline-flex items-center gap-1">
                <Trash2 size={13} /> Remove
              </button>
            )}
          </div>
          <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, 'avatar')} />
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Display Name *</label>
            <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Your name" maxLength={40} disabled={displayNameCooldownDays > 0} className={inputCls} />
            {displayNameCooldownDays > 0 && (
              <p className="text-orange-400 text-[11px] mt-1.5 flex items-center gap-1"><Clock size={11} /> Locked for {displayNameCooldownDays} more day{displayNameCooldownDays !== 1 ? 's' : ''}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Username *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] font-bold text-[15px] pointer-events-none">@</span>
              <input type="text" value={username}
                onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(''); }}
                placeholder="username" maxLength={20} disabled={usernameCooldownDays > 0} className={inputCls + ' pl-9 pr-11'} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                {usernameState === 'checking' && <Spinner size={15} className="text-[#8E8C88]" />}
                {usernameState === 'free' && <CheckCircle2 size={18} className="text-[#2ECC71]" />}
                {usernameState === 'taken' && <XCircle size={18} className="text-red-400" />}
              </span>
            </div>
            {usernameCooldownDays > 0 ? (
              <p className="text-orange-400 text-[11px] mt-1.5 flex items-center gap-1"><Clock size={11} /> Locked for {usernameCooldownDays} more day{usernameCooldownDays !== 1 ? 's' : ''} (changes allowed every {NAME_CHANGE_COOLDOWN_DAYS} days)</p>
            ) : usernameState === 'taken' ? (
              <p className="text-red-400 text-[11px] mt-1.5">That username is taken.</p>
            ) : usernameState === 'free' ? (
              <p className="text-[#2ECC71] text-[11px] mt-1.5">Username is available.</p>
            ) : (
              <p className="text-[#8E8C88] text-[11px] mt-1.5">Use a real, recognisable name. Reserved or fake-looking names are blocked.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself…" rows={3} maxLength={160}
              className={inputCls + ' resize-none'} />
            <div className="flex justify-end mt-0.5"><span className={`text-xs ${bio.length > 140 ? 'text-orange-400' : 'text-[#8E8C88]'}`}>{bio.length}/160</span></div>
          </div>

          <div>
            <label className={labelCls}>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls + ' appearance-none'} style={{ WebkitAppearance: 'none' }}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code} style={{ background: '#171614' }}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Website</label>
            <div className="relative">
              <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8C88] pointer-events-none" />
              <input type="text" inputMode="url" autoCapitalize="none" value={website}
                onChange={(e) => { setWebsite(e.target.value); setError(''); }}
                placeholder="yourwebsite.com" maxLength={100} disabled={!websiteReady} className={inputCls + ' pl-11'} />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
            <X size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button onClick={handleSave} disabled={saving || !dirty}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF2D78)', boxShadow: '0 8px 24px rgba(255,90,31,0.3)' }}>
          {saving ? <><Spinner size={18} /> {stage || 'Saving…'}</> : success ? <><Check size={18} /> Saved</> : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
