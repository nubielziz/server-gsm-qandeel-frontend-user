// Shared e2e helpers. Sign-in goes through the site's own origin (the /client and /store/v1 rewrites), so the
// session cookies land in the browser context exactly as after a real sign-in.
import { expect, type Page } from "@playwright/test";

/** Demo accounts on the isolated backend (scripts/dev-backend.sh; see PROGRESS.md). */
export const ACCOUNTS = {
  customer: { email: "daniel.whitmore@mail.example", password: "demo-password" },
  merchant: { email: "ops@zainmobilehub.example", password: "Storefront-Test-4821" },
  pendingMerchant: { email: "ops@algiersservice.example", password: "Storefront-Test-4821" },
} as const;

/** The token the backend's dev Turnstile verifier accepts (handoff §3.10). */
export const DEV_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Same base URL as playwright.config.ts. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function origin(_page: Page): string {
  return new URL(BASE_URL).origin;
}

/** Signs a merchant in (POST /client/auth/login with the site's Origin, as the browser would). */
export async function signInMerchant(page: Page, account: { email: string; password: string } = ACCOUNTS.merchant) {
  const res = await page.request.post("/client/auth/login", {
    headers: { Origin: origin(page), "Content-Type": "application/json" },
    data: account,
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe("done");
}

/** Signs a customer in (POST /store/v1/auth/login with the dev Turnstile token). */
export async function signInCustomer(page: Page, account: { email: string; password: string } = ACCOUNTS.customer) {
  const res = await page.request.post("/store/v1/auth/login", {
    headers: { "X-Turnstile-Token": DEV_TURNSTILE_TOKEN, "Content-Type": "application/json" },
    data: account,
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).next).toBe("done");
}

/** Latest Mailpit message to an address (the isolated backend sends all mail to Mailpit). */
export async function latestMailTo(page: Page, address: string): Promise<{ subject: string; text: string } | null> {
  const list = await page.request.get(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=1`);
  const body = (await list.json()) as { messages?: { ID: string; Subject: string }[] };
  const first = body.messages?.[0];
  if (!first) return null;
  const message = (await (await page.request.get(`http://localhost:8025/api/v1/message/${first.ID}`)).json()) as {
    Text?: string;
    HTML?: string;
  };
  return { subject: first.Subject, text: `${message.Text ?? ""}\n${message.HTML ?? ""}` };
}
