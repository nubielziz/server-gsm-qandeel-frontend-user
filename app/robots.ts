// robots.txt: the public shop is indexable; private and token pages are not (they also carry `noindex` themselves), and
// neither are search results (`?q=`: the results page says `noindex`, backend plan 29 §7).
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
          "/*/merchant",
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
