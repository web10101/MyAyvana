# My Ayvana — Vercel + Blob Storage (v5, production-ready)

## What was wrong before and what's fixed

| Problem | Fix |
|---------|-----|
| `api/data.js` used ESM `import` but no `"type":"module"` in package.json → Vercel couldn't parse it | Added `"type": "module"` to package.json |
| `vercel.json` routed `/(.*) → /index.html` but the file lives in `/public/` | Added `"outputDirectory": "public"` to vercel.json |
| `saveAccounts` was fire-and-forget (race condition on credential changes) | Now `await`ed on all credential operations |
| No loader shown while Blob API calls complete | Loading overlay added for login, session restore, credential save |

---

## Project layout

```
my-ayvana/
├── api/
│   └── data.js          ← Vercel serverless function (Blob I/O)
├── public/
│   └── index.html       ← Full app (calls /api/data)
├── package.json         ← "type":"module" ← critical
├── vercel.json          ← outputDirectory + rewrites
└── README.md
```

## Blob file layout (inside my-ayvana-blob)

```
ayvana/accounts.json        ← { "ali": { username, password } }
ayvana/users/user-Ali.json  ← Ali's full app data
ayvana/users/user-Bob.json  ← Bob's full app data
```

---

## Deploy

### 1. Install dependencies
```bash
npm install -g vercel
cd my-ayvana
npm install
```

### 2. Link to your Vercel project
```bash
vercel link
# Select your team / project
```

### 3. Set the blob token
In **Vercel Dashboard → Project → Settings → Environment Variables**:

| Name | Value |
|------|-------|
| `BLOB_READ_WRITE_TOKEN` | token from my-ayvana-blob → .env.local |

Or via CLI:
```bash
vercel env add BLOB_READ_WRITE_TOKEN production
```

### 4. Deploy
```bash
vercel --prod
```

---

## Default credentials
- **Username:** Ali
- **Password:** Ayvanagoodfood

---

## Local development
```bash
# Create .env in the project root:
echo "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxx" > .env
vercel dev
```

---

## How saves work
1. Every change calls `save()` which:
   - Writes to `localStorage` immediately (UI is instant)
   - Posts to `/api/data` in the background (fire-and-forget)
2. On login, `/api/data?action=getUser` is called first; localStorage is the fallback
3. On logout, a final `await pushUserData()` ensures the last state is flushed to Blob before the session clears
