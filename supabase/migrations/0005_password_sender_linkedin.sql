-- Real auth (register + password sign-in), per-user sender address,
-- and LinkedIn send tracking. Apply after 0004.

alter table users
  add column if not exists password_hash text,
  -- The address this user sends outreach from (remembered between sends).
  add column if not exists from_email text,
  add column if not exists from_name text;

-- LinkedIn is a separate channel from email, tracked separately.
alter table campaigns
  add column if not exists linkedin_sent_at timestamptz;

create index if not exists campaigns_linkedin_sent_idx on campaigns (linkedin_sent_at);
