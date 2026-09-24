-- Meera's content pipeline (memory layer), in the Supabase project "Meera Database".
-- Only the Vercel webhook touches these, using the secret key. RLS is on with no
-- policies, so the publishable key can read nothing.
-- Nothing is ever deleted: rejected notes and drafts show what needs improving.

create extension if not exists pgcrypto;

create table if not exists meera_voice_skill (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists meera_notes (
  id                   uuid primary key default gen_random_uuid(),
  telegram_chat_id     bigint not null,
  telegram_message_id  bigint not null,
  text                 text not null,
  score                int check (score between 0 and 10),
  score_reason         text,
  created_at           timestamptz not null default now()
);

create table if not exists meera_drafts (
  id                    uuid primary key default gen_random_uuid(),
  note_id               uuid not null references meera_notes(id),
  post                  text not null,
  news_headline         text,
  news_source           text,
  news_date             text,
  news_url              text,
  status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  telegram_message_ids  bigint[] not null default '{}',
  decided_at            timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists meera_drafts_msg_ids on meera_drafts using gin (telegram_message_ids);
create index if not exists meera_drafts_note_id on meera_drafts (note_id);

alter table meera_voice_skill enable row level security;
alter table meera_notes enable row level security;
alter table meera_drafts enable row level security;
