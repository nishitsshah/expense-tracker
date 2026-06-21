// Vercel serverless function — handles Google OAuth token exchange and refresh
export default async function handler(req, res) {
  const ALLOWED_ORIGINS = [
    "https://www.expensetrackr.in",
    "https://expensetrackr.in",
    "https://expense-tracker-two-ivory-16.vercel.app",
  ];
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { action, code, refresh_token } = req.body;

  // Basic input sanitisation
  if (!action || typeof action !== "string") { res.status(400).json({ error: "Invalid action" }); return; }
  if (action === "exchange" && (!code || typeof code !== "string")) { res.status(400).json({ error: "Invalid code" }); return; }
  if (action === "refresh" && (!refresh_token || typeof refresh_token !== "string")) { res.status(400).json({ error: "No refresh token" }); return; }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = "https://www.expensetrackr.in/app.html";

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  try {
    if (action === "exchange") {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const data = await response.json();
      if (data.error) { res.status(400).json({ error: data.error }); return; }
      res.status(200).json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });

    } else if (action === "refresh") {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });
      const data = await response.json();
      if (data.error) { res.status(400).json({ error: data.error }); return; }
      res.status(200).json({
        access_token: data.access_token,
        expires_in: data.expires_in,
      });

    } else {
      res.status(400).json({ error: "Invalid action" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
