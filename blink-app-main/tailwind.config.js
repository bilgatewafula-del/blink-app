module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class', // needed for SettingsPage's Theme toggle to ever do anything —
                      // it currently writes settings.theme to the DB but nothing
                      // applies it. Add `document.documentElement.classList.toggle('dark', ...)`
                      // wherever theme is loaded (AuthContext or App.js) to wire it up.
  theme: {
    extend: {
      colors: {
        // Original palette — unchanged, every existing className keeps working
        primary: '#FF5A1F',
        secondary: '#FFB020',
        accent: '#FF2D78',
        amber:     '#FF9F1C',
        blinkorange: '#FF6B35',
        gold: '#FFD700',
        success: '#2ECC71',
        ink:       '#0D0C0B',
        darktext: '#1A1917',
        midgray: '#8E8C88',

        // Extended — most components hardcode these exact hex values
        // inline (bg-[#0D0C0B], text-[#8E8C88], etc.) instead of using
        // token names, which is why the app looks slightly inconsistent
        // component-to-component. These give you named alternatives to
        // migrate toward — not required to use immediately, but every
        // future file I touch will prefer these over raw hex so the
        // palette stays centralized in one place.
        surface: {
          DEFAULT: '#0D0C0B',   // page background (page background)
          raised:  '#171614',   // modals, drawer, sheets
          card:    '#1d1c1a',   // dropdown menus, popovers
        },
        border: {
          subtle: 'rgba(255,255,255,0.07)',
          DEFAULT: 'rgba(255,255,255,0.10)',
        },
        danger: {
          DEFAULT: '#EF4444',
          hover: '#DC2626',
        },
        warning: '#F59E0B',
      },
      fontFamily: {
        // If B-Link doesn't already load a custom font, the system
        // stack below is a meaningfully more polished default than
        // relying on each browser's arbitrary sans-serif — this is
        // one of the cheapest "stop looking templated" wins available.
        sans: [
          'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      keyframes: {
        // Centralizing animations here instead of inline <style> tags
        // per-component (Drawer.jsx injects a fresh <style> block with
        // this exact keyframe on every open — see Drawer notes) means
        // one definition, reused everywhere, no runtime DOM injection.
        slideInLeft:  { from: { transform: 'translateX(-100%)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        slideOutLeft: { from: { transform: 'translateX(0)', opacity: 1 }, to: { transform: 'translateX(-100%)', opacity: 0 } },
        fadeIn:       { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeOut:      { from: { opacity: 1 }, to: { opacity: 0 } },
        heartBurst:   {
          '0%':   { transform: 'scale(0)',   opacity: 0 },
          '30%':  { transform: 'scale(1.3)', opacity: 1 },
          '60%':  { transform: 'scale(1)',   opacity: 1 },
          '100%': { transform: 'scale(1)',   opacity: 0 },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        slideInLeft:  'slideInLeft 0.22s ease',
        slideOutLeft: 'slideOutLeft 0.18s ease',
        fadeIn:       'fadeIn 0.2s ease-out',
        fadeOut:      'fadeOut 0.15s ease-in',
        heartBurst:   'heartBurst 0.7s ease-out forwards',
        shimmer:      'shimmer 1.6s infinite linear',
      },
    },
  },
  plugins: [],
};