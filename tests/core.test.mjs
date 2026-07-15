import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessCommercialFeatures,
  normalizeTimeBoundBillingStatus,
  readBoundedTrialDays,
  repairTrialDates,
} from "../src/lib/billing/commercial-policy.ts";
import {
  hasAnotherScriptsPage,
  planScriptRegistrations,
  readOfficialScriptId,
  readRegisteredScriptIds,
} from "../src/lib/nuvemshop/script-registration.ts";
import {
  isSafeNuvemshopId,
  isStorefrontResultCode,
  parseStorefrontEventPayload,
} from "../src/lib/storefront/diagnostics.ts";
import {
  createSignedAdminStoreSession,
  readSignedAdminStoreSession,
} from "../src/lib/stores/admin-session-signing.ts";
import { classifyMatchingOffers } from "../src/lib/storefront/offer-policy.ts";
import { resolveStoreCandidate } from "../src/lib/storefront/store-resolution.ts";

test("read_products is sufficient because storefront policy contains no product mutation", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/lib/nuvemshop/products.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /\/products/);
  assert.match(source, /fetch\(productsUrl/);
  assert.doesNotMatch(source, /write_products|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});

test("offer from store A is never selected for requested store B", () => {
  const storeA = { providerStoreId: "100", tenant: "A" };
  assert.deepEqual(resolveStoreCandidate([storeA], "200"), {
    reason: "store_not_connected",
    store: null,
  });
});

test("storeId is required when store resolution is ambiguous", () => {
  const result = resolveStoreCandidate([{ providerStoreId: "100" }, { providerStoreId: "200" }], null);
  assert.equal(result.reason, "store_ambiguous");
  assert.equal(result.store, null);
});

test("a unique store can be resolved safely without a supplied storeId", () => {
  const store = { providerStoreId: "100" };
  assert.equal(resolveStoreCandidate([store], null).store, store);
});

test("inactive offer is not displayable", () => {
  assert.equal(classifyMatchingOffers([{ isActive: false }], 0).code, "offer_inactive");
});

test("a product not associated with active offers is classified as mismatch", () => {
  assert.equal(classifyMatchingOffers([], 2).code, "trigger_product_mismatch");
});

test("valid trial grants access while commercial enforcement is enabled", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const status = normalizeTimeBoundBillingStatus("TRIAL", new Date("2026-07-16T12:00:00Z"), now);
  assert.equal(status, "TRIAL");
  assert.equal(canAccessCommercialFeatures(status, true), true);
});

test("expired trial denies access while commercial enforcement is enabled", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const status = normalizeTimeBoundBillingStatus("TRIAL", new Date("2026-07-14T12:00:00Z"), now);
  assert.equal(status, "PAST_DUE");
  assert.equal(canAccessCommercialFeatures(status, true), false);
});

test("two script registrations are planned independently and idempotently", () => {
  const configs = [
    { kind: "legacy", queryParams: {}, scriptId: "11" },
    { kind: "nubesdk", queryParams: {}, scriptId: "22" },
  ];
  const firstPlan = planScriptRegistrations(configs, []);
  const secondPlan = planScriptRegistrations(configs, ["11", "22"]);
  assert.deepEqual(firstPlan.map((item) => item.action), ["register", "register"]);
  assert.deepEqual(secondPlan.map((item) => item.action), ["already_registered", "already_registered"]);
});

test("Scripts API list response keeps legacy and NubeSDK identifiers separate", () => {
  assert.deepEqual(readRegisteredScriptIds({ result: [{ id: 11 }, { id: "22" }] }), ["11", "22"]);
});

test("diagnostic contract accepts only sanitized codes and numeric public IDs", () => {
  assert.equal(isStorefrontResultCode("widget_rendered"), true);
  assert.equal(isStorefrontResultCode("token=secret"), false);
  assert.equal(isSafeNuvemshopId("7901767"), true);
  assert.equal(isSafeNuvemshopId("../other-tenant"), false);
});

test("admin store session rejects tampering and expiration", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");
  const session = createSignedAdminStoreSession("7901767", "test-secret", now);
  assert.equal(readSignedAdminStoreSession(session, "test-secret", 60, now + 59_000), "7901767");
  assert.equal(readSignedAdminStoreSession(`${session.slice(0, -1)}x`, "test-secret", 60, now), null);
  assert.equal(readSignedAdminStoreSession(session, "test-secret", 60, now + 60_001), null);
});

test("trial repair uses installation evidence and never restarts from OAuth time", () => {
  const installedAt = new Date("2025-01-01T00:00:00Z");
  const repaired = repairTrialDates(
    { createdAt: new Date("2024-12-01T00:00:00Z"), installedAt, trialEndsAt: null, trialStartedAt: null },
    7,
  );
  assert.equal(repaired.trialStartedAt.toISOString(), installedAt.toISOString());
  assert.equal(repaired.trialEndsAt.toISOString(), "2025-01-08T00:00:00.000Z");
  assert.equal(readBoundedTrialDays("0", 7), 7);
  assert.equal(readBoundedTrialDays("999", 7), 7);
  assert.equal(readBoundedTrialDays("14", 7), 14);
});

test("storefront event parser rejects arbitrary, invalid and oversized identifiers", () => {
  const valid = { code: "widget_rendered", productId: "123", storeId: "456", technology: "legacy" };
  assert.deepEqual(parseStorefrontEventPayload(valid), valid);
  assert.equal(parseStorefrontEventPayload({ ...valid, code: "token=secret" }), null);
  assert.equal(parseStorefrontEventPayload({ ...valid, productId: "1".repeat(31) }), null);
  assert.equal(parseStorefrontEventPayload([valid]), null);
});

test("storefront event route enforces JSON, 1 KiB bodies and bounded deduplication", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/public/storefront-events/route.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /MAX_BODY_BYTES = 1024/);
  assert.match(source, /MAX_DEDUPE_ENTRIES = 500/);
  assert.match(source, /content-type/);
  assert.match(source, /status: 415/);
});

test("script IDs are environment-shaped and pagination remains bounded and explicit", () => {
  assert.equal(readOfficialScriptId("00022"), "22");
  assert.equal(readOfficialScriptId("22-anything"), null);
  assert.equal(readOfficialScriptId(String(Number.MAX_SAFE_INTEGER + 1)), null);
  assert.equal(hasAnotherScriptsPage({ result: Array(30).fill({ id: 1 }) }, 1, 30), true);
  assert.equal(hasAnotherScriptsPage({ result: [{ id: 1 }] }, 1, 30), false);
  assert.equal(hasAnotherScriptsPage({ result: [], total: 61 }, 2, 30), true);
});

test("offer update is scoped by session store and revalidates catalog products", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/admin/ofertas/[id]/route.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /where:\s*\{\s*id:\s*currentOffer\.id,\s*storeId:\s*store\.id/);
  assert.match(source, /getConnectedStoreProductsByIds\(store\.id/);
});
