// api/data.mjs — My Ayvana · Vercel Blob backend (Optimized)
import { put, list } from '@vercel/blob';

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
    // We add a timestamp to the list call to bypass any potential Vercel Edge caching of the list result
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return null;
    
    // Fetch the actual content using a cache-busting query parameter
    const res = await fetch(`${blob.url}?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[getBlobContent]', pathname, err.message);
    return null;
  }
}

// Helper to save content to a blob
async function saveBlobContent(pathname, data) {
  // Vercel Blob handles overwrites automatically when addRandomSuffix is false
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'BLOB_READ_WRITE_TOKEN env var missing. Please connect your Blob store in the Vercel Dashboard.',
    });
  }

  try {
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
    }

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
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API crash]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
