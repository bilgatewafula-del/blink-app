import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, X, Mail, MessageCircle, LifeBuoy, ChevronRight, Share2, Download, RefreshCw, Smartphone, CheckCircle2,
  FileText, ShieldCheck, ScrollText, Image as ImageIcon, CircleDot, Coins, Briefcase, Bell, Target, Users,
} from 'lucide-react';
import {
  APP_NAME, APP_TAGLINE, APP_VERSION, SUPPORT_EMAIL, SUPPORT_WHATSAPP, LEGAL_UPDATED,
} from '../../config/appInfo';
import { useInstallPrompt, isInstalled, isIos, reloadLatest } from '../../lib/pwa';
import { goBack } from '../../lib/nav';

const FEATURES = [
  { Icon: ImageIcon, title: 'Posts', desc: 'Share photos, videos and thoughts with your community' },
  { Icon: MessageCircle, title: 'Chats', desc: 'Private messaging with reactions and photos' },
  { Icon: CircleDot, title: 'Status', desc: 'Moments for your friends that last 24 hours' },
  { Icon: Users, title: 'Friends', desc: 'Follow each other to become friends' },
  { Icon: Coins, title: 'Coins and wallet', desc: 'Support creators and boost your posts' },
  { Icon: Briefcase, title: 'Business tools', desc: 'Insights and tools for brands' },
  { Icon: Bell, title: 'Notifications', desc: 'Stay updated, your way' },
  { Icon: ShieldCheck, title: 'Safety', desc: 'Block, mute, report and two-step verification' },
];

const LEGAL = [
  {
    key: 'privacy', label: 'Privacy Policy', Icon: ShieldCheck,
    text: `${APP_NAME} Privacy Policy
Last updated: ${LEGAL_UPDATED}

1. What we collect
Your name, username, email or phone number, profile photo, posts, comments, messages, statuses and basic usage information such as when you were last active.

2. How we use it
To run ${APP_NAME}, keep your account safe, show you relevant content, prevent abuse and improve the service. We do not sell your personal data.

3. Who can see what
Your profile and public posts can be seen by other members. Statuses are visible only to your friends. Messages are visible only to the people in the conversation. You control who can message, comment on and follow you in Settings.

4. Storage and security
Your data is stored with trusted infrastructure providers and protected with access controls and encryption in transit. We also offer two-step verification.

5. Your choices
You can edit your information, download your data, deactivate or permanently delete your account in Settings at any time.

6. Children
${APP_NAME} is not intended for people under 13.

7. Contact
Use the Help Center in the app and choose "New request".`,
  },
  {
    key: 'terms', label: 'Terms of Service', Icon: ScrollText,
    text: `${APP_NAME} Terms of Service
Last updated: ${LEGAL_UPDATED}

1. Acceptance
By using ${APP_NAME} you agree to these terms.

2. Acceptable use
Do not post illegal content, harass others, spam, impersonate people, attempt to hack the service, or try to access accounts that are not yours.

3. Your content
You keep ownership of what you post. You give ${APP_NAME} a licence to display it on the platform. You are responsible for what you share.

4. Accounts
Keep your sign-in details private. We may restrict, suspend or remove accounts that break these terms.

5. Payments
Payments for coins, plans and boosts are final unless stated otherwise. Services start after the payment is verified.

6. Service
${APP_NAME} is provided "as is". We work hard to keep it available but cannot promise it will never be interrupted.

7. Changes
We may update these terms. Continuing to use the app means you accept the new terms.`,
  },
  {
    key: 'guidelines', label: 'Community Guidelines', Icon: FileText,
    text: `${APP_NAME} Community Guidelines

We want ${APP_NAME} to be a safe, positive and creative space for young Africans.

Do
- Be respectful and kind
- Share original, creative content
- Report anything that breaks these rules
- Support other creators

Don't
- Post hateful, racist or discriminatory content
- Bully, harass or threaten anyone
- Share explicit sexual or violent content
- Spread misinformation
- Impersonate other people
- Spam or repeat promotions
- Share other people's private information

Breaking these rules can lead to content removal, restriction, suspension or a permanent ban depending on how serious it is.`,
  },
];

