// Admin → Identity: manage reserved / blocked names and review impersonation, flags and appeals.
// Every action calls a SECURITY DEFINER RPC that re-checks the caller's role on the server.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatTime } from '../../utils/formatTime';

const TABS = [
  { key: 'rules', label: 'Rules' },
  { key: 'flags', label: 'Review queue' },
  { key: 'reported', label: 'Reported' },
  { key: 'appeals', label: 'Appeals' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'access', label: 'Access' },
];
const KINDS = [
  ['reserved', 'Reserved name'], ['protected_name', 'Protected name'], ['decoration', 'Impersonation filler word'],
  ['blocked_term', 'Blocked term'], ['allow_term', 'Allowed word (exception)'],
];
const MATCHES = [['term', 'Word / name'], ['exact', 'Exact only'], ['substring', 'Anywhere inside'], ['regex', 'Pattern (advanced)']];
const card = 'bg-white border border-[#E2E8F0] rounded-2xl p-3';
const input = 'w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-[#111827] text-[13px] focus:outline-none focus:border-[#7C3AED]/60';
const btn = 'px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-all disabled:opacity-50';

export default function IdentityAdmin({ isBlink }) {
  const [tab, setTab] = useState('rules');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ kind: 'blocked_term', match_type: 'term', value: '', category: 'abuse', severity: 'block', applies_to: 'both' });
  const [grant, setGrant] = useState({ username: '', kind: 'username', value: '' });
  const [edgeRequired, setEdgeRequired] = useState(null);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    const calls = {
      rules: () => supabase.rpc('admin_identity_rules_list', { p_kind: kind || null, p_search: search.trim() || null, p_limit: 300 }),
      flags: () => supabase.rpc('admin_identity_flags_list', { p_status: 'open' }),
      reported: () => supabase.rpc('admin_identity_reported_accounts'),
      appeals: () => supabase.rpc('admin_identity_appeals_list', { p_status: 'pending' }),
      decisions: () => supabase.rpc('admin_identity_decisions_list', { p_limit: 100 }),
      access: () => supabase.rpc('admin_identity_overrides_list'),
    };
    const { data, error } = await calls[tab]();
    if (error) { setErr(error.message); setRows([]); } else setRows(Array.isArray(data) ? data : []);
    setBusy(false);
  }, [tab, kind, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== 'access') return;
    supabase.rpc('identity_edge_required_status').then(({ data }) => { if (typeof data === 'boolean') setEdgeRequired(data); });
  }, [tab]);

  const run = async (fn, okMsg) => {
    setErr(''); setNote('');
    const { error } = await fn();
    if (error) { setErr(error.message); return false; }
    if (okMsg) setNote(okMsg);
    await load();
    return true;
  };

  const addRule = async (e) => {
    e.preventDefault();
    if (!form.value.trim()) return;
    const ok = await run(() => supabase.rpc('admin_identity_rule_save', {
      p_id: null, p_kind: form.kind, p_match_type: form.match_type, p_value: form.value, p_category: form.category,
      p_severity: form.severity, p_applies_to: form.applies_to, p_is_active: true, p_note: null,
    }), 'Rule saved. It applies within about a minute.');
    if (ok) setForm((f) => ({ ...f, value: '' }));
  };

  return (
    <div className="space-y-3">
      <div className="flex overflow-x-auto gap-2 scrollbar-none">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setNote(''); }}
            className={btn + ' flex-shrink-0 ' + (tab === t.key ? 'bg-[#11152E] text-white border-[#11152E]' : 'text-[#64748B] border-[#E2E8F0] bg-white')}>{t.label}</button>
        ))}
      </div>
      {err && <p className="text-red-600 text-[12px]">{err}</p>}
      {note && <p className="text-[#10B981] text-[12px]">{note}</p>}
      {busy && <p className="text-[#64748B] text-[12px]">Loading…</p>}

      {tab === 'rules' && (
        <>
          <form onSubmit={addRule} className={card + ' space-y-2'}>
            <p className="text-[#111827] font-bold text-[13px]">Add a rule</p>
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select className={input} value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })}>{MATCHES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select className={input} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="block">Block</option><option value="review">Allow but flag for review</option></select>
              <select className={input} value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}><option value="both">Usernames + names</option><option value="username">Usernames only</option><option value="display_name">Display names only</option></select>
            </div>
            <input className={input} placeholder="Category (e.g. abuse, hate, scam, staff, brand, finance)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <input className={input} placeholder={form.match_type === 'regex' ? 'Pattern on the compact lowercase name' : 'Word or name'} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <p className="text-[#64748B] text-[11px]">Matching ignores capitals, spaces, punctuation and look-alike letters (adm1n, аdmin). Patterns run on the compact form with no spaces or punctuation.</p>
            <button type="submit" className={btn + ' bg-[#7C3AED] text-white border-[#7C3AED]'}>Save rule</button>
          </form>
          <div className="flex gap-2">
            <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className={input} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {rows.map((r) => (
            <div key={r.id} className={card + ' flex items-center justify-between gap-2'}>
              <div className="min-w-0">
                <p className="text-[#111827] text-[13px] font-bold break-all">{r.value}</p>
                <p className="text-[#64748B] text-[11px]">{r.kind.replace('_', ' ')} · {r.match_type} · {r.category} · {r.severity === 'review' ? 'flag only' : 'blocks'} · {r.applies_to === 'both' ? 'all names' : r.applies_to.replace('_', ' ')}</p>
              </div>
              <button className={btn + ' text-red-600 border-red-200'} onClick={() => { if (window.confirm('Remove this rule?')) run(() => supabase.rpc('admin_identity_rule_delete', { p_id: r.id }), 'Rule removed.'); }}>Remove</button>
            </div>
          ))}
          {!busy && rows.length === 0 && <p className="text-[#64748B] text-sm text-center py-6">No rules found.</p>}
        </>
      )}

      {tab === 'flags' && (
        <>
          <p className="text-[#64748B] text-[12px]">Names that were accepted but look ambiguous. Nothing is changed automatically.</p>
          {rows.map((f) => (
            <div key={f.id} className={card + ' space-y-2'}>
              <p className="text-[#111827] text-[13px]"><b>{f.value}</b> <span className="text-[#64748B]">({f.kind.replace('_', ' ')}) — @{f.username || 'unknown'}</span></p>
              <p className="text-[#64748B] text-[11px]">{f.reason || f.category} · {formatTime(f.created_at)}</p>
              <div className="flex gap-2">
                <button className={btn + ' text-[#10B981] border-[#10B981]/40'} onClick={() => run(() => supabase.rpc('admin_identity_flag_resolve', { p_id: f.id, p_status: 'cleared', p_note: null }), 'Cleared.')}>Name is fine</button>
                <button className={btn + ' text-[#7C3AED] border-[#7C3AED]/40'} onClick={() => run(() => supabase.rpc('admin_identity_flag_resolve', { p_id: f.id, p_status: 'actioned', p_note: 'Handled in Users' }), 'Marked handled.')}>I handled it</button>
              </div>
            </div>
          ))}
          {!busy && rows.length === 0 && <p className="text-[#64748B] text-sm text-center py-6">Nothing waiting for review.</p>}
        </>
      )}

      {tab === 'reported' && (
        <>
          <p className="text-[#64748B] text-[12px]">Accounts reported as "Fake Account" or "Impersonation". Use the Users tab to warn, restrict or suspend.</p>
          {rows.map((a) => (
            <div key={a.target_id} className={card + ' space-y-2'}>
              <p className="text-[#111827] text-[13px]"><b>{a.display_name || 'Unknown'}</b> <span className="text-[#64748B]">@{a.username || '—'}</span></p>
              <p className="text-[#64748B] text-[11px]">{a.reports} report{a.reports !== 1 ? 's' : ''}{a.last_report ? ' · last ' + formatTime(a.last_report) : ''}</p>
              {(a.details || []).map((d, i) => <p key={i} className="text-[#64748B] text-[11px] italic">“{d}”</p>)}
              <div className="flex gap-2">
                <button className={btn + ' text-[#10B981] border-[#10B981]/40'} onClick={async () => { for (const id of a.report_ids) await supabase.rpc('admin_resolve_report', { p_report_id: id, p_status: 'resolved' }); await load(); }}>Mark reviewed</button>
                <button className={btn + ' text-[#64748B] border-[#E2E8F0]'} onClick={async () => { for (const id of a.report_ids) await supabase.rpc('admin_resolve_report', { p_report_id: id, p_status: 'ignored' }); await load(); }}>Dismiss</button>
              </div>
            </div>
          ))}
          {!busy && rows.length === 0 && <p className="text-[#64748B] text-sm text-center py-6">No open impersonation reports.</p>}
        </>
      )}

      {tab === 'appeals' && (
        <>
          <p className="text-[#64748B] text-[12px]">Approving lets that one account use that one name. It does not change any rule.</p>
          {rows.map((a) => (
            <div key={a.id} className={card + ' space-y-2'}>
              <p className="text-[#111827] text-[13px]">@{a.username || 'unknown'} asks to use <b>{a.requested_value}</b> <span className="text-[#64748B]">({a.kind.replace('_', ' ')})</span></p>
              {a.message && <p className="text-[#64748B] text-[11px] italic">“{a.message}”</p>}
              <div className="flex gap-2">
                <button className={btn + ' text-[#10B981] border-[#10B981]/40'} onClick={() => run(() => supabase.rpc('admin_identity_appeal_decide', { p_id: a.id, p_decision: 'approved', p_note: null }), 'Approved.')}>Approve</button>
                <button className={btn + ' text-red-600 border-red-200'} onClick={() => run(() => supabase.rpc('admin_identity_appeal_decide', { p_id: a.id, p_decision: 'denied', p_note: null }), 'Denied.')}>Deny</button>
              </div>
            </div>
          ))}
          {!busy && rows.length === 0 && <p className="text-[#64748B] text-sm text-center py-6">No appeals waiting.</p>}
        </>
      )}

      {tab === 'decisions' && (
        <>
          <p className="text-[#64748B] text-[12px]">Recent names that were refused for signed-in accounts.</p>
          {rows.map((d) => (
            <div key={d.id} className={card}>
              <p className="text-[#111827] text-[13px]"><b>{d.attempted_value}</b> <span className="text-[#64748B]">({d.kind.replace('_', ' ')}) @{d.username || '—'}</span></p>
              <p className="text-[#64748B] text-[11px]">{d.outcome} · {d.code}{d.category ? ' · ' + d.category : ''} · {formatTime(d.created_at)}</p>
            </div>
          ))}
          {!busy && rows.length === 0 && <p className="text-[#64748B] text-sm text-center py-6">No decisions logged yet.</p>}
        </>
      )}

      {tab === 'access' && (
        <>
          <form className={card + ' space-y-2'} onSubmit={(e) => { e.preventDefault(); run(() => supabase.rpc('admin_identity_grant', { p_username: grant.username, p_kind: grant.kind, p_value: grant.value }), 'Access granted.'); }}>
            <p className="text-[#111827] font-bold text-[13px]">Authorise a reserved name for one account</p>
            <input className={input} placeholder="Account username" value={grant.username} onChange={(e) => setGrant({ ...grant, username: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={grant.kind} onChange={(e) => setGrant({ ...grant, kind: e.target.value })}><option value="username">Username</option><option value="display_name">Display name</option></select>
              <input className={input} placeholder="Exact name" value={grant.value} onChange={(e) => setGrant({ ...grant, value: e.target.value })} />
            </div>
            <button type="submit" className={btn + ' bg-[#7C3AED] text-white border-[#7C3AED]'}>Grant</button>
          </form>
          {rows.map((o) => (
            <div key={o.id} className={card + ' flex items-center justify-between'}>
              <p className="text-[#111827] text-[13px]">@{o.username || '—'} may use <b>{o.value}</b> <span className="text-[#64748B]">({o.kind.replace('_', ' ')})</span></p>
              <button className={btn + ' text-red-600 border-red-200'} onClick={() => run(() => supabase.rpc('admin_identity_override_delete', { p_id: o.id }), 'Access removed.')}>Remove</button>
            </div>
          ))}
          {isBlink && edgeRequired !== null && (
            <div className={card + ' space-y-2'}>
              <p className="text-[#111827] font-bold text-[13px]">Strict mode</p>
              <p className="text-[#64748B] text-[11px]">When on, names can only change through the identity service (the Edge Function). Turn it on after you have deployed and tested the function.</p>
              <button className={btn + (edgeRequired ? ' text-red-600 border-red-200' : ' bg-[#7C3AED] text-white border-[#7C3AED]')}
                onClick={() => { if (window.confirm(edgeRequired ? 'Turn strict mode off?' : 'Turn strict mode on? Make sure the validate-identity function is deployed.')) supabase.rpc('admin_identity_set_edge_required', { p_on: !edgeRequired }).then(({ error }) => { if (error) setErr(error.message); else setEdgeRequired(!edgeRequired); }); }}>
                {edgeRequired ? 'Strict mode is ON — turn off' : 'Strict mode is off — turn on'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
