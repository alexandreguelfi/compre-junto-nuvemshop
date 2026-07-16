import assert from "node:assert/strict";
import test from "node:test";

import {
  handleNuvemshopCallback,
  upsertNuvemshopInstallation,
} from "../src/lib/nuvemshop/callback-flow.ts";
import {
  createSignedInstallState,
  validateSignedInstallState,
} from "../src/lib/nuvemshop/install-state.ts";
import {
  buildTokenExchangeRequest,
  NUVEMSHOP_TOKEN_URL,
} from "../src/lib/nuvemshop/token-request.ts";
import {
  createSignedAdminStoreSession,
  readSignedAdminStoreSession,
} from "../src/lib/stores/admin-session-signing.ts";

const APP_URL = "https://app.example.test";
const CALLBACK_URL = `${APP_URL}/api/nuvemshop/callback`;
const SESSION_SECRET = "test-session-secret";

function createHarness(overrides = {}) {
  const calls = {
    encrypt: [],
    exchange: [],
    logs: [],
    save: [],
    sessions: [],
    validate: [],
  };

  const dependencies = {
    createSuccessResponse(providerStoreId) {
      calls.sessions.push(providerStoreId);
      const session = createSignedAdminStoreSession(providerStoreId, SESSION_SECRET, 1_000);

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${APP_URL}/admin`,
          "Set-Cookie": `compre_junto_store=${session}; HttpOnly; Path=/; SameSite=Lax`,
        },
      });
    },
    encryptAccessToken(accessToken) {
      calls.encrypt.push(accessToken);
      return `encrypted:${accessToken}`;
    },
    async exchangeCode(code) {
      calls.exchange.push(code);
      return {
        accessToken: "provider-access-token",
        scopes: ["read_products", "write_scripts"],
        storeId: "7901767",
      };
    },
    getSafeErrorDetails() {
      return { reason: "safe-test-error" };
    },
    logFailure(stage, details = {}) {
      calls.logs.push({ details, stage });
    },
    async saveInstallation(installation) {
      calls.save.push(installation);
    },
    validateState(state) {
      calls.validate.push(state);
      return state === "valid-state";
    },
    ...overrides,
  };

  return { calls, dependencies };
}

function callbackInput(overrides = {}) {
  return {
    code: "authorization-code",
    error: null,
    errorDescriptionPresent: false,
    state: null,
    ...overrides,
  };
}

function readSessionFromResponse(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const session = /compre_junto_store=([^;]+)/.exec(setCookie)?.[1];

  return readSignedAdminStoreSession(session, SESSION_SECRET, 60, 1_000);
}

test("callback with a valid code and no state exchanges once, saves, creates the store session and redirects", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(callbackInput(), dependencies);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${APP_URL}/admin`);
  assert.equal(readSessionFromResponse(response), "7901767");
  assert.deepEqual(calls.exchange, ["authorization-code"]);
  assert.equal(calls.save.length, 1);
  assert.deepEqual(calls.save[0], {
    accessTokenCiphertext: "encrypted:provider-access-token",
    scopes: ["read_products", "write_scripts"],
    storeId: "7901767",
  });
  assert.deepEqual(calls.sessions, ["7901767"]);
  assert.deepEqual(calls.validate, []);
});

test("callback with code and valid state keeps the internally initiated installation protected", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(callbackInput({ state: "valid-state" }), dependencies);

  assert.equal(response.status, 302);
  assert.deepEqual(calls.validate, ["valid-state"]);
  assert.equal(calls.exchange.length, 1);
  assert.equal(readSessionFromResponse(response), "7901767");
});

