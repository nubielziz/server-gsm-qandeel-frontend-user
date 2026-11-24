# Deploying the storefront

The site ships as one Docker image: a Next.js standalone server on port 3000 (`output: 'standalone'`, switched on by the
`Dockerfile` through `NEXT_OUTPUT=standalone`). It is the service `site` of `backend/deploy/compose.prod.yaml`, started
with `--profile site`, and its tag goes in `SITE_IMAGE` of `backend/deploy/.env`. Plan: `IMPLEMENTATION-PLAN.md` F02, D19.

## 1. How the pieces meet

```
browser ──► Caddy (SHOP_HOST) ──┬── /client/*  /store/v1/*  ──► api:3000   (the API; cookies, CSRF, files)
                                └── everything else          ──► site:3000  (this image)
site:3000 ── server-side reads (Server Components) ──► GSM_API_ORIGIN = http://api:3000
```

- Caddy sends `/client/*` and `/store/v1/*` to the API before a request reaches the site, so the browser talks to the API on
  the site's own origin: one set of cookies, no CORS. **The site therefore serves no page at those two paths.**
  `lib/app-routes.test.ts` fails when a folder of `app/` would define one.
- The same two prefixes are also rewritten to the API inside the site (`next.config.ts`). Browsers behind Caddy never reach
  that rewrite, but the image optimizer does: `/_next/image?url=/store/v1/media/…` fetches the picture through the site's
  own router. The rewrite must therefore point at an address the container reaches (`http://api:3000`). It also serves the
  local check in section 6 and development.
- Server-side calls (`lib/api/server.ts`) forward the visitor's `Cookie` and the incoming `X-Forwarded-For` (Caddy sets it from
  the real visitor address and drops a client-sent value). The API trusts exactly the compose subnet
  (`TRUST_PROXY=172.30.0.0/24`), so it takes the visitor's address from that header and not from the site container.
- `lib/api/server.ts` sends no `Origin`, so every mutation (sign-in, orders, uploads) runs in the browser.

## 2. Variables

| Variable | Read | Meaning |
|---|---|---|
| `GSM_API_ORIGIN` | at build **and** at run time | At build: the API the build can reach (cached public reads run while pages are prerendered, and a failed read fails the build). At run time: `http://api:3000` for server reads; the image sets it, compose repeats it. |
| `GSM_API_REWRITE_ORIGIN` | at build | Destination of the `/client/*` and `/store/v1/*` rewrites. Fixed into the build, so it is the in-network address `http://api:3000` (the `Dockerfile` default). Used at run time by the image optimizer for service pictures (`/store/v1/media/*`) and when the container runs without Caddy. |
| `NEXT_PUBLIC_SITE_URL` | at build | The public origin, `https://<SHOP_HOST>`. Used for canonical URLs, social cards, `robots.txt` and the sitemap. Required. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | at build | Cloudflare Turnstile site key of the widget for `<SHOP_HOST>`. Required (production has no test key). |
| `NEXT_PUBLIC_TIME_ZONE` | at build | IANA time zone for dates on the site. Default `UTC`, the API's own zone. |
| `NEXT_PUBLIC_API_PUBLIC_URL` | at build | Optional: `https://<API_HOST>`, the machine API host shown as "Base URL" on the API keys page (merchant rank). Empty hides that line. |
| `NEXT_PUBLIC_MERCHANT_WHATSAPP` | at build | The team's WhatsApp number for merchant applications. `/en/become-a-merchant` sends the visitor to it. Default in the `Dockerfile`: `+20 12 10230575` (the team's number, 2026-11-16); pass the build arg only to change it. International format: `+`, the country code, then the number **without** the national leading 0 (never `+44 (0)20 …`); spaces are allowed and kept on the page. Empty or malformed: the page shows no WhatsApp button and points to the support page. |
| `PORT`, `HOSTNAME` | at run time | The image sets `3000` and `0.0.0.0`. |

- `NEXT_PUBLIC_*` values are written into the JavaScript at build time. Changing one needs a new image.
- `NEXT_OUTPUT`, `NEXT_COMPRESS` and `NEXT_TELEMETRY_DISABLED` are set inside the `Dockerfile`; do not pass them
  (`NEXT_COMPRESS=0`: see section 7).
- `.env*` files never enter the image (`.dockerignore`). Every build value is a `--build-arg`.
- The `Dockerfile` stops at once when `GSM_API_ORIGIN`, `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is empty.

## 3. Build

Deploy and migrate the API first: the build reads the public catalog from it.

```bash
docker build -t gsm-site:<tag> \
  --build-arg GSM_API_ORIGIN=https://<SHOP_HOST> \
  --build-arg GSM_API_REWRITE_ORIGIN=http://api:3000 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://<SHOP_HOST> \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile site key> \
  --build-arg NEXT_PUBLIC_TIME_ZONE=<IANA zone, e.g. Asia/Amman> \
  --build-arg NEXT_PUBLIC_API_PUBLIC_URL=https://<API_HOST> \
  storefront/
