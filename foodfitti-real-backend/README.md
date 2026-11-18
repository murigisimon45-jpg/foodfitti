# Foodfitti — REAL BACKEND — Render + Supabase + GitHub (No pasting inside HTML)

No pasting inside index.html / admin.html. No Supabase keys in the frontend. No extra writings in the UI.
- Keys live ONLY in Render Dashboard -> Environment Variables (server side).
- Frontend is clean, original UI — it just calls /actions on the SAME site, backend does the Supabase work.

## How it works
- Customer on ANY phone in Kenya opens Customer link -> places order -> browser calls /actions on YOUR Render backend -> backend saves to YOUR Supabase `foodfitti_orders`.
- Admin on YOUR different phone opens Admin link -> browser calls /actions on SAME backend -> backend reads SAME Supabase -> sees order live (auto-refresh every 15s).
- Admin changes Tracking / Settings -> backend saves to Supabase -> Customer sees it via Track Order.
- One Render service serves BOTH UIs + backend, one URL for all of Kenya.

## What's inside
- `index.html` — Customer only, clean original UI, NO keys, NO Supabase text, NO placeholders to paste
- `admin.html` — Standalone Admin, clean original UI, NO keys, NO Deploy / Supabase help writings in UI
- `server.js` — Real backend (Node, no dependencies). Serves both HTML files + /actions API. Reads keys from Render env vars.
- `package.json` — start: node server.js
- `render.yaml` — Render Web Service config
- `supabase.sql` — Run once in Supabase
- `.env.example` — Shows the 2 env var names (do NOT paste real keys in this file, paste them in Render Dashboard)
- `README.md` — this file
- `.gitignore`

## STEP-BY-STEP — No pasting inside HTML

### STEP 1 — Supabase (2 mins)
1. Go to supabase.com -> Open YOUR project (or create a new one).
2. Left menu -> SQL Editor -> New query.
3. Open `supabase.sql` from this ZIP, copy ALL, paste into Supabase SQL Editor, click Run.
4. Check Table Editor — you should see:
   - `foodfitti_orders`
   - `foodfitti_settings`
   - `foodfitti_tracking`
   - `foodfitti_theme`
   - `foodfitti_admin`
5. Get YOUR keys (do NOT paste them into HTML):
   - Supabase -> Project Settings -> API -> Copy `Project URL`
   - Copy `anon` key
   - Keep them open for Step 3 — you will paste them in RENDER, not in HTML.

### STEP 2 — GitHub (no editing HTML)
1. Go to github.com -> + -> New repository.
   - Name: `foodfitti`
   - Public -> Create repository.
2. Add file -> Upload files.
3. Drag from the unzipped folder (DO NOT EDIT THEM):
   - `index.html`
   - `admin.html`
   - `server.js`
   - `package.json`
   - `render.yaml`
   - (Optional: `supabase.sql`, `README.md`, `.env.example`)
4. Commit changes. All files at ROOT, not in a subfolder. Do NOT upload the ZIP itself.

### STEP 3 — Render (THIS is where you paste keys — NOT in HTML)
1. Go to dashboard.render.com -> New + -> Web Service (NOT Static Site).
2. Connect GitHub -> pick `foodfitti` repo.
3. Settings:
   - Name: `foodfitti`
   - Branch: `main`
   - Runtime: Node
   - Build Command: (leave EMPTY)
   - Start Command: `node server.js`
4. Scroll to Environment Variables -> Add:
   - Key: `SUPABASE_URL` | Value: YOUR Project URL (paste here)
   - Key: `SUPABASE_ANON_KEY` | Value: YOUR anon key (paste here)
   - Click Add / Save.
   - These live on Render's server only. They are NEVER in index.html / admin.html.
5. Click Create Web Service -> wait for Live (green).
6. Your live links (ONE service, ONE URL):
   - Customer: `https://foodfitti.onrender.com/`
   - Admin: `https://foodfitti.onrender.com/admin.html`
   - Health check: `https://foodfitti.onrender.com/api/health` (should say configured: true)

### STEP 4 — Test cross-phone sync
1. Phone A (customer): Open Customer link -> Place test order -> Note Order ID like FT-1234.
2. Phone B (your admin phone, DIFFERENT phone): Open Admin link -> Create passcode -> Orders -> Should see test order within 15s.
3. Phone B: Change Tracking to Packed.
4. Phone A: Track Order -> enter Order ID -> Should show Packed.
5. Phone B: Delete test order when done.

## If orders don't appear
1. Supabase SQL ran? Table Editor must show 5 tables.
2. Render Environment Variables set? Check Render -> Environment -> SUPABASE_URL + SUPABASE_ANON_KEY exist. If you added them AFTER deploy, click Manual Deploy -> Deploy latest commit.
3. Check /api/health — if configured: false, env vars are missing.
4. Both phones have internet?
5. GitHub files at ROOT? server.js present? Start Command is `node server.js`?

## If Render shows blank / Cannot GET /
- Service Type must be Web Service (not Static Site).
- Start Command is `node server.js`.
- Check Render Logs for errors.

## Daily use
- Share Customer link anywhere in Kenya.
- Keep Admin link bookmarked. Verify M-Pesa code against M-Pesa messages, mark Verified, update Tracking.
- Change prices / zones / Pochi / WhatsApp in Admin Settings — syncs to customer phones automatically.

## M-Pesa (still manual)
- Customer enters M-Pesa code twice. Must match.
- Matching code does NOT prove payment. Admin verifies against M-Pesa messages, then marks Verified.
- Prepaid orders stay "Awaiting payment verification" until you mark them.

---
Foodfitti Savoury Chapati — Made with love. Layered with flavour. — Murigi-inc
