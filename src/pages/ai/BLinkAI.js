import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Send, RefreshCw, Sparkles, Copy, ChevronRight } from 'lucide-react';

// ── Time-based greeting ──────────────────────────────────────────────
const getTimeGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
};

// ── App knowledge base ───────────────────────────────────────────────
const APP_INFO = {
  name: 'B-Link',
  founder: 'Bilgate Mukhayo',
  tagline: "Africa's GenZ Social Platform",
  description: `B-Link is Africa's premier social media platform built specifically for African GenZ users and the African diaspora worldwide. It combines the best features of leading social media platforms while celebrating African culture, languages, and communities. B-Link was founded by Bilgate Mukhayo with the vision of creating a digital home for Africans — a place where African stories, creativity, and connections thrive.`,

  features: {
    'Home Feed': {
      description: 'The Home feed is your main content dashboard. It has three tabs — Following (posts from people you follow), Trending (the most liked and engaging posts), and Country (posts from people in your country). The feed refreshes in real time, so you always see the latest content. Pull down anywhere to refresh. Scroll down to load more posts automatically.',
      icon: '🏠'
    },
    'Posts': {
      description: 'Create text posts with beautiful colored backgrounds, upload up to 6 images per post, add hashtags to reach more people, tag your location, set who can see it (Public, Followers only, or Private), and react to posts with 8 different reactions — Like, Love, Haha, Wow, Sad, Fire, Clap, and 100. Long-press the React button to see all reaction options.',
      icon: '📝'
    },
    'Vibes': {
      description: 'Vibes is B-Link\'s short video feature — Africa\'s answer to TikTok. Upload videos between 5 and 60 seconds in categories like Street, Music, Comedy, Dance, Food, Sports, Knowledge, and Faith. Vibes automatically delete after 7 days to keep the platform fresh and save storage. Swipe up for the next Vibe, swipe down to go back. React with Fire 🔥, comment, share, and save your favourite Vibes.',
      icon: '🎬'
    },
    'Stories': {
      description: 'Stories are photos or text posts that disappear after 24 hours, just like on Instagram. Tap the story circles at the top of your feed to view. Create your own story using the + button. You can reply to someone\'s story — it goes straight to their chat inbox.',
      icon: '⭕'
    },
    'Chats': {
      description: 'B-Link has a full-featured direct messaging system. Send text messages, photos, voice notes, and react to messages with emoji. You can see when messages are sent (✓), delivered (✓✓), or read (✓✓ in blue). Reply to specific messages by swiping them. Edit or delete messages after sending. Star important messages, pin conversations, schedule messages for later, and search through your message history.',
      icon: '💬'
    },
    'Discover': {
      description: 'The Discover page helps you find new people, posts, and hashtags. Search for any user by name or username — even typing a single letter shows results. Browse trending hashtags to see what people are talking about. See a grid of trending posts. Follow people directly from Discover without visiting their profile.',
      icon: '🔍'
    },
    'Notifications': {
      description: 'Notifications keep you updated on all activity. You get notified for reactions on your posts, comments, replies, new followers, mentions, reposts, direct messages, and milestones like reaching 1,000 views. Notifications are grouped intelligently — instead of seeing 50 individual likes, you see "John and 49 others reacted to your post." There are four tabs: All, Activity, Social, and Messages.',
      icon: '🔔'
    },
    'Profile': {
      description: 'Your profile shows your display name, username, bio, avatar, follower and following counts, your post grid, and saved posts. Edit your profile to add a bio, website link, and profile photo. You can pin up to 3 posts to the top of your profile. Other users can follow you from your profile, and you can see who follows you and who you follow.',
      icon: '👤'
    },
    'Business Center': {
      description: 'The Business Center is your analytics dashboard. It shows total impressions, unique reach (how many different people saw your posts), engagement rate, total reactions, comments, shares, and your top performing post. There are four tabs: Overview, Posts Performance, Audience Insights, and Boost Packages (coming soon). Use it to understand what content works best for your audience.',
      icon: '📊'
    },
    'Wallet': {
      description: 'The B-Link Wallet is coming soon. It will allow creators to receive M-Pesa tips directly from their followers, earn from their content, withdraw earnings, and access detailed revenue analytics. Creator tiers are already tracked — Bronze, Silver, and Gold — based on your follower count. You will be notified when the wallet launches.',
      icon: '💰'
    },
    'Verification': {
      description: 'B-Link offers three types of verification badges — Personal (KES 200/month), Business (KES 500/month), and Creator (free for accounts with 1,000+ followers). Verification confirms your identity and adds a badge to your profile and posts. To apply, go to Menu → Verification and follow the 3-step process: choose badge type, upload your ID, and submit for review. Review takes 3–5 business days.',
      icon: '✅'
    },
    'News': {
      description: 'The News section brings you the latest stories from Kenya and across Africa. Categories include Kenya, Politics, Business, Technology, Sports, and Africa. Stories are updated in real time. Tap any story to read the full article.',
      icon: '📰'
    },
    'B-Link AI': {
      description: 'B-Link AI — that\'s me! I am your built-in assistant available from the menu. I can answer any question about B-Link, help you write captions and bios, suggest content ideas, draft messages, and provide support. I am available 24/7 and always happy to help.',
      icon: '🤖'
    },
    'Settings': {
      description: 'Settings lets you manage your Account (email, phone, password), Privacy (who can see your posts and profile), Security (login activity, two-factor authentication), Notifications (what alerts you receive), and Appearance (light or dark mode). Access Settings from the menu (hamburger icon) on the Home page.',
      icon: '⚙️'
    },
  },

  drawer: {
    description: 'The hamburger menu (three lines in the top right of Home) opens the main navigation drawer. From here you can access your Profile, Business Center, Wallet, Verification, News, B-Link AI, Settings, Help Center, and About B-Link. Your follower and following counts are also shown in the drawer for quick reference.',
  },

  install: {
    android: 'Open B-Link in Chrome or Samsung Internet → tap the 3-dot menu → tap "Add to Home screen" or "Install app" → tap Install. The app will appear on your home screen like a native app, opens fullscreen with no browser bar.',
    ios: 'Open B-Link in Safari (must be Safari, not Chrome) → tap the Share icon (square with arrow) → tap "Add to Home Screen" → tap Add.',
  },

  support: {
    email: 'support@blink.africa',
    help: 'Available in the app under Menu → Help Center',
    report: 'Tap the three dots on any post, comment, or profile to report it.',
  },
};

