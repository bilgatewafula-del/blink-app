// src/lib/prefs.js
// Device preferences that really change the app: theme, text size, data
// saving, autoplay and media quality. Stored locally (instant, works offline)
// and mirrored to the user's settings row so they follow the person.
import { useEffect, useState } from 'react';

const KEY = 'blink_prefs_v1';
export const DEFAULTS = {
  theme: 'light',           // light (default). Dark / AMOLED may return later
  font_size: 'medium',      // small | medium | large
  data_saver: false,
  autoplay_videos: true,
  video_quality: 'auto',    // auto | high | medium | low
  image_quality: 'high',    // high | medium | low
};
const ZOOM = { small: 0.94, medium: 1, large: 1.1 };

let current = { ...DEFAULTS };
const listeners = new Set();

try { current = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { /* first run */ }
current.theme = 'light';   // the app is light-first; older saved 'dark' / 'amoled' values are ignored for now

export const getPrefs = () => current;
export const getPref = (k) => current[k];

export function applyPrefs() {
  const root = document.documentElement;
  root.classList.toggle('theme-amoled', false);
  const z = ZOOM[current.font_size] || 1;
  root.style.zoom = z === 1 ? '' : String(z);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#FFFFFF');
}

export function setPrefs(patch, { silent = false } = {}) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked */ }
  applyPrefs();
  if (!silent) listeners.forEach((fn) => fn(current));
}

// Merge what the server knows about this person (ignores unknown / empty values)
export function adoptServerSettings(row) {
  if (!row) return;
  const patch = {};
  ['theme', 'font_size', 'video_quality', 'image_quality'].forEach((k) => { if (row[k] && row[k] !== current[k]) patch[k] = row[k]; });
  ['data_saver', 'autoplay_videos'].forEach((k) => { if (typeof row[k] === 'boolean' && row[k] !== current[k]) patch[k] = row[k]; });
  delete patch.theme;                         // theme is light for everyone for now
  if (Object.keys(patch).length) setPrefs(patch);
}

export function usePrefs() {
  const [p, setP] = useState(current);
  useEffect(() => { listeners.add(setP); setP(current); return () => listeners.delete(setP); }, []);
  return p;
}

applyPrefs();
