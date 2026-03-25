// ═══════════════════════════════════════════════════════════════
// api/data.js  —  My Ayvana · Vercel Serverless Function
// ═══════════════════════════════════════════════════════════════
// Stores all user data in Vercel Blob (my-ayvana-blob).
// BLOB_READ_WRITE_TOKEN lives only here — never sent to the browser.
//
// File layout inside the blob store:
//   ayvana/accounts.json          — { "ali": { username, password }, … }
//   ayvana/users/user-Ali.json    — Ali's full app data
//   ayvana/users/user-Bob.json    — Bob's full app data
//
// API surface (all via /api/data):
//   GET  ?action=getAccounts
//   GET  ?action=getUser&user=Ali
//   POST { action:'saveAccounts', accounts:{…} }
//   POST { action:'saveUser',     user:'Ali', data:{…} }
//   POST { action:'deleteUser',   user:'Ali' }
// ═══════════════════════════════════════════════════════════════

import { put, list, del } from '@vercel/blob';

// ── key helpers ──────────────────────────────────────────────────
const ACCOUNTS_PATH = 'ayvana/accounts.json';

function userPath(username) {
  // Sanitise to alphanumeric + hyphen/underscore — no path traversal
  const safe = String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ayvana/users/user-${safe}.json`;
}

// ── CORS headers ─────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Read a blob by its deterministic path ────────────────────────
// We use `list({ prefix })` to look up the current URL of a known path,
// then fetch its content. This avoids storing URLs client-side.
async function readBlob(path) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const { blobs } = await list({ prefix: path, token, limit: 1 });
    if (!blobs || blobs.length === 0) return null;

    // Pick the blob whose pathname matches exactly
    const match = blobs.find(b => b.pathname === path);
    if (!match) return null;

    const res = await fetch(match.url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[readBlob] error reading', path, err.message);
    return null;
  }
}

// ── Write / overwrite a blob ──────────────────────────────────────
async function writeBlob(path, data) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const body  = JSON.stringify(data, null, 0);

  await put(path, body, {
    access:          'public',          // required by Vercel Blob
    contentType:     'application/json',
    token,
    addRandomSuffix: false,             // keep deterministic path
    allowOverwrite:  true,
  });
}

// ── Delete a blob ─────────────────────────────────────────────────
async function deleteBlob(path) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    // Need the URL to delete; look it up first
    const { blobs } = await list({ prefix: path, token, limit: 1 });
    const match = blobs?.find(b => b.pathname === path);
    if (match) await del(match.url, { token });
  } catch (_) { /* blob may not exist — that's fine */ }
}

// ── Main handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      ok:    false,
      error: 'BLOB_READ_WRITE_TOKEN environment variable is not set. ' +
             'Add it in Vercel Dashboard → Project → Settings → Environment Variables.'
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

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    // ── POST ───────────────────────────────────────────────────────
    if (req.method === 'POST') {
      // Vercel parses JSON bodies automatically when Content-Type is application/json
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { action } = body || {};

      if (action === 'saveAccounts') {
        if (!body.accounts) return res.status(400).json({ ok: false, error: 'accounts required' });
        await writeBlob(ACCOUNTS_PATH, body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (action === 'saveUser') {
        if (!body.user || !body.data) return res.status(400).json({ ok: false, error: 'user and data required' });
        await writeBlob(userPath(body.user), body.data);
        return res.status(200).json({ ok: true });
      }

      if (action === 'deleteUser') {
        if (!body.user) return res.status(400).json({ ok: false, error: 'user required' });
        await deleteBlob(userPath(body.user));
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API handler] unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error', detail: err.message });
  }
}
