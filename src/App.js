import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect } from 'react';

import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import OTPVerify from './pages/auth/OTPVerify';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Home from './pages/feed/Home';
import Discover from './pages/discover/Discover';
import HashtagFeed from './pages/discover/HashtagFeed';
import CreatePost from './pages/feed/CreatePost';
import PostDetail from './pages/feed/PostDetail';
import EditPost from './pages/feed/EditPost';
import ChatList from './pages/chat/ChatList';
import ChatRoom from './pages/chat/ChatRoom';
import Profile from './pages/profile/Profile';
import EditProfile from './pages/profile/EditProfile';
import OtherProfile from './pages/profile/OtherProfile';
import Notifications from './pages/notifications/Notifications';
import Settings from './pages/settings/Settings';
import AccountSettings from './pages/settings/AccountSettings';
import PrivacySettings from './pages/settings/PrivacySettings';
import SecuritySettings from './pages/settings/SecuritySettings';
import NotificationSettings from './pages/settings/NotificationSettings';
import AppearanceSettings from './pages/settings/AppearanceSettings';
import BusinessCenter from './pages/settings/BusinessCenter';
import WalletPage from './pages/wallet/Wallet';
import Verification from './pages/verification/Verification';
import News from './pages/news/News';
import Help from './pages/help/Help';
import About from './pages/about/About';
import BLinkAI from './pages/ai/BLinkAI';
import BottomNav from './components/BottomNav';

const PageWrapper = ({ children }) => {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return (
    <div key={location.pathname} style={{ animation: 'pageSlideIn 0.2s ease-out' }}>
      {children}
    </div>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0A1628]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-2xl animate-pulse">B</div>
        <p className="text-[#6B7280] text-sm">Loading B-Link...</p>
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" />;
};

const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#0A1628] flex justify-center">
      <div className="w-full max-w-[620px] min-h-screen relative bg-[#0A1628]">
        <Routes>
          {/* Auth */}
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/" />} />
          <Route path="/verify-otp" element={<OTPVerify />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Main */}
          <Route path="/" element={<ProtectedRoute><PageWrapper><Home /></PageWrapper></ProtectedRoute>} />
          <Route path="/discover" element={<ProtectedRoute><PageWrapper><Discover /></PageWrapper></ProtectedRoute>} />
          <Route path="/hashtag/:tag" element={<ProtectedRoute><PageWrapper><HashtagFeed /></PageWrapper></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><PageWrapper><CreatePost /></PageWrapper></ProtectedRoute>} />
          <Route path="/post/:id" element={<ProtectedRoute><PageWrapper><PostDetail /></PageWrapper></ProtectedRoute>} />
          <Route path="/post/:id/edit" element={<ProtectedRoute><PageWrapper><EditPost /></PageWrapper></ProtectedRoute>} />
          <Route path="/chats" element={<ProtectedRoute><PageWrapper><ChatList /></PageWrapper></ProtectedRoute>} />
          <Route path="/chats/:id" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><PageWrapper><Profile /></PageWrapper></ProtectedRoute>} />
          <Route path="/profile/edit" element={<ProtectedRoute><PageWrapper><EditProfile /></PageWrapper></ProtectedRoute>} />
          <Route path="/profile/:username" element={<ProtectedRoute><PageWrapper><OtherProfile /></PageWrapper></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><PageWrapper><Notifications /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><PageWrapper><Settings /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings/account" element={<ProtectedRoute><PageWrapper><AccountSettings /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings/privacy" element={<ProtectedRoute><PageWrapper><PrivacySettings /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings/security" element={<ProtectedRoute><PageWrapper><SecuritySettings /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings/notifications" element={<ProtectedRoute><PageWrapper><NotificationSettings /></PageWrapper></ProtectedRoute>} />
          <Route path="/settings/appearance" element={<ProtectedRoute><PageWrapper><AppearanceSettings /></PageWrapper></ProtectedRoute>} />
          <Route path="/business" element={<ProtectedRoute><PageWrapper><BusinessCenter /></PageWrapper></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><PageWrapper><WalletPage /></PageWrapper></ProtectedRoute>} />
          <Route path="/verification" element={<ProtectedRoute><PageWrapper><Verification /></PageWrapper></ProtectedRoute>} />
          <Route path="/news" element={<ProtectedRoute><PageWrapper><News /></PageWrapper></ProtectedRoute>} />
          <Route path="/help" element={<ProtectedRoute><PageWrapper><Help /></PageWrapper></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute><PageWrapper><About /></PageWrapper></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><BLinkAI /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        {user && <BottomNav />}
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;