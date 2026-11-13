// Playwright global setup: makes the isolated demo database hold what the specs expect, then writes
// e2e/.auth/fixtures.json for them (read through `fixtures()` in e2e/helpers.ts).
//
// Idempotent and one-way: every step first reads what is there and changes only what is missing; nothing is switched
// off. `scripts/dev-backend.sh reset` undoes all of it and the next run recreates it. Skipped with E2E_SKIP_SETUP=1
// (playwright.config.ts then does not register this file); the fixtures file of the last run stays valid. Stock goes down
// while E2E_SKIP_SETUP=1 is used (specs sell codes); a run without it tops it up again.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import {
  AUTH_DIR,
  FIXTURES_FILE,
  ensureCurrency,
  ensureCustomerWallet,
  ensureListingImage,
  ensureQuantityRule,
  ensureStock,
  serviceIdByCode,
  staff,
  storeService,
  type E2eFixtures,
} from "./admin";

/** The services the fixtures name (store slugs, English). No existing spec uses the three quantity services. */
const SLUGS = {
  range: "vodafone-uk-iphone-unlock",
  packs: "ee-uk-unlock",
  exact: "orange-france-unlock",
  stocked: "blacklist-status-gsma",
  pictured: "samsung-kg-lock-fix",
} as const;

/**
 * The instant server service the merchant spec orders ("custom field ... instant order") and the shape of its codes: that spec
 * expects the sold code to read `Z3X-<digits>`.
 */
const MERCHANT_STOCK = { serviceCode: "SRV-Z3X-10", codePrefix: "Z3X" } as const;

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_SKIP_SETUP === "1") return;

  // 1. The staff session (cached in e2e/.auth/staff.json for every spec).
  await staff();

  // 2. Customer wallet on, and the manual top-up gateway.
  const { gatewayId } = await ensureCustomerWallet();

  // 3. Quantity rules.
  const range = await ensureQuantityRule(SLUGS.range, { min: 2, max: 50 });
  const packs = await ensureQuantityRule(SLUGS.packs, { options: [5, 10, 25] });
  const exact = await ensureQuantityRule(SLUGS.exact, { min: 5, max: 5 });

  // 4. Stock: the "In stock" fixture, and the instant order of e2e/merchant.spec.ts.
  const stocked = await storeService(SLUGS.stocked);
  await ensureStock(stocked.id, 20);
  await ensureStock(await serviceIdByCode(MERCHANT_STOCK.serviceCode), 30, MERCHANT_STOCK.codePrefix);

  // 5. Currency JOD with two display decimals.
  await ensureCurrency("JOD", 2);

  // 6. A service picture.
  await ensureListingImage(SLUGS.pictured, "en", "service-imei.jpg");

  // 7. Post-conditions the specs rely on: fail here, with a clear message, rather than in the first spec.
  const after = await storeService(SLUGS.stocked);
  if (after.availability !== "in_stock") throw new Error(`E2E setup: ${SLUGS.stocked} should read in_stock after the import, it reads ${after.availability}.`);
  const pictured = await storeService(SLUGS.pictured);
  if (!pictured.imageUrl) throw new Error(`E2E setup: ${SLUGS.pictured} has no imageUrl after the upload.`);

  const fixtures: E2eFixtures = {
    gatewayId,
    range,
    packs,
    exact,
    stocked: { id: stocked.id, slug: SLUGS.stocked },
    pictured: { id: pictured.id, slug: SLUGS.pictured },
  };
  mkdirSync(AUTH_DIR, { recursive: true });
  const temporary = `${FIXTURES_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(fixtures, null, 2)}\n`);
  renameSync(temporary, FIXTURES_FILE);
}
