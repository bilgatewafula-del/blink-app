// src/lib/nav.js
// One rule for every "Back" button in the app:
//   - if there is a page before this one inside the app, go back to it (so Back always returns
//     to where you really came from);
//   - if there isn't (you opened a link, refreshed, or came from the Android app shortcut),
//     go to a sensible parent page instead of leaving the app or doing nothing.
export const canGoBack = () => {
  const idx = typeof window !== 'undefined' && window.history.state ? window.history.state.idx : null;
  return typeof idx === 'number' && idx > 0;
};

export function goBack(navigate, fallback = '/') {
  if (canGoBack()) navigate(-1);
  else navigate(fallback, { replace: true });
}
