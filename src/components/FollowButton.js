// src/components/FollowButton.js
// One follow button used on Profile, Discover, lists and Notifications.
// States: Follow -> Following -> (they follow back) Friends, and
// "Follow Back" when only they follow you. Updates instantly everywhere.
import { useEffect, useRef, useState } from 'react';
import { UserPlus, UserCheck, Users2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  REL, fetchRelationship, setFollow, nextRelationship, iFollowThem, onFollowChange,
} from '../lib/follows';
import Avatar from './Avatar';
import { Spinner } from './ui';

const LOOK = {
  none:        { label: 'Follow',      Icon: UserPlus,  cls: 'bg-[#FF5A1F] text-white shadow-md shadow-[#FF5A1F]/30 hover:bg-[#d9480f]' },
  following:   { label: 'Following',   Icon: UserCheck, cls: 'bg-white/[0.07] text-white border border-white/20 hover:bg-white/10' },
  follow_back: { label: 'Follow Back', Icon: UserPlus,  cls: 'bg-gradient-to-r from-[#FF5A1F] to-[#FF2D78] text-white shadow-md shadow-[#FF5A1F]/30' },
  friends:     { label: 'Friends',     Icon: Users2,    cls: 'bg-[#2ECC71]/10 text-[#2ECC71] border border-[#2ECC71]/40 hover:bg-[#2ECC71]/15' },
};

export default function FollowButton({
  targetId, initialRelationship, username, displayName, avatarUrl,
  size = 'sm',            // 'sm' = compact pill (lists) | 'lg' = wide button (profile)
  onChange, className = '',
}) {
  const { user } = useAuth();
  const me = user?.id;
  const [rel, setRel] = useState(initialRelationship ?? null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const relRef = useRef(rel);
  relRef.current = rel;

  // `undefined` -> load our own copy. `null` -> the parent is loading it in
  // bulk (one query for a whole list), so wait — but never forever.
  useEffect(() => {
    if (initialRelationship) { setRel(initialRelationship); return; }
    if (!me || !targetId) return;
    let live = true;
    const load = () => fetchRelationship(me, targetId)
      .then((r) => live && setRel((cur) => cur || r))
      .catch(() => live && setRel((cur) => cur || REL.NONE));
    if (initialRelationship === undefined) { load(); return () => { live = false; }; }
    const t = setTimeout(load, 4000);
    return () => { live = false; clearTimeout(t); };
  }, [me, targetId, initialRelationship]);

  // Stay in sync with follows made from any other screen.
  useEffect(() => onFollowChange((d) => {
    if (d.targetId === targetId && d.relationship) setRel(d.relationship);
  }), [targetId]);

  if (!me || me === targetId) return null;

  const run = async () => {
    const current = relRef.current || REL.NONE;
    const want = !iFollowThem(current);
    const optimistic = nextRelationship(current);
    setErr(''); setBusy(true); setRel(optimistic);
    try {
      const finalRel = await setFollow(me, targetId, want, current);
      setRel(finalRel);
      onChange?.(finalRel, current);
    } catch (e) {
      setRel(current);
      setErr("Couldn't update. Try again.");
      setTimeout(() => setErr(''), 2500);
    }
    setBusy(false);
  };

  const onClick = (e) => {
    e.stopPropagation();
    if (busy || rel === null) return;
    if (iFollowThem(rel)) setConfirm(true); else run();
  };

  const look = LOOK[rel || REL.NONE];
  const sizeCls = size === 'lg'
    ? 'flex-1 py-2.5 rounded-xl text-sm gap-1.5'
    : 'px-3.5 py-1.5 rounded-full text-xs gap-1.5 min-w-[92px]';

  return (
    <>
      <button
        onClick={onClick}
        disabled={busy || rel === null}
        aria-label={look.label}
        title={err || undefined}
        className={`inline-flex items-center justify-center font-bold transition-all active:scale-95 disabled:opacity-70 flex-shrink-0 ${sizeCls} ${look.cls} ${className}`}
      >
        {rel === null || busy
          ? <Spinner size={13} />
          : <><look.Icon size={size === 'lg' ? 15 : 13} /> {look.label}</>}
      </button>
      {err && size === 'lg' && <p className="sr-only" role="alert">{err}</p>}

      {confirm && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end justify-center" onClick={(e) => { e.stopPropagation(); setConfirm(false); }}>
          <div className="w-full max-w-[620px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <Avatar url={avatarUrl} name={displayName || username} size={16} />
              <p className="text-white font-bold text-base mt-3">
                {rel === REL.FRIENDS ? 'Stop being friends' : 'Unfollow'}{username ? ` @${username}` : ''}?
              </p>
              <p className="text-[#8E8C88] text-sm mt-1 max-w-[300px]">
                {rel === REL.FRIENDS
                  ? "You'll stop following them. They'll still follow you, so you won't be friends anymore."
                  : "Their posts will no longer appear in your Following feed."}
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={() => { setConfirm(false); run(); }}
                className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold text-sm border border-red-500/30 active:scale-[0.98]"
              >
                {rel === REL.FRIENDS ? 'Unfollow' : 'Unfollow'}
              </button>
              <button onClick={() => setConfirm(false)} className="w-full py-3 rounded-xl bg-white/[0.07] text-white font-bold text-sm active:scale-[0.98]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
