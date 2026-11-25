import { useEffect, useRef, useState, Component } from 'react';

/* ─── Error boundary so a picker crash never kills the page ───── */
class EmojiErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { crashed: false }; }
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (this.state.crashed)
      return (
        <div style={{
          background: '#FFFFFF', borderRadius: 16, padding: '16px 20px',
          color: '#64748B', fontSize: 13, border: '1px solid #E2E8F0',
        }}>
          Emoji picker failed to load. You can type emoji directly 😊
        </div>
      );
    return this.props.children;
  }
}

/* ─── Lazy-load so it never blocks page render ─────────────────── */
let _Picker = null;
function LazyPicker(props) {
  const [Comp, setComp] = useState(_Picker ? () => _Picker : null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    if (_Picker) return;
    import('emoji-picker-react')
      .then(m => { _Picker = m.default; setComp(() => m.default); })
      .catch(() => setErr(true));
  }, []);

  if (err)  return <div style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>Emoji picker unavailable.</div>;
  if (!Comp) return (
    <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 16, height: 16, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ color: '#64748B', fontSize: 12 }}>Loading emojis…</span>
    </div>
  );
  return <Comp {...props} />;
}

/*
  SmartEmojiPicker
  ────────────────
  Props:
    open          boolean   — whether to show the picker
    onClose       fn        — called when user clicks outside
    onEmojiClick  fn        — (emojiData) => void
    triggerRef    ref       — ref of the button that toggles the picker
                             used to calculate position
    width?        number    — picker width (default 300)
    height?       number    — picker height (default 350)

  Behaviour:
    • Measures the trigger button's position on screen
    • Decides: open UP or DOWN, LEFT or RIGHT
    • Renders a fixed-position container so it never
      overflows or gets clipped by parent overflow:hidden
    • On mobile (width < 480) it renders bottom-sheet style
      (fixed, full width, bottom 0) instead of a popover
*/
export default function SmartEmojiPicker({
  open, onClose, onEmojiClick, triggerRef,
  width = 300, height = 350,
}) {
  const overlayRef = useRef();
  const boxRef     = useRef();
  const [pos, setPos] = useState(null);     // { top, left, openUp, openLeft }
  const [mobile, setMobile] = useState(window.innerWidth < 480);

  /* recalculate position every time it opens */
  useEffect(() => {
    if (!open) { setPos(null); return; }
    setMobile(window.innerWidth < 480);
    if (window.innerWidth < 480) return;   // mobile uses bottom-sheet, no calc needed

    const trigger = triggerRef?.current;
    if (!trigger) return;

    const rect    = trigger.getBoundingClientRect();
    const vw      = window.innerWidth;
    const vh      = window.innerHeight;
    const pickerW = width;
    const pickerH = height + 20;           // small margin

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const openUp     = spaceBelow < pickerH && spaceAbove > spaceBelow;

    // horizontal: prefer aligning to left edge of trigger; flip if overflows right
    let left = rect.left;
    if (left + pickerW > vw - 8) left = Math.max(8, vw - pickerW - 8);

    const top = openUp
      ? rect.top - pickerH
      : rect.bottom + 6;

    setPos({ top, left, openUp });
  }, [open, triggerRef, width, height]);

  /* close on outside click */
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (
        boxRef.current && !boxRef.current.contains(e.target) &&
        triggerRef?.current && !triggerRef.current.contains(e.target)
      ) onClose();
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  /* ── MOBILE: full-width bottom sheet ── */
  if (mobile) {
    return (
      <>
        {/* dim overlay */}
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }}
          onMouseDown={onClose}
          onTouchStart={onClose}
        />
        <div
          ref={boxRef}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: 999,
            background: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            borderRadius: '20px 20px 0 0',
            overflow: 'hidden',
            paddingBottom: 'env(safe-area-inset-bottom)',
            animation: 'slideUpSheet 0.22s ease-out',
          }}
        >
          <EmojiErrorBoundary>
            <LazyPicker
              onEmojiClick={onEmojiClick}
              theme="dark"
              skinTonesDisabled
              searchPlaceholder="Search emoji..."
              width="100%"
              height={320}
              previewConfig={{ showPreview: false }}
            />
          </EmojiErrorBoundary>
        </div>
      </>
    );
  }

  /* ── DESKTOP / TABLET: smart popover ── */
  if (!pos) return null;   // waiting for position calc

  return (
    <div
      ref={boxRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 999,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        border: '1px solid #E2E8F0',
        animation: pos.openUp ? 'slideDownPicker 0.18s ease-out' : 'slideUpPicker 0.18s ease-out',
      }}
    >
      <EmojiErrorBoundary>
        <LazyPicker
          onEmojiClick={onEmojiClick}
          theme="dark"
          skinTonesDisabled
          searchPlaceholder="Search emoji..."
          width={width}
          height={height}
          previewConfig={{ showPreview: false }}
        />
      </EmojiErrorBoundary>
    </div>
  );
}