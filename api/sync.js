// Server-side persistence for ResBizAI workspaces.
// POST { token, action: "pull" }                 -> { ok, data: { key: [...] } }
// POST { token, action: "push", key, data }      -> { ok }
// The caller's Supabase access token identifies them; the service key is never
// exposed to the browser and a user can only ever touch their own rows.

function readBody(req) {
  var b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

var KEYS = ['staff', 'inv', 'prep', 'e86', 'pnl', 'menu', 'invoices', 'locations', 'rest',
            'tables', 'tblareas'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  var SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
                  || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
         || process.env.SUPABASE_SERVICE_KEY;
  if (!KEY) return res.status(200).json({ ok: false, error: 'Sync is not configured on the server.' });

  var base = SUPABASE_URL.replace(/\/$/, '');
  var H = { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
  var body = readBody(req);

  // ---- identify the caller from their own access token -------------------
  var email = '';
  try {
    var token = String(body.token || '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'Not signed in.' });
    var ur = await fetch(base + '/auth/v1/user', {
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!ur.ok) return res.status(401).json({ ok: false, error: 'Session expired — please sign in again.' });
    var u = await ur.json();
    email = String((u && u.email) || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ ok: false, error: 'Could not identify your account.' });
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Could not verify your session.' });
  }

  var action = body.action || 'pull';
  var q = '?user_email=eq.' + encodeURIComponent(email);

  try {
    // ---------------------------------------------------------------- PULL
    if (action === 'pull') {
      var r = await fetch(base + '/rest/v1/workspace' + q + '&select=key,data,updated_at', { headers: H });
      if (!r.ok) return res.status(200).json({ ok: false, error: 'Could not load your data.' });
      var rows = await r.json();
      var out = {}, stamps = {};
      if (Array.isArray(rows)) rows.forEach(function (x) {
        if (x && x.key) { out[x.key] = x.data; stamps[x.key] = x.updated_at; }
      });
      return res.status(200).json({ ok: true, data: out, updated: stamps });
    }

    // ---------------------------------------------------------------- PUSH
    if (action === 'push') {
      var k = String(body.key || '');
      if (KEYS.indexOf(k) < 0) return res.status(200).json({ ok: false, error: 'Unknown data key.' });
      if (typeof body.data === 'undefined') return res.status(200).json({ ok: false, error: 'No data sent.' });

      var pr = await fetch(base + '/rest/v1/workspace', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          user_email: email, key: k, data: body.data, updated_at: new Date().toISOString()
        })
      });
      if (!pr.ok) {
        var t = await pr.text().catch(function () { return ''; });
        console.error('sync push failed', pr.status, t.slice(0, 200));
        return res.status(200).json({ ok: false, error: 'Could not save to the server.' });
      }
      return res.status(200).json({ ok: true, key: k });
    }

    // ------------------------------------------------- PUSH ALL (migration)
    if (action === 'pushAll') {
      var all = body.all || {};
      var rowsOut = [];
      for (var i = 0; i < KEYS.length; i++) {
        var kk = KEYS[i];
        if (typeof all[kk] === 'undefined') continue;
        rowsOut.push({ user_email: email, key: kk, data: all[kk], updated_at: new Date().toISOString() });
      }
      if (!rowsOut.length) return res.status(200).json({ ok: true, saved: 0 });
      var ar = await fetch(base + '/rest/v1/workspace', {
        method: 'POST',
        headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rowsOut)
      });
      if (!ar.ok) return res.status(200).json({ ok: false, error: 'Could not upload your data.' });
      return res.status(200).json({ ok: true, saved: rowsOut.length });
    }

    return res.status(200).json({ ok: false, error: 'Unknown action.' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Sync error: ' + (e && e.message ? e.message : String(e)) });
  }
};
