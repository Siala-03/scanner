# Setup & Deployment

## Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- A Render or Railway account for the backend
- A Vercel account for the frontend

---

## 1. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Note these values from **Project Settings → API**:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`
   - `JWT Secret` → `SUPABASE_JWT_SECRET` (Settings → API → JWT Settings)
3. Note `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`
4. The backend runs migrations automatically on startup — no manual SQL needed

---

## 2. Backend Deployment (Render / Railway)

### Environment Variables

Set these in your Render/Railway service:

```env
# Database
DATABASE_URL=postgres://user:password@host:5432/dbname

# Server
PORT=4000
NODE_ENV=production

# Supabase (for Edge Function calls)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=500

# DB startup retries
DB_STARTUP_RETRIES=5
DB_STARTUP_RETRY_DELAY=3000
```

### Deploy

```bash
# Build
cd backend
npm install
npm run build

# Start
npm start
```

Render auto-detects the `start` script. Use the `backend/` subdirectory as root.

---

## 3. Supabase Edge Functions

Deploy the `staff-login` Edge Function:

```bash
supabase functions deploy staff-login
```

Set Edge Function secrets:

```bash
supabase secrets set SUPABASE_JWT_SECRET=your_jwt_secret
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
```

---

## 4. Frontend Deployment (Vercel)

### Environment Variables (Vercel Dashboard)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://your-backend.onrender.com
VITE_SOCKET_URL=https://your-backend.onrender.com
```

### Deploy

```bash
# From repo root
npm install
npm run build
```

Vercel auto-deploys on push to `main`. Set the root directory to `/` (not `backend/`).

---

## 5. First-Time Setup After Deployment

1. **Backend starts** → runs all pending migrations automatically → creates superadmin accounts
2. **Log in as superadmin** at `https://your-app.vercel.app/manager`
   - Username: `servv_admin_1` / Password: `ServvAdmin1!`
3. **Create a restaurant** (outlet) from the SuperAdmin dashboard
4. **Create a manager account** for that restaurant
5. **Log in as manager** → set restaurant name, address, phone, logo in Settings
6. **Add menu items**
7. **Generate QR codes** for tables
8. Test a full order cycle: place order → kitchen → serve → confirm payment → print receipt

---

## 6. Adding a Minimart Outlet

1. Log in as superadmin
2. Create a new outlet, set **Outlet Type = Minimart**
3. Create a manager account for that minimart
4. Log in as minimart manager at `/minimart`
5. Add products and cashier accounts
6. Cashier logs in at `/minimart` with the cashier role

---

## 7. Ongoing Maintenance

| Task | How |
|------|-----|
| Add new restaurant | SuperAdmin Dashboard → New Outlet |
| Reset staff password | SuperAdmin → Staff → Change Password |
| Apply new migrations | Automatic on next backend deploy |
| View logs | Render/Railway dashboard → Logs |
| Database backups | Supabase Dashboard → Database → Backups |
