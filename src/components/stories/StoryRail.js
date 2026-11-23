// src/components/stories/StoryRail.js — the status strip on the home feed
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import StoryViewer from './StoryViewer';
import StoryComposer from './StoryComposer';
import { fetchStoryFeed, getCachedFeed, groupStories, patchCachedFeed } from '../../lib/stories';

function Ring({ group, own, onOpen, onAdd }) {
  const has = group?.stories?.length > 0;
  const fresh = !own && group?.hasUnviewed;
  const name = own ? 'Your status' : group.user.display_name?.split(' ')[0] || '';

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 68 }}>
      <div className="relative">
        <button onClick={onOpen} aria-label={own ? (has ? 'View your status' : 'Add status') : `View ${name}'s status`}
          className="rounded-full p-[3px] active:scale-95 transition-transform"
          style={{
            background: fresh || (own && has) ? '#F97316' : has ? 'rgba(255,255,255,0.28)' : 'transparent',
            border: !has ? '2px dashed rgba(255,255,255,0.22)' : 'none',
            padding: !has ? 2 : 3,
          }}>
          <div className="rounded-full p-[2px] bg-[#0D0C0B]">
            <Avatar url={own ? group.user?.avatar_url : group.user.avatar_url} name={own ? group.user?.display_name : group.user.display_name} size={14} />
          </div>
        </button>
        {own && (
          <button onClick={onAdd} aria-label="Add a new status"
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#0D0C0B] active:scale-90 transition-transform"
            style={{ background: '#F97316' }}>
            <Plus size={14} className="text-white" strokeWidth={3} />
          </button>
        )}
      </div>
      <span className={'text-[11px] truncate w-full text-center ' + (fresh ? 'text-white font-semibold' : 'text-[#8E8C88]')}>{name}</span>
    </div>
  );
}

function RingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0 animate-pulse" style={{ width: 68 }}>
      <div className="w-[62px] h-[62px] rounded-full bg-white/10" />
      <div className="h-2 w-10 rounded-full bg-white/10" />
    </div>
  );
}

export default function StoryRail() {
  const { user, profile } = useAuth();
  const me = user?.id;
  const [rows, setRows] = useState(() => getCachedFeed() || []);
  const [loading, setLoading] = useState(() => !getCachedFeed());
  const [viewer, setViewer] = useState(null);      // { groups, start }
  const [composer, setComposer] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try { setRows(await fetchStoryFeed()); } catch { /* keep what we have */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    load();
    const queue = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 700); };
    // the database only sends us changes we are allowed to see (friends only)
    const ch = supabase.channel('story-rail:' + me + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, queue)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stories' }, queue)
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [me, load]);

  const groups = useMemo(() => groupStories(rows, me), [rows, me]);
  const own = groups.find((g) => g.userId === me);
  const friends = groups.filter((g) => g.userId !== me);
  const ownGroup = own || { userId: me, user: { display_name: profile?.display_name, avatar_url: profile?.avatar_url }, stories: [] };

  const open = (group) => {
    const ordered = [group, ...groups.filter((g) => g.userId !== group.userId && g.userId !== me)];
    setViewer({ groups: ordered, start: 0 });
  };

  const markViewed = useCallback((storyId) => {
    const mark = (list) => list.map((s) => (s.id === storyId ? { ...s, viewed: true } : s));
    patchCachedFeed(mark);
    setRows(mark);
  }, []);

  const removeStory = useCallback((storyId) => {
    const drop = (list) => list.filter((s) => s.id !== storyId);
    patchCachedFeed(drop);
    setRows(drop);
  }, []);

  if (!me) return null;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-3 pt-3 pb-2.5 border-b border-white/[0.06]" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        <Ring group={ownGroup} own onOpen={() => (own ? open(own) : setComposer(true))} onAdd={() => setComposer(true)} />
        {loading
          ? [0, 1, 2, 3].map((i) => <RingSkeleton key={i} />)
          : friends.map((g) => <Ring key={g.userId} group={g} onOpen={() => open(g)} />)}
      </div>

      {viewer && (
        <StoryViewer
          groups={viewer.groups}
          startGroup={viewer.start}
          onClose={() => { setViewer(null); load(); }}
          onViewed={markViewed}
          onDeleted={removeStory}
          onAdd={() => setComposer(true)}
        />
      )}
      {composer && <StoryComposer onClose={() => setComposer(false)} onCreated={load} />}
    </>
  );
}
