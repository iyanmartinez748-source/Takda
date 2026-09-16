export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

    if (!PAYMONGO_SECRET_KEY) {
      return res.status(500).json({
        error: "PAYMONGO_SECRET_KEY is missing",
      });
    }

    const { id } = req.query;

    if (!id || !String(id).startsWith("cs_")) {
      return res.status(400).json({
        error: "Valid checkout session ID is required",
      });
    }

    const response = await fetch(
      `https://api.paymongo.com/v2/checkout_sessions/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64"),
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("PayMongo checkout lookup error:", data);

      return res.status(response.status).json({
        error: "Unable to retrieve checkout session",
        paymongo: data,
      });
    }

    const attributes = data?.data?.attributes || {};

    // Return only useful diagnostic information.
    // Never return the PayMongo secret key.
    return res.status(200).json({
      id: data?.data?.id || null,
      type: data?.data?.type || null,
      status: attributes.status || null,
      payment_intent: attributes.payment_intent || null,
      payments: attributes.payments || [],
      reference_number: attributes.reference_number || null,
      metadata: attributes.metadata || null,
    });
  } catch (error) {
    console.error("Check checkout error:", error);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
