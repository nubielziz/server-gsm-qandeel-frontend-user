import path from "node:path";
import type { NextConfig } from "next";

// Where the GSM API listens. The browser never calls it directly: `/client/*` and `/store/v1/*` are proxied here,
// so the site and the API share one origin and the API's SameSite=Lax, host-only cookies work (handoff §2.8, §3.6).
// Dev default: the owner's API on :3000. `scripts/dev-backend.sh` runs an isolated, demo-seeded copy on :3100.
const apiOrigin = (process.env.GSM_API_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // The root layout is `app/[lang]/layout.tsx`, so unmatched URLs need a global 404 page.
    globalNotFound: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Shared (never personal) API reads. The API itself sends `max-age=30` on config and services.
  cacheLife: {
    catalog: { stale: 60, revalidate: 60, expire: 3600 },
    content: { stale: 300, revalidate: 600, expire: 86400 },
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
        { source: "/client/:path*", destination: `${apiOrigin}/client/:path*` },
        { source: "/store/v1/:path*", destination: `${apiOrigin}/store/v1/:path*` },
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
