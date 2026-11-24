// The browser's API client: the only browser code that calls `fetch` on the API. Paths are same-origin
// (`/client/...`, `/store/v1/...`) and reach the API through the Next rewrite, so the session cookies just work.
// What it does for every call (handoff §3):
// - JSON in and out; no body AND no Content-Type on no-body routes (logout, 2fa/setup, data-export …);
// - the one CSRF token of the signed-in account on every non-GET to either prefix, from the readable cookie (whichever
//   of the two names exists, see lib/api/account-cookie.ts) or the last `X-CSRF-Token` header of any answer;
// - optional `X-Turnstile-Token` (the protected shop routes, forgot-password and sign-in) and `Idempotency-Key`
//   (checkout pay, balance payment, wallet writes, invoices, portal orders; see lib/api/idempotency.ts for the key rules);
// - any non-2xx becomes an ApiError (problem+json, codes kept).
// Import only from Client Components.
import { accountCsrfFrom } from "./account-cookie";
import { ApiError, isAbortError, networkError, parseProblem } from "./errors";
import { newIdempotencyKey } from "./idempotency";
import { toQueryString, type QueryInput } from "./query";
import type { SignInResult, SmartSignInInput } from "./types";
import { ACCOUNT_ROUTES, familyOfPath } from "@/lib/account/routes";

export { newIdempotencyKey };

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** The step a sign-in answer may name; anything else is refused. */
const SIGN_IN_STEPS = new Set(["password", "totp", "done"]);

/** The CSRF token the last answer sent. A fallback for when the readable cookie is not there. */
let remembered: string | undefined;

/**
 * The CSRF token of the signed-in account, or undefined when there is no session. There is one token for both families of
 * routes: the readable cookie (either name) wins, else the last `X-CSRF-Token` header of any answer.
 */
export function csrfToken(): string | undefined {
  const fromCookie = typeof document === "undefined" ? undefined : accountCsrfFrom(document.cookie);
  return fromCookie ?? remembered;
}

/** Forgets the remembered token (after sign-out). */
export function forgetCsrf(): void {
  remembered = undefined;
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

/**
 * One request. `remember: false` leaves the answer's CSRF token unkept (the sign-in checks its answer before it keeps one).
 * A path outside both prefixes is not the API and gets no token.
 */
async function send(method: Method, path: string, options: RequestOptions = {}, remember = true): Promise<Response> {
  const family = familyOfPath(path);
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
  if (method !== "GET" && family) {
    const token = csrfToken();
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
  if (token && family && remember) remembered = token;
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
   * `POST /client/auth/sign-in`: the one sign-in form for every account (Turnstile required). The answer says which step is
   * still to do (`next`: `password`, `totp` or `done`); an answer without a known step is refused instead of guessed, and keeps
   * no token. The answer's `X-CSRF-Token` header is kept as the one token. A 401 means "wrong email or password" and never
   * ends a session.
   */
  async signIn(body: SmartSignInInput, turnstileToken: string): Promise<SignInResult> {
    const res = await send("POST", ACCOUNT_ROUTES.signIn, { body, turnstileToken }, false);
    const result = await readJson<SignInResult | undefined>(res);
    if (!result || typeof result.next !== "string" || !SIGN_IN_STEPS.has(result.next)) {
      throw new ApiError({ status: res.status, code: "INVALID_RESPONSE", title: "Unreadable response" });
    }
    const token = res.headers.get("x-csrf-token");
    if (token) remembered = token;
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
