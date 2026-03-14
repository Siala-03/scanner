# Deployment Guide: Render Backend + Vercel Frontend

This guide provides step-by-step instructions to deploy your full-stack restaurant management application.

## Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│         VERCEL                 │     │         RENDER                  │
│       (Frontend)               │     │        (Backend)                │
│   Vite + React + TypeScript    │────▶│   Express + PostgreSQL           │
│   https://your-app.vercel.app  │     │   https://your-api.onrender.com │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

---

## Prerequisites

- GitHub account with your repository pushed
- [Render](https://dashboard.render.com) account (free tier available)
- [Vercel](https://vercel.com) account (free tier available)

> **Important**: Do NOT create `.env` files in your repository for production! Add environment variables through the Render/Vercel dashboard instead. This keeps your secrets secure.

---

## Step 1: Deploy Backend to Render

### 1.1 Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **PostgreSQL**
3. Configure:
   - **Name**: `scanner-db`
   - **Region**: Oregon (or closest)
   - **PostgreSQL Version**: 15
   - **Plan**: Free
4. Click **Create Database**
5. Wait for provisioning, then copy the **Internal Connection String**

### 1.2 Deploy Backend Web Service

1. In Render dashboard, click **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `scanner-backend`
   - **Region**: Oregon
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm run start:dev`
4. Add Environment Variables (scroll down to **Environment** section):
   - Click **Add Environment Variable** for each:
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `DATABASE_URL` | (paste PostgreSQL connection string from step 1.1) |
   | `WEB_ORIGIN` | `https://your-app.vercel.app` |
5. Click **Create Web Service**

### 1.3 Run Database Migrations

1. After deployment completes, go to your backend service in Render
2. Click **Shell** → **Connect Shell**
3. Run:
   ```bash
   cd backend && npm run migrate
   ```
4. Verify tables created - you should see migration success messages

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Deploy via Vercel Dashboard

1. Go to [Vercel](https://vercel.com) and sign in
2. Click **Add New...** → **Project**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite (or Other)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables (click **Add** in the Environment Variables section):
   | Key | Value |
   |-----|-------|
   | `VITE_SOCKET_URL` | `https://scanner-backend.onrender.com` |
6. Click **Deploy**

### 2.2 Update Backend CORS (Required!)

After frontend deploys:

1. Go to your Render backend service
2. Click **Environment** → **Add Environment Variable**
3. Add: `WEB_ORIGIN` = (your Render frontend URL, e.g., `https://scanner-frontend.onrender.com`)
4. Redeploy backend (click **Deploys** → **Redeploy** latest)

---

## Option B: Frontend on Render (instead of Vercel)

You can also deploy the frontend to Render as a Static Site:

### Step 1: Deploy Frontend to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Static Site**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `scanner-frontend`
   - **Region**: Oregon (same as backend)
   - **Branch**: `main`
   - **Build Command**: `npm run build`
   - **Publish directory**: `dist`
5. Add Environment Variable:
   | Key | Value |
   |-----|-------|
   | `VITE_SOCKET_URL` | `https://scanner-backend.onrender.com` |
6. Click **Create Static Site**

### Step 2: Update Backend CORS

After frontend deploys:

1. Go to your Render backend service
2. Click **Environment**
3. Update `WEB_ORIGIN` to your frontend URL:
   - `WEB_ORIGIN` = `https://scanner-frontend.onrender.com`
4. Redeploy backend

---

## Step 3: Verify Deployment

### 3.1 Test Backend API

Visit: `https://scanner-backend.onrender.com/health`

Expected response: `{ "ok": true }`

### 3.2 Test Frontend

Visit: `https://your-app.vercel.app`

- Login page should load
- Try logging in - verify API calls work

### 3.3 Test Real-time (Socket.io)

- Open two browser tabs
- Login as different users (waiter + kitchen)
- Create an order in one tab
- Should appear in real-time in the other tab

---

## Environment Variables Reference

### Backend (Render)

```env
PORT=4000
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/dbname
WEB_ORIGIN=https://your-app.vercel.app
```

> **What is WEB_ORIGIN?** This is your **frontend URL** that the backend allows to make API requests. Without this, CORS errors will block your frontend from talking to the backend.

### Frontend (Vercel)

```env
VITE_SOCKET_URL=https://scanner-backend.onrender.com
```

---

## Troubleshooting

### CORS Errors
- Ensure `WEB_ORIGIN` in Render matches your Vercel URL exactly
- Include `https://` prefix

### Database Connection Failed
- Verify `DATABASE_URL` is correct
- Check database is active in Render dashboard

### Socket Connection Failed
- Ensure `VITE_SOCKET_URL` is set in Vercel
- Check backend is deployed and accessible at `/health`

### Build Failed
- Verify Node version: use Node 18+
- Ensure all dependencies are in `package.json`

### Lost DATABASE_URL

If you lost your PostgreSQL connection string:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click on your **PostgreSQL database** (scanner-db)
3. Look for **Connections** section
4. Copy the **External Connection URL** (recommended for most cases)
5. Go to your **Web Service** (scanner-backend)
6. Click **Environment**
7. Find `DATABASE_URL` and update it with the copied value

**Internal vs External:**
- **Internal**: Only works if your backend is in the same Render region/project. Faster, more secure.
- **External**: Works from anywhere (including local development). Use this if you're connecting from outside Render or if Internal doesn't work.

The format is: `postgres://username:password@hostname:5432/databasename`

---

## Quick Reference

| Service | URL Format |
|---------|------------|
| Backend API | `https://scanner-backend.onrender.com/api/*` |
| Backend Health | `https://scanner-backend.onrender.com/health` |
| WebSocket | `wss://scanner-backend.onrender.com` |
| Frontend | `https://your-app.vercel.app` |

---

## Current Project Configuration

- **Frontend Build**: Vite (`npm run build` → `dist/`)
- **Backend Build**: TypeScript (`npm run build` in `backend/`)
- **Database**: PostgreSQL on Render
- **Real-time**: Socket.io

See also:
- [`render.yaml`](./render.yaml) - Render configuration
- [`backend/package.json`](./backend/package.json) - Backend scripts
