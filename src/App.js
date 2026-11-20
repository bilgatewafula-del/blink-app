import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import BottomNav from './components/BottomNav';
import NetworkBanner from './components/NetworkBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { startPresence, stopPresence } from './lib/presence';
import { supabase } from './lib/supabaseClient';
import { adoptServerSettings } from './lib/prefs';

/* ── Lazy pages — paths match REAL folder structure ── */
const Login              = lazy(() => import('./pages/auth/Login'));
const SignUp = lazy(() => import('./pages/auth/Signup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword  = lazy(() => import('./pages/auth/ResetPassword'));
const OTPVerify      = lazy(() => import('./pages/auth/OTPVerify'));
const CompleteProfile = lazy(() => import('./pages/auth/CompleteProfile'));
const Verify2FA = lazy(() => import('./pages/auth/Verify2FA'));
const Home               = lazy(() => import('./pages/feed/Home'));
const Discover           = lazy(() => import('./pages/discover/Discover'));
const BFlash             = lazy(() => import('./pages/flash/BFlash'));
const Notifications      = lazy(() => import('./pages/notifications/Notifications'));
const Profile            = lazy(() => import('./pages/profile/Profile'));
const EditProfile        = lazy(() => import('./pages/profile/EditProfile'));
const PostDetail         = lazy(() => import('./pages/feed/PostDetail'));
const CreatePost         = lazy(() => import('./pages/feed/CreatePost'));
const AdminPanel         = lazy(() => import('./pages/admin/AdminPanel'));
const PaymentsAdminPanel = lazy(() => import('./pages/admin/PaymentsAdminPanel'));

/* ── Chat — adjust these TWO lines to match YOUR actual file names ── */
const Chats = lazy(() => import('./pages/chat/ChatList'));
const ChatDetail = lazy(() => import('./pages/chat/ChatRoom'));

/* ── Monetisation ── */
const MonetisationHub    = lazy(() => import('./pages/monetisation/MonetisationHub'));
const SubscriptionPage   = lazy(() => import('./pages/monetisation/SubscriptionPage'));
const CoinsPage          = lazy(() => import('./pages/monetisation/CoinsPage'));
const BoostPost          = lazy(() => import('./pages/monetisation/BoostPost'));
const VerificationPage   = lazy(() => import('./pages/monetisation/VerificationPage'));
const BusinessPage       = lazy(() => import('./pages/monetisation/BusinessPage'));

/* ── Real drawer pages ── */
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const HelpPage     = lazy(() => import('./pages/help/HelpCenter'));
const AboutPage    = lazy(() => import('./pages/about/AboutPage'));

/* ── Still coming soon ── */
function ComingSoon({ title }) {
  const nav = typeof window !== 'undefined' ? null : null;
  return (
    <div className="min-h-screen bg-[#0D0C0B] flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-5xl">🚧</p>
      <p className="text-white font-bold text-xl">{title}</p>
      <p className="text-[#8E8C88] text-sm text-center">Coming soon!</p>
      <button onClick={() => window.history.back()} className="mt-2 bg-[#FF5A1F] text-white px-6 py-2.5 rounded-full font-bold text-sm">← Go Back</button>
    </div>
  );
}
const SavedPosts = () => <ComingSoon title="Saved Posts" />;
const BLinkAI    = () => <ComingSoon title="B-Link AI"   />;
const NewsPage   = () => <ComingSoon title="News"         />;
const VibesPage  = () => <ComingSoon title="Vibes"        />;

/* ── Loaders ── */
function PageLoader() {
  return (
    <div className="min-h-screen bg-[#0D0C0B] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Splash() {
  return (
    <div className="fixed inset-0 bg-[#0D0C0B] flex flex-col items-center justify-center z-50">
      <div
        className="w-20 h-20 rounded-[24px] flex items-center justify-center shadow-2xl shadow-[#FF5A1F]/40 mb-4"
        style={{ background:'linear-gradient(135deg,#FF5A1F,#FF2D78)', animation:'splashIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <span className="text-white font-black text-3xl">B</span>
      </div>
      <p className="text-white font-black text-2xl" style={{ animation:'fadeInUp 0.3s ease 0.15s both' }}>B-Link</p>
      <p className="text-white/40 text-xs mt-1" style={{ animation:'fadeInUp 0.3s ease 0.25s both' }}>Africa's GenZ Platform</p>
      <div className="w-5 h-5 border-2 border-[#FF5A1F] border-t-transparent rounded-full animate-spin mt-8" />
      <style>{`
        @keyframes splashIn  { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeInUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

/* ── Guards ── */
function ProtectedRoute({ children }) {
  const { user, profile, loading, profileChecked, recovery, needsMfa } = useAuth();
  if (loading) return <PageLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  if (needsMfa) return <Navigate to="/verify-2fa" replace />;
  // signed in, but no profile yet -> finish it first
  if (profileChecked && !profile) return <Navigate to="/complete-profile" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading, recovery } = useAuth();
  if (loading) return <PageLoader />;
  if (user && !recovery) return <Navigate to="/" replace />;
  return children;
}

/* ── Nav ── */
const NAV_PATHS = ['/', '/discover', '/flash', '/notifications', '/chats', '/profile'];

function AppShell() {
  const { user, loading } = useAuth();
  const location          = useLocation();
  const [splashDone, setSplashDone] = useState(() => !!sessionStorage.getItem('blink_started'));

  useEffect(() => {
    if (!splashDone) {
      const t = setTimeout(() => { setSplashDone(true); sessionStorage.setItem('blink_started','1'); }, 1600);
      return () => clearTimeout(t);
    }
  }, [splashDone]);

  // Theme, text size and media settings follow the person to a new device
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('user_settings').select('theme,font_size,data_saver,autoplay_videos,video_quality,image_quality')
      .eq('user_id', user.id).maybeSingle().then(({ data }) => adoptServerSettings(data)).catch(() => {});
  }, [user?.id]);

  // Real online / last-seen: starts when signed in, stops on sign-out.
  useEffect(() => {
    if (user?.id) startPresence(user.id);
    else stopPresence();
  }, [user?.id]);

  // Warm the main tabs in the background once the app is usable, so
  // switching tabs feels instant instead of waiting on a chunk download.
  useEffect(() => {
    if (!user || loading) return;
    if (navigator.connection && navigator.connection.saveData) return;
    const t = setTimeout(() => {
      [
        () => import('./pages/discover/Discover'),
        () => import('./pages/flash/BFlash'),
        () => import('./pages/notifications/Notifications'),
        () => import('./pages/chat/ChatList'),
        () => import('./pages/profile/Profile'),
        () => import('./pages/feed/CreatePost'),
      ].forEach((load) => load().catch(() => {}));
    }, 2500);
    return () => clearTimeout(t);
  }, [user, loading]);

  if (!splashDone && loading) return <Splash />;

  const showNav = !!user && (
    NAV_PATHS.includes(location.pathname) || location.pathname.startsWith('/profile/')
  );

  return (
    <>
      <NetworkBanner />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth */}
          <Route path="/login"  element={<PublicRoute><Login  /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/verify"          element={<PublicRoute><OTPVerify /></PublicRoute>} />
          <Route path="/complete-profile" element={<CompleteProfile />} />
          <Route path="/verify-2fa" element={<Verify2FA />} />

          {/* Core */}
          <Route path="/"              element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/discover"      element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/flash"         element={<ProtectedRoute><BFlash /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/chats"         element={<ProtectedRoute><Chats /></ProtectedRoute>} />
          <Route path="/chats/:id"     element={<ProtectedRoute><ChatDetail /></ProtectedRoute>} />
          <Route path="/post/:id"      element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
          <Route path="/create"        element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
          <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/edit-profile"  element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />

          {/* Drawer routes */}
          <Route path="/saved"    element={<ProtectedRoute><SavedPosts /></ProtectedRoute>} />
          <Route path="/ai"       element={<ProtectedRoute><BLinkAI /></ProtectedRoute>} />
          <Route path="/news"     element={<ProtectedRoute><NewsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/help"     element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
          <Route path="/about"    element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
          <Route path="/vibes"    element={<ProtectedRoute><VibesPage /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin"          element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
          <Route path="/admin/payments" element={<ProtectedRoute><PaymentsAdminPanel /></ProtectedRoute>} />

          {/* Monetisation */}
          <Route path="/premium"       element={<ProtectedRoute><MonetisationHub /></ProtectedRoute>} />
          <Route path="/subscription"  element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
          <Route path="/coins"         element={<ProtectedRoute><CoinsPage /></ProtectedRoute>} />
          <Route path="/verification"  element={<ProtectedRoute><VerificationPage /></ProtectedRoute>} />
          <Route path="/business-page" element={<ProtectedRoute><BusinessPage /></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      {showNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}