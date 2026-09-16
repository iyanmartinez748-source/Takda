import crypto from "crypto";

/* =========================================================
   TAKDA PAYMONGO ORDER RECONCILIATION

   Purpose:
   Recover legitimate paid PayMongo Checkout Sessions when
   the normal webhook was delayed, missed, or temporarily
   failed.

   SECURITY RULE:
   Reconciliation must NEVER be easier to pass than the
   primary PayMongo webhook.
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function safeSecretCompare(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    !a ||
    !b
  ) {
    return false;
  }

  try {
    const aBuffer = Buffer.from(a, "utf8");
    const bBuffer = Buffer.from(b, "utf8");

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

/* =========================================================
   HANDLER
========================================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const RECONCILE_SECRET =
    process.env.RECONCILE_SECRET;

  const PAYMONGO_SECRET_KEY =
    process.env.PAYMONGO_SECRET_KEY;

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL;

  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !RECONCILE_SECRET ||
    !PAYMONGO_SECRET_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "Missing reconciliation environment variables."
    );

    return res.status(500).json({
      error: "Server configuration is incomplete.",
    });
  }

  /* =====================================================
     1. VERIFY RECONCILIATION SECRET
  ===================================================== */

  const authHeader =
    req.headers.authorization || "";

  const suppliedSecret =
    authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (
    !safeSecretCompare(
      suppliedSecret,
      RECONCILE_SECRET
    )
  ) {
    return res.status(401).json({
      error: "Unauthorized.",
    });
  }

  try {
    /* =====================================================
       2. LOAD PENDING TAKDA ORDERS
    ===================================================== */

    const ordersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_orders?status=eq.pending&checkout_session_id=not.is.null&select=id,user_id,plan,amount,status,reference_number,checkout_session_id,created_at&order=created_at.asc&limit=100`,
      {
        method: "GET",

        headers: {
          apikey:
            SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

          Accept:
            "application/json",
        },
      }
    );

    const orders =
      await ordersResponse.json();

    if (
      !ordersResponse.ok ||
      !Array.isArray(orders)
    ) {
      console.error(
        "Unable to load pending orders:",
        orders
      );

      return res.status(500).json({
        error:
          "Unable to load pending Takda orders.",
      });
    }

    const results = [];

    /* =====================================================
       3. CHECK EACH ORDER WITH PAYMONGO
    ===================================================== */

    for (const order of orders) {
      try {
        const checkoutResponse =
          await fetch(
            `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(
              order.checkout_session_id
            )}`,
            {
              method: "GET",

              headers: {
                Authorization:
                  "Basic " +
                  Buffer.from(
                    `${PAYMONGO_SECRET_KEY}:`
                  ).toString("base64"),

                Accept:
                  "application/json",
              },
            }
          );

        const checkoutData =
          await checkoutResponse.json();

        if (!checkoutResponse.ok) {
          console.error(
            `Unable to retrieve checkout ${order.checkout_session_id}:`,
            checkoutData
          );

          results.push({
            orderId: order.id,
            action: "lookup_failed",
          });

          continue;
        }

        const checkout =
          checkoutData?.data;

        const attributes =
          checkout?.attributes || {};

        const metadata =
          attributes?.metadata || {};

        const payments =
          Array.isArray(attributes?.payments)
            ? attributes.payments
            : [];

        /* =================================================
           4. VERIFY TAKDA METADATA
        ================================================= */

        const metadataMatches =
          metadata.takda_order_id ===
            order.id &&
          metadata.takda_user_id ===
            order.user_id &&
          metadata.takda_plan ===
            order.plan &&
          metadata.takda_reference ===
            order.reference_number;

        if (!metadataMatches) {
          console.error(
            `Metadata mismatch for Takda order ${order.id}`
          );

          results.push({
            orderId: order.id,
            action: "metadata_mismatch",
          });

          continue;
        }

        /* =================================================
           5. VERIFY CHECKOUT ID + REFERENCE
        ================================================= */

        if (
          checkout?.id !==
          order.checkout_session_id
        ) {
          console.error(
            `Checkout mismatch for Takda order ${order.id}`
          );

          results.push({
            orderId: order.id,
            action: "checkout_mismatch",
          });

          continue;
        }

        if (
          attributes.reference_number !==
          order.reference_number
        ) {
          console.error(
            `Reference mismatch for Takda order ${order.id}`
          );

          results.push({
            orderId: order.id,
            action: "reference_mismatch",
          });

          continue;
        }

        /* =================================================
           6. REQUIRE ACTUAL PAID PAYMENT OBJECT
        ================================================= */

        const paidPayment =
          payments.find(
            (payment) =>
              payment?.id &&
              payment?.attributes?.status ===
                "paid"
          ) || null;

        const paymentIntentStatus =
          attributes?.payment_intent
            ?.attributes?.status || null;

        /*
          IMPORTANT:

          A succeeded Payment Intent alone is NOT enough
          to activate Takda Pro.

          Reconciliation requires an actual PayMongo
          Payment object whose status is "paid".
        */

        if (!paidPayment?.id) {
          results.push({
            orderId: order.id,
            action: "still_pending",
            checkoutStatus:
              attributes?.status || null,
            paymentIntentStatus,
          });

          continue;
        }

        /* =================================================
           7. VERIFY SERVER-SIDE PLAN + PRICE
        ================================================= */

        const expectedAmount =
          order.plan === "monthly"
            ? 2900
            : order.plan === "yearly"
            ? 29900
            : null;

        if (!expectedAmount) {
          console.error(
            `Invalid plan for Takda order ${order.id}`
          );

          results.push({
            orderId: order.id,
            action: "invalid_plan",
          });

          continue;
        }

        if (
          Number(order.amount) !==
          expectedAmount
        ) {
          console.error(
            `Takda order amount mismatch for ${order.id}`,
            {
              expectedAmount,
              orderAmount:
                order.amount,
            }
          );

          results.push({
            orderId: order.id,
            action: "order_amount_mismatch",
          });

          continue;
        }

        /* =================================================
           8. VERIFY PAYMONGO PAYMENT AMOUNT + CURRENCY
        ================================================= */

        const paymentAmount =
          Number(
            paidPayment?.attributes?.amount
          );

        const paymentCurrency =
          String(
            paidPayment?.attributes?.currency ||
              ""
          ).toUpperCase();

        if (
          !Number.isInteger(paymentAmount) ||
          paymentAmount !== expectedAmount
        ) {
          console.error(
            `PayMongo payment amount mismatch for ${order.id}`,
            {
              expectedAmount,
              paymentAmount,
            }
          );

          results.push({
            orderId: order.id,
            action:
              "payment_amount_mismatch",
          });

          continue;
        }

        if (paymentCurrency !== "PHP") {
          console.error(
            `PayMongo payment currency mismatch for ${order.id}`,
            paymentCurrency
          );

          results.push({
            orderId: order.id,
            action:
              "payment_currency_mismatch",
          });

          continue;
        }

        /* =================================================
           9. OPTIONAL PAYMENT METADATA CROSS-CHECK

           PayMongo's Payment object normally carries
           the metadata from the Checkout Session.

           If present, it must agree with Takda's order.
        ================================================= */

        const paymentMetadata =
          paidPayment?.attributes?.metadata;

        if (
          paymentMetadata &&
          typeof paymentMetadata === "object"
        ) {
          const paymentMetadataMatches =
            paymentMetadata.takda_order_id ===
              order.id &&
            paymentMetadata.takda_user_id ===
              order.user_id &&
            paymentMetadata.takda_plan ===
              order.plan &&
            paymentMetadata.takda_reference ===
              order.reference_number;

          if (!paymentMetadataMatches) {
            console.error(
              `Payment metadata mismatch for Takda order ${order.id}`
            );

            results.push({
              orderId: order.id,
              action:
                "payment_metadata_mismatch",
            });

            continue;
          }
        }

        /* =================================================
           10. ATOMICALLY ACTIVATE TAKDA PRO
        ================================================= */

        const rpcResponse =
          await fetch(
            `${SUPABASE_URL}/rest/v1/rpc/activate_takda_pro`,
            {
              method: "POST",

              headers: {
                apikey:
                  SUPABASE_SERVICE_ROLE_KEY,

                Authorization:
                  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                p_order_id:
                  order.id,

                p_user_id:
                  order.user_id,

                p_checkout_session_id:
                  order.checkout_session_id,

                p_payment_id:
                  paidPayment.id,

                p_plan:
                  order.plan,
              }),
            }
          );

        const rpcText =
          await rpcResponse.text();

        let rpcData = null;

        if (rpcText) {
          try {
            rpcData =
              JSON.parse(rpcText);
          } catch {
            rpcData = null;
          }
        }

        if (!rpcResponse.ok) {
          console.error(
            `Reconciliation RPC failed for order ${order.id}:`,
            rpcText
          );

          results.push({
            orderId: order.id,
            action: "activation_failed",
          });

          continue;
        }

        results.push({
          orderId: order.id,

          action:
            rpcData?.processed
              ? "activated"
              : rpcData?.already_processed
              ? "already_processed"
              : "ignored",
        });
      } catch (orderError) {
        console.error(
          `Reconciliation error for order ${order.id}:`,
          orderError
        );

        results.push({
          orderId: order.id,
          action: "error",
        });
      }
    }

    /* =====================================================
       11. RETURN SAFE SUMMARY
    ===================================================== */

    const safeActions = [
      "activated",
      "already_processed",
      "still_pending",
      "ignored",
    ];

    const summary = {
      checked:
        results.length,

      activated:
        results.filter(
          (item) =>
            item.action === "activated"
        ).length,

      stillPending:
        results.filter(
          (item) =>
            item.action === "still_pending"
        ).length,

      issues:
        results.filter(
          (item) =>
            !safeActions.includes(
              item.action
            )
        ).length,
    };

    console.log(
      "Takda reconciliation complete:",
      summary
    );

    return res.status(200).json({
      success: true,
      summary,
      results,
    });
  } catch (error) {
    console.error(
      "Takda reconciliation error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to reconcile Takda orders.",
    });
  }
}
