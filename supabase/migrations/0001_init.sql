-- Arka Outbound Agent — Phase 1 schema (real verified prospect data layer).
-- Apply with: supabase db push   (or paste into the Supabase SQL editor).

create extension if not exists "pgcrypto";

-- Companies discovered by Agent 1.
create table if not exists companies (
  id               uuid primary key default gen_random_uuid(),
  external_id      text,                       -- Apollo organization id
  name             text not null,
  website          text,
  industry         text,
  employee_count   integer,
  revenue_estimate text,
  location         text,
  description      text,
  source           text not null default 'apollo' check (source in ('apollo','mock')),
  created_at       timestamptz not null default now()
);
-- Dedup real companies by Apollo id (mock rows have null external_id).
create unique index if not exists companies_external_id_key
  on companies (external_id) where external_id is not null;

-- Decision-makers found by Agent 2.
create table if not exists contacts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  name           text not null,
  role           text,
  linkedin_url   text,
  email          text,
  email_verified boolean not null default false,
  confidence     integer not null default 0,
  reasoning      text,
  source         text not null default 'apollo' check (source in ('apollo','mock')),
  created_at     timestamptz not null default now()
);
create index if not exists contacts_company_idx on contacts (company_id);

-- Research dossiers from Agent 3.
create table if not exists research (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id) on delete cascade,
  summary            text,
  services           jsonb not null default '[]',
  products           jsonb not null default '[]',
  recent_activity    jsonb not null default '[]',
  market_positioning text,
  competitors        jsonb not null default '[]',
  hiring_signals     jsonb not null default '[]',
  opportunities      jsonb not null default '[]',
  grounded           boolean not null default false,
  source             text not null default 'claude',
  created_at         timestamptz not null default now()
);

-- The reviewable unit. Nullable FKs: a blocked campaign may lack exactly the
-- data that blocked it.
create table if not exists campaigns (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references companies(id) on delete set null,
  contact_id      uuid references contacts(id)  on delete set null,
  research_id     uuid references research(id)  on delete set null,
  icp             jsonb not null,
  status          text not null default 'pending_review'
                    check (status in ('pending_review','approved','rejected','blocked')),
  blocked_reason  text,
  trust_score     integer not null default 0 check (trust_score between 0 and 100),
  trust_breakdown jsonb not null default '{}',
  angles          jsonb not null default '[]',
  log             jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists campaigns_created_at_idx on campaigns (created_at desc);

-- Email drafts from Agent 5. One draft + one edited version per campaign.
create table if not exists emails (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  kind        text not null default 'draft' check (kind in ('draft','edited')),
  subject     text,
  body        text,
  source      text not null default 'claude',
  created_at  timestamptz not null default now()
);
create unique index if not exists emails_campaign_kind_key on emails (campaign_id, kind);

-- Reply tracking (Phase 4 — table created now, logic intentionally untouched).
create table if not exists responses (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  channel     text,
  type        text,
  content     text,
  received_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Security: lock every table. The server uses the service-role key (which
-- bypasses RLS); there is no anon/public access. Add scoped policies later
-- if a browser client ever reads directly.
alter table companies  enable row level security;
alter table contacts   enable row level security;
alter table research   enable row level security;
alter table campaigns  enable row level security;
alter table emails     enable row level security;
alter table responses  enable row level security;
