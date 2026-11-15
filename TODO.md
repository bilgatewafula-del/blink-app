# B-FLASH TODO

## Add the authenticated B-FLASH video destination

- The app must expose B-FLASH as a protected route at `/flash`.
- B-FLASH must reuse the existing B-Link authenticated Supabase session.
- The bottom navigation must replace the existing Activity destination with B-FLASH.
- Notifications must remain available from the existing top-right bell and `/notifications` route.

## Render the first B-FLASH video experience

- B-FLASH must query existing public, non-draft, non-deleted posts that have a video URL.
- Each video must render with Cloudinary-aware delivery and metadata poster support where available.
- The layout must provide a discovery header, creator metadata, caption, progress treatment, play/pause, mute/unmute, and a deliberate action rail.
- Video playback must pause when the document is hidden and must avoid autoplay when data saver is enabled.
- Empty, loading, and query-error states must be understandable and provide a route to create a post.

## Reuse existing interactions and boundaries

- Likes must use the existing authenticated post RPC and give immediate count feedback.
- Saves must use the existing shared save helper.
- Shares must record through the existing share helper and use the platform share API when available.
- Comments must open the existing post detail experience rather than creating a duplicate comment system.
- The existing `/create` flow must remain the upload entry point.

## Delivery evidence

- The project must pass the existing production build command.
- The working tree must contain only the intended B-FLASH files and route updates before commit.
- No database migration is part of this slice; schema-dependent features remain open until the current Supabase schema is audited.
