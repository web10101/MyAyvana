// ═══════════════════════════════════════════════════════════════
// api/data.js  ·  My Ayvana  ·  Vercel Serverless Function
// ───────────────────────────────────────────────────────────────
// Blob file layout inside my-ayvana-blob:
//
//   ayvana/accounts.json            ← { "ali": { username, password } }
//   ayvana/users/user-Ali.json      ← Ali's full app data
//   ayvana/users/user-Maria.json    ← Maria's full app data
//
// API (all via /api/data):
//   GET  ?action=getAccounts
//   GET  ?action=getUser&user=Ali
//   POST { action:'saveAccounts', accounts }
//   POST { action:'saveUser',     user, data }
// ═══════════════════════════════════════════════════════════════

import { put, list } from '@vercel/blob';

// ── Path helpers ─────────────────────────────────────────────────
const ACCOUNTS_PATH = 'ayvana/accounts.json';

function userPath(username) {
  const safe = String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ayvana/users/user-${safe}.json`;
}

// ── CORS ─────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Read blob by known path ───────────────────────────────────────
// list({ prefix }) gives us the current CDN URL; then we fetch it.
// This is necessary because Vercel Blob generates random URL suffixes
// even when addRandomSuffix:false is set on older SDK versions.
async function readBlob(path) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const { blobs } = await list({ prefix: path, token, limit: 10 });
    // Find exact pathname match (list can return prefix-matched entries)
    const match = blobs.find(b => b.pathname === path);
    if (!match) return null;
    const res = await fetch(match.url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[readBlob]', path, err.message);
    return null;
  }
}

// ── Write / overwrite blob ────────────────────────────────────────
async function writeBlob(path, data) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  await put(path, JSON.stringify(data), {
    access:          'public',
    contentType:     'application/json',
    token,
    addRandomSuffix: false,
    allowOverwrite:  true,
  });
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);

  // Preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Guard: token must be set
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is not set');
    return res.status(500).json({
      ok:    false,
      error: 'BLOB_READ_WRITE_TOKEN is not configured. ' +
             'Go to Vercel Dashboard → Project → Settings → ' +
             'Environment Variables and add BLOB_READ_WRITE_TOKEN.',
    });
  }

  try {
    // ── GET ────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, user } = req.query;

      if (action === 'getAccounts') {
        const data = await readBlob(ACCOUNTS_PATH);
        return res.status(200).json({ ok: true, data: data ?? {} });
      }

      if (action === 'getUser') {
        if (!user) return res.status(400).json({ ok: false, error: 'user param required' });
        const data = await readBlob(userPath(user));
        return res.status(200).json({ ok: true, data: data ?? null });
      }

      return res.status(400).json({ ok: false, error: 'Unknown GET action: ' + action });
    }

    // ── POST ───────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

      if (!body || !body.action) {
        return res.status(400).json({ ok: false, error: 'Missing action in POST body' });
      }

      if (body.action === 'saveAccounts') {
        if (!body.accounts) return res.status(400).json({ ok: false, error: 'accounts required' });
        await writeBlob(ACCOUNTS_PATH, body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'saveUser') {
        if (!body.user)  return res.status(400).json({ ok: false, error: 'user required' });
        if (!body.data)  return res.status(400).json({ ok: false, error: 'data required' });
        await writeBlob(userPath(body.user), body.data);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown POST action: ' + body.action });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API]', err.message, err.stack);
    return res.status(500).json({ ok: false, error: 'Server error', detail: err.message });
  }
}
