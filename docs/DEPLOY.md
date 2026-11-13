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
- `lib/api/server.ts` sends no `Origin`, so every mutation (sign-in, register, orders, uploads) runs in the browser.

## 2. Variables

| Variable | Read | Meaning |
|---|---|---|
| `GSM_API_ORIGIN` | at build **and** at run time | At build: the API the build can reach (cached public reads run while pages are prerendered, and a failed read fails the build). At run time: `http://api:3000` for server reads; the image sets it, compose repeats it. |
| `GSM_API_REWRITE_ORIGIN` | at build | Destination of the `/client/*` and `/store/v1/*` rewrites. Fixed into the build, so it is the in-network address `http://api:3000` (the `Dockerfile` default). Used at run time by the image optimizer for service pictures (`/store/v1/media/*`) and when the container runs without Caddy. |
| `NEXT_PUBLIC_SITE_URL` | at build | The public origin, `https://<SHOP_HOST>`. Used for canonical URLs, social cards, `robots.txt` and the sitemap. Required. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | at build | Cloudflare Turnstile site key of the widget for `<SHOP_HOST>`. Required (production has no test key). |
| `NEXT_PUBLIC_TIME_ZONE` | at build | IANA time zone for dates on the site. Default `UTC`, the API's own zone. |
| `NEXT_PUBLIC_API_PUBLIC_URL` | at build | Optional: `https://<API_HOST>`, the machine API host shown as "Base URL" on the merchant API keys page. Empty hides those two lines. |
| `PORT`, `HOSTNAME` | at run time | The image sets `3000` and `0.0.0.0`. |

- `NEXT_PUBLIC_*` values are written into the JavaScript at build time. Changing one needs a new image.
- `NEXT_OUTPUT` and `NEXT_TELEMETRY_DISABLED` are set inside the `Dockerfile`; do not pass them.
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
- The build needs internet access for the two Google fonts (Inter and IBM Plex Sans Arabic, downloaded by `next/font`).
- The API limits public routes per client address (300 requests a minute by default). The build makes few, cached reads;
  if it ends with a `429`, wait a minute and build again.
- Build and runtime use one base image (`NODE_IMAGE`, default `node:26-slim`), because the native `sharp` module that
  optimizes images is traced for the platform of the build. Build on the server's CPU architecture, or pass `--platform`.
  Override the base with `--build-arg NODE_IMAGE=<image>` if the tag moves.

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
| `STORE_BASE_URL` | `https://<SHOP_HOST>` | customer links in mail (`/sign-in?token=`, `/unsubscribe?token=`) |
| `PORTAL_BASE_URL` | `https://<SHOP_HOST>/merchant` | merchant links in mail (`/set-password?token=`) |
| `CORS_ORIGINS` | includes `https://<SHOP_HOST>` | the Origin check of public `POST` routes (sign-in, register, forgot password) |
| `TURNSTILE_HOSTNAMES` | `<SHOP_HOST>` | host names a Turnstile token may be issued for |
| `TURNSTILE_SECRET_KEY` | secret of the widget whose site key is `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | token check |
| `TRUST_PROXY` | `172.30.0.0/24` | the API trusts `X-Forwarded-For` from Caddy and from the site |

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
