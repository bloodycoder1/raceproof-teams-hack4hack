# Live Deployment Guide (Free Tier)

This guide walks you through deploying **TeamUp** to a live public URL on a free-tier hosting provider in under 3 minutes.

---

## Option 1: 1-Click Render.com Deployment (Recommended)

Render provides a completely free tier for both Web Services and PostgreSQL databases, and TeamUp includes a pre-configured `render.yaml` Blueprint.

### Step 1: Push your code to GitHub
If you haven't pushed your local repository to GitHub yet:
```bash
# 1. Create a new repository on GitHub (e.g. github.com/<username>/teamup)
git remote add origin https://github.com/bloodycoder1/raceproof-teams-hack4hack.git
git push -u origin main
```

### Step 2: Deploy with Render Blueprint
1. Go to [dashboard.render.com](https://dashboard.render.com/) and log in (with GitHub).
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your `teamup` GitHub repository.
4. Render will detect the `render.yaml` file in the root directory and show:
   - **PostgreSQL Database:** `teamup-db` (Free tier)
   - **Web Service:** `teamup` (Free tier Docker runtime)
5. Click **Apply**.
6. Render will automatically:
   - Provision the free PostgreSQL instance.
   - Inject `DATABASE_URL` and `JWT_SECRET`.
   - Build the Docker container (building both React frontend and Express API).
   - Run database migrations on startup.
   - Publish your live URL: `https://teamup-xxxx.onrender.com`.

---

## Option 2: Railway.app Deployment

1. Go to [railway.app](https://railway.app/) and log in with GitHub.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your `teamup` repository.
4. Click **Add a Service** -> **Database** -> **PostgreSQL**.
5. In the `teamup` web service settings:
   - Add environment variable: `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
   - Add environment variable: `NODE_ENV = production`
   - Add environment variable: `PORT = 4000`
   - Add environment variable: `JWT_SECRET = <any-random-32-char-string>`
6. Under **Settings** -> **Networking**, click **Generate Domain**.
7. Railway will build and launch the container on your custom `.up.railway.app` live URL.

---

## Option 3: Supabase (Postgres) + Render / Vercel

If you prefer Supabase for managed PostgreSQL:
1. Create a free project at [supabase.com](https://supabase.com).
2. Copy the Connection String URI from **Project Settings** -> **Database** (e.g. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`).
3. Deploy the Docker image or web service on Render/Fly/Koyeb and paste that URI as `DATABASE_URL`.

---

## Verifying Your Live Deployment

Once deployed, visit your live URL:
1. **Frontend App:** `https://<your-live-url>/`
   - Check the **Live Sync** indicator in the navbar (green pulse confirms active SSE stream).
   - Click **Create Team** or register a user.
2. **API Health Check:** `https://<your-live-url>/health`
   - Returns: `{"status":"ok","uptime":...,"timestamp":...}`
3. **Metrics Endpoint:** `https://<your-live-url>/metrics`
   - Returns PostgreSQL connection pool statistics and row counts.
4. **Seed Live Database (Optional):**
   - You can connect locally to the remote database URI and run:
     ```bash
     DATABASE_URL="<your-remote-db-uri>" npm run seed
     ```
   - This populates your live production instance with 10,000 hackathon participants and 2,000 teams in under 1 second.
