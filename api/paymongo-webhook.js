import crypto from "crypto";

/*
  IMPORTANT:
  PayMongo requires the RAW request body for signature verification.
  Vercel/Next-style API parsing is disabled for this endpoint.
*/
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks).toString("utf8");
}

function safeCompare(a, b) {
  if (!a || !b) return false;

  try {
    const aBuffer = Buffer.from(a, "hex");
    const bBuffer = Buffer.from(b, "hex");

    if (
      aBuffer.length === 0 ||
      aBuffer.length !== bBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

function parsePaymongoSignature(header) {
  const parts = {};

  String(header || "")
    .split(",")
    .forEach((part) => {
      const index = part.indexOf("=");

      if (index === -1) return;

      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      parts[key] = value;
    });

  return parts;
}

async function supabaseRequest(
  supabaseUrl,
  serviceRoleKey,
  path,
  options = {}
) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,

    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL;

  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  /*
    We will add this to Vercel after PayMongo
    generates the webhook secret.
  */
  const PAYMONGO_WEBHOOK_SECRET =
    process.env.PAYMONGO_WEBHOOK_SECRET;

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !PAYMONGO_WEBHOOK_SECRET
  ) {
    console.error(
      "Takda webhook server configuration is incomplete."
    );

    return res.status(500).json({
      error: "Webhook configuration incomplete.",
    });
  }

  try {
    /* =========================================
       1. GET RAW PAYMONGO REQUEST BODY
    ========================================= */

    const rawBody = await getRawBody(req);

    if (!rawBody) {
      return res.status(400).json({
        error: "Empty webhook body.",
      });
    }

    /* =========================================
       2. READ PAYMONGO SIGNATURE
    ========================================= */

    const signatureHeader =
      req.headers["paymongo-signature"];

    if (!signatureHeader) {
      return res.status(401).json({
        error: "Missing PayMongo signature.",
      });
    }

    const {
      t,
      te,
      li,
    } = parsePaymongoSignature(signatureHeader);

    if (!t) {
      return res.status(401).json({
        error: "Invalid PayMongo signature.",
      });
    }

    /* =========================================
       3. OPTIONAL REPLAY PROTECTION

       Reject webhook timestamps older than
       5 minutes.
    ========================================= */

    const timestamp = Number(t);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(timestamp) ||
      Math.abs(now - timestamp) > 300
    ) {
      console.error(
        "Rejected old PayMongo webhook."
      );

      return res.status(401).json({
        error: "Webhook timestamp expired.",
      });
    }

    /* =========================================
       4. GENERATE EXPECTED HMAC SHA-256

       PayMongo:
       timestamp + "." + raw JSON payload
    ========================================= */

    const signedPayload =
      `${t}.${rawBody}`;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          PAYMONGO_WEBHOOK_SECRET
        )
        .update(signedPayload)
        .digest("hex");

    /*
      TEST webhooks use te.
      LIVE webhooks use li.

      During development we accept a valid
      signature from either field, but it MUST
      cryptographically match our webhook secret.
    */

    const validTestSignature =
      safeCompare(
        expectedSignature,
        te
      );

    const validLiveSignature =
      safeCompare(
        expectedSignature,
        li
      );

    if (
      !validTestSignature &&
      !validLiveSignature
    ) {
      console.error(
        "Invalid PayMongo webhook signature."
      );

      return res.status(401).json({
        error: "Invalid webhook signature.",
      });
    }

    /* =========================================
       5. PARSE JSON ONLY AFTER VERIFICATION
    ========================================= */

    let event;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON payload.",
      });
    }

    const eventType =
      event?.data?.attributes?.type;

    /*
      We only care about successful
      Hosted Checkout payments.
    */

    if (
      eventType !==
      "checkout_session.payment.paid"
    ) {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    /* =========================================
       6. GET CHECKOUT SESSION FROM EVENT
    ========================================= */

    const checkoutSession =
      event?.data?.attributes?.data;

    const checkoutSessionId =
      checkoutSession?.id;

    const attributes =
      checkoutSession?.attributes || {};

    const metadata =
      attributes?.metadata || {};

    const takdaOrderId =
      metadata?.takda_order_id;

    const takdaUserId =
      metadata?.takda_user_id;

    const takdaPlan =
      metadata?.takda_plan;

    const takdaReference =
      metadata?.takda_reference ||
      attributes?.reference_number;

    if (
      !checkoutSessionId ||
      !takdaOrderId ||
      !takdaUserId ||
      !takdaPlan ||
      !takdaReference
    ) {
      console.error(
        "Paid checkout missing Takda metadata."
      );

      return res.status(400).json({
        error: "Missing Takda payment metadata.",
      });
    }

    if (
      takdaPlan !== "monthly" &&
      takdaPlan !== "yearly"
    ) {
      return res.status(400).json({
        error: "Invalid Takda plan metadata.",
      });
    }

    /* =========================================
       7. LOAD THE INTERNAL TAKDA ORDER

       We do NOT trust metadata alone.
    ========================================= */

    const orderResponse =
      await supabaseRequest(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        `pro_orders?id=eq.${encodeURIComponent(
          takdaOrderId
        )}&select=*`,
        {
          method: "GET",
        }
      );

    if (!orderResponse.ok) {
      console.error(
        "Unable to read Takda order."
      );

      return res.status(500).json({
        error: "Unable to verify Takda order.",
      });
    }

    const orders =
      await orderResponse.json();

    const order = orders?.[0];

    if (!order) {
      console.error(
        "Takda order not found:",
        takdaOrderId
      );

      return res.status(404).json({
        error: "Takda order not found.",
      });
    }

    /* =========================================
       8. VERIFY ORDER ↔ PAYMENT MATCH
    ========================================= */

    if (
      order.user_id !== takdaUserId ||
      order.plan !== takdaPlan ||
      order.reference_number !==
        takdaReference
    ) {
      console.error(
        "Takda payment/order mismatch."
      );

      return res.status(400).json({
        error: "Payment order mismatch.",
      });
    }

    /*
      If create-checkout already stored a
      checkout session ID, it must match.
    */

    if (
      order.checkout_session_id &&
      order.checkout_session_id !==
        checkoutSessionId
    ) {
      console.error(
        "Checkout session mismatch."
      );

      return res.status(400).json({
        error: "Checkout session mismatch.",
      });
    }

    /* =========================================
       9. IDEMPOTENCY

       PayMongo may send the same webhook
       more than once.

       If already PAID, acknowledge it without
       extending Pro again.
    ========================================= */

    if (order.status === "paid") {
      return res.status(200).json({
        received: true,
        alreadyProcessed: true,
      });
    }

    if (order.status !== "pending") {
      console.error(
        "Order is not pending:",
        order.status
      );

      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    /* =========================================
       10. GET CURRENT TAKDA PROFILE
    ========================================= */

    const profileResponse =
      await supabaseRequest(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        `profiles?id=eq.${encodeURIComponent(
          order.user_id
        )}&select=id,plan,pro_until`,
        {
          method: "GET",
        }
      );

    if (!profileResponse.ok) {
      console.error(
        "Unable to read Takda profile."
      );

      return res.status(500).json({
        error: "Unable to activate Takda Pro.",
      });
    }

    const profiles =
      await profileResponse.json();

    const profile =
      profiles?.[0];

    if (!profile) {
      return res.status(404).json({
        error: "Takda profile not found.",
      });
    }

    /* =========================================
       11. CALCULATE NEW PRO EXPIRATION

       Existing active Pro:
       extend from current expiration.

       Otherwise:
       start from now.
    ========================================= */

    const nowDate = new Date();

    const currentProUntil =
      profile.pro_until
        ? new Date(profile.pro_until)
        : null;

    const hasActivePro =
      currentProUntil &&
      !Number.isNaN(
        currentProUntil.getTime()
      ) &&
      currentProUntil.getTime() >
        nowDate.getTime();

    const newProUntil =
      hasActivePro
        ? new Date(currentProUntil)
        : new Date(nowDate);

    if (order.plan === "monthly") {
      newProUntil.setUTCMonth(
        newProUntil.getUTCMonth() + 1
      );
    } else {
      newProUntil.setUTCFullYear(
        newProUntil.getUTCFullYear() + 1
      );
    }

    /* =========================================
       12. ACTIVATE TAKDA PRO
    ========================================= */

    const updateProfileResponse =
      await supabaseRequest(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        `profiles?id=eq.${encodeURIComponent(
          order.user_id
        )}`,
        {
          method: "PATCH",

          headers: {
            Prefer: "return=minimal",
          },

          body: JSON.stringify({
            plan: "pro",
            pro_until:
              newProUntil.toISOString(),
          }),
        }
      );

    if (!updateProfileResponse.ok) {
      console.error(
        "Failed to activate Takda Pro."
      );

      return res.status(500).json({
        error: "Unable to activate Takda Pro.",
      });
    }

    /* =========================================
       13. MARK ORDER AS PAID
    ========================================= */

    const paymentId =
      attributes?.payments?.[0]?.id ||
      attributes?.payment_intent?.id ||
      null;

    const updateOrderResponse =
      await supabaseRequest(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        `pro_orders?id=eq.${encodeURIComponent(
          order.id
        )}`,
        {
          method: "PATCH",

          headers: {
            Prefer: "return=minimal",
          },

          body: JSON.stringify({
            status: "paid",

            checkout_session_id:
              checkoutSessionId,

            payment_id:
              paymentId,

            paid_at:
              new Date().toISOString(),
          }),
        }
      );

    if (!updateOrderResponse.ok) {
      /*
        Important:
        Profile was already upgraded.

        Returning 500 allows PayMongo to retry.
        On retry the order is still pending,
        but extending Pro again would be dangerous.

        This case should be investigated in logs.
      */

      console.error(
        "PRO activated but order status update failed."
      );

      return res.status(500).json({
        error:
          "Order finalization failed.",
      });
    }

    /* =========================================
       14. SUCCESS
    ========================================= */

    console.log(
      `Takda Pro activated for order ${order.id}`
    );

    return res.status(200).json({
      received: true,
      processed: true,
    });
  } catch (error) {
    console.error(
      "Takda PayMongo webhook error:",
      error
    );

    return res.status(500).json({
      error: "Webhook processing failed.",
    });
  }
}
