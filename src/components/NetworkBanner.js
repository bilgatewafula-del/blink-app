// src/components/NetworkBanner.js
// App-wide banner shown when the device is offline or the
// connection to B-Link's servers is degraded. Mount this once
// in App.js so every screen benefits without extra wiring.
import { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { checkConnection } from '../lib/supabaseClient';

export default function NetworkBanner() {
  const [status, setStatus] = useState('online'); // online | offline | slow
  const [checking, setChecking] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const handleOffline = () => setStatus('offline');
    const handleOnline  = () => verifyConnection();

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);

    // Periodic background health check every 15s
    pollRef.current = setInterval(verifyConnection, 30000);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
      clearInterval(pollRef.current);
    };
  }, []);

  const verifyConnection = async () => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setChecking(true);
    const start = Date.now();
    let ok = await checkConnection();
    if (!ok) { await new Promise((r) => setTimeout(r, 2500)); ok = await checkConnection(); }   // one quiet retry before alarming anyone
    const elapsed = Date.now() - start;
    setChecking(false);

    if (!ok) setStatus('offline');
    else if (elapsed > 4000) setStatus('slow');
    else setStatus('online');
  };

  const handleRetry = () => verifyConnection();

  if (status === 'online') return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2 text-center"
      style={{
        background: status === 'offline' ? '#7F1D1D' : '#78350F',
        paddingTop: 'max(8px, env(safe-area-inset-top))',
      }}
    >
      <WifiOff size={14} color="white" />
      <span className="text-[#202938] text-xs font-semibold">
        {status === 'offline' ? "You're offline" : 'Slow connection'}
      </span>
      <button
        onClick={handleRetry}
        disabled={checking}
        className="ml-2 flex items-center gap-1 bg-[#E2E8F0] hover:bg-white/25 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
      >
        <RefreshCw size={11} color="white" className={checking ? 'animate-spin' : ''} />
        <span className="text-[#202938] text-[11px] font-bold">Retry</span>
      </button>
    </div>
  );
}