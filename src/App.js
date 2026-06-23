import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SplashScreen from './components/SplashScreen';
import BottomNav from './components/BottomNav';

/* ── Lazy-loaded pages (code splitting for speed) ── */
const LandingPage   = lazy(() => import('./pages/auth/LandingPage'));
const Login         = lazy(() => import('./pages/auth/Login'));
const SignUp = lazy(() => import('./pages/auth/Signup'));
const Home          = lazy(() => import('./pages/feed/Home'));
const Discover      = lazy(() => import('./pages/discover/Discover'));
const Notifications = lazy(() => import('./pages/notifications/Notifications'));
const Profile       = lazy(() => import('./pages/profile/Profile'));
const EditProfile   = lazy(() => import('./pages/profile/EditProfile'));
const PostDetail    = lazy(() => import('./pages/feed/PostDetail'));
const CreatePost    = lazy(() => import('./pages/feed/CreatePost'));
const AdminPanel    = lazy(() => import('./pages/admin/AdminPanel'));
const Chats = lazy(() => import('./pages/chat/ChatList'));
const ChatDetail = lazy(() => import('./pages/chat/ChatRoom'));

/* ── Page spinner (shown while lazy chunk loads) ── */
function PageSpinner() {
  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-[#1E6FFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/* ── Protected route ── */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user)   return <Navigate to="/welcome" replace />;
  return children;
}

/* ── Public route (redirect away if logged in) ── */
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (user)    return <Navigate to="/" replace />;
  return children;
}

/* ── Bottom nav visibility ── */
const NAV_ROUTES = ['/', '/discover', '/notifications', '/chats', '/profile'];

function AppShell() {
  const { user, loading }     = useAuth();
  const location              = useLocation();
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash on first load per session
    const shown = sessionStorage.getItem('blink_splash');
    if (shown) return false;
    sessionStorage.setItem('blink_splash', '1');
    return true;
  });

  useEffect(() => {
    if (showSplash) {
      const t = setTimeout(() => setShowSplash(false), 1700);
      return () => clearTimeout(t);
    }
  }, [showSplash]);

  const showNav = user && NAV_ROUTES.some(r => location.pathname === r || location.pathname.startsWith('/profile/'));

  return (
    <>
      {showSplash && <SplashScreen />}

      <Suspense fallback={<PageSpinner />}>
        <Routes>
          {/* Public */}
          <Route path="/welcome"       element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/login"         element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup"        element={<PublicRoute><SignUp /></PublicRoute>} />

          {/* Protected */}
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

          {/* Fallback */}
          <Route path="*" element={<Navigate to={user ? '/' : '/welcome'} replace />} />
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