function Sheet({ item, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-[540px] bg-white border-t border-[#E2E8F0] rounded-t-3xl p-5 pb-8 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <p className="text-[#111827] font-bold text-base flex items-center gap-2"><item.Icon size={18} className="text-[#6D28D9]" /> {item.label}</p>
          <button onClick={onClose} aria-label="Close" className="text-[#64748B] p-1"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <pre className="text-[#64748B] text-[13px] leading-relaxed whitespace-pre-wrap font-sans">{item.text}</pre>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, sub, onClick, href, right }) {
  const inner = (
    <>
      <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center flex-shrink-0"><Icon size={17} className="text-[#6D28D9]" /></span>
      <span className="flex-1 min-w-0 text-left"><span className="block text-[#111827] font-semibold text-[14px]">{label}</span>{sub && <span className="block text-[#64748B] text-[12px] mt-0.5">{sub}</span>}</span>
      {right || <ChevronRight size={16} className="text-[#64748B]" />}
    </>
  );
  const cls = 'w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F1F5F9]';
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <button onClick={onClick} className={cls}>{inner}</button>;
}

export default function AboutPage() {
  const navigate = useNavigate();
  const [legal, setLegal] = useState(null);
  const [toast, setToast] = useState('');
  const { canInstall, install } = useInstallPrompt();
  const installed = isInstalled();

  const say = (t) => { setToast(t); setTimeout(() => setToast(''), 2400); };
  const share = async () => {
    const url = window.location.origin;
    try { if (navigator.share) await navigator.share({ title: APP_NAME, text: `Join me on ${APP_NAME}`, url }); else { await navigator.clipboard.writeText(url); say('Link copied'); } } catch { /* cancelled */ }
  };

  return (
    <div className="min-h-screen bg-[#F1F3F9] pb-24">
      {toast && <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-[#111827] text-white text-[13px] font-semibold rounded-full px-5 py-2.5 shadow-xl">{toast}</div>}
      {legal && <Sheet item={legal} onClose={() => setLegal(null)} />}

      <div className="sticky top-0 z-20 bg-[#11152E] px-4 py-3 flex items-center gap-3">
        <button onClick={() => goBack(navigate, '/')} aria-label="Back" className="text-[#CBD5E1] hover:text-white"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-[16px]">About {APP_NAME}</h1>
      </div>

      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
        <div className="w-24 h-24 rounded-[28px] bg-[#7C3AED] flex items-center justify-center   mb-4">
          <span className="text-[#111827] font-black text-4xl">B</span>
        </div>
        <h2 className="text-[#111827] font-black text-3xl tracking-tight">{APP_NAME}</h2>
        <p className="text-[#6D28D9] font-semibold text-sm mt-1">{APP_TAGLINE}</p>
        <span className="text-[#94A3B8] text-xs bg-[#F1F5F9] px-3 py-1 rounded-full mt-3">Version {APP_VERSION}</span>
      </div>

      <div className="px-4 space-y-4">
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4">
          <p className="text-[#111827] font-bold text-sm mb-2">What is {APP_NAME}?</p>
          <p className="text-[#64748B] text-[13px] leading-relaxed">
            {APP_NAME} is a fast, modern social platform made for young Africans. Connect with friends, share moments, discover what is trending and grow your personal or business brand, all in one place.
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-2xl p-4">
          <p className="text-[#111827] font-bold text-sm mb-2 flex items-center gap-2"><Target size={16} className="text-[#6D28D9]" /> Our mission</p>
          <p className="text-[#64748B] text-[13px] leading-relaxed">
            To connect millions of young Africans on a fast, lightweight platform that works well even on limited data, built for the way Africa actually uses the internet.
          </p>
        </div>

        <div>
          <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-widest mb-3">What you can do</p>
          <div className="grid grid-cols-2 gap-2">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-3">
                <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center mb-2"><Icon size={17} className="text-[#6D28D9]" /></span>
                <p className="text-[#111827] font-bold text-[13px]">{title}</p>
                <p className="text-[#94A3B8] text-[11px] mt-0.5 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-widest mb-2">The app</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden divide-y divide-[#E2E8F0]">
            {installed ? (
              <Row icon={Smartphone} label="Installed on this device" right={<CheckCircle2 size={18} className="text-[#10B981]" />} onClick={() => {}} />
            ) : canInstall ? (
              <Row icon={Download} label={`Install ${APP_NAME}`} sub="Add it to your home screen for a full-screen app" onClick={async () => { if (await install()) say('Installed'); }} />
            ) : isIos() ? (
              <Row icon={Download} label={`Install ${APP_NAME}`} sub="Tap Share, then Add to Home Screen" onClick={() => say('Tap Share, then Add to Home Screen')} />
            ) : null}
            <Row icon={RefreshCw} label="Get the latest version" sub="Reloads the app with the newest updates" onClick={reloadLatest} />
            <Row icon={Share2} label={`Invite friends to ${APP_NAME}`} onClick={share} />
          </div>
        </div>

        <div>
          <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-widest mb-2">Legal</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden divide-y divide-[#E2E8F0]">
            {LEGAL.map((l) => <Row key={l.key} icon={l.Icon} label={l.label} onClick={() => setLegal(l)} />)}
          </div>
        </div>

        <div>
          <p className="text-[#64748B] text-[11px] font-bold uppercase tracking-widest mb-2">Need help?</p>
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl overflow-hidden divide-y divide-[#E2E8F0]">
            <Row icon={LifeBuoy} label="Help Center" sub="Answers, and contact support" onClick={() => navigate('/help')} />
            {SUPPORT_EMAIL && <Row icon={Mail} label="Email support" sub={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />}
            {SUPPORT_WHATSAPP && <Row icon={MessageCircle} label="WhatsApp support" href={`https://wa.me/${SUPPORT_WHATSAPP}`} />}
          </div>
        </div>

        <p className="text-center text-[#94A3B8] text-[11px] pt-2 pb-4">© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
      </div>
    </div>
  );
}
