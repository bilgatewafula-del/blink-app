# B-FLASH implementation plan

## Scope

The first implementation slice adds B-FLASH inside the existing B-Link React application. It replaces the current Activity bottom-navigation destination with a dedicated authenticated video experience while preserving the existing Notifications page at `/notifications` and the existing B-Link authentication/session.

## Implementation approach

- Add a lazy-loaded `/flash` route and a `BFlash` page.
- Query the existing `posts` table for public, non-deleted, non-draft posts with `video_url`.
- Reuse existing profile joins, Cloudinary-aware `videoSrc`, Supabase RPCs, post detail/comments, save helpers, share recording, and `/create` upload flow.
- Keep Home unchanged so its content boundary remains separate from B-FLASH.
- Use Lucide icons, dark charcoal styling, electric orange accents, safe-area-aware spacing, muted inline autoplay, pause-on-background, and reduced-motion-friendly transitions.
- Do not add new database tables or duplicate authentication in this slice; schema additions for moderation, trails, and creator analytics will follow after the current production schema is audited.

## Project structure

- `src/pages/flash/BFlash.js`: discovery header, video feed, playback, actions, empty/error states.
- `src/App.js`: lazy route and navigation visibility for `/flash`.
- `src/components/BottomNav.js`: B-FLASH tab replacing Activity.
- `public/manus-routes.json`: route manifest for the current page set.

## Design direction

Three candidate directions: Electric editorial video rail (0.06); neon arcade social feed (0.04); quiet premium cinema (0.08). Choose **Electric editorial video rail**.

- **Design movement:** premium dark editorial UI with a focused, vertically immersive video rail.
- **Core principles:** content-first, deliberate controls, high contrast, and restrained motion.
- **Color philosophy:** charcoal keeps attention on video; electric orange marks active intent and the B-Link family connection.
- **Layout paradigm:** a vertical sequence of full-height viewing panels with discovery controls above and a floating action rail.
- **Signature elements:** lightning-bolt B-FLASH wordmark treatment, orange progress line, and translucent action capsules.
- **Interaction philosophy:** tap the video to play/pause; actions stay reachable without covering the focal content.
- **Animation:** use short scale/fade feedback; never animate continuously when reduced motion is requested.
- **Typography:** existing system sans-serif, bold compact labels, readable captions with a two-line clamp.
- **Brand essence:** B-FLASH is B-Link's dedicated place to discover and experience video; focused, energetic, connected.
- **Brand voice:** direct and confident. Example: “More than watching.” and “Find your next flash.”
- **Wordmark & logo:** retain the existing B mark and pair it with a compact `B-FLASH` label rather than introducing a second logo asset.
- **Signature brand color:** `#FF5A1F` electric orange.

## Later phases

After this slice is validated, audit and implement database-backed comments/reactions, creator upload states, moderation and reporting, trails/library, settings, analytics, and recommendation ranking as separate reviewed phases.
