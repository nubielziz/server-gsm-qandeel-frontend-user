// robots.txt: the public shop is indexable; private and token pages are not (they also carry `noindex` themselves), and
// neither are search results (`?q=`: the results page says `noindex`, backend plan 29 §7). The old `/merchant` pages are gone: an old
// address answers a permanent redirect to `/account`, and a crawler has to fetch it to see that, so it is not disallowed here (the
// redirect rules are in next.config.ts). The account area itself is private.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5175").replace(/\/+$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/*/checkout",
          "/*/track/",
          "/*/account",
          "/*/sign-in",
          "/*/sign-up",
          "/client/",
          "/store/",
          "/*/services?*q=",
          "/*?*q=",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
