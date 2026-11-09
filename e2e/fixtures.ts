// Every test gets its own client IP: the browser context and its API requests send `X-Forwarded-For`, which the site
// passes to the API (rewrites and server reads), and the isolated backend trusts it (TRUST_PROXY=loopback in
// scripts/dev-backend.sh). Without this, all tests share one IP and the API's per-IP limits (30/min on token routes,
// 5 sign-ups per 15 min) fail later tests. Import `test` and `expect` from here instead of @playwright/test.
import { test as base, expect } from "@playwright/test";

/** A stable private IP per test (10.x.y.z from a hash of its id and the retry). */
function ipFor(testId: string, retry: number): string {
  let h = 2166136261;
  for (const ch of `${testId}#${retry}#${process.env.E2E_RUN ?? ""}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${(h & 254) + 1}`;
}

export const test = base.extend({
  // (The fixture callback is named `provide`, not `use`, so the React hooks lint rule does not mistake it for React.use.)
  context: async ({ context }, provide, testInfo) => {
    await context.setExtraHTTPHeaders({ "X-Forwarded-For": ipFor(testInfo.testId, testInfo.retry) });
    await provide(context);
  },
  request: async ({ playwright, baseURL }, provide, testInfo) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "X-Forwarded-For": ipFor(`${testInfo.testId}:request`, testInfo.retry) },
    });
    await provide(request);
    await request.dispose();
  },
});

export { expect };
