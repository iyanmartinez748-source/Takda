// Phase 9E Stage 9E-4C-2: focused tests for the reminder delivery
// runner foundation (api/reminders-delivery-runner.js).
//
// Uses only Node's built-in test runner (node:test) and assert module —
// zero added dependencies, matching the same convention already used by
// api/__tests__/reminders-dry-run.js. Run with:
//
//   node --test api/__tests__/reminders-delivery-runner.test.js
//
// This stage is READ/COMPUTE ONLY: no claim, no send, no write to
// reminder_deliveries. The mock fetch below throws on any write-shaped
// request (non-GET) and on any push_subscriptions column beyond
// user_id, so an accidental future write or subscription-secret read is
// a hard test failure rather than a silent pass.

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import webpush from "web-push";

import handler, {
  sendReminderToSubscriptions,
  claimReminderEvent,
  reclaimExpiredReminderEvent,
  finalizeReminderDeliverySuccess,
  finalizeReminderDeliveryFailure,
  processReminderCandidate,
  processAllEligibleUsers,
} from "../reminders-delivery-runner.js";

// Captured once at module load — before any test has had a chance to
// mutate either — and restored after EVERY test in this file via a
// single file-wide afterEach below. This covers both the pre-existing
// handler tests and the sendReminderToSubscriptions tests, so no test
// can leak a mocked global.fetch or webpush.sendNotification into a
// later one regardless of execution order.
const originalGlobalFetch = global.fetch;
const originalWebpushSendNotification = webpush.sendNotification;

afterEach(() => {
  global.fetch = originalGlobalFetch;
  webpush.sendNotification = originalWebpushSendNotification;
});

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

function setEnv() {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.CRON_SECRET = "good-cron-secret";
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

// Routes every fetch call by URL/method. Any write-shaped request
// (anything but GET) throws, as does any push_subscriptions query that
// asks for more than `select=user_id` — both would indicate this stage
// has started sending/claiming/exposing subscription secrets, which it
// must never do.
function makeFetchMock({
  subscriptionUserIds = [USER_A],
  timezoneByUser = {},
  existingDedupKeysByUser = {},
} = {}) {
  const calls = [];

  async function mockFetch(url, options) {
    const method = (options?.method || "GET").toUpperCase();
    calls.push({ url: String(url), method });

    if (method !== "GET") {
      throw new Error("Stage 9E-4C-2 must never issue a non-GET request: " + method + " " + url);
    }

    if (url.includes("/rest/v1/push_subscriptions")) {
      if (!url.includes("select=user_id") || url.includes("p256dh") || url.includes("auth_key") || url.includes("endpoint")) {
        throw new Error("Stage 9E-4C-2 must only ever select user_id from push_subscriptions: " + url);
      }
      return jsonResponse(
        true,
        subscriptionUserIds.map((id) => ({ user_id: id }))
      );
    }

    const userIdMatch = url.match(/user_id=eq\.([^&]+)/) || url.match(/\/profiles\?id=eq\.([^&]+)/);
    const userId = userIdMatch ? userIdMatch[1] : null;

    if (url.includes("/rest/v1/profiles")) {
      const timezone = Object.prototype.hasOwnProperty.call(timezoneByUser, userId)
        ? timezoneByUser[userId]
        : "Asia/Manila";
      return jsonResponse(true, [{ timezone }]);
    }

    if (url.includes("/rest/v1/semesters")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/activities")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/subjects")) return jsonResponse(true, []);
    if (url.includes("/rest/v1/subject_schedules")) return jsonResponse(true, []);

    if (url.includes("/rest/v1/reminder_deliveries")) {
      const existing = existingDedupKeysByUser[userId] || [];
      return jsonResponse(
        true,
        existing.map((key) => ({ dedup_key: key }))
      );
    }

    throw new Error("Unexpected fetch call in delivery-runner test: " + url);
  }

  return { mockFetch, calls };
}

test("missing Authorization header is rejected with 401 and issues no queries", async () => {
  setEnv();
  global.fetch = async () => {
    throw new Error("fetch should not be called without a valid CRON_SECRET");
  };

  const req = { method: "GET", headers: {} };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("an incorrect bearer secret is rejected with 401", async () => {
  setEnv();
  global.fetch = async () => {
    throw new Error("fetch should not be called with an invalid CRON_SECRET");
  };

  const req = { method: "GET", headers: { authorization: "Bearer wrong-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("unsupported HTTP methods are rejected with 405", async () => {
  setEnv();
  global.fetch = async () => {
    throw new Error("fetch should not be called for a rejected method");
  };

  const req = { method: "POST", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
});

test("a valid CRON_SECRET returns a dry-run report with liveSendEnabled: false and no writes", async () => {
  setEnv();
  const { mockFetch, calls } = makeFetchMock({ subscriptionUserIds: [USER_A] });
  global.fetch = mockFetch;

  const req = { method: "GET", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dryRun, true);
  assert.equal(res.body.liveSendEnabled, false);
  assert.equal(res.body.usersConsidered, 1);

  // Every single call made was a GET — proven by the mock itself never
  // throwing (it throws on any non-GET), plus an explicit re-check here.
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("processes multiple distinct users found via push_subscriptions, de-duplicating repeated user_id rows", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({
    // USER_A appears twice (e.g. two devices) — must still be processed once.
    subscriptionUserIds: [USER_A, USER_A, USER_B],
  });
  global.fetch = mockFetch;

  const req = { method: "GET", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.usersConsidered, 2);
  assert.equal(res.body.perUser.length, 2);

  const userIdsInReport = res.body.perUser.map((u) => u.userId).sort();
  assert.deepEqual(userIdsInReport, [USER_A, USER_B].sort());
});

test("a user with NULL timezone is reported as timezoneValid: false with zero candidates, never guessed", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({
    subscriptionUserIds: [USER_A],
    timezoneByUser: { [USER_A]: null },
  });
  global.fetch = mockFetch;

  const req = { method: "GET", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.usersSkippedInvalidTimezone, 1);
  assert.equal(res.body.perUser[0].timezoneValid, false);
  assert.equal(res.body.perUser[0].totalCandidateCount, 0);
});

test("response never contains subscription, key, or secret material", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({ subscriptionUserIds: [USER_A] });
  global.fetch = mockFetch;

  const req = { method: "GET", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  const serialized = JSON.stringify(res.body).toLowerCase();

  for (const forbidden of [
    "p256dh",
    "auth_key",
    "endpoint",
    "service-role-key",
    "service_role",
    "vapid",
    "good-cron-secret",
  ]) {
    assert.ok(!serialized.includes(forbidden), `response leaked forbidden field/value: ${forbidden}`);
  }
});

test("response never includes candidate academic content (titles/subject names/deadlines) in this multi-user report", async () => {
  setEnv();
  const { mockFetch } = makeFetchMock({ subscriptionUserIds: [USER_A] });
  global.fetch = mockFetch;

  const req = { method: "GET", headers: { authorization: "Bearer good-cron-secret" } };
  const res = createRes();

  await handler(req, res);

  assert.ok(!("candidates" in res.body));
  assert.ok(res.body.perUser.every((u) => !("candidates" in u) && !("title" in u)));
});

// ---------------------------------------------------------------------
// sendReminderToSubscriptions — Web Push fanout + stale-subscription
// cleanup helper (Stage 9E-4C-2 foundation). NOT called by the handler
// yet — these tests exercise the helper directly and in isolation.
// webpush.sendNotification is monkey-patched per test (the "web-push"
// module is a singleton under Node's ESM cache, so mutating the same
// imported object here affects the calls made inside the helper) and
// restored, along with global.fetch, by the file-wide afterEach above —
// no per-test try/finally is needed for that anymore.
// ---------------------------------------------------------------------

const SUPABASE_URL_FOR_HELPER = "https://example.supabase.co";
const REST_HEADERS_FOR_HELPER = { apikey: "service-role-key", Authorization: "Bearer service-role-key" };
const HELPER_PAYLOAD = JSON.stringify({ title: "Takda", body: "test" });

function makeSubscription(id, outcome) {
  // outcome: "ok" | 404 | 410 | "error" (a generic, non-stale failure)
  return { id, endpoint: `https://push.example/${id}`, p256dh: `p256dh-${id}`, auth_key: `auth-${id}`, __outcome: outcome };
}

function mockWebPushSendNotification(subscriptionsByEndpoint) {
  return async (subscription) => {
    const sub = subscriptionsByEndpoint.get(subscription.endpoint);
    const outcome = sub?.__outcome;

    if (outcome === "ok") return;

    if (outcome === 404 || outcome === 410) {
      const err = new Error("Gone");
      err.statusCode = outcome;
      throw err;
    }

    const err = new Error("Simulated upstream push failure");
    err.statusCode = 500;
    throw err;
  };
}

test("sendReminderToSubscriptions: zero subscriptions is an event-level failure with no network calls", async () => {
  global.fetch = async () => {
    throw new Error("fetch should not be called for zero subscriptions");
  };
  webpush.sendNotification = async () => {
    throw new Error("sendNotification should not be called for zero subscriptions");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, false);
  assert.equal(result.sentCount, 0);
  assert.equal(result.failedCount, 0);
  assert.equal(result.staleDetectedCount, 0);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "not_needed");
  assert.equal(result.errorCategory, "no_subscriptions");
});

test("sendReminderToSubscriptions: one successful subscription is an event-level success", async () => {
  const sub = makeSubscription("sub-1", "ok");
  webpush.sendNotification = mockWebPushSendNotification(new Map([[sub.endpoint, sub]]));
  global.fetch = async () => {
    throw new Error("fetch should not be called when nothing is stale");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [sub],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(result.staleDetectedCount, 0);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "not_needed");
  assert.equal(result.errorCategory, null);
});

test("sendReminderToSubscriptions: mixed success + non-stale failure is still an event-level success", async () => {
  const subOk = makeSubscription("sub-ok", "ok");
  const subFail = makeSubscription("sub-fail", "error");
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [subOk.endpoint, subOk],
      [subFail.endpoint, subFail],
    ])
  );
  global.fetch = async () => {
    throw new Error("fetch should not be called — the failure here is not stale (404/410)");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [subOk, subFail],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.staleDetectedCount, 0);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "not_needed");
  // A partial success is never treated as an error — no category is
  // reported once the event itself is considered sent.
  assert.equal(result.errorCategory, null);
});

test("sendReminderToSubscriptions: all non-stale sends fail is an event-level failure", async () => {
  const sub1 = makeSubscription("sub-1", "error");
  const sub2 = makeSubscription("sub-2", "error");
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [sub1.endpoint, sub1],
      [sub2.endpoint, sub2],
    ])
  );
  global.fetch = async () => {
    throw new Error("fetch should not be called — failures here are not stale (404/410)");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [sub1, sub2],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, false);
  assert.equal(result.sentCount, 0);
  assert.equal(result.failedCount, 2);
  assert.equal(result.staleDetectedCount, 0);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "not_needed");
  assert.equal(result.errorCategory, "push_send_failed");
});

