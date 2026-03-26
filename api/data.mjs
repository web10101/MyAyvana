// api/data.mjs — My Ayvana · Vercel Serverless Function
// Store type: PRIVATE (access: 'private')

const ACCOUNTS_PATH = 'ayvana/accounts.json';

function userPath(username) {
  const safe = String(username).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ayvana/users/user-${safe}.json`;
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Read a private blob by its known pathname
async function readBlob(pathname) {
  const { get } = await import('@vercel/blob');
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    // get() takes the full pathname and returns a result with a stream
    const result = await get(pathname, { access: 'private', token });
    if (!result || result.statusCode === 404) return null;
    // Read the stream to text then parse JSON
    const chunks = [];
    for await (const chunk of result.stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(text);
  } catch (err) {
    // Not found is normal (first time use)
    if (err.message && err.message.includes('not found')) return null;
    console.error('[readBlob]', pathname, err.message);
    return null;
  }
}

// Write a private blob
async function writeBlob(pathname, data) {
  const { put } = await import('@vercel/blob');
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: 'BLOB_READ_WRITE_TOKEN is not set.',
    });
  }

  try {
    // ── GET ──────────────────────────────────────────────────────
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

      return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
    }

    // ── POST ─────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.action) return res.status(400).json({ ok: false, error: 'Missing action' });

      if (body.action === 'saveAccounts') {
        if (!body.accounts) return res.status(400).json({ ok: false, error: 'accounts required' });
        await writeBlob(ACCOUNTS_PATH, body.accounts);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'saveUser') {
        if (!body.user || !body.data) return res.status(400).json({ ok: false, error: 'user and data required' });
        await writeBlob(userPath(body.user), body.data);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action: ' + body.action });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API crash]', err.message, err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
