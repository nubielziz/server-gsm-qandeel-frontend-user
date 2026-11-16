// The popular searches of the English shop for server pages (the results page's empty state). A cached shared read
// (lib/api/public.ts `listPopularSearches`); a failing read (the API down, the route not deployed yet) is an empty
// list, never a broken page. Server only (it reads the API).
import { listPopularSearches } from "@/lib/api/public";

/** At most 8 popular search phrases, or [] when they cannot be read. */
export async function popularSearches(): Promise<string[]> {
  try {
    return await listPopularSearches();
  } catch {
    return [];
  }
}
