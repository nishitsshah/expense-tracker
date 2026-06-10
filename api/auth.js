// Vercel serverless function — handles Google OAuth token exchange and refresh
export default async function handler(req, res) {
  // Allow CORS from your domain
  res.setHeader('Access-Control-Allow-Origin', 'https://www.expensetrackr.in');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { action, code, refresh_token } = req.body;
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = 'https://www.expensetrackr.in/app.html';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    if (action === 'exchange') {
      // Exchange authorization code for tokens (includes refresh token)
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      const data = await response.json();
      if (data.error) { res.status(400).json({ error: data.error }); return; }
      res.status(200).json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });

    } else if (action === 'refresh') {
      // Use refresh token to get new access token
      if (!refresh_token) { res.status(400).json({ error: 'No refresh token' }); return; }
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      });
      const data = await response.json();
      if (data.error) { res.status(400).json({ error: data.error }); return; }
      res.status(200).json({
        access_token: data.access_token,
        expires_in: data.expires_in,
      });

    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
