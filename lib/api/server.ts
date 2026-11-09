// Server-side API calls (Server Components, Route Handlers). Two kinds:
// - `apiPublic*`: no cookies, safe inside `'use cache'` (shared data only: catalog, content, config).
// - `apiSession*`: forward the visitor's Cookie and X-Forwarded-For, so the API sees the visitor's session and IP
//   (handoff §1.5, §3.9). They read request headers, so callers render behind <Suspense> and are never cached on the
//   server: personal data must not enter a shared cache.
// Mutations and sign-in run in the browser through the same-origin rewrite (lib/api/browser.ts), never here:
// a Set-Cookie answered to the server would never reach the browser.
import { cookies, headers } from "next/headers";
import { ApiError, networkError, parseProblem } from "./errors";
import { toQueryString, type QueryInput } from "./query";

export const API_ORIGIN = (process.env.GSM_API_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");

type Init = { query?: QueryInput; signal?: AbortSignal };

async function call(path: string, init: Init & { session: boolean }): Promise<Response> {
  const h = new Headers({ Accept: "application/json" });
  if (init.session) {
    const [jar, incoming] = await Promise.all([cookies(), headers()]);
    const cookie = jar.toString();
    if (cookie) h.set("Cookie", cookie);
    const forwarded = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
    if (forwarded) h.set("X-Forwarded-For", forwarded);
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
  return json<T>(await call(path, { ...init, session: false }));
}

/** GET a public list; the total comes from `x-total-count`. */
export async function apiPublicList<T>(path: string, init: Init = {}): Promise<ListResult<T>> {
  const res = await call(path, { ...init, session: false });
  const data = (await json<T[]>(res)) ?? [];
  return { data, total: total(res, data) };
}

/** GET with the visitor's session. Dynamic: render the caller behind <Suspense>; never inside `'use cache'`. */
export async function apiSessionGet<T>(path: string, init: Init = {}): Promise<T> {
  return json<T>(await call(path, { ...init, session: true }));
}

/** GET a list with the visitor's session. */
export async function apiSessionList<T>(path: string, init: Init = {}): Promise<ListResult<T>> {
  const res = await call(path, { ...init, session: true });
  const data = (await json<T[]>(res)) ?? [];
  return { data, total: total(res, data) };
}
