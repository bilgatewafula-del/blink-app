import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePushStatus, promptSnoozed, snoozePrompt } from '../lib/push';

const FAIL = {
  denied: 'Notifications are blocked. Allow them in your browser or phone settings.',
  error: "Couldn't turn on notifications. Try again.",
  no_sw: 'Reload the app and try again.',
};

// Gentle one-time ask shown on the Notifications page.
export default function PushPrompt() {
  const { user } = useAuth();
  const push = usePushStatus(user?.id);
  const [hidden, setHidden] = useState(promptSnoozed());
  const [msg, setMsg] = useState('');

  const canAsk = push.supported && push.configured && !push.needsInstall && push.permission === 'default' && !push.enabled;
  if (!canAsk || hidden) return null;

  const turnOn = async () => {
    const r = await push.enable();
    if (r.ok) setHidden(true);
    else setMsg(FAIL[r.reason] || FAIL.error);
  };
  const later = () => { snoozePrompt(7); setHidden(true); };

  return (
    <div className="relative rounded-2xl p-4 text-white shadow-[0_6px_20px_rgba(37,99,235,0.28)]"
      style={{ background: 'linear-gradient(135deg,#0284C7 0%,#4F46E5 100%)' }}>
      <button onClick={later} aria-label="Not now" className="absolute top-2.5 right-2.5 text-white/70 p-1"><X size={16} /></button>
      <div className="flex items-start gap-3 pr-5">
        <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0"><Bell size={20} /></span>
        <div className="min-w-0">
          <p className="font-bold text-[15px] leading-tight">Never miss a vibe</p>
          <p className="text-white/85 text-[13px] mt-0.5">Get alerts for messages, replies, mentions and new followers, even when B-Link is closed.</p>
          {msg && <p className="text-[#FDE68A] text-[12px] mt-1.5">{msg}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={turnOn} disabled={push.busy} className="bg-white text-[#0369A1] font-bold text-[13px] px-4 py-2 rounded-full active:scale-95 transition-transform disabled:opacity-60">
              {push.busy ? 'Turning on…' : 'Turn on'}
            </button>
            <button onClick={later} className="text-white/90 font-semibold text-[13px] px-3 py-2">Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
