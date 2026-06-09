import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { ArrowLeft, Camera } from 'lucide-react';
import { COUNTRIES } from '../../utils/constants';

const EditProfile = () => {
  const { profile, fetchProfile, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    display_name: profile?.display_name || '',
    username: profile?.username || '',
    bio: profile?.bio || '',
    website: profile?.website || '',
    country: profile?.country || 'KE',
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'profiles');
      await supabase.from('users').update({ avatar_url: url }).eq('id', user.id);
      await fetchProfile(user.id);
      setSuccess('Avatar updated!');
    } catch (err) {
      setError('Failed to upload avatar.');
    }
    setUploading(false);
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'profiles');
      await supabase.from('users').update({ cover_url: url }).eq('id', user.id);
      await fetchProfile(user.id);
      setSuccess('Cover updated!');
    } catch (err) {
      setError('Failed to upload cover.');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    const { error } = await supabase
      .from('users')
      .update({
        display_name: form.display_name,
        username: form.username.toLowerCase(),
        bio: form.bio,
        website: form.website,
        country: form.country,
      })
      .eq('id', user.id);

    if (error) {
      setError(error.message);
    } else {
      await fetchProfile(user.id);
      setSuccess('Profile updated successfully!');
      setTimeout(() => navigate('/profile'), 1000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#0A1628]/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/profile')} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Edit Profile</h1>
        <button
          onClick={handleSave}
          disabled={loading}
          className="text-[#1E6FFF] font-semibold text-sm disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Cover photo */}
      <div className="relative">
        <div className="h-32 bg-gradient-to-br from-[#1E6FFF]/40 via-[#7B2FFF]/30 to-[#00D4C8]/20">
          {profile?.cover_url && (
            <img src={profile.cover_url} alt="cover" className="w-full h-full object-cover" />
          )}
          <label className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer">
            <div className="bg-black/50 rounded-full p-2">
              <Camera size={20} className="text-white" />
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          </label>
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-12 left-4">
          <div className="relative">
            <div className="p-1 bg-[#0A1628] rounded-full">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-[#1E6FFF]" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl border-2 border-[#1E6FFF]">
                  {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                </div>
              )}
            </div>
            <label className="absolute bottom-1 right-1 bg-[#1E6FFF] rounded-full p-1.5 cursor-pointer">
              <Camera size={12} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="mt-16 px-4 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}
        {uploading && (
          <div className="bg-[#1E6FFF]/10 border border-[#1E6FFF]/30 rounded-xl p-3">
            <p className="text-[#1E6FFF] text-sm">Uploading image...</p>
          </div>
        )}

        {[
          { label: 'Display Name', name: 'display_name', placeholder: 'Your full name' },
          { label: 'Username', name: 'username', placeholder: 'yourhandle' },
          { label: 'Website', name: 'website', placeholder: 'https://yoursite.com' },
        ].map(({ label, name, placeholder }) => (
          <div key={name}>
            <label className="text-white/70 text-xs mb-1 block">{label}</label>
            <input
              type="text"
              name={name}
              value={form[name]}
              onChange={handleChange}
              placeholder={placeholder}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
            />
          </div>
        ))}

        {/* Bio */}
        <div>
          <label className="text-white/70 text-xs mb-1 block">Bio</label>
          <textarea
            name="bio"
            value={form.bio}
            onChange={handleChange}
            placeholder="Tell the world about yourself..."
            rows={3}
            maxLength={150}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors resize-none"
          />
          <p className="text-[#6B7280] text-xs text-right mt-1">{form.bio.length}/150</p>
        </div>

        {/* Country */}
        <div>
          <label className="text-white/70 text-xs mb-1 block">Country</label>
          <select
            name="country"
            value={form.country}
            onChange={handleChange}
            className="w-full bg-[#0A1628] border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#1E6FFF] transition-colors"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;