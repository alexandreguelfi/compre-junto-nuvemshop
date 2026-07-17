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
import { createShortLivedCache } from "../src/lib/storefront/short-lived-cache.ts";
import { resolvePublicTelemetryCors } from "../src/lib/storefront/public-telemetry-cors.ts";
import {
  OPTIONS as storefrontEventsOptions,
  POST as storefrontEventsPost,
} from "../app/api/public/storefront-events/route.ts";

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

test("short product cache isolates keys, deduplicates concurrency and expires conservatively", async () => {
  let now = 1_000;
  let loads = 0;
  let release;
  const cache = createShortLivedCache({ maxEntries: 10, now: () => now, ttlMs: 60_000 });
  const loader = () => {
    loads += 1;
    return new Promise((resolve) => { release = resolve; });
  };

  const first = cache.get("store-a:product-1", loader);
  const concurrent = cache.get("store-a:product-1", loader);
  assert.equal(loads, 1);
  release({ id: "1" });
  assert.deepEqual(await first, { status: "miss", value: { id: "1" } });
  assert.deepEqual(await concurrent, { status: "deduplicated", value: { id: "1" } });
  assert.equal((await cache.get("store-a:product-1", loader)).status, "hit");

  const otherStore = cache.get("store-b:product-1", async () => ({ id: "other-store" }));
  assert.equal((await otherStore).status, "miss");
  now += 60_001;
  const expired = await cache.get("store-a:product-1", async () => ({ id: "fresh" }));
  assert.deepEqual(expired, { status: "miss", value: { id: "fresh" } });

  let failureLoads = 0;
  const failureLoader = async () => ({ failed: (++failureLoads, true) });
  const failureTtl = (value) => value.failed ? 10_000 : 60_000;
  assert.equal((await cache.get("store-a:failure", failureLoader, failureTtl)).status, "miss");
  now += 9_999;
  assert.equal((await cache.get("store-a:failure", failureLoader, failureTtl)).status, "hit");
  now += 2;
  assert.equal((await cache.get("store-a:failure", failureLoader, failureTtl)).status, "miss");
  assert.equal(failureLoads, 2);
});

test("public offer route caches store/product summaries and skips the NubeSDK principal lookup", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/public/offers/route.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /PRODUCT_SUMMARY_CACHE_TTL_MS = 60_000/);
  assert.match(source, /PRODUCT_SUMMARY_FAILURE_TTL_MS = 10_000/);
  assert.match(source, /value\.failed \? PRODUCT_SUMMARY_FAILURE_TTL_MS : PRODUCT_SUMMARY_CACHE_TTL_MS/);
  assert.match(source, /cacheKey = `\$\{args\.providerStoreId\}:\$\{args\.productId\}`/);
  assert.match(source, /diagnostic\.technology === "nubesdk"[\s\S]*Promise\.resolve\(null\)/);
  assert.doesNotMatch(source, /fetch\(`\$\{baseUrl\}\/store`/);
});

test("script association prefers NubeSDK and keeps legacy only as an unconfigured fallback", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/admin/scripts/register/route.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /legacyScriptId && !nubesdkScriptId/);
  assert.match(source, /suppressed_nubesdk_configured/);
  assert.doesNotMatch(source, /method:\s*"DELETE"/);
});

test("storefront event route enforces JSON, 1 KiB bodies and bounded deduplication", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/public/storefront-events/route.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /MAX_BODY_BYTES = 1024/);
  assert.match(source, /MAX_DEDUPE_ENTRIES = 500/);
  assert.match(source, /content-type/);
  assert.match(source, /status: 415/);
  assert.match(source, /resolvePublicTelemetryCors\(request\)/);
});

test("public telemetry CORS accepts secure storefronts, rejects invalid origins and never combines credentials with wildcard", () => {
  const storeOrigin = "https://lojadetestedeaplicativos.lojavirtualnuvem.com.br";
  const allowed = resolvePublicTelemetryCors(new Request("https://app.example/api", { headers: { Origin: storeOrigin } }));
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], storeOrigin);
  assert.equal(allowed.headers.Vary, "Origin");
  assert.equal(allowed.headers["Access-Control-Allow-Credentials"], "true");
  assert.notEqual(allowed.headers["Access-Control-Allow-Origin"], "*");

  const invalid = resolvePublicTelemetryCors(new Request("https://app.example/api", { headers: { Origin: "null" } }));
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.headers["Access-Control-Allow-Origin"], undefined);

  const preflight = resolvePublicTelemetryCors(new Request("https://app.example/api", {
    method: "OPTIONS",
    headers: { Origin: storeOrigin, "Access-Control-Request-Method": "POST" },
  }));
  assert.equal(preflight.allowed, true);
  assert.equal(preflight.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assert.equal(preflight.headers["Access-Control-Allow-Headers"], "Content-Type");
});

test("storefront telemetry handles preflight and POST from the published store origin", async () => {
  const storeOrigin = "https://lojadetestedeaplicativos.lojavirtualnuvem.com.br";
  const optionsResponse = await storefrontEventsOptions(new Request("https://app.example/api/public/storefront-events", {
    method: "OPTIONS",
    headers: { Origin: storeOrigin, "Access-Control-Request-Method": "POST" },
  }));
  assert.equal(optionsResponse.status, 204);
  assert.equal(optionsResponse.headers.get("access-control-allow-origin"), storeOrigin);
  assert.equal(optionsResponse.headers.get("access-control-allow-credentials"), "true");
  assert.equal(optionsResponse.headers.get("vary"), "Origin");

  const postResponse = await storefrontEventsPost(new Request("https://app.example/api/public/storefront-events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: storeOrigin },
    body: JSON.stringify({ code: "offer_request_deduplicated", productId: "352812666", storeId: "7895581", technology: "legacy" }),
  }));
  assert.equal(postResponse.status, 200);
  assert.equal(postResponse.headers.get("access-control-allow-origin"), storeOrigin);
  assert.deepEqual(await postResponse.json(), { ok: true });

  const rejectedResponse = await storefrontEventsPost(new Request("https://app.example/api/public/storefront-events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "null" },
    body: "{}",
  }));
  assert.equal(rejectedResponse.status, 403);
  assert.equal(rejectedResponse.headers.get("access-control-allow-origin"), null);
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
