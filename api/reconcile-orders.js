export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const RECONCILE_SECRET = process.env.RECONCILE_SECRET;
  const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !RECONCILE_SECRET ||
    !PAYMONGO_SECRET_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error("Missing reconciliation environment variables.");

    return res.status(500).json({
      error: "Server configuration is incomplete.",
    });
  }

  /* =========================================
     1. VERIFY RECONCILIATION SECRET
  ========================================= */

  const authHeader = req.headers.authorization || "";

  const suppliedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!suppliedSecret || suppliedSecret !== RECONCILE_SECRET) {
    return res.status(401).json({
      error: "Unauthorized.",
    });
  }

  try {
    /* =========================================
       2. LOAD PENDING TAKDA ORDERS
    ========================================= */

    const ordersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_orders?status=eq.pending&checkout_session_id=not.is.null&select=id,user_id,plan,amount,status,reference_number,checkout_session_id,created_at&order=created_at.asc&limit=100`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const orders = await ordersResponse.json();

    if (!ordersResponse.ok || !Array.isArray(orders)) {
      console.error("Unable to load pending orders:", orders);

      return res.status(500).json({
        error: "Unable to load pending Takda orders.",
      });
    }

    const results = [];

    /* =========================================
       3. CHECK EACH ORDER WITH PAYMONGO
    ========================================= */

    for (const order of orders) {
      try {
        const checkoutResponse = await fetch(
          `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(
            order.checkout_session_id
          )}`,
          {
            method: "GET",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString(
                  "base64"
                ),
              Accept: "application/json",
            },
          }
        );

        const checkoutData = await checkoutResponse.json();

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

        const checkout = checkoutData?.data;
        const attributes = checkout?.attributes || {};
        const metadata = attributes.metadata || {};
        const payments = Array.isArray(attributes.payments)
          ? attributes.payments
          : [];

        /* =========================================
           4. VERIFY TAKDA METADATA
        ========================================= */

        const metadataMatches =
          metadata.takda_order_id === order.id &&
          metadata.takda_user_id === order.user_id &&
          metadata.takda_plan === order.plan &&
          metadata.takda_reference === order.reference_number;

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

        if (checkout?.id !== order.checkout_session_id) {
          results.push({
            orderId: order.id,
            action: "checkout_mismatch",
          });

          continue;
        }

        if (
          attributes.reference_number !== order.reference_number
        ) {
          results.push({
            orderId: order.id,
            action: "reference_mismatch",
          });

          continue;
        }

        /* =========================================
           5. FIND CONFIRMED PAID PAYMENT
        ========================================= */

        const paidPayment = payments.find(
          (payment) =>
            payment?.attributes?.status === "paid"
        );

        const paymentIntentStatus =
          attributes?.payment_intent?.attributes?.status ||
          null;

        const confirmedPaid =
          Boolean(paidPayment?.id) ||
          paymentIntentStatus === "succeeded";

        /*
          IMPORTANT:
          Reconciliation only performs a recovery
          when PayMongo confirms successful payment.

          It does NOT guess that an active/unpaid
          checkout is failed or expired.
        */

        if (!confirmedPaid) {
          results.push({
            orderId: order.id,
            action: "still_pending",
            checkoutStatus: attributes.status || null,
            paymentIntentStatus,
          });

          continue;
        }

        /* =========================================
           6. VERIFY SERVER-SIDE PRICE
        ========================================= */

        const expectedAmount =
          order.plan === "monthly"
            ? 2900
            : order.plan === "yearly"
            ? 29900
            : null;

        if (!expectedAmount || order.amount !== expectedAmount) {
          console.error(
            `Amount/plan mismatch for Takda order ${order.id}`
          );

          results.push({
            orderId: order.id,
            action: "amount_mismatch",
          });

          continue;
        }

        /* =========================================
           7. ATOMICALLY ACTIVATE TAKDA PRO
        ========================================= */

        const rpcResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/rpc/activate_takda_pro`,
          {
            method: "POST",
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_order_id: order.id,
              p_user_id: order.user_id,
              p_checkout_session_id:
                order.checkout_session_id,
              p_payment_id: paidPayment?.id || null,
              p_plan: order.plan,
            }),
          }
        );

        const rpcData = await rpcResponse.json();

        if (!rpcResponse.ok) {
          console.error(
            `Reconciliation RPC failed for order ${order.id}:`,
            rpcData
          );

          results.push({
            orderId: order.id,
            action: "activation_failed",
          });

          continue;
        }

        results.push({
          orderId: order.id,
          action: rpcData?.processed
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

    /* =========================================
       8. RETURN SAFE SUMMARY
    ========================================= */

    const summary = {
      checked: results.length,
      activated: results.filter(
        (item) => item.action === "activated"
      ).length,
      stillPending: results.filter(
        (item) => item.action === "still_pending"
      ).length,
      issues: results.filter(
        (item) =>
          ![
            "activated",
            "already_processed",
            "still_pending",
            "ignored",
          ].includes(item.action)
      ).length,
    };

    console.log("Takda reconciliation complete:", summary);

    return res.status(200).json({
      success: true,
      summary,
      results,
    });
  } catch (error) {
    console.error("Takda reconciliation error:", error);

    return res.status(500).json({
      error: "Unable to reconcile Takda orders.",
    });
  }
}
