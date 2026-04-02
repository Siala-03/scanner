# Fixing Menu Not Appearing on Vercel Production

## Problem
Menu doesn't load on the deployed Vercel frontend even though it works locally.

## Root Cause
The `VITE_API_URL` environment variable isn't being passed to Vercel during the build process, so the frontend doesn't know where to find the backend API.

---

## ✅ Solution: Add Environment Variable to Vercel

### Step 1: Access Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Sign in to your account
3. Select your **scanner** project

### Step 2: Add Environment Variable

1. Click **Settings** (top menu)
2. Go to **Environment Variables** (left sidebar)
3. Click **Add New** button

### Step 3: Configure the Variable

Fill in these details:

```
Name:  VITE_API_URL
Value: https://scanner-3cku.onrender.com
```

**Select these environments:**
- ✅ **Production** (REQUIRED - most important)
- ✅ **Preview** (recommended)
- ☐ Development (optional, only if needed)

### Step 4: Save and Redeploy

1. Click **Save**
2. Go to **Deployments** tab
3. Click the three-dot menu (⋮) on your latest deployment
4. Select **Redeploy**
5. Wait for rebuild to complete

---

## 🔍 Verification

### Step 1: Check Browser Console

After redeployment, go to your Vercel URL and:
1. Open **Developer Console** (F12 or Cmd+Option+I)
2. Go to **Console** tab
3. Look for these logs:

**If working:**
```
Fetching menu from: https://scanner-3cku.onrender.com/api/menu
Menu fetched successfully, items: 15
```

**If not working:**
```
Failed to fetch menu from backend
MENU_API_BASE was: /api/menu
VITE_API_URL env: (undefined)
```

### Step 2: Check Network Tab

1. Go to **Network** tab in DevTools
2. Refresh page
3. Look for requests to `scanner-3cku.onrender.com`
4. Check status codes (should be 200 for successful requests)

---

## 🐛 Troubleshooting

### Error: "Failed to fetch menu"

**Possible causes:**

| Issue | Solution |
|-------|----------|
| VITE_API_URL not set | Add it in Vercel Settings |
| Backend URL is wrong | Verify `https://scanner-3cku.onrender.com` is correct |
| Backend is down | Check backend at `https://scanner-3cku.onrender.com/health` |
| CORS error | Backend may need CORS update |
| Network timeout | Backend may be loading slowly |

### How to debug in console:

```javascript
// Check what API URL the app is using
console.log('API URL:', import.meta.env.VITE_API_URL);

// Try making a test API call
fetch('https://scanner-3cku.onrender.com/api/menu')
  .then(r => r.json())
  .then(data => console.log('Menu items:', data.length))
  .catch(e => console.error('Error:', e))
```

---

## 📝 Environment Files Reference

### `.env.production` (for local production builds)
```
VITE_API_URL=https://scanner-3cku.onrender.com
VITE_SOCKET_URL=https://scanner-3cku.onrender.com
```

### Vercel Dashboard Settings
```
Environment Variable: VITE_API_URL
Value: https://scanner-3cku.onrender.com
Environments: Production, Preview
```

---

## 🔗 Related Configuration

**Frontend Files:**
- `src/api/menu.ts` - Menu fetching logic
- `src/contexts/MenuContext.tsx` - Menu state management  
- `src/api/http.ts` - Base HTTP request handler
- `.env.production` - Production environment variables

**Backend Files:**
- `backend/src/routes/menu.ts` - Menu API endpoint
- Server running on Render at `https://scanner-3cku.onrender.com`

---

## What Gets Fixed

After setting the environment variable:

✅ Frontend knows where to find the backend API
✅ Menu loads from database (or defaults if empty)
✅ All API calls work properly
✅ WebSocket connections work
✅ Customer menu appears on Vercel

---

## ⏱️ Expected Timeline

- **Setting variable**: < 1 minute
- **Redeployment**: 2-5 minutes
- **Menu to appear**: After refresh (no cache)

---

## Need More Help?

1. **Check if backend is running**: Go to `https://scanner-3cku.onrender.com/health`
   - Should show `{"ok": true}`

2. **Check if menu exists**: Go to `https://scanner-3cku.onrender.com/api/menu`
   - Should see JSON array of menu items

3. **Check browser console** for detailed error messages (F12 → Console tab)

4. **Clear browser cache** (Ctrl+Shift+Delete) and refresh

---

**After these changes, your production menu should appear! 🎉**
