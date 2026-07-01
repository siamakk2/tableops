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
  var STRIPE = process.env.STRIPE_SECRET_KEY;
  var STRIPE_TEST = process.env.STRIPE_SECRET_KEY_TEST;
  if (!SERVICE_KEY) return res.status(200).json({ ok: false, error: 'Server not set up: add SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.' });
  if (!STRIPE && !STRIPE_TEST) return res.status(200).json({ ok: false, error: 'Payment check not set up yet: add STRIPE_SECRET_KEY in Vercel, then redeploy.' });

  var body = readBody(req);
  var sessionId = (body.sessionId || '').trim();
  var email = (body.email || '').toLowerCase().trim();
  var password = body.password || '';
  var name = body.name || '';
  var restaurant = (body.restaurant || '').trim();

  try {
    if (!sessionId) return res.status(200).json({ ok: false, error: 'We could not find your payment. Please use the link from your email receipt.' });
    if (!email || email.indexOf('@') < 0) return res.status(200).json({ ok: false, error: 'Please enter a valid email address.' });
    if (String(password).length < 8) return res.status(200).json({ ok: false, error: 'Password must be at least 8 characters.' });
    if (!restaurant) return res.status(200).json({ ok: false, error: 'Please enter your restaurant name.' });

    // 1) Verify the Stripe checkout session (test sessions use the test key)
    var isTest = sessionId.indexOf('cs_test_') === 0;
    var useKey = isTest ? STRIPE_TEST : STRIPE;
    if (!useKey) return res.status(200).json({ ok: false, error: isTest ? 'This looks like a test payment, but no test key is set. Add STRIPE_SECRET_KEY_TEST in Vercel and redeploy.' : 'Live payment key is missing. Add STRIPE_SECRET_KEY in Vercel and redeploy.' });
    var sr = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), { headers: { 'Authorization': 'Bearer ' + useKey } });
    var s = await sr.json();
    if (!sr.ok || !s || s.error) return res.status(200).json({ ok: false, error: 'We could not verify your payment. Please contact support.' });
    var paid = (s.status === 'complete') || (s.payment_status === 'paid');
    if (!paid) return res.status(200).json({ ok: false, error: 'Your payment has not completed yet. If you just paid, wait a few seconds and try again.' });

    var subId = (typeof s.subscription === 'string') ? s.subscription : ((s.subscription && s.subscription.id) || '');
    var custId = (typeof s.customer === 'string') ? s.customer : ((s.customer && s.customer.id) || '');

    // 2) Create the Supabase Auth user (their login)
    var cr = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
      body: JSON.stringify({
        email: email,
        password: String(password),
        email_confirm: true,
        user_metadata: { name: name || '', restaurant: restaurant, role: 'owner' },
        app_metadata: { stripe_customer: custId, stripe_subscription: subId, stripe_session: sessionId, stripe_mode: isTest ? 'test' : 'live', status: 'active' }
      })
    });
    var cd = await cr.json();
    if (!cr.ok) {
      var m = (cd && (cd.msg || cd.message || cd.error_description || cd.error)) || '';
      if (/already|registered|exist/i.test(String(m))) return res.status(200).json({ ok: false, error: 'An account with that email already exists — please log in instead.' });
      return res.status(200).json({ ok: false, error: 'Could not create your account. ' + String(m).slice(0, 140) });
    }

    return res.status(200).json({ ok: true, email: email });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
