import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, Mail, MessageCircle, Bug, Lightbulb,
  ChevronDown, ChevronUp, ExternalLink, Send,
  CheckCircle, Clock, X, Image as ImageIcon,
} from 'lucide-react';

/* ── FAQ data ── */
const FAQ = [
  {
    category: 'Account Issues',
    emoji: '👤',
    questions: [
      { q: 'How do I reset my password?', a: 'Go to Settings → Change Password. Enter your new password (min 8 characters) and confirm. The change takes effect immediately.' },
      { q: 'Why is my account restricted?', a: 'Your account may be restricted due to a policy violation. Check your notifications for details from our admin team, or contact support.' },
      { q: 'How do I delete my account?', a: 'Go to Settings → Delete Account. Type DELETE to confirm. This permanently removes all your data and cannot be undone.' },
      { q: 'Can I change my username?', a: 'Yes. Go to Settings → Edit Profile → Username. You can update it anytime, but it must be unique and 3–20 characters long.' },
    ],
  },
  {
    category: 'Posts',
    emoji: '📸',
    questions: [
      { q: 'Why can\'t I see my post in the feed?', a: 'Make sure your post audience is set to "Public." Private posts only appear to you. Also check your internet connection and try refreshing.' },
      { q: 'How do I delete a post?', a: 'Tap the ⋯ (three dots) on your post → Delete Post → Confirm. The post and all its likes/comments are permanently removed.' },
      { q: 'Can I edit a post after posting?', a: 'Yes. Tap the ⋯ on your post → Edit Post. You can update the caption, audience, and hashtags.' },
      { q: 'What media formats are supported?', a: 'Images: JPG, PNG, WEBP (up to 10 per post, max 5MB each). Videos: MP4, MOV (max 100MB). All media is automatically compressed before upload.' },
    ],
  },
  {
    category: 'Chats',
    emoji: '💬',
    questions: [
      { q: 'Why can\'t I send a message?', a: 'The user may have restricted who can message them. Check your privacy settings or try again. If you\'re not following each other, messaging may be limited.' },
      { q: 'How do I delete a conversation?', a: 'Open the chat → tap the settings icon → Delete Conversation. This removes it from your side only.' },
      { q: 'Are messages end-to-end encrypted?', a: 'Messages are stored securely in our Supabase database. We do not sell or share your message content with third parties.' },
    ],
  },
  {
    category: 'Notifications',
    emoji: '🔔',
    questions: [
      { q: 'How do I turn off notifications?', a: 'Go to Settings → Notifications. Toggle off whichever notification types you don\'t want (likes, comments, followers, messages, mentions).' },
      { q: 'I\'m not receiving notifications', a: 'Check Settings → Notifications and make sure the relevant types are turned on. Also ensure your browser/device has notification permissions enabled for B-Link.' },
      { q: 'What does "pending" mean on a notification?', a: 'For payment notifications, "pending" means your payment is awaiting admin verification. For follow requests, it means the user hasn\'t accepted yet.' },
    ],
  },
  {
    category: 'Payments',
    emoji: '💰',
    questions: [
      { q: 'How do I pay for a subscription or coins?', a: 'Go to Premium → select what you want → Follow the M-Pesa instructions. Pay to Till 4766037 (BILGATE WAFULA MUKHAYO), then fill in your phone and the exact amount paid.' },
      { q: 'My payment is still pending', a: 'Payments are verified manually. This takes 5–60 minutes during business hours. If it\'s been over 2 hours, contact support with your reference code.' },
      { q: 'I paid but my service didn\'t activate', a: 'Your service activates ONLY after an admin verifies your M-Pesa payment. If not activated after 1 hour, contact support with your reference code (starts with BLK).' },
      { q: 'Can I get a refund?', a: 'Refunds are handled case-by-case. Contact support at bilgates072@gmail.com with your reference code and reason. Coins and verified badges are non-refundable once activated.' },
    ],
  },
  {
    category: 'Privacy',
    emoji: '🔒',
    questions: [
      { q: 'Who can see my profile?', a: 'By default, your profile is public. Go to Settings → Privacy → Private Account to restrict to followers only.' },
      { q: 'How do I block someone?', a: 'Open a post by that user → ⋯ menu → Block User. Or go to their profile → Block. Blocked users cannot see your content or message you.' },
      { q: 'How do I mute someone?', a: 'Open a post by that user → ⋯ menu → Mute User. Their posts won\'t appear in your feed, but they won\'t know they\'re muted.' },
      { q: 'Does B-Link sell my data?', a: 'No. B-Link does not sell your personal data to advertisers or third parties. See our Privacy Policy for full details.' },
    ],
  },
];

