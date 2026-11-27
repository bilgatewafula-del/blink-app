import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { startChatLive, stopChatLive } from '../lib/chatLive';

// Invisible. Keeps typing, delivered receipts and the Chats-tab badge live on every screen.
export default function ChatBridge() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.id) startChatLive(user.id);
    else stopChatLive();
    return () => stopChatLive();
  }, [user?.id]);
  return null;
}
