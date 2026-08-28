// Daily digest for ResBizAI.
//   action: "settings" | "save" | "send"
// Sends a short end-of-day summary so the owner hears from the app without
// having to remember to open it. Uses Resend if configured, otherwise reports
// honestly rather than failing silently.

function readBody(req) {
  var b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}
function money(v) { return '$' + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function pct(part, whole) { return whole ? ((part / whole) * 100).toFixed(1) + '%' : '—'; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  var SUPABASE_URL = process.env.SUPABASE_URL || 'https://dfytyzgbihqggkwuzkfx.supabase.co';
  var KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  var RESEND = process.env.RESEND_API_KEY;
  if (!KEY) return res.status(200).json({ ok: false, error: 'Not configured.' });

  var base = SUPABASE_URL.replace(/\/$/, '');
  var H = { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY };
  var body = readBody(req);

  // identify caller
  var email = '';
  try {
    var token = String(body.token || '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'Not signed in.' });
    var ur = await fetch(base + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + token } });
    if (!ur.ok) return res.status(401).json({ ok: false, error: 'Session expired.' });
    var u = await ur.json();
    email = String((u && u.email) || '').toLowerCase();
    if (!email) return res.status(401).json({ ok: false, error: 'Unknown account.' });
  } catch (e) { return res.status(401).json({ ok: false, error: 'Could not verify session.' }); }

  var action = body.action || 'settings';

  try {
    if (action === 'settings') {
      var r = await fetch(base + '/rest/v1/digest_prefs?user_email=eq.' + encodeURIComponent(email)
        + '&select=enabled,send_to,hour', { headers: H });
      var rows = r.ok ? await r.json() : [];
      var p = (Array.isArray(rows) && rows[0]) || null;
      return res.status(200).json({
        ok: true,
        enabled: p ? !!p.enabled : false,
        sendTo: p ? (p.send_to || email) : email,
        hour: p ? (p.hour || 22) : 22,
        canSend: !!RESEND
      });
    }

    if (action === 'save') {
      await fetch(base + '/rest/v1/digest_prefs', {
        method: 'POST',
        headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          user_email: email,
          enabled: !!body.enabled,
          send_to: String(body.sendTo || email).toLowerCase().slice(0, 160),
          hour: Math.min(23, Math.max(0, parseInt(body.hour, 10) || 22)),
          updated_at: new Date().toISOString()
        })
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'send') {
      var d = body.data || {};
      var rest = String(d.restaurant || 'your restaurant');
      var date = String(d.date || new Date().toISOString().slice(0, 10));
      var rev = Number(d.revenue) || 0, food = Number(d.food) || 0, labor = Number(d.labor) || 0;
      var covers = Number(d.covers) || 0, seats = Number(d.seats) || 0;
      var low = Array.isArray(d.low) ? d.low : [];
      var notes = Array.isArray(d.notes) ? d.notes : [];

      var prime = rev ? ((food + labor) / rev * 100) : 0;
      var lines = [];
      lines.push(['Revenue', money(rev)]);
      if (rev) {
        lines.push(['Food cost', money(food) + ' (' + pct(food, rev) + ')']);
        lines.push(['Labor cost', money(labor) + ' (' + pct(labor, rev) + ')']);
        lines.push(['Prime cost', prime.toFixed(1) + '%']);
        lines.push(['Net after prime', money(rev - food - labor)]);
      }
      if (covers) {
        lines.push(['Covers', String(covers)]);
        if (seats) lines.push(['Seat turns', (covers / seats).toFixed(2)]);
        lines.push(['Average per cover', money(rev / covers)]);
      }

      var subject = rest + ' — ' + date + (rev ? (' — ' + money(rev)) : '');
      var rowsHtml = lines.map(function (l) {
        return '<tr><td style="padding:7px 16px 7px 0;color:#7a6a5d;font-size:14px">' + esc(l[0])
          + '</td><td style="padding:7px 0;font-size:15px;font-weight:600;color:#2a1e1a">' + esc(l[1]) + '</td></tr>';
      }).join('');
      var attention = '';
      if (notes.length || low.length) {
        attention = '<div style="margin-top:22px;padding:16px;background:#fff6ee;border-left:3px solid #ff4f2e;border-radius:8px">'
          + '<b style="font-size:14px;color:#2a1e1a">Worth a look</b><ul style="margin:9px 0 0;padding-left:18px;color:#5c4d42;font-size:14px;line-height:1.7">'
          + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('')
          + (low.length ? ('<li>Low or out of stock: ' + esc(low.slice(0, 8).join(', ')) + '</li>') : '')
          + '</ul></div>';
      }
      var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;'
        + 'max-width:560px;margin:0 auto;padding:26px">'
        + '<div style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#ff4f2e;font-weight:700">ResBizAI</div>'
        + '<h1 style="font-size:22px;color:#2a1e1a;margin:8px 0 4px">' + esc(rest) + '</h1>'
        + '<div style="color:#8a7a6c;font-size:14px;margin-bottom:20px">' + esc(date) + '</div>'
        + '<table style="width:100%;border-collapse:collapse">' + rowsHtml + '</table>'
        + attention
        + '<div style="margin-top:26px"><a href="https://resbizai.com/app" style="background:#ff4f2e;'
        + 'color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:9px;'
        + 'display:inline-block">Open ResBizAI</a></div>'
        + '<div style="margin-top:22px;color:#a89887;font-size:12px;line-height:1.6">'
        + 'You are getting this because daily summaries are switched on. '
        + 'Turn them off any time in Settings.</div></div>';

      var text = rest + ' — ' + date + '\n\n' + lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n')
        + (notes.length ? ('\n\nWorth a look:\n- ' + notes.join('\n- ')) : '')
        + (low.length ? ('\n- Low stock: ' + low.slice(0, 8).join(', ')) : '');

      if (!RESEND) {
        return res.status(200).json({ ok: false, preview: { subject: subject, text: text },
          error: 'Email sending is not configured on the server yet, so here is the summary instead.' });
      }
      var to = String(body.sendTo || email).toLowerCase();
      var sr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND },
        body: JSON.stringify({
          from: process.env.RB_FROM_EMAIL || 'ResBizAI <onboarding@resend.dev>',
          to: [to], subject: subject, text: text, html: html
        })
      });
      if (!sr.ok) {
        var et = await sr.text().catch(function () { return ''; });
        console.error('digest send failed', sr.status, et.slice(0, 200));
        return res.status(200).json({ ok: false, preview: { subject: subject, text: text },
          error: 'Could not send that email.' });
      }
      return res.status(200).json({ ok: true, sentTo: to });
    }

    return res.status(200).json({ ok: false, error: 'Unknown action.' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Digest error: ' + (e && e.message ? e.message : String(e)) });
  }
};
