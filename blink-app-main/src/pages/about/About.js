import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Heart } from 'lucide-react';

const About = () => {
  const navigate = useNavigate();

  const APP_VERSION = "2.0.0";

  const links = [
    { label: 'Privacy Policy', url: '/privacy', icon: '🔒' },
    { label: 'Terms of Service', url: '/terms', icon: '📋' },
    { label: 'Community Guidelines', url: '/guidelines', icon: '🤝' },
    { label: 'Cookie Policy', url: '/cookies', icon: '🍪' },
    { label: 'Open Source Licenses', url: '/licenses', icon: '💻' },
  ];

  const stack = [
    { name: 'React.js', role: 'Frontend Framework', icon: '⚛️' },
    { name: 'Supabase', role: 'Database & Auth', icon: '🗄️' },
    { name: 'Cloudinary', role: 'Image Storage & CDN', icon: '☁️' },
    { name: 'Tailwind CSS', role: 'Styling', icon: '🎨' },
    { name: 'Vercel', role: 'Hosting & Deployment', icon: '🚀' },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">About B-Link</h1>
      </div>

      {/* Logo Section */}
      <div className="flex flex-col items-center py-8 px-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-[#1E6FFF]/30 mb-4">
          B
        </div>
        <h2 className="text-white font-bold text-2xl">B-Link</h2>
        <p className="text-[#6B7280] text-sm mt-1">
          Africa's Lightweight Social Platform
        </p>

        <div className="flex items-center gap-2 mt-2">
          <span className="bg-[#1E6FFF]/20 text-[#1E6FFF] text-xs font-bold px-3 py-1 rounded-full">
            Version {APP_VERSION}
          </span>
          <span className="bg-[#2ECC71]/20 text-[#2ECC71] text-xs font-bold px-3 py-1 rounded-full">
            Beta
          </span>
        </div>
      </div>

      <div className="px-4 space-y-5">

        {/* Mission */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold text-base mb-2">Our Mission</h3>
          <p className="text-[#6B7280] text-sm leading-relaxed">
            B-Link is Africa's first GenZ-centric lightweight social media platform,
            engineered to deliver fast, authentic, and data-efficient social experiences
            across the continent and its global diaspora.
          </p>
          <p className="text-[#6B7280] text-sm leading-relaxed mt-2">
            Unlike Western-first platforms, B-Link is designed from the ground up with
            African connectivity realities, languages, cultures, and payment ecosystems in mind.
          </p>
        </div>

        {/* Core Values */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold text-base mb-3">Core Values</h3>

          <div className="space-y-3">
            {[
              { icon: '🔒', title: 'Privacy First', desc: 'No ads sold on user data. Your data stays yours.' },
              { icon: '📶', title: 'Low Data', desc: 'Optimized for African networks. Fast on 2G, great on 4G.' },
              { icon: '🌍', title: 'African Focus', desc: 'Built for Africa and the global African diaspora.' },
              { icon: '💰', title: 'Creator Economy', desc: 'Creators earn. Fair revenue sharing.' },
              { icon: '🤝', title: 'Community', desc: 'Authentic connections. Real people. Real moments.' },
            ].map((v) => (
              <div key={v.title} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{v.icon}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{v.title}</p>
                  <p className="text-[#6B7280] text-xs mt-0.5">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-white font-bold text-base">Built With</h3>
          </div>

          {stack.map((tech, idx) => (
            <div
              key={tech.name}
              className={
                'flex items-center gap-3 px-5 py-3.5 ' +
                (idx < stack.length - 1 ? 'border-b border-white/5' : '')
              }
            >
              <span className="text-xl">{tech.icon}</span>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">{tech.name}</p>
                <p className="text-[#6B7280] text-xs">{tech.role}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Legal */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-white font-bold text-base">Legal</h3>
          </div>

          {links.map((link, idx) => (
            <button
              key={link.label}
              onClick={() => navigate(link.url)}
              className={
                'w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors ' +
                (idx < links.length - 1 ? 'border-b border-white/5' : '')
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{link.icon}</span>
                <p className="text-white/80 text-sm">{link.label}</p>
              </div>
              <ExternalLink size={14} className="text-[#6B7280]" />
            </button>
          ))}
        </div>

        {/* Creator Section */}
        <div className="bg-gradient-to-br from-[#1E6FFF]/10 to-[#7B2FFF]/10 border border-[#1E6FFF]/20 rounded-2xl p-5 text-center">
          <p className="text-2xl mb-2">🌍</p>
          <h3 className="text-white font-bold text-base">
            Made in Africa, for Africa
          </h3>

          <p className="text-[#6B7280] text-sm mt-2 leading-relaxed">
            B-Link is a Kibabii University BIT student project created by
            <span className="text-white font-semibold"> Bilgate Mukhayo</span>,
            built with passion for the African tech ecosystem.
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-3">
            <Heart size={14} className="text-red-400 fill-red-400" />
            <p className="text-[#6B7280] text-xs">
              Built with love in Kenya 🇰🇪
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[#6B7280] text-xs pb-4">
          © 2025 B-Link · All rights reserved
        </p>
      </div>
    </div>
  );
};

export default About;