# Architecture

## Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 18 + Vite + TypeScript + Tailwind | Vercel |
| Backend API | Node.js + Express + TypeScript | Render / Railway |
| Database | PostgreSQL via Supabase | Supabase |
| Realtime | Supabase Realtime (WebSocket) | Supabase |
| Auth (staff) | Custom Edge Function + JWT | Supabase Edge Functions |
| File storage | Supabase Storage (logos, receipts) | Supabase |

## High-Level Diagram

```
Browser (Vercel)
      │
      ├──→ Supabase JS client (realtime, direct DB queries with RLS)
      │
      └──→ SERVV Backend API (Render/Railway)
                │
                ├──→ PostgreSQL (Supabase)
                ├──→ Supabase Edge Functions (staff-login, admin-staff)
                └──→ VSDC / OSDC (EBM fiscal — via baseUrl config)
```

## Multi-Tenancy

Every tenant (restaurant or minimart) has a unique `restaurant_id`. All data tables have a `restaurant_id` column. Row Level Security (RLS) on Supabase enforces that authenticated users only see their own tenant's data.

The auth JWT (signed by the `staff-login` Edge Function with `SUPABASE_JWT_SECRET`) embeds:
- `restaurant_id` — the tenant
- `staff_role` — the role within that tenant
- `sub` — the staff member's ID

Superadmin accounts (`staff_role = 'superadmin'`) bypass tenant isolation and can see all restaurants.

## URL Routing

| Path | Portal |
|------|--------|
| `/` | Customer QR menu |
| `/manager` | Restaurant manager / supervisor |
| `/minimart` | Minimart manager / cashier |
| `/kitchen` | Kitchen display |
| `/supplier` | Supplier portal |

## Database Migrations

Migrations live in `backend/migrations/` and run automatically on backend startup in numeric order. Migration state is tracked in the `schema_migrations` table.
