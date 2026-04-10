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

// Shared notes are stored in a SEPARATE blob so saveUser never races with note writes
function sharedNotesPath(adminUsername) {
  return 'ayvana/snotes/user-' + String(adminUsername).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

const ACCOUNTS_PATH = 'ayvana/accounts.json';

// Helper to find a blob by its path (pathname)
async function getBlobContent(pathname) {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const blob = blobs.find(b => b.pathname === pathname);
    if (!blob) return null;
    // Use downloadUrl to bypass CDN cache and always get the latest version
    const fetchUrl = blob.downloadUrl || blob.url;
    const res = await fetch(fetchUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[getBlobContent]', pathname, err.message);
    return null;
  }
}

// Helper to save content to a blob
async function saveBlobContent(pathname, data) {
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
        // Fetch user data and shared notes in parallel
        const [userData, notesBlob] = await Promise.all([
          getBlobContent(userPath(user)),
          getBlobContent(sharedNotesPath(user)),
        ]);
        const combined = userData ? { ...userData } : null;
        if (combined) {
          if (notesBlob) {
            // Notes blob is the authoritative source for sharedNotes
            combined.sharedNotes = notesBlob.notes || {};
            combined._snTs = notesBlob._snTs || 0;
          } else if (combined.sharedNotes) {
            // Legacy: sharedNotes still in user blob (before migration) — keep them
            combined._snTs = combined._snTs || combined._ts || 0;
          }
          // Strip sharedNotes from user blob representation to keep things clean
          // (notes blob is the source of truth going forward)
        }
        return res.status(200).json({ ok: true, data: combined ?? null });
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
        // sharedNotes live in a separate blob — strip them so saveUser never touches notes
        delete body.data.sharedNotes;
        delete body.data._snTs;
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
        const ts = Date.now();
        adminData._ts = ts;
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true, _ts: adminData._ts });
      }

      if (body.action === 'deleteTip') {
        if (!body.adminUser || !body.tipId) return res.status(400).json({ ok: false, error: 'adminUser and tipId required' });
        const adminData = await getBlobContent(userPath(body.adminUser));
        if (!adminData) return res.status(404).json({ ok: false, error: 'Admin data not found' });
        adminData.tips = (adminData.tips || []).filter(t => String(t.id) !== String(body.tipId));
        const ts = Date.now();
        adminData._ts = ts;
        await saveBlobContent(userPath(body.adminUser), adminData);
        return res.status(200).json({ ok: true, _ts: adminData._ts });
      }

      if (body.action === 'addSharedNote') {
        if (!body.adminUser || !body.date || !body.note) return res.status(400).json({ ok: false, error: 'adminUser, date, note required' });
        const snPath = sharedNotesPath(body.adminUser);
        const notesBlob = await getBlobContent(snPath) ?? { notes: {}, _snTs: 0 };
        if (!notesBlob.notes) notesBlob.notes = {};
        if (!Array.isArray(notesBlob.notes[body.date])) notesBlob.notes[body.date] = [];
        notesBlob.notes[body.date].push(body.note);
        notesBlob._snTs = Date.now();
        await saveBlobContent(snPath, notesBlob);
        return res.status(200).json({ ok: true, _snTs: notesBlob._snTs });
      }

      if (body.action === 'updateSharedNote') {
        if (!body.adminUser || !body.date || body.noteId == null) return res.status(400).json({ ok: false, error: 'adminUser, date, noteId required' });
        const snPath = sharedNotesPath(body.adminUser);
        const notesBlob = await getBlobContent(snPath);
        if (!notesBlob) return res.status(404).json({ ok: false, error: 'Notes not found' });
        const n = (notesBlob.notes?.[body.date] || []).find(x => String(x.id) === String(body.noteId));
        if (n) { if (body.text !== undefined) n.text = body.text; if (body.done !== undefined) n.done = body.done; }
        notesBlob._snTs = Date.now();
        await saveBlobContent(snPath, notesBlob);
        return res.status(200).json({ ok: true, _snTs: notesBlob._snTs });
      }

      if (body.action === 'deleteSharedNote') {
        if (!body.adminUser || !body.date || body.noteId == null) return res.status(400).json({ ok: false, error: 'adminUser, date, noteId required' });
        const snPath = sharedNotesPath(body.adminUser);
        const notesBlob = await getBlobContent(snPath);
        if (!notesBlob) return res.status(404).json({ ok: false, error: 'Notes not found' });
        if (notesBlob.notes?.[body.date]) notesBlob.notes[body.date] = notesBlob.notes[body.date].filter(n => String(n.id) !== String(body.noteId));
        notesBlob._snTs = Date.now();
        await saveBlobContent(snPath, notesBlob);
        return res.status(200).json({ ok: true, _snTs: notesBlob._snTs });
      }

      if (body.action === 'deleteUserAccount') {
        if (!body.username) return res.status(400).json({ ok: false, error: 'username required' });
        const accts = await getBlobContent(ACCOUNTS_PATH) ?? {};
        delete accts[body.username.toLowerCase()];
        await saveBlobContent(ACCOUNTS_PATH, accts);
        // Delete the user's data blob and notes blob if they exist
        const uPath = userPath(body.username);
        const snPath = sharedNotesPath(body.username);
        const { blobs: uBlobs } = await list({ prefix: uPath, limit: 1 });
        const uBlob = uBlobs.find(b => b.pathname === uPath);
        if (uBlob) await del(uBlob.url);
        const { blobs: snBlobs } = await list({ prefix: snPath, limit: 1 });
        const snBlob = snBlobs.find(b => b.pathname === snPath);
        if (snBlob) await del(snBlob.url);
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API crash]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
