# My Ayvana — Vercel Deployment Guide

## Project Structure

```
my-ayvana/
├── api/
│   └── data.js          ← Serverless function (Vercel Blob backend)
├── public/
│   └── index.html       ← The full app (calls /api/data)
├── package.json
├── vercel.json
└── README.md
```

---

## Quick Deploy (5 steps)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Install dependencies
```bash
cd my-ayvana
npm install
```

### 3. Link to your Vercel account
```bash
vercel link
```
Follow the prompts. Select your team/account.

### 4. Add your Blob token as an environment variable
In the Vercel dashboard → your project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `BLOB_READ_WRITE_TOKEN` | your token from Vercel Storage → `my-ayvana-blob` → `.env.local` |

Or via CLI:
```bash
vercel env add BLOB_READ_WRITE_TOKEN
# paste your token when prompted
```

### 5. Deploy
```bash
vercel --prod
```

Your app is live at `https://my-ayvana.vercel.app` (or whatever URL Vercel assigns).

---

## How Vercel Blob is used

All user data is stored in your `my-ayvana-blob` store under these paths:

```
ayvana/accounts.json           ← all registered users + passwords
ayvana/users/ali.json          ← Ali's data (employees, schedules, tips…)
ayvana/users/bob.json          ← another user's data
```

The API route (`api/data.js`) is the only place that holds the blob token.
The browser never sees the token — it just calls `/api/data`.

### Write-through caching
Every save writes to localStorage immediately (so the UI is instant),
then pushes to Vercel Blob in the background. On next login, Blob is
checked first for the latest data, falling back to the local cache if
offline.

---

## Local development
```bash
vercel dev
```
This runs the serverless functions locally. You still need the
`BLOB_READ_WRITE_TOKEN` in a local `.env` file:
```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
```

---

## Default credentials
- **Username:** Ali
- **Password:** Ayvanagoodfood

Change credentials in the app → Settings → Change Credentials.
Password changes are saved to Vercel Blob immediately.

---

## Security notes
- The blob token lives only in `process.env` on Vercel servers
- Blob file paths use sanitised, lowercase-only usernames
- All blobs are stored with `access: 'public'` (Vercel Blob requirement)
  but URLs are long random strings — not guessable
- Passwords are stored as plaintext in this version. For a production
  restaurant app with multiple staff, consider adding bcrypt hashing
  via `npm install bcryptjs` in the API route.
