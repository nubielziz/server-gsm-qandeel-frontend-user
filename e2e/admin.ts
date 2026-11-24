// Staff-side helpers of the e2e suite: the admin API of the ISOLATED demo backend (http://localhost:3100).
// Used by e2e/global-setup.ts (demo data the specs expect) and by specs that need what only staff can do: credit a
// wallet, approve a top-up, create an account of either rank, change its rank, send a notification, hand out a temporary password.
//
// Rules this file keeps:
// - It talks to the API directly with Node's fetch (not through the site), as the seeded Owner, from 127.0.0.1: the admin
//   allow-list is "localhost", so it must not carry the per-test client IP that e2e/fixtures.ts adds to browser requests.
// - It refuses to run against any API but the isolated one (the owner's :3000 delivers real mail).
// - The staff session is cached in e2e/.auth/staff.json (git-ignored): a TOTP code works once, so one sign-in is shared by
//   every spec and every run until the API ends the session.
// - Nothing here switches a global setting off. Helpers that "ensure" something only turn it on or create it.
// - A POST or PATCH always carries a JSON body (`{}` when empty): the API answers 400 to an empty body with a JSON type.
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The only API the suite may run against (same pattern as the guard in playwright.config.ts). */
const ISOLATED_API = /^http:\/\/(localhost|127\.0\.0\.1):3100\/?$/;

/** The admin API of the isolated backend. */
export const API_ORIGIN = (process.env.E2E_API_ORIGIN ?? "http://localhost:3100").replace(/\/$/, "");
if (!ISOLATED_API.test(API_ORIGIN)) {
  throw new Error(`The e2e admin helpers run only against the isolated demo API (http://localhost:3100), not ${API_ORIGIN}.`);
}

/** Files the global setup and the helpers share (git-ignored folder). */
export const AUTH_DIR = join(__dirname, ".auth");
export const STAFF_FILE = join(AUTH_DIR, "staff.json");
export const FIXTURES_FILE = join(AUTH_DIR, "fixtures.json");

/** A service the fixtures name: the id is what the admin routes and `POST /store/v1/checkout-sessions` take. */
export interface FixtureService {
  id: number;
  slug: string;
}

/** `e2e/.auth/fixtures.json`, written by the global setup. */
export interface E2eFixtures {
  /** The manual top-up gateway `cliq-e2e` (the store wallet of a retail account). */
  gatewayId: number;
  /** Quantity range 2 to 50. */
  range: FixtureService;
  /** Packs 5, 10 and 25. */
  packs: FixtureService;
  /** Exact quantity 5 (minQty = maxQty = 5, no packs). */
  exact: FixtureService;
  /** At least 20 codes available: reads `availability: "in_stock"`. */
  stocked: FixtureService;
  /** A listing with a picture (`imageUrl` is not null). */
  pictured: FixtureService;
}

// ── Staff identity: the seeded Owner. Password and TOTP secret are public dev data of the isolated backend (handoff §9.2). ──
const STAFF = {
  email: "rami@gsm-supply.example",
  password: "demo-password",
  totpSecret: "4DP3DBKM62TVFPNM5QE6OO4P6STUYM3J",
} as const;

/** Sent on every admin call: CORS origin of the dev site, and the loopback address the admin allow-list accepts. */
const ADMIN_HEADERS = { Origin: "http://localhost:5175", "X-Forwarded-For": "127.0.0.1" } as const;

/** Length of a TOTP time step (RFC 6238). */
const TOTP_STEP_MS = 30_000;

// ── TOTP (RFC 6238, HMAC-SHA1, 6 digits, 30-second steps), no dependency ──────────────────────────────────────────────

/** Decodes a base32 (RFC 4648) secret; padding and case are ignored. */
export function base32Decode(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(ch);
    if (index < 0) throw new Error("Not a base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * The six-digit code of a base32 secret.
 *
 * @param secret base32 secret
 * @param atMs the time in milliseconds (default: now)
 * @param stepOffset time steps to add (the backend accepts one step either side of its clock)
 */
export function totp(secret: string, atMs: number = Date.now(), stepOffset = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / TOTP_STEP_MS) + stepOffset));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const value = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

// ── HTTP ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** An answer other than the one the caller expected (the message holds the route, the status and the problem's code and detail). */
export class AdminApiError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

interface Problem {
  code?: string;
  detail?: string;
  requestId?: string;
  errors?: { field?: string; code?: string }[];
}

function describeProblem(body: unknown): { code: string | undefined; text: string } {
  const problem = (body && typeof body === "object" ? body : {}) as Problem;
  const fields = (problem.errors ?? []).map((e) => `${e.field}:${e.code}`).join(", ");
  const text = [problem.code, problem.detail, fields && `(${fields})`, problem.requestId && `request ${problem.requestId}`]
    .filter(Boolean)
    .join(" ");
  return { code: problem.code, text };
}

