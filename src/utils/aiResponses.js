import { aiKnowledge } from "../data/aiKnowledge";
import { setLastTopic, getLastTopic } from "./aiMemory";

// 🔍 cleaner matcher
const match = (text, keywords) =>
  keywords.some((k) => text.includes(k));

// 🧼 CLEAN FORMATTER (FIXED)
const format = (title, body, tips = [], suggestions = []) => {
  return [
    title,
    "",
    body,
    "",
    tips.length
      ? "💡 Tips:\n" + tips.map((t) => `• ${t}`).join("\n")
      : "",
    "",
    suggestions.length
      ? "🔎 You can also ask:\n" + suggestions.map((s) => `• ${s}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
};

export const getAIResponse = (input) => {
  const text = input.toLowerCase().trim();

  // 👋 GREETING (FIXED TIME LOGIC)
  if (match(text, ["hi", "hello", "hey"])) {
    setLastTopic("greeting");

    const hour = new Date().getHours();

    let timeGreeting = "Hello";
    if (hour < 12) timeGreeting = "Good Morning ☀️";
    else if (hour < 17) timeGreeting = "Good Afternoon 🌤️";
    else if (hour < 21) timeGreeting = "Good Evening 🌙";

    return format(
      `${timeGreeting} 👋`,
      `I’m B-Link AI, your assistant created by Bilgate Mukhayo.

I help you navigate B-Link — including posts, profile, chats, wallet, news, and settings.

I’m here to make everything simple and smooth for you.`,
      ["Ask anything about B-Link features", "I can guide you step-by-step"],
      ["How do I create a post?", "What is Wallet?", "How do messages work?"]
    );
  }

  // 🤖 WHO ARE YOU (CLEAN)
  if (match(text, ["who are you", "what are you", "your name"])) {
    setLastTopic("identity");

    return format(
      "🤖 B-Link AI",
      `I am the official AI assistant inside B-Link.

My purpose is to help you understand and use all features of the platform easily — from posting content to managing your account and exploring the app.`,
      ["I can explain every feature in simple steps"],
      ["Explain Home Feed", "How does Wallet work?", "What is Business Center?"]
    );
  }

  // 🏠 HOME
  if (match(text, ["home", "feed", "timeline"])) {
    setLastTopic("home");

    return format(
      "🏠 Home Feed",
      `This is the main section of B-Link where you see posts from people you follow.

It includes:
• Posts from users you follow  
• Trending content  
• Likes, comments, and shares  

It keeps you updated with what’s happening in your network.`,
      ["Engage with posts to improve your feed"],
      ["How does ranking work?", "Why don’t I see posts?", "How do I follow users?"]
    );
  }

  // ✍️ CREATE POST
  if (match(text, ["post", "create", "upload"])) {
    setLastTopic("create_post");

    return format(
      "✍️ Create Post",
      `You can share content with your followers.

Supported:
• Text posts  
• Images  
• Updates and thoughts  

Your post will appear on Home Feed and your profile.`,
      ["Use clear captions for better engagement"],
      ["How do I delete a post?", "Why is my post not uploading?", "Who can see my post?"]
    );
  }

  // 👤 PROFILE
  if (match(text, ["profile", "account"])) {
    setLastTopic("profile");

    return format(
      "👤 Profile",
      `Your profile shows your identity on B-Link.

It includes:
• Your posts  
• Followers  
• Following  
• Bio and profile photo  

You can edit it anytime in settings.`,
      ["Keep your profile updated"],
      ["How do I change username?", "How do I edit profile?", "Can I make account private?"]
    );
  }

  // 💬 MESSAGES
  if (match(text, ["message", "chat", "dm"])) {
    setLastTopic("messages");

    return format(
      "💬 Messages",
      `You can chat privately with other users.

Features:
• Send messages  
• Block users  
• Report abuse  

Messaging is fast and secure.`,
      ["Block spam users for safety"],
      ["How do I start a chat?", "Can I delete messages?", "How do I block someone?"]
    );
  }

  // 💰 WALLET
  if (match(text, ["wallet", "money", "payment"])) {
    setLastTopic("wallet");

    return format(
      "💰 Wallet",
      `Wallet is currently under development.

Coming soon:
• M-Pesa integration  
• Sending and receiving money  
• Transaction tracking  

For now, all payments are disabled.`,
      ["Avoid scams claiming instant payments"],
      ["When will Wallet launch?", "How will M-Pesa work?", "Is Wallet active?"]
    );
  }

  // 🏪 BUSINESS
  if (match(text, ["business", "ads"])) {
    setLastTopic("business");

    return format(
      "🏪 Business Center",
      `This helps businesses grow on B-Link.

Features:
• Business profiles  
• Promotions (coming soon)  
• Audience reach tools  

Built for creators and companies.`,
      ["Use professional branding"],
      ["How do I create business account?", "How do ads work?", "Who can use it?"]
    );
  }

  // ⚙️ SETTINGS
  if (match(text, ["settings", "privacy", "security"])) {
    setLastTopic("settings");

    return format(
      "⚙️ Settings",
      `Control your account here.

You can manage:
• Account info  
• Privacy  
• Notifications  
• Appearance  
• Security  

Everything is centralized for easy control.`,
      ["Review privacy regularly"],
      ["How do I change password?", "How do I logout?", "How do I make account private?"]
    );
  }

  // 🧠 MEMORY FALLBACK
  const last = getLastTopic();
  if (last && aiKnowledge[last]) {
    return format(
      "📌 Continuing Topic",
      aiKnowledge[last],
      ["Ask for more details anytime"],
      ["Explain more", "Give steps", "Show examples"]
    );
  }

  // ❓ DEFAULT
  return format(
    "🤖 B-Link AI Assistant",
    `I can help you understand and use B-Link.

Ask me about:
• Home Feed  
• Posts  
• Profile  
• Messages  
• Wallet  
• Business Center  
• Settings  

Just tell me what you need help with.`,
    [],
    ["How do I create a post?", "What is Wallet?", "Explain Home Feed"]
  );
};