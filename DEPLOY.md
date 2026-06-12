# Deployment

This system is **two apps** deployed separately:

| Part | Hosts | Why |
|------|-------|-----|
| **Backend** (Express, in `src/`) | **Railway** | Long-running server: Playwright PDF generation, WhatsApp batch timers, webhook. Does NOT fit serverless. |
| **Frontend** (React, in `frontend/`) | **Vercel** | Static SPA — ideal for Vercel. |

> ⚠️ The backend will **not** run on Vercel serverless functions (`FUNCTION_INVOCATION_FAILED`). Use Railway (or Render/Fly.io) for it.

---

## 1. Backend → Railway

1. Create a project at [railway.app](https://railway.app) → **Deploy from GitHub repo** → pick this repo.
2. Railway auto-detects Node (Nixpacks). `railway.json` already sets build/start/health.
   - Build: `npm run build` (also runs `postinstall` → installs Playwright Chromium)
   - Start: `npm start`
   - Healthcheck: `/health`
3. Add these **environment variables** (Railway → Variables). Copy the values from your local `.env`:
   ```
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   OPENAI_API_KEY
   ZAPI_INSTANCE_ID
   ZAPI_TOKEN
   ZAPI_CLIENT_TOKEN
   RESEND_API_KEY
   RESEND_FROM
   MASTER_ENCRYPTION_KEY
   OWNER_EMAIL
   SETUP_TOKEN
   CORS_ORIGINS=https://<your-vercel-app>.vercel.app
   ```
   - `PORT` is provided by Railway automatically — do **not** set it.
   - `CORS_ORIGINS` must include the exact Vercel URL of the frontend.
4. Deploy. Note the public URL Railway gives you, e.g. `https://fire-extinguisher-production.up.railway.app`.
5. Point the **Z-API webhook** at `https://<railway-url>/webhook`.

---

## 2. Frontend → Vercel

1. Vercel project → connected to this repo. `vercel.json` builds only `frontend/`.
2. Add **environment variables** (Vercel → Settings → Environment Variables):
   ```
   VITE_SUPABASE_URL=<same as backend SUPABASE_URL>
   VITE_SUPABASE_ANON_KEY=<same as backend SUPABASE_ANON_KEY>
   VITE_API_BASE=https://<your-railway-url>.up.railway.app
   ```
   - `VITE_API_BASE` is the Railway backend URL (no trailing slash, no `/api`).
3. Redeploy. The frontend now calls the Railway backend directly.

---

## Local development (unchanged)

- Backend: `npm run dev` (port 3000)
- Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` → 3000)
- `VITE_API_BASE=/api` locally (Vite proxy handles it).