interface Reply {
  status: number;
  headers: Headers;
  body: unknown;
}

/** `fetch`, with a message that says what to start when the isolated API does not answer. */
async function fetchApi(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    throw new Error(`The isolated demo API does not answer at ${API_ORIGIN}${cause}: start it with scripts/dev-backend.sh start.`);
  }
}

async function readReply(res: Response): Promise<Reply> {
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, headers: res.headers, body };
}

/** The `name=value` pairs of a response's Set-Cookie headers, in order; a cleared cookie has an empty value. */
function cookiesOf(headers: Headers): { name: string; value: string; cleared: boolean }[] {
  return headers.getSetCookie().map((line) => {
    const [pair, ...attributes] = line.split(";");
    const at = pair.indexOf("=");
    const value = pair.slice(at + 1).trim();
    const cleared = value === "" || attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
    return { name: pair.slice(0, at).trim(), value, cleared };
  });
}

/** Cookies by name, as one `Cookie` header value. */
function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absorb(jar: Map<string, string>, headers: Headers) {
  for (const c of cookiesOf(headers)) {
    if (c.cleared) jar.delete(c.name);
    else jar.set(c.name, c.value);
  }
}

// ── The staff session ─────────────────────────────────────────────────────────────────────────────────────────────────

/** What an admin call needs: the session cookies and the CSRF token that goes in `X-CSRF-Token`. */
export interface StaffSession {
  cookie: string;
  csrf: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCachedSession(): StaffSession | null {
  try {
    const saved = JSON.parse(readFileSync(STAFF_FILE, "utf8")) as Partial<StaffSession>;
    return saved.cookie && saved.csrf ? { cookie: saved.cookie, csrf: saved.csrf } : null;
  } catch {
    return null; // no file, or a half-written one from another run: sign in again
  }
}

/** Writes the cache through a rename, so a parallel reader never sees half a file. */
function writeCachedSession(session: StaffSession) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const temporary = `${STAFF_FILE}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...session, savedAt: new Date().toISOString() }), { mode: 0o600 });
  renameSync(temporary, STAFF_FILE);
}

async function rawSend(
  method: string,
  path: string,
  options: { session?: StaffSession; json?: unknown; form?: FormData; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...ADMIN_HEADERS, ...options.headers };
  if (options.session) {
    headers.Cookie = options.session.cookie;
    if (method !== "GET") headers["X-CSRF-Token"] = options.session.csrf;
  }
  let body: string | FormData | undefined;
  if (options.form) {
    body = options.form; // fetch sets the multipart boundary itself
  } else if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json ?? {});
  }
  return readReply(await fetchApi(`${API_ORIGIN}${path}`, { method, headers, body }));
}

async function isLive(session: StaffSession): Promise<boolean> {
  return (await rawSend("GET", "/admin/auth/me", { session })).status === 200;
}

function retryAfter(reply: Reply): string {
  const seconds = reply.headers.get("retry-after");
  return seconds ? ` Try again in ${seconds} seconds.` : "";
}

/**
 * Signs the Owner in: password, then a TOTP code.
 *
 * The backend accepts a code only for a time step newer than the last accepted one (one step of tolerance either side
 * of its clock), and counts five attempts per 15 minutes. So: try this step's code, then the next step's (a parallel run
 * may have used this one), and when both are refused wait for the next step once, after looking for a session that the
 * parallel run saved, then try only the newer step. The previous step is never tried: it cannot be newer than a refused
 * current one.
 */
async function signInStaff(): Promise<StaffSession> {
  let waited = false;
  for (;;) {
    const login = await rawSend("POST", "/admin/auth/login", { json: { email: STAFF.email, password: STAFF.password } });
    if (login.status === 429) throw new AdminApiError(429, "RATE_LIMITED", `Staff sign-in is rate limited.${retryAfter(login)}`);
    if (login.status !== 200 || (login.body as { next?: string } | undefined)?.next !== "totp") {
      throw new AdminApiError(login.status, describeProblem(login.body).code, `Staff sign-in failed: ${describeProblem(login.body).text || login.status}`);
    }
    const jar = new Map<string, string>();
    absorb(jar, login.headers);
    const pending: StaffSession = { cookie: cookieHeader(jar), csrf: login.headers.get("x-csrf-token") ?? jar.get("csrf_token") ?? "" };

    // After the wait the current step is the one this pass tried as the next, and the backend refused it: only the newer one can work.
    for (const offset of waited ? [1] : [0, 1]) {
      const code = totp(STAFF.totpSecret, Date.now(), offset);
      const reply = await rawSend("POST", "/admin/auth/2fa", { session: pending, json: { code } });
      if (reply.status === 204) {
        absorb(jar, reply.headers);
        const session = { cookie: cookieHeader(jar), csrf: reply.headers.get("x-csrf-token") ?? jar.get("csrf_token") ?? pending.csrf };
        writeCachedSession(session);
        return session;
      }
      if (reply.status === 429) throw new AdminApiError(429, "RATE_LIMITED", `Staff two-step code is rate limited.${retryAfter(reply)}`);
      if (reply.status !== 422) {
        throw new AdminApiError(reply.status, describeProblem(reply.body).code, `Staff two-step sign-in failed: ${describeProblem(reply.body).text || reply.status}`);
      }
    }

    const saved = readCachedSession();
    if (saved && (await isLive(saved))) return saved;
    if (waited) throw new Error("Staff sign-in: the code of two successive time steps was refused.");
    waited = true;
    await sleep(TOTP_STEP_MS - (Date.now() % TOTP_STEP_MS) + 1_000);
  }
}

let sessionPromise: Promise<StaffSession> | undefined;

async function openStaffSession(): Promise<StaffSession> {
  const cached = readCachedSession();
  if (cached && (await isLive(cached))) return cached;
  return signInStaff();
}

/**
 * The staff session of this process: the cached one when the API still accepts it, else a new sign-in.
 *
 * The argument is accepted (and ignored) so the call shape `staff(request)` of the plan works: staff calls must not go
 * through a Playwright request context, which would add that test's client IP and break the loopback allow-list.
 */
export async function staff(_request?: unknown): Promise<StaffSession> {
  void _request;
  sessionPromise ??= openStaffSession().catch((error: unknown) => {
    sessionPromise = undefined;
    throw error;
  });
  return sessionPromise;
}

/** Forgets the session of this process (and the cache file is replaced on the next sign-in). */
function dropSession() {
  sessionPromise = undefined;
}

/** What an admin call answers. */
export interface AdminReply<T> {
  status: number;
  body: T;
  /** The `x-total-count` header of a list, or null. */
  total: number | null;
}

/**
 * One admin call as the Owner. A status outside 2xx throws an `AdminApiError` unless it is in `allow`.
 * A 401 (the API ended the session) signs in again once and repeats the call.
 *
 * @param path the admin path with its query, such as `/admin/clients?q=a%40b.test`
 * @param options `json` is the body (`{}` when absent on a POST or PATCH); `form` a multipart body
 */
export async function adminCall<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: { json?: unknown; form?: FormData; headers?: Record<string, string>; allow?: number[] } = {},
): Promise<AdminReply<T>> {
  let reply: Reply | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await staff();
    reply = await rawSend(method, path, { session, ...options });
    if (reply.status !== 401) break;
    dropSession();
  }
  const answer = reply as Reply;
  const ok = (answer.status >= 200 && answer.status < 300) || (options.allow ?? []).includes(answer.status);
  if (!ok) {
    const problem = describeProblem(answer.body);
    throw new AdminApiError(answer.status, problem.code, `${method} ${path.split("?")[0]} answered ${answer.status} ${problem.text}`.trim());
  }
  const total = Number(answer.headers.get("x-total-count"));
  return { status: answer.status, body: answer.body as T, total: answer.headers.has("x-total-count") && Number.isFinite(total) ? total : null };
}

const withKey = () => ({ "Idempotency-Key": randomUUID() });

// ── Decimal amounts: 4-decimal strings, whole units of 1/10000 in BigInt, never floats ───────────────────────────────

const MONEY_SCALE = BigInt(10_000);

/** "20", "20.5" and 20 become "20.0000". Anything else (negative, more than 4 decimals, an exponent) throws. */
export function toMoney4(amount: string | number): string {
  const text = String(amount).trim();
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) throw new Error(`Not a money amount with at most 4 decimals: ${text}`);
  return `${match[1]}.${(match[2] ?? "").padEnd(4, "0")}`;
}

/** An amount cut into calls of at most `max` (staff adjustments above $500 need a second approver). */
export function splitMoney(amount: string | number, max = 500): string[] {
  const [whole, fraction] = toMoney4(amount).split(".");
  let left = BigInt(whole) * MONEY_SCALE + BigInt(fraction);
  if (left <= BigInt(0)) throw new Error("The amount must be above zero.");
  const cap = BigInt(max) * MONEY_SCALE;
  const parts: string[] = [];
  while (left > BigInt(0)) {
    const part = left > cap ? cap : left;
    parts.push(`${part / MONEY_SCALE}.${String(part % MONEY_SCALE).padStart(4, "0")}`);
    left -= part;
  }
  return parts;
}

// ── The store side the setup reads (public routes, no session) ───────────────────────────────────────────────────────

/** What the setup and the specs read of a store service page. */
export interface StoreService {
  id: number;
  slug: string;
  availability: "in_stock" | "on_request";
  imageUrl: string | null;
  quantity: { min: number; max: number; options: number[] };
}

/** `GET /store/v1/services/:slug` on the API itself (no cache between). */
export async function storeService(slug: string): Promise<StoreService> {
  const reply = await readReply(await fetchApi(`${API_ORIGIN}/store/v1/services/${encodeURIComponent(slug)}`, { headers: { ...ADMIN_HEADERS } }));
  if (reply.status !== 200) throw new AdminApiError(reply.status, describeProblem(reply.body).code, `GET /store/v1/services/${slug} answered ${reply.status} ${describeProblem(reply.body).text}`.trim());
  return reply.body as StoreService;
}

// ── Settings, gateway, currency ──────────────────────────────────────────────────────────────────────────────────────

/** The manual top-up gateway of the e2e suite (the body is the plan's, F03). */
const CLIQ_GATEWAY = {
  code: "cliq-e2e",
  driver: "manual",
  name: "CliQ transfer (e2e)",
  audience: "b2c",
  feePercent: "0",
  feeFixed: "0",
  minAmount: "5",
  maxAmount: "500",
  allowedGroupIds: [] as number[],
  supportsRefunds: false,
  supports3ds: false,
  isManual: true,
  instructions: "Send the amount by CliQ to the alias GSMSHOP and write the top-up number in the note.",
  holdHours: 0,
  isActive: true,
};

interface GatewayRow {
  id: number;
  code: string;
  isActive: boolean;
}

/**
 * Switches the store wallet (the retail rank's balance, setting `wallet.customer.enabled`) on (never off) and makes sure the manual gateway
 * `cliq-e2e` exists and is active.
 *
 * @returns the gateway id
 */
export async function ensureStoreWallet(): Promise<{ gatewayId: number }> {
  const settings = await adminCall<Record<string, unknown>>("GET", "/admin/settings");
  if (settings.body["wallet.customer.enabled"] !== true) {
    await adminCall("PATCH", "/admin/settings", { json: { "wallet.customer.enabled": true } });
  }

  const find = async () =>
    (await adminCall<GatewayRow[]>("GET", "/admin/payment-gateways?_start=0&_end=100")).body.find((g) => g.code === CLIQ_GATEWAY.code);
  let gateway = await find();
  if (!gateway) {
    // 422 field `code` "taken": a parallel run created it between our read and our write.
    const created = await adminCall<GatewayRow>("POST", "/admin/payment-gateways", { json: CLIQ_GATEWAY, allow: [422] });
    gateway = created.status === 201 ? created.body : await find();
  }
  if (!gateway) throw new Error("The gateway cliq-e2e could not be created.");
  if (!gateway.isActive) await adminCall("PATCH", `/admin/payment-gateways/${gateway.id}`, { json: { isActive: true } });
  return { gatewayId: gateway.id };
}

interface CurrencyRow {
  id: number;
  code: string;
  decimals: number;
  isStorefront: boolean;
  isActive: boolean;
}

/**
 * Makes sure the storefront lists a currency with the given display decimals (JOD with 2 by default).
 * A missing currency is created; an existing one is only corrected (decimals, listed, active), never switched off.
 */
export async function ensureCurrency(code = "JOD", decimals = 2): Promise<{ id: number }> {
  const find = async () =>
    (await adminCall<CurrencyRow[]>("GET", "/admin/currencies?_start=0&_end=100")).body.find((c) => c.code === code);
  let currency = await find();
  if (!currency) {
    const created = await adminCall<CurrencyRow>("POST", "/admin/currencies", {
      json: { code, name: "Jordanian dinar", rateToBase: "0.70900000", isStorefront: true, decimals },
      allow: [422],
    });
    currency = created.status === 201 ? created.body : await find();
  }
  if (!currency) throw new Error(`The currency ${code} could not be created.`);
  const fix: Record<string, unknown> = {};
  if (currency.decimals !== decimals) fix.decimals = decimals;
  if (!currency.isStorefront) fix.isStorefront = true;
  if (!currency.isActive) fix.isActive = true;
  if (Object.keys(fix).length) await adminCall("PATCH", `/admin/currencies/${currency.id}`, { json: fix });
  return { id: currency.id };
}

// ── Ranks and accounts ───────────────────────────────────────────────────────────────────────────────────────────────

/** The kind of a rank (the wire's word): a merchant rank buys in the shop at its own prices and has an API and invoices. */
export type RankKind = "retail" | "merchant";

/** A row of `GET /admin/client-groups`: the rank, with its kind as `rankKind` (the stored `kind` stays beside it). */
export interface RankRow {
  id: number;
  name: string;
  rankKind: RankKind;
  isDefault: boolean;
}

/** The ranks the helpers use by kind: the one retail rank, and the merchant rank that new merchants start in. */
export interface RankIds {
  retail: number;
  merchant: number;
}

/**
 * Picks the two ranks the helpers use out of the rank list: the retail rank with the lowest id, and the default merchant rank
 * (the lowest-id merchant rank when none is marked). Pure.
 *
 * @throws when the list has no retail rank or no merchant rank
 */
export function pickRanks(ranks: readonly RankRow[]): RankIds {
  const byId = [...ranks].sort((a, b) => a.id - b.id);
  const retail = byId.find((rank) => rank.rankKind === "retail");
  const merchants = byId.filter((rank) => rank.rankKind === "merchant");
  const merchant = merchants.find((rank) => rank.isDefault) ?? merchants[0];
  if (!retail) throw new Error("The demo data has no retail rank (GET /admin/client-groups).");
  if (!merchant) throw new Error("The demo data has no merchant rank (GET /admin/client-groups).");
  return { retail: retail.id, merchant: merchant.id };
}

let ranksPromise: Promise<RankIds> | undefined;

/** The ids of the retail rank and the default merchant rank, read once per process. */
export async function rankIds(): Promise<RankIds> {
  ranksPromise ??= adminCall<RankRow[]>("GET", "/admin/client-groups?_start=0&_end=200")
    .then((reply) => pickRanks(reply.body))
    .catch((error: unknown) => {
      ranksPromise = undefined;
      throw error;
    });
  return ranksPromise;
}

/** What the helpers read of a row of `GET /admin/clients`. */
export interface AccountRow {
  id: number;
  email: string;
  name: string;
  status: "active" | "suspended" | "blocked" | "anonymized";
  /** False for a guest row (a buyer who never made a login). */
  hasAccount: boolean;
  rank: { id: number; name: string; kind: RankKind };
}

/**
 * The staff id of an account by exact email. A login row and a guest row may share an email, so the lookup names which one:
 * the login row by default, the guest row with `guest: true`. The shop's `GET /me` id is the same number.
 */
export async function accountIdByEmail(email: string, options: { guest?: boolean } = {}): Promise<number> {
  const query = `q=${encodeURIComponent(email)}&hasAccount=${options.guest ? "false" : "true"}&_start=0&_end=25`;
  const rows = (await adminCall<AccountRow[]>("GET", `/admin/clients?${query}`)).body;
  const row = rows.find((r) => r.email.toLowerCase() === email.toLowerCase());
  if (!row) throw new Error(`No ${options.guest ? "guest" : "account"} with the email ${email}.`);
  return row.id;
}

/** Country of a retail account staff create: it needs a tax window (the demo has one for the US, at 0 %), and the US shows dollars. */
const RETAIL_COUNTRY = "US";
/** Country of a merchant account staff create. */
const MERCHANT_COUNTRY = "JO";

/**
 * Staff create an account (`POST /admin/clients`) as the Owner. The account is active at once and has no password: an
 * invitation link is mailed to the address and the person sets a password from it (`freshAccount` does that).
 *
 * A retail account is what the route makes when no rank is named; a merchant rank is the Owner's to give, and the seeded staff
 * member is the Owner. A merchant account gets the default merchant rank unless a rank id is passed.
 *
 * @param options `rank`: a kind, or the id of a rank; `country`: ISO-2 (a retail account needs one with a tax window)
 * @returns the staff id of the new account
 */
export async function createAccount(options: { email: string; name?: string; rank?: RankKind | number; country?: string }): Promise<number> {
  const rank = options.rank ?? "retail";
  const body: Record<string, unknown> = {
    name: options.name ?? (rank === "retail" ? "E2E Account" : "E2E Merchant"),
    email: options.email,
    country: options.country ?? (rank === "retail" ? RETAIL_COUNTRY : MERCHANT_COUNTRY),
  };
  if (rank !== "retail") body.groupId = typeof rank === "number" ? rank : (await rankIds()).merchant;
  const created = (await adminCall<AccountRow>("POST", "/admin/clients", { json: body })).body;
  if (created.status !== "active") throw new Error(`The new account ${created.id} reads ${created.status}, not active.`);
  return created.id;
}

/**
 * Moves an account to another rank (`POST /admin/clients/:id/rank`, the Owner's route, keyed by an `Idempotency-Key`). The balance
 * moves to the wallet of the new kind, the sessions and the API keys of the account end, so the person signs in again.
 * A blocker (an open order, a held balance, an open checkout) answers 409 with its code: it throws an `AdminApiError`.
 *
 * @param to a kind (the retail rank, or the default merchant rank) or the id of a rank
 * @param options `creditLimit` for a rank that allows credit; `key` to replay a call
 * @returns the account row after the change
 */
export async function changeRank(accountId: number, to: RankKind | number, options: { creditLimit?: string; key?: string } = {}): Promise<AccountRow> {
  const groupId = typeof to === "number" ? to : (await rankIds())[to];
  const reply = await adminCall<AccountRow>("POST", `/admin/clients/${accountId}/rank`, {
    headers: { "Idempotency-Key": options.key ?? randomUUID() },
    json: { groupId, ...(options.creditLimit === undefined ? {} : { creditLimit: toMoney4(options.creditLimit) }) },
  });
  return reply.body;
}

/**
 * Staff change an account's address (`PATCH /admin/clients/:id` with `email`). The verification is cleared and a verification link
 * is mailed to the new address; the old address gets a notice and every session of the account ends. It is the way an account
 * with an unverified email is made: an invitation always verifies.
 */
export async function changeAccountEmail(accountId: number, email: string): Promise<void> {
  await adminCall("PATCH", `/admin/clients/${accountId}`, { json: { email } });
}

/** Staff suspend an account (a reason of 3 to 140 characters) or lift the suspension. A suspended account cannot sign in. */
export async function setAccountStatus(accountId: number, status: "active" | "suspended", reason = "e2e fixture suspension"): Promise<void> {
  await adminCall("PATCH", `/admin/clients/${accountId}`, { json: status === "suspended" ? { status, reason } : { status } });
}

/** Gives an account a temporary password (the next sign-in answers `next: "password"`). Any account with a login. */
export async function temporaryPassword(accountId: number): Promise<string> {
  const reply = await adminCall<{ temporaryPassword: string }>("POST", `/admin/clients/${accountId}/password`, { json: { mode: "temporary_password" } });
  return reply.body.temporaryPassword;
}

/** Makes an API key for a merchant-rank account as staff (its list then marks it `createdByStaff`). The secret is shown once. A retail account answers 409. */
export async function staffApiKeyFor(accountId: number, name: string): Promise<{ id: number; name: string; prefix: string; secret: string }> {
  const reply = await adminCall<{ key: { id: number; prefix: string }; secret: string }>("POST", `/admin/clients/${accountId}/api-keys`, {
    json: { name, scopes: ["dhru"] },
  });
  return { id: reply.body.key.id, name, prefix: reply.body.key.prefix, secret: reply.body.secret };
}

// ── The wallet of an account ─────────────────────────────────────────────────────────────────────────────────────────

/** The live wallet of an account, as `GET /admin/clients/:id/wallet` answers: the kind follows the rank. */
export interface AccountWallet {
  kind: "merchant" | "store";
  balance: string;
  available: string;
  frozen: { at: string; reason: string } | null;
}

/** The live wallet of an account of either kind (all zero while it has none). */
export async function accountWallet(accountId: number): Promise<AccountWallet> {
  return (await adminCall<AccountWallet>("GET", `/admin/clients/${accountId}/wallet`)).body;
}

/**
 * Adds money to the live wallet of an account by hand (in USD, the wallet currency), whichever its kind. The API takes a limited
 * amount per call without a second approver, so a larger amount is sent as several calls of at most $500, each with its own
 * `Idempotency-Key` (the header is required for both kinds).
 *
 * @param amount "20", "20.5" or "20.0000" (at most 4 decimals)
 * @returns the balance after the last call, as the API prints it
 */
export async function creditAccount(accountId: number, amount: string | number, reason = "e2e fixture credit"): Promise<string> {
  for (const part of splitMoney(amount)) {
    await adminCall("POST", `/admin/clients/${accountId}/wallet/adjust`, { headers: withKey(), json: { amount: part, direction: "credit", reason } });
  }
  return (await accountWallet(accountId)).balance;
}

/** Puts the live wallet of an account on hold (a store wallet answers `frozen: { at }`). Freezing a frozen wallet is a no-op. */
export async function freezeWallet(accountId: number, reason = "e2e wallet freeze"): Promise<void> {
  await adminCall("POST", `/admin/clients/${accountId}/wallet/freeze`, { headers: withKey(), json: { reason } });
}

/** Lifts the hold. Unfreezing a wallet that is not frozen is a no-op. */
export async function unfreezeWallet(accountId: number, reason = "e2e wallet unfreeze"): Promise<void> {
  await adminCall("POST", `/admin/clients/${accountId}/wallet/unfreeze`, { headers: withKey(), json: { reason } });
}

interface PaymentRow {
  id: number;
  purpose: string;
  status: string;
  invoiceId: number | null;
  amount: string;
}

/** The pending top-up payment of an account (the manual review queue), waiting briefly for a receipt that was just sent. */
async function pendingTopUp(accountId: number, invoiceId?: number): Promise<PaymentRow> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const rows = (await adminCall<PaymentRow[]>("GET", `/admin/payments?accountId=${accountId}&status=pending`)).body;
    const match = rows.filter((p) => p.purpose === "topup" && (invoiceId === undefined || p.invoiceId === invoiceId)).sort((a, b) => b.id - a.id)[0];
    if (match) return match;
    if (Date.now() > deadline)
      throw new Error(`Account ${accountId} has no pending top-up payment${invoiceId ? ` for top-up ${invoiceId}` : ""} (is the receipt sent?).`);
    await sleep(500);
  }
}

/**
 * Approves the newest pending top-up of an account (or the one with this top-up id: the `id` the shop prints).
 * The balance is credited and the top-up reads `credited`.
 */
export async function approveTopUp(accountId: number, topUpId?: number): Promise<{ paymentId: number }> {
  const payment = await pendingTopUp(accountId, topUpId);
  await adminCall("POST", `/admin/payments/${payment.id}/approve`, { json: {} });
  return { paymentId: payment.id };
}

/** Rejects the newest pending top-up of an account (or the one with this top-up id) with a reason the account holder sees. */
export async function rejectTopUp(accountId: number, reason: string, topUpId?: number): Promise<{ paymentId: number }> {
  const payment = await pendingTopUp(accountId, topUpId);
  await adminCall("POST", `/admin/payments/${payment.id}/reject`, { json: { reason } });
  return { paymentId: payment.id };
}

/** Completes an open order with its result text (`POST /admin/orders/:id/reply`; 409 ORDER_NOT_OPEN when it is closed). */
export async function completeOrder(orderId: number, code: string): Promise<void> {
  await adminCall("POST", `/admin/orders/${orderId}/reply`, { json: { code } });
}

// ── Services: quantity rules, stock, pictures ────────────────────────────────────────────────────────────────────────

/** A range (`min` to `max`; exact N is `min = max = N`) or fixed packs. */
export type QuantityRule = { min: number; max: number; options?: undefined } | { options: number[]; min?: undefined; max?: undefined };

/** The body of the admin PATCH and the answer the store should give back. Packs are ascending and unique. */
export function normalizeRule(rule: QuantityRule): { min: number; max: number; options: number[] } {
  if (rule.options) {
    const options = [...new Set(rule.options)].sort((a, b) => a - b);
    if (!options.length || options.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("Packs are positive whole numbers.");
    return { min: options[0], max: options[options.length - 1], options };
  }
  if (!Number.isInteger(rule.min) || !Number.isInteger(rule.max) || rule.min < 1 || rule.max < rule.min) throw new Error("A range is 1 <= min <= max, whole numbers.");
  return { min: rule.min, max: rule.max, options: [] };
}

/** Does the quantity a store page prints equal the rule? */
export function quantityMatches(current: { min: number; max: number; options: number[] }, rule: QuantityRule): boolean {
  const wanted = normalizeRule(rule);
  return current.min === wanted.min && current.max === wanted.max && current.options.length === wanted.options.length && current.options.every((n, i) => n === wanted.options[i]);
}

/** Sets the quantity rule of a service (`PATCH /admin/services/:id`). */
export async function setQuantityRule(serviceId: number, rule: QuantityRule): Promise<void> {
  const wanted = normalizeRule(rule);
  await adminCall("PATCH", `/admin/services/${serviceId}`, { json: { qtyOptions: wanted.options, minQty: wanted.min, maxQty: wanted.max } });
}

/** Sets the rule only when the store page of `slug` does not already show it. Returns the service id. */
export async function ensureQuantityRule(slug: string, rule: QuantityRule): Promise<FixtureService> {
  const service = await storeService(slug);
  if (!quantityMatches(service.quantity, rule)) await setQuantityRule(service.id, rule);
  return { id: service.id, slug };
}

/** How many inventory codes of a service are available (`x-total-count` of a one-row page). */
export async function availableCodes(serviceId: number): Promise<number> {
  const reply = await adminCall<unknown[]>("GET", `/admin/inventory-codes?serviceId=${serviceId}&status=available&_start=0&_end=1`);
  return reply.total ?? reply.body.length;
}

/**
 * `n` codes no other run has used: `<prefix>-<digits>-<number>`, 6 to 128 characters, no spaces. The digits come first so a
 * spec that looks for `/Z3X-\d+/` in an order's result finds one (merchant.spec.ts sells codes of the Z3X service).
 */
export function newCodes(n: number, prefix = "E2E"): string[] {
  if (!/^[A-Za-z0-9]{1,20}$/.test(prefix)) throw new Error("A code prefix is letters and digits.");
  const tag = `${Date.now()}${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
  return Array.from({ length: n }, (_, i) => `${prefix}-${tag}-${String(i).padStart(4, "0")}`);
}

/**
 * Imports `n` new codes for a service (`prefix` shapes them, see `newCodes`). A duplicate (the API refuses a code another
 * service holds) is retried with new codes.
 */
export async function importCodes(serviceId: number, n: number, prefix = "E2E"): Promise<number> {
  if (!Number.isInteger(n) || n < 1 || n > 10_000) throw new Error("Import between 1 and 10000 codes.");
  let imported = 0;
  for (let attempt = 0; attempt < 3 && imported < n; attempt += 1) {
    const reply = await adminCall<{ imported: number }>("POST", `/admin/services/${serviceId}/inventory/import`, { json: { codes: newCodes(n - imported, prefix) } });
    imported += reply.body.imported;
  }
  if (imported < n) throw new Error(`Only ${imported} of ${n} codes were imported for service ${serviceId}.`);
  return imported;
}

/** Tops the available codes of a service up to `atLeast`. Returns how many it imported (0 when there was enough). */
export async function ensureStock(serviceId: number, atLeast: number, prefix = "E2E"): Promise<number> {
  const have = await availableCodes(serviceId);
  return have >= atLeast ? 0 : importCodes(serviceId, atLeast - have, prefix);
}

interface ServiceRow {
  id: number;
  code: string;
}

/** The service id of a service code such as `SRV-Z3X-10` (not every service has a store page, so not a slug). */
export async function serviceIdByCode(code: string): Promise<number> {
  const rows = (await adminCall<ServiceRow[]>("GET", `/admin/services?q=${encodeURIComponent(code)}&_start=0&_end=25`)).body;
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`No service with the code ${code}.`);
  return row.id;
}