test("a present invalid state returns 400 before token exchange, database or session creation", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(callbackInput({ state: "invalid-state" }), dependencies);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid Nuvemshop installation state." });
  assert.deepEqual(calls.validate, ["invalid-state"]);
  assert.equal(calls.exchange.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test("an explicitly empty state is present and invalid, not treated as a direct callback", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(callbackInput({ state: "" }), dependencies);

  assert.equal(response.status, 400);
  assert.deepEqual(calls.validate, [""]);
  assert.equal(calls.exchange.length, 0);
});

test("callback without code returns 400 without side effects", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(callbackInput({ code: null }), dependencies);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Missing Nuvemshop authorization code." });
  assert.equal(calls.exchange.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test("provider error is handled before code exchange and exposes neither provider parameters nor state", async () => {
  const { calls, dependencies } = createHarness();
  const response = await handleNuvemshopCallback(
    callbackInput({
      code: "must-not-be-used",
      error: "access_denied&code=sensitive-code",
      errorDescriptionPresent: true,
      state: "complete-sensitive-state",
    }),
    dependencies,
  );
  const responseBody = await response.text();
  const serializedLogs = JSON.stringify(calls.logs);

  assert.equal(response.status, 400);
  assert.match(responseBody, /authorization was not completed/);
  assert.doesNotMatch(responseBody, /sensitive|access_denied|state/i);
  assert.doesNotMatch(serializedLogs, /sensitive-code|complete-sensitive-state/);
  assert.deepEqual(calls.logs, [
    {
      details: {
        errorDescription: "present",
        providerError: "unknown_provider_error",
        state: "present",
      },
      stage: "provider_error",
    },
  ]);
  assert.equal(calls.exchange.length, 0);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test("token exchange failure does not create or update a store and does not create a session", async () => {
  const { calls, dependencies } = createHarness({
    async exchangeCode(code) {
      calls.exchange.push(code);
      throw new Error("response contained a secret that must not be logged");
    },
  });
  const response = await handleNuvemshopCallback(callbackInput(), dependencies);

  assert.equal(response.status, 502);
  assert.equal(calls.exchange.length, 1);
  assert.equal(calls.save.length, 0);
  assert.equal(calls.sessions.length, 0);
  assert.doesNotMatch(JSON.stringify(calls.logs), /secret that must not be logged/);
});

test("database failure creates no session and never reports installation completion", async () => {
  const { calls, dependencies } = createHarness({
    async saveInstallation(installation) {
      calls.save.push(installation);
      throw new Error("database connection included sensitive metadata");
    },
  });
  const response = await handleNuvemshopCallback(callbackInput(), dependencies);
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.match(body, /Unable to save/);
  assert.doesNotMatch(body, /completed|sensitive/i);
  assert.equal(calls.save.length, 1);
  assert.equal(calls.sessions.length, 0);
  assert.doesNotMatch(JSON.stringify(calls.logs), /sensitive metadata/);
});

test("reinstallation reuses the store, refreshes OAuth data and preserves commercial dates", async () => {
  const trialStartedAt = new Date("2026-01-01T00:00:00.000Z");
  const trialEndsAt = new Date("2026-01-08T00:00:00.000Z");
  const records = new Map([
    [
      "7901767",
      {
        accessTokenCiphertext: "encrypted:old-token",
        commercialStatus: "EXPIRED",
        createdAt: new Date("2025-12-31T00:00:00.000Z"),
        disconnectedAt: new Date("2026-07-15T00:00:00.000Z"),
        id: "database-store-id",
        installedAt: new Date("2026-01-01T00:00:00.000Z"),
        nuvemshopStoreId: "7901767",
        scopes: ["read_products"],
        status: "DISCONNECTED",
        trialEndsAt,
        trialStartedAt,
        updatedAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    ],
  ]);
  let repairUpdates = 0;
  const repository = {
    async update({ where, data }) {
      repairUpdates += 1;
      const entry = [...records.values()].find((record) => record.id === where.id);
      Object.assign(entry, data);
      return entry;
    },
    async upsert(args) {
      const existing = records.get(args.where.nuvemshopStoreId);
      const updatedAt = new Date("2026-07-16T00:00:00.000Z");

      if (existing) {
        Object.assign(existing, args.update, { updatedAt });
        return existing;
      }

      const created = {
        ...args.create,
        createdAt: updatedAt,
        id: "new-database-store-id",
        installedAt: updatedAt,
        updatedAt,
      };
      records.set(args.where.nuvemshopStoreId, created);
      return created;
    },
  };

  const saved = await upsertNuvemshopInstallation(
    repository,
    {
      accessTokenCiphertext: "encrypted:new-token",
      scopes: ["read_products", "write_scripts"],
      storeId: "7901767",
    },
    7,
    new Date("2026-07-16T12:00:00.000Z"),
  );
  const stored = records.get("7901767");

  assert.equal(records.size, 1);
  assert.equal(saved.id, "database-store-id");
  assert.equal(stored.id, "database-store-id");
  assert.equal(stored.accessTokenCiphertext, "encrypted:new-token");
  assert.deepEqual(stored.scopes, ["read_products", "write_scripts"]);
  assert.equal(stored.status, "CONNECTED");
  assert.equal(stored.disconnectedAt, null);
  assert.equal(stored.commercialStatus, "EXPIRED");
  assert.equal(stored.trialStartedAt, trialStartedAt);
  assert.equal(stored.trialEndsAt, trialEndsAt);
  assert.equal(repairUpdates, 0);
});

test("legacy missing trial dates are repaired from installation evidence, never from reinstallation time", async () => {
  const installedAt = new Date("2025-01-01T00:00:00.000Z");
  const store = {
    commercialStatus: "TRIALING",
    createdAt: new Date("2024-12-01T00:00:00.000Z"),
    id: "legacy-store-id",
    installedAt,
    nuvemshopStoreId: "7901767",
    trialEndsAt: null,
    trialStartedAt: null,
    updatedAt: new Date("2026-07-15T00:00:00.000Z"),
  };
  const repository = {
    async update({ data }) {
      Object.assign(store, data);
      return store;
    },
    async upsert() {
      return store;
    },
  };

  await upsertNuvemshopInstallation(
    repository,
    { accessTokenCiphertext: "encrypted:new", scopes: [], storeId: "7901767" },
    7,
    new Date("2026-07-16T12:00:00.000Z"),
  );

  assert.equal(store.trialStartedAt.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(store.trialEndsAt.toISOString(), "2025-01-08T00:00:00.000Z");
});

test("signed install state validates signature, age and redirect URI", () => {
  const issuedAt = Date.parse("2026-07-16T12:00:00.000Z");
  const options = { now: issuedAt, redirectUri: CALLBACK_URL, secret: "state-secret" };
  const state = createSignedInstallState(options);

  assert.equal(validateSignedInstallState(state, options), true);
  assert.equal(validateSignedInstallState(`${state}.extra`, options), false);
  assert.equal(validateSignedInstallState(`${state.slice(0, -1)}x`, options), false);
  assert.equal(validateSignedInstallState(state, { ...options, now: issuedAt - 1 }), false);
  assert.equal(validateSignedInstallState(state, { ...options, now: issuedAt + 10 * 60 * 1000 + 1 }), false);
  assert.equal(validateSignedInstallState(state, { ...options, redirectUri: `${APP_URL}/other-callback` }), false);
});

test("token exchange keeps the official endpoint and required JSON contract", () => {
  const request = buildTokenExchangeRequest("authorization-code", {
    clientId: "client-id",
    clientSecret: "client-secret",
  });

  assert.equal(NUVEMSHOP_TOKEN_URL, "https://www.tiendanube.com/apps/authorize/token");
  assert.equal(request.method, "POST");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), {
    client_id: "client-id",
    client_secret: "client-secret",
    grant_type: "authorization_code",
    code: "authorization-code",
  });
});
