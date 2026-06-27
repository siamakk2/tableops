module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, Prefer');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = 'https://rlvibtvyaunuiwizqigj.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsdmlidHZ5YXVudWl3aXpxaWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM1MzI3NzEsImV4cCI6MjA0OTEwODc3MX0.placeholder';

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const { action, table, data, id, filters, user_id, token } = body;
    const authToken = token || KEY;

    const headers = {
      'Content-Type': 'application/json',
      'apikey': KEY,
      'Authorization': 'Bearer ' + authToken,
      'Prefer': 'return=representation'
    };

    let url, method, sbBody;

    if (action === 'select') {
      let query = `${SB_URL}/rest/v1/${table}?`;
      if (user_id) query += `user_id=eq.${encodeURIComponent(user_id)}&`;
      if (filters) Object.keys(filters).forEach(k => { query += `${k}=eq.${encodeURIComponent(filters[k])}&`; });
      query += 'order=created_at.asc&limit=500';
      const r = await fetch(query, { headers });
      if (!r.ok) {
        const err = await r.text();
        return res.status(200).json({ data: [], error: err });
      }
      const d = await r.json();
      return res.status(200).json({ data: Array.isArray(d) ? d : [], error: null });

    } else if (action === 'insert') {
      url = `${SB_URL}/rest/v1/${table}`;
      method = 'POST';
      sbBody = JSON.stringify(Array.isArray(data) ? data : [data]);

    } else if (action === 'update') {
      url = `${SB_URL}/rest/v1/${table}?id=eq.${id}`;
      method = 'PATCH';
      sbBody = JSON.stringify(data);

    } else if (action === 'delete') {
      url = `${SB_URL}/rest/v1/${table}?id=eq.${id}`;
      method = 'DELETE';
      headers['Prefer'] = 'return=minimal';

    } else if (action === 'upsert') {
      url = `${SB_URL}/rest/v1/${table}`;
      method = 'POST';
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
      sbBody = JSON.stringify(Array.isArray(data) ? data : [data]);

    } else if (action === 'rpc') {
      url = `${SB_URL}/rest/v1/rpc/${table}`;
      method = 'POST';
      sbBody = JSON.stringify(data || {});

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    const r = await fetch(url, { method, headers, body: sbBody });
    if (action === 'delete') return res.status(200).json({ data: { deleted: true }, error: null });
    const d = await r.json();
    return res.status(200).json({ data: d, error: null });

  } catch (err) {
    console.error('DB relay error:', err);
    return res.status(200).json({ data: null, error: err.message });
  }
};
