module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    var ADMIN_SECRET = process.env.ADMIN_SECRET;
    if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_SECRET) {
      return res.status(200).json({ ok: false, error: 'Server not configured yet. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ADMIN_SECRET in Vercel environment variables, then redeploy.' });
    }

    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    var secret = body.secret, email = body.email, password = body.password, name = body.name, restaurant = body.restaurant;

    if (!secret || secret !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: 'Wrong admin password.' });
    }
    if (!email || String(email).indexOf('@') < 0) {
      return res.status(200).json({ ok: false, error: 'Enter a valid owner email.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(200).json({ ok: false, error: 'Temporary password must be at least 8 characters.' });
    }

    var cleanEmail = String(email).toLowerCase().trim();
    var resp = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY
      },
      body: JSON.stringify({
        email: cleanEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: { name: name || '', restaurant: restaurant || '' }
      })
    });
    var data = await resp.json();
    if (!resp.ok) {
      var m = (data && (data.msg || data.message || data.error_description || data.error)) || 'Could not create the account.';
      return res.status(200).json({ ok: false, error: m });
    }
    return res.status(200).json({ ok: true, email: cleanEmail });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Unexpected error: ' + (e && e.message ? e.message : String(e)) });
  }
};
