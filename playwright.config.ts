// End-to-end tests: real browser → Next (dev on :5175 by default) → the isolated demo backend (:3100).
// Start the backend first: `scripts/dev-backend.sh start`. The dev server is reused when already running.
// Production-build run: `E2E_BASE_URL=http://localhost:5176 npm run e2e` against `npm run build && npm start`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

/** The only API the suite may run against: its mail goes to Mailpit, where the tests read it. */
const ISOLATED_API = /^http:\/\/(localhost|127\.0\.0\.1):3100\/?$/;

/** The API origin the site under test calls, read as Next reads it: the process env, then the env files by precedence. */
function apiOrigin(mode: "development" | "production"): string | undefined {
  if (process.env.GSM_API_ORIGIN) return process.env.GSM_API_ORIGIN;
  for (const file of [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"]) {
    try {
      const match = /^\s*GSM_API_ORIGIN\s*=\s*["']?([^"'\s#]+)/m.exec(readFileSync(join(__dirname, file), "utf8"));
      if (match) return match[1];
    } catch {
      // the file does not exist
    }
  }
  return undefined;
}

// The owner's API (:3000) delivers real mail through Resend since 2026-11-13. The tests sign up and send links to made-up
// addresses: against that API every run would send mail that bounces and harms the sending domain's reputation.
const origin = apiOrigin(process.env.E2E_BASE_URL ? "production" : "development");
if (!origin || !ISOLATED_API.test(origin)) {
  throw new Error(
    `E2E runs only against the isolated demo API (http://localhost:3100); the site under test uses ${origin ?? "no GSM_API_ORIGIN"}. ` +
      "Set GSM_API_ORIGIN=http://localhost:3100 in .env.development.local and restart `npm run dev`, or test the production build " +
      "(`E2E_BASE_URL=http://localhost:5176`, which reads .env.production.local).",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${baseURL}/favicon.ico`, reuseExistingServer: true, timeout: 120_000 },
});