test("sendReminderToSubscriptions: a lone 404 subscription is detected, successfully cleaned up, and categorized all-stale", async () => {
  const sub = makeSubscription("sub-404", 404);
  webpush.sendNotification = mockWebPushSendNotification(new Map([[sub.endpoint, sub]]));

  const deleteCalls = [];
  global.fetch = async (url, options) => {
    deleteCalls.push({ url: String(url), method: options?.method });
    return { ok: true, json: async () => [] };
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [sub],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, false);
  assert.equal(result.staleDetectedCount, 1);
  assert.equal(result.staleRemovedCount, 1);
  assert.equal(result.cleanupStatus, "removed");
  assert.equal(result.errorCategory, "all_subscriptions_stale");

  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].method, "DELETE");
  assert.ok(deleteCalls[0].url.includes("push_subscriptions"));
  assert.ok(deleteCalls[0].url.includes("sub-404"));
  assert.ok(deleteCalls[0].url.includes(`user_id=eq.${USER_A}`));
});

test("sendReminderToSubscriptions: a lone 410 subscription is detected, successfully cleaned up, and categorized all-stale", async () => {
  const sub = makeSubscription("sub-410", 410);
  webpush.sendNotification = mockWebPushSendNotification(new Map([[sub.endpoint, sub]]));

  const deleteCalls = [];
  global.fetch = async (url, options) => {
    deleteCalls.push({ url: String(url), method: options?.method });
    return { ok: true, json: async () => [] };
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [sub],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, false);
  assert.equal(result.staleDetectedCount, 1);
  assert.equal(result.staleRemovedCount, 1);
  assert.equal(result.cleanupStatus, "removed");
  assert.equal(result.errorCategory, "all_subscriptions_stale");

  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].method, "DELETE");
  assert.ok(deleteCalls[0].url.includes("sub-410"));
});

test("sendReminderToSubscriptions: successful cleanup of multiple stale subscriptions reports matching detected/removed counts", async () => {
  const subOk = makeSubscription("sub-ok", "ok");
  const subStale1 = makeSubscription("sub-stale-1", 404);
  const subStale2 = makeSubscription("sub-stale-2", 410);
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [subOk.endpoint, subOk],
      [subStale1.endpoint, subStale1],
      [subStale2.endpoint, subStale2],
    ])
  );

  const deleteCalls = [];
  global.fetch = async (url, options) => {
    deleteCalls.push({ url: String(url), method: options?.method });
    return { ok: true, json: async () => [] };
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [subOk, subStale1, subStale2],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.staleDetectedCount, 2);
  assert.equal(result.staleRemovedCount, 2);
  assert.equal(result.cleanupStatus, "removed");
  assert.equal(result.errorCategory, null);
  assert.equal(deleteCalls.length, 1);
});

test("sendReminderToSubscriptions: successful push + stale device + cleanup network throw => event still succeeds, staleRemovedCount 0", async () => {
  const subOk = makeSubscription("sub-ok", "ok");
  const subStale = makeSubscription("sub-stale", 404);
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [subOk.endpoint, subOk],
      [subStale.endpoint, subStale],
    ])
  );
  global.fetch = async () => {
    throw new Error("simulated network failure reaching Supabase");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [subOk, subStale],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  // The helper must resolve, not throw, despite the cleanup call failing.
  assert.equal(result.eventSendSucceeded, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.staleDetectedCount, 1);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "cleanup_failed");
  assert.equal(result.errorCategory, null);
});

test("sendReminderToSubscriptions: successful push + stale device + DELETE non-2xx => event still succeeds, staleRemovedCount 0", async () => {
  const subOk = makeSubscription("sub-ok", "ok");
  const subStale = makeSubscription("sub-stale", 410);
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [subOk.endpoint, subOk],
      [subStale.endpoint, subStale],
    ])
  );
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });

  const result = await sendReminderToSubscriptions({
    subscriptions: [subOk, subStale],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, true);
  assert.equal(result.sentCount, 1);
  assert.equal(result.staleDetectedCount, 1);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "cleanup_failed");
  assert.equal(result.errorCategory, null);
});

test("sendReminderToSubscriptions: all pushes stale + cleanup fails => event fails with all_subscriptions_stale, staleRemovedCount 0", async () => {
  const sub1 = makeSubscription("sub-1", 404);
  const sub2 = makeSubscription("sub-2", 410);
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [sub1.endpoint, sub1],
      [sub2.endpoint, sub2],
    ])
  );
  global.fetch = async () => {
    throw new Error("simulated network failure reaching Supabase");
  };

  const result = await sendReminderToSubscriptions({
    subscriptions: [sub1, sub2],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.eventSendSucceeded, false);
  assert.equal(result.errorCategory, "all_subscriptions_stale");
  assert.equal(result.staleDetectedCount, 2);
  assert.equal(result.staleRemovedCount, 0);
  assert.equal(result.cleanupStatus, "cleanup_failed");
});

test("sendReminderToSubscriptions: stale subscription ids are individually encodeURIComponent-encoded, and the user_id filter remains present", async () => {
  // A synthetic id containing a character encodeURIComponent transforms
  // (a space -> %20) and, more importantly, one that would corrupt the
  // PostgREST in.(...) list if left unencoded (a literal comma).
  const sub = makeSubscription("sub 404,extra", 404);
  webpush.sendNotification = mockWebPushSendNotification(new Map([[sub.endpoint, sub]]));

  const deleteCalls = [];
  global.fetch = async (url, options) => {
    deleteCalls.push({ url: String(url), method: options?.method });
    return { ok: true, json: async () => [] };
  };

  await sendReminderToSubscriptions({
    subscriptions: [sub],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(deleteCalls.length, 1);
  const calledUrl = deleteCalls[0].url;

  assert.ok(calledUrl.includes(encodeURIComponent("sub 404,extra")));
  // The raw, unencoded id (with its literal space/comma) must never
  // appear in the URL — only its encoded form.
  assert.ok(!calledUrl.includes("sub 404,extra"));
  assert.ok(calledUrl.includes(`user_id=eq.${USER_A}`));
});

test("sendReminderToSubscriptions: safe result contains no endpoint/p256dh/auth/bearer/raw subscription/raw upstream error material", async () => {
  const subOk = makeSubscription("sub-ok", "ok");
  const subStale = makeSubscription("sub-stale", 410);
  webpush.sendNotification = mockWebPushSendNotification(
    new Map([
      [subOk.endpoint, subOk],
      [subStale.endpoint, subStale],
    ])
  );
  global.fetch = async () => ({ ok: true, json: async () => [] });

  const result = await sendReminderToSubscriptions({
    subscriptions: [subOk, subStale],
    payload: HELPER_PAYLOAD,
    userId: USER_A,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  const serialized = JSON.stringify(result).toLowerCase();

  for (const forbidden of [
    "endpoint",
    "p256dh",
    "auth_key",
    "auth-sub",
    "bearer",
    "service-role-key",
    "push.example",
    "gone",
    "simulated upstream push failure",
  ]) {
    assert.ok(!serialized.includes(forbidden), `helper result leaked forbidden field/value: ${forbidden}`);
  }

  // The result must be a flat safe-summary object — never the
  // subscriptions/staleIds arrays themselves.
  assert.ok(!("subscriptions" in result));
  assert.ok(!("staleIds" in result));
});

// ---------------------------------------------------------------------
// claimReminderEvent / reclaimExpiredReminderEvent — atomic claim +
// reclaim foundation (Stage 9E-4C-2). NOT called by the handler yet —
// these tests exercise both helpers directly and in isolation. Several
// tests below assert exactly one fetch call was made (or that any
// unexpected method/second call throws), proving neither helper ever
// performs a prior SELECT-then-decide before its single atomic
// POST/PATCH.
// ---------------------------------------------------------------------

const CLAIM_CATEGORY = "activity_due_today";
const CLAIM_SOURCE_ID = "33333333-3333-3333-3333-333333333333";
const CLAIM_DEDUP_KEY = "activity-1|today|2026-09-28|2026-09-28";

test("claimReminderEvent: successful insert returns ownership; returned claimToken/leaseExpiresAt match the request body", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: JSON.parse(options.body) });
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  const result = await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(result.claimed, true);
  assert.equal(result.claimToken, calls[0].body.claim_token);
  assert.equal(result.leaseExpiresAt, calls[0].body.lease_expires_at);
});

test("claimReminderEvent: conflict (successful empty array) means ownership NOT acquired", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });

  const result = await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.claimed, false);
  assert.equal(result.claimToken, null);
  assert.equal(result.leaseExpiresAt, null);
});

test("claimReminderEvent: two separate claim calls generate different claim_token values", async () => {
  const bodies = [];
  global.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });
  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0].claim_token, bodies[1].claim_token);
});

test("claimReminderEvent: lease_expires_at is approximately 3 minutes in the future", async () => {
  let capturedBody = null;
  const before = Date.now();
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });
  const after = Date.now();

  const leaseMs = new Date(capturedBody.lease_expires_at).getTime();
  const toleranceMs = 2000;
  assert.ok(
    leaseMs >= before + 3 * 60 * 1000 - toleranceMs && leaseMs <= after + 3 * 60 * 1000 + toleranceMs,
    `lease_expires_at ${capturedBody.lease_expires_at} was not approximately 3 minutes in the future`
  );
});

test("claimReminderEvent: request body has status claimed, attempt_count 0, required fields, and omits finalize-only fields", async () => {
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(capturedBody.status, "claimed");
  assert.equal(capturedBody.attempt_count, 0);
  assert.equal(capturedBody.user_id, USER_A);
  assert.equal(capturedBody.category, CLAIM_CATEGORY);
  assert.equal(capturedBody.source_id, CLAIM_SOURCE_ID);
  assert.equal(capturedBody.dedup_key, CLAIM_DEDUP_KEY);
  assert.ok(!("delivered_at" in capturedBody));
  assert.ok(!("sent_at" in capturedBody));
  assert.ok(!("last_attempt_at" in capturedBody));
  assert.ok(!("last_error" in capturedBody));
});

test("claimReminderEvent: URL includes on_conflict=user_id,dedup_key and correct Prefer/Content-Type headers", async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  global.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedHeaders = options.headers;
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.ok(capturedUrl.includes("/rest/v1/reminder_deliveries"));
  assert.ok(capturedUrl.includes("on_conflict=user_id,dedup_key"));
  assert.ok(capturedHeaders.Prefer.includes("return=representation"));
  assert.ok(capturedHeaders.Prefer.includes("resolution=ignore-duplicates"));
  assert.equal(capturedHeaders["Content-Type"], "application/json");
});