// ── Smart response engine ────────────────────────────────────────────
const generateResponse = (input, userName) => {
  const msg   = input.toLowerCase().trim();
  const first = userName?.split(' ')[0] || 'there';
  const time  = getTimeGreeting();

  // Greetings
  if (/^(hi|hello|hey|hey there|hi there|howdy|yo|sup|hola|habari|mambo|sawa)[\s!.?]*$/.test(msg)) {
    const greetings = [
      `${time}, ${first}! 😊 Welcome to B-Link AI. I'm here to help you get the most out of B-Link. Is there something specific you'd like to know, or shall I walk you through what B-Link has to offer?`,
      `${time}, ${first}! Great to see you here. I'm Blinky, your B-Link assistant. Whether you need help navigating the app, writing a bio, or understanding a feature — I'm here for you. What can I help you with today?`,
      `${time}! Hope your day is going well, ${first}. I'm B-Link AI, ready to assist. Ask me anything about B-Link, its features, or how to get started. What's on your mind?`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // How are you
  if (/how are you|how r you|how u doing|how's it going|how do you do/.test(msg)) {
    const responses = [
      `I'm doing wonderfully, thank you for asking, ${first}! I'm always ready and happy to assist B-Link users like yourself. How about you — is everything going well? Is there anything about B-Link I can help you with?`,
      `Thank you for asking! I'm functioning perfectly and genuinely glad to be here to help. I hope your day is treating you well, ${first}. What can I assist you with today?`,
      `I'm great, ${first}! Full of knowledge about B-Link and ready to help. More importantly — how are you finding B-Link so far? Any features you'd like me to explain?`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Good morning/afternoon/evening
  if (/^good (morning|afternoon|evening|night)/.test(msg)) {
    return `${time} to you too, ${first}! 🌟 What a wonderful time to connect. I'm B-Link AI, your personal guide to everything on this platform. Is there something I can help you with, or would you like me to tell you about B-Link's latest features?`;
  }

  // Who are you / what are you
  if (/who are you|what are you|introduce yourself|tell me about yourself|your name|what's your name/.test(msg)) {
    return `I'm B-Link AI — your intelligent assistant built right into the B-Link platform, created by ${APP_INFO.founder}, the CEO and Founder of B-Link.\n\nMy purpose is simple: to make your B-Link experience as smooth, enjoyable, and productive as possible. I can explain any feature, help you write content, answer your questions, and provide support whenever you need it.\n\nWe are genuinely pleased to have you as part of the B-Link community, ${first}. Whether you're new here or a seasoned user, I'm always here to help. What would you like to know?`;
  }

  // About B-Link
  if (/tell me about blink|what is blink|about blink|what's blink|describe blink/.test(msg)) {
    return `${APP_INFO.name} is ${APP_INFO.tagline}.\n\n${APP_INFO.description}\n\nHere's a quick overview of what makes B-Link special:\n\n🏠 **Home Feed** — Follow people, see trending posts, and browse content from your country.\n\n🎬 **Vibes** — Short videos (5–60 seconds) celebrating African creativity, music, comedy, dance, and more.\n\n💬 **Chats** — Real-time messaging with read receipts, reactions, and media sharing.\n\n⭕ **Stories** — 24-hour disappearing photos and text posts.\n\n🔍 **Discover** — Find new people, trending hashtags, and viral content.\n\n📊 **Business Center** — Analytics for creators and businesses.\n\n💰 **Wallet** — M-Pesa tipping and creator earnings (coming soon).\n\nB-Link is completely free to join and use. Would you like me to dive deeper into any of these features?`;
  }

  // Home / feed
  if (/home|feed|following tab|trending tab|country tab|scroll/.test(msg)) {
    const f = APP_INFO.features['Home Feed'];
    return `${f.icon} **Home Feed**\n\n${f.description}\n\nPro tip: Use the Country tab to discover content from creators in your region — a great way to find local talent and trends! Would you like to know more about any other feature?`;
  }

  // Posts / create post
  if (/post|create post|upload post|how to post|reactions|react|like|love|haha/.test(msg)) {
    const f = APP_INFO.features['Posts'];
    return `${f.icon} **Posts on B-Link**\n\n${f.description}\n\nTo create a post: tap the **+** button in the bottom navigation or go to Discover → Create.\n\nFor reactions: tap and hold (long-press) the Like/React button on any post to see all 8 reaction options — 👍 Like, ❤️ Love, 😂 Haha, 😮 Wow, 😢 Sad, 🔥 Fire, 👏 Clap, and 💯 100.\n\nNeed help writing a caption or coming up with post ideas? Just ask me!`;
  }

  // Vibes / videos
  if (/vibe|short video|tiktok|reels|upload video|video feed/.test(msg)) {
    const f = APP_INFO.features['Vibes'];
    return `${f.icon} **Vibes — B-Link's Short Videos**\n\n${f.description}\n\nTo upload a Vibe: go to the Vibes tab (⚡ in the bottom navigation) → tap the + button → select your video → add a caption, hashtags, category, and location → tap Post.\n\n**Video requirements:**\n• Duration: 5 to 60 seconds\n• Max file size: 50MB\n• Formats: MP4, MOV, WebM, 3GP\n• Best quality: Vertical 1080×1920 (9:16)\n\nVibes auto-delete after 7 days to keep the feed fresh and save storage space. This is what makes Vibes unique! Would you like tips on how to make your Vibes go viral?`;
  }

  // Stories
  if (/storie|24 hour|disappear/.test(msg)) {
    const f = APP_INFO.features['Stories'];
    return `${f.icon} **Stories on B-Link**\n\n${f.description}\n\nTo create a story: tap the + circle at the beginning of the story row at the top of your Home feed. You can upload a photo or create a text story with a colourful background.\n\nStories are a great way to share moments with your followers without them permanently appearing on your profile. Is there anything else you'd like to know?`;
  }

  // Chats / messages
  if (/chat|message|dm|direct message|inbox|conversation/.test(msg)) {
    const f = APP_INFO.features['Chats'];
    return `${f.icon} **Chats — B-Link Messaging**\n\n${f.description}\n\n**Message status indicators:**\n✓ — Message sent\n✓✓ (grey) — Message delivered\n✓✓ (blue glow) — Message read\n\n**Tips:**\n• Swipe a message to reply to it\n• Double-tap a message to react with emoji\n• Long-press a message to see more options (edit, delete, star, pin, forward)\n• Tap the search icon in a chat to search through message history\n\nIs there anything specific about chats you'd like help with?`;
  }

  // Discover / search
  if (/discover|search|find people|find user|hashtag|trending/.test(msg)) {
    const f = APP_INFO.features['Discover'];
    return `${f.icon} **Discover**\n\n${f.description}\n\nThe Discover page is your gateway to growing your community on B-Link. The more people you follow, the richer your Home feed becomes.\n\n**Search tips:**\n• Search by full name, username, or even just a few letters\n• Tap any hashtag to see all posts using it\n• Browse the trending posts grid for viral content\n\nWould you like tips on how to grow your following on B-Link?`;
  }

  // Notifications
  if (/notification|alert|ping|notif/.test(msg)) {
    const f = APP_INFO.features['Notifications'];
    return `${f.icon} **Notifications**\n\n${f.description}\n\n**Notification tabs:**\n• **All** — Everything in one place\n• **Activity** — Reactions, comments, reposts, shares\n• **Social** — New followers and mentions\n• **Messages** — Direct message alerts\n\nAt the top of your notifications, you'll see a **Today's Activity** summary showing your reactions, comments, new followers, and messages at a glance.\n\nIs there anything else I can help you with?`;
  }

  // Profile
  if (/profile|bio|avatar|username|followers|following/.test(msg)) {
    const f = APP_INFO.features['Profile'];
    return `${f.icon} **Your B-Link Profile**\n\n${f.description}\n\n**To edit your profile:**\n1. Go to the Profile tab (bottom right)\n2. Tap "Edit Profile"\n3. Update your name, bio, avatar, website, and country\n4. Tap Save\n\n**Bio tips — I can help you write one! Just tell me:**\n• What you do or create\n• Your interests\n• Your location\n• A fun fact about yourself\n\nWould you like me to write a bio for you right now?`;
  }

  // Business center / analytics
  if (/business center|analytics|insights|engagement rate|reach|impressions/.test(msg)) {
    const f = APP_INFO.features['Business Center'];
    return `${f.icon} **Business Center**\n\n${f.description}\n\n**Key metrics explained:**\n• **Views** — Total number of times your posts were seen (same person can view multiple times)\n• **Reach** — Number of unique people who saw your posts\n• **Engagement Rate** — (Reactions + Comments + Shares + Reposts) ÷ Reach × 100\n• **Impressions** — Total times your content appeared on screen\n\nAccess the Business Center from the hamburger menu → Business Center.\n\nWould you like tips on how to improve your engagement rate on B-Link?`;
  }

  // Wallet
  if (/wallet|mpesa|tip|earn|money|payment|creator earning/.test(msg)) {
    const f = APP_INFO.features['Wallet'];
    return `${f.icon} **B-Link Wallet**\n\n${f.description}\n\nThe wallet is coming in phases:\n• **Q2 2025** — M-Pesa tips and basic creator earnings\n• **Q3 2025** — Withdrawals and gift subscriptions\n• **Q4 2025** — Revenue analytics and creator shop\n\nYour creator tier is already being tracked:\n🔰 Bronze — Under 100 followers\n⭐ Silver — 100+ followers\n🌟 Gold — 1,000+ followers\n\nThe higher your tier when the wallet launches, the better your earning potential. Keep growing your following! Would you like tips on how to grow faster?`;
  }

  // Verification / badges
  if (/verif|badge|verified|creator badge|business badge/.test(msg)) {
    const f = APP_INFO.features['Verification'];
    return `${f.icon} **Verification Badges**\n\n${f.description}\n\n**Badge types and pricing:**\n• ✓ **Personal** — KES 200/month (identity verification)\n• 🏢 **Business** — KES 500/month (for companies and organisations)\n• ⭐ **Creator** — FREE for accounts with 1,000+ followers\n\n**How to apply:**\n1. Open the hamburger menu\n2. Tap Verification\n3. Choose your badge type\n4. Upload a valid ID\n5. Submit — review takes 3–5 business days\n\nOnce verified, your badge appears on your profile and all your posts, building trust with your audience. Any questions about the process?`;
  }

  // News
  if (/news|article|kenya news|africa news|headlines/.test(msg)) {
    const f = APP_INFO.features['News'];
    return `${f.icon} **B-Link News**\n\n${f.description}\n\nThe News section is perfect for staying informed while staying on B-Link. Categories include:\n• 🇰🇪 Kenya\n• 🏛️ Politics\n• 💼 Business\n• 💻 Technology\n• ⚽ Sports\n• 🌍 Africa\n\nAccess News from the hamburger menu → News. Would you like to know about any other section of the app?`;
  }

  // Settings
  if (/setting|privacy|security|account setting|notification setting/.test(msg)) {
    const f = APP_INFO.features['Settings'];
    return `${f.icon} **Settings**\n\n${f.description}\n\n**Settings sections:**\n• **Account** — Change your email, phone number, or password\n• **Privacy** — Control who can see your posts, profile, and send you messages\n• **Security** — Manage login sessions and security options\n• **Notifications** — Choose which alerts you receive and how\n• **Appearance** — Switch between light and dark mode\n\nTo access Settings: tap the hamburger menu (three lines, top right of Home) → Settings. Is there a specific setting you need help with?`;
  }

  // Drawer / menu
  if (/menu|hamburger|drawer|sidebar|three lines/.test(msg)) {
    return `☰ **The B-Link Menu**\n\n${APP_INFO.drawer.description}\n\n**What's inside the menu:**\n• 👤 Profile — View and edit your profile\n• 🔍 Discover — Find new people\n• ➕ Create Post — Share something new\n• 💬 Chats — Your messages\n• 🔔 Notifications — Your alerts\n• 🔖 Saved Posts — Content you've bookmarked\n• 📊 Business Center — Your analytics\n• 💰 Wallet — Creator earnings (coming soon)\n• ✅ Verification — Apply for a badge\n• 📰 News — Kenya and Africa news\n• 🤖 B-Link AI — That's me!\n• ⚙️ Settings — App preferences\n• ❓ Help Center — Support and FAQs\n• ℹ️ About B-Link — Learn more about the platform\n\nTap the hamburger icon (three lines in the top right corner of the Home page) to open the menu anytime.`;
  }

  // Install / download
  if (/install|download|home screen|pwa|add to home|apk/.test(msg)) {
    return `📲 **Installing B-Link on Your Phone**\n\nB-Link is a Progressive Web App (PWA) — you can install it directly from your browser for free, without needing the Play Store or App Store.\n\n**Android (Chrome or Samsung Internet):**\n${APP_INFO.install.android}\n\n**iPhone (Safari only):**\n${APP_INFO.install.ios}\n\nOnce installed, B-Link opens fullscreen without any browser bars — it looks and feels exactly like a native app. The icon will be your B-Link logo.\n\nWould you like help with anything else?`;
  }

  // Help / support / contact
  if (/help|support|contact|problem|issue|bug|report|error/.test(msg)) {
    return `🆘 **B-Link Support**\n\nI'm sorry to hear you're experiencing an issue. Here's how to get help:\n\n• **In-app Help Center** — Open the menu → Help Center. You'll find FAQs and guides for common questions.\n\n• **Report a problem** — On any post, comment, or profile, tap the three dots (⋯) → Report. Our moderation team reviews all reports.\n\n• **Email support** — Reach our team directly at **${APP_INFO.support.email}** for account issues, billing questions, or anything else that needs human attention.\n\nFor issues I can't resolve here, please contact the admin team via email — they're responsive and happy to help. Is there something specific I can assist you with right now?`;
  }

  // Write bio
  if (/write.*bio|create.*bio|help.*bio|bio for me|generate.*bio/.test(msg)) {
    return `✍️ **Let's Write Your B-Link Bio!**\n\nA great bio tells people who you are, what you do, and why they should follow you — all in a few lines.\n\nTo write you the perfect bio, tell me:\n\n1. **What's your name or what do you go by?**\n2. **What do you create or do?** (music, comedy, photography, business, fashion, etc.)\n3. **Where are you from?** (city/country)\n4. **What are you passionate about?**\n5. **Any fun fact or catchphrase?**\n\nOnce you share those details, I'll craft a professional and engaging bio for you right away!`;
  }

  // Write caption
  if (/write.*caption|caption for|help.*caption|generate.*caption|caption ideas/.test(msg)) {
    return `📸 **Caption Writing Assistant**\n\nI'd love to help you craft the perfect caption! A good caption increases engagement and tells the story behind your post.\n\nTell me:\n1. **What's the post about?** (photo, quote, announcement, achievement, etc.)\n2. **What mood or tone?** (inspirational, funny, professional, casual)\n3. **Any key message you want to get across?**\n4. **Should I include hashtags?**\n\nShare those details and I'll write several caption options for you to choose from!`;
  }

  // Growth tips
  if (/grow|followers|engagement|viral|popular|reach more|tips/.test(msg)) {
    return `📈 **How to Grow on B-Link**\n\nHere are proven strategies to build your audience and increase engagement:\n\n**Content:**\n• Post consistently — aim for 1–2 posts per day\n• Use 3–5 relevant hashtags per post\n• Upload Vibes regularly — short videos get 3x more reach\n• Share stories daily to stay visible to your followers\n\n**Engagement:**\n• Reply to every comment within the first hour — it signals the algorithm\n• Like and comment genuinely on other people's content\n• Follow people in your niche — many will follow back\n• Engage with trending hashtags in your category\n\n**Timing:**\n• Post between 6 PM – 10 PM East Africa Time for maximum reach\n• Monday, Wednesday, and Friday tend to have the highest engagement\n\n**Profile:**\n• Complete your bio with keywords people might search\n• Use a clear, professional profile photo\n• Pin your best 3 posts to your profile\n\n**B-Link specific:**\n• Join the Trending tab by getting quick engagement in the first 30 minutes after posting\n• Use the Country tab to target local audiences first\n\nWould you like me to review your content strategy or write some post ideas for you?`;
  }

  // Thank you
  if (/thank|thanks|thank you|appreciate|helpful/.test(msg)) {
    const responses = [
      `You're very welcome, ${first}! 😊 It's genuinely my pleasure to help. That's exactly what I'm here for. Is there anything else you'd like to know about B-Link?`,
      `My pleasure entirely, ${first}! Feel free to come back anytime you have questions — big or small, I'm always happy to help. Have a wonderful day! 🌟`,
      `Thank you for the kind words, ${first}! It means a lot. You're an important part of the B-Link community, and we're glad to have you here. Is there anything else I can assist you with?`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Goodbye / bye
  if (/^(bye|goodbye|see you|later|take care|cya|ttyl|good night|goodnight)[\s!.?]*$/.test(msg)) {
    return `${time === 'Good night' ? 'Good night' : 'Take care'}, ${first}! 👋 It was a pleasure assisting you. Remember, I'm always here in the B-Link menu whenever you need me. Have a wonderful ${time === 'Good morning' ? 'day' : time === 'Good afternoon' ? 'afternoon' : 'evening'}! 🌟`;
  }

  // Positive / encouragement
  if (/motivat|inspire|encourage|positive|advice/.test(msg)) {
    const messages = [
      `Here's something worth remembering, ${first}: Every great creator started with zero followers. What separates successful creators from those who give up is consistency. Show up, create authentically, engage genuinely — and B-Link will reward you. Your community is waiting for what only you can share. 🌟`,
      `${first}, the African content landscape is still wide open. There's massive space for your voice, your story, and your creativity. B-Link was built specifically to amplify voices like yours. Keep creating, keep connecting, and keep being uniquely you. The right audience will find you. 💪`,
      `Remember this: your most important post hasn't been created yet. Every piece of content you share is an opportunity to touch someone's life, make someone laugh, or inspire someone to take action. Don't underestimate your own impact. Keep going, ${first}! 🔥`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  // Hashtag advice
  if (/hashtag|#|tag/.test(msg)) {
    return `#️⃣ **Hashtag Strategy on B-Link**\n\nHashtags help your content reach people who don't follow you yet — they're one of the most powerful tools for organic growth.\n\n**Best practices:**\n• Use 3–5 hashtags per post (not 30 — quality over quantity)\n• Mix popular hashtags (#Kenya, #Africa) with niche ones (#NairobiPhotography, #KenyanComedy)\n• Create your own branded hashtag if you post regularly (e.g. #BilgatesVibes)\n• Tap any hashtag to see its dedicated page and all posts using it\n\n**Trending hashtags on B-Link typically include:**\n#Kenya #Nairobi #Africa #GenZ #BLink #Afrobeats #KenyanTwitter #Hustle #NaijaTalent\n\nWould you like me to suggest specific hashtags for your type of content?`;
  }

  // Default — unknown question
  return `Thank you for your question, ${first}. While I do my best to help with everything related to B-Link, I may not have a specific answer for that just yet.\n\nFor questions I can't fully address, please reach out to the B-Link admin team at **${APP_INFO.support.email}** — they'll be happy to assist you personally.\n\nAlternatively, you can visit the **Help Center** (Menu → Help Center) for guides and FAQs.\n\nIs there something else about B-Link I can help you with? I'm great at explaining features, helping with content, and answering questions about the platform! 😊`;
};

// ── Suggestions ───────────────────────────────────────────────────────
const ALL_SUGGESTIONS = [
  'Tell me about B-Link',
  'How do I create a post?',
  'How do Vibes work?',
  'Explain the Home feed',
  'How do chats work?',
  'What is the Business Center?',
  'How do I get verified?',
  'Tell me about the Wallet',
  'How do I install B-Link?',
  'Write a bio for me',
  'Help me write a caption',
  'How do I grow my following?',
  'What hashtags should I use?',
  'Explain notifications',
  'How do Stories work?',
  'What is in the menu drawer?',
  'How do I edit my profile?',
  'Tell me about B-Link AI',
  'What are the post reactions?',
  'How do I report something?',
];

// ── Message bubble ────────────────────────────────────────────────────
const Bubble = ({ msg, onCopy }) => {
  const isAI = msg.role === 'assistant';
  const formatText = (text) =>
    text
      .split('\n')
      .map((line, i) => {
        const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        const bullet = bold.startsWith('• ') ? '&nbsp;&nbsp;' + bold : bold;
        return `<span key="${i}">${bullet}</span>`;
      })
      .join('<br/>');

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '14px', flexDirection: isAI ? 'row' : 'row-reverse' }}>
      {isAI && (
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#1E6FFF,#7B2FFF,#00D4C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(30,111,255,0.4)' }}>
          <Sparkles size={14} color="white" />
        </div>
      )}
      <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
        <div style={{
          padding: '11px 15px',
          borderRadius: isAI ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
          background: isAI ? '#0d1f3c' : 'linear-gradient(135deg,#1E6FFF,#7B2FFF)',
          border: isAI ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>
          <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'rgba(255,255,255,0.92)', margin: 0, whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: formatText(msg.content) }} />
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}>
            {new Date(msg.timestamp).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {isAI && (
          <button onClick={() => onCopy(msg.content)} style={{ marginTop: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <Copy size={11} /> Copy
          </button>
        )}
      </div>
    </div>
  );
};

// ── Typing dots ────────────────────────────────────────────────────────
const TypingDots = () => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '14px' }}>
    <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#1E6FFF,#7B2FFF,#00D4C8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Sparkles size={14} color="white" />
    </div>
    <div style={{ background: '#0d1f3c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        {[0,1,2].map((i) => (
          <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#1E6FFF', animation: 'bounce 1.2s infinite', animationDelay: i * 0.2 + 's' }} />
        ))}
      </div>
      <span style={{ color: '#6B7280', fontSize: '12px' }}>B-Link AI is thinking...</span>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────
export default function BLinkAI() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [suggestions, setSuggestions] = useState(ALL_SUGGESTIONS.slice(0, 6));
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const messagesEndRef = useRef();
  const inputRef       = useRef();

  // Session-only — clear on mount, no persistence
  useEffect(() => {
    const greeting = {
      id: 'greet',
      role: 'assistant',
      content: `${getTimeGreeting()}, ${profile?.display_name?.split(' ')[0] || 'there'}! 😊\n\nWelcome to **B-Link AI** — I'm Blinky, your personal assistant created by **Bilgate Mukhayo**, Founder and CEO of B-Link. We're truly pleased to have you here as part of our growing community.\n\nI know everything about B-Link — every feature, every section, every tip. Whether you're just getting started or looking to level up your experience, I'm here to guide you.\n\nWhat can I help you with today?`,
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);

    // Clear session on tab close
    const clear = () => setMessages([]);
    window.addEventListener('beforeunload', clear);
    return () => window.removeEventListener('beforeunload', clear);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

  const sendMessage = useCallback(async (text = null) => {
    const messageText = (text || input).trim();
    if (!messageText) return;

    const userMsg = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = '24px';
    setThinking(true);

    // Natural thinking delay based on response length
    const responseText = generateResponse(messageText, profile?.display_name);
    const delay = Math.min(600 + responseText.length * 3, 2800);

    await new Promise((r) => setTimeout(r, delay));

    setThinking(false);

    const aiMsg = {
      id: 'a-' + Date.now(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, aiMsg]);

    // Rotate suggestions
    setSuggestions((prev) => {
      const unused = ALL_SUGGESTIONS.filter((s) => !prev.slice(0, 6).includes(s));
      if (unused.length >= 6) return unused.slice(0, 6);
      return ALL_SUGGESTIONS.slice(0, 6);
    });
  }, [input, profile?.display_name]);

  const handleClear = () => {
    const greeting = {
      id: 'greet-' + Date.now(),
      role: 'assistant',
      content: `${getTimeGreeting()}, ${profile?.display_name?.split(' ')[0] || 'there'}! 😊 Chat cleared — fresh start. What can I help you with?`,
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
    setSuggestions(ALL_SUGGESTIONS.slice(0, 6));
    setShowAllSuggestions(false);
  };

  const displayedSuggestions = showAllSuggestions ? ALL_SUGGESTIONS : suggestions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0A1628', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ flexShrink: 0, background: '#0d1f3c', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => navigate(-1)} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
          <ArrowLeft size={22} />
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#1E6FFF,#7B2FFF,#00D4C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(30,111,255,0.45)' }}>
            <Sparkles size={18} color="white" />
          </div>
          <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '11px', height: '11px', borderRadius: '50%', background: '#2ECC71', border: '2px solid #0d1f3c' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>Blinky — B-Link AI</p>
          <p style={{ color: '#2ECC71', fontSize: '11px', margin: 0 }}>
            {thinking ? 'B-Link AI is thinking...' : '● Always online'}
          </p>
        </div>
        <button onClick={handleClear} title="Clear chat" style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', flexShrink: 0 }}>
          <RefreshCw size={18} />
        </button>
      </div>

      {/* ── MESSAGES ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', overscrollBehavior: 'contain' }}>
        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} onCopy={(t) => navigator.clipboard.writeText(t.replace(/\*\*(.*?)\*\*/g, '$1'))} />
        ))}
        {thinking && <TypingDots />}

        {/* Suggestions */}
        {!thinking && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ color: '#6B7280', fontSize: '11px', fontWeight: 700, textAlign: 'center', marginBottom: '10px' }}>
              💡 Suggested questions
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {displayedSuggestions.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '99px', padding: '7px 14px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {s}
                </button>
              ))}
              <button onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                style={{ background: 'rgba(30,111,255,0.1)', border: '1px solid rgba(30,111,255,0.3)', borderRadius: '99px', padding: '7px 14px', color: '#1E6FFF', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                {showAllSuggestions ? 'Show less' : 'See all ' + ALL_SUGGESTIONS.length + ' suggestions'}
                <ChevronRight size={13} style={{ transform: showAllSuggestions ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} style={{ height: '8px' }} />
      </div>

      {/* ── INPUT ── */}
      <div style={{ flexShrink: 0, background: '#0d1f3c', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', paddingBottom: 'max(14px,env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '22px', padding: '10px 14px', display: 'flex', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask me anything about B-Link..."
              rows={1}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '14px', lineHeight: '1.5', resize: 'none', minHeight: '22px', maxHeight: '110px', overflowY: 'auto', fontFamily: 'inherit', display: 'block', padding: 0 }}
            />
          </div>
          <button onClick={() => sendMessage()} disabled={thinking || !input.trim()}
            style={{ width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0, background: (thinking || !input.trim()) ? 'rgba(30,111,255,0.4)' : 'linear-gradient(135deg,#1E6FFF,#7B2FFF,#00D4C8)', border: 'none', cursor: (thinking || !input.trim()) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(30,111,255,0.4)' }}>
            {thinking
              ? <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <Send size={17} style={{ color: 'white', marginLeft: '2px' }} />
            }
          </button>
        </div>
        <p style={{ textAlign: 'center', color: '#6B7280', fontSize: '10px', marginTop: '8px', marginBottom: 0 }}>
          B-Link AI · Created by Bilgate Mukhayo
        </p>
      </div>
    </div>
  );
}