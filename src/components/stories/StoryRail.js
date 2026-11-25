// src/components/stories/StoryRail.js — the status strip on the home feed
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../Avatar';
import StoryViewer from './StoryViewer';
import StoryComposer from './StoryComposer';
import { fetchStoryFeed, getCachedFeed, groupStories, patchCachedFeed } from '../../lib/stories';

function Ring({ group, own, onOpen, onAdd }) {
  const has = group?.stories?.length > 0;
  const fresh = !own && group?.hasUnviewed;
  const name = own ? 'You' : group.user.display_name?.split(' ')[0] || '';

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 68 }}>
      <div className="relative">
        <button onClick={onOpen} aria-label={own ? (has ? 'View your status' : 'Add status') : `View ${name}'s status`}
          className="rounded-full p-[3px] active:scale-95 transition-transform"
          style={{
            background: fresh || (own && has) ? 'linear-gradient(135deg, #7C3AED, #E11D48)' : has ? '#CBD5E1' : 'transparent',
            border: !has ? '2px dashed #CBD5E1' : 'none',
            padding: !has ? 2 : 3,
          }}>
          <div className="rounded-full p-[2px] bg-[#F5F3FF]">
            <Avatar url={own ? group.user?.avatar_url : group.user.avatar_url} name={own ? group.user?.display_name : group.user.display_name} size={14} />
          </div>
        </button>
        {own && (
          <button onClick={onAdd} aria-label="Add a new status"
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white active:scale-90 transition-transform"
            style={{ background: '#7C3AED' }}>
            <Plus size={14} className="text-white" strokeWidth={3} />
          </button>
        )}
      </div>
      <span className={'text-[11px] truncate w-full text-center ' + (fresh ? 'text-[#111827] font-semibold' : 'text-[#64748B]')}>{name}</span>
    </div>
  );
}

function RingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0 animate-pulse" style={{ width: 68 }}>
      <div className="w-[62px] h-[62px] rounded-full bg-[#E2E8F0]" />
      <div className="h-2 w-10 rounded-full bg-[#E2E8F0]" />
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
      {/* Create a moment — expressive violet→rose action; opens the existing StoryComposer */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setComposer(true)}
          aria-label="Create a moment"
          className="group block w-full rounded-[20px] p-[2px] text-left active:scale-[0.99] transition-transform shadow-[0_4px_14px_rgba(124,58,237,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E2E6F5]"
          style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #C026D3 50%, #E11D48 100%)' }}
        >
          <span className="relative flex items-center gap-3.5 rounded-[18px] px-3.5 py-3 overflow-hidden" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF1F2 100%)' }}>
            {/* camera-lens rings */}
            <span aria-hidden="true" className="absolute -right-8 -top-8 w-28 h-28 rounded-full border-[10px] border-[#7C3AED]/10" />
            <span aria-hidden="true" className="absolute -right-3 -top-3 w-16 h-16 rounded-full border-[6px] border-[#E11D48]/10" />

            <span className="relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: 'linear-gradient(135deg, #7C3AED, #E11D48)' }}>
              <Plus size={26} className="text-white" strokeWidth={2.8} />
              <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border-2 border-[#F5F3FF] flex items-center justify-center">
                <Camera size={13} className="text-[#E11D48]" strokeWidth={2.4} />
              </span>
            </span>

            <span className="relative flex-1 min-w-0">
              <span className="block text-[#111827] font-extrabold text-[17px] leading-tight tracking-tight">Create a moment</span>
              <span className="block text-[#475569] text-[13px] font-medium mt-1 leading-snug">Share a photo, text or moment with your friends</span>
            </span>
          </span>
        </button>
      </div>

      {/* Status rail: your moment first, then your friends' moments */}
      <div className="mx-3 mt-3 border border-[#DDD6FE] rounded-2xl shadow-[0_2px_8px_rgba(17,21,46,0.08)]" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF1F2 100%)' }}>
        <div className="flex gap-2 overflow-x-auto px-2.5 pt-2.5 pb-2" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <Ring group={ownGroup} own onOpen={() => (own ? open(own) : setComposer(true))} onAdd={() => setComposer(true)} />
          {loading
            ? [0, 1, 2, 3].map((i) => <RingSkeleton key={i} />)
            : friends.map((g) => <Ring key={g.userId} group={g} onOpen={() => open(g)} />)}
        </div>
      </div>

      {viewer && createPortal(
        <StoryViewer
          groups={viewer.groups}
          startGroup={viewer.start}
          onClose={() => { setViewer(null); load(); }}
          onViewed={markViewed}
          onDeleted={removeStory}
          onAdd={() => setComposer(true)}
        />,
        document.body
      )}
      {composer && createPortal(<StoryComposer onClose={() => setComposer(false)} onCreated={load} />, document.body)}
    </>
  );
}
