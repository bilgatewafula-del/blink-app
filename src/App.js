import { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import BottomNav from './components/BottomNav';

/* ── Lazy pages ── */
const Login         = lazy(() => import('./pages/auth/Login'));
const SignUp     = lazy(() => import('./pages/auth/Signup'));
const Home          = lazy(() => import('./pages/feed/Home'));
const Discover      = lazy(() => import('./pages/discover/Discover'));
const Notifications = lazy(() => import('./pages/notifications/Notifications'));
const Profile       = lazy(() => import('./pages/profile/Profile'));
const EditProfile   = lazy(() => import('./pages/profile/EditProfile'));
const PostDetail    = lazy(() => import('./pages/feed/PostDetail'));
const CreatePost    = lazy(() => import('./pages/feed/CreatePost'));
const AdminPanel          = lazy(() => import('./pages/admin/AdminPanel'));
const PaymentsAdminPanel = lazy(() => import('./pages/admin/PaymentsAdminPanel'));
const SubscriptionPage   = lazy(() => import('./pages/monetisation/SubscriptionPage'));
const CoinsPage          = lazy(() => import('./pages/monetisation/CoinsPage'));
const Chats      = lazy(() => import('./pages/chat/ChatList'));
const ChatDetail = lazy(() => import('./pages/chat/ChatRoom'));

/* ── Minimal inline splash — no extra file needed ── */
function Splash() {
  return (
    <div className="fixed inset-0 bg-[#0A1628] flex flex-col items-center justify-center z-50">
      <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center shadow-2xl shadow-[#1E6FFF]/40 mb-4"
        style={{ animation: 'splashIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <span className="text-white font-black text-3xl">B</span>
      </div>
      <p className="text-white font-black text-2xl tracking-tight"
        style={{ animation: 'fadeInUp 0.3s ease 0.15s both' }}>B-Link</p>
      <p className="text-white/40 text-xs mt-1"
        style={{ animation: 'fadeInUp 0.3s ease 0.25s both' }}>Africa's GenZ Platform</p>
      <div className="w-5 h-5 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin mt-8" />
      <style>{`
        @keyframes splashIn { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

/* ── Page loader (between lazy chunks) ── */
function PageLoader() {
  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/* ── Route guards ── */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user)    return <Navigate to="/" replace />;
  return children;
}

/* ── Nav visibility ── */
const NAV_PATHS = ['/', '/discover', '/notifications', '/chats', '/profile'];

function AppShell() {
  const { user, loading }     = useAuth();
  const location              = useLocation();
  const [splashDone, setSplashDone] = useState(() => !!sessionStorage.getItem('blink_started'));

  useEffect(() => {
    if (!splashDone) {
      const t = setTimeout(() => {
        setSplashDone(true);
        sessionStorage.setItem('blink_started', '1');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [splashDone]);

  // Show splash only on very first load, and only while auth is resolving
  if (!splashDone && loading) return <Splash />;

  const showNav = !!user && (
    NAV_PATHS.includes(location.pathname) ||
    location.pathname.startsWith('/profile/')
  );

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth */}
          <Route path="/login"  element={<PublicRoute><Login  /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />

          {/* App */}
          <Route path="/"              element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/discover"      element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/chats"         element={<ProtectedRoute><Chats /></ProtectedRoute>} />
          <Route path="/chats/:id"     element={<ProtectedRoute><ChatDetail /></ProtectedRoute>} />
          <Route path="/post/:id"      element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
          <Route path="/create"        element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
          <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/profile/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/edit-profile"  element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
          <Route path="/admin"         element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
          <Route path="/admin/payments" element={<ProtectedRoute><PaymentsAdminPanel /></ProtectedRoute>} />
          <Route path="/subscription"  element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
          <Route path="/coins"         element={<ProtectedRoute><CoinsPage /></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </Suspense>
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