/* ── FAQ item component ── */
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <p className="text-white/85 text-[14px] font-medium leading-snug flex-1">{q}</p>
        {open ? <ChevronUp size={16} className="text-[#8E8C88] flex-shrink-0 mt-0.5" /> : <ChevronDown size={16} className="text-[#8E8C88] flex-shrink-0 mt-0.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-white/55 text-[13px] leading-relaxed bg-white/[0.03] rounded-xl p-3">{a}</p>
        </div>
      )}
    </div>
  );
}

/* ── Ticket status badge ── */
function StatusBadge({ status }) {
  const cfg = {
    open:     { color:'#EF4444', bg:'rgba(239,68,68,0.15)',  label:'Open'     },
    pending:  { color:'#FFD700', bg:'rgba(255,215,0,0.15)',  label:'Pending'  },
    resolved: { color:'#2ECC71', bg:'rgba(46,204,113,0.15)', label:'Resolved' },
  }[status] || { color:'#8E8C88', bg:'rgba(138,138,148,0.15)', label:status };
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   MAIN HELP CENTER PAGE
═══════════════════════════════════════════════ */
export default function HelpCenter() {
  const navigate         = useNavigate();
  const { user, profile } = useAuth();

  const [activeTab,    setActiveTab]    = useState('faq');    // faq | bug | feature | tickets
  const [tickets,      setTickets]      = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Bug report form
  const [bugTitle,     setBugTitle]     = useState('');
  const [bugDesc,      setBugDesc]      = useState('');
  const [bugScreenshot,setBugScreenshot]= useState(null);
  const [bugPreview,   setBugPreview]   = useState(null);
  const [bugBusy,      setBugBusy]      = useState(false);
  const [bugDone,      setBugDone]      = useState(false);
  const [bugError,     setBugError]     = useState('');

  // Feature request form
  const [featTitle,    setFeatTitle]    = useState('');
  const [featDesc,     setFeatDesc]     = useState('');
  const [featBusy,     setFeatBusy]     = useState(false);
  const [featDone,     setFeatDone]     = useState(false);
  const [featError,    setFeatError]    = useState('');

  const [faqSearch,    setFaqSearch]    = useState('');
  const [openCategory, setOpenCategory] = useState(null);

  useEffect(() => {
    if (activeTab === 'tickets') fetchTickets();
  }, [activeTab]);

  const fetchTickets = async () => {
    setLoadingTickets(true);
    const { data } = await supabase.from('support_tickets')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20);
    setTickets(data || []);
    setLoadingTickets(false);
  };

  /* ── Device info ── */
  const getDeviceInfo = () => ({
    userAgent: navigator.userAgent,
    platform:  navigator.platform,
    language:  navigator.language,
    screen:    `${window.screen.width}×${window.screen.height}`,
    viewport:  `${window.innerWidth}×${window.innerHeight}`,
    online:    navigator.onLine,
  });

  /* ── Upload screenshot ── */
  const uploadScreenshot = async (file) => {
    const formData = new FormData();
    formData.append('file',          file);
    formData.append('upload_preset', 'blink_uploads');
    formData.append('cloud_name',    process.env.REACT_APP_CLOUDINARY_CLOUD_NAME);
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/image/upload`, { method:'POST', body:formData });
    const data = await res.json();
    return data.secure_url || null;
  };

  /* ── Submit bug ── */
  const handleBugSubmit = async () => {
    if (!bugTitle.trim()) { setBugError('Enter a bug title.'); return; }
    if (!bugDesc.trim())  { setBugError('Describe the bug.'); return; }
    setBugBusy(true); setBugError('');

    let screenshotUrl = null;
    if (bugScreenshot) {
      try { screenshotUrl = await uploadScreenshot(bugScreenshot); } catch (_) {}
    }

    const { error } = await supabase.from('support_tickets').insert({
      user_id:     user.id,
      type:        'bug',
      title:       bugTitle.trim(),
      description: bugDesc.trim(),
      screenshot_url: screenshotUrl,
      device_info: getDeviceInfo(),
      status:      'open',
    });

    setBugBusy(false);
    if (error) { setBugError('Failed to submit. Try again.'); return; }

    // Notify admins
    const { data: admins } = await supabase.from('users').select('id').in('role',['blink','admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id:      a.id,
          from_user_id: user.id,
          type:         'admin_action',
          message:      `🐛 Bug report from @${profile?.username}: "${bugTitle.trim()}"`,
          is_read:      false,
        }))
      );
    }

    setBugDone(true);
    setBugTitle(''); setBugDesc(''); setBugScreenshot(null); setBugPreview(null);
    setTimeout(() => { setBugDone(false); setActiveTab('tickets'); }, 1500);
  };

  /* ── Submit feature request ── */
  const handleFeatSubmit = async () => {
    if (!featTitle.trim()) { setFeatError('Enter a feature title.'); return; }
    if (!featDesc.trim())  { setFeatError('Describe your feature.'); return; }
    setFeatBusy(true); setFeatError('');

    const { error } = await supabase.from('support_tickets').insert({
      user_id:     user.id,
      type:        'feature',
      title:       featTitle.trim(),
      description: featDesc.trim(),
      device_info: getDeviceInfo(),
      status:      'open',
    });

    setFeatBusy(false);
    if (error) { setFeatError('Failed to submit. Try again.'); return; }

    setFeatDone(true);
    setFeatTitle(''); setFeatDesc('');
    setTimeout(() => { setFeatDone(false); setActiveTab('tickets'); }, 1500);
  };

  // Filtered FAQ
  const filteredFAQ = faqSearch.trim()
    ? FAQ.map(cat => ({
        ...cat,
        questions: cat.questions.filter(
          item => item.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
                  item.a.toLowerCase().includes(faqSearch.toLowerCase())
        ),
      })).filter(cat => cat.questions.length > 0)
    : FAQ;

  const TABS = [
    { key:'faq',     label:'FAQ',     emoji:'❓' },
    { key:'bug',     label:'Bug',     emoji:'🐛' },
    { key:'feature', label:'Request', emoji:'💡' },
    { key:'tickets', label:'My Tickets', emoji:'📋' },
  ];

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-[15px] leading-none">Help Center</h1>
          <p className="text-[#8E8C88] text-xs mt-0.5">Support & FAQ</p>
        </div>
      </div>

      {/* Contact row */}
      <div className="mx-4 mt-4 mb-3 flex gap-2">
        <a href="mailto:bilgates072@gmail.com"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/25 text-[#FF5A1F] font-bold text-sm active:scale-95 transition-all">
          <Mail size={15} /> Email Support
        </a>
        <a href="https://wa.me/254740309980" target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500/15 border border-green-500/25 text-green-400 font-bold text-sm active:scale-95 transition-all">
          <MessageCircle size={15} /> WhatsApp
        </a>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mb-4 bg-white/[0.05] rounded-2xl p-1 gap-0.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={'flex-1 py-2 rounded-xl text-[11px] font-bold transition-all flex flex-col items-center gap-0.5 ' +
              (activeTab === t.key ? 'bg-[#FF5A1F] text-white shadow-lg shadow-[#FF5A1F]/30' : 'text-[#8E8C88] hover:text-white')}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── FAQ TAB ── */}
      {activeTab === 'faq' && (
        <div className="px-4">
          {/* Search */}
          <div className="flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-2.5 mb-4">
            <span className="text-[#8E8C88] text-sm">🔍</span>
            <input type="text" value={faqSearch} onChange={e => setFaqSearch(e.target.value)}
              placeholder="Search questions..."
              className="flex-1 bg-transparent text-white text-sm placeholder-[#8E8C88] focus:outline-none" />
            {faqSearch && <button onClick={() => setFaqSearch('')} className="text-[#8E8C88] hover:text-white"><X size={14} /></button>}
          </div>

          {filteredFAQ.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-white font-bold">No results for "{faqSearch}"</p>
              <p className="text-[#8E8C88] text-sm mt-1">Try different keywords</p>
            </div>
          ) : filteredFAQ.map(cat => (
            <div key={cat.category} className="mb-3">
              <button
                onClick={() => setOpenCategory(openCategory === cat.category ? null : cat.category)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl mb-1 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="text-white font-bold text-[14px]">{cat.category}</span>
                  <span className="text-[#8E8C88] text-[11px]">({cat.questions.length})</span>
                </div>
                {openCategory === cat.category ? <ChevronUp size={16} className="text-[#8E8C88]" /> : <ChevronDown size={16} className="text-[#8E8C88]" />}
              </button>

              {(openCategory === cat.category || faqSearch) && (
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
                  {cat.questions.map((item, i) => <FAQItem key={i} q={item.q} a={item.a} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── BUG REPORT ── */}
      {activeTab === 'bug' && (
        <div className="px-4">
          {bugDone ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-white font-black text-xl">Bug Reported!</p>
              <p className="text-[#8E8C88] text-sm mt-2">Thanks! Our team will investigate. Check My Tickets for updates.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-start gap-3">
                <Bug size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-orange-400 font-bold text-sm">Report a Bug</p>
                  <p className="text-orange-400/60 text-xs mt-0.5">Help us fix issues. Device info is auto-attached.</p>
                </div>
              </div>

              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Bug Title *</label>
                <input type="text" value={bugTitle} onChange={e => { setBugTitle(e.target.value); setBugError(''); }}
                  placeholder="e.g. Feed doesn't load on Chrome"
                  className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
              </div>

              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Description *</label>
                <textarea value={bugDesc} onChange={e => { setBugDesc(e.target.value); setBugError(''); }}
                  placeholder="Steps to reproduce:&#10;1. Open the app&#10;2. Go to...&#10;3. Bug occurs when..."
                  rows={5} maxLength={1000}
                  className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[14px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 resize-none" />
                <div className="flex justify-end mt-0.5">
                  <span className="text-[#8E8C88] text-xs">{bugDesc.length}/1000</span>
                </div>
              </div>

              {/* Screenshot upload */}
              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Screenshot (optional)</label>
                {bugPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-white/10">
                    <img src={bugPreview} alt="" className="w-full object-cover max-h-40" />
                    <button
                      onClick={() => { setBugScreenshot(null); setBugPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center hover:bg-red-500/70 transition-colors"
                    >
                      <X size={13} color="white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-3 border border-dashed border-white/20 rounded-2xl py-6 cursor-pointer hover:border-[#FF5A1F]/40 hover:bg-[#FF5A1F]/5 transition-all">
                    <ImageIcon size={20} className="text-[#8E8C88]" />
                    <span className="text-[#8E8C88] text-sm">Tap to attach screenshot</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setBugScreenshot(f); setBugPreview(URL.createObjectURL(f)); }
                      }} />
                  </label>
                )}
              </div>

              {/* Device info preview */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                <p className="text-[#8E8C88] text-[11px] font-bold uppercase mb-1">Auto-attached device info</p>
                <p className="text-white/40 text-[11px] font-mono">{navigator.platform} · {window.innerWidth}×{window.innerHeight} · {navigator.language}</p>
              </div>

              {bugError && <p className="text-red-400 text-sm">{bugError}</p>}

              <button onClick={handleBugSubmit} disabled={bugBusy}
                className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background:'linear-gradient(135deg,#FF6B35,#EF4444)', boxShadow:'0 8px 24px rgba(255,107,53,0.3)' }}>
                {bugBusy ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><Bug size={16} /> Submit Bug Report</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FEATURE REQUEST ── */}
      {activeTab === 'feature' && (
        <div className="px-4">
          {featDone ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">💡</p>
              <p className="text-white font-black text-xl">Feature Requested!</p>
              <p className="text-[#8E8C88] text-sm mt-2">Great idea! We'll review it. Check My Tickets for updates.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 rounded-2xl p-4 flex items-start gap-3">
                <Lightbulb size={18} className="text-[#FF5A1F] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#FF5A1F] font-bold text-sm">Request a Feature</p>
                  <p className="text-[#FF5A1F]/60 text-xs mt-0.5">Tell us what you'd like to see in B-Link.</p>
                </div>
              </div>

              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Feature Title *</label>
                <input type="text" value={featTitle} onChange={e => { setFeatTitle(e.target.value); setFeatError(''); }}
                  placeholder="e.g. Dark mode for stories"
                  className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[15px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60" />
              </div>

              <div>
                <label className="text-white/60 text-[11px] font-bold uppercase tracking-wider block mb-1.5">Description *</label>
                <textarea value={featDesc} onChange={e => { setFeatDesc(e.target.value); setFeatError(''); }}
                  placeholder="Describe your feature idea. How would it work? Why would it be useful?"
                  rows={5} maxLength={1000}
                  className="w-full bg-white/[0.07] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-[14px] placeholder-[#8E8C88] focus:outline-none focus:border-[#FF5A1F]/60 resize-none" />
                <div className="flex justify-end mt-0.5">
                  <span className="text-[#8E8C88] text-xs">{featDesc.length}/1000</span>
                </div>
              </div>

              {featError && <p className="text-red-400 text-sm">{featError}</p>}

              <button onClick={handleFeatSubmit} disabled={featBusy}
                className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background:'linear-gradient(135deg,#FF5A1F,#FF2D78)', boxShadow:'0 8px 24px rgba(255,90,31,0.3)' }}>
                {featBusy ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</> : <><Lightbulb size={16} /> Submit Feature Request</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MY TICKETS ── */}
      {activeTab === 'tickets' && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/60 text-xs font-bold uppercase tracking-wider">Your submitted tickets</p>
            <button onClick={fetchTickets} className="text-[#FF5A1F] text-xs font-bold">Refresh</button>
          </div>

          {loadingTickets ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-white font-bold">No tickets yet</p>
              <p className="text-[#8E8C88] text-sm mt-1">Submit a bug report or feature request above</p>
            </div>
          ) : tickets.map(t => (
            <div key={t.id} className={`border rounded-2xl p-4 mb-2 ${
              t.status === 'resolved' ? 'border-green-500/20 bg-green-500/[0.03]' :
              t.status === 'pending'  ? 'border-yellow-500/20 bg-yellow-500/[0.03]' :
              'border-white/[0.07] bg-white/[0.03]'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm">{t.type === 'bug' ? '🐛' : t.type === 'feature' ? '💡' : '🎫'}</span>
                    <p className="text-white font-bold text-[13px] truncate">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-white/50 text-[12px] line-clamp-2">{t.description}</p>
                  {t.admin_notes && (
                    <div className="mt-2 bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 rounded-xl px-3 py-2">
                      <p className="text-[#FF5A1F] text-[11px] font-bold">Admin response:</p>
                      <p className="text-white/70 text-[12px] mt-0.5">{t.admin_notes}</p>
                    </div>
                  )}
                  <p className="text-[#8E8C88] text-[11px] mt-1.5">
                    {new Date(t.created_at).toLocaleDateString('en-KE',{ day:'numeric', month:'short', year:'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}