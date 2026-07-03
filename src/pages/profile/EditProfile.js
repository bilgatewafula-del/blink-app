import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Camera, Check, Clock } from 'lucide-react';
import { validateUsername, validateDisplayName, getNameChangeCooldownRemaining, NAME_CHANGE_COOLDOWN_DAYS } from '../../utils/usernameValidation';

const COUNTRIES = [
  {code:'KE',name:'Kenya 🇰🇪'},{code:'NG',name:'Nigeria 🇳🇬'},{code:'GH',name:'Ghana 🇬🇭'},
  {code:'UG',name:'Uganda 🇺🇬'},{code:'TZ',name:'Tanzania 🇹🇿'},{code:'ZA',name:'South Africa 🇿🇦'},
  {code:'ET',name:'Ethiopia 🇪🇹'},{code:'RW',name:'Rwanda 🇷🇼'},{code:'GB',name:'UK 🇬🇧'},
  {code:'US',name:'USA 🇺🇸'},{code:'CA',name:'Canada 🇨🇦'},{code:'OTHER',name:'Other 🌍'},
];

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username,    setUsername]    = useState(profile?.username     || '');
  const [bio,         setBio]         = useState(profile?.bio          || '');
  const [country,     setCountry]     = useState(profile?.country      || 'KE');
  const [website,     setWebsite]     = useState(profile?.website      || '');
  const [avatarFile,  setAvatarFile]  = useState(null);
  const [avatarPreview,setAvatarPreview]= useState(profile?.avatar_url || '');
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  // Load latest profile data
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setCountry(profile.country || 'KE');
      setWebsite(profile.website || '');
      setAvatarPreview(profile.avatar_url || '');
    }
  }, [profile?.id]);

  const handleAvatarChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    setError('');
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return profile?.avatar_url || null;
    setUploading(true);

    const formData = new FormData();
    formData.append('file',           avatarFile);
    formData.append('upload_preset',  'blink_uploads');
    formData.append('cloud_name',     process.env.REACT_APP_CLOUDINARY_CLOUD_NAME);

    const res  = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method:'POST', body:formData }
    );
    const data = await res.json();
    setUploading(false);

    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  };

  // Cooldown — how many days until name change is allowed again
  const usernameCooldownDays    = getNameChangeCooldownRemaining(profile?.username_changed_at);
  const displayNameCooldownDays = getNameChangeCooldownRemaining(profile?.display_name_changed_at);
  const usernameChanged    = username.trim().toLowerCase()    !== (profile?.username || '').toLowerCase();
  const displayNameChanged = displayName.trim()                !== (profile?.display_name || '');

  const handleSave = async () => {
    const displayErr = validateDisplayName(displayName);
    if (displayErr) { setError(displayErr); return; }

    const usernameErr = validateUsername(username);
    if (usernameErr) { setError(usernameErr); return; }

    // Client-side cooldown check (instant feedback — DB trigger is the real enforcement)
    if (usernameChanged && usernameCooldownDays > 0) {
      setError(`You can change your username again in ${usernameCooldownDays} day${usernameCooldownDays !== 1 ? 's' : ''}.`);
      return;
    }
    if (displayNameChanged && displayNameCooldownDays > 0) {
      setError(`You can change your display name again in ${displayNameCooldownDays} day${displayNameCooldownDays !== 1 ? 's' : ''}.`);
      return;
    }

    setSaving(true); setError('');

    // Check username conflict (not own username)
    if (username.toLowerCase() !== profile?.username?.toLowerCase()) {
      const { data: existing } = await supabase.from('users')
        .select('id').eq('username', username.toLowerCase()).maybeSingle();
      if (existing) { setError('Username already taken.'); setSaving(false); return; }
    }

    try {
      const avatarUrl = await uploadAvatar();

      const updates = {
        display_name: displayName.trim(),
        username:     username.trim().toLowerCase(),
        bio:          bio.trim() || null,
        country,
        website:      website.trim() || null,
        updated_at:   new Date().toISOString(),
      };
      if (avatarUrl) updates.avatar_url = avatarUrl;

      const { error: dbErr } = await supabase.from('users')
        .update(updates).eq('id', user.id);

      if (dbErr) {
        // Surface DB trigger messages (reserved name, cooldown, gibberish) cleanly
        const msg = dbErr.message || '';
        if (msg.includes('not allowed') || msg.includes('once every') || msg.includes('reserved')) {
          throw new Error(msg.replace(/^.*?:\s*/, ''));
        }
        throw new Error(msg);
      }

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => { setSuccess(false); navigate('/profile'); }, 1200);
    } catch (err) {
      setError(err.message || 'Save failed. Try again.');
    }

    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-[15px]">Edit Profile</h1>
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="flex items-center gap-1.5 bg-[#1E6FFF] text-white text-sm font-bold px-4 py-2 rounded-full disabled:opacity-50 active:scale-95 transition-all"
        >
          {saving || uploading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : success
              ? <><Check size={14} /> Saved!</>
              : 'Save'
          }
        </button>
      </div>

      <div className="px-4 pt-6 space-y-5">

        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-white/20" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-black text-3xl border-2 border-white/20">
                {displayName?.[0]?.toUpperCase() || 'B'}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-[#1E6FFF] rounded-full flex items-center justify-center border-2 border-[#0A1628] shadow-lg hover:bg-[#1565cc] transition-colors"
            >
              <Camera size={15} color="white" />
            </button>
          </div>
          <button onClick={() => fileRef.current?.click()} className="text-[#1E6FFF] text-sm font-bold mt-3">
            Change profile photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {/* Display name */}
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Display Name *</label>
            <input type="text" value={displayName} onChange={e => { setDisplayName(e.target.value); setError(''); }}
              placeholder="Your name" maxLength={40}
              disabled={displayNameCooldownDays > 0}
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all disabled:opacity-50" />
            {displayNameCooldownDays > 0 && (
              <p className="text-orange-400 text-[11px] mt-1.5 flex items-center gap-1">
                <Clock size={11} /> Locked for {displayNameCooldownDays} more day{displayNameCooldownDays !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Username */}
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Username *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] font-bold text-[15px] pointer-events-none">@</span>
              <input type="text" value={username}
                onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')); setError(''); }}
                placeholder="username" maxLength={20}
                disabled={usernameCooldownDays > 0}
                className="w-full bg-white/[0.06] border border-white/10 rounded-2xl pl-9 pr-4 py-3.5 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all disabled:opacity-50" />
            </div>
            {usernameCooldownDays > 0 ? (
              <p className="text-orange-400 text-[11px] mt-1.5 flex items-center gap-1">
                <Clock size={11} /> Locked for {usernameCooldownDays} more day{usernameCooldownDays !== 1 ? 's' : ''} (changes allowed every {NAME_CHANGE_COOLDOWN_DAYS} days)
              </p>
            ) : (
              <p className="text-[#6B7280] text-[11px] mt-1.5">Use a real, recognisable name. Reserved or fake-looking names are blocked.</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people about yourself..." rows={3} maxLength={160}
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 resize-none transition-all" />
            <div className="flex justify-end mt-0.5">
              <span className={`text-xs ${bio.length > 140 ? 'text-orange-400' : 'text-[#6B7280]'}`}>{bio.length}/160</span>
            </div>
          </div>

          {/* Country */}
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] focus:outline-none focus:border-[#1E6FFF]/60 appearance-none transition-all"
              style={{ WebkitAppearance:'none' }}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code} style={{ background:'#0d1f3c' }}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Website */}
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Website</label>
            <input type="url" value={website} onChange={e => { setWebsite(e.target.value); setError(''); }}
              placeholder="https://yourwebsite.com" maxLength={100}
              className="w-full bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#6B7280] focus:outline-none focus:border-[#1E6FFF]/60 transition-all" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background:'linear-gradient(135deg,#1E6FFF,#7B2FFF)', boxShadow:'0 8px 24px rgba(30,111,255,0.3)' }}
        >
          {saving || uploading
            ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {uploading ? 'Uploading photo...' : 'Saving...'}</>
            : success ? '✅ Saved successfully!' : 'Save Changes'
          }
        </button>
      </div>
    </div>
  );
}