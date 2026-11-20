import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon, Monitor, Type, Zap, Globe } from 'lucide-react';

const AppearanceSettings = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState('medium');
  const [language, setLanguage] = useState('en');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full transition-colors ${value ? 'bg-[#1E6FFF]' : 'bg-white/20'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0A1628] pb-24">
      <div className="sticky top-0 z-20 bg-[#0A1628] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/settings')} className="text-[#6B7280] hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-white font-bold text-lg">Appearance</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Theme */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Theme</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'light', icon: Sun, label: 'Light', bg: 'bg-white', text: 'text-[#0A1628]' },
              { key: 'dark', icon: Moon, label: 'Dark', bg: 'bg-[#0A1628]', text: 'text-white' },
              { key: 'system', icon: Monitor, label: 'System', bg: 'bg-gradient-to-br from-white to-[#0A1628]', text: 'text-white' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTheme(t.key)}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                  theme === t.key ? 'border-[#1E6FFF] bg-[#1E6FFF]/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl ${t.bg} border border-white/10 flex items-center justify-center`}>
                  <t.icon size={18} className={theme === t.key ? 'text-[#1E6FFF]' : t.text} />
                </div>
                <span className={`text-xs font-semibold ${theme === t.key ? 'text-[#1E6FFF]' : 'text-white/70'}`}>
                  {t.label}
                </span>
                {theme === t.key && (
                  <div className="w-2 h-2 rounded-full bg-[#1E6FFF]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Font Size</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <Type size={14} className="text-[#6B7280]" />
              <div className="flex-1 h-1.5 bg-white/10 rounded-full relative">
                <div
                  className="h-full bg-[#1E6FFF] rounded-full transition-all"
                  style={{ width: fontSize === 'small' ? '33%' : fontSize === 'medium' ? '66%' : '100%' }}
                />
              </div>
              <Type size={20} className="text-white" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['small', 'medium', 'large'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                    fontSize === s ? 'bg-[#1E6FFF] text-white' : 'bg-white/5 text-[#6B7280]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Language */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Language</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {[
              { code: 'en', label: 'English', flag: '🇬🇧' },
              { code: 'sw', label: 'Kiswahili', flag: '🇰🇪' },
              { code: 'fr', label: 'Français (coming soon)', flag: '🇫🇷', disabled: true },
              { code: 'ha', label: 'Hausa (coming soon)', flag: '🇳🇬', disabled: true },
            ].map((lang, idx, arr) => (
              <button
                key={lang.code}
                onClick={() => !lang.disabled && setLanguage(lang.code)}
                disabled={lang.disabled}
                className={`w-full flex items-center justify-between px-4 py-3.5 ${
                  idx < arr.length - 1 ? 'border-b border-white/5' : ''
                } ${lang.disabled ? 'opacity-40' : 'hover:bg-white/5'} transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{lang.flag}</span>
                  <span className="text-white text-sm font-medium">{lang.label}</span>
                </div>
                {language === lang.code && !lang.disabled && (
                  <div className="w-5 h-5 rounded-full bg-[#1E6FFF] flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility & Performance */}
        <div>
          <p className="text-[#6B7280] text-xs font-bold uppercase tracking-widest mb-2 px-1">Accessibility & Performance</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {[
              { icon: Zap, label: 'Reduce Animations', sub: 'Disable transitions and motion effects', key: 'reduceMotion', val: reduceMotion, fn: setReduceMotion, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/20' },
              { icon: Monitor, label: 'High Contrast', sub: 'Increase text and UI contrast', key: 'highContrast', val: highContrast, fn: setHighContrast, color: 'text-white', bg: 'bg-white/20' },
              { icon: Globe, label: 'Data Saver', sub: 'Load lower quality images', key: 'dataSaver', val: dataSaver, fn: setDataSaver, color: 'text-[#2ECC71]', bg: 'bg-[#2ECC71]/20' },
            ].map((item, idx, arr) => (
              <div key={item.key} className={`flex items-center gap-4 px-4 py-4 ${idx < arr.length - 1 ? 'border-b border-white/5' : ''}`}>
                <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0`}>
                  <item.icon size={18} className={item.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold">{item.label}</p>
                  <p className="text-[#6B7280] text-xs">{item.sub}</p>
                </div>
                <button
                  onClick={() => item.fn(!item.val)}
                  className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${item.val ? 'bg-[#1E6FFF]' : 'bg-white/20'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${item.val ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettings;