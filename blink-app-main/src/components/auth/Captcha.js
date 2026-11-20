// src/components/auth/Captcha.js
// Cloudflare Turnstile. Renders nothing unless REACT_APP_TURNSTILE_SITE_KEY
// is set, so the app works before the key exists and turns protection on
// the moment you add it (and enable CAPTCHA in Supabase).
import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;
export const captchaEnabled = !!SITE_KEY;

let scriptPromise = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { scriptPromise = null; reject(new Error('captcha script failed')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function Captcha({ onToken, resetKey = 0 }) {
  const box = useRef(null);
  const widget = useRef(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (t) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    }).catch(() => cb.current(''));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) { try { window.turnstile.remove(widget.current); } catch { /* ignore */ } }
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      try { window.turnstile.reset(widget.current); } catch { /* ignore */ }
      cb.current('');
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="flex justify-center min-h-[65px]" />;
}
