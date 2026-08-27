// Admin client management for ResBizAI.
// POST { secret, action }  →  action: "list" | "create" | "pause" | "resume" | "reset"
// Reads Supabase Auth users, joins the `subs` table, and reports per-account activity.

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

  var SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
                  || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
         || process.env.SUPABASE_SERVICE_KEY;
  var ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!KEY || !ADMIN_SECRET) {
    var miss = [];
    if (!KEY) miss.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!ADMIN_SECRET) miss.push('ADMIN_SECRET');
    return res.status(200).json({ ok: false, error: 'Missing in Vercel: ' + miss.join(', ')
      + '. Add under Settings → Environment Variables, then redeploy.' });
  }

  var body = readBody(req);
  if (!body.secret || body.secret !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'Wrong admin password.' });
  }

  var base = SUPABASE_URL.replace(/\/$/, '');
  var H = { 'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
  var action = body.action || 'list';

  try {
    // ---------------------------------------------------------------- LIST
    if (action === 'list') {
      // Supabase admin user list is paginated; walk up to 10 pages (1000 users).
      var users = [], page = 1;
      while (page <= 10) {
        var ur = await fetch(base + '/auth/v1/admin/users?page=' + page + '&per_page=100', { headers: H });
        if (!ur.ok) break;
        var ud = await ur.json();
        var batch = (ud && ud.users) || [];
        users = users.concat(batch);
        if (batch.length < 100) break;
        page++;
      }

      // Subscription rows
      var subs = {};
      try {
        var sr = await fetch(base + '/rest/v1/subs?select=email,status,stripe_customer,stripe_subscription',
                             { headers: H });
        if (sr.ok) {
          var sa = await sr.json();
          if (Array.isArray(sa)) sa.forEach(function (s) {
            if (s && s.email) subs[String(s.email).toLowerCase()] = s;
          });
        }
      } catch (e) {}

      // Per-account activity: how much real data has each workspace entered?
      async function countFor(table, col) {
        var out = {};
        try {
          var r = await fetch(base + '/rest/v1/' + table + '?select=' + col, { headers: H });
          if (!r.ok) return out;
          var rows = await r.json();
          if (Array.isArray(rows)) rows.forEach(function (x) {
            var k = x && x[col]; if (!k) return;
            out[k] = (out[k] || 0) + 1;
          });
        } catch (e) {}
        return out;
      }
      // NOTE: workspace data currently lives in each browser's localStorage, not
      // Postgres. These lookups return empty until the to_* tables exist, so the
      // dashboard reports "not synced" rather than a misleading zero.
      var inv = await countFor('to_inventory', 'email');
      var pnl = await countFor('to_pnl', 'email');
      var stf = await countFor('to_staff', 'email');
      var mnu = await countFor('to_menu_items', 'email');
      var serverSideData = Object.keys(inv).length + Object.keys(pnl).length
                         + Object.keys(stf).length + Object.keys(mnu).length > 0;

      var list = users.map(function (u) {
        var em = String(u.email || '').toLowerCase();
        var meta = u.user_metadata || {};
        var app = u.app_metadata || {};
        var s = subs[em] || {};
        var counts = {
          inventory: inv[em] || 0, pnl: pnl[em] || 0,
          staff: stf[em] || 0, menu: mnu[em] || 0
        };
        var total = counts.inventory + counts.pnl + counts.staff + counts.menu;
        // Activation = has the workspace produced real value yet?
        var stage = !serverSideData ? 'unsynced'
                  : total === 0 ? 'empty'
                  : (counts.pnl > 0 && counts.inventory > 0) ? 'active'
                  : 'started';
        return {
          email: u.email,
          name: meta.name || '',
          restaurant: meta.restaurant || '',
          created_at: u.created_at || '',
          last_sign_in_at: u.last_sign_in_at || '',
          status: s.status || app.status || 'unknown',
          stripe_customer: s.stripe_customer || app.stripe_customer || '',
          stripe_mode: app.stripe_mode || '',
          counts: counts, records: total, stage: stage
        };
      }).sort(function (a, b) {
        return String(b.created_at).localeCompare(String(a.created_at));
      });

      var summary = {
        serverSideData: serverSideData,
        total: list.length,
        active: list.filter(function (x) { return x.status === 'active'; }).length,
        paused: list.filter(function (x) { return x.status === 'paused' || x.status === 'canceled'; }).length,
        empty: list.filter(function (x) { return x.stage === 'empty'; }).length,
        activated: list.filter(function (x) { return x.stage === 'active'; }).length,
        last7: list.filter(function (x) {
          return x.created_at && (Date.now() - new Date(x.created_at).getTime()) < 7 * 864e5;
        }).length
      };
      return res.status(200).json({ ok: true, summary: summary, clients: list });
    }

    // ---------------------------------------------------------------- CREATE
    if (action === 'create') {
      var email = String(body.email || '').toLowerCase().trim();
      var password = String(body.password || '');
      if (!email || email.indexOf('@') < 0) return res.status(200).json({ ok: false, error: 'Enter a valid email.' });
      if (password.length < 8) return res.status(200).json({ ok: false, error: 'Password must be at least 8 characters.' });
      var cr = await fetch(base + '/auth/v1/admin/users', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          email: email, password: password, email_confirm: true,
          user_metadata: { name: body.name || '', restaurant: body.restaurant || '', role: 'owner' },
          app_metadata: { status: 'active', created_by: 'admin' }
        })
      });
      var cd = await cr.json();
      if (!cr.ok) {
        var m = (cd && (cd.msg || cd.message || cd.error_description || cd.error)) || 'Could not create the account.';
        return res.status(200).json({ ok: false, error: String(m).slice(0, 180) });
      }
      try {
        await fetch(base + '/rest/v1/subs', {
          method: 'POST',
          headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ email: email, status: 'active' })
        });
      } catch (e) {}
      return res.status(200).json({ ok: true, email: email });
    }

    // ---------------------------------------------------- PAUSE / RESUME
    if (action === 'pause' || action === 'resume') {
      var em2 = String(body.email || '').toLowerCase().trim();
      if (!em2) return res.status(200).json({ ok: false, error: 'No email given.' });
      var newStatus = action === 'pause' ? 'paused' : 'active';
      var pr = await fetch(base + '/rest/v1/subs?email=eq.' + encodeURIComponent(em2), {
        method: 'PATCH',
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal,resolution=merge-duplicates' }),
        body: JSON.stringify({ status: newStatus })
      });
      if (!pr.ok) {
        // no row yet — create one
        await fetch(base + '/rest/v1/subs', {
          method: 'POST',
          headers: Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({ email: em2, status: newStatus })
        });
      }
      return res.status(200).json({ ok: true, email: em2, status: newStatus });
    }

    // ---------------------------------------------------------------- RESET
    if (action === 'reset') {
      var em3 = String(body.email || '').toLowerCase().trim();
      var np = String(body.password || '');
      if (np.length < 8) return res.status(200).json({ ok: false, error: 'New password must be at least 8 characters.' });
      var ur2 = await fetch(base + '/auth/v1/admin/users?page=1&per_page=100', { headers: H });
      var ud2 = await ur2.json();
      var hit = ((ud2 && ud2.users) || []).filter(function (u) {
        return String(u.email || '').toLowerCase() === em3;
      })[0];
      if (!hit) return res.status(200).json({ ok: false, error: 'No account with that email in the first 100 users.' });
      var rr = await fetch(base + '/auth/v1/admin/users/' + hit.id, {
        method: 'PUT', headers: H, body: JSON.stringify({ password: np })
      });
      if (!rr.ok) return res.status(200).json({ ok: false, error: 'Could not reset that password.' });
      return res.status(200).json({ ok: true, email: em3 });
    }


    // ---------------------------------------------------------------- FIND
    async function findUser(em) {
      var page = 1;
      while (page <= 10) {
        var ur = await fetch(base + '/auth/v1/admin/users?page=' + page + '&per_page=100', { headers: H });
        if (!ur.ok) return null;
        var ud = await ur.json();
        var batch = (ud && ud.users) || [];
        for (var i = 0; i < batch.length; i++) {
          if (String(batch[i].email || '').toLowerCase() === em) return batch[i];
        }
        if (batch.length < 100) return null;
        page++;
      }
      return null;
    }

    // ---------------------------------------------------------------- UPDATE
    if (action === 'update') {
      var uem = String(body.email || '').toLowerCase().trim();
      if (!uem) return res.status(200).json({ ok: false, error: 'No email given.' });
      var u = await findUser(uem);
      if (!u) return res.status(200).json({ ok: false, error: 'No account with that email.' });

      var patch = {};
      var meta = Object.assign({}, u.user_metadata || {});
      if (typeof body.name === 'string') meta.name = body.name.trim();
      if (typeof body.restaurant === 'string') meta.restaurant = body.restaurant.trim();
      patch.user_metadata = meta;

      var newEmail = String(body.newEmail || '').toLowerCase().trim();
      var emailChanged = false;
      if (newEmail && newEmail !== uem) {
        if (newEmail.indexOf('@') < 0) return res.status(200).json({ ok: false, error: 'That new email is not valid.' });
        patch.email = newEmail;
        patch.email_confirm = true;
        emailChanged = true;
      }

      var pr2 = await fetch(base + '/auth/v1/admin/users/' + u.id, {
        method: 'PUT', headers: H, body: JSON.stringify(patch)
      });
      var pd = await pr2.json();
      if (!pr2.ok) {
        var pm = (pd && (pd.msg || pd.message || pd.error_description || pd.error)) || 'Could not update.';
        return res.status(200).json({ ok: false, error: String(pm).slice(0, 180) });
      }

      // keep the subs row in step if the login email moved
      if (emailChanged) {
        try {
          await fetch(base + '/rest/v1/subs?email=eq.' + encodeURIComponent(uem), {
            method: 'PATCH',
            headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ email: newEmail })
          });
        } catch (e) {}
      }
      return res.status(200).json({ ok: true, email: newEmail || uem, emailChanged: emailChanged });
    }

    // ---------------------------------------------------------------- DELETE
    if (action === 'delete') {
      var dem = String(body.email || '').toLowerCase().trim();
      if (!dem) return res.status(200).json({ ok: false, error: 'No email given.' });
      if (String(body.confirm || '').toLowerCase().trim() !== dem) {
        return res.status(200).json({ ok: false, error: 'Confirmation did not match the email.' });
      }
      var du = await findUser(dem);
      if (!du) return res.status(200).json({ ok: false, error: 'No account with that email.' });

      var dr = await fetch(base + '/auth/v1/admin/users/' + du.id, { method: 'DELETE', headers: H });
      if (!dr.ok) return res.status(200).json({ ok: false, error: 'Could not delete that account.' });

      // clear their workspace rows and subscription record
      var wiped = {};
      var tables = ['to_inventory', 'to_pnl', 'to_staff', 'to_menu_items', 'to_prep', 'to_restaurants'];
      for (var t = 0; t < tables.length; t++) {
        try {
          var wr = await fetch(base + '/rest/v1/' + tables[t] + '?email=eq.' + encodeURIComponent(dem), {
            method: 'DELETE', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' })
          });
          wiped[tables[t]] = wr.ok;
        } catch (e) { wiped[tables[t]] = false; }
      }
      try {
        await fetch(base + '/rest/v1/subs?email=eq.' + encodeURIComponent(dem), {
          method: 'DELETE', headers: Object.assign({}, H, { 'Prefer': 'return=minimal' })
        });
      } catch (e) {}
      return res.status(200).json({ ok: true, email: dem, wiped: wiped });
    }


    // ------------------------------------------------------- IMPERSONATE
    // Mints a short-lived magic link for the client, so support can view the
    // exact workspace the client sees. Every use is logged to admin_audit.
    if (action === 'impersonate') {
      var iem = String(body.email || '').toLowerCase().trim();
      if (!iem) return res.status(200).json({ ok: false, error: 'No email given.' });
      var iu = await findUser(iem);
      if (!iu) return res.status(200).json({ ok: false, error: 'No account with that email.' });

      // Supabase admin: generate a magiclink (does not change their password
      // and does not sign them out of their own sessions)
      var gr = await fetch(base + '/auth/v1/admin/generate_link', {
        method: 'POST', headers: H,
        body: JSON.stringify({ type: 'magiclink', email: iem })
      });
      var gd = await gr.json();
      if (!gr.ok) {
        var gm = (gd && (gd.msg || gd.message || gd.error)) || 'Could not create a support session.';
        return res.status(200).json({ ok: false, error: String(gm).slice(0, 180) });
      }

      // Audit the access. Best-effort: never block support on a logging failure.
      try {
        await fetch(base + '/rest/v1/admin_audit', {
          method: 'POST',
          headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
          body: JSON.stringify({
            action: 'impersonate',
            target_email: iem,
            reason: String(body.reason || '').slice(0, 300),
            at: new Date().toISOString()
          })
        });
      } catch (e) {}

      return res.status(200).json({
        ok: true, email: iem,
        name: (iu.user_metadata && iu.user_metadata.name) || '',
        restaurant: (iu.user_metadata && iu.user_metadata.restaurant) || '',
        link: (gd && (gd.action_link || (gd.properties && gd.properties.action_link))) || '',
        hashed_token: (gd && gd.properties && gd.properties.hashed_token) || ''
      });
    }

    return res.status(200).json({ ok: false, error: 'Unknown action.' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
