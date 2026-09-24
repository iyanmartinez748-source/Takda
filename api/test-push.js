import webpush from "web-push";

/* =========================================================
   TAKDA PHASE 9E STAGE 9E-3A — WEB PUSH TEST DELIVERY

   Purpose:
   Prove secure background push delivery end-to-end by sending ONE
   controlled test notification to the AUTHENTICATED caller's own
   registered device(s) — nothing more.

   SCOPE:
   This endpoint sends a fixed test payload only. It is not a general
   push-sending API, not a scheduler, and not a queue. No Activity or
   Class reminder content is ever read or sent from here.

   SECURITY RULE:
   The caller's identity is derived ONLY from verifying their Supabase
   access token against Supabase's own /auth/v1/user endpoint — the
   exact same pattern api/create-checkout.js already uses. A user_id is
   never accepted from the request body/query and never trusted from
   the client. push_subscriptions rows are always loaded filtered by
   THIS verified id, so a caller can only ever reach their own rows,
   independent of and in addition to the table's own RLS.
========================================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL;

  const SUPABASE_PUBLISHABLE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const VAPID_PUBLIC_KEY =
    process.env.VITE_VAPID_PUBLIC_KEY;

  const VAPID_PRIVATE_KEY =
    process.env.VAPID_PRIVATE_KEY;

  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY
  ) {
    console.error("Missing server push configuration environment variables.");

    return res.status(500).json({
      error: "Server push configuration is incomplete.",
    });
  }

  try {
    // VAPID subject is not secret — a contact identifying this
    // application to push services, exactly what VAPID's spec expects
    // here. Reuses the same support address already shown in the app's
    // own footer. Inside the try block so a malformed key pair returns
    // the same clean 500 as everything else below, never an unhandled
    // crash.
    webpush.setVapidDetails(
      "mailto:iyanmartinez748@gmail.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    /* =========================================
       1. GET ACCESS TOKEN
    ========================================= */

    const authHeader = req.headers.authorization || "";

    const accessToken =
      authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!accessToken) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    /* =========================================
       2. VERIFY USER WITH SUPABASE

       This is the ONLY source of the caller's identity for this
       request. Nothing from req.body/req.query is ever used to decide
       whose subscriptions get loaded or sent to.
    ========================================= */

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const user = await userResponse.json();

    if (
      !userResponse.ok ||
      !user?.id
    ) {
      return res.status(401).json({
        error: "Invalid or expired Takda session.",
      });
    }

    /* =========================================
       3. LOAD ONLY THIS USER'S OWN SUBSCRIPTIONS

       Uses the service-role key (bypasses RLS, the same precedent
       already established by api/reconcile-orders.js) — but every
       query below is still explicitly filtered by the verified user.id
       from step 2, never a client-supplied value. RLS on
       push_subscriptions is unchanged and unrelated to this filter;
       this is defense-in-depth on top of it, not a replacement for it.
    ========================================= */

    const subsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user.id}&select=id,endpoint,p256dh,auth_key`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

          Accept: "application/json",
        },
      }
    );

    const subscriptions = await subsResponse.json();

    if (
      !subsResponse.ok ||
      !Array.isArray(subscriptions)
    ) {
      console.error("Unable to load push subscriptions:", subscriptions);

      return res.status(500).json({
        error: "Unable to load push subscriptions.",
      });
    }

    if (subscriptions.length === 0) {
      return res.status(200).json({
        sent: 0,
        failed: 0,
        removed: 0,
        message: "No push subscription found for this account. Enable notifications first.",
      });
    }

    /* =========================================
       4. SEND THE TEST PAYLOAD TO EVERY SUBSCRIPTION

       A fixed, non-configurable test payload — this endpoint never
       accepts a title/body from the caller. Every subscription is sent
       to independently (Promise.allSettled) so one device's failure
       never blocks delivery to the caller's other devices.
    ========================================= */

    const payload = JSON.stringify({
      title: "Takda",
      body: "Background notifications are working.",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth_key,
              },
            },
            payload
          )
          .then(() => ({ id: sub.id, ok: true }))
          .catch((error) => ({
            id: sub.id,
            ok: false,
            statusCode: error?.statusCode,
          }))
      )
    );

    /* =========================================
       5. CLEAN UP DEAD SUBSCRIPTIONS (404/410 ONLY)

       Any other failure (network error, provider 5xx, malformed keys)
       is left alone — it may still be a valid subscription, and this
       stage has no retry/queue to decide otherwise.
    ========================================= */

    const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false }));

    const staleIds = outcomes
      .filter((o) => !o.ok && (o.statusCode === 404 || o.statusCode === 410))
      .map((o) => o.id)
      .filter(Boolean);

    if (staleIds.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(",")})&user_id=eq.${user.id}`,
        {
          method: "DELETE",

          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
    }

    /* =========================================
       6. RETURN MINIMAL STATUS ONLY

       Counts only — never the subscription rows themselves (no
       endpoint/p256dh/auth_key), and never any VAPID key material.
    ========================================= */

    const sentCount = outcomes.filter((o) => o.ok).length;
    const failedCount = outcomes.length - sentCount;

    return res.status(200).json({
      sent: sentCount,
      failed: failedCount,
      removed: staleIds.length,
    });
  } catch (error) {
    console.error("Takda test push error:", error);

    return res.status(500).json({
      error: "Unable to send test push notification.",
    });
  }
}
