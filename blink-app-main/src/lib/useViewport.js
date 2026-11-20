// src/lib/useViewport.js
// Size of what is actually VISIBLE (keyboard, sticker keyboards and
// browser bars excluded) so full-screen layouts never hide their input.
import { useState, useEffect } from 'react';

const read = () => {
  const vv = window.visualViewport;
  const z = parseFloat(window.getComputedStyle(document.documentElement).zoom) || 1;   // text-size setting
  return { h: (vv ? vv.height : window.innerHeight) / z, top: (vv ? vv.offsetTop : 0) / z };
};

export default function useViewport() {
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setVp(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return vp;
}
