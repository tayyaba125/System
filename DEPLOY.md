# Power System — Deployment Guide

## What you're deploying
A full-stack React app with:
- Real authentication (email + password via Supabase)
- Cloud data storage (your data syncs across all devices)
- Password reset via email
- Free hosting on Vercel

Total cost: **$0** (both Supabase and Vercel have generous free tiers)

---

## Step 1 — Create a Supabase project (5 min)

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up / log in with GitHub or email
3. Click **New project**, give it a name (e.g. `power-system`), set a database password, choose a region close to you
4. Wait ~2 min for the project to spin up

### Set up the database table
5. In your Supabase project, go to **SQL Editor** in the left sidebar
6. Click **New query**
7. Open the file `supabase-setup.sql` from this folder, copy all the SQL, paste it in, and click **Run**
8. You should see "Success. No rows returned"

### Get your API keys
9. Go to **Settings** (gear icon) → **API**
10. Copy:
    - **Project URL** (looks like `https://abcdefgh.supabase.co`)
    - **anon public** key (long string starting with `eyJ...`)

### Enable email auth
11. Go to **Authentication** → **Providers** → make sure **Email** is enabled
12. For now, turn OFF "Confirm email" (under Email settings) so users can sign in instantly without confirming. You can turn it back on later.

---

## Step 2 — Configure the app

1. In the project folder, copy `.env.example` to a new file called `.env.local`
2. Fill in your keys:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...YOUR_FULL_KEY
```

---

## Step 3 — Test locally (optional but recommended)

Make sure you have **Node.js** installed (https://nodejs.org — download the LTS version).

Open a terminal in the project folder and run:

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.
Create an account, add some tasks, refresh the page — data should persist. ✅

---

## Step 4 — Deploy to Vercel (5 min)

### Option A: Deploy via GitHub (recommended)

1. Create a free account at **https://github.com** if you don't have one
2. Create a new repository at **https://github.com/new** (name it `power-system`, set to Private)
3. In the terminal, run:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/power-system.git
git branch -M main
git push -u origin main
```

4. Go to **https://vercel.com** and sign up / log in with GitHub
5. Click **Add New → Project**
6. Import your `power-system` repository
7. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon key
8. Click **Deploy**

In ~60 seconds, your app will be live at a URL like `https://power-system-abc123.vercel.app` 🎉

### Option B: Deploy via Vercel CLI (no GitHub needed)

```bash
npm install -g vercel
vercel
```

Follow the prompts, then add environment variables in the Vercel dashboard.

---

## Step 5 — Custom domain (optional)

1. In Vercel, go to your project → **Settings → Domains**
2. Add your domain (e.g. `powersystem.app`)
3. Follow Vercel's DNS instructions

---

## How it works after deployment

- **Sign up**: creates a Supabase auth account + stores your data in the cloud
- **Sign in**: loads your data from the cloud instantly
- **Every change**: saved to cloud automatically (1.5s after last edit)
- **Refresh**: data reloads from cloud — nothing is lost
- **Different device**: sign in with same email/password → all your data is there
- **Forgot password**: click the link on the login page → email sent instantly

---

## Updating the app later

After making changes to the code:

```bash
git add .
git commit -m "Update"
git push
```

Vercel will automatically redeploy in ~30 seconds.

---

## Troubleshooting

**"Invalid API key"** → Check your `.env.local` values match exactly what's in Supabase Settings → API

**Data not saving** → Open browser console (F12) and check for errors. Make sure the SQL was run correctly in Supabase.

**Can't sign in** → In Supabase → Authentication → Email, make sure "Enable Email Signup" is ON

**White screen on Vercel** → Check the Vercel deployment logs for build errors. Usually a missing environment variable.
