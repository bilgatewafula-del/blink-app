// src/utils/formatTime.js
export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000); // seconds

  if (diff < 5)   return 'just now';
  if (diff < 60)  return diff + 's';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd';

  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}