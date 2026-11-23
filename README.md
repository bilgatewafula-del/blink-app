# B-Link

Social platform for African Gen Z: posts, chats, stories, B-Flash short videos, monetisation and an admin panel.

## Layout of this repository

| Path | What it is |
| --- | --- |
| `src/`, `public/`, `package.json` | **The main B-Link web app** (React, Create React App, Tailwind, Supabase). Deployed to Vercel from the repository root. |
| `app-hub/` | The separate **B-Link App Hub** (APK download portal, Vite). Deploy it as its own Vercel project with *Root Directory* = `app-hub`. It has its own `package.json`. |
| `*.sql` | Database migrations. Run them in the Supabase SQL Editor, in the order they were delivered (they are safe to re-run). |

> Keep `package.json` at the repository root for the main app. Do not copy the App Hub's `package.json`, `index.html`, `vite.config.js` or `main.jsx` into the root: that breaks the main app's build.

## Develop

```bash
npm install
npm start          # http://localhost:3000
npm run build      # production build
```

Environment variables (Vercel and `.env`): `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_CLOUDINARY_CLOUD_NAME`.
Never put a Supabase service-role key in the app.

## Design

White-dominant light theme: white `#FFFFFF`, soft grey `#F8FAFC`, inputs `#F1F5F9`, borders `#E2E8F0`, charcoal text `#202938`, slate `#64748B`, brand orange `#F97316`, supporting blue `#2563EB`. The B-Flash video player keeps a dark stage so video stays readable.
