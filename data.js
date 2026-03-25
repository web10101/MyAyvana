// api/data.js  — Vercel Serverless Function
// Handles all reads and writes to Vercel Blob storage.
// The BLOB_READ_WRITE_TOKEN is kept here on the server — never exposed to the browser.
//
// Endpoints:
//   GET  /api/data?action=getUser&user=<username>        → return user data blob
//   GET  /api/data?action=getAccounts                    → return accounts registry
//   POST /api/data  { action:'saveUser', user, data }    → write user data
//   POST /api/data  { action:'saveAccounts', accounts }  → write accounts registry
//   POST /api/data  { action:'deleteUser', user }        → delete a user blob

import { put, get, del, head } from '@vercel/blob';

// ── helpers ──────────────────────────────────────────────────────
const ACCOUNTS_KEY = 'ayvana/accounts.json';
function userKey(username) {
  // sanitise — only allow alphanumeric + underscore in filenames
  const safe = username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `ayvana/users/${safe}.json`;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readBlob(key) {
  try {
    // head() checks existence without fetching full body
    const meta = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!meta) return null;
    const res = await fetch(meta.url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function writeBlob(key, data) {
  const json = JSON.stringify(data);
  await put(key, json, {
    access: 'public',           // URLs are opaque random strings, not guessable
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,     // keep deterministic keys so we can overwrite
    allowOverwrite: true,
  });
}

// ── handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured on this deployment.' });
  }

  try {
    // ── GET requests ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, user } = req.query;

      if (action === 'getAccounts') {
        const data = await readBlob(ACCOUNTS_KEY);
        return res.status(200).json({ ok: true, data: data || {} });
      }

      if (action === 'getUser') {
        if (!user) return res.status(400).json({ error: 'user param required' });
        const data = await readBlob(userKey(user));
        return res.status(200).json({ ok: true, data: data || null });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── POST requests ─────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;
      // Vercel parses JSON bodies automatically; guard for raw string just in case
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
      }

      const { action } = body;

      if (action === 'saveAccounts') {
        const { accounts } = body;
        if (!accounts) return res.status(400).json({ error: 'accounts required' });
        await writeBlob(ACCOUNTS_KEY, accounts);
        return res.status(200).json({ ok: true });
      }

      if (action === 'saveUser') {
        const { user, data } = body;
        if (!user || !data) return res.status(400).json({ error: 'user and data required' });
        await writeBlob(userKey(user), data);
        return res.status(200).json({ ok: true });
      }

      if (action === 'deleteUser') {
        const { user } = body;
        if (!user) return res.status(400).json({ error: 'user required' });
        try {
          await del(userKey(user), { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch { /* blob may not exist */ }
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API Error]', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
