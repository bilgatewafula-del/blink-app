import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Search, X, ChevronDown, Mail, MessageCircle, ThumbsUp, ThumbsDown, Send, Paperclip, Check, Clock,
  User, LogIn, CircleDot, FileText, Users, Bell, Wallet, ShieldCheck, HelpCircle, Bug, Lightbulb, CreditCard, Inbox, CheckCircle2,
} from 'lucide-react';
import { Spinner, EmptyState } from '../../components/ui';
import { compressImage, uploadImage } from '../../lib/imageUtils';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, APP_VERSION } from '../../config/appInfo';
import { goBack } from '../../lib/nav';

const FAQ = [
  { id: 'start', title: 'Getting started', Icon: HelpCircle, items: [
    ['What is B-Link?', 'B-Link is a social platform for young Africans. Post photos, videos and thoughts, chat privately, share 24-hour statuses with friends and follow creators you like.'],
    ['What does "friends" mean?', 'When you follow someone and they follow you back, you become friends. Friends can see each other\'s statuses, react to them and reply to them. The profile button shows Friends once you follow each other.'],
    ['Can I use the app on my phone like a normal app?', 'Yes. Open About B-Link and tap Install, or on iPhone tap Share, then Add to Home Screen.'],
  ] },
  { id: 'account', title: 'Account and sign in', Icon: LogIn, items: [
    ['I did not get my verification code', 'Wait a minute, check your spam folder or your text messages, then tap Resend code. Make sure the email or number is typed correctly. Temporary email addresses are not accepted.'],
    ['I forgot my password', 'On the sign-in screen tap Forgot password, choose email or phone, enter the 6-digit code and set a new password. All other devices are signed out afterwards.'],
    ['Why was I asked to sign in again?', 'For your safety, B-Link signs you out after a long time away. Open the app, enter your password and you are back in.'],
    ['How do I add or change my phone number?', 'Go to Settings, then Phone number. We text you a code to confirm it.'],
    ['How do I turn on two-step verification?', 'Go to Settings, then Two-step verification. Scan the code with an authenticator app, then enter the 6-digit code it shows.'],
    ['How do I delete my account?', 'Go to Settings, then Delete account, and type DELETE. Everything is erased permanently. If you only want a break, use Deactivate instead.'],
    ['Can I change my username?', 'Yes, in Edit Profile. Names can only be changed every few days, and they must be real, recognisable names.'],
  ] },
  { id: 'status', title: 'Status updates', Icon: CircleDot, items: [
    ['How do I post a status?', 'Tap the + on your status picture at the top of the feed. Choose Text to write on a coloured background, or Photo to share a picture. It lasts 24 hours.'],
    ['Who can see my status?', 'Only your friends (people you follow and who follow you back).'],
    ['How do I see who viewed my status?', 'Open your status and tap the view count at the bottom. The list updates live and stays until the status ends.'],
    ['Where do replies and reactions go?', 'They arrive in your Chats tab as messages, with a small card showing which status it was about.'],
    ['Can I delete a status?', 'Yes. Open it and tap the bin icon. It disappears for everyone straight away.'],
  ] },
  { id: 'posts', title: 'Posts and comments', Icon: FileText, items: [
    ['Why can\'t I see my post in the feed?', 'Check the audience. Posts set to Followers or Close friends are not shown to everyone. Also give a new post a few seconds to appear.'],
    ['How do I edit or delete a post?', 'Tap the three dots on your post. Edit lets you change the caption, and Delete removes it for good.'],
    ['Can I put a colour behind a text post?', 'Yes. Write a short text-only post, then pick a background colour under the text box.'],
    ['How do I manage comments?', 'Tap and hold a comment, or tap its three dots. You can reply, copy, edit your own, delete, and on your own post you can pin or hide a comment.'],
    ['Where are my post insights?', 'On your own posts, tap the views icon to see views, likes, comments, reposts, shares, saves and engagement.'],
    ['Which photo and video types work?', 'Photos in JPG, PNG or WebP (up to 10 per post). Videos up to 3 minutes and 100 MB.'],
  ] },
  { id: 'chats', title: 'Chats', Icon: MessageCircle, items: [
    ['Why can\'t I message someone?', 'They may have limited who can message them, or blocked you. You can still follow them and try again later.'],
    ['How do I delete a message?', 'Tap and hold the message. Delete for me hides it on your side only. Delete for everyone removes it for both people, and you can then remove the "This message was deleted" note for yourself.'],
    ['Can I search my chats?', 'Yes. The chats list searches names and message text. Inside a chat, tap the search icon to find messages and jump to them.'],
    ['Can I schedule a message?', 'Yes. Type your message, tap the paperclip, then Schedule and pick a time.'],
  ] },
  { id: 'friends', title: 'Privacy and safety', Icon: ShieldCheck, items: [
    ['How do I block or mute someone?', 'Open their profile and tap the three dots to block or report. On a post, the three dots menu lets you mute them. Manage both lists in Settings.'],
    ['Who can message, comment or follow me?', 'You choose in Settings, under Privacy and safety.'],
    ['How do I report something?', 'Use the three dots on a post, comment or profile and choose Report. Our team reviews every report.'],
    ['Does B-Link sell my data?', 'No. We never sell your personal data.'],
  ] },
  { id: 'notifications', title: 'Notifications', Icon: Bell, items: [
    ['How do I turn notifications off?', 'Settings, then Notifications. Switch off the types you do not want. It takes effect immediately.'],
    ['I am not getting notifications', 'Check Settings, then Notifications. Make sure the type is on, and that the app is allowed to notify you in your phone settings.'],
  ] },
  { id: 'payments', title: 'Payments and Premium', Icon: Wallet, items: [
    ['How do I pay for a plan or coins?', 'Open Premium, choose what you want and follow the M-Pesa steps. Enter the transaction code exactly as it appears in your M-Pesa message.'],
    ['My payment is pending', 'Payments are checked by our team, usually within an hour. You will get a notification as soon as it is verified.'],
    ['I paid but nothing changed', 'Wait for the verification notification. If it takes longer than a few hours, send a request from the "New request" tab, choose Payment and include your M-Pesa code.'],
  ] },
];

