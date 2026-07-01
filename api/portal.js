var crypto = require('crypto');

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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  var SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  var SB_KEY = 'sb_publishable_4WA8MeOaniWhLWU2C2DGQQ_VkMN30lx';
  var STRIPE = process.env.STRIPE_SECRET_KEY;
  var STRIPE_TEST = process.env.STRIPE_SECRET_KEY_TEST;
  if (!SERVICE_KEY) return res.status(200).json({ ok: false, error: 'Server not set up.' });

  async function stripePortal(cust, ret) {
    var keys = [STRIPE, STRIPE_TEST];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (!k) continue;
      try {
        var r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'customer=' + encodeURIComponent(cust) + '&return_url=' + encodeURIComponent(ret) });
        var d = await r.json();
        if (r.ok && d && d.url) return d.url;
      } catch (e) {}
    }
    return '';
  }

  try {
    var body = readBody(req);
    var token = (body.token || '').trim();
    if (!token) return res.status(200).json({ ok: false, error: 'Please log in again.' });

    // Verify the user's token → get their email
    var ur = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token } });
    var u = await ur.json();
    if (!ur.ok || !u || !u.email) return res.status(200).json({ ok: false, error: 'Please log in again.' });
    var email = String(u.email).toLowerCase();

    var base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
    var H = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY };
    var r = await fetch(base + '/subs?email=eq.' + encodeURIComponent(email) + '&select=stripe_customer', { headers: H });
    var a = await r.json();
    var cust = (Array.isArray(a) && a[0] && a[0].stripe_customer) || '';
    if (!cust) return res.status(200).json({ ok: false, error: 'No billing is set up on this account.' });

    var url = await stripePortal(cust, 'https://resbizai.com/app/');
    if (!url) return res.status(200).json({ ok: false, error: 'Could not open billing right now. Make sure the Customer Portal is turned on in Stripe.' });
    return res.status(200).json({ ok: true, url: url });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
