// src/utils/paymentUtils.js
// Single source of truth for all B-Link monetisation config

export const MPESA = {
  till:     '4766037',
  name:     'BILGATE WAFULA MUKHAYO',
  type:     'till',        // till number, not paybill
};

// Subscription plans
export const PLANS = {
  free: {
    key: 'free', label: 'Free', price: 0, color: '#8E8C88', badge: null,
    features: [
      '10 posts per day',
      '15s story duration',
      'Standard feed ranking',
      'Basic profile',
    ],
  },
  pro: {
    key: 'pro', label: 'Pro', price: 299, color: '#F97316', badge: null,
    features: [
      '20 posts per day',
      '30s story duration',
      'Priority in Discover feed',
      'Post analytics & insights',
      'See who viewed your profile',
      'Boost eligibility',
    ],
  },
  creator: {
    key: 'creator', label: 'Creator', price: 599, color: '#F97316', badge: null,
    features: [
      '50 posts per day',
      '60s story duration',
      'Verified creator badge ✓',
      'Advanced analytics dashboard',
      'Priority in Discover feed',
      'Boost eligibility',
      'Profile insights',
    ],
  },
  business: {
    key: 'business', label: 'Business', price: 1499, color: '#FFD700', badge: null,
    features: [
      '100 posts per day',
      '60s story duration',
      'Verified business badge ✓',
      'WhatsApp & Call contact buttons',
      'Business analytics dashboard',
      'Ad creation access',
      'Featured business listing',
      'Boost eligibility',
    ],
  },
};

// Boost packages
export const BOOST_PACKAGES = [
  { days: 1,  label: '24 Hours', price: 200,  tag: null          },
  { days: 3,  label: '3 Days',   price: 500,  tag: 'Popular'  },
  { days: 7,  label: '7 Days',   price: 999,  tag: 'Best value'},
  { days: 30, label: '30 Days',  price: 2999, tag: null          },
];

// Coin packages
export const COIN_PACKAGES = [
  { coins: 100,  price: 50,  label: '100 Coins',   bonus: 0   },
  { coins: 250,  price: 100, label: '250 Coins',   bonus: 0   },
  { coins: 600,  price: 200, label: '600 Coins',   bonus: 50  },
  { coins: 1500, price: 500, label: '1,500 Coins', bonus: 200 },
];

// Verification pricing
export const VERIFICATION_PRICE = 500; // KES

// Business page
export const BUSINESS_PAGE_PRICE = 2000; // KES/month

// Microtransactions
export const MICRO = {
  instant_boost_1h: { price: 50,  label: 'Instant 1h Boost',       coin_cost: 20 },
  highlight_post:   { price: 20,  label: 'Highlight Post 24h',      coin_cost: 5  },
  message_stranger: { price: 10,  label: 'Message non-follower',     coin_cost: 3  },
  priority_inbox:   { price: 50,  label: 'Priority inbox (monthly)', coin_cost: 15 },
  profile_theme:    { price: 30,  label: 'Premium profile theme',    coin_cost: 50 },
};

// Coin spend costs
export const COIN_COSTS = {
  reaction:      2,
  gift_fire:     10,
  gift_crown:    50,
  gift_star:     20,
  gift_rose:     30,
  boost_1h:      20,
  highlight:     5,
};

// Generate unique 8-char reference code
// User puts this in M-Pesa "reason" field so admin can find it
export function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BLK';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code; // e.g. BLKABCD123
}

// Format KES
export function formatKES(amount) {
  if (!amount && amount !== 0) return 'KES 0';
  return 'KES ' + Number(amount).toLocaleString('en-KE');
}

// Format ordinary numbers (coins, balances, counts)
export function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-KE');
}

// Check if subscription active and not expired
export function isSubscriptionActive(profile) {
  if (!profile) return false;
  if (!profile.subscription_plan || profile.subscription_plan === 'free') return false;
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) > new Date();
}

// Get effective plan (falls back to free if expired)
export function getActivePlan(profile) {
  if (!profile) return 'free';
  if (!isSubscriptionActive(profile)) return 'free';
  return profile.subscription_plan || 'free';
}

// Check if user can boost (needs paid plan)
export function canBoost(profile) {
  return ['pro','creator','business'].includes(getActivePlan(profile));
}