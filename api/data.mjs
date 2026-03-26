// api/data.mjs — My Ayvana · Vercel Edge Config backend
// Edge Config ID: ecfg_n0z3urbtixcglikkeqhks4dptwka
//
// Keys:
//   "accounts"   → { ali: { username, passwordHash }, ... }
//   "user_Ali"   → Ali's full app data
//   "user_Bob"   → Bob's full app data

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function userKey(username) {
  return 'user_' + String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// READ via Edge Config SDK (@vercel/edge-config)
async function ecGet(key) {
  try {
    const { createClient } = await import('@vercel/edge-config');
    const client = createClient(process.env.EDGE_CONFIG);
    const value  = await client.get(key);
    return value ?? null;
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('does not exist')) return null;
    console.error('[ecGet]', key, err.message);
    return null;
  }
}

// WRITE via Vercel REST API (Edge Config SDK is read-only)
async function ecSet(key, value) {
  const configId = 'ecfg_n0z3urbtixcglikkeqhks4dptwka';
  const token    = process.env.EDGE_CONFIG_TOKEN;

  if (!token) throw new Error('EDGE_CONFIG_TOKEN env var is not set');

  const res = await fetch(
    `https://api.vercel.com/v1/edge-config/${configId}/items`,
    {
      method:  'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        items: [{ operation: 'upsert', key, value }],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Config write failed (${res.status}): ${text}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.EDGE_CONFIG) {
    return res.status(500).json({
      ok: false,
      error: 'EDGE_CONFIG env var missing. Connect the Edge Config store to this project in Vercel Dashboard → Storage → your store → Projects.',
    });
  }
  if (!process.env.EDGE_CONFIG_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'EDGE_CONFIG_TOKEN env var missing. Add it in Vercel Dashboard → Project → Settings → Environment Variables.',
    });
  }

  try {
    // ── GET ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, user } = req.query;

      if (action === 'getAccounts') {
        const data = await ecGet('accounts');
        return res.status(200).json({ ok: true, data: data ?? {} });
      }

      if (action === 'getUser') {
        if (!user) return res.status(400).json({ ok: false, error: 'user param required' });
        const data = await ecGet(userKey(user));
        return res.status(200).json({ ok: true, data: data ?? null });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
    }

    // ── POST ─────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.action) return res.status(400).json({ ok: false, error: 'Missing action' });

      if (body.action === 'saveAccounts') {
        if (!body.accounts) return res.status(400).json({ ok: false, error: 'accounts required' });
        await ecSet('accounts', body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'saveUser') {
        if (!body.user || !body.data) return res.status(400).json({ ok: false, error: 'user and data required' });
        await ecSet(userKey(body.user), body.data);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action: ' + body.action });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API crash]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
