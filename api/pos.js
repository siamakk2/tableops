// POS integrations for ResBizAI.
//   action: "status"   -> which POS the account has connected
//   action: "authurl"  -> Square OAuth consent URL
//   action: "exchange" -> swap the OAuth code for tokens (called from the callback)
//   action: "sync"     -> pull yesterday's sales/orders from Square into a P&L-ready summary
//   action: "waitlist" -> record interest in Toast / Clover / other
//   action: "disconnect"
//
// Square is a normal OAuth app: no partner gate. Toast and Clover require
// approved partner programmes, so those are demand capture only for now.

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

  var SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  var SQ_ID = process.env.SQUARE_APP_ID;
  var SQ_SECRET = process.env.SQUARE_APP_SECRET;
  var SQ_ENV = (process.env.SQUARE_ENV || 'production').toLowerCase();
  var SQ_BASE = SQ_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  var SITE = process.env.SITE_URL || 'https://resbizai.com';

  if (!KEY) return res.status(200).json({ ok: false, error: 'Integrations are not configured yet.' });

  var base = SUPABASE_URL.replace(/\/$/, '');
  var H = { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
  var body = readBody(req);

  // ---- identify the caller from their own Supabase token ----------------
  var email = '';
  try {
    var token = String(body.token || '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'Not signed in.' });
    var ur = await fetch(base + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
    if (!ur.ok) return res.status(401).json({ ok: false, error: 'Session expired — sign in again.' });
    var u = await ur.json();
    email = String((u && u.email) || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ ok: false, error: 'Could not identify your account.' });
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Could not verify your session.' });
  }

  var action = body.action || 'status';

  async function getConn(provider) {
    try {
      var r = await fetch(base + '/rest/v1/pos_connections?user_email=eq.'
        + encodeURIComponent(email) + (provider ? ('&provider=eq.' + provider) : '')
        + '&select=provider,merchant_id,location_id,location_name,status,connected_at', { headers: H });
      if (!r.ok) return [];
      var rows = await r.json();
      return Array.isArray(rows) ? rows : [];
    } catch (e) { return []; }
  }

  try {
    // ---------------------------------------------------------------- STATUS
    if (action === 'status') {
      var rows = await getConn(null);
      return res.status(200).json({
        ok: true,
        connections: rows,
        squareReady: !!(SQ_ID && SQ_SECRET),
        env: SQ_ENV
      });
    }

    // --------------------------------------------------------------- AUTHURL
    if (action === 'authurl') {
      if (!SQ_ID) return res.status(200).json({ ok: false, error: 'Square is not configured on the server yet.' });
      // state carries the account so the callback knows who is connecting
      var state = Buffer.from(JSON.stringify({ e: email, t: Date.now() })).toString('base64url');
      var scopes = ['MERCHANT_PROFILE_READ', 'ORDERS_READ', 'PAYMENTS_READ',
                    'ITEMS_READ', 'INVENTORY_READ', 'EMPLOYEES_READ', 'TIMECARDS_READ'].join('+');
      var url = SQ_BASE + '/oauth2/authorize?client_id=' + encodeURIComponent(SQ_ID)
              + '&scope=' + scopes + '&session=false&state=' + state
              + '&redirect_uri=' + encodeURIComponent(SITE + '/api/pos-callback');
      return res.status(200).json({ ok: true, url: url });
    }

    // -------------------------------------------------------------- DISCONNECT
    if (action === 'disconnect') {
      var p = String(body.provider || '').toLowerCase();
      await fetch(base + '/rest/v1/pos_connections?user_email=eq.' + encodeURIComponent(email)
        + '&provider=eq.' + encodeURIComponent(p), {
        method: 'DELETE', headers: Object.assign({}, H, { Prefer: 'return=minimal' })
      });
      return res.status(200).json({ ok: true });
    }

    // ---------------------------------------------------------------- SYNC
    // Pulls a day of Square orders and returns a P&L-ready summary. The app
    // decides whether to write it — we never silently overwrite their numbers.
    if (action === 'sync') {
      var conns = await getConn('square');
      if (!conns.length) return res.status(200).json({ ok: false, error: 'Square is not connected.' });

      var tr = await fetch(base + '/rest/v1/pos_connections?user_email=eq.' + encodeURIComponent(email)
        + '&provider=eq.square&select=access_token,location_id', { headers: H });
      var td = await tr.json();
      var conn = (Array.isArray(td) && td[0]) || {};
      if (!conn.access_token) return res.status(200).json({ ok: false, error: 'No Square token stored.' });

      var day = String(body.date || '').slice(0, 10) || new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      var start = day + 'T00:00:00Z', end = day + 'T23:59:59Z';

      var sr = await fetch(SQ_BASE + '/v2/orders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23',
                   Authorization: 'Bearer ' + conn.access_token },
        body: JSON.stringify({
          location_ids: conn.location_id ? [conn.location_id] : undefined,
          query: { filter: { date_time_filter: { closed_at: { start_at: start, end_at: end } },
                             state_filter: { states: ['COMPLETED'] } } },
          limit: 500
        })
      });
      if (!sr.ok) {
        var et = await sr.text().catch(function () { return ''; });
        console.error('square sync', sr.status, et.slice(0, 200));
        return res.status(200).json({ ok: false, error: 'Square would not return that day. Try reconnecting.' });
      }
      var sd = await sr.json();
      var orders = (sd && sd.orders) || [];
      var gross = 0, net = 0, discounts = 0, tax = 0, tips = 0, covers = 0;
      orders.forEach(function (o) {
        function m(x) { return x && x.amount ? Number(x.amount) / 100 : 0; }
        gross += m(o.total_money);
        tax += m(o.total_tax_money);
        tips += m(o.total_tip_money);
        discounts += m(o.total_discount_money);
        covers += 1;
      });
      net = gross - tax - tips;
      return res.status(200).json({
        ok: true, date: day, orders: orders.length,
        summary: {
          gross: Math.round(gross * 100) / 100,
          netSales: Math.round(net * 100) / 100,
          tax: Math.round(tax * 100) / 100,
          tips: Math.round(tips * 100) / 100,
          discounts: Math.round(discounts * 100) / 100,
          covers: covers
        }
      });
    }

    // -------------------------------------------------------------- WAITLIST
    if (action === 'waitlist') {
      var prov = String(body.provider || '').toLowerCase().slice(0, 40);
      if (!prov) return res.status(200).json({ ok: false, error: 'Which system?' });
      await fetch(base + '/rest/v1/pos_waitlist', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          user_email: email, provider: prov,
          note: String(body.note || '').slice(0, 300),
          requested_at: new Date().toISOString()
        })
      });
      return res.status(200).json({ ok: true, provider: prov });
    }

    return res.status(200).json({ ok: false, error: 'Unknown action.' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Integration error: ' + (e && e.message ? e.message : String(e)) });
  }
};
