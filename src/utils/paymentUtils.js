// src/utils/paymentUtils.js
// Central payment config and helpers — single source of truth

export const MPESA = {
  till:    '4766037',
  name:    'BILGATE WAFULA MUKHAYO',
  paybill: null, // till number, not paybill
};

export const PLANS = {
  free: {
    key:   'free',
    label: 'Free',
    price: 0,
    color: '#6B7280',
    badge: null,
    features: [
      '10 posts per day',
      '15s story duration',
      'Basic profile',
      'Standard feed ranking',
    ],
  },
  pro: {
    key:   'pro',
    label: 'Pro',
    price: 299,
    color: '#1E6FFF',
    badge: '⭐',
    features: [
      '20 posts per day',
      '30s story duration',
      'Post analytics',
      'See who viewed profile',
      'Priority in Discover',
      'Boost eligibility',
    ],
  },
  creator: {
    key:   'creator',
    label: 'Creator',
    price: 599,
    color: '#FF6B35',
    badge: '🔥',
    features: [
      '50 posts per day',
      '60s story duration',
      'Advanced analytics dashboard',
      'Verified creator badge ✓',
      'Boost eligibility',
      'Priority in Discover',
      'Profile insights',
    ],
  },
  business: {
    key:   'business',
    label: 'Business',
    price: 1499,
    color: '#FFD700',
    badge: '💎',
    features: [
      '100 posts per day',
      '60s story duration',
      'Verified business badge ✓',
      'WhatsApp/Call contact buttons',
      'Business analytics dashboard',
      'Ad creation access',
      'Featured listings',
      'Boost eligibility',
    ],
  },
};

export const BOOST_PACKAGES = [
  { days: 1,  label: '24 Hours',  price: 200,  savings: null       },
  { days: 3,  label: '3 Days',    price: 500,  savings: 'Popular'  },
  { days: 7,  label: '7 Days',    price: 999,  savings: 'Best value'},
  { days: 30, label: '30 Days',   price: 2999, savings: null       },
];

export const COIN_PACKAGES = [
  { coins: 100,  price: 50,  label: '100 Coins',  bonus: null       },
  { coins: 250,  price: 100, label: '250 Coins',  bonus: null       },
  { coins: 600,  price: 200, label: '600 Coins',  bonus: '+50 bonus'},
  { coins: 1500, price: 500, label: '1,500 Coins',bonus: '+200 bonus'},
];

export const COIN_COSTS = {
  reaction:  2,
  gift_fire: 10,
  gift_crown:50,
  gift_star: 20,
  gift_rose: 30,
  boost_1h:  20,
  highlight: 5,
};

// Generate unique reference code: BLK-XXXXXXX
export function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BLK-';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Format KES
export function formatKES(amount) {
  return 'KES ' + Number(amount).toLocaleString('en-KE');
}

// Check if user subscription is active
export function isSubscriptionActive(profile) {
  if (!profile) return false;
  if (profile.subscription_plan === 'free') return true;
  if (!profile.subscription_expires_at) return false;
  return new Date(profile.subscription_expires_at) > new Date();
}

// Get active plan (falls back to free if expired)
export function getActivePlan(profile) {
  if (!profile) return 'free';
  if (!isSubscriptionActive(profile)) return 'free';
  return profile.subscription_plan || 'free';
}