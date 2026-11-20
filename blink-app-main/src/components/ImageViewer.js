// src/components/ImageViewer.js
// Instant fullscreen image viewer modal
import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ImageViewer({ images, index = 0, onClose, onPrev, onNext }) {
  const total = images?.length || 0;
  const src   = images?.[index];

  // Close on escape key
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Swipe support
  let touchX = null;
  const onTouchStart = (e) => { touchX = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) { if (dx < 0) onNext?.(); else onPrev?.(); }
    touchX = null;
  };

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ animation: 'fadeIn 0.15s ease' }}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center"
        onClick={e => { e.stopPropagation(); onClose(); }}
      >
        <X size={20} color="white" />
      </button>

      {/* Counter */}
      {total > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/60 rounded-full px-3 py-1">
          <span className="text-white text-sm font-semibold">{index + 1} / {total}</span>
        </div>
      )}

      {/* Image */}
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain select-none"
        style={{ maxHeight: '100dvh', maxWidth: '100vw', userSelect: 'none' }}
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      {/* Prev */}
      {total > 1 && index > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center"
          onClick={e => { e.stopPropagation(); onPrev(); }}
        >
          <ChevronLeft size={22} color="white" />
        </button>
      )}

      {/* Next */}
      {total > 1 && index < total - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center"
          onClick={e => { e.stopPropagation(); onNext(); }}
        >
          <ChevronRight size={22} color="white" />
        </button>
      )}

      {/* Thumbnail strip */}
      {total > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5 px-4">
          {images.map((_, i) => (
            <div key={i} className={`h-1 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/40 w-3'}`} />
          ))}
        </div>
      )}
    </div>
  );
}