// Phase 9E Stage 9E-4C-1: focused tests for the protected dry-run
// reminder runner (api/reminders-dry-run.js).
//
// Uses only Node's built-in test runner (node:test) and assert module —
// zero added dependencies, matching the same convention already used by
// src/lib/__tests__/reminderEngine.test.js. Run with:
//
//   node --test api/__tests__/reminders-dry-run.test.js
//
// global.fetch is monkey-patched per test rather than hitting a real
// Supabase project — every mock routes strictly by URL substring and
// throws on any call this stage must never make (push_subscriptions,
// reminder_deliveries), so an accidental future call to either is a
// hard test failure rather than a silent pass.

import test from "node:test";
import assert from "node:assert/strict";

import handler from "../reminders-dry-run.js";

const REAL_USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

function setEnv() {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function jsonResponse(ok, data) {
  return { ok, json: async () => data };
}

// Routes every fetch call by URL substring. Any URL this stage must
// never touch (push_subscriptions, reminder_deliveries) throws instead
// of returning a mock response, so those calls fail the test loudly.
function makeFetchMock({ timezone = "Asia/Manila" } = {}) {
  const calls = [];

  async function mockFetch(url, options) {
    calls.push(String(url));

    if (url.includes("/auth/v1/user")) {
      const authHeader = options?.headers?.Authorization || "";
      if (authHeader === "Bearer good-token") {
        return jsonResponse(true, { id: REAL_USER_ID });
      }
      return jsonResponse(false, { error: "invalid token" });
    }

    if (url.includes("/rest/v1/profiles")) {
      return jsonResponse(true, [{ timezone }]);
    }

    if (url.includes("/rest/v1/semesters")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/activities")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/subjects")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/subject_schedules")) return jsonResponse(true, []);

    if (url.includes("push_subscriptions")) {
      throw new Error("Stage 9E-4C-1 must never query push_subscriptions: " + url);
    }
    if (url.includes("reminder_deliveries")) {
      throw new Error("Stage 9E-4C-1 must never touch reminder_deliveries: " + url);
    }

    throw new Error("Unexpected fetch call in dry-run test: " + url);
  }

  return { mockFetch, calls };
}

test("missing Authorization header is rejected with 401", async () => {
  setEnv();
  global.fetch = async () => {
    throw new Error("fetch should not be called without an Authorization header");
  };

  const req = { method: "POST", headers: {}, body: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("invalid/expired token is rejected with 401 and loads no data", async () => {
  setEnv();
  const { mockFetch, calls } = makeFetchMock();
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer bad-token" },
    body: {},
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  // Only the auth check ran — no academic data was ever queried for an
  // unverified caller.
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("/auth/v1/user"));
});

test("an arbitrary user_id in the request body is ignored; only the verified user's rows are queried", async () => {
  setEnv();
  const { mockFetch, calls } = makeFetchMock();
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: { user_id: OTHER_USER_ID },
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);

  const restCalls = calls.filter((url) => url.includes("/rest/v1/"));
  assert.ok(restCalls.length >= 5, "expected profiles/semesters/activities/subjects/subject_schedules to be queried");

  for (const url of restCalls) {
    assert.ok(url.includes(`eq.${REAL_USER_ID}`), `expected query scoped to verified user, got: ${url}`);
    assert.ok(!url.includes(OTHER_USER_ID), `request body user_id must never reach a query: ${url}`);
  }
});

test("valid verified user: response is a safe dry-run report with zero candidates for a fresh account", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock();
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: {},
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dryRun, true);
  assert.equal(res.body.timezonePresent, true);
  assert.equal(res.body.timezoneValid, true);
  assert.equal(res.body.totalCandidateCount, 0);
  assert.deepEqual(res.body.counts, {
    semesters: 0,
    activities: 0,
    subjects: 0,
    subjectSchedules: 0,
  });
});

test("NULL timezone yields zero candidates and timezoneValid: false, never a guessed zone", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({ timezone: null });
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: {},
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.timezonePresent, false);
  assert.equal(res.body.timezoneValid, false);
  assert.equal(res.body.totalCandidateCount, 0);
});

test("an invalid IANA timezone string yields zero candidates and timezoneValid: false", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({ timezone: "Not/AZone" });
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: {},
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  // A non-empty but invalid string is still "present" — the engine
  // itself, not this endpoint, is what must refuse to guess.
  assert.equal(res.body.timezonePresent, true);
  assert.equal(res.body.timezoneValid, false);
  assert.equal(res.body.totalCandidateCount, 0);
});

test("unsupported HTTP methods are rejected with 405", async () => {
  setEnv();
  global.fetch = async () => {
    throw new Error("fetch should not be called for a rejected method");
  };

  const req = { method: "GET", headers: {}, body: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
});

test("response never contains subscription, key, or secret material", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock();
  global.fetch = mockFetch;

  const req = {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: {},
  };
  const res = createRes();

  await handler(req, res);

  const serialized = JSON.stringify(res.body).toLowerCase();

  for (const forbidden of [
    "p256dh",
    "auth_key",
    "endpoint",
    "access_token",
    "service-role-key",
    "service_role",
    "vapid",
    "publishable-key",
  ]) {
    assert.ok(!serialized.includes(forbidden), `response leaked forbidden field/value: ${forbidden}`);
  }
});
