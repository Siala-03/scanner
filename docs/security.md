# Multi-Tenancy & Security

---

## Authentication

### Staff Login Flow

1. Staff POSTs `{ username, password }` to the `staff-login` Supabase Edge Function
2. Edge Function queries `staff_credentials` table (bcrypt-hashed passwords)
3. On success, signs a JWT using `SUPABASE_JWT_SECRET` (HS256)
4. JWT payload:
   ```json
   {
     "iss": "supabase",
     "aud": "authenticated",
     "role": "authenticated",
     "sub": "<staff_id>",
     "restaurant_id": "<tenant_id>",
     "staff_role": "manager | supervisor | waiter | kitchen | ...",
     "iat": 1700000000,
     "exp": 1700028800
   }
   ```
5. Frontend stores JWT in `localStorage` and calls `supabase.auth.setSession()` to activate it for all subsequent Supabase queries

### Token Lifetime

Tokens expire after **8 hours** (`iat + 28800`). Staff are re-prompted to log in after expiry. There is no refresh token flow — a new login issues a new token.

### Customer Portal

The customer QR menu does not require login. It operates under the Supabase `anon` role with read-only RLS policies on `menu_items` and `restaurants`.

---

## Row Level Security (RLS)

Every data table has a `restaurant_id` column. Supabase RLS enforces tenant isolation at the database layer — a query authenticated as tenant A cannot read or write tenant B's data, even with a direct SQL injection attempt.

### Helper Functions

```sql
-- Returns the restaurant_id from the active JWT
CREATE FUNCTION current_tenant_id() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT nullif(auth.jwt() ->> 'restaurant_id', '')
  $$;

-- Returns true for superadmin staff
CREATE FUNCTION current_is_superadmin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT (auth.jwt() ->> 'staff_role') = 'superadmin'
  $$;
```

### Standard Tenant Policy

Applied to all data tables:

```sql
CREATE POLICY "tenant_isolation" ON <table>
  AS PERMISSIVE FOR ALL TO authenticated
  USING (restaurant_id = current_tenant_id() OR current_is_superadmin())
  WITH CHECK (restaurant_id = current_tenant_id() OR current_is_superadmin());
```

### Restaurants Table

- Any authenticated user can read their own restaurant row
- Superadmin can read and write all restaurants
- Anonymous users get public read access (used by the QR customer portal)

### Special Cases

- `menu_items`: additionally allows anonymous `SELECT` (customer menu browsing)
- `credit_transactions`: policy uses a subquery to `credit_accounts` since transactions don't carry `restaurant_id` directly
- `credit_alerts`: same subquery pattern

---

## Backend API Security

The Express backend (`/api/*`) validates the JWT on protected routes:

```
Authorization: Bearer <jwt>
```

Middleware decodes and verifies the token using `SUPABASE_JWT_SECRET`. Routes extract `restaurant_id` and `staff_role` from the decoded payload.

### Rate Limiting

```
RATE_LIMIT_WINDOW_MS=900000   (15 minutes)
RATE_LIMIT_MAX_REQUESTS=500
```

Applied globally via `express-rate-limit`.

---

## Superadmin

Superadmin accounts have `staff_role = 'superadmin'` in the JWT. They:
- Bypass `current_tenant_id()` checks in all RLS policies
- Can create, edit, and suspend any outlet
- Are not tied to any `restaurant_id`

Superadmin credentials are seeded in migration 001. **Change the default password immediately after first deployment.**

---

## Secrets Management

| Secret | Where stored |
|--------|-------------|
| `SUPABASE_JWT_SECRET` | Render/Railway env var + Supabase Edge Function secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Render/Railway env var + Supabase Edge Function secret |
| `DATABASE_URL` | Render/Railway env var only |
| `VITE_SUPABASE_ANON_KEY` | Vercel env var (public — safe to expose) |

The `anon` key is intentionally public. RLS policies are the security boundary, not key secrecy.

---

## Data Isolation Summary

| Layer | Mechanism |
|-------|-----------|
| Database | Supabase RLS (`restaurant_id` + JWT claims) |
| API | JWT middleware + `restaurant_id` extracted from token |
| Frontend | Routes and components scoped to `currentRestaurantId` from auth state |
| Auth | Edge Function signs tenant-scoped JWTs; no cross-tenant token is possible |
