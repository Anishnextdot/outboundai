-- Auth + per-user data isolation. Apply after 0003.

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
alter table users enable row level security;

-- Every campaign belongs to the user who created it. All reads are scoped by it.
alter table campaigns
  add column if not exists user_id uuid references users(id) on delete cascade;

create index if not exists campaigns_user_idx on campaigns (user_id);
create index if not exists campaigns_user_created_idx on campaigns (user_id, created_at desc);
