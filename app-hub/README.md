# B-Link App Hub

Owner-only Android APK distribution portal. Visitors can browse published apps, download APKs, share links to WhatsApp/Telegram, and open QR codes. Only the authorized owner account can sign in and upload/publish applications.

## Stack
- React + Vite
- Supabase Auth, Postgres and Storage
- Public APK downloads; uploads and management restricted by database/storage RLS to the configured owner UUID.

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `npm install` then `npm run dev`.

## Deploy on Vercel
Create a Vite project connected to the repository with Root Directory `app-hub`. Add the two environment variables above for Production, Preview and Development. Build command `npm run build`; output directory `dist`.

## Owner account
The app is locked to the owner UUID configured in `src/App.jsx` and in the SQL migration. The owner must sign in using the corresponding existing Supabase Auth account. Do not change the UUID in only one place. Never put a Supabase service-role key in this frontend.

## APK sharing
Share links point to the public app detail page. To share the actual `.apk` file as an attachment, download it to the phone first, then attach it from Files in WhatsApp or Telegram. Android may require users to permit installation from the app/browser used to open the APK.

## Security notes
- The APK bucket is public-read so direct downloads work without a login.
- Only the owner UUID can insert, update or delete APK objects and app records.
- APK files are limited to 300 MB and the browser computes SHA-256 at upload time.
- This starter does not claim malware scanning or Android signature verification. Verify release signatures and scan APKs before publishing.