```

- `GSM_API_ORIGIN=https://<SHOP_HOST>` reaches the API through Caddy: the build only sends public `GET` requests, and Caddy
  routes `/store/v1/*` to the API even while the `site` container is not running. The compose network is not reachable from
  `docker build`, which is why the build address and the rewrite address differ.
- The build needs internet access for the one Google font (Inter, downloaded by `next/font`).
- The API limits public routes per client address (300 requests a minute by default). The build makes few, cached reads;
  if it ends with a `429`, wait a minute and build again.
- Build and runtime use one base image (`NODE_IMAGE`, default `node:26-slim`), because the native `sharp` module that
  optimizes images is traced for the platform of the build. Build on the server's CPU architecture, or pass `--platform`.
  Override the base with `--build-arg NODE_IMAGE=<image>` if the tag moves.

### The release of the one account model (decision 002)

This release goes out together with the backend release of backend decision 064; the backend migrates the accounts and the old
customer routes then answer 410, so a shop of the earlier model cannot run against it, nor this one against the earlier backend.
The order matters, in three steps:

1. **The backend first, with its contract file.** Merge the backend to its `main` with `docs/contract/openapi.json` regenerated and
   committed in the same change. A stale file lacks routes the code serves (among them the retail two-step routes
   `/store/v1/me/2fa/*`), and the shop's types are made from that file.
2. **Then push the shop.** The required check `api-types` (`.github/workflows/ci.yml`) generates the types from the backend branch named
   in `ci/backend-ref` (`main` outside a pull request that needs a stage branch) and fails when `lib/api/schema.gen.ts` differs. Pushed
   before step 1, the check fails; do not make it green by regenerating the shop's types against the stale file, because the routes the
   file lacks vanish from the types. Regenerate from the merged backend (`npm run gen:api`; `npm run gen:api:check` must pass).
3. **Build and start.** Build the shop image while the earlier shop and API still run: its build reads the public configuration and the
   catalog from the live API through the shop host, and this release changes none of those reads. Start the new image only after the
   backend migration, inside the same maintenance, and keep the previous tag for the way back.

Old addresses (`/merchant/…`, the old ticket list, mailed links from before the release) keep working: `next.config.ts` redirects them,
with and without `/en`.

## 4. Run with the backend stack

From the backend repository root:

```bash
# deploy/.env:  SITE_IMAGE=gsm-site:<tag>
docker compose -f deploy/compose.prod.yaml --env-file deploy/.env --profile site up -d site
docker compose -f deploy/compose.prod.yaml --env-file deploy/.env --profile site ps site    # (healthy) within about 30 s
```

- The image runs as the unprivileged user `node`. Compose adds `init: true` and `GSM_API_ORIGIN: http://api:3000`.
- The image's own `HEALTHCHECK` calls `GET /robots.txt` every 15 s (20 s start period, 3 retries).
- Caddy waits for the API only, not for the site: the shop host answers `502` for pages until `site` is up.
- To roll back, set `SITE_IMAGE` to the previous tag and run the same `up -d site`. Keep the last working tag.

## 5. Backend values the site depends on

In `backend/.env.production` (`.env.production.example` has the template):

| Variable | Value | Why |
|---|---|---|
| `STORE_BASE_URL` | `https://<SHOP_HOST>` | every link in mail, for every account: the pages at the shop root (`/sign-in?token=`, `/set-password?token=`, `/verify-email?token=`, `/unsubscribe?token=`) and the account pages (`/account/support/<id>`, `/account/settings/notifications`, …) |
| `PORTAL_BASE_URL` | `https://<SHOP_HOST>/account` | the account area. Its one use: where a gateway sends a merchant rank back after an online card payment (`<PORTAL_BASE_URL>/wallet`, the wallet page). No mailed link uses it. Nothing is served under `/merchant` any more: a value that ends in `/merchant` reaches the wallet only through the redirect table (`lib/account/legacy-paths.ts`), so set it to the account address |
| `CORS_ORIGINS` | includes `https://<SHOP_HOST>` | the Origin check of public `POST` routes (sign-in, forgot password) |
| `TURNSTILE_HOSTNAMES` | `<SHOP_HOST>` | host names a Turnstile token may be issued for |
| `TURNSTILE_SECRET_KEY` | secret of the widget whose site key is `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | token check |
| `TRUST_PROXY` | `172.30.0.0/24` | the API trusts `X-Forwarded-For` from Caddy and from the site |

**What the backend must send.** The account area lives at `/account` and nowhere else. Every shop address the backend builds or stores
(a mail, a notification or inbox link, a campaign link, the preferences link of a mail, the return address of a card payment) must name
an `/account/…` page, or a page at the shop root. An address under `/merchant` is only a stored link from before the release: the shop
redirects it with a permanent redirect, so it works, but the backend must not write a new one. The redirect table is a safety net for
old links, not a place to send people.

## 6. Checks

After a build, the rewrite destinations are the two lines for `/client/:path*` and `/store/v1/:path*`. The manifest is
pretty-printed, so the pattern allows a space after the colon. It lists only absolute destinations (`http://` or
`https://`), which leaves out the site's own internal rewrites:

