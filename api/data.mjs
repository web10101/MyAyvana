// api/data.mjs — My Ayvana · Vercel Blob backend
import { put, list, del } from '@vercel/blob';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function userPath(username) {
  return 'ayvana/users/user-' + String(username).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

const ACCOUNTS_PATH = 'ayvana/accounts.json';

// Helper to find a blob by its path (pathname)
async function getBlobContent(pathname) {
  try {
    const { blobs } = await list({ prefix: pathname });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[getBlobContent]', pathname, err.message);
    return null;
  }
}

// Helper to save content to a blob (overwriting by deleting first if exists)
async function saveBlobContent(pathname, data) {
  // Overwrite is handled by Vercel Blob by just putting to the same path, 
  // but we can also explicitly delete old versions if needed. 
  // For simplicity, we just put() with the same pathname.
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false, // Important to keep the same URL/path
    contentType: 'application/json',
  });
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check if Blob is connected
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'BLOB_READ_WRITE_TOKEN env var missing. Please create a Blob store in Vercel Dashboard → Storage and connect it to this project.',
    });
  }

  try {
    // ── GET ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, user } = req.query;

      if (action === 'getAccounts') {
        const data = await getBlobContent(ACCOUNTS_PATH);
        return res.status(200).json({ ok: true, data: data ?? {} });
      }

      if (action === 'getUser') {
        if (!user) return res.status(400).json({ ok: false, error: 'user param required' });
        const data = await getBlobContent(userPath(user));
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
        await saveBlobContent(ACCOUNTS_PATH, body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'saveUser') {
        if (!body.user || !body.data) return res.status(400).json({ ok: false, error: 'user and data required' });
        await saveBlobContent(userPath(body.user), body.data);
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
