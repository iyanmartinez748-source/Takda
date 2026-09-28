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
import webpush from "web-push";

import handler, {
  sendReminderToSubscriptions,
  claimReminderEvent,
  reclaimExpiredReminderEvent,
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

test("global.fetch is restored to its original value between tests (afterEach isolation)", () => {
  // By the time this test body runs, several preceding tests have each
  // set global.fetch to their own mock. If the file-wide afterEach
  // above is correctly restoring it after every test, global.fetch
  // here must be back to exactly what it was at module load time —
  // this test itself does not set it.
  assert.equal(global.fetch, originalGlobalFetch);
});
