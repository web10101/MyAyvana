// api/data.mjs — My Ayvana · Vercel KV (Redis) backend
import { kv } from '@vercel/kv';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function userKey(username) {
  return 'user_' + String(username).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
}

const ACCOUNTS_KEY = 'ayvana_accounts';

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check if KV is connected
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'Vercel KV is not connected. Please create a KV database in Vercel Dashboard → Storage and connect it to this project.',
    });
  }

  try {
    // ── GET ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, user } = req.query;

      if (action === 'getAccounts') {
        const data = await kv.get(ACCOUNTS_KEY);
        return res.status(200).json({ ok: true, data: data ?? {} });
      }

      if (action === 'getUser') {
        if (!user) return res.status(400).json({ ok: false, error: 'user param required' });
        const data = await kv.get(userKey(user));
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
        await kv.set(ACCOUNTS_KEY, body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'saveUser') {
        if (!body.user || !body.data) return res.status(400).json({ ok: false, error: 'user and data required' });
        await kv.set(userKey(body.user), body.data);
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
