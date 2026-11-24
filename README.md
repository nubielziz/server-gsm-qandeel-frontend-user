# IMEI-HUB — public website

One site for **customers** (shop, IMEI check, checkout, order tracking, support) and **merchants** (portal: prices,
orders from the wallet, top-ups and invoices, API keys, security), in English only (decision 039).
Next.js 16.4 (App Router, Cache Components), React 19, Tailwind CSS 4. The API is the GSM backend in `../backend`.

- Plan and backend facts: `../STOREFRONT-HANDOFF.md`
- Rules for contributors and AI agents: `CLAUDE.md` (+ `AGENTS.md`)
- Status, decisions, test accounts: `PROGRESS.md`
- Images to add (prompts and file names): `docs/IMAGE-PROMPTS.md`

## Run it
```bash
npm install
cp .env.example .env.development.local   # then set GSM_API_ORIGIN
scripts/dev-backend.sh bucket && scripts/dev-backend.sh reset   # once: isolated demo backend data
scripts/dev-backend.sh start              # isolated demo API on :3100 (optional; :3000 is the owner's API)
npm run dev                               # http://localhost:5175 → redirects to /en
```
`/client/*` and `/store/v1/*` are proxied to `GSM_API_ORIGIN`, so the site and the API share one origin (cookies,
CSRF). Mail sent by the isolated backend is caught by Mailpit at http://localhost:8025.

## Checks
| Command | What |
|---|---|
| `npm run typecheck` | Route types + TypeScript |
| `npm run lint` | ESLint (Next rules) + `scripts/check-english-only.mjs` (no Arabic script, `ar` locale or right-to-left layout code outside the allowlist of `scripts/english-only.config.json`) |
| `npm run test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) against the dev server and the isolated backend |
| `npm run build && npm start` | Production build, served on :5176 |
| `node scripts/measure-vitals.mjs --base http://localhost:5176 [--mobile] /en /en/services` | Lab Web Vitals |
| `npm run gen:api` / `gen:api:check` | Regenerate / check API types from `../backend/docs/contract/openapi.json` |
