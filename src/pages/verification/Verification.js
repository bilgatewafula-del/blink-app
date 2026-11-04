import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, BadgeCheck, Upload, CheckCircle, Clock, XCircle } from 'lucide-react';
import { uploadToCloudinary } from '../../lib/cloudinary';

const Verification = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [idType, setIdType] = useState('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [badgeType, setBadgeType] = useState('personal');

  const handleFileUpload = async (file, setter) => {
    setUploading(true);
    const url = await uploadToCloudinary(file, 'verification');
    setter(url);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!idNumber) { setError('Enter your ID number.'); return; }
    if (!idFront) { setError('Upload front of your ID.'); return; }
    setSubmitting(true);

    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'verification',
      message: 'Your verification request has been submitted. We will review it within 3-5 business days.',
      is_read: false,
    });

    setSubmitted(true);
    setSubmitting(false);
  };

  const badges = [
    { type: 'personal', icon: '✓', color: 'bg-[#FF5A1F]', label: 'Personal', price: 'KES 200/mo', desc: 'For public figures, creators and individuals' },
    { type: 'business', icon: '✓', color: 'bg-[#FFD700]', label: 'Business', price: 'KES 500/mo', desc: 'For brands, companies and organizations' },
    { type: 'creator', icon: '✓', color: 'bg-[#FF2D78]', label: 'Creator', price: 'Free', desc: 'For verified content creators with 1K+ followers' },
  ];

  if (profile?.is_verified) {
    return (
      <div className="min-h-screen bg-[#0D0C0B] pb-24">
        <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-white font-bold text-lg">Verification</h1>
        </div>
        <div className="flex flex-col items-center justify-center mt-20 px-6 gap-4">
          <div className="w-20 h-20 bg-[#FF5A1F]/20 rounded-full flex items-center justify-center">
            <BadgeCheck size={40} className="text-[#FF5A1F]" />
          </div>
          <h2 className="text-white font-bold text-2xl">You're Verified!</h2>
          <p className="text-[#8E8C88] text-sm text-center">
            Your account has the verified badge. It appears next to your name across B-Link.
          </p>
          <div className="bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 rounded-2xl p-4 w-full">
            <p className="text-white font-semibold text-sm">✓ Verified Account Benefits</p>
            <div className="mt-3 space-y-2 text-xs text-[#8E8C88]">
              <p>✅ Verified badge on your profile</p>
              <p>✅ Priority in search results</p>
              <p>✅ Access to creator analytics</p>
              <p>✅ Eligible for sponsored content</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0D0C0B] pb-24">
        <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-white font-bold text-lg">Verification</h1>
        </div>
        <div className="flex flex-col items-center justify-center mt-20 px-6 gap-4">
          <div className="w-20 h-20 bg-[#FFD700]/20 rounded-full flex items-center justify-center">
            <Clock size={40} className="text-[#FFD700]" />
          </div>
          <h2 className="text-white font-bold text-2xl">Under Review</h2>
          <p className="text-[#8E8C88] text-sm text-center">
            Your verification request has been submitted. Our team will review it within 3-5 business days.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 w-full space-y-3">
            {[
              { label: 'Request submitted', done: true },
              { label: 'Document review', done: false },
              { label: 'Identity verification', done: false },
              { label: 'Badge granted', done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle size={18} className="text-[#2ECC71]" />
                ) : (
                  <div className="w-4.5 h-4.5 rounded-full border-2 border-white/20" />
                )}
                <p className={'text-sm ' + (step.done ? 'text-white font-semibold' : 'text-[#8E8C88]')}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">
      <div className="sticky top-0 z-20 bg-[#0D0C0B] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Apply for Verification</h1>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-4 mt-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={'flex-1 h-1.5 rounded-full transition-all ' + (s <= step ? 'bg-[#FF5A1F]' : 'bg-white/10')}
          />
        ))}
      </div>
      <p className="text-[#8E8C88] text-xs px-4 mt-2">Step {step} of 3</p>

      <div className="px-4 mt-4">
        {/* Step 1 — Badge type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-bold text-xl mb-1">Choose badge type</h2>
              <p className="text-[#8E8C88] text-sm">Select the verification type that fits you.</p>
            </div>
            <div className="space-y-3">
              {badges.map((b) => (
                <button
                  key={b.type}
                  onClick={() => setBadgeType(b.type)}
                  className={
                    'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ' +
                    (badgeType === b.type
                      ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                      : 'border-white/10 bg-white/5')
                  }
                >
                  <div className={'w-10 h-10 rounded-full ' + b.color + ' flex items-center justify-center text-white font-bold text-lg flex-shrink-0'}>
                    {b.icon}
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-white font-bold text-sm">{b.label} — {b.price}</p>
                    <p className="text-[#8E8C88] text-xs mt-0.5">{b.desc}</p>
                  </div>
                  {badgeType === b.type && (
                    <CheckCircle size={20} className="text-[#FF5A1F] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold py-3.5 rounded-xl"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — ID upload */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-bold text-xl mb-1">Verify your identity</h2>
              <p className="text-[#8E8C88] text-sm">Upload a government-issued ID document.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="text-[#8E8C88] text-xs mb-2 block">ID Type</label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-[#FF5A1F]"
              >
                <option value="national_id" className="bg-[#0D0C0B]">National ID</option>
                <option value="passport" className="bg-[#0D0C0B]">Passport</option>
                <option value="driving_license" className="bg-[#0D0C0B]">Driving License</option>
              </select>
            </div>

            <div>
              <label className="text-[#8E8C88] text-xs mb-2 block">ID Number</label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Enter your ID number"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-[#FF5A1F]"
              />
            </div>

            {[
              { label: 'Front of ID', state: idFront, setter: setIdFront, key: 'front' },
              { label: 'Back of ID', state: idBack, setter: setIdBack, key: 'back' },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-[#8E8C88] text-xs mb-2 block">{f.label}</label>
                <label className={'w-full flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ' + (f.state ? 'border-[#2ECC71] bg-[#2ECC71]/10' : 'border-white/20 bg-white/5 hover:border-[#FF5A1F]')}>
                  {f.state ? (
                    <>
                      <CheckCircle size={24} className="text-[#2ECC71]" />
                      <p className="text-[#2ECC71] text-sm font-semibold">Uploaded ✓</p>
                    </>
                  ) : (
                    <>
                      <Upload size={24} className="text-[#8E8C88]" />
                      <p className="text-[#8E8C88] text-sm">Tap to upload {f.label}</p>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0], f.setter)}
                  />
                </label>
              </div>
            ))}

            <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl p-3">
              <p className="text-[#FFD700] text-xs font-semibold">🔒 Privacy Note</p>
              <p className="text-white/60 text-xs mt-1">
                Your ID is uploaded to a private Cloudinary folder and only accessed by B-Link verification staff. It is never shared or sold.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl"
              >
                ← Back
              </button>
              <button
                onClick={() => { setError(''); setStep(3); }}
                disabled={uploading}
                className="flex-1 bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Review and submit */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-white font-bold text-xl mb-1">Review and submit</h2>
              <p className="text-[#8E8C88] text-sm">Confirm your details before submitting.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {[
                { label: 'Badge Type', value: badgeType.charAt(0).toUpperCase() + badgeType.slice(1) },
                { label: 'ID Type', value: idType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) },
                { label: 'ID Number', value: idNumber || 'Not provided' },
                { label: 'ID Front', value: idFront ? '✅ Uploaded' : '❌ Missing' },
                { label: 'ID Back', value: idBack ? '✅ Uploaded' : 'Optional' },
                { label: 'Account', value: '@' + profile?.username },
              ].map((item, idx, arr) => (
                <div
                  key={item.label}
                  className={'flex items-center justify-between px-4 py-3 ' + (idx < arr.length - 1 ? 'border-b border-white/5' : '')}
                >
                  <p className="text-[#8E8C88] text-sm">{item.label}</p>
                  <p className="text-white text-sm font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-white font-semibold text-sm mb-2">By submitting you agree:</p>
              <div className="space-y-1.5 text-xs text-[#8E8C88]">
                <p>✅ All information provided is accurate</p>
                <p>✅ You own this account and identity</p>
                <p>✅ B-Link may reject applications that don't meet criteria</p>
                <p>✅ Monthly subscription applies for personal/business badges</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl"
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Verification;