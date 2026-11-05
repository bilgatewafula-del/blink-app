import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { reAuthAndChangePassword, sanitiseText } from '../../utils/securityUtils';
import {
  ArrowLeft, ChevronRight, ChevronDown, ChevronUp,
  User, Lock, Bell, Eye, Palette, Video,
  Shield, Trash2, Download, LogOut,
  Check, X, Phone, Mail, Key, Heart, MessageCircle, Users, AtSign, CheckCircle2 } from 'lucide-react';

/* ── Reusable toggle ── */
function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-[#FF5A1F]' : 'bg-white/20'} disabled:opacity-50`}
    >
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, value, onPress, rightEl, sub, danger }) {
  return (
    <button
      onClick={onPress}
      className={'w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors text-left ' + (danger ? 'hover:bg-red-500/10' : '')}
    >
      {Icon && (
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-500/15' : 'bg-white/[0.07]'}`}>
          <Icon size={16} className={danger ? 'text-red-400' : 'text-[#8E8C88]'} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-[14px] font-semibold ${danger ? 'text-red-400' : 'text-white/85'}`}>{label}</p>
        {sub && <p className="text-[#8E8C88] text-[11px] mt-0.5">{sub}</p>}
      </div>
      {rightEl || <ChevronRight size={16} className="text-[#8E8C88] flex-shrink-0" />}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-2">
      <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest px-4 pt-4 pb-1.5">{title}</p>
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl mx-4 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/[0.06] mx-4" />;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-white font-bold text-base">{title}</p>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Change password modal (unchanged — already correct) ── */
function ChangePasswordModal({ onClose }) {
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(false);

  const handleSubmit = async () => {
    if (!current)              { setError('Enter your current password first.'); return; }
    if (!next || next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm)      { setError('Passwords do not match.'); return; }
    if (next === current)      { setError('New password must be different from current.'); return; }
    setBusy(true); setError('');
    try {
      await reAuthAndChangePassword(current, next);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message || 'Password change failed.');
    }
    setBusy(false);
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      {done ? (
        <div className="text-center py-8">
          <CheckCircle2 size={40} className="text-[#2ECC71] mx-auto mb-3" />
          <p className="text-white font-bold">Password updated!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[
            { label:'Current Password', val:current, set:setCurrent, ph:'Your current password' },
            { label:'New Password',     val:next,    set:setNext,    ph:'Min 8 characters' },
            { label:'Confirm Password', val:confirm, set:setConfirm, ph:'Re-enter new password' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-white/60 text-[11px] font-bold uppercase block mb-1.5">{f.label}</label>
              <input type="password" value={f.val} onChange={e => { f.set(e.target.value); setError(''); }}
                placeholder={f.ph}
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
            </div>
          ))}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={handleSubmit} disabled={busy}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            style={{ background:'linear-gradient(135deg,#FF5A1F,#FF2D78)' }}>
            {busy ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Updating...</> : 'Update Password'}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ── Change email modal — NOW requires current password first ──
   Report Section 9 groups email changes with password changes under
   "fresh re-authentication required". Previously this called
   auth.updateUser({email}) with no re-auth step at all — a hijacked
   but still-logged-in session (e.g. stolen token, unattended device)
   could redirect account-recovery email to an attacker with no
   additional check. ─────────────────────────────────────────────── */
function ChangeEmailModal({ currentEmail, onClose }) {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [done,  setDone]  = useState(false);

  const handleSubmit = async () => {
    if (!password) { setError('Enter your current password to continue.'); return; }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email.'); return; }
    setBusy(true); setError('');

    // Re-authenticate first, same pattern as reAuthAndChangePassword.
    const { error: reAuthErr } = await supabase.auth.signInWithPassword({
      email: currentEmail, password,
    });
    if (reAuthErr) {
      setBusy(false);
      setError('Current password is incorrect.');
      return;
    }

    const { error: err } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(onClose, 2000);
  };

  return (
    <Modal title="Change Email" onClose={onClose}>
      {done ? (
        <div className="text-center py-8">
          <CheckCircle2 size={40} className="text-[#2ECC71] mx-auto mb-3" />
          <p className="text-white font-bold">Confirmation sent!</p>
          <p className="text-[#8E8C88] text-sm mt-1">Check {email} to confirm the change.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">
            <p className="text-[#8E8C88] text-[11px] font-bold uppercase">Current Email</p>
            <p className="text-white text-[14px] mt-0.5">{currentEmail}</p>
          </div>
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase block mb-1.5">Current Password</label>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Confirm it's you"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
          </div>
          <div>
            <label className="text-white/60 text-[11px] font-bold uppercase block mb-1.5">New Email</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="new@email.com" inputMode="email"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={handleSubmit} disabled={busy}
            className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background:'linear-gradient(135deg,#FF5A1F,#FF2D78)' }}>
            {busy ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : 'Send Confirmation'}
          </button>
        </div>
      )}
    </Modal>
  );
}

function SelectModal({ title, options, value, onSelect, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-1.5">
        {options.map(o => (
          <button key={o.key} onClick={() => { onSelect(o.key); onClose(); }}
            className={'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ' +
              (value === o.key ? 'bg-[#FF5A1F]/15 border-[#FF5A1F]/40 text-white' : 'bg-white/[0.03] border-white/[0.07] text-white/80 hover:bg-white/[0.07]')}>
            <span className="font-semibold text-[14px]">{o.label}</span>
            {value === o.key && <Check size={16} className="text-[#FF5A1F]" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function UserListModal({ title, userIds, onUnblock, onClose }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!userIds?.length) return;
    supabase.from('users').select('id,username,display_name,avatar_url')
      .in('id', userIds).then(({ data }) => setUsers(data || []));
  }, []);
  return (
    <Modal title={title} onClose={onClose}>
      {users.length === 0 ? (
        <div className="text-center py-10">
          <CheckCircle2 size={34} className="text-[#2ECC71] mx-auto mb-2" />
          <p className="text-white/60 text-sm">No one here</p>
        </div>
      ) : users.map(u => (
        <div key={u.id} className="flex items-center gap-3 py-3 border-b border-white/[0.06]">
          {u.avatar_url
            ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold flex-shrink-0">{u.display_name?.[0]?.toUpperCase()}</div>
          }
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[13px]">{u.display_name}</p>
            <p className="text-[#8E8C88] text-[12px]">@{u.username}</p>
          </div>
          <button onClick={() => onUnblock(u.id)} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#FF5A1F]/20 text-[#FF5A1F] border border-[#FF5A1F]/30">
            Remove
          </button>
        </div>
      ))}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════
   MAIN SETTINGS PAGE
═══════════════════════════════════════════════ */
export default function SettingsPage() {
  const navigate          = useNavigate();
  const { user, profile, refreshProfile, signOut } = useAuth();

  const [settings, setSettings] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');

  const [showPassword,  setShowPassword]  = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const [showModal,     setShowModal]     = useState(null);
  const [showBlocked,   setShowBlocked]   = useState(false);
  const [showMuted,     setShowMuted]     = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    const { data } = await supabase.from('user_settings')
      .select('*').eq('user_id', user.id).maybeSingle();
    if (data) setSettings(data);
    else {
      const { data: created } = await supabase.from('user_settings')
        .insert({ user_id: user.id }).select().single();
      if (created) setSettings(created);
    }
    setLoading(false);
  };

  const updateSetting = async (key, value) => {
    setSettings(s => ({ ...s, [key]: value }));
    setSaving(true);
    await supabase.from('user_settings').update({ [key]: value, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    setSaving(false);
    showToast('Saved');
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  /* F7-equivalent for self-service: is_restricted is a privileged
     column now guarded by a DB trigger (enforce_profile_update_
     allowlist). A direct client update() here would fail after the
     hardening migration — self_deactivate_account() is the only
     remaining path, and it re-derives the target from auth.uid()
     server-side, so there's no target_id to tamper with either. */
  const handleDeactivate = async () => {
    if (!window.confirm('Deactivate your account? You can reactivate by logging in again.')) return;
    const { error } = await supabase.rpc('self_deactivate_account');
    if (error) { showToast('Deactivation failed: ' + error.message); return; }
    showToast('Account deactivated');
    setTimeout(() => signOut(), 1500);
  };

  /* Same rationale — replaces the 9-step client-side delete chain
     with one transactional server-side RPC (self_delete_account). */
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('PERMANENTLY DELETE your account?\n\nThis will erase ALL your data forever. This cannot be undone.');
    if (!confirmed) return;
    const final = window.prompt('Type DELETE to confirm account deletion:');
    if (final !== 'DELETE') { showToast('Deletion cancelled'); return; }

    const { error } = await supabase.rpc('self_delete_account');
    if (error) { showToast('Deletion failed: ' + error.message); return; }

    // The Auth identity (auth.users row) still needs removing via a
    // server endpoint using service_role — call that here if you have
    // one, e.g.: await fetch('/api/delete-auth-identity', { method: 'POST' });
    await supabase.auth.signOut();
  };

  const handleDownloadData = () => {
    const data = {
      profile: { username: profile?.username, display_name: profile?.display_name, email: user?.email, created_at: profile?.created_at },
      settings,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'blink-data.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('Data downloaded');
  };

  const handleUnblockUser = async (uid) => {
    const updated = (settings?.blocked_users || []).filter(id => id !== uid);
    await updateSetting('blocked_users', updated);
    const ls = JSON.parse(localStorage.getItem('blink_blocked_users') || '[]');
    localStorage.setItem('blink_blocked_users', JSON.stringify(ls.filter(id => id !== uid)));
  };

  const handleUnmuteUser = async (uid) => {
    const updated = (settings?.muted_users || []).filter(id => id !== uid);
    await updateSetting('muted_users', updated);
    const ls = JSON.parse(localStorage.getItem('blink_muted_users') || '[]');
    localStorage.setItem('blink_muted_users', JSON.stringify(ls.filter(id => id !== uid)));
  };

  const SelectModals = {
    who_can_message: {
      title: 'Who can message you',
      options: [{ key:'everyone', label:'Everyone' }, { key:'followers', label:'Followers only' }, { key:'nobody', label:'Nobody' }],
    },
    who_can_comment: {
      title: 'Who can comment on your posts',
      options: [{ key:'everyone', label:'Everyone' }, { key:'followers', label:'Followers only' }, { key:'nobody', label:'Nobody' }],
    },
    who_can_follow: {
      title: 'Who can follow you',
      options: [{ key:'everyone', label:'Everyone' }, { key:'nobody', label:'Nobody (private account)' }],
    },
    font_size: {
      title: 'Font Size',
      options: [{ key:'small', label:'Small' }, { key:'medium', label:'Medium (default)' }, { key:'large', label:'Large' }],
    },
    language: {
      title: 'Language',
      options: [{ key:'en', label:'English' }, { key:'sw', label:'Swahili' }, { key:'fr', label:'French' }],
    },
    video_quality: {
      title: 'Video Quality',
      options: [{ key:'auto', label:'Auto' }, { key:'high', label:'High (HD)' }, { key:'medium', label:'Medium' }, { key:'low', label:'Low (saves data)' }],
    },
    image_quality: {
      title: 'Image Upload Quality',
      options: [{ key:'high', label:'High (best quality)' }, { key:'medium', label:'Medium' }, { key:'low', label:'Low (saves storage)' }],
    },
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0D0C0B] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const labelMap = { everyone:'Everyone', followers:'Followers only', nobody:'Nobody', auto:'Auto', high:'High', medium:'Medium', low:'Low', small:'Small', large:'Large', en:'English', sw:'Swahili', fr:'French' };

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
      {showEmail && <ChangeEmailModal currentEmail={user?.email} onClose={() => setShowEmail(false)} />}
      {showModal && SelectModals[showModal] && (
        <SelectModal
          title={SelectModals[showModal].title}
          options={SelectModals[showModal].options}
          value={settings?.[showModal]}
          onSelect={v => updateSetting(showModal, v)}
          onClose={() => setShowModal(null)}
        />
      )}
      {showBlocked && (
        <UserListModal title="Blocked Users" userIds={settings?.blocked_users || []}
          onUnblock={handleUnblockUser} onClose={() => setShowBlocked(false)} />
      )}
      {showMuted && (
        <UserListModal title="Muted Users" userIds={settings?.muted_users || []}
          onUnblock={handleUnmuteUser} onClose={() => setShowMuted(false)} />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-white/15 backdrop-blur border border-white/20 rounded-full px-5 py-2.5 pointer-events-none">
          <p className="text-white text-sm font-semibold whitespace-nowrap">{toast}</p>
        </div>
      )}

      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-[15px] flex-1">Settings</h1>
        {saving && <div className="w-4 h-4 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />}
      </div>

      <div className="mx-4 mt-4 mb-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-3">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">{profile?.display_name?.[0]?.toUpperCase()}</div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[15px] truncate">{profile?.display_name}</p>
          <p className="text-[#8E8C88] text-[12px]">@{profile?.username}</p>
        </div>
        <button onClick={() => navigate('/edit-profile')}
          className="px-3 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-white text-xs font-bold transition-colors">
          Edit
        </button>
      </div>

      <Section title="Account">
        <SettingRow icon={User}  label="Edit Profile"    sub="Name, bio, avatar, country" onPress={() => navigate('/edit-profile')} />
        <Divider />
        <SettingRow icon={Mail}  label="Email Address"   sub={user?.email} onPress={() => setShowEmail(true)} />
        <Divider />
        <SettingRow icon={Phone} label="Phone Number"    sub={profile?.phone_number || 'Not set'} onPress={() => navigate('/edit-profile')} />
        <Divider />
        <SettingRow icon={Key}   label="Change Password" onPress={() => setShowPassword(true)} />
      </Section>

      <Section title="Privacy">
        <SettingRow icon={Lock} label="Private Account"
          sub="Only approved followers see your posts"
          rightEl={<Toggle value={settings?.is_private || false} onChange={v => updateSetting('is_private', v)} />}
          onPress={() => updateSetting('is_private', !settings?.is_private)}
        />
        <Divider />
        <SettingRow icon={Eye} label="Who can message you"
          sub={labelMap[settings?.who_can_message] || 'Everyone'}
          onPress={() => setShowModal('who_can_message')} />
        <Divider />
        <SettingRow icon={Eye} label="Who can comment"
          sub={labelMap[settings?.who_can_comment] || 'Everyone'}
          onPress={() => setShowModal('who_can_comment')} />
        <Divider />
        <SettingRow icon={Eye} label="Who can follow you"
          sub={labelMap[settings?.who_can_follow] || 'Everyone'}
          onPress={() => setShowModal('who_can_follow')} />
        <Divider />
        <SettingRow icon={X} label="Blocked Users"
          sub={`${settings?.blocked_users?.length || 0} blocked`}
          onPress={() => setShowBlocked(true)} />
        <Divider />
        <SettingRow icon={X} label="Muted Users"
          sub={`${settings?.muted_users?.length || 0} muted`}
          onPress={() => setShowMuted(true)} />
      </Section>

      <Section title="Notifications">
        {[
          { key:'notif_likes',     label:'Likes',                Icon:Heart },
          { key:'notif_comments',  label:'Comments',             Icon:MessageCircle },
          { key:'notif_followers', label:'New Followers',        Icon:Users },
          { key:'notif_messages',  label:'Messages',             Icon:Mail },
          { key:'notif_mentions',  label:'Mentions',             Icon:AtSign },
          { key:'notif_system',    label:'System Notifications', Icon:Bell },
        ].map((n, i, arr) => (
          <div key={n.key}>
            <SettingRow
              label={n.label}
              icon={n.Icon}
              rightEl={<Toggle value={settings?.[n.key] ?? true} onChange={v => updateSetting(n.key, v)} />}
              onPress={() => updateSetting(n.key, !(settings?.[n.key] ?? true))}
            />
            {i < arr.length - 1 && <Divider />}
          </div>
        ))}
      </Section>

      <Section title="Appearance">
        <SettingRow icon={Palette} label="Theme"
          sub={settings?.theme === 'dark' ? 'Dark' : settings?.theme === 'light' ? 'Light' : 'System'}
          onPress={() => {
            const next = settings?.theme === 'dark' ? 'light' : settings?.theme === 'light' ? 'system' : 'dark';
            updateSetting('theme', next);
          }} />
        <Divider />
        <SettingRow icon={Palette} label="Font Size"
          sub={labelMap[settings?.font_size] || 'Medium'}
          onPress={() => setShowModal('font_size')} />
        <Divider />
        <SettingRow icon={Palette} label="Language"
          sub={labelMap[settings?.language] || 'English'}
          onPress={() => setShowModal('language')} />
      </Section>

      <Section title="Media Settings">
        <SettingRow icon={Video} label="Auto-play Videos"
          sub="Videos play automatically in feed"
          rightEl={<Toggle value={settings?.autoplay_videos ?? true} onChange={v => updateSetting('autoplay_videos', v)} />}
          onPress={() => updateSetting('autoplay_videos', !settings?.autoplay_videos)} />
        <Divider />
        <SettingRow icon={Video} label="Video Quality"
          sub={labelMap[settings?.video_quality] || 'Auto'}
          onPress={() => setShowModal('video_quality')} />
        <Divider />
        <SettingRow icon={Video} label="Image Upload Quality"
          sub={labelMap[settings?.image_quality] || 'High'}
          onPress={() => setShowModal('image_quality')} />
        <Divider />
        <SettingRow icon={Video} label="Data Saver Mode"
          sub="Reduces image/video quality to save data"
          rightEl={<Toggle value={settings?.data_saver || false} onChange={v => updateSetting('data_saver', v)} />}
          onPress={() => updateSetting('data_saver', !settings?.data_saver)} />
      </Section>

      <Section title="Security">
        <SettingRow icon={Shield} label="Active Sessions"
          sub="Manage devices logged into your account"
          onPress={() => showToast('Session management coming soon')} />
        <Divider />
        <SettingRow icon={Shield} label="Login History"
          sub="See recent login activity"
          onPress={() => showToast('Login history coming soon')} />
        <Divider />
        <SettingRow icon={Shield} label="Two-Factor Authentication"
          sub="Extra security for your account"
          onPress={() => showToast('2FA coming soon')} />
      </Section>

      <Section title="Account Actions">
        <SettingRow icon={Download} label="Download My Data"
          sub="Export your profile and settings as JSON"
          onPress={handleDownloadData} />
        <Divider />
        <SettingRow icon={LogOut} label="Deactivate Account"
          sub="Temporarily disable your account"
          onPress={handleDeactivate} danger />
        <Divider />
        <SettingRow icon={Trash2} label="Delete Account"
          sub="Permanently delete all data — cannot be undone"
          onPress={handleDeleteAccount} danger />
      </Section>

      <div className="mx-4 mt-3 mb-6">
        <button onClick={() => signOut()}
          className="w-full py-3.5 rounded-2xl font-bold text-red-400 border border-red-500/25 bg-red-500/[0.07] hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2">
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <p className="text-white/20 text-[11px] text-center pb-6">B-Link v2.0.0 · Made for Africa</p>
    </div>
  );
}