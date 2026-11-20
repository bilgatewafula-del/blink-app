import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';

const FAQ_ITEMS = [
  {
    category: 'Account',
    questions: [
      {
        q: 'How do I change my username?',
        a: 'Go to Settings → Account Information → tap on your username and edit it. Usernames must be unique and at least 3 characters.',
      },
      {
        q: 'How do I make my account private?',
        a: 'Go to Settings → Privacy → toggle on "Private Account". Only approved followers will be able to see your posts.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Settings → Account Information → scroll to Danger Zone → Delete Account. This action is permanent and cannot be undone.',
      },
      {
        q: 'I forgot my password. What do I do?',
        a: 'On the login screen, tap "Forgot password?" and enter your email. We will send you a password reset link.',
      },
    ],
  },
  {
    category: 'Posts',
    questions: [
      {
        q: 'How do I delete a post?',
        a: 'Open the post, tap the three-dot menu (⋯) in the top right, then tap "Delete Post". This permanently removes the post.',
      },
      {
        q: 'Can I edit a post after publishing?',
        a: 'Post editing is coming soon. For now you can delete and repost with corrections.',
      },
      {
        q: 'How do I save a post?',
        a: 'Tap the bookmark icon (🔖) on any post to save it. View saved posts in your Profile → Saved tab.',
      },
      {
        q: 'What is the maximum post length?',
        a: 'Text posts support up to 500 characters. You can add up to 6 images per post.',
      },
    ],
  },
  {
    category: 'Chats',
    questions: [
      {
        q: 'How do I start a new chat?',
        a: 'Go to the Chats tab, tap the edit icon (✏️) in the top right, search for a user and tap their name to start chatting.',
      },
      {
        q: 'Can I delete a message?',
        a: 'Yes. Hover over any message you sent and tap the trash icon. The message will be replaced with "[Message deleted]" for both parties.',
      },
      {
        q: 'Are my messages encrypted?',
        a: 'All messages are transmitted securely over HTTPS and stored in our secure Supabase database with Row Level Security.',
      },
    ],
  },
  {
    category: 'Wallet & Tips',
    questions: [
      {
        q: 'How do I send a tip?',
        a: 'Go to any creator profile, tap "Tip", select an amount and confirm via M-Pesa STK push on your phone.',
      },
      {
        q: 'How do I withdraw my earnings?',
        a: 'Go to Drawer → Wallet → Withdraw tab. Enter your M-Pesa number and confirm. Withdrawals are processed within 24 hours.',
      },
      {
        q: 'What is the minimum tip amount?',
        a: 'The minimum tip is KES 10. There is no maximum limit.',
      },
      {
        q: 'How much does B-Link take from tips?',
        a: 'B-Link retains 15% of each tip to sustain the platform. The creator receives 85% directly to their M-Pesa.',
      },
    ],
  },
  {
    category: 'Verification',
    questions: [
      {
        q: 'How do I get verified?',
        a: 'Go to Drawer → Verification and follow the 3-step process. You will need a government ID and meet our eligibility criteria.',
      },
      {
        q: 'How long does verification take?',
        a: 'Our team reviews applications within 3–5 business days. You will receive a notification with the result.',
      },
      {
        q: 'How much does verification cost?',
        a: 'Personal badge: KES 200/month. Business badge: KES 500/month. Creator badge is free for eligible creators with 1K+ followers.',
      },
    ],
  },
];

const Help = () => {
  const navigate = useNavigate();

  const [openItem, setOpenItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Account');
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const currentFAQ = FAQ_ITEMS.find(
    (f) => f.category === activeCategory
  );

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-[#6B7280] hover:text-white"
        >
          <ArrowLeft size={22} />
        </button>

        <h1 className="text-white font-bold text-lg">
          Help Center
        </h1>
      </div>

      {/* Hero */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-[#1E6FFF]/20 to-[#7B2FFF]/20 border border-[#1E6FFF]/30 rounded-2xl p-5 text-center">
        <p className="text-3xl mb-2">👋</p>

        <h2 className="text-white font-bold text-lg">
          How can we help?
        </h2>

        <p className="text-[#6B7280] text-sm mt-1">
          Find answers to common questions below.
        </p>
      </div>

      {/* Categories */}
      <div
        className="flex gap-2 px-4 mt-4 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {FAQ_ITEMS.map((f) => (
          <button
            key={f.category}
            onClick={() => {
              setActiveCategory(f.category);
              setOpenItem(null);
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              activeCategory === f.category
                ? 'bg-[#1E6FFF] text-white'
                : 'bg-white/5 border border-white/10 text-[#6B7280]'
            }`}
          >
            {f.category}
          </button>
        ))}
      </div>

      {/* FAQ */}
      <div className="px-4 mt-4 space-y-2">
        {currentFAQ?.questions.map((item, idx) => (
          <div
            key={idx}
            className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
          >
            <button
              onClick={() =>
                setOpenItem(openItem === idx ? null : idx)
              }
              className="w-full flex items-center justify-between px-4 py-4 text-left"
            >
              <p className="text-white text-sm font-semibold pr-4">
                {item.q}
              </p>

              {openItem === idx ? (
                <ChevronUp
                  size={16}
                  className="text-[#1E6FFF] flex-shrink-0"
                />
              ) : (
                <ChevronDown
                  size={16}
                  className="text-[#6B7280] flex-shrink-0"
                />
              )}
            </button>

            {openItem === idx && (
              <div className="px-4 pb-4 border-t border-white/5">
                <p className="text-[#6B7280] text-sm leading-relaxed mt-3">
                  {item.a}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Report Problem */}
      <div className="px-4 mt-6">
        <h3 className="text-white font-bold text-base mb-3">
          Report a Problem
        </h3>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          {reportSent ? (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-white font-bold">
                Report sent!
              </p>
              <p className="text-[#6B7280] text-sm mt-1">
                Our team will review your report within 48
                hours.
              </p>
            </div>
          ) : (
            <>
              <textarea
                value={reportText}
                onChange={(e) =>
                  setReportText(e.target.value)
                }
                placeholder="Describe the problem you're experiencing..."
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#6B7280] text-sm focus:outline-none focus:border-[#1E6FFF] resize-none"
              />

              <button
                onClick={() => {
                  if (reportText.trim()) {
                    setReportSent(true);
                  }
                }}
                disabled={!reportText.trim()}
                className="w-full bg-gradient-to-r from-[#1E6FFF] to-[#7B2FFF] text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                Send Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="px-4 mt-4 space-y-3">
        <h3 className="text-white font-bold text-base mb-3">
          Contact Support
        </h3>

        <a
          href="mailto:support@blink.africa"
          className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors"
        >
          <div className="w-10 h-10 bg-[#1E6FFF]/20 rounded-xl flex items-center justify-center">
            <Mail
              size={18}
              className="text-[#1E6FFF]"
            />
          </div>

          <div>
            <p className="text-white font-semibold text-sm">
              Email Support
            </p>
            <p className="text-[#6B7280] text-xs">
              support@blink.africa
            </p>
          </div>

          <ExternalLink
            size={16}
            className="text-[#6B7280] ml-auto"
          />
        </a>

        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="w-10 h-10 bg-[#2ECC71]/20 rounded-xl flex items-center justify-center">
            <MessageCircle
              size={18}
              className="text-[#2ECC71]"
            />
          </div>

          <div>
            <p className="text-white font-semibold text-sm">
              Live Chat
            </p>
            <p className="text-[#6B7280] text-xs">
              Available Mon–Fri, 8am–6pm EAT
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;