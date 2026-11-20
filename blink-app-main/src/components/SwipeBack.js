import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SwipeBack = ({ children, enabled = true }) => {
  const navigate = useNavigate();
  const containerRef = useRef();
  const startX = useRef(null);
  const startY = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e) => {
      if (e.touches[0].clientX < 30) {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      if (startX.current === null) return;
      const diffX = e.touches[0].clientX - startX.current;
      const diffY = Math.abs(e.touches[0].clientY - startY.current);
      // Only horizontal swipe
      if (diffX > 10 && diffY < diffX) {
        el.style.transform = 'translateX(' + Math.min(diffX, 120) + 'px)';
        el.style.opacity = String(1 - diffX / 400);
      }
    };

    const onTouchEnd = (e) => {
      if (startX.current === null) return;
      const diffX = e.changedTouches[0].clientX - startX.current;
      if (diffX > 80) {
        navigate(-1);
      } else {
        el.style.transform = '';
        el.style.opacity = '';
      }
      startX.current = null;
      startY.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [navigate, enabled]);

  return (
    <div ref={containerRef} style={{ transition: 'transform 0.1s, opacity 0.1s' }}>
      {children}
    </div>
  );
};

export default SwipeBack;