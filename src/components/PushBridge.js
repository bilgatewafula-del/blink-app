import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { syncPushSubscription } from '../lib/push';

// Invisible. Opens the right screen when a notification is tapped while the app is open,
// keeps this device's push registration fresh, and clears the home-screen badge.
export default function PushBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const sync = () => { if (user?.id) syncPushSubscription(user.id).catch(() => {}); };
    const onMessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === 'PUSH_NAVIGATE' && typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//')) navigate(d.url);
      if (d.type === 'PUSH_RESUBSCRIBE') sync();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const key = 'blink_push_synced:' + user.id;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      syncPushSubscription(user.id).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    const clear = () => {
      if (document.visibilityState === 'visible' && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);

  return null;
}
