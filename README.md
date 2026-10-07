# Intervention-Planner
Capstone project Fall 2026

Frontend: React (Vite)<br />
Backend:  Python - FastAPI<br />
Database: Supabase (Postgres) <br />
Hosting: Frontend on Cloudflare, backend on Render <br />

## ENVIRONMENT SETUP (do in powershell terminal)

### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1   # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## DEPLOYMENT SETUP

### Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Create the required tables (`users`, `students`, etc.) under **Table Editor**, or run your migrations/SQL under **SQL Editor**.
3. Under **Project Settings > API**, grab:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not the anon key — the backend uses it for privileged server-side access) → `SUPABASE_SERVICE_KEY`
4. Add both to `backend/.env`:
   ```
   SUPABASE_URL=your-project-url
   SUPABASE_SERVICE_KEY=your-service-role-key
   CORS_ORIGINS=http://localhost:5173
   ```
   The service key is a secret — never commit `.env` or expose this key to the frontend.

### Backend Hosting (Render)

The FastAPI backend is hosted on [Render](https://render.com) as a Web Service.

1. Create a new **Web Service** on Render and connect the GitHub repo.
2. Set the root directory to `backend`.
3. Build command:
   ```
   pip install -r requirements.txt
   ```
4. Start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Add environment variables in the Render dashboard (mirroring `backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CORS_ORIGINS` (set this to the deployed Cloudflare frontend URL, not localhost).
6. Render auto-deploys on push to the branch you connect the service to — confirm which branch that is in the service's **Settings** before assuming a push will deploy.

### Frontend Hosting (Cloudflare)

The frontend is deployed via **Cloudflare Workers Builds** (git-integrated CI for a Worker, not Cloudflare Pages), configured in the Cloudflare dashboard rather than in a committed CI file:

- Root directory: `/frontend/`
- Build command: `npm run build`
- Production environment: tracks the `main` branch, deploy command `npx wrangler deploy`
- Preview environment: tracks the current working branch (e.g. `LucasBranch`), deploy command `npx wrangler versions upload`

**Pushing to `main` triggers a production deploy.** Only merge into `main` when you intend to ship to production.

Set `VITE_API_URL` (in `frontend/.env` locally, and as a Cloudflare environment variable for deploys) to the Render backend's URL.

> This pipeline is manual/dashboard-configured and a bit fragile — `frontend/wrangler.jsonc` exists locally but isn't guaranteed to be committed on every branch. If deploys start failing unexpectedly, check the Cloudflare dashboard's build/deploy command fields before changing app code.


