# Study Timer

A mobile-first study timer built with React, TypeScript, Cloudflare Pages
Functions, and Cloudflare D1.

## Features

- Google sign-in with server-side, cookie-based sessions
- Studying/resting state with server-authoritative live timing
- Three-hour maximum credited time per continuous study session
- Daily totals using a 06:00 to 05:59 `Europe/Istanbul` study day
- Monthly calendar history with session counts
- Brief notes attached to individual study days
- Today and current-month leaderboards with live-session totals
- Press-and-hold leaderboard profiles to view monthly daily hours without notes
- Sessions that continue across page closures and devices
- Idempotent state transitions and one-open-session database enforcement

## Local setup

Requirements: Node.js 20 or newer and a Cloudflare account for D1.

```bash
npm install
npm run dev
```

`npm run dev` builds the frontend, applies migrations to Wrangler's persistent
local D1 database, and serves the complete Pages application at
`http://localhost:5173`.

The configured Workers compatibility date intentionally matches the newest date
supported by the checked-in Wrangler version. It does not need to match the
current calendar date.

For frontend-only styling with Vite hot reload, use `npm run dev:ui`. API calls
will not work in that mode.

## Google sign-in setup

1. In Google Cloud Console, create an OAuth 2.0 Client ID of type **Web
   application**.
2. Add every origin that serves the app under **Authorized JavaScript
   origins**, for example `https://study.example.com`, the `*.pages.dev`
   domain, and `http://localhost` plus `http://localhost:5173` for local
   development. No redirect URI is needed.
3. Put the client ID in `GOOGLE_CLIENT_ID` under `[vars]` in `wrangler.toml`.
   It is public and safe to commit. To override it locally, put
   `GOOGLE_CLIENT_ID=...` in `.dev.vars`.
4. Apply migration `0005_google_auth.sql` before deploying.

The browser receives a Google ID token, `POST /api/auth/google` verifies it and
sets an `HttpOnly` session cookie that lasts 90 days. Every other `/api/*`
route requires that cookie (`functions/api/_middleware.ts`) and acts on the
signed-in user; clients never send their own user ID.

On first sign-in a person either creates a new profile or links an existing
name-only profile by typing that name. A name can be linked only once. To link
a profile for someone in advance, set its email:

```bash
npx wrangler d1 execute study --remote --command "UPDATE users SET email = 'person@gmail.com' WHERE name_key = 'their name'"
```

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Cloudflare Pages deployment

1. Create a production D1 database and configure it in `wrangler.toml`.
2. Apply migrations to the production database before deploying.
3. In Cloudflare Pages, use `npm run build` as the build command and `dist` as
   the output directory.
4. Bind the production D1 database as `DB`.
5. Disable preview branch deployments so previews cannot write to production.

Apply the production migration:

```bash
npm run db:migrate:production
```

Pushes to the production branch are deployed automatically by the Cloudflare
Pages Git integration.

The leaderboard is available at
`GET /api/leaderboard?period=today|month`. Apply new migrations
before merging a branch that introduces a schema or index change.

Monthly hours are available at `GET /api/activity?userId=<uuid>&month=YYYY-MM`.
This endpoint only reads study sessions and time adjustments; it does not return
daily notes. Hold another person's leaderboard row to open their hours calendar,
or focus the row and press Enter or Space. Both calendars support month navigation
back to June 2026, the app's launch month.
