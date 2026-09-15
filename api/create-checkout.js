export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const PAYMONGO_SECRET_KEY =
    process.env.PAYMONGO_SECRET_KEY;

  const SUPABASE_URL =
    process.env.VITE_SUPABASE_URL;

  const SUPABASE_PUBLISHABLE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !PAYMONGO_SECRET_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error("Missing server environment variables.");

    return res.status(500).json({
      error: "Server payment configuration is incomplete.",
    });
  }

  try {
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
      !user?.id ||
      !user?.email
    ) {
      return res.status(401).json({
        error: "Invalid or expired Takda session.",
      });
    }

    /* =========================================
       3. VALIDATE PLAN
    ========================================= */

    const { plan } = req.body || {};

    const plans = {
      monthly: {
        amount: 2900,
        label: "Takda Pro — Monthly",
      },

      yearly: {
        amount: 29900,
        label: "Takda Pro — Yearly",
      },
    };

    const selectedPlan = plans[plan];

    if (!selectedPlan) {
      return res.status(400).json({
        error: "Invalid Takda Pro plan.",
      });
    }

    /*
      IMPORTANT:
      Amount comes from the SERVER.

      monthly = ₱29 = 2900 centavos
      yearly  = ₱299 = 29900 centavos
    */

    /* =========================================
       4. CREATE UNIQUE TAKDA REFERENCE
    ========================================= */

    const randomPart =
      crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 10)
        .toUpperCase();

    const referenceNumber =
      `TAKDA-${Date.now()}-${randomPart}`;

    /* =========================================
       5. CREATE PENDING ORDER IN SUPABASE
    ========================================= */

    const orderResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_orders`,
      {
        method: "POST",

        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

          "Content-Type": "application/json",

          Prefer: "return=representation",
        },

        body: JSON.stringify({
          user_id: user.id,
          plan,
          amount: selectedPlan.amount,
          status: "pending",
          reference_number: referenceNumber,
        }),
      }
    );

    const orderData = await orderResponse.json();

    if (
      !orderResponse.ok ||
      !Array.isArray(orderData) ||
      !orderData[0]?.id
    ) {
      console.error(
        "Unable to create Takda order:",
        orderData
      );

      return res.status(500).json({
        error: "Unable to create payment order.",
      });
    }

    const order = orderData[0];

    /* =========================================
       6. CREATE PAYMONGO CHECKOUT
    ========================================= */

    const siteUrl =
      process.env.TAKDA_SITE_URL ||
      "https://takda-ecru.vercel.app";

    const paymongoResponse = await fetch(
      "https://api.paymongo.com/v2/checkout_sessions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Basic ${Buffer.from(
              `${PAYMONGO_SECRET_KEY}:`
            ).toString("base64")}`,

          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify({
          data: {
            attributes: {
              billing: {
                name:
                  user.user_metadata?.full_name ||
                  user.email,

                email: user.email,
              },

              line_items: [
                {
                  name: selectedPlan.label,

                  description:
                    plan === "monthly"
                      ? "1 month of Takda Pro"
                      : "1 year of Takda Pro",

                  amount: selectedPlan.amount,
                  currency: "PHP",
                  quantity: 1,
                },
              ],

              /*
                QRPh first for our TEST checkout.

                Once confirmed working, we can enable
                other PayMongo payment methods that
                are available to the merchant account.
              */

              payment_method_types: [
                "qrph",
              ],

              description:
                "Takda Pro subscription",

              reference_number:
                referenceNumber,

              success_url:
                `${siteUrl}/?payment=success`,

              cancel_url:
                `${siteUrl}/?payment=cancelled`,

              send_email_receipt: true,

              show_description: true,

              show_line_items: true,

              metadata: {
                takda_order_id: order.id,
                takda_user_id: user.id,
                takda_plan: plan,
                takda_reference: referenceNumber,
              },
            },
          },
        }),
      }
    );

    const paymongoData =
      await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      console.error(
        "PayMongo checkout error:",
        JSON.stringify(paymongoData)
      );

      /*
        Mark our Takda order as failed because
        PayMongo checkout creation failed.
      */

      await fetch(
        `${SUPABASE_URL}/rest/v1/pro_orders?id=eq.${order.id}`,
        {
          method: "PATCH",

          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            status: "failed",
          }),
        }
      );

      return res.status(502).json({
        error:
          paymongoData?.errors?.[0]?.detail ||
          "Unable to create PayMongo checkout.",
      });
    }

    /* =========================================
       7. GET CHECKOUT DETAILS
    ========================================= */

    const checkoutSession =
      paymongoData?.data;

    const checkoutSessionId =
      checkoutSession?.id;

    const checkoutUrl =
      checkoutSession?.attributes?.checkout_url;

    if (
      !checkoutSessionId ||
      !checkoutUrl
    ) {
      console.error(
        "Invalid PayMongo response:",
        paymongoData
      );

      return res.status(502).json({
        error: "Invalid response from PayMongo.",
      });
    }

    /* =========================================
       8. SAVE PAYMONGO SESSION ID
    ========================================= */

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/pro_orders?id=eq.${order.id}`,
      {
        method: "PATCH",

        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          checkout_session_id:
            checkoutSessionId,
        }),
      }
    );

    if (!updateResponse.ok) {
      console.error(
        "Checkout created but order update failed."
      );

      /*
        Do NOT activate Pro.
        The webhook will still be the authority
        for successful payment.
      */
    }

    /* =========================================
       9. RETURN CHECKOUT URL
    ========================================= */

    return res.status(200).json({
      checkoutUrl,
      referenceNumber,
    });
  } catch (error) {
    console.error(
      "Create Takda checkout error:",
      error
    );

    return res.status(500).json({
      error: "Unable to start Takda Pro checkout.",
    });
  }
}
