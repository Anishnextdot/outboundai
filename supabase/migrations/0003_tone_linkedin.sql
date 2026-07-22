-- Tone system + LinkedIn channel. Apply after 0002.

-- Drafts are now per-channel (email / linkedin) and remember the tone used.
alter table emails
  add column if not exists channel text not null default 'email'
    check (channel in ('email', 'linkedin')),
  add column if not exists tone text;

-- One draft + one edited version PER CHANNEL per campaign.
drop index if exists emails_campaign_kind_key;
create unique index if not exists emails_campaign_kind_channel_key
  on emails (campaign_id, kind, channel);
