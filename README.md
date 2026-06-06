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

The profile name is intentionally not authentication. Anyone entering the same
normalized name receives access to that profile and its study history.
