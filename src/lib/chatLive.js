// src/lib/chatLive.js — everything that must be "live" across the whole app, not just inside one chat:
//  • who is typing to me (shown in the chat list and in the chat itself)
//  • how many chats have unread messages (the badge on the Chats tab)
//  • marking messages "delivered" the moment they reach this phone, even if the chat is not open
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

let me = null;
let inbox = null;
let feed = null;
let unread = 0;
let typing = new Map();                 // chatId -> userId currently typing
const typingTimers = new Map();
const outgoing = new Map();             // recipientId -> { ch, ready, pending, idle }
const subs = { unread: new Set(), typing: new Set() };
let refreshTimer = null;
let visHandler = null;

const emit = (k, v) => subs[k].forEach((fn) => fn(v));

/* ── unread chats ── */
export async function refreshUnread() {
  if (!me) return;
  const { data, error } = await supabase.from('messages').select('chat_id')
    .neq('sender_id', me).is('seen_at', null)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .or(`deleted_for.is.null,deleted_for.not.cs.{${me}}`)
    .limit(1000);
  if (error) return;
  const n = new Set((data || []).map((r) => r.chat_id)).size;
  if (n !== unread) { unread = n; emit('unread', n); }
}
const queueRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshUnread, 350); };

/* ── delivered receipts ── */
export async function markAllDelivered() {
  if (!me) return;
  await supabase.from('messages').update({ delivered_at: new Date().toISOString() })
    .neq('sender_id', me).is('delivered_at', null);
}

/* ── typing (received) ── */
function setTyping(chatId, from, on) {
  clearTimeout(typingTimers.get(chatId));
  if (on) {
    typing.set(chatId, from);
    typingTimers.set(chatId, setTimeout(() => { typing.delete(chatId); typing = new Map(typing); emit('typing', typing); }, 4500));
  } else {
    typing.delete(chatId);
  }
  typing = new Map(typing);
  emit('typing', typing);
}

/* ── typing (sent) ── */
export function sendTyping(toUserId, chatId, state = 'start') {
  if (!me || !toUserId || !chatId) return;
  let o = outgoing.get(toUserId);
  const payload = { chat_id: chatId, from: me, state };
  if (!o) {
    const ch = supabase.channel('inbox:' + toUserId);
    o = { ch, ready: false, pending: null, idle: null };
    outgoing.set(toUserId, o);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        o.ready = true;
        if (o.pending) { ch.send({ type: 'broadcast', event: 'typing', payload: o.pending }); o.pending = null; }
      }
    });
  }
  clearTimeout(o.idle);
  o.idle = setTimeout(() => { supabase.removeChannel(o.ch); outgoing.delete(toUserId); }, 120000);
  if (o.ready) o.ch.send({ type: 'broadcast', event: 'typing', payload });
  else o.pending = payload;
}

/* ── lifecycle ── */
export function startChatLive(uid) {
  if (!uid || (me === uid && feed)) return;
  stopChatLive();
  me = uid;

  inbox = supabase.channel('inbox:' + uid)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || !payload.chat_id || !payload.from || payload.from === me) return;
      setTyping(String(payload.chat_id), String(payload.from), payload.state !== 'stop');
    })
    .subscribe();

  feed = supabase.channel('live-messages:' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const r = p.new;
      if (!r || r.sender_id === me) return;
      if (!r.delivered_at) {
        supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', r.id).is('delivered_at', null).then(() => {});
      }
      setTyping(String(r.chat_id), String(r.sender_id), false);   // a message arrived: they stopped typing
      queueRefresh();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, queueRefresh)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, queueRefresh)
    .subscribe();

  visHandler = () => { if (document.visibilityState === 'visible') { markAllDelivered(); refreshUnread(); } };
  document.addEventListener('visibilitychange', visHandler);
  window.addEventListener('online', visHandler);

  markAllDelivered();
  refreshUnread();
}

export function stopChatLive() {
  if (inbox) supabase.removeChannel(inbox);
  if (feed) supabase.removeChannel(feed);
  outgoing.forEach((o) => { clearTimeout(o.idle); supabase.removeChannel(o.ch); });
  outgoing.clear();
  typingTimers.forEach((t) => clearTimeout(t));
  typingTimers.clear();
  clearTimeout(refreshTimer);
  if (visHandler) { document.removeEventListener('visibilitychange', visHandler); window.removeEventListener('online', visHandler); visHandler = null; }
  inbox = null; feed = null; me = null;
  typing = new Map(); emit('typing', typing);
  if (unread !== 0) { unread = 0; emit('unread', 0); }
}

/* ── hooks ── */
export function useUnreadChats() {
  const [n, setN] = useState(unread);
  useEffect(() => { subs.unread.add(setN); setN(unread); return () => subs.unread.delete(setN); }, []);
  return n;
}
export function useTypingMap() {
  const [m, setM] = useState(typing);
  useEffect(() => { subs.typing.add(setM); setM(typing); return () => subs.typing.delete(setM); }, []);
  return m;
}
export const useTypingIn = (chatId) => useTypingMap().has(String(chatId));
