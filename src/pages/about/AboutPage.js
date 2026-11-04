import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  ArrowLeft, ExternalLink, Mail, MessageCircle,
  Copy, CheckCircle, ChevronRight,
} from 'lucide-react';

const APP_VERSION  = '2.0.0';
const BUILD_DATE   = '2025';
const SUPPORT_EMAIL = 'bilgates072@gmail.com';
const WA_LINK       = 'https://wa.me/254740309980';

const FEATURES = [
  { emoji:'📸', title:'Posts',         desc:'Share photos, videos, and thoughts with your community' },
  { emoji:'💬', title:'Chats',         desc:'Real-time messaging with reactions and media sharing'   },
  { emoji:'🔔', title:'Notifications', desc:'Stay updated with instant activity notifications'        },
  { emoji:'📊', title:'Status',        desc:'Share moments that last 24 hours with your followers'   },
  { emoji:'🪙', title:'Coins & Wallet',desc:'In-app currency for reactions, gifts, and boosts'       },
  { emoji:'💼', title:'Business Tools',desc:'Analytics, ads, and contact tools for brands'           },
];

const LEGAL_LINKS = [
  {
    label: 'Privacy Policy',
    icon:  '🔒',
    text: `B-Link Privacy Policy

Last updated: 2025

1. Data We Collect
We collect your name, email, username, profile photo, posts, messages, and usage data when you use B-Link.

2. How We Use Your Data
Your data is used to provide B-Link services, personalise your experience, and improve the platform. We do not sell your personal data to third parties.

3. Data Storage
Your data is stored securely using Supabase (PostgreSQL) with row-level security. Media is stored on Cloudinary.

4. Your Rights
You may request your data, update your information, or delete your account at any time via Settings.

5. Cookies
We use cookies and localStorage for session management and user preferences only.

6. Contact
For privacy concerns, email bilgates072@gmail.com.

© ${BUILD_DATE} B-Link. All rights reserved.`,
  },
  {
    label: 'Terms of Service',
    icon:  '📋',
    text: `B-Link Terms of Service

Last updated: 2025

1. Acceptance
By using B-Link, you agree to these terms. If you do not agree, do not use the app.

2. Acceptable Use
You must not: post illegal content, harass other users, spam, impersonate others, or attempt to hack the platform.

3. Content Ownership
You retain ownership of content you post. By posting, you grant B-Link a non-exclusive licence to display your content on the platform.

4. Account Termination
B-Link may suspend or delete accounts that violate these terms without prior notice.

5. Payments
All payments are final and non-refundable unless otherwise stated. Services activate only after admin verification of M-Pesa payments.

6. Liability
B-Link is provided "as is." We are not liable for data loss, service interruptions, or user disputes.

7. Changes
We may update these terms. Continued use after changes means you accept the new terms.

Contact: bilgates072@gmail.com`,
  },
  {
    label: 'Community Guidelines',
    icon:  '🌍',
    text: `B-Link Community Guidelines

We want B-Link to be a safe, positive, and creative space for all African GenZ users.

✅ Do:
• Be respectful and kind to other users
• Share original and creative content
• Use hashtags to help your content get discovered
• Report violations using the report button
• Support fellow creators with reactions and comments

🚫 Don't:
• Post hateful, racist, or discriminatory content
• Bully, harass, or threaten other users
• Share explicit sexual or violent content
• Spread misinformation or fake news
• Impersonate other users or public figures
• Spam or post repetitive promotional content
• Share personal information of others without consent

Violations may result in content removal, account restriction, suspension, or permanent ban depending on severity.

Report violations using the ⋯ menu on any post or the Help Center.

Together we build a better community. 🌍`,
  },
];

const LIBRARIES = [
  { name:'React',                    purpose:'UI framework',               link:'https://react.dev' },
  { name:'React Router',             purpose:'Client-side navigation',     link:'https://reactrouter.com' },
  { name:'Supabase',                 purpose:'Database & authentication',  link:'https://supabase.com' },
  { name:'Cloudinary',               purpose:'Media storage & CDN',        link:'https://cloudinary.com' },
  { name:'Tailwind CSS',             purpose:'Utility-first styling',      link:'https://tailwindcss.com' },
  { name:'Lucide React',             purpose:'Icon library',               link:'https://lucide.dev' },
  { name:'Vercel',                   purpose:'Hosting & deployment',       link:'https://vercel.com' },
];

