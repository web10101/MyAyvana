// api/data.mjs — My Ayvana · Vercel Blob backend (Optimized)
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
    // We add a timestamp to the list call to bypass any potential Vercel Edge caching of the list result
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return null;
    
    // Bypass CDN cache entirely so we always read the latest version
    const res = await fetch(blob.url, { cache: 'no-store' });
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
        const ts = Date.now();
        body.data._ts = ts; // server sets authoritative timestamp
        await saveBlobContent(userPath(body.user), body.data);
        return res.status(200).json({ ok: true, _ts: ts });
      }

      if (body.action === 'submitEmployeeTip') {
        if (!body.adminUser || !body.tip) return res.status(400).json({ ok: false, error: 'adminUser and tip required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        if (!Array.isArray(adminData.tips)) adminData.tips = [];
        adminData.tips.push(body.tip);
        adminData._ts = Date.now();
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'deleteTip') {
        if (!body.adminUser || !body.tipId) return res.status(400).json({ ok: false, error: 'adminUser and tipId required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        adminData.tips = (adminData.tips || []).filter(t => String(t.id) !== String(body.tipId));
        adminData._ts = Date.now();
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'addSharedNote') {
        if (!body.adminUser || !body.date || !body.note) return res.status(400).json({ ok: false, error: 'adminUser, date, note required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        if (!adminData.sharedNotes) adminData.sharedNotes = {};
        if (!Array.isArray(adminData.sharedNotes[body.date])) adminData.sharedNotes[body.date] = [];
        adminData.sharedNotes[body.date].push(body.note);
        adminData._ts = Date.now();
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'updateSharedNote') {
        if (!body.adminUser || !body.date || body.noteId == null) return res.status(400).json({ ok: false, error: 'adminUser, date, noteId required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        const n = (adminData.sharedNotes?.[body.date] || []).find(x => String(x.id) === String(body.noteId));
        if (n) { if (body.text !== undefined) n.text = body.text; if (body.done !== undefined) n.done = body.done; }
        adminData._ts = Date.now();
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'deleteSharedNote') {
        if (!body.adminUser || !body.date || body.noteId == null) return res.status(400).json({ ok: false, error: 'adminUser, date, noteId required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        if (adminData.sharedNotes?.[body.date]) adminData.sharedNotes[body.date] = adminData.sharedNotes[body.date].filter(n => String(n.id) !== String(body.noteId));
        adminData._ts = Date.now();
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'deleteUserAccount') {
        if (!body.username) return res.status(400).json({ ok: false, error: 'username required' });
        const accts = await getBlobContent(ACCOUNTS_PATH) ?? {};
        delete accts[body.username.toLowerCase()];
        await saveBlobContent(ACCOUNTS_PATH, accts);
        // Delete the user's data blob if it exists
        const path = userPath(body.username);
        const { blobs } = await list({ prefix: path, limit: 1 });
        const blob = blobs.find(b => b.pathname === path);
        if (blob) await del(blob.url);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API crash]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
