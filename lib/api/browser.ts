// The browser's API client: the only browser code that calls `fetch` on the API. Paths are same-origin
// (`/client/...`, `/store/v1/...`) and reach the API through the Next rewrite, so the session cookies just work.
// What it does for every call (handoff §3):
// - JSON in and out; no body AND no Content-Type on no-body routes (logout, 2fa/setup, data-export …);
// - the CSRF token OF THE CALLED SURFACE on non-GET requests (`csrf_token_client` for /client,
//   `csrf_token_store` for /store/v1), from the readable cookie or the last `X-CSRF-Token` header of that surface;
// - optional `X-Turnstile-Token` (the 7 protected store routes, and merchant register, forgot-password, login and the
//   smart sign-in) and `Idempotency-Key` (checkout pay, balance payment, wallet writes, merchant orders; see
//   lib/api/idempotency.ts for the key rules);
// - any non-2xx becomes an ApiError (problem+json, codes kept).
// The smart sign-in (`api.signIn`) is the one call whose CSRF token is stored by the ANSWER (`kind`), not by the path.
// Import only from Client Components.
import { ApiError, isAbortError, networkError, parseProblem } from "./errors";
import { newIdempotencyKey } from "./idempotency";
import { toQueryString, type QueryInput } from "./query";
import type { SmartSignInInput, SmartSignInResult } from "./types";

export { newIdempotencyKey };

type Surface = "client" | "store";
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One path serves both areas: its answer's CSRF token belongs to the surface `kind` names (plan D2). */
const SIGN_IN_PATH = "/client/auth/sign-in";

const CSRF_COOKIES: Record<Surface, string> = { client: "csrf_token_client", store: "csrf_token_store" };
const remembered: Partial<Record<Surface, string>> = {};

function surfaceOf(path: string): Surface | null {
  if (path.startsWith("/client/")) return "client";
  if (path.startsWith("/store/v1/")) return "store";
  return null;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return value || undefined;
    }
  }
  return undefined;
}

/** The CSRF token of a surface, or undefined when there is no session on it. */
export function csrfToken(surface: Surface): string | undefined {
  return readCookie(CSRF_COOKIES[surface]) ?? remembered[surface];
}

/** Forgets a surface's remembered token (after sign-out). */
export function forgetCsrf(surface: Surface): void {
  delete remembered[surface];
}

export type RequestOptions = {
  query?: QueryInput;
  /** JSON value, FormData (uploads), or undefined for no body. Send `{}` where a route needs an empty JSON body. */
  body?: unknown;
  /** Cloudflare Turnstile token for the protected routes (see the header comment). Single-use: reset the widget after. */
  turnstileToken?: string;
  /**
   * Required on `/pay`, the balance payment and every wallet POST; optional on `POST /client/orders`. Reuse the same
   * key when retrying the same request and take a new one when the body changes (`createIdempotencyKeys`).
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  accept?: string;
  /**
   * `fetch(…, { keepalive: true })`: the request completes even if the page is closed or left meanwhile (a save the
   * caller does not wait for). Small bodies only (the browser caps them at 64 KiB).
   */
  keepalive?: boolean;
};

async function send(method: Method, path: string, options: RequestOptions = {}): Promise<Response> {
  const surface = surfaceOf(path);
  // The smart sign-in is a pre-auth call on a path of the client surface: it sends no CSRF token and its answer's token
  // is stored by `api.signIn` under the surface of `kind`, never by the path.
  const smartSignIn = path === SIGN_IN_PATH;
  const headers = new Headers({ Accept: options.accept ?? "application/json" });
  let payload: BodyInit | undefined;
  if (options.body !== undefined) {
    if (typeof FormData !== "undefined" && options.body instanceof FormData) {
      payload = options.body;
    } else {
      payload = JSON.stringify(options.body);
      headers.set("Content-Type", "application/json");
    }
  }
  if (method !== "GET" && surface && !smartSignIn) {
    const token = csrfToken(surface);
    if (token) headers.set("X-CSRF-Token", token);
  }
  if (options.turnstileToken) headers.set("X-Turnstile-Token", options.turnstileToken);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  let res: Response;
  try {
    res = await fetch(`${path}${toQueryString(options.query)}`, {
      method,
      headers,
      body: payload,
      credentials: "include",
      signal: options.signal,
      keepalive: options.keepalive,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw networkError(error);
  }
  const token = res.headers.get("x-csrf-token");
  if (token && surface && !smartSignIn) remembered[surface] = token;
  if (!res.ok) throw await parseProblem(res);
  return res;
}

async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.status === 205) return undefined as T;
  const raw = await res.text();
  if (!raw.trim()) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new ApiError({ status: res.status, code: "INVALID_RESPONSE", title: "Unreadable response", cause });
  }
}

function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || undefined;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return readJson<T>(await send("GET", path, options));
  },
  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return readJson<T>(await send("POST", path, { ...options, body }));
  },
  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return readJson<T>(await send("PUT", path, { ...options, body }));
  },
  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return readJson<T>(await send("PATCH", path, { ...options, body }));
  },
  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return readJson<T>(await send("DELETE", path, options));
  },
  /**
   * `POST /client/auth/sign-in`: one form for merchants and customers (Turnstile required). The answer's `kind` picks
   * the area; its `X-CSRF-Token` header is kept for that surface only (`client` for a merchant, `store` for a
   * customer), so the token of an already signed-in other area is never overwritten. A 401 means "wrong email or
   * password" and never ends a session.
   */
  async signIn(body: SmartSignInInput, turnstileToken: string): Promise<SmartSignInResult> {
    const res = await send("POST", SIGN_IN_PATH, { body, turnstileToken });
    const result = await readJson<SmartSignInResult | undefined>(res);
    // Without a known `kind` there is no surface to keep the token for: refuse the answer instead of guessing.
    if (result?.kind !== "merchant" && result?.kind !== "customer") {
      throw new ApiError({ status: res.status, code: "INVALID_RESPONSE", title: "Unreadable response" });
    }
    const token = res.headers.get("x-csrf-token");
    if (token) remembered[result.kind === "merchant" ? "client" : "store"] = token;
    return result;
  },
  /** A list route: rows from the body, total from `x-total-count`. */
  async list<T>(path: string, options?: RequestOptions): Promise<{ data: T[]; total: number }> {
    const res = await send("GET", path, options);
    const data = (await readJson<T[]>(res)) ?? [];
    const n = Number(res.headers.get("x-total-count"));
    return { data, total: Number.isFinite(n) && res.headers.has("x-total-count") ? n : data.length };
  },
  /** GET a file (CSV, PDF) and save it; the name comes from Content-Disposition, else `fallbackName`. */
  async download(path: string, fallbackName: string, options?: RequestOptions): Promise<string> {
    const res = await send("GET", path, { ...options, accept: "*/*" });
    const name = filenameFromDisposition(res.headers.get("content-disposition")) ?? fallbackName;
    saveBlob(await res.blob(), name);
    return name;
  },
  /** `POST /client/files`: one multipart part named `file` (1 B – 25 MiB). */
  async upload<T>(path: string, file: File, options?: RequestOptions): Promise<T> {
    const form = new FormData();
    form.append("file", file);
    return readJson<T>(await send("POST", path, { ...options, body: form }));
  },
};
