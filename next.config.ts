import path from "node:path";
import type { NextConfig } from "next";

// Where the GSM API listens. The browser never calls it directly: `/client/*` and `/store/v1/*` are proxied here,
// so the site and the API share one origin and the API's SameSite=Lax, host-only cookies work (handoff §2.8, §3.6).
// Dev default: the owner's API on :3000. `scripts/dev-backend.sh` runs an isolated, demo-seeded copy on :3100.
const apiOrigin = (process.env.GSM_API_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
// Rewrite destinations are fixed when `next build` runs, but the build and the running site may reach the API at
// different addresses (Docker: the build reads `GSM_API_ORIGIN`, the container reaches the API as `http://api:3000`).
// `GSM_API_REWRITE_ORIGIN` is that run-time address; unset or empty it is the API origin. Server reads at run time
// use `GSM_API_ORIGIN` (lib/api/server.ts), which the container sets itself.
const rewriteOrigin = (process.env.GSM_API_REWRITE_ORIGIN || apiOrigin).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // The root layout is `app/[lang]/layout.tsx`, so unmatched URLs need a global 404 page.
    globalNotFound: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Shared (never personal) API reads. The API itself sends `max-age=30` on config and services.
  // `catalog` carries availability (`in_stock` changes with the stock): a page nobody opened is at most 5 minutes
  // behind. `expire: 300` is not under 5 minutes, so catalog reads stay in the prerendered shell (Next docs, cacheLife,
  // "Prerendering behavior"). Personal data never uses a cache profile.
  cacheLife: {
    catalog: { stale: 60, revalidate: 30, expire: 300 },
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
