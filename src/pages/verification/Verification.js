import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, BadgeCheck, Upload, CheckCircle, Clock, XCircle } from 'lucide-react';
import { uploadToCloudinary } from '../../lib/cloudinary';
import { goBack } from '../../lib/nav';

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
    { type: 'personal', icon: '✓', color: 'bg-[#7C3AED]', label: 'Personal', price: 'KES 200/mo', desc: 'For public figures, creators and individuals' },
    { type: 'business', icon: '✓', color: 'bg-[#FFD700]', label: 'Business', price: 'KES 500/mo', desc: 'For brands, companies and organizations' },
    { type: 'creator', icon: '✓', color: 'bg-[#7C3AED]', label: 'Creator', price: 'Free', desc: 'For verified content creators with 1K+ followers' },
  ];

  if (profile?.is_verified) {
    return (
      <div className="min-h-screen bg-[#F1F3F9] pb-24">
        <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-4">
          <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-white font-bold text-lg">Verification</h1>
        </div>
        <div className="flex flex-col items-center justify-center mt-20 px-6 gap-4">
          <div className="w-20 h-20 bg-[#7C3AED]/20 rounded-full flex items-center justify-center">
            <BadgeCheck size={40} className="text-[#6D28D9]" />
          </div>
          <h2 className="text-[#111827] font-bold text-2xl">You're Verified!</h2>
          <p className="text-[#64748B] text-sm text-center">
            Your account has the verified badge. It appears next to your name across B-Link.
          </p>
          <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/30 rounded-2xl p-4 w-full">
            <p className="text-[#111827] font-semibold text-sm">✓ Verified Account Benefits</p>
            <div className="mt-3 space-y-2 text-xs text-[#64748B]">
              <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> Verified badge on your profile</p>
              <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> Priority in search results</p>
              <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> Access to creator analytics</p>
              <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> Eligible for sponsored content</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F1F3F9] pb-24">
        <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-4">
          <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-white font-bold text-lg">Verification</h1>
        </div>
        <div className="flex flex-col items-center justify-center mt-20 px-6 gap-4">
          <div className="w-20 h-20 bg-[#FFD700]/20 rounded-full flex items-center justify-center">
            <Clock size={40} className="text-[#B45309]" />
          </div>
          <h2 className="text-[#111827] font-bold text-2xl">Under Review</h2>
          <p className="text-[#64748B] text-sm text-center">
            Your verification request has been submitted. Our team will review it within 3-5 business days.
          </p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 w-full space-y-3">
            {[
              { label: 'Request submitted', done: true },
              { label: 'Document review', done: false },
              { label: 'Identity verification', done: false },
              { label: 'Badge granted', done: false },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle size={18} className="text-[#10B981]" />
                ) : (
                  <div className="w-4.5 h-4.5 rounded-full border-2 border-[#E2E8F0]" />
                )}
                <p className={'text-sm ' + (step.done ? 'text-[#111827] font-semibold' : 'text-[#64748B]')}>
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
    <div className="min-h-screen bg-[#F1F3F9] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-4">
        <button onClick={() => goBack(navigate, '/')} className="text-[#CBD5E1] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Apply for Verification</h1>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-4 mt-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={'flex-1 h-1.5 rounded-full transition-all ' + (s <= step ? 'bg-[#7C3AED]' : 'bg-[#F1F5F9]')}
          />
        ))}
      </div>
      <p className="text-[#64748B] text-xs px-4 mt-2">Step {step} of 3</p>

      <div className="px-4 mt-4">
        {/* Step 1 — Badge type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[#111827] font-bold text-xl mb-1">Choose badge type</h2>
              <p className="text-[#64748B] text-sm">Select the verification type that fits you.</p>
            </div>
            <div className="space-y-3">
              {badges.map((b) => (
                <button
                  key={b.type}
                  onClick={() => setBadgeType(b.type)}
                  className={
                    'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ' +
                    (badgeType === b.type
                      ? 'border-[#7C3AED] bg-[#7C3AED]/10'
                      : 'border-[#E2E8F0] bg-[#F8FAFC]')
                  }
                >
                  <div className={'w-10 h-10 rounded-full ' + b.color + ' flex items-center justify-center text-[#111827] font-bold text-lg flex-shrink-0'}>
                    {b.icon}
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-[#111827] font-bold text-sm">{b.label} — {b.price}</p>
                    <p className="text-[#64748B] text-xs mt-0.5">{b.desc}</p>
                  </div>
                  {badgeType === b.type && (
                    <CheckCircle size={20} className="text-[#6D28D9] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-[#7C3AED] text-white font-bold py-3.5 rounded-xl"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — ID upload */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[#111827] font-bold text-xl mb-1">Verify your identity</h2>
              <p className="text-[#64748B] text-sm">Upload a government-issued ID document.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="text-[#64748B] text-xs mb-2 block">ID Type</label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-3 px-4 text-[#111827] text-sm focus:outline-none focus:border-[#7C3AED]"
              >
                <option value="national_id" className="bg-white">National ID</option>
                <option value="passport" className="bg-white">Passport</option>
                <option value="driving_license" className="bg-white">Driving License</option>
              </select>
            </div>

            <div>
              <label className="text-[#64748B] text-xs mb-2 block">ID Number</label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Enter your ID number"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-3 px-4 text-[#111827] placeholder-[#94A3B8] text-sm focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            {[
              { label: 'Front of ID', state: idFront, setter: setIdFront, key: 'front' },
              { label: 'Back of ID', state: idBack, setter: setIdBack, key: 'back' },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-[#64748B] text-xs mb-2 block">{f.label}</label>
                <label className={'w-full flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ' + (f.state ? 'border-[#10B981] bg-[#10B981]/10' : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#7C3AED]')}>
                  {f.state ? (
                    <>
                      <CheckCircle size={24} className="text-[#10B981]" />
                      <p className="text-[#10B981] text-sm font-semibold">Uploaded ✓</p>
                    </>
                  ) : (
                    <>
                      <Upload size={24} className="text-[#64748B]" />
                      <p className="text-[#64748B] text-sm">Tap to upload {f.label}</p>
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
              <p className="text-[#B45309] text-xs font-semibold">Privacy note</p>
              <p className="text-[#64748B] text-xs mt-1">
                Your ID is stored privately and only reviewed by B-Link verification staff. It is never shared or sold.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] text-[#111827] font-bold py-3 rounded-xl"
              >
                ← Back
              </button>
              <button
                onClick={() => { setError(''); setStep(3); }}
                disabled={uploading}
                className="flex-1 bg-[#7C3AED] text-white font-bold py-3 rounded-xl disabled:opacity-50"
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
              <h2 className="text-[#111827] font-bold text-xl mb-1">Review and submit</h2>
              <p className="text-[#64748B] text-sm">Confirm your details before submitting.</p>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
              {[
                { label: 'Badge Type', value: badgeType.charAt(0).toUpperCase() + badgeType.slice(1) },
                { label: 'ID Type', value: idType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) },
                { label: 'ID Number', value: idNumber || 'Not provided' },
                { label: 'ID Front', value: idFront ? 'Uploaded' : 'Missing' },
                { label: 'ID Back', value: idBack ? 'Uploaded' : 'Optional' },
                { label: 'Account', value: '@' + profile?.username },
              ].map((item, idx, arr) => (
                <div
                  key={item.label}
                  className={'flex items-center justify-between px-4 py-3 ' + (idx < arr.length - 1 ? 'border-b border-[#E2E8F0]' : '')}
                >
                  <p className="text-[#64748B] text-sm">{item.label}</p>
                  <p className="text-[#111827] text-sm font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
              <p className="text-[#111827] font-semibold text-sm mb-2">By submitting you agree:</p>
              <div className="space-y-1.5 text-xs text-[#64748B]">
                <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> All information provided is accurate</p>
                <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> You own this account and identity</p>
                <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> B-Link may reject applications that don't meet criteria</p>
                <p className="flex items-center gap-2"><CheckCircle size={14} className="text-[#10B981] flex-shrink-0" /> Monthly subscription applies for personal/business badges</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] text-[#111827] font-bold py-3 rounded-xl"
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-[#7C3AED] text-white font-bold py-3 rounded-xl disabled:opacity-50"
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