interface ListingRow {
  id: number;
  slug: string;
  imageUrl: string | null;
}

/**
 * Gives the listing of a store page a picture when it has none: uploads a file of `public/images/` as
 * `POST /admin/service-listings/:id/image` (multipart part `file`). Returns the picture's path. One listing per service
 * and one slug per listing (decision 039): the slug names it.
 */
export async function ensureListingImage(slug: string, publicFile: string): Promise<string> {
  const rows = (await adminCall<ListingRow[]>("GET", `/admin/service-listings?q=${encodeURIComponent(slug)}&_start=0&_end=25`)).body;
  const listing = rows.find((r) => r.slug === slug);
  if (!listing) throw new Error(`No listing with the slug ${slug}.`);
  if (listing.imageUrl) return listing.imageUrl;
  const bytes = readFileSync(join(__dirname, "..", "public", "images", publicFile));
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), publicFile);
  const uploaded = await adminCall<ListingRow>("POST", `/admin/service-listings/${listing.id}/image`, { form });
  if (!uploaded.body.imageUrl) throw new Error(`The picture of ${slug} was not saved.`);
  return uploaded.body.imageUrl;
}

// ── Notifications ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Who a campaign goes to: one account, of either rank. */
export interface CampaignTarget {
  type: "account";
  id: number;
}