test("claimReminderEvent: issues exactly one request — no prior SELECT/GET", async () => {
  let callCount = 0;
  global.fetch = async (url, options) => {
    callCount += 1;
    if ((options?.method || "GET") !== "POST") {
      throw new Error("claimReminderEvent must never issue a non-POST request: " + (options?.method || "GET") + " " + url);
    }
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(callCount, 1);
});

// A single shared forbidden-substring list for every claim/reclaim
// failure-message test below: proves the escaped error is the fixed
// generic string only, never anything derived from the request/
// response (userId, dedup key, service-role-looking values, auth
// header names, or a raw response-body fragment).
const CLAIM_FORBIDDEN_ERROR_SUBSTRINGS = [
  USER_A.toLowerCase(),
  CLAIM_DEDUP_KEY.toLowerCase(),
  "service-role-key",
  "bearer",
  "authorization",
  "raw_response_body_secret",
  SUPABASE_URL_FOR_HELPER.toLowerCase(),
  CLAIM_CATEGORY.toLowerCase(),
];

test("claimReminderEvent: HTTP non-2xx escapes as exactly the fixed generic message", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });

  await assert.rejects(
    () =>
      claimReminderEvent({
        userId: USER_A,
        category: CLAIM_CATEGORY,
        sourceId: CLAIM_SOURCE_ID,
        dedupKey: CLAIM_DEDUP_KEY,
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      }),
    (err) => {
      assert.equal(err.message, "Unable to claim reminder event.");
      return true;
    }
  );
});

test("claimReminderEvent: a network-level fetch rejection (even one containing sensitive-looking text) escapes as only the fixed generic message", async () => {
  global.fetch = async () => {
    throw new Error(
      `getaddrinfo ENOTFOUND ${SUPABASE_URL_FOR_HELPER} while POSTing dedup_key=${CLAIM_DEDUP_KEY} for user ${USER_A} with Authorization: Bearer service-role-key`
    );
  };

  try {
    await claimReminderEvent({
      userId: USER_A,
      category: CLAIM_CATEGORY,
      sourceId: CLAIM_SOURCE_ID,
      dedupKey: CLAIM_DEDUP_KEY,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected claimReminderEvent to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to claim reminder event.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `claim network-failure error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("claimReminderEvent: a malformed-JSON response.json() failure escapes as only the fixed generic message", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("RAW_RESPONSE_BODY_SECRET");
    },
  });

  try {
    await claimReminderEvent({
      userId: USER_A,
      category: CLAIM_CATEGORY,
      sourceId: CLAIM_SOURCE_ID,
      dedupKey: CLAIM_DEDUP_KEY,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected claimReminderEvent to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to claim reminder event.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `claim malformed-JSON error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("reclaimExpiredReminderEvent: expired claimed row returns ownership with matching token", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: JSON.parse(options.body) });
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  const result = await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PATCH");
  assert.equal(result.claimed, true);
  assert.equal(result.claimToken, calls[0].body.claim_token);
});

test("reclaimExpiredReminderEvent: no matching row (successful empty array) means ownership NOT acquired", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });

  const result = await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.claimed, false);
  assert.equal(result.claimToken, null);
  assert.equal(result.leaseExpiresAt, null);
});

test("reclaimExpiredReminderEvent: two separate reclaim calls generate different claim_token values", async () => {
  const bodies = [];
  global.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });
  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(bodies.length, 2);
  assert.notEqual(bodies[0].claim_token, bodies[1].claim_token);
});

test("reclaimExpiredReminderEvent: PATCH body contains only claim_token and lease_expires_at", async () => {
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.deepEqual(Object.keys(capturedBody).sort(), ["claim_token", "lease_expires_at"]);
  assert.ok(!("attempt_count" in capturedBody));
});

test("reclaimExpiredReminderEvent: URL includes all four encoded filters", async () => {
  let capturedUrl = null;
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.ok(capturedUrl.includes(`user_id=eq.${encodeURIComponent(USER_A)}`));
  assert.ok(capturedUrl.includes(`dedup_key=eq.${encodeURIComponent(CLAIM_DEDUP_KEY)}`));
  assert.ok(capturedUrl.includes(`status=eq.${encodeURIComponent("claimed")}`));
  assert.ok(capturedUrl.includes("lease_expires_at=lt."));
});

test("reclaimExpiredReminderEvent: Prefer is return=representation (no resolution token needed for PATCH)", async () => {
  let capturedHeaders = null;
  global.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(capturedHeaders.Prefer, "return=representation");
  assert.equal(capturedHeaders["Content-Type"], "application/json");
});

test("reclaimExpiredReminderEvent: issues exactly one request — no prior SELECT/GET", async () => {
  let callCount = 0;
  global.fetch = async (url, options) => {
    callCount += 1;
    if ((options?.method || "GET") !== "PATCH") {
      throw new Error("reclaimExpiredReminderEvent must never issue a non-PATCH request: " + (options?.method || "GET") + " " + url);
    }
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(callCount, 1);
});

test("reclaimExpiredReminderEvent: HTTP non-2xx escapes as exactly the fixed generic message", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });

  await assert.rejects(
    () =>
      reclaimExpiredReminderEvent({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      }),
    (err) => {
      assert.equal(err.message, "Unable to reclaim reminder event.");
      return true;
    }
  );
});

test("reclaimExpiredReminderEvent: a network-level fetch rejection (even one containing sensitive-looking text) escapes as only the fixed generic message", async () => {
  global.fetch = async () => {
    throw new Error(
      `getaddrinfo ENOTFOUND ${SUPABASE_URL_FOR_HELPER} while PATCHing dedup_key=${CLAIM_DEDUP_KEY} for user ${USER_A} with Authorization: Bearer service-role-key`
    );
  };

  try {
    await reclaimExpiredReminderEvent({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected reclaimExpiredReminderEvent to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to reclaim reminder event.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `reclaim network-failure error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("reclaimExpiredReminderEvent: a malformed-JSON response.json() failure escapes as only the fixed generic message", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("RAW_RESPONSE_BODY_SECRET");
    },
  });

  try {
    await reclaimExpiredReminderEvent({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected reclaimExpiredReminderEvent to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to reclaim reminder event.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `reclaim malformed-JSON error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("claimReminderEvent and reclaimExpiredReminderEvent results contain only claimed/claimToken/leaseExpiresAt", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ id: "row-1" }] });

  const claimResult = await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });
  const reclaimResult = await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.deepEqual(Object.keys(claimResult).sort(), ["claimToken", "claimed", "leaseExpiresAt"]);
  assert.deepEqual(Object.keys(reclaimResult).sort(), ["claimToken", "claimed", "leaseExpiresAt"]);
});

test("claim/reclaim results never contain userId, dedupKey, the service-role key, Authorization, or academic content — checked for BOTH helpers independently", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [{ id: "row-1" }] });

  const claimResult = await claimReminderEvent({
    userId: USER_A,
    category: CLAIM_CATEGORY,
    sourceId: CLAIM_SOURCE_ID,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });
  const reclaimResult = await reclaimExpiredReminderEvent({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  // claimToken itself is intentionally present in this internal-only
  // result shape — it is not a forbidden value here. The security
  // requirement is that the current HTTP handler never serializes this
  // object at all (confirmed separately by static inspection below),
  // not that the token is absent from the internal helper result.
  for (const [label, result] of [
    ["claim", claimResult],
    ["reclaim", reclaimResult],
  ]) {
    assert.deepEqual(Object.keys(result).sort(), ["claimToken", "claimed", "leaseExpiresAt"], `${label} result has an unexpected key set`);

    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      USER_A.toLowerCase(),
      CLAIM_DEDUP_KEY.toLowerCase(),
      "service-role-key",
      "bearer",
      "authorization",
      CLAIM_CATEGORY.toLowerCase(),
    ]) {
      assert.ok(!serialized.includes(forbidden), `${label} result leaked forbidden field/value: ${forbidden}`);
    }
  }
});

// ---------------------------------------------------------------------
// finalizeReminderDeliverySuccess / finalizeReminderDeliveryFailure —
// dormant finalize RPC helper layer (Stage 9E-4C-2). NOT called by the
// handler yet — these tests exercise both helpers directly and in
// isolation. All state-transition logic (attempt_count, status,
// sent_at, last_error, lease release) is owned by the database RPC and
// is intentionally NOT re-verified here — these tests only verify the
// JS caller's request shape, ownership interpretation of the returned
// array, and error-normalization contract.
// ---------------------------------------------------------------------

const FINALIZE_CLAIM_TOKEN = "44444444-4444-4444-4444-444444444444";

