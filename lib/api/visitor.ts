// Per-visitor reads of shared store data: the search. The answers hold nothing personal, but each one is asked for
// one visitor (their address goes along, so each visitor has their own rate-limit budget and the API counts a search
// once; backend plan 29 §5.6, §7), so they are never cached on the server. Dynamic: render the caller behind
// <Suspense>, never inside `'use cache'`. The cached reads of the same data are in ./public.ts.
import { apiVisitorGet } from "./server";
import { storeSearchQuery, type StoreSearchArgs } from "./store-query";
import type { SearchBody } from "./types";

/** `GET /store/v1/search`: one results page (cards priced in `args.currency`, facets on page 1). */
export async function searchStore(args: StoreSearchArgs): Promise<SearchBody> {
  return apiVisitorGet<SearchBody>("/store/v1/search", { query: storeSearchQuery(args) });
}
