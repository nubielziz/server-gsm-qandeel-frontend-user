// Server-side API calls (Server Components, Route Handlers). Three kinds:
// - `apiPublic*`: no cookies, safe inside `'use cache'` (shared data only: catalog, content, config).
// - `apiSession*`: forward the visitor's Cookie and X-Forwarded-For, so the API sees the visitor's session and IP
//   (handoff §1.5, §3.9). They read request headers, so callers render behind <Suspense> and are never cached on the
//   server: personal data must not enter a shared cache.
// - `apiVisitor*`: shared data asked for one visitor (the search: `GET /store/v1/search`).
//   No cookies; they forward only the visitor's address, User-Agent and the prefetch headers, so each visitor has their
//   own `ip` budget and the API counts a search once, never for a prefetch or a bot (backend plan 29 §5.6, §7). Dynamic
//   like `apiSession*`: render the caller behind <Suspense>; never call them inside `'use cache'`.
// Mutations and sign-in run in the browser through the same-origin rewrite (lib/api/browser.ts), never here:
// a Set-Cookie answered to the server would never reach the browser.
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { ApiError, networkError, parseProblem } from "./errors";
import { toQueryString, type QueryInput } from "./query";

export const API_ORIGIN = (process.env.GSM_API_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");

type Init = { query?: QueryInput; signal?: AbortSignal };

/** `public`: nothing of the request; `session`: Cookie + address; `visitor`: address, User-Agent, prefetch headers. */
type Mode = "public" | "session" | "visitor";

/**
 * Request headers a visitor read passes on besides the address: the User-Agent (the API does not count bots) and the
 * headers that mark a prefetch (Next's router, `Purpose` and `Sec-Purpose`: a prefetch is not a search).
 */
export const VISITOR_HEADERS = ["user-agent", "next-router-prefetch", "purpose", "sec-purpose"] as const;

/** The visitor's address as the site's own proxy reports it (`X-Forwarded-For`, else `X-Real-IP`). */
function forwardedFor(incoming: Headers): string | null {
  return incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
}

async function call(path: string, init: Init & { mode: Mode }): Promise<Response> {
  const h = new Headers({ Accept: "application/json" });
  if (init.mode === "session") {
    // Personal data is never prerendered: wait for a real request before anything else runs (Cache Components).
    await connection();
    const [jar, incoming] = await Promise.all([cookies(), headers()]);
    const cookie = jar.toString();
    if (cookie) h.set("Cookie", cookie);
    const forwarded = forwardedFor(incoming);
    if (forwarded) h.set("X-Forwarded-For", forwarded);
  } else if (init.mode === "visitor") {
    // A per-visitor read is never prerendered either; it never reads or sends cookies.
    await connection();
    const incoming = await headers();
    const forwarded = forwardedFor(incoming);
    if (forwarded) h.set("X-Forwarded-For", forwarded);
    for (const name of VISITOR_HEADERS) {
      const value = incoming.get(name);
      if (value) h.set(name, value);
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}${path}${toQueryString(init.query)}`, {
      headers: h,
      cache: "no-store",
      signal: init.signal,
    });
  } catch (error) {
    throw networkError(error);
  }
  if (!res.ok) throw await parseProblem(res);
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const raw = await res.text();
  if (!raw.trim()) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new ApiError({ status: res.status, code: "INVALID_RESPONSE", title: "Unreadable response", cause });
  }
}

function total(res: Response, rows: unknown[]): number {
  const header = res.headers.get("x-total-count");
  const n = header === null ? NaN : Number(header);
  return Number.isFinite(n) ? n : rows.length;
}

export type ListResult<T> = { data: T[]; total: number };

/** GET a public resource (no cookies). Use inside `'use cache'` functions only for data that is the same for everyone. */
export async function apiPublicGet<T>(path: string, init: Init = {}): Promise<T> {
  return json<T>(await call(path, { ...init, mode: "public" }));
}

/** GET a public list; the total comes from `x-total-count`. */
export async function apiPublicList<T>(path: string, init: Init = {}): Promise<ListResult<T>> {
  const res = await call(path, { ...init, mode: "public" });
  const data = (await json<T[]>(res)) ?? [];
  return { data, total: total(res, data) };
}

/** GET with the visitor's session. Dynamic: render the caller behind <Suspense>; never inside `'use cache'`. */
export async function apiSessionGet<T>(path: string, init: Init = {}): Promise<T> {
  return json<T>(await call(path, { ...init, mode: "session" }));
}

/** GET a list with the visitor's session. */
export async function apiSessionList<T>(path: string, init: Init = {}): Promise<ListResult<T>> {
  const res = await call(path, { ...init, mode: "session" });
  const data = (await json<T[]>(res)) ?? [];
  return { data, total: total(res, data) };
}

/**
 * GET shared data for one visitor (a search): forwards the visitor's address, User-Agent and prefetch headers, never
 * cookies. Dynamic: render the caller behind <Suspense>; never inside `'use cache'`.
 */
export async function apiVisitorGet<T>(path: string, init: Init = {}): Promise<T> {
  return json<T>(await call(path, { ...init, mode: "visitor" }));
}

/** A list read for one visitor; the total comes from `x-total-count`. */
export async function apiVisitorList<T>(path: string, init: Init = {}): Promise<ListResult<T>> {
  const res = await call(path, { ...init, mode: "visitor" });
  const data = (await json<T[]>(res)) ?? [];
  return { data, total: total(res, data) };
}