/** A link per audience, as the campaign route takes it (the wire keys keep their names). */
export interface CampaignLinks {
  customer?: string;
  merchant?: string;
}

export interface CampaignOptions {
  to: CampaignTarget;
  title: string;
  /** Plain text; a line break shows as a line break. */
  body: string;
  /** A root-relative path (both ranks use the same pages under `/account`: `/account/orders`), or a link per audience. */
  link?: string | CampaignLinks;
  purpose?: "service" | "marketing";
  /** Default `["in_app"]`. */
  channels?: ("in_app" | "email")[];
}

/** The `link` of a campaign body: a plain path is given to both audiences, since an account is either and both open `/account`. Pure. */
export function campaignLink(link: string | CampaignLinks | undefined): CampaignLinks | undefined {
  if (link === undefined) return undefined;
  return typeof link === "string" ? { customer: link, merchant: link } : link;
}

/**
 * Sends a notification campaign to one account: audience preview, create, send. The in-app item shows in the account's
 * notification feed within a few seconds (the worker fans it out).
 *
 * @returns the campaign id
 */
export async function sendCampaign(options: CampaignOptions): Promise<{ id: number }> {
  const audience = { include: [{ type: options.to.type, id: options.to.id }] };
  const channels = options.channels ?? ["in_app"];
  const purpose = options.purpose ?? "service";
  const preview = await adminCall<{ reachable: number }>("POST", "/admin/notification-campaigns/audience-preview", { json: { audience, channels, purpose } });
  if (preview.body.reachable < 1) throw new Error(`The campaign would reach nobody: account ${options.to.id} is not eligible on ${channels.join(", ")}.`);

  const link = campaignLink(options.link);
  const created = await adminCall<{ id: number }>("POST", "/admin/notification-campaigns", {
    json: {
      name: `e2e ${new Date().toISOString()}`,
      purpose,
      channels,
      audience,
      // One title and one body (decision 039; the campaign content was `{ en, ar? }` before).
      content: { title: options.title, body: options.body },
      ...(link ? { link } : {}),
    },
  });
  await adminCall("POST", `/admin/notification-campaigns/${created.body.id}/send`, { json: { confirmRecipients: preview.body.reachable } });
  return { id: created.body.id };
}