test("finalizeReminderDeliverySuccess: POSTs exactly once to the correct RPC URL with correct method, headers, and exact body keys/values", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, headers: options?.headers, body: JSON.parse(options.body) });
    return { ok: true, json: async () => [{ id: "row-1", status: "sent" }] };
  };

  const result = await finalizeReminderDeliverySuccess({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SUPABASE_URL_FOR_HELPER}/rest/v1/rpc/finalize_reminder_delivery_success`);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.apikey, REST_HEADERS_FOR_HELPER.apikey);
  assert.equal(calls[0].headers.Authorization, REST_HEADERS_FOR_HELPER.Authorization);
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.ok(!("Prefer" in calls[0].headers));
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["p_claim_token", "p_dedup_key", "p_user_id"]);
  assert.equal(calls[0].body.p_user_id, USER_A);
  assert.equal(calls[0].body.p_dedup_key, CLAIM_DEDUP_KEY);
  assert.equal(calls[0].body.p_claim_token, FINALIZE_CLAIM_TOKEN);

  assert.equal(result.finalized, true);
  assert.deepEqual(Object.keys(result), ["finalized"]);
});

test("finalizeReminderDeliverySuccess: empty returned array means finalized false", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });

  const result = await finalizeReminderDeliverySuccess({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.finalized, false);
  assert.deepEqual(Object.keys(result), ["finalized"]);
});

test("finalizeReminderDeliverySuccess: returned RPC row contents are never exposed in the result", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        id: "row-1",
        user_id: USER_A,
        dedup_key: CLAIM_DEDUP_KEY,
        status: "sent",
        category: CLAIM_CATEGORY,
        last_error: "some prior diagnostic",
      },
    ],
  });

  const result = await finalizeReminderDeliverySuccess({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.deepEqual(Object.keys(result), ["finalized"]);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["row-1", CLAIM_CATEGORY.toLowerCase(), "some prior diagnostic"]) {
    assert.ok(!serialized.includes(forbidden), `success result leaked RPC row content: ${forbidden}`);
  }
});

test("finalizeReminderDeliverySuccess: HTTP non-2xx escapes as exactly the fixed generic message", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });

  await assert.rejects(
    () =>
      finalizeReminderDeliverySuccess({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        claimToken: FINALIZE_CLAIM_TOKEN,
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      }),
    (err) => {
      assert.equal(err.message, "Unable to finalize reminder delivery success.");
      return true;
    }
  );
});

test("finalizeReminderDeliverySuccess: a network-level fetch rejection (even one containing sensitive-looking text) escapes as only the fixed generic message", async () => {
  global.fetch = async () => {
    throw new Error(
      `getaddrinfo ENOTFOUND ${SUPABASE_URL_FOR_HELPER} while POSTing dedup_key=${CLAIM_DEDUP_KEY} for user ${USER_A} claim_token=${FINALIZE_CLAIM_TOKEN} with Authorization: Bearer service-role-key`
    );
  };

  try {
    await finalizeReminderDeliverySuccess({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      claimToken: FINALIZE_CLAIM_TOKEN,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected finalizeReminderDeliverySuccess to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to finalize reminder delivery success.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `success network-failure error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("finalizeReminderDeliverySuccess: a malformed-JSON response.json() failure escapes as only the fixed generic message", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("RAW_RESPONSE_BODY_SECRET");
    },
  });

  try {
    await finalizeReminderDeliverySuccess({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      claimToken: FINALIZE_CLAIM_TOKEN,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected finalizeReminderDeliverySuccess to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to finalize reminder delivery success.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `success malformed-JSON error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("finalizeReminderDeliverySuccess: a successful non-array JSON response ({}, null, or a string) is treated as a malformed RPC contract, not as ownership loss", async () => {
  // The RPC's own contract is RETURNS SETOF ..., i.e. always an array.
  // A non-array body — even with response.ok true — must never be
  // silently folded into the same outcome as a legitimate empty-array
  // ([]) ownership-loss response; it must reject with the exact same
  // fixed message used for every other failure mode, and the
  // non-array value itself must never appear in that message.
  for (const nonArrayValue of [{}, null, "unexpected"]) {
    global.fetch = async () => ({ ok: true, json: async () => nonArrayValue });

    try {
      await finalizeReminderDeliverySuccess({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        claimToken: FINALIZE_CLAIM_TOKEN,
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      });
      assert.fail(`expected finalizeReminderDeliverySuccess to reject for non-array response: ${JSON.stringify(nonArrayValue)}`);
    } catch (err) {
      assert.equal(err.message, "Unable to finalize reminder delivery success.");
      assert.ok(!err.message.toLowerCase().includes("unexpected"), "non-array value must never appear in the thrown message");
    }
  }
});

test("finalizeReminderDeliveryFailure: POSTs exactly once to the correct RPC URL with correct method, headers, exact body keys/values, and p_max_attempts exactly 5", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method, headers: options?.headers, body: JSON.parse(options.body) });
    return { ok: true, json: async () => [{ id: "row-1" }] };
  };

  const result = await finalizeReminderDeliveryFailure({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    errorCategory: "push_send_failed",
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SUPABASE_URL_FOR_HELPER}/rest/v1/rpc/finalize_reminder_delivery_failure`);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.apikey, REST_HEADERS_FOR_HELPER.apikey);
  assert.equal(calls[0].headers.Authorization, REST_HEADERS_FOR_HELPER.Authorization);
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.ok(!("Prefer" in calls[0].headers));
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["p_claim_token", "p_dedup_key", "p_error", "p_max_attempts", "p_user_id"]);
  assert.equal(calls[0].body.p_user_id, USER_A);
  assert.equal(calls[0].body.p_dedup_key, CLAIM_DEDUP_KEY);
  assert.equal(calls[0].body.p_claim_token, FINALIZE_CLAIM_TOKEN);
  assert.equal(calls[0].body.p_error, "push_send_failed");
  assert.equal(calls[0].body.p_max_attempts, 5);

  assert.equal(result.finalized, true);
  assert.deepEqual(Object.keys(result), ["finalized"]);
});

test("finalizeReminderDeliveryFailure: each allowed error category reaches p_error unchanged", async () => {
  for (const category of ["no_subscriptions", "all_subscriptions_stale", "push_send_failed"]) {
    let capturedBody = null;
    global.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return { ok: true, json: async () => [{ id: "row-1" }] };
    };

    await finalizeReminderDeliveryFailure({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      claimToken: FINALIZE_CLAIM_TOKEN,
      errorCategory: category,
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });

    assert.equal(capturedBody.p_error, category);
  }
});

test("finalizeReminderDeliveryFailure: an invalid errorCategory is rejected before any fetch call", async () => {
  let fetchCallCount = 0;
  global.fetch = async () => {
    fetchCallCount += 1;
    throw new Error("fetch must never be called for an invalid errorCategory");
  };

  const dangerousLookingCategory =
    "Authorization: Bearer service-role-key endpoint=https://push.example raw Error.message leaked here";

  await assert.rejects(
    () =>
      finalizeReminderDeliveryFailure({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        claimToken: FINALIZE_CLAIM_TOKEN,
        errorCategory: dangerousLookingCategory,
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      }),
    (err) => {
      assert.equal(err.message, "Unable to finalize reminder delivery failure.");
      return true;
    }
  );

  assert.equal(fetchCallCount, 0);
});

test("finalizeReminderDeliveryFailure: empty returned array means finalized false", async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });

  const result = await finalizeReminderDeliveryFailure({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    errorCategory: "push_send_failed",
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.equal(result.finalized, false);
  assert.deepEqual(Object.keys(result), ["finalized"]);
});

test("finalizeReminderDeliveryFailure: returned RPC row contents are never exposed in the result", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        id: "row-1",
        user_id: USER_A,
        dedup_key: CLAIM_DEDUP_KEY,
        status: "claimed",
        attempt_count: 2,
        last_error: "push_send_failed",
      },
    ],
  });

  const result = await finalizeReminderDeliveryFailure({
    userId: USER_A,
    dedupKey: CLAIM_DEDUP_KEY,
    claimToken: FINALIZE_CLAIM_TOKEN,
    errorCategory: "push_send_failed",
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
  });

  assert.deepEqual(Object.keys(result), ["finalized"]);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["row-1", "attempt_count"]) {
    assert.ok(!serialized.includes(forbidden), `failure result leaked RPC row content: ${forbidden}`);
  }
});

test("finalizeReminderDeliveryFailure: HTTP non-2xx escapes as exactly the fixed generic message", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });

  await assert.rejects(
    () =>
      finalizeReminderDeliveryFailure({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        claimToken: FINALIZE_CLAIM_TOKEN,
        errorCategory: "push_send_failed",
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      }),
    (err) => {
      assert.equal(err.message, "Unable to finalize reminder delivery failure.");
      return true;
    }
  );
});

