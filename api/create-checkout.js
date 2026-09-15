export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({
        error: "PayMongo is not configured.",
      });
    }

    const { plan, accessToken } = req.body || {};

    if (!accessToken) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    if (!["monthly", "yearly"].includes(plan)) {
      return res.status(400).json({
        error: "Invalid Takda Pro plan.",
      });
    }

    /*
      Verify the logged-in Takda user directly with Supabase.
      We do NOT trust a user_id sent by the browser.
    */

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabasePublishableKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      return res.status(500).json({
        error: "Supabase is not configured.",
      });
    }

    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const user = await userResponse.json();

    if (!userResponse.ok || !user?.id) {
      return res.status(401).json({
        error: "Invalid or expired session.",
      });
    }

    /*
      Prices are controlled by the SERVER.
      The browser cannot choose its own amount.
    */

    const plans = {
      monthly: {
        amount: 2900,
        name: "Takda Pro — Monthly",
      },

      yearly: {
        amount: 29900,
        name: "Takda Pro — Yearly",
      },
    };

    const selectedPlan = plans[plan];

    const referenceNumber =
      `TAKDA-${Date.now()}-${crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 10)
        .toUpperCase()}`;

    const siteUrl =
      process.env.TAKDA_SITE_URL ||
      "https://takda-ecru.vercel.app";

    /*
      Create PayMongo Hosted Checkout v2.
    */

    const paymongoResponse = await fetch(
      "https://api.paymongo.com/v2/checkout_sessions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Basic ${Buffer.from(
              `${secretKey}:`
            ).toString("base64")}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          data: {
            attributes: {
              line_items: [
                {
                  name: selectedPlan.name,
                  amount: selectedPlan.amount,
                  currency: "PHP",
                  quantity: 1,
                },
              ],

              /*
                Start with QRPh.
                We can add other enabled PayMongo
                payment methods later.
              */

              payment_method_types: ["qrph"],

              success_url:
                `${siteUrl}/?payment=success`,

              cancel_url:
                `${siteUrl}/?payment=cancelled`,

              reference_number: referenceNumber,

              send_email_receipt: true,

              metadata: {
                takda_user_id: user.id,
                takda_plan: plan,
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

      return res.status(502).json({
        error:
          paymongoData?.errors?.[0]?.detail ||
          "Unable to create PayMongo checkout.",
      });
    }

    const checkoutSession =
      paymongoData?.data;

    const checkoutUrl =
      checkoutSession?.attributes?.checkout_url;

    if (!checkoutSession?.id || !checkoutUrl) {
      return res.status(502).json({
        error: "Invalid response from PayMongo.",
      });
    }

    /*
      IMPORTANT:
      We are NOT marking the user as Pro here.

      The webhook will be responsible for confirming
      the payment before Pro is activated.
    */

    return res.status(200).json({
      checkoutUrl,
      checkoutSessionId: checkoutSession.id,
      referenceNumber,
    });
  } catch (error) {
    console.error(
      "Create checkout error:",
      error
    );

    return res.status(500).json({
      error: "Unable to start checkout.",
    });
  }
}
