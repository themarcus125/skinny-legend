# Operation Skinny Legend

Photo-based points tracker for the group challenge. See `docs/superpowers/specs/2026-09-11-skinny-legend-design.md`.

## Layout
- `packages/shared` — Drizzle schema, scoring engine, date helpers
- `apps/api` — Hono REST API (Railway)
- `apps/admin` — Next.js admin (Vercel)
- `ios/` — SwiftUI app

## Local dev
```bash
proto install pnpm 10.30.3
pnpm install
cp .env.example apps/api/.env
pnpm db:up && pnpm db:migrate && pnpm --filter @skinny/api db:seed
pnpm dev:api
```
`dotenv` and `drizzle-kit` resolve `.env` relative to the package's own working directory, so `pnpm --filter @skinny/api ...` commands read `apps/api/.env` — a root `.env` is not needed.

## Tests
```bash
pnpm test
```
API tests need the local Postgres running and use `AUTH_MODE=test` (header `x-test-uid`) with in-memory storage.
