create table if not exists staff (
  id text primary key,
  name text not null,
  role text not null check (role in ('waiter','supervisor','manager','kitchen')),
  email text not null unique,
  phone text not null,
  is_on_duty boolean not null default true,
  assigned_tables integer[] not null default '{}',
  performance jsonb not null,
  hire_date timestamptz not null default now()
);

create table if not exists staff_credentials (
  staff_id text not null references staff(id) on delete cascade,
  username text primary key,
  password_hash text not null
);

