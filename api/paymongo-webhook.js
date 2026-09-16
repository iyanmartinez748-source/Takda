import crypto from "crypto";

/*
  Takda PayMongo Webhook

  IMPORTANT:
  PayMongo signature verification requires the RAW request body.
  Do not enable automatic body parsing for this endpoint.
*/

export const config = {
  api: {
    bodyParser: false,
  },
};

/* =========================================================
   HELPERS
========================================================= */

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

/* =========================================================
   WEBHOOK HANDLER
========================================================= */

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
    /* =====================================================
       1. READ RAW BODY
    ===================================================== */

    const rawBody = await getRawBody(req);

    if (!rawBody) {
      return res.status(400).json({
        error: "Empty webhook body.",
      });
    }

    /* =====================================================
       2. VERIFY PAYMONGO SIGNATURE
    ===================================================== */

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

    const timestamp = Number(t);
    const now = Math.floor(Date.now() / 1000);

    /*
      Reject old webhook requests.

      This reduces replay risk.
      PayMongo retries normally generate a fresh signed request.
    */

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
      te = TEST signature
      li = LIVE signature

      A signature must cryptographically match
      the webhook secret.
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

    /* =====================================================
       3. PARSE JSON AFTER SIGNATURE VERIFICATION
    ===================================================== */

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
      Takda currently processes only successful
      Checkout Session payments.
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

    /* =====================================================
       4. READ CHECKOUT SESSION
    ===================================================== */

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

    /*
      PayMongo's manually generated Test Event uses
      generic sample data and may not contain Takda metadata.

      It must never activate a subscription.
    */

    if (
      !checkoutSessionId ||
      !takdaOrderId ||
      !takdaUserId ||
      !takdaPlan ||
      !takdaReference
    ) {
      console.log(
        "Paid checkout ignored: missing Takda metadata."
      );

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "missing_takda_metadata",
      });
    }

    if (
      takdaPlan !== "monthly" &&
      takdaPlan !== "yearly"
    ) {
      console.error(
        "Invalid Takda plan metadata."
      );

      return res.status(400).json({
        error: "Invalid Takda plan metadata.",
      });
    }

    /* =====================================================
       5. LOAD TAKDA ORDER

       Never trust PayMongo metadata alone.
    ===================================================== */

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
      const errorText =
        await orderResponse.text();

      console.error(
        "Unable to read Takda order:",
        errorText
      );

      return res.status(500).json({
        error: "Unable to verify Takda order.",
      });
    }

    const orders =
      await orderResponse.json();

    const order =
      orders?.[0];

    if (!order) {
      console.error(
        "Takda order not found:",
        takdaOrderId
      );

      return res.status(404).json({
        error: "Takda order not found.",
      });
    }

    /* =====================================================
       6. VERIFY ORDER ↔ PAYMONGO PAYMENT
    ===================================================== */

    if (
      order.user_id !== takdaUserId ||
      order.plan !== takdaPlan ||
      order.reference_number !== takdaReference
    ) {
      console.error(
        "Takda payment/order mismatch."
      );

      return res.status(400).json({
        error: "Payment order mismatch.",
      });
    }

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

    /* =====================================================
       7. VERIFY PAYMENT INFORMATION
    ===================================================== */

    const payment =
      attributes?.payments?.[0] || null;

    const paymentId =
      payment?.id ||
      attributes?.payment_intent?.id ||
      null;

    /*
      The webhook event itself represents a successful
      Checkout Session payment.

      When PayMongo includes payment status, make sure
      it is actually paid.
    */

    const paymentStatus =
      payment?.attributes?.status;

    if (
      paymentStatus &&
      paymentStatus !== "paid"
    ) {
      console.error(
        "Checkout payment is not marked paid:",
        paymentStatus
      );

      return res.status(400).json({
        error: "Payment is not paid.",
      });
    }

    /* =====================================================
       8. FAST IDEMPOTENCY CHECK

       The database RPC below is the authoritative
       idempotency protection.

       This check simply avoids unnecessary work for
       already-processed orders.
    ===================================================== */

    if (order.status === "paid") {
      return res.status(200).json({
        received: true,
        alreadyProcessed: true,
      });
    }

    if (order.status !== "pending") {
      console.log(
        "Takda order ignored because status is:",
        order.status
      );

      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    /* =====================================================
       9. ATOMIC TAKDA PRO ACTIVATION

       activate_takda_pro() performs:

       - row locking
       - duplicate protection
       - profile activation
       - subscription extension
       - order finalization

       inside ONE PostgreSQL transaction.

       If any database operation fails,
       the entire transaction rolls back.
    ===================================================== */

    const activationResponse =
      await supabaseRequest(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        "rpc/activate_takda_pro",
        {
          method: "POST",

          headers: {
            Prefer: "return=representation",
          },

          body: JSON.stringify({
            p_order_id: order.id,
            p_user_id: order.user_id,
            p_checkout_session_id:
              checkoutSessionId,
            p_payment_id:
              paymentId,
            p_plan:
              order.plan,
          }),
        }
      );

    const activationText =
      await activationResponse.text();

    if (!activationResponse.ok) {
      console.error(
        "Atomic Takda Pro activation failed:",
        activationText
      );

      /*
        Return 500 so PayMongo can retry.

        Because activation is now transactional,
        a failed transaction cannot leave the
        profile upgraded while the order remains
        pending.
      */

      return res.status(500).json({
        error: "Unable to activate Takda Pro.",
      });
    }

    let activationResult = null;

    if (activationText) {
      try {
        activationResult =
          JSON.parse(activationText);
      } catch {
        activationResult = null;
      }
    }

    /* =====================================================
       10. SUCCESS
    ===================================================== */

    if (
      activationResult?.already_processed ===
      true
    ) {
      console.log(
        `Takda order ${order.id} was already processed.`
      );

      return res.status(200).json({
        received: true,
        alreadyProcessed: true,
      });
    }

    if (
      activationResult?.ignored === true
    ) {
      console.log(
        `Takda order ${order.id} was ignored by activation RPC.`
      );

      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    console.log(
      `Takda Pro atomically activated for order ${order.id}`
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
