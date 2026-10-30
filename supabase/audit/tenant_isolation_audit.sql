-- Tenant isolation audit (Phase 0) — READ-ONLY.
-- Run each block in the Supabase SQL Editor and share the results.
-- Nothing here changes data, and no passwords or hashes are shown.

-- 1. RLS on/off for every public table (rls_enabled = false means fully open)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- 2. Every policy actually in place (roles, command, conditions)
select tablename, policyname, roles, cmd, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Which tables carry restaurant_id, and its type (text vs uuid matters for policies)
select t.table_name,
       c.data_type as restaurant_id_type
from information_schema.tables t
left join information_schema.columns c
  on c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'restaurant_id'
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by (c.data_type is null) desc, t.table_name;

-- 4. Password storage: how many staff/supplier passwords are still plain text
select 'staff_credentials' as source,
       count(*) filter (where password_hash ~ '^\$2[aby]\$') as bcrypt,
       count(*) filter (where password_hash !~ '^\$2[aby]\$') as plain_text
from staff_credentials
union all
select 'supplier_users',
       count(*) filter (where password_hash ~ '^\$2[aby]\$'),
       count(*) filter (where password_hash !~ '^\$2[aby]\$')
from supplier_users;

-- 5. Restaurants still exposing PIN hashes in public settings
select count(*) as restaurants_with_public_pins,
       coalesce(sum((select count(*) from jsonb_object_keys(settings -> 'staff_pins'))), 0) as pin_count
from restaurants
where settings ? 'staff_pins';

-- 6. Staff not tied to a valid tenant (these show up in unfiltered lists)
select count(*) filter (where s.restaurant_id is null) as staff_without_restaurant,
       count(*) filter (where s.restaurant_id is not null and r.id is null) as staff_with_unknown_restaurant
from staff s
left join restaurants r on r.id::text = s.restaurant_id::text;

-- 7. Usernames reused across tenants (login needs a restaurant link for these)
select username, count(distinct restaurant_id) as tenants
from staff_credentials
group by username
having count(distinct restaurant_id) > 1
order by tenants desc;

-- 8. Not SQL — check in the dashboard: Project Settings → JWT Keys.
--    Is the "Legacy JWT secret" still active? Phase 2 relies on the tokens that
--    staff-login signs with SUPABASE_JWT_SECRET being accepted by the API.
