// src/hooks/useAdminGuard.js
// Use this hook in any page that requires admin access
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function useAdminGuard(minRole = 'moderator') {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  const hierarchy = { blink: 4, admin: 3, moderator: 2, user: 1 };

  useEffect(() => {
    if (loading) return;
    const userLevel = hierarchy[profile?.role] || 1;
    const required  = hierarchy[minRole]        || 2;
    if (userLevel < required) navigate('/');
  }, [profile, loading]);

  const can = (action) => {
    const role = profile?.role || 'user';
    const permissions = {
      warn:       ['blink','admin','moderator'],
      restrict:   ['blink','admin'],
      suspend:    ['blink','admin'],
      ban:        ['blink'],
      unban:      ['blink'],
      changeRole: ['blink'],
      deletePost: ['blink','admin','moderator'],
      deleteUser: ['blink'],
      viewLogs:   ['blink','admin'],
      viewPanel:  ['blink','admin','moderator'],
    };
    return permissions[action]?.includes(role) ?? false;
  };

  return { role: profile?.role || 'user', can };
}