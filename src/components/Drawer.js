import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Settings,
  Bookmark,
  Wallet,
  BadgeCheck,
  BarChart2,
  HelpCircle,
  Info,
  LogOut,
  Newspaper,
  User,
  Bell,
  ChevronRight,
  Home,
  Search,
  PlusSquare,
  MessageCircle,
  Sparkles,
  Shield,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { formatNumber } from '../utils/formatNumber';

const Drawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user, signOut } = useAuth();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchUnread();
  }, [user, isOpen]);

  const fetchUnread = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setUnreadNotifs(count || 0);
  };

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    onClose();
  };

  const mainItems = [
    {
      icon: Home,
      label: 'Home',
      path: '/',
      color: 'text-[#1E6FFF]',
      bg: 'bg-[#1E6FFF]/15',
    },
    {
      icon: Search,
      label: 'Discover',
      path: '/discover',
      color: 'text-[#7B2FFF]',
      bg: 'bg-[#7B2FFF]/15',
    },
    {
      icon: PlusSquare,
      label: 'Create Post',
      path: '/create',
      color: 'text-[#00D4C8]',
      bg: 'bg-[#00D4C8]/15',
    },
    {
      icon: MessageCircle,
      label: 'Chats',
      path: '/chats',
      color: 'text-[#00B4D8]',
      bg: 'bg-[#00B4D8]/15',
    },
    {
      icon: Bell,
      label: 'Notifications',
      path: '/notifications',
      color: 'text-[#FF6B35]',
      bg: 'bg-[#FF6B35]/15',
      badge: unreadNotifs > 0 ? unreadNotifs : null,
    },
    {
      icon: User,
      label: 'My Profile',
      path: '/profile',
      color: 'text-[#2ECC71]',
      bg: 'bg-[#2ECC71]/15',
    },
  ];

  const moreItems = [
    {
      icon: Sparkles,
      label: 'B-Link AI',
      path: '/ai',
      gradient: true,
    },
    {
      icon: Bookmark,
      label: 'Saved Posts',
      path: '/profile',
      color: 'text-[#FFD700]',
      bg: 'bg-[#FFD700]/15',
    },
    {
      icon: BarChart2,
      label: 'Business Center',
      path: '/business',
      color: 'text-[#FF6B35]',
      bg: 'bg-[#FF6B35]/15',
    },
    {
      icon: Wallet,
      label: 'Wallet',
      path: '/wallet',
      color: 'text-[#2ECC71]',
      bg: 'bg-[#2ECC71]/15',
    },
    {
      icon: BadgeCheck,
      label: 'Verification',
      path: '/verification',
      color: 'text-[#1E6FFF]',
      bg: 'bg-[#1E6FFF]/15',
    },
    {
      icon: Newspaper,
      label: 'News',
      path: '/news',
      color: 'text-red-400',
      bg: 'bg-red-400/15',
    },
    {
      icon: Settings,
      label: 'Settings',
      path: '/settings',
      color: 'text-[#6B7280]',
      bg: 'bg-white/10',
    },
    {
      icon: HelpCircle,
      label: 'Help Center',
      path: '/help',
      color: 'text-[#00D4C8]',
      bg: 'bg-[#00D4C8]/15',
    },
    {
      icon: Info,
      label: 'About B-Link',
      path: '/about',
      color: 'text-[#6B7280]',
      bg: 'bg-white/10',
    },
  ];

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer panel — slides from RIGHT */}
      <div
        className={
          'fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-[#0d1f3c] border-l border-white/10 z-50 flex flex-col transform transition-transform duration-300 ease-in-out ' +
          (isOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => handleNavigate('/profile')} className="relative">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  className="w-11 h-11 rounded-full object-cover border-2 border-[#1E6FFF]/50"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1E6FFF] to-[#7B2FFF] flex items-center justify-center text-white font-bold text-lg border-2 border-[#1E6FFF]/50">
                  {profile?.display_name?.[0]?.toUpperCase() || 'B'}
                </div>
              )}

              {profile?.is_verified && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#1E6FFF] rounded-full flex items-center justify-center border-2 border-[#0d1f3c]">
                  <span className="text-white text-[8px] font-bold">✓</span>
                </div>
              )}
            </button>

            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">
                {profile?.display_name || 'B-Link User'}
              </p>
              <p className="text-[#6B7280] text-xs truncate">
                @{profile?.username || 'user'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#6B7280] hover:text-white hover:bg-white/20 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex justify-around py-3 px-4 border-b border-white/10 flex-shrink-0">
          {[
            { label: 'Posts', value: profile?.post_count || 0 },
            { label: 'Followers', value: profile?.follower_count || 0 },
            { label: 'Following', value: profile?.following_count || 0 },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => handleNavigate('/profile')}
              className="text-center hover:opacity-80 transition-opacity"
            >
              <p className="text-white font-bold text-base">{formatNumber(s.value)}</p>
              <p className="text-[#6B7280] text-xs">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Scrollable menu */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Main navigation */}
          <div className="px-3 mb-1">
            <p className="text-[#6B7280] text-[10px] font-bold uppercase tracking-widest px-2 py-2">
              Navigation
            </p>

            {mainItems.map(({ icon: Icon, label, path, color, bg, badge }) => {
              const isActive = location.pathname === path;

              return (
                <button
                  key={path + label}
                  onClick={() => handleNavigate(path)}
                  className={
                    'w-full flex items-center gap-3 px-3 py-3 rounded-2xl mb-0.5 transition-all group ' +
                    (isActive
                      ? 'bg-[#1E6FFF]/20 border border-[#1E6FFF]/30'
                      : 'hover:bg-white/5')
                  }
                >
                  <div
                    className={
                      'w-9 h-9 rounded-xl ' +
                      bg +
                      ' flex items-center justify-center flex-shrink-0'
                    }
                  >
                    <Icon size={18} className={color} />
                  </div>

                  <span
                    className={
                      'text-sm font-medium flex-1 text-left ' +
                      (isActive ? 'text-white font-bold' : 'text-white/80')
                    }
                  >
                    {label}
                  </span>

                  {badge && (
                    <span className="bg-[#FF6B35] text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}

                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#1E6FFF]" />}
                </button>
              );
            })}
          </div>

          {/* More section */}
          <div className="px-3 mt-2">
            <p className="text-[#6B7280] text-[10px] font-bold uppercase tracking-widest px-2 py-2">
              More
            </p>

            {moreItems.map((item) => (
              <button
                key={item.path + item.label}
                onClick={() => handleNavigate(item.path)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl mb-0.5 hover:bg-white/5 transition-all group"
              >
                {item.gradient ? (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#1E6FFF] via-[#7B2FFF] to-[#00D4C8] shadow-lg shadow-[#1E6FFF]/30">
                    <item.icon size={18} className="text-white" />
                  </div>
                ) : (
                  <div
                    className={
                      'w-9 h-9 rounded-xl ' +
                      item.bg +
                      ' flex items-center justify-center flex-shrink-0'
                    }
                  >
                    <item.icon size={18} className={item.color} />
                  </div>
                )}

                <span className="text-white/80 text-sm font-medium flex-1 text-left">
                  {item.label}
                </span>

                <ChevronRight
                  size={14}
                  className="text-white/20 group-hover:text-white/40 transition-colors"
                />
              </button>
            ))}

            {/* Admin Panel - only blink/admin/moderator */}
            {['blink', 'admin', 'moderator'].includes(profile?.role) && (
              <button
                onClick={() => handleNavigate('/admin')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl mb-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <Shield size={18} className="text-red-400" />
                </div>

                <span className="text-red-400 text-sm font-semibold flex-1 text-left">
                  Admin Panel
                </span>

                <ChevronRight
                  size={14}
                  className="text-red-400/50 group-hover:text-red-400 transition-colors"
                />
              </button>
            )}
          </div>
        </div>

        {/* Sign out */}
        <div className="flex-shrink-0 p-4 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
              <LogOut size={18} className="text-red-400" />
            </div>
            <span className="text-red-400 text-sm font-semibold">Sign Out</span>
          </button>

          <p className="text-center text-[#6B7280] text-[10px] mt-3">
            B-Link v2.0 · Made in Kenya 🇰🇪
          </p>
        </div>
      </div>
    </>
  );
};

export default Drawer;