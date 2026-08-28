// Square OAuth callback. Square redirects the seller here after they approve.
// Exchanges the authorization code for tokens, stores the connection, and
// shows a plain confirmation page that closes itself.

function page(title, msg, ok) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + title + '</title><style>'
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'background:#faf6f1;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:24px}'
    + '.c{background:#fff;border:1px solid #efe6db;border-radius:16px;padding:38px 34px;max-width:420px;text-align:center}'
    + '.i{font-size:42px;margin-bottom:14px}'
    + 'h1{font-size:21px;color:#2a1e1a;margin:0 0 10px}'
    + 'p{font-size:14.5px;color:#7a6a5d;line-height:1.6;margin:0 0 22px}'
    + 'a{display:inline-block;background:' + (ok ? '#ff4f2e' : '#7a6a5d') + ';color:#fff;text-decoration:none;'
    + 'font-size:14.5px;font-weight:700;padding:12px 22px;border-radius:9px}'
    + '</style></head><body><div class="c"><div class="i">' + (ok ? '\u2705' : '\u26A0\uFE0F') + '</div>'
    + '<h1>' + title + '</h1><p>' + msg + '</p>'
    + '<a href="/app">Back to ResBizAI</a></div>'
    + '<script>setTimeout(function(){try{if(window.opener){window.opener.postMessage('
    + JSON.stringify({ rbPos: 'square', ok: !!ok }) + ',"*");window.close();}}catch(e){}},'
    + (ok ? '1400' : '4000') + ');</script></body></html>';
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  var SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  var SQ_ID = process.env.SQUARE_APP_ID;
  var SQ_SECRET = process.env.SQUARE_APP_SECRET;
  var SQ_ENV = (process.env.SQUARE_ENV || 'production').toLowerCase();
  var SQ_BASE = SQ_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
  var SITE = process.env.SITE_URL || 'https://resbizai.com';

  var q = req.query || {};
  if (q.error) {
    return res.status(200).send(page('Connection cancelled',
      'Square reported: ' + String(q.error_description || q.error).slice(0, 160)
      + '. Nothing was changed on your account.', false));
  }
  if (!q.code || !q.state) {
    return res.status(200).send(page('Something went missing',
      'Square did not send back the details we needed. Please try connecting again from the Integrations screen.', false));
  }
  if (!SQ_ID || !SQ_SECRET || !KEY) {
    return res.status(200).send(page('Not configured yet',
      'Square credentials are not set on the server. Add SQUARE_APP_ID and SQUARE_APP_SECRET in Vercel.', false));
  }

  var email = '';
  try {
    var st = JSON.parse(Buffer.from(String(q.state), 'base64url').toString('utf8'));
    email = String(st.e || '').toLowerCase();
    if (!email) throw new Error('no email in state');
    if (Date.now() - Number(st.t || 0) > 15 * 60 * 1000) {
      return res.status(200).send(page('That link expired',
        'The connection window timed out. Please start again from the Integrations screen.', false));
    }
  } catch (e) {
    return res.status(200).send(page('Could not verify that request',
      'Please start again from the Integrations screen inside ResBizAI.', false));
  }

  try {
    // ---- exchange the code for tokens -----------------------------------
    var tr = await fetch(SQ_BASE + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
      body: JSON.stringify({
        client_id: SQ_ID, client_secret: SQ_SECRET,
        code: String(q.code), grant_type: 'authorization_code',
        redirect_uri: SITE + '/api/pos-callback'
      })
    });
    var td = await tr.json();
    if (!tr.ok || !td.access_token) {
      console.error('square token exchange failed', tr.status, JSON.stringify(td).slice(0, 200));
      return res.status(200).send(page('Square declined the connection',
        'The authorisation could not be completed. Please try again, or contact us if it keeps happening.', false));
    }

    // ---- which location? -------------------------------------------------
    var locId = '', locName = '';
    try {
      var lr = await fetch(SQ_BASE + '/v2/locations', {
        headers: { 'Square-Version': '2025-01-23', Authorization: 'Bearer ' + td.access_token }
      });
      var ld = await lr.json();
      var locs = (ld && ld.locations) || [];
      var active = locs.filter(function (l) { return l.status === 'ACTIVE'; });
      var pick = active[0] || locs[0];
      if (pick) { locId = pick.id || ''; locName = pick.name || ''; }
    } catch (e) {}

    // ---- store it --------------------------------------------------------
    var base = SUPABASE_URL.replace(/\/$/, '');
    var H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY };
    var save = await fetch(base + '/rest/v1/pos_connections', {
      method: 'POST',
      headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_email: email, provider: 'square',
        merchant_id: td.merchant_id || '',
        access_token: td.access_token,
        refresh_token: td.refresh_token || '',
        expires_at: td.expires_at || null,
        location_id: locId, location_name: locName,
        status: 'connected', connected_at: new Date().toISOString()
      })
    });
    if (!save.ok) {
      var se = await save.text().catch(function () { return ''; });
      console.error('store pos connection failed', save.status, se.slice(0, 200));
      return res.status(200).send(page('Almost there',
        'Square approved the connection but we could not save it. Please try once more.', false));
    }

    return res.status(200).send(page('Square is connected',
      'ResBizAI can now read your sales from '
      + (locName ? ('<b>' + locName.replace(/[<>&]/g, '') + '</b>') : 'your Square account')
      + '. Head to the Integrations screen to pull in a day of sales.', true));

  } catch (e) {
    console.error('pos-callback error', e && e.message);
    return res.status(200).send(page('Something went wrong',
      'We could not finish connecting Square. Please try again from the Integrations screen.', false));
  }
};
