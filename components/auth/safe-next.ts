// Where to go after sign-in. `?next=` comes from the URL, so it is only trusted when it is a path inside this site:
// it must start with a supported language segment (`/en/…`, `/ar/…`). Anything else (another origin, `//host`, a
// backslash, control characters) falls back to a fixed default. Safe to import anywhere.
const SITE_PATH = /^\/(?:en|ar)(?:[/?#]|$)/;
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/** `safeNext("/en/account/orders", "/en/account")` → the path; `safeNext("https://evil.test", "/en/account")` → the fallback. */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.length > 2048) return fallback;
  if (!SITE_PATH.test(raw) || UNSAFE.test(raw)) return fallback;
  return raw;
}
