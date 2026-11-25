// src/components/EmojiPanel.js
// Built-in emoji keyboard for comments: no downloads, opens instantly, works offline.
// Recent emojis come first. Tapping one adds it at the cursor; the backspace key removes one.
import { useEffect, useRef, useState } from 'react';
import { Clock, Smile, Heart, Hand, PawPrint, Utensils, Trophy, Car, Lightbulb, Flag, Delete } from 'lucide-react';

const list = (s) => s.trim().split(/\s+/);

const SETS = [
  { key: 'smileys', icon: Smile, label: 'Smileys', emoji: list('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖') },
  { key: 'hearts', icon: Heart, label: 'Love', emoji: list('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ 🌟 ⭐ 🎉 🎊 🎈 🎁') },
  { key: 'hands', icon: Hand, label: 'People', emoji: list('👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 ✍️ 💪 🙋 🙆 🙅 🤷 🤦 🙇 💁 👀 👁️ 👅 👄 🧠 🦷 👶 👦 👧 👨 👩 👴 👵') },
  { key: 'nature', icon: PawPrint, label: 'Nature', emoji: list('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐊 🐘 🦒 🦓 🦍 🐪 🐑 🐐 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌴 🌵 🍀 🍁 🌍 🌙 ☀️ ⛅ ☁️ 🌧️ ⚡ ❄️ 🌈') },
  { key: 'food', icon: Utensils, label: 'Food', emoji: list('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥔 🥕 🌽 🌶️ 🥒 🥦 🍄 🥜 🍞 🥐 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍳 🍲 🍿 🍱 🍛 🍜 🍝 🍣 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍻 🥂 🍷') },
  { key: 'play', icon: Trophy, label: 'Activity', emoji: list('⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🏆 🥇 🥈 🥉 🎮 🎯 🎲 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 💃 🕺 🏃 🚴 🏊 🧘') },
  { key: 'travel', icon: Car, label: 'Travel', emoji: list('🚗 🚕 🚌 🏎️ 🚓 🚑 🚒 🚚 🚲 🛵 🏍️ ✈️ 🚀 🚁 ⛵ 🚢 🏠 🏢 🏫 🏥 ⛪ 🕌 🗼 🌆 🌃 🏖️ ⛰️ 🏕️') },
  { key: 'things', icon: Lightbulb, label: 'Objects', emoji: list('📱 💻 ⌨️ 🖥️ 📷 📸 🎥 📺 📻 ⏰ 💡 🔋 💰 💵 💳 💎 🔑 🔒 📚 ✏️ 📝 📌 🛍️ 👑 👗 👟 👜 🕶️ 💄 🔔 📣 ✅ ❌ ❓ ❗ ⚠️ 💬 💭') },
  { key: 'flags', icon: Flag, label: 'Flags', emoji: list('🇰🇪 🇺🇬 🇹🇿 🇷🇼 🇪🇹 🇳🇬 🇬🇭 🇿🇦 🇪🇬 🇲🇦 🇸🇳 🇨🇲 🇿🇲 🇿🇼 🇺🇸 🇬🇧 🇨🇦 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇧🇷 🇮🇳 🇨🇳 🇯🇵 🇰🇷 🇦🇪 🇸🇦 🏳️ 🏁 🚩') },
];

const RKEY = 'blink_recent_emoji_v1';
const readRecents = () => { try { return JSON.parse(localStorage.getItem(RKEY)) || []; } catch { return []; } };
const pushRecent = (e) => {
  try { localStorage.setItem(RKEY, JSON.stringify([e, ...readRecents().filter((x) => x !== e)].slice(0, 24))); } catch { /* storage blocked */ }
};

export default function EmojiPanel({ onPick, onBackspace, height = 250 }) {
  const [recents, setRecents] = useState(readRecents);
  const [tab, setTab] = useState(() => (readRecents().length ? 'recent' : 'smileys'));
  const tabs = [{ key: 'recent', icon: Clock, label: 'Recent', emoji: recents }, ...SETS];
  const cur = tabs.find((t) => t.key === tab) || SETS[0];
  const keep = (e) => e.preventDefault();                    // don't steal focus from the comment box
  const holdRef = useRef({ t: null, i: null });
  const stopHold = () => { clearTimeout(holdRef.current.t); clearInterval(holdRef.current.i); };
  const startHold = (e) => {
    e.preventDefault();
    stopHold();
    onBackspace();
    holdRef.current.t = setTimeout(() => { holdRef.current.i = setInterval(onBackspace, 70); }, 380);   // hold to keep deleting
  };
  useEffect(() => stopHold, []);

  const pick = (e) => { pushRecent(e); setRecents(readRecents()); onPick(e); };

  return (
    <div className="relative bg-white border-t border-[#E4E6EB] flex flex-col select-none" style={{ height }} onPointerDown={keep}>
      <div className="flex items-center gap-0.5 px-2 h-11 flex-shrink-0 overflow-x-auto border-b border-[#E4E6EB]" style={{ scrollbarWidth: 'none' }} role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} aria-label={t.label} onClick={() => setTab(t.key)}
            className="w-10 h-9 flex-shrink-0 flex items-center justify-center rounded-lg active:scale-90 transition-transform"
            style={{ color: tab === t.key ? '#7C3AED' : '#65676B', background: tab === t.key ? 'rgba(124,58,237,.10)' : 'transparent' }}>
            <t.icon size={20} strokeWidth={1.9} />
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-1 pb-14" style={{ overscrollBehavior: 'contain' }}>
        {cur.emoji.length === 0 ? (
          <p className="text-center text-[13px] text-[#64748B] pt-8">Emojis you use will show up here.</p>
        ) : (
          <div className="grid grid-cols-8">
            {cur.emoji.map((e, i) => (
              <button key={e + i} onClick={() => pick(e)} aria-label={'Emoji ' + e}
                className="h-11 flex items-center justify-center text-[26px] leading-none active:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        )}
      </div>
      <button onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} aria-label="Delete last emoji or character"
        className="absolute right-3 bottom-3 w-14 h-10 rounded-xl bg-white border border-[#E4E6EB] shadow-md flex items-center justify-center text-[#111827] active:scale-95 transition-transform">
        <Delete size={22} strokeWidth={1.8} />
      </button>
    </div>
  );
}
