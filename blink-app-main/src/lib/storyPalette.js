// src/lib/storyPalette.js — backgrounds for text statuses (key is stored in the database)
export const STORY_BACKGROUNDS = [
  { key: 'sunset',   css: 'linear-gradient(160deg,#FF5A1F 0%,#FF2D78 100%)' },
  { key: 'ember',    css: 'linear-gradient(160deg,#FF9A1F 0%,#FF4D2D 100%)' },
  { key: 'gold',     css: 'linear-gradient(160deg,#FFD23F 0%,#FF8A00 100%)' },
  { key: 'rose',     css: 'linear-gradient(160deg,#FF5C8A 0%,#C2185B 100%)' },
  { key: 'crimson',  css: 'linear-gradient(160deg,#F43F5E 0%,#7F1230 100%)' },
  { key: 'orchid',   css: 'linear-gradient(160deg,#E056FD 0%,#7B2FFF 100%)' },
  { key: 'royal',    css: 'linear-gradient(160deg,#6C5CE7 0%,#2D1B69 100%)' },
  { key: 'ocean',    css: 'linear-gradient(160deg,#00B4DB 0%,#0A4F8F 100%)' },
  { key: 'lagoon',   css: 'linear-gradient(160deg,#00D2A0 0%,#007A87 100%)' },
  { key: 'forest',   css: 'linear-gradient(160deg,#2ECC71 0%,#0B6B3A 100%)' },
  { key: 'lime',     css: 'linear-gradient(160deg,#B8E62E 0%,#2E9E3F 100%)' },
  { key: 'graphite', css: 'linear-gradient(160deg,#4A4A4F 0%,#121214 100%)' },
];

const FALLBACK = STORY_BACKGROUNDS[0].css;
export const bgCss = (key) => STORY_BACKGROUNDS.find((b) => b.key === key)?.css || FALLBACK;

// Bigger text for short messages, smaller for long ones
export const textSizeFor = (len) => (len <= 30 ? 38 : len <= 80 ? 30 : len <= 160 ? 24 : 19);

// How long a text status stays on screen (seconds)
export const textDuration = (len) => Math.min(10, Math.max(5, 4 + Math.round(len / 25)));