/* ── Legal text modal ── */
function LegalModal({ item, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-[#171614] border-t border-white/10 rounded-t-3xl p-5 pb-8 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <p className="text-white font-bold text-base">{item.icon} {item.label}</p>
          <button onClick={onClose} className="text-[#8E8C88] hover:text-white text-lg font-bold">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <pre className="text-white/70 text-[12px] leading-relaxed whitespace-pre-wrap font-sans">{item.text}</pre>
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  const [memberCount,   setMemberCount]   = useState(null);
  const [apiStatus,     setApiStatus]     = useState('checking'); // checking | online | offline
  const [copiedEmail,   setCopiedEmail]   = useState(false);
  const [legalModal,    setLegalModal]    = useState(null);

  useEffect(() => {
    fetchMemberCount();
    checkApiStatus();
  }, []);

  const fetchMemberCount = async () => {
    const { count } = await supabase.from('users')
      .select('id', { count:'exact', head:true }).neq('is_banned', true);
    setMemberCount(count || 0);
  };

  const checkApiStatus = async () => {
    try {
      const start = Date.now();
      await supabase.from('users').select('id', { count:'exact', head:true }).limit(1);
      const ms = Date.now() - start;
      setApiStatus(ms < 2000 ? 'online' : 'slow');
    } catch {
      setApiStatus('offline');
    }
  };

  const copyEmail = async () => {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const statusColor = apiStatus === 'online' ? '#2ECC71' : apiStatus === 'slow' ? '#FFD700' : '#EF4444';
  const statusLabel = apiStatus === 'online' ? '● Online' : apiStatus === 'slow' ? '● Slow' : '● Offline';

  return (
    <div className="min-h-screen bg-[#0D0C0B] pb-24">

      {/* Legal modal */}
      {legalModal && <LegalModal item={legalModal} onClose={() => setLegalModal(null)} />}

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#0D0C0B]/97 backdrop-blur-md border-b border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8E8C88] hover:text-white transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-[15px]">About B-Link</h1>
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
        <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-[#FF5A1F] to-[#FF2D78] flex items-center justify-center shadow-2xl shadow-[#FF5A1F]/40 mb-4">
          <span className="text-white font-black text-4xl">B</span>
        </div>
        <h2 className="text-white font-black text-3xl tracking-tight mb-1">B-Link</h2>
        <p className="text-transparent font-bold text-sm mb-1"
          style={{ background:'linear-gradient(90deg,#FF5A1F,#FF6B35,#FFD700)', WebkitBackgroundClip:'text', backgroundClip:'text' }}>
          Africa's GenZ Social Platform
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-white/30 text-xs bg-white/[0.06] px-3 py-1 rounded-full">v{APP_VERSION}</span>
          <span className="text-white/30 text-xs bg-white/[0.06] px-3 py-1 rounded-full">Build {BUILD_DATE}</span>
          {memberCount !== null && (
            <span className="text-white/30 text-xs bg-white/[0.06] px-3 py-1 rounded-full">{memberCount.toLocaleString()} members</span>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* Description */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-2">What is B-Link?</p>
          <p className="text-white/60 text-[13px] leading-relaxed">
            B-Link is a fast, modern social media platform built specifically for African GenZ users. Connect with friends, share moments, discover trending content, and grow your personal or business brand — all in one place.
          </p>
        </div>

        {/* Mission */}
        <div className="bg-gradient-to-br from-[#FF5A1F]/10 to-[#FF2D78]/10 border border-[#FF5A1F]/20 rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-2">🎯 Our Mission</p>
          <p className="text-white/65 text-[13px] leading-relaxed">
            To connect millions of young Africans in a fast, lightweight, and genuinely African social platform — built by Africans, for Africans. Every feature is designed to work well even on limited data connections.
          </p>
        </div>

        {/* Features */}
        <div>
          <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest mb-3">Platform Features</p>
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-3">
                <p className="text-2xl mb-2">{f.emoji}</p>
                <p className="text-white font-bold text-[13px]">{f.title}</p>
                <p className="text-white/40 text-[11px] mt-0.5 leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legal */}
        <div>
          <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest mb-2">Legal</p>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            {LEGAL_LINKS.map((item, i) => (
              <div key={item.label}>
                <button
                  onClick={() => setLegalModal(item)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.05] transition-colors text-left"
                >
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <span className="flex-1 text-white/80 font-semibold text-[14px]">{item.label}</span>
                  <ExternalLink size={14} className="text-[#8E8C88] flex-shrink-0" />
                </button>
                {i < LEGAL_LINKS.length - 1 && <div className="h-px bg-white/[0.06] mx-4" />}
              </div>
            ))}
          </div>
        </div>

        {/* Technical info */}
        <div>
          <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest mb-2">Technical Info</p>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <p className="text-white/60 text-[13px]">App Version</p>
              <p className="text-white font-bold text-[13px]">{APP_VERSION}</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <p className="text-white/60 text-[13px]">Platform</p>
              <p className="text-white font-bold text-[13px]">Web (React PWA)</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <p className="text-white/60 text-[13px]">Database</p>
              <p className="text-white font-bold text-[13px]">Supabase (PostgreSQL)</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <p className="text-white/60 text-[13px]">Hosting</p>
              <p className="text-white font-bold text-[13px]">Vercel</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-white/60 text-[13px]">API Status</p>
              <button onClick={checkApiStatus} className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Libraries */}
        <div>
          <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest mb-2">Open Source Libraries</p>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            {LIBRARIES.map((lib, i) => (
              <div key={lib.name}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-[13px]">{lib.name}</p>
                    <p className="text-[#8E8C88] text-[11px]">{lib.purpose}</p>
                  </div>
                  <a href={lib.link} target="_blank" rel="noopener noreferrer"
                    className="text-[#FF5A1F] flex-shrink-0 p-1 hover:text-[#d9480f]">
                    <ExternalLink size={14} />
                  </a>
                </div>
                {i < LIBRARIES.length - 1 && <div className="h-px bg-white/[0.06] mx-4" />}
              </div>
            ))}
          </div>
        </div>

        {/* Credits */}
        <div className="bg-gradient-to-br from-[#FFD700]/10 to-[#FF6B35]/10 border border-[#FFD700]/20 rounded-2xl p-5 text-center">
          <p className="text-3xl mb-3">👑</p>
          <p className="text-white font-black text-lg mb-1">Built by Bilgate Mukhayo</p>
          <p className="text-white/50 text-sm mb-1">CEO & Lead Developer, B-Link</p>
          <p className="text-white/30 text-xs mb-3">Kibabii University · BIT Year 2 · Kenya 🇰🇪</p>
          <p className="text-white/40 text-xs leading-relaxed">
            B-Link is a solo-built African social media platform crafted with passion, designed for GenZ, and built to scale.
          </p>
        </div>

        {/* Contact */}
        <div>
          <p className="text-[#8E8C88] text-[11px] font-bold uppercase tracking-widest mb-2">Contact</p>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
              <div className="w-9 h-9 rounded-xl bg-[#FF5A1F]/15 flex items-center justify-center flex-shrink-0">
                <Mail size={16} className="text-[#FF5A1F]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-[11px] font-bold uppercase">Email</p>
                <p className="text-white text-[13px] font-semibold truncate">{SUPPORT_EMAIL}</p>
              </div>
              <button onClick={copyEmail} className="flex-shrink-0 flex items-center gap-1 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-xl transition-colors">
                {copiedEmail
                  ? <><CheckCircle size={12} className="text-green-400" /><span className="text-green-400 text-xs font-bold">Copied</span></>
                  : <><Copy size={12} className="text-white/60" /><span className="text-white/60 text-xs">Copy</span></>
                }
              </button>
            </div>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                <MessageCircle size={16} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/60 text-[11px] font-bold uppercase">WhatsApp Support</p>
                <p className="text-white text-[13px] font-semibold">+254 740 309 980</p>
              </div>
              <ExternalLink size={15} className="text-[#8E8C88] flex-shrink-0" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-white/20 text-[11px]">© {BUILD_DATE} B-Link · Made with ❤️ for Africa</p>
          <p className="text-white/10 text-[10px] mt-1">All rights reserved · bilgates072@gmail.com</p>
        </div>
      </div>
    </div>
  );
}