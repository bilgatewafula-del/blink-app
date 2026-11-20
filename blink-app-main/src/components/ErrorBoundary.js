// src/components/ErrorBoundary.js
// Catches failed lazy-page loads (stale bundle after a deploy) and render
// crashes, so the app never ends on a blank screen.
import React from 'react';

const CHUNK_RE =
  /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i;
const RELOAD_KEY = 'blink_chunk_reload_at';

async function clearCachesAndReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
  } catch {
    /* ignore — reload anyway */
  }
  window.location.reload();
}

export default class ErrorBoundary extends React.Component {
  state = { error: null, recovering: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    if (!CHUNK_RE.test(msg)) return;

    // Auto-recover once (guard against reload loops).
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* ignore */ }
    if (Date.now() - last > 30000) {
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
      this.setState({ recovering: true });
      clearCachesAndReload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.state.recovering) {
      return <div style={styles.wrap}><p style={styles.text}>Updating B-Link…</p></div>;
    }

    return (
      <div style={styles.wrap}>
        <p style={styles.text}>Something went wrong loading this page.</p>
        <button style={styles.btn} onClick={clearCachesAndReload}>Reload</button>
      </div>
    );
  }
}

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    background: '#0D0C0B', color: '#fff', padding: 24, textAlign: 'center',
  },
  text: { margin: 0, fontSize: 16 },
  btn: {
    background: '#FF5A1F', color: '#fff', border: 'none', borderRadius: 12,
    padding: '12px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  },
};
