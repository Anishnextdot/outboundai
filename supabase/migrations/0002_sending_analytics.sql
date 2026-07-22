-- Phase 3/4 — email sending + response tracking.
-- Apply after 0001: supabase db push (or paste into the Supabase SQL editor).

-- Sending state on each campaign.
alter table campaigns
  add column if not exists send_status text not null default 'not_sent'
    check (send_status in ('not_sent', 'sent', 'simulated', 'failed')),
  add column if not exists sent_at timestamptz,
  add column if not exists send_error text,
  add column if not exists send_message_id text;

-- Response sentiment (the `responses` table already exists from 0001).
alter table responses
  add column if not exists sentiment text
    check (sentiment in ('positive', 'neutral', 'negative'));

create index if not exists responses_campaign_idx on responses (campaign_id);
create index if not exists campaigns_send_status_idx on campaigns (send_status);
