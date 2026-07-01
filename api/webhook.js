// Stripe webhook for ResBizAI. Keeps the subs table in sync with each
// subscription. Secured by a URL secret (?key=...). We re-fetch the real
// subscription from Stripe before changing anyone's status.

function readBody(req) {
  var b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, note: 'ready' });

  var SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  var STRIPE = process.env.STRIPE_SECRET_KEY;
  var STRIPE_TEST = process.env.STRIPE_SECRET_KEY_TEST;
  var HOOK = process.env.STRIPE_WEBHOOK_KEY;
  if (!KEY) return res.status(200).json({ ok: false, error: 'no supabase key' });

  var qkey = (req.query && (req.query.key || req.query.k)) || '';
  if (HOOK && qkey !== HOOK) return res.status(401).json({ ok: false, error: 'bad key' });

  var base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
  var H = { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Prefer': 'return=minimal' };

  try {
    var evt = readBody(req);
    var obj = (evt && evt.data && evt.data.object) || {};
    var live = evt && evt.livemode !== false;
    var useKey = live ? STRIPE : STRIPE_TEST;

    var subId = (obj.object === 'subscription') ? obj.id : (obj.subscription || '');
    var custId = obj.customer || '';
    if (!subId && !custId) return res.status(200).json({ ok: true, skipped: 'no ids' });

    var status = '';
    if (subId && useKey) {
      var r = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(subId), { headers: { 'Authorization': 'Bearer ' + useKey } });
      var sub = await r.json();
      if (r.ok && sub && sub.status) status = sub.status;
    }
    if (!status && evt && evt.type === 'customer.subscription.deleted') status = 'canceled';
    if (!status) return res.status(200).json({ ok: true, note: 'no status' });

    var pausedStates = ['canceled', 'unpaid', 'past_due', 'incomplete_expired', 'paused'];
    var activeStates = ['active', 'trialing'];
    var newStatus = pausedStates.indexOf(status) >= 0 ? 'paused' : (activeStates.indexOf(status) >= 0 ? 'active' : '');
    if (!newStatus) return res.status(200).json({ ok: true, note: 'ignored ' + status });

    var patch = JSON.stringify({ status: newStatus });
    if (subId) await fetch(base + '/subs?stripe_subscription=eq.' + encodeURIComponent(subId), { method: 'PATCH', headers: H, body: patch });
    if (custId) await fetch(base + '/subs?stripe_customer=eq.' + encodeURIComponent(custId), { method: 'PATCH', headers: H, body: patch });
    return res.status(200).json({ ok: true, status: newStatus });
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) });
  }
};
