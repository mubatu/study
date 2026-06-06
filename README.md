# Study Timer

A mobile-first study timer built with React, TypeScript, Cloudflare Pages
Functions, and Cloudflare D1.

## Features

- Name-only shared profiles, remembered on the current device
- Studying/resting state with server-authoritative live timing
- Daily totals using a 07:00 to 06:59 `Europe/Istanbul` study day
- Monthly calendar history with session counts
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

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Cloudflare Pages deployment

1. Create production and preview D1 databases.
2. Replace the all-zero placeholder IDs in `wrangler.toml` with their IDs.
3. Apply migrations to each database before deploying.
4. In Cloudflare Pages, use `npm run build` as the build command and `dist` as
   the output directory.
5. Bind each environment's D1 database as `DB`.

Production migration and deployment:

```bash
npm run db:migrate:production
npm run deploy
```

Apply the same migrations to the separately configured preview database with:

```bash
npm run db:migrate:preview
```

The profile name is intentionally not authentication. Anyone entering the same
normalized name receives access to that profile and its study history.
