// api/send-push.js — Vercel serverless function.
// Supabase calls this (Database Webhook, INSERT on public.notifications) and it
// delivers a Web Push message to every device the recipient has switched push on for.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
//   SUPABASE_URL (or REACT_APP_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
//   PUSH_WEBHOOK_SECRET  — long random string, also put in the Supabase webhook header
const crypto = require('crypto');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.PUSH_WEBHOOK_SECRET;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.REACT_APP_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

const configured = !!(SUPABASE_URL && SERVICE_KEY && SECRET && VAPID_PUBLIC && VAPID_PRIVATE);
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const db = configured ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CRITICAL = new Set(['ban', 'suspend', 'restrict', 'warning']);   // always delivered, even in quiet hours
const POST_TYPES = new Set(['like', 'haha', 'wow', 'sad', 'angry', 'fire', 'comment', 'reply', 'repost', 'quote', 'share']);

const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function minutesNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
    return h * 60 + Number(parts.find((p) => p.type === 'minute').value);
  } catch { return null; }
}
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

function inQuietHours(s) {
  if (!s || !s.quiet_hours) return false;
  const now = minutesNow(s.timezone || 'Africa/Nairobi');
  if (now == null) return false;
  const a = toMin(s.quiet_start), b = toMin(s.quiet_end);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return false;
  return a < b ? (now >= a && now < b) : (now >= a || now < b);     // handles 22:00 → 07:00
}

function describe(rec, name, username) {
  const who = name || 'Someone';
  const ref = UUID.test(rec.ref_id || '') ? rec.ref_id : null;
  const post = ref ? '/post/' + ref : '/notifications';
  const t = rec.type;
  if (['like', 'haha', 'wow', 'sad', 'angry', 'fire'].includes(t)) return { title: who, body: 'reacted to your post', url: post };
  if (t === 'comment') return { title: who, body: 'commented on your post', url: post };
  if (t === 'reply')   return { title: who, body: 'replied to your comment', url: post };
  if (t === 'repost')  return { title: who, body: 'reposted your post', url: post };
  if (t === 'quote')   return { title: who, body: 'quoted your post', url: post };
  if (t === 'share')   return { title: who, body: 'shared your post', url: post };
  if (t === 'mention') return { title: who, body: 'mentioned you', url: ref ? post : '/notifications' };
  if (t === 'follow')  return { title: who, body: 'started following you', url: username ? '/profile/' + encodeURIComponent(username) : '/notifications' };
  if (t === 'follow_request') return { title: who, body: 'sent you a follow request', url: '/notifications' };
  if (t === 'message') return { title: who, body: clip(rec.message, 140) || 'sent you a message', url: ref ? '/chats/' + ref : '/chats' };
  return { title: 'B-Link', body: clip(rec.message, 160) || 'You have a new notification', url: '/notifications' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!configured) return res.status(500).json({ error: 'push not configured' });
  if (!safeEqual(req.headers.authorization || '', 'Bearer ' + SECRET)) return res.status(401).json({ error: 'unauthorized' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const rec = body && body.record;
    if (!body || body.type !== 'INSERT' || body.table !== 'notifications' || !rec || !UUID.test(rec.user_id || '')) {
      return res.status(200).json({ skipped: 'not a notification insert' });
    }

    const [subsR, setR, fromR, unreadR] = await Promise.all([
      db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', rec.user_id),
      db.from('user_settings').select('quiet_hours,quiet_start,quiet_end,timezone').eq('user_id', rec.user_id).maybeSingle(),
      UUID.test(rec.from_user_id || '')
        ? db.from('users').select('display_name,username').eq('id', rec.from_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', rec.user_id).eq('is_read', false),
    ]);

    const subs = subsR.data || [];
    if (!subs.length) return res.status(200).json({ sent: 0 });
    if (!CRITICAL.has(rec.type) && inQuietHours(setR.data)) return res.status(200).json({ skipped: 'quiet hours' });

    const d = describe(rec, clip(fromR.data && fromR.data.display_name, 40), fromR.data && fromR.data.username);
    const payload = JSON.stringify({
      title: clip(d.title, 60), body: d.body, url: d.url,
      tag: rec.type + ':' + (rec.ref_id || rec.id || ''),
      renotify: rec.type === 'message',
      unread: unreadR.count || 0,
      ts: Date.now(),
    });
    const options = { TTL: rec.type === 'message' ? 3600 : 86400, urgency: rec.type === 'message' ? 'high' : 'normal' };

    const dead = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.push(s.endpoint);   // device gone
      }
    }));
    if (dead.length) await db.from('push_subscriptions').delete().in('endpoint', dead);

    return res.status(200).json({ sent: subs.length - dead.length });
  } catch (err) {
    console.error('send-push error:', err && err.message);
    return res.status(200).json({ error: 'failed' });   // never make Supabase retry-storm us
  }
};
