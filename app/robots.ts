import type { MetadataRoute } from "next";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.retakes.fr").replace(/\/$/, "");

/**
 * Crawl the public site; stay out of the API, the staff panels and the
 * signed-in-only pages, none of which render anything useful to a crawler.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/admin-log", "/settings", "/profile", "/loadout", "/clips", "/organizers/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