test("finalizeReminderDeliveryFailure: a network-level fetch rejection (even one containing sensitive-looking text) escapes as only the fixed generic message", async () => {
  global.fetch = async () => {
    throw new Error(
      `getaddrinfo ENOTFOUND ${SUPABASE_URL_FOR_HELPER} while POSTing dedup_key=${CLAIM_DEDUP_KEY} for user ${USER_A} claim_token=${FINALIZE_CLAIM_TOKEN} with Authorization: Bearer service-role-key`
    );
  };

  try {
    await finalizeReminderDeliveryFailure({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      claimToken: FINALIZE_CLAIM_TOKEN,
      errorCategory: "push_send_failed",
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected finalizeReminderDeliveryFailure to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to finalize reminder delivery failure.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `failure network-failure error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("finalizeReminderDeliveryFailure: a malformed-JSON response.json() failure escapes as only the fixed generic message", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError("RAW_RESPONSE_BODY_SECRET");
    },
  });

  try {
    await finalizeReminderDeliveryFailure({
      userId: USER_A,
      dedupKey: CLAIM_DEDUP_KEY,
      claimToken: FINALIZE_CLAIM_TOKEN,
      errorCategory: "push_send_failed",
      restHeaders: REST_HEADERS_FOR_HELPER,
      supabaseUrl: SUPABASE_URL_FOR_HELPER,
    });
    assert.fail("expected finalizeReminderDeliveryFailure to reject");
  } catch (err) {
    assert.equal(err.message, "Unable to finalize reminder delivery failure.");
    const serialized = err.message.toLowerCase();
    for (const forbidden of CLAIM_FORBIDDEN_ERROR_SUBSTRINGS) {
      assert.ok(!serialized.includes(forbidden), `failure malformed-JSON error leaked forbidden value: ${forbidden}`);
    }
  }
});

test("finalizeReminderDeliveryFailure: a successful non-array JSON response ({}, null, or a string) is treated as a malformed RPC contract, not as ownership loss", async () => {
  for (const nonArrayValue of [{}, null, "unexpected"]) {
    global.fetch = async () => ({ ok: true, json: async () => nonArrayValue });

    try {
      await finalizeReminderDeliveryFailure({
        userId: USER_A,
        dedupKey: CLAIM_DEDUP_KEY,
        claimToken: FINALIZE_CLAIM_TOKEN,
        errorCategory: "push_send_failed",
        restHeaders: REST_HEADERS_FOR_HELPER,
        supabaseUrl: SUPABASE_URL_FOR_HELPER,
      });
      assert.fail(`expected finalizeReminderDeliveryFailure to reject for non-array response: ${JSON.stringify(nonArrayValue)}`);
    } catch (err) {
      assert.equal(err.message, "Unable to finalize reminder delivery failure.");
      assert.ok(!err.message.toLowerCase().includes("unexpected"), "non-array value must never appear in the thrown message");
    }
  }
});

/* =========================================================
   processReminderCandidate — ORCHESTRATOR TESTS

   claimFn/reclaimFn/sendFn/finalizeSuccessFn/finalizeFailureFn are
   always explicitly injected as plain mock functions in every test
   below — never the real imported helpers — so these tests exercise
   ONLY the orchestrator's own control flow, never re-testing logic
   the real helpers' own dedicated test sections above already cover.
   global.fetch is used only for the orchestrator's own inline
   subscription-loading fetch call; a poison implementation that fails
   the test if invoked is used everywhere the orchestrator must never
   reach subscription loading at all.
========================================================= */

const ORCH_USER_ID = USER_A;
const ORCH_CLAIM_TOKEN = "77777777-7777-7777-7777-777777777777";
const ORCH_FIXED_NOW_MS = 1_700_000_000_000;
const orchFixedNow = () => ORCH_FIXED_NOW_MS;

function orchLeaseIso(offsetMs) {
  return new Date(ORCH_FIXED_NOW_MS + offsetMs).toISOString();
}

const ORCH_CANDIDATE_ACTIVITY = {
  kind: "activity",
  category: "activity_due_today",
  sourceId: "88888888-8888-8888-8888-888888888888",
  dedupKey: "orch-activity-1|today|2026-09-28|2026-09-28",
  title: "Essay Draft",
  urgencyKey: "today",
};

const ORCH_CANDIDATE_CLASS = {
  kind: "class",
  category: "class_schedule",
  sourceId: "99999999-9999-9999-9999-999999999999",
  dedupKey: "class|sched-1|2026-09-28|10",
  subjectName: "Calculus",
  startTime: "10:00:00",
};

// Wraps a mock implementation so tests can assert exactly how many
// times, and with what single argument object, it was called —
// without needing a full mocking library.
function countedFn(impl) {
  async function fn(arg) {
    fn.callCount += 1;
    fn.lastArg = arg;
    return impl(arg);
  }
  fn.callCount = 0;
  fn.lastArg = undefined;
  return fn;
}

function claimSucceeds(leaseExpiresAt = orchLeaseIso(3 * 60 * 1000)) {
  return countedFn(async () => ({ claimed: true, claimToken: ORCH_CLAIM_TOKEN, leaseExpiresAt }));
}

function claimFails() {
  return countedFn(async () => ({ claimed: false, claimToken: null, leaseExpiresAt: null }));
}

function claimThrows() {
  return countedFn(async () => {
    throw new Error("Unable to claim reminder event.");
  });
}

function reclaimSucceeds(leaseExpiresAt = orchLeaseIso(3 * 60 * 1000)) {
  return countedFn(async () => ({ claimed: true, claimToken: ORCH_CLAIM_TOKEN, leaseExpiresAt }));
}

function reclaimFails() {
  return countedFn(async () => ({ claimed: false, claimToken: null, leaseExpiresAt: null }));
}

function reclaimThrows() {
  return countedFn(async () => {
    throw new Error("Unable to reclaim reminder event.");
  });
}

function sendSucceeds() {
  return countedFn(async () => ({
    eventSendSucceeded: true,
    sentCount: 1,
    failedCount: 0,
    staleDetectedCount: 0,
    staleRemovedCount: 0,
    cleanupStatus: "not_needed",
    errorCategory: null,
  }));
}

function sendFailsWith(errorCategory) {
  return countedFn(async () => ({
    eventSendSucceeded: false,
    sentCount: 0,
    failedCount: 1,
    staleDetectedCount: 0,
    staleRemovedCount: 0,
    cleanupStatus: "not_needed",
    errorCategory,
  }));
}

function sendThrows() {
  return countedFn(async () => {
    throw new Error("unexpected fanout failure");
  });
}

function finalizeSuccessReturns(finalized) {
  return countedFn(async () => ({ finalized }));
}

function finalizeSuccessThrows() {
  return countedFn(async () => {
    throw new Error("Unable to finalize reminder delivery success.");
  });
}

function finalizeFailureReturns(finalized) {
  return countedFn(async () => ({ finalized }));
}

function finalizeFailureThrows() {
  return countedFn(async () => {
    throw new Error("Unable to finalize reminder delivery failure.");
  });
}

function poisonFetch() {
  return async () => {
    throw new Error("global.fetch should not have been called in this test");
  };
}

function subsFetchReturns(rows) {
  return async () => ({ ok: true, json: async () => rows });
}

// Every orchestrator test builds its own explicit set of the five
// injected dependencies; this only fills in whichever ones a given
// test does not care about with an "unreachable" mock that fails the
// test the instant it is invoked, so an accidental extra call is
// always caught even when a test does not otherwise assert a call
// count for that particular dependency.
function unreachable(label) {
  return countedFn(async () => {
    throw new Error(`${label} must not have been called in this test`);
  });
}

// 1. Initial claim succeeds -> normal flow.
test("processReminderCandidate: initial claim succeeds, full happy path finalizes as sent", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const claimFn = claimSucceeds();
  const reclaimFn = unreachable("reclaimFn");
  const sendFn = sendSucceeds();
  const finalizeSuccessFn = finalizeSuccessReturns(true);
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn,
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.deepEqual(result, { outcome: "sent", category: ORCH_CANDIDATE_ACTIVITY.category, dedupKey: ORCH_CANDIDATE_ACTIVITY.dedupKey });
  assert.equal(claimFn.callCount, 1);
  assert.equal(reclaimFn.callCount, 0);
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeSuccessFn.callCount, 1);
  assert.equal(finalizeSuccessFn.lastArg.claimToken, ORCH_CLAIM_TOKEN);
});

// 2. Initial claim conflict -> expired reclaim succeeds -> normal flow.
test("processReminderCandidate: initial claim conflict followed by a successful expired reclaim still completes normally", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const claimFn = claimFails();
  const reclaimFn = reclaimSucceeds();
  const sendFn = sendSucceeds();
  const finalizeSuccessFn = finalizeSuccessReturns(true);
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn,
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "sent");
  assert.equal(claimFn.callCount, 1);
  assert.equal(reclaimFn.callCount, 1);
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeSuccessFn.callCount, 1);
});

// 3. Initial claim conflict + reclaim returns false: ownership_not_acquired.
test("processReminderCandidate: claim conflict + reclaim failure yields ownership_not_acquired with no send/finalize/subscription load", async () => {
  global.fetch = poisonFetch();

  const claimFn = claimFails();
  const reclaimFn = reclaimFails();
  const sendFn = unreachable("sendFn");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn,
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "ownership_not_acquired");
  assert.equal(sendFn.callCount, 0);
  assert.equal(finalizeSuccessFn.callCount, 0);
  assert.equal(finalizeFailureFn.callCount, 0);
});

// 4. Claim throws: internal_error, no reclaim, no send, no finalize.
test("processReminderCandidate: claim transport failure yields internal_error with no reclaim/send/finalize/subscription load", async () => {
  global.fetch = poisonFetch();

  const claimFn = claimThrows();
  const reclaimFn = unreachable("reclaimFn");
  const sendFn = unreachable("sendFn");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn,
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(reclaimFn.callCount, 0);
});

// 5. Reclaim throws: internal_error, no send, no finalize.
test("processReminderCandidate: reclaim transport failure yields internal_error with no send/finalize/subscription load", async () => {
  global.fetch = poisonFetch();

  const claimFn = claimFails();
  const reclaimFn = reclaimThrows();
  const sendFn = unreachable("sendFn");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn,
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "internal_error");
});

// 6. Missing leaseExpiresAt: lease_not_safe, no subscription query/send/finalize.
test("processReminderCandidate: missing leaseExpiresAt yields lease_not_safe with no subscription load/send/finalize", async () => {
  global.fetch = poisonFetch();

  // Explicitly null, not undefined -- a JS default parameter only
  // applies when the argument is exactly `undefined`, and this test
  // must exercise the orchestrator's own "missing leaseExpiresAt"
  // branch rather than accidentally falling back to claimSucceeds'
  // own default (safe) lease.
  const claimFn = claimSucceeds(null);
  const sendFn = unreachable("sendFn");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "lease_not_safe");
  assert.equal(sendFn.callCount, 0);
  assert.equal(finalizeSuccessFn.callCount, 0);
  assert.equal(finalizeFailureFn.callCount, 0);
});

// 7. Invalid leaseExpiresAt: lease_not_safe.
test("processReminderCandidate: invalid (unparsable) leaseExpiresAt yields lease_not_safe", async () => {
  global.fetch = poisonFetch();

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds("not-a-valid-timestamp"),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "lease_not_safe");
});

// 8. Expired lease: lease_not_safe.
test("processReminderCandidate: already-expired leaseExpiresAt yields lease_not_safe", async () => {
  global.fetch = poisonFetch();

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(orchLeaseIso(-1000)),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "lease_not_safe");
});

// 9. Lease exactly 30 seconds remaining: lease_not_safe (the boundary is
// exclusive -- "> PRE_SEND_LEASE_SAFETY_MS" required to proceed).
test("processReminderCandidate: leaseExpiresAt exactly at the 30-second safety margin yields lease_not_safe", async () => {
  global.fetch = poisonFetch();

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(orchLeaseIso(30 * 1000)),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "lease_not_safe");
});

// 10. Lease less than 30 seconds remaining: lease_not_safe.
test("processReminderCandidate: leaseExpiresAt with less than 30 seconds remaining yields lease_not_safe", async () => {
  global.fetch = poisonFetch();

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(orchLeaseIso(10 * 1000)),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "lease_not_safe");
});

// 11. Lease comfortably above 30 seconds: proceeds.
test("processReminderCandidate: leaseExpiresAt comfortably above the safety margin proceeds to subscription loading", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const claimFn = claimSucceeds(orchLeaseIso(60 * 1000));
  const sendFn = sendSucceeds();
  const finalizeSuccessFn = finalizeSuccessReturns(true);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn,
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "sent");
  assert.equal(sendFn.callCount, 1);
});

// 12. Subscription query network rejection: internal_error, no send/finalize.
test("processReminderCandidate: subscription query network rejection yields internal_error with no send/finalize", async () => {
  global.fetch = async () => {
    throw new Error("network is down");
  };

  const sendFn = unreachable("sendFn");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(sendFn.callCount, 0);
  assert.equal(finalizeSuccessFn.callCount, 0);
  assert.equal(finalizeFailureFn.callCount, 0);
});

// 13. Subscription query non-2xx: internal_error.
test("processReminderCandidate: subscription query non-2xx response yields internal_error", async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({ message: "denied" }) });

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "internal_error");
});

// 14. Subscription query malformed JSON (json() itself throws): internal_error.
test("processReminderCandidate: subscription query malformed JSON body yields internal_error", async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new Error("Unexpected token");
    },
  });

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "internal_error");
});

// 15. Subscription query successful non-array JSON: internal_error.
test("processReminderCandidate: subscription query successful but non-array JSON yields internal_error", async () => {
  global.fetch = subsFetchReturns({ not: "an array" });

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: unreachable("sendFn"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "internal_error");
});

// 16. Zero subscriptions: fanout receives [], failure finalize called with no_subscriptions.
// Uses the REAL sendReminderToSubscriptions (not a mock) to verify the
// orchestrator truly passes [] straight through into the existing
// helper's own already-tested no_subscriptions branch, rather than
// special-casing zero subscriptions itself.
test("processReminderCandidate: zero subscriptions passes [] to the real fanout helper and failure-finalizes as no_subscriptions", async () => {
  global.fetch = subsFetchReturns([]);

  const finalizeFailureFn = finalizeFailureReturns(true);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendReminderToSubscriptions,
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "failed_finalized");
  assert.equal(finalizeFailureFn.callCount, 1);
  assert.equal(finalizeFailureFn.lastArg.errorCategory, "no_subscriptions");
  assert.equal(finalizeFailureFn.lastArg.claimToken, ORCH_CLAIM_TOKEN);
});

// 17. >=1 push success: success finalize called exactly once, outcome sent.
test("processReminderCandidate: a successful send finalizes success exactly once with outcome sent", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendSucceeds();
  const finalizeSuccessFn = finalizeSuccessReturns(true);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "sent");
  assert.equal(finalizeSuccessFn.callCount, 1);
});

// 18. Fanout all stale: failure finalize with all_subscriptions_stale.
test("processReminderCandidate: all-stale fanout failure-finalizes with all_subscriptions_stale", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const finalizeFailureFn = finalizeFailureReturns(true);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendFailsWith("all_subscriptions_stale"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "failed_finalized");
  assert.equal(finalizeFailureFn.lastArg.errorCategory, "all_subscriptions_stale");
});

// 19. Fanout all non-stale failures: failure finalize with push_send_failed.
test("processReminderCandidate: all non-stale fanout failures failure-finalize with push_send_failed", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const finalizeFailureFn = finalizeFailureReturns(true);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendFailsWith("push_send_failed"),
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "failed_finalized");
  assert.equal(finalizeFailureFn.lastArg.errorCategory, "push_send_failed");
});

// 20. Success finalize returns false: ownership_lost_after_send, no second send/finalize.
test("processReminderCandidate: success finalize reporting finalized:false yields ownership_lost_after_send with no retry", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendSucceeds();
  const finalizeSuccessFn = finalizeSuccessReturns(false);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "ownership_lost_after_send");
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeSuccessFn.callCount, 1);
});

// 21. Failure finalize returns false: ownership_lost_after_failed_send, no retry.
test("processReminderCandidate: failure finalize reporting finalized:false yields ownership_lost_after_failed_send with no retry", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendFailsWith("push_send_failed");
  const finalizeFailureFn = finalizeFailureReturns(false);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "ownership_lost_after_failed_send");
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeFailureFn.callCount, 1);
});

// 22. Success finalize transport failure: internal_error, no retry send/finalize.
test("processReminderCandidate: success finalize transport failure yields internal_error with no retry", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendSucceeds();
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn: finalizeSuccessThrows(),
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeFailureFn.callCount, 0);
});

// 23. Failure finalize transport failure: internal_error, no retry.
test("processReminderCandidate: failure finalize transport failure yields internal_error with no retry", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendFailsWith("push_send_failed");
  const finalizeSuccessFn = unreachable("finalizeSuccessFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn,
    finalizeFailureFn: finalizeFailureThrows(),
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(sendFn.callCount, 1);
  assert.equal(finalizeSuccessFn.callCount, 0);
});

// 24. Fanout helper unexpectedly throws: internal_error, do NOT failure-finalize the infrastructure exception.
test("processReminderCandidate: an unexpected fanout throw yields internal_error without ever calling either finalize helper", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const finalizeSuccessFn = unreachable("finalizeSuccessFn");
  const finalizeFailureFn = unreachable("finalizeFailureFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendThrows(),
    finalizeSuccessFn,
    finalizeFailureFn,
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(finalizeSuccessFn.callCount, 0);
  assert.equal(finalizeFailureFn.callCount, 0);
});

// 25. Result shape contains EXACTLY: outcome, category, dedupKey.
test("processReminderCandidate: result object contains exactly outcome, category, and dedupKey", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendSucceeds(),
    finalizeSuccessFn: finalizeSuccessReturns(true),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.deepEqual(Object.keys(result).sort(), ["category", "dedupKey", "outcome"]);
});

// 26. Result never contains sensitive fields (claimToken, leaseExpiresAt,
// subscription/auth material, or raw errors).
test("processReminderCandidate: result never leaks claimToken, leaseExpiresAt, or subscription/auth material", async () => {
  global.fetch = subsFetchReturns([
    { id: "sub-1", endpoint: "https://push.example/super-secret-endpoint", p256dh: "secret-p256dh", auth_key: "secret-auth-key" },
  ]);

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn: sendSucceeds(),
    finalizeSuccessFn: finalizeSuccessReturns(true),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of [
    ORCH_CLAIM_TOKEN.toLowerCase(),
    "leaseexpiresat",
    "super-secret-endpoint",
    "secret-p256dh",
    "secret-auth-key",
    "authorization",
    "service-role-key",
  ]) {
    assert.ok(!serialized.includes(forbidden), `result leaked forbidden value: ${forbidden}`);
  }
});

// 27. Activity payload shape/content.
test("processReminderCandidate: activity candidate produces a title/urgency-based payload", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendSucceeds();

  await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn: finalizeSuccessReturns(true),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(sendFn.callCount, 1);
  const parsedPayload = JSON.parse(sendFn.lastArg.payload);
  assert.equal(parsedPayload.title, "Takda");
  assert.ok(parsedPayload.body.includes(ORCH_CANDIDATE_ACTIVITY.title));
  assert.ok(parsedPayload.body.toLowerCase().includes("today"));
});

// 28. Class payload shape/content.
test("processReminderCandidate: class candidate produces a subject/start-time-based payload", async () => {
  global.fetch = subsFetchReturns([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }]);

  const sendFn = sendSucceeds();

  await processReminderCandidate({
    candidate: ORCH_CANDIDATE_CLASS,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimSucceeds(),
    reclaimFn: unreachable("reclaimFn"),
    sendFn,
    finalizeSuccessFn: finalizeSuccessReturns(true),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(sendFn.callCount, 1);
  const parsedPayload = JSON.parse(sendFn.lastArg.payload);
  assert.equal(parsedPayload.title, "Takda");
  assert.ok(parsedPayload.body.includes(ORCH_CANDIDATE_CLASS.subjectName));
  assert.ok(parsedPayload.body.includes(ORCH_CANDIDATE_CLASS.startTime));
});

// 29. No push occurs before ownership acquisition (both the
// ownership_not_acquired and claim-throws paths already assert
// sendFn.callCount === 0 above in tests 3 and 4; this test adds the
// reclaim-throws path for completeness).
test("processReminderCandidate: no send occurs when ownership is never acquired via either claim or reclaim", async () => {
  global.fetch = poisonFetch();

  const sendFn = unreachable("sendFn");

  const result = await processReminderCandidate({
    candidate: ORCH_CANDIDATE_ACTIVITY,
    userId: ORCH_USER_ID,
    restHeaders: REST_HEADERS_FOR_HELPER,
    supabaseUrl: SUPABASE_URL_FOR_HELPER,
    now: orchFixedNow,
    claimFn: claimFails(),
    reclaimFn: reclaimThrows(),
    sendFn,
    finalizeSuccessFn: unreachable("finalizeSuccessFn"),
    finalizeFailureFn: unreachable("finalizeFailureFn"),
  });

  assert.equal(result.outcome, "internal_error");
  assert.equal(sendFn.callCount, 0);
});

/* =========================================================
   STATIC SOURCE CHECKS — handler dormancy + protected-file pinning

   These read the actual source files on disk (never the imported
   module's runtime behavior) so a future accidental wiring of any
   dormant helper into the handler, or a byte-level change to
   api/test-push.js, fails this suite immediately.
========================================================= */

const SOURCE_PATH = fileURLToPath(new URL("../reminders-delivery-runner.js", import.meta.url));
const SOURCE_TEXT = readFileSync(SOURCE_PATH, "utf8");

// 30 & 31. Handler has zero call sites to processReminderCandidate or
// any of the five composed helpers.
test("source check: the handler function body contains zero call sites to processAllEligibleUsers, processReminderCandidate, or any of the five composed helpers", () => {
  const handlerStart = SOURCE_TEXT.indexOf("export default async function handler");
  assert.ok(handlerStart > -1, "handler function not found in source");
  const handlerBody = SOURCE_TEXT.slice(handlerStart);

  for (const callSite of [
    "processAllEligibleUsers(",
    "processReminderCandidate(",
    "claimReminderEvent(",
    "reclaimExpiredReminderEvent(",
    "sendReminderToSubscriptions(",
    "finalizeReminderDeliverySuccess(",
    "finalizeReminderDeliveryFailure(",
  ]) {
    assert.ok(!handlerBody.includes(callSite), `handler body unexpectedly contains a call site: ${callSite}`);
  }
});

// 32. Handler remains dryRun: true / liveSendEnabled: false.
test("source check: the handler still returns dryRun: true and liveSendEnabled: false", () => {
  assert.ok(SOURCE_TEXT.includes("dryRun: true,"));
  assert.ok(SOURCE_TEXT.includes("liveSendEnabled: false,"));
});

// 33. api/test-push.js remains byte-for-byte unchanged (pinned SHA-256).
test("source check: api/test-push.js remains byte-for-byte unchanged", () => {
  const testPushPath = fileURLToPath(new URL("../test-push.js", import.meta.url));
  const contents = readFileSync(testPushPath);
  const hash = createHash("sha256").update(contents).digest("hex");
  assert.equal(hash, "9372304b3ca629ad2b891b1b0124302b130bef92ea3767014b6af77368f0ee0b");
});

/* =========================================================
   processAllEligibleUsers — BULK RUNNER TESTS

   computeCandidatesForUserFn/processCandidateFn are always explicitly
   injected as plain mock functions -- never the real imported/internal
   functions -- so these tests exercise ONLY processAllEligibleUsers'
   own control flow (enumeration union/dedup, per-source failure
   handling, per-user/per-candidate failure isolation, aggregate
   counting), never re-testing logic already covered by
   computeCandidatesForUser's own indirect handler-report tests above
   or by processReminderCandidate's own dedicated test section above.
   global.fetch is used only for the two enumeration queries
   processAllEligibleUsers issues directly.
========================================================= */

const BULK_SUPABASE_URL = SUPABASE_URL_FOR_HELPER;
const BULK_REST_HEADERS = REST_HEADERS_FOR_HELPER;

// Routes global.fetch calls by URL for the two enumeration queries only;
// throws on anything else (including any non-GET method), so an
// accidental write from processAllEligibleUsers is a hard test failure.
// Records every call URL for assertions on the exact query shape.
function bulkFetchRouter({
  subscriptionRows,
  retryRows,
  subscriptionThrows = false,
  retryThrows = false,
  subscriptionNonOk = false,
  retryNonOk = false,
  subscriptionMalformedJson = false,
  retryMalformedJson = false,
  subscriptionNonArray = false,
  retryNonArray = false,
} = {}) {
  const calls = [];

  async function fn(url, options) {
    const urlStr = String(url);
    const method = (options?.method || "GET").toUpperCase();
    calls.push(urlStr);

    if (method !== "GET") {
      throw new Error("processAllEligibleUsers must never issue a non-GET request: " + method + " " + urlStr);
    }

    if (urlStr.includes("/rest/v1/push_subscriptions")) {
      if (subscriptionThrows) throw new Error("network is down");
      if (subscriptionMalformedJson) return { ok: true, json: async () => { throw new Error("Unexpected token"); } };
      if (subscriptionNonArray) return { ok: true, json: async () => ({ not: "an array" }) };
      return { ok: !subscriptionNonOk, json: async () => subscriptionRows ?? [] };
    }

    if (urlStr.includes("/rest/v1/reminder_deliveries")) {
      if (retryThrows) throw new Error("network is down");
      if (retryMalformedJson) return { ok: true, json: async () => { throw new Error("Unexpected token"); } };
      if (retryNonArray) return { ok: true, json: async () => ({ not: "an array" }) };
      return { ok: !retryNonOk, json: async () => retryRows ?? [] };
    }

    throw new Error("Unexpected fetch call in bulk-runner test: " + urlStr);
  }

  fn.calls = calls;
  return fn;
}

// Records every userId computeCandidatesForUserFn was called with, in
// order (including duplicates, so a dedup bug is visible), and returns
// per-user behavior from a plain map: an array of candidates, or the
// literal string "throw" to simulate computeCandidatesForUser throwing.
function trackedComputeCandidatesFn(behaviorByUserId) {
  const calls = [];

  async function fn(userId) {
    calls.push(userId);
    const behavior = behaviorByUserId[userId];
    if (behavior === "throw") {
      throw new Error("Unable to load reminder data for user " + userId);
    }
    return { candidates: Array.isArray(behavior) ? behavior : [] };
  }

  fn.calls = calls;
  return fn;
}

// Returns candidateResult.outcome values in the exact order supplied,
// one per call, falling back to "internal_error" past the end of the
// list; a "throw" entry simulates processCandidateFn itself throwing.
// Records every candidate it was called with, in call order.
function sequencedProcessCandidateFn(outcomesInOrder) {
  let index = 0;
  const calls = [];

  async function fn(args) {
    calls.push(args.candidate);
    const next = outcomesInOrder[index];
    index += 1;
    if (next === "throw") {
      throw new Error("Unable to send/finalize reminder.");
    }
    return { outcome: next ?? "internal_error", category: args.candidate.category, dedupKey: args.candidate.dedupKey };
  }

  fn.calls = calls;
  return fn;
}

function bulkCandidate(sourceId, dedupKeySuffix = "") {
  return {
    kind: "activity",
    category: "activity_due_today",
    sourceId,
    dedupKey: `bulk-activity-${sourceId}${dedupKeySuffix}`,
    title: `Activity ${sourceId}`,
    urgencyKey: "today",
  };
}

// 1. Subscription enumeration includes a user.
test("processAllEligibleUsers: a user found via subscription enumeration is processed", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const computeFn = trackedComputeCandidatesFn({ [USER_A]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.deepEqual(computeFn.calls, [USER_A]);
  assert.equal(result.usersConsidered, 1);
});

// 2. Duplicate subscription rows dedupe to one user.
test("processAllEligibleUsers: duplicate subscription rows for the same user dedupe to a single processing call", async () => {
  global.fetch = bulkFetchRouter({
    subscriptionRows: [{ user_id: USER_A }, { user_id: USER_A }, { user_id: USER_A }],
    retryRows: [],
  });
  const computeFn = trackedComputeCandidatesFn({ [USER_A]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.deepEqual(computeFn.calls, [USER_A]);
  assert.equal(result.usersConsidered, 1);
});

// 3. Retry enumeration includes zero-subscription claimed user.
test("processAllEligibleUsers: a zero-subscription user found only via retry enumeration is still processed", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [], retryRows: [{ user_id: USER_B }] });
  const computeFn = trackedComputeCandidatesFn({ [USER_B]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.deepEqual(computeFn.calls, [USER_B]);
  assert.equal(result.usersConsidered, 1);
});

// 4. Same user in both sources processed once.
test("processAllEligibleUsers: a user present in both enumeration sources is processed exactly once", async () => {
  global.fetch = bulkFetchRouter({
    subscriptionRows: [{ user_id: USER_A }],
    retryRows: [{ user_id: USER_A }],
  });
  const computeFn = trackedComputeCandidatesFn({ [USER_A]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.deepEqual(computeFn.calls, [USER_A]);
  assert.equal(result.usersConsidered, 1);
});

// 5. Retry query uses status=eq.claimed, attempt_count=lt.5, select=user_id.
test("processAllEligibleUsers: the retry-enumeration query has the exact expected filter/select shape", async () => {
  const fetchMock = bulkFetchRouter({ subscriptionRows: [], retryRows: [] });
  global.fetch = fetchMock;

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  const retryUrl = fetchMock.calls.find((url) => url.includes("/rest/v1/reminder_deliveries"));
  assert.ok(retryUrl, "expected a reminder_deliveries enumeration call");
  assert.ok(retryUrl.includes("status=eq.claimed"), "expected status=eq.claimed");
  assert.ok(retryUrl.includes("attempt_count=lt.5"), "expected attempt_count=lt.5");
  assert.ok(retryUrl.includes("select=user_id"), "expected select=user_id");
});

// 6. Subscription query selects only user_id.
test("processAllEligibleUsers: the subscription-enumeration query selects only user_id and no subscription material", async () => {
  const fetchMock = bulkFetchRouter({ subscriptionRows: [], retryRows: [] });
  global.fetch = fetchMock;

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  const subsUrl = fetchMock.calls.find((url) => url.includes("/rest/v1/push_subscriptions"));
  assert.ok(subsUrl, "expected a push_subscriptions enumeration call");
  assert.ok(subsUrl.includes("select=user_id"));
  for (const forbidden of ["endpoint", "p256dh", "auth_key", "user_agent", "created_at", "last_seen_at"]) {
    assert.ok(!subsUrl.includes(forbidden), `subscription enumeration query unexpectedly selected: ${forbidden}`);
  }
});

// 7. Terminal sent/abandoned users are not introduced by the retry query contract.
test("processAllEligibleUsers: the retry-enumeration query never references sent or abandoned as a status filter", async () => {
  const fetchMock = bulkFetchRouter({ subscriptionRows: [], retryRows: [] });
  global.fetch = fetchMock;

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  const retryUrl = fetchMock.calls.find((url) => url.includes("/rest/v1/reminder_deliveries"));
  assert.ok(!retryUrl.includes("eq.sent"));
  assert.ok(!retryUrl.includes("eq.abandoned"));
});

// 8 & 9. attempt_count boundary is encoded as a strict "less than 5"
// filter -- 4 is eligible, 5 is excluded, by the query string itself
// (the actual row-level filtering happens server-side in PostgREST/
// Postgres; this test proves the contract this code sends is correct).
test("processAllEligibleUsers: the attempt_count filter is strictly less-than 5 (4 eligible, 5 excluded by contract)", async () => {
  const fetchMock = bulkFetchRouter({ subscriptionRows: [], retryRows: [] });
  global.fetch = fetchMock;

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  const retryUrl = fetchMock.calls.find((url) => url.includes("/rest/v1/reminder_deliveries"));
  assert.ok(retryUrl.includes("attempt_count=lt.5"), "lt.5 means attempt_count 4 matches, attempt_count 5 does not");
});

// 10, 11, 12. Lease state (live, expired, or NULL) is never filtered at
// the enumeration layer -- the query never selects or filters on
// lease_expires_at at all, so a returned user_id is processed
// identically regardless of what lease state its row happens to carry.
for (const [label, leaseShapedExtra] of [
  ["live-lease", { lease_expires_at: "2999-01-01T00:00:00.000Z" }],
  ["expired-lease", { lease_expires_at: "2000-01-01T00:00:00.000Z" }],
  ["NULL-lease", { lease_expires_at: null }],
]) {
  test(`processAllEligibleUsers: a retry-enumerated user with a ${label} row is not filtered at the enumeration layer`, async () => {
    const fetchMock = bulkFetchRouter({
      subscriptionRows: [],
      retryRows: [{ user_id: USER_A, ...leaseShapedExtra }],
    });
    global.fetch = fetchMock;
    const computeFn = trackedComputeCandidatesFn({ [USER_A]: [] });

    const result = await processAllEligibleUsers({
      restHeaders: BULK_REST_HEADERS,
      supabaseUrl: BULK_SUPABASE_URL,
      computeCandidatesForUserFn: computeFn,
      processCandidateFn: sequencedProcessCandidateFn([]),
    });

    const retryUrl = fetchMock.calls.find((url) => url.includes("/rest/v1/reminder_deliveries"));
    assert.ok(!retryUrl.includes("lease_expires_at"), "the retry query must never filter on lease_expires_at");
    assert.deepEqual(computeFn.calls, [USER_A]);
    assert.equal(result.usersConsidered, 1);
  });
}

// 13. Subscription enumeration succeeds + retry enumeration fails: subscription users still processed.
test("processAllEligibleUsers: retry-enumeration failure does not prevent subscription-sourced users from being processed", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryThrows: true });
  const computeFn = trackedComputeCandidatesFn({ [USER_A]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.equal(result.subscriptionEnumerationSucceeded, true);
  assert.equal(result.retryEnumerationSucceeded, false);
  assert.deepEqual(computeFn.calls, [USER_A]);
  assert.equal(result.usersConsidered, 1);
});

// 14. Subscription enumeration fails + retry enumeration succeeds: retry users still processed.
test("processAllEligibleUsers: subscription-enumeration failure does not prevent retry-sourced users from being processed", async () => {
  global.fetch = bulkFetchRouter({ subscriptionThrows: true, retryRows: [{ user_id: USER_B }] });
  const computeFn = trackedComputeCandidatesFn({ [USER_B]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.equal(result.subscriptionEnumerationSucceeded, false);
  assert.equal(result.retryEnumerationSucceeded, true);
  assert.deepEqual(computeFn.calls, [USER_B]);
  assert.equal(result.usersConsidered, 1);
});

// 15. Both enumeration queries fail: safe aggregate result, zero users processed, no raw errors.
test("processAllEligibleUsers: both enumeration sources failing yields a safe zero-processing result with no raw errors", async () => {
  global.fetch = bulkFetchRouter({ subscriptionThrows: true, retryThrows: true });
  const computeFn = trackedComputeCandidatesFn({});

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.equal(result.subscriptionEnumerationSucceeded, false);
  assert.equal(result.retryEnumerationSucceeded, false);
  assert.equal(result.usersConsidered, 0);
  assert.deepEqual(computeFn.calls, []);
  assert.ok(!JSON.stringify(result).toLowerCase().includes("network is down"));
});

// 16 & 17. Non-2xx response for each source.
test("processAllEligibleUsers: subscription-enumeration non-2xx response is treated as that source failing", async () => {
  global.fetch = bulkFetchRouter({ subscriptionNonOk: true, retryRows: [] });
  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });
  assert.equal(result.subscriptionEnumerationSucceeded, false);
});

test("processAllEligibleUsers: retry-enumeration non-2xx response is treated as that source failing", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [], retryNonOk: true });
  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });
  assert.equal(result.retryEnumerationSucceeded, false);
});

// 18. Malformed JSON for either source.
test("processAllEligibleUsers: malformed JSON from either enumeration source is treated as that source failing", async () => {
  global.fetch = bulkFetchRouter({ subscriptionMalformedJson: true, retryMalformedJson: true });
  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });
  assert.equal(result.subscriptionEnumerationSucceeded, false);
  assert.equal(result.retryEnumerationSucceeded, false);
});

// 19. Successful non-array JSON for either source.
test("processAllEligibleUsers: a successful but non-array JSON body from either enumeration source is treated as that source failing", async () => {
  global.fetch = bulkFetchRouter({ subscriptionNonArray: true, retryNonArray: true });
  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({}),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });
  assert.equal(result.subscriptionEnumerationSucceeded, false);
  assert.equal(result.retryEnumerationSucceeded, false);
});

// 20 & 21. Missing/invalid timezone: computeCandidatesForUserFn already
// reports zero candidates (exactly as the real computeReminderCandidates
// does for a missing/invalid timezone) -- processCandidateFn must never
// be called, with no enumeration-layer duplication of that check.
test("processAllEligibleUsers: a user with zero current candidates (missing timezone) never reaches processCandidateFn", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn([]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [] }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 0);
  assert.equal(result.candidatesComputed, 0);
});

test("processAllEligibleUsers: a user with zero current candidates (invalid timezone) never reaches processCandidateFn", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_B }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn([]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_B]: [] }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 0);
  assert.equal(result.candidatesComputed, 0);
});

// 22 & 24. Whatever computeCandidatesForUserFn returns is passed through
// unchanged, unfiltered -- covers zero-semesters-legacy and
// active-semester candidate shapes identically, since the bulk runner
// never inspects semester/eligibility fields itself.
test("processAllEligibleUsers: candidates are forwarded to processCandidateFn exactly as computeCandidatesForUserFn produced them", async () => {
  const candidateA = bulkCandidate("legacy-activity-1");
  const candidateB = bulkCandidate("active-semester-activity-2");
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn(["sent", "sent"]);

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [candidateA, candidateB] }),
    processCandidateFn: processFn,
  });

  assert.deepEqual(processFn.calls, [candidateA, candidateB]);
});

// 23. Semesters exist but none active => zero candidates => zero processing (same as 20/21's shape).
test("processAllEligibleUsers: zero candidates from any eligibility gate (e.g. no active semester) results in zero processCandidateFn calls", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn([]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [] }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 0);
  assert.equal(result.usersConsidered, 1);
});

// 25. Multiple candidates processed sequentially, in order.
test("processAllEligibleUsers: multiple candidates for one user are processed sequentially in order", async () => {
  const candidates = [bulkCandidate("seq-1"), bulkCandidate("seq-2"), bulkCandidate("seq-3")];
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn(["sent", "sent", "sent"]);

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: candidates }),
    processCandidateFn: processFn,
  });

  assert.deepEqual(
    processFn.calls.map((c) => c.sourceId),
    ["seq-1", "seq-2", "seq-3"]
  );
});

// 26. One candidate's internal_error does not stop the next candidate.
test("processAllEligibleUsers: one candidate's internal_error outcome does not stop the next candidate for that user", async () => {
  const candidates = [bulkCandidate("err-1"), bulkCandidate("ok-2")];
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn(["internal_error", "sent"]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: candidates }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 2);
  assert.equal(result.outcomes.internal_error, 1);
  assert.equal(result.outcomes.sent, 1);
});

// 27. processCandidateFn unexpectedly throwing is counted exactly once as internal_error; next candidate still processed.
test("processAllEligibleUsers: an unexpected processCandidateFn throw is counted exactly once as internal_error and does not stop the next candidate", async () => {
  const candidates = [bulkCandidate("throw-1"), bulkCandidate("ok-2")];
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn(["throw", "sent"]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: candidates }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 2);
  assert.equal(result.outcomes.internal_error, 1);
  assert.equal(result.outcomes.sent, 1);
});

// 28. One user's computeCandidatesForUserFn throwing is counted as userProcessingErrors; next user still processed.
test("processAllEligibleUsers: one user's computeCandidatesForUserFn throw is counted as a userProcessingError and does not stop the next user", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }, { user_id: USER_B }], retryRows: [] });
  const computeFn = trackedComputeCandidatesFn({ [USER_A]: "throw", [USER_B]: [] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.deepEqual(computeFn.calls.sort(), [USER_A, USER_B].sort());
  assert.equal(result.userProcessingErrors, 1);
  assert.equal(result.usersConsidered, 2);
});

// 28b. A computeCandidatesForUserFn that RESOLVES (does not throw) with a
// malformed result must be treated identically to a thrown error --
// counted as a userProcessingError, never silently coerced into "zero
// candidates." trackedComputeCandidatesFn cannot express this (by
// design it normalizes any non-array behavior into { candidates: [] }),
// so these use a direct inline computeCandidatesForUserFn returning the
// malformed value verbatim.
for (const [label, malformedResult] of [
  ["null", null],
  ["an empty object", {}],
  ["{ candidates: null }", { candidates: null }],
  ['{ candidates: "unexpected" }', { candidates: "unexpected" }],
]) {
  test(`processAllEligibleUsers: computeCandidatesForUserFn resolving to ${label} is counted as a userProcessingError, not zero candidates`, async () => {
    global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
    const processFn = sequencedProcessCandidateFn([]);

    const result = await processAllEligibleUsers({
      restHeaders: BULK_REST_HEADERS,
      supabaseUrl: BULK_SUPABASE_URL,
      computeCandidatesForUserFn: async () => malformedResult,
      processCandidateFn: processFn,
    });

    assert.equal(result.userProcessingErrors, 1);
    assert.equal(result.candidatesComputed, 0);
    assert.equal(processFn.calls.length, 0);
  });
}

// A malformed result for one user must not stop the next user from
// processing normally.
test("processAllEligibleUsers: a malformed computeCandidatesForUserFn result for one user does not stop the next user from processing normally", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }, { user_id: USER_B }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn(["sent"]);
  const computeFn = async (userId) => (userId === USER_A ? {} : { candidates: [bulkCandidate("after-malformed")] });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: processFn,
  });

  assert.equal(result.userProcessingErrors, 1);
  assert.equal(result.candidatesComputed, 1);
  assert.equal(processFn.calls.length, 1);
});

// A legitimate { candidates: [] } result (e.g. invalid timezone) must
// remain ordinary successful processing, never a userProcessingError.
test("processAllEligibleUsers: a legitimate { candidates: [] } result is NOT counted as a userProcessingError", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const processFn = sequencedProcessCandidateFn([]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: async () => ({ candidates: [] }),
    processCandidateFn: processFn,
  });

  assert.equal(result.userProcessingErrors, 0);
  assert.equal(result.candidatesComputed, 0);
  assert.equal(processFn.calls.length, 0);
});

// 29. candidatesComputed exact count across multiple users.
test("processAllEligibleUsers: candidatesComputed is the exact sum of current candidates across all successfully-processed users", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }, { user_id: USER_B }], retryRows: [] });
  const computeFn = trackedComputeCandidatesFn({
    [USER_A]: [bulkCandidate("a1"), bulkCandidate("a2")],
    [USER_B]: [bulkCandidate("b1")],
  });

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: computeFn,
    processCandidateFn: sequencedProcessCandidateFn(["sent", "sent", "sent"]),
  });

  assert.equal(result.candidatesComputed, 3);
});

// 30 & 31. Every one of the seven outcome counts is exact, with no double-counting.
test("processAllEligibleUsers: every outcome count is exact across a mixed batch, with no double-counting", async () => {
  const candidates = Array.from({ length: 7 }, (_, i) => bulkCandidate(`mix-${i}`));
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const outcomesInOrder = [
    "sent",
    "failed_finalized",
    "ownership_not_acquired",
    "ownership_lost_after_send",
    "ownership_lost_after_failed_send",
    "lease_not_safe",
    "internal_error",
  ];
  const processFn = sequencedProcessCandidateFn(outcomesInOrder);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: candidates }),
    processCandidateFn: processFn,
  });

  assert.deepEqual(result.outcomes, {
    sent: 1,
    failed_finalized: 1,
    ownership_not_acquired: 1,
    ownership_lost_after_send: 1,
    ownership_lost_after_failed_send: 1,
    lease_not_safe: 1,
    internal_error: 1,
  });
});

// 32. Current-candidate-only behavior: a retry-enumerated user's stale
// claimed row does NOT independently trigger processCandidateFn when
// computeCandidatesForUserFn currently returns zero candidates for them.
test("processAllEligibleUsers: a retry-enumerated user's stale claimed row does not independently trigger processCandidateFn when no current candidate is produced", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [], retryRows: [{ user_id: USER_A }] });
  const processFn = sequencedProcessCandidateFn([]);

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [] }),
    processCandidateFn: processFn,
  });

  assert.equal(processFn.calls.length, 0);
  assert.equal(result.candidatesComputed, 0);
  assert.equal(result.usersConsidered, 1);
});

// 33. countAlreadyRecorded is NOT used by processAllEligibleUsers (static source check).
test("source check: processAllEligibleUsers never references countAlreadyRecorded", () => {
  const bulkRunnerStart = SOURCE_TEXT.indexOf("export async function processAllEligibleUsers");
  const handlerStart = SOURCE_TEXT.indexOf("export default async function handler");
  assert.ok(bulkRunnerStart > -1 && handlerStart > bulkRunnerStart, "processAllEligibleUsers not found before the handler");
  const bulkRunnerBody = SOURCE_TEXT.slice(bulkRunnerStart, handlerStart);
  assert.ok(!bulkRunnerBody.includes("countAlreadyRecorded"), "processAllEligibleUsers must never call countAlreadyRecorded");
});

// 34. Aggregate result never contains sensitive fields.
test("processAllEligibleUsers: aggregate result never contains userId, dedupKey, sourceId, claimToken, or any other sensitive field", async () => {
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });
  const candidate = bulkCandidate("sensitive-source-id-123", "|secret-suffix");

  const result = await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [candidate] }),
    processCandidateFn: sequencedProcessCandidateFn(["sent"]),
  });

  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of [
    USER_A.toLowerCase(),
    "sensitive-source-id-123",
    "secret-suffix",
    "dedupkey",
    "sourceid",
    "claimtoken",
    "endpoint",
    "p256dh",
    "auth_key",
    "authorization",
    "service-role-key",
  ]) {
    assert.ok(!serialized.includes(forbidden), `aggregate result leaked forbidden value: ${forbidden}`);
  }
  // Confirm the result is genuinely counts-only.
  assert.deepEqual(Object.keys(result).sort(), [
    "candidatesComputed",
    "outcomes",
    "retryEnumerationSucceeded",
    "subscriptionEnumerationSucceeded",
    "userProcessingErrors",
    "usersConsidered",
  ]);
});

// 35. No real Web Push occurs during a processAllEligibleUsers run.
test("processAllEligibleUsers: never triggers a real webpush.sendNotification call", async () => {
  webpush.sendNotification = async () => {
    throw new Error("webpush.sendNotification must never be called by processAllEligibleUsers");
  };
  global.fetch = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [] });

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [bulkCandidate("no-real-push")] }),
    processCandidateFn: sequencedProcessCandidateFn(["sent"]),
  });
  // No assertion needed beyond not throwing: the mocked
  // webpush.sendNotification above would have thrown had it been
  // reached, since processCandidateFn is injected/mocked here.
});

// 36. No non-GET request (i.e. no write) ever occurs from processAllEligibleUsers itself.
test("processAllEligibleUsers: issues only GET requests -- no reminder_deliveries or push_subscriptions write of its own", async () => {
  const fetchMock = bulkFetchRouter({ subscriptionRows: [{ user_id: USER_A }], retryRows: [{ user_id: USER_B }] });
  global.fetch = fetchMock;

  await processAllEligibleUsers({
    restHeaders: BULK_REST_HEADERS,
    supabaseUrl: BULK_SUPABASE_URL,
    computeCandidatesForUserFn: trackedComputeCandidatesFn({ [USER_A]: [], [USER_B]: [] }),
    processCandidateFn: sequencedProcessCandidateFn([]),
  });

  assert.ok(fetchMock.calls.length >= 2);
});

test("global.fetch is restored to its original value between tests (afterEach isolation)", () => {
  // By the time this test body runs, several preceding tests have each
  // set global.fetch to their own mock. If the file-wide afterEach
  // above is correctly restoring it after every test, global.fetch
  // here must be back to exactly what it was at module load time —
  // this test itself does not set it.
  assert.equal(global.fetch, originalGlobalFetch);
});
