// Returns the subscription status for a given email so the app can lock a
// paused workspace at login. Uses the service key server-side (bypasses RLS).

function readBody(req) {
  var b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ status: 'active' });

  var SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  // Fail open: if we can't check, never lock anyone out
  if (!KEY) return res.status(200).json({ status: 'active' });

  try {
    var body = readBody(req);
    var email = (body.email || '').toLowerCase().trim();
    if (!email) return res.status(200).json({ status: 'active' });
    var base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
    var H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
    var r = await fetch(base + '/subs?email=eq.' + encodeURIComponent(email) + '&select=status', { headers: H });
    var a = await r.json();
    var status = (Array.isArray(a) && a[0] && a[0].status) ? a[0].status : 'active';
    return res.status(200).json({ status: status });
  } catch (e) {
    return res.status(200).json({ status: 'active' });
  }
};