const TYPES = [
  { key: 'question', label: 'Question', Icon: HelpCircle },
  { key: 'bug', label: 'Problem', Icon: Bug },
  { key: 'payment', label: 'Payment', Icon: CreditCard },
  { key: 'feature', label: 'Idea', Icon: Lightbulb },
];

const STATUS = {
  open: { color: '#EF4444', label: 'Received' },
  pending: { color: '#FFB020', label: 'In progress' },
  resolved: { color: '#10B981', label: 'Resolved' },
};

function Faq({ q, a, id }) {
  const [open, setOpen] = useState(false);
  const [vote, setVote] = useState(() => { try { return localStorage.getItem('blink_faq_' + id); } catch { return null; } });
  const cast = (v) => { setVote(v); try { localStorage.setItem('blink_faq_' + id, v); } catch { /* ignore */ } };
  return (
    <div className="border-b border-[#E2E8F0] last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left active:bg-[#F8FAFC]">
        <span className="text-[#111827] text-[14px] font-medium leading-snug flex-1">{q}</span>
        <ChevronDown size={16} className={'text-[#64748B] flex-shrink-0 mt-0.5 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-[#64748B] text-[13px] leading-relaxed bg-[#F8FAFC] rounded-xl p-3">{a}</p>
          <div className="flex items-center gap-3 mt-2.5 text-[12px] text-[#64748B]">
            <span>Was this helpful?</span>
            <button onClick={() => cast('yes')} aria-label="Yes" className={'p-1.5 rounded-full ' + (vote === 'yes' ? 'bg-[#10B981]/20 text-[#10B981]' : '')}><ThumbsUp size={14} /></button>
            <button onClick={() => cast('no')} aria-label="No" className={'p-1.5 rounded-full ' + (vote === 'no' ? 'bg-red-500/20 text-red-600' : '')}><ThumbsDown size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HelpCenter() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('help');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);

  const [type, setType] = useState('question');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [shot, setShot] = useState(null);
  const [shotUrl, setShotUrl] = useState('');
  const [diag, setDiag] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sentId, setSentId] = useState('');

  const [tickets, setTickets] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const fileRef = useRef(null);

  const loadTickets = async () => {
    const { data } = await supabase.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    setTickets(data || []);
  };
  useEffect(() => { loadTickets(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const ch = supabase.channel('tickets:' + user.id + ':' + Math.random().toString(36).slice(2, 6))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: 'user_id=eq.' + user.id }, loadTickets)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line
  }, [user.id]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return FAQ;
    return FAQ.map((c) => ({ ...c, items: c.items.filter(([q, a]) => q.toLowerCase().includes(t) || a.toLowerCase().includes(t)) })).filter((c) => c.items.length);
  }, [search]);

  const unresolved = (tickets || []).filter((t) => t.status !== 'resolved').length;

  const diagnostics = async () => {
    const t0 = Date.now();
    let ping = null;
    try { await supabase.from('users').select('id').limit(1); ping = Date.now() - t0; } catch { /* offline */ }
    return {
      app_version: APP_VERSION, user_agent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`, online: navigator.onLine, response_ms: ping,
      installed: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches),
    };
  };

  const pickShot = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    setShot(f); setShotUrl(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (title.trim().length < 3) return setErr('Give your request a short title.');
    if (desc.trim().length < 10) return setErr('Tell us a little more (at least 10 characters).');
    setBusy(true); setErr('');
    try {
      let screenshot = null;
      if (shot) { try { screenshot = await uploadImage(await compressImage(shot, { maxSize: 1400, quality: 0.8 }), 'support'); } catch { /* send without it */ } }
      const device = diag ? await diagnostics() : {};
      let { data, error } = await supabase.rpc('submit_support_ticket', {
        p_type: type, p_title: title.trim(), p_description: desc.trim(), p_screenshot: screenshot, p_device: device,
      });
      if (error && /does not exist|could not find/i.test(error.message || '')) {
        const r = await supabase.from('support_tickets').insert({
          user_id: user.id, type: ['bug', 'feature'].includes(type) ? type : 'bug', title: title.trim(), description: desc.trim(),
          screenshot_url: screenshot, device_info: device, status: 'open',
        }).select('id').single();
        data = r.data?.id; error = r.error;
      }
      if (error) throw error;
      setSentId(String(data || '').slice(0, 8).toUpperCase());
      setTitle(''); setDesc(''); setShot(null); setShotUrl('');
      loadTickets();
    } catch (e) {
      const m = (e.message || '').toLowerCase();
      setErr(m.includes('too many') ? 'You have sent a few requests already. Please wait a while before sending another.' : "We couldn't send your request. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#F1F3F9] pb-24">
      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/')} aria-label="Back" className="text-[#CBD5E1] hover:text-white"><ArrowLeft size={22} /></button>
        <div><h1 className="text-white font-bold text-[16px] leading-none">Help Center</h1><p className="text-[#CBD5E1] text-xs mt-0.5">Answers and support</p></div>
      </div>

      <div className="flex mx-4 mt-4 mb-4 bg-[#F1F5F9] rounded-2xl p-1">
        {[['help', 'Help'], ['new', 'New request'], ['mine', 'My requests']].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setSentId(''); }}
            className={'flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all relative ' + (tab === k ? 'bg-[#7C3AED] text-white' : 'text-[#64748B]')}>
            {l}
            {k === 'mine' && unresolved > 0 && <span className="absolute -top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#7C3AED] text-white text-[10px] flex items-center justify-center">{unresolved}</span>}
          </button>
        ))}
      </div>

      {tab === 'help' && (
        <div className="px-4">
          <div className="flex items-center gap-3 bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-3 mb-4">
            <Search size={16} className="text-[#64748B]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for help" className="flex-1 bg-transparent text-[#111827] text-[15px] placeholder-[#94A3B8] outline-none" />
            {search && <button onClick={() => setSearch('')} aria-label="Clear"><X size={16} className="text-[#64748B]" /></button>}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No answers found" text="Try different words, or send us a request.">
              <button onClick={() => { setTitle(search); setTab('new'); }} className="bg-[#7C3AED] text-white px-5 py-2.5 rounded-full font-bold text-sm">Ask support</button>
            </EmptyState>
          ) : filtered.map((c) => (
            <div key={c.id} className="mb-3">
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full flex items-center justify-between px-4 py-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl active:bg-[#F1F5F9]">
                <span className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center"><c.Icon size={17} className="text-[#6D28D9]" /></span>
                  <span className="text-[#111827] font-bold text-[14px]">{c.title}</span>
                  <span className="text-[#64748B] text-[11px]">{c.items.length}</span>
                </span>
                <ChevronDown size={16} className={'text-[#64748B] transition-transform ' + ((open === c.id || search) ? 'rotate-180' : '')} />
              </button>
              {(open === c.id || search) && (
                <div className="mt-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden">
                  {c.items.map(([q, a], i) => <Faq key={c.id + i} id={c.id + i} q={q} a={a} />)}
                </div>
              )}
            </div>
          ))}

          <div className="mt-5 bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-2xl p-4">
            <p className="text-[#111827] font-bold text-[15px]">Still need help?</p>
            <p className="text-[#64748B] text-[13px] mt-1">Send us a request and our team will reply here in the app.</p>
            <button onClick={() => setTab('new')} className="mt-3 bg-[#7C3AED] text-white font-bold text-sm px-5 py-2.5 rounded-full">Contact support</button>
            {(SUPPORT_EMAIL || SUPPORT_WHATSAPP) && (
              <div className="flex gap-2 mt-3">
                {SUPPORT_EMAIL && <a href={`mailto:${SUPPORT_EMAIL}`} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F1F5F9] text-[#111827] text-[13px] font-semibold"><Mail size={14} /> Email</a>}
                {SUPPORT_WHATSAPP && <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#F1F5F9] text-[#111827] text-[13px] font-semibold"><MessageCircle size={14} /> WhatsApp</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'new' && (
        <div className="px-4">
          {sentId ? (
            <EmptyState icon={CheckCircle2} color="#10B981" title="Request sent" text={`Reference ${sentId}. We will reply in My requests. You will get a notification when something changes.`}>
              <button onClick={() => { setSentId(''); setTab('mine'); }} className="bg-[#7C3AED] text-white px-5 py-2.5 rounded-full font-bold text-sm">View my requests</button>
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {TYPES.map(({ key, label, Icon }) => (
                  <button key={key} onClick={() => setType(key)}
                    className={'flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-[12px] font-bold ' + (type === key ? 'bg-[#7C3AED]/15 border-[#7C3AED]/50 text-[#6D28D9]' : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]')}>
                    <Icon size={18} className={type === key ? 'text-[#6D28D9]' : ''} /> {label}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider block mb-1.5">Title</label>
                <input value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setErr(''); }}
                  placeholder={type === 'payment' ? 'e.g. Paid for Pro but not active' : type === 'bug' ? 'e.g. Photos will not upload' : type === 'feature' ? 'e.g. Polls on posts' : 'What do you need help with?'}
                  className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-3.5 text-[#111827] text-[15px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60" />
              </div>
              <div>
                <label className="text-[#64748B] text-[11px] font-bold uppercase tracking-wider block mb-1.5">Details</label>
                <textarea value={desc} rows={5} maxLength={2000} onChange={(e) => { setDesc(e.target.value); setErr(''); }}
                  placeholder={type === 'payment' ? 'Include the M-Pesa transaction code and the amount.' : type === 'bug' ? 'What happened, and what did you expect? Steps help a lot.' : 'Tell us more.'}
                  className="w-full bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl px-4 py-3.5 text-[#111827] text-[14px] placeholder-[#94A3B8] focus:outline-none focus:border-[#7C3AED]/60 resize-none" />
                <p className="text-right text-[#64748B] text-xs mt-0.5">{desc.length}/2000</p>
              </div>

              {shotUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-[#E2E8F0]">
                  <img src={shotUrl} alt="" className="w-full max-h-44 object-cover" />
                  <button onClick={() => { setShot(null); setShotUrl(''); }} aria-label="Remove screenshot" className="absolute top-2 right-2 w-8 h-8 bg-black/70 rounded-full flex items-center justify-center"><X size={14} color="white" /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-2.5 border border-dashed border-[#E2E8F0] rounded-2xl py-4 text-[#64748B] text-sm"><Paperclip size={17} /> Attach a screenshot (optional)</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickShot} />

              <button onClick={() => setDiag((v) => !v)} className="w-full flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl px-4 py-3 text-left">
                <span className={'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ' + (diag ? 'bg-[#7C3AED] border-[#7C3AED]' : 'border-[#E2E8F0]')}>{diag && <Check size={13} className="text-white" />}</span>
                <span className="flex-1"><span className="block text-[#111827] text-[13px] font-semibold">Include technical details</span><span className="block text-[#64748B] text-[11px]">App version, device and connection speed. Helps us fix problems faster.</span></span>
              </button>

              {err && <p className="text-red-600 text-sm">{err}</p>}
              <button onClick={submit} disabled={busy} className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#7C3AED', boxShadow: '0 8px 24px rgba(124,58,237,0.3)' }}>
                {busy ? <><Spinner size={18} /> Sending…</> : <><Send size={17} /> Send request</>}
              </button>
              <p className="text-[#64748B] text-[11px] text-center">Signed in as @{profile?.username}. Replies appear in My requests.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="px-4">
          {tickets === null ? <div className="flex justify-center py-12 text-[#6D28D9]"><Spinner size={22} /></div>
            : tickets.length === 0 ? (
              <EmptyState icon={Inbox} title="No requests yet" text="Questions, problems and ideas you send appear here, with our replies.">
                <button onClick={() => setTab('new')} className="bg-[#7C3AED] text-white px-5 py-2.5 rounded-full font-bold text-sm">New request</button>
              </EmptyState>
            ) : tickets.map((t) => {
              const st = STATUS[t.status] || { color: '#64748B', label: t.status };
              const T = TYPES.find((x) => x.key === t.type) || TYPES[0];
              const isOpen = expanded === t.id;
              return (
                <button key={t.id} onClick={() => setExpanded(isOpen ? null : t.id)} className="w-full text-left bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 mb-2.5 active:bg-[#F1F5F9]">
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center flex-shrink-0"><T.Icon size={16} className="text-[#6D28D9]" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111827] font-bold text-[14px] truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.color + '22', border: '1px solid ' + st.color + '44' }}>{st.label}</span>
                        <span className="text-[#64748B] text-[11px] flex items-center gap-1"><Clock size={11} /> {new Date(t.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    </div>
                    <ChevronDown size={16} className={'text-[#64748B] mt-1 transition-transform ' + (isOpen ? 'rotate-180' : '')} />
                  </div>
                  {isOpen && (
                    <div className="mt-3 space-y-2.5">
                      <p className="text-[#64748B] text-[13px] leading-relaxed whitespace-pre-wrap">{t.description}</p>
                      {t.screenshot_url && <img src={t.screenshot_url} alt="Screenshot" className="rounded-xl max-h-40 object-cover" loading="lazy" />}
                      {t.admin_notes && (
                        <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/25 rounded-xl px-3 py-2.5">
                          <p className="text-[#6D28D9] text-[11px] font-bold">Reply from support</p>
                          <p className="text-[#111827] text-[13px] mt-0.5 whitespace-pre-wrap">{t.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
