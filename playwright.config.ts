// End-to-end tests: real browser → Next (dev on :5175 by default) → the isolated demo backend (:3100).
// Start the backend first: `scripts/dev-backend.sh start`. The dev server is reused when already running.
// Production-build run: `E2E_BASE_URL=http://localhost:5176 npm run e2e` against `npm run build && npm start`.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5175";

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