```bash
grep -o '"destination": *"https\?://[^"]*"' .next/routes-manifest.json                               # in the build
docker run --rm gsm-site:<tag> grep -o '"destination": *"https\?://[^"]*"' .next/routes-manifest.json # in the image
```

On a running deployment:

```bash
docker inspect --format '{{.State.Health.Status}}' <site container>   # healthy
curl -fsS https://<SHOP_HOST>/robots.txt
curl -fsSI https://<SHOP_HOST>/en                                      # 200
curl -fsSI -H 'accept-encoding: zstd' https://<SHOP_HOST>/en | grep -i '^content-encoding'   # zstd, from Caddy (section 7)
curl -fsS https://<SHOP_HOST>/store/v1/config                          # JSON from the API, not a page
docker run --rm gsm-site:<tag> ls -a                                   # no .env file in the image
```

Local check of the image against the isolated demo API (development only; stop `next start` first, the API runs from
`scripts/dev-backend.sh start`):

```bash
docker build -t gsm-site:local --network host \
  --build-arg GSM_API_ORIGIN=http://localhost:3100 \
  --build-arg GSM_API_REWRITE_ORIGIN=http://localhost:3100 \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:5176 \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  storefront/
docker run --rm --network host -e PORT=5176 -e GSM_API_ORIGIN=http://localhost:3100 gsm-site:local
```

`1x00000000000000000000AA` is Cloudflare's always-pass test key. Never use it in production.
The image built this way answers uncompressed when reached directly (section 7); that is expected.

## 7. Compression

Caddy compresses the site, not the Next server.

- **Caddy:** `backend/deploy/Caddyfile` has `encode zstd gzip` in the `(common)` snippet that the shop host imports, so the
  site's responses leave Caddy as zstd (gzip for clients without zstd). Caddy's `encode` decides by content type what it
  compresses; the checks below cover a page and an in-app navigation payload (`rsc: 1`).
- **The image:** the `Dockerfile` build stage sets `NEXT_COMPRESS=0`, which `next.config.ts` turns into `compress: false`.
  The value is fixed into the standalone server when `next build` runs, so a run-time variable cannot change it. Next's own
  gzip flushes after every streamed chunk, which makes a page about twice as large on the wire as proxy compression
  (measured on `/en`: 157 KB from Next, 48 KB as zstd and 69-73 KB as gzip through a proxy).
- **Never expose the `site` container without Caddy.** `compose.prod.yaml` publishes no port for it: it joins only the
  `gsm` network, and Caddy is the one way in. Reached directly, it serves uncompressed responses.
- **Other builds:** a plain `npm run build` and `next start` (the lab on :5176, the e2e runs) leave `NEXT_COMPRESS` unset and
  keep Next's gzip, so they need no proxy.
- **Streaming:** Caddy's `reverse_proxy` flushes at once when the upstream response has no `Content-Length` (Caddy docs,
  `flush_interval`), so the streamed HTML still arrives in pieces. Check it on staging after the first deploy:

```bash
curl -sS -o /dev/null -D - -H 'accept-encoding: zstd' https://<SHOP_HOST>/en/services | grep -i '^content-encoding'   # zstd
curl -sS -o /dev/null -D - -H 'accept-encoding: gzip' https://<SHOP_HOST>/en/services | grep -i '^content-encoding'   # gzip
curl -sS -o /dev/null -D - -H 'accept-encoding: zstd' -H 'rsc: 1' https://<SHOP_HOST>/en/services | grep -i '^content-encoding'   # zstd
curl -sS -o /dev/null -w 'first byte %{time_starttransfer}s, done %{time_total}s\n' --compressed https://<SHOP_HOST>/en/services
```

  The first byte must arrive before the body ends. If `content-encoding` is missing, the request did not go through Caddy.
