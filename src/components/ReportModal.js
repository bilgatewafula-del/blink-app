import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { X, Flag } from 'lucide-react';

const REASONS = [
  'Spam', 'Harassment', 'Fake Account',
  'Violence', 'Misinformation', 'Sexual Content',
  'Hate Speech', 'Other',
];

export default function ReportModal({ target, onClose, userId }) {
  const [reason, setReason]   = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    await supabase.from('reports').insert({
      reporter_id: userId,
      target_type: target.type,
      target_id:   target.id,
      reason,
      details: details.trim() || null,
      status: 'pending',
    });
    setDone(true);
    setSubmitting(false);
    setTimeout(onClose, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full max-w-[620px] mx-auto bg-[#171614] border-t border-white/15 rounded-t-3xl p-5"
        style={{ animation: 'slideUp 0.25s ease-out' }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4" />

        {done ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-white font-bold text-lg">Report submitted</p>
            <p className="text-[#8E8C88] text-sm mt-1">Our team will review this anonymously. Thank you for helping keep B-Link safe.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Flag size={18} className="text-red-400" />
                Report {target.type}
              </h3>
              <button onClick={onClose} className="text-[#8E8C88] hover:text-white"><X size={20} /></button>
            </div>

            <p className="text-[#8E8C88] text-sm mb-3">Why are you reporting this {target.type}?</p>

            <div className="space-y-2 mb-4">
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)}
                  className={'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ' +
                    (reason === r ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/8')}>
                  {r}
                </button>
              ))}
            </div>

            {reason === 'Other' && (
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Please describe the issue..."
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-[#8E8C88] text-sm focus:outline-none focus:border-red-500/50 resize-none mb-4"
                rows={3}
              />
            )}

            <button onClick={handleSubmit} disabled={!reason || submitting}
              className="w-full py-3.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-2xl transition-colors">
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>

            <p className="text-center text-[#8E8C88] text-xs mt-3">
              Reports are anonymous and reviewed by our moderation team.
            </p>
          </>
        )}
      </div>
    </div>
  );
}