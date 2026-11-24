import path from "node:path";
import type { NextConfig } from "next";
// Relative imports on purpose: a config file cannot use the `@/` alias, and both files import nothing themselves.
import { LEGACY_PATHS } from "./lib/account/legacy-paths";
import { sitePath } from "./lib/site-path";

// Where the GSM API listens. The browser never calls it directly: `/client/*` and `/store/v1/*` are proxied here,
// so the site and the API share one origin and the API's SameSite=Lax, host-only cookies work (handoff §2.8, §3.6).
// Dev default: the owner's API on :3000. `scripts/dev-backend.sh` runs an isolated, demo-seeded copy on :3100.
const apiOrigin = (process.env.GSM_API_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
// Rewrite destinations are fixed when `next build` runs, but the build and the running site may reach the API at
// different addresses (Docker: the build reads `GSM_API_ORIGIN`, the container reaches the API as `http://api:3000`).
// `GSM_API_REWRITE_ORIGIN` is that run-time address; unset or empty it is the API origin. Server reads at run time
// use `GSM_API_ORIGIN` (lib/api/server.ts), which the container sets itself.
const rewriteOrigin = (process.env.GSM_API_REWRITE_ORIGIN || apiOrigin).replace(/\/+$/, "");

/** One permanent redirect (308); the query of the request is passed on by Next. */
type PermanentRedirect = { source: string; destination: string; permanent: true };

/**
 * The old portal and ticket addresses, two rows for each line of the table in `lib/account/legacy-paths.ts`: the address
 * with the language prefix and the bare address (an emailed link has none), both to the prefixed new address. The rows keep
 * the order of the table, which is part of it (a fixed last segment before its parameter row, the catch-all last).
 */
const legacyRedirects: PermanentRedirect[] = LEGACY_PATHS.flatMap((row): PermanentRedirect[] => [
  { source: sitePath(row.from), destination: sitePath(row.to), permanent: true },
  { source: row.from, destination: sitePath(row.to), permanent: true },
]);

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // The root layout is `app/en/layout.tsx`, so unmatched URLs need a global 404 page.
    globalNotFound: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Shared (never personal) API reads. The API itself sends `max-age=30` on config and services.
  // `catalog` carries availability (`in_stock` changes with the stock). On the server it is refreshed in the
  // background every 30 s (`revalidate`), and a page nobody opened is at most 5 minutes behind (`expire`).
  // Neither `expire: 300` nor `stale: 300` is under 5 minutes, so catalog reads stay in the prerendered shell AND in the
  // route's App Shell, which is what a prefetch carries (Next docs, cacheLife, "Prerendering behavior": a `stale`
  // between 30 s and 5 min keeps the data out of the App Shell). `stale` itself only sets how long the router's
  // client cache serves the page without asking the server ("Client cache behavior"); availability shown from that
  // cache can be up to 5 minutes old, and checkout re-reads it on the server. Personal data never uses a cache profile.
  cacheLife: {
    catalog: { stale: 300, revalidate: 30, expire: 300 },
    content: { stale: 300, revalidate: 600, expire: 86400 },
  },
  // `NEXT_OUTPUT=standalone` (set by the Dockerfile) makes `next build` emit `.next/standalone`; every other build and
  // `next start` stay as they are. `outputFileTracingRoot` pins the trace to this folder (the parent has a lockfile).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  // Once `localPatterns` is set every other local path is refused, so the site's own images must be listed too.
  // `search: ''` allows no query string. Service pictures are served by the API through the `/store/v1/*` rewrite.
  images: {
    localPatterns: [
      { pathname: "/images/**", search: "" },
      { pathname: "/store/v1/media/**", search: "" },
    ],
  },
  poweredByHeader: false,
  // Compression belongs to the reverse proxy in production: Caddy runs `encode zstd gzip` for the shop host
  // (backend/deploy/Caddyfile). Next's own gzip flushes after every streamed chunk, so a page is about twice as big on
  // the wire (measured on /en: 157 KB against 48-73 KB). The value is fixed into the build: the Dockerfile build stage sets
  // `NEXT_COMPRESS=0`; every other build and a bare `next start` (lab, e2e) keep Next's gzip. docs/DEPLOY.md, section 7.
  compress: process.env.NEXT_COMPRESS !== "0",
  // 1: no preload fits the header budget, so React writes every preload (fonts) as a <link> in the prerendered <head>
  // instead of a `Link` response header. A regenerated shell (catalog pages revalidate every 30 s) loses that header,
  // which started Inter about 600 ms late. Not 0: React logs an error on every request for a zero or negative value.
  reactMaxHeadersLength: 1,
  turbopack: {
    // This app is its own root (an empty package-lock.json sits in the parent workspace folder).
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Arabic was removed on 2026-11-16 (decision 039). Every old /ar address (also /ar alone) answers 308 to the same path
  // under /en with its query, so indexed and bookmarked Arabic links and the token links of old mails keep working.
  // Redirects run before proxy.ts and the filesystem (Next docs, proxy.md "Execution order"). robots.ts must not
  // disallow /ar: a crawler has to fetch an old address to see its redirect.
  // There is one account area, `/account`. Every old portal address (the pages under `/merchant`, the old ticket list, and the
  // retired verification, referrals and webhooks pages) answers a 308 to its new place, with and without /en, before any
  // sign-in check, so a bookmark, an emailed link and a stored notification link keep working. The rows are built from the
  // table of `lib/account/legacy-paths.ts` (the same table `legacyAccountPath` reads); proxy.ts knows no portal address.
  // The old Arabic row stays first: it sends an old address under it to /en, and a path that is also an old portal address
  // takes one more hop.
  async redirects() {
    return [{ source: "/ar/:path*", destination: "/en/:path*", permanent: true }, ...legacyRedirects];
  },
  async rewrites() {
    return {
      // beforeFiles: these paths never reach a page; the API answers them (cookies, CSRF, problem+json, files).
      beforeFiles: [
        { source: "/client/:path*", destination: `${rewriteOrigin}/client/:path*` },
        { source: "/store/v1/:path*", destination: `${rewriteOrigin}/store/v1